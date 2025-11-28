import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createJob,
  uploadSrtFiles,
  startJob,
  JobConfig,
  SummaryMode,
  TargetLength,
  LLMProvider,
} from '../api';
import './CreateJob.css';

const LANGUAGES = [
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
];

export function CreateJob() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'config' | 'upload' | 'review'>('config');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Form state
  const [seriesName, setSeriesName] = useState('');
  const [season, setSeason] = useState(1);
  const [language, setLanguage] = useState('en-US');
  const [mode, setMode] = useState<SummaryMode>('A');
  const [targetLength, setTargetLength] = useState<TargetLength>('medium');
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('openai');
  const [videoDirectory, setVideoDirectory] = useState('');

  // Files
  const [srtFiles, setSrtFiles] = useState<FileList | null>(null);
  const [uploadedSrt, setUploadedSrt] = useState<number>(0);

  const handleCreateJob = async () => {
    if (!seriesName.trim()) {
      setError('Series name is required');
      return;
    }

    if (!videoDirectory.trim()) {
      setError('Video directory path is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config: JobConfig = {
        seriesName: seriesName.trim(),
        season,
        language,
        mode,
        targetLength,
        llmProvider,
        videoDirectory: videoDirectory.trim(),
      };

      const job = await createJob(config);
      setJobId(job.id);
      setStep('upload');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create job';
      setError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFiles = async () => {
    if (!jobId) return;
    if (!srtFiles || srtFiles.length === 0) {
      setError('Please select at least one SRT file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Upload SRT files only - videos are read from local directory
      await uploadSrtFiles(jobId, srtFiles);
      setUploadedSrt(srtFiles.length);

      setStep('review');
    } catch (err) {
      setError('Failed to upload files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartJob = async () => {
    if (!jobId) return;

    setLoading(true);
    setError(null);

    try {
      await startJob(jobId);
      navigate(`/job/${jobId}`);
    } catch (err) {
      setError('Failed to start job');
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="create-job-page">
      <h1 className="page-title">Create New Summary Job</h1>

      {/* Progress steps */}
      <div className="steps">
        <div className={`step ${step === 'config' ? 'active' : 'completed'}`}>
          <span className="step-number">1</span>
          <span className="step-label">Configure</span>
        </div>
        <div className={`step ${step === 'upload' ? 'active' : step === 'review' ? 'completed' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">Upload Files</span>
        </div>
        <div className={`step ${step === 'review' ? 'active' : ''}`}>
          <span className="step-number">3</span>
          <span className="step-label">Review & Start</span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Step 1: Configuration */}
      {step === 'config' && (
        <div className="card form-card">
          <h2>Job Configuration</h2>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="seriesName">Series Name *</label>
              <input
                type="text"
                id="seriesName"
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                placeholder="e.g., Breaking Bad"
              />
            </div>

            <div className="form-group">
              <label htmlFor="season">Season Number *</label>
              <input
                type="number"
                id="season"
                value={season}
                onChange={(e) => setSeason(parseInt(e.target.value) || 1)}
                min={1}
                max={99}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="language">Language</label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="llmProvider">AI Provider</label>
              <select
                id="llmProvider"
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
              >
                <option value="openai">OpenAI (GPT-4)</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Summary Mode</label>
            <div className="mode-selector">
              <button
                type="button"
                className={`mode-option ${mode === 'A' ? 'selected' : ''}`}
                onClick={() => setMode('A')}
              >
                <h4>Mode A</h4>
                <p>Clips with original subtitles</p>
              </button>
              <button
                type="button"
                className={`mode-option ${mode === 'B' ? 'selected' : ''}`}
                onClick={() => setMode('B')}
              >
                <h4>Mode B</h4>
                <p>Clips with AI-generated narrative voiceover</p>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Target Length</label>
            <div className="length-selector">
              {(['short', 'medium', 'long'] as TargetLength[]).map((len) => (
                <button
                  key={len}
                  type="button"
                  className={`length-option ${targetLength === len ? 'selected' : ''}`}
                  onClick={() => setTargetLength(len)}
                >
                  {len.charAt(0).toUpperCase() + len.slice(1)}
                  <span className="length-time">
                    {len === 'short' ? '~5 min' : len === 'medium' ? '~15 min' : '~30 min'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="videoDirectory">Video Directory (Local Path) *</label>
            <input
              type="text"
              id="videoDirectory"
              value={videoDirectory}
              onChange={(e) => setVideoDirectory(e.target.value)}
              placeholder="e.g., D:\Videos\BreakingBad\Season1"
            />
            <small className="form-hint">
              Enter the full path to the folder containing the video files on the server.
              Video files should have episode identifiers in their names (e.g., S01E01).
            </small>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleCreateJob}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Continue to Upload'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload Files */}
      {step === 'upload' && (
        <div className="card form-card">
          <h2>Upload SRT Files</h2>
          <p className="upload-description">
            Upload the SRT subtitle files for all episodes in the season.
            Video files will be read from: <strong>{videoDirectory}</strong>
          </p>

          <div className="form-group">
            <label htmlFor="srtFiles">SRT Files (Subtitles) *</label>
            <input
              type="file"
              id="srtFiles"
              accept=".srt"
              multiple
              onChange={(e) => setSrtFiles(e.target.files)}
              className="file-input"
            />
            {srtFiles && (
              <span className="file-count">{srtFiles.length} file(s) selected</span>
            )}
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setStep('config')}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleUploadFiles}
              disabled={loading}
            >
              {loading ? 'Uploading...' : 'Upload SRT Files'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Start */}
      {step === 'review' && (
        <div className="card form-card">
          <h2>Review & Start</h2>

          <div className="review-summary">
            <div className="review-item">
              <span className="review-label">Series:</span>
              <span className="review-value">{seriesName} - Season {season}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Mode:</span>
              <span className="review-value">
                {mode === 'A' ? 'Clips with original subtitles' : 'Clips with AI voiceover'}
              </span>
            </div>
            <div className="review-item">
              <span className="review-label">Target Length:</span>
              <span className="review-value">{targetLength}</span>
            </div>
            <div className="review-item">
              <span className="review-label">AI Provider:</span>
              <span className="review-value">{llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">SRT Files:</span>
              <span className="review-value">{uploadedSrt} uploaded</span>
            </div>
            <div className="review-item">
              <span className="review-label">Video Directory:</span>
              <span className="review-value">{videoDirectory}</span>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setStep('upload')}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleStartJob}
              disabled={loading}
            >
              {loading ? 'Starting...' : '🚀 Start Processing'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
