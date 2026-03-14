import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import pino from 'pino';

import { Sentry } from '../config/sentry.js';
import {
  AppError,
  UnauthorizedError,
  EmailNotVerifiedError,
  ValidationError,
  ConflictError,
  BadRequestError,
} from '../utils/errors.js';

const logger = pino({ name: 'error-handler' });

const isAuthRoute = (routePath: string): boolean =>
  routePath.startsWith('/api/auth/');

const isExpectedAuthError = (err: AppError, routePath: string): boolean => {
  // Failed login attempt (wrong email/password)
  if (err instanceof UnauthorizedError && err.message === 'Invalid email or password' && routePath === '/api/auth/login') return true;
  // Unauthenticated session check
  if (err instanceof UnauthorizedError && err.message === 'Missing or invalid token' && routePath === '/api/auth/me') return true;
  // Expired/invalid refresh token
  if (err instanceof UnauthorizedError && isAuthRoute(routePath) && routePath.includes('/refresh')) return true;
  // Email not verified
  if (err instanceof EmailNotVerifiedError) return true;
  // Validation errors on auth routes
  if (err instanceof ValidationError && isAuthRoute(routePath)) return true;
  // Duplicate email on signup
  if (err instanceof ConflictError && routePath === '/api/auth/signup') return true;
  // Bad request on auth routes (invalid/expired verification/reset links)
  if (err instanceof BadRequestError && isAuthRoute(routePath)) return true;

  return false;
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  const requestId = req.requestId;
  const userId = req.user?.userId;
  const requestContext = {
    requestId,
    userId,
    method: req.method,
    path: req.path,
  };

  // 4xx — expected business errors.
  if (err instanceof AppError) {
    logger.warn({ err, ...requestContext }, 'Handled application error');
    const routePath = req.originalUrl?.split('?')[0] ?? req.path;
    if (!isExpectedAuthError(err, routePath)) {
      Sentry.captureException(err, {
        extra: {
          ...requestContext,
          operation: 'error.middleware.appError',
        },
      });
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 400 — validation errors.
  if (err instanceof ZodError) {
    logger.warn({ err, ...requestContext }, 'Handled validation error');
    const routePath = req.originalUrl?.split('?')[0] ?? req.path;
    if (!isAuthRoute(routePath)) {
      Sentry.captureException(err, {
        extra: {
          ...requestContext,
          operation: 'error.middleware.validationError',
        },
      });
    }
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

  // Known Prisma errors that map to 4xx.
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      logger.warn({ err, ...requestContext }, 'Handled Prisma request error');
      Sentry.captureException(err, {
        extra: {
          ...requestContext,
          operation: 'error.middleware.prismaKnownError',
          prismaCode: err.code,
        },
      });
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'A record with this value already exists',
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      logger.warn({ err, ...requestContext }, 'Handled Prisma request error');
      Sentry.captureException(err, {
        extra: {
          ...requestContext,
          operation: 'error.middleware.prismaKnownError',
          prismaCode: err.code,
        },
      });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Record not found',
        },
      });
      return;
    }
    if (err.code === 'P2003') {
      logger.warn({ err, ...requestContext }, 'Handled Prisma request error');
      Sentry.captureException(err, {
        extra: {
          ...requestContext,
          operation: 'error.middleware.prismaKnownError',
          prismaCode: err.code,
        },
      });
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
  logger.error({ err, ...requestContext }, 'Unhandled error');

  Sentry.captureException(err, {
    extra: {
      ...requestContext,
      operation: 'error.middleware.unhandled',
    },
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
