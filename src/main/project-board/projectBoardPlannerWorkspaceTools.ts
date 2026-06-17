import { readFile } from "node:fs/promises";
import { Type, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import {
  stableBoardArtifactId,
  validateProposalJsonlRecordArtifact,
  type ProposalJsonlRecordArtifact,
} from "./projectBoardArtifacts";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  readProjectBoardPlannerWorkspaceRecords,
  type ProjectBoardPlannerWorkspace,
} from "./projectBoardPlannerWorkspace";
import type { WorkflowPiToolExecutionResult, WorkflowPiToolProgress } from "../workflowPiTransport";

export const PROJECT_BOARD_PLANNER_TOOL_NAMES = [
  "planner_source_manifest",
  "planner_source_search",
  "planner_source_read",
  "planner_source_qa",
  "planner_ledger_read",
  "planner_card_search",
  "planner_records_append",
] as const;

export type ProjectBoardPlannerToolName = (typeof PROJECT_BOARD_PLANNER_TOOL_NAMES)[number];

const MAX_SOURCE_READ_CHARS = 12_000;
const DEFAULT_SOURCE_READ_CHARS = 6_000;
const MAX_LEDGER_READ_CHARS = 18_000;
const MAX_APPEND_RECORDS = 12;
const MAX_SEARCH_RESULTS = 12;
const DEFAULT_SEARCH_RESULTS = 5;
const MAX_SEARCH_SNIPPET_CHARS = 1_200;
const DEFAULT_SEARCH_SNIPPET_CHARS = 420;
const MAX_QA_EVIDENCE_CHARS = 8_000;
const DEFAULT_QA_EVIDENCE_CHARS = 4_000;
const MAX_QA_SNIPPETS = 8;
const DEFAULT_QA_SNIPPETS = 4;

export type PlannerSourceQaFailureKind = "no_evidence" | "too_much_evidence" | "needs_user_decision" | "invalid_response" | "timeout";

