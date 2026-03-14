import pino from 'pino';
import { Prisma } from '@prisma/client';

import {
  QuizStatus,
  QuestionType,
  MaterialStatus,
  SSE_SERVER_TIMEOUT_MS,
  FREE_TRIAL_QUESTION_COUNT,
  KeySource,
  type QuizDifficulty,
  AnswerFormat,
  type QuizAttemptResponse,
  type QuizResultsResponse,
  type LlmGeneratedQuestion,
} from '@skills-trainer/shared';

import { Sentry } from '../config/sentry.js';
import { prisma } from '../config/database.js';
import { assertOwnership } from '../utils/ownership.js';
import { decrypt } from '../utils/encryption.utils.js';
import { BadRequestError, ConflictError, NotFoundError, TrialExhaustedError } from '../utils/errors.js';
import { captureExceptionOnce } from '../utils/sentry.utils.js';
import { LLM_MODEL } from '../prompts/constants.js';
import {
  streamQuestions,
  generateReplacementQuestion,
  gradeAnswers as llmGradeAnswers,
  type MalformedSlot,
} from './llm.service.js';
import type { FreeTextAnswer, GenerateQuizParams } from './llm.service.js';
import type { SseWriter } from '../utils/sse.utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Checks whether a generated question is MCQ type. */
const isMcqQuestion = (question: LlmGeneratedQuestion): boolean =>
  question.questionType === QuestionType.MCQ;

const logger = pino({ name: 'quiz.service' });

// ---------------------------------------------------------------------------
// Generation types
// ---------------------------------------------------------------------------

interface PreparedGeneration {
  sessionSubject: string;
  sessionGoal: string;
  materialsText: string;
  materialsUsed: boolean;
  isFreeTrialGeneration: boolean;
  userApiKey?: string;
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
  userApiKey?: string;
}

// ---------------------------------------------------------------------------
// Generation — Phase 1 (pre-stream)
// ---------------------------------------------------------------------------

/**
 * Pre-stream checks for quiz generation.
 * Throws AppError subclasses on failure so asyncHandler returns a JSON error
 * before any SSE headers are written.
 */
/** Fetches and decrypts the user's saved API key. Returns undefined if no key saved. */
const resolveUserApiKey = async (userId: string): Promise<string | undefined> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true },
  });
  if (!user?.encryptedApiKey) return undefined;
  try {
    return decrypt(user.encryptedApiKey);
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to decrypt stored API key');
    captureExceptionOnce(err, { extra: { userId, operation: 'quiz.resolveUserApiKey.decrypt' } });
    throw new BadRequestError(
      'Could not read your saved API key. Please re-save it in your profile.',
    );
  }
};

export const prepareGeneration = async (
  sessionId: string,
  userId: string,
): Promise<PreparedGeneration> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeTrialUsedAt: true, encryptedApiKey: true },
  });

  if (!user) throw new NotFoundError('User not found');

  const isTrialUsed = user.freeTrialUsedAt !== null;
  const isFreeTrialGeneration = !isTrialUsed;

  if (isTrialUsed && !user.encryptedApiKey) {
    throw new TrialExhaustedError(
      'Free trial generation used. Save your Anthropic API key in your profile to generate more quizzes.',
    );
  }

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

  // Decrypt the user's API key for BYOK generations; free trial uses the server key.
  const userApiKey = isFreeTrialGeneration ? undefined : await resolveUserApiKey(userId);

  return {
    sessionSubject: session.subject,
    sessionGoal: session.goal,
    materialsText,
    materialsUsed,
    isFreeTrialGeneration,
    userApiKey,
  };
};

// ---------------------------------------------------------------------------
// Generation — Phase 2 (SSE streaming)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// In-memory generation tracking for SSE reconnection
// ---------------------------------------------------------------------------

const activeGenerations = new Map<string, Set<SseWriter>>();

export const getActiveGeneration = (quizAttemptId: string): Set<SseWriter> | undefined =>
  activeGenerations.get(quizAttemptId);

// ---------------------------------------------------------------------------
// Reconnection (RFC §3.7)
// ---------------------------------------------------------------------------

const RECONNECT_POLL_INTERVAL_MS = 500;

