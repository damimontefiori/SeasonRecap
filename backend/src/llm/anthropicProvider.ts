import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMProviderConfig,
  SummarizationInput,
  KeyMomentsResult,
  KeyMoment,
  NarrativeResult,
  buildKeyMomentsPrompt,
  buildNarrativePrompt,
} from './types';
import { generateSeasonTextForLLM, createSeasonTimeline } from '../subtitles';

export class AnthropicLLMProvider implements LLMProvider {
  readonly type = 'anthropic' as const;
  private client: Anthropic;
  private model: string;
  private maxRetries: number;

  constructor(config: LLMProviderConfig) {
    if (config.type !== 'anthropic') {
      throw new Error('Invalid config type for AnthropicLLMProvider');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.maxRetries = config.maxRetries ?? 3;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple test message
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  async selectKeyMoments(input: SummarizationInput): Promise<KeyMomentsResult> {
    const timeline = createSeasonTimeline(
      input.subtitlesByEpisode,
      input.seriesName,
      input.season,
      input.language
    );

    // Claude has larger context, can handle more text
    const subtitlesText = generateSeasonTextForLLM(timeline, 15000);
    const prompt = buildKeyMomentsPrompt(input, subtitlesText);

    const response = await this.callWithRetry(prompt);
    return this.parseKeyMomentsResponse(response);
  }

  async generateNarrativeForSummary(
    moments: KeyMoment[],
    language: string,
    seriesContext: { seriesName: string; season: number }
  ): Promise<NarrativeResult> {
    const prompt = buildNarrativePrompt(moments, language, seriesContext);
    const response = await this.callWithRetry(prompt);
    return this.parseNarrativeResponse(response);
  }

  private async callWithRetry(prompt: string): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 8000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          system:
            'You are an expert TV series analyst. Always respond with valid JSON only, no markdown formatting or code blocks.',
        });

        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('No text response from Anthropic');
        }

        // Clean up response in case it has markdown
        let content = textBlock.text;
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        return content.trim();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Anthropic attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError ?? new Error('Anthropic call failed after retries');
  }

  private parseKeyMomentsResponse(response: string): KeyMomentsResult {
    try {
      const parsed = JSON.parse(response) as {
        moments?: KeyMoment[];
        narrativeOutline?: {
          intro?: string;
          development?: string;
          climax?: string;
          resolution?: string;
        };
        notes?: string;
      };

      if (!parsed.moments || !Array.isArray(parsed.moments)) {
        throw new Error('Invalid response: missing moments array');
      }

      return {
        moments: parsed.moments.map((m) => ({
          episodeId: m.episodeId ?? '',
          startTime: m.startTime ?? 0,
          endTime: m.endTime ?? 0,
          justification: m.justification ?? '',
          narrativeRole: m.narrativeRole ?? 'key_scene',
          description: m.description ?? '',
          importance: m.importance ?? 5,
        })),
        narrativeOutline: {
          intro: parsed.narrativeOutline?.intro ?? '',
          development: parsed.narrativeOutline?.development ?? '',
          climax: parsed.narrativeOutline?.climax ?? '',
          resolution: parsed.narrativeOutline?.resolution ?? '',
        },
        notes: parsed.notes,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse key moments response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private parseNarrativeResponse(response: string): NarrativeResult {
    try {
      const parsed = JSON.parse(response) as {
        fullNarrative?: string;
        narrativeBlocks?: Array<{
          momentIndex?: number;
          text?: string;
          estimatedDuration?: number;
        }>;
      };

      if (!parsed.fullNarrative || !parsed.narrativeBlocks) {
        throw new Error('Invalid response: missing narrative fields');
      }

      return {
        fullNarrative: parsed.fullNarrative,
        narrativeBlocks: parsed.narrativeBlocks.map((b) => ({
          momentIndex: b.momentIndex ?? 0,
          text: b.text ?? '',
          estimatedDuration: b.estimatedDuration ?? 10,
        })),
      };
    } catch (error) {
      throw new Error(
        `Failed to parse narrative response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
