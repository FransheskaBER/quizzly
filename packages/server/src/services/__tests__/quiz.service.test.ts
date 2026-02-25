import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock calls are hoisted — mock factories run before imports
vi.mock('../../config/database.js', () => ({
  prisma: {
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

import { prisma } from '../../config/database.js';
import { generateQuiz as llmGenerateQuiz, gradeAnswers as llmGradeAnswers } from '../llm.service.js';
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
          questionCount: 2,
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

  it('updates quiz_attempt to IN_PROGRESS with actual question count on completion', async () => {
    const writer = vi.fn();
    await executeGeneration(BASE_EXECUTION_PARAMS, writer);

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockQuizAttemptRecord.id },
        data: expect.objectContaining({
          status: QuizStatus.IN_PROGRESS,
          questionCount: 1,
          startedAt: null,
        }),
      }),
    );
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

  it('updates questionCount to the actual number when LLM returns fewer than requested', async () => {
    // Request 2, LLM returns 1 (partial success)
    vi.mocked(llmGenerateQuiz).mockResolvedValue([mockLlmQuestion]);
    const writer = vi.fn();

    await executeGeneration({ ...BASE_EXECUTION_PARAMS, questionCount: 2 }, writer);

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ questionCount: 1 }),
      }),
    );
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

    // Fire-and-forget update — give the micro-task queue a tick to settle.
    await Promise.resolve();

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
});
