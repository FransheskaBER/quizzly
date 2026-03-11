import {
  generateQuizQuerySchema,
  quizSessionParamsSchema,
  quizParamsSchema,
  saveAnswersSchema,
  submitQuizBodySchema,
  type GenerateQuizQuery,
  type QuizParams,
  type SaveAnswersRequest,
  type SubmitQuizBody,
} from '@skills-trainer/shared';

import pino from 'pino';
import { Router } from 'express';

import { auth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  quizGenerationHourlyLimiter,
  quizGenerationDailyLimiter,
  regradeRateLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSSEEvent } from '../utils/sse.utils.js';
import * as quizService from '../services/quiz.service.js';
import { UnauthorizedError } from '../utils/errors.js';

const logger = pino({ name: 'quiz.routes' });

const router = Router();

// GET /api/sessions/:sessionId/quizzes/generate
// Opens an SSE stream that delivers validated questions one by one as they are
// saved to the database. Pre-stream errors (auth, ownership, concurrency) are
// returned as standard JSON before any SSE headers are written.
router.get(
  '/:sessionId/quizzes/generate',
  auth,
  quizGenerationHourlyLimiter,
  quizGenerationDailyLimiter,
  validate({ params: quizSessionParamsSchema, query: generateQuizQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');

    const userId = req.user.userId;
    const sessionId = req.params.sessionId as string;
    const { difficulty, format: answerFormat, count: questionCount } =
      req.query as unknown as GenerateQuizQuery;

    // Phase 1: pre-stream validation — throws AppErrors caught by asyncHandler
    // and returned as JSON before any SSE headers are written.
    const prepared = await quizService.prepareGeneration(sessionId, userId);

    // Phase 2: open SSE stream — no JSON errors possible after this point.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let clientConnected = true;
    req.on('close', () => {
      clientConnected = false;
      logger.info({ sessionId, userId }, 'SSE client disconnected during quiz generation');
    });

    const writer = (event: { type: string; data?: unknown; message?: string }) => {
      if (clientConnected) sendSSEEvent(res, event);
    };

    // Phase 3: stream generation — executeGeneration never throws; all errors
    // are sent as SSE error events via writer.
    await quizService.executeGeneration(
      { sessionId, userId, difficulty, answerFormat, questionCount, ...prepared },
      writer,
    );

    res.end();
  }),
);

const takingRouter = Router();

// GET /api/quizzes/:id
takingRouter.get(
  '/:id',
  auth,
  validate({ params: quizParamsSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const { id } = req.params as unknown as QuizParams;
    const result = await quizService.getQuiz(id, req.user.userId);
    res.status(200).json(result);
  }),
);

// PATCH /api/quizzes/:id/answers
takingRouter.patch(
  '/:id/answers',
  auth,
  validate({ params: quizParamsSchema, body: saveAnswersSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const { id } = req.params as unknown as QuizParams;
    const { answers } = req.body as SaveAnswersRequest;
    const result = await quizService.saveAnswers(id, req.user.userId, answers);
    res.status(200).json(result);
  }),
);

// POST /api/quizzes/:id/submit
// Pre-stream: validates status, saves final answers, checks all questions answered.
// On success: opens SSE stream, grades MCQ instantly, grades free-text via LLM.
takingRouter.post(
  '/:id/submit',
  auth,
  validate({ params: quizParamsSchema, body: submitQuizBodySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const { id } = req.params as unknown as QuizParams;
    const { answers } = req.body as SubmitQuizBody;

    // Phase 1: pre-stream checks (ownership, status, save answers, all-answered)
    const context = await quizService.prepareGrading(id, req.user.userId, answers);

    // Phase 2: open SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let clientConnected = true;
    req.on('close', () => {
      clientConnected = false;
      logger.info({ quizAttemptId: id }, 'SSE client disconnected during grading');
    });

    const writer = (event: { type: string; data?: unknown; message?: string }) => {
      if (clientConnected) sendSSEEvent(res, event);
    };

    // Phase 3: stream grading — executeGrading never throws
    await quizService.executeGrading(context, writer);

    res.end();
  }),
);

// GET /api/quizzes/:id/results
// Returns the completed quiz with all answers revealed (correctAnswer, explanation,
// score, feedback). Only available after status is 'completed'.
takingRouter.get(
  '/:id/results',
  auth,
  validate({ params: quizParamsSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const { id } = req.params as unknown as QuizParams;
    const result = await quizService.getResults(id, req.user.userId);
    res.status(200).json(result);
  }),
);

// POST /api/quizzes/:id/regrade
// Retries grading for quizzes stuck in submitted_ungraded. Rate-limited to
// 3 attempts per quiz per hour to prevent LLM cost abuse.
takingRouter.post(
  '/:id/regrade',
  auth,
  regradeRateLimiter,
  validate({ params: quizParamsSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const { id } = req.params as unknown as QuizParams;

    // Phase 1: pre-stream check (ownership, status must be submitted_ungraded)
    const context = await quizService.prepareRegrade(id, req.user.userId);

    // Phase 2: open SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let clientConnected = true;
    req.on('close', () => {
      clientConnected = false;
      logger.info({ quizAttemptId: id }, 'SSE client disconnected during regrade');
    });

    const writer = (event: { type: string; data?: unknown; message?: string }) => {
      if (clientConnected) sendSSEEvent(res, event);
    };

    // Phase 3: stream grading — executeGrading never throws
    await quizService.executeGrading(context, writer);

    res.end();
  }),
);

export { router as quizRouter, takingRouter as quizTakingRouter };
