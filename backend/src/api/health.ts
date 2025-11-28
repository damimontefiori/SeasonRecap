import { Router, Request, Response } from 'express';
import { FFmpegProcessor } from '../video';
import { testAllProviders } from '../llm';
import { AzureSpeechSynthesizer } from '../tts';
import { config } from '../config';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (_req: Request, res: Response) => {
  const ffmpeg = new FFmpegProcessor();
  const tts = new AzureSpeechSynthesizer();

  // Check FFmpeg
  const ffmpegAvailable = ffmpeg.isAvailable();
  const ffmpegVersion = ffmpegAvailable ? ffmpeg.getVersion() : null;

  // Check LLM providers
  const llmStatus = await testAllProviders();

  // Check Azure TTS (basic check, no API call)
  const ttsConfigured = !!config.azureSpeechKey && !!config.azureSpeechRegion;

  const allServicesOk =
    ffmpegAvailable &&
    (llmStatus.get('openai') || llmStatus.get('anthropic')) &&
    ttsConfigured;

  res.json({
    status: allServicesOk ? 'healthy' : 'degraded',
    services: {
      ffmpeg: {
        available: ffmpegAvailable,
        version: ffmpegVersion,
      },
      llm: {
        openai: llmStatus.get('openai') ?? false,
        anthropic: llmStatus.get('anthropic') ?? false,
      },
      tts: {
        configured: ttsConfigured,
        region: ttsConfigured ? config.azureSpeechRegion : null,
        voice: ttsConfigured ? config.azureSpeechVoice : null,
      },
    },
    config: {
      targetDurations: {
        short: config.targetDurationShort,
        medium: config.targetDurationMedium,
        long: config.targetDurationLong,
      },
    },
  });
});

export default router;
