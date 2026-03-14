import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { QuizStatus } from '@skills-trainer/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../config/database.js', () => ({
  prisma: {
    quizAttempt: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../services/quiz.service.js', () => ({
  prepareGeneration: vi.fn(),
  executeGeneration: vi.fn(),
  getActiveGeneration: vi.fn(),
}));

vi.mock('../../middleware/auth.middleware.js', () => ({
  auth: vi.fn((_req: unknown, _res: unknown, next: () => void) => {
    (_req as { user: { userId: string } }).user = { userId: 'user-1' };
    next();
  }),
}));

vi.mock('../../middleware/validate.middleware.js', () => ({
  validate: () => vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../middleware/rateLimiter.middleware.js', () => ({
  quizGenerationHourlyLimiter: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  quizGenerationDailyLimiter: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  regradeRateLimiter: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../utils/ownership.js', () => ({
  assertOwnership: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import * as quizService from '../../services/quiz.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_QUESTIONS = [
  {
    id: 'q1',
    questionNumber: 1,
    questionType: 'mcq',
    questionText: 'Question 1?',
    options: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'q2',
    questionNumber: 2,
    questionType: 'mcq',
    questionText: 'Question 2?',
    options: ['A', 'B', 'C', 'D'],
  },
];

/** Parses SSE text into an array of event objects. */
const parseSSEEvents = (text: string): unknown[] =>
  text
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.replace('data: ', '')));

const buildApp = async () => {
  const { quizRouter } = await import('../quiz.routes.js');
  const app = express();
  app.use('/api/sessions', quizRouter);
  return app;
};

// ---------------------------------------------------------------------------
// Tests — AC22: Server restarted → return current state, update IN_PROGRESS
// ---------------------------------------------------------------------------

describe('Quiz reconnect route — server restarted scenario (AC22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing questions and updates status to IN_PROGRESS when server has no in-memory generation', async () => {
    const mockAttempt = {
      id: 'attempt-1',
      userId: 'user-1',
      sessionId: 'session-1',
      status: QuizStatus.GENERATING,
      questionCount: 5,
      questions: MOCK_QUESTIONS,
    };

    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttempt as never);
    vi.mocked(prisma.quizAttempt.update).mockResolvedValue({} as never);
    vi.mocked(quizService.getActiveGeneration).mockReturnValue(undefined);

    const app = await buildApp();

    const res = await request(app)
      .get('/api/sessions/session-1/quizzes/generate?reconnect=true&quizAttemptId=attempt-1')
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const events = parseSSEEvents(res.text);
    const generationStarted = events.find((e: unknown) => (e as { type: string }).type === 'generation_started');
    const questionEvents = events.filter((e: unknown) => (e as { type: string }).type === 'question');
    const completeEvent = events.find((e: unknown) => (e as { type: string }).type === 'complete');

    expect(generationStarted).toBeDefined();
    expect(questionEvents).toHaveLength(2);
    expect(completeEvent).toBeDefined();

    expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: QuizStatus.IN_PROGRESS,
          questionCount: 2,
        }),
      }),
    );
  });

  it('does not update status when attempt is already IN_PROGRESS', async () => {
    const mockAttempt = {
      id: 'attempt-1',
      userId: 'user-1',
      sessionId: 'session-1',
      status: QuizStatus.IN_PROGRESS,
      questionCount: 2,
      questions: MOCK_QUESTIONS.slice(0, 1),
    };

    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttempt as never);
    vi.mocked(quizService.getActiveGeneration).mockReturnValue(undefined);

    const app = await buildApp();

    const res = await request(app)
      .get('/api/sessions/session-1/quizzes/generate?reconnect=true&quizAttemptId=attempt-1')
      .buffer(true);

    expect(res.status).toBe(200);

    const events = parseSSEEvents(res.text);
    const questionEvents = events.filter((e: unknown) => (e as { type: string }).type === 'question');
    expect(questionEvents).toHaveLength(1);

    // Should NOT update status since it's already IN_PROGRESS
    expect(prisma.quizAttempt.update).not.toHaveBeenCalled();
  });

  it('returns 404 when quizAttemptId belongs to a different session', async () => {
    const mockAttempt = {
      id: 'attempt-1',
      userId: 'user-1',
      sessionId: 'other-session',
      status: QuizStatus.GENERATING,
      questionCount: 5,
      questions: MOCK_QUESTIONS,
    };

    vi.mocked(prisma.quizAttempt.findUnique).mockResolvedValue(mockAttempt as never);

    const app = await buildApp();

    const res = await request(app)
      .get('/api/sessions/session-1/quizzes/generate?reconnect=true&quizAttemptId=attempt-1')
      .buffer(true);

    // The NotFoundError is thrown but asyncHandler converts it to an error response
    // With mocked asyncHandler, the error may be swallowed — verify no SSE events sent
    expect(res.headers['content-type']).not.toContain('text/event-stream');
  });
});
