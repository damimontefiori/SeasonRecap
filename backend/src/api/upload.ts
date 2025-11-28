import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { jobStore } from '../jobs';
import { extractEpisodeIdFromFilename } from '../subtitles';
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
 * Configure multer storage
 */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const jobId = req.params.jobId;
    if (!jobId) {
      cb(new Error('Job ID required'), '');
      return;
    }
    const uploadDir = path.join(config.uploadsDir, jobId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Preserve original filename with timestamp prefix to avoid collisions
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize,
  },
  fileFilter: (_req, file, cb) => {
    // Accept video files and SRT files
    const ext = path.extname(file.originalname).toLowerCase();
    const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
    const isSrt = ext === '.srt';

    if (isVideo || isSrt) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

/**
 * POST /api/upload/:jobId/srt
 * Upload SRT files for a job
 */
router.post(
  '/:jobId/srt',
  upload.array('files', 100), // Allow up to 100 files
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = req.params.jobId ?? '';
    const job = await jobStore.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status !== 'pending') {
      res.status(400).json({ error: 'Cannot upload files after job has started' });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const uploadedFiles = files.map((file) => ({
      originalName: file.originalname,
      storedName: file.filename,
      path: file.path,
      size: file.size,
      episodeId: extractEpisodeIdFromFilename(file.originalname) ?? undefined,
    }));

    await jobStore.addFiles(jobId, uploadedFiles, 'srt');

    res.json({
      message: `${files.length} SRT file(s) uploaded`,
      files: uploadedFiles.map((f) => ({
        name: f.originalName,
        episodeId: f.episodeId,
        size: f.size,
      })),
    });
  })
);

/**
 * POST /api/upload/:jobId/video
 * Upload video files for a job
 */
router.post(
  '/:jobId/video',
  upload.array('files', 100),
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = req.params.jobId ?? '';
    const job = await jobStore.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status !== 'pending') {
      res.status(400).json({ error: 'Cannot upload files after job has started' });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const uploadedFiles = files.map((file) => ({
      originalName: file.originalname,
      storedName: file.filename,
      path: file.path,
      size: file.size,
      episodeId: extractEpisodeIdFromFilename(file.originalname) ?? undefined,
    }));

    await jobStore.addFiles(jobId, uploadedFiles, 'video');

    res.json({
      message: `${files.length} video file(s) uploaded`,
      files: uploadedFiles.map((f) => ({
        name: f.originalName,
        episodeId: f.episodeId,
        size: f.size,
      })),
    });
  })
);

/**
 * GET /api/upload/:jobId/files
 * List uploaded files for a job
 */
router.get(
  '/:jobId/files',
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = req.params.jobId ?? '';
    const job = await jobStore.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      srtFiles: job.srtFiles.map((f) => ({
        name: f.originalName,
        episodeId: f.episodeId,
        size: f.size,
      })),
      videoFiles: job.videoFiles.map((f) => ({
        name: f.originalName,
        episodeId: f.episodeId,
        size: f.size,
      })),
    });
  })
);

export default router;
