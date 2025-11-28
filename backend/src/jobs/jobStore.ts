import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Job, JobConfig, JobStatus, CreateJobRequest, JobListItem, UploadedFile } from './types';
import { config } from '../config';

/**
 * Simple file-based job store
 */
export class JobStore {
  private jobsDir: string;

  constructor(jobsDir?: string) {
    this.jobsDir = jobsDir ?? config.jobsDir;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.jobsDir)) {
      fs.mkdirSync(this.jobsDir, { recursive: true });
    }
  }

  private getJobPath(jobId: string): string {
    return path.join(this.jobsDir, `${jobId}.json`);
  }

  /**
   * Creates a new job
   */
  async create(request: CreateJobRequest): Promise<Job> {
    const jobId = uuidv4();
    const now = new Date();

    const job: Job = {
      id: jobId,
      config: request.config,
      status: 'pending',
      progress: {
        stage: 'pending',
        stageProgress: 0,
        currentStep: 'Waiting to start',
        completedStages: [],
        errors: [],
        logs: [],
      },
      srtFiles: [],
      videoFiles: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.save(job);

    // Create upload and output directories for this job
    const uploadDir = path.join(config.uploadsDir, jobId);
    const outputDir = path.join(config.outputsDir, jobId);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return job;
  }

  /**
   * Gets a job by ID
   */
  async get(jobId: string): Promise<Job | null> {
    const jobPath = this.getJobPath(jobId);

    if (!fs.existsSync(jobPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(jobPath, 'utf-8');
      const job = JSON.parse(content) as Job;

      // Convert date strings back to Date objects
      job.createdAt = new Date(job.createdAt);
      job.updatedAt = new Date(job.updatedAt);
      if (job.completedAt) {
        job.completedAt = new Date(job.completedAt);
      }
      if (job.progress.startedAt) {
        job.progress.startedAt = new Date(job.progress.startedAt);
      }

      return job;
    } catch (error) {
      console.error(`Failed to read job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Saves a job
   */
  async save(job: Job): Promise<void> {
    job.updatedAt = new Date();
    const jobPath = this.getJobPath(job.id);
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8');
  }

  /**
   * Updates job status and progress
   */
  async updateStatus(
    jobId: string,
    status: JobStatus,
    currentStep: string,
    stageProgress: number = 0
  ): Promise<void> {
    const job = await this.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Mark previous stage as completed if moving to a new stage
    if (job.status !== status && job.status !== 'pending' && job.status !== 'failed') {
      job.progress.completedStages.push(job.status);
    }

    job.status = status;
    job.progress.stage = status;
    job.progress.stageProgress = stageProgress;
    job.progress.currentStep = currentStep;

    if (status === 'completed') {
      job.completedAt = new Date();
    }

    await this.save(job);
  }

  /**
   * Updates stage progress within current status
   */
  async updateProgress(jobId: string, currentStep: string, stageProgress: number): Promise<void> {
    const job = await this.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.progress.currentStep = currentStep;
    job.progress.stageProgress = stageProgress;

    await this.save(job);
  }

  /**
   * Sets job as failed with error message
   */
  async setFailed(jobId: string, error: string): Promise<void> {
    const job = await this.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = 'failed';
    job.progress.stage = 'failed';
    job.progress.errors.push(error);
    job.error = error;
    job.completedAt = new Date();
    
    await this.addLog(jobId, 'error', `Pipeline failed: ${error}`);
    await this.save(job);
  }

  /**
   * Adds a log entry to a job
   */
  async addLog(
    jobId: string,
    level: 'info' | 'warn' | 'error' | 'success',
    message: string,
    stage?: JobStatus
  ): Promise<void> {
    const job = await this.get(jobId);
    if (!job) {
      return; // Silently fail for logging
    }

    // Initialize logs if not present (for backwards compatibility)
    if (!job.progress.logs) {
      job.progress.logs = [];
    }

    job.progress.logs.push({
      timestamp: new Date(),
      level,
      message,
      stage: stage ?? job.status,
    });

    // Keep only last 100 logs to prevent bloat
    if (job.progress.logs.length > 100) {
      job.progress.logs = job.progress.logs.slice(-100);
    }

    await this.save(job);
  }

  /**
   * Adds uploaded files to a job
   */
  async addFiles(
    jobId: string,
    files: UploadedFile[],
    type: 'srt' | 'video'
  ): Promise<void> {
    const job = await this.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (type === 'srt') {
      job.srtFiles.push(...files);
    } else {
      job.videoFiles.push(...files);
    }

    await this.save(job);
  }

  /**
   * Lists all jobs
   */
  async list(): Promise<JobListItem[]> {
    this.ensureDirectory();
    const files = fs.readdirSync(this.jobsDir).filter((f) => f.endsWith('.json'));

    const jobs: JobListItem[] = [];

    for (const file of files) {
      const jobId = file.replace('.json', '');
      const job = await this.get(jobId);

      if (job) {
        const completedStagesCount = job.progress.completedStages.length;
        const totalStages = job.config.mode === 'A' ? 7 : 9;
        const progress =
          job.status === 'completed'
            ? 100
            : job.status === 'failed'
              ? 0
              : Math.round((completedStagesCount / totalStages) * 100);

        jobs.push({
          id: job.id,
          seriesName: job.config.seriesName,
          season: job.config.season,
          mode: job.config.mode,
          status: job.status,
          createdAt: job.createdAt,
          progress,
        });
      }
    }

    // Sort by creation date, newest first
    return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Deletes a job and its files
   */
  async delete(jobId: string): Promise<boolean> {
    const jobPath = this.getJobPath(jobId);

    if (!fs.existsSync(jobPath)) {
      return false;
    }

    // Delete job file
    fs.unlinkSync(jobPath);

    // Delete upload directory
    const uploadDir = path.join(config.uploadsDir, jobId);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true });
    }

    // Delete output directory
    const outputDir = path.join(config.outputsDir, jobId);
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }

    return true;
  }

  /**
   * Gets the upload directory for a job
   */
  getUploadDir(jobId: string): string {
    return path.join(config.uploadsDir, jobId);
  }

  /**
   * Gets the output directory for a job
   */
  getOutputDir(jobId: string): string {
    return path.join(config.outputsDir, jobId);
  }
}

// Singleton instance
export const jobStore = new JobStore();
