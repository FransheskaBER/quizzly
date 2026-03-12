import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock calls are hoisted — mock factories run before imports
vi.mock('../../config/database.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
    quizAttempt: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    question: {
      create: vi.fn(),
    },
    answer: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../llm.service.js', () => ({
  generateQuiz: vi.fn(),
  gradeAnswers: vi.fn(),
}));

vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));

vi.mock('../../utils/encryption.utils.js', () => ({
  encrypt: vi.fn((plaintext: string) => `encrypted-${plaintext}`),
  decrypt: vi.fn((ciphertext: string) => ciphertext.replace('encrypted-', '')),
}));

import { prisma } from '../../config/database.js';
import { Sentry } from '../../config/sentry.js';
import { generateQuiz as llmGenerateQuiz, gradeAnswers as llmGradeAnswers } from '../llm.service.js';
import { decrypt } from '../../utils/encryption.utils.js';
import {
  prepareGeneration,
  executeGeneration,
  getQuiz,
  saveAnswers,
  prepareGrading,
  executeGrading,
  getResults,
  prepareRegrade,
} from '../quiz.service.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  TrialExhaustedError,
} from '../../utils/errors.js';
import {
  QuizDifficulty,
  AnswerFormat,
  QuestionType,
  QuizStatus,
  MaterialStatus,
} from '@skills-trainer/shared';
import type { LlmGeneratedQuestion } from '@skills-trainer/shared';
import type { SseEvent } from '../../utils/sse.utils.js';
import type { GradingContext } from '../quiz.service.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-111';
const OTHER_USER_ID = 'user-uuid-999';
const SESSION_ID = 'session-uuid-aaa';
const ATTEMPT_ID = 'attempt-uuid-bbb';
const QUESTION_ID = 'question-uuid-ccc';
const ANSWER_ID = 'answer-uuid-eee';

const mockLlmQuestion: LlmGeneratedQuestion = {
  questionNumber: 1,
  questionType: QuestionType.MCQ,
  questionText: 'What does TypeScript add to JavaScript?',
  options: ['Static typing', 'Dynamic typing', 'Garbage collection', 'Just-in-time compilation'],
  correctAnswer: 'Static typing',
  explanation: 'TypeScript extends JavaScript by adding static type checking.',
  difficulty: QuizDifficulty.MEDIUM,
  tags: ['typescript'],
};

const mockSecondLlmQuestion: LlmGeneratedQuestion = {
  questionNumber: 2,
  questionType: QuestionType.FREE_TEXT,
  questionText: 'Explain the benefits of using TypeScript interfaces.',
  options: null,
  correctAnswer: 'Interfaces define contracts for object shapes, enabling type-safe code.',
  explanation: 'Interfaces allow structural typing and enforce contracts at compile time.',
  difficulty: QuizDifficulty.MEDIUM,
  tags: ['typescript', 'interfaces'],
};

const mockSessionWithMaterials = {
  id: SESSION_ID,
  userId: USER_ID,
  name: 'TypeScript Course',
  subject: 'TypeScript',
  goal: 'Learn TypeScript fundamentals',
  promptConfig: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  materials: [
    { extractedText: 'TypeScript is a typed superset of JavaScript.' },
    { extractedText: 'Interfaces define the shape of objects.' },
  ],
};

const mockSessionNoMaterials = {
  ...mockSessionWithMaterials,
  materials: [],
};

