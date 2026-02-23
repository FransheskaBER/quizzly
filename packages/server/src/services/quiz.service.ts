import {
  QuizStatus,
  MaterialStatus,
  SSE_SERVER_TIMEOUT_MS,
  type QuizDifficulty,
  type AnswerFormat,
  type QuestionType,
  type QuizAttemptResponse,
} from '@skills-trainer/shared';

import pino from 'pino';
import { Prisma } from '@prisma/client';

import { prisma } from '../config/database.js';
import { assertOwnership } from '../utils/ownership.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { generateQuiz as llmGenerateQuiz } from './llm.service.js';
import type { SseWriter } from '../utils/sse.utils.js';

const logger = pino({ name: 'quiz.service' });

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

/**
 * Phase 1 — pre-stream checks.
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

/**
 * Phase 2 — SSE streaming generation.
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

/**
 * Returns a quiz attempt with its questions and answers, stripping all fields
 * that must not be revealed to the client while the quiz is in progress
 * (correctAnswer, explanation, difficulty, tags on questions; isCorrect, score,
 * feedback, gradedAt on answers).
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