interface ReconnectContext {
  attempt: {
    id: string;
    status: string;
    questionCount: number;
    questions: Array<{
      id: string;
      questionNumber: number;
      questionType: string;
      questionText: string;
      options: unknown;
    }>;
  };
}

/**
 * Pre-SSE validation for reconnection. Verifies ownership, session match,
 * and returns the attempt with its questions.
 * Throws AppError subclasses on failure so asyncHandler returns JSON.
 */
export const prepareReconnect = async (
  quizAttemptId: string,
  userId: string,
  sessionId: string,
): Promise<ReconnectContext> => {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: quizAttemptId },
    include: {
      questions: { orderBy: { questionNumber: 'asc' } },
    },
  });

  if (!attempt) throw new NotFoundError('Quiz attempt not found');
  assertOwnership(attempt.userId, userId);

  if (attempt.sessionId !== sessionId) {
    throw new NotFoundError('Quiz attempt not found');
  }

  return { attempt };
};

/**
 * SSE streaming for reconnection. Sends existing questions and subscribes
 * to active generation if still running. Never throws — the caller must
 * open SSE headers before calling this function.
 */
export const executeReconnect = async (
  context: ReconnectContext,
  writer: SseWriter,
  isClientConnected: () => boolean,
): Promise<void> => {
  const { attempt } = context;

  writer({
    type: 'generation_started',
    data: { quizAttemptId: attempt.id, totalExpected: attempt.questionCount },
  });

  for (const q of attempt.questions) {
    writer({
      type: 'question',
      data: {
        id: q.id,
        questionNumber: q.questionNumber,
        questionType: q.questionType,
        questionText: q.questionText,
        options: q.options as string[] | null,
      },
    });
  }

  const activeWriters = activeGenerations.get(attempt.id);
  if (activeWriters) {
    activeWriters.add(writer);
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!isClientConnected() || !activeGenerations.has(attempt.id)) {
          clearInterval(checkInterval);
          activeWriters.delete(writer);
          resolve();
        }
      }, RECONNECT_POLL_INTERVAL_MS);
    });
  } else {
    if (attempt.status === QuizStatus.GENERATING) {
      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          status: QuizStatus.IN_PROGRESS,
          questionCount: attempt.questions.length,
        },
      });
    }
    writer({ type: 'complete', data: { quizAttemptId: attempt.id } });
  }
};

// ---------------------------------------------------------------------------
// Sentry helpers for malformed question capture (RFC §3.3)
// ---------------------------------------------------------------------------

interface MalformedQuestionContext {
  quizAttemptId: string;
  slot: MalformedSlot;
  attemptNumber: 1 | 2;
  difficulty: QuizDifficulty;
  answerFormat: AnswerFormat;
  materialsUsed: boolean;
  isServerKey: boolean;
  totalQuestionsRequested: number;
  successfulQuestions: number;
}

/** Extracts questionType from raw LLM output via regex. Falls back to 'unknown'. */
const extractQuestionType = (rawOutput: string): string => {
  const match = rawOutput.match(/"questionType"\s*:\s*"([^"]+)"/);
  return match ? match[1] : 'unknown';
};

const captureMalformedQuestionSentry = (
  ctx: MalformedQuestionContext,
  failureType: 'malformed_question' | 'replacement_failed' | 'threshold_exceeded',
  level: 'warning' | 'error',
): void => {
  const questionType = extractQuestionType(ctx.slot.rawLlmOutput);
  const error = new Error(`QuizQuestionGenerationFailed: ${failureType}`);
  Sentry.captureException(error, {
    level,
    tags: {
      'quiz.generation.failure_type': failureType,
      'quiz.generation.question_type': questionType,
      'quiz.generation.key_type': ctx.isServerKey ? 'server' : 'byok',
      ...(failureType === 'threshold_exceeded' ? { high_priority: 'true' } : {}),
    },
    extra: {
      quizAttemptId: ctx.quizAttemptId,
      questionSlot: ctx.slot.originalSlotNumber,
      attemptNumber: ctx.attemptNumber,
      rawLlmOutput: ctx.slot.rawLlmOutput,
      zodValidationErrors: ctx.slot.zodErrors.format(),
      difficulty: ctx.difficulty,
      questionType,
      materialType: ctx.materialsUsed ? 'provided' : 'none',
      modelUsed: LLM_MODEL,
      isServerKey: ctx.isServerKey,
      totalQuestionsRequested: ctx.totalQuestionsRequested,
      successfulQuestions: ctx.successfulQuestions,
    },
  });
};