const mockQuizAttemptRecord = {
  id: ATTEMPT_ID,
  sessionId: SESSION_ID,
  userId: USER_ID,
  difficulty: 'medium',
  answerFormat: 'mixed',
  questionCount: 2,
  materialsUsed: true,
  status: 'generating',
  score: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDbQuestion = {
  id: QUESTION_ID,
  quizAttemptId: ATTEMPT_ID,
  questionNumber: 1,
  questionType: 'mcq',
  questionText: 'What does TypeScript add to JavaScript?',
  options: ['Static typing', 'Dynamic typing', 'Garbage collection', 'Just-in-time compilation'],
  correctAnswer: 'Static typing',
  explanation: 'TypeScript extends JavaScript by adding static type checking.',
  difficulty: 'medium',
  tags: ['typescript'],
  createdAt: new Date(),
};

const BASE_EXECUTION_PARAMS = {
  sessionId: SESSION_ID,
  userId: USER_ID,
  difficulty: QuizDifficulty.MEDIUM,
  answerFormat: AnswerFormat.MIXED,
  questionCount: 2,
  sessionSubject: 'TypeScript',
  sessionGoal: 'Learn TypeScript fundamentals',
  materialsText: 'TypeScript is a typed superset of JavaScript.',
  materialsUsed: true,
  isFreeTrialGeneration: true,
};

// Quiz attempt as returned by quizAttempt.findUnique (includes questions + answers)
const mockAttemptWithQA = {
  id: ATTEMPT_ID,
  sessionId: SESSION_ID,
  userId: USER_ID,
  difficulty: 'easy',
  answerFormat: 'mcq',
  questionCount: 1,
  materialsUsed: false,
  isFreeTrial: true,
  status: QuizStatus.IN_PROGRESS,
  score: null,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  questions: [
    {
      id: QUESTION_ID,
      quizAttemptId: ATTEMPT_ID,
      questionNumber: 1,
      questionType: 'mcq',
      questionText: 'What is TypeScript?',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'A',
      explanation: 'TypeScript is A.',
      difficulty: 'easy',
      tags: ['ts'],
      createdAt: new Date(),
    },
  ],
  answers: [
    {
      id: ANSWER_ID,
      questionId: QUESTION_ID,
      quizAttemptId: ATTEMPT_ID,
      userAnswer: null,
      isCorrect: null,
      score: null,
      feedback: null,
      answeredAt: null,
      gradedAt: null,
    },
  ],
  session: { subject: 'TypeScript' },
};

// Grading context used by executeGrading tests — built manually (no DB call)
const mockGradingContext: GradingContext = {
  quizAttemptId: ATTEMPT_ID,
  sessionSubject: 'TypeScript',
  questions: [
    {
      id: QUESTION_ID,
      questionNumber: 1,
      questionType: QuestionType.MCQ,
      questionText: 'What is TypeScript?',
      correctAnswer: 'A typed superset of JavaScript',
    },
  ],
  answers: [
    {
      id: ANSWER_ID,
      questionId: QUESTION_ID,
      userAnswer: 'A typed superset of JavaScript',
    },
  ],
};

// Helper — creates a Decimal-like mock for Prisma score fields
const decimal = (n: number) => ({ toNumber: () => n });

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// prepareGeneration
// ---------------------------------------------------------------------------

describe('prepareGeneration', () => {
  beforeEach(() => {
    // Default: trial not used, no saved API key
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ freeTrialUsedAt: null, encryptedApiKey: null } as never);
  });

  it('returns sessionSubject, sessionGoal, concatenated materialsText, and materialsUsed:true', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);

    const result = await prepareGeneration(SESSION_ID, USER_ID);

    expect(result.sessionSubject).toBe('TypeScript');
    expect(result.sessionGoal).toBe('Learn TypeScript fundamentals');
    expect(result.materialsText).toContain('TypeScript is a typed superset of JavaScript.');
    expect(result.materialsText).toContain('Interfaces define the shape of objects.');
    expect(result.materialsUsed).toBe(true);
  });

  it('returns isFreeTrialGeneration:true when user has not used trial', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);

    const result = await prepareGeneration(SESSION_ID, USER_ID);

    expect(result.isFreeTrialGeneration).toBe(true);
  });

  it('joins multiple material texts with a double newline', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);

    const result = await prepareGeneration(SESSION_ID, USER_ID);

    expect(result.materialsText).toContain('\n\n');
  });

  it('returns materialsUsed:false and empty materialsText when session has no materials', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionNoMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);

    const result = await prepareGeneration(SESSION_ID, USER_ID);

    expect(result.materialsUsed).toBe(false);
    expect(result.materialsText).toBe('');
  });

  it('throws NotFoundError when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(prepareGeneration(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws TrialExhaustedError when free trial has already been used', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      freeTrialUsedAt: new Date('2026-01-01'),
    } as never);

    await expect(prepareGeneration(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(TrialExhaustedError);
  });

  it('throws NotFoundError when session does not exist', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    await expect(prepareGeneration('nonexistent', USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when session belongs to a different user', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSessionWithMaterials,
      userId: OTHER_USER_ID,
    } as never);

    await expect(prepareGeneration(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ConflictError when a generation is already in progress for the session', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue({
      id: 'existing-attempt',
      status: QuizStatus.GENERATING,
    } as never);

    await expect(prepareGeneration(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(ConflictError);
  });

  it('filters materials by READY status via the Prisma query', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionNoMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);

    await prepareGeneration(SESSION_ID, USER_ID);

    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          materials: expect.objectContaining({
            where: expect.objectContaining({ status: MaterialStatus.READY }),
          }),
        }),
      }),
    );
  });

  it('allows generation with saved BYOK key when trial is used', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      freeTrialUsedAt: new Date('2026-01-01'),
      encryptedApiKey: 'encrypted-sk-ant-test-key-1234567890',
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);

    const result = await prepareGeneration(SESSION_ID, USER_ID);

    expect(result.isFreeTrialGeneration).toBe(false);
    expect(result.userApiKey).toBe('sk-ant-test-key-1234567890');
  });

  it('uses server key when trial is not used (no userApiKey)', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);

    const result = await prepareGeneration(SESSION_ID, USER_ID);

    expect(result.isFreeTrialGeneration).toBe(true);
    expect(result.userApiKey).toBeUndefined();
  });

  it('throws TrialExhaustedError when trial is used and no saved API key', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      freeTrialUsedAt: new Date('2026-01-01'),
      encryptedApiKey: null,
    } as never);

    await expect(prepareGeneration(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(TrialExhaustedError);
  });

  it('captures decrypt failures to Sentry for BYOK generation preparation', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      freeTrialUsedAt: new Date('2026-01-01'),
      encryptedApiKey: 'encrypted-bad',
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithMaterials as never);
    vi.mocked(prisma.quizAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(decrypt).mockImplementationOnce(() => {
      throw new Error('decrypt failed');
    });

    await expect(prepareGeneration(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(BadRequestError);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'quiz.prepareGeneration.decrypt' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// executeGeneration
// ---------------------------------------------------------------------------

describe('executeGeneration', () => {
  beforeEach(() => {
    vi.mocked(prisma.quizAttempt.create).mockResolvedValue(mockQuizAttemptRecord as never);
    vi.mocked(prisma.question.create).mockResolvedValue(mockDbQuestion as never);
    vi.mocked(prisma.answer.create).mockResolvedValue({ id: 'answer-uuid-ddd' } as never);
    vi.mocked(prisma.quizAttempt.update).mockResolvedValue(mockQuizAttemptRecord as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);
    vi.mocked(llmGenerateQuiz).mockResolvedValue([mockLlmQuestion]);
  });

  it('creates a quiz_attempt record with GENERATING status before LLM call', async () => {
    const writer = vi.fn();
    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    expect(prisma.quizAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: SESSION_ID,
          userId: USER_ID,
          difficulty: QuizDifficulty.MEDIUM,
          answerFormat: AnswerFormat.MIXED,
          questionCount: 5,
          status: QuizStatus.GENERATING,
          materialsUsed: true,
        }),
      }),
    );
  });

  it('sends a progress event before calling the LLM', async () => {
    const writer = vi.fn();
    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    const events = writer.mock.calls.map(([e]) => e as SseEvent);
    const progressBefore = events.find((e) => e.type === 'progress');
    expect(progressBefore).toBeDefined();
  });

  it('creates a question record and an answer record for each LLM question', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue([mockLlmQuestion, mockSecondLlmQuestion]);
    const writer = vi.fn();

    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    expect(prisma.question.create).toHaveBeenCalledTimes(2);
    expect(prisma.answer.create).toHaveBeenCalledTimes(2);
  });

  it('sends one SSE question event per generated question', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue([mockLlmQuestion, mockSecondLlmQuestion]);
    const writer = vi.fn();

    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    const questionEvents = writer.mock.calls
      .map(([e]) => e as SseEvent)
      .filter((e) => e.type === 'question');
    expect(questionEvents).toHaveLength(2);
  });

  it('SSE question events do NOT include correctAnswer or explanation', async () => {
    const writer = vi.fn();
    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    const questionEvents = writer.mock.calls
      .map(([e]) => e as { type: string; data?: Record<string, unknown> })
      .filter((e) => e.type === 'question');

    for (const event of questionEvents) {
      expect(event.data).not.toHaveProperty('correctAnswer');
      expect(event.data).not.toHaveProperty('explanation');
    }
  });

  it('SSE question events include id, questionNumber, questionType, questionText, options', async () => {
    const writer = vi.fn();
    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    const questionEvent = writer.mock.calls
      .map(([e]) => e as { type: string; data?: Record<string, unknown> })
      .find((e) => e.type === 'question');

    expect(questionEvent?.data).toHaveProperty('id');
    expect(questionEvent?.data).toHaveProperty('questionNumber');
    expect(questionEvent?.data).toHaveProperty('questionType');
    expect(questionEvent?.data).toHaveProperty('questionText');
    expect(questionEvent?.data).toHaveProperty('options');
  });

  it('updates quiz_attempt to IN_PROGRESS and marks trial as used via $transaction', async () => {
    const writer = vi.fn();
    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({}),
        expect.objectContaining({}),
      ]),
    );
    const transactionArg = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown[];
    expect(transactionArg).toHaveLength(2);
  });

  it('sends the complete event with the quizAttemptId on successful completion', async () => {
    const writer = vi.fn();
    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    const completeEvent = writer.mock.calls
      .map(([e]) => e as SseEvent)
      .find((e) => e.type === 'complete');

    expect(completeEvent).toBeDefined();
    expect((completeEvent?.data as { quizAttemptId: string })?.quizAttemptId).toBe(
      mockQuizAttemptRecord.id,
    );
  });

  it('completes via $transaction when LLM returns fewer questions than requested', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue([mockLlmQuestion]);
    const writer = vi.fn();

    await executeGeneration({ ...BASE_EXECUTION_PARAMS, questionCount: 2 }, writer);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('still sends the complete event when LLM returns fewer questions than requested', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue([mockLlmQuestion]);
    const writer = vi.fn();

    await executeGeneration({ ...BASE_EXECUTION_PARAMS, questionCount: 5 }, writer);

    const events = writer.mock.calls.map(([e]) => e as SseEvent);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('sends an SSE error event when the LLM call throws', async () => {
    vi.mocked(llmGenerateQuiz).mockRejectedValue(new Error('Anthropic unavailable'));
    const writer = vi.fn();

    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    const errorEvent = writer.mock.calls
      .map(([e]) => e as SseEvent)
      .find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { type: string; message: string }).message).toContain('failed');
  });

  it('does not throw when the LLM call throws — errors are sent as SSE events', async () => {
    vi.mocked(llmGenerateQuiz).mockRejectedValue(new Error('Anthropic unavailable'));
    const writer = vi.fn();

    await expect(executeGeneration(BASE_EXECUTION_PARAMS, writer)).resolves.toBeUndefined();
  });

  it('passes materialsText as null to the LLM when the session has no materials', async () => {
    const writer = vi.fn();
    await executeGeneration(
      { ...BASE_EXECUTION_PARAMS, materialsText: '', materialsUsed: false },
      writer,
    );

    expect(llmGenerateQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ materialsText: null }),
      expect.any(Function),
      undefined,
    );
  });

  it('passes userApiKey to LLM service for BYOK generation', async () => {
    const writer = vi.fn();
    const byokKey = 'sk-ant-byok-test-key-123';
    await executeGeneration(
      { ...BASE_EXECUTION_PARAMS, isFreeTrialGeneration: false, userApiKey: byokKey },
      writer,
    );

    expect(llmGenerateQuiz).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function),
      byokKey,
    );
  });
});

