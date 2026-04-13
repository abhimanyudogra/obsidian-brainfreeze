/** Shared types for the LLM abstraction layer */

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface IngestPlan {
  summary: string;
  keyFacts: string[];
  surprises: string[];
  openQuestions: string[];
  plannedPages: PlannedPage[];
  contradictions: string[];
}

export interface PlannedPage {
  path: string;
  action: "create" | "update";
  rationale: string;
}

export interface DraftPage {
  path: string;
  content: string;
  action: "create" | "update";
}

export type VaultType = "personal-finance" | "career" | "health" | "custom";

export type LLMProvider = "anthropic" | "openai" | "ollama";
