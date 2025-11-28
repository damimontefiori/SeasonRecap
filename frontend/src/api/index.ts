import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export type SummaryMode = 'A' | 'B';
export type TargetLength = 'short' | 'medium' | 'long';
export type LLMProvider = 'openai' | 'anthropic';
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

export interface JobConfig {
  seriesName: string;
  season: number;
  language: string;
  mode: SummaryMode;
  targetLength: TargetLength | number;
  llmProvider: LLMProvider;
}

export interface JobProgress {
  stage: JobStatus;
  stageProgress: number;
  currentStep: string;
  completedStages: JobStatus[];
  errors: string[];
}

export interface UploadedFile {
  name: string;
  episodeId?: string;
  size: number;
}

export interface Job {
  id: string;
  config: JobConfig;
  status: JobStatus;
  progress: JobProgress;
  srtFiles: UploadedFile[];
  videoFiles: UploadedFile[];
  outputs?: {
    videoPath?: string;
    srtPath?: string;
    narrativeSrtPath?: string;
    audioPath?: string;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface JobListItem {
  id: string;
  seriesName: string;
  season: number;
  mode: SummaryMode;
  status: JobStatus;
  createdAt: string;
  progress: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded';
  services: {
    ffmpeg: { available: boolean; version: string | null };
    llm: { openai: boolean; anthropic: boolean };
    tts: { configured: boolean; region: string | null; voice: string | null };
  };
  config: {
    targetDurations: { short: number; medium: number; long: number };
  };
}

// API functions
export async function getHealth(): Promise<HealthStatus> {
  const response = await api.get<HealthStatus>('/health');
  return response.data;
}

export async function listJobs(): Promise<JobListItem[]> {
  const response = await api.get<{ jobs: JobListItem[] }>('/jobs');
  return response.data.jobs;
}

export async function getJob(id: string): Promise<{ job: Job; overallProgress: number }> {
  const response = await api.get<{ job: Job; overallProgress: number }>(`/jobs/${id}`);
  return response.data;
}

export async function createJob(config: JobConfig): Promise<Job> {
  const response = await api.post<{ job: Job }>('/jobs', { config });
  return response.data.job;
}

export async function startJob(id: string): Promise<void> {
  await api.post(`/jobs/${id}/start`);
}

export async function deleteJob(id: string): Promise<void> {
  await api.delete(`/jobs/${id}`);
}

export async function uploadSrtFiles(
  jobId: string,
  files: FileList
): Promise<{ files: UploadedFile[] }> {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  const response = await api.post<{ files: UploadedFile[] }>(`/upload/${jobId}/srt`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function uploadVideoFiles(
  jobId: string,
  files: FileList
): Promise<{ files: UploadedFile[] }> {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  const response = await api.post<{ files: UploadedFile[] }>(`/upload/${jobId}/video`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getUploadedFiles(
  jobId: string
): Promise<{ srtFiles: UploadedFile[]; videoFiles: UploadedFile[] }> {
  const response = await api.get<{ srtFiles: UploadedFile[]; videoFiles: UploadedFile[] }>(
    `/upload/${jobId}/files`
  );
  return response.data;
}

export function getDownloadUrl(jobId: string, type: 'video' | 'srt' | 'narrative-srt' | 'audio'): string {
  return `/api/jobs/${jobId}/download/${type}`;
}