// ---------------------------------------------------------------------------
// getQuiz
// ---------------------------------------------------------------------------

describe('getQuiz', () => {
  it('returns attempt with questions stripped of correctAnswer and explanation', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttemptWithQA as never);

    const result = await getQuiz(ATTEMPT_ID, USER_ID);

    expect(result.questions[0]).not.toHaveProperty('correctAnswer');
    expect(result.questions[0]).not.toHaveProperty('explanation');
  });

  it('returns question fields: id, questionNumber, questionType, questionText, options', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttemptWithQA as never);

    const result = await getQuiz(ATTEMPT_ID, USER_ID);

    expect(result.questions[0]).toMatchObject({
      id: QUESTION_ID,
      questionNumber: 1,
      questionType: 'mcq',
      questionText: 'What is TypeScript?',
      options: ['A', 'B', 'C', 'D'],
    });
  });

  it('returns answer fields: id, questionId, userAnswer, answeredAt', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttemptWithQA as never);

    const result = await getQuiz(ATTEMPT_ID, USER_ID);

    expect(result.answers[0]).toMatchObject({
      id: ANSWER_ID,
      questionId: QUESTION_ID,
      userAnswer: null,
      answeredAt: null,
    });
  });

  it('returns top-level attempt fields: id, sessionId, status, questionCount', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttemptWithQA as never);

    const result = await getQuiz(ATTEMPT_ID, USER_ID);

    expect(result).toMatchObject({
      id: ATTEMPT_ID,
      sessionId: SESSION_ID,
      status: QuizStatus.IN_PROGRESS,
      questionCount: 1,
    });
  });

  it('throws NotFoundError when the attempt does not exist', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(null);

    await expect(getQuiz('nonexistent', USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when the attempt belongs to a different user', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...mockAttemptWithQA,
      userId: OTHER_USER_ID,
    } as never);

    await expect(getQuiz(ATTEMPT_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('stamps startedAt when the quiz is in_progress and startedAt is null', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...mockAttemptWithQA,
      startedAt: null,
    } as never);
    vi.mocked(prisma.quizAttempt.update).mockResolvedValue({ id: ATTEMPT_ID } as never);

    await getQuiz(ATTEMPT_ID, USER_ID);

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTEMPT_ID },
        data: expect.objectContaining({ startedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not stamp startedAt when startedAt is already set', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttemptWithQA as never);

    await getQuiz(ATTEMPT_ID, USER_ID);

    expect(prisma.quizAttempt.update).not.toHaveBeenCalled();
  });

  it('captures to Sentry when startedAt update fails', async () => {
    const dbError = new Error('DB connection lost');
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...mockAttemptWithQA,
      startedAt: null,
    } as never);
    vi.mocked(prisma.quizAttempt.update).mockRejectedValueOnce(dbError);

    // getQuiz should still return the quiz — startedAt failure is non-fatal
    const result = await getQuiz(ATTEMPT_ID, USER_ID);

    expect(result).toBeDefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(dbError, {
      extra: { quizAttemptId: ATTEMPT_ID },
    });
  });
});

