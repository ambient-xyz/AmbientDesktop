import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import type { Context, Model } from "@mariozechner/pi-ai";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai/openai-completions";
import type { OfficeTextExtraction, PdfTextExtraction } from "../../shared/workspaceTypes";
import { describeOfficeFileSupport, extractOfficeText } from "./toolRuntimeOfficeFacade";
import { extractPdfText } from "./toolRuntimePdfFacade";
import type { AmbientFileAuthorityRequester } from "./toolRuntimePiFacade";
import { isPathInside } from "./toolRuntimeSessionFacade";

export const LAMBDA_RLM_SOURCE_REPOSITORY = "https://github.com/lambda-calculus-LLM/lambda-RLM";
export const LAMBDA_RLM_SOURCE_PAPER = "https://arxiv.org/abs/2603.20105";
export const LAMBDA_RLM_SOURCE_COMMIT = "3874d39";

export const TASK_TYPES = [
  "summarization",
  "qa",
  "translation",
  "classification",
  "extraction",
  "analysis",
  "general",
] as const;
export type LambdaRlmTaskType = (typeof TASK_TYPES)[number];

export const COMPOSE_OPS = [
  "concatenate",
  "merge_summaries",
  "select_relevant",
  "majority_vote",
  "merge_extractions",
  "combine_analysis",
] as const;
export type LambdaRlmComposeOp = (typeof COMPOSE_OPS)[number];

export interface LambdaRlmPipelineFlags {
  useFilter: boolean;
}

export interface LambdaRlmPlan {
  taskType: LambdaRlmTaskType;
  composeOp: LambdaRlmComposeOp;
  pipeline: LambdaRlmPipelineFlags;
  kStar: number;
  tauStar: number;
  depth: number;
  costEstimate: number;
  n: number;
}

export interface LambdaRlmExecutionProgress {
  phase: "task_detection" | "planning" | "filtering" | "leaves" | "reducing" | "done";
  taskType?: LambdaRlmTaskType;
  composeOp?: LambdaRlmComposeOp;
  inputLength?: number;
  chunkCount?: number;
  leafCount?: number;
  modelCalls: number;
  maxModelCalls: number;
  message: string;
  plan?: LambdaRlmPlan;
}

export interface LambdaRlmExecutionResult {
  response: string;
  taskType: LambdaRlmTaskType;
  composeOp: LambdaRlmComposeOp;
  plan: LambdaRlmPlan;
  inputLength: number;
  chunkCount: number;
  leafCount: number;
  modelCalls: number;
  elapsedMs: number;
}

export interface LambdaRlmExecuteInput {
  text: string;
  taskType?: LambdaRlmTaskType;
  query?: string;
  contextWindowChars?: number;
  accuracyTarget?: number;
  aLeaf?: number;
  aCompose?: number;
  maxModelCalls?: number;
  signal?: AbortSignal;
  modelComplete: (prompt: string, signal?: AbortSignal) => Promise<string>;
  onProgress?: (progress: LambdaRlmExecutionProgress) => void;
}

