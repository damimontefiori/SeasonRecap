import { Routes, Route, Link } from 'react-router-dom';
import { JobsList } from './pages/JobsList';
import { CreateJob } from './pages/CreateJob';
import { JobDetails } from './pages/JobDetails';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <Link to="/">🎬 SeasonSummarizer</Link>
        </h1>
        <nav>
          <Link to="/" className="nav-link">
            Jobs
          </Link>
          <Link to="/create" className="nav-link primary">
            + New Job
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<JobsList />} />
          <Route path="/create" element={<CreateJob />} />
          <Route path="/job/:id" element={<JobDetails />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <p>SeasonSummarizer v0.1 - Personal video summary generator</p>
      </footer>
    </div>
  );
}

export default App;
