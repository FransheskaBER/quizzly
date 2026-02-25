/* TEST ONLY: These routes are mounted only when NODE_ENV=test. */

import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.middleware.js';
import * as authService from '../services/auth.service.js';
import { resendVerificationSchema } from '@skills-trainer/shared';

const router = Router();

router.post(
  '/verify-email',
  validate({ body: resendVerificationSchema }),
  asyncHandler(async (req, res) => {
    await authService.verifyEmailByAddress(req.body.email);
    res.status(200).json({ message: 'Email verified (test only)' });
  }),
);

export { router as testRouter };
