import type { AssistantMessage, Context, Model, SimpleStreamOptions, ThinkingLevel, Tool, ToolCall } from "@mariozechner/pi-ai";
import { validateToolCall } from "@mariozechner/pi-ai";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai/openai-completions";
import { ambientModelLabel, normalizeAmbientModelId } from "../../shared/ambientModels";
import {
  AmbientStreamFailureError,
  isRetryableAmbientProviderError,
  retryDelayForAttempt,
  type AmbientRetryPolicy,
  type AmbientStreamFailureKind,
} from "../aggressiveRetries";
import { normalizeAmbientBaseUrl } from "../provider/providerStatus";

export type WorkflowPiProgressStage = "waiting" | "thinking" | "streaming" | "retrying" | "completed";

export interface WorkflowPiProgress {
  outputChars: number;
  thinkingChars: number;
  elapsedMs: number;
  idleElapsedMs?: number;
  idleTimeoutMs?: number;
  absoluteTimeoutMs?: number;
  timeoutMode?: "idle_watchdog" | "elapsed_hard_limit";
  stage: WorkflowPiProgressStage;
}

export interface WorkflowPiCompletionMetadata {
  finishReason?: string;
  stopReason?: string;
  usage?: unknown;
  outputChars: number;
  thinkingChars: number;
  maxTokens?: number;
  toolRound: number;
}

export interface WorkflowPiToolExecutionResult {
  text: string;
  isError?: boolean;
  details?: unknown;
}

export interface WorkflowPiToolProgress {
  toolCallId: string;
  toolName: string;
  status: "running" | "done" | "error";
  elapsedMs?: number;
  inputSummary?: string;
  resultSummary?: string;
  error?: string;
}

export type WorkflowPiToolChoice =
  | "auto"
  | "none"
  | "required"
  | {
      type: "function";
      function: { name: string };
    };

export type AmbientResponseFormat =
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        strict?: boolean;
        schema: unknown;
      };
    };

type WorkflowPiStreamEvent = {
  type: string;
  delta?: string;
  content?: string;
  message?: AssistantMessage;
  error?: AssistantMessage;
  toolCall?: ToolCall;
};

type WorkflowPiStreamFactory = (
  model: Model<"openai-completions">,
  context: Context,
  options: SimpleStreamOptions,
) => AsyncIterable<WorkflowPiStreamEvent>;

export interface WorkflowPiTextCallInput {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
  reasoning?: ThinkingLevel | false;
  responseFormat?: AmbientResponseFormat;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  absoluteTimeoutMs?: number;
  enforceAbsoluteTimeout?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: WorkflowPiProgress) => void;
  tools?: Tool[];
  initialToolChoice?: WorkflowPiToolChoice;
  maxToolRounds?: number;
  executeTool?: (toolCall: ToolCall, validatedArgs: unknown) => Promise<string | WorkflowPiToolExecutionResult>;
  onToolProgress?: (progress: WorkflowPiToolProgress) => void;
  onCompleted?: (metadata: WorkflowPiCompletionMetadata) => void;
  streamFactory?: WorkflowPiStreamFactory;
  retryPolicy?: AmbientRetryPolicy;
  waitForRetry?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface WorkflowPiJsonCallInput<T> extends Omit<WorkflowPiTextCallInput, "responseFormat"> {
  schemaName: string;
  responseSchema: unknown;
  strict?: boolean;
  validate?: (value: unknown) => T;
  maxValidationRetries?: number;
  textCall?: (input: WorkflowPiTextCallInput) => Promise<string>;
}

export class WorkflowPiJsonValidationError extends Error {
  readonly responseText: string;

  constructor(message: string, responseText: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WorkflowPiJsonValidationError";
    this.responseText = responseText;
  }
}

const WORKFLOW_PI_PROGRESS_HEARTBEAT_MS = 5_000;
const WORKFLOW_PI_TOOL_HEARTBEAT_MS = 5_000;
export const DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_WORKFLOW_PI_JSON_VALIDATION_RETRIES = 1;
const MAX_WORKFLOW_PI_TOOL_ROUNDS = 16;

