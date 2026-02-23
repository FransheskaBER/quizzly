import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock calls are hoisted — mock factories run before imports
vi.mock('../../config/database.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
    quizAttempt: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    question: {
      create: vi.fn(),
    },
    answer: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../llm.service.js', () => ({
  generateQuiz: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import { generateQuiz as llmGenerateQuiz } from '../llm.service.js';
import { prepareGeneration, executeGeneration } from '../quiz.service.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors.js';
import { QuizDifficulty, AnswerFormat, QuestionType, QuizStatus, MaterialStatus } from '@skills-trainer/shared';
import type { LlmGeneratedQuestion } from '@skills-trainer/shared';
import type { SseEvent } from '../../utils/sse.utils.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-111';
const OTHER_USER_ID = 'user-uuid-999';
const SESSION_ID = 'session-uuid-aaa';

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
  id: 'attempt-uuid-bbb',
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
  id: 'question-uuid-ccc',
  quizAttemptId: 'attempt-uuid-bbb',
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
          startedAt: expect.any(Date),
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
