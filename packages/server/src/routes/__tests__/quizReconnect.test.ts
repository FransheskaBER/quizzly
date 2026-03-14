import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/quiz.service.js', () => ({
  prepareGeneration: vi.fn(),
  executeGeneration: vi.fn(),
  getActiveGeneration: vi.fn(),
  prepareReconnect: vi.fn(),
  executeReconnect: vi.fn(),
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

import * as quizService from '../../services/quiz.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const MOCK_CONTEXT = {
  attempt: {
    id: 'attempt-1',
    status: 'generating',
    questionCount: 5,
    questions: [
      { id: 'q1', questionNumber: 1, questionType: 'mcq', questionText: 'Q1?', options: ['A', 'B'] },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests — Route delegates reconnect to service (prepare + execute)
// ---------------------------------------------------------------------------

describe('Quiz reconnect route — delegation to service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls prepareReconnect then opens SSE and calls executeReconnect', async () => {
    vi.mocked(quizService.prepareReconnect).mockResolvedValue(MOCK_CONTEXT);
    vi.mocked(quizService.executeReconnect).mockImplementation(
      async (_context, writer) => {
        writer({ type: 'generation_started', data: { quizAttemptId: 'attempt-1', totalExpected: 5 } });
        writer({ type: 'complete', data: { quizAttemptId: 'attempt-1' } });
      },
    );

    const app = await buildApp();

    const res = await request(app)
      .get('/api/sessions/session-1/quizzes/generate?reconnect=true&quizAttemptId=attempt-1')
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const events = parseSSEEvents(res.text);
    expect(events).toHaveLength(2);

    expect(quizService.prepareReconnect).toHaveBeenCalledWith('attempt-1', 'user-1', 'session-1');
    expect(quizService.executeReconnect).toHaveBeenCalledWith(
      MOCK_CONTEXT,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('returns JSON error when prepareReconnect throws NotFoundError', async () => {
    const { NotFoundError } = await import('../../utils/errors.js');
    vi.mocked(quizService.prepareReconnect).mockRejectedValue(
      new NotFoundError('Quiz attempt not found'),
    );

    const app = await buildApp();

    const res = await request(app)
      .get('/api/sessions/session-1/quizzes/generate?reconnect=true&quizAttemptId=attempt-1')
      .buffer(true);

    // Pre-SSE error — no SSE headers written
    expect(res.headers['content-type']).not.toContain('text/event-stream');
    expect(quizService.executeReconnect).not.toHaveBeenCalled();
  });

  it('falls through to normal generation when reconnect is not set', async () => {
    vi.mocked(quizService.prepareGeneration).mockRejectedValue(new Error('should reach here'));

    const app = await buildApp();

    await request(app)
      .get('/api/sessions/session-1/quizzes/generate?difficulty=medium&format=mcq&count=5')
      .buffer(true);

    expect(quizService.prepareReconnect).not.toHaveBeenCalled();
    expect(quizService.executeReconnect).not.toHaveBeenCalled();
  });
});
