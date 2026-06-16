import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  AutomationThreadKind,
  CollaborationMode,
  ContextUsageSnapshot,
  OrchestrationRun,
  PermissionAuditEntry,
  PermissionMode,
  PlannerDecisionQuestion,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
  PlannerPlanWorkflowState,
  ProjectBoardCard,
  ProjectBoardCardProofReview,
  ProjectBoardDecisionDraftRefreshSuggestion,
  ProjectBoardEvent,
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
  ProjectBoardSource,
  ProjectBoardSourceDraftRefreshSuggestion,
  ProjectBoardSummary,
  ProjectBoardSynthesisRunEvent,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  SaveSymphonyWorkflowRecipeInput,
  SubagentRunStatus,
  ThinkingLevel,
  ThreadGoalStatus,
  ThreadKind,
  ThreadWorktreeSummary,
  WorkflowRecordingPlaybookDraft,
} from "../shared/types";
import type { SymphonyWorkflowRecipePreset } from "../shared/symphonyWorkflowRecipes";
import { projectBoardPlanTitleIsGeneric } from "../shared/projectBoardPlanIdentity";
import { LEGACY_PROJECT_STATE_DIR } from "./workspaceAuthorityState";
import { DURABLE_PLAN_SOURCE_AUTHORITY_REASON, projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import { parseStringList } from "./projectStoreJson";
import {
  normalizeCardTextList,
  normalizeTaskLabels,
  projectBoardSourceInputFromExisting,
  type ProjectBoardCardStoreRow,
  type ProjectBoardCharterStoreRow,
  type ProjectBoardEventStoreRow,
  type ProjectBoardExecutionArtifactStoreRow,
  type ProjectBoardQuestionStoreRow,
  type ProjectBoardSourceClassificationInput as ProjectBoardSourceClassificationMapperInput,
  type ProjectBoardSourceStoreRow,
  type ProjectBoardStoreRow,
  type ProjectBoardSynthesisProposalStoreRow,
  type ProjectBoardSynthesisRunStoreRow,
} from "./projectBoardStoreMappers";
import type { ProjectBoardSynthesisCardInput } from "./projectBoardSynthesis";

export const PROJECT_STATE_DIR = LEGACY_PROJECT_STATE_DIR;
export const AUTOMATION_HOME_FOLDER_ID = "home";
export const WORKFLOW_AGENT_HOME_FOLDER_ID = "home";
export const WORKFLOW_DEBUG_TRACE_RETENTION_DAYS = 30;
export function defaultOrchestrationProjectPath(workspacePath: string): string {
  return ambientManagedWorkspaceOwnerPath(workspacePath, [`/${PROJECT_STATE_DIR}/orchestration/workspaces/`]);
}

export function defaultProjectArtifactWorkspacePath(workspacePath: string): string {
  return ambientManagedWorkspaceOwnerPath(workspacePath, [
    `/${PROJECT_STATE_DIR}/worktrees/`,
    `/${PROJECT_STATE_DIR}/orchestration/workspaces/`,
  ]);
}

export function ambientManagedWorkspaceOwnerPath(workspacePath: string, markers: string[]): string {
  const normalized = workspacePath.replace(/\\/g, "/");
  const markerIndex = markers
    .map((marker) => normalized.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (markerIndex === undefined) return workspacePath;
  return workspacePath.slice(0, markerIndex);
}

export function normalizeArtifactDraftTargetPath(workspacePath: string, requestedPath: string): string {
  if (!requestedPath.trim()) throw new Error("Artifact draft targetPath is required.");
  const workspace = resolve(workspacePath);
  const absolutePath = resolve(workspace, requestedPath);
  const relativePath = relative(workspace, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Artifact draft targetPath must stay inside the active workspace.");
  }
  return relativePath;
}

export const DEFAULT_PROJECT_BOARD_QUESTIONS = [
  "What is the primary outcome this project board should optimize for?",
  "Which sources should be treated as authoritative if threads and docs disagree?",
  "How should Ambient handle judgment calls while executing cards?",
  "What proof should be required before a card is considered review-ready?",
  "How should Ambient sequence and retry card execution when work is blocked or incomplete?",
];
export const MAX_PROJECT_BOARD_SYNTHESIS_CARDS = 120;

export interface StageProjectBoardDecisionDraftPiUpdatesInput extends RefreshProjectBoardDecisionDraftsInput {
  suggestions: ProjectBoardDecisionDraftRefreshSuggestion[];
  model?: string;
  telemetry?: {
    promptCharCount: number;
    responseCharCount: number;
    requestDurationMs: number;
  };
  fallbackUsed?: boolean;
  providerError?: string;
}

export interface StageProjectBoardSourceDraftPiUpdatesInput extends RefreshProjectBoardSourceDraftsInput {
  suggestions: ProjectBoardSourceDraftRefreshSuggestion[];
  model?: string;
  telemetry?: {
    promptCharCount: number;
    responseCharCount: number;
    requestDurationMs: number;
  };
  fallbackUsed?: boolean;
  providerError?: string;
}
export interface ProjectBoardSynthesisApplyOptions {
  replaceExistingDraft?: boolean;
  insertQuestions?: boolean;
  deleteStaleDraftCards?: boolean;
  sourceIdNamespace?: string;
  snapshotRunId?: string;
  snapshotKind?: ProjectBoardPlanningSnapshotKind;
  coverPlannerPlanDrafts?: boolean;
}

export interface CreateThreadOptions {
  permissionMode?: PermissionMode;
  collaborationMode?: CollaborationMode;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  kind?: ThreadKind;
  parentThreadId?: string;
  parentMessageId?: string;
  parentRunId?: string;
  subagentRunId?: string;
  canonicalTaskPath?: string;
  childOrder?: number;
  collapsedByDefault?: boolean;
  childStatus?: SubagentRunStatus;
}

export const terminalThreadGoalStatuses = new Set<ThreadGoalStatus>(["blocked", "usage_limited", "budget_limited", "complete"]);

export function positiveIntegerOrNull(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

export function normalizedOptionalText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export type ProjectBoardRow = ProjectBoardStoreRow;

export type ProjectBoardCharterRow = ProjectBoardCharterStoreRow;
export type ProjectBoardCardRow = ProjectBoardCardStoreRow;
export type ProjectBoardSourceRow = ProjectBoardSourceStoreRow;
export type ProjectBoardQuestionRow = ProjectBoardQuestionStoreRow;
export type ProjectBoardEventRow = ProjectBoardEventStoreRow;
export type ProjectBoardSynthesisProposalRow = ProjectBoardSynthesisProposalStoreRow;
export type ProjectBoardSynthesisRunRow = ProjectBoardSynthesisRunStoreRow;
export type ProjectBoardExecutionArtifactRow = ProjectBoardExecutionArtifactStoreRow;

export type ProjectBoardSourceLike = ProjectBoardSourceRow | ProjectBoardSource;

export function projectBoardSourceLikeId(source: ProjectBoardSourceLike): string {
  return source.id;
}

export function projectBoardSourceLikeSourceKey(source: ProjectBoardSourceLike): string | undefined {
  return "source_key" in source ? source.source_key ?? undefined : source.sourceKey;
}

export function projectBoardSourceLikeThreadId(source: ProjectBoardSourceLike): string | undefined {
  return "thread_id" in source ? source.thread_id ?? undefined : source.threadId;
}

export function projectBoardSourceLikeArtifactId(source: ProjectBoardSourceLike): string | undefined {
  return "artifact_id" in source ? source.artifact_id ?? undefined : source.artifactId;
}

export function projectBoardSourceLikeMessageId(source: ProjectBoardSourceLike): string | undefined {
  return "message_id" in source ? source.message_id ?? undefined : source.messageId;
}

export function projectBoardSourceRefMatchesSource(ref: string, source: ProjectBoardSourceRow | ProjectBoardSource): boolean {
  const normalized = ref.trim();
  if (!normalized) return false;
  return [
    projectBoardSourceLikeId(source),
    projectBoardSourceLikeSourceKey(source),
    source.path,
    projectBoardSourceLikeThreadId(source),
    projectBoardSourceLikeArtifactId(source),
    projectBoardSourceLikeMessageId(source),
  ].some((value) => value?.trim() === normalized);
}

export function projectBoardSourceRowIncludedInSynthesis(source: ProjectBoardSourceRow): boolean {
  return projectBoardSourceIncludedInSynthesis({
    kind: source.source_kind,
    authorityRole: source.authority_role ?? undefined,
    includeInSynthesis: source.include_in_synthesis !== 0,
  });
}

export function projectBoardSourceAllowedForBoard(source: ProjectBoardSourceRow | ProjectBoardSource, boardSourceThreadId: string | undefined): boolean {
  const included =
    "source_kind" in source
      ? projectBoardSourceRowIncludedInSynthesis(source)
      : projectBoardSourceIncludedInSynthesis(source);
  if (!included) return false;
  const sourceThreadId = projectBoardSourceLikeThreadId(source)?.trim();
  if (boardSourceThreadId && sourceThreadId && sourceThreadId !== boardSourceThreadId) return false;
  return true;
}

export function projectBoardMatchingSourcesForRefs(refs: string[], sources: Array<ProjectBoardSourceRow | ProjectBoardSource>): Array<ProjectBoardSourceRow | ProjectBoardSource> {
  const matches: Array<ProjectBoardSourceRow | ProjectBoardSource> = [];
  for (const ref of refs) {
    for (const source of sources) {
      if (projectBoardSourceRefMatchesSource(ref, source)) matches.push(source);
    }
  }
  return matches;
}

export function projectBoardSynthesisCardAllowedForBoardSources(input: {
  card: Pick<ProjectBoardSynthesisCardInput, "sourceRefs">;
  sources: Array<ProjectBoardSourceRow | ProjectBoardSource>;
  boardSourceThreadId?: string;
}): boolean {
  const refs = normalizeCardTextList(input.card.sourceRefs ?? [], 20);
  if (refs.length === 0) return true;
  const matchingSources = projectBoardMatchingSourcesForRefs(refs, input.sources);
  if (matchingSources.length === 0) return true;
  return matchingSources.some((source) => projectBoardSourceAllowedForBoard(source, input.boardSourceThreadId));
}

export function projectBoardSynthesisCardThreadId(input: {
  card: Pick<ProjectBoardSynthesisCardInput, "sourceRefs">;
  sources: Array<ProjectBoardSourceRow | ProjectBoardSource>;
  boardSourceThreadId?: string;
}): string | null {
  if (input.boardSourceThreadId) return input.boardSourceThreadId;
  const refs = normalizeCardTextList(input.card.sourceRefs ?? [], 20);
  const sourceThreadIds = new Set(
    projectBoardMatchingSourcesForRefs(refs, input.sources)
      .filter((source) => projectBoardSourceAllowedForBoard(source, undefined))
      .map((source) => projectBoardSourceLikeThreadId(source)?.trim())
      .filter((threadId): threadId is string => Boolean(threadId)),
  );
  return sourceThreadIds.size === 1 ? [...sourceThreadIds][0] : null;
}

export function repairProjectBoardSynthesisCardsWithExcludedSourceRefs(db: Database.Database): number {
  const boards = db
    .prepare("SELECT * FROM project_boards WHERE status != 'archived' AND source_thread_id IS NOT NULL")
    .all() as ProjectBoardRow[];
  if (boards.length === 0) return 0;
  const selectSources = db.prepare("SELECT * FROM project_board_sources WHERE board_id = ?");
  const selectCards = db.prepare(
    `SELECT * FROM project_board_cards
     WHERE board_id = ?
       AND status = 'draft'
       AND source_kind = 'board_synthesis'
       AND candidate_status NOT IN ('evidence', 'duplicate', 'rejected')
       AND orchestration_task_id IS NULL
       AND user_touched_at IS NULL`,
  );
  const updateCard = db.prepare(
    `UPDATE project_board_cards
     SET candidate_status = 'rejected',
         labels_json = ?,
         updated_at = ?
     WHERE id = ?
       AND candidate_status NOT IN ('evidence', 'duplicate', 'rejected')`,
  );
  let repaired = 0;
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    for (const board of boards) {
      const boardSourceThreadId = board.source_thread_id?.trim();
      if (!boardSourceThreadId) continue;
      const sources = selectSources.all(board.id) as ProjectBoardSourceRow[];
      if (sources.length === 0) continue;
      const cards = selectCards.all(board.id) as ProjectBoardCardRow[];
      for (const card of cards) {
        const refs = parseStringList(card.source_refs_json ?? "[]");
        if (refs.length === 0) continue;
        const matchingSources = projectBoardMatchingSourcesForRefs(refs, sources);
        if (matchingSources.length === 0) continue;
        if (matchingSources.some((source) => projectBoardSourceAllowedForBoard(source, boardSourceThreadId))) continue;
        const labels = normalizeTaskLabels([...parseStringList(card.labels_json ?? "[]"), "source:excluded"]);
        const result = updateCard.run(JSON.stringify(labels), now, card.id);
        if (result.changes > 0) repaired += result.changes;
      }
    }
  });
  transaction();
  return repaired;
}

export interface AutomationThreadFolderRow {
  source_kind: AutomationThreadKind;
  source_id: string;
  folder_id: string;
  created_at: string;
  updated_at: string;
}

export type PermissionAuditInput = Omit<PermissionAuditEntry, "id" | "createdAt">;
export type PlannerPlanArtifactInput = Omit<PlannerPlanArtifact, "id" | "status" | "workflowState" | "createdAt" | "updatedAt" | "decisionQuestions"> & {
  status?: PlannerPlanArtifactStatus;
  workflowState?: PlannerPlanWorkflowState;
  decisionQuestions?: PlannerDecisionQuestion[];
};
export type ProjectBoardSourceInput = Omit<ProjectBoardSource, "id" | "boardId" | "createdAt" | "updatedAt">;
export type ProjectBoardSourceClassificationInput = ProjectBoardSourceClassificationMapperInput;
export type ProjectBoardEventInput = Omit<ProjectBoardEvent, "id" | "createdAt" | "metadata"> & {
  metadata?: Record<string, unknown>;
  createdAt?: string;
};
export type ThreadWorktreeInput = Omit<ThreadWorktreeSummary, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};
export type ContextUsageSnapshotInput = Omit<ContextUsageSnapshot, "updatedAt"> & { updatedAt?: string };
export type OrchestrationTaskUpdateInput = {
  id: string;
  title?: string;
  description?: string;
  state?: string;
  priority?: number | null;
  labels?: string[];
  blockedBy?: string[];
};

