import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getJob, startJob, getDownloadUrl, Job, JobStatus, KeyMoment } from '../api';
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

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function JobDetails() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllMoments, setShowAllMoments] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

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
      if (job && job.status !== 'completed' && job.status !== 'failed' && job.status !== 'pending') {
        fetchJob();
      }
    }, 2000); // Poll every 2 seconds for more responsive updates

    return () => clearInterval(interval);
  }, [id, job?.status]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [job?.progress.logs]);

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

  const isProcessing = job.status !== 'pending' && job.status !== 'completed' && job.status !== 'failed';
  const relevantStages = job.config.mode === 'A'
    ? STAGE_ORDER.filter((s) => s !== 'generating_tts' && s !== 'mixing_audio')
    : STAGE_ORDER;

  // Calculate summary stats
  const totalClipDuration = job.keyMoments?.reduce((sum, m) => sum + (m.endTime - m.startTime), 0) ?? 0;
  const episodesWithClips = new Set(job.keyMoments?.map(m => m.episodeId) ?? []).size;

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
          {isProcessing && <span className="status-pulse"></span>}
          {STAGE_LABELS[job.status]}
        </span>
      </div>

      {/* Processing Banner */}
      {isProcessing && (
        <div className="processing-banner">
          <div className="processing-icon">
            <div className="spinner"></div>
          </div>
          <div className="processing-info">
            <h3>🔄 Processing in background...</h3>
            <p>
              The video is being generated. This may take several minutes depending on the number of clips.
              You can leave this page and come back later - processing will continue in the background.
            </p>
          </div>
        </div>
      )}

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
            <span className="info-label">Video Source</span>
            <span className="info-value">
              {job.config.videoDirectory ? 'Local directory' : `${job.videoFiles?.length ?? 0} files`}
            </span>
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
                className={`progress-bar ${isProcessing ? 'animated' : ''}`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span className="progress-percent">{overallProgress}%</span>
          </div>

          {/* Current step */}
          <p className="current-step">
            {isProcessing && <span className="pulse-dot"></span>}
            {job.progress.currentStep}
          </p>

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

      {/* Summary Stats - Show when we have key moments */}
      {job.keyMoments && job.keyMoments.length > 0 && (
        <div className="card summary-stats">
          <h2>📊 Summary Statistics</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{job.keyMoments.length}</span>
              <span className="stat-label">Key Moments</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{formatDuration(totalClipDuration)}</span>
              <span className="stat-label">Total Duration</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{episodesWithClips}</span>
              <span className="stat-label">Episodes Covered</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{formatDuration(totalClipDuration / job.keyMoments.length)}</span>
              <span className="stat-label">Avg Clip Length</span>
            </div>
          </div>
        </div>
      )}

      {/* Narrative Outline - Show for completed jobs */}
      {job.narrativeOutline && (
        <div className="card narrative-section">
          <h2>📖 Narrative Structure</h2>
          <div className="narrative-grid">
            <div className="narrative-block">
              <h4>🎬 Introduction</h4>
              <p>{job.narrativeOutline.intro}</p>
            </div>
            <div className="narrative-block">
              <h4>📈 Development</h4>
              <p>{job.narrativeOutline.development}</p>
            </div>
            <div className="narrative-block">
              <h4>⚡ Climax</h4>
              <p>{job.narrativeOutline.climax}</p>
            </div>
            <div className="narrative-block">
              <h4>🎭 Resolution</h4>
              <p>{job.narrativeOutline.resolution}</p>
            </div>
          </div>
        </div>
      )}

      {/* Key Moments / Scenes */}
      {job.keyMoments && job.keyMoments.length > 0 && (
        <div className="card moments-section">
          <div className="moments-header">
            <h2>🎬 Selected Scenes ({job.keyMoments.length})</h2>
            {job.keyMoments.length > 5 && (
              <button 
                className="btn btn-sm btn-secondary"
                onClick={() => setShowAllMoments(!showAllMoments)}
              >
                {showAllMoments ? 'Show Less' : `Show All (${job.keyMoments.length})`}
              </button>
            )}
          </div>
          <div className="moments-list">
            {(showAllMoments ? job.keyMoments : job.keyMoments.slice(0, 5)).map((moment, index) => (
              <MomentCard key={index} moment={moment} index={index} />
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

      {/* Logs section */}
      {job.progress.logs && job.progress.logs.length > 0 && (
        <div className="card logs-section">
          <h2>📋 Execution Log ({job.progress.logs.length} entries)</h2>
          <div className="logs-container">
            {job.progress.logs.map((log, index) => (
              <div key={index} className={`log-entry log-${log.level}`}>
                <span className="log-time">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="log-level-icon">
                  {log.level === 'success' ? '✅' : log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️'}
                </span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Downloads */}
      {job.status === 'completed' && job.outputs && (
        <div className="card downloads-section">
          <h2>⬇️ Downloads</h2>
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

// Component for displaying a single moment/scene
function MomentCard({ moment, index }: { moment: KeyMoment; index: number }) {
  const duration = moment.endTime - moment.startTime;
  
  const getRoleColor = (role: string): string => {
    switch (role.toLowerCase()) {
      case 'intro':
      case 'introduction': return '#3b82f6';
      case 'development': return '#8b5cf6';
      case 'climax': return '#ef4444';
      case 'resolution': return '#22c55e';
      case 'key_scene': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  return (
    <div className="moment-card">
      <div className="moment-header">
        <span className="moment-number">#{index + 1}</span>
        <span className="moment-episode">{moment.episodeId}</span>
        <span className="moment-time">
          {formatTime(moment.startTime)} - {formatTime(moment.endTime)}
        </span>
        <span className="moment-duration">{formatDuration(duration)}</span>
      </div>
      <div className="moment-body">
        <p className="moment-description">{moment.description || moment.justification}</p>
        <div className="moment-meta">
          <span 
            className="moment-role" 
            style={{ backgroundColor: getRoleColor(moment.narrativeRole) }}
          >
            {moment.narrativeRole.replace('_', ' ')}
          </span>
          <span className="moment-importance">
            {'⭐'.repeat(Math.min(moment.importance, 5))}
          </span>
        </div>
      </div>
    </div>
  );
}
