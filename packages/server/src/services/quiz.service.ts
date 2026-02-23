import {
  QuizStatus,
  QuestionType,
  MaterialStatus,
  SSE_SERVER_TIMEOUT_MS,
  type QuizDifficulty,
  type AnswerFormat,
  type QuizAttemptResponse,
  type QuizResultsResponse,
} from '@skills-trainer/shared';

import pino from 'pino';
import { Prisma } from '@prisma/client';

import { prisma } from '../config/database.js';
import { assertOwnership } from '../utils/ownership.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { generateQuiz as llmGenerateQuiz, gradeAnswers as llmGradeAnswers } from './llm.service.js';
import type { FreeTextAnswer } from './llm.service.js';
import type { SseWriter } from '../utils/sse.utils.js';

const logger = pino({ name: 'quiz.service' });

// ---------------------------------------------------------------------------
// Generation types
// ---------------------------------------------------------------------------

interface PreparedGeneration {
  sessionSubject: string;
  sessionGoal: string;
  materialsText: string;
  materialsUsed: boolean;
}

interface GenerationParams {
  sessionId: string;
  userId: string;
  difficulty: QuizDifficulty;
  answerFormat: AnswerFormat;
  questionCount: number;
}

// ---------------------------------------------------------------------------
// Grading types
// ---------------------------------------------------------------------------

interface GradingQuestion {
  id: string;
  questionNumber: number;
  questionType: string;
  questionText: string;
  correctAnswer: string;
}

interface GradingAnswer {
  id: string;
  questionId: string;
  userAnswer: string | null;
}

export interface GradingContext {
  quizAttemptId: string;
  sessionSubject: string;
  questions: GradingQuestion[];
  answers: GradingAnswer[];
}

// ---------------------------------------------------------------------------
// Generation — Phase 1 (pre-stream)
// ---------------------------------------------------------------------------

/**
 * Pre-stream checks for quiz generation.
 * Throws AppError subclasses on failure so asyncHandler returns a JSON error
 * before any SSE headers are written.
 */
export const prepareGeneration = async (
  sessionId: string,
  userId: string,
): Promise<PreparedGeneration> => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      materials: {
        where: { status: MaterialStatus.READY },
        select: { extractedText: true },
      },
    },
  });

  if (!session) throw new NotFoundError('Session not found');
  assertOwnership(session.userId, userId);

  const activeGeneration = await prisma.quizAttempt.findFirst({
    where: { sessionId, status: QuizStatus.GENERATING },
  });

  if (activeGeneration) {
    throw new ConflictError('Quiz already generating for this session');
  }

  const materialsUsed = session.materials.length > 0;
  const materialsText = session.materials.map((m) => m.extractedText).join('\n\n');

  return {
    sessionSubject: session.subject,
    sessionGoal: session.goal,
    materialsText,
    materialsUsed,
  };
};

// ---------------------------------------------------------------------------
// Generation — Phase 2 (SSE streaming)
// ---------------------------------------------------------------------------

/**
 * SSE streaming generation.
 * Never throws — all errors are sent as SSE error events via writer.
 * The caller must open SSE headers before invoking this function.
 */
