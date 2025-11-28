import { SubtitleEntry, EpisodeSubtitles } from '../subtitles/types';

/**
 * Supported LLM provider types
 */
export type LLMProviderType = 'openai' | 'anthropic';

/**
 * Configuration for an LLM provider
 */
export interface LLMProviderConfig {
  type: LLMProviderType;
  apiKey: string;
  model?: string;
  apiBase?: string;
  maxRetries?: number;
}

/**
 * Represents a key moment selected by the LLM
 */
export interface KeyMoment {
  episodeId: string;
  startTime: number;
  endTime: number;
  /** Why this moment was selected */
  justification: string;
  /** Role in the narrative arc */
  narrativeRole: 'intro' | 'development' | 'climax' | 'resolution' | 'key_scene';
  /** Brief description of what happens */
  description: string;
  /** Importance score 1-10 */
  importance: number;
}

/**
 * Summary mode for the output
 */
export type SummaryMode = 'A' | 'B';

/**
 * Target length specification
 */
export type TargetLength = 'short' | 'medium' | 'long';

/**
 * Input for LLM summarization
 */
export interface SummarizationInput {
  /** Subtitles organized by episode */
  subtitlesByEpisode: EpisodeSubtitles[];
  /** Target duration in minutes */
  targetDurationMinutes: number;
  /** Language code (e.g., "es-ES") */
  language: string;
  /** Summary mode */
  mode: SummaryMode;
  /** Series name for context */
  seriesName: string;
  /** Season number */
  season: number;
}

/**
 * Result from key moment selection
 */
export interface KeyMomentsResult {
  moments: KeyMoment[];
  /** High-level narrative outline */
  narrativeOutline: {
    intro: string;
    development: string;
    climax: string;
    resolution: string;
  };
  /** Any warnings or notes from the LLM */
  notes?: string;
}

/**
 * Result from narrative generation (Mode B)
 */
export interface NarrativeResult {
  /** Complete narrative text */
  fullNarrative: string;
  /** Narrative split into blocks aligned with key moments */
  narrativeBlocks: Array<{
    /** Reference to the key moment this block corresponds to */
    momentIndex: number;
    /** The narrative text for this section */
    text: string;
    /** Estimated duration when spoken (seconds) */
    estimatedDuration: number;
  }>;
}

/**
 * LLM Provider interface - all providers must implement this
 */
export interface LLMProvider {
  /**
   * Provider type identifier
   */
  readonly type: LLMProviderType;

  /**
   * Selects key moments from the subtitles to include in the summary
   * @param input - Summarization input with subtitles and parameters
   * @returns Key moments and narrative outline
   */
  selectKeyMoments(input: SummarizationInput): Promise<KeyMomentsResult>;

  /**
   * Generates narrative text for Mode B summaries
   * @param moments - Previously selected key moments
   * @param language - Target language code
   * @param seriesContext - Context about the series
   * @returns Narrative text and blocks
   */
  generateNarrativeForSummary(
    moments: KeyMoment[],
    language: string,
    seriesContext: { seriesName: string; season: number }
  ): Promise<NarrativeResult>;

  /**
   * Tests the connection to the LLM provider
   * @returns True if connection is successful
   */
  testConnection(): Promise<boolean>;
}

/**
 * Prompt template for key moment selection
 */
export function buildKeyMomentsPrompt(input: SummarizationInput, subtitlesText: string): string {
  return `You are an expert TV series analyst. Your task is to identify the most important moments from a season of "${input.seriesName}" (Season ${input.season}) to create a compelling ${input.targetDurationMinutes}-minute video summary.

TARGET SUMMARY DURATION: ${input.targetDurationMinutes} minutes
MODE: ${input.mode === 'A' ? 'Clips with original subtitles' : 'Clips with narrative voiceover'}
LANGUAGE: ${input.language}

SEASON SUBTITLES:
${subtitlesText}

INSTRUCTIONS:
1. Analyze the entire season's dialogue to understand the plot, character arcs, and key events.
2. Select moments that capture:
   - Character introductions and key relationships
   - Major plot points and turning points  
   - Emotional peaks and dramatic scenes
   - The season's climax and resolution

3. Aim for clips totaling approximately ${input.targetDurationMinutes} minutes.
4. Each clip should be 15-60 seconds ideally.
5. Ensure narrative coherence - the clips should tell the season's story when watched in sequence.

RESPONSE FORMAT (JSON):
{
  "moments": [
    {
      "episodeId": "S01E01",
      "startTime": 120.5,
      "endTime": 180.0,
      "justification": "Why this moment is important",
      "narrativeRole": "intro|development|climax|resolution|key_scene",
      "description": "Brief description of what happens",
      "importance": 8
    }
  ],
  "narrativeOutline": {
    "intro": "Summary of how the season begins",
    "development": "Summary of the main plot development",
    "climax": "Summary of the season's climax",
    "resolution": "Summary of how the season ends"
  },
  "notes": "Any relevant notes about the selection"
}

Respond ONLY with valid JSON.`;
}

/**
 * Prompt template for narrative generation (Mode B)
 */
export function buildNarrativePrompt(
  moments: KeyMoment[],
  language: string,
  seriesContext: { seriesName: string; season: number }
): string {
  const momentsDescription = moments
    .map((m, i) => `${i + 1}. [${m.episodeId}] ${m.description} (${m.narrativeRole})`)
    .join('\n');

  return `You are a professional narrator for TV series recap videos. Create an engaging voiceover script for a video summary of "${seriesContext.seriesName}" Season ${seriesContext.season}.

KEY MOMENTS TO NARRATE:
${momentsDescription}

LANGUAGE: ${language}
TONE: Professional but engaging, like a quality recap video.

INSTRUCTIONS:
1. Write a continuous narrative that guides viewers through the season.
2. Each section should match the corresponding clip's content and duration.
3. Use present tense for immediacy.
4. Avoid spoiling future events within the narrative.
5. Estimate speaking duration (average 150 words per minute).

RESPONSE FORMAT (JSON):
{
  "fullNarrative": "The complete narrative text...",
  "narrativeBlocks": [
    {
      "momentIndex": 0,
      "text": "Narrative for this specific moment...",
      "estimatedDuration": 15.5
    }
  ]
}

Write the narrative in ${language}. Respond ONLY with valid JSON.`;
}
