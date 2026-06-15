import type { Context, Model } from "@mariozechner/pi-ai";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai/openai-completions";
import { normalizeAmbientModelId } from "../shared/ambientModels";
import { isRetryableAmbientProviderError, retryDelayForAttempt, type AmbientRetryPolicy } from "./aggressiveRetries";
import { readAmbientApiKey } from "./credentialStore";
import { normalizeAmbientBaseUrl } from "./providerStatus";

interface GenerateThreadTitleInput {
  prompt: string;
  workspaceName: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  retryPolicy?: AmbientRetryPolicy;
  waitForRetry?: (delayMs: number) => Promise<void>;
}

interface AmbientChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
}

const MAX_TITLE_LENGTH = 48;
const TITLE_REQUEST_TIMEOUT_MS = 45_000;
const GENERIC_THREAD_TITLE_PATTERN = /^(?:continuation request|continue request|follow[- ]?up request|follow[- ]?up|new chat|chat|request|final_chat_title)$/i;

export async function generateThreadTitle(input: GenerateThreadTitleInput): Promise<string | undefined> {
  const apiKey = (input.apiKey ?? readAmbientApiKey() ?? "").trim();
  if (!apiKey) return undefined;
  if (!input.retryPolicy?.enabled || input.retryPolicy.maxRetries <= 0) return generateThreadTitleOnce(input, apiKey);

  let transientFailures = 0;
  let lastError: unknown;
  for (let attempt = 1; attempt <= input.retryPolicy.maxRetries + 1; attempt += 1) {
    try {
      return await generateThreadTitleOnce(input, apiKey);
    } catch (error) {
      lastError = error;
      if (!isRetryableAmbientProviderError(error)) throw error;
      transientFailures += 1;
      if (transientFailures > input.retryPolicy.maxRetries) break;
      await (input.waitForRetry ?? waitForThreadTitleRetry)(retryDelayForAttempt(input.retryPolicy, transientFailures));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function generateThreadTitleOnce(input: GenerateThreadTitleInput, apiKey: string): Promise<string | undefined> {
  if (input.fetchImpl) return generateThreadTitleWithFetch(input, apiKey);

  const model = titleModel(input.model, normalizeAmbientBaseUrl(input.baseUrl));
  const stream = streamSimpleOpenAICompletions(
    model,
    titleContext(input),
    {
      apiKey,
      cacheRetention: "none",
      maxTokens: 128,
      maxRetries: 0,
      reasoning: "minimal",
      temperature: 0.2,
      timeoutMs: 45_000,
    },
  );
  const result = await stream.result();
  if (result.stopReason === "error" || result.errorMessage) {
    throw new Error(result.errorMessage || "Ambient title request returned an error.");
  }
  return sanitizeThreadTitle(titleTextFromContent(result.content)) ?? fallbackThreadTitleFromPrompt(input.prompt);
}

function waitForThreadTitleRetry(delayMs: number): Promise<void> {
  return delayMs <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, delayMs));
}

function titleTextFromContent(content: Awaited<ReturnType<ReturnType<typeof streamSimpleOpenAICompletions>["result"]>>["content"]): string {
  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
  const textMarker = extractMarkedTitle(text);
  if (textMarker) return textMarker;
  if (text) return text;
  const thinking = content
    .filter((part) => part.type === "thinking")
    .map((part) => part.thinking)
    .join("\n")
    .trim();
  return extractMarkedTitle(thinking) ?? "";
}

function extractMarkedTitle(value: string): string | undefined {
  const match = value.match(/FINAL_CHAT_TITLE\s*=\s*([^\n\r]+)/i);
  const title = match?.[1]?.trim();
  if (!title || /<title>|concise title|^\.+$/i.test(title)) return undefined;
  return title;
}

async function generateThreadTitleWithFetch(input: GenerateThreadTitleInput, apiKey: string): Promise<string | undefined> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), TITLE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(`${normalizeAmbientBaseUrl(input.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: normalizeAmbientModelId(input.model),
        messages: [
          {
            role: "system",
            content:
              "Name this coding-agent chat from the first user request. Return one concise title using exactly this form: FINAL_CHAT_TITLE=<title>. Avoid generic titles like Continuation Request, Follow-up, New Chat, Chat, or Request. No explanation.",
          },
          {
            role: "user",
            content: [
              `Workspace: ${input.workspaceName}`,
              "First user request:",
              input.prompt.trim().slice(0, 4000),
              "",
              `Title limit: ${MAX_TITLE_LENGTH} characters.`,
            ].join("\n"),
          },
        ],
        temperature: 0.2,
        max_tokens: 24,
        stream: false,
      }),
    });
  } catch (error) {
    if (abortController.signal.aborted) throw new Error(`Ambient title request timed out after ${TITLE_REQUEST_TIMEOUT_MS}ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim();
    throw new Error(detail ? `Ambient title request failed (${response.status}): ${detail.slice(0, 180)}` : `Ambient title request failed (${response.status}).`);
  }

  const payload = (await response.json()) as AmbientChatCompletionResponse;
  return sanitizeThreadTitle(payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "") ?? fallbackThreadTitleFromPrompt(input.prompt);
}

function titleModel(modelId: string, baseUrl: string): Model<"openai-completions"> {
  const normalizedModelId = normalizeAmbientModelId(modelId);
  return {
    id: normalizedModelId,
    name: normalizedModelId,
    api: "openai-completions",
    provider: "ambient",
    baseUrl,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "zai",
      zaiToolStream: true,
    },
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 200000,
    maxTokens: 131072,
  };
}

function titleContext(input: GenerateThreadTitleInput): Context {
  return {
    systemPrompt:
      "Name this coding-agent chat from the first user request. Return one concise title using exactly this form: FINAL_CHAT_TITLE=<title>. If you produce reasoning, include the same FINAL_CHAT_TITLE line there too. Avoid generic titles like Continuation Request, Follow-up, New Chat, Chat, or Request. No explanation.",
    messages: [
      {
        role: "user",
        content: [
          `Workspace: ${input.workspaceName}`,
          "First user request:",
          input.prompt.trim().slice(0, 4000),
          "",
          `Title limit: ${MAX_TITLE_LENGTH} characters.`,
        ].join("\n"),
        timestamp: Date.now(),
      },
    ],
  };
}

export function sanitizeThreadTitle(value: string): string | undefined {
  let title = value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^FINAL_CHAT_TITLE\s*=\s*/i, "")
    .replace(/^FINAL_CHAT_TITLE\s*$/i, "")
    .replace(/^title\s*:\s*/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  title = title.replace(/[.。!！?？:：;；,\s]+$/g, "").trim();
  if (!title) return undefined;
  if (GENERIC_THREAD_TITLE_PATTERN.test(title)) return undefined;
  if (title.length <= MAX_TITLE_LENGTH) return title;
  return title.slice(0, MAX_TITLE_LENGTH).replace(/\s+\S*$/, "").trim() || title.slice(0, MAX_TITLE_LENGTH).trim();
}

export function fallbackThreadTitleFromPrompt(prompt: string): string | undefined {
  const firstMeaningfulLine = prompt
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:please\s+)?/i, "").replace(/\s+/g, " ").trim())
    .find((line) => line.length > 0);
  return firstMeaningfulLine ? sanitizeThreadTitle(firstMeaningfulLine) : undefined;
}
