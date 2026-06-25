import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClaimSummary,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardStatus,
  ProjectBoardCardTestPlan,
  ProjectBoardEvent,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { PlannerPlanArtifact, PlannerPlanStep } from "../../shared/plannerTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import { normalizeCardTextList } from "./projectBoardCardNormalizationMappers";
import { normalizeProjectBoardCardRunFeedback } from "./projectBoardCardRunFeedbackMappers";
import { normalizeProjectBoardCardExecutionSessionPolicy, projectBoardCardIsUxMockGate } from "./projectBoardCardReferenceMappers";
import {
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
} from "./projectBoardClarificationMappers";
import { defaultProjectBoardClaimAgentId, projectBoardClaimProjectionFromProjectBoardEvents } from "./projectStoreProjectBoardFacade";
import { normalizePlannerOpenQuestions } from "./projectStorePlannerFacade";

export interface ProjectBoardCardDependencyExecutionEntry {
  ref: string;
  title: string;
  cardId?: string;
  taskId?: string;
  cardStatus?: string;
  taskIdentifier?: string;
  taskState?: string;
  workspacePath?: string;
  branchName?: string;
  latestRunId?: string;
  latestRunStatus?: string;
  proofSummary?: string;
  changedFiles: string[];
  commands: string[];
  manualChecks: string[];
  completed: string[];
}

export interface ProjectBoardCardDependencyExecutionContext {
  available: ProjectBoardCardDependencyExecutionEntry[];
  pending: string[];
}

export function projectBoardResolveInside(rootPath: string, relativePath: string): string {
  if (!relativePath.trim() || isAbsolute(relativePath)) throw new Error(`Deliverable path must be workspace-relative: ${relativePath}`);
  const root = resolve(rootPath);
  const candidate = resolve(root, relativePath);
  const offset = relative(root, candidate);
  if (!offset || offset.startsWith("..") || isAbsolute(offset)) throw new Error(`Deliverable path escapes its root: ${relativePath}`);
  return candidate;
}

export function projectBoardDependencyArtifactKey(entry: ProjectBoardCardDependencyExecutionEntry, runId: string): string {
  const label = [entry.taskIdentifier, entry.title, entry.ref].map((item) => item?.trim()).find((item): item is string => Boolean(item));
  const safeLabel = (label ?? "dependency")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const hash = createHash("sha256")
    .update(`${entry.ref}\n${entry.taskId ?? ""}\n${runId}`)
    .digest("hex")
    .slice(0, 12);
  return `${safeLabel || "dependency"}-${hash}`;
}

export interface ProjectBoardDependencyArtifactImport {
  kind: "project_board_dependency_artifact_import";
  version: 1;
  key: string;
  boardId: string;
  dependentCardId: string;
  dependentTaskId: string;
  dependencyRef: string;
  dependencyTitle: string;
  dependencyCardId?: string;
  dependencyTaskId?: string;
  dependencyTaskIdentifier?: string;
  dependencyRunId?: string;
  sourceWorkspacePath?: string;
  importPath: string;
  filesRoot: string;
  manifestPath: string;
  declaredMaterialFiles: string[];
  materialFiles: string[];
  skippedFiles: string[];
  excludedFiles: string[];
  changedFiles: string[];
  commands: string[];
  manualChecks: string[];
  completed: string[];
  proofSummary?: string;
  importedAt: string;
}

export interface ProjectBoardDependencyArtifactImportResult {
  kind: "project_board_dependency_artifact_import_result";
  version: 1;
  boardId?: string;
  dependentCardId?: string;
  dependentTaskId: string;
  workspacePath: string;
  artifactRoot: string;
  manifestPath: string;
  imports: ProjectBoardDependencyArtifactImport[];
  pending: string[];
  importedAt: string;
}

