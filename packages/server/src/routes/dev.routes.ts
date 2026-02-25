/* DEVELOPMENT ONLY: Mounted when NODE_ENV=development. Not available in production. */

import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.middleware.js';
import { hashPassword } from '../utils/password.utils.js';
import { prisma } from '../config/database.js';
import { resendVerificationSchema } from '@skills-trainer/shared';
import { PASSWORD_MIN_LENGTH } from '@skills-trainer/shared';
import * as authService from '../services/auth.service.js';
import { NotFoundError } from '../utils/errors.js';

const router = Router();

const setPasswordSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

router.post(
  '/verify-email',
  validate({ body: resendVerificationSchema }),
  asyncHandler(async (req, res) => {
    await authService.verifyEmailByAddress(req.body.email);
    res.status(200).json({ message: 'Email verified (development only)' });
  }),
);

router.post(
  '/set-password',
  validate({ body: setPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    res.status(200).json({ message: 'Password set (development only). You can now sign in.' });
  }),
);

export { router as devRouter };
