import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface Config {
  // Server
  port: number;
  nodeEnv: string;

  // OpenAI
  openaiApiKey: string;
  openaiApiBase: string;
  openaiModel: string;

  // Anthropic
  anthropicApiKey: string;
  anthropicModel: string;

  // Azure Speech
  azureSpeechKey: string;
  azureSpeechRegion: string;
  azureSpeechVoice: string;

  // File paths
  dataDir: string;
  uploadsDir: string;
  outputsDir: string;
  jobsDir: string;

  // Processing
  maxFileSize: number;
  ffmpegPath: string;

  // Summary defaults
  targetDurationShort: number;
  targetDurationMedium: number;
  targetDurationLong: number;
  llmMaxRetries: number;
}

function getEnvString(key: string, defaultValue: string = ''): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): Config {
  const dataDir = getEnvString('DATA_DIR', './data');

  return {
    // Server
    port: getEnvNumber('PORT', 3001),
    nodeEnv: getEnvString('NODE_ENV', 'development'),

    // OpenAI
    openaiApiKey: getEnvString('OPENAI_API_KEY'),
    openaiApiBase: getEnvString('OPENAI_API_BASE', 'https://api.openai.com/v1'),
    openaiModel: getEnvString('OPENAI_MODEL', 'gpt-4o'),

    // Anthropic
    anthropicApiKey: getEnvString('ANTHROPIC_API_KEY'),
    anthropicModel: getEnvString('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),

    // Azure Speech
    azureSpeechKey: getEnvString('AZURE_SPEECH_KEY'),
    azureSpeechRegion: getEnvString('AZURE_SPEECH_REGION', 'westeurope'),
    azureSpeechVoice: getEnvString('AZURE_SPEECH_VOICE', 'es-ES-ElviraNeural'),

    // File paths
    dataDir,
    uploadsDir: getEnvString('UPLOADS_DIR', `${dataDir}/uploads`),
    outputsDir: getEnvString('OUTPUTS_DIR', `${dataDir}/outputs`),
    jobsDir: getEnvString('JOBS_DIR', `${dataDir}/jobs`),

    // Processing
    maxFileSize: getEnvNumber('MAX_FILE_SIZE', 2147483648), // 2GB
    ffmpegPath: getEnvString('FFMPEG_PATH', ''),

    // Summary defaults
    targetDurationShort: getEnvNumber('TARGET_DURATION_SHORT', 5),
    targetDurationMedium: getEnvNumber('TARGET_DURATION_MEDIUM', 15),
    targetDurationLong: getEnvNumber('TARGET_DURATION_LONG', 30),
    llmMaxRetries: getEnvNumber('LLM_MAX_RETRIES', 3),
  };
}

export const config = loadConfig();
