import { Router, Request, Response } from 'express';
import { FFmpegProcessor } from '../video';
import { testAllProviders } from '../llm';
import { AzureSpeechSynthesizer, OpenAISpeechSynthesizer, OpenAIVoice } from '../tts';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

const router = Router();

// Sample texts for voice preview
const SAMPLE_TEXTS: Record<string, string> = {
  'es': 'En esta temporada, los personajes enfrentan nuevos desafíos mientras la trama se desarrolla de maneras inesperadas.',
  'en': 'In this season, the characters face new challenges as the plot unfolds in unexpected ways.',
};

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

/**
 * GET /api/health/tts-preview/:voice
 * Generate a voice preview audio
 */
router.get('/tts-preview/:voice', async (req: Request, res: Response) => {
  const { voice } = req.params;
  
  if (!voice) {
    res.status(400).json({ error: 'Voice parameter is required' });
    return;
  }

  // Check if it's an OpenAI voice or Azure voice
  const isOpenAI = voice.startsWith('openai:');
  
  // For Azure voices, check if TTS is configured
  if (!isOpenAI && (!config.azureSpeechKey || !config.azureSpeechRegion)) {
    res.status(503).json({ error: 'Azure TTS service not configured' });
    return;
  }
  
  // For OpenAI voices, check if OpenAI API key is configured
  if (isOpenAI && !config.openaiApiKey) {
    res.status(503).json({ error: 'OpenAI API key not configured' });
    return;
  }

  try {
    // Determine sample text - OpenAI voices are multilingual, so use Spanish by default
    const sampleText = SAMPLE_TEXTS['es']!;

    // Create temp directory for preview files
    const previewDir = path.join(config.dataDir, 'previews');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    // Generate unique filename
    const safeVoiceName = voice.replace(':', '_');
    const filename = `preview_${safeVoiceName}_${Date.now()}.mp3`;
    const outputPath = path.join(previewDir, filename);

    // Synthesize based on voice type
    if (isOpenAI) {
      const openaiVoice = voice.replace('openai:', '') as OpenAIVoice;
      console.log(`TTS Preview: Using OpenAI voice "${openaiVoice}"`);
      const synthesizer = new OpenAISpeechSynthesizer({ voice: openaiVoice });
      await synthesizer.synthesizeToFile(sampleText, outputPath);
    } else {
      console.log(`TTS Preview: Using Azure voice "${voice}"`);
      const synthesizer = new AzureSpeechSynthesizer({ voice });
      await synthesizer.synthesizeToFile(sampleText, outputPath);
    }

    // Send file and clean up after
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    
    stream.on('end', () => {
      // Clean up file after sending
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('TTS preview error:', error);
    res.status(500).json({ 
      error: 'Failed to generate voice preview',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
