import Anthropic from "@anthropic-ai/sdk";
import { LLMProviderBase } from "./provider";
import { LLMMessage, LLMResponse } from "./types";

export class AnthropicProvider extends LLMProviderBase {
  readonly name = "anthropic";
  private client: Anthropic | null = null;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-20250514") {
    super();
    this.apiKey = apiKey;
    this.model = model;
    if (apiKey) {
      this.client = new Anthropic({ apiKey, maxRetries: 5, dangerouslyAllowBrowser: true });
    }
  }

  isConfigured(): boolean {
    return !!this.client && !!this.apiKey;
  }

  async chat(
    system: string,
    messages: LLMMessage[],
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<LLMResponse> {
    if (!this.client) throw new Error("Anthropic API key not configured");

    // Use streaming API unconditionally — the SDK hard-blocks non-streaming
    // requests whose max_tokens budget projects a runtime past the 10-minute
    // HTTP timeout. Streaming also avoids idle-connection drops on slow
    // generations. finalMessage() still aggregates for us, so the call site
    // gets the same Message shape we'd get from create().
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
      system,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const response = await stream.finalMessage();

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return {
      content: text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  updateApiKey(apiKey: string) {
    this.apiKey = apiKey;
    this.client = apiKey
      ? new Anthropic({ apiKey, maxRetries: 5, dangerouslyAllowBrowser: true })
      : null;
  }

  updateModel(model: string) {
    this.model = model;
  }
}