// ---------------------------------------------------------------------------
// saveAnswers
// ---------------------------------------------------------------------------

describe('saveAnswers', () => {
  const attemptWithAnswers = {
    ...mockAttemptWithQA,
    status: QuizStatus.IN_PROGRESS,
    answers: [{ questionId: QUESTION_ID }],
  };

  beforeEach(() => {
    vi.mocked(prisma.answer.update).mockResolvedValue({ id: ANSWER_ID } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);
  });

  it('returns { saved: 1 } when one valid answer is submitted', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(attemptWithAnswers as never);

    const result = await saveAnswers(ATTEMPT_ID, USER_ID, [
      { questionId: QUESTION_ID, answer: 'A' },
    ]);

    expect(result).toEqual({ saved: 1 });
  });

  it('calls answer.update once per valid answer (via $transaction)', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(attemptWithAnswers as never);

    await saveAnswers(ATTEMPT_ID, USER_ID, [{ questionId: QUESTION_ID, answer: 'A' }]);

    expect(prisma.answer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { questionId: QUESTION_ID },
        data: expect.objectContaining({ userAnswer: 'A' }),
      }),
    );
  });

  it('silently filters invalid questionIds and returns { saved: 0 }', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(attemptWithAnswers as never);

    const result = await saveAnswers(ATTEMPT_ID, USER_ID, [
      { questionId: 'invalid-question-id', answer: 'B' },
    ]);

    expect(result).toEqual({ saved: 0 });
    expect(prisma.answer.update).not.toHaveBeenCalled();
  });

  it('only saves valid questionIds when the payload is a mix of valid and invalid', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(attemptWithAnswers as never);

    const result = await saveAnswers(ATTEMPT_ID, USER_ID, [
      { questionId: QUESTION_ID, answer: 'A' },
      { questionId: 'invalid-id', answer: 'B' },
    ]);

    expect(result).toEqual({ saved: 1 });
  });

  it('throws NotFoundError when the attempt does not exist', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(null);

    await expect(
      saveAnswers(ATTEMPT_ID, USER_ID, [{ questionId: QUESTION_ID, answer: 'A' }]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when the attempt belongs to a different user', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...attemptWithAnswers,
      userId: OTHER_USER_ID,
    } as never);

    await expect(
      saveAnswers(ATTEMPT_ID, USER_ID, [{ questionId: QUESTION_ID, answer: 'A' }]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ConflictError when the quiz is not in progress (e.g. completed)', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...attemptWithAnswers,
      status: QuizStatus.COMPLETED,
    } as never);

    await expect(
      saveAnswers(ATTEMPT_ID, USER_ID, [{ questionId: QUESTION_ID, answer: 'A' }]),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('returns { saved: 0 } when the answers array is empty', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(attemptWithAnswers as never);

    const result = await saveAnswers(ATTEMPT_ID, USER_ID, []);

    expect(result).toEqual({ saved: 0 });
  });
});

