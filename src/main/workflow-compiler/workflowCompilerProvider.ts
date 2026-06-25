import YAML from "yaml";
import type { WorkflowPromptCacheCheckpoint } from "../../shared/workflowTypes";
import type { AmbientRetryPolicy } from "./workflowCompilerAmbientFacade";
import { validateWorkflowCompilerCapabilityDiscoveryOutput, type WorkflowCompilerCapabilityDiscoveryPlan } from "./workflowCompiler";
import { callWorkflowPiJson, callWorkflowPiText, type WorkflowPiProgress } from "./workflowCompilerWorkflowFacade";

const DEFAULT_WORKFLOW_COMPILER_TIMEOUT_MS = 480_000;
const DEFAULT_WORKFLOW_COMPILER_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_WORKFLOW_COMPILER_DISCOVERY_TIMEOUT_MS = 120_000;
const DEFAULT_WORKFLOW_COMPILER_DISCOVERY_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS = 240_000;
const DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS = 60_000;
const DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_RETRY_LIMIT = 1;
const DEFAULT_WORKFLOW_COMPILER_PARSE_RETRY_LIMIT = 1;
const DEFAULT_WORKFLOW_COMPILER_TRANSIENT_RETRY_LIMIT = 2;

const WORKFLOW_COMPILER_CAPABILITY_DISCOVERY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "requiredToolNames", "requiredConnectorIds", "openQuestions"],
  properties: {
    queries: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 240 },
          reason: { type: "string", maxLength: 500 },
        },
      },
    },
    requiredToolNames: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    requiredConnectorIds: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    openQuestions: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
} as const;

export class AmbientWorkflowCompilerProvider {
  constructor(
    private readonly input: {
      apiKey?: string;
      baseUrl?: string;
      timeoutMs?: number;
      idleTimeoutMs?: number;
      textCall?: typeof callWorkflowPiText;
      retryPolicy?: AmbientRetryPolicy;
    },
  ) {}

