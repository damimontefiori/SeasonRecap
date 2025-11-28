import { Router } from 'express';
import jobsRouter from './jobs';
import uploadRouter from './upload';
import healthRouter from './health';

const router = Router();

router.use('/jobs', jobsRouter);
router.use('/upload', uploadRouter);
router.use('/health', healthRouter);

export default router;
