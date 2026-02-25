import {
  RATE_LIMIT_QUIZ_GENERATION_PER_HOUR,
  RATE_LIMIT_QUIZ_GENERATION_PER_DAY,
  RATE_LIMIT_REGRADE_PER_HOUR,
} from '@skills-trainer/shared';

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

export const createRateLimiter = (windowMs: number, max: number) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
      },
    },
  });
};

/** Rate limiter keyed by email from req.body. Use after validate() so body is parsed. */
export const createRateLimiterByEmail = (
  windowMs: number,
  max: number,
  fallbackMessage = 'Too many requests, please try again later',
) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator: (req: Request) => {
      const email = (req.body as { email?: string })?.email;
      return typeof email === 'string' && email.length > 0
        ? `email:${email.toLowerCase()}`
        : (req.ip ?? 'unknown');
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: fallbackMessage },
    },
  });

export const globalRateLimiter = createRateLimiter(60 * 1000, 100);

// Per-authenticated-user rate limiters for quiz generation.
// Auth middleware must run before these so req.user is populated.
const quizGenKeyGenerator = (req: Request): string =>
  req.user?.userId ?? req.socket.remoteAddress ?? 'unknown';

export const quizGenerationHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: RATE_LIMIT_QUIZ_GENERATION_PER_HOUR,
  keyGenerator: quizGenKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: `Quiz generation limit reached. You can generate up to ${RATE_LIMIT_QUIZ_GENERATION_PER_HOUR} quizzes per hour.`,
    },
  },
});

export const quizGenerationDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: RATE_LIMIT_QUIZ_GENERATION_PER_DAY,
  keyGenerator: quizGenKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: `Daily quiz generation limit reached. You can generate up to ${RATE_LIMIT_QUIZ_GENERATION_PER_DAY} quizzes per day.`,
    },
  },
});

// Per-quiz-per-user rate limiter for regrade.
// Keyed on both quiz ID and user ID so an authenticated attacker cannot
// exhaust another user's regrade budget by sending requests with a known
// quiz ID. Auth middleware must run before this limiter so req.user is set.
const regradeKeyGenerator = (req: Request): string =>
  `regrade:${req.params.id ?? 'unknown'}:${req.user?.userId ?? 'unknown'}`;

export const regradeRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: RATE_LIMIT_REGRADE_PER_HOUR,
  keyGenerator: regradeKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: `Regrade limit reached. You can regrade up to ${RATE_LIMIT_REGRADE_PER_HOUR} times per hour.`,
    },
  },
});