// ---------------------------------------------------------------------------
// prepareGrading
// ---------------------------------------------------------------------------

describe('prepareGrading', () => {
  const answeredAttempt = {
    ...mockAttemptWithQA,
    status: QuizStatus.IN_PROGRESS,
    answers: [
      {
        ...mockAttemptWithQA.answers[0],
        userAnswer: 'A typed superset of JavaScript',
        answeredAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.mocked(prisma.answer.update).mockResolvedValue({ id: ANSWER_ID } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ encryptedApiKey: null } as never);
    // Re-fetch returns the same answered state
    vi.mocked(prisma.answer.findMany).mockResolvedValue([
      {
        id: ANSWER_ID,
        questionId: QUESTION_ID,
        quizAttemptId: ATTEMPT_ID,
        userAnswer: 'A typed superset of JavaScript',
        isCorrect: null,
        score: null,
        feedback: null,
        answeredAt: new Date(),
        gradedAt: null,
      },
    ] as never);
  });

  it('returns a GradingContext with quizAttemptId, sessionSubject, questions, and answers', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(answeredAttempt as never);

    const result = await prepareGrading(ATTEMPT_ID, USER_ID, []);

    expect(result.quizAttemptId).toBe(ATTEMPT_ID);
    expect(result.sessionSubject).toBe('TypeScript');
    expect(result.questions).toHaveLength(1);
    expect(result.answers).toHaveLength(1);
  });

  it('applies final answers from the payload before building GradingContext', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(answeredAttempt as never);

    await prepareGrading(ATTEMPT_ID, USER_ID, [
      { questionId: QUESTION_ID, answer: 'Final answer' },
    ]);

    expect(prisma.answer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { questionId: QUESTION_ID },
        data: expect.objectContaining({ userAnswer: 'Final answer' }),
      }),
    );
  });

  it('throws NotFoundError when the attempt does not exist', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(null);

    await expect(prepareGrading('nonexistent', USER_ID, [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when the attempt belongs to a different user', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...answeredAttempt,
      userId: OTHER_USER_ID,
    } as never);

    await expect(prepareGrading(ATTEMPT_ID, USER_ID, [])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ConflictError when status is COMPLETED', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...answeredAttempt,
      status: QuizStatus.COMPLETED,
    } as never);

    await expect(prepareGrading(ATTEMPT_ID, USER_ID, [])).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when status is GRADING', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...answeredAttempt,
      status: QuizStatus.GRADING,
    } as never);

    await expect(prepareGrading(ATTEMPT_ID, USER_ID, [])).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws BadRequestError when status is GENERATING (not in_progress)', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...answeredAttempt,
      status: QuizStatus.GENERATING,
    } as never);

    await expect(prepareGrading(ATTEMPT_ID, USER_ID, [])).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when any question has no answer', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(answeredAttempt as never);
    // Re-fetch shows the answer is still null
    vi.mocked(prisma.answer.findMany).mockResolvedValue([
      {
        id: ANSWER_ID,
        questionId: QUESTION_ID,
        quizAttemptId: ATTEMPT_ID,
        userAnswer: null,
        isCorrect: null,
        score: null,
        feedback: null,
        answeredAt: null,
        gradedAt: null,
      },
    ] as never);

    await expect(prepareGrading(ATTEMPT_ID, USER_ID, [])).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws TrialExhaustedError when BYOK quiz has free-text questions and no key provided', async () => {
    const byokFreeTextAttempt = {
      ...answeredAttempt,
      isFreeTrial: false,
      questions: [
        {
          ...mockAttemptWithQA.questions[0],
          questionType: QuestionType.FREE_TEXT,
          options: null,
        },
      ],
    };
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(byokFreeTextAttempt as never);

    await expect(prepareGrading(ATTEMPT_ID, USER_ID, [])).rejects.toBeInstanceOf(TrialExhaustedError);
  });

  it('captures decrypt failures to Sentry for BYOK grading preparation', async () => {
    const byokFreeTextAttempt = {
      ...answeredAttempt,
      isFreeTrial: false,
      questions: [
        {
          ...mockAttemptWithQA.questions[0],
          questionType: QuestionType.FREE_TEXT,
          options: null,
        },
      ],
    };
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(byokFreeTextAttempt as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ encryptedApiKey: 'encrypted-bad' } as never);
    vi.mocked(decrypt).mockImplementationOnce(() => {
      throw new Error('decrypt failed');
    });

    await expect(prepareGrading(ATTEMPT_ID, USER_ID, [])).rejects.toBeInstanceOf(BadRequestError);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'quiz.resolveUserApiKey.decrypt' }),
      }),
    );
  });

  it('allows grading BYOK MCQ-only quiz without key', async () => {
    const byokMcqAttempt = {
      ...answeredAttempt,
      isFreeTrial: false,
    };
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(byokMcqAttempt as never);

    const result = await prepareGrading(ATTEMPT_ID, USER_ID, []);

    expect(result.quizAttemptId).toBe(ATTEMPT_ID);
  });

  it('allows grading free trial quiz with free-text questions without key', async () => {
    const freeTrialFreeTextAttempt = {
      ...answeredAttempt,
      isFreeTrial: true,
      questions: [
        {
          ...mockAttemptWithQA.questions[0],
          questionType: QuestionType.FREE_TEXT,
          options: null,
        },
      ],
    };
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(freeTrialFreeTextAttempt as never);

    const result = await prepareGrading(ATTEMPT_ID, USER_ID, []);

    expect(result.quizAttemptId).toBe(ATTEMPT_ID);
  });
});