export interface LambdaRlmToolInput {
  taskType?: LambdaRlmTaskType;
  instruction?: string;
  question?: string;
  text?: string;
  workspacePaths?: string[];
  recentToolResults?: LambdaRlmRecentToolResultsInput;
  contextWindowChars?: number;
  accuracyTarget?: number;
  aLeaf?: number;
  aCompose?: number;
  maxModelCalls?: number;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export interface LambdaRlmRecentToolResultsInput {
  toolNames?: string[];
  maxResults?: number;
  includeErrors?: boolean;
  sinceLastUserMessage?: boolean;
}

export interface CreateLambdaRlmToolOptions {
  workspacePath: string;
  authorityRootPaths?: readonly string[] | (() => readonly string[]);
  includeWorkspaceRootAuthority?: boolean | (() => boolean);
  requestFileAuthority?: AmbientFileAuthorityRequester;
  model: Model<"openai-completions">;
  apiKey?: string;
  modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  getRecentToolResultMessages?: () => Promise<unknown[]> | unknown[];
}

export interface LambdaRlmToolExecutionContext {
  sessionManager?: {
    getBranch?: () => unknown[];
    getEntries?: () => unknown[];
    buildSessionContext?: () => { messages?: unknown[] };
  };
}

export type LambdaRlmToolUpdate = { content: { type: "text"; text: string }[]; details: Record<string, unknown> };

export interface LambdaRlmToolResult {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}

export interface LambdaRlmToolExecutionResult {
  toolResult: LambdaRlmToolResult;
  rawResponse: string;
}

const DEFAULT_CONTEXT_WINDOW_CHARS = 100_000;
const DEFAULT_ACCURACY_TARGET = 0.80;
const DEFAULT_A_LEAF = 0.95;
const DEFAULT_A_COMPOSE = 0.90;
const DEFAULT_MAX_MODEL_CALLS = 80;
const DEFAULT_MODEL_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_CHARS = 120_000;
const MAX_WORKSPACE_TEXT_FILE_BYTES = 2_000_000;
const MAX_WORKSPACE_DOCUMENT_FILE_BYTES = 50 * 1024 * 1024;
const MAX_OFFICE_WORKSPACE_TEXT_CHARS = 500_000;
const MAX_PDF_WORKSPACE_TEXT_CHARS = 500_000;

export const COMPOSITION_TABLE: Record<LambdaRlmTaskType, LambdaRlmComposeOp> = {
  summarization: "merge_summaries",
  qa: "select_relevant",
  translation: "concatenate",
  classification: "majority_vote",
  extraction: "merge_extractions",
  analysis: "combine_analysis",
  general: "merge_summaries",
};

export const C_COMPOSE: Record<LambdaRlmComposeOp, number> = {
  concatenate: 0.01,
  merge_summaries: 2.0,
  select_relevant: 1.5,
  majority_vote: 0.05,
  merge_extractions: 0.05,
  combine_analysis: 2.0,
};

export const C_IN = 1.0;

export const PLAN_TABLE: Record<LambdaRlmTaskType, LambdaRlmPipelineFlags> = {
  summarization: { useFilter: false },
  qa: { useFilter: true },
  translation: { useFilter: false },
  classification: { useFilter: false },
  extraction: { useFilter: true },
  analysis: { useFilter: false },
  general: { useFilter: false },
};

export const TASK_TEMPLATES: Record<LambdaRlmTaskType, string> = {
  summarization: "Summarize the following text concisely:\n\n{text}",
  qa: "Using the following context, answer: {query}\n\nContext:\n{text}",
  translation: "Translate the following text:\n\n{text}",
  classification: "Classify the following text:\n\n{text}",
  extraction: "Extract all key information from:\n\n{text}",
  analysis: "Analyze the following text and provide insights:\n\n{text}",
  general: "Process the following and provide a response:\n\n{text}",
};

export const TASK_DETECTION_PROMPT = `Based on the metadata below, select the single most appropriate task type.

Metadata: {metadata}

Reply with ONLY a single digit (no other text):
1. summarization - condense/summarize content
2. qa - answer a question using context
3. translation - translate text
4. classification - categorize/label text
5. extraction - extract specific facts or entities
6. analysis - deep analysis or evaluation
7. general - mixed or other

Single digit:`;

const TASK_DIGIT_MAP: Record<number, LambdaRlmTaskType> = {
  1: "summarization",
  2: "qa",
  3: "translation",
  4: "classification",
  5: "extraction",
  6: "analysis",
  7: "general",
};

export function isLambdaRlmTaskType(value: unknown): value is LambdaRlmTaskType {
  return typeof value === "string" && (TASK_TYPES as readonly string[]).includes(value);
}

export function parseLambdaRlmPrompt(prompt: string, query?: string): { contextText: string; effectiveQuery: string } {
  let contextText = prompt;
  let effectiveQuery = query || "";

  if (!effectiveQuery) {
    const qMarker = "\nQuestion: ";
    const qIdx = prompt.lastIndexOf(qMarker);
    if (qIdx !== -1) {
      const answerOffset = prompt.slice(qIdx).lastIndexOf("\nAnswer:");
      const ansIdx = answerOffset === -1 ? -1 : qIdx + answerOffset;
      const qEnd = ansIdx > qIdx ? ansIdx : prompt.length;
      effectiveQuery = prompt.slice(qIdx + qMarker.length, qEnd).trim();
      const ctxStart = prompt.startsWith("Context:\n") ? "Context:\n".length : 0;
      contextText = prompt.slice(ctxStart, qIdx).trim();
    }
  }

  return { contextText, effectiveQuery };
}

export function parseTaskTypeResponse(response: string): LambdaRlmTaskType {
  for (const ch of response) {
    if (/\d/.test(ch)) return TASK_DIGIT_MAP[Number(ch)] ?? "general";
  }
  return "general";
}

export function planLambdaRlm(
  taskType: LambdaRlmTaskType,
  n: number,
  options: {
    contextWindowChars?: number;
    accuracyTarget?: number;
    aLeaf?: number;
    aCompose?: number;
  } = {},
): LambdaRlmPlan {
  const K = positiveNumber(options.contextWindowChars, DEFAULT_CONTEXT_WINDOW_CHARS);
  const accuracyTarget = positiveNumber(options.accuracyTarget, DEFAULT_ACCURACY_TARGET);
  const aLeaf = positiveNumber(options.aLeaf, DEFAULT_A_LEAF);
  const aCompose = positiveNumber(options.aCompose, DEFAULT_A_COMPOSE);
  const composeOp = COMPOSITION_TABLE[taskType];
  const pipeline = PLAN_TABLE[taskType];
  const cCompose = C_COMPOSE[composeOp];

  if (n <= K) {
    return {
      taskType,
      composeOp,
      pipeline,
      kStar: 1,
      tauStar: n,
      depth: 0,
      costEstimate: C_IN * n + C_IN * 500,
      n,
    };
  }

  const kStarMax = 20;
  let kStar =
    cCompose > 0.1
      ? Math.min(kStarMax, Math.max(2, Math.ceil(Math.sqrt((n * C_IN) / cCompose))))
      : Math.min(kStarMax, Math.max(2, Math.ceil(n / K)));
  let depth = Math.max(1, Math.ceil(Math.log(n / K) / Math.log(kStar)));

  const maxK = Math.max(2, Math.floor(n / K));
  while (aLeaf ** depth * aCompose ** depth < accuracyTarget && kStar < maxK) {
    kStar += 1;
    depth = Math.max(1, Math.ceil(Math.log(n / K) / Math.log(kStar)));
  }

  const tauStar = Math.min(K, Math.max(1, Math.floor(n / kStar)));
  const costEstimate = kStar ** depth * C_IN * tauStar + depth * cCompose * kStar + C_IN * 500;

  return {
    taskType,
    composeOp,
    pipeline,
    kStar,
    tauStar,
    depth,
    costEstimate,
    n,
  };
}

export function splitLambdaText(text: string, k: number): string[] {
  if (k <= 1) return [text];
  const n = text.length;
  const chunkSize = Math.max(1, Math.floor(n / k));
  const chunks: string[] = [];
  let start = 0;

  for (let i = 0; i < k; i += 1) {
    if (start >= n) break;
    if (i === k - 1) {
      chunks.push(text.slice(start));
      break;
    }

    let end = start + chunkSize;
    if (end < n) {
      const margin = Math.max(1, Math.floor(chunkSize / 5));
      const boundary = reverseFindSpace(text, Math.max(start, end - margin), Math.min(n, end + margin));
      if (boundary > start) end = boundary + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks.filter(Boolean);
}

export async function executeLambdaRlm(input: LambdaRlmExecuteInput): Promise<LambdaRlmExecutionResult> {
  if (typeof input.text !== "string") throw new TypeError(`Lambda-RLM requires a string text input.`);
  const parsedPrompt = parseLambdaRlmPrompt(input.text, input.query);
  const contextText = parsedPrompt.contextText;
  if (!contextText.trim()) throw new Error("Lambda-RLM requires non-empty text.");

  const maxModelCalls = Math.max(1, Math.floor(input.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS));
  const start = performance.now();
  let modelCalls = 0;
  let leafCount = 0;
  let chunkCount = 1;

  const emit = (progress: Omit<LambdaRlmExecutionProgress, "modelCalls" | "maxModelCalls">) => {
    input.onProgress?.({ ...progress, modelCalls, maxModelCalls });
  };

  const callModel = async (prompt: string): Promise<string> => {
    throwIfAborted(input.signal);
    if (modelCalls >= maxModelCalls) {
      throw new Error(`Lambda-RLM model-call budget exceeded (${maxModelCalls}).`);
    }
    modelCalls += 1;
    return input.modelComplete(prompt, input.signal);
  };

  const effectiveQuery = parsedPrompt.effectiveQuery;
  const n = contextText.length;
  let taskType = input.taskType;

  if (!taskType) {
    emit({ phase: "task_detection", inputLength: n, message: "Detecting Lambda-RLM task type." });
    const peekText = contextText.slice(0, 500);
    const metadata = `length=${n}, query=${pythonStringRepr(effectiveQuery.slice(0, 100))}, preview=${pythonStringRepr(peekText.slice(0, 150))}`;
    taskType = parseTaskTypeResponse((await callModel(TASK_DETECTION_PROMPT.replace("{metadata}", metadata))).trim());
  }

  emit({ phase: "planning", taskType, inputLength: n, message: `Planning Lambda-RLM execution for ${taskType}.` });
  const plan = planLambdaRlm(taskType, n, {
    contextWindowChars: input.contextWindowChars,
    accuracyTarget: input.accuracyTarget,
    aLeaf: input.aLeaf,
    aCompose: input.aCompose,
  });
  emit({
    phase: "planning",
    taskType,
    composeOp: plan.composeOp,
    inputLength: n,
    plan,
    message: `Planned k*=${plan.kStar}, tau*=${plan.tauStar}, depth=${plan.depth}, reducer=${plan.composeOp}.`,
  });

  const reduceParts = async (parts: string[]): Promise<string> => {
    emit({
      phase: "reducing",
      taskType,
      composeOp: plan.composeOp,
      inputLength: n,
      chunkCount,
      leafCount,
      plan,
      message: `Reducing ${parts.length} Lambda-RLM partial result(s) with ${plan.composeOp}.`,
    });
    return reduceLambdaRlmParts(plan.composeOp, parts, effectiveQuery, callModel);
  };

  const phi = async (text: string): Promise<string> => {
    throwIfAborted(input.signal);
    if (text.length <= plan.tauStar) {
      leafCount += 1;
      emit({
        phase: "leaves",
        taskType,
        composeOp: plan.composeOp,
        inputLength: n,
        chunkCount,
        leafCount,
        plan,
        message: `Processing Lambda-RLM leaf ${leafCount}.`,
      });
      return callModel(leafPrompt(plan.taskType, text, effectiveQuery));
    }

    let chunks = splitLambdaText(text, plan.kStar);
    chunkCount += chunks.length - 1;
    if (plan.pipeline.useFilter && effectiveQuery) {
      const peekLen = Math.max(50, Math.floor(plan.tauStar / 10));
      emit({
        phase: "filtering",
        taskType,
        composeOp: plan.composeOp,
        inputLength: n,
        chunkCount,
        leafCount,
        plan,
        message: `Filtering ${chunks.length} Lambda-RLM chunk(s) for relevance.`,
      });
      chunks = await filterRelevantChunks(effectiveQuery, chunks, peekLen, callModel);
    }

    const parts: string[] = [];
    for (const chunk of chunks) {
      parts.push(await phi(chunk));
    }
    return reduceParts(parts);
  };

  const response = (await phi(contextText)).trim() || "No result produced.";
  emit({
    phase: "done",
    taskType,
    composeOp: plan.composeOp,
    inputLength: n,
    chunkCount,
    leafCount,
    plan,
    message: "Lambda-RLM execution completed.",
  });

  return {
    response,
    taskType,
    composeOp: plan.composeOp,
    plan,
    inputLength: n,
    chunkCount,
    leafCount,
    modelCalls,
    elapsedMs: performance.now() - start,
  };
}

export function createLambdaRlmToolDefinition(options: CreateLambdaRlmToolOptions) {
  return {
    name: "long_context_process",
    label: "Long Context Process",
    description:
      "Process long text or workspace files with a Lambda-RLM-style split/filter/map/reduce runtime for summarization, QA, translation, classification, extraction, analysis, or general processing.",
    promptSnippet:
      "long_context_process: Use Lambda-RLM-style deterministic long-context processing for large documents, extraction, QA, summarization, translation, classification, analysis, or general document processing.",
    promptGuidelines: [
      "Use long_context_process for long documents or multi-file text where coverage matters.",
      "Workspace paths may include UTF-8 text files, PDFs with extractable text, and supported Office documents (.docx/.pptx/.xlsx); PDF and Office inputs are processed as extracted plain text with document metadata.",
      "Some tool results shown in the chat transcript are compact previews of larger model-visible payloads.",
      "Use recentToolResults when an answer requires exhaustive search, extraction, QA, or exact fields over a recent tool result that is large, deeply structured, or no longer reliable to inspect directly from the current context.",
      "recentToolResults lets you inspect recent full tool-result payloads without copying them into a new tool call or expanding the visible transcript.",
      "Prefer normal reasoning for short prompts and ordinary coding tasks.",
      "Prefer browser tools to acquire current web content before processing it with long_context_process.",
      "long_context_process is read-only; do not use it to mutate files.",
      "Summarize its execution metadata when cost, coverage, or confidence matters.",
    ],
    parameters: {
      type: "object",
      properties: {
        taskType: { type: "string", enum: TASK_TYPES, description: "Optional Lambda-RLM task type. Omit to run task detection." },
        instruction: {
          type: "string",
          description: "Optional user goal. In the exact baseline this is used as query metadata for filtering, not to rewrite upstream leaf prompts.",
        },
        question: { type: "string", description: "Question for QA, or relevance query for extraction." },
        text: { type: "string", description: "Direct text to process." },
        workspacePaths: {
          type: "array",
          items: { type: "string" },
          description: "Workspace-relative UTF-8 text files, PDFs with extractable text, or supported Office documents (.docx/.pptx/.xlsx) to read and append to the input.",
        },
        recentToolResults: {
          type: "object",
          description:
            "Optional selector for recent successful Pi session tool results to append from the session. Use this for exact QA/search over full tool payloads when direct inspection is unreliable or the visible transcript only shows a compact preview.",
          properties: {
            toolNames: {
              type: "array",
              items: { type: "string" },
              description: "Optional exact tool names to include, for example google_workspace_call. Omit to include any recent tool result.",
            },
            maxResults: { type: "number", description: "Maximum matching tool results to include. Defaults to 1." },
            includeErrors: { type: "boolean", description: "Whether failed tool results may be included. Defaults to false." },
            sinceLastUserMessage: {
              type: "boolean",
              description: "Whether to search only tool results after the latest user message. Defaults to true.",
            },
          },
          additionalProperties: false,
        },
        contextWindowChars: { type: "number", description: "Character window K. Defaults to the upstream 100000." },
        accuracyTarget: { type: "number", description: "Planner accuracy target. Defaults to 0.80." },
        aLeaf: { type: "number", description: "Estimated leaf accuracy. Defaults to 0.95." },
        aCompose: { type: "number", description: "Estimated composition accuracy. Defaults to 0.90." },
        maxModelCalls: { type: "number", description: "Maximum bounded model calls. Defaults to 80." },
        timeoutMs: { type: "number", description: "Per-model-call timeout in milliseconds. Defaults to 120000." },
        maxOutputChars: { type: "number", description: "Maximum returned answer characters. Defaults to 120000." },
      },
      additionalProperties: false,
    } as any,
    executionMode: "sequential" as const,
    execute: async (
      _toolCallId: string,
      params: unknown,
      signal?: AbortSignal,
      onUpdate?: (update: LambdaRlmToolUpdate) => void,
      ctx?: LambdaRlmToolExecutionContext,
    ) => {
      return executeLambdaRlmToolCall(options, params, signal, onUpdate, ctx);
    },
  };
}

export async function executeLambdaRlmToolCall(
  options: CreateLambdaRlmToolOptions,
  params: unknown,
  signal?: AbortSignal,
  onUpdate?: (update: LambdaRlmToolUpdate) => void,
  ctx?: LambdaRlmToolExecutionContext,
  toolName = "long_context_process",
): Promise<LambdaRlmToolResult> {
  return (await executeLambdaRlmToolExecution(options, params, signal, onUpdate, ctx, toolName)).toolResult;
}

export async function executeLambdaRlmToolExecution(
  options: CreateLambdaRlmToolOptions,
  params: unknown,
  signal?: AbortSignal,
  onUpdate?: (update: LambdaRlmToolUpdate) => void,
  ctx?: LambdaRlmToolExecutionContext,
  toolName = "long_context_process",
): Promise<LambdaRlmToolExecutionResult> {
  const input = normalizeToolInput(params, toolName);
  const recentToolResultMessages = input.recentToolResults ? await resolveRecentToolResultMessages(options, ctx) : [];
  const collected = await collectToolText(options, input, recentToolResultMessages, signal, toolName);
  const timeoutMs = positiveNumber(input.timeoutMs, DEFAULT_MODEL_TIMEOUT_MS);
  const maxOutputChars = Math.max(1, Math.floor(input.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS));
  const query = input.question || input.instruction || "";

  const result = await executeLambdaRlm({
    text: collected.text,
    taskType: input.taskType,
    query,
    contextWindowChars: input.contextWindowChars,
    accuracyTarget: input.accuracyTarget,
    aLeaf: input.aLeaf,
    aCompose: input.aCompose,
    maxModelCalls: input.maxModelCalls,
    signal,
    onProgress: (progress) => onUpdate?.(lambdaRlmToolUpdate(progress.message, progress, toolName)),
    modelComplete:
      options.modelComplete ??
      ((prompt, callSignal) =>
        completeAmbientText(options.model, prompt, {
          apiKey: options.apiKey,
          signal: callSignal,
          timeoutMs,
        })),
  });

  const truncated = result.response.length > maxOutputChars;
  const response = truncated ? `${result.response.slice(0, maxOutputChars)}\n\n... truncated ...` : result.response;
  return {
    toolResult: lambdaRlmToolResult(formatLambdaRlmResultText({ ...result, response }, truncated), {
      runtime: "ambient-lambda-rlm",
      toolName,
      sourceRepository: LAMBDA_RLM_SOURCE_REPOSITORY,
      sourceCommit: LAMBDA_RLM_SOURCE_COMMIT,
      taskType: result.taskType,
      composeOp: result.composeOp,
      plan: result.plan,
      inputLength: result.inputLength,
      chunkCount: result.chunkCount,
      leafCount: result.leafCount,
      inputSources: collected.sources,
      modelCalls: result.modelCalls,
      elapsedMs: result.elapsedMs,
      truncated,
    }),
    rawResponse: result.response,
  };
}

interface CollectedLambdaRlmText {
  text: string;
  sources: Array<Record<string, unknown>>;
}

export function reduceLambdaRlmParts(
  composeOp: LambdaRlmComposeOp,
  parts: string[],
  query: string,
  callModel: (prompt: string) => Promise<string>,
): Promise<string> | string {
  if (composeOp === "concatenate") return parts.join("\n\n");

  if (composeOp === "merge_summaries") {
    if (parts.length === 1) return parts[0];
    const merged = parts.join("\n\n---\n\n");
    return callModel(`Merge these partial summaries into one concise, coherent summary. Preserve all key facts and findings:\n\n${merged}`);
  }

  if (composeOp === "select_relevant") {
    const candidates =
      parts.filter(
        (part) =>
          part.trim() &&
          !part.toLowerCase().includes("not found") &&
          !part.toLowerCase().includes("no information") &&
          !part.toLowerCase().includes("not mentioned"),
      ) || parts;
    const selected = candidates.length > 0 ? candidates : parts;
    if (selected.length === 1) return selected[0];
    const merged = selected.join("\n\n---\n\n");
    return callModel(`Question: ${query}\n\nSynthesise these partial answers into one complete, accurate answer:\n\n${merged}`);
  }

  if (composeOp === "majority_vote") {
    if (!parts.length) return "";
    const counts = new Map<string, number>();
    for (const part of parts) {
      const normalized = part.trim().toLowerCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    let winner = parts[0].trim().toLowerCase();
    let winnerCount = -1;
    for (const [candidate, count] of counts) {
      if (count > winnerCount) {
        winner = candidate;
        winnerCount = count;
      }
    }
    return parts.find((part) => part.trim().toLowerCase() === winner)?.trim() ?? parts[0];
  }

  if (composeOp === "merge_extractions") {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const part of parts) {
      for (const rawLine of part.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line && !seen.has(line)) {
          seen.add(line);
          lines.push(line);
        }
      }
    }
    return lines.join("\n");
  }

  if (composeOp === "combine_analysis") {
    if (parts.length === 1) return parts[0];
    const merged = parts.join("\n\n---\n\n");
    return callModel(`Combine these partial analyses into one comprehensive, well-structured analysis:\n\n${merged}`);
  }

  return parts.join("\n\n");
}

async function filterRelevantChunks(
  query: string,
  chunks: string[],
  peekLen: number,
  callModel: (prompt: string) => Promise<string>,
): Promise<string[]> {
  const kept: string[] = [];
  for (const chunk of chunks) {
    const preview = chunk.slice(0, peekLen);
    const response = (
      await callModel(
        `Question: ${query}\n\nDoes this excerpt contain information relevant to answering the question?\nReply YES or NO only.\n\nExcerpt:\n${preview}`,
      )
    )
      .trim()
      .toUpperCase();
    if (response.startsWith("Y")) kept.push(chunk);
  }
  return kept.length > 0 ? kept : chunks;
}

function leafPrompt(taskType: LambdaRlmTaskType, text: string, query: string): string {
  if (taskType === "qa" && query) {
    return TASK_TEMPLATES.qa.replace("{query}", query).replace("{text}", text);
  }
  if (taskType === "qa") {
    return "Answer based on the following context:\n\n{text}".replace("{text}", text);
  }
  return TASK_TEMPLATES[taskType].replace("{text}", text);
}

async function collectToolText(
  options: CreateLambdaRlmToolOptions,
  input: LambdaRlmToolInput,
  recentToolResultMessages: unknown[],
  signal?: AbortSignal,
  toolName = "long_context_process",
): Promise<CollectedLambdaRlmText> {
  const workspacePath = options.workspacePath;
  const parts: string[] = [];
  const sources: Array<Record<string, unknown>> = [];
  if (input.text?.trim()) {
    parts.push(input.text);
    sources.push({ type: "text", chars: input.text.length });
  }

  for (const requestedPath of input.workspacePaths ?? []) {
    throwIfAborted(signal);
    const absolutePath = await resolveAuthorizedWorkspacePath(options, requestedPath, toolName);
    const pathStat = await stat(absolutePath);
    if (!pathStat.isFile()) throw new Error(`Lambda-RLM can only read files: ${requestedPath}`);
    const pdfInput = extname(absolutePath).toLowerCase() === ".pdf";
    const officeSupport = describeOfficeFileSupport(absolutePath);
    const maxSourceBytes = pdfInput || officeSupport ? MAX_WORKSPACE_DOCUMENT_FILE_BYTES : MAX_WORKSPACE_TEXT_FILE_BYTES;
    if (pathStat.size > maxSourceBytes) {
      throw new Error(`Lambda-RLM file input is too large (${pathStat.size} bytes): ${requestedPath}`);
    }
    if (pdfInput) {
      const pdfText = await extractPdfText(absolutePath, {
        maxSourceBytes: MAX_WORKSPACE_DOCUMENT_FILE_BYTES,
        maxExtractedChars: MAX_PDF_WORKSPACE_TEXT_CHARS,
      });
      if (pdfText.status !== "available") {
        throw new Error(`long_context_process could not extract PDF text from ${requestedPath}: ${pdfText.error ?? pdfText.status}`);
      }
      const content = pdfText.text ?? "";
      if (!content.trim()) throw new Error(`long_context_process found no extractable PDF text in ${requestedPath}.`);
      parts.push([`File: ${requestedPath || basename(absolutePath)}`, pdfTextHeader(pdfText), content].join("\n"));
      sources.push({
        type: "workspacePath",
        path: requestedPath,
        chars: pdfText.chars ?? content.length,
        providedChars: content.length,
        pdfPages: pdfText.pages,
        truncated: pdfText.truncated === true,
      });
      continue;
    }
    if (officeSupport) {
      if (officeSupport.status !== "supported") {
        throw new Error(`long_context_process does not support ${officeSupport.extension} Office files yet: ${requestedPath}`);
      }
      const officeText = await extractOfficeText(absolutePath, {
        maxSourceBytes: MAX_WORKSPACE_DOCUMENT_FILE_BYTES,
        maxExtractedChars: MAX_OFFICE_WORKSPACE_TEXT_CHARS,
      });
      if (officeText.status !== "available") {
        throw new Error(`long_context_process could not extract Office text from ${requestedPath}: ${officeText.error ?? officeText.status}`);
      }
      const content = officeText.text ?? "";
      if (!content.trim()) throw new Error(`long_context_process found no extractable Office text in ${requestedPath}.`);
      parts.push([`File: ${requestedPath || basename(absolutePath)}`, officeTextHeader(officeText), content].join("\n"));
      sources.push({
        type: "workspacePath",
        path: requestedPath,
        chars: officeText.chars ?? content.length,
        providedChars: content.length,
        officeFormat: officeText.format,
        officeUnitLabel: officeText.unitLabel,
        officeUnitCount: officeText.unitCount,
        truncated: officeText.truncated === true,
      });
      continue;
    }
    const content = await readFile(absolutePath, "utf8");
    parts.push([`File: ${requestedPath || basename(absolutePath)}`, content].join("\n"));
    sources.push({ type: "workspacePath", path: requestedPath, chars: content.length });
  }

  if (input.recentToolResults) {
    const selected = selectRecentToolResultText(recentToolResultMessages, input.recentToolResults);
    if (!selected.length) {
      throw new Error("long_context_process recentToolResults did not match any recent tool results.");
    }
    for (const result of selected) {
      parts.push(
        [
          `Recent tool result: ${result.toolName}`,
          `Status: ${result.isError ? "error" : "done"}`,
          result.timestamp ? `Timestamp: ${result.timestamp}` : undefined,
          "Content:",
          result.text,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      sources.push({
        type: "recentToolResult",
        toolName: result.toolName,
        chars: result.text.length,
        isError: result.isError,
        timestamp: result.timestamp,
      });
    }
  }

  const text = parts.join("\n\n");
  if (!text.trim()) throw new Error("long_context_process requires `text`, at least one `workspacePaths` file, or `recentToolResults`.");
  return { text, sources };
}

async function resolveAuthorizedWorkspacePath(options: CreateLambdaRlmToolOptions, requestedPath: string, toolName: string): Promise<string> {
  const workspacePath = resolve(options.workspacePath);
  const absolutePath = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(workspacePath, requestedPath);
  if (!isAuthorizedWorkspacePath(options, absolutePath)) {
    const approved = await options.requestFileAuthority?.({
      access: "read",
      toolName,
      requestedPath,
      absolutePath,
      reason: `${toolName} path is outside the current workspace authority.`,
    });
    if (approved && isAuthorizedWorkspacePath(options, absolutePath)) {
      return absolutePath;
    }
    throw new Error(`${toolName} path is outside the current workspace authority: ${requestedPath}`);
  }
  return absolutePath;
}

function isAuthorizedWorkspacePath(options: CreateLambdaRlmToolOptions, absolutePath: string): boolean {
  const workspacePath = resolve(options.workspacePath);
  const roots = [
    ...new Set([
      ...(currentIncludeWorkspaceRootAuthority(options) ? [workspacePath] : []),
      ...currentAuthorityRootPaths(options),
    ].map((root) => resolve(root))),
  ];
  return roots.some((root) => isPathInside(root, absolutePath));
}

function currentAuthorityRootPaths(options: CreateLambdaRlmToolOptions): string[] {
  const value = typeof options.authorityRootPaths === "function" ? options.authorityRootPaths() : options.authorityRootPaths;
  return (value ?? []).map((path) => path.trim()).filter(Boolean);
}

function currentIncludeWorkspaceRootAuthority(options: CreateLambdaRlmToolOptions): boolean {
  const value = typeof options.includeWorkspaceRootAuthority === "function"
    ? options.includeWorkspaceRootAuthority()
    : options.includeWorkspaceRootAuthority;
  return value !== false;
}

function pdfTextHeader(pdfText: PdfTextExtraction): string {
  return [
    "PDF text extraction: available",
    pdfText.pages !== undefined ? `PDF pages: ${pdfText.pages}` : undefined,
    pdfText.truncated ? `PDF extracted text truncated at ${MAX_PDF_WORKSPACE_TEXT_CHARS.toLocaleString()} chars.` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function officeTextHeader(officeText: OfficeTextExtraction): string {
  return [
    `Office format: ${officeText.format ?? "unknown"}`,
    officeText.unitLabel && officeText.unitCount !== undefined ? `Office ${officeText.unitLabel}: ${officeText.unitCount}` : undefined,
    officeText.truncated ? `Office extracted text truncated at ${MAX_OFFICE_WORKSPACE_TEXT_CHARS.toLocaleString()} chars.` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeToolInput(params: unknown, toolName = "long_context_process"): LambdaRlmToolInput {
  if (!params || typeof params !== "object") throw new Error(`${toolName} requires an object input.`);
  const record = params as Record<string, unknown>;
  const taskType = record.taskType === undefined ? undefined : record.taskType;
  if (taskType !== undefined && !isLambdaRlmTaskType(taskType)) throw new Error(`Invalid Lambda-RLM taskType: ${String(taskType)}`);
  return {
    ...(taskType ? { taskType } : {}),
    instruction: optionalTrimmedString(record.instruction),
    question: optionalTrimmedString(record.question),
    text: typeof record.text === "string" ? record.text : undefined,
    workspacePaths: stringArray(record.workspacePaths, "workspacePaths"),
    recentToolResults: normalizeRecentToolResultsInput(record.recentToolResults),
    contextWindowChars: optionalPositiveNumber(record.contextWindowChars, "contextWindowChars"),
    accuracyTarget: optionalPositiveNumber(record.accuracyTarget, "accuracyTarget"),
    aLeaf: optionalPositiveNumber(record.aLeaf, "aLeaf"),
    aCompose: optionalPositiveNumber(record.aCompose, "aCompose"),
    maxModelCalls: optionalPositiveInteger(record.maxModelCalls, "maxModelCalls"),
    timeoutMs: optionalPositiveInteger(record.timeoutMs, "timeoutMs"),
    maxOutputChars: optionalPositiveInteger(record.maxOutputChars, "maxOutputChars"),
  };
}

async function resolveRecentToolResultMessages(options: CreateLambdaRlmToolOptions, ctx: LambdaRlmToolExecutionContext | undefined): Promise<unknown[]> {
  if (options.getRecentToolResultMessages) {
    const messages = await options.getRecentToolResultMessages();
    return Array.isArray(messages) ? messages : [];
  }
  const branchEntries = ctx?.sessionManager?.getBranch?.();
  if (Array.isArray(branchEntries)) return branchEntries.flatMap(sessionEntryMessages);
  const messages = ctx?.sessionManager?.buildSessionContext?.().messages;
  return Array.isArray(messages) ? messages : [];
}

function sessionEntryMessages(entry: unknown): unknown[] {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const record = entry as Record<string, unknown>;
  if (record.type === "message" && record.message) return [record.message];
  if (record.role) return [record];
  return [];
}

function normalizeRecentToolResultsInput(value: unknown): LambdaRlmRecentToolResultsInput | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("recentToolResults must be an object.");
  const record = value as Record<string, unknown>;
  return {
    toolNames: stringArray(record.toolNames, "recentToolResults.toolNames"),
    maxResults: optionalPositiveInteger(record.maxResults, "recentToolResults.maxResults"),
    includeErrors: optionalBoolean(record.includeErrors, "recentToolResults.includeErrors"),
    sinceLastUserMessage: optionalBoolean(record.sinceLastUserMessage, "recentToolResults.sinceLastUserMessage"),
  };
}

function selectRecentToolResultText(
  messages: unknown[],
  input: LambdaRlmRecentToolResultsInput,
): Array<{ toolName: string; text: string; isError: boolean; timestamp?: string }> {
  const maxResults = Math.min(20, Math.max(1, Math.floor(input.maxResults ?? 1)));
  const includeErrors = input.includeErrors === true;
  const sinceLastUserMessage = input.sinceLastUserMessage !== false;
  const toolNames = input.toolNames?.length ? new Set(input.toolNames.map((name) => name.trim())) : undefined;
  const startIndex = sinceLastUserMessage ? lastUserMessageIndex(messages) + 1 : 0;
  const selected: Array<{ toolName: string; text: string; isError: boolean; timestamp?: string }> = [];

  for (let index = messages.length - 1; index >= startIndex && selected.length < maxResults; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object" || Array.isArray(message)) continue;
    const record = message as Record<string, unknown>;
    if (record.role !== "toolResult") continue;
    const toolName = typeof record.toolName === "string" && record.toolName.trim() ? record.toolName.trim() : "unknown";
    if (toolNames && !toolNames.has(toolName)) continue;
    const isError = record.isError === true;
    if (isError && !includeErrors) continue;
    const text = toolResultContentText(record.content);
    if (!text.trim()) continue;
    const timestamp = typeof record.timestamp === "number" ? new Date(record.timestamp).toISOString() : optionalTrimmedString(record.timestamp);
    selected.push({
      toolName,
      text,
      isError,
      ...(timestamp ? { timestamp } : {}),
    });
  }

  return selected.reverse();
}

function lastUserMessageIndex(messages: unknown[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && typeof message === "object" && !Array.isArray(message) && (message as { role?: unknown }).role === "user") return index;
  }
  return -1;
}

function toolResultContentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const record = item as Record<string, unknown>;
          if (record.type === "text" && typeof record.text === "string") return record.text;
          if ("text" in record && typeof record.text === "string") return record.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "content" in value) {
    return toolResultContentText((value as { content?: unknown }).content);
  }
  return "";
}

export async function completeAmbientText(
  model: Model<"openai-completions">,
  prompt: string,
  options: { apiKey?: string; signal?: AbortSignal; timeoutMs: number },
): Promise<string> {
  return runLambdaRlmModelCallWithTimeout(
    {
      operation: "Ambient Lambda-RLM model call",
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    },
    async (signal) => {
      const context: Context = {
        messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      };
      const stream = streamSimpleOpenAICompletions(model, context, {
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        signal,
        cacheRetention: "none",
        maxRetries: 0,
        reasoning: "minimal",
        timeoutMs: options.timeoutMs,
      });
      const result = await stream.result();
      if (result.stopReason === "error" || result.errorMessage) {
        throw new Error(result.errorMessage || "Ambient Lambda-RLM model call returned an error.");
      }
      return assistantText(result.content);
    },
  );
}

export async function runLambdaRlmModelCallWithTimeout<T>(
  input: { operation: string; signal?: AbortSignal; timeoutMs: number },
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const operation = input.operation.trim() || "Lambda-RLM model call";
  const timeoutMs = Math.max(1, Math.floor(input.timeoutMs));
  if (input.signal?.aborted) throw new Error(`${operation} was aborted before it started.`);

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`${operation} timed out after ${timeoutMs}ms without completing.`));
    }, timeoutMs);
    if (timeoutId && typeof timeoutId === "object" && "unref" in timeoutId && typeof timeoutId.unref === "function") {
      timeoutId.unref();
    }
  });

  const abortPromise = new Promise<never>((_, reject) => {
    if (!input.signal) return;
    const onAbort = () => {
      controller.abort();
      reject(new Error(`${operation} was aborted.`));
    };
    input.signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => input.signal?.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([run(controller.signal), timeoutPromise, abortPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    removeAbortListener?.();
  }
}

function assistantText(content: Awaited<ReturnType<ReturnType<typeof streamSimpleOpenAICompletions>["result"]>>["content"]): string {
  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  if (text) return text;
  return content
    .filter((part) => part.type === "thinking")
    .map((part) => part.thinking)
    .join("\n")
    .trim();
}

function formatLambdaRlmResultText(result: LambdaRlmExecutionResult, truncated: boolean): string {
  return [
    result.response,
    "",
    "Lambda-RLM execution summary",
    `Task type: ${result.taskType}`,
    `Reducer: ${result.composeOp}`,
    `Input characters: ${result.inputLength}`,
    `Chunks: ${result.chunkCount}`,
    `Leaves: ${result.leafCount}`,
    `Model calls: ${result.modelCalls}`,
    `Plan: k*=${result.plan.kStar}, tau*=${result.plan.tauStar}, depth=${result.plan.depth}, cost=${result.plan.costEstimate.toFixed(2)}`,
    `Elapsed: ${Math.round(result.elapsedMs)}ms`,
    truncated ? "Output was truncated by maxOutputChars." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function lambdaRlmToolUpdate(text: string, progress: LambdaRlmExecutionProgress, toolName = "long_context_process"): LambdaRlmToolUpdate {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-lambda-rlm",
      toolName,
      status: "running",
      ...progress,
    },
  };
}

function lambdaRlmToolResult(text: string, details: Record<string, unknown>): LambdaRlmToolResult {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function pythonStringRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  return `${quote}${value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(new RegExp(quote, "g"), `\\${quote}`)}${quote}`;
}

function reverseFindSpace(text: string, start: number, end: number): number {
  for (let index = end - 1; index >= start; index -= 1) {
    if (text[index] === " ") return index;
  }
  return -1;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function optionalPositiveNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

function optionalPositiveInteger(value: unknown, name: string): number | undefined {
  const number = optionalPositiveNumber(value, name);
  return number === undefined ? undefined : Math.floor(number);
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown, name: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`${name} must be an array of non-empty strings.`);
  }
  return value.map((item) => item.trim());
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Lambda-RLM execution aborted.");
}