const plannerStringListToolSchema = Type.Array(Type.String());
const plannerSourceRefToolSchema = Type.Object({
  sourceId: Type.Optional(Type.String({ description: "Planner source id from planner_source_manifest." })),
  path: Type.Optional(Type.String({ description: "Project-relative source path." })),
  range: Type.Optional(Type.String({ description: "Optional line/range hint." })),
  quote: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  contentHash: Type.Optional(Type.String()),
});
const plannerTestPlanToolSchema = Type.Object({
  unit: plannerStringListToolSchema,
  integration: plannerStringListToolSchema,
  visual: plannerStringListToolSchema,
  manual: plannerStringListToolSchema,
});
const plannerRecordToolSchema = Type.Union([
  Type.Object({
    type: Type.Literal("candidate_card"),
    sourceId: Type.String({ description: "Stable card id, e.g. synthesis:recipe-fixtures." }),
    title: Type.String(),
    description: Type.String(),
    candidateStatus: Type.Optional(Type.Union([
      Type.Literal("needs_clarification"),
      Type.Literal("ready_to_create"),
      Type.Literal("evidence"),
      Type.Literal("duplicate"),
      Type.Literal("rejected"),
    ])),
    priority: Type.Optional(Type.Number()),
    phase: Type.Optional(Type.String()),
    labels: Type.Optional(plannerStringListToolSchema),
    blockedBy: Type.Optional(plannerStringListToolSchema),
    sourceRefs: Type.Optional(Type.Array(plannerSourceRefToolSchema)),
    clarificationQuestions: Type.Optional(plannerStringListToolSchema),
    acceptanceCriteria: plannerStringListToolSchema,
    testPlan: plannerTestPlanToolSchema,
  }),
  Type.Object({
    type: Type.Literal("question"),
    questionId: Type.String(),
    question: Type.String(),
    charterSection: Type.Optional(Type.String()),
    cardId: Type.Optional(Type.String()),
    required: Type.Optional(Type.Boolean()),
    createdAt: Type.String({ description: "ISO timestamp." }),
  }),
  Type.Object({
    type: Type.Literal("source_coverage"),
    sourceId: Type.String(),
    range: Type.Optional(Type.String()),
    status: Type.Union([
      Type.Literal("covered"),
      Type.Literal("partial"),
      Type.Literal("unresolved"),
      Type.Literal("ignored"),
    ]),
    cardIds: Type.Optional(plannerStringListToolSchema),
    note: Type.Optional(Type.String()),
    updatedAt: Type.String({ description: "ISO timestamp." }),
  }),
  Type.Object({
    type: Type.Literal("dependency_edge"),
    fromCardId: Type.String({ description: "Blocking card sourceId. Use fromCardId, not from." }),
    toCardId: Type.String({ description: "Blocked card sourceId. Use toCardId, not to." }),
    reason: Type.Optional(Type.String({ description: "Optional dependency rationale." })),
    createdAt: Type.String({ description: "ISO timestamp. Use createdAt, not updatedAt." }),
  }),
  Type.Object({
    type: Type.Literal("progress"),
    stage: Type.String(),
    title: Type.String(),
    summary: Type.String(),
    createdAt: Type.String({ description: "ISO timestamp." }),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
  Type.Object({
    type: Type.Literal("warning"),
    code: Type.String(),
    message: Type.String(),
    createdAt: Type.String({ description: "ISO timestamp." }),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
  Type.Object({
    type: Type.Literal("error"),
    code: Type.String(),
    message: Type.String(),
    recoverable: Type.Optional(Type.Boolean()),
    createdAt: Type.String({ description: "ISO timestamp." }),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
  Type.Object({
    type: Type.Literal("proposal_final"),
    summary: Type.String(),
    goal: Type.String(),
    currentState: Type.String(),
    targetUser: Type.String(),
    qualityBar: Type.String(),
    assumptions: Type.Optional(plannerStringListToolSchema),
    questions: Type.Optional(plannerStringListToolSchema),
    sourceNotes: Type.Optional(plannerStringListToolSchema),
    createdAt: Type.String({ description: "ISO timestamp." }),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
]);

export interface ProjectBoardPlannerSourceQaSnippet {
  snippetId: string;
  sourceId: string;
  title: string;
  range: string;
  text: string;
}

export interface ProjectBoardPlannerSourceQaAnswerInput {
  question: string;
  sourceIds: string[];
  answerMode: string;
  cacheKey: string;
  evidenceRefs: Array<{ sourceId: string; range: string; snippetId: string }>;
  citedSnippets: ProjectBoardPlannerSourceQaSnippet[];
  needsUserDecisionHint: boolean;
}

export interface ProjectBoardPlannerSourceQaAnswerResult {
  answer: string;
  confidence?: number;
  needs_user_decision?: boolean;
  uncertaintyReason?: string;
  failureKind?: PlannerSourceQaFailureKind;
}

export type ProjectBoardPlannerSourceQaAnswerer = (
  input: ProjectBoardPlannerSourceQaAnswerInput,
) => Promise<ProjectBoardPlannerSourceQaAnswerResult>;

export interface ProjectBoardPlannerWorkspaceToolExecutorOptions {
  sourceQaAnswerer?: ProjectBoardPlannerSourceQaAnswerer;
}

export function projectBoardPlannerWorkspaceTools(): Tool[] {
  return [
    {
      name: "planner_source_manifest",
      description: "Read the planner workspace source manifest: source ids, titles, kinds, summaries, source file paths, character counts, and relevance.",
      parameters: Type.Object({}),
    },
    {
      name: "planner_source_search",
      description: "Search planner workspace sources for query terms and return bounded source snippets with offsets and cache metadata.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query or card/topic wording." }),
        sourceIds: Type.Optional(Type.Array(Type.String(), { description: "Optional source ids to restrict the search." })),
        maxResults: Type.Optional(Type.Number({ description: `Maximum results, capped at ${MAX_SEARCH_RESULTS}. Defaults to ${DEFAULT_SEARCH_RESULTS}.` })),
        maxSnippetChars: Type.Optional(Type.Number({ description: `Maximum characters per snippet, capped at ${MAX_SEARCH_SNIPPET_CHARS}. Defaults to ${DEFAULT_SEARCH_SNIPPET_CHARS}.` })),
      }),
    },
    {
      name: "planner_source_read",
      description: "Read a bounded excerpt from one source file in the planner workspace by sourceId.",
      parameters: Type.Object({
        sourceId: Type.String({ description: "Source id from planner_source_manifest or the source ledger." }),
        offset: Type.Optional(Type.Number({ description: "Zero-based character offset into the source file. Defaults to 0." })),
        maxChars: Type.Optional(Type.Number({ description: `Maximum characters to read, capped at ${MAX_SOURCE_READ_CHARS}. Defaults to ${DEFAULT_SOURCE_READ_CHARS}.` })),
      }),
    },
    {
      name: "planner_source_qa",
      description:
        "Answer an evidence question from planner workspace sources only. Returns grounded snippets, confidence, and needs_user_decision/no_evidence instead of inventing missing requirements.",
      parameters: Type.Object({
        question: Type.String({ description: "Evidence question to answer from selected sources." }),
        sourceIds: Type.Optional(Type.Array(Type.String(), { description: "Optional source ids to restrict evidence." })),
        maxEvidenceChars: Type.Optional(Type.Number({ description: `Maximum total evidence characters, capped at ${MAX_QA_EVIDENCE_CHARS}. Defaults to ${DEFAULT_QA_EVIDENCE_CHARS}.` })),
        maxSnippets: Type.Optional(Type.Number({ description: `Maximum snippets, capped at ${MAX_QA_SNIPPETS}. Defaults to ${DEFAULT_QA_SNIPPETS}.` })),
        answerMode: Type.Optional(Type.String({ description: "Use evidence_only unless explicitly experimenting with recommend_with_evidence." })),
      }),
    },
    {
      name: "planner_ledger_read",
      description: "Read the current planner ledger snapshot with rendered cards, questions, coverage, remaining coverage, and fingerprints.",
      parameters: Type.Object({
        maxChars: Type.Optional(Type.Number({ description: `Maximum characters to return, capped at ${MAX_LEDGER_READ_CHARS}.` })),
      }),
    },
    {
      name: "planner_card_search",
      description: "Search rendered/proposed candidate cards in the planner ledger to avoid duplicates and inspect dependencies.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query or proposed card wording." }),
        maxResults: Type.Optional(Type.Number({ description: `Maximum results, capped at ${MAX_SEARCH_RESULTS}. Defaults to ${DEFAULT_SEARCH_RESULTS}.` })),
      }),
    },
    {
      name: "planner_records_append",
      description:
        "Append validated project-board progressive JSONL records to the aggregate planner output and matching type-specific output files. Use this only for records that match the Ambient schema. dependency_edge requires fromCardId, toCardId, reason, and createdAt; do not use from/to/rationale/updatedAt aliases.",
      parameters: Type.Object({
        records: Type.Array(plannerRecordToolSchema, {
          description: `Progressive planning records to validate and append. Maximum ${MAX_APPEND_RECORDS} records per call.`,
        }),
      }),
    },
  ];
}