  async discoverCapabilities(input: {
    prompt: string;
    model: string;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    const apiKey = (this.input.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const idleTimeoutMs = Math.max(
      1,
      Math.floor(
        Math.min(
          this.input.idleTimeoutMs ?? DEFAULT_WORKFLOW_COMPILER_DISCOVERY_IDLE_TIMEOUT_MS,
          DEFAULT_WORKFLOW_COMPILER_DISCOVERY_IDLE_TIMEOUT_MS,
        ),
      ),
    );
    const timeoutMs = Math.max(
      1,
      Math.floor(
        Math.min(this.input.timeoutMs ?? DEFAULT_WORKFLOW_COMPILER_DISCOVERY_TIMEOUT_MS, DEFAULT_WORKFLOW_COMPILER_DISCOVERY_TIMEOUT_MS),
      ),
    );
    return await callWorkflowPiJson<WorkflowCompilerCapabilityDiscoveryPlan>({
      apiKey,
      baseUrl: this.input.baseUrl,
      model: input.model,
      systemPrompt: "You are the Ambient Desktop workflow compiler capability discovery planner. Return only valid JSON.",
      prompt: input.prompt,
      schemaName: "workflow_compiler_capability_discovery",
      responseSchema: WORKFLOW_COMPILER_CAPABILITY_DISCOVERY_JSON_SCHEMA,
      validate: validateWorkflowCompilerCapabilityDiscoveryOutput,
      maxValidationRetries: 1,
      textCall: this.input.textCall,
      temperature: 0.1,
      maxTokens: 1_200,
      idleTimeoutMs,
      absoluteTimeoutMs: timeoutMs,
      timeoutMs,
      onProgress: input.onProgress,
      reasoning: false,
      retryPolicy: this.input.retryPolicy,
    });
  }

  async compileProgramIr(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    return this.callIncrementalCompilerJson({
      prompt: input.prompt,
      model: input.model,
      cacheCheckpoint: input.cacheCheckpoint,
      systemPrompt:
        "You are the Ambient Desktop WorkflowProgramIR planner. Return only valid JSON for the WorkflowProgramIR schema. Do not generate source code.",
      maxTokens: 6_000,
      reasoning: false,
      onProgress: input.onProgress,
    });
  }

  async compilePlanDsl(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    return this.callIncrementalCompilerJson({
      prompt: input.prompt,
      model: input.model,
      cacheCheckpoint: input.cacheCheckpoint,
      systemPrompt:
        "You are the Ambient Desktop Workflow Plan DSL planner. Return only valid JSON for the high-level Workflow Plan DSL schema. Do not generate WorkflowProgramIR, source code, or patches.",
      maxTokens: 3_000,
      reasoning: false,
      onProgress: input.onProgress,
    });
  }

  async repairProgramIr(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    attempt: number;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    void input.attempt;
    return this.callIncrementalCompilerJson({
      prompt: input.prompt,
      model: input.model,
      cacheCheckpoint: input.cacheCheckpoint,
      systemPrompt:
        'You are the Ambient Desktop WorkflowProgramIR repairer. Return only valid JSON in the shape {"repairOperations":[...]} using typed repair operations: replace_with_alternative, add_semantic_slot, remove_optional_node, or ask_user_for_missing_choice. Do not generate source code.',
      maxTokens: 2_000,
      reasoning: false,
      onProgress: input.onProgress,
    });
  }

  private async callIncrementalCompilerJson(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    systemPrompt: string;
    maxTokens: number;
    reasoning: false;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    const apiKey = (this.input.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const startedAt = Date.now();
    const textCall = this.input.textCall ?? callWorkflowPiText;
    const idleTimeoutMs = Math.max(1, Math.floor(this.input.idleTimeoutMs ?? DEFAULT_WORKFLOW_COMPILER_IDLE_TIMEOUT_MS));
    const timeoutMs = Math.max(1, Math.floor(this.input.timeoutMs ?? DEFAULT_WORKFLOW_COMPILER_TIMEOUT_MS));
    const noOutputThinkingTimeoutMs = positiveEnvNumber(
      "AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS",
      DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS,
    );
    const noOutputThinkingChars = positiveEnvNumber(
      "AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS",
      DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS,
    );
    let prompt = input.prompt;
    let noOutputThinkingRetriesUsed = 0;
    let parseRetriesUsed = 0;
    let transientRetriesUsed = 0;
    let attemptIndex = 0;
    while (true) {
      if (attemptIndex > 0) {
        input.onProgress?.({
          outputChars: 0,
          thinkingChars: 0,
          elapsedMs: Date.now() - startedAt,
          idleTimeoutMs,
          absoluteTimeoutMs: timeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "retrying",
        });
      }
      let content: string;
      const attemptAbortController = new AbortController();
      const onProgress = workflowCompilerProgressWithNoOutputThinkingGuard({
        onProgress: input.onProgress,
        abortController: attemptAbortController,
        noOutputThinkingTimeoutMs,
        noOutputThinkingChars,
      });
      try {
        content = await textCall({
          apiKey,
          baseUrl: this.input.baseUrl,
          model: input.model,
          systemPrompt: input.systemPrompt,
          prompt,
          sessionId: input.cacheCheckpoint?.workflowThreadId,
          temperature: 0.1,
          maxTokens: input.maxTokens,
          idleTimeoutMs,
          absoluteTimeoutMs: timeoutMs,
          timeoutMs,
          signal: attemptAbortController.signal,
          onProgress,
          reasoning: input.reasoning,
          responseFormat: { type: "json_object" },
          retryPolicy: this.input.retryPolicy,
        });
      } catch (error) {
        const lastError = error instanceof Error ? error : new Error(String(error));
        if (
          isWorkflowCompilerNoOutputThinkingError(lastError) &&
          noOutputThinkingRetriesUsed < DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_RETRY_LIMIT
        ) {
          noOutputThinkingRetriesUsed += 1;
          attemptIndex += 1;
          prompt = workflowCompilerJsonRetryPrompt(input.prompt, lastError.message);
          continue;
        }
        if (
          !this.input.retryPolicy?.enabled &&
          isTransientWorkflowCompilerProviderError(lastError) &&
          transientRetriesUsed < DEFAULT_WORKFLOW_COMPILER_TRANSIENT_RETRY_LIMIT
        ) {
          transientRetriesUsed += 1;
          attemptIndex += 1;
          continue;
        }
        throw lastError;
      }
      try {
        return parseCompilerJson(content);
      } catch (error) {
        const lastError = error instanceof Error ? error : new Error(String(error));
        if (parseRetriesUsed >= DEFAULT_WORKFLOW_COMPILER_PARSE_RETRY_LIMIT) throw lastError;
        parseRetriesUsed += 1;
        attemptIndex += 1;
        prompt = workflowCompilerJsonRetryPrompt(input.prompt, lastError.message);
      }
    }
  }
}

function workflowCompilerJsonRetryPrompt(originalPrompt: string, validationError: string): string {
  return `${originalPrompt}

Workflow compiler retry instruction:
The previous workflow compiler response failed before it produced valid JSON for this compiler phase.
Validation error: ${validationError}

Return exactly one complete JSON object matching the compiler schema requested above.
Use compact JSON if necessary to fit the response budget.
Do not include markdown fences, commentary, trailing commas, comments, or unterminated strings.
Do not generate TypeScript or JavaScript.`;
}

function workflowCompilerProgressWithNoOutputThinkingGuard(input: {
  onProgress?: (progress: WorkflowPiProgress) => void;
  abortController: AbortController;
  noOutputThinkingTimeoutMs: number;
  noOutputThinkingChars: number;
}): (progress: WorkflowPiProgress) => void {
  return (progress) => {
    input.onProgress?.(progress);
    if (input.abortController.signal.aborted) return;
    if (progress.outputChars > 0 || progress.thinkingChars <= 0) return;
    const elapsedMs = Math.max(0, progress.elapsedMs);
    if (elapsedMs < input.noOutputThinkingTimeoutMs && progress.thinkingChars < input.noOutputThinkingChars) return;
    input.abortController.abort(
      new Error(
        `Ambient/Pi compiler spent ${formatDurationMs(elapsedMs)} thinking without emitting workflow JSON output ` +
          `(${progress.thinkingChars.toLocaleString()} thinking chars, 0 output chars). Retrying with thinking disabled.`,
      ),
    );
  };
}

function isWorkflowCompilerNoOutputThinkingError(error: Error): boolean {
  return /thinking without emitting workflow JSON output/i.test(error.message);
}

function isTransientWorkflowCompilerProviderError(error: Error): boolean {
  if (/api key|unauthori[sz]ed|forbidden|invalid request|schema|validation/i.test(error.message)) return false;
  return /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up|without stream activity/i.test(
    error.message,
  );
}

function positiveEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${(seconds / 60).toFixed(1)}m`;
}

export function parseCompilerJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Ambient workflow compiler returned an empty response.");
  const firstError = tryParseCompilerJsonCandidate(trimmed);
  if (firstError.ok) return firstError.value;
  const fenced = extractOuterFencedJson(trimmed);
  if (fenced) {
    const fencedResult = tryParseCompilerJsonCandidate(fenced);
    if (fencedResult.ok) return fencedResult.value;
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const bracedResult = tryParseCompilerJsonCandidate(trimmed.slice(firstBrace, lastBrace + 1));
    if (bracedResult.ok) return bracedResult.value;
  }
  throw new Error(`Ambient workflow compiler did not return valid JSON: ${firstError.error.message}`);
}

function extractOuterFencedJson(text: string): string | undefined {
  const open = text.match(/^```(?:json)?\s*/i);
  if (!open) return undefined;
  const closeIndex = text.lastIndexOf("```");
  if (closeIndex <= open[0].length) return undefined;
  return text.slice(open[0].length, closeIndex).trim();
}

function tryParseCompilerJsonCandidate(candidate: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (jsonError) {
    try {
      const value = YAML.parse(candidate);
      if (value !== null && value !== undefined) return { ok: true, value };
    } catch {
      // Preserve the JSON parser's more useful position information below.
    }
    return { ok: false, error: jsonError instanceof Error ? jsonError : new Error(String(jsonError)) };
  }
}
