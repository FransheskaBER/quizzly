import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { sessionRouter } from './session.routes.js';

const router = Router();

router.use(healthRouter);
router.use('/auth', authRouter);
router.use('/sessions', sessionRouter);

export { router as apiRouter };
