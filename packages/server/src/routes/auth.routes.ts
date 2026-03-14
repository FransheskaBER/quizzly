import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';
import { auth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createRateLimiter,
  createRateLimiterByEmailAndIp,
} from '../middleware/rateLimiter.middleware.js';
import * as authService from '../services/auth.service.js';
import {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@skills-trainer/shared';
import { UnauthorizedError } from '../utils/errors.js';
import {
  setSessionCookie,
  clearSessionCookie,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshCookieName,
} from '../utils/cookie.utils.js';

const router = Router();

const signupLimiter = createRateLimiter(
  60 * 60 * 1000,
  process.env.NODE_ENV === 'test' ? 100 : 5,
); // 5/IP/hr prod; 100 in test for E2E
const loginLimiter = createRateLimiter(15 * 60 * 1000, 10);     // 10/IP/15min
const resendLimiter = createRateLimiterByEmailAndIp(60 * 60 * 1000, 20, 3);   // 20/IP/hr, 3/email/hr
const forgotLimiter = createRateLimiterByEmailAndIp(60 * 60 * 1000, 20, 3);   // 20/IP/hr, 3/email/hr

router.post(
  '/signup',
  signupLimiter,
  validate({ body: signupSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  }),
);

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, ...result } = await authService.login(req.body);
    setSessionCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);
    res.status(200).json(result);
  }),
);

router.post(
  '/logout',
  auth,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.userId);
    clearSessionCookie(res);
    clearRefreshCookie(res);
    res.status(200).json({ message: 'Logged out' });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const oldRefreshToken = req.cookies?.[getRefreshCookieName()] as string | undefined;
    if (!oldRefreshToken) {
      clearSessionCookie(res);
      clearRefreshCookie(res);
      throw new UnauthorizedError('Missing refresh token');
    }
    try {
      const { accessToken, refreshToken } = await authService.refreshAccessToken(oldRefreshToken);
      setSessionCookie(res, accessToken);
      setRefreshCookie(res, refreshToken);
      res.status(200).json({ message: 'Token refreshed' });
    } catch (err) {
      clearSessionCookie(res);
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

router.post(
  '/verify-email',
  validate({ body: verifyEmailSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.verifyEmail(req.body);
    res.status(200).json(result);
  }),
);

router.post(
  '/resend-verification',
  validate({ body: resendVerificationSchema }),
  resendLimiter,
  asyncHandler(async (req, res) => {
    const result = await authService.resendVerification(req.body);
    res.status(200).json(result);
  }),
);

router.post(
  '/forgot-password',
  validate({ body: forgotPasswordSchema }),
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body);
    res.status(200).json(result);
  }),
);

router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body);
    res.status(200).json(result);
  }),
);

router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    // req.user is guaranteed by auth middleware — guard satisfies TypeScript
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }
    const result = await authService.getMe(req.user.userId);
    res.status(200).json(result);
  }),
);

export { router as authRouter };