export function ambientJsonSchemaResponseFormat(input: {
  name: string;
  schema: unknown;
  strict?: boolean;
}): AmbientResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name: normalizeAmbientResponseSchemaName(input.name),
      strict: input.strict ?? true,
      schema: input.schema,
    },
  };
}

export function normalizeAmbientResponseSchemaName(name: string): string {
  const normalized = name
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "ambient_json_schema";
}

export async function callWorkflowPiText(input: WorkflowPiTextCallInput): Promise<string> {
  const retryPolicy = input.retryPolicy;
  if (!retryPolicy?.enabled || retryPolicy.maxRetries <= 0) {
    return callWorkflowPiTextOnce(input);
  }

  let transientFailures = 0;
  let lastError: unknown;
  const retryLoopStartedAt = Date.now();
  for (let attempt = 1; attempt <= retryPolicy.maxRetries + 1; attempt += 1) {
    try {
      return await callWorkflowPiTextOnce(input);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableAmbientProviderError(error);
      if (!retryable) throw error;
      transientFailures += 1;
      if (transientFailures > retryPolicy.maxRetries) break;
      const retryDelayMs = retryDelayForAttempt(retryPolicy, transientFailures);
      input.onProgress?.({
        outputChars: 0,
        thinkingChars: 0,
        elapsedMs: Date.now() - retryLoopStartedAt,
        idleElapsedMs: 0,
        idleTimeoutMs: input.idleTimeoutMs,
        stage: "retrying",
      });
      await (input.waitForRetry ?? waitForWorkflowPiRetry)(retryDelayMs, input.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function callWorkflowPiJson<T = unknown>(input: WorkflowPiJsonCallInput<T>): Promise<T> {
  const {
    schemaName,
    responseSchema,
    strict,
    validate,
    maxValidationRetries = DEFAULT_WORKFLOW_PI_JSON_VALIDATION_RETRIES,
    textCall,
    ...textInput
  } = input;
  const responseFormat = ambientJsonSchemaResponseFormat({ name: schemaName, schema: responseSchema, strict });
  const callText = textCall ?? callWorkflowPiText;
  const retryLimit = Math.max(0, Math.floor(maxValidationRetries));
  let prompt = input.prompt;
  let lastError: unknown;
  let lastResponseText = "";

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    const responseText = await callText({
      ...textInput,
      prompt,
      reasoning: input.reasoning ?? false,
      responseFormat,
    });
    lastResponseText = responseText;
    try {
      const parsed = parseWorkflowPiJsonResponse(responseText);
      return validate ? validate(parsed) : (parsed as T);
    } catch (error) {
      lastError = error;
      if (attempt >= retryLimit) break;
      prompt = workflowPiJsonRetryPrompt(input.prompt, schemaName, error);
    }
  }

  throw new WorkflowPiJsonValidationError(
    `Ambient/Pi JSON response for ${normalizeAmbientResponseSchemaName(schemaName)} failed validation: ${errorMessage(lastError)}`,
    lastResponseText,
    lastError,
  );
}

async function callWorkflowPiTextOnce(input: WorkflowPiTextCallInput): Promise<string> {
  const apiKey = (input.apiKey ?? "").trim();
  if (!apiKey) throw new Error("Ambient API key is not configured.");

  const startedAt = Date.now();
  let outputText = "";
  let thinkingText = "";
  let observedOutputChars = 0;
  let observedThinkingChars = 0;
  let observedToolCall = false;
  let observedToolResult = false;
  let currentStreamStarted = false;
  let lastProgressAt = 0;
  let lastStreamActivityAt = startedAt;
  let lastProgressStage: WorkflowPiProgressStage | undefined;
  const emitProgress = (stage: WorkflowPiProgressStage, force = false) => {
    if (!input.onProgress) return;
    const now = Date.now();
    if (!force && stage === lastProgressStage && now - lastProgressAt < 500) return;
    lastProgressAt = now;
    lastProgressStage = stage;
    input.onProgress({
      outputChars: outputText.length,
      thinkingChars: thinkingText.length,
      elapsedMs: now - startedAt,
      idleElapsedMs: Math.max(0, now - lastStreamActivityAt),
      idleTimeoutMs,
      ...(enforceAbsoluteTimeout ? { absoluteTimeoutMs } : {}),
      timeoutMode: enforceAbsoluteTimeout ? "elapsed_hard_limit" : "idle_watchdog",
      stage,
    });
  };
  const abortController = new AbortController();
  let timeoutError: Error | undefined;
  const idleTimeoutMs = Math.max(1, Math.floor(input.idleTimeoutMs ?? input.timeoutMs ?? DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS));
  const absoluteTimeoutMs = input.absoluteTimeoutMs === undefined ? undefined : Math.max(1, Math.floor(input.absoluteTimeoutMs));
  const enforceAbsoluteTimeout = input.enforceAbsoluteTimeout === true;
  let idleTimeout: ReturnType<typeof setTimeout> | undefined;
  const abortWith = (error: Error) => {
    timeoutError = error;
    abortController.abort(error);
  };
  const throwIfAborted = () => {
    if (timeoutError && abortController.signal.aborted) throw timeoutError;
  };
  const onExternalAbort = () => {
    const reason = input.signal?.reason;
    abortWith(ambientStreamFailure("user_abort", reason instanceof Error ? reason.message : "Ambient/Pi workflow request canceled.", { cause: reason }));
  };
  if (input.signal) {
    if (input.signal.aborted) onExternalAbort();
    else input.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const resetIdleTimeout = () => {
    if (idleTimeout) clearTimeout(idleTimeout);
    lastStreamActivityAt = Date.now();
    idleTimeout = setTimeout(() => {
      abortWith(
        ambientStreamFailure(
          currentStreamStarted ? "stream_idle_timeout" : "pre_stream_timeout",
          currentStreamStarted
            ? `Ambient/Pi stream stalled after ${idleTimeoutMs}ms without stream activity.`
            : `Ambient/Pi did not start streaming within ${idleTimeoutMs}ms.`,
        ),
      );
    }, idleTimeoutMs);
  };
  resetIdleTimeout();
  const absoluteTimeout =
    absoluteTimeoutMs === undefined || !enforceAbsoluteTimeout
      ? undefined
      : setTimeout(() => {
          abortWith(new Error(`Ambient/Pi workflow request exceeded the ${absoluteTimeoutMs}ms absolute progress deadline.`));
        }, absoluteTimeoutMs);
  const heartbeat = setInterval(() => {
    emitProgress(outputText.length > 0 ? "streaming" : thinkingText.length > 0 ? "thinking" : "waiting", true);
  }, WORKFLOW_PI_PROGRESS_HEARTBEAT_MS);

  try {
    emitProgress("waiting", true);
    throwIfAborted();
    const baseStreamOptions: SimpleStreamOptions = {
      apiKey,
      cacheRetention: "short",
      maxRetries: 0,
      maxTokens: input.maxTokens,
      sessionId: input.sessionId,
      signal: abortController.signal,
      temperature: input.temperature,
      timeoutMs: enforceAbsoluteTimeout ? input.absoluteTimeoutMs ?? input.timeoutMs : undefined,
    };
    const context = workflowPiContext(input);
    const maxToolRounds =
      input.tools && input.executeTool ? Math.max(0, Math.min(MAX_WORKFLOW_PI_TOOL_ROUNDS, Math.floor(input.maxToolRounds ?? 3))) : 0;
    const streamFactory = input.streamFactory ?? streamSimpleOpenAICompletions;
    for (let toolRound = 0; toolRound <= maxToolRounds; toolRound += 1) {
      outputText = "";
      thinkingText = "";
      const onPayload = workflowPiPayloadTransform(input, toolRound);
      const streamOptions: SimpleStreamOptions = {
        ...baseStreamOptions,
        ...(input.reasoning ? { reasoning: input.reasoning } : {}),
        ...(onPayload ? { onPayload } : {}),
      };
      const stream = streamFactory(workflowPiModel(input.model, input.baseUrl), context, streamOptions);
      const iterator = stream[Symbol.asyncIterator]();
      let finalMessage: AssistantMessage | undefined;
      let sawTerminalEvent = false;
      currentStreamStarted = false;
      try {
        while (true) {
          let next: IteratorResult<WorkflowPiStreamEvent>;
          try {
            next = await nextStreamEvent(iterator, abortController.signal);
          } catch (error) {
            if (error instanceof AmbientStreamFailureError) throw error;
            if (timeoutError && abortController.signal.aborted) throw timeoutError;
            throw ambientStreamFailure("network_abort", `Ambient/Pi stream read failed: ${errorMessage(error)}`, { cause: error });
          }
          if (next.done) break;
          const event = next.value;
          currentStreamStarted = true;
          throwIfAborted();
          resetIdleTimeout();
          if (event.type === "text_delta") {
            outputText += event.delta ?? "";
            observedOutputChars += (event.delta ?? "").length;
            emitProgress("streaming");
          } else if (event.type === "text_end" && outputText.length === 0) {
            outputText = event.content ?? "";
            observedOutputChars += outputText.length;
            emitProgress("streaming", true);
          } else if (event.type === "thinking_delta") {
            thinkingText += event.delta ?? "";
            observedThinkingChars += (event.delta ?? "").length;
            emitProgress("thinking");
          } else if (event.type === "thinking_end" && thinkingText.length === 0) {
            thinkingText = event.content ?? "";
            observedThinkingChars += thinkingText.length;
            emitProgress("thinking", true);
          } else if (event.type === "toolcall_end") {
            observedToolCall = true;
            input.onToolProgress?.({
              toolCallId: event.toolCall?.id ?? "",
              toolName: event.toolCall?.name ?? "",
              status: "running",
              inputSummary: summarizeToolArguments(event.toolCall?.arguments),
            });
          } else if (event.type === "done") {
            sawTerminalEvent = true;
            finalMessage = event.message;
          } else if (event.type === "error") {
            throw ambientStreamFailure(
              "provider_error_event",
              workflowPiStreamErrorMessage(event.error?.errorMessage || "Ambient/Pi workflow request returned an error.", {
                startedAt,
                lastStreamActivityAt,
                outputChars: outputText.length,
                thinkingChars: thinkingText.length,
              }),
            );
          }
          throwIfAborted();
        }
        if (!sawTerminalEvent) {
          throw ambientStreamFailure("stream_closed_before_done", "Ambient/Pi stream ended before completion.");
        }
      } finally {
        void iterator.return?.().catch(() => undefined);
      }
      const text = outputText.trim() ? outputText : assistantText(finalMessage);
      if (!finalMessage) {
        outputText = text;
        input.onCompleted?.(workflowPiCompletionMetadata(undefined, { text, thinkingText, maxTokens: input.maxTokens, toolRound }));
        emitProgress("completed", true);
        return text;
      }
      const toolCalls = finalMessage.content.filter((block): block is ToolCall => block.type === "toolCall");
      if (toolCalls.length === 0 || !input.executeTool || !input.tools || input.tools.length === 0) {
        outputText = text;
        input.onCompleted?.(workflowPiCompletionMetadata(finalMessage, { text, thinkingText, maxTokens: input.maxTokens, toolRound }));
        emitProgress("completed", true);
        return text;
      }
      context.messages.push(finalMessage);
      if (toolRound >= maxToolRounds) {
        throw new Error(`Ambient/Pi requested ${toolCalls.length} tool call${toolCalls.length === 1 ? "" : "s"} after the ${maxToolRounds}-round tool budget was exhausted.`);
      }
      for (const toolCall of toolCalls) {
        const toolStartedAt = Date.now();
        const inputSummary = summarizeToolArguments(toolCall.arguments);
        let toolHeartbeat: ReturnType<typeof setInterval> | undefined;
        if (input.onToolProgress) {
          toolHeartbeat = setInterval(() => {
            const elapsedMs = Date.now() - toolStartedAt;
            input.onToolProgress?.({
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              status: "running",
              elapsedMs,
              inputSummary,
              resultSummary: `Still running after ${Math.max(1, Math.round(elapsedMs / 1000))}s.`,
            });
          }, WORKFLOW_PI_TOOL_HEARTBEAT_MS);
        }
        let isError = false;
        let resultText = "";
        let details: unknown;
        try {
          const validatedArgs = validateToolCall(input.tools, toolCall);
          const result = await input.executeTool(toolCall, validatedArgs);
          if (typeof result === "string") {
            resultText = result;
          } else {
            resultText = result.text;
            isError = result.isError === true;
            details = result.details;
          }
        } catch (error) {
          isError = true;
          resultText = error instanceof Error ? error.message : String(error);
        } finally {
          if (toolHeartbeat) clearInterval(toolHeartbeat);
        }
        input.onToolProgress?.({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          status: isError ? "error" : "done",
          elapsedMs: Date.now() - toolStartedAt,
          inputSummary,
          resultSummary: resultText.replace(/\s+/g, " ").trim().slice(0, 240),
          ...(isError ? { error: resultText } : {}),
        });
        observedToolResult = true;
        context.messages.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: [{ type: "text", text: resultText }],
          ...(details === undefined ? {} : { details }),
          isError,
          timestamp: Date.now(),
        });
      }
      emitProgress("retrying", true);
    }
    throw new Error("Ambient/Pi workflow request exited before producing a final response.");
  } catch (error) {
    if (timeoutError && abortController.signal.aborted) throw timeoutError;
    throw error;
  } finally {
    if (idleTimeout) clearTimeout(idleTimeout);
    if (absoluteTimeout) clearTimeout(absoluteTimeout);
    input.signal?.removeEventListener("abort", onExternalAbort);
    clearInterval(heartbeat);
  }

  function ambientStreamFailure(
    kind: AmbientStreamFailureKind,
    message: string,
    inputOptions: { cause?: unknown } = {},
  ): AmbientStreamFailureError {
    return new AmbientStreamFailureError(kind, message, {
      responseCharCount: observedOutputChars + observedThinkingChars,
      semanticOutputSeen: observedOutputChars > 0 || observedThinkingChars > 0 || observedToolResult,
      toolCallSeen: observedToolCall || observedToolResult,
      ...inputOptions,
    });
  }
}

function waitForWorkflowPiRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Ambient/Pi workflow request canceled."));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Ambient/Pi workflow request canceled."));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseWorkflowPiJsonResponse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("response was empty");
  const candidates = workflowPiJsonResponseCandidates(trimmed);
  const errors: string[] = [];
  for (const candidate of candidates) {
    for (const repair of [candidate, removeTrailingJsonCommas(candidate)]) {
      try {
        return JSON.parse(repair);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
  }
  throw new Error(`response did not contain valid JSON after syntax repair attempts: ${errors[0] ?? "unknown parse error"}`);
}

function workflowPiJsonRetryPrompt(originalPrompt: string, schemaName: string, error: unknown): string {
  return [
    originalPrompt,
    "",
    `Previous response failed deterministic JSON validation for schema "${normalizeAmbientResponseSchemaName(schemaName)}": ${errorMessage(error)}`,
    "Return one JSON value only. Do not include markdown fences, comments, prose, or any fields outside the requested schema.",
  ].join("\n");
}

function workflowPiJsonResponseCandidates(trimmed: string): string[] {
  const candidates = [trimmed];
  const fenced = firstJsonFenceBody(trimmed);
  if (fenced) candidates.push(fenced);
  const balanced = firstBalancedJsonValue(trimmed);
  if (balanced) candidates.push(balanced);
  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
}

function firstJsonFenceBody(text: string): string | undefined {
  const match = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(text);
  return match?.[1]?.trim();
}

function firstBalancedJsonValue(text: string): string | undefined {
  const start = text.search(/[\[{]/);
  if (start < 0) return undefined;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

function removeTrailingJsonCommas(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      result += char;
      continue;
    }
    if (char === ",") {
      const next = text.slice(index + 1).match(/^\s*([\]}])/);
      if (next) continue;
    }
    result += char;
  }
  return result;
}