export function projectBoardDependencyArtifactPromptSection(result?: ProjectBoardDependencyArtifactImportResult): string {
  if (!result || (result.imports.length === 0 && result.pending.length === 0)) return "";
  const lines = [
    "Dependency artifact imports:",
    "- Ambient has staged available dependency artifacts into this run workspace. Prefer these imported files over copying from sibling task workspaces.",
    `- Artifact root: ${result.artifactRoot}`,
    `- Import manifest: ${result.manifestPath}`,
  ];
  if (result.imports.length) {
    lines.push("Available imported dependency bundles:");
    for (const item of result.imports.slice(0, 8)) {
      const identity = item.dependencyTaskIdentifier ? `${item.dependencyTaskIdentifier}: ${item.dependencyTitle}` : item.dependencyTitle;
      lines.push(`- ${identity}; blocker ref: ${item.dependencyRef}`);
      lines.push(`  - Files root: ${item.filesRoot}`);
      lines.push(`  - Bundle manifest: ${item.manifestPath}`);
      if (item.materialFiles.length) lines.push(`  - Imported material files: ${item.materialFiles.slice(0, 12).join(", ")}`);
      if (item.skippedFiles.length) lines.push(`  - Missing or skipped files: ${item.skippedFiles.slice(0, 8).join(", ")}`);
      if (item.commands.length) lines.push(`  - Source proof commands: ${item.commands.slice(0, 5).join(" | ")}`);
      if (item.proofSummary) lines.push(`  - Source proof summary: ${item.proofSummary}`);
    }
  }
  if (result.pending.length) {
    lines.push("Pending dependency artifact imports:");
    lines.push(...result.pending.slice(0, 8).map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

export function projectBoardClaimSummaryFromEvents(events: ProjectBoardEvent[]): NonNullable<ProjectBoardSummary["claims"]> {
  const localAgentId = defaultProjectBoardClaimAgentId();
  const projection = projectBoardClaimProjectionFromProjectBoardEvents(events);
  return {
    active: projection.activeClaims.map((claim) => ({
      status: "active",
      cardId: claim.cardId,
      runId: claim.runId,
      agentId: claim.agentId,
      eventId: claim.eventId,
      claimedAt: claim.claimedAt,
      expiredAt: claim.expiredAt,
      leaseUntil: claim.leaseUntil,
      lastHeartbeatAt: claim.lastHeartbeatAt,
      appInstanceId: claim.appInstanceId,
      displayName: claim.displayName,
      workspaceBranch: claim.workspaceBranch,
      baseCommit: claim.baseCommit,
      expirationRecorded: claim.expirationRecorded,
      ownedByLocal: claim.agentId === localAgentId,
    })),
    expired: projection.expiredClaims.map((claim) => ({
      status: "expired",
      cardId: claim.cardId,
      runId: claim.runId,
      agentId: claim.agentId,
      eventId: claim.eventId,
      claimedAt: claim.claimedAt,
      expiredAt: claim.expiredAt,
      leaseUntil: claim.leaseUntil,
      lastHeartbeatAt: claim.lastHeartbeatAt,
      appInstanceId: claim.appInstanceId,
      displayName: claim.displayName,
      workspaceBranch: claim.workspaceBranch,
      baseCommit: claim.baseCommit,
      expirationRecorded: claim.expirationRecorded,
      ownedByLocal: claim.agentId === localAgentId,
    })),
    conflicts: projection.conflicts.map((conflict) => ({
      status: "conflict",
      cardId: conflict.cardId,
      runId: conflict.runId,
      agentId: conflict.agentId,
      eventId: conflict.eventId,
      claimedAt: conflict.createdAt,
      leaseUntil: conflict.leaseUntil,
      appInstanceId: conflict.appInstanceId,
      displayName: conflict.displayName,
      workspaceBranch: conflict.workspaceBranch,
      baseCommit: conflict.baseCommit,
      blockedByRunId: conflict.blockedByRunId,
      ownedByLocal: conflict.agentId === localAgentId,
    })),
  };
}

export function projectBoardCardsWithClaimSummaries(
  cards: ProjectBoardCard[],
  claims: NonNullable<ProjectBoardSummary["claims"]>,
): ProjectBoardCard[] {
  const activeByCard = new Map(claims.active.map((claim) => [claim.cardId, claim]));
  const expiredByCard = new Map(claims.expired.map((claim) => [claim.cardId, claim]));
  const conflictsByCard = new Map<string, ProjectBoardCardClaimSummary[]>();
  for (const conflict of claims.conflicts) {
    conflictsByCard.set(conflict.cardId, [...(conflictsByCard.get(conflict.cardId) ?? []), conflict]);
  }
  return cards.map((card) => ({
    ...card,
    claim: activeByCard.get(card.id) ?? expiredByCard.get(card.id),
    claimConflicts: conflictsByCard.get(card.id),
  }));
}

export interface PlannerPlanDraftCard {
  title: string;
  description: string;
  sourceId: string;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
}

export function firstMeaningfulLine(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find(Boolean) ?? ""
  );
}

export function plannerVerificationToTestPlan(verification: string[]): ProjectBoardCardTestPlan {
  const buckets: ProjectBoardCardTestPlan = { unit: [], integration: [], visual: [], manual: [] };
  const items = verification.map((entry) => entry.trim()).filter(Boolean);
  for (const item of items) {
    const lower = item.toLowerCase();
    if (lower.includes("unit")) buckets.unit.push(item);
    else if (lower.includes("visual") || lower.includes("screenshot") || lower.includes("browser")) buckets.visual.push(item);
    else if (lower.includes("integration") || lower.includes("e2e") || lower.includes("smoke")) buckets.integration.push(item);
    else buckets.manual.push(item);
  }
  if (!items.length) buckets.manual.push("Review changed behavior against the plan.");
  return buckets;
}

export function plannerPlanClarificationQuestions(artifact: PlannerPlanArtifact): string[] {
  return normalizeProjectBoardClarificationQuestions(
    [
      ...normalizePlannerOpenQuestions(artifact.openQuestions).filter(plannerOpenQuestionBlocksCandidateReadiness),
      ...artifact.decisionQuestions.filter((question) => question.required && !question.answer).map((question) => question.question),
    ],
    8,
  );
}

export function plannerPlanClarificationDecisions(artifact: PlannerPlanArtifact, now: string): ProjectBoardCardClarificationDecision[] {
  const openQuestions = normalizePlannerOpenQuestions(artifact.openQuestions)
    .filter(plannerOpenQuestionBlocksCandidateReadiness)
    .map((question) => ({ question, decision: undefined }));
  const decisionQuestions = artifact.decisionQuestions
    .filter((question) => question.required && !question.answer)
    .map((question) => ({ question: question.question, decision: question }));
  return normalizeProjectBoardClarificationDecisions(
    [...openQuestions, ...decisionQuestions].map(({ question, decision }) => {
      const suggestedOption = decision?.options.find((option) => option.id === decision.recommendedOptionId);
      const suggestedAnswer = suggestedOption ? `${suggestedOption.label}: ${suggestedOption.description}` : undefined;
      return {
        id: decision?.id?.trim() || `planner-${stableProjectBoardRef(question)}`,
        question,
        canonicalKey: stableProjectBoardRef(question),
        source: "card",
        state: "open",
        ...(suggestedAnswer
          ? {
              suggestedAnswer,
              rationale: "Recommended option from the durable planner decision question.",
              confidence: "medium",
              safeToAccept: false,
              questionKind: "user_preference",
            }
          : {}),
        createdAt: now,
        updatedAt: now,
      } satisfies ProjectBoardCardClarificationDecision;
    }),
    {
      clarificationQuestions: plannerPlanClarificationQuestions(artifact),
      clarificationSuggestions: [],
      clarificationAnswers: [],
      createdAt: now,
      updatedAt: now,
    },
  );
}

function plannerOpenQuestionBlocksCandidateReadiness(question: string): boolean {
  const normalized = question.trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (/^risk\s*:/i.test(normalized)) return false;
  if (
    /^open question\s*:/i.test(normalized) &&
    /\b(out of scope|optional|future|later|nice[-\s]?to[-\s]?have|easy to add)\b/i.test(normalized)
  ) {
    return false;
  }
  return true;
}

export function plannerPlanCandidateStatus(artifact: PlannerPlanArtifact): ProjectBoardCardCandidateStatus {
  return plannerPlanClarificationQuestions(artifact).length > 0 ? "needs_clarification" : "ready_to_create";
}

export function plannerPlanShouldStayCompact(_artifact: PlannerPlanArtifact, _steps?: PlannerPlanStep[]): boolean {
  void _artifact;
  void _steps;
  return true;
}

export function plannerPlanDraftCards(artifact: PlannerPlanArtifact): PlannerPlanDraftCard[] {
  const testPlan = plannerVerificationToTestPlan(artifact.verification);
  const steps = artifact.steps.filter((step) => step.title.trim());
  if (plannerPlanShouldStayCompact(artifact, steps)) {
    return [
      {
        title: artifact.title.trim() || steps[0]?.title.trim() || "Planner plan",
        description: artifact.summary.trim() || firstMeaningfulLine(artifact.content) || "Planner-mode implementation card.",
        sourceId: artifact.id,
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: steps.length
          ? steps.map((step) => step.title.trim()).filter(Boolean)
          : ["Plan goals are implemented and verified."],
        testPlan,
      },
    ];
  }

  return steps.map((step, index) => {
    const sourceId = plannerPlanStepSourceId(artifact.id, step, index);
    const previousStep = index > 0 ? steps[index - 1] : undefined;
    return {
      title: step.title.trim().slice(0, 180),
      description: plannerPlanStepDescription(artifact, step, index, steps.length),
      sourceId,
      labels: ["plan", "step"],
      blockedBy: previousStep ? [plannerPlanStepSourceId(artifact.id, previousStep, index - 1)] : [],
      acceptanceCriteria: plannerPlanStepAcceptanceCriteria(step),
      testPlan,
    };
  });
}

function plannerPlanStepSourceId(artifactId: string, step: PlannerPlanStep, index: number): string {
  return `${artifactId}#step:${stableProjectBoardRef(step.id || step.title || `step-${index + 1}`)}`;
}

function stableProjectBoardRef(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "step";
}

function plannerPlanStepDescription(artifact: PlannerPlanArtifact, step: PlannerPlanStep, index: number, total: number): string {
  return [
    artifact.summary.trim(),
    step.detail?.trim(),
    `Plan: ${artifact.title.trim() || "Planner plan"}.`,
    `Step ${index + 1} of ${total}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function plannerPlanStepAcceptanceCriteria(step: PlannerPlanStep): string[] {
  const detail = step.detail?.trim();
  if (!detail) return [step.title.trim()];
  const criteria = normalizeCardTextList(
    detail
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean),
    12,
  );
  return criteria.length ? criteria : [step.title.trim()];
}

export function normalizeTaskState(state: string): string {
  return state.trim().toLowerCase().replace(/\s+/g, "_") || "todo";
}

export function projectBoardStatusForTask(task: OrchestrationTask, allTasks: OrchestrationTask[]): ProjectBoardCardStatus {
  const state = normalizeTaskState(task.state);
  if (state === "in_progress") return "in_progress";
  if (state === "review" || state === "needs_review") return "review";
  if (state === "needs_info" || state === "budget_exhausted" || state === "terminal_blocker") return "blocked";
  if (state === "done" || state === "canceled" || state === "duplicate") return "done";
  if (orchestrationTaskHasActiveBlocker(task, allTasks)) return "blocked";
  return "ready";
}

export function projectBoardCardStatusWithProofReview(
  status: ProjectBoardCardStatus,
  proofReview: ProjectBoardCardProofReview | undefined,
): ProjectBoardCardStatus {
  if (!proofReview) return status;
  if (proofReview.status === "done") return "done";
  if (proofReview.status === "ready_for_review") return status === "done" ? "done" : "review";
  if (
    proofReview.status === "needs_follow_up" ||
    proofReview.status === "retry_recommended" ||
    proofReview.status === "terminally_blocked"
  ) {
    return "blocked";
  }
  return status;
}

export function projectBoardTaskStateForProofReview(status: ProjectBoardCardProofReviewStatus): string {
  if (status === "done") return "done";
  if (status === "ready_for_review") return "needs_review";
  if (status === "terminally_blocked") return "terminal_blocker";
  return "needs_info";
}

export function orchestrationTaskHasActiveBlocker(task: OrchestrationTask, allTasks: OrchestrationTask[]): boolean {
  if (task.blockedBy.length === 0) return false;
  const tasksById = new Map(allTasks.map((candidate) => [candidate.id, candidate]));
  const tasksByIdentifier = new Map(allTasks.map((candidate) => [candidate.identifier, candidate]));
  const acceptableStates = new Set(["review", "needs_review", "done", "canceled", "duplicate"]);
  return task.blockedBy.some((blockerRef) => {
    const blocker = tasksById.get(blockerRef) ?? tasksByIdentifier.get(blockerRef);
    if (!blocker) return true;
    return !acceptableStates.has(normalizeTaskState(blocker.state));
  });
}

const DEFAULT_PROJECT_BOARD_MAX_PASSES_PER_CARD = 6;
const DEFAULT_PROJECT_BOARD_MAX_RUNTIME_MS_PER_CARD = 1_200_000;

export function projectBoardCardClosePolicyDescription(budgetPolicy?: Record<string, unknown>): string {
  const maxPasses = readProjectBoardPositiveInteger(budgetPolicy?.maxPassesPerCard) ?? DEFAULT_PROJECT_BOARD_MAX_PASSES_PER_CARD;
  const maxRuntimeMs =
    readProjectBoardPositiveInteger(budgetPolicy?.maxRuntimeMsPerCard) ??
    readProjectBoardPositiveMinutesAsMs(budgetPolicy?.maxRuntimeMinutesPerCard) ??
    DEFAULT_PROJECT_BOARD_MAX_RUNTIME_MS_PER_CARD;
  return [
    "Execution close policy:",
    `- Aim for the smallest sufficient proof for this card; do not broaden scope beyond the card's acceptance criteria.`,
    `- Ambient will stop or review this card after ${maxPasses} focus pass${maxPasses === 1 ? "" : "es"} or about ${formatProjectBoardRuntimeDuration(maxRuntimeMs)} of worker runtime.`,
    "- Make task_heartbeat the first observable board action for the run, before reading/editing files or running shell commands; include the immediate plan and proof target.",
    "- Call task_heartbeat after each meaningful milestone or before any long verification loop, so the board shows real progress.",
    "- Call task_report_proof as soon as changed files, commands, screenshots, or manual checks are available; do not wait until every optional polish item is done.",
    "- If the proof satisfies the card, call task_complete immediately. If the remaining work no longer fits this card, call task_create_followup or task_report_handoff instead of continuing silently.",
    "- Do not end the run with only task_show and/or task_heartbeat; before the final assistant response, report proof, completion, a blocker, a follow-up, or a handoff through the task-action protocol.",
  ].join("\n");
}

export function splitProjectBoardCardDescription(card: ProjectBoardCard, criterion: string): string {
  return [card.description.trim(), `Split from: ${card.title}`, `Scope: ${criterion}`].filter(Boolean).join("\n\n");
}

export function projectBoardCardTaskDescription(
  card: ProjectBoardCard,
  budgetPolicy?: Record<string, unknown>,
  dependencyExecutionContext?: ProjectBoardCardDependencyExecutionContext,
): string {
  const executionSessionPolicy = normalizeProjectBoardCardExecutionSessionPolicy(card.executionSessionPolicy);
  const sections = [card.description.trim()];
  sections.push(
    [
      "Execution session policy:",
      `- ${executionSessionPolicy === "reuse_card_session" ? "Reuse this board card's canonical Pi session across retries and focus passes." : "Start from a fresh Pi context for each prepared run of this card."}`,
      "- Keep stable project charter, card scope, dependencies, and proof expectations before variable run notes so provider KV cache reuse stays high.",
    ].join("\n"),
  );
  sections.push(projectBoardCardClosePolicyDescription(budgetPolicy));
  const uxMockGateSection = projectBoardUxMockGateTaskDescriptionSection(card);
  if (uxMockGateSection) sections.push(uxMockGateSection);
  if (card.acceptanceCriteria.length) {
    sections.push(["Acceptance criteria:", ...card.acceptanceCriteria.map((item) => `- ${item}`)].join("\n"));
  }
  if (card.blockedBy.length) {
    sections.push(["Dependencies / blockers:", ...card.blockedBy.map((item) => `- ${item}`)].join("\n"));
  }
  const dependencyContextSection = renderProjectBoardCardDependencyExecutionContext(dependencyExecutionContext);
  if (dependencyContextSection) sections.push(dependencyContextSection);
  const activeRunFeedback = normalizeProjectBoardCardRunFeedback(card.runFeedback).slice(-8);
  if (activeRunFeedback.length) {
    sections.push(
      [
        "Next-run feedback / additive PM instructions:",
        "- Treat these as additive instructions for this run. Do not rewrite the approved card scope unless the feedback explicitly says to reopen or split the card.",
        ...activeRunFeedback.map((item) => {
          const source =
            item.source === "decision_impact"
              ? "decision impact"
              : item.source === "proof_review"
                ? "proof review"
                : item.source === "source_impact"
                  ? "source impact"
                  : "manual";
          const decision = item.decisionQuestion
            ? ` (${item.decisionQuestion}${item.decisionAnswer ? ` -> ${item.decisionAnswer}` : ""})`
            : "";
          return `- ${source}${decision}: ${item.feedback}`;
        }),
      ].join("\n"),
    );
  }
  const testLines = [
    ...card.testPlan.unit.map((item) => `- Unit: ${item}`),
    ...card.testPlan.integration.map((item) => `- Integration: ${item}`),
    ...card.testPlan.visual.map((item) => `- Visual: ${item}`),
    ...card.testPlan.manual.map((item) => `- Manual: ${item}`),
  ];
  if (testLines.length) sections.push(["Proof expectations:", ...testLines].join("\n"));
  if (card.testPlan.visual.length) {
    sections.push(
      [
        "Visual proof artifact requirements:",
        "- Use browser_nav to open the local page and browser_screenshot to capture the viewport when browser UI proof matters.",
        "- For interactive pages, games, canvas apps, shortcuts, or keyboard controls, use browser_keypress for real browser input before taking post-interaction proof.",
        "- Ambient collects screenshots from .ambient-codex/browser/screenshots in the project or prepared workspace.",
        "- Do not mark visual proof complete from narrative text alone; capture a real screenshot or report a terminal blocker if browser_screenshot returns empty output, the viewport is 0x0, or browser tooling is unavailable.",
      ].join("\n"),
    );
  }
  return sections.filter(Boolean).join("\n\n");
}

function projectBoardUxMockGateTaskDescriptionSection(card: ProjectBoardCard): string | undefined {
  if (!projectBoardCardIsUxMockGate(card)) return undefined;
  return [
    "UX mock approval artifact requirements:",
    "- Produce or update one self-contained HTML mock/spec file in the workspace so Ambient can preview it directly.",
    "- Do not rely on remote assets, external CDNs, or build-only state; inline the CSS and any small demo data needed for review.",
    "- Show the intended desktop layout and narrow/mobile viewport treatment for the primary user-facing flow.",
    "- Include visible review notes in the artifact for interaction affordances, important states, and user approval criteria.",
    "- Use browser_nav and browser_screenshot against the local HTML file for desktop and narrow viewport proof when browser tooling is available.",
    "- End with a concise handoff that names the HTML file path and whether the mock is ready for user approval or needs revision.",
  ].join("\n");
}

export function renderProjectBoardCardDependencyExecutionContext(context?: ProjectBoardCardDependencyExecutionContext): string {
  if (!context || (context.available.length === 0 && context.pending.length === 0)) return "";
  const lines = [
    "Dependency execution context:",
    "- Treat available dependency outputs as current board state even if this task workspace or the owning project root does not contain those files yet.",
    "- Ambient imports material files from available dependencies into the prepared run workspace under .ambient/dependency-artifacts/<dependency-key>/files when a run is prepared or started.",
    "- Prefer imported dependency artifact bundles for implementation and verification. Use read-only dependency workspaces only for bounded inspection or missing-artifact diagnosis.",
    "- Do not infer that an available dependency is incomplete only because its branch has not been merged into this workspace.",
  ];
  if (context.available.length) {
    lines.push("Available dependency outputs:");
    for (const item of context.available.slice(0, 8)) {
      const identity = item.taskIdentifier ? `${item.taskIdentifier}: ${item.title}` : item.title;
      const status = [
        item.cardStatus ? `card ${item.cardStatus}` : "",
        item.taskState ? `task ${item.taskState}` : "",
        item.latestRunStatus ? `latest run ${item.latestRunStatus}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`- ${identity}${status ? ` (${status})` : ""}; blocker ref: ${item.ref}`);
      if (item.latestRunId) lines.push(`  - Dependency run: ${item.latestRunId}`);
      if (item.workspacePath) lines.push(`  - Read-only fallback dependency workspace: ${item.workspacePath}`);
      if (item.branchName) lines.push(`  - Dependency branch: ${item.branchName}`);
      if (item.changedFiles.length) lines.push(`  - Declared import files: ${item.changedFiles.slice(0, 8).join(", ")}`);
      if (item.commands.length) lines.push(`  - Proof commands: ${item.commands.slice(0, 5).join(" | ")}`);
      if (item.manualChecks.length) lines.push(`  - Manual checks: ${item.manualChecks.slice(0, 4).join(" | ")}`);
      if (item.completed.length) lines.push(`  - Completed items: ${item.completed.slice(0, 5).join(" | ")}`);
      if (item.proofSummary) lines.push(`  - Proof summary: ${item.proofSummary}`);
    }
  }
  if (context.pending.length) {
    lines.push("Still-blocking or unresolved dependencies:");
    lines.push(...context.pending.slice(0, 8).map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function readProjectBoardPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function readProjectBoardPositiveMinutesAsMs(value: unknown): number | undefined {
  const minutes =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())
        ? Number(value.trim())
        : undefined;
  return minutes && minutes > 0 ? Math.max(1, Math.round(minutes * 60 * 1000)) : undefined;
}

function formatProjectBoardRuntimeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "the configured runtime budget";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}