export function projectBoardPlannerWorkspaceToolPromptBlock(workspace?: ProjectBoardPlannerWorkspace): string {
  if (!workspace) return "";
  return [
    "Planner workspace tools:",
    "- planner_source_manifest(): list available planner source files and summaries.",
    `- planner_source_search({ query, sourceIds?, maxResults?, maxSnippetChars? }): search source files and return bounded snippets, capped at ${MAX_SEARCH_RESULTS} results.`,
    `- planner_source_read({ sourceId, offset?, maxChars? }): read a bounded source excerpt, capped at ${MAX_SOURCE_READ_CHARS.toLocaleString()} chars.`,
    `- planner_source_qa({ question, sourceIds?, maxEvidenceChars?, maxSnippets?, answerMode? }): answer from source evidence only; returns needs_user_decision/no_evidence rather than inventing decisions.`,
    `- planner_ledger_read({ maxChars? }): read the current planner ledger, capped at ${MAX_LEDGER_READ_CHARS.toLocaleString()} chars.`,
    "- planner_card_search({ query, maxResults? }): search already-rendered/proposed cards before emitting possible duplicates.",
    "- planner_records_append({ records }): validate and append progressive records to the aggregate JSONL output and matching type-specific files.",
    "- Use planner_records_append as soon as a candidate_card, question, source_coverage, dependency_edge, warning, error, progress, or proposal_final record is ready.",
    "- dependency_edge schema is exact: { type: \"dependency_edge\", fromCardId, toCardId, reason?, createdAt }. Do not emit from/to/rationale/updatedAt aliases.",
    "- candidate_card must include sourceId, title, description, acceptanceCriteria, and testPlan { unit, integration, visual, manual }.",
    "- If a tool rejects a record, fix the schema in your next tool call or final JSON rather than using aliases or prose.",
  ].join("\n");
}

export function projectBoardPlannerWorkspaceToolExecutor(
  workspace: ProjectBoardPlannerWorkspace,
  options: ProjectBoardPlannerWorkspaceToolExecutorOptions = {},
): {
  tools: Tool[];
  execute: (toolCall: ToolCall, validatedArgs: unknown) => Promise<WorkflowPiToolExecutionResult>;
} {
  return {
    tools: projectBoardPlannerWorkspaceTools(),
    execute: (toolCall, validatedArgs) => executeProjectBoardPlannerWorkspaceTool(workspace, toolCall, validatedArgs, options),
  };
}

