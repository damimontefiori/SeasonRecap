import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listJobs, deleteJob, JobListItem, JobStatus } from '../api';
import './JobsList.css';

function getStatusClass(status: JobStatus): string {
  if (status === 'completed') return 'status-completed';
  if (status === 'failed') return 'status-failed';
  if (status === 'pending') return 'status-pending';
  return 'status-processing';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function JobsList() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const data = await listJobs();
      setJobs(data);
      setError(null);
    } catch (err) {
      setError('Failed to load jobs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // Refresh every 10 seconds
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      await deleteJob(id);
      setJobs(jobs.filter((j) => j.id !== id));
    } catch (err) {
      setError('Failed to delete job');
      console.error(err);
    }
  };

  if (loading && jobs.length === 0) {
    return <div className="loading">Loading jobs...</div>;
  }

  return (
    <div className="jobs-list-page">
      <div className="page-header">
        <h1 className="page-title">Summary Jobs</h1>
        <Link to="/create" className="btn btn-primary">
          + New Job
        </Link>
      </div>

      {error && <div className="error-message">{error}</div>}

      {jobs.length === 0 ? (
        <div className="empty-state card">
          <h3>No jobs yet</h3>
          <p>Create your first summary job to get started.</p>
          <Link to="/create" className="btn btn-primary">
            Create Job
          </Link>
        </div>
      ) : (
        <div className="jobs-grid">
          {jobs.map((job) => (
            <Link to={`/job/${job.id}`} key={job.id} className="job-card card">
              <div className="job-card-header">
                <h3>
                  {job.seriesName} - Season {job.season}
                </h3>
                <span className={`status-badge ${getStatusClass(job.status)}`}>{job.status}</span>
              </div>

              <div className="job-card-meta">
                <span className="mode-badge">Mode {job.mode}</span>
                <span className="date">{formatDate(job.createdAt)}</span>
              </div>

              {job.status !== 'completed' && job.status !== 'failed' && job.status !== 'pending' && (
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${job.progress}%` }} />
                  <span className="progress-text">{job.progress}%</span>
                </div>
              )}

              <button
                className="delete-btn"
                onClick={(e) => handleDelete(job.id, e)}
                title="Delete job"
              >
                🗑️
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
