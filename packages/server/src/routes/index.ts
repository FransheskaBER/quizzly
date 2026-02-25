import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { sessionRouter } from './session.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { materialRouter } from './material.routes.js';
import { quizRouter, quizTakingRouter } from './quiz.routes.js';
import { testRouter } from './test.routes.js';

const router = Router();

if (process.env.NODE_ENV === 'test') {
  router.use('/test', testRouter);
}
router.use(healthRouter);
router.use('/auth', authRouter);
router.use('/sessions', sessionRouter);
router.use('/sessions', materialRouter);
router.use('/sessions', quizRouter);
router.use('/quizzes', quizTakingRouter);
router.use('/dashboard', dashboardRouter);

export { router as apiRouter };