// ---------------------------------------------------------------------------
// Save + SSE helper for a single validated question
// ---------------------------------------------------------------------------

const saveAndStreamQuestion = async (
  question: LlmGeneratedQuestion,
  assignedNumber: number,
  quizAttemptId: string,
  questionCount: number,
  timedOut: boolean,
  writers: Set<SseWriter>,
): Promise<{ tags: string[] }> => {
  const dbQuestion = await prisma.question.create({
    data: {
      quizAttemptId,
      questionNumber: assignedNumber,
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
      quizAttemptId,
    },
  });

  if (!timedOut) {
    const event = {
      type: 'question' as const,
      data: {
        id: dbQuestion.id,
        questionNumber: assignedNumber,
        questionType: question.questionType,
        questionText: question.questionText,
        options: question.options,
      },
    };
    const progressEvent = {
      type: 'progress' as const,
      message: `Generating question ${assignedNumber}/${questionCount}...`,
    };
    for (const w of writers) {
      w(event);
      w(progressEvent);
    }
  }

  return { tags: question.tags ?? [] };
};

const QUESTION_FAILED_MESSAGE =
  "We tried twice to generate this question, but the AI output wasn't valid. " +
  'To avoid using more of your API tokens, we stopped here. ' +
  'Your quiz score will be calculated based on the questions you answered — no penalty for this one.';

