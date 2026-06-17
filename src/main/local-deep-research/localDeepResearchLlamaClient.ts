import type {
  LocalDeepResearchChatClient,
  LocalDeepResearchChatCompletion,
  LocalDeepResearchChatCompletionInput,
  LocalDeepResearchChatMessage,
} from "./localDeepResearchRunner";

export interface LocalDeepResearchLlamaChatClientOptions {
  endpointUrl: string;
  fetchImpl?: typeof fetch;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface LocalDeepResearchLlamaChatRequestMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LocalDeepResearchLlamaChatRequest {
  model: string;
  messages: LocalDeepResearchLlamaChatRequestMessage[];
  temperature: number;
  max_tokens: number;
  stream: false;
  chat_template_kwargs: {
    enable_thinking: false;
  };
  reasoning_format: "none";
}

interface LocalDeepResearchLlamaChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
    text?: string;
  }>;
}

export function createLocalDeepResearchLlamaChatClient(options: LocalDeepResearchLlamaChatClientOptions): LocalDeepResearchChatClient {
  const endpoint = normalizeLocalDeepResearchLlamaEndpointUrl(options.endpointUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    complete: async (input) => callLocalDeepResearchLlamaChat({
      ...options,
      endpointUrl: endpoint,
      fetchImpl,
    }, input),
  };
}

export async function callLocalDeepResearchLlamaChat(
  options: Required<Pick<LocalDeepResearchLlamaChatClientOptions, "endpointUrl" | "fetchImpl">> & Omit<LocalDeepResearchLlamaChatClientOptions, "endpointUrl" | "fetchImpl">,
  input: LocalDeepResearchChatCompletionInput,
): Promise<LocalDeepResearchChatCompletion> {
  const endpoint = normalizeLocalDeepResearchLlamaEndpointUrl(options.endpointUrl);
  const request = buildLocalDeepResearchLlamaChatRequest(input, options);
  const controller = new AbortController();
  const timeoutMessage = `Local Deep Research llama-server did not respond within ${options.requestTimeoutMs}ms.`;
  let timeoutFired = false;
  const timeout = options.requestTimeoutMs && options.requestTimeoutMs > 0
    ? setTimeout(() => {
        timeoutFired = true;
        controller.abort();
      }, options.requestTimeoutMs)
    : undefined;
  const externalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) externalAbort();
  else options.signal?.addEventListener("abort", externalAbort, { once: true });
  try {
    const response = await options.fetchImpl(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim();
      throw new Error(
        detail
          ? `Local Deep Research llama-server chat failed (${response.status}): ${detail.slice(0, 240)}`
          : `Local Deep Research llama-server chat failed (${response.status}).`,
      );
    }
    const payload = await readJsonResponse(response, "Local Deep Research llama-server chat response");
    const content = llamaChatResponseText(payload);
    if (!content) {
      const reasoning = llamaChatResponseReasoningText(payload);
      if (reasoning) {
        throw new Error(`Local Deep Research llama-server returned reasoning-only output without an assistant message (${reasoning.length} chars) even though the request disables llama.cpp thinking. Inspect the selected chat template or runtime version.`);
      }
      throw new Error("Local Deep Research llama-server returned an empty assistant message.");
    }
    return { content, raw: payload };
  } catch (error) {
    if (timeoutFired) throw new Error(timeoutMessage);
    if (isAbortError(error) || options.signal?.aborted) throw new Error("Local Deep Research llama-server chat request was canceled.");
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}

export function buildLocalDeepResearchLlamaChatRequest(
  input: LocalDeepResearchChatCompletionInput,
  options: Pick<LocalDeepResearchLlamaChatClientOptions, "modelId" | "temperature" | "maxTokens"> = {},
): LocalDeepResearchLlamaChatRequest {
  return {
    model: options.modelId?.trim() || input.setup.modelInstall.selectedProfileId,
    messages: localDeepResearchMessagesForLlama(input.messages),
    temperature: normalizeNumber(options.temperature, 0, 2, 0.2),
    max_tokens: normalizeInteger(options.maxTokens, 1, 8192, 4096),
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
    reasoning_format: "none",
  };
}

export function localDeepResearchMessagesForLlama(messages: LocalDeepResearchChatMessage[]): LocalDeepResearchLlamaChatRequestMessage[] {
  return messages.map((message): LocalDeepResearchLlamaChatRequestMessage => {
    if (message.role === "tool") {
      const label = message.name ? `Tool observation from ${message.name}` : "Tool observation";
      return {
        role: "user",
        content: `${label}${message.toolCallId ? ` (${message.toolCallId})` : ""}:\n${message.content}`,
      };
    }
    return {
      role: message.role,
      content: message.content,
    };
  });
}

export function normalizeLocalDeepResearchLlamaEndpointUrl(endpointUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl.trim());
  } catch {
    throw new Error(`Invalid Local Deep Research llama-server endpoint URL: ${endpointUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Local Deep Research llama-server endpoint must use http:// or https://.");
  }
  if (!isLocalHostname(parsed.hostname)) {
    throw new Error("Local Deep Research llama-server endpoint must be local-only: use localhost, 127.0.0.1, or [::1].");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Local Deep Research llama-server endpoint must be the endpoint origin, not a /v1 or request path.");
  }
  parsed.pathname = "";
  return parsed.toString().replace(/\/$/, "");
}

function llamaChatResponseText(payload: unknown): string | undefined {
  const response = objectRecord(payload) as LocalDeepResearchLlamaChatResponse;
  const choice = response.choices?.[0];
  const content = choice?.message?.content ?? choice?.text;
  return typeof content === "string" && content.trim() ? content.trim() : undefined;
}

function llamaChatResponseReasoningText(payload: unknown): string | undefined {
  const response = objectRecord(payload) as LocalDeepResearchLlamaChatResponse;
  const content = response.choices?.[0]?.message?.reasoning_content;
  return typeof content === "string" && content.trim() ? content.trim() : undefined;
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function normalizeNumber(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeInteger(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /abort|cancel|timeout/i.test(error.message));
}
