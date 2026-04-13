import { LLMMessage, LLMResponse } from "./types";

/**
 * Abstract LLM provider interface.
 * Swap implementations without changing any calling code.
 */
export abstract class LLMProviderBase {
  abstract readonly name: string;

  abstract chat(
    system: string,
    messages: LLMMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse>;

  abstract isConfigured(): boolean;

  /**
   * Build the system prompt by combining the vault's CLAUDE.md schema
   * with the operation-specific instructions.
   */
  buildSystemPrompt(schema: string, operation: string): string {
    return `${schema}\n\n---\n\nYou are performing the following operation:\n${operation}`;
  }
}
