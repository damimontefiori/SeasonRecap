# SeasonSummarizer 🎬

A personal web application for generating video summaries of complete TV series seasons.

## Overview

SeasonSummarizer analyzes subtitle files from all episodes of a season, uses AI (OpenAI GPT or Anthropic Claude) to identify key moments, and creates a video summary by extracting and concatenating relevant clips.

### Two Summary Modes

- **Mode A**: Video summary with original subtitles remapped to the new timeline
- **Mode B**: Video summary with AI-generated narrative voiceover (using Azure Speech Services)

## Features

- 📺 Process entire seasons with multiple episodes
- 🤖 AI-powered moment selection using GPT-4 or Claude
- 🎬 Automatic video clip extraction and concatenation
- 📝 SRT subtitle generation for the summary video
- 🗣️ Text-to-speech narration (Mode B)
- 🌐 Simple web interface for job management
- 📊 Real-time progress tracking

## Prerequisites

- **Node.js** 18.x or later
- **FFmpeg** installed and available in PATH
- **API Keys** for at least one of:
  - OpenAI API
  - Anthropic API
- **Azure Speech Services** key (required for Mode B)

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd SeasonRecap
```

### 2. Install dependencies

```bash
npm run setup
```

This will install dependencies for both backend and frontend.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```env
# Required for AI analysis
OPENAI_API_KEY=your-openai-key-here
# OR
ANTHROPIC_API_KEY=your-anthropic-key-here

# Required for Mode B (voiceover)
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=westeurope
AZURE_SPEECH_VOICE=es-ES-ElviraNeural
```

### 4. Verify FFmpeg installation

```bash
ffmpeg -version
```

If FFmpeg is not installed, download it from [ffmpeg.org](https://ffmpeg.org/download.html).

### 5. Create data directories

```bash
npm run prepare-data
```

## Usage

### Start the application

```bash
npm run dev
```

This starts both:
- **Backend** on http://localhost:3001
- **Frontend** on http://localhost:5173

### Create a summary job

1. Open http://localhost:5173 in your browser
2. Click "New Job"
3. Fill in the series details:
   - Series name
   - Season number
   - Language
   - Summary mode (A or B)
   - Target length (short/medium/long)
   - AI provider (OpenAI or Anthropic)
4. Upload all SRT files for the season
5. Upload all video files for the season
6. Click "Start Processing"

### Monitor progress

The job details page shows real-time progress through all processing stages:
1. Validating files
2. Parsing subtitles
3. Analyzing with AI
4. Generating clip list
5. Processing video
6. Generating subtitles
7. (Mode B) Generating voiceover
8. (Mode B) Mixing audio

### Download results

Once complete, download:
- **Video Summary** (MP4)
- **Subtitles** (SRT)
- **Narrative Subtitles** (SRT, Mode B only)
- **Voiceover Audio** (MP3, Mode B only)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Check service status |
| GET | `/api/jobs` | List all jobs |
| POST | `/api/jobs` | Create new job |
| GET | `/api/jobs/:id` | Get job details |
| POST | `/api/jobs/:id/start` | Start processing |
| DELETE | `/api/jobs/:id` | Delete a job |
| POST | `/api/upload/:id/srt` | Upload SRT files |
| POST | `/api/upload/:id/video` | Upload video files |
| GET | `/api/jobs/:id/download/:type` | Download results |

## Project Structure

```
SeasonRecap/
├── backend/
│   └── src/
│       ├── api/          # REST API endpoints
│       ├── config/       # Configuration management
│       ├── jobs/         # Job storage and types
│       ├── llm/          # LLM provider implementations
│       ├── pipelines/    # Processing pipeline
│       ├── subtitles/    # SRT parsing and utilities
│       ├── tts/          # Azure Speech integration
│       └── video/        # FFmpeg wrapper
├── frontend/
│   └── src/
│       ├── api/          # API client
│       └── pages/        # React pages
├── data/
│   ├── uploads/          # Uploaded files (per job)
│   ├── outputs/          # Generated outputs (per job)
│   └── jobs/             # Job metadata (JSON)
├── docs/                 # Documentation
└── scripts/              # Utility scripts
```

## Configuration

### Target Durations

Default summary lengths (configurable in `.env`):
- **Short**: 5 minutes
- **Medium**: 15 minutes
- **Long**: 30 minutes

### Azure Speech Voices

Common voice options:
- `es-ES-ElviraNeural` (Spanish, Spain)
- `en-US-JennyNeural` (English, US)
- `en-GB-SoniaNeural` (English, UK)
- `fr-FR-DeniseNeural` (French)
- `de-DE-KatjaNeural` (German)

See [Azure Voice Gallery](https://speech.microsoft.com/portal/voicegallery) for more options.

## Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
cd backend && npm run test:watch
```

## Example: Generate with Synthetic Data

Create a test job with synthetic SRT files:

```bash
npm run generate-summary:example
```

This creates a job with example subtitles. Add video files and configure API keys to run the full pipeline.

## Troubleshooting

### FFmpeg not found

Ensure FFmpeg is in your system PATH:

```bash
# Windows
setx PATH "%PATH%;C:\path\to\ffmpeg\bin"

# macOS/Linux
export PATH="$PATH:/path/to/ffmpeg/bin"
```

### API rate limits

The LLM layer includes automatic retry with exponential backoff. For large seasons, processing may take several minutes.

### Video concatenation fails

If clips have different formats, the pipeline will automatically switch to re-encoding mode (slower but more compatible).

### Large file uploads

The default max file size is 2GB. Adjust `MAX_FILE_SIZE` in `.env` if needed.

## License

This project is for personal use only. Do not distribute generated content that may infringe on copyrights.

## Contributing

This is a personal project. Feel free to fork and adapt for your own use.