async function executeProjectBoardPlannerWorkspaceTool(
  workspace: ProjectBoardPlannerWorkspace,
  toolCall: ToolCall,
  validatedArgs: unknown,
  options: ProjectBoardPlannerWorkspaceToolExecutorOptions,
): Promise<WorkflowPiToolExecutionResult> {
  if (!isProjectBoardPlannerToolName(toolCall.name)) {
    throw new Error(`Unknown planner workspace tool: ${toolCall.name}`);
  }
  const args = objectArgs(validatedArgs);
  if (toolCall.name === "planner_source_manifest") {
    const manifest = {
      sessionId: workspace.sessionId,
      sources: workspace.sources.map((source) => ({
        sourceId: source.sourceId,
        title: source.title,
        kind: source.kind,
        summary: source.summary,
        originalPath: source.originalPath,
        workspacePath: source.workspacePath,
        charCount: source.charCount,
        relevance: source.relevance,
      })),
    };
    await appendToolProgressRecord(workspace, toolCall, {
      summary: `Read planner source manifest with ${workspace.sources.length} source${workspace.sources.length === 1 ? "" : "s"}.`,
      metadata: { sourceCount: workspace.sources.length },
    });
    return {
      text: JSON.stringify(manifest),
      details: { sourceCount: workspace.sources.length },
    };
  }
  if (toolCall.name === "planner_source_search") {
    const query = requiredString(args.query, "query");
    const sourceIds = optionalStringArray(args.sourceIds);
    const maxResults = boundedInteger(args.maxResults, 1, MAX_SEARCH_RESULTS, DEFAULT_SEARCH_RESULTS);
    const maxSnippetChars = boundedInteger(args.maxSnippetChars, 80, MAX_SEARCH_SNIPPET_CHARS, DEFAULT_SEARCH_SNIPPET_CHARS);
    const results = await searchPlannerSources(workspace, { query, sourceIds, maxResults, maxSnippetChars });
    const cacheKey = stableBoardArtifactId("planner-source-search", [
      normalizeSearchText(query),
      sourceIds.join(","),
      workspace.sources.map((source) => `${source.sourceId}:${source.charCount}`).join("|"),
    ]);
    await appendToolProgressRecord(workspace, toolCall, {
      summary: `Searched planner sources for "${query}" and found ${results.length} result${results.length === 1 ? "" : "s"}.`,
      metadata: { query, sourceIds, resultCount: results.length, cacheKey },
    });
    return {
      text: JSON.stringify({
        query,
        sourceIds,
        resultCount: results.length,
        cacheKey,
        results,
      }),
      details: { query, resultCount: results.length, cacheKey },
    };
  }
  if (toolCall.name === "planner_source_read") {
    const sourceId = requiredString(args.sourceId, "sourceId");
    const source = workspace.sources.find((item) => item.sourceId === sourceId);
    if (!source) throw new Error(`Planner source not found: ${sourceId}`);
    const offset = boundedInteger(args.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const maxChars = boundedInteger(args.maxChars, 1, MAX_SOURCE_READ_CHARS, DEFAULT_SOURCE_READ_CHARS);
    const content = await readFile(source.workspacePath, "utf8");
    const excerpt = content.slice(offset, offset + maxChars);
    const sourceChecksum = stableBoardArtifactId("planner-source-content", [source.sourceId, content]);
    const cacheKey = stableBoardArtifactId("planner-source-read", [sourceChecksum, offset, maxChars]);
    const result = {
      sourceId: source.sourceId,
      title: source.title,
      offset,
      maxChars,
      returnedChars: excerpt.length,
      totalChars: content.length,
      nextOffset: offset + excerpt.length < content.length ? offset + excerpt.length : null,
      sourceChecksum,
      cacheKey,
      text: excerpt,
    };
    await appendToolProgressRecord(workspace, toolCall, {
      summary: `Read ${excerpt.length.toLocaleString()} chars from planner source ${source.sourceId}.`,
      metadata: { sourceId: source.sourceId, offset, returnedChars: excerpt.length, totalChars: content.length, sourceChecksum, cacheKey },
    });
    return {
      text: JSON.stringify(result),
      details: { sourceId: source.sourceId, returnedChars: excerpt.length, sourceChecksum, cacheKey },
    };
  }
  if (toolCall.name === "planner_source_qa") {
    const question = requiredString(args.question, "question");
    const sourceIds = optionalStringArray(args.sourceIds);
    const maxEvidenceChars = boundedInteger(args.maxEvidenceChars, 200, MAX_QA_EVIDENCE_CHARS, DEFAULT_QA_EVIDENCE_CHARS);
    const maxSnippets = boundedInteger(args.maxSnippets, 1, MAX_QA_SNIPPETS, DEFAULT_QA_SNIPPETS);
    const answerMode = typeof args.answerMode === "string" && args.answerMode.trim() ? args.answerMode.trim() : "evidence_only";
    const result = await answerPlannerSourceQuestion(workspace, { question, sourceIds, maxEvidenceChars, maxSnippets, answerMode }, options);
    await appendToolProgressRecord(workspace, toolCall, {
      summary: result.cacheHit
        ? `Reused cached planner source QA for "${question}" with ${result.evidenceRefs.length} evidence ref${result.evidenceRefs.length === 1 ? "" : "s"}.`
        : `Answered planner source QA for "${question}" with ${result.evidenceRefs.length} evidence ref${result.evidenceRefs.length === 1 ? "" : "s"}.`,
      metadata: {
        question,
        sourceIds,
        answerMode,
        confidence: result.confidence,
        needsUserDecision: result.needs_user_decision,
        failureKind: result.failureKind,
        cacheKey: result.cacheKey,
        cacheHit: result.cacheHit,
        answerSource: result.answerSource,
        ...(result.cacheHit ? {} : { qaResult: result }),
      },
    });
    return {
      text: JSON.stringify(result),
      details: {
        question,
        evidenceRefCount: result.evidenceRefs.length,
        confidence: result.confidence,
        needsUserDecision: result.needs_user_decision,
        failureKind: result.failureKind,
        cacheKey: result.cacheKey,
        cacheHit: result.cacheHit,
        answerSource: result.answerSource,
      },
    };
  }
  if (toolCall.name === "planner_ledger_read") {
    const maxChars = boundedInteger(args.maxChars, 1, MAX_LEDGER_READ_CHARS, MAX_LEDGER_READ_CHARS);
    const content = await readFile(workspace.ledgerPath, "utf8");
    const ledgerChecksum = stableBoardArtifactId("planner-ledger-content", [content]);
    const cacheKey = stableBoardArtifactId("planner-ledger-read", [ledgerChecksum, maxChars]);
    const result = {
      ledgerPath: workspace.ledgerPath,
      returnedChars: Math.min(content.length, maxChars),
      totalChars: content.length,
      truncated: content.length > maxChars,
      ledgerChecksum,
      cacheKey,
      text: content.slice(0, maxChars),
    };
    await appendToolProgressRecord(workspace, toolCall, {
      summary: `Read planner ledger snapshot (${result.returnedChars.toLocaleString()} of ${content.length.toLocaleString()} chars).`,
      metadata: { ledgerPath: workspace.ledgerPath, returnedChars: result.returnedChars, totalChars: content.length, ledgerChecksum, cacheKey },
    });
    return {
      text: JSON.stringify(result),
      details: { returnedChars: result.returnedChars, totalChars: content.length, ledgerChecksum, cacheKey },
    };
  }
  if (toolCall.name === "planner_card_search") {
    const query = requiredString(args.query, "query");
    const maxResults = boundedInteger(args.maxResults, 1, MAX_SEARCH_RESULTS, DEFAULT_SEARCH_RESULTS);
    const results = await searchPlannerCards(workspace, { query, maxResults });
    const cacheKey = stableBoardArtifactId("planner-card-search", [
      normalizeSearchText(query),
      results.map((result) => `${result.cardId}:${result.fingerprint}`).join("|"),
    ]);
    await appendToolProgressRecord(workspace, toolCall, {
      summary: `Searched planner cards for "${query}" and found ${results.length} result${results.length === 1 ? "" : "s"}.`,
      metadata: { query, resultCount: results.length, cacheKey },
    });
    return {
      text: JSON.stringify({
        query,
        resultCount: results.length,
        cacheKey,
        results,
      }),
      details: { query, resultCount: results.length, cacheKey },
    };
  }
  const rawRecords = Array.isArray(args.records) ? args.records : [];
  if (rawRecords.length === 0) throw new Error("planner_records_append requires at least one record.");
  if (rawRecords.length > MAX_APPEND_RECORDS) {
    throw new Error(`planner_records_append accepts at most ${MAX_APPEND_RECORDS} records per call.`);
  }
  const records = rawRecords.map((record) => validateProposalJsonlRecordArtifact(normalizePlannerAppendRecord(record)));
  const progressRecord = toolProgressRecord(toolCall, {
    summary: `Appended ${records.length} validated planner record${records.length === 1 ? "" : "s"} through planner_records_append.`,
    metadata: {
      recordCount: records.length,
      recordTypes: records.map((record) => record.type),
    },
  });
  await appendProjectBoardPlannerWorkspaceRecords(workspace, [...records, progressRecord]);
  return {
    text: JSON.stringify({
      appendedRecordCount: records.length,
      recordTypes: records.map((record) => record.type),
      aggregateJsonlPath: workspace.aggregateJsonlPath,
      outputPaths: workspace.outputPaths,
      ledgerPath: workspace.ledgerPath,
    }),
    details: { appendedRecordCount: records.length, recordTypes: records.map((record) => record.type) },
  };
}

function normalizePlannerAppendRecord(record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const value = record as Record<string, unknown>;
  if (value.type !== "dependency_edge") return record;

  const normalized = { ...value };
  if (typeof normalized.fromCardId !== "string" && typeof value.from === "string") {
    normalized.fromCardId = value.from;
  }
  if (typeof normalized.toCardId !== "string" && typeof value.to === "string") {
    normalized.toCardId = value.to;
  }
  if (typeof normalized.reason !== "string" && typeof value.rationale === "string") {
    normalized.reason = value.rationale;
  }
  if (typeof normalized.createdAt !== "string" && typeof value.updatedAt === "string") {
    normalized.createdAt = value.updatedAt;
  }
  delete normalized.from;
  delete normalized.to;
  delete normalized.rationale;
  delete normalized.updatedAt;
  return normalized;
}

export function projectBoardPlannerToolProgressToRecord(progress: WorkflowPiToolProgress): ProposalJsonlRecordArtifact {
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: "planner_tool_call",
    title: `Planner tool ${progress.toolName} ${progress.status}`,
    summary: progress.resultSummary || progress.error || progress.inputSummary || "",
    createdAt: new Date().toISOString(),
    metadata: {
      toolCallId: progress.toolCallId,
      toolName: progress.toolName,
      status: progress.status,
      elapsedMs: progress.elapsedMs,
      inputSummary: progress.inputSummary,
      resultSummary: progress.resultSummary,
      error: progress.error,
    },
  });
}

