import { saveApiKeySchema } from '@skills-trainer/shared';
import type { SaveApiKeyRequest } from '@skills-trainer/shared';

import { Router } from 'express';

import { auth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { UnauthorizedError } from '../utils/errors.js';
import * as userService from '../services/user.service.js';

const router = Router();

// GET /api/users/api-key/status
router.get(
  '/api-key/status',
  auth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await userService.getApiKeyStatus(req.user.userId);
    res.status(200).json(result);
  }),
);

// POST /api/users/api-key
router.post(
  '/api-key',
  auth,
  validate({ body: saveApiKeySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const { apiKey } = req.body as SaveApiKeyRequest;
    const result = await userService.saveApiKey(req.user.userId, apiKey);
    res.status(200).json(result);
  }),
);

// DELETE /api/users/api-key
router.delete(
  '/api-key',
  auth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    await userService.deleteApiKey(req.user.userId);
    res.status(204).send();
  }),
);


export { router as userRouter };