export const executeGeneration = async (
  params: GenerationParams & PreparedGeneration,
  writer: SseWriter,
): Promise<void> => {
  const {
    sessionId,
    userId,
    difficulty,
    answerFormat,
    questionCount,
    sessionSubject,
    sessionGoal,
    materialsText,
    materialsUsed,
  } = params;

  let quizAttemptId: string | null = null;
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    writer({ type: 'error', message: 'Generation timed out. Please try again.' });
    logger.warn({ sessionId }, 'Quiz generation timed out');
  }, SSE_SERVER_TIMEOUT_MS);

  try {
    const quizAttempt = await prisma.quizAttempt.create({
      data: {
        sessionId,
        userId,
        difficulty,
        answerFormat,
        questionCount,
        materialsUsed,
        status: QuizStatus.GENERATING,
      },
    });
    quizAttemptId = quizAttempt.id;

    writer({ type: 'progress', message: 'Analyzing materials...' });

    // LLM service accumulates all questions before calling the callback, so we
    // use the return value and pass a no-op callback.
    const questions = await llmGenerateQuiz(
      {
        subject: sessionSubject,
        goal: sessionGoal,
        difficulty,
        answerFormat,
        questionCount,
        materialsText: materialsText || null,
      },
      () => {},
    );

    let questionsGenerated = 0;

    for (const question of questions) {
      const dbQuestion = await prisma.question.create({
        data: {
          quizAttemptId: quizAttempt.id,
          questionNumber: question.questionNumber,
          questionType: question.questionType,
          questionText: question.questionText,
          options: question.options ?? Prisma.DbNull,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          difficulty: question.difficulty,
          tags: question.tags,
        },
      });

      await prisma.answer.create({
        data: {
          questionId: dbQuestion.id,
          quizAttemptId: quizAttempt.id,
        },
      });

      questionsGenerated++;

      if (!timedOut) {
        writer({
          type: 'question',
          data: {
            id: dbQuestion.id,
            questionNumber: question.questionNumber,
            questionType: question.questionType,
            questionText: question.questionText,
            options: question.options,
          },
        });
        writer({
          type: 'progress',
          message: `Generating question ${questionsGenerated}/${questionCount}...`,
        });
      }
    }

    // Update quiz_attempt to in_progress. Always do this even if timed out —
    // questions are saved and the user can still take the quiz.
    await prisma.quizAttempt.update({
      where: { id: quizAttempt.id },
      data: {
        status: QuizStatus.IN_PROGRESS,
        questionCount: questionsGenerated,
        startedAt: new Date(),
      },
    });

    if (!timedOut) {
      writer({ type: 'complete', data: { quizAttemptId: quizAttempt.id } });
    }
  } catch (err) {
    logger.error({ err, sessionId }, 'Quiz generation failed');

    if (!timedOut) {
      writer({ type: 'error', message: 'Generation failed. Please try again.' });
    }

    // QuizStatus has no FAILED value — the attempt remains in GENERATING status.
    // The user can start a new generation once this one is identified as stale.
    if (quizAttemptId) {
      logger.info({ quizAttemptId }, 'Quiz attempt left in generating status after failure');
    }
  } finally {
    clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// Quiz taking
// ---------------------------------------------------------------------------

/**
 * Returns a quiz attempt with its questions and answers, stripping all fields
 * that must not be revealed while the quiz is in progress (correctAnswer,
 * explanation, difficulty, tags; isCorrect, score, feedback, gradedAt).
 */
export const getQuiz = async (
  quizAttemptId: string,
  userId: string,
): Promise<QuizAttemptResponse> => {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: quizAttemptId },
    include: {
      questions: { orderBy: { questionNumber: 'asc' } },
      answers: true,
    },
  });

  if (!attempt) throw new NotFoundError('Quiz attempt not found');
  assertOwnership(attempt.userId, userId);

  return {
    id: attempt.id,
    sessionId: attempt.sessionId,
    difficulty: attempt.difficulty as QuizDifficulty,
    answerFormat: attempt.answerFormat as AnswerFormat,
    questionCount: attempt.questionCount,
    status: attempt.status as QuizStatus,
    materialsUsed: attempt.materialsUsed,
    createdAt: attempt.createdAt.toISOString(),
    questions: attempt.questions.map((q) => ({
      id: q.id,
      questionNumber: q.questionNumber,
      questionType: q.questionType as QuestionType,
      questionText: q.questionText,
      options: q.options as string[] | null,
    })),
    answers: attempt.answers.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      userAnswer: a.userAnswer,
      answeredAt: a.answeredAt?.toISOString() ?? null,
    })),
  };
};

/**
 * Saves student answers for a quiz in progress.
 * Only updates answers whose questionId belongs to this attempt.
 * Returns the count of records actually updated.
 */
export const saveAnswers = async (
  quizAttemptId: string,
  userId: string,
  answers: Array<{ questionId: string; answer: string }>,
): Promise<{ saved: number }> => {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: quizAttemptId },
    include: { answers: { select: { questionId: true } } },
  });

  if (!attempt) throw new NotFoundError('Quiz attempt not found');
  assertOwnership(attempt.userId, userId);

  if (attempt.status !== QuizStatus.IN_PROGRESS) {
    throw new ConflictError('Quiz is not in progress');
  }

  const validQuestionIds = new Set(attempt.answers.map((a) => a.questionId));
  const validAnswers = answers.filter((a) => validQuestionIds.has(a.questionId));

  const now = new Date();
  await prisma.$transaction(
    validAnswers.map((a) =>
      prisma.answer.update({
        where: { questionId: a.questionId },
        data: { userAnswer: a.answer, answeredAt: now },
      }),
    ),
  );

  return { saved: validAnswers.length };
};

// ---------------------------------------------------------------------------
// Grading — Phase 1 helpers (pre-stream, throw AppErrors for JSON responses)
// ---------------------------------------------------------------------------

/**
 * Fetches the quiz attempt and applies final answers from the submit payload.
 * Pre-stream: throws AppErrors on auth/status/validation failure.
 * Returns a GradingContext ready for executeGrading.
 */