// ---------------------------------------------------------------------------
// executeGrading
// ---------------------------------------------------------------------------

describe('executeGrading', () => {
  beforeEach(() => {
    vi.mocked(prisma.quizAttempt.update).mockResolvedValue({ id: ATTEMPT_ID } as never);
    vi.mocked(prisma.answer.update).mockResolvedValue({ id: ANSWER_ID } as never);
    // Default: all answers have score 1 (correct MCQ)
    vi.mocked(prisma.answer.findMany).mockResolvedValue([
      { score: decimal(1) },
    ] as never);
  });

  it('sends a progress event before grading begins', async () => {
    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    const events = writer.mock.calls.map(([e]) => e as SseEvent);
    const progressEvent = events.find((e) => e.type === 'progress');
    expect(progressEvent).toBeDefined();
  });

  it('MCQ: sends a graded event with score 1 and isCorrect true when answer matches', async () => {
    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    const gradedEvent = writer.mock.calls
      .map(([e]) => e as { type: string; data: Record<string, unknown> })
      .find((e) => e.type === 'graded');
    expect(gradedEvent).toBeDefined();
    expect(gradedEvent?.data.score).toBe(1);
    expect(gradedEvent?.data.isCorrect).toBe(true);
  });

  it('MCQ: sends a graded event with score 0 and isCorrect false when answer does not match', async () => {
    const wrongContext: GradingContext = {
      ...mockGradingContext,
      answers: [{ ...mockGradingContext.answers[0], userAnswer: 'wrong answer' }],
    };
    vi.mocked(prisma.answer.findMany).mockResolvedValue([{ score: decimal(0) }] as never);

    const writer = vi.fn();
    await executeGrading(wrongContext, writer);

    const gradedEvent = writer.mock.calls
      .map(([e]) => e as { type: string; data: Record<string, unknown> })
      .find((e) => e.type === 'graded');
    expect(gradedEvent?.data.score).toBe(0);
    expect(gradedEvent?.data.isCorrect).toBe(false);
  });

  it('MCQ: comparison is case-insensitive and trims whitespace', async () => {
    const context: GradingContext = {
      ...mockGradingContext,
      questions: [{ ...mockGradingContext.questions[0], correctAnswer: 'TypeScript' }],
      answers: [{ ...mockGradingContext.answers[0], userAnswer: '  typescript  ' }],
    };

    const writer = vi.fn();
    await executeGrading(context, writer);

    const gradedEvent = writer.mock.calls
      .map(([e]) => e as { type: string; data: Record<string, unknown> })
      .find((e) => e.type === 'graded');
    expect(gradedEvent?.data.isCorrect).toBe(true);
  });

  it('sends a complete event with quizAttemptId and final score on success', async () => {
    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    const completeEvent = writer.mock.calls
      .map(([e]) => e as { type: string; data: Record<string, unknown> })
      .find((e) => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.data.quizAttemptId).toBe(ATTEMPT_ID);
    expect(typeof completeEvent?.data.score).toBe('number');
  });

  it('calculates finalScore as 100 when the single MCQ answer is correct', async () => {
    // totalScore = 1, questions.length = 1 → (1/1)*100 = 100
    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score: 100, status: QuizStatus.COMPLETED }),
      }),
    );
  });

  it('calculates finalScore as 0 when the single MCQ answer is incorrect', async () => {
    const wrongContext: GradingContext = {
      ...mockGradingContext,
      answers: [{ ...mockGradingContext.answers[0], userAnswer: 'wrong' }],
    };
    vi.mocked(prisma.answer.findMany).mockResolvedValue([{ score: decimal(0) }] as never);

    const writer = vi.fn();
    await executeGrading(wrongContext, writer);

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score: 0, status: QuizStatus.COMPLETED }),
      }),
    );
  });

  it('batches free-text questions into a single llmGradeAnswers call', async () => {
    const freeTextContext: GradingContext = {
      quizAttemptId: ATTEMPT_ID,
      sessionSubject: 'TypeScript',
      questions: [
        {
          id: QUESTION_ID,
          questionNumber: 1,
          questionType: QuestionType.FREE_TEXT,
          questionText: 'Explain TypeScript.',
          correctAnswer: 'A typed superset of JavaScript.',
        },
      ],
      answers: [
        { id: ANSWER_ID, questionId: QUESTION_ID, userAnswer: 'It adds types to JS.' },
      ],
    };

    vi.mocked(llmGradeAnswers).mockResolvedValue([
      { questionNumber: 1, score: 0.5, isCorrect: false, feedback: 'Partial.' },
    ] as never);
    vi.mocked(prisma.answer.findMany).mockResolvedValue([{ score: decimal(0.5) }] as never);

    const writer = vi.fn();
    await executeGrading(freeTextContext, writer);

    expect(llmGradeAnswers).toHaveBeenCalledOnce();
    expect(llmGradeAnswers).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'TypeScript' }),
      expect.any(Function),
      undefined,
    );
  });

  it('sets quiz to SUBMITTED_UNGRADED and sends error event when any score is null after grading', async () => {
    // Simulate LLM returning fewer results — answer score stays null
    vi.mocked(prisma.answer.findMany).mockResolvedValue([{ score: null }] as never);

    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    const errorEvent = writer.mock.calls
      .map(([e]) => e as SseEvent)
      .find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: QuizStatus.SUBMITTED_UNGRADED }),
      }),
    );
  });

  it('sets quiz to SUBMITTED_UNGRADED and sends error event when Prisma throws', async () => {
    vi.mocked(prisma.answer.update).mockRejectedValue(new Error('DB unavailable'));

    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    const errorEvent = writer.mock.calls
      .map(([e]) => e as SseEvent)
      .find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: QuizStatus.SUBMITTED_UNGRADED }),
      }),
    );
  });

  it('does not throw when an error occurs — errors are sent as SSE events', async () => {
    vi.mocked(prisma.answer.update).mockRejectedValue(new Error('DB unavailable'));

    const writer = vi.fn();
    await expect(executeGrading(mockGradingContext, writer)).resolves.toBeUndefined();
  });

  it('captures grading failure to Sentry when Prisma throws', async () => {
    const dbError = new Error('DB unavailable');
    vi.mocked(prisma.answer.update).mockRejectedValueOnce(dbError);

    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    expect(Sentry.captureException).toHaveBeenCalledWith(dbError, {
      extra: { quizAttemptId: ATTEMPT_ID },
    });
  });

  it('captures error recovery failure to Sentry when status update also fails', async () => {
    const gradingError = new Error('DB unavailable');
    const recoveryError = new Error('Recovery update failed');
    vi.mocked(prisma.answer.update).mockRejectedValueOnce(gradingError);
    // First update call (set GRADING) succeeds, second (set SUBMITTED_UNGRADED) fails
    vi.mocked(prisma.quizAttempt.update)
      .mockResolvedValueOnce({ id: ATTEMPT_ID } as never) // GRADING
      .mockRejectedValueOnce(recoveryError); // SUBMITTED_UNGRADED recovery

    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    // Both the original error and the recovery error should be captured
    expect(Sentry.captureException).toHaveBeenCalledWith(gradingError, {
      extra: { quizAttemptId: ATTEMPT_ID },
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(recoveryError, {
      extra: { quizAttemptId: ATTEMPT_ID },
    });
  });

  it('passes userApiKey to LLM grading service for BYOK', async () => {
    const byokKey = 'sk-ant-byok-grading-key-99';
    const byokFreeTextContext: GradingContext = {
      quizAttemptId: ATTEMPT_ID,
      sessionSubject: 'TypeScript',
      questions: [
        {
          id: QUESTION_ID,
          questionNumber: 1,
          questionType: QuestionType.FREE_TEXT,
          questionText: 'Explain TypeScript.',
          correctAnswer: 'A typed superset of JavaScript.',
        },
      ],
      answers: [
        { id: ANSWER_ID, questionId: QUESTION_ID, userAnswer: 'It adds types to JS.' },
      ],
      userApiKey: byokKey,
    };

    vi.mocked(llmGradeAnswers).mockResolvedValue([
      { questionNumber: 1, score: 0.8, isCorrect: true, feedback: 'Good.' },
    ] as never);
    vi.mocked(prisma.answer.findMany).mockResolvedValue([{ score: decimal(1) }] as never);

    const writer = vi.fn();
    await executeGrading(byokFreeTextContext, writer);

    expect(llmGradeAnswers).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'TypeScript' }),
      expect.any(Function),
      byokKey,
    );
  });

  it('grades MCQ-only quiz without API key even post-trial', async () => {
    // MCQ context with no userApiKey — should still succeed
    const writer = vi.fn();
    await executeGrading(mockGradingContext, writer);

    expect(llmGradeAnswers).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getResults
// ---------------------------------------------------------------------------

describe('getResults', () => {
  const completedAttempt = {
    ...mockAttemptWithQA,
    status: QuizStatus.COMPLETED,
    score: { toNumber: () => 100 },
    completedAt: new Date(),
    answers: [
      {
        ...mockAttemptWithQA.answers[0],
        userAnswer: 'A',
        isCorrect: true,
        score: decimal(1),
        feedback: null,
        gradedAt: new Date(),
      },
    ],
  };

  it('returns questions with correctAnswer and explanation revealed', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(completedAttempt as never);

    const result = await getResults(ATTEMPT_ID, USER_ID);

    expect(result.questions[0]).toHaveProperty('correctAnswer');
    expect(result.questions[0]).toHaveProperty('explanation');
  });

  it('includes per-answer score, isCorrect, and feedback in each question', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(completedAttempt as never);

    const result = await getResults(ATTEMPT_ID, USER_ID);

    expect(result.questions[0].answer).toMatchObject({
      userAnswer: 'A',
      isCorrect: true,
      score: 1,
    });
  });

  it('returns a summary with correct count of 1 for a perfect score', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(completedAttempt as never);

    const result = await getResults(ATTEMPT_ID, USER_ID);

    expect(result.summary).toMatchObject({ correct: 1, partial: 0, incorrect: 0, total: 1 });
  });

  it('counts partial (score 0.5) answers correctly in summary', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...completedAttempt,
      answers: [{ ...completedAttempt.answers[0], score: decimal(0.5), isCorrect: false }],
    } as never);

    const result = await getResults(ATTEMPT_ID, USER_ID);

    expect(result.summary).toMatchObject({ correct: 0, partial: 1, incorrect: 0, total: 1 });
  });

  it('counts incorrect (score 0) answers correctly in summary', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...completedAttempt,
      answers: [{ ...completedAttempt.answers[0], score: decimal(0), isCorrect: false }],
    } as never);

    const result = await getResults(ATTEMPT_ID, USER_ID);

    expect(result.summary).toMatchObject({ correct: 0, partial: 0, incorrect: 1, total: 1 });
  });

  it('throws NotFoundError when the attempt does not exist', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(null);

    await expect(getResults('nonexistent', USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when the attempt belongs to a different user', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...completedAttempt,
      userId: OTHER_USER_ID,
    } as never);

    await expect(getResults(ATTEMPT_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws BadRequestError when the quiz is not yet completed', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...completedAttempt,
      status: QuizStatus.IN_PROGRESS,
    } as never);

    await expect(getResults(ATTEMPT_ID, USER_ID)).rejects.toBeInstanceOf(BadRequestError);
  });
});

