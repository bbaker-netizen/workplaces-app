/**
 * Anthropic Claude wrapper.
 *
 * Phase 2.1. CLAUDE.md: "All Generate buttons, Soul File RAG" use
 * Anthropic. This module is the single audit point for every API
 * call to Claude — model defaults, prompt caching, error shaping,
 * token accounting all live here.
 *
 * Two surfaces:
 *
 *   - `complete({ system, user, ... })` — single-turn completion,
 *     returns the response text. The 90% case for Generate buttons.
 *
 *   - `streamComplete({ system, user, onToken })` — same but streams
 *     tokens via callback. Used by long-form Generate buttons where
 *     the UI surfaces partial text.
 *
 * Model selection: claude-sonnet-4-6 (the default for built-in
 * features) unless the caller overrides for a specific job. Opus 4.7
 * for the heavy methodology generation (Soul File, business plans,
 * marketing plans). Haiku 4.5 for cheap classification (mention
 * extraction, action item categorization).
 *
 * Prompt caching is enabled for the system prompt by default — every
 * call to a given Generate button hits the same system prompt, so
 * caching is free wins.
 */

import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (or the Netlify dashboard for production).",
    );
  }
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

export type ClaudeModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export type CompletionInput = {
  /** System prompt — pinned to the prompt cache by default. */
  system: string;
  /** User prompt — the one-off content being processed. */
  user: string;
  /** Optional override; defaults to claude-sonnet-4-6. */
  model?: ClaudeModel;
  /** Default 4096. Hard cap by Anthropic per model. */
  maxTokens?: number;
  /** 0–1 sampling. Lower = more deterministic. Default 0.3. */
  temperature?: number;
  /** Disable system-prompt caching for short, dynamic prompts. */
  disableCache?: boolean;
};

export type CompletionResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

/**
 * Single-turn completion. Returns full response text plus token
 * accounting so callers can log spend / surface usage.
 */
export async function complete(
  input: CompletionInput,
): Promise<CompletionResult> {
  const model = input.model ?? "claude-sonnet-4-6";
  const maxTokens = input.maxTokens ?? 4096;
  const temperature = input.temperature ?? 0.3;

  const systemBlocks = input.disableCache
    ? input.system
    : ([
        {
          type: "text" as const,
          text: input.system,
          cache_control: { type: "ephemeral" as const },
        },
      ] satisfies Anthropic.Messages.TextBlockParam[]);

  const response = await client().messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemBlocks,
    messages: [{ role: "user", content: input.user }],
  });

  // Concatenate every text block in the response. Tool use isn't
  // exposed at this layer — Generate buttons are pure text generation.
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Streaming completion. Calls `onToken` with each text delta. Returns
 * the same result shape as `complete` once the stream finishes.
 */
export async function streamComplete(
  input: CompletionInput & { onToken: (delta: string) => void },
): Promise<CompletionResult> {
  const model = input.model ?? "claude-sonnet-4-6";
  const maxTokens = input.maxTokens ?? 4096;
  const temperature = input.temperature ?? 0.3;

  const systemBlocks = input.disableCache
    ? input.system
    : ([
        {
          type: "text" as const,
          text: input.system,
          cache_control: { type: "ephemeral" as const },
        },
      ] satisfies Anthropic.Messages.TextBlockParam[]);

  const stream = client().messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemBlocks,
    messages: [{ role: "user", content: input.user }],
  });

  let text = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      text += event.delta.text;
      input.onToken(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  return {
    text,
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
    cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: final.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Quick classification — short prompt, Haiku, deterministic. Used
 * for things like "is this action item revenue or margin?" or
 * "does this Fireflies utterance imply a commitment?".
 */
export async function classify(
  systemPrompt: string,
  userInput: string,
  options?: { maxTokens?: number },
): Promise<string> {
  const result = await complete({
    system: systemPrompt,
    user: userInput,
    model: "claude-haiku-4-5-20251001",
    maxTokens: options?.maxTokens ?? 256,
    temperature: 0,
  });
  return result.text.trim();
}