export const prepareGrading = async (
  quizAttemptId: string,
  userId: string,
  answers: Array<{ questionId: string; answer: string }>,
): Promise<GradingContext> => {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: quizAttemptId },
    include: {
      questions: { orderBy: { questionNumber: 'asc' } },
      answers: true,
      session: { select: { subject: true } },
    },
  });

  if (!attempt) throw new NotFoundError('Quiz attempt not found');
  assertOwnership(attempt.userId, userId);

  if (attempt.status === QuizStatus.COMPLETED || attempt.status === QuizStatus.GRADING) {
    throw new ConflictError('Quiz already submitted');
  }
  if (attempt.status !== QuizStatus.IN_PROGRESS) {
    throw new BadRequestError('Quiz is not in progress');
  }

  // Apply any final answers sent with the submit payload
  if (answers.length > 0) {
    const validQuestionIds = new Set(attempt.answers.map((a) => a.questionId));
    const validAnswers = answers.filter((a) => validQuestionIds.has(a.questionId));
    const now = new Date();
    await prisma.$transaction(
      validAnswers.map((a) =>
        prisma.answer.update({
          where: { questionId: a.questionId },
          data: { userAnswer: a.answer, answeredAt: now },
        }),
      ),
    );
  }

  // Re-fetch answers to pick up any just-saved values
  const freshAnswers = await prisma.answer.findMany({ where: { quizAttemptId } });

  const unanswered = freshAnswers.filter((a) => !a.userAnswer);
  if (unanswered.length > 0) {
    throw new BadRequestError('All questions must be answered before submitting');
  }

  return {
    quizAttemptId,
    sessionSubject: attempt.session.subject,
    questions: attempt.questions.map((q) => ({
      id: q.id,
      questionNumber: q.questionNumber,
      questionType: q.questionType,
      questionText: q.questionText,
      correctAnswer: q.correctAnswer,
    })),
    answers: freshAnswers.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      userAnswer: a.userAnswer,
    })),
  };
};

/**
 * Validates that the quiz is in submitted_ungraded status and returns a
 * GradingContext for executeGrading.
 * Pre-stream: throws AppErrors on auth/status failure.
 */
export const prepareRegrade = async (
  quizAttemptId: string,
  userId: string,
): Promise<GradingContext> => {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: quizAttemptId },
    include: {
      questions: { orderBy: { questionNumber: 'asc' } },
      answers: true,
      session: { select: { subject: true } },
    },
  });

  if (!attempt) throw new NotFoundError('Quiz attempt not found');
  assertOwnership(attempt.userId, userId);

  if (attempt.status !== QuizStatus.SUBMITTED_UNGRADED) {
    throw new ConflictError('Quiz is not in submitted_ungraded status');
  }

  return {
    quizAttemptId,
    sessionSubject: attempt.session.subject,
    questions: attempt.questions.map((q) => ({
      id: q.id,
      questionNumber: q.questionNumber,
      questionType: q.questionType,
      questionText: q.questionText,
      correctAnswer: q.correctAnswer,
    })),
    answers: attempt.answers.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      userAnswer: a.userAnswer,
    })),
  };
};

// ---------------------------------------------------------------------------
// Grading — Phase 2 (SSE streaming, shared by submit and regrade)
// ---------------------------------------------------------------------------

/**
 * Grades all questions, streams graded events, and marks the quiz completed.
 * MCQ graded instantly (string comparison). Free-text batched into one LLM call.
 * Never throws — all errors are sent as SSE error events via writer.
 * Caller must open SSE headers before invoking this function.
 */
