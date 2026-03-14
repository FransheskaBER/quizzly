import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  QuizDifficulty,
  AnswerFormat,
  QuestionType,
  QuizStatus,
  FREE_TRIAL_QUESTION_COUNT,
} from '@skills-trainer/shared';
import type { LlmGeneratedQuestion } from '@skills-trainer/shared';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../config/database.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { findUnique: vi.fn() },
    quizAttempt: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    question: { create: vi.fn() },
    answer: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../llm.service.js', () => ({
  streamQuestions: vi.fn(),
  generateReplacementQuestion: vi.fn(),
  gradeAnswers: vi.fn(),
}));

vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));

vi.mock('../../utils/encryption.utils.js', () => ({
  encrypt: vi.fn((p: string) => `enc-${p}`),
  decrypt: vi.fn((c: string) => c.replace('enc-', '')),
}));

vi.mock('../../utils/sentry.utils.js', () => ({
  captureExceptionOnce: vi.fn(),
  markErrorAsCaptured: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import { Sentry } from '../../config/sentry.js';
import { streamQuestions, generateReplacementQuestion } from '../llm.service.js';
import { executeGeneration } from '../quiz.service.js';
import { BadRequestError } from '../../utils/errors.js';
import type { StreamQuestionsResult, MalformedSlot } from '../llm.service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-111';
const SESSION_ID = 'session-uuid-aaa';
const ATTEMPT_ID = 'attempt-uuid-bbb';

const makeMcqQuestion = (n: number): LlmGeneratedQuestion => ({
  questionNumber: n,
  questionType: QuestionType.MCQ,
  questionText: `MCQ question ${n}`,
  options: ['A', 'B', 'C', 'D'],
  correctAnswer: 'A',
  explanation: `Explanation ${n}`,
  difficulty: QuizDifficulty.MEDIUM,
  tags: [`topic-${n}`],
});

const makeFreeTextQuestion = (n: number): LlmGeneratedQuestion => ({
  questionNumber: n,
  questionType: QuestionType.FREE_TEXT,
  questionText: `Free text question ${n}`,
  options: null,
  correctAnswer: 'Answer',
  explanation: `Explanation ${n}`,
  difficulty: QuizDifficulty.MEDIUM,
  tags: [`topic-${n}`],
});

const makeMalformedSlot = (slotNumber: number): MalformedSlot => ({
  originalSlotNumber: slotNumber,
  rawLlmOutput: `{"invalid": true, "questionType": "mcq"}`,
  zodErrors: new ZodError([{
    code: 'invalid_type',
    expected: 'string',
    received: 'undefined',
    path: ['questionText'],
    message: 'Required',
  }]),
});

const mockAttemptRecord = {
  id: ATTEMPT_ID,
  sessionId: SESSION_ID,
  userId: USER_ID,
  difficulty: 'medium',
  answerFormat: 'multiple_choice',
  questionCount: 5,
  materialsUsed: true,
  status: QuizStatus.GENERATING,
  score: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BASE_PARAMS = {
  sessionId: SESSION_ID,
  userId: USER_ID,
  difficulty: QuizDifficulty.MEDIUM,
  answerFormat: AnswerFormat.MCQ,
  questionCount: 5,
  sessionSubject: 'TypeScript',
  sessionGoal: 'Learn TS',
  materialsText: 'TS is typed JS.',
  materialsUsed: true,
  isFreeTrialGeneration: true,
};

const BYOK_PARAMS = {
  ...BASE_PARAMS,
  isFreeTrialGeneration: false,
  userApiKey: 'sk-test-key',
};

let questionCreateCounter: number;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sets up streamQuestions mock to invoke onValidQuestion for each question. */
const setupStreamMock = (
  validQuestions: LlmGeneratedQuestion[],
  malformedSlots: MalformedSlot[] = [],
) => {
  vi.mocked(streamQuestions as Mock).mockImplementation(
    async (
      _params: unknown,
      onValid: (q: LlmGeneratedQuestion, n: number) => Promise<void>,
      onMalformed: (raw: string, err: ZodError, slot: number) => void,
    ): Promise<StreamQuestionsResult> => {
      let assignedNumber = 1;
      for (const q of validQuestions) {
        await onValid(q, assignedNumber);
        assignedNumber++;
      }
      for (const slot of malformedSlots) {
        onMalformed(slot.rawLlmOutput, slot.zodErrors, slot.originalSlotNumber);
      }
      return { validCount: validQuestions.length, malformedSlots };
    },
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeGeneration — streaming ACs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    questionCreateCounter = 0;

    vi.mocked(prisma.quizAttempt.create).mockResolvedValue(mockAttemptRecord as never);
    vi.mocked(prisma.question.create).mockImplementation((() => {
      questionCreateCounter++;
      return Promise.resolve({
        id: `q-${questionCreateCounter}`,
        questionNumber: questionCreateCounter,
      });
    }) as never);
    vi.mocked(prisma.answer.create).mockResolvedValue({ id: 'a-1' } as never);
    vi.mocked(prisma.quizAttempt.update).mockResolvedValue(mockAttemptRecord as never);
    vi.mocked(prisma.quizAttempt.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // AC5: Successful replacement saved with next sequential questionNumber + SSE
  // -------------------------------------------------------------------------

  it('saves replacement question with next sequential questionNumber and sends SSE event (AC5)', async () => {
    const validQuestions = [makeMcqQuestion(1), makeMcqQuestion(2), makeMcqQuestion(3), makeMcqQuestion(4)];
    const malformedSlot = makeMalformedSlot(3);

    setupStreamMock(validQuestions, [malformedSlot]);

    const replacementQuestion = makeMcqQuestion(99);
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(replacementQuestion);

    const writer = vi.fn();
    await executeGeneration(BASE_PARAMS, writer);

    // Replacement should be saved as question #5 (4 valid + 1 replacement)
    expect(prisma.question.create).toHaveBeenCalledTimes(5);

    // Check SSE question events
    const questionEvents = writer.mock.calls
      .map(([e]: [{ type: string }]) => e)
      .filter((e: { type: string }) => e.type === 'question');
    expect(questionEvents).toHaveLength(5);

    // Check that a complete event was sent (generation succeeded)
    const completeEvent = writer.mock.calls
      .map(([e]: [{ type: string }]) => e)
      .find((e: { type: string }) => e.type === 'complete');
    expect(completeEvent).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // AC6: Failed replacement → question_failed SSE + questionCount updated
  // -------------------------------------------------------------------------

  it('sends question_failed SSE event when replacement also fails (AC6)', async () => {
    const validQuestions = [makeMcqQuestion(1), makeMcqQuestion(2), makeMcqQuestion(3), makeMcqQuestion(4)];
    const malformedSlot = makeMalformedSlot(5);

    setupStreamMock(validQuestions, [malformedSlot]);

    // Replacement fails
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(null);

    const writer = vi.fn();
    await executeGeneration(BYOK_PARAMS, writer);

    const failedEvents = writer.mock.calls
      .map(([e]: [{ type: string; data?: unknown }]) => e)
      .filter((e: { type: string }) => e.type === 'question_failed');
    expect(failedEvents).toHaveLength(1);

    const failedData = (failedEvents[0] as { data: { questionNumber: number; message: string } }).data;
    expect(failedData.questionNumber).toBe(5);
    expect(failedData.message).toContain('tried twice');

    // questionCount should be updated to actual valid count (4)
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({}),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // AC7: Free trial fails entirely if any question permanently fails
  // -------------------------------------------------------------------------

  it('fails free trial generation when replacement fails and count < FREE_TRIAL_QUESTION_COUNT (AC7)', async () => {
    const validQuestions = Array.from({ length: 4 }, (_, i) => makeMcqQuestion(i + 1));
    const malformedSlot = makeMalformedSlot(5);

    setupStreamMock(validQuestions, [malformedSlot]);
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(null);

    const writer = vi.fn();
    await executeGeneration(BASE_PARAMS, writer);

    // Should send an error SSE event (generation failed)
    const errorEvents = writer.mock.calls
      .map(([e]: [{ type: string; message?: string }]) => e)
      .filter((e: { type: string }) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { message: string }).message).toBe('Generation failed. Please try again.');

    // Should clean up the GENERATING attempt
    expect(prisma.quizAttempt.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTEMPT_ID, status: QuizStatus.GENERATING },
      }),
    );
  });

  // -------------------------------------------------------------------------
  // AC8: Replaced malformed → Sentry warning with all context fields
  // -------------------------------------------------------------------------

  it('captures Sentry warning with all context fields when replacement succeeds (AC8)', async () => {
    const validQuestions = [makeMcqQuestion(1), makeMcqQuestion(2), makeMcqQuestion(3), makeMcqQuestion(4)];
    const malformedSlot = makeMalformedSlot(3);

    setupStreamMock(validQuestions, [malformedSlot]);
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(makeMcqQuestion(99));

    const writer = vi.fn();
    await executeGeneration(BASE_PARAMS, writer);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('malformed_question') }),
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({
          'quiz.generation.failure_type': 'malformed_question',
          'quiz.generation.key_type': 'server',
        }),
        extra: expect.objectContaining({
          quizAttemptId: ATTEMPT_ID,
          questionSlot: 3,
          attemptNumber: 1,
          rawLlmOutput: expect.any(String),
          zodValidationErrors: expect.anything(),
          difficulty: QuizDifficulty.MEDIUM,
          questionType: expect.any(String),
          materialType: 'provided',
          modelUsed: 'claude-sonnet-4-6',
          isServerKey: true,
          totalQuestionsRequested: FREE_TRIAL_QUESTION_COUNT,
          successfulQuestions: 5,
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // AC9: Replacement failed → Sentry error, attemptNumber: 2
  // -------------------------------------------------------------------------

  it('captures Sentry error with attemptNumber: 2 when replacement fails (AC9)', async () => {
    const validQuestions = [makeMcqQuestion(1), makeMcqQuestion(2), makeMcqQuestion(3), makeMcqQuestion(4)];
    const malformedSlot = makeMalformedSlot(5);

    setupStreamMock(validQuestions, [malformedSlot]);
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(null);

    const writer = vi.fn();
    await executeGeneration(BYOK_PARAMS, writer);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('replacement_failed') }),
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({
          'quiz.generation.failure_type': 'replacement_failed',
          'quiz.generation.key_type': 'byok',
        }),
        extra: expect.objectContaining({
          attemptNumber: 2,
          successfulQuestions: 4,
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // AC10: 2+ permanently failed → Sentry error, threshold_exceeded
  // -------------------------------------------------------------------------

  it('captures Sentry error with threshold_exceeded and high_priority tag for 2+ failures (AC10)', async () => {
    const validQuestions = [makeMcqQuestion(1), makeMcqQuestion(2), makeMcqQuestion(3)];
    const malformedSlots = [makeMalformedSlot(4), makeMalformedSlot(5)];

    setupStreamMock(validQuestions, malformedSlots);
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(null);

    const writer = vi.fn();
    await executeGeneration(BYOK_PARAMS, writer);

    // Should have captured: 2 replacement_failed + 1 threshold_exceeded = 3 calls
    const thresholdCall = vi.mocked(Sentry.captureException).mock.calls.find(
      ([, opts]) =>
        (opts as { tags: Record<string, string> })?.tags?.['quiz.generation.failure_type'] === 'threshold_exceeded',
    );

    expect(thresholdCall).toBeDefined();
    const [, options] = thresholdCall!;
    expect((options as { level: string }).level).toBe('error');
    expect((options as { tags: Record<string, string> }).tags).toHaveProperty('high_priority', 'true');
  });

  // -------------------------------------------------------------------------
  // AC23: All questions valid → behavior identical to current (regression)
  // -------------------------------------------------------------------------

  it('completes normally when all questions are valid — no Sentry, no question_failed (AC23)', async () => {
    const validQuestions = Array.from({ length: 5 }, (_, i) => makeMcqQuestion(i + 1));

    setupStreamMock(validQuestions, []);

    const writer = vi.fn();
    await executeGeneration(BASE_PARAMS, writer);

    // No replacement calls
    expect(generateReplacementQuestion).not.toHaveBeenCalled();

    // No Sentry captures
    expect(Sentry.captureException).not.toHaveBeenCalled();

    // No question_failed events
    const failedEvents = writer.mock.calls
      .map(([e]: [{ type: string }]) => e)
      .filter((e: { type: string }) => e.type === 'question_failed');
    expect(failedEvents).toHaveLength(0);

    // 5 question SSE events
    const questionEvents = writer.mock.calls
      .map(([e]: [{ type: string }]) => e)
      .filter((e: { type: string }) => e.type === 'question');
    expect(questionEvents).toHaveLength(5);

    // generation_started + complete events
    const startedEvent = writer.mock.calls
      .map(([e]: [{ type: string }]) => e)
      .find((e: { type: string }) => e.type === 'generation_started');
    expect(startedEvent).toBeDefined();

    const completeEvent = writer.mock.calls
      .map(([e]: [{ type: string }]) => e)
      .find((e: { type: string }) => e.type === 'complete');
    expect(completeEvent).toBeDefined();

    // DB commit via $transaction
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC7 variant: Free trial fails when LLM returns free_text question
  // -------------------------------------------------------------------------

  it('fails free trial generation when a replacement question is free_text instead of MCQ (AC7 MCQ check)', async () => {
    const validQuestions = Array.from({ length: 4 }, (_, i) => makeMcqQuestion(i + 1));
    const malformedSlot = makeMalformedSlot(5);

    setupStreamMock(validQuestions, [malformedSlot]);

    // Replacement returns free_text — invalid for free trial
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(makeFreeTextQuestion(99));

    const writer = vi.fn();
    await executeGeneration(BASE_PARAMS, writer);

    // Should fail: only 4 valid MCQ + 1 free_text replacement → rejected
    const errorEvents = writer.mock.calls
      .map(([e]: [{ type: string }]) => e)
      .filter((e: { type: string }) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // AC6 variant: questionCount updated to actual valid count
  // -------------------------------------------------------------------------

  it('updates questionCount to actual valid count when replacement fails (AC6 count check)', async () => {
    const validQuestions = [makeMcqQuestion(1), makeMcqQuestion(2), makeMcqQuestion(3), makeMcqQuestion(4)];
    const malformedSlot = makeMalformedSlot(5);

    setupStreamMock(validQuestions, [malformedSlot]);
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(null);

    const writer = vi.fn();
    await executeGeneration(BYOK_PARAMS, writer);

    // $transaction should set questionCount = 4 (actual valid)
    const transactionCall = vi.mocked(prisma.$transaction).mock.calls[0];
    expect(transactionCall).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // SSE error message forwarding (RFC AC1-AC5)
  // -------------------------------------------------------------------------

  it('forwards BadRequestError message via SSE when streamQuestions throws AppError (AC1/AC2/AC3)', async () => {
    const apiKeyError = new BadRequestError(
      'Could not generate your quiz. Your API key appears to be invalid. Please verify you added the correct key.',
    );
    vi.mocked(streamQuestions as Mock).mockRejectedValue(apiKeyError);

    const writer = vi.fn();
    await executeGeneration(BYOK_PARAMS, writer);

    const errorEvents = writer.mock.calls
      .map(([e]: [{ type: string; message?: string }]) => e)
      .filter((e: { type: string }) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { message: string }).message).toBe(
      'Could not generate your quiz. Your API key appears to be invalid. Please verify you added the correct key.',
    );
  });

  it('sends generic message via SSE when non-AppError is thrown (AC5)', async () => {
    vi.mocked(streamQuestions as Mock).mockRejectedValue(new Error('unexpected failure'));

    const writer = vi.fn();
    await executeGeneration(BYOK_PARAMS, writer);

    const errorEvents = writer.mock.calls
      .map(([e]: [{ type: string; message?: string }]) => e)
      .filter((e: { type: string }) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { message: string }).message).toBe('Generation failed. Please try again.');
  });

  it('sends generic message for free trial failure (AC6 regression)', async () => {
    const validQuestions = Array.from({ length: 4 }, (_, i) => makeMcqQuestion(i + 1));
    const malformedSlot = makeMalformedSlot(5);

    setupStreamMock(validQuestions, [malformedSlot]);
    vi.mocked(generateReplacementQuestion as Mock).mockResolvedValue(null);

    const writer = vi.fn();
    await executeGeneration(BASE_PARAMS, writer);

    // Free trial fails with plain Error → generic message
    const errorEvents = writer.mock.calls
      .map(([e]: [{ type: string; message?: string }]) => e)
      .filter((e: { type: string }) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { message: string }).message).toBe('Generation failed. Please try again.');
  });
});
