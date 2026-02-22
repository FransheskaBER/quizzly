import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { sessionRouter } from './session.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { materialRouter } from './material.routes.js';

const router = Router();

router.use(healthRouter);
router.use('/auth', authRouter);
router.use('/sessions', sessionRouter);
router.use('/sessions', materialRouter);
router.use('/dashboard', dashboardRouter);

export { router as apiRouter };