export function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readManagedBoardPlanContent(workspacePath: string, relativePath: string): string | undefined {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized.startsWith(".ambient/board/plans/")) return undefined;
  try {
    return readFileSync(join(workspacePath, normalized), "utf8");
  } catch {
    return undefined;
  }
}

export function durablePlanSourceExcerptForBoardSource(durablePlanHtml: string, fallbackContent = "", maxLength = 20_000): string {
  const sourcePlan = durablePlanHtml.match(/<section\s+id=["']source-plan["'][\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  if (sourcePlan) return boundedProjectBoardSourceExcerpt(decodeDurablePlanHtml(stripDurablePlanHtml(sourcePlan)), maxLength);

  const executiveSummary = durablePlanHtml.match(/<section\s+id=["']executive-summary["'][\s\S]*?<\/section>/i)?.[0];
  if (executiveSummary) {
    const summary = decodeDurablePlanHtml(stripDurablePlanHtml(executiveSummary));
    return boundedProjectBoardSourceExcerpt([summary, fallbackContent.trim()].filter(Boolean).join("\n\n"), maxLength);
  }

  return boundedProjectBoardSourceExcerpt(fallbackContent.trim() || durablePlanHtml, maxLength);
}

export function boundedProjectBoardSourceExcerpt(content: string, maxLength: number): string {
  const cleaned = content.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  if (!cleaned || cleaned.length <= maxLength) return cleaned;
  const headLength = Math.floor(maxLength * 0.72);
  const tailLength = Math.floor(maxLength * 0.2);
  const omitted = cleaned.length - headLength - tailLength;
  return [
    cleaned.slice(0, headLength).trim(),
    `[... ${omitted.toLocaleString()} characters omitted from middle of source ...]`,
    cleaned.slice(-tailLength).trim(),
  ].join("\n\n");
}

export function stripDurablePlanHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeDurablePlanHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export const PROJECT_BOARD_SCOPE_FEATURES = new Set<ProjectBoardScopeFeature>([
  "auth",
  "accounts",
  "analytics",
  "sync",
  "collaboration",
  "notifications",
  "backend",
  "payments",
  "deployment",
  "admin_reporting",
]);

export function projectBoardPlanningScopeFromRunEvents(events: ProjectBoardSynthesisRunEvent[]): {
  scopeContract?: ProjectBoardScopeContract;
  planningDepth?: ProjectBoardPlanningDepthAssessment;
} {
  for (const event of [...events].reverse()) {
    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : undefined;
    const scopeContract = projectBoardScopeContractFromMetadata(metadata?.scopeContract);
    const planningDepth = projectBoardPlanningDepthFromMetadata(metadata?.planningDepth) ?? scopeContract?.planningDepth;
    if (scopeContract || planningDepth) return { ...(scopeContract ? { scopeContract } : {}), ...(planningDepth ? { planningDepth } : {}) };
  }
  return {};
}

export function projectBoardScopeContractFromMetadata(value: unknown): ProjectBoardScopeContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    included: projectBoardScopeFeaturesFromMetadata(record.included),
    excluded: projectBoardScopeFeaturesFromMetadata(record.excluded),
    requiredCapabilities: projectBoardStringArrayFromMetadata(record.requiredCapabilities, 20, 500),
    supportingCapabilities: projectBoardStringArrayFromMetadata(record.supportingCapabilities, 20, 500),
    optionalCapabilities: projectBoardStringArrayFromMetadata(record.optionalCapabilities, 20, 500),
    excludedCapabilities: projectBoardStringArrayFromMetadata(record.excludedCapabilities, 20, 500),
    planningDepth: projectBoardPlanningDepthFromMetadata(record.planningDepth),
    planningDepthHints: projectBoardStringArrayFromMetadata(record.planningDepthHints, 12, 500),
    openQuestions: projectBoardStringArrayFromMetadata(record.openQuestions, 12, 500),
    evidence: projectBoardStringArrayFromMetadata(record.evidence, 20, 500),
  };
}

export function projectBoardPlanningDepthFromMetadata(value: unknown): ProjectBoardPlanningDepthAssessment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const level =
    typeof record.level === "string" && ["shallow", "standard", "deep", "phased"].includes(record.level)
      ? (record.level as ProjectBoardPlanningDepthAssessment["level"])
      : undefined;
  if (!level) return undefined;
  const score = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : 0;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    level,
    signals: projectBoardStringArrayFromMetadata(record.signals, 20, 500),
    guidance: typeof record.guidance === "string" ? record.guidance.trim().slice(0, 1000) : "",
  };
}

