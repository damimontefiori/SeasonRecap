import OpenAI from 'openai';
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

export class OpenAILLMProvider implements LLMProvider {
  readonly type = 'openai' as const;
  private client: OpenAI;
  private model: string;
  private maxRetries: number;

  constructor(config: LLMProviderConfig) {
    if (config.type !== 'openai') {
      throw new Error('Invalid config type for OpenAILLMProvider');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiBase,
    });
    this.model = config.model ?? 'gpt-4o';
    this.maxRetries = config.maxRetries ?? 3;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async selectKeyMoments(input: SummarizationInput): Promise<KeyMomentsResult> {
    // Create timeline and generate text for LLM
    const timeline = createSeasonTimeline(
      input.subtitlesByEpisode,
      input.seriesName,
      input.season,
      input.language
    );

    // Limit text size to avoid token limits (approximately 100k chars for GPT-4)
    const subtitlesText = generateSeasonTextForLLM(timeline, 8000);
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
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are an expert TV series analyst. Always respond with valid JSON only, no markdown formatting.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 8000,
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from OpenAI');
        }

        return content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`OpenAI attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < this.maxRetries) {
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError ?? new Error('OpenAI call failed after retries');
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