async function appendToolProgressRecord(
  workspace: ProjectBoardPlannerWorkspace,
  toolCall: ToolCall,
  input: { summary: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await appendProjectBoardPlannerWorkspaceRecords(workspace, [toolProgressRecord(toolCall, input)]);
}

function toolProgressRecord(
  toolCall: ToolCall,
  input: { summary: string; metadata?: Record<string, unknown> },
): ProposalJsonlRecordArtifact {
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: "planner_tool_call",
    title: `Planner tool ${toolCall.name}`,
    summary: input.summary,
    createdAt: new Date().toISOString(),
    metadata: {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      ...input.metadata,
    },
  });
}

function isProjectBoardPlannerToolName(value: string): value is ProjectBoardPlannerToolName {
  return PROJECT_BOARD_PLANNER_TOOL_NAMES.includes(value as ProjectBoardPlannerToolName);
}

function objectArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_./:-]+/g, " ").replace(/\s+/g, " ").trim();
}

function queryTerms(query: string): string[] {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "does", "should", "would", "could", "need", "needs", "card"]);
  const terms = normalizeSearchText(query)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stop.has(term));
  return [...new Set(terms)].slice(0, 16);
}

async function searchPlannerSources(
  workspace: ProjectBoardPlannerWorkspace,
  input: { query: string; sourceIds: string[]; maxResults: number; maxSnippetChars: number },
): Promise<Array<{
  sourceId: string;
  title: string;
  kind: string;
  score: number;
  matchedTerms: string[];
  offset: number;
  range: string;
  returnedChars: number;
  totalChars: number;
  sourceChecksum: string;
  snippet: string;
}>> {
  const terms = queryTerms(input.query);
  const sourceIdSet = new Set(input.sourceIds);
  const candidates = sourceIdSet.size ? workspace.sources.filter((source) => sourceIdSet.has(source.sourceId)) : workspace.sources;
  const results = [];
  for (const source of candidates) {
    const content = await readFile(source.workspacePath, "utf8");
    const search = sourceSearchScore({ source, content, terms, query: input.query });
    if (search.score <= 0) continue;
    const offset = snippetOffset(content, search.firstMatchOffset, input.maxSnippetChars);
    const snippet = cleanSnippet(content.slice(offset, offset + input.maxSnippetChars));
    const sourceChecksum = stableBoardArtifactId("planner-source-content", [source.sourceId, content]);
    results.push({
      sourceId: source.sourceId,
      title: source.title,
      kind: source.kind,
      score: search.score,
      matchedTerms: search.matchedTerms,
      offset,
      range: `chars ${offset}-${offset + snippet.length}`,
      returnedChars: snippet.length,
      totalChars: content.length,
      sourceChecksum,
      snippet,
    });
  }
  return results.sort((left, right) => right.score - left.score || left.sourceId.localeCompare(right.sourceId)).slice(0, input.maxResults);
}

