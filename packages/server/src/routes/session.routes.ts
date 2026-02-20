import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';
import { auth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as sessionService from '../services/session.service.js';
import {
  createSessionSchema,
  updateSessionSchema,
  sessionParamsSchema,
  paginationSchema,
} from '@skills-trainer/shared';
import { UnauthorizedError } from '../utils/errors.js';
import type { PaginationParams } from '@skills-trainer/shared';

const router = Router();

// POST /api/sessions — create a new session
router.post(
  '/',
  auth,
  validate({ body: createSessionSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await sessionService.createSession(req.body, req.user.userId);
    res.status(201).json(result);
  }),
);

// GET /api/sessions — list sessions (cursor-based pagination)
router.get(
  '/',
  auth,
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const params = req.query as unknown as PaginationParams;
    const result = await sessionService.listSessions(params, req.user.userId);
    res.status(200).json(result);
  }),
);

// GET /api/sessions/:id — get session detail
router.get(
  '/:id',
  auth,
  validate({ params: sessionParamsSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await sessionService.getSession(req.params.id as string, req.user.userId);
    res.status(200).json(result);
  }),
);

// PATCH /api/sessions/:id — update session
router.patch(
  '/:id',
  auth,
  validate({ params: sessionParamsSchema, body: updateSessionSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await sessionService.updateSession(req.params.id as string, req.body, req.user.userId);
    res.status(200).json(result);
  }),
);

// DELETE /api/sessions/:id — delete session
router.delete(
  '/:id',
  auth,
  validate({ params: sessionParamsSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    await sessionService.deleteSession(req.params.id as string, req.user.userId);
    res.status(204).send();
  }),
);

export { router as sessionRouter };
