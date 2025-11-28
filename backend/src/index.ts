import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import apiRouter from './api';
import { config } from './config';

// Ensure data directories exist
const dirs = [config.dataDir, config.uploadsDir, config.outputsDir, config.jobsDir];
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Serve static files from outputs directory for downloads
app.use('/outputs', express.static(config.outputsDir));

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);

  if (err.message.includes('Unsupported file type')) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err.message.includes('File too large')) {
    res.status(413).json({ error: 'File too large' });
    return;
  }

  res.status(500).json({
    error: config.nodeEnv === 'development' ? err.message : 'Internal server error',
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const port = config.port;

app.listen(port, () => {
  console.info(`\n🎬 SeasonSummarizer Backend`);
  console.info(`   Server running on http://localhost:${port}`);
  console.info(`   Environment: ${config.nodeEnv}`);
  console.info(`\n   API Endpoints:`);
  console.info(`   - GET  /api/health          - Check service status`);
  console.info(`   - GET  /api/jobs            - List all jobs`);
  console.info(`   - POST /api/jobs            - Create new job`);
  console.info(`   - GET  /api/jobs/:id        - Get job details`);
  console.info(`   - POST /api/jobs/:id/start  - Start processing`);
  console.info(`   - POST /api/upload/:id/srt  - Upload SRT files`);
  console.info(`   - POST /api/upload/:id/video - Upload video files`);
  console.info(`\n`);
});

export default app;