function sourceSearchScore(input: {
  source: ProjectBoardPlannerWorkspace["sources"][number];
  content: string;
  terms: string[];
  query: string;
}): { score: number; matchedTerms: string[]; firstMatchOffset: number } {
  const haystack = `${input.source.title}\n${input.source.summary}\n${input.content}`.toLowerCase();
  const contentLower = input.content.toLowerCase();
  const terms = input.terms.length ? input.terms : [normalizeSearchText(input.query)].filter(Boolean);
  let score = 0;
  let firstMatchOffset = Number.MAX_SAFE_INTEGER;
  const matchedTerms: string[] = [];
  for (const term of terms) {
    const count = occurrenceCount(haystack, term);
    if (count === 0) continue;
    matchedTerms.push(term);
    score += count;
    if (input.source.title.toLowerCase().includes(term)) score += 6;
    if (input.source.summary.toLowerCase().includes(term)) score += 4;
    const offset = contentLower.indexOf(term);
    if (offset >= 0) firstMatchOffset = Math.min(firstMatchOffset, offset);
  }
  if (firstMatchOffset === Number.MAX_SAFE_INTEGER) firstMatchOffset = 0;
  return { score, matchedTerms, firstMatchOffset };
}

async function searchPlannerCards(
  workspace: ProjectBoardPlannerWorkspace,
  input: { query: string; maxResults: number },
): Promise<Array<{
  cardId: string;
  title: string;
  candidateStatus: string;
  phase?: string;
  labels: string[];
  blockedBy: string[];
  sourceRefs: unknown[];
  score: number;
  duplicateRisk: "low" | "medium" | "high";
  matchedTerms: string[];
  fingerprint: string;
}>> {
  const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
  const latestById = new Map<string, Extract<ProposalJsonlRecordArtifact, { type: "candidate_card" }>>();
  for (const record of records) {
    if (record.type === "candidate_card") latestById.set(record.sourceId, record);
  }
  const terms = queryTerms(input.query);
  const results = [];
  for (const record of latestById.values()) {
    const text = [
      record.title,
      record.description,
      record.phase,
      record.labels.join(" "),
      record.blockedBy.join(" "),
      JSON.stringify(record.sourceRefs),
      record.acceptanceCriteria.join(" "),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    const matchedTerms = terms.filter((term) => text.includes(term));
    const exactTitle = normalizeSearchText(record.title) === normalizeSearchText(input.query);
    const score = matchedTerms.reduce((sum, term) => sum + occurrenceCount(text, term), exactTitle ? 20 : 0);
    if (score <= 0) continue;
    const duplicateRisk: "low" | "medium" | "high" =
      exactTitle || matchedTerms.length >= Math.min(3, Math.max(1, terms.length)) ? "high" : matchedTerms.length >= 2 ? "medium" : "low";
    results.push({
      cardId: record.sourceId,
      title: record.title,
      candidateStatus: record.candidateStatus,
      ...(record.phase ? { phase: record.phase } : {}),
      labels: record.labels,
      blockedBy: record.blockedBy,
      sourceRefs: record.sourceRefs,
      score,
      duplicateRisk,
      matchedTerms,
      fingerprint: stableBoardArtifactId("candidate-card-record", [JSON.stringify(record)]),
    });
  }
  return results.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title)).slice(0, input.maxResults);
}

