import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getJob, startJob, getDownloadUrl, Job, JobStatus } from '../api';
import './JobDetails.css';

const STAGE_LABELS: Record<JobStatus, string> = {
  pending: 'Pending',
  validating: 'Validating files',
  parsing: 'Parsing subtitles',
  analyzing: 'Analyzing with AI',
  generating_clips: 'Generating clip list',
  processing_video: 'Processing video',
  generating_srt: 'Generating subtitles',
  generating_tts: 'Generating voiceover',
  mixing_audio: 'Mixing audio',
  completed: 'Completed',
  failed: 'Failed',
};

const STAGE_ORDER: JobStatus[] = [
  'validating',
  'parsing',
  'analyzing',
  'generating_clips',
  'processing_video',
  'generating_srt',
  'generating_tts',
  'mixing_audio',
];

function getStageIcon(
  stage: JobStatus,
  currentStage: JobStatus,
  completedStages: JobStatus[]
): string {
  if (completedStages.includes(stage)) return '✅';
  if (stage === currentStage) return '⏳';
  if (currentStage === 'failed') return '❌';
  return '⏹️';
}

export function JobDetails() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = async () => {
    if (!id) return;

    try {
      const data = await getJob(id);
      setJob(data.job);
      setOverallProgress(data.overallProgress);
      setError(null);
    } catch (err) {
      setError('Failed to load job details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJob();

    // Poll for updates if job is in progress
    const interval = setInterval(() => {
      if (job && job.status !== 'completed' && job.status !== 'failed') {
        fetchJob();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, job?.status]);

  const handleStart = async () => {
    if (!id) return;

    try {
      await startJob(id);
      fetchJob();
    } catch (err) {
      setError('Failed to start job');
      console.error(err);
    }
  };

  if (loading) {
    return <div className="loading">Loading job details...</div>;
  }

  if (error || !job) {
    return (
      <div className="job-details-page">
        <div className="error-message">{error || 'Job not found'}</div>
        <Link to="/" className="btn btn-secondary">
          Back to Jobs
        </Link>
      </div>
    );
  }

  const relevantStages = job.config.mode === 'A'
    ? STAGE_ORDER.filter((s) => s !== 'generating_tts' && s !== 'mixing_audio')
    : STAGE_ORDER;

  return (
    <div className="job-details-page">
      <div className="job-header">
        <div>
          <Link to="/" className="back-link">
            ← Back to Jobs
          </Link>
          <h1 className="page-title">
            {job.config.seriesName} - Season {job.config.season}
          </h1>
        </div>
        <span className={`status-badge status-${job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : job.status === 'pending' ? 'pending' : 'processing'}`}>
          {STAGE_LABELS[job.status]}
        </span>
      </div>

      {/* Job Info */}
      <div className="card job-info">
        <h2>Configuration</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Mode</span>
            <span className="info-value">
              {job.config.mode === 'A' ? 'Original subtitles' : 'AI voiceover'}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Target Length</span>
            <span className="info-value">{job.config.targetLength}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Language</span>
            <span className="info-value">{job.config.language}</span>
          </div>
          <div className="info-item">
            <span className="info-label">AI Provider</span>
            <span className="info-value">
              {job.config.llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">SRT Files</span>
            <span className="info-value">{job.srtFiles?.length ?? 0}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Video Files</span>
            <span className="info-value">{job.videoFiles?.length ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Progress */}
      {job.status !== 'pending' && (
        <div className="card progress-section">
          <h2>Progress</h2>

          {/* Overall progress bar */}
          <div className="overall-progress">
            <div className="progress-bar-container large">
              <div
                className="progress-bar"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span className="progress-percent">{overallProgress}%</span>
          </div>

          {/* Current step */}
          <p className="current-step">{job.progress.currentStep}</p>

          {/* Stage list */}
          <div className="stages-list">
            {relevantStages.map((stage) => (
              <div
                key={stage}
                className={`stage-item ${stage === job.progress.stage ? 'current' : ''} ${job.progress.completedStages.includes(stage) ? 'completed' : ''}`}
              >
                <span className="stage-icon">
                  {getStageIcon(stage, job.progress.stage, job.progress.completedStages)}
                </span>
                <span className="stage-label">{STAGE_LABELS[stage]}</span>
                {stage === job.progress.stage && job.progress.stageProgress > 0 && (
                  <span className="stage-progress">{job.progress.stageProgress}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start button for pending jobs */}
      {job.status === 'pending' && (
        <div className="card start-section">
          <h2>Ready to Start</h2>
          <p>All files have been uploaded. Click the button below to start processing.</p>
          <button className="btn btn-primary" onClick={handleStart}>
            🚀 Start Processing
          </button>
        </div>
      )}

      {/* Error display */}
      {job.status === 'failed' && job.error && (
        <div className="card error-section">
          <h2>Error</h2>
          <div className="error-message">{job.error}</div>
        </div>
      )}

      {/* Downloads */}
      {job.status === 'completed' && job.outputs && (
        <div className="card downloads-section">
          <h2>Downloads</h2>
          <div className="downloads-grid">
            {job.outputs.videoPath && (
              <a
                href={getDownloadUrl(job.id, 'video')}
                className="download-item"
                download
              >
                <span className="download-icon">🎬</span>
                <span className="download-label">Video Summary</span>
                <span className="download-format">MP4</span>
              </a>
            )}
            {job.outputs.srtPath && (
              <a
                href={getDownloadUrl(job.id, 'srt')}
                className="download-item"
                download
              >
                <span className="download-icon">📝</span>
                <span className="download-label">Subtitles</span>
                <span className="download-format">SRT</span>
              </a>
            )}
            {job.outputs.narrativeSrtPath && (
              <a
                href={getDownloadUrl(job.id, 'narrative-srt')}
                className="download-item"
                download
              >
                <span className="download-icon">📝</span>
                <span className="download-label">Narrative Subtitles</span>
                <span className="download-format">SRT</span>
              </a>
            )}
            {job.outputs.audioPath && (
              <a
                href={getDownloadUrl(job.id, 'audio')}
                className="download-item"
                download
              >
                <span className="download-icon">🔊</span>
                <span className="download-label">Voiceover Audio</span>
                <span className="download-format">MP3</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
