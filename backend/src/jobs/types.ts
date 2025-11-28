import { LLMProviderType, TargetLength, SummaryMode, KeyMoment } from '../llm/types';

/**
 * Possible job status values
 */
export type JobStatus =
  | 'pending'
  | 'validating'
  | 'parsing'
  | 'analyzing'
  | 'generating_clips'
  | 'processing_video'
  | 'generating_srt'
  | 'generating_tts'
  | 'mixing_audio'
  | 'completed'
  | 'failed';

/**
 * Detailed progress information for a job
 */
export interface JobProgress {
  stage: JobStatus;
  stageProgress: number; // 0-100
  currentStep: string;
  startedAt?: Date;
  completedStages: JobStatus[];
  errors: string[];
}

/**
 * Job configuration input
 */
export interface JobConfig {
  seriesName: string;
  season: number;
  language: string;
  mode: SummaryMode;
  targetLength: TargetLength | number; // 'short' | 'medium' | 'long' or minutes
  llmProvider: LLMProviderType;
}

/**
 * File reference for uploaded files
 */
export interface UploadedFile {
  originalName: string;
  storedName: string;
  path: string;
  size: number;
  episodeId?: string;
}

/**
 * Complete job definition
 */
export interface Job {
  id: string;
  config: JobConfig;
  status: JobStatus;
  progress: JobProgress;

  // Files
  srtFiles: UploadedFile[];
  videoFiles: UploadedFile[];

  // Processing results
  keyMoments?: KeyMoment[];
  narrativeOutline?: {
    intro: string;
    development: string;
    climax: string;
    resolution: string;
  };
  narrative?: string;

  // Output paths (relative to outputs dir)
  outputs?: {
    videoPath?: string;
    srtPath?: string;
    narrativeSrtPath?: string;
    audioPath?: string;
    clipsJsonPath?: string;
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Job creation request
 */
export interface CreateJobRequest {
  config: JobConfig;
}

/**
 * Job list response
 */
export interface JobListItem {
  id: string;
  seriesName: string;
  season: number;
  mode: SummaryMode;
  status: JobStatus;
  createdAt: Date;
  progress: number; // 0-100 overall
}

/**
 * Clip definition for video processing
 */
export interface ClipSpec {
  episodeId: string;
  videoPath: string;
  startTime: number;
  endTime: number;
  order: number;
  moment?: KeyMoment;
}

/**
 * Converts target length specification to minutes
 */
export function targetLengthToMinutes(
  targetLength: TargetLength | number,
  defaults: { short: number; medium: number; long: number }
): number {
  if (typeof targetLength === 'number') {
    return targetLength;
  }

  switch (targetLength) {
    case 'short':
      return defaults.short;
    case 'medium':
      return defaults.medium;
    case 'long':
      return defaults.long;
    default:
      return defaults.medium;
  }
}

/**
 * Calculates overall progress percentage from job status
 */
export function calculateOverallProgress(job: Job): number {
  const stages: JobStatus[] = [
    'pending',
    'validating',
    'parsing',
    'analyzing',
    'generating_clips',
    'processing_video',
    'generating_srt',
    'generating_tts',
    'mixing_audio',
    'completed',
  ];

  // Mode A doesn't have TTS stages
  const relevantStages =
    job.config.mode === 'A'
      ? stages.filter((s) => s !== 'generating_tts' && s !== 'mixing_audio')
      : stages;

  const currentIndex = relevantStages.indexOf(job.status);
  if (currentIndex === -1) return 0;
  if (job.status === 'failed') return job.progress.stageProgress;
  if (job.status === 'completed') return 100;

  const stageWeight = 100 / (relevantStages.length - 1); // -1 for completed
  const baseProgress = currentIndex * stageWeight;
  const stageProgress = (job.progress.stageProgress / 100) * stageWeight;

  return Math.min(99, Math.round(baseProgress + stageProgress));
}
