import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import pino from 'pino';

import { Sentry } from '../config/sentry.js';
import { AppError } from '../utils/errors.js';

const logger = pino({ name: 'error-handler' });

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  // 4xx — expected business errors. Do not report to Sentry.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 400 — validation errors. Do not report to Sentry.
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // Known Prisma errors that map to 4xx — do not report to Sentry.
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'A record with this value already exists',
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Record not found',
        },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Related record not found',
        },
      });
      return;
    }
  }

  // 5xx — unexpected error. Log and report to Sentry with request context.
  const requestId = req.requestId;
  const userId = req.user?.userId;

  logger.error({ err, requestId, userId }, 'Unhandled error');

  Sentry.captureException(err, {
    extra: {
      requestId,
      userId,
      method: req.method,
      path: req.path,
    },
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
