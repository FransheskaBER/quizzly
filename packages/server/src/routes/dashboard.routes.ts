import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';
import { auth } from '../middleware/auth.middleware.js';
import * as dashboardService from '../services/dashboard.service.js';
import { UnauthorizedError } from '../utils/errors.js';

const router = Router();

// GET /api/dashboard — aggregated stats for the authenticated user
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await dashboardService.getDashboardStats(req.user.userId);
    res.status(200).json(result);
  }),
);

export { router as dashboardRouter };