export function projectBoardScopeFeaturesFromMetadata(value: unknown): ProjectBoardScopeFeature[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ProjectBoardScopeFeature>();
  for (const item of value) {
    if (typeof item !== "string" || !PROJECT_BOARD_SCOPE_FEATURES.has(item as ProjectBoardScopeFeature)) continue;
    seen.add(item as ProjectBoardScopeFeature);
  }
  return [...seen];
}

export function projectBoardStringArrayFromMetadata(value: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    seen.add(trimmed.slice(0, itemLimit));
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function projectBoardSourceInputExcludedByDurablePlan(source: ProjectBoardSource): ProjectBoardSourceInput {
  return {
    ...projectBoardSourceInputFromExisting(source),
    changeState: "changed",
    authorityRole: "ignored",
    includeInSynthesis: false,
    classificationConfidence: Math.max(source.classificationConfidence ?? 0, 0.9),
    classificationReason: `${DURABLE_PLAN_SOURCE_AUTHORITY_REASON}; excluded from synthesis by default because the current durable planner artifact is the board source of truth.`,
  };
}

export function plannerPlanArtifactSourceContent(artifact: Pick<PlannerPlanArtifact, "title" | "summary" | "content">): string {
  return artifact.content.trim() || artifact.summary.trim() || artifact.title.trim();
}

export function compactPlannerPlanKickoffAnswer(artifact: Pick<PlannerPlanArtifact, "title" | "summary">, question: string, index: number): string {
  const title = artifact.title.trim() || "the compact durable plan";
  const summary = artifact.summary.trim() || `Implement ${title}.`;
  const text = question.toLowerCase();
  if (text.includes("primary outcome") || text.includes("goal")) {
    return `${summary} Treat the compact durable plan as the complete scope boundary.`;
  }
  if (text.includes("source") || text.includes("authority")) {
    return `Treat ${title} as the durable source of truth. Use other included sources only for context when they do not expand the compact scope.`;
  }
  if (text.includes("judgment") || text.includes("ambiguous") || text.includes("decision")) {
    return "Prefer the narrowest professional default that satisfies the compact plan. Do not add optional features or broaden scope unless the user explicitly asks.";
  }
  if (text.includes("proof") || text.includes("review") || text.includes("test")) {
    return "Require proof proportional to the compact local scope: confirm the requested behavior works, capture browser/manual proof for UI behavior, and avoid extra proof-only cards unless implementation proof is missing.";
  }
  if (text.includes("sequence") || text.includes("retry") || text.includes("blocked") || text.includes("incomplete")) {
    return "Execute as one compact implementation task. If proof is incomplete, retry or request only the missing proof instead of expanding the board.";
  }
  return `Use the compact durable plan for kickoff section ${index + 1}: ${summary}`;
}

export function projectBoardCanAdoptPlannerBoardTitle(title: string): boolean {
  const normalized = title.trim().replace(/\s+/g, " ");
  const withoutBoard = normalized.replace(/\s+board$/i, "").trim();
  return projectBoardPlanTitleIsGeneric(withoutBoard) || /^(?:tests?|project|planning|new|untitled|file\s+summary)\s+board$/i.test(normalized);
}

export function symphonyWorkflowRecipeTitle(recipe: SymphonyWorkflowRecipePreset, goal: string): string {
  return truncateForWorkflowPlaybook(`Symphony ${recipe.label}: ${goal}`, 180);
}

export function symphonyWorkflowRecipePlaybook(input: {
  recipe: SymphonyWorkflowRecipePreset;
  goal: string;
  blocking?: boolean;
  stepAnswers?: SaveSymphonyWorkflowRecipeInput["stepAnswers"];
  metricCustomizations?: SaveSymphonyWorkflowRecipeInput["metricCustomizations"];
  now: string;
}): WorkflowRecordingPlaybookDraft {
  const { recipe, goal, now } = input;
  const defaultBlocking = input.blocking === true;
  return {
    status: "confirmed",
    source: "symphony_recipe",
    generatedAt: now,
    confirmedAt: now,
    sourceCapturedAt: now,
    intent: symphonyWorkflowRecipeTitle(recipe, goal),
    inputs: [
      `Workflow goal parameter: ${truncateForWorkflowPlaybook(goal, 900)}`,
      `Symphony pattern preset: ${recipe.label} (${recipe.id}).`,
      `Default blocking preference: ${defaultBlocking ? "parent blocks on the visible workflow result" : "parent may continue unless launch input requests blocking"}.`,
      `Readable recipe source preview: ${truncateForWorkflowPlaybook(recipe.sourcePreview.text, 900)}`,
      ...recipe.builderSteps.map((step) =>
        truncateForWorkflowPlaybook(symphonyWorkflowRecipeStepLine(step, input.stepAnswers?.[step.id]), 900)
      ),
      ...recipe.metricTemplates.map((template) =>
        truncateForWorkflowPlaybook(
          `Metric/rubric ${template.label}: ${input.metricCustomizations?.[template.id]?.trim() || template.prompt}`,
          900,
        )
      ),
      `Hard limits: fanout ${recipe.hardLimits.maxFanout}, depth ${recipe.hardLimits.maxDepth}, token budget ${recipe.hardLimits.maxTokenBudget}, local memory ${recipe.hardLimits.maxLocalMemoryBytes} bytes.`,
    ],
    successfulExamples: [
      {
        toolName: `ambient_workflow_symphony_${recipe.id}`,
        inputPreview: symphonyWorkflowRecipeInputPreview(goal, defaultBlocking),
        resultPreview: "Creates a visible background workflow with default-collapsed child threads and a parent-readable result artifact.",
      },
    ],
    doNot: [
      {
        toolName: `ambient_workflow_symphony_${recipe.id}`,
        status: "permission_blocked",
        reason: "Do not expose this workflow tool to child agents unless an explicit child role policy and nested fanout limit allow it.",
      },
      {
        status: "skipped",
        reason: "Do not launch while ambient.subagents is disabled or before the launch card confirms agents, budget, tool scope, checkpoint behavior, and approval failure handling.",
      },
      {
        status: "failed",
        reason: "Do not synthesize parent results from failed, stopped, timed-out, detached, or partial children unless the run is explicitly marked partial.",
      },
    ],
    validation: [
      "Validate callable input with JSON Schema and repair before registration or execution.",
      "Show a launch card with estimated agents, token/cost budget, tool/mutation scope, checkpoint/resume behavior, and approval failure handling.",
      ...recipe.metricTemplates.map((template) =>
        `Require ${template.kind.replace(/_/g, " ")}: ${input.metricCustomizations?.[template.id]?.trim() || template.prompt}`
      ),
      "Respect hard fanout, depth, token, model, local-runtime lease, and projected-memory checks before launch.",
    ],
    outputShape: [
      "Visible background workflow task with progress, token/cost tracking, pause/resume/cancel, and optional parent blocking.",
      "Default-collapsed child threads under the parent thread, with text and visual indicators for blocking children.",
      "Result artifact containing child summaries, metric/rubric results, partial/failure status, and provenance.",
      "Recorder captures a compact workflow invocation by default; full traces remain diagnostics artifacts.",
    ],
    evidenceSummary: {
      messageCount: 0,
      toolResultCount: 0,
      successfulToolResultCount: 0,
      failedToolResultCount: 0,
      skippedToolResultCount: 0,
      permissionBlockedToolResultCount: 0,
      redactionCount: 0,
    },
  };
}

export function symphonyWorkflowRecipeStepLine(
  step: SymphonyWorkflowRecipePreset["builderSteps"][number],
  answer: NonNullable<SaveSymphonyWorkflowRecipeInput["stepAnswers"]>[string] | undefined,
): string {
  const choice = answer?.choiceId ? step.choices.find((candidate) => candidate.id === answer.choiceId) : undefined;
  const customText = answer?.customText?.trim();
  const selected = [
    choice ? `${choice.label} (${choice.id})` : undefined,
    customText ? `Custom: ${customText}` : undefined,
  ].filter(Boolean);
  return `${step.question}: ${selected.length ? selected.join("; ") : "Use the recommended preset default."} Impact: ${step.impact}`;
}

export function symphonyWorkflowRecipeInputPreview(goal: string, blocking: boolean): string {
  return truncateForWorkflowPlaybook(JSON.stringify({ goal, scope: "Bounded target supplied at invocation time.", blocking }), 1000);
}

export function symphonyWorkflowRecipeTranscript(input: {
  threadId: string;
  recipe: SymphonyWorkflowRecipePreset;
  goal: string;
  blocking?: boolean;
  stepAnswers?: SaveSymphonyWorkflowRecipeInput["stepAnswers"];
  metricCustomizations?: SaveSymphonyWorkflowRecipeInput["metricCustomizations"];
  savedAt: string;
}): string {
  return `${JSON.stringify({
    type: "symphony.recipe_saved",
    schemaVersion: input.recipe.schemaVersion,
    threadId: input.threadId,
    patternId: input.recipe.id,
    goal: input.goal,
    blocking: input.blocking === true,
    stepAnswers: input.stepAnswers ?? {},
    metricCustomizations: input.metricCustomizations ?? {},
    savedAt: input.savedAt,
  })}\n`;
}

export function truncateForWorkflowPlaybook(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...` : normalized;
}

export interface ProjectBoardProofReviewContext {
  card: ProjectBoardCard;
  board?: ProjectBoardSummary;
  run: OrchestrationRun;
  deterministicReview: ProjectBoardCardProofReview;
}
