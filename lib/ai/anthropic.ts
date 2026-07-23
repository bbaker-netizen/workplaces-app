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
 * Model selection: claude-sonnet-5 (the default for built-in
 * features) unless the caller overrides for a specific job. Opus 4.8
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
  | "claude-opus-4-8"
  | "claude-sonnet-5"
  | "claude-haiku-4-5-20251001";

/**
 * Newer Claude models (Opus 4.7 / 4.8, Sonnet 5, Fable 5) REMOVED the
 * sampling parameters — sending `temperature` / `top_p` / `top_k` to them
 * returns a 400 `invalid_request_error`. Only the 4.5/4.6-era models (here,
 * Haiku 4.5) still accept them. We allowlist the models that accept
 * sampling and omit the param for the rest, so Opus 4.8 and Sonnet 5 (both
 * in the current registry) run at the API default rather than 400ing.
 * Adding an older model back to the registry is the only case that needs a
 * new allowlist entry here.
 */
function modelAcceptsSampling(model: ClaudeModel): boolean {
  return model.startsWith("claude-haiku-4-5");
}

export type CompletionInput = {
  /** System prompt — pinned to the prompt cache by default. */
  system: string;
  /** User prompt — the one-off content being processed. */
  user: string;
  /** Optional override; defaults to claude-sonnet-5. */
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
  const model = input.model ?? "claude-sonnet-5";
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
    // Only send temperature to models that accept it (see note above).
    ...(modelAcceptsSampling(model) ? { temperature } : {}),
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

export type ImageInput = {
  /** Base64-encoded image bytes (no data: prefix). */
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

/**
 * Single-turn completion with one image attached — Claude vision. Used
 * by the business-card scanner to read contact details off a photo.
 * Same result shape as `complete`.
 */
export async function completeWithImage(input: {
  system: string;
  user: string;
  image: ImageInput;
  model?: ClaudeModel;
  maxTokens?: number;
  temperature?: number;
}): Promise<CompletionResult> {
  const model = input.model ?? "claude-sonnet-5";
  const response = await client().messages.create({
    model,
    max_tokens: input.maxTokens ?? 1024,
    ...(modelAcceptsSampling(model)
      ? { temperature: input.temperature ?? 0 }
      : {}),
    system: input.system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.image.mediaType,
              data: input.image.base64,
            },
          },
          { type: "text", text: input.user },
        ],
      },
    ],
  });

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
  const model = input.model ?? "claude-sonnet-5";
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
    ...(modelAcceptsSampling(model) ? { temperature } : {}),
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
