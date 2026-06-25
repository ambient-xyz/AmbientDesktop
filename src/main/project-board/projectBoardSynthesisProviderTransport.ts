import { normalizeAmbientModelId } from "../../shared/ambientModels";
import { normalizeAmbientBaseUrl } from "./projectBoardProviderFacade";
import { retryDelayForAttempt, type AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { callWorkflowPiText, type WorkflowPiCompletionMetadata, type WorkflowPiProgress } from "./projectBoardWorkflowFacade";
import type {
  AmbientProjectBoardSynthesisCallResult,
  ProjectBoardSynthesisReasoning,
  ProjectBoardSynthesisTransientRetryEvent,
} from "./projectBoardSynthesisProviderSupport";
import {
  delayProjectBoardSynthesisRetry,
  fetchAmbientProjectBoardSynthesisResponse,
  normalizeAmbientStreamIdleTimeoutMs,
  normalizeProjectBoardSynthesisMaxToolRounds,
  projectBoardPiTextReasoning,
  projectBoardSynthesisReasoningPayload,
  projectBoardSynthesisTransientAttemptCount,
  projectBoardSynthesisTransientRetryDelayMs,
  readAmbientChatCompletionResult,
  shouldRetryProjectBoardSynthesisTransient,
} from "./projectBoardSynthesisProviderSupport";
import { errorMessage } from "./projectBoardSynthesisPlannerPrompts";

export interface ProjectBoardSynthesisTransportOptions {
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  piTextCall?: typeof callWorkflowPiText;
  streamIdleTimeoutMs?: number;
  maxToolRounds?: number;
  reasoning?: ProjectBoardSynthesisReasoning;
  retryPolicy?: AmbientRetryPolicy;
  waitForRetry?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface ProjectBoardSynthesisTransportInput {
  apiKey: string;
  system: string;
  prompt: string;
  maxTokens: number;
  reasoning?: ProjectBoardSynthesisReasoning;
  onChunk?: (responseCharCount: number) => void;
  contentActivityToken?: () => unknown;
  sessionId?: string;
  tools?: Parameters<typeof callWorkflowPiText>[0]["tools"];
  executeTool?: Parameters<typeof callWorkflowPiText>[0]["executeTool"];
  onToolProgress?: Parameters<typeof callWorkflowPiText>[0]["onToolProgress"];
  onTransientRetry?: (event: ProjectBoardSynthesisTransientRetryEvent) => void;
  committedRecordCount?: () => number;
  signal?: AbortSignal;
}

export async function callProjectBoardSynthesis(
  options: ProjectBoardSynthesisTransportOptions,
  input: ProjectBoardSynthesisTransportInput,
): Promise<string> {
  return (await callProjectBoardSynthesisWithMetadata(options, input)).text;
}

export async function callProjectBoardSynthesisWithMetadata(
  options: ProjectBoardSynthesisTransportOptions,
  input: ProjectBoardSynthesisTransportInput,
): Promise<AmbientProjectBoardSynthesisCallResult> {
  const retryPolicy = options.retryPolicy?.enabled ? options.retryPolicy : undefined;
  const maxAttempts = retryPolicy ? retryPolicy.maxRetries + 1 : projectBoardSynthesisTransientAttemptCount();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let attemptOutputChars = 0;
    try {
      return await callProjectBoardSynthesisWithMetadataAttempt(options, {
        ...input,
        onChunk: (responseCharCount) => {
          attemptOutputChars = responseCharCount;
          input.onChunk?.(responseCharCount);
        },
      });
    } catch (error) {
      const committedRecordCount = Math.max(0, Math.floor(input.committedRecordCount?.() ?? 0));
      if (
        !shouldRetryProjectBoardSynthesisTransient(error, {
          attempt,
          maxAttempts,
          outputChars: attemptOutputChars,
          committedRecordCount,
          aggressive: Boolean(retryPolicy),
          signal: input.signal,
        })
      ) {
        throw error;
      }
      const retryAttempt = attempt;
      const delayMs = retryPolicy ? retryDelayForAttempt(retryPolicy, retryAttempt) : projectBoardSynthesisTransientRetryDelayMs(attempt);
      input.onTransientRetry?.({
        attempt,
        retryAttempt,
        maxAttempts,
        maxRetries: maxAttempts - 1,
        delayMs,
        error: errorMessage(error),
        outputChars: attemptOutputChars,
        committedRecordCount,
        aggressive: Boolean(retryPolicy),
      });
      await (options.waitForRetry ?? delayProjectBoardSynthesisRetry)(delayMs, input.signal);
    }
  }
  throw new Error("Ambient project-board synthesis retry loop exhausted unexpectedly.");
}

async function callProjectBoardSynthesisWithMetadataAttempt(
  options: ProjectBoardSynthesisTransportOptions,
  input: ProjectBoardSynthesisTransportInput,
): Promise<AmbientProjectBoardSynthesisCallResult> {
  if (!options.fetchImpl) {
    const textCall = options.piTextCall ?? callWorkflowPiText;
    let lastOutputChars = 0;
    let completion: WorkflowPiCompletionMetadata | undefined;
    const text = await textCall({
      apiKey: input.apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
      systemPrompt: input.system,
      prompt: input.prompt,
      sessionId: input.sessionId,
      temperature: 0.1,
      maxTokens: input.maxTokens,
      reasoning: projectBoardPiTextReasoning(options.reasoning ?? input.reasoning),
      responseFormat: { type: "json_object" },
      tools: input.tools,
      executeTool: input.executeTool,
      onToolProgress: input.onToolProgress,
      onCompleted: (metadata) => {
        completion = metadata;
      },
      maxToolRounds: input.tools?.length ? normalizeProjectBoardSynthesisMaxToolRounds(options.maxToolRounds) : 0,
      idleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(options.streamIdleTimeoutMs),
      signal: input.signal,
      onProgress: (progress: WorkflowPiProgress) => {
        if (progress.outputChars === lastOutputChars && progress.stage !== "completed") return;
        lastOutputChars = progress.outputChars;
        input.onChunk?.(progress.outputChars);
      },
    });
    return {
      text,
      finishReason: completion?.finishReason,
      stopReason: completion?.stopReason,
      usage: completion?.usage,
      outputTokenBudget: input.maxTokens,
      outputChars: completion?.outputChars ?? text.length,
      thinkingChars: completion?.thinkingChars,
      toolRound: completion?.toolRound,
    };
  }
  const response = await fetchAmbientProjectBoardSynthesisResponse(
    options.fetchImpl ?? fetch,
    `${normalizeAmbientBaseUrl(options.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: normalizeAmbientModelId(options.model),
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        temperature: 0.1,
        max_tokens: input.maxTokens,
        response_format: { type: "json_object" },
        stream: true,
        ...projectBoardSynthesisReasoningPayload(options.reasoning ?? input.reasoning),
      }),
    },
    normalizeAmbientStreamIdleTimeoutMs(options.streamIdleTimeoutMs),
    input.signal,
  );
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim();
    throw new Error(
      detail
        ? `Ambient project-board synthesis failed (${response.status}): ${detail.slice(0, 240)}`
        : `Ambient project-board synthesis failed (${response.status}).`,
    );
  }
  return readAmbientChatCompletionResult(response, input.onChunk, {
    streamIdleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(options.streamIdleTimeoutMs),
    contentActivityToken: input.contentActivityToken,
    outputTokenBudget: input.maxTokens,
    signal: input.signal,
  });
}
