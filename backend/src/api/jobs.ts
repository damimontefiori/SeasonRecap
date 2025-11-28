import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { jobStore } from '../jobs';
import { summaryPipeline } from '../pipelines';
import { calculateOverallProgress, CreateJobRequest, Job } from '../jobs/types';
import { config } from '../config';

const router = Router();

/**
 * Error handler wrapper
 */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * GET /api/jobs
 * List all jobs
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const jobs = await jobStore.list();
    res.json({ jobs });
  })
);

/**
 * POST /api/jobs
 * Create a new job
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateJobRequest;

    // Validate required fields
    if (!body.config) {
      res.status(400).json({ error: 'Missing config' });
      return;
    }

    const { seriesName, season, language, mode, targetLength, llmProvider } = body.config;

    if (!seriesName || !season || !language || !mode || !targetLength || !llmProvider) {
      res.status(400).json({
        error: 'Missing required config fields',
        required: ['seriesName', 'season', 'language', 'mode', 'targetLength', 'llmProvider'],
      });
      return;
    }

    if (!['A', 'B'].includes(mode)) {
      res.status(400).json({ error: 'Mode must be A or B' });
      return;
    }

    if (!['openai', 'anthropic'].includes(llmProvider)) {
      res.status(400).json({ error: 'llmProvider must be openai or anthropic' });
      return;
    }

    const job = await jobStore.create(body);
    res.status(201).json({ job });
  })
);

/**
 * GET /api/jobs/:id
 * Get job details
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await jobStore.get(req.params.id ?? '');

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const overallProgress = calculateOverallProgress(job);
    res.json({ job, overallProgress });
  })
);

/**
 * POST /api/jobs/:id/start
 * Start processing a job
 */
router.post(
  '/:id/start',
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = req.params.id ?? '';
    const job = await jobStore.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status !== 'pending') {
      res.status(400).json({ error: 'Job has already been started' });
      return;
    }

    // Start pipeline in background
    summaryPipeline.run(jobId).catch((error) => {
      console.error(`Pipeline failed for job ${jobId}:`, error);
    });

    res.json({ message: 'Job started', jobId });
  })
);

/**
 * DELETE /api/jobs/:id
 * Delete a job
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await jobStore.delete(req.params.id ?? '');

    if (!deleted) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ message: 'Job deleted' });
  })
);

/**
 * GET /api/jobs/:id/download/:type
 * Download job outputs
 */
router.get(
  '/:id/download/:type',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await jobStore.get(req.params.id ?? '');

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status !== 'completed') {
      res.status(400).json({ error: 'Job not completed' });
      return;
    }

    const type = req.params.type as 'video' | 'srt' | 'narrative-srt' | 'audio' | 'clips';
    let filePath: string | undefined;
    let fileName: string;

    switch (type) {
      case 'video':
        filePath = job.outputs?.videoPath;
        fileName = `${job.config.seriesName}_S${job.config.season}_summary.mp4`;
        break;
      case 'srt':
        filePath = job.outputs?.srtPath;
        fileName = `${job.config.seriesName}_S${job.config.season}_summary.srt`;
        break;
      case 'narrative-srt':
        filePath = job.outputs?.narrativeSrtPath;
        fileName = `${job.config.seriesName}_S${job.config.season}_summary_narrative.srt`;
        break;
      case 'audio':
        filePath = job.outputs?.audioPath;
        fileName = `${job.config.seriesName}_S${job.config.season}_narrative.mp3`;
        break;
      case 'clips':
        filePath = job.outputs?.clipsJsonPath;
        fileName = 'clips.json';
        break;
      default:
        res.status(400).json({ error: 'Invalid download type' });
        return;
    }

    if (!filePath) {
      res.status(404).json({ error: `${type} not available for this job` });
      return;
    }

    const fullPath = path.join(config.outputsDir, filePath);

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.download(fullPath, fileName);
  })
);

export default router;