/**
 * SSE streaming generation with per-question parsing, malformed recovery,
 * and Sentry capture.
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
    answerFormat: requestedFormat,
    questionCount: requestedCount,
    sessionSubject,
    sessionGoal,
    materialsText,
    materialsUsed,
    isFreeTrialGeneration,
    userApiKey,
  } = params;

  const questionCount = isFreeTrialGeneration ? FREE_TRIAL_QUESTION_COUNT : requestedCount;
  const answerFormat = isFreeTrialGeneration ? AnswerFormat.MCQ : requestedFormat;

  let quizAttemptId: string | null = null;
  let generationCommitted = false;
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
        keySource: isFreeTrialGeneration ? KeySource.SERVER_KEY : KeySource.USER_KEY,
        status: QuizStatus.GENERATING,
      },
    });
    quizAttemptId = quizAttempt.id;

    // Register for SSE reconnection
    const writers = new Set<SseWriter>([writer]);
    activeGenerations.set(quizAttempt.id, writers);

    writer({ type: 'generation_started', data: { quizAttemptId: quizAttempt.id, totalExpected: questionCount } });
    writer({ type: 'progress', message: 'Analyzing materials...' });

    const allTags: string[] = [];
    let questionsGenerated = 0;
    let allQuestionsMcq = true;

    const llmParams: GenerateQuizParams = {
      subject: sessionSubject,
      goal: sessionGoal,
      difficulty,
      answerFormat,
      questionCount,
      materialsText: materialsText || null,
    };

    // Phase 1: Stream questions with per-question parsing
    const streamResult = await streamQuestions(
      llmParams,
      async (question, assignedNumber) => {
        const { tags } = await saveAndStreamQuestion(
          question, assignedNumber, quizAttempt.id, questionCount, timedOut, writers,
        );
        allTags.push(...tags);
        questionsGenerated++;
        if (!isMcqQuestion(question)) allQuestionsMcq = false;
      },
      (rawOutput, zodErrors, slotNumber) => {
        logger.warn(
          { quizAttemptId: quizAttempt.id, slotNumber, zodErrors: zodErrors.format() },
          'Malformed question detected during streaming',
        );
      },
      userApiKey,
    );

    // Phase 2: Malformed question recovery
    let permanentlyFailed = 0;

    for (const slot of streamResult.malformedSlots) {
      if (timedOut) break;

      const sentryCtx: MalformedQuestionContext = {
        quizAttemptId: quizAttempt.id,
        slot,
        attemptNumber: 1,
        difficulty,
        answerFormat,
        materialsUsed,
        isServerKey: isFreeTrialGeneration,
        totalQuestionsRequested: questionCount,
        successfulQuestions: questionsGenerated,
      };

      const replacement = await generateReplacementQuestion(llmParams, allTags, userApiKey);

      // Reject free_text replacements during free trial (must be MCQ)
      const isValidReplacement = replacement && (!isFreeTrialGeneration || isMcqQuestion(replacement));

      if (isValidReplacement) {
        // Replacement succeeded — save and stream
        questionsGenerated++;
        if (!isMcqQuestion(replacement)) allQuestionsMcq = false;
        const nextNumber = questionsGenerated;
        const { tags } = await saveAndStreamQuestion(
          replacement, nextNumber, quizAttempt.id, questionCount, timedOut, writers,
        );
        allTags.push(...tags);

        // Sentry warning: self-healed
        captureMalformedQuestionSentry(
          { ...sentryCtx, successfulQuestions: questionsGenerated },
          'malformed_question',
          'warning',
        );
      } else {
        // Replacement also failed
        permanentlyFailed++;

        // Sentry error: replacement failed
        captureMalformedQuestionSentry(
          { ...sentryCtx, attemptNumber: 2, successfulQuestions: questionsGenerated },
          'replacement_failed',
          'error',
        );

        if (!timedOut) {
          const failedNumber = questionsGenerated + permanentlyFailed;
          for (const w of writers) {
            w({
              type: 'question_failed',
              data: {
                questionNumber: failedNumber,
                message: QUESTION_FAILED_MESSAGE,
              },
            });
          }
        }
      }
    }

    // Sentry: threshold check — 2+ permanently failed
    if (permanentlyFailed >= 2 && streamResult.malformedSlots.length > 0) {
      captureMalformedQuestionSentry(
        {
          quizAttemptId: quizAttempt.id,
          slot: streamResult.malformedSlots[0],
          attemptNumber: 2,
          difficulty,
          answerFormat,
          materialsUsed,
          isServerKey: isFreeTrialGeneration,
          totalQuestionsRequested: questionCount,
          successfulQuestions: questionsGenerated,
        },
        'threshold_exceeded',
        'error',
      );
    }

    // Free trial validation: must produce exactly FREE_TRIAL_QUESTION_COUNT MCQ questions
    if (isFreeTrialGeneration && (questionsGenerated !== FREE_TRIAL_QUESTION_COUNT || permanentlyFailed > 0 || !allQuestionsMcq)) {
      throw new Error(
        `Free trial generation must return exactly ${FREE_TRIAL_QUESTION_COUNT} multiple-choice questions`,
      );
    }

    // Commit: update quiz_attempt to in_progress with actual question count.
    // Always do this even if timed out — questions are saved and the user can
    // still take the quiz.
    await prisma.$transaction([
      prisma.quizAttempt.update({
        where: { id: quizAttempt.id },
        data: {
          status: QuizStatus.IN_PROGRESS,
          questionCount: questionsGenerated,
          startedAt: null,
        },
      }),
      ...(isFreeTrialGeneration
        ? [prisma.user.update({ where: { id: userId }, data: { freeTrialUsedAt: new Date() } })]
        : []),
    ]);
    generationCommitted = true;

    if (!timedOut) {
      for (const w of writers) {
        w({ type: 'complete', data: { quizAttemptId: quizAttempt.id } });
      }
    }
  } catch (err) {
    logger.error({ err, sessionId }, 'Quiz generation failed');
    captureExceptionOnce(err, { extra: { sessionId } });

    if (!timedOut) {
      writer({ type: 'error', message: 'Generation failed. Please try again.' });
    }

    // Remove only uncommitted GENERATING attempts so users can retry immediately
    if (quizAttemptId && !generationCommitted) {
      try {
        const deleted = await prisma.quizAttempt.deleteMany({
          where: { id: quizAttemptId, status: QuizStatus.GENERATING },
        });
        logger.info(
          { quizAttemptId, deletedCount: deleted.count },
          'Cleaned up failed generating attempt',
        );
      } catch (cleanupErr) {
        logger.error({ cleanupErr, quizAttemptId }, 'Failed to clean up quiz attempt after failure');
        captureExceptionOnce(cleanupErr, { extra: { quizAttemptId } });
      }
    } else if (quizAttemptId && generationCommitted) {
      logger.info(
        { quizAttemptId },
        'Skipping cleanup because generation already committed and quiz is recoverable',
      );
    }
  } finally {
    clearTimeout(timeoutId);
    if (quizAttemptId) {
      activeGenerations.delete(quizAttemptId);
    }
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

  // Stamp startedAt the first time the user opens this quiz for taking.
  if (attempt.status === QuizStatus.IN_PROGRESS && attempt.startedAt === null) {
    try {
      await prisma.quizAttempt.update({
        where: { id: quizAttemptId },
        data: { startedAt: new Date() },
      });
    } catch (err) {
      logger.error({ err, quizAttemptId }, 'Failed to set startedAt');
      captureExceptionOnce(err, { extra: { quizAttemptId } });
    }
  }

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

  // BYOK quizzes require the user's key for free-text grading
  const hasFreeText = attempt.questions.some((q) => q.questionType === QuestionType.FREE_TEXT);
  let userApiKey: string | undefined;
  if (attempt.keySource === KeySource.USER_KEY && hasFreeText) {
    userApiKey = await resolveUserApiKey(userId);
    if (!userApiKey) {
      throw new TrialExhaustedError(
        'Free trial generation used. Save your Anthropic API key in your profile to grade free-text answers.',
      );
    }
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
    userApiKey,
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

  // BYOK quizzes require the user's key for free-text grading
  const hasFreeText = attempt.questions.some((q) => q.questionType === QuestionType.FREE_TEXT);
  let userApiKey: string | undefined;
  if (attempt.keySource === KeySource.USER_KEY && hasFreeText) {
    userApiKey = await resolveUserApiKey(userId);
    if (!userApiKey) {
      throw new TrialExhaustedError(
        'Free trial generation used. Save your Anthropic API key in your profile to grade free-text answers.',
      );
    }
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
    userApiKey,
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
  const { quizAttemptId, sessionSubject, questions, answers, userApiKey } = context;
  const now = new Date();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    writer({ type: 'error', message: 'Grading timed out. You can retry grading.' });
    logger.warn({ quizAttemptId }, 'Grading timed out');
    void (async () => {
      try {
        await prisma.quizAttempt.update({
          where: { id: quizAttemptId },
          data: { status: QuizStatus.SUBMITTED_UNGRADED },
        });
      } catch (err) {
        logger.error({ err, quizAttemptId }, 'Failed to set submitted_ungraded after timeout');
        captureExceptionOnce(err, { extra: { quizAttemptId } });
      }
    })();
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
        userApiKey,
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

    // If any answer is still ungraded (null score) the LLM returned fewer
    // results than expected. Treat this as a grading failure so the user
    // can retry, rather than silently scoring missing questions as 0.
    const ungradedCount = gradedAnswers.filter((a) => a.score === null).length;
    if (ungradedCount > 0) {
      logger.warn(
        { quizAttemptId, ungradedCount },
        'Grading incomplete — LLM returned fewer results than expected',
      );
      writer({ type: 'error', message: 'Grading failed. You can retry grading.' });
      await prisma.quizAttempt.update({
        where: { id: quizAttemptId },
        data: { status: QuizStatus.SUBMITTED_UNGRADED },
      });
      return;
    }

    const totalScore = gradedAnswers.reduce((sum, a) => sum + (a.score?.toNumber() ?? 0), 0);
    const finalScore = Math.round((totalScore / questions.length) * 100 * 100) / 100;

    await prisma.quizAttempt.update({
      where: { id: quizAttemptId },
      data: { status: QuizStatus.COMPLETED, score: finalScore, completedAt: now },
    });

    writer({ type: 'complete', data: { quizAttemptId, score: finalScore } });
  } catch (err) {
    logger.error({ err, quizAttemptId }, 'Quiz grading failed');
    captureExceptionOnce(err, { extra: { quizAttemptId } });

    if (!timedOut) {
      writer({ type: 'error', message: 'Grading failed. You can retry grading.' });
    }

    try {
      await prisma.quizAttempt.update({
        where: { id: quizAttemptId },
        data: { status: QuizStatus.SUBMITTED_UNGRADED },
      });
    } catch (updateErr) {
      logger.error({ updateErr, quizAttemptId }, 'Failed to set submitted_ungraded after error');
      captureExceptionOnce(updateErr, { extra: { quizAttemptId } });
    }
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