interface ProjectBoardPlannerSourceQaResult {
  question: string;
  answer: string;
  evidenceRefs: Array<{ sourceId: string; range: string; snippetId: string }>;
  citedSnippets: ProjectBoardPlannerSourceQaSnippet[];
  confidence: number;
  needs_user_decision: boolean;
  uncertaintyReason?: string;
  failureKind?: PlannerSourceQaFailureKind;
  cacheKey: string;
  cacheHit: boolean;
  answerSource: "cache" | "pi_rlm" | "evidence_only";
}

async function answerPlannerSourceQuestion(
  workspace: ProjectBoardPlannerWorkspace,
  input: { question: string; sourceIds: string[]; maxEvidenceChars: number; maxSnippets: number; answerMode: string },
  options: ProjectBoardPlannerWorkspaceToolExecutorOptions,
): Promise<ProjectBoardPlannerSourceQaResult> {
  const searchResults = await searchPlannerSources(workspace, {
    query: input.question,
    sourceIds: input.sourceIds,
    maxResults: input.maxSnippets,
    maxSnippetChars: Math.min(MAX_SEARCH_SNIPPET_CHARS, Math.max(180, Math.floor(input.maxEvidenceChars / input.maxSnippets))),
  });
  const cacheKey = stableBoardArtifactId("planner-source-qa", [
    normalizeSearchText(input.question),
    input.sourceIds.join(","),
    input.answerMode,
    searchResults.map((result) => `${result.sourceId}:${result.sourceChecksum}:${result.offset}`).join("|"),
  ]);
  if (searchResults.length === 0) {
    return {
      question: input.question,
      answer: "No grounded answer was found in the selected planner sources.",
      evidenceRefs: [],
      citedSnippets: [],
      confidence: 0,
      needs_user_decision: true,
      uncertaintyReason: "No source snippets matched the question terms.",
      failureKind: "no_evidence",
      cacheKey,
      cacheHit: false,
      answerSource: "evidence_only",
    };
  }
  let remainingChars = input.maxEvidenceChars;
  const citedSnippets: ProjectBoardPlannerSourceQaSnippet[] = [];
  const evidenceRefs: Array<{ sourceId: string; range: string; snippetId: string }> = [];
  for (const [index, result] of searchResults.entries()) {
    if (remainingChars <= 0) break;
    const text = result.snippet.slice(0, remainingChars);
    remainingChars -= text.length;
    const snippetId = stableBoardArtifactId("planner-source-snippet", [result.sourceId, result.range, text, index]);
    citedSnippets.push({
      snippetId,
      sourceId: result.sourceId,
      title: result.title,
      range: result.range,
      text,
    });
    evidenceRefs.push({ sourceId: result.sourceId, range: result.range, snippetId });
  }
  const cached = await readCachedPlannerSourceQaResult(workspace, cacheKey);
  if (cached) {
    return {
      ...cached,
      cacheHit: true,
      answerSource: "cache",
    };
  }
  const needsUserDecision = asksForPreference(input.question);
  const answer = [
    needsUserDecision
      ? "The sources provide related evidence, but the question appears to require a product/scope preference. Treat this as needs_user_decision unless the cited evidence fully resolves it."
      : "Grounded source evidence found. Use the cited snippets as the basis for the planner decision; do not infer beyond them.",
    ...citedSnippets.slice(0, 3).map((snippet, index) => `${index + 1}. ${snippet.title}: ${firstEvidenceSentence(snippet.text)}`),
  ].join("\n");
  const fallback: ProjectBoardPlannerSourceQaResult = {
    question: input.question,
    answer,
    evidenceRefs,
    citedSnippets,
    confidence: Math.min(0.9, 0.35 + citedSnippets.length * 0.15),
    needs_user_decision: needsUserDecision,
    ...(needsUserDecision ? { uncertaintyReason: "Question appears to require a user preference, priority, or scope decision.", failureKind: "needs_user_decision" as const } : {}),
    cacheKey,
    cacheHit: false,
    answerSource: "evidence_only",
  };
  if (!options.sourceQaAnswerer) return fallback;
  try {
    const answered = await options.sourceQaAnswerer({
      question: input.question,
      sourceIds: input.sourceIds,
      answerMode: input.answerMode,
      cacheKey,
      evidenceRefs,
      citedSnippets,
      needsUserDecisionHint: needsUserDecision,
    });
    return normalizePlannerSourceQaAnswer(answered, fallback);
  } catch (error) {
    return {
      ...fallback,
      failureKind: fallback.failureKind ?? "invalid_response",
      uncertaintyReason: fallback.uncertaintyReason ?? `Pi/RLM source QA failed; fell back to evidence snippets: ${errorMessage(error)}`,
    };
  }
}

