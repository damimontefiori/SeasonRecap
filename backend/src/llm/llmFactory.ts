import { LLMProvider, LLMProviderConfig, LLMProviderType } from './types';
import { OpenAILLMProvider } from './openaiProvider';
import { AnthropicLLMProvider } from './anthropicProvider';
import { config } from '../config';

/**
 * Factory function to create LLM providers
 */
export function createLLMProvider(providerType: LLMProviderType): LLMProvider {
  switch (providerType) {
    case 'openai':
      console.log(`Creating OpenAI provider with API key: ${config.openaiApiKey ? config.openaiApiKey.substring(0, 10) + '...' : 'MISSING!'}`);
      return new OpenAILLMProvider({
        type: 'openai',
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        apiBase: config.openaiApiBase,
        maxRetries: config.llmMaxRetries,
      });

    case 'anthropic':
      return new AnthropicLLMProvider({
        type: 'anthropic',
        apiKey: config.anthropicApiKey,
        model: config.anthropicModel,
        maxRetries: config.llmMaxRetries,
      });

    case 'anthropic-opus':
      console.log(`Creating Anthropic Opus provider with model: ${config.anthropicOpusModel}`);
      return new AnthropicLLMProvider({
        type: 'anthropic',
        apiKey: config.anthropicApiKey,
        model: config.anthropicOpusModel,
        maxRetries: config.llmMaxRetries,
      });

    default:
      throw new Error(`Unknown LLM provider type: ${providerType as string}`);
  }
}

/**
 * Creates an LLM provider from a custom config
 */
export function createLLMProviderFromConfig(providerConfig: LLMProviderConfig): LLMProvider {
  switch (providerConfig.type) {
    case 'openai':
      return new OpenAILLMProvider(providerConfig);
    case 'anthropic':
      return new AnthropicLLMProvider(providerConfig);
    default:
      throw new Error(`Unknown LLM provider type: ${providerConfig.type as string}`);
  }
}

/**
 * Tests all configured providers and returns availability
 */
export async function testAllProviders(): Promise<Map<LLMProviderType, boolean>> {
  const results = new Map<LLMProviderType, boolean>();

  const providers: LLMProviderType[] = ['openai', 'anthropic', 'anthropic-opus'];

  for (const providerType of providers) {
    try {
      const provider = createLLMProvider(providerType);
      const isAvailable = await provider.testConnection();
      results.set(providerType, isAvailable);
    } catch {
      results.set(providerType, false);
    }
  }

  return results;
}