function workflowPiPayloadTransform(input: WorkflowPiTextCallInput, toolRound: number): SimpleStreamOptions["onPayload"] | undefined {
  const initialToolChoice = toolRound === 0 ? input.initialToolChoice : undefined;
  if (input.reasoning !== false && !input.responseFormat && !initialToolChoice) return undefined;
  return (payload) => {
    let next = payload;
    if (input.reasoning === false) next = disableZaiThinkingPayload(next);
    if (input.responseFormat && next && typeof next === "object" && !Array.isArray(next)) {
      next = {
        ...next,
        response_format: input.responseFormat,
      };
    }
    if (initialToolChoice && next && typeof next === "object" && !Array.isArray(next)) {
      next = {
        ...next,
        tool_choice: initialToolChoice,
      };
    }
    return next;
  };
}

function disableZaiThinkingPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return {
    ...payload,
    thinking: { type: "disabled" },
    reasoning: { effort: "none", enabled: false, exclude: true },
    enable_thinking: false,
  };
}

function workflowPiStreamErrorMessage(
  message: string,
  input: { startedAt: number; lastStreamActivityAt: number; outputChars: number; thinkingChars: number },
): string {
  const now = Date.now();
  return `${message} after ${formatDurationMs(now - input.startedAt)} (${input.outputChars.toLocaleString()} output chars, ${input.thinkingChars.toLocaleString()} thinking chars, idle ${formatDurationMs(now - input.lastStreamActivityAt)}).`;
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function workflowPiContext(input: WorkflowPiTextCallInput): Context {
  const context: Context = {
    systemPrompt: input.systemPrompt,
    messages: [
      {
        role: "user",
        content: input.prompt,
        timestamp: Date.now(),
      },
    ],
  };
  if (input.tools && input.tools.length > 0) context.tools = input.tools;
  return context;
}

function summarizeToolArguments(args: unknown): string {
  try {
    return JSON.stringify(args ?? {}).replace(/\s+/g, " ").slice(0, 240);
  } catch {
    return "";
  }
}

function workflowPiModel(modelId: string, baseUrl: string | undefined): Model<"openai-completions"> {
  const normalizedModelId = normalizeAmbientModelId(modelId);
  return {
    id: normalizedModelId,
    name: ambientModelLabel(normalizedModelId),
    api: "openai-completions",
    provider: "ambient",
    baseUrl: normalizeAmbientBaseUrl(baseUrl),
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      thinkingFormat: "zai",
      zaiToolStream: true,
      sendSessionAffinityHeaders: true,
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function assistantText(message: AssistantMessage | undefined): string {
  return (
    message?.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim() ?? ""
  );
}

function workflowPiCompletionMetadata(
  message: AssistantMessage | undefined,
  input: { text: string; thinkingText: string; maxTokens?: number; toolRound: number },
): WorkflowPiCompletionMetadata {
  const record = message as unknown as { stopReason?: unknown; finishReason?: unknown; finish_reason?: unknown; usage?: unknown } | undefined;
  const stopReason = stringValue(record?.stopReason);
  const finishReason = stringValue(record?.finishReason) ?? stringValue(record?.finish_reason) ?? stopReason;
  return {
    ...(finishReason ? { finishReason } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(record?.usage === undefined ? {} : { usage: record.usage }),
    outputChars: input.text.length,
    thinkingChars: input.thinkingText.length,
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    toolRound: input.toolRound,
  };
}

async function nextStreamEvent<T>(
  iterator: AsyncIterator<T>,
  signal: AbortSignal,
): Promise<IteratorResult<T>> {
  if (signal.aborted) throw abortSignalError(signal);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortSignalError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([iterator.next(), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function abortSignalError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Ambient/Pi workflow request canceled.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
