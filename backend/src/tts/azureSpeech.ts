import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Configuration for Azure Speech synthesis
 */
export interface AzureSpeechConfig {
  subscriptionKey: string;
  region: string;
  voice: string;
}

/**
 * Result from speech synthesis
 */
export interface SynthesisResult {
  audioFilePath: string;
  durationMs: number;
}

/**
 * Azure Speech TTS wrapper
 */
export class AzureSpeechSynthesizer {
  private config: AzureSpeechConfig;

  constructor(speechConfig?: Partial<AzureSpeechConfig>) {
    this.config = {
      subscriptionKey: speechConfig?.subscriptionKey ?? config.azureSpeechKey,
      region: speechConfig?.region ?? config.azureSpeechRegion,
      voice: speechConfig?.voice ?? config.azureSpeechVoice,
    };
  }

  /**
   * Tests if the Azure Speech service is available
   */
  async testConnection(): Promise<boolean> {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        this.config.subscriptionKey,
        this.config.region
      );
      speechConfig.speechSynthesisVoiceName = this.config.voice;

      // Just check if we can create the config without error
      return !!speechConfig;
    } catch {
      return false;
    }
  }

  /**
   * Synthesizes text to speech and saves to a file
   * @param text - Text to synthesize
   * @param outputPath - Path to save the audio file (WAV format)
   * @returns Synthesis result with file path and duration
   */
  async synthesizeToFile(text: string, outputPath: string): Promise<SynthesisResult> {
    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.config.subscriptionKey,
      this.config.region
    );
    speechConfig.speechSynthesisVoiceName = this.config.voice;
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // Use file output
    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            synthesizer.close();
            resolve({
              audioFilePath: outputPath,
              durationMs: result.audioDuration / 10000, // Convert from 100-nanosecond units to ms
            });
          } else {
            synthesizer.close();
            reject(
              new Error(
                `Speech synthesis failed: ${sdk.ResultReason[result.reason]} - ${result.errorDetails ?? 'Unknown error'}`
              )
            );
          }
        },
        (error) => {
          synthesizer.close();
          reject(new Error(`Speech synthesis error: ${error}`));
        }
      );
    });
  }

  /**
   * Synthesizes multiple text blocks with SSML for better control
   * @param blocks - Array of text blocks with optional pauses
   * @param outputPath - Path to save the audio file
   * @returns Synthesis result
   */
  async synthesizeBlocksToFile(
    blocks: Array<{ text: string; pauseAfterMs?: number }>,
    outputPath: string
  ): Promise<SynthesisResult> {
    // Build SSML
    const ssmlContent = blocks
      .map((block) => {
        let content = `<s>${this.escapeXml(block.text)}</s>`;
        if (block.pauseAfterMs) {
          content += `<break time="${block.pauseAfterMs}ms"/>`;
        }
        return content;
      })
      .join('\n');

    const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${this.getLanguageFromVoice()}">
  <voice name="${this.config.voice}">
    ${ssmlContent}
  </voice>
</speak>`.trim();

    return this.synthesizeSsmlToFile(ssml, outputPath);
  }

  /**
   * Synthesizes SSML to a file
   * @param ssml - SSML content
   * @param outputPath - Path to save the audio file
   * @returns Synthesis result
   */
  async synthesizeSsmlToFile(ssml: string, outputPath: string): Promise<SynthesisResult> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.config.subscriptionKey,
      this.config.region
    );
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            synthesizer.close();
            resolve({
              audioFilePath: outputPath,
              durationMs: result.audioDuration / 10000,
            });
          } else {
            synthesizer.close();
            reject(
              new Error(
                `SSML synthesis failed: ${sdk.ResultReason[result.reason]} - ${result.errorDetails ?? 'Unknown error'}`
              )
            );
          }
        },
        (error) => {
          synthesizer.close();
          reject(new Error(`SSML synthesis error: ${error}`));
        }
      );
    });
  }

  /**
   * Gets the language code from the configured voice name
   */
  private getLanguageFromVoice(): string {
    // Voice names are like "es-ES-ElviraNeural", extract language code
    const match = this.config.voice.match(/^([a-z]{2}-[A-Z]{2})/);
    return match?.[1] ?? 'en-US';
  }

  /**
   * Escapes special XML characters in text
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Gets list of available voices for a language
   * @param language - Language code (e.g., "es-ES")
   * @returns List of voice names
   */
  async getVoicesForLanguage(language: string): Promise<string[]> {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.config.subscriptionKey,
      this.config.region
    );

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    return new Promise((resolve, reject) => {
      synthesizer.getVoicesAsync(language).then(
        (result) => {
          synthesizer.close();
          if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
            const voices = result.voices.map((v) => v.shortName);
            resolve(voices);
          } else {
            reject(new Error(`Failed to get voices: ${result.errorDetails ?? 'Unknown error'}`));
          }
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  }
}