export const executeGrading = async (
  context: GradingContext,
  writer: SseWriter,
): Promise<void> => {
  const { quizAttemptId, sessionSubject, questions, answers } = context;
  const now = new Date();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    writer({ type: 'error', message: 'Grading timed out. You can retry grading.' });
    logger.warn({ quizAttemptId }, 'Grading timed out');
    prisma.quizAttempt
      .update({ where: { id: quizAttemptId }, data: { status: QuizStatus.SUBMITTED_UNGRADED } })
      .catch((err: unknown) =>
        logger.error({ err, quizAttemptId }, 'Failed to set submitted_ungraded after timeout'),
      );
  }, SSE_SERVER_TIMEOUT_MS);

  try {
    await prisma.quizAttempt.update({
      where: { id: quizAttemptId },
      data: { status: QuizStatus.GRADING },
    });

    // ── MCQ grading (instant, no LLM) ─────────────────────────────────────
    writer({ type: 'progress', message: 'Grading multiple choice questions...' });

    const mcqQuestions = questions.filter((q) => q.questionType === QuestionType.MCQ);
    for (const question of mcqQuestions) {
      const answer = answers.find((a) => a.questionId === question.id);
      const userAnswer = answer?.userAnswer ?? '';
      const isCorrect =
        userAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
      const score = isCorrect ? 1 : 0;

      await prisma.answer.update({
        where: { questionId: question.id },
        data: { score, isCorrect, gradedAt: now },
      });

      if (!timedOut) {
        writer({ type: 'graded', data: { questionId: question.id, score, isCorrect } });
      }
    }

    // ── Free-text grading (single batched LLM call) ────────────────────────
    const freeTextQuestions = questions.filter((q) => q.questionType === QuestionType.FREE_TEXT);

    if (freeTextQuestions.length > 0 && !timedOut) {
      writer({ type: 'progress', message: 'Grading written answers...' });

      const freeTextPayload: FreeTextAnswer[] = freeTextQuestions.map((q) => ({
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        correctAnswer: q.correctAnswer,
        userAnswer: answers.find((a) => a.questionId === q.id)?.userAnswer ?? '',
      }));

      const gradedResults = await llmGradeAnswers(
        { subject: sessionSubject, answers: freeTextPayload },
        () => {},
      );

      for (const result of gradedResults) {
        const question = freeTextQuestions.find((q) => q.questionNumber === result.questionNumber);
        if (!question) {
          logger.warn(
            { questionNumber: result.questionNumber, quizAttemptId },
            'LLM returned result for unknown question number — skipping',
          );
          continue;
        }

        await prisma.answer.update({
          where: { questionId: question.id },
          data: {
            score: result.score,
            isCorrect: result.isCorrect,
            feedback: result.feedback,
            gradedAt: now,
          },
        });

        if (!timedOut) {
          writer({
            type: 'graded',
            data: { questionId: question.id, score: result.score, isCorrect: result.isCorrect },
          });
        }
      }
    }

    if (timedOut) return;

    // ── Final score calculation ────────────────────────────────────────────
    // Re-fetch from DB to get authoritative scores (handles partial LLM results).
    const gradedAnswers = await prisma.answer.findMany({
      where: { quizAttemptId },
      select: { score: true },
    });

    const totalScore = gradedAnswers.reduce((sum, a) => sum + (a.score?.toNumber() ?? 0), 0);
    const finalScore =
      Math.round((totalScore / questions.length) * 100 * 100) / 100;

    await prisma.quizAttempt.update({
      where: { id: quizAttemptId },
      data: { status: QuizStatus.COMPLETED, score: finalScore, completedAt: now },
    });

    writer({ type: 'complete', data: { quizAttemptId, score: finalScore } });
  } catch (err) {
    logger.error({ err, quizAttemptId }, 'Quiz grading failed');

    if (!timedOut) {
      writer({ type: 'error', message: 'Grading failed. You can retry grading.' });
    }

    await prisma.quizAttempt
      .update({ where: { id: quizAttemptId }, data: { status: QuizStatus.SUBMITTED_UNGRADED } })
      .catch((updateErr: unknown) =>
        logger.error({ updateErr, quizAttemptId }, 'Failed to set submitted_ungraded after error'),
      );
  } finally {
    clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Returns the completed quiz with all grading data revealed: correctAnswer,
 * explanation, per-answer score and feedback. Only available on completed quizzes.
 */
export const getResults = async (
  quizAttemptId: string,
  userId: string,
): Promise<QuizResultsResponse> => {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: quizAttemptId },
    include: {
      questions: { orderBy: { questionNumber: 'asc' } },
      answers: true,
    },
  });

  if (!attempt) throw new NotFoundError('Quiz attempt not found');
  assertOwnership(attempt.userId, userId);

  if (attempt.status !== QuizStatus.COMPLETED) {
    throw new BadRequestError('Quiz results are not available yet');
  }

  const summary = attempt.answers.reduce(
    (acc, a) => {
      const score = a.score?.toNumber() ?? 0;
      if (score === 1) acc.correct++;
      else if (score === 0.5) acc.partial++;
      else acc.incorrect++;
      return acc;
    },
    { correct: 0, partial: 0, incorrect: 0, total: attempt.answers.length },
  );

  const answerByQuestionId = new Map(attempt.answers.map((a) => [a.questionId, a]));

  return {
    id: attempt.id,
    sessionId: attempt.sessionId,
    difficulty: attempt.difficulty as QuizDifficulty,
    answerFormat: attempt.answerFormat as AnswerFormat,
    questionCount: attempt.questionCount,
    status: attempt.status as QuizStatus,
    score: attempt.score?.toNumber() ?? null,
    materialsUsed: attempt.materialsUsed,
    completedAt: attempt.completedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    summary,
    questions: attempt.questions.map((q) => {
      const a = answerByQuestionId.get(q.id);
      return {
        id: q.id,
        questionNumber: q.questionNumber,
        questionType: q.questionType as QuestionType,
        questionText: q.questionText,
        options: q.options as string[] | null,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        tags: q.tags as string[] | null,
        answer: {
          userAnswer: a?.userAnswer ?? null,
          isCorrect: a?.isCorrect ?? null,
          score: a?.score?.toNumber() ?? null,
          feedback: a?.feedback ?? null,
        },
      };
    }),
  };
};