// ---------------------------------------------------------------------------
// prepareRegrade
// ---------------------------------------------------------------------------

describe('prepareRegrade', () => {
  const submittedAttempt = {
    ...mockAttemptWithQA,
    status: QuizStatus.SUBMITTED_UNGRADED,
    answers: [
      {
        ...mockAttemptWithQA.answers[0],
        userAnswer: 'A typed superset of JavaScript',
        answeredAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ encryptedApiKey: null } as never);
  });

  it('returns a GradingContext for an attempt in SUBMITTED_UNGRADED status', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(submittedAttempt as never);

    const result = await prepareRegrade(ATTEMPT_ID, USER_ID);

    expect(result.quizAttemptId).toBe(ATTEMPT_ID);
    expect(result.sessionSubject).toBe('TypeScript');
    expect(result.questions).toHaveLength(1);
    expect(result.answers).toHaveLength(1);
  });

  it('throws NotFoundError when the attempt does not exist', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(null);

    await expect(prepareRegrade('nonexistent', USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when the attempt belongs to a different user', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...submittedAttempt,
      userId: OTHER_USER_ID,
    } as never);

    await expect(prepareRegrade(ATTEMPT_ID, USER_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ConflictError when status is IN_PROGRESS (not submitted_ungraded)', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...submittedAttempt,
      status: QuizStatus.IN_PROGRESS,
    } as never);

    await expect(prepareRegrade(ATTEMPT_ID, USER_ID)).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when status is COMPLETED (not submitted_ungraded)', async () => {
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue({
      ...submittedAttempt,
      status: QuizStatus.COMPLETED,
    } as never);

    await expect(prepareRegrade(ATTEMPT_ID, USER_ID)).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws TrialExhaustedError when BYOK quiz has free-text questions and no key provided', async () => {
    const byokFreeTextAttempt = {
      ...submittedAttempt,
      isFreeTrial: false,
      questions: [
        {
          ...mockAttemptWithQA.questions[0],
          questionType: QuestionType.FREE_TEXT,
          options: null,
        },
      ],
    };
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(byokFreeTextAttempt as never);

    await expect(prepareRegrade(ATTEMPT_ID, USER_ID)).rejects.toBeInstanceOf(TrialExhaustedError);
  });

  it('allows regrading BYOK MCQ-only quiz without key', async () => {
    const byokMcqAttempt = {
      ...submittedAttempt,
      isFreeTrial: false,
    };
    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(byokMcqAttempt as never);

    const result = await prepareRegrade(ATTEMPT_ID, USER_ID);

    expect(result.quizAttemptId).toBe(ATTEMPT_ID);
  });
});