async function readCachedPlannerSourceQaResult(
  workspace: ProjectBoardPlannerWorkspace,
  cacheKey: string,
): Promise<ProjectBoardPlannerSourceQaResult | undefined> {
  const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
  for (const record of records.slice().reverse()) {
    if (record.type !== "progress" || record.stage !== "planner_tool_call") continue;
    const metadata = record.metadata;
    if (metadata.toolName !== "planner_source_qa" || metadata.cacheKey !== cacheKey) continue;
    const qaResult = metadata.qaResult;
    if (!qaResult || typeof qaResult !== "object" || Array.isArray(qaResult)) continue;
    const normalized = normalizeCachedPlannerSourceQaResult(qaResult as Record<string, unknown>);
    if (normalized && !normalized.cacheHit) return normalized;
  }
  return undefined;
}

function normalizeCachedPlannerSourceQaResult(value: Record<string, unknown>): ProjectBoardPlannerSourceQaResult | undefined {
  if (typeof value.question !== "string" || typeof value.answer !== "string" || typeof value.cacheKey !== "string") return undefined;
  if (!Array.isArray(value.evidenceRefs) || !Array.isArray(value.citedSnippets)) return undefined;
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? clampConfidence(value.confidence) : 0;
  const needsUserDecision = value.needs_user_decision === true;
  const failureKind = typeof value.failureKind === "string" && isPlannerSourceQaFailureKind(value.failureKind) ? value.failureKind : undefined;
  const result: ProjectBoardPlannerSourceQaResult = {
    question: value.question,
    answer: value.answer,
    evidenceRefs: value.evidenceRefs.filter(isEvidenceRef),
    citedSnippets: value.citedSnippets.filter(isQaSnippet),
    confidence,
    needs_user_decision: needsUserDecision,
    cacheKey: value.cacheKey,
    cacheHit: value.cacheHit === true,
    answerSource: value.answerSource === "pi_rlm" || value.answerSource === "evidence_only" ? value.answerSource : "evidence_only",
    ...(typeof value.uncertaintyReason === "string" ? { uncertaintyReason: value.uncertaintyReason } : {}),
    ...(failureKind ? { failureKind } : {}),
  };
  return result;
}

function normalizePlannerSourceQaAnswer(
  answered: ProjectBoardPlannerSourceQaAnswerResult,
  fallback: ProjectBoardPlannerSourceQaResult,
): ProjectBoardPlannerSourceQaResult {
  const answer = typeof answered.answer === "string" && answered.answer.trim() ? answered.answer.trim().slice(0, 4000) : fallback.answer;
  const confidence =
    typeof answered.confidence === "number" && Number.isFinite(answered.confidence)
      ? clampConfidence(answered.confidence)
      : Math.min(0.95, fallback.confidence + 0.05);
  const needsUserDecision = fallback.needs_user_decision || answered.needs_user_decision === true;
  const failureKind =
    typeof answered.failureKind === "string" && isPlannerSourceQaFailureKind(answered.failureKind)
      ? answered.failureKind
      : needsUserDecision
        ? "needs_user_decision"
        : undefined;
  return {
    ...fallback,
    answer,
    confidence,
    needs_user_decision: needsUserDecision,
    ...(typeof answered.uncertaintyReason === "string" && answered.uncertaintyReason.trim()
      ? { uncertaintyReason: answered.uncertaintyReason.trim().slice(0, 1000) }
      : needsUserDecision && !fallback.uncertaintyReason
        ? { uncertaintyReason: "Pi/RLM source QA marked this as requiring a user decision." }
        : {}),
    ...(failureKind ? { failureKind } : {}),
    answerSource: "pi_rlm",
    cacheHit: false,
  };
}

function isEvidenceRef(value: unknown): value is { sourceId: string; range: string; snippetId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.sourceId === "string" && typeof record.range === "string" && typeof record.snippetId === "string";
}

function isQaSnippet(value: unknown): value is ProjectBoardPlannerSourceQaSnippet {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.snippetId === "string" &&
    typeof record.sourceId === "string" &&
    typeof record.title === "string" &&
    typeof record.range === "string" &&
    typeof record.text === "string"
  );
}

function isPlannerSourceQaFailureKind(value: string): value is PlannerSourceQaFailureKind {
  return value === "no_evidence" || value === "too_much_evidence" || value === "needs_user_decision" || value === "invalid_response" || value === "timeout";
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function occurrenceCount(value: string, term: string): number {
  if (!term) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const found = value.indexOf(term, offset);
    if (found < 0) return count;
    count += 1;
    offset = found + term.length;
  }
}

function snippetOffset(content: string, matchOffset: number, maxSnippetChars: number): number {
  if (content.length <= maxSnippetChars) return 0;
  const target = Math.max(0, matchOffset - Math.floor(maxSnippetChars / 3));
  const lineStart = content.lastIndexOf("\n", target);
  return lineStart >= 0 ? lineStart + 1 : target;
}

function cleanSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstEvidenceSentence(value: string): string {
  const sentence = cleanSnippet(value).split(/(?<=[.!?])\s+/)[0] ?? "";
  return sentence.slice(0, 500);
}

function asksForPreference(question: string): boolean {
  return /\b(should|prefer|choose|decision|scope|priority|trade[- ]?off|recommend|better|best)\b/i.test(question);
}
