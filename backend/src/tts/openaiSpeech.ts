import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { config } from '../config';

// OpenAI TTS has a limit of 4096 characters per request
const MAX_CHARS_PER_CHUNK = 4000;

/**
 * OpenAI TTS voices - premium quality, multilingual
 */
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * Configuration for OpenAI Speech synthesis
 */
export interface OpenAISpeechConfig {
  apiKey: string;
  voice: OpenAIVoice;
  model?: 'tts-1' | 'tts-1-hd';
}

/**
 * Result from speech synthesis
 */
export interface SynthesisResult {
  audioFilePath: string;
  durationMs: number;
}

/**
 * OpenAI TTS wrapper - Premium voices with natural multilingual support
 */
export class OpenAISpeechSynthesizer {
  private client: OpenAI;
  private voice: OpenAIVoice;
  private model: 'tts-1' | 'tts-1-hd';

  constructor(speechConfig?: Partial<OpenAISpeechConfig>) {
    this.client = new OpenAI({
      apiKey: speechConfig?.apiKey ?? config.openaiApiKey,
    });
    this.voice = speechConfig?.voice ?? 'nova';
    this.model = speechConfig?.model ?? 'tts-1-hd'; // HD for better quality
  }

  /**
   * Tests if the OpenAI API is available
   */
  async testConnection(): Promise<boolean> {
    try {
      // Simple test - just check if client is configured
      return !!this.client.apiKey;
    } catch {
      return false;
    }
  }

  /**
   * Splits text into chunks that won't exceed OpenAI's character limit
   */
  private splitTextIntoChunks(text: string): string[] {
    if (text.length <= MAX_CHARS_PER_CHUNK) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (sentence.length > MAX_CHARS_PER_CHUNK) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // Split long sentence on commas
        const parts = sentence.split(/(?<=,)\s*/);
        for (const part of parts) {
          if ((currentChunk + ' ' + part).length > MAX_CHARS_PER_CHUNK) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = part;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + part;
          }
        }
      } else if ((currentChunk + ' ' + sentence).length > MAX_CHARS_PER_CHUNK) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Concatenates multiple MP3 files using FFmpeg
   */
  private async concatenateAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
    const concatFilePath = path.join(path.dirname(outputPath), 'openai_audio_concat_list.txt');
    const concatContent = audioPaths.map((p) => {
      const absolutePath = path.resolve(p).replace(/\\/g, '/');
      return `file '${absolutePath.replace(/'/g, "'\\''")}'`;
    }).join('\n');

    fs.writeFileSync(concatFilePath, concatContent, 'utf-8');

    const ffmpegPath = config.ffmpegPath || 'ffmpeg';
    
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c', 'copy',
        outputPath,
      ];

      const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (fs.existsSync(concatFilePath)) {
          fs.unlinkSync(concatFilePath);
        }

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg audio concat failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        if (fs.existsSync(concatFilePath)) {
          fs.unlinkSync(concatFilePath);
        }
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Synthesizes a single chunk of text to a file
   */
  private async synthesizeChunkToFile(text: string, outputPath: string): Promise<SynthesisResult> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: this.voice,
      input: text,
      response_format: 'mp3',
    });

    // Get the audio buffer
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    // Estimate duration (roughly 150 words per minute, ~5 chars per word)
    const estimatedDurationMs = (text.length / 5 / 150) * 60 * 1000;

    return {
      audioFilePath: outputPath,
      durationMs: estimatedDurationMs,
    };
  }

  /**
   * Synthesizes text to speech and saves to a file
   * Automatically splits long text into chunks
   * @param text - Text to synthesize
   * @param outputPath - Path to save the audio file (MP3 format)
   * @returns Synthesis result with file path and duration
   */
  async synthesizeToFile(text: string, outputPath: string): Promise<SynthesisResult> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const chunks = this.splitTextIntoChunks(text);
    console.log(`OpenAI TTS: Splitting text into ${chunks.length} chunk(s) (${text.length} total chars)`);

    // If only one chunk, synthesize directly
    if (chunks.length === 1) {
      return this.synthesizeChunkToFile(chunks[0]!, outputPath);
    }

    // Multiple chunks: synthesize each, then concatenate
    const chunkPaths: string[] = [];
    let totalDurationMs = 0;

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const chunkPath = path.join(dir, `openai_tts_chunk_${i.toString().padStart(3, '0')}.mp3`);
        chunkPaths.push(chunkPath);

        console.log(`OpenAI TTS: Synthesizing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
        const result = await this.synthesizeChunkToFile(chunk, chunkPath);
        totalDurationMs += result.durationMs;
      }

      // Concatenate all chunks
      console.log(`OpenAI TTS: Concatenating ${chunkPaths.length} audio chunks...`);
      await this.concatenateAudioFiles(chunkPaths, outputPath);

      return {
        audioFilePath: outputPath,
        durationMs: totalDurationMs,
      };
    } finally {
      // Clean up chunk files
      for (const chunkPath of chunkPaths) {
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
      }
    }
  }
}
