import { describe, expect, it } from "vitest";

import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import type { ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type { BoardEventArtifact, ProposalManifestArtifact, RunHandoffArtifact, RunManifestArtifact, RunProofArtifact } from "../project-board/projectBoardArtifacts";
import type { ProjectBoardTaskToolAction } from "../project-board/projectBoardTaskTools";
import type { ProjectBoardSynthesisDraft } from "../project-board/projectBoardSynthesis";
import { defaultProjectBoardClaimAgentId } from "../project-board/projectBoardClaims";
import { DURABLE_PLAN_SOURCE_AUTHORITY_REASON, GENERATED_REPORT_SOURCE_AUTHORITY_REASON } from "../project-board/projectBoardSourceIdentity";
import type {
  OrchestrationRun,
  OrchestrationTask,
  PlannerPlanArtifact,
  ProjectBoardCard,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardProofReview,
  ProjectBoardCharter,
  ProjectBoardEvent,
  ProjectBoardQuestion,
  ProjectBoardSource,
} from "../../shared/types";

import {
  buildProjectBoardCharterProjectSummary,
  compileProjectBoardCharter,
  dedupeProjectBoardSynthesisRunProgressiveRecords,
  evaluateProjectBoardCardProof,
  firstMeaningfulLine,
  mapProjectBoardCardProofReview,
  mapProjectBoardCardRow,
  mapProjectBoardCardSplitOutcome,
  mergeProjectBoardTaskToolActionsForProof,
  mapProjectBoardCharterRow,
  mapProjectBoardEventRow,
  mapProjectBoardExecutionArtifactRow,
  mapProjectBoardQuestionRow,
  mapProjectBoardRow,
  mapProjectBoardSourceRow,
  mapProjectBoardSynthesisProposalRow,
  mapProjectBoardSynthesisRunRow,
  normalizeCardTextList,
  objectiveProvenanceJson,
  projectBoardCardPendingPiUpdateFromSynthesisCard,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardCardExecutionSessionPolicy,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardObjectiveProvenance,
  normalizeProjectBoardPlanningSnapshot,
  normalizeProjectBoardProofFollowUpSuggestion,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardSynthesisProposalAnswer,
  normalizeProjectBoardSynthesisProposalCard,
  projectBoardSynthesisProposalCardsFromDraft,
  normalizeProjectBoardSynthesisRunEvent,
  normalizeProjectBoardSynthesisRunProgressiveRecord,
  normalizeRunFollowUps,
  normalizeRuntimeBudgetCriteria,
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
  normalizeTaskReferences,
  normalizeTaskState,
  normalizeUnknownProjectBoardTestPlan,
  plannerPlanCandidateStatus,
  plannerPlanClarificationDecisions,
  plannerPlanClarificationQuestions,
  plannerPlanDraftCards,
  plannerPlanShouldStayCompact,
  orchestrationTaskHasActiveBlocker,
  plannerVerificationToTestPlan,
  parseProjectBoardClarificationSuggestions,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardCardRunFeedback,
  parseProjectBoardCardTestPlan,
  parseProjectBoardCardTouchedFields,
  parseProjectBoardStringList,
  projectBoardCardClosePolicyDescription,
  projectBoardCardTaskDescription,
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardCardIsUxMockGate,
  projectBoardCardMatchesRef,
  projectBoardCardMissingRequiredUxMockGate,
  projectBoardCardProofCount,
  projectBoardCardRowIsClosedDone,
  projectBoardCardStatusWithProofReview,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardClarificationAnswerSection,
  projectBoardClarificationDecisionsEquivalent,
  projectBoardClarificationDecisionImpactEventSummary,
  projectBoardDescriptionWithClarificationAnswer,
  projectBoardDependencyArtifactKey,
  projectBoardDependencyArtifactPromptSection,
  projectBoardDecisionImpactEventMetadata,
  projectBoardDecisionImpactFeedbackText,
  projectBoardEventKindFromArtifact,
  projectBoardEventMetadataFromArtifact,
  projectBoardEventSummaryFromArtifact,
  projectBoardEventTitleFromArtifact,
  projectBoardExecutionArtifactCardId,
  projectBoardExecutionArtifactHandoffFromArtifact,
  projectBoardExecutionArtifactProofFromArtifact,
  projectBoardExecutionArtifactStartedAt,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactUpdatedAt,
  projectBoardAfterRunHookSucceeded,
  projectBoardChangedClarificationAnswer,
  projectBoardHasDecisionImpactFeedback,
  projectBoardChangedProofPaths,
  projectBoardChangedPathForImplementationEvidence,
  projectBoardHasAcceptanceEvidence,
  projectBoardHasImplementationEvidence,
  projectBoardHasIntegrationEvidence,
  projectBoardHasVisualEvidence,
  projectBoardMaterialPendingPiUpdateForRow,
  projectBoardHasManualEvidence,
  projectBoardHasTrustworthyTaskCompletion,
  projectBoardHasNegatedManualEvidence,
  projectBoardHasNegatedVisualEvidence,
  projectBoardHasUnitEvidence,
  projectBoardOpenUxMockGateBlocker,
  projectBoardHasSourceImpactFeedback,
  projectBoardQuestionMatchesAnyVariant,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofEvidenceText,
  projectBoardProofOfWorkForRun,
  projectBoardProofObject,
  projectBoardProofReviewApplicationBlocker,
  projectBoardProofRevisionRunFeedback,
  projectBoardProofReviewFromDraft,
  projectBoardProofRequestsDone,
  projectBoardIsMeaningfulChangedPath,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  projectBoardRuntimeBudgetCompletedCriteria,
  projectBoardRuntimeBudgetExceeded,
  projectBoardRuntimeBudgetFollowUpClarificationQuestion,
  projectBoardRuntimeBudgetFollowUpDescription,
  projectBoardRuntimeBudgetFromProof,
  projectBoardRuntimeBudgetHasDurableCompletion,
  projectBoardRuntimeBudgetHasMeaningfulProgress,
  projectBoardRuntimeBudgetPartialProofSummary,
  projectBoardRuntimeBudgetRemainingCriteria,
  projectBoardRuntimeBudgetReason,
  projectBoardRuntimeBudgetReviewForApplication,
  projectBoardRuntimeBudgetSplitOutcomeForReview,
  projectBoardRuntimeBudgetTrustworthyTaskActions,
  projectBoardRunStatusCanCopySession,
  projectBoardRunHasReviewableProof,
  projectBoardRunStageFromArtifactProgress,
  projectBoardRunStageFromManifest,
  projectBoardRunStatusFromProposalManifest,
  projectBoardMissingProofItems,
  projectBoardSatisfiedProofItems,
  projectBoardTerminalBlockerDetail,
  projectBoardCanonicalSourceKey,
  projectBoardCardsWithClaimSummaries,
  projectBoardClaimBlockedTaskIdsForRows,
  projectBoardCharterCoverageGaps,
  projectBoardClaimSummaryFromEvents,
  projectBoardClosedParentForRunFollowUp,
  projectBoardStatusForTask,
  projectBoardSourceInputFromExisting,
  projectBoardSourceRefreshSummary,
  projectBoardSourcesByCanonicalKey,
  projectBoardSourceDraftRefreshEventMetadata,
  projectBoardSourceDraftRefreshNote,
  projectBoardSourceDraftRefreshRecordKey,
  projectBoardSourceImpactDurablePlanPrimary,
  projectBoardSourceImpactEstimatedPromptChars,
  projectBoardSourceImpactFeedbackText,
  projectBoardSourceImpactGroupKey,
  projectBoardSourceImpactIncluded,
  projectBoardSourceImpactLedgerDetail,
  projectBoardSourceImpactMetadataFromEvent,
  projectBoardSourceImpactNormalizeText,
  projectBoardSourceImpactReferenceKey,
  projectBoardSourceImpactReferenceKeys,
  projectBoardSourceImpactReferenceMatchesAny,
  projectBoardSourceImpactRecommendedAction,
  projectBoardSourceUpdateImpactMetadata,
  normalizeProjectBoardSourceInputs,
  projectBoardSourceClassificationUpdates,
  projectBoardSourceKindCounts,
  projectBoardSourceRefreshEventMetadata,
  projectBoardSourceRefreshStats,
  projectBoardSourceRefreshSources,
  projectBoardSourceRefreshStoreRow,
  projectBoardSourceShouldPreservePreviousClassification,
  projectBoardSourceUserClassificationUpdate,
  projectBoardSynthesisCardRowProtectedFromDraftReplacement,
  projectBoardSynthesisDraftWithSourceIdNamespace,
  projectBoardSynthesisMarkdown,
  projectBoardSynthesisProposalCardReviewStatus,
  projectBoardSynthesisProposalCardReviewStillApplies,
  projectBoardSynthesisStartFreshCardSnapshot,
  projectBoardResolveInside,
  projectBoardTaskStateForProofReview,
  projectBoardTestPolicyRequiresProofSpec,
  projectBoardUiMockRoleForSynthesisCard,
  projectBoardUnansweredClarificationQuestions,
  projectBoardUxMockGateSatisfied,
  projectBoardUxMockRejectionRunFeedback,
  projectBoardPlanningStableHash,
  projectBoardPlanningStableJson,
  projectBoardPromptList,
  projectBoardPromptSummary,
  renderProjectBoardCardDependencyExecutionContext,
  resolveProjectBoardTaskBlockers,
  projectBoardDescriptionWithSourceImpactRefresh,
  splitProjectBoardCardDescription,
  keywordSystemHints,
  sourceDisplayName,
  sourceMajorSystemLabel,
  sourceRefArtifactStrings,
  stringsFromProjectBoardUnknownArray,
  summarizeProjectBoardSynthesisRunProgressiveRecords,
  truncateForProjectBoardSummary,
  uniqueLimitedStrings,
  type ProjectBoardCardStoreRow,
  type ProjectBoardCardPendingPiUpdateStoreRow,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardStoreRow,
  type ProjectBoardSourceUpdateImpactMetadata,
} from "./projectBoardMappers";

describe("project board store mappers", () => {
  const boardEventArtifact = (
    event: Pick<BoardEventArtifact, "type"> & Partial<Omit<BoardEventArtifact, "type">>,
  ): BoardEventArtifact =>
    ({
      schemaVersion: 1,
      eventId: "event-1",
      boardId: "board-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      payload: {},
      ...event,
    }) as BoardEventArtifact;

  const runManifestArtifact = (artifact: Partial<RunManifestArtifact> = {}): RunManifestArtifact =>
    ({
      schemaVersion: 1,
      runId: "run-1",
      boardId: "board-1",
      cardId: "card-manifest",
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      ...artifact,
    }) as RunManifestArtifact;

  const runProofArtifact = (artifact: Partial<RunProofArtifact> = {}): RunProofArtifact =>
    ({
      schemaVersion: 1,
      runId: "run-1",
      boardId: "board-1",
      cardId: "card-proof",
      summary: "Proof summary",
      commands: ["pnpm test"],
      changedFiles: ["src/main/example.ts"],
      screenshots: ["screenshots/proof.png"],
      browserTraces: ["traces/proof.zip"],
      visualChecks: [{ name: "canvas", status: "passed" }],
      manualChecks: ["Reviewed proof"],
      createdAt: "2026-01-01T00:02:00.000Z",
      ...artifact,
    }) as RunProofArtifact;

  const runHandoffArtifact = (artifact: Partial<RunHandoffArtifact> = {}): RunHandoffArtifact =>
    ({
      schemaVersion: 1,
      runId: "run-1",
      boardId: "board-1",
      cardId: "card-handoff",
      summary: "Handoff summary",
      completed: ["Done"],
      remaining: ["Later"],
      risks: ["Risk"],
      followUps: [{ title: "Follow up", reason: "Needs polish", blockedBy: ["card-manifest"] }],
      createdAt: "2026-01-01T00:03:00.000Z",
      ...artifact,
    }) as RunHandoffArtifact;

  const projectBoardSource = (source: Partial<ProjectBoardSource> = {}): ProjectBoardSource =>
    ({
      id: "source-1",
      boardId: "board-1",
      kind: "markdown",
      title: "Source",
      summary: "Summary",
      relevance: 50,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...source,
    }) as ProjectBoardSource;

  const projectBoardQuestion = (question: Partial<ProjectBoardQuestion> = {}): ProjectBoardQuestion =>
    ({
      id: "question-1",
      boardId: "board-1",
      question: "Question?",
      required: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...question,
    }) as ProjectBoardQuestion;

  const projectBoardCard = (card: Partial<ProjectBoardCard> = {}): ProjectBoardCard =>
    ({
      id: "card-1",
      boardId: "board-1",
      title: "Create shell",
      description: "Build the shell.",
      status: "draft",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:shell",
      sourceRefs: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...card,
    }) as ProjectBoardCard;

  const projectBoardRow = (row: Partial<ProjectBoardStoreRow> = {}): ProjectBoardStoreRow => ({
    id: "board-1",
    project_path: "/workspace/project",
    status: "active",
    title: "Project Board",
    summary: "Board summary",
    charter_id: null,
    active_draft_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:01:00.000Z",
    ...row,
    source_thread_id: row.source_thread_id ?? null,
  });

  const plannerPlanArtifact = (artifact: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact =>
    ({
      id: "plan-1",
      threadId: "thread-1",
      sourceMessageId: "message-1",
      status: "ready",
      workflowState: "durable_ready",
      title: "Build dashboard",
      summary: "Ship the dashboard shell.",
      content: "# Dashboard plan\n\nBuild the dashboard shell.",
      steps: [],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [],
      diagrams: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      ...artifact,
    }) as PlannerPlanArtifact;

  const projectBoardCardPendingPiUpdateRow = (
    row: Partial<ProjectBoardCardPendingPiUpdateStoreRow> = {},
  ): ProjectBoardCardPendingPiUpdateStoreRow => ({
    title: "Create shell",
    description: "Build the shell.",
    candidate_status: "ready_to_create",
    priority: 2,
    phase: "Foundation",
    labels_json: JSON.stringify(["shell"]),
    blocked_by_json: JSON.stringify([]),
    acceptance_criteria_json: JSON.stringify(["Canvas renders."]),
    test_plan_json: JSON.stringify({ unit: ["unit test"], integration: [], visual: [], manual: [] }),
    source_refs_json: JSON.stringify(["docs/architecture.md"]),
    clarification_questions_json: JSON.stringify([]),
    clarification_suggestions_json: JSON.stringify([]),
    clarification_answers_json: JSON.stringify([]),
    clarification_decisions_json: JSON.stringify([]),
    ui_mock_role: null,
    requires_ui_mock_approval: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:01:00.000Z",
    ...row,
  });

  const projectBoardCardRow = (row: Partial<ProjectBoardCardStoreRow> = {}): ProjectBoardCardStoreRow => ({
    ...projectBoardCardPendingPiUpdateRow(),
    id: "card-row-1",
    board_id: "board-1",
    status: "draft",
    source_kind: "board_synthesis",
    source_id: "synthesis:shell",
    source_thread_id: null,
    source_message_id: null,
    orchestration_task_id: null,
    execution_thread_id: null,
    execution_session_policy: null,
    proof_review_json: null,
    split_outcome_json: null,
    objective_provenance_json: null,
    run_feedback_json: null,
    user_touched_fields_json: null,
    user_touched_at: null,
    pending_pi_update_json: null,
    ...row,
  });

  const orchestrationTask = (task: Partial<OrchestrationTask> = {}): OrchestrationTask =>
    ({
      id: "task-1",
      identifier: "TASK-1",
      title: "Task",
      state: "todo",
      labels: [],
      blockedBy: [],
      sourceKind: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...task,
    }) as OrchestrationTask;

  it("normalizes card text lists by trimming, deduping, dropping blanks, and applying a limit", () => {
    expect(normalizeCardTextList(["  first  ", "", "second", "first", "third"], 2)).toEqual(["first", "second"]);
  });

  it("normalizes project board task labels and references", () => {
    expect(normalizeTaskLabels([" UI ", "ui", "Backend", "", " backend "])).toEqual(["ui", "backend"]);
    expect(
      normalizeTaskReferences([
        " card-1 ",
        "card-1",
        "",
        ...Array.from({ length: 55 }, (_, index) => `ref-${index}`),
      ]),
    ).toEqual(["card-1", ...Array.from({ length: 49 }, (_, index) => `ref-${index}`)]);
  });

  it("resolves project board blocker cards to linked task identifiers", () => {
    const dependencyTask = orchestrationTask({ id: "task-dependency", identifier: "TASK-17" });
    const fallbackTask = orchestrationTask({ id: "task-fallback", identifier: "TASK-18" });
    const dependencyCard = projectBoardCard({
      id: "card-dependency",
      sourceId: "synthesis:dependency",
      orchestrationTaskId: dependencyTask.id,
    });
    const fallbackCard = projectBoardCard({
      id: "card-fallback",
      sourceId: "synthesis:fallback",
      orchestrationTaskId: fallbackTask.id,
    });
    const current = projectBoardCard({
      id: "card-current",
      blockedBy: [" card-dependency ", "synthesis:fallback", "card-current", "missing-card", "TASK-17", "missing-card"],
    });

    expect(resolveProjectBoardTaskBlockers(current, [current, dependencyCard, fallbackCard], [dependencyTask])).toEqual([
      "TASK-17",
      fallbackTask.id,
      "card-current",
      "missing-card",
    ]);
  });

  it("does not resolve terminal audit candidates into active task blockers", () => {
    const duplicateCard = projectBoardCard({ id: "card-duplicate", title: "Duplicate auth", candidateStatus: "duplicate" });
    const rejectedCard = projectBoardCard({ id: "card-rejected", title: "Rejected auth", candidateStatus: "rejected" });
    const coveredCard = projectBoardCard({ id: "card-covered", title: "Covered auth", candidateStatus: "evidence" });
    const current = projectBoardCard({
      id: "card-current",
      blockedBy: ["card-duplicate", "card-rejected", "card-covered", "missing-card"],
    });

    expect(resolveProjectBoardTaskBlockers(current, [current, duplicateCard, rejectedCard, coveredCard], [])).toEqual(["missing-card"]);
  });

  it("maps orchestration task state and blockers to project board status", () => {
    const doneBlocker = orchestrationTask({ id: "done", identifier: "DONE-1", state: "done" });
    const activeBlocker = orchestrationTask({ id: "active", identifier: "ACTIVE-1", state: "in progress" });

    expect(normalizeTaskState(" In Progress ")).toBe("in_progress");
    expect(normalizeTaskState(" ")).toBe("todo");
    expect(projectBoardStatusForTask(orchestrationTask({ state: "needs review" }), [])).toBe("review");
    expect(projectBoardStatusForTask(orchestrationTask({ state: "needs_info" }), [])).toBe("blocked");
    expect(projectBoardStatusForTask(orchestrationTask({ state: "duplicate" }), [])).toBe("done");
    expect(orchestrationTaskHasActiveBlocker(orchestrationTask({ blockedBy: ["DONE-1"] }), [doneBlocker])).toBe(false);
    expect(orchestrationTaskHasActiveBlocker(orchestrationTask({ blockedBy: ["active"] }), [activeBlocker])).toBe(true);
    expect(orchestrationTaskHasActiveBlocker(orchestrationTask({ blockedBy: ["missing"] }), [])).toBe(true);
    expect(projectBoardStatusForTask(orchestrationTask({ blockedBy: ["active"] }), [activeBlocker])).toBe("blocked");
  });

  it("overlays project board proof review status on task-derived status", () => {
    const proofReview = (status: "ready_for_review" | "needs_follow_up" | "terminally_blocked" | "retry_recommended" | "done") => ({
      status,
      summary: "Reviewed",
      satisfied: [],
      missing: [],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(projectBoardCardStatusWithProofReview("ready", undefined)).toBe("ready");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("ready_for_review"))).toBe("review");
    expect(projectBoardCardStatusWithProofReview("done", proofReview("ready_for_review"))).toBe("done");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("needs_follow_up"))).toBe("blocked");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("retry_recommended"))).toBe("blocked");
    expect(projectBoardCardStatusWithProofReview("ready", proofReview("terminally_blocked"))).toBe("blocked");
    expect(projectBoardCardStatusWithProofReview("blocked", proofReview("done"))).toBe("done");
  });

  it("maps project board proof review status to orchestration task state", () => {
    expect(projectBoardTaskStateForProofReview("done")).toBe("done");
    expect(projectBoardTaskStateForProofReview("ready_for_review")).toBe("needs_review");
    expect(projectBoardTaskStateForProofReview("terminally_blocked")).toBe("terminal_blocker");
    expect(projectBoardTaskStateForProofReview("needs_follow_up")).toBe("needs_info");
    expect(projectBoardTaskStateForProofReview("retry_recommended")).toBe("needs_info");
  });

  it("maps project board proof review drafts with run metadata", () => {
    expect(
      projectBoardProofReviewFromDraft(
        {
          status: "needs_follow_up",
          summary: "Proof needs one more screenshot.",
          satisfied: ["Unit proof recorded."],
          missing: ["Visual/browser proof recorded."],
          reviewer: "ambient_pi",
          model: "test-model",
          confidence: 0.82,
          evidenceQuality: "mixed",
          recommendedAction: "follow_up",
          deterministicStatus: "ready_for_review",
          deterministicSummary: "Deterministic proof mostly passed.",
          judgeDurationMs: 42,
          followUpSuggestion: { title: "Capture screenshot", labels: ["visual-proof"] },
        },
        {
          id: "run-1",
          taskId: "task-1",
          attemptNumber: 1,
          status: "completed",
          workspacePath: "/tmp/proof-review",
          startedAt: "2026-01-01T00:00:00.000Z",
        },
        "2026-01-01T00:05:00.000Z",
        ["follow-up-1"],
      ),
    ).toEqual({
      status: "needs_follow_up",
      summary: "Proof needs one more screenshot.",
      satisfied: ["Unit proof recorded."],
      missing: ["Visual/browser proof recorded."],
      followUpCardIds: ["follow-up-1"],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:05:00.000Z",
      reviewer: "ambient_pi",
      model: "test-model",
      confidence: 0.82,
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
      deterministicStatus: "ready_for_review",
      deterministicSummary: "Deterministic proof mostly passed.",
      judgeDurationMs: 42,
      followUpSuggestion: { title: "Capture screenshot", labels: ["visual-proof"] },
    });
  });

  it("normalizes unknown proof sub-objects conservatively", () => {
    const record = { ok: true, durationMs: 42 };

    expect(projectBoardProofObject(record)).toBe(record);
    expect(projectBoardProofObject({ nested: { value: "kept" } })).toEqual({ nested: { value: "kept" } });
    expect(projectBoardProofObject(["not", "an", "object"])).toBeUndefined();
    expect(projectBoardProofObject(null)).toBeUndefined();
    expect(projectBoardProofObject("not an object")).toBeUndefined();
  });

  it("normalizes unknown string arrays conservatively", () => {
    expect(stringsFromProjectBoardUnknownArray(["  one  ", "", "two", 3, { label: "ignored" }, " three "])).toEqual(["one", "two", "three"]);
    expect(stringsFromProjectBoardUnknownArray("one")).toEqual([]);
    expect(stringsFromProjectBoardUnknownArray(null)).toEqual([]);
  });

  it("normalizes project board prompt lists and summaries", () => {
    expect(projectBoardPromptList([" one ", "", "two", "one", " three ", "two"], 3)).toEqual(["one", "two", "three"]);
    expect(projectBoardPromptList(["one", "two"], 1)).toEqual(["one"]);
    expect(projectBoardPromptSummary(undefined, "   ", "  summary text  ")).toBe("summary text");
    expect(projectBoardPromptSummary("x".repeat(705))).toBe("x".repeat(700));
    expect(projectBoardPromptSummary(undefined, "   ")).toBeUndefined();
  });

  it("normalizes project board proof evidence text", () => {
    const text = projectBoardProofEvidenceText("Run ERROR", {
      lastAssistantText: "Implemented Feature",
      testOutput: "VITEST passed",
      afterRunHook: { ok: true },
      browserEvidence: { screenshotCount: 1 },
      taskToolActions: [{ action: "task_complete" }],
      commands: ["pnpm test"],
      visualChecks: ["nonblank canvas"],
      screenshots: ["shot.png"],
      focusLoop: { status: "done" },
      projectBoardRuntimeBudget: { exceeded: false },
      gitStatus: [" M src/main/example.ts"],
      ignored: "not included",
    });

    expect(text).toContain("run error");
    expect(text).toContain("implemented feature");
    expect(text).toContain("\"ok\":true");
    expect(text).toContain("\"screenshotcount\":1");
    expect(text).toContain("\"task_complete\"");
    expect(text).toContain("m src/main/example.ts");
    expect(text).not.toContain("not included");
  });

  it("maps proof request completion signals conservatively", () => {
    expect(projectBoardAfterRunHookSucceeded({ afterRunHook: { ok: true } })).toBe(true);
    expect(projectBoardAfterRunHookSucceeded({ afterRunHook: { ok: false } })).toBe(false);
    expect(projectBoardAfterRunHookSucceeded({ afterRunHook: ["not", "an", "object"] })).toBe(false);
    expect(projectBoardAfterRunHookSucceeded(undefined)).toBe(false);

    expect(projectBoardProofRequestsDone({ projectBoardStatus: "done" })).toBe(true);
    expect(projectBoardProofRequestsDone({ projectBoardReview: { status: "done" } })).toBe(true);
    expect(projectBoardProofRequestsDone({ markProjectBoardDone: true })).toBe(true);
    expect(projectBoardProofRequestsDone({ projectBoardStatus: "ready_for_review", projectBoardReview: { status: "needs_follow_up" } })).toBe(false);
    expect(projectBoardProofRequestsDone(undefined)).toBe(false);
  });

  it("detects negated proof evidence phrasing", () => {
    expect(projectBoardHasNegatedVisualEvidence("no browser screenshot was available")).toBe(true);
    expect(projectBoardHasNegatedVisualEvidence("playwright screenshot was not captured")).toBe(true);
    expect(projectBoardHasNegatedVisualEvidence("browser screenshot captured and nonblank canvas verified")).toBe(false);

    expect(projectBoardHasNegatedManualEvidence("manual review was not completed")).toBe(true);
    expect(projectBoardHasNegatedManualEvidence("unable to open the app for manual verification")).toBe(true);
    expect(projectBoardHasNegatedManualEvidence("manual review confirmed the behavior")).toBe(false);
  });

  it("detects basic proof evidence signals", () => {
    expect(projectBoardHasAcceptanceEvidence("acceptance criteria verified")).toBe(true);
    expect(projectBoardHasAcceptanceEvidence("waiting for details")).toBe(false);
    expect(projectBoardHasUnitEvidence("vitest passed", undefined)).toBe(true);
    expect(projectBoardHasUnitEvidence("no proof keywords here", { afterRunHook: { ok: true } })).toBe(true);
    expect(projectBoardHasUnitEvidence("no proof keywords here", { afterRunHook: { ok: false } })).toBe(false);
    expect(projectBoardHasIntegrationEvidence("electron smoke verified", undefined)).toBe(true);
    expect(projectBoardHasIntegrationEvidence("no proof keywords here", { afterRunHook: { ok: true } })).toBe(true);
    expect(projectBoardHasIntegrationEvidence("no proof keywords here", { afterRunHook: { ok: false } })).toBe(false);
  });

  it("normalizes implementation proof paths", () => {
    expect(projectBoardChangedPathForImplementationEvidence('"./src/main/example.ts"')).toBe("src/main/example.ts");
    expect(projectBoardChangedPathForImplementationEvidence("/workspace/app/src/main/example.ts", "/workspace/app")).toBe("src/main/example.ts");
    expect(projectBoardChangedPathForImplementationEvidence("file:///workspace/app/src/main/example.ts", "file:///workspace/app")).toBe("src/main/example.ts");
    expect(projectBoardChangedPathForImplementationEvidence("/outside/example.ts", "/workspace/app")).toBe("/outside/example.ts");
  });

  it("collects changed proof paths from proof fields and task-tool evidence", () => {
    expect(
      projectBoardChangedProofPaths(
        {
          changedFiles: ['"./src/main/changed.ts"', { path: "file:///workspace/app/src/main/object.ts" }],
          gitStatus: [" M src/main/git.ts", "?? src/main/new.ts", ""],
          taskToolActions: [
            {
              action: "task_complete",
              actionId: "complete-current",
              createdAt: "2026-01-01T00:03:00.000Z",
              metadata: { transport: "native_tool" },
              summary: "Completed the mapper extraction.",
              completed: [],
              remaining: [],
              risks: [],
              commands: [],
              changedFiles: ["src/main/task.ts"],
              screenshots: [],
              browserTraces: [],
              visualChecks: [],
              manualChecks: [],
            },
          ],
        },
        "/workspace/app",
      ),
    ).toEqual(["src/main/changed.ts", "src/main/object.ts", "src/main/git.ts", "src/main/new.ts", "src/main/task.ts"]);
  });

  it("filters non-meaningful implementation proof paths", () => {
    expect(projectBoardIsMeaningfulChangedPath("src/main/example.ts")).toBe(true);
    expect(projectBoardIsMeaningfulChangedPath("node_modules/pkg/index.js")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".git/config")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".ambient/state.json")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".ambient-codex/state.json")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".vite/cache")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".DS_Store")).toBe(false);
  });

  it("detects implementation evidence from changed paths and diffs", () => {
    expect(projectBoardHasImplementationEvidence(undefined, "")).toBe(false);
    expect(projectBoardHasImplementationEvidence({ changedFiles: ["src/main/example.ts"] }, "")).toBe(true);
    expect(projectBoardHasImplementationEvidence({ changedFiles: ["node_modules/pkg/index.js"] }, "")).toBe(false);
    expect(
      projectBoardHasImplementationEvidence({
        diff: "diff --git a/src/main/example.ts b/src/main/example.ts\n+changed",
      }, ""),
    ).toBe(true);
    expect(
      projectBoardHasImplementationEvidence({
        diff: "diff --git a/.ambient/state.json b/.ambient/state.json\n+changed",
      }, ""),
    ).toBe(false);
    expect(projectBoardHasImplementationEvidence({ diff: "Binary files changed" }, "")).toBe(true);
  });

  it("detects visual evidence from structured proof sources", () => {
    expect(projectBoardHasVisualEvidence("", undefined)).toBe(false);
    expect(projectBoardHasVisualEvidence("", { screenshots: ["shot.png"] })).toBe(true);
    expect(projectBoardHasVisualEvidence("", { visualChecks: [{ status: "passed" }] })).toBe(true);
    expect(projectBoardHasVisualEvidence("", { browserEvidence: { screenshotCount: 1 } })).toBe(true);
    expect(projectBoardHasVisualEvidence("", { browserEvidence: { visualCheckCount: 1 } })).toBe(true);
    expect(projectBoardHasVisualEvidence("no browser screenshot was available", {})).toBe(false);
    expect(
      projectBoardHasVisualEvidence("", {
        taskToolActions: [
          {
            action: "task_report_proof",
            actionId: "proof-current",
            createdAt: "2026-01-01T00:03:00.000Z",
            metadata: { transport: "native_tool" },
            summary: "Captured visual proof.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: ["trace.zip"],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      }),
    ).toBe(true);
  });

  it("detects manual evidence from structured proof sources and proof text", () => {
    expect(projectBoardHasManualEvidence("", undefined)).toBe(false);
    expect(projectBoardHasManualEvidence("", { manualChecks: ["Manual review confirmed the behavior."] })).toBe(true);
    expect(projectBoardHasManualEvidence("", { manualChecks: ["manual review was not completed"] })).toBe(false);
    expect(projectBoardHasManualEvidence("manual review confirmed the behavior", {})).toBe(true);
    expect(projectBoardHasManualEvidence("manual review was not completed", {})).toBe(false);
    expect(
      projectBoardHasManualEvidence("", {
        taskToolActions: [
          {
            action: "task_report_proof",
            actionId: "proof-current",
            createdAt: "2026-01-01T00:03:00.000Z",
            metadata: { transport: "native_tool" },
            summary: "Manual proof captured.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Opened the app and verified the workflow."],
          },
        ],
      }),
    ).toBe(true);
  });

  it("maps satisfied proof items from card expectations", () => {
    const card = {
      acceptanceCriteria: ["Acceptance criteria verified"],
      testPlan: {
        unit: ["Run unit tests"],
        integration: ["Run integration smoke"],
        visual: ["Capture screenshot"],
        manual: ["Manual review"],
      },
    } as ProjectBoardCard;
    const proof = {
      changedFiles: ["src/main/projectStore/projectStore.ts"],
      afterRunHook: { ok: true },
      screenshots: ["screenshot.png"],
      manualChecks: ["Manual review confirmed the behavior."],
    };

    expect(projectBoardSatisfiedProofItems(card, "Acceptance criteria verified. Vitest passed. Electron smoke verified.", proof, "/workspace/app")).toEqual([
      "Implementation evidence recorded.",
      "Acceptance criteria discussed in proof.",
      "Unit proof recorded.",
      "Integration proof recorded.",
      "Visual/browser proof recorded.",
      "Manual review proof recorded.",
    ]);
    expect(
      projectBoardSatisfiedProofItems(
        {
          ...card,
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
        } as ProjectBoardCard,
        "Acceptance criteria verified. Vitest passed.",
        proof,
        "/workspace/app",
      ),
    ).toEqual(["Implementation evidence recorded."]);
  });

  it("maps missing proof items from card expectations", () => {
    const card = {
      acceptanceCriteria: ["Acceptance criteria verified"],
      sourceKind: "pi_task",
      candidateStatus: "candidate",
      testPlan: {
        unit: ["Run unit tests"],
        integration: ["Run integration smoke"],
        visual: ["Capture screenshot"],
        manual: ["Manual review"],
      },
    } as unknown as ProjectBoardCard;

    expect(projectBoardMissingProofItems(card, "", undefined, "/workspace/app")).toEqual(["No proof packet recorded."]);
    expect(projectBoardMissingProofItems(card, "", {}, "/workspace/app")).toEqual([
      "Acceptance criteria were not explicitly addressed in the proof packet.",
      "No changed implementation files or meaningful diff evidence recorded.",
      "Unit proof missing: Run unit tests",
      "Integration proof missing: Run integration smoke",
      "Visual proof missing: Capture screenshot",
      "Manual proof missing: Manual review",
    ]);
    expect(projectBoardMissingProofItems({ ...card, sourceKind: "local_task_import" } as ProjectBoardCard, "", {}, "/workspace/app")).not.toContain(
      "No changed implementation files or meaningful diff evidence recorded.",
    );
    expect(projectBoardMissingProofItems({ ...card, candidateStatus: "evidence" } as ProjectBoardCard, "", {}, "/workspace/app")).not.toContain(
      "No changed implementation files or meaningful diff evidence recorded.",
    );
    expect(
      projectBoardMissingProofItems(
        card,
        "",
        { projectBoardRuntimeBudget: { exceeded: true, maxRuntimeMs: 125_000, recommendedNextAction: "Split the remaining work." } },
        "/workspace/app",
      ),
    ).toContain("Runtime budget exceeded after 125s: Split the remaining work.");
    expect(projectBoardMissingProofItems(card, "", { afterRunHook: { ok: false } }, "/workspace/app")).toContain("afterRun hook failed.");
  });

  it("maps runtime budget proof details conservatively", () => {
    const projectBoardBudget = { exceeded: true, maxRuntimeMs: 125_000, recommendedNextAction: "Split the remaining work." };
    const legacyBudget = { exceeded: false };

    expect(projectBoardRuntimeBudgetFromProof({ projectBoardRuntimeBudget: projectBoardBudget, runtimeBudget: legacyBudget })).toBe(projectBoardBudget);
    expect(projectBoardRuntimeBudgetFromProof({ runtimeBudget: legacyBudget })).toBe(legacyBudget);
    expect(projectBoardRuntimeBudgetFromProof({ projectBoardRuntimeBudget: ["not", "an", "object"] })).toBeUndefined();
    expect(projectBoardRuntimeBudgetExceeded({ projectBoardRuntimeBudget: projectBoardBudget })).toBe(true);
    expect(projectBoardRuntimeBudgetExceeded({ runtimeBudget: { exceeded: "true" } })).toBe(false);
    expect(projectBoardRuntimeBudgetHasMeaningfulProgress(undefined, "", [], "/workspace/app")).toBe(false);
    expect(projectBoardRuntimeBudgetHasMeaningfulProgress({}, "", ["Unit proof recorded."], "/workspace/app")).toBe(false);
    expect(
      projectBoardRuntimeBudgetHasMeaningfulProgress({ changedFiles: ["src/main/projectStore/projectStore.ts"] }, "", [], "/workspace/app"),
    ).toBe(true);
    expect(projectBoardRuntimeBudgetReason(projectBoardBudget)).toBe("Runtime budget exceeded after 125s: Split the remaining work.");
    expect(projectBoardRuntimeBudgetReason({})).toBe(
      "Runtime budget exceeded: Review partial workspace changes and retry, split, or create a narrower follow-up card.",
    );
  });

  it("normalizes runtime budget criteria for split follow-ups", () => {
    expect(normalizeRuntimeBudgetCriteria([
      "  Runtime budget exceeded after 125s: Finish the remaining project-board export flow.  ",
      "- Finish the remaining project board export flow",
      "Finish the remaining project board export flow",
      "Finish the remaining project-board export flow after carrying over the imported artifact proof from the parent card.",
      "",
      "Capture a regression test.",
      "Capture a regression test.",
      "Review manually.",
    ], 3)).toEqual([
      "Runtime budget exceeded after 125s: Finish the remaining project-board export flow.",
      "Capture a regression test.",
      "Review manually.",
    ]);
  });

  it("evaluates incomplete project board proof runs as retryable or terminal", () => {
    const card = projectBoardCard();

    expect(
      evaluateProjectBoardCardProof(
        card,
        {
          id: "run-1",
          taskId: "task-1",
          status: "failed",
          error: "Worker failed.",
        } as unknown as OrchestrationRun,
      ),
    ).toEqual({
      status: "retry_recommended",
      summary: "The latest run ended as failed; retry or inspect before closing.",
      satisfied: [],
      missing: ["Worker failed."],
      evidenceQuality: "weak",
      recommendedAction: "retry",
    });
    expect(
      evaluateProjectBoardCardProof(
        card,
        {
          id: "run-1",
          taskId: "task-1",
          status: "stalled",
          error: "Waiting on user input.",
        } as unknown as OrchestrationRun,
      ),
    ).toEqual({
      status: "terminally_blocked",
      summary: "The latest run appears terminally blocked.",
      satisfied: [],
      missing: ["Terminal blocker: Waiting on user input."],
      evidenceQuality: "weak",
      recommendedAction: "block",
    });
  });

  it("evaluates runtime budget proof without progress as retryable", () => {
    const card = projectBoardCard();

    expect(
      evaluateProjectBoardCardProof(
        card,
        {
          id: "run-1",
          taskId: "task-1",
          status: "completed",
          workspacePath: "/workspace/app",
          proofOfWork: {
            projectBoardRuntimeBudget: {
              exceeded: true,
              maxRuntimeMs: 125_000,
              recommendedNextAction: "Split the remaining work.",
            },
          },
        } as unknown as OrchestrationRun,
      ),
    ).toEqual({
      status: "retry_recommended",
      summary: "The run hit the runtime budget before recording meaningful implementation progress.",
      satisfied: [],
      missing: [
        "Runtime budget exceeded after 125s: Split the remaining work.",
        "No changed implementation files or meaningful diff evidence recorded.",
      ],
      evidenceQuality: "weak",
      recommendedAction: "retry",
    });
  });

  it("evaluates proof with remaining card expectations as needing follow-up", () => {
    const card = projectBoardCard({
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual review"] },
    });

    expect(
      evaluateProjectBoardCardProof(
        card,
        {
          id: "run-1",
          taskId: "task-1",
          status: "completed",
          workspacePath: "/workspace/app",
          proofOfWork: {
            changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
          },
        } as unknown as OrchestrationRun,
      ),
    ).toEqual({
      status: "needs_follow_up",
      summary: "The run produced evidence, but the board card still needs follow-up before closure.",
      satisfied: ["Implementation evidence recorded."],
      missing: ["Manual proof missing: Manual review"],
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
    });
  });

  it("evaluates complete proof packets as done", () => {
    const card = projectBoardCard();

    expect(
      evaluateProjectBoardCardProof(
        card,
        {
          id: "run-1",
          taskId: "task-1",
          status: "completed",
          workspacePath: "/workspace/app",
          proofOfWork: {
            projectBoardStatus: "done",
            changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
          },
        } as unknown as OrchestrationRun,
      ),
    ).toEqual({
      status: "done",
      summary: "The proof packet satisfies the recorded acceptance and proof expectations.",
      satisfied: ["Implementation evidence recorded."],
      missing: [],
      evidenceQuality: "strong",
      recommendedAction: "close",
    });
  });

  it("applies runtime budget review outcomes conservatively", () => {
    const review = {
      status: "done",
      summary: "Review summary.",
      satisfied: ["Unit proof recorded."],
      missing: ["Manual proof missing."],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      evidenceQuality: "strong",
      recommendedAction: "close",
    } as ProjectBoardCardProofReview;
    const runtimeBudget = {
      exceeded: true,
      maxRuntimeMs: 125_000,
      recommendedNextAction: "Split the remaining work.",
    };

    expect(projectBoardRuntimeBudgetReviewForApplication(review, { projectBoardRuntimeBudget: runtimeBudget }, "", "/workspace/app")).toEqual({
      ...review,
      status: "retry_recommended",
      summary: "The run hit the runtime budget before recording meaningful implementation progress.",
      satisfied: [],
      missing: ["Runtime budget exceeded after 125s: Split the remaining work.", "Manual proof missing."],
      evidenceQuality: "weak",
      recommendedAction: "retry",
    });
    expect(
      projectBoardRuntimeBudgetReviewForApplication(
        review,
        { projectBoardRuntimeBudget: runtimeBudget, changedFiles: ["src/main/projectStore/projectStore.ts"] },
        "",
        "/workspace/app",
      ),
    ).toEqual({
      ...review,
      status: "needs_follow_up",
      summary: "The run collected proof but hit the runtime budget before recording durable task completion.",
      missing: [
        "Runtime budget exceeded after 125s: Split the remaining work.",
        "Durable task_complete action was not recorded before the runtime budget stopped the run.",
        "Manual proof missing.",
      ],
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
    });
  });

  it("leaves runtime budget reviews unchanged when no rewrite is needed", () => {
    const review = {
      status: "done",
      summary: "Review summary.",
      satisfied: ["Unit proof recorded."],
      missing: [],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      evidenceQuality: "strong",
      recommendedAction: "close",
    } as ProjectBoardCardProofReview;
    const trustedCompletion: ProjectBoardTaskToolAction = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: ["Moved helper into mapper module."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(projectBoardRuntimeBudgetReviewForApplication(review, undefined, "", "/workspace/app")).toBe(review);
    expect(
      projectBoardRuntimeBudgetReviewForApplication(
        review,
        {
          projectBoardRuntimeBudget: { exceeded: true },
          changedFiles: ["src/main/projectStore/projectStore.ts"],
          taskToolActions: [trustedCompletion],
        },
        "",
        "/workspace/app",
      ),
    ).toBe(review);
  });

  it("summarizes runtime budget partial proof using existing fallback order", () => {
    const run = { error: "Run error summary." } as OrchestrationRun;
    const review = { summary: "Review summary." } as ProjectBoardCardProofReview;

    expect(
      projectBoardRuntimeBudgetPartialProofSummary(
        run,
        { handoff: { summary: " Handoff summary. " }, summary: "Proof summary.", lastAssistantText: "Assistant summary." },
        review,
      ),
    ).toBe("Handoff summary.");
    expect(projectBoardRuntimeBudgetPartialProofSummary(run, { summary: " Proof summary. ", lastAssistantText: "Assistant summary." }, review)).toBe(
      "Proof summary.",
    );
    expect(projectBoardRuntimeBudgetPartialProofSummary(run, { lastAssistantText: " Assistant summary. " }, review)).toBe("Assistant summary.");
    expect(projectBoardRuntimeBudgetPartialProofSummary(run, {}, review)).toBe("Review summary.");
    expect(projectBoardRuntimeBudgetPartialProofSummary(run, {}, { summary: "" } as ProjectBoardCardProofReview)).toBe("Run error summary.");
    expect(projectBoardRuntimeBudgetPartialProofSummary({} as OrchestrationRun, {}, { summary: "" } as ProjectBoardCardProofReview)).toBe(
      "Runtime budget stopped the card after partial progress.",
    );
  });

  it("truncates runtime budget partial proof summaries", () => {
    const summary = projectBoardRuntimeBudgetPartialProofSummary(
      {} as OrchestrationRun,
      { handoff: { summary: "x".repeat(4001) } },
      { summary: "" } as ProjectBoardCardProofReview,
    );

    expect(summary).toHaveLength(4000);
    expect(summary).toBe("x".repeat(4000));
  });

  it("maps runtime budget split outcomes for reviews with meaningful partial progress", () => {
    const now = "2026-01-01T00:04:00.000Z";
    const card = projectBoardCard({ acceptanceCriteria: ["Fallback criterion"] });
    const review = {
      summary: "Review summary.",
      satisfied: ["Unit proof recorded."],
      missing: ["Finish manual review."],
    } as unknown as ProjectBoardCardProofReview;
    const run = {
      id: "run-1",
      error: "Run error summary.",
      workspacePath: "/workspace/app",
      proofOfWork: {
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 125_000,
          elapsedMs: 130_500,
          recommendedNextAction: "Split the remaining work.",
        },
        changedFiles: ["src/main/projectStore/projectStore.ts"],
        handoff: {
          summary: "Handoff summary.",
          completed: ["Handoff completed."],
          remaining: ["Handoff remaining."],
        },
        remaining: ["Proof remaining."],
      },
    } as unknown as OrchestrationRun;

    expect(projectBoardRuntimeBudgetSplitOutcomeForReview(card, run, review, ["child-1"], now)).toEqual({
      status: "proposed",
      source: "runtime_budget",
      sourceRunId: "run-1",
      reason: "Runtime budget exceeded after 125s: Split the remaining work.",
      partialProofSummary: "Handoff summary.",
      completedCriteria: ["Implementation evidence recorded.", "Unit proof recorded.", "Handoff completed."],
      remainingCriteria: ["Handoff remaining.", "Proof remaining.", "Finish manual review."],
      childCardIds: ["child-1"],
      maxRuntimeMs: 125_000,
      elapsedMs: 130_500,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("skips runtime budget split outcomes without exceeded budget and meaningful progress", () => {
    const card = projectBoardCard({ acceptanceCriteria: ["Fallback criterion"] });
    const review = {
      summary: "Review summary.",
      satisfied: [],
      missing: ["Finish manual review."],
    } as unknown as ProjectBoardCardProofReview;
    const baseRun = {
      id: "run-1",
      error: "Run error summary.",
      workspacePath: "/workspace/app",
    } as unknown as OrchestrationRun;

    expect(projectBoardRuntimeBudgetSplitOutcomeForReview(card, baseRun, review, ["child-1"], "2026-01-01T00:04:00.000Z")).toBeUndefined();
    expect(
      projectBoardRuntimeBudgetSplitOutcomeForReview(
        card,
        { ...baseRun, proofOfWork: { projectBoardRuntimeBudget: { exceeded: false }, changedFiles: ["src/main/projectStore/projectStore.ts"] } } as unknown as OrchestrationRun,
        review,
        ["child-1"],
        "2026-01-01T00:04:00.000Z",
      ),
    ).toBeUndefined();
    expect(
      projectBoardRuntimeBudgetSplitOutcomeForReview(
        card,
        { ...baseRun, proofOfWork: { projectBoardRuntimeBudget: { exceeded: true } } } as unknown as OrchestrationRun,
        review,
        ["child-1"],
        "2026-01-01T00:04:00.000Z",
      ),
    ).toBeUndefined();
  });

  it("builds runtime budget follow-up text from partial proof sections", () => {
    const review = {
      summary: "  Review summary.  ",
    } as ProjectBoardProofReviewDraft;

    expect(
      projectBoardRuntimeBudgetFollowUpDescription(
        "Parent card",
        review,
        ["Implemented mapper.", "Ran tests."],
        ["Finish UI.", "Manual check."],
      ),
    ).toBe([
      "Runtime-budget split follow-up derived from Parent card.",
      "",
      "Review summary.",
      "",
      "Completed before timeout:",
      "- Implemented mapper.",
      "- Ran tests.",
      "",
      "Remaining scope:",
      "- Finish UI.",
      "- Manual check.",
    ].join("\n"));
    expect(projectBoardRuntimeBudgetFollowUpDescription("Parent card", { summary: " " } as ProjectBoardProofReviewDraft, [], [])).toBe(
      "Runtime-budget split follow-up derived from Parent card.",
    );
  });

  it("truncates runtime budget follow-up descriptions", () => {
    const prefix = "Runtime-budget split follow-up derived from Parent card.\n\n";
    const description = projectBoardRuntimeBudgetFollowUpDescription(
      "Parent card",
      { summary: "x".repeat(4001) } as ProjectBoardProofReviewDraft,
      [],
      [],
    );

    expect(description).toHaveLength(4000);
    expect(description).toBe(`${prefix}${"x".repeat(4000 - prefix.length)}`);
  });

  it("builds runtime budget follow-up clarification questions", () => {
    expect(projectBoardRuntimeBudgetFollowUpClarificationQuestion("Parent card")).toBe(
      'Confirm this runtime-budget follow-up accurately captures the remaining scope for "Parent card" before ticketizing it.',
    );
  });

  it("filters runtime budget task actions to trustworthy proof actions", () => {
    const trustedCompletion = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: ["Moved helper into mapper module."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };
    const card = {
      acceptanceCriteria: ["Fallback criterion"],
    } as unknown as ProjectBoardCard;
    const copiedSampleCompletion = {
      ...trustedCompletion,
      actionId: "proof-1",
      summary: "summarize the actual proof collected in this run.",
    };

    expect(projectBoardRuntimeBudgetTrustworthyTaskActions(undefined)).toEqual([]);
    expect(projectBoardRuntimeBudgetTrustworthyTaskActions({ taskToolActions: [trustedCompletion, copiedSampleCompletion] })).toEqual([trustedCompletion]);
    expect(projectBoardRuntimeBudgetHasDurableCompletion(undefined)).toBe(false);
    expect(projectBoardRuntimeBudgetHasDurableCompletion({ taskToolActions: [trustedCompletion] })).toBe(true);
    expect(projectBoardRuntimeBudgetHasDurableCompletion({ taskToolActions: [copiedSampleCompletion] })).toBe(false);
    expect(projectBoardRuntimeBudgetCompletedCriteria(undefined, ["Unit proof recorded."], "/workspace/app")).toEqual([]);
    expect(projectBoardRuntimeBudgetCompletedCriteria({ completed: ["Proof completed."] }, ["Unit proof recorded."], "/workspace/app")).toEqual([
      "Proof completed.",
    ]);
    expect(
      projectBoardRuntimeBudgetCompletedCriteria(
        {
          changedFiles: ["src/main/projectStore/projectStore.ts"],
          handoff: { completed: ["Handoff completed."] },
          completed: ["Proof completed."],
          taskToolActions: [trustedCompletion, copiedSampleCompletion],
        },
        ["Unit proof recorded."],
        "/workspace/app",
      ),
    ).toEqual([
      "Implementation evidence recorded.",
      "Unit proof recorded.",
      "Handoff completed.",
      "Proof completed.",
      "Moved helper into mapper module.",
    ]);
    expect(projectBoardRuntimeBudgetRemainingCriteria(card, undefined, { missing: [] })).toEqual(["Fallback criterion"]);
    expect(
      projectBoardRuntimeBudgetRemainingCriteria(
        card,
        {
          handoff: { remaining: ["Handoff remaining."] },
          remaining: ["Proof remaining."],
          nextSteps: ["Next proof step."],
          taskToolActions: [{ ...trustedCompletion, remaining: ["Task action remaining."] }, copiedSampleCompletion],
        },
        { missing: ["Review missing proof."] },
      ),
    ).toEqual([
      "Handoff remaining.",
      "Proof remaining.",
      "Next proof step.",
      "Task action remaining.",
      "Review missing proof.",
    ]);
  });

  it("merges project board task actions for proof by action id", () => {
    const firstHeartbeat: ProjectBoardTaskToolAction = {
      action: "task_heartbeat",
      actionId: "heartbeat-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool", source: "first" },
      summary: "Started the extraction.",
      completed: [],
      remaining: ["Move helper."],
      nextStep: "Patch mapper module.",
    };
    const updatedHeartbeat: ProjectBoardTaskToolAction = {
      ...firstHeartbeat,
      metadata: { transport: "native_tool", source: "updated", toolName: "task_heartbeat" },
      summary: "Patched the mapper module.",
      remaining: ["Run tests."],
    };
    const earlierCompletion: ProjectBoardTaskToolAction = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:02:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed a prior helper.",
      completed: ["Prior helper moved."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(mergeProjectBoardTaskToolActionsForProof([firstHeartbeat, earlierCompletion, updatedHeartbeat])).toEqual([
      earlierCompletion,
      {
        ...updatedHeartbeat,
        metadata: { transport: "native_tool", source: "updated", toolName: "task_heartbeat" },
      },
    ]);
  });

  it("maps project board sources by canonical source key", () => {
    expect(projectBoardCanonicalSourceKey({ sourceKey: " explicit:key ", title: "Ignored" })).toBe("explicit:key");
    expect(projectBoardCanonicalSourceKey({ sourceKey: " ", path: "docs/Guide.md", title: "Guide" })).toBe("file:docs/Guide.md");
    expect(projectBoardSourcesByCanonicalKey([
      projectBoardSource({ id: "first", sourceKey: "docs:guide", title: "First" }),
      projectBoardSource({ id: "second", sourceKey: " docs:guide ", title: "Second" }),
      projectBoardSource({ id: "third", path: "docs/Other.md", title: "Other" }),
    ])).toEqual(
      new Map([
        ["docs:guide", projectBoardSource({ id: "first", sourceKey: "docs:guide", title: "First" })],
        ["file:docs/Other.md", projectBoardSource({ id: "third", path: "docs/Other.md", title: "Other" })],
      ]),
    );
  });

  it("formats project board source display names and major system labels", () => {
    expect(sourceDisplayName({ path: " docs/Guide.md ", title: "Guide", kind: "markdown" })).toBe("docs/Guide.md");
    expect(sourceDisplayName({ title: " Guide title ", kind: "thread" })).toBe("Guide title");
    expect(sourceDisplayName({ title: "   ", kind: "thread" })).toBe("thread");
    expect(sourceMajorSystemLabel(projectBoardSource({ path: "src/features/project-board/BoardStore.ts" }))).toBe("project board BoardStore");
    expect(sourceMajorSystemLabel(projectBoardSource({ path: "docs/architecture.md" }))).toBe("docs architecture");
  });

  it("maps project board source impact inclusion, durable plan, and prompt sizing helpers", () => {
    expect(projectBoardSourceImpactIncluded(projectBoardSource())).toBe(true);
    expect(projectBoardSourceImpactIncluded(projectBoardSource({ kind: "ignored" }))).toBe(false);
    expect(projectBoardSourceImpactIncluded(projectBoardSource({ includeInSynthesis: false }))).toBe(false);
    expect(projectBoardSourceImpactIncluded(projectBoardSource({ authorityRole: "ignored" }))).toBe(false);
    expect(
      projectBoardSourceImpactDurablePlanPrimary(
        projectBoardSource({
          kind: "plan_artifact",
          path: ".ambient\\board\\plans\\durable.md",
          authorityRole: "primary",
        }),
      ),
    ).toBe(true);
    expect(
      projectBoardSourceImpactDurablePlanPrimary(
        projectBoardSource({
          kind: "plan_artifact",
          path: ".ambient/board/plans/durable.md",
          authorityRole: "primary",
          includeInSynthesis: false,
        }),
      ),
    ).toBe(false);
    expect(projectBoardSourceImpactEstimatedPromptChars(projectBoardSource({ byteSize: 12.6 }))).toBe(13);
    const fallbackSource = projectBoardSource({
      title: "Title",
      summary: "Summary",
      excerpt: "Excerpt",
      path: "docs/path.md",
      threadId: "thread-1",
      artifactId: "artifact-1",
      messageId: "message-1",
    });
    expect(projectBoardSourceImpactEstimatedPromptChars(fallbackSource)).toBe(
      ["Title", "Summary", "Excerpt", "docs/path.md", "thread-1", "artifact-1", "message-1"].join("\n").length,
    );
  });

  it("maps project board source impact recommendation and ledger detail helpers", () => {
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: true,
        nextRunFeedbackRecommended: true,
      }),
    ).toBe("add_next_run_feedback");
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: true,
        nextRunFeedbackRecommended: false,
      }),
    ).toBe("refresh_drafts");
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: false,
        nextRunFeedbackRecommended: false,
      }),
    ).toBe("additive_source_elaboration");
    expect(
      projectBoardSourceImpactRecommendedAction({
        additiveSynthesisAvailable: false,
        targetedRefreshOptional: false,
        nextRunFeedbackRecommended: false,
      }),
    ).toBe("none");
    expect(
      projectBoardSourceImpactLedgerDetail({
        additiveSynthesisAvailable: true,
        targetedRefreshOptional: true,
        nextRunFeedbackRecommended: true,
        affectedDraftCount: 1,
        affectedExecutableCount: 2,
        durablePlanPrimaryCount: 1,
        ignoredChatCount: 3,
      }),
    ).toBe(
      [
        "Source selection updated without rewriting existing cards or calling Pi.",
        "The source can be used later for additive card elaboration.",
        "1 draft card cite this source and can be refreshed selectively.",
        "2 ticketized cards cite this source; use additive next-run feedback instead of rewriting approved cards.",
        "Durable-plan authority is active, so ignored chats remain inspectable but excluded by default.",
      ].join(" "),
    );
  });

  it("maps project board source update impact metadata", () => {
    const previousSource = projectBoardSource({
      id: "source-main",
      kind: "thread",
      title: "Implementation Plan ABCD1234",
      summary: "Updated 2026-01-02T03:04:05Z state model",
      threadId: "thread-main",
      sourceKey: "thread:main",
      authorityRole: "ignored",
      includeInSynthesis: false,
      byteSize: 20,
    });
    const nextSource = projectBoardSource({
      ...previousSource,
      kind: "plan_artifact",
      path: ".ambient/board/plans/main.md",
      authorityRole: "primary",
      includeInSynthesis: true,
      byteSize: 18,
    });
    const peerSource = projectBoardSource({
      id: "source-peer",
      title: "Implementation Plan EEEEFFFF",
      summary: "Updated 2026-04-05T06:07:08Z state model",
      path: "docs/plan.md",
      authorityRole: "context",
      includeInSynthesis: true,
      byteSize: 12,
    });
    const includedChat = projectBoardSource({
      id: "chat-included",
      kind: "thread",
      title: "Kickoff chat",
      summary: "Discussed priorities.",
      authorityRole: "context",
      includeInSynthesis: true,
    });
    const ignoredChat = projectBoardSource({
      id: "chat-ignored",
      kind: "thread",
      title: "Old chat",
      summary: "Superseded notes.",
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
    const impact = projectBoardSourceUpdateImpactMetadata({
      previousSource,
      nextSource,
      sources: [nextSource, peerSource, includedChat, ignoredChat],
      cards: [
        projectBoardCard({ id: "draft-card", status: "draft", sourceId: "source-main" }),
        projectBoardCard({ id: "ready-card", status: "ready", sourceId: "synthesis:ready", sourceRefs: ["Docs/Plan.md#scope"] }),
        projectBoardCard({ id: "archived-card", status: "archived", sourceId: "synthesis:archived", sourceRefs: ["source-main"] }),
        projectBoardCard({ id: "unrelated-card", status: "ready", sourceId: "synthesis:unrelated", sourceRefs: ["unrelated"] }),
      ],
    });

    expect(impact).toEqual({
      schemaVersion: 1,
      sourceId: "source-main",
      groupSourceIds: ["source-main", "source-peer"],
      from: {
        kind: "thread",
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
      to: {
        kind: "plan_artifact",
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      existingCardsRewritten: false,
      modelCallRequired: false,
      additiveSynthesisAvailable: true,
      targetedRefreshOptional: true,
      nextRunFeedbackRecommended: true,
      affectedCardIds: ["draft-card", "ready-card", "archived-card"],
      affectedDraftCardIds: ["draft-card"],
      affectedExecutableCardIds: ["ready-card"],
      affectedDraftCount: 1,
      affectedExecutableCount: 1,
      durablePlanPrimaryCount: 1,
      includedChatCount: 1,
      ignoredChatCount: 1,
      selectedObservationCount: 2,
      estimatedPromptChars: 30,
      recommendedAction: "add_next_run_feedback",
      detail: [
        "Source selection updated without rewriting existing cards or calling Pi.",
        "The source can be used later for additive card elaboration.",
        "1 draft card cite this source and can be refreshed selectively.",
        "1 ticketized card cite this source; use additive next-run feedback instead of rewriting approved cards.",
        "Durable-plan authority is active, so ignored chats remain inspectable but excluded by default.",
      ].join(" "),
    });
  });

  it("maps project board source impact event metadata helpers", () => {
    const event = (overrides: Partial<ProjectBoardEvent>): ProjectBoardEvent => ({
      id: "event-1",
      boardId: "board-1",
      kind: "source_updated",
      title: "Source updated",
      summary: "Source metadata changed",
      metadata: {},
      createdAt: "2026-01-02T03:04:05.000Z",
      ...overrides,
    });
    const impact: ProjectBoardSourceUpdateImpactMetadata = {
      schemaVersion: 1,
      sourceId: "source-1",
      groupSourceIds: ["source-b", "source-a"],
      from: { kind: "thread", authorityRole: "context", includeInSynthesis: true },
      to: { kind: "plan_artifact", authorityRole: "primary", includeInSynthesis: true },
      existingCardsRewritten: false,
      modelCallRequired: false,
      additiveSynthesisAvailable: true,
      targetedRefreshOptional: false,
      nextRunFeedbackRecommended: true,
      affectedCardIds: ["card-1"],
      affectedDraftCardIds: ["draft-1"],
      affectedExecutableCardIds: ["run-1"],
      affectedDraftCount: 1,
      affectedExecutableCount: 1,
      durablePlanPrimaryCount: 1,
      includedChatCount: 1,
      ignoredChatCount: 0,
      selectedObservationCount: 2,
      estimatedPromptChars: 120,
      recommendedAction: "add_next_run_feedback",
      detail: "Source selection updated.",
    };
    expect(projectBoardSourceImpactMetadataFromEvent(event({ metadata: { sourceImpact: impact } }))).toBe(impact);
    expect(projectBoardSourceImpactMetadataFromEvent(event({ kind: "board_created", metadata: { sourceImpact: impact } }))).toBeUndefined();
    expect(
      projectBoardSourceImpactMetadataFromEvent(
        event({
          metadata: {
            sourceImpact: {
              ...impact,
              groupSourceIds: "source-a",
            },
          },
        }),
      ),
    ).toBeUndefined();
    expect(projectBoardSourceDraftRefreshRecordKey({ impact })).toBe("source-a|source-b");
    expect(projectBoardSourceDraftRefreshRecordKey({ impact: { ...impact, groupSourceIds: [] } })).toBe("source-1");
    expect(
      projectBoardSourceDraftRefreshEventMetadata(
        event({
          kind: "card_updated",
          metadata: {
            sourceImpact: {
              appliedAction: "refresh_affected_drafts",
              sourceImpactEventIds: ["impact-1", "", 3, " impact-2 "],
              appliedCardIds: ["card-1", " ", false, "card-2"],
            },
          },
        }),
      ),
    ).toEqual({
      sourceImpactEventIds: ["impact-1", " impact-2 "],
      appliedCardIds: ["card-1", "card-2"],
    });
    expect(
      projectBoardSourceDraftRefreshEventMetadata(
        event({
          kind: "card_updated",
          metadata: {
            sourceImpact: {
              appliedAction: "refresh_affected_drafts",
              sourceImpactEventIds: "impact-1",
              appliedCardIds: ["card-1"],
            },
          },
        }),
      ),
    ).toBeUndefined();
    expect(projectBoardSourceDraftRefreshEventMetadata(event({ kind: "source_updated", metadata: {} }))).toBeUndefined();
  });

  it("maps project board source impact refresh note and feedback text helpers", () => {
    const sources = [
      projectBoardSource({ title: "Primary plan", path: ".ambient/board/plans/main.md", authorityRole: "primary" }),
      projectBoardSource({ id: "source-2", title: "Ignored chat", authorityRole: "ignored", includeInSynthesis: false }),
      projectBoardSource({ id: "source-3", title: "Context thread" }),
      projectBoardSource({ id: "source-4", title: "Proof", authorityRole: "proof" }),
      projectBoardSource({ id: "source-5", title: "Hidden extra" }),
    ];
    expect(
      projectBoardSourceDraftRefreshNote({
        sources,
        impactRecordCount: 2,
        selectedObservationCount: 1,
      }),
    ).toBe(
      [
        "Source authority was refreshed from 2 source-impact records.",
        "Current impacted sources: .ambient/board/plans/main.md (primary, included); Ignored chat (ignored, excluded); Context thread (context, included); Proof (proof, included); +1 more.",
        "1 included source observation are available for additive elaboration.",
        "Existing draft text was not rewritten by Pi; review this note before ticketization or run Add Cards for a low-model targeted elaboration.",
      ].join(" "),
    );
    expect(
      projectBoardSourceDraftRefreshNote({
        sources: [],
        impactRecordCount: 1,
        selectedObservationCount: 0,
      }),
    ).toBe(
      [
        "Source authority was refreshed from 1 source-impact record.",
        "Current impacted sources: current source selection.",
        "no included source observations are available for additive elaboration.",
        "Existing draft text was not rewritten by Pi; review this note before ticketization or run Add Cards for a low-model targeted elaboration.",
      ].join(" "),
    );
    expect(
      projectBoardSourceImpactFeedbackText({
        sources,
        impactRecordCount: 2,
        selectedObservationCount: 3,
      }),
    ).toBe(
      [
        "Source authority changed after this card was approved. Reconcile the next run against .ambient/board/plans/main.md (primary, included); Ignored chat (ignored, excluded); Context thread (context, included); Proof (proof, included); +1 more.",
        "3 included source observations are currently eligible for additive source context.",
        "This feedback came from 2 source-impact records.",
        "Do not rewrite the approved card scope silently; if the source change materially broadens work, create a follow-up or split card.",
      ].join(" "),
    );
    expect(
      projectBoardSourceImpactFeedbackText({
        sources: [],
        impactRecordCount: 1,
        selectedObservationCount: 0,
      }),
    ).toBe(
      [
        "Source authority changed after this card was approved. Reconcile the next run against current source selection.",
        "no included source observations are currently eligible for additive source context.",
        "This feedback came from 1 source-impact record.",
        "Do not rewrite the approved card scope silently; if the source change materially broadens work, create a follow-up or split card.",
      ].join(" "),
    );
  });

  it("maps project board synthesis draft markdown", () => {
    const draft: ProjectBoardSynthesisDraft = {
      summary: "Summary",
      goal: "Ship the board.",
      currentState: "The shell exists.",
      targetUser: "Builders",
      qualityBar: "Reliable and clear.",
      assumptions: ["Use existing APIs.", "Keep scope tight."],
      questions: ["Which source wins?"],
      sourceNotes: ["README.md explains the shell.", "plan.md defines scope."],
      cards: [
        {
          sourceId: "source-1",
          title: "Wire board",
          description: "Connect the board.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: ["card-a", "card-b"],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
          clarificationQuestions: ["Confirm data flow?"],
        },
        {
          sourceId: "source-2",
          title: "Review copy",
          description: "Review wording.",
          candidateStatus: "needs_clarification",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
      ],
    };
    expect(projectBoardSynthesisMarkdown({ title: "Launch Board" }, draft)).toBe(
      [
        "# Launch Board",
        "",
        "## Synthesized Goal",
        "",
        "Ship the board.",
        "",
        "## Current State",
        "",
        "The shell exists.",
        "",
        "## Target User",
        "",
        "Builders",
        "",
        "## Quality Bar",
        "",
        "Reliable and clear.",
        "",
        "## Assumptions",
        "",
        "- Use existing APIs.\n- Keep scope tight.",
        "",
        "## Open Questions",
        "",
        "- Which source wins?",
        "",
        "## Proposed Cards",
        "",
        "1. Wire board (ready_to_create). Blocked by: card-a, card-b. Questions: Confirm data flow?\n2. Review copy (needs_clarification).",
        "",
        "## Source Basis",
        "",
        "- README.md explains the shell.\n- plan.md defines scope.",
      ].join("\n"),
    );
    expect(
      projectBoardSynthesisMarkdown(
        { title: "Empty Board" },
        {
          ...draft,
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [],
        },
      ),
    ).toContain(["## Assumptions", "", "- None recorded.", "", "## Open Questions", "", "- No synthesis-specific questions."].join("\n"));
  });

  it("maps project board source impact identity and reference keys", () => {
    expect(projectBoardSourceImpactNormalizeText("Plan ABCD1234 updated 2026-01-02T03:04:05Z")).toBe("plan updated");
    expect(projectBoardSourceImpactReferenceKey(" Docs\\Plan  File.md ")).toBe("docs/plan file.md");
    expect(
      projectBoardSourceImpactReferenceKeys(
        projectBoardSource({
          id: "source-1",
          sourceKey: " Source:Key ",
          path: "Docs\\Plan.md",
          title: " Plan Title ",
          artifactId: "Artifact-1",
          threadId: "Thread-1",
          messageId: "Message-1",
        }),
      ),
    ).toEqual(["source-1", "source:key", "docs/plan.md", "plan title", "artifact-1", "thread-1", "message-1"]);
    expect(
      projectBoardSourceImpactGroupKey(projectBoardSource({ title: "Plan ABCD1234", summary: "Updated 2026-01-02T03:04:05Z state model" })),
    ).toBe("content:plan|updated state model");
    expect(projectBoardSourceImpactGroupKey(projectBoardSource({ title: "Short", summary: "", kind: "thread", threadId: "thread-1" }))).toBe(
      "thread::thread-1:::source-1",
    );
    expect(projectBoardSourceImpactReferenceMatchesAny("docs/plan.md#section", new Set(["docs/plan.md"]))).toBe(true);
    expect(projectBoardSourceImpactReferenceMatchesAny("plan", new Set(["docs/plan.md"]))).toBe(false);
  });

  it("compiles project board charter policy and markdown", () => {
    const questions = [
      projectBoardQuestion({ id: "question-1", answer: " Build a stable project board. " }),
      projectBoardQuestion({ id: "question-2", answer: " Prefer durable sources. " }),
      projectBoardQuestion({ id: "question-3", answer: " Ask before guessing. " }),
      projectBoardQuestion({ id: "question-4", answer: " Require focused proof. " }),
      projectBoardQuestion({ id: "question-5", answer: " Finish dependency-ready cards first. " }),
    ];
    const compiled = compileProjectBoardCharter(
      { title: "Project Board", summary: "Fallback summary" },
      questions,
      [
        projectBoardSource({ id: "thread-source", kind: "thread", title: "Kickoff Chat", relevance: 100 }),
        projectBoardSource({ id: "plan-source", kind: "plan_artifact", title: "Plan", path: "docs/plan.md", relevance: 40 }),
        projectBoardSource({ id: "ignored-source", kind: "ignored", title: "Ignored", includeInSynthesis: false, relevance: 90 }),
      ],
    );
    expect(compiled).toMatchObject({
      goal: "Build a stable project board.",
      currentState: "Kickoff completed with 2 included project sources.",
      targetUser: "",
      nonGoals: [],
      qualityBar: "Require focused proof.",
      testPolicy: {
        defaultProof: "Require focused proof.",
        requireProofSpec: true,
        unit: true,
        integration: true,
        visual: true,
        manual: true,
        proofScopeWarningPolicy: "advisory",
      },
      decisionPolicy: { defaultPolicy: "Ask before guessing." },
      dependencyPolicy: { ordering: "blockers_first", source: "board_dependencies", executionPolicy: "Finish dependency-ready cards first." },
      budgetPolicy: {
        maxPassesPerCard: 6,
        maxRuntimeMsPerCard: 1_200_000,
        pauseOnTerminalBlocker: true,
        executionPolicy: "Finish dependency-ready cards first.",
      },
      sourcePolicy: { policy: "Prefer durable sources.", authoritativeSources: ["docs/plan.md"] },
      summary: "Build a stable project board.",
    });
    expect(compiled.markdown).toBe(
      [
        "# Project Board",
        "",
        "## Goal",
        "",
        "Build a stable project board.",
        "",
        "## Source Authority",
        "",
        "Prefer durable sources.",
        "",
        "## Decision Policy",
        "",
        "Ask before guessing.",
        "",
        "## Proof Policy",
        "",
        "Require focused proof.",
        "",
        "## Execution Policy",
        "",
        "Finish dependency-ready cards first.",
        "",
        "## Source Corpus",
        "",
        "- Kickoff Chat (thread)\n- Plan (plan_artifact: docs/plan.md)",
      ].join("\n"),
    );

    const fallback = compileProjectBoardCharter({ title: "Fallback Board", summary: "" }, [], []);
    expect(fallback.goal).toBe("Fallback Board");
    expect(fallback.currentState).toBe("Kickoff completed with 0 included project sources.");
    expect(fallback.sourcePolicy).toEqual({
      policy: "Use the scanned sources as supporting context and ask when they conflict.",
      authoritativeSources: [],
    });
    expect(fallback.markdown).toContain("- No sources scanned yet.");
  });

  it("builds fallback project board charter project summaries", () => {
    const questions = [
      projectBoardQuestion({
        id: "question-goal",
        question: "What should the board ship?",
        answer: " Build a stable project board. ",
      }),
      projectBoardQuestion({
        id: "question-source",
        question: "How should sources be weighted?",
        answer: " Prefer durable sources. ",
      }),
      projectBoardQuestion({
        id: "question-decision",
        question: "Which source owns release scope?",
        answer: "",
        required: true,
      }),
      projectBoardQuestion({
        id: "question-proof",
        question: "What proof is required?",
        answer: " Require focused proof. ",
      }),
      projectBoardQuestion({
        id: "question-execution",
        question: "How should cards be sequenced?",
        answer: " Finish dependency-ready cards first. ",
      }),
    ];
    const sources = [
      projectBoardSource({
        id: "architecture-source",
        kind: "architecture_artifact",
        title: "Architecture",
        summary: "State persistence must land before provider API work; a blocker risk remains.",
        excerpt: "Use integration tests and manual proof before closing the board.",
        path: "src/features/project-board/BoardStore.ts",
        authorityRole: "primary",
        relevance: 92,
      }),
      projectBoardSource({
        id: "test-source",
        kind: "test_artifact",
        title: "Proof plan",
        summary: "Validation requires unit and integration proof.",
        path: "docs/proof.md",
        authorityRole: "proof",
        relevance: 55,
      }),
      projectBoardSource({
        id: "ignored-source",
        kind: "thread",
        title: "Ignored thread",
        summary: "Old discussion.",
        includeInSynthesis: false,
        relevance: 99,
      }),
    ];
    const compiled = compileProjectBoardCharter({ title: "Project Board", summary: "Fallback summary" }, questions, sources);
    const summary = buildProjectBoardCharterProjectSummary({
      board: { title: "Project Board" },
      questions,
      sources,
      compiled,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(summary).toMatchObject({
      generator: "fallback_heuristic",
      generatedAt: "2026-01-01T00:00:00.000Z",
      summary: expect.stringContaining("Build a stable project board."),
      majorSystems: expect.arrayContaining(["project board BoardStore", "State and persistence"]),
      sourceCoverage: [
        "src/features/project-board/BoardStore.ts - architecture_artifact - 92 relevance - primary authority",
        "docs/proof.md - test_artifact - 55 relevance - proof authority",
      ],
      coverageGaps: [],
      unresolvedDecisions: ["Which source owns release scope?"],
      risks: expect.arrayContaining(["Review src/features/project-board/BoardStore.ts for risks or unresolved scope."]),
      dependencyHints: expect.arrayContaining([
        "Use dependency cues from src/features/project-board/BoardStore.ts.",
        "Finish dependency-ready cards first.",
      ]),
      citations: expect.arrayContaining(["src/features/project-board/BoardStore.ts (src/features/project-board/BoardStore.ts)"]),
      kickoffContextBrief: expect.objectContaining({
        includedSourceCount: 2,
        ignoredSourceCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    expect(summary.sourceCoverage).not.toEqual(expect.arrayContaining([expect.stringContaining("Ignored thread")]));
    expect(summary.sourceChecksumSet).toHaveLength(2);
    expect(summary.charterAnswerChecksum).toHaveLength(64);
  });

  it("maps project board charter summary keyword hints and coverage gaps", () => {
    expect(keywordSystemHints("Renderer input state API test auth")).toEqual([
      "Rendering and visual proof",
      "Input and controls",
      "State and persistence",
      "Provider and session integration",
      "Testing and proof",
      "Security and permissions",
    ]);
    expect(keywordSystemHints("No matching domain language.")).toEqual([]);
    expect(projectBoardCharterCoverageGaps([])).toEqual([
      "No authoritative spec, architecture, or implementation plan source was included.",
      "No dedicated test/proof artifact was included.",
      "No included source material was available at charter finalization.",
    ]);
    expect(projectBoardCharterCoverageGaps([
      projectBoardSource({ kind: "architecture_artifact" }),
      projectBoardSource({ kind: "test_artifact" }),
    ])).toEqual([]);
  });

  it("normalizes, limits, and truncates project board summary strings", () => {
    expect(truncateForProjectBoardSummary("  Alpha\n\nBeta\tGamma  ", 50)).toBe("Alpha Beta Gamma");
    expect(truncateForProjectBoardSummary("Alpha Beta Gamma", 10)).toBe("Alpha B...");
    expect(uniqueLimitedStrings([" First item ", "first ITEM", "", undefined, "Second\nitem", "Third item"], 2)).toEqual([
      "First item",
      "Second item",
    ]);
  });

  it("formats project board source impact refresh descriptions", () => {
    expect(projectBoardDescriptionWithSourceImpactRefresh("   ", "  Refresh note.  ")).toBe(
      "## Source impact refresh\nRefresh note.",
    );
    expect(projectBoardDescriptionWithSourceImpactRefresh("Build the shell.", "Refresh note.")).toBe(
      "Build the shell.\n\n## Source impact refresh\nRefresh note.",
    );
    expect(
      projectBoardDescriptionWithSourceImpactRefresh(
        "Build the shell.\n\n## Source impact refresh\nOld note.\n\n## Next\nKeep this.",
        "New note.",
      ),
    ).toBe("Build the shell.\n\n## Source impact refresh\nNew note.\n## Next\nKeep this.");
  });

  it("maps existing project board sources back to source input", () => {
    expect(
      projectBoardSourceInputFromExisting(
        projectBoardSource({
          kind: "plan_artifact",
          sourceKey: "source:key",
          contentHash: "hash",
          changeState: "changed",
          title: "Existing Source",
          summary: "Existing summary",
          excerpt: "Excerpt",
          path: "docs/plan.md",
          threadId: "thread-1",
          artifactId: "artifact-1",
          messageId: "message-1",
          byteSize: 0,
          mtime: "2026-01-01T00:01:00.000Z",
          classificationReason: "Reason",
          classifiedBy: "user",
          classificationConfidence: 0,
          authorityRole: "primary",
          includeInSynthesis: false,
          relevance: 75,
        }),
      ),
    ).toEqual({
      kind: "plan_artifact",
      sourceKey: "source:key",
      contentHash: "hash",
      changeState: "changed",
      title: "Existing Source",
      summary: "Existing summary",
      excerpt: "Excerpt",
      path: "docs/plan.md",
      threadId: "thread-1",
      artifactId: "artifact-1",
      messageId: "message-1",
      byteSize: 0,
      mtime: "2026-01-01T00:01:00.000Z",
      classificationReason: "Reason",
      classifiedBy: "user",
      classificationConfidence: 0,
      authorityRole: "primary",
      includeInSynthesis: false,
      relevance: 75,
    });

    expect(
      projectBoardSourceInputFromExisting(
        projectBoardSource({
          sourceKey: "",
          contentHash: "",
          excerpt: "",
          relevance: 25,
        }),
      ),
    ).toEqual({
      kind: "markdown",
      title: "Source",
      summary: "Summary",
      relevance: 25,
    });
  });

  it("reads the first meaningful planner content line", () => {
    expect(firstMeaningfulLine("\n\n# Main Goal\n\nDetails")).toBe("Main Goal");
    expect(firstMeaningfulLine("###   Nested Heading  \nBody")).toBe("Nested Heading");
    expect(firstMeaningfulLine("\n \n")).toBe("");
  });

  it("maps planner verification text into test plan buckets", () => {
    expect(
      plannerVerificationToTestPlan([
        " run unit tests ",
        "Capture a browser screenshot",
        "E2E smoke flow",
        "Review release notes",
        "",
      ]),
    ).toEqual({
      unit: ["run unit tests"],
      integration: ["E2E smoke flow"],
      visual: ["Capture a browser screenshot"],
      manual: ["Review release notes"],
    });

    expect(plannerVerificationToTestPlan([" ", ""])).toEqual({
      unit: [],
      integration: [],
      visual: [],
      manual: ["Review changed behavior against the plan."],
    });
  });

  it("derives project board candidate status from planner plan questions", () => {
    expect(plannerPlanCandidateStatus(plannerPlanArtifact())).toBe("ready_to_create");
    expect(plannerPlanCandidateStatus(plannerPlanArtifact({ openQuestions: ["Which renderer?"] }))).toBe("needs_clarification");
    expect(
      plannerPlanCandidateStatus(
        plannerPlanArtifact({
          openQuestions: [
            "Risk: Minimal — single-file vanilla app with no dependencies.",
            'Open question: Should we add a "Clear" button or a history of past picks? (Out of scope for "simple" but easy to add later)',
          ],
        }),
      ),
    ).toBe("ready_to_create");
    expect(
      plannerPlanCandidateStatus(
        plannerPlanArtifact({
          decisionQuestions: [
            {
              id: "decision-1",
              question: "Which renderer?",
              recommendedOptionId: "react",
              required: true,
              options: [{ id: "react", label: "React", description: "Use React." }],
            },
          ],
        }),
      ),
    ).toBe("needs_clarification");
    expect(plannerPlanClarificationQuestions(plannerPlanArtifact({ openQuestions: [" Which renderer? "] }))).toEqual(["Which renderer?"]);
    expect(
      plannerPlanClarificationDecisions(
        plannerPlanArtifact({
          decisionQuestions: [
            {
              id: "decision-1",
              question: "Which renderer?",
              recommendedOptionId: "react",
              required: true,
              options: [{ id: "react", label: "React", description: "Use React." }],
            },
          ],
        }),
        "2026-01-01T00:00:00.000Z",
      ),
    ).toEqual([
      expect.objectContaining({
        question: "Which renderer?",
        state: "open",
        suggestedAnswer: "React: Use React.",
      }),
    ]);
  });

  it("maps single-card planner plans into project board draft cards", () => {
    expect(
      plannerPlanDraftCards(
        plannerPlanArtifact({
          title: "  ",
          summary: "  ",
          content: "# Durable plan\n\nImplement the first card.",
          verification: ["unit coverage"],
        }),
      ),
    ).toEqual([
      {
        title: "Planner plan",
        description: "Durable plan",
        sourceId: "plan-1",
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: ["Plan goals are implemented and verified."],
        testPlan: { unit: ["unit coverage"], integration: [], visual: [], manual: [] },
      },
    ]);
  });

  it("maps multi-step planner plans into a compact source-backed seed card", () => {
    const cards = plannerPlanDraftCards(
      plannerPlanArtifact({
        id: "artifact-1",
        title: " Dashboard rollout ",
        summary: " Ship the dashboard in slices. ",
        steps: [
          { id: "setup data", title: " Create data model ", detail: "- Persist the model\n- Add tests" },
          { id: "Render UI!", title: " Render dashboard UI ", detail: "Show the shell." },
        ],
        verification: ["integration smoke", "visual screenshot"],
      }),
    );

    expect(cards).toEqual([
      {
        title: "Dashboard rollout",
        description: "Ship the dashboard in slices.",
        sourceId: "artifact-1",
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: ["Create data model", "Render dashboard UI"],
        testPlan: { unit: [], integration: ["integration smoke"], visual: ["visual screenshot"], manual: [] },
      },
    ]);
  });

  it("keeps simple local single-file planner plans compact", () => {
    const artifact = plannerPlanArtifact({
      id: "random-picker-plan",
      title: "Local Random Option Picker",
      summary: "A simple local app where you paste options, click Pick, and see one random choice.",
      content: [
        "Scope Contract",
        "Requested: A simple local app where you paste options, click Pick, and see one random choice.",
        "Constraints: No backend, no auth, no deployment.",
        "Assumed: Single HTML file with inline CSS/JS. Pure HTML + CSS + JS in one file.",
        "Out of scope: History of picks, weighted choices, saving/sharing, deployment/build step.",
      ].join("\n"),
      steps: [
        { id: "textarea", title: "Create textarea for one option per line" },
        { id: "button", title: "Add Pick button" },
        { id: "split", title: "Split textarea by newlines and filter blanks" },
        { id: "pick", title: "Choose one option with Math.random" },
        { id: "display", title: "Display the selected option" },
      ],
      verification: ["Open random-picker/index.html via browser_local_preview."],
    });
    const cards = plannerPlanDraftCards(artifact);

    expect(plannerPlanShouldStayCompact(artifact)).toBe(true);
    expect(cards).toEqual([
      {
        title: "Local Random Option Picker",
        description: "A simple local app where you paste options, click Pick, and see one random choice.",
        sourceId: "random-picker-plan",
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: [
          "Create textarea for one option per line",
          "Add Pick button",
          "Split textarea by newlines and filter blanks",
          "Choose one option with Math.random",
          "Display the selected option",
        ],
        testPlan: { unit: [], integration: [], visual: ["Open random-picker/index.html via browser_local_preview."], manual: [] },
      },
    ]);
  });

  it("namespaces synthesis draft source ids and matching blockers", () => {
    const draft = {
      summary: "Draft",
      goal: "Goal",
      currentState: "Current",
      targetUser: "User",
      qualityBar: "Quality",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: " shell ",
          title: "Shell",
          description: "Build shell.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "controls",
          title: "Controls",
          description: "Build controls.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: ["shell", " unknown "],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "fresh:already",
          title: "Already namespaced",
          description: "Keep existing namespace.",
          candidateStatus: "ready_to_create" as const,
          labels: [],
          blockedBy: ["controls"],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
      ],
    };

    expect(projectBoardSynthesisDraftWithSourceIdNamespace(draft, " ")).toBe(draft);
    expect(projectBoardSynthesisDraftWithSourceIdNamespace(draft, "fresh:")).toMatchObject({
      cards: [
        { sourceId: "fresh:shell", blockedBy: [] },
        { sourceId: "fresh:controls", blockedBy: ["fresh:shell", " unknown "] },
        { sourceId: "fresh:already", blockedBy: ["fresh:controls"] },
      ],
    });
  });

  it("normalizes project board card test plans per bucket", () => {
    expect(
      normalizeProjectBoardCardTestPlan({
        unit: [" unit check ", "unit check"],
        integration: [" integration check "],
        visual: ["  "],
        manual: [" manual check "],
      }),
    ).toEqual({
      unit: ["unit check"],
      integration: ["integration check"],
      visual: [],
      manual: ["manual check"],
    });
  });

  it("counts project board proof expectations across all test-plan buckets", () => {
    expect(
      projectBoardCardProofCount({
        testPlan: {
          unit: ["mapper test", "parser test"],
          integration: ["import/export flow"],
          visual: ["browser screenshot"],
          manual: ["review release notes", "confirm copy"],
        },
      }),
    ).toBe(6);

    expect(projectBoardCardProofCount({ testPlan: { unit: [], integration: [], visual: [], manual: [] } })).toBe(0);
  });

  it("detects project board proof requirements from charter test policy", () => {
    expect(projectBoardTestPolicyRequiresProofSpec({ requireProofSpec: true })).toBe(true);
    expect(projectBoardTestPolicyRequiresProofSpec({ requireProofSpec: false, defaultProof: "Must include visual proof before closing." })).toBe(true);
    expect(projectBoardTestPolicyRequiresProofSpec({ defaultProof: "Needs unit and manual proof." })).toBe(true);
    expect(projectBoardTestPolicyRequiresProofSpec({ defaultProof: "Prefer screenshots where useful." })).toBe(false);
    expect(projectBoardTestPolicyRequiresProofSpec({ defaultProof: ["must include proof"] })).toBe(false);
  });

  it("scopes project board proof task actions to the active run and card", () => {
    const scoped = {
      action: "task_report_proof",
      actionId: "proof-current",
      runId: "run-1",
      taskId: "task-1",
      cardId: "card-1",
      createdAt: "2026-01-01T00:02:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Scoped proof.",
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectStore.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };
    const unrelated = {
      ...scoped,
      actionId: "proof-other",
      runId: "run-2",
      summary: "Other run proof.",
    };

    expect(
      projectBoardProofOfWorkForRun(
        {
          kind: "agent-run",
          taskToolActions: [unrelated, scoped],
          taskActionDiagnostics: { stale: true },
        },
        { id: "run-1", taskId: "task-1" },
        { id: "card-1" },
      ),
    ).toMatchObject({
      kind: "agent-run",
      taskToolActions: [scoped],
      taskActionDiagnostics: {
        actionCount: 1,
        nativeToolActionCount: 1,
        nativeToolUsed: true,
        latestAction: "task_report_proof",
        latestActionId: "proof-current",
      },
    });
  });

  it("drops unscoped project board proof task-action fields when no run actions match", () => {
    expect(
      projectBoardProofOfWorkForRun(
        {
          kind: "agent-run",
          lastAssistantText: "No scoped proof.",
          taskToolActions: [
            {
              action: "task_heartbeat",
              actionId: "heartbeat-other",
              runId: "run-2",
              taskId: "task-1",
              cardId: "card-1",
              createdAt: "2026-01-01T00:01:00.000Z",
              metadata: {},
              summary: "Other run heartbeat.",
              completed: [],
              remaining: ["Continue."],
            },
          ],
          taskActions: [{ action: "task_magic" }],
          modelTaskActions: [{ action: "task_magic" }],
          taskActionDiagnostics: { stale: true },
        },
        { id: "run-1", taskId: "task-1" },
        { id: "card-1" },
      ),
    ).toEqual({
      kind: "agent-run",
      lastAssistantText: "No scoped proof.",
    });

    expect(projectBoardProofOfWorkForRun(undefined, { id: "run-1", taskId: "task-1" })).toBeUndefined();
  });

  it("detects trustworthy task completion only when task_complete proof is valid", () => {
    const completedAction = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: ["Moved helper into mapper module."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(projectBoardHasTrustworthyTaskCompletion(undefined)).toBe(false);
    expect(
      projectBoardHasTrustworthyTaskCompletion({
        taskToolActions: [
          {
            action: "task_report_proof",
            actionId: "proof-current",
            createdAt: "2026-01-01T00:02:00.000Z",
            metadata: {},
            summary: "Proof without completion.",
            commands: ["pnpm test"],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      }),
    ).toBe(false);
    expect(projectBoardHasTrustworthyTaskCompletion({ taskToolActions: [completedAction] })).toBe(true);
    expect(
      projectBoardHasTrustworthyTaskCompletion({
        taskToolActions: [
          {
            ...completedAction,
            actionId: "proof-1",
            summary: "summarize the actual proof collected in this run.",
          },
        ],
      }),
    ).toBe(false);
  });

  it("detects reviewable proof for a project board run", () => {
    const runWithProof = (proofOfWork: Record<string, unknown> | undefined, overrides: Partial<OrchestrationRun> = {}) =>
      ({
        id: "run-1",
        taskId: "task-1",
        proofOfWork,
        error: undefined,
        workspacePath: "/workspace/app",
        ...overrides,
      }) as OrchestrationRun;
    const card = { id: "card-1" } as ProjectBoardCard;
    const scopedCompletion = {
      action: "task_complete",
      actionId: "complete-current",
      runId: "run-1",
      taskId: "task-1",
      cardId: "card-1",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: [],
      remaining: [],
      risks: [],
      commands: [],
      changedFiles: [],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(projectBoardRunHasReviewableProof(runWithProof(undefined), card)).toBe(false);
    expect(projectBoardRunHasReviewableProof(runWithProof({ lastAssistantText: "Proof collected." }), card)).toBe(true);
    expect(projectBoardRunHasReviewableProof(runWithProof({ changedFiles: ["src/main/projectStore/projectStore.ts"] }), card)).toBe(true);
    expect(projectBoardRunHasReviewableProof(runWithProof({ taskToolActions: [scopedCompletion] }), card)).toBe(true);
    expect(
      projectBoardRunHasReviewableProof(
        runWithProof({
          taskToolActions: [{ ...scopedCompletion, actionId: "complete-other", runId: "run-2" }],
        }),
        card,
      ),
    ).toBe(false);
  });

  it("detects terminal blocker details from direct, narrative, error, and proof text sources", () => {
    expect(
      projectBoardTerminalBlockerDetail(
        undefined,
        { blockerQuestion: "Needs an API key for the production smoke endpoint." },
        "",
      ),
    ).toBe("Needs an API key for the production smoke endpoint.");

    expect(
      projectBoardTerminalBlockerDetail(
        undefined,
        {
          lastAssistantText:
            "I finished the local setup.\n- Blocked by missing credential access for the deployment smoke test.\nI can continue afterwards.",
        },
        "",
      ),
    ).toBe("Blocked by missing credential access for the deployment smoke test.");

    expect(
      projectBoardTerminalBlockerDetail(
        "Run stopped while waiting on product decision for the scope split.",
        undefined,
        "",
      ),
    ).toBe("Run stopped while waiting on product decision for the scope split.");

    expect(
      projectBoardTerminalBlockerDetail(
        undefined,
        undefined,
        "Proof is incomplete because the worker cannot continue without user permission.",
      ),
    ).toBe("Proof is incomplete because the worker cannot continue without user permission.");

    expect(projectBoardTerminalBlockerDetail(undefined, { lastAssistantText: "Retryable test failure." }, "")).toBeUndefined();
  });

  it("normalizes unknown project board test plans from untrusted records", () => {
    expect(
      normalizeUnknownProjectBoardTestPlan({
        unit: [" unit check ", "unit check", 42],
        integration: "not an array",
        visual: [" screenshot "],
        manual: [false, " review "],
      }),
    ).toEqual({
      unit: ["unit check", "42"],
      integration: [],
      visual: ["screenshot"],
      manual: ["false", "review"],
    });
  });

  it("normalizes project board proof follow-up suggestions conservatively", () => {
    expect(
      normalizeProjectBoardProofFollowUpSuggestion({
        title: "  Follow up on API edge case  ",
        description: "  Reproduce and fix the edge case.  ",
        acceptanceCriteria: ["  Edge case covered.  ", "Edge case covered.", 42],
        testPlan: {
          unit: [" mapper test "],
          integration: ["  "],
          visual: [" screenshot "],
          manual: [],
        },
        clarificationQuestions: [" Which API version? ", "which api version?", "How should failure be surfaced?"],
        labels: [" Follow-Up ", "follow-up", "API"],
        rationale: "  Pi identified a missing edge case.  ",
      }),
    ).toEqual({
      title: "Follow up on API edge case",
      description: "Reproduce and fix the edge case.",
      acceptanceCriteria: ["Edge case covered.", "42"],
      testPlan: { unit: ["mapper test"], integration: [], visual: ["screenshot"], manual: [] },
      clarificationQuestions: ["Which API version?", "How should failure be surfaced?"],
      labels: ["follow-up", "api"],
      rationale: "Pi identified a missing edge case.",
    });

    expect(normalizeProjectBoardProofFollowUpSuggestion({ labels: ["label-only"], rationale: "No scope." })).toBeUndefined();
    expect(normalizeProjectBoardProofFollowUpSuggestion(null)).toBeUndefined();
  });

  it("normalizes project board run follow-ups conservatively", () => {
    expect(
      normalizeRunFollowUps([
        "  Check empty-state copy  ",
        "",
        {
          title: "  Add retry affordance  ",
          description: "  Let users retry.  ",
          acceptanceCriteria: [" Retry button appears. ", "Retry button appears.", 42],
          testPlan: { unit: [" reducer test "], integration: "ignored", visual: [" screenshot "], manual: [] },
        },
        {
          description: "Missing title should get an index fallback.",
          acceptanceCriteria: [],
        },
        null,
      ]),
    ).toEqual([
      {
        title: "Check empty-state copy",
        description: "Follow-up proposed by a completed project board run.",
        acceptanceCriteria: ["Resolve follow-up: Check empty-state copy"],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Review follow-up scope before ticketization."] },
      },
      {
        title: "Add retry affordance",
        description: "Let users retry.",
        acceptanceCriteria: ["Retry button appears.", "42"],
        testPlan: { unit: ["reducer test"], integration: [], visual: ["screenshot"], manual: [] },
      },
      {
        title: "Run follow-up 4",
        description: "Missing title should get an index fallback.",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Review follow-up scope before ticketization."] },
      },
    ]);

    expect(normalizeRunFollowUps(Array.from({ length: 25 }, (_, index) => `Follow-up ${index}`))).toHaveLength(20);
    expect(normalizeRunFollowUps("not an array")).toEqual([]);
  });

  it("maps project board proof follow-up suggestions to insert options", () => {
    expect(
      projectBoardProofFollowUpOptionsFromSuggestion({
        title: "  Clarify deployment path  ",
        description: "  Ask how deployment should work.  ",
        acceptanceCriteria: [" Deployment path is explicit. "],
        testPlan: { manual: [" User confirms path. "], unit: [], integration: [], visual: [] },
        clarificationQuestions: [" Where should this deploy? "],
        labels: [" Deploy ", "deploy"],
      }),
    ).toEqual({
      title: "Clarify deployment path",
      description: "Ask how deployment should work.",
      acceptanceCriteria: ["Deployment path is explicit."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["User confirms path."] },
      clarificationQuestions: ["Where should this deploy?"],
      labels: ["pi-suggested-follow-up", "deploy"],
    });

    expect(projectBoardProofFollowUpOptionsFromSuggestion(undefined)).toBeUndefined();
    expect(projectBoardProofFollowUpOptionsFromSuggestion({ labels: ["label-only"] })).toBeUndefined();
  });

  it("renders project board card close policy with bounded runtime defaults and overrides", () => {
    expect(projectBoardCardClosePolicyDescription()).toContain("after 6 focus passes or about 20m of worker runtime.");
    expect(
      projectBoardCardClosePolicyDescription({
        maxPassesPerCard: "1",
        maxRuntimeMinutesPerCard: "90",
      }),
    ).toContain("after 1 focus pass or about 1h 30m of worker runtime.");
    expect(
      projectBoardCardClosePolicyDescription({
        maxPassesPerCard: "0",
        maxRuntimeMsPerCard: 45_000,
        maxRuntimeMinutesPerCard: "90",
      }),
    ).toContain("after 6 focus passes or about 45s of worker runtime.");
    expect(projectBoardCardClosePolicyDescription({ maxRuntimeMinutesPerCard: "0.02" })).toContain("about 1s of worker runtime.");
  });

  it("formats split project board card descriptions", () => {
    expect(
      splitProjectBoardCardDescription(
        projectBoardCard({
          title: "Parent card",
          description: " Parent description. ",
        }),
        "Child scope",
      ),
    ).toBe("Parent description.\n\nSplit from: Parent card\n\nScope: Child scope");
    expect(
      splitProjectBoardCardDescription(
        projectBoardCard({
          title: "Parent card",
          description: "   ",
        }),
        "Child scope",
      ),
    ).toBe("Split from: Parent card\n\nScope: Child scope");
  });

  it("renders project board card task descriptions with execution, proof, feedback, and UX mock sections", () => {
    const description = projectBoardCardTaskDescription(
      projectBoardCard({
        description: " Build the shell. ",
        blockedBy: ["card-data-model"],
        acceptanceCriteria: ["Canvas renders."],
        testPlan: { unit: ["unit test"], integration: [], visual: ["screenshot"], manual: ["PM review"] },
        executionSessionPolicy: "fresh_context",
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        runFeedback: [
          {
            id: "feedback-1",
            source: "decision_impact",
            feedback: "Use the approved renderer.",
            decisionQuestion: "Which renderer?",
            decisionAnswer: "React",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      { maxPassesPerCard: 2, maxRuntimeMsPerCard: 45_000 },
    );

    expect(description).toContain("Build the shell.");
    expect(description).toContain("Start from a fresh Pi context for each prepared run of this card.");
    expect(description).toContain("after 2 focus passes or about 45s of worker runtime.");
    expect(description).toContain("UX mock approval artifact requirements:");
    expect(description).toContain("Acceptance criteria:\n- Canvas renders.");
    expect(description).toContain("Dependencies / blockers:\n- card-data-model");
    expect(description).toContain("decision impact (Which renderer? -> React): Use the approved renderer.");
    expect(description).toContain("Proof expectations:");
    expect(description).toContain("- Visual: screenshot");
    expect(description).toContain("Visual proof artifact requirements:");
  });

  it("renders project board dependency execution context for available and pending blockers", () => {
    const description = renderProjectBoardCardDependencyExecutionContext({
      available: [
        {
          ref: "card-data-model",
          title: "Create shared data model",
          cardStatus: "done",
          taskIdentifier: "LOCAL-1",
          taskState: "done",
          latestRunId: "run-1",
          latestRunStatus: "completed",
          workspacePath: "/workspace/dependency",
          branchName: "ambient/LOCAL-1",
          proofSummary: "Data model complete.",
          changedFiles: ["model.mjs"],
          commands: ["node --test model.test.mjs"],
          manualChecks: ["Clean import smoke passed."],
          completed: ["model.mjs exports parseBoard."],
        },
      ],
      pending: ["card-renderer"],
    });

    expect(description).toContain("Dependency execution context:");
    expect(description).toContain("LOCAL-1: Create shared data model (card done, task done, latest run completed); blocker ref: card-data-model");
    expect(description).toContain("Dependency run: run-1");
    expect(description).toContain("Read-only fallback dependency workspace: /workspace/dependency");
    expect(description).toContain("Dependency branch: ambient/LOCAL-1");
    expect(description).toContain("Declared import files: model.mjs");
    expect(description).toContain("Proof commands: node --test model.test.mjs");
    expect(description).toContain("Manual checks: Clean import smoke passed.");
    expect(description).toContain("Completed items: model.mjs exports parseBoard.");
    expect(description).toContain("Proof summary: Data model complete.");
    expect(description).toContain("Still-blocking or unresolved dependencies:\n- card-renderer");
  });

  it("maps project board dependency artifact paths and keys", () => {
    expect(projectBoardResolveInside("/workspace/project", "dist/output.txt")).toBe("/workspace/project/dist/output.txt");
    expect(projectBoardResolveInside("/workspace/project", "dist/../proof/output.txt")).toBe("/workspace/project/proof/output.txt");
    expect(() => projectBoardResolveInside("/workspace/project", "")).toThrow("Deliverable path must be workspace-relative");
    expect(() => projectBoardResolveInside("/workspace/project", "/tmp/output.txt")).toThrow("Deliverable path must be workspace-relative");
    expect(() => projectBoardResolveInside("/workspace/project", "../output.txt")).toThrow("Deliverable path escapes its root");
    expect(
      projectBoardDependencyArtifactKey(
        {
          ref: "card-1",
          title: "Create dependency model",
          taskIdentifier: "Task 01",
          taskId: "task-1",
          changedFiles: [],
          commands: [],
          manualChecks: [],
          completed: [],
        },
        "run-1",
      ),
    ).toBe("Task-01-6394206e2b3b");
    expect(
      projectBoardDependencyArtifactKey(
        {
          ref: "dep/ref",
          title: "!!!",
          changedFiles: [],
          commands: [],
          manualChecks: [],
          completed: [],
        },
        "run-1",
      ),
    ).toBe("dependency-94ed32431c4c");
  });

  it("formats project board dependency artifact prompt sections", () => {
    expect(projectBoardDependencyArtifactPromptSection()).toBe("");
    expect(
      projectBoardDependencyArtifactPromptSection({
        kind: "project_board_dependency_artifact_import_result",
        version: 1,
        boardId: "board-1",
        dependentCardId: "card-dependent",
        dependentTaskId: "task-dependent",
        workspacePath: "/workspace/dependent",
        artifactRoot: "/workspace/dependent/.ambient/dependency-artifacts",
        manifestPath: "/workspace/dependent/.ambient/dependency-artifacts/manifest.json",
        importedAt: "2026-01-01T00:00:00.000Z",
        imports: [
          {
            kind: "project_board_dependency_artifact_import",
            version: 1,
            key: "LOCAL-1-abcd1234",
            boardId: "board-1",
            dependentCardId: "card-dependent",
            dependentTaskId: "task-dependent",
            dependencyRef: "card-model",
            dependencyTitle: "Create data model",
            dependencyCardId: "card-model",
            dependencyTaskId: "task-model",
            dependencyTaskIdentifier: "LOCAL-1",
            dependencyRunId: "run-model",
            sourceWorkspacePath: "/workspace/model",
            importPath: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234",
            filesRoot: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/files",
            manifestPath: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/manifest.json",
            declaredMaterialFiles: [],
            materialFiles: Array.from({ length: 13 }, (_, index) => `file-${index + 1}.txt`),
            skippedFiles: Array.from({ length: 9 }, (_, index) => `missing-${index + 1}.txt`),
            excludedFiles: [],
            changedFiles: [],
            commands: Array.from({ length: 6 }, (_, index) => `command-${index + 1}`),
            manualChecks: [],
            completed: [],
            proofSummary: "Data model exported parseBoard.",
            importedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        pending: Array.from({ length: 9 }, (_, index) => `pending-${index + 1}`),
      }),
    ).toBe(
      [
        "Dependency artifact imports:",
        "- Ambient has staged available dependency artifacts into this run workspace. Prefer these imported files over copying from sibling task workspaces.",
        "- Artifact root: /workspace/dependent/.ambient/dependency-artifacts",
        "- Import manifest: /workspace/dependent/.ambient/dependency-artifacts/manifest.json",
        "Available imported dependency bundles:",
        "- LOCAL-1: Create data model; blocker ref: card-model",
        "  - Files root: /workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/files",
        "  - Bundle manifest: /workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/manifest.json",
        "  - Imported material files: file-1.txt, file-2.txt, file-3.txt, file-4.txt, file-5.txt, file-6.txt, file-7.txt, file-8.txt, file-9.txt, file-10.txt, file-11.txt, file-12.txt",
        "  - Missing or skipped files: missing-1.txt, missing-2.txt, missing-3.txt, missing-4.txt, missing-5.txt, missing-6.txt, missing-7.txt, missing-8.txt",
        "  - Source proof commands: command-1 | command-2 | command-3 | command-4 | command-5",
        "  - Source proof summary: Data model exported parseBoard.",
        "Pending dependency artifact imports:",
        "- pending-1",
        "- pending-2",
        "- pending-3",
        "- pending-4",
        "- pending-5",
        "- pending-6",
        "- pending-7",
        "- pending-8",
      ].join("\n"),
    );
  });

  it("maps project board claim summaries from persisted events", () => {
    const localAgentId = defaultProjectBoardClaimAgentId();
    const claimEvent = (input: {
      id: string;
      kind: ProjectBoardEvent["kind"];
      cardId: string;
      runId: string;
      agentId: string;
      createdAt: string;
      leaseUntil?: string;
      displayName?: string;
      workspaceBranch?: string;
      baseCommit?: string;
    }): ProjectBoardEvent => ({
      id: input.id,
      boardId: "board-claims",
      kind: input.kind,
      title: "Claim event",
      summary: "Claim event summary",
      entityKind: "project_board_card",
      entityId: input.cardId,
      metadata: {
        cardId: input.cardId,
        runId: input.runId,
        agentId: input.agentId,
        ...(input.leaseUntil ? { leaseUntil: input.leaseUntil } : {}),
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.workspaceBranch ? { workspaceBranch: input.workspaceBranch } : {}),
        ...(input.baseCommit ? { baseCommit: input.baseCommit } : {}),
      },
      createdAt: input.createdAt,
    });

    const summary = projectBoardClaimSummaryFromEvents([
      claimEvent({
        id: "event-active",
        kind: "card_claimed",
        cardId: "card-active",
        runId: "run-active",
        agentId: localAgentId,
        createdAt: "2026-01-01T00:00:00.000Z",
        leaseUntil: "2099-01-01T00:15:00.000Z",
        displayName: "Local Ambient",
        workspaceBranch: "codex/card-active",
        baseCommit: "abc1234",
      }),
      claimEvent({
        id: "event-expired-claim",
        kind: "card_claimed",
        cardId: "card-expired",
        runId: "run-expired",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:01:00.000Z",
        leaseUntil: "2099-01-01T00:16:00.000Z",
      }),
      claimEvent({
        id: "event-expired-recorded",
        kind: "card_claim_expired",
        cardId: "card-expired",
        runId: "run-expired",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:02:00.000Z",
      }),
      claimEvent({
        id: "event-conflict-owner",
        kind: "card_claimed",
        cardId: "card-conflict",
        runId: "run-owner",
        agentId: localAgentId,
        createdAt: "2026-01-01T00:03:00.000Z",
        leaseUntil: "2099-01-01T00:18:00.000Z",
      }),
      claimEvent({
        id: "event-conflict",
        kind: "card_claimed",
        cardId: "card-conflict",
        runId: "run-conflict",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:04:00.000Z",
        leaseUntil: "2099-01-01T00:19:00.000Z",
      }),
    ]);

    expect(summary.active.find((claim) => claim.cardId === "card-active")).toMatchObject({
      status: "active",
      cardId: "card-active",
      runId: "run-active",
      agentId: localAgentId,
      eventId: "event-active",
      claimedAt: "2026-01-01T00:00:00.000Z",
      leaseUntil: "2099-01-01T00:15:00.000Z",
      displayName: "Local Ambient",
      workspaceBranch: "codex/card-active",
      baseCommit: "abc1234",
      ownedByLocal: true,
    });
    expect(summary.expired).toEqual([
      expect.objectContaining({
        status: "expired",
        cardId: "card-expired",
        runId: "run-expired",
        eventId: "event-expired-recorded",
        expiredAt: "2026-01-01T00:02:00.000Z",
        expirationRecorded: true,
        ownedByLocal: false,
      }),
    ]);
    expect(summary.conflicts).toEqual([
      expect.objectContaining({
        status: "conflict",
        cardId: "card-conflict",
        runId: "run-conflict",
        agentId: "remote-agent",
        blockedByRunId: "run-owner",
        claimedAt: "2026-01-01T00:04:00.000Z",
        ownedByLocal: false,
      }),
    ]);
  });

  it("overlays project board card claim summaries", () => {
    const activeClaim = {
      status: "active" as const,
      cardId: "card-active",
      runId: "run-active",
      agentId: "agent-active",
      eventId: "event-active",
      claimedAt: "2026-01-01T00:00:00.000Z",
      ownedByLocal: true,
    };
    const expiredClaim = {
      status: "expired" as const,
      cardId: "card-expired",
      runId: "run-expired",
      agentId: "agent-expired",
      eventId: "event-expired",
      claimedAt: "2026-01-01T00:01:00.000Z",
      expiredAt: "2026-01-01T00:02:00.000Z",
      ownedByLocal: false,
    };
    const conflict = {
      status: "conflict" as const,
      cardId: "card-active",
      runId: "run-conflict",
      agentId: "agent-conflict",
      eventId: "event-conflict",
      claimedAt: "2026-01-01T00:03:00.000Z",
      blockedByRunId: "run-active",
      ownedByLocal: false,
    };

    const cards = projectBoardCardsWithClaimSummaries(
      [
        projectBoardCard({ id: "card-active" }),
        projectBoardCard({ id: "card-expired" }),
        projectBoardCard({ id: "card-empty" }),
      ],
      {
        active: [activeClaim],
        expired: [expiredClaim],
        conflicts: [conflict],
      },
    );

    expect(cards[0]).toMatchObject({ id: "card-active", claim: activeClaim, claimConflicts: [conflict] });
    expect(cards[1]).toMatchObject({ id: "card-expired", claim: expiredClaim });
    expect(cards[1].claimConflicts).toBeUndefined();
    expect(cards[2].claim).toBeUndefined();
    expect(cards[2].claimConflicts).toBeUndefined();
  });

  it("maps project board claim-blocked task ids from card rows", () => {
    const remoteActive = {
      status: "active" as const,
      cardId: "card-remote",
      runId: "run-remote",
      agentId: "remote-agent",
      eventId: "event-remote",
      claimedAt: "2026-01-01T00:00:00.000Z",
      ownedByLocal: false,
    };
    const localActive = {
      status: "active" as const,
      cardId: "card-local",
      runId: "run-local",
      agentId: "local-agent",
      eventId: "event-local",
      claimedAt: "2026-01-01T00:01:00.000Z",
      ownedByLocal: true,
    };
    const conflict = {
      status: "conflict" as const,
      cardId: "card-conflict",
      runId: "run-conflict",
      agentId: "other-agent",
      eventId: "event-conflict",
      claimedAt: "2026-01-01T00:02:00.000Z",
      blockedByRunId: "run-owner",
      ownedByLocal: false,
    };

    expect(
      projectBoardClaimBlockedTaskIdsForRows(
        [
          projectBoardCardRow({ id: "card-remote", orchestration_task_id: "task-remote" }),
          projectBoardCardRow({ id: "card-local", orchestration_task_id: "task-local" }),
          projectBoardCardRow({ id: "card-conflict", orchestration_task_id: "task-conflict" }),
          projectBoardCardRow({ id: "card-no-task", orchestration_task_id: null }),
          projectBoardCardRow({ id: "card-expired", orchestration_task_id: "task-expired" }),
        ],
        {
          active: [remoteActive, localActive],
          expired: [
            {
              status: "expired",
              cardId: "card-expired",
              runId: "run-expired",
              agentId: "remote-agent",
              eventId: "event-expired",
              claimedAt: "2026-01-01T00:03:00.000Z",
              expiredAt: "2026-01-01T00:04:00.000Z",
              ownedByLocal: false,
            },
          ],
          conflicts: [conflict],
        },
      ),
    ).toEqual(["task-remote", "task-conflict"]);
  });

  it("identifies synthesis card rows protected from draft replacement", () => {
    const protectedClaimCardIds = new Set(["claimed-card"]);

    expect(projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow(), protectedClaimCardIds)).toBe(false);
    expect(projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ status: "ready" }), protectedClaimCardIds)).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ orchestration_task_id: "task-1" }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ id: "claimed-card" }), protectedClaimCardIds),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ user_touched_fields_json: JSON.stringify(["title", "unsupported"]) }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ user_touched_fields_json: JSON.stringify(["unsupported"]) }),
        protectedClaimCardIds,
      ),
    ).toBe(false);
    for (const candidate_status of ["evidence", "duplicate", "rejected"] as const) {
      expect(projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ candidate_status }), protectedClaimCardIds)).toBe(true);
    }
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ pending_pi_update_json: JSON.stringify({ title: "Updated" }) }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
  });

  it("maps start-fresh synthesis card row snapshots", () => {
    expect(
      projectBoardSynthesisStartFreshCardSnapshot(
        projectBoardCardRow({
          id: "card-start-fresh",
          title: "Build the visible shell",
          source_id: "synthesis:shell",
          status: "in_progress",
          candidate_status: "ready_to_create",
          user_touched_fields_json: JSON.stringify(["title", "bogus", "labels"]),
          orchestration_task_id: "task-1",
          execution_thread_id: "thread-1",
          clarification_questions_json: JSON.stringify(["Which shell?", 42, "Which route?"]),
        }),
      ),
    ).toEqual({
      cardId: "card-start-fresh",
      title: "Build the visible shell",
      sourceId: "synthesis:shell",
      status: "in_progress",
      candidateStatus: "ready_to_create",
      userTouchedFields: ["title", "labels"],
      orchestrationTaskId: "task-1",
      executionThreadId: "thread-1",
      clarificationQuestionCount: 2,
    });

    expect(
      projectBoardSynthesisStartFreshCardSnapshot(
        projectBoardCardRow({
          orchestration_task_id: null,
          execution_thread_id: null,
          user_touched_fields_json: "not json",
          clarification_questions_json: null,
        }),
      ),
    ).toMatchObject({
      userTouchedFields: [],
      clarificationQuestionCount: 0,
    });
  });

  it("normalizes project board card metadata values conservatively", () => {
    expect(normalizeProjectBoardUiMockRole("mock_gate")).toBe("mock_gate");
    expect(normalizeProjectBoardUiMockRole("gated_implementation")).toBe("gated_implementation");
    expect(normalizeProjectBoardUiMockRole("unsupported")).toBeUndefined();
    expect(normalizeProjectBoardCardExecutionSessionPolicy("fresh_context")).toBe("fresh_context");
    expect(normalizeProjectBoardCardExecutionSessionPolicy("reuse_card_session")).toBe("reuse_card_session");
    expect(normalizeProjectBoardCardExecutionSessionPolicy(null)).toBe("reuse_card_session");
    expect(normalizeProjectBoardCardExecutionSessionPolicy("unsupported")).toBe("reuse_card_session");
  });

  it("classifies project board UX mock gates and synthesis approval defaults", () => {
    const baseCard = {
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the shell.",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceRefs: [],
    };

    expect(projectBoardCardIsUxMockGate({ ...baseCard, sourceId: "synthesis:ux-mock-approval" })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, labels: ["ux-mock-approval"] })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, title: "Review UI mock before implementation" })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, uiMockRole: "mock_gate" })).toBe(true);
    expect(projectBoardCardIsUxMockGate(baseCard)).toBe(false);

    expect(projectBoardUxMockGateSatisfied({ status: "done", candidateStatus: "ready_to_create" })).toBe(true);
    expect(projectBoardUxMockGateSatisfied({ status: "draft", candidateStatus: "evidence" })).toBe(true);
    expect(projectBoardUxMockGateSatisfied({ status: "draft", candidateStatus: "ready_to_create" })).toBe(false);

    expect(projectBoardUiMockRoleForSynthesisCard({ ...baseCard, title: "Review UI mock before implementation" })).toBe("mock_gate");
    expect(projectBoardUiMockRoleForSynthesisCard({ ...baseCard, uiMockRole: "gated_implementation" })).toBe("gated_implementation");
    expect(projectBoardUiMockRoleForSynthesisCard(baseCard)).toBeUndefined();

    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, requiresUiMockApproval: false })).toBe(false);
    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, uiMockRole: "gated_implementation" })).toBe(true);
    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, blockedBy: ["synthesis:ux-mock-approval"] })).toBe(true);
  });

  it("matches project board card references by stable ids and aliases", () => {
    const card = projectBoardCard({
      id: "card-123",
      sourceId: "synthesis:source-123",
      orchestrationTaskId: "task-123",
    });

    expect(projectBoardCardMatchesRef(card, " card-123 ")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "synthesis:source-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "task-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "card:card-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "project-board-card:card-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, " ")).toBe(false);
    expect(projectBoardCardMatchesRef(card, "other-card")).toBe(false);
  });

  it("finds closed parent cards for run follow-ups", () => {
    const doneParent = projectBoardCard({ id: "card-done-parent", title: "Done parent", status: "done" });
    const reviewDoneParent = projectBoardCard({
      id: "card-review-parent",
      title: "Review parent",
      proofReview: {
        status: "done",
        summary: "Proof accepted.",
        satisfied: [],
        missing: [],
        followUpCardIds: [],
        runId: "run-1",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const evidenceParent = projectBoardCard({ id: "card-evidence-parent", title: "Evidence parent", candidateStatus: "evidence" });
    const openParent = projectBoardCard({ id: "card-open-parent", title: "Open parent", status: "review" });
    const followUp = projectBoardCard({
      id: "card-follow-up",
      sourceKind: "run_follow_up",
      blockedBy: ["card-open-parent", "card-done-parent"],
    });

    expect(projectBoardClosedParentForRunFollowUp(followUp, [followUp, openParent, doneParent])).toBe(doneParent);
    expect(
      projectBoardClosedParentForRunFollowUp(
        projectBoardCard({ id: "card-proof-follow-up", sourceKind: "run_follow_up", blockedBy: ["card-review-parent"] }),
        [reviewDoneParent],
      ),
    ).toBe(reviewDoneParent);
    expect(
      projectBoardClosedParentForRunFollowUp(
        projectBoardCard({ id: "card-evidence-follow-up", sourceKind: "run_follow_up", blockedBy: ["card-evidence-parent"] }),
        [evidenceParent],
      ),
    ).toBe(evidenceParent);
    const selfFollowUp = projectBoardCard({ id: "self", sourceKind: "run_follow_up", status: "done", blockedBy: ["self"] });
    expect(projectBoardClosedParentForRunFollowUp(projectBoardCard({ sourceKind: "board_synthesis", blockedBy: [doneParent.id] }), [doneParent])).toBeUndefined();
    expect(projectBoardClosedParentForRunFollowUp(selfFollowUp, [selfFollowUp])).toBeUndefined();
    expect(projectBoardClosedParentForRunFollowUp(projectBoardCard({ sourceKind: "run_follow_up", blockedBy: [openParent.id] }), [openParent])).toBeUndefined();
  });

  it("detects project board cards blocked by open or missing UX mock gates", () => {
    const gate = projectBoardCard({
      id: "gate-1",
      sourceId: "synthesis:ux-mock-approval",
      title: "Review UI mock",
      status: "draft",
      candidateStatus: "ready_to_create",
    });
    const implementation = projectBoardCard({
      id: "implementation-1",
      blockedBy: ["card:gate-1"],
      uiMockRole: "gated_implementation",
    });

    expect(projectBoardOpenUxMockGateBlocker(implementation, [gate, implementation])).toBe(gate);
    expect(projectBoardCardBlockedByOpenUxMockGate(implementation, [gate, implementation])).toBe(true);

    const satisfiedGate = projectBoardCard({ ...gate, status: "done" });
    expect(projectBoardOpenUxMockGateBlocker(implementation, [satisfiedGate, implementation])).toBeUndefined();
    expect(projectBoardCardMissingRequiredUxMockGate(implementation, [satisfiedGate, implementation])).toBe(false);
    expect(projectBoardCardBlockedByOpenUxMockGate(implementation, [satisfiedGate, implementation])).toBe(false);

    const missingGate = projectBoardCard({
      id: "implementation-2",
      requiresUiMockApproval: true,
      blockedBy: ["unrelated"],
    });
    expect(projectBoardCardMissingRequiredUxMockGate(missingGate, [missingGate])).toBe(true);
    expect(projectBoardCardBlockedByOpenUxMockGate(missingGate, [missingGate])).toBe(true);
    expect(projectBoardCardMissingRequiredUxMockGate(gate, [gate, missingGate])).toBe(false);
  });

  it("normalizes project board card run feedback conservatively", () => {
    expect(normalizeProjectBoardCardRunFeedbackSource("source_impact")).toBe("source_impact");
    expect(normalizeProjectBoardCardRunFeedbackSource("unsupported")).toBe("manual");

    expect(
      normalizeProjectBoardCardRunFeedback([
        {
          id: " feedback-1 ",
          feedback: "  Review the next run evidence.  ",
          source: "source_impact",
          decisionQuestion: " Which source changed? ",
          decisionAnswer: " README.md ",
          sourceImpactEventId: " event-1 ",
          sourceImpactEventIds: [" event-1 ", "event-2", "event-1", ""],
          sourceIds: [" source-1 ", "source-2", "source-1", ""],
          createdAt: " 2026-01-01T00:00:00.000Z ",
          createdBy: " ambient-desktop ",
        },
        {
          id: "feedback-1",
          feedback: "Duplicate id should be ignored.",
          source: "manual",
          createdAt: "2026-01-01T00:01:00.000Z",
        },
        {
          id: "blank",
          feedback: "   ",
          source: "manual",
          createdAt: "2026-01-01T00:02:00.000Z",
        },
        {
          id: "feedback-2",
          feedback: "Unsupported source falls back.",
          source: "unsupported",
          createdAt: "2026-01-01T00:03:00.000Z",
        },
      ] as never),
    ).toEqual([
      {
        id: "feedback-1",
        feedback: "Review the next run evidence.",
        source: "source_impact",
        decisionQuestion: "Which source changed?",
        decisionAnswer: "README.md",
        sourceImpactEventId: "event-1",
        sourceImpactEventIds: ["event-1", "event-2"],
        sourceIds: ["source-1", "source-2"],
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "ambient-desktop",
      },
      {
        id: "feedback-2",
        feedback: "Unsupported source falls back.",
        source: "manual",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:03:00.000Z",
        createdBy: undefined,
      },
    ]);

    expect(
      normalizeProjectBoardCardRunFeedback(undefined, [
        {
          id: "fallback",
          feedback: "Fallback feedback.",
          source: "manual",
          createdAt: "2026-01-01T00:04:00.000Z",
        },
      ]),
    ).toEqual([
      {
        id: "fallback",
        feedback: "Fallback feedback.",
        source: "manual",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:04:00.000Z",
        createdBy: undefined,
      },
    ]);
  });

  it("keeps the newest run feedback entries when a card exceeds the 20-entry cap", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      id: `feedback-${index + 1}`,
      feedback: `Run feedback entry ${index + 1}.`,
      source: "manual" as const,
      createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    }));

    const normalized = normalizeProjectBoardCardRunFeedback(entries as never);

    expect(normalized).toHaveLength(20);
    // Appends go to the end of the list, so the newest entry must survive the cap.
    expect(normalized[0].id).toBe("feedback-6");
    expect(normalized.at(-1)?.id).toBe("feedback-25");
  });

  it("parses project board card run feedback from JSON", () => {
    expect(
      parseProjectBoardCardRunFeedback(
        JSON.stringify([
          {
            id: "feedback-1",
            feedback: "Follow up on coverage.",
            source: "proof_review",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          { feedback: "Missing source.", createdAt: "2026-01-01T00:01:00.000Z" },
        ]),
      ),
    ).toEqual([
      {
        id: "feedback-1",
        feedback: "Follow up on coverage.",
        source: "proof_review",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: undefined,
      },
    ]);
    expect(parseProjectBoardCardRunFeedback("{}")).toEqual([]);
    expect(parseProjectBoardCardRunFeedback("not json")).toEqual([]);
    expect(parseProjectBoardCardRunFeedback(null)).toEqual([]);
  });

  it("normalizes project board clarification questions by trimming, deduping, and bounding length", () => {
    const longQuestion = `${"Which target should ship first? ".repeat(30)}This part is clipped.`;
    expect(
      normalizeProjectBoardClarificationQuestions(
        [
          "  Should the shell use Three.js or PixiJS?  ",
          "Should shell use Three.js or PixiJS",
          "",
          longQuestion,
          "Is mobile required?",
        ],
        2,
      ),
    ).toEqual(["Should the shell use Three.js or PixiJS?", longQuestion.trim().slice(0, 500)]);
  });

  it("normalizes project board clarification suggestions conservatively", () => {
    expect(
      normalizeProjectBoardClarificationSuggestions([
        {
          question: "  Which renderer should the shell use?  ",
          suggestedAnswer: "  Keep the existing React renderer.  ",
          rationale: "  It keeps the first slice small.  ",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
        {
          question: "Which renderer should the shell use",
          suggestedAnswer: "Use the current renderer and defer alternatives.",
          safeToAccept: true,
          questionKind: "user_preference",
        },
        {
          question: "Which theme is required?",
          suggestedAnswer: "",
        },
      ] as never),
    ).toEqual([
      {
        question: "Which renderer should the shell use",
        suggestedAnswer: "Use the current renderer and defer alternatives.",
        rationale: "Expert suggested answer from Ambient planning.",
        confidence: "low",
        safeToAccept: false,
        questionKind: "user_preference",
      },
    ]);

    expect(
      normalizeProjectBoardClarificationSuggestions(undefined, [
        {
          question: "  Is mobile required?  ",
          suggestedAnswer: "  Not for the first pass.  ",
          questionKind: "external_constraint",
        },
      ] as never),
    ).toEqual([
      {
        question: "Is mobile required?",
        suggestedAnswer: "Not for the first pass.",
        rationale: "Expert suggested answer from Ambient planning.",
        confidence: "low",
        safeToAccept: false,
        questionKind: "external_constraint",
      },
    ]);
  });

  it("parses project board clarification suggestions from JSON", () => {
    expect(
      parseProjectBoardClarificationSuggestions(
        JSON.stringify([
          {
            question: "Should proof be required?",
            suggestedAnswer: "Yes, require proof before Done.",
            rationale: "Matches the strict proof policy.",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
          { question: "Missing answer" },
        ]),
      ),
    ).toEqual([
      {
        question: "Should proof be required?",
        suggestedAnswer: "Yes, require proof before Done.",
        rationale: "Matches the strict proof policy.",
        confidence: "medium",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
    expect(parseProjectBoardClarificationSuggestions("{}")).toEqual([]);
    expect(parseProjectBoardClarificationSuggestions("not json")).toEqual([]);
    expect(parseProjectBoardClarificationSuggestions(null)).toEqual([]);
  });

  it("normalizes project board clarification answers conservatively", () => {
    expect(
      normalizeProjectBoardClarificationAnswers([
        {
          question: " Which renderer should the shell use? ",
          answer: " Use the existing React renderer. ",
          answeredAt: " 2026-01-01T00:00:00.000Z ",
        },
        {
          question: "Which renderer should the shell use",
          answer: "Prefer the existing renderer and defer alternatives.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        {
          question: " ",
          answer: "Dropped.",
          answeredAt: "2026-01-01T00:02:00.000Z",
        },
        {
          question: "Which theme is required?",
          answer: "   ",
          answeredAt: "2026-01-01T00:03:00.000Z",
        },
      ]),
    ).toEqual([
      {
        question: "Which renderer should the shell use?",
        answer: "Prefer the existing renderer and defer alternatives.",
        answeredAt: "2026-01-01T00:01:00.000Z",
      },
    ]);

    expect(
      normalizeProjectBoardClarificationAnswers(undefined, [
        {
          question: " Is mobile required? ",
          answer: " Not for the first pass. ",
          answeredAt: "2026-01-01T00:04:00.000Z",
        },
      ]),
    ).toEqual([
      {
        question: "Is mobile required?",
        answer: "Not for the first pass.",
        answeredAt: "2026-01-01T00:04:00.000Z",
      },
    ]);
  });

  it("finds the changed project board clarification answer", () => {
    const previous: ProjectBoardCardClarificationAnswer[] = [
      {
        question: "Which renderer should the shell use?",
        answer: "Use the existing React renderer.",
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const sameQuestionVariant: ProjectBoardCardClarificationAnswer = {
      question: "Which renderer should shell use",
      answer: "Use the existing React renderer.",
      answeredAt: "2026-01-01T00:00:00.000Z",
    };
    const changedAnswer: ProjectBoardCardClarificationAnswer = {
      ...sameQuestionVariant,
      answer: "Use the existing renderer and defer alternatives.",
    };
    const changedAnsweredAt: ProjectBoardCardClarificationAnswer = {
      ...sameQuestionVariant,
      answeredAt: "2026-01-01T00:05:00.000Z",
    };
    const newQuestion: ProjectBoardCardClarificationAnswer = {
      question: "Is mobile required?",
      answer: "Not for the first pass.",
      answeredAt: "2026-01-01T00:06:00.000Z",
    };

    expect(projectBoardChangedClarificationAnswer(previous, [sameQuestionVariant])).toBeUndefined();
    expect(projectBoardChangedClarificationAnswer(previous, [changedAnswer])).toBe(changedAnswer);
    expect(projectBoardChangedClarificationAnswer(previous, [changedAnsweredAt])).toBe(changedAnsweredAt);
    expect(projectBoardChangedClarificationAnswer(previous, [sameQuestionVariant, newQuestion])).toBe(newQuestion);
  });

  it("formats project board clarification answer sections", () => {
    expect(projectBoardClarificationAnswerSection(" Which renderer should the shell use? ", " Use React. ")).toBe(
      "- Q: Which renderer should the shell use?\n  A: Use React.",
    );
  });

  it("appends project board clarification answers to descriptions idempotently", () => {
    const question = "Which renderer should the shell use?";
    const answer = "Use React.";
    const entry = "- Q: Which renderer should the shell use?\n  A: Use React.";

    expect(projectBoardDescriptionWithClarificationAnswer("", question, answer)).toBe(`## Clarifications\n${entry}`);
    expect(projectBoardDescriptionWithClarificationAnswer("Build the shell.", question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
    expect(projectBoardDescriptionWithClarificationAnswer("Build the shell.\n\n## Clarifications", question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
    expect(projectBoardDescriptionWithClarificationAnswer(`Build the shell.\n\n## Clarifications\n${entry}`, question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
  });

  it("matches project board clarification questions against known variants", () => {
    expect(
      projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", [
        "Which renderer should shell use",
        "Is mobile required?",
      ]),
    ).toBe(true);
    expect(projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", ["Is mobile required?"])).toBe(false);
    expect(projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", [])).toBe(false);
  });

  it("maps project board clarification decision impact events without model calls", () => {
    const impact: ProjectBoardDecisionImpactPreview = {
      visible: true,
      question: "Which renderer should the shell use?",
      answer: "Use the existing React renderer.",
      canonicalKey: "which-renderer-should-the-shell-use",
      answeredCardId: "card-answer",
      affectedCardIds: Array.from({ length: 45 }, (_, index) => `card-${index}`),
      unblockedDraftCount: 2,
      stillBlockedDraftCount: 1,
      duplicateHiddenCount: 3,
      readyFeedbackCount: 4,
      auditOnlyCount: 5,
      targetedRefreshOptional: true,
      modelCallRequired: false,
      headline: "Decision impact",
      detail: "2 draft gates clear and 4 cards need next-run feedback.",
      metrics: [],
      cards: [],
      recommendedActions: ["Create next-run feedback."],
    };

    expect(projectBoardClarificationDecisionImpactEventSummary("Shell card", impact)).toBe(
      "Shell card answered a clarification. 2 draft gates clear and 4 cards need next-run feedback. 0 model calls.",
    );
    expect(projectBoardClarificationDecisionImpactEventSummary("Shell card", { ...impact, visible: false })).toBe(
      "Shell card answered a clarification. No linked card impact; 0 model calls.",
    );
    expect(projectBoardDecisionImpactEventMetadata(impact)).toEqual({
      triggerType: "clarification_answer",
      question: "Which renderer should the shell use?",
      canonicalKey: "which-renderer-should-the-shell-use",
      answeredCardId: "card-answer",
      affectedCardCount: 45,
      affectedCardIds: Array.from({ length: 40 }, (_, index) => `card-${index}`),
      affectedCounts: {
        unblockedDrafts: 2,
        stillBlockedDrafts: 1,
        duplicateVariantsHidden: 3,
        readyFeedback: 4,
        auditOnly: 5,
      },
      targetedRefreshOptional: true,
      modelCallRequired: false,
      recommendedActions: ["Create next-run feedback."],
    });
  });

  it("formats project board decision impact feedback text", () => {
    expect(projectBoardDecisionImpactFeedbackText("Which renderer?", "Use React.")).toBe(
      "Clarification decision impact: Which renderer? Decision answer: Use React.. Apply this PM decision in the next run without rewriting the approved card silently.",
    );

    const longText = projectBoardDecisionImpactFeedbackText("Which renderer?", "Use React. ".repeat(200));
    expect(longText).toHaveLength(1500);
    expect(longText.startsWith("Clarification decision impact: Which renderer? Decision answer: Use React.")).toBe(true);
  });

  it("detects existing project board decision impact feedback by near-duplicate question", () => {
    const card = projectBoardCard({
      runFeedback: [
        {
          id: "feedback-1",
          feedback: "Apply the decision.",
          source: "decision_impact",
          decisionQuestion: "Which renderer should shell use",
          decisionAnswer: " Use React. ",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(projectBoardHasDecisionImpactFeedback(card, "Which renderer should the shell use?", "Use React.")).toBe(true);
    expect(projectBoardHasDecisionImpactFeedback(card, "Which renderer should the shell use?", "Use Vue.")).toBe(false);
    expect(
      projectBoardHasDecisionImpactFeedback(projectBoardCard({ runFeedback: [{ ...card.runFeedback![0], source: "manual" }] }), "Which renderer?", "Use React."),
    ).toBe(false);
  });

  it("detects existing project board source impact feedback", () => {
    const card = projectBoardCard({
      runFeedback: [
        {
          id: "single-event",
          feedback: "Apply source impact.",
          source: "source_impact",
          sourceImpactEventId: "event-1",
          sourceIds: ["source-1"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "multi-event",
          feedback: "Apply more source impact.",
          source: "source_impact",
          sourceImpactEventIds: ["event-2", "event-3"],
          sourceIds: ["source-2"],
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      ],
    });

    expect(projectBoardHasSourceImpactFeedback(card, ["event-1"], [])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, ["event-3"], [])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, [], ["source-2"])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, ["event-missing"], ["source-2"])).toBe(false);
    expect(projectBoardHasSourceImpactFeedback(card, [], ["source-missing"])).toBe(false);
    expect(
      projectBoardHasSourceImpactFeedback(
        projectBoardCard({
          runFeedback: [
            {
              id: "manual",
              feedback: "Manual note.",
              source: "manual",
              sourceImpactEventId: "event-1",
              sourceIds: ["source-1"],
              createdAt: "2026-01-01T00:02:00.000Z",
            },
          ],
        }),
        ["event-1"],
        ["source-1"],
      ),
    ).toBe(false);
  });

  it("builds project board proof revision run feedback", () => {
    const previousReview: ProjectBoardCardProofReview = {
      status: "needs_follow_up",
      summary: "Proof lacked mobile evidence.",
      satisfied: ["Unit tests passed."],
      missing: ["Mobile screenshot", "Manual QA", "Trace", "Accessibility note", "Error capture", "Extra omitted"],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      recommendedAction: "retry",
    };
    const feedback = projectBoardProofRevisionRunFeedback(
      previousReview,
      "Add mobile screenshot proof before closing.",
      "2026-01-01T00:05:00.000Z",
    );

    expect(feedback).toMatchObject({
      id: expect.any(String),
      source: "proof_review",
      decisionQuestion: "Why was this proof sent back for revision?",
      decisionAnswer: "Add mobile screenshot proof before closing.",
      createdAt: "2026-01-01T00:05:00.000Z",
      createdBy: "ambient-desktop",
    });
    expect(feedback?.feedback).toContain("Proof revision requested.");
    expect(feedback?.feedback).toContain("Reviewer note: Add mobile screenshot proof before closing.");
    expect(feedback?.feedback).toContain("Previous proof review: Proof lacked mobile evidence.");
    expect(feedback?.feedback).toContain("Missing evidence: Mobile screenshot; Manual QA; Trace; Accessibility note; Error capture");
    expect(feedback?.feedback).not.toContain("Extra omitted");
    expect(feedback?.feedback).toContain("Previous recommendation: retry");
    expect(projectBoardProofRevisionRunFeedback(undefined, undefined, "2026-01-01T00:00:00.000Z")).toBeUndefined();
  });

  it("builds project board UX mock rejection run feedback", () => {
    const previousReview: ProjectBoardCardProofReview = {
      status: "needs_follow_up",
      summary: "Mock misses narrow viewport.",
      satisfied: [],
      missing: ["Narrow viewport", "Hover state", "Keyboard focus", "Contrast", "Spacing", "Extra omitted"],
      followUpCardIds: [],
      runId: "run-ux",
      reviewedAt: "2026-01-01T00:00:00.000Z",
    };
    const feedback = projectBoardUxMockRejectionRunFeedback(previousReview, undefined, "2026-01-01T00:06:00.000Z");

    expect(feedback).toMatchObject({
      id: expect.any(String),
      source: "proof_review",
      decisionQuestion: "Why was this UX mock rejected?",
      decisionAnswer: "Mock misses narrow viewport.",
      createdAt: "2026-01-01T00:06:00.000Z",
      createdBy: "ambient-desktop",
    });
    expect(feedback.feedback).toContain("UX mock rejected.");
    expect(feedback.feedback).toContain("Previous mock review: Mock misses narrow viewport.");
    expect(feedback.feedback).toContain("Missing or rejected criteria: Narrow viewport; Hover state; Keyboard focus; Contrast; Spacing");
    expect(feedback.feedback).not.toContain("Extra omitted");

    const fallback = projectBoardUxMockRejectionRunFeedback(undefined, undefined, "2026-01-01T00:07:00.000Z");
    expect(fallback).toMatchObject({
      source: "proof_review",
      decisionAnswer: "UX mock rejected by user PM decision.",
      feedback: "UX mock rejected. Keep downstream UI implementation blocked until a revised mock is approved.",
    });
  });

  it("parses project board clarification answers from JSON", () => {
    expect(
      parseProjectBoardClarificationAnswers(
        JSON.stringify([
          {
            question: "Should proof be required?",
            answer: "Yes, require proof before Done.",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
          { question: "Missing answer" },
        ]),
      ),
    ).toEqual([
      {
        question: "Should proof be required?",
        answer: "Yes, require proof before Done.",
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(parseProjectBoardClarificationAnswers("{}")).toEqual([]);
    expect(parseProjectBoardClarificationAnswers("not json")).toEqual([]);
    expect(parseProjectBoardClarificationAnswers(null)).toEqual([]);
  });

  it("normalizes project board clarification decisions conservatively", () => {
    const decisions = normalizeProjectBoardClarificationDecisions([
      {
        id: "decision-1",
        question: " Which renderer should the shell use? ",
        canonicalKey: " renderer shell ",
        source: "card",
        state: "open",
        suggestedAnswer: " Keep React. ",
        rationale: " Preserves the current stack. ",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
        createdAt: " 2026-01-01T00:00:00.000Z ",
        updatedAt: " 2026-01-01T00:01:00.000Z ",
      },
      {
        id: "decision-2",
        question: "Broken answered decision?",
        canonicalKey: "broken answered decision",
        source: "answer_history",
        state: "answered",
      },
    ] as never);

    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual({
      id: "clarification:renderer-shell",
      question: "Which renderer should the shell use?",
      canonicalKey: "renderer shell",
      source: "card",
      state: "open",
      duplicateOf: undefined,
      suggestedAnswer: "Keep React.",
      rationale: "Preserves the current stack.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(decisions[1]).toMatchObject({
      id: "clarification:broken-answered-decision",
      question: "Broken answered decision?",
      source: "answer_history",
      state: "open",
    });
  });

  it("parses project board clarification decisions from JSON with fallback questions", () => {
    expect(
      parseProjectBoardClarificationDecisions(
        JSON.stringify([
          {
            id: "q1",
            question: "Should proof be required?",
            source: "unsupported",
            state: "answered",
            answer: " Yes, require proof before Done. ",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
          { answer: "Missing question" },
        ]),
      ),
    ).toEqual([
      {
        id: "clarification:proof-required",
        question: "Should proof be required?",
        canonicalKey: "proof required",
        source: "card",
        state: "answered",
        answer: "Yes, require proof before Done.",
        answeredAt: "2026-01-01T00:00:00.000Z",
        safeToAccept: false,
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
    expect(
      parseProjectBoardClarificationDecisions(null, {
        clarificationQuestions: [" Is mobile required? "],
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      }),
    ).toMatchObject([
      {
        id: "clarification:mobile-required",
        question: "Is mobile required?",
        state: "open",
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
    expect(parseProjectBoardClarificationDecisions("{}")).toEqual([]);
    expect(parseProjectBoardClarificationDecisions("not json")).toEqual([]);
  });

  it("normalizes project board synthesis clarification fields with answered questions filtered", () => {
    const answeredAt = "2026-01-01T00:00:00.000Z";
    const result = normalizeProjectBoardSynthesisClarificationFields({
      clarificationQuestions: [" Should proof be required? ", "Which renderer should ship first?"],
      clarificationAnswers: [
        {
          question: "Should proof be required?",
          answer: "Yes, require proof before Done.",
          answeredAt,
        },
      ],
      clarificationDecisions: [
        {
          id: "decision-1",
          question: "Which renderer should ship first?",
          canonicalKey: "renderer ship first",
          source: "card",
          state: "open",
          suggestedAnswer: " Use React. ",
          rationale: " Existing stack. ",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ] as never,
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    expect(result.clarificationQuestions).toEqual(["Which renderer should ship first?"]);
    expect(result.clarificationSuggestions).toEqual([
      {
        question: "Which renderer should ship first?",
        suggestedAnswer: "Use React.",
        rationale: "Existing stack.",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
    expect(result.clarificationDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: "Which renderer should ship first?",
          state: "open",
          suggestedAnswer: "Use React.",
        }),
        expect.objectContaining({
          question: "Should proof be required?",
          state: "answered",
          answer: "Yes, require proof before Done.",
        }),
      ]),
    );
  });

  it("derives project board clarification questions and suggestions from open decisions", () => {
    const result = normalizeProjectBoardSynthesisClarificationFields({
      clarificationDecisions: [
        {
          id: "decision-1",
          question: "Should mobile layout ship in the first pass?",
          canonicalKey: "mobile layout ship first pass",
          source: "card",
          state: "open",
          suggestedAnswer: "Defer mobile layout until desktop is stable.",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ] as never,
    });

    expect(result.clarificationQuestions).toEqual(["Should mobile layout ship in the first pass?"]);
    expect(result.clarificationSuggestions).toEqual([
      {
        question: "Should mobile layout ship in the first pass?",
        suggestedAnswer: "Defer mobile layout until desktop is stable.",
        rationale: "Suggested default from the structured clarification decision.",
        confidence: "low",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
  });

  it("filters answered project board clarification questions", () => {
    expect(
      projectBoardUnansweredClarificationQuestions(
        [" Should proof be required? ", "Which renderer should ship first?"],
        [
          {
            question: "Should proof be required?",
            answer: "Yes, require proof before Done.",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ),
    ).toEqual(["Which renderer should ship first?"]);
  });

  it("preserves candidate status when synthesis only reopens answered clarification gates", () => {
    const answeredDecision = {
      id: "clarification:proof-required",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "answer_history",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-01T00:00:00.000Z",
    } as never;
    const openDecision = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
    } as never;

    expect(projectBoardCandidateStatusForSynthesisUpdate("needs_clarification", "ready_to_create", [answeredDecision])).toBe("ready_to_create");
    expect(projectBoardCandidateStatusForSynthesisUpdate("needs_clarification", "ready_to_create", [openDecision])).toBe("needs_clarification");
    expect(projectBoardCandidateStatusForSynthesisUpdate("ready_to_create", "needs_clarification", [])).toBe("ready_to_create");
  });

  it("returns no project board pending Pi update when the synthesis card still matches the row", () => {
    expect(
      projectBoardCardPendingPiUpdateFromSynthesisCard(
        projectBoardCardPendingPiUpdateRow(),
        {
          sourceId: " synthesis:shell ",
          title: " Create shell ",
          description: " Build the shell. ",
          candidateStatus: "ready_to_create",
          priority: 2,
          phase: " Foundation ",
          labels: [" shell "],
          blockedBy: [],
          acceptanceCriteria: [" Canvas renders. "],
          testPlan: { unit: [" unit test "], integration: [], visual: [], manual: [] },
          sourceRefs: [" docs/architecture.md "],
        },
        "2026-01-01T00:02:00.000Z",
      ),
    ).toBeUndefined();
  });

  it("maps changed synthesis cards to project board pending Pi updates", () => {
    const update = projectBoardCardPendingPiUpdateFromSynthesisCard(
      projectBoardCardPendingPiUpdateRow({
        clarification_questions_json: JSON.stringify(["Renderer choice?"]),
        clarification_answers_json: JSON.stringify([
          {
            question: "Renderer choice?",
            answer: "Use React.",
            answeredAt: "2026-01-01T00:00:30.000Z",
          },
        ]),
      }),
      {
        sourceId: " synthesis:shell ",
        title: " Create shell v2 ",
        description: " Build the shell. ",
        candidateStatus: "needs_clarification",
        priority: 2.4,
        phase: " Foundation ",
        labels: [" shell ", "webgl"],
        blockedBy: [],
        acceptanceCriteria: [" Canvas renders. "],
        testPlan: { unit: [" unit test "], integration: [], visual: [], manual: [] },
        sourceRefs: [" docs/architecture.md "],
        clarificationQuestions: ["Renderer choice?"],
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
      },
      "2026-01-01T00:02:00.000Z",
    );

    expect(update).toMatchObject({
      sourceId: "synthesis:shell",
      createdAt: "2026-01-01T00:02:00.000Z",
      title: "Create shell v2",
      description: "Build the shell.",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "Foundation",
      labels: ["shell", "webgl"],
      blockedBy: [],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: [],
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      changedFields: expect.arrayContaining(["title", "labels", "uiMockMetadata"]),
    });
    expect(update?.changedFields).not.toContain("candidateStatus");
    expect(update?.changedFields).not.toContain("clarificationQuestions");
  });

  it("materializes no project board pending Pi update when staged values match the row", () => {
    expect(
      projectBoardMaterialPendingPiUpdateForRow(projectBoardCardPendingPiUpdateRow(), {
        sourceId: "synthesis:shell",
        createdAt: "2026-01-01T00:02:00.000Z",
        changedFields: ["title", "labels"],
        title: " Create shell ",
        labels: [" shell "],
      }),
    ).toBeUndefined();
  });

  it("recomputes project board pending Pi update changed fields against the row", () => {
    expect(
      projectBoardMaterialPendingPiUpdateForRow(projectBoardCardPendingPiUpdateRow(), {
        sourceId: "synthesis:shell",
        createdAt: "2026-01-01T00:02:00.000Z",
        changedFields: ["description"],
        title: " Create shell v2 ",
        labels: ["shell", "webgl"],
      }),
    ).toMatchObject({
      sourceId: "synthesis:shell",
      title: " Create shell v2 ",
      labels: ["shell", "webgl"],
      changedFields: ["title", "labels"],
    });
  });

  it("compares project board clarification decisions using the persisted gate shape", () => {
    const answeredLeft = {
      id: "clarification:proof-required",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "answer_history",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-01T00:00:00.000Z",
      suggestedAnswer: "Maybe.",
      safeToAccept: true,
    } as never;
    const answeredRight = {
      id: "different-id",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "card",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-02T00:00:00.000Z",
      suggestedAnswer: "No.",
      safeToAccept: false,
    } as never;
    const openLeft = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
      suggestedAnswer: "Use React.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
    } as never;
    const openRight = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
      suggestedAnswer: "Use Canvas.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
    } as never;

    expect(projectBoardClarificationDecisionsEquivalent([answeredLeft], [answeredRight])).toBe(true);
    expect(projectBoardClarificationDecisionsEquivalent([openLeft], [openRight])).toBe(false);
  });

  it("normalizes project board objective provenance conservatively", () => {
    expect(
      normalizeProjectBoardObjectiveProvenance({
        objective: "  Ship the checkout flow  ",
        groundingMode: "selected_sources",
        selectedSourceIds: ["source-1", 7, "source-2", "source-1"],
        sourceRefCount: 2.6,
        sourceGap: "  Missing mobile copy source.  ",
      }),
    ).toEqual({
      objective: "Ship the checkout flow",
      groundingMode: "selected_sources",
      selectedSourceIds: ["source-1", "source-2"],
      sourceRefCount: 3,
      weakGrounding: false,
      sourceGap: "Missing mobile copy source.",
    });
    expect(
      normalizeProjectBoardObjectiveProvenance({
        objective: "Fallback grounding",
        groundingMode: "unsupported",
      }),
    ).toMatchObject({
      groundingMode: "objective_only",
      selectedSourceIds: [],
      sourceRefCount: 0,
      weakGrounding: true,
    });
    expect(normalizeProjectBoardObjectiveProvenance({ objective: "   " })).toBeUndefined();
    expect(normalizeProjectBoardObjectiveProvenance(null)).toBeUndefined();
  });

  it("serializes project board objective provenance JSON only when normalized", () => {
    expect(
      JSON.parse(
        objectiveProvenanceJson({
          objective: "  Ship the checkout flow  ",
          groundingMode: "selected_sources",
          selectedSourceIds: ["source-1", "source-1", "source-2"],
          sourceRefCount: 1.4,
        }) ?? "",
      ),
    ).toEqual({
      objective: "Ship the checkout flow",
      groundingMode: "selected_sources",
      selectedSourceIds: ["source-1", "source-2"],
      sourceRefCount: 1,
      weakGrounding: false,
    });
    expect(objectiveProvenanceJson({ objective: "   " })).toBeNull();
  });

  it("normalizes source reference artifact strings from paths, source ids, and ranges", () => {
    const refs = Array.from({ length: 24 }, (_, index) => ({
      sourceId: `source-${index}`,
      path: index % 2 === 0 ? ` docs/source-${index}.md ` : "",
      range: index === 0 ? "L1-L4" : "",
    }));
    expect(sourceRefArtifactStrings([{ sourceId: "source-1" }, { path: " docs/plan.md ", range: "L8" }, { path: "   " }, ...refs])).toEqual([
      "source-1",
      "docs/plan.md#L8",
      "docs/source-0.md#L1-L4",
      "docs/source-2.md",
      "source-3",
      "docs/source-4.md",
      "source-5",
      "docs/source-6.md",
      "source-7",
      "docs/source-8.md",
      "source-9",
      "docs/source-10.md",
      "source-11",
      "docs/source-12.md",
      "source-13",
      "docs/source-14.md",
      "source-15",
      "docs/source-16.md",
      "source-17",
      "docs/source-18.md",
    ]);
  });

  it("normalizes project board synthesis run progressive records conservatively", () => {
    expect(
      normalizeProjectBoardSynthesisRunProgressiveRecord({
        type: " candidate_card ",
        title: "Create shell",
        sourceId: "synthesis:shell",
      }),
    ).toEqual([{ type: "candidate_card", title: "Create shell", sourceId: "synthesis:shell" }]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord({ type: "   " })).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord({ title: "Missing type" })).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord([])).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord(null)).toEqual([]);
  });

  it("normalizes project board synthesis run events conservatively", () => {
    const fallbackCreatedAt = "2026-01-01T00:00:00.000Z";
    expect(
      normalizeProjectBoardSynthesisRunEvent(
        {
          stage: "schema_validation",
          title: "Validated schema",
          summary: "Validated progressive records.",
          metadata: { recordCount: 3 },
          createdAt: "2026-01-01T00:01:00.000Z",
        },
        fallbackCreatedAt,
      ),
    ).toEqual([
      {
        stage: "schema_validation",
        title: "Validated schema",
        summary: "Validated progressive records.",
        metadata: { recordCount: 3 },
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    expect(
      normalizeProjectBoardSynthesisRunEvent(
        {
          stage: "failed",
          title: "Failed",
          metadata: ["not", "an", "object"],
        } as never,
        fallbackCreatedAt,
      ),
    ).toEqual([
      {
        stage: "failed",
        title: "Failed",
        summary: "",
        metadata: {},
        createdAt: fallbackCreatedAt,
      },
    ]);
    expect(normalizeProjectBoardSynthesisRunEvent({ stage: "unsupported", title: "Invalid stage" }, fallbackCreatedAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunEvent({ stage: "failed" }, fallbackCreatedAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunEvent(null, fallbackCreatedAt)).toEqual([]);
  });

  it("maps imported project board event artifact kinds", () => {
    expect(projectBoardEventKindFromArtifact(boardEventArtifact({ type: "run.started", payload: { currentKind: "card_claimed" } }))).toBe(
      "card_claimed",
    );
    expect(projectBoardEventKindFromArtifact(boardEventArtifact({ type: "run.completed", payload: { currentKind: "not-valid" } }))).toBe(
      "card_run_completed",
    );
    expect(projectBoardEventKindFromArtifact(boardEventArtifact({ type: "board.reset" }))).toBe("card_updated");
  });

  it("maps imported project board event artifact titles", () => {
    const longTitle = ` ${"A".repeat(220)} `;
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "run.started", payload: { title: longTitle } }))).toHaveLength(180);
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "run.prepared" }))).toBe("Run prepared");
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "card.heartbeat" }))).toBe("Card claim heartbeat");
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "board.reset" }))).toBe("board.reset");
  });

  it("maps imported project board event artifact summaries", () => {
    expect(
      projectBoardEventSummaryFromArtifact(
        boardEventArtifact({
          type: "run.failed",
          entityId: "run-1",
          payload: { cardId: "card-1", normalizedStatus: "runtime_budget" },
        }),
      ),
    ).toBe("Imported runtime budget run run-1 for card-1.");
    expect(
      projectBoardEventSummaryFromArtifact(
        boardEventArtifact({
          type: "card.claimed",
          entityId: "card-1",
          actor: { kind: "pi-worker", agentId: "agent-1" },
          payload: { leaseUntil: "2026-01-01T00:10:00.000Z" },
        }),
      ),
    ).toBe("Card claim recorded for card-1 by agent-1 until 2026-01-01T00:10:00.000Z.");
    expect(projectBoardEventSummaryFromArtifact(boardEventArtifact({ type: "card.heartbeat", entityId: "card-1" }))).toBe(
      "Claim heartbeat recorded for card-1.",
    );
    expect(projectBoardEventSummaryFromArtifact(boardEventArtifact({ type: "board.reset", payload: { summary: "Reset summary" } }))).toBe(
      "Reset summary",
    );
  });

  it("maps imported project board event artifact metadata", () => {
    expect(projectBoardEventMetadataFromArtifact(boardEventArtifact({ type: "board.synthesized", payload: { metadata: { runId: "run-1" } } }))).toEqual({
      runId: "run-1",
    });
    expect(
      projectBoardEventMetadataFromArtifact(
        boardEventArtifact({
          type: "run.progress",
          actor: { kind: "pi-worker", agentId: "agent-1" },
          payload: { metadata: ["not", "an", "object"], runId: "run-1" },
        }),
      ),
    ).toMatchObject({
      artifactEventType: "run.progress",
      artifactPayload: { metadata: ["not", "an", "object"], runId: "run-1" },
      artifactActor: { kind: "pi-worker", agentId: "agent-1" },
    });
  });

  it("maps applicable project board source classification updates", () => {
    const longReason = ` ${"Reason ".repeat(100)} `;
    const updates = projectBoardSourceClassificationUpdates(
      [
        projectBoardSource({ id: "source-by-key", sourceKey: "source:key", relevance: 72 }),
        projectBoardSource({ id: "source-by-id", sourceKey: "source:id", relevance: 42 }),
        projectBoardSource({ id: "user-source", sourceKey: "source:user", classifiedBy: "user" }),
        projectBoardSource({
          id: "locked-source",
          sourceKey: "source:locked",
          authorityRole: "ignored",
          includeInSynthesis: false,
          classificationReason: GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
        }),
      ],
      [
        {
          sourceKey: "source:key",
          kind: "ignored",
          classificationReason: "   ",
          classificationConfidence: 2,
          authorityRole: "primary",
          includeInSynthesis: true,
          model: "model-a",
        },
        {
          sourceId: "source-by-id",
          kind: "markdown",
          classificationReason: longReason,
          classificationConfidence: -1,
          authorityRole: "ignored",
          includeInSynthesis: true,
        },
        {
          sourceId: "user-source",
          kind: "markdown",
          classificationReason: "Skipped user source.",
          classificationConfidence: 0.8,
          authorityRole: "context",
          includeInSynthesis: true,
        },
        {
          sourceId: "locked-source",
          kind: "markdown",
          classificationReason: "Skipped locked source.",
          classificationConfidence: 0.8,
          authorityRole: "context",
          includeInSynthesis: true,
        },
        {
          sourceId: "missing-source",
          kind: "markdown",
          classificationReason: "Skipped missing source.",
          classificationConfidence: 0.8,
          authorityRole: "context",
          includeInSynthesis: true,
        },
      ],
    );

    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      source: { id: "source-by-key" },
      kind: "ignored",
      relevance: 0,
      confidence: 1,
      authorityRole: "ignored",
      includeInSynthesis: false,
      reason: "Ambient/Pi selected ignored for this project source.",
      model: "model-a",
    });
    expect(updates[1]).toMatchObject({
      source: { id: "source-by-id" },
      kind: "markdown",
      relevance: 42,
      confidence: 0,
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
    expect(updates[1].reason).toHaveLength(500);
    expect(updates[1].reason.startsWith("Reason ")).toBe(true);
  });

  it("detects when previous project board source classifications should be preserved", () => {
    const fallbackSource = projectBoardSource({ classifiedBy: "fallback_heuristic" });
    const userSource = projectBoardSource({ classifiedBy: "user", kind: "thread" });
    const lockedSource = projectBoardSource({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classificationReason: GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
    });
    const nextDurableExcludedSource = projectBoardSource({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classificationReason: DURABLE_PLAN_SOURCE_AUTHORITY_REASON,
    });

    expect(projectBoardSourceShouldPreservePreviousClassification(userSource, "changed")).toBe(true);
    expect(projectBoardSourceShouldPreservePreviousClassification(fallbackSource, "unchanged")).toBe(true);
    expect(projectBoardSourceShouldPreservePreviousClassification(fallbackSource, "changed")).toBe(false);
    expect(projectBoardSourceShouldPreservePreviousClassification(undefined, "unchanged")).toBe(false);
    expect(projectBoardSourceShouldPreservePreviousClassification(lockedSource, "unchanged")).toBe(false);
    expect(projectBoardSourceShouldPreservePreviousClassification(fallbackSource, "unchanged", nextDurableExcludedSource)).toBe(false);
  });

  it("maps user project board source classification updates", () => {
    expect(
      projectBoardSourceUserClassificationUpdate({
        previousKind: "markdown",
        previousRelevance: 64,
        kind: "thread",
      }),
    ).toEqual({
      kind: "thread",
      relevance: 64,
      classifiedBy: "user",
      classificationConfidence: 1,
      classificationReason: "User reclassified source from markdown to thread.",
      authorityRole: "context",
      includeInSynthesis: true,
    });
    expect(
      projectBoardSourceUserClassificationUpdate({
        previousKind: "thread",
        previousRelevance: 42,
        kind: "markdown",
        includeInSynthesis: false,
      }),
    ).toEqual({
      kind: "markdown",
      relevance: 42,
      classifiedBy: "user",
      classificationConfidence: 1,
      classificationReason: "User excluded markdown source from project-board synthesis.",
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
    expect(
      projectBoardSourceUserClassificationUpdate({
        previousKind: "thread",
        previousRelevance: 88,
        kind: "ignored",
        includeInSynthesis: true,
      }),
    ).toEqual({
      kind: "ignored",
      relevance: 0,
      classifiedBy: "user",
      classificationConfidence: 1,
      classificationReason: "User included ignored source for project-board synthesis.",
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
  });

  it("normalizes project board source inputs before persistence", () => {
    const normalized = normalizeProjectBoardSourceInputs([
      {
        kind: "markdown",
        title: "  Source title  ",
        summary: "  Summary  ",
        excerpt: "  Excerpt  ",
        path: " ./docs/Plan.md ",
        relevance: 101.7,
      },
      {
        kind: "markdown",
        title: "   ",
        summary: "Dropped",
        relevance: 50,
      },
      {
        kind: "thread",
        title: "Thread",
        summary: "",
        excerpt: "x".repeat(20_050),
        threadId: "thread-1",
        relevance: -10,
        classificationReason: "User choice",
        classifiedBy: "user",
        classificationConfidence: 0.4,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      title: "Source title",
      summary: "Summary",
      excerpt: "Excerpt",
      path: " ./docs/Plan.md ",
      relevance: 100,
      sourceKey: "file:docs/Plan.md",
      classifiedBy: "fallback_heuristic",
      classificationConfidence: 0.95,
      authorityRole: "context",
      includeInSynthesis: true,
      classificationReason: "Fallback path/content classifier selected markdown: Summary",
    });
    expect(normalized[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized[1]).toMatchObject({
      title: "Thread",
      relevance: 0,
      sourceKey: "thread:thread-1",
      classificationReason: "User choice",
      classifiedBy: "user",
      classificationConfidence: 0.4,
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(normalized[1].excerpt).toHaveLength(20_000);
  });

  it("merges normalized project board source inputs with previous refresh state", () => {
    const previousUserSource = projectBoardSource({
      id: "previous-user",
      kind: "thread",
      sourceKey: "file:docs/spec.md",
      contentHash: "old-hash",
      classifiedBy: "user",
      classificationReason: "User kept this as thread context.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 90,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const previousFallbackSource = projectBoardSource({
      id: "previous-fallback",
      kind: "markdown",
      sourceKey: "file:docs/other.md",
      contentHash: "same-hash",
      classifiedBy: "fallback_heuristic",
      classificationReason: "Previous fallback classification.",
      classificationConfidence: 0.7,
      authorityRole: "supporting",
      includeInSynthesis: true,
      relevance: 40,
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const createdIds = ["new-source-1", "new-source-2"];
    const sources = normalizeProjectBoardSourceInputs([
      {
        kind: "markdown",
        title: "Spec",
        summary: "Updated spec",
        path: "docs/spec.md",
        contentHash: "new-hash",
        relevance: 60,
      },
      {
        kind: "ignored",
        title: "Other",
        summary: "Same other source",
        path: "docs/other.md",
        contentHash: "same-hash",
        relevance: 55,
      },
      {
        kind: "markdown",
        title: "Other duplicate",
        summary: "Duplicate canonical key should not reuse claimed previous source",
        path: "docs/other.md",
        relevance: 70,
      },
    ]);

    const refreshed = projectBoardSourceRefreshSources({
      previousSources: [previousUserSource, previousFallbackSource],
      sources,
      now: "2026-01-03T00:00:00.000Z",
      createId: () => createdIds.shift() ?? "unexpected-id",
    });

    expect(refreshed[0]).toMatchObject({
      id: "previous-user",
      kind: "thread",
      relevance: 60,
      changeState: "changed",
      classifiedBy: "user",
      classificationReason: "User kept this as thread context.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      preservedClassification: true,
    });
    expect(refreshed[1]).toMatchObject({
      id: "previous-fallback",
      kind: "markdown",
      relevance: 55,
      changeState: "unchanged",
      classifiedBy: "fallback_heuristic",
      classificationReason: "Previous fallback classification.",
      classificationConfidence: 0.7,
      authorityRole: "supporting",
      includeInSynthesis: true,
      createdAt: "2026-01-02T00:00:00.000Z",
      preservedClassification: true,
    });
    expect(refreshed[2]).toMatchObject({
      id: "new-source-1",
      kind: "markdown",
      relevance: 70,
      changeState: "new",
      createdAt: "2026-01-03T00:00:00.000Z",
      preservedClassification: false,
    });
  });

  it("maps project board source refresh records to store rows", () => {
    const refreshed = projectBoardSourceRefreshSources({
      previousSources: [],
      sources: normalizeProjectBoardSourceInputs([
        {
          kind: "ignored",
          title: "Generated report",
          summary: "Generated synthesis output",
          excerpt: "   ",
          path: ".ambient/board/reports/report.md",
          relevance: 88,
          classificationReason: "Generated report should stay out of synthesis.",
          byteSize: 1200,
          mtime: "2026-01-03T00:00:00.000Z",
        },
      ]),
      now: "2026-01-03T00:00:00.000Z",
      createId: () => "source-new",
    });
    expect(refreshed).toHaveLength(1);
    const source = refreshed[0]!;

    const row = projectBoardSourceRefreshStoreRow({
      source,
      boardId: "board-1",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });

    expect(row).toMatchObject({
      id: "source-new",
      board_id: "board-1",
      source_kind: "ignored",
      source_key: "file:.ambient/board/reports/report.md",
      change_state: "new",
      title: "Generated report",
      summary: "Generated synthesis output",
      excerpt: null,
      path: ".ambient/board/reports/report.md",
      thread_id: null,
      artifact_id: null,
      message_id: null,
      byte_size: 1200,
      mtime: "2026-01-03T00:00:00.000Z",
      classification_reason: "Generated report should stay out of synthesis.",
      classified_by: "fallback_heuristic",
      authority_role: "ignored",
      include_in_synthesis: 0,
      relevance: 0,
      created_at: "2026-01-03T00:00:00.000Z",
      updated_at: "2026-01-04T00:00:00.000Z",
    });
    expect(row.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mapProjectBoardSourceRow(row)).toMatchObject({
      id: "source-new",
      boardId: "board-1",
      kind: "ignored",
      excerpt: undefined,
      includeInSynthesis: false,
      relevance: 0,
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
  });

  it("counts project board source kinds", () => {
    expect(
      projectBoardSourceKindCounts([
        projectBoardSource({ kind: "markdown" }),
        projectBoardSource({ kind: "thread" }),
        projectBoardSource({ kind: "markdown" }),
      ]),
    ).toEqual({ markdown: 2, thread: 1 });
    expect(projectBoardSourceKindCounts([])).toEqual({});
  });

  it("maps project board source refresh stats", () => {
    expect(
      projectBoardSourceRefreshStats({
        previousSources: [
          projectBoardSource({ sourceKey: "file:kept.md", path: "kept.md" }),
          projectBoardSource({ sourceKey: "file:removed.md", path: "removed.md" }),
          projectBoardSource({ id: "fallback", sourceKey: undefined, path: "fallback.md" }),
        ],
        nextSources: [
          { sourceKey: "file:kept.md", kind: "markdown", changeState: "unchanged", preservedClassification: true },
          { sourceKey: "file:new.md", kind: "thread", changeState: "new" },
          { sourceKey: "file:changed.md", kind: "markdown", changeState: "changed", preservedClassification: true },
        ],
      }),
    ).toEqual({
      sourceKinds: { markdown: 2, thread: 1 },
      sourceChangeStates: { unchanged: 1, new: 1, changed: 1 },
      preservedClassificationCount: 2,
      removedSourceKeys: ["file:removed.md", "file:fallback.md"],
      newCount: 1,
      changedCount: 1,
      unchangedCount: 1,
      removedCount: 2,
    });
  });

  it("maps project board source refresh event metadata", () => {
    const previousSources = Array.from({ length: 22 }, (_, index) =>
      projectBoardSource({ id: `removed-${index}`, sourceKey: `file:removed-${index}.md` }),
    );
    const nextSources = [
      { sourceKey: "file:new.md", kind: "markdown" as const, changeState: "new" as const },
      { sourceKey: "file:changed.md", kind: "thread" as const, changeState: "changed" as const, preservedClassification: true },
    ];
    const stats = projectBoardSourceRefreshStats({ previousSources, nextSources });

    expect(projectBoardSourceRefreshEventMetadata({ previousSources, nextSources, stats })).toEqual({
      previousCount: 22,
      nextCount: 2,
      sourceKinds: { markdown: 1, thread: 1 },
      sourceChangeStates: { new: 1, changed: 1 },
      newCount: 1,
      changedCount: 1,
      unchangedCount: 0,
      removedCount: 22,
      removedSourceKeys: Array.from({ length: 20 }, (_, index) => `file:removed-${index}.md`),
      preservedClassificationCount: 1,
    });
  });

  it("summarizes project board source refresh counts", () => {
    expect(
      projectBoardSourceRefreshSummary({
        nextCount: 5,
        newCount: 2,
        changedCount: 1,
        unchangedCount: 2,
        removedCount: 1,
        preservedClassificationCount: 3,
      }),
    ).toBe("5 project sources scanned: 2 new, 1 changed, 2 unchanged, 1 removed. Preserved 3 existing classifications.");
    expect(
      projectBoardSourceRefreshSummary({
        nextCount: 1,
        newCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        removedCount: 0,
        preservedClassificationCount: 0,
      }),
    ).toBe("1 project source scanned: no source changes.");
  });

  it("maps imported project board execution artifact identity and timing", () => {
    const manifest = runManifestArtifact({ cardId: "card-from-manifest", status: "blocked" });
    const proof = runProofArtifact({ cardId: "card-from-proof" });
    const handoff = runHandoffArtifact({ cardId: "card-from-handoff" });

    expect(projectBoardExecutionArtifactStatus(manifest, proof, handoff)).toBe("blocked");
    expect(projectBoardExecutionArtifactStatus(undefined, proof, handoff)).toBe("completed");
    expect(projectBoardExecutionArtifactStatus(undefined, proof)).toBe("review");
    expect(projectBoardExecutionArtifactStatus()).toBe("prepared");

    expect(projectBoardExecutionArtifactCardId(manifest, proof, handoff)).toBe("card-from-manifest");
    expect(projectBoardExecutionArtifactCardId(undefined, proof, handoff)).toBe("card-from-proof");
    expect(projectBoardExecutionArtifactCardId(undefined, undefined, handoff)).toBe("card-from-handoff");
    expect(projectBoardExecutionArtifactCardId()).toBeUndefined();

    expect(projectBoardExecutionArtifactStartedAt(manifest, proof, handoff)).toBe("2026-01-01T00:00:00.000Z");
    expect(projectBoardExecutionArtifactStartedAt(undefined, proof, handoff)).toBe("2026-01-01T00:02:00.000Z");
    expect(projectBoardExecutionArtifactStartedAt(undefined, undefined, handoff)).toBe("2026-01-01T00:03:00.000Z");

    expect(projectBoardExecutionArtifactUpdatedAt(manifest, proof, handoff)).toBe("2026-01-01T00:01:00.000Z");
    expect(projectBoardExecutionArtifactUpdatedAt(undefined, proof, handoff)).toBe("2026-01-01T00:03:00.000Z");
    expect(projectBoardExecutionArtifactUpdatedAt(undefined, proof)).toBe("2026-01-01T00:02:00.000Z");
  });

  it("maps imported project board execution proof and handoff artifact payloads", () => {
    expect(projectBoardExecutionArtifactProofFromArtifact(runProofArtifact())).toEqual({
      summary: "Proof summary",
      commands: ["pnpm test"],
      changedFiles: ["src/main/example.ts"],
      screenshots: ["screenshots/proof.png"],
      browserTraces: ["traces/proof.zip"],
      visualChecks: [{ name: "canvas", status: "passed" }],
      manualChecks: ["Reviewed proof"],
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    expect(projectBoardExecutionArtifactHandoffFromArtifact(runHandoffArtifact())).toEqual({
      summary: "Handoff summary",
      completed: ["Done"],
      remaining: ["Later"],
      risks: ["Risk"],
      followUps: [{ title: "Follow up", reason: "Needs polish", blockedBy: ["card-manifest"] }],
      createdAt: "2026-01-01T00:03:00.000Z",
    });
  });

  it("maps imported project board proposal run manifest stages", () => {
    expect(projectBoardRunStageFromManifest({ status: "failed", stage: "source_scan" } as ProposalManifestArtifact)).toBe("failed");
    expect(projectBoardRunStageFromManifest({ status: "abandoned", stage: "planning" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStageFromManifest({ status: "paused", stage: "source_scan" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "source_scan" } as ProposalManifestArtifact)).toBe("source_scan");
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "source_classification" } as ProposalManifestArtifact)).toBe(
      "source_classification",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "importing" } as ProposalManifestArtifact)).toBe(
      "schema_validation",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "completed" } as ProposalManifestArtifact)).toBe(
      "proposal_created",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "planning" } as ProposalManifestArtifact)).toBe(
      "model_request",
    );
  });

  it("maps imported project board progress stages", () => {
    expect(projectBoardRunStageFromArtifactProgress(" source_scan ")).toBe("source_scan");
    expect(projectBoardRunStageFromArtifactProgress("sources_persisted")).toBe("sources_persisted");
    expect(projectBoardRunStageFromArtifactProgress("source_classification")).toBe("source_classification");
    expect(projectBoardRunStageFromArtifactProgress("deterministic_baseline")).toBe("deterministic_baseline");
    expect(projectBoardRunStageFromArtifactProgress("model_request")).toBe("model_request");
    expect(projectBoardRunStageFromArtifactProgress("model_response")).toBe("model_response");
    expect(projectBoardRunStageFromArtifactProgress("importing")).toBe("schema_validation");
    expect(projectBoardRunStageFromArtifactProgress("board_applied")).toBe("board_applied");
    expect(projectBoardRunStageFromArtifactProgress("completed")).toBe("proposal_created");
    expect(projectBoardRunStageFromArtifactProgress("planning_paused")).toBe("paused");
    expect(projectBoardRunStageFromArtifactProgress("failed")).toBe("failed");
    expect(projectBoardRunStageFromArtifactProgress("unknown-stage")).toBe("model_response");
  });

  it("maps imported project board proposal run manifest statuses", () => {
    expect(projectBoardRunStatusFromProposalManifest({ status: "abandoned" } as ProposalManifestArtifact)).toBe("abandoned");
    expect(projectBoardRunStatusFromProposalManifest({ status: "pause_requested" } as ProposalManifestArtifact)).toBe("pause_requested");
    expect(projectBoardRunStatusFromProposalManifest({ status: "paused" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStatusFromProposalManifest({ status: "failed" } as ProposalManifestArtifact)).toBe("failed");
    expect(projectBoardRunStatusFromProposalManifest({ status: "running" } as ProposalManifestArtifact)).toBe("running");
    expect(projectBoardRunStatusFromProposalManifest({ status: "succeeded" } as ProposalManifestArtifact)).toBe("succeeded");
  });

  it("normalizes project board synthesis proposal answers conservatively", () => {
    const fallbackAnsweredAt = "2026-01-01T00:00:00.000Z";
    expect(
      normalizeProjectBoardSynthesisProposalAnswer(
        {
          questionIndex: 1,
          question: "Which renderer should the shell use?",
          answer: "Use the existing React renderer.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        fallbackAnsweredAt,
      ),
    ).toEqual([
      {
        questionIndex: 1,
        question: "Which renderer should the shell use?",
        answer: "Use the existing React renderer.",
        answeredAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    expect(
      normalizeProjectBoardSynthesisProposalAnswer(
        {
          questionIndex: 0,
          answer: "Use the default.",
        },
        fallbackAnsweredAt,
      ),
    ).toEqual([{ questionIndex: 0, question: "", answer: "Use the default.", answeredAt: fallbackAnsweredAt }]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: -1, answer: "Nope" }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: 1.5, answer: "Nope" }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer({ questionIndex: 1, answer: "   " }, fallbackAnsweredAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisProposalAnswer(null, fallbackAnsweredAt)).toEqual([]);
  });

  it("normalizes project board synthesis proposal cards conservatively", () => {
    expect(
      normalizeProjectBoardSynthesisProposalCard({
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Build the first shell.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Foundation",
        labels: ["webgl", 7, "shell"],
        blockedBy: ["synthesis:setup", null],
        acceptanceCriteria: ["Canvas renders.", 42],
        testPlan: { unit: [" test helper ", "test helper"], integration: [], visual: [" screenshot "], manual: [] },
        sourceRefs: ["docs/architecture.md", false],
        clarificationQuestions: ["Renderer choice?", undefined],
        clarificationSuggestions: [
          {
            question: " Renderer choice? ",
            suggestedAnswer: " Use the existing renderer. ",
            rationale: " Keeps scope small. ",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
        ],
        objectiveProvenance: {
          objective: "  Ship the render shell.  ",
          groundingMode: "source_scan",
          sourceRefCount: 1,
        },
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        reviewStatus: "accepted",
        reviewReason: "Reviewed.",
        mergeTargetCardId: "card-1",
        reviewedAt: "2026-01-01T00:01:00.000Z",
      } as never),
    ).toEqual({
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the first shell.",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "Foundation",
      labels: ["webgl", "shell"],
      blockedBy: ["synthesis:setup"],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["test helper"], integration: [], visual: ["screenshot"], manual: [] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Renderer choice?"],
      clarificationSuggestions: [
        {
          question: "Renderer choice?",
          suggestedAnswer: "Use the existing renderer.",
          rationale: "Keeps scope small.",
          confidence: "medium",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
      objectiveProvenance: {
        objective: "Ship the render shell.",
        groundingMode: "source_scan",
        selectedSourceIds: [],
        sourceRefCount: 1,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      reviewStatus: "accepted",
      reviewReason: "Reviewed.",
      mergeTargetCardId: "card-1",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    });

    expect(
      normalizeProjectBoardSynthesisProposalCard({
        reviewStatus: "unsupported",
        reviewReason: "   ",
        mergeTargetCardId: "   ",
        reviewedAt: "   ",
      } as never),
    ).toEqual({
      sourceId: "",
      title: "",
      description: "",
      candidateStatus: "needs_clarification",
      priority: undefined,
      phase: undefined,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceRefs: [],
      clarificationQuestions: [],
      clarificationSuggestions: [],
      objectiveProvenance: undefined,
      uiMockRole: undefined,
      requiresUiMockApproval: false,
      reviewStatus: "pending",
      reviewReason: undefined,
      mergeTargetCardId: undefined,
      reviewedAt: undefined,
    });
  });

  it("maps project board synthesis proposal card review statuses", () => {
    expect(projectBoardSynthesisProposalCardReviewStatus("accepted")).toBe("accepted");
    expect(projectBoardSynthesisProposalCardReviewStatus("merged")).toBe("merged");
    expect(projectBoardSynthesisProposalCardReviewStatus("unsupported")).toBeUndefined();
    expect(projectBoardSynthesisProposalCardReviewStatus(undefined)).toBeUndefined();
  });

  it("detects project board run statuses that can copy sessions", () => {
    expect(projectBoardRunStatusCanCopySession("completed")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("failed")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("canceled")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("stalled")).toBe(true);
    expect(projectBoardRunStatusCanCopySession("running")).toBe(false);
    expect(projectBoardRunStatusCanCopySession("paused")).toBe(false);
  });

  it("keeps project board synthesis proposal reviews only while card content still matches", () => {
    const accepted = {
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the first shell.",
      candidateStatus: "ready_to_create" as const,
      priority: 2,
      phase: "Foundation",
      labels: ["webgl", "shell"],
      blockedBy: ["synthesis:setup"],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["unit test"], integration: ["integration test"], visual: ["screenshot"], manual: ["review"] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Renderer choice?"],
      clarificationSuggestions: [
        {
          question: "Renderer choice?",
          suggestedAnswer: "Use the existing renderer.",
          rationale: "Keeps scope small.",
          confidence: "medium" as const,
          safeToAccept: true,
          questionKind: "expert_default" as const,
        },
      ],
      objectiveProvenance: {
        objective: "Ship the render shell.",
        groundingMode: "source_scan" as const,
        selectedSourceIds: [],
        sourceRefCount: 1,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate" as const,
      requiresUiMockApproval: true,
      reviewStatus: "accepted" as const,
      reviewReason: "Reviewed.",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    };

    expect(projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, reviewStatus: "pending" })).toBe(true);
    expect(projectBoardSynthesisProposalCardReviewStillApplies({ ...accepted, reviewStatus: "pending" }, accepted)).toBe(false);
    expect(projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, labels: ["shell", "webgl"] })).toBe(false);
    expect(projectBoardSynthesisProposalCardReviewStillApplies(accepted, { ...accepted, testPlan: { ...accepted.testPlan, visual: [] } })).toBe(false);
    expect(
      projectBoardSynthesisProposalCardReviewStillApplies(accepted, {
        ...accepted,
        objectiveProvenance: { ...accepted.objectiveProvenance, sourceRefCount: 2 },
      }),
    ).toBe(false);
  });

  it("maps project board synthesis draft cards into pending proposal cards", () => {
    const cards = projectBoardSynthesisProposalCardsFromDraft({
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "   ",
          title: "Skipped",
          description: "Blank source id.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: "synthesis:blank-title",
          title: "  ",
          description: "Blank title.",
          candidateStatus: "ready_to_create",
          labels: [],
          blockedBy: [],
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
          sourceRefs: [],
        },
        {
          sourceId: " synthesis:shell ",
          title: " Create shell ",
          description: " Build the first shell. ",
          candidateStatus: "ready_to_create",
          priority: 1.6,
          phase: " Foundation ",
          labels: [" shell ", "shell", "webgl"],
          blockedBy: [" synthesis:setup ", "synthesis:setup"],
          acceptanceCriteria: [" Canvas renders. ", "Canvas renders."],
          testPlan: { unit: [" unit test "], integration: [], visual: [" screenshot "], manual: [] },
          sourceRefs: [" docs/architecture.md "],
          clarificationQuestions: [" Renderer choice? "],
          clarificationSuggestions: [
            {
              question: " Renderer choice? ",
              suggestedAnswer: " Use the existing renderer. ",
              rationale: " Keeps scope small. ",
              confidence: "medium",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
          objectiveProvenance: {
            objective: " Build the shell. ",
            groundingMode: "source_scan",
            selectedSourceIds: [],
            sourceRefCount: 1,
            weakGrounding: false,
          },
          uiMockRole: "mock_gate",
          requiresUiMockApproval: true,
        },
      ],
    });

    expect(cards).toEqual([
      {
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Build the first shell.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Foundation",
        labels: ["shell", "webgl"],
        blockedBy: ["synthesis:setup"],
        acceptanceCriteria: ["Canvas renders."],
        testPlan: { unit: ["unit test"], integration: [], visual: ["screenshot"], manual: [] },
        sourceRefs: ["docs/architecture.md"],
        clarificationQuestions: ["Renderer choice?"],
        clarificationSuggestions: [
          {
            question: "Renderer choice?",
            suggestedAnswer: "Use the existing renderer.",
            rationale: "Keeps scope small.",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
        ],
        objectiveProvenance: {
          objective: "Build the shell.",
          groundingMode: "source_scan",
          selectedSourceIds: [],
          sourceRefCount: 1,
          weakGrounding: false,
        },
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        reviewStatus: "pending",
      },
    ]);
  });

  it("preserves project board synthesis proposal card reviews when draft content still matches", () => {
    const draft = {
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create" as const,
          priority: 2,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
        },
      ],
    };
    const [existing] = projectBoardSynthesisProposalCardsFromDraft(draft);
    const reviewed = {
      ...existing,
      reviewStatus: "accepted" as const,
      reviewReason: "Looks good.",
      mergeTargetCardId: "card-existing",
      reviewedAt: "2026-01-01T00:01:00.000Z",
    };

    expect(projectBoardSynthesisProposalCardsFromDraft(draft, [reviewed])[0]).toEqual(reviewed);
  });

  it("resets project board synthesis proposal card reviews when draft content changes", () => {
    const draft = {
      summary: "Build the shell.",
      goal: "Ship it.",
      currentState: "Nothing exists.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create" as const,
          priority: 2,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders."],
          testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
        },
      ],
    };
    const [existing] = projectBoardSynthesisProposalCardsFromDraft(draft);
    const reviewed = { ...existing, reviewStatus: "accepted" as const, reviewedAt: "2026-01-01T00:01:00.000Z" };
    const changedDraft = { ...draft, cards: [{ ...draft.cards[0], labels: ["shell", "changed"] }] };

    const [next] = projectBoardSynthesisProposalCardsFromDraft(changedDraft, [reviewed]);

    expect(next).toMatchObject({
      sourceId: "synthesis:shell",
      labels: ["shell", "changed"],
      reviewStatus: "pending",
    });
    expect(next.reviewedAt).toBeUndefined();
  });

  it("maps project board summary rows with preloaded related data", () => {
    const charter: ProjectBoardCharter = {
      id: "charter-1",
      boardId: "board-1",
      version: 1,
      status: "active",
      goal: "Ship the shell.",
      currentState: "Prototype exists.",
      targetUser: "Operators",
      nonGoals: [],
      qualityBar: "Reliable.",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Charter",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    };
    const claim = {
      status: "active" as const,
      cardId: "card-1",
      runId: "run-1",
      agentId: "agent-1",
      eventId: "event-1",
      claimedAt: "2026-01-01T00:02:00.000Z",
      ownedByLocal: false,
    };
    const card = projectBoardCard({ claim });
    const source = projectBoardSource({ id: "source-1" });
    const question = projectBoardQuestion({ id: "question-1" });
    const event: ProjectBoardEvent = {
      id: "event-1",
      boardId: "board-1",
      kind: "board_created",
      title: "Board created",
      summary: "Created.",
      metadata: {},
      createdAt: "2026-01-01T00:02:00.000Z",
    };

    expect(
      mapProjectBoardRow({
        row: projectBoardRow({ charter_id: "charter-1", active_draft_id: "draft-1" }),
        charter,
        cards: [card],
        sources: [source],
        questions: [question],
        proposals: [],
        synthesisRuns: [],
        executionArtifacts: [],
        events: [event],
        claims: { active: [claim], expired: [], conflicts: [] },
      }),
    ).toEqual({
      id: "board-1",
      projectPath: "/workspace/project",
      status: "active",
      title: "Project Board",
      summary: "Board summary",
      charterId: "charter-1",
      charter,
      activeDraftId: "draft-1",
      cards: [card],
      sources: [source],
      questions: [question],
      proposals: [],
      synthesisRuns: [],
      executionArtifacts: [],
      events: [event],
      claims: { active: [claim], expired: [], conflicts: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
  });

  it("maps project board card rows with linked task projection and persisted metadata", () => {
    const mapped = mapProjectBoardCardRow(
      projectBoardCardRow({
        id: "card-row-7",
        status: "ready",
        priority: 3,
        phase: "Implementation",
        labels_json: JSON.stringify(["shell", "ui"]),
        blocked_by_json: JSON.stringify(["LOCAL-1"]),
        acceptance_criteria_json: JSON.stringify(["Canvas renders.", "Shell opens."]),
        test_plan_json: JSON.stringify({ unit: ["mapper unit"], integration: ["store integration"], visual: [], manual: ["review"] }),
        source_refs_json: JSON.stringify(["docs/plan.md"]),
        clarification_questions_json: JSON.stringify(["Which shell?"]),
        clarification_answers_json: JSON.stringify([{ question: "Which shell?", answer: "Desktop.", answeredAt: "2026-01-01T00:02:00.000Z" }]),
        run_feedback_json: JSON.stringify([{ feedback: "Carry source context forward.", source: "source_impact" }]),
        objective_provenance_json: JSON.stringify({
          objective: "Ship the shell.",
          groundingMode: "selected_sources",
          selectedSourceIds: [" source-1 ", "source-2"],
          sourceRefCount: 2,
        }),
        ui_mock_role: "mock_gate",
        requires_ui_mock_approval: 1,
        source_thread_id: "thread-1",
        source_message_id: "message-1",
        orchestration_task_id: "task-linked",
        execution_thread_id: "exec-thread-1",
        execution_session_policy: "fresh_context",
        proof_review_json: JSON.stringify({
          status: "ready_for_review",
          summary: "Ready for review.",
          satisfied: ["Unit proof."],
          missing: [],
          followUpCardIds: [],
          runId: "run-1",
          reviewedAt: "2026-01-01T00:04:00.000Z",
        }),
        split_outcome_json: JSON.stringify({
          status: "proposed",
          source: "manual",
          sourceRunId: "run-1",
          reason: "Split follow-up.",
          partialProofSummary: "Some work done.",
          completedCriteria: ["Unit proof."],
          remainingCriteria: ["Visual proof."],
          childCardIds: ["child-1"],
          createdAt: "2026-01-01T00:05:00.000Z",
          updatedAt: "2026-01-01T00:06:00.000Z",
        }),
        user_touched_fields_json: JSON.stringify(["title", "labels", "unsupported"]),
        user_touched_at: "2026-01-01T00:07:00.000Z",
        pending_pi_update_json: JSON.stringify({
          sourceId: "synthesis:shell",
          createdAt: "2026-01-01T00:08:00.000Z",
          changedFields: ["title"],
          title: "Create shell v2",
        }),
      }),
      [orchestrationTask({ id: "task-linked", state: "needs review" })],
    );

    expect(mapped).toMatchObject({
      id: "card-row-7",
      boardId: "board-1",
      status: "review",
      priority: 3,
      phase: "Implementation",
      labels: ["shell", "ui"],
      blockedBy: ["LOCAL-1"],
      acceptanceCriteria: ["Canvas renders.", "Shell opens."],
      testPlan: { unit: ["mapper unit"], integration: ["store integration"], visual: [], manual: ["review"] },
      sourceRefs: ["docs/plan.md"],
      clarificationQuestions: ["Which shell?"],
      runFeedback: [{ feedback: "Carry source context forward.", source: "source_impact" }],
      objectiveProvenance: {
        objective: "Ship the shell.",
        groundingMode: "selected_sources",
        selectedSourceIds: ["source-1", "source-2"],
        sourceRefCount: 2,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      sourceThreadId: "thread-1",
      sourceMessageId: "message-1",
      orchestrationTaskId: "task-linked",
      executionThreadId: "exec-thread-1",
      executionSessionPolicy: "fresh_context",
      proofReview: {
        status: "ready_for_review",
        summary: "Ready for review.",
      },
      splitOutcome: {
        status: "proposed",
        source: "manual",
        childCardIds: ["child-1"],
      },
      userTouchedFields: ["title", "labels"],
      userTouchedAt: "2026-01-01T00:07:00.000Z",
      pendingPiUpdate: {
        sourceId: "synthesis:shell",
        title: "Create shell v2",
        changedFields: ["title"],
      },
    });
  });

  it("maps project board synthesis proposal rows with normalized answers, cards, and review reports", () => {
    const proposal = mapProjectBoardSynthesisProposalRow({
      id: "proposal-1",
      board_id: "board-1",
      status: "pending",
      summary: "Review the plan.",
      goal: "Ship the shell.",
      current_state: "Empty app.",
      target_user: "Operators",
      quality_bar: "Works end to end.",
      assumptions_json: JSON.stringify([" Existing renderer ", 42, "Small first slice"]),
      questions_json: JSON.stringify(["Which renderer?"]),
      answers_json: JSON.stringify([
        { questionIndex: 0, question: "Which renderer?", answer: "Use React." },
        { questionIndex: -1, answer: "Dropped." },
      ]),
      source_notes_json: JSON.stringify(["README.md"]),
      cards_json: JSON.stringify([
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create",
          labels: ["shell", 7],
          testPlan: { unit: ["mapper parity"], integration: [], visual: [], manual: [] },
          reviewStatus: "accepted",
        },
      ]),
      review_report_json: JSON.stringify({
        readiness: "ready_for_card_generation",
        summary: "Ready to turn into cards.",
        sourceConfidence: "high",
        sourceConfidenceNotes: ["Sources agree."],
        gitState: "git_ready",
        gitStateNotes: ["Branch is clean."],
        blockingQuestions: [],
        risks: ["Keep the slice small."],
        sourceConflicts: [],
        sourceAuthorityNotes: [],
        recommendedActivationScope: "Create the initial shell card.",
        cardGenerationConstraints: ["Avoid cleanup."],
      }),
      model: "test-model",
      duration_ms: 1234,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      applied_at: null,
    });

    expect(proposal).toMatchObject({
      id: "proposal-1",
      boardId: "board-1",
      status: "pending",
      summary: "Review the plan.",
      goal: "Ship the shell.",
      currentState: "Empty app.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [" Existing renderer ", "Small first slice"],
      questions: ["Which renderer?"],
      answers: [{ questionIndex: 0, question: "Which renderer?", answer: "Use React.", answeredAt: "2026-01-01T00:01:00.000Z" }],
      sourceNotes: ["README.md"],
      cards: [
        expect.objectContaining({
          sourceId: "synthesis:shell",
          title: "Create shell",
          labels: ["shell"],
          testPlan: { unit: ["mapper parity"], integration: [], visual: [], manual: [] },
          reviewStatus: "accepted",
        }),
      ],
      reviewReport: {
        readiness: "ready_for_card_generation",
        summary: "Ready to turn into cards.",
        sourceConfidence: "high",
        sourceConfidenceNotes: ["Sources agree."],
        gitState: "git_ready",
        gitStateNotes: ["Branch is clean."],
        blockingQuestions: [],
        risks: ["Keep the slice small."],
        sourceConflicts: [],
        sourceAuthorityNotes: [],
        recommendedActivationScope: "Create the initial shell card.",
        cardGenerationConstraints: ["Avoid cleanup."],
      },
      model: "test-model",
      durationMs: 1234,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      appliedAt: undefined,
    });
  });

  it("maps project board synthesis proposal rows with empty collections when JSON is invalid", () => {
    const proposal = mapProjectBoardSynthesisProposalRow({
      id: "proposal-2",
      board_id: "board-1",
      status: "superseded",
      summary: "",
      goal: "",
      current_state: "",
      target_user: "",
      quality_bar: "",
      assumptions_json: "not json",
      questions_json: "not json",
      answers_json: "not json",
      source_notes_json: "not json",
      cards_json: "not json",
      review_report_json: "{}",
      model: null,
      duration_ms: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      applied_at: null,
    });

    expect(proposal).toEqual({
      id: "proposal-2",
      boardId: "board-1",
      status: "superseded",
      summary: "",
      goal: "",
      currentState: "",
      targetUser: "",
      qualityBar: "",
      assumptions: [],
      questions: [],
      answers: [],
      sourceNotes: [],
      cards: [],
      reviewReport: undefined,
      model: undefined,
      durationMs: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      appliedAt: undefined,
    });
  });

  it("dedupes project board synthesis run progressive records by serialized record identity", () => {
    const candidate = { type: "candidate_card", sourceId: "synthesis:shell", title: "Create shell" };
    const sameValuesDifferentOrder = { title: "Create shell", sourceId: "synthesis:shell", type: "candidate_card" };
    expect(dedupeProjectBoardSynthesisRunProgressiveRecords([candidate, candidate, sameValuesDifferentOrder] as never)).toEqual([
      candidate,
      sameValuesDifferentOrder,
    ]);
  });

  it("summarizes project board synthesis run progressive records with rendered-card ledger details", () => {
    const summary = summarizeProjectBoardSynthesisRunProgressiveRecords([
      {
        type: "candidate_card",
        sourceId: "synthesis:shell",
        title: " Create shell ",
        candidateStatus: "ready_to_create",
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-1" }],
      },
      {
        type: "question",
        questionId: "question:shell",
        question: " Which renderer should the shell use? ",
      },
      { type: "proposal_final" },
      { type: "source_coverage", sourceId: "source-1", status: "covered" },
      { type: "dependency_edge", fromCardId: "synthesis:shell", toCardId: "synthesis:api" },
      { type: "warning", code: "section_batch_card_limit", message: " Too many cards. " },
      { type: "error", code: "section_semantic_idle_timeout", message: " Section stalled. " },
      { type: "progress", metadata: { sectionStatus: "succeeded", sectionHeading: "Auth" } },
      { type: "progress", metadata: { sectionStatus: "failed", sectionHeading: "Billing" } },
      { type: "progress", metadata: { sectionStatus: "skipped", sectionHeading: "Reports" } },
    ] as never);

    expect(summary).toMatchObject({
      recordCount: 10,
      candidateCardCount: 1,
      questionCount: 1,
      proposalFinalCount: 1,
      sourceCoverageCount: 1,
      dependencyEdgeCount: 1,
      warningCount: 1,
      errorCount: 1,
      semanticIdleSectionCount: 1,
      sectionSucceededCount: 1,
      sectionFailedCount: 1,
      sectionSkippedCount: 1,
      latestCandidateCardTitle: "Create shell",
      latestQuestion: "Which renderer should the shell use?",
      latestWarning: "Too many cards.",
      latestError: "Section stalled.",
      latestSectionHeading: "Reports",
      renderedCardCount: 1,
      renderedCardBlockedCount: 0,
      renderedCardDuplicateCount: 0,
      renderedCardRejectedCount: 0,
      renderedCardEvidenceCount: 0,
      renderedCardSplitLineageCount: 0,
      renderedCardInvalidatedCount: 0,
      renderedCardLedgerChecksum: expect.stringMatching(/^rendered-card-ledger-/),
      renderedCardLedger: [
        expect.objectContaining({
          cardId: "synthesis:shell",
          title: "Create shell",
          candidateStatus: "ready_to_create",
          renderFingerprint: expect.stringMatching(/^rendered-card-/),
        }),
      ],
    });
  });

  it("maps project board synthesis run rows with normalized records, snapshots, and events", () => {
    const run = mapProjectBoardSynthesisRunRow({
      id: "run-1",
      board_id: "board-1",
      proposal_id: "proposal-1",
      retry_of_run_id: "run-0",
      status: "succeeded",
      stage: "schema_validation",
      model: "test-model",
      source_count: 3,
      included_source_count: 2,
      source_char_count: 1234,
      prompt_char_count: 200,
      response_char_count: 300,
      card_count: 4,
      question_count: 1,
      warning_count: 1,
      error: null,
      events_json: JSON.stringify([
        {
          stage: "schema_validation",
          title: "Validated schema",
          summary: "Validated records.",
          metadata: { cardCount: 4 },
          createdAt: "2026-01-01T00:02:00.000Z",
        },
        { stage: "unsupported", title: "Dropped" },
      ]),
      progressive_records_json: JSON.stringify([
        { type: "question", question: "Clarify scope?" },
        { type: "warning", message: "Needs review." },
        { type: " " },
      ]),
      planning_snapshots_json: JSON.stringify([
        {
          id: "snapshot-1",
          boardId: "board-1",
          runId: "run-1",
          kind: "final",
          planningStage: "schema_validation",
          planningStatus: "succeeded",
          createdAt: "",
          sourceHashes: [{ sourceId: "source-1", kind: "markdown", path: "README.md" }],
          cardIds: ["card-1"],
          cards: [
            {
              cardId: "card-1",
              sourceId: "synthesis:shell",
              sourceKind: "board_synthesis",
              title: "Create shell",
              status: "draft",
              candidateStatus: "ready_to_create",
              renderFingerprint: "rendered-card-1",
            },
          ],
          cardCount: 1,
          readyCandidateCount: 1,
          ticketizedCount: 0,
        },
      ]),
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:03:00.000Z",
      completed_at: "2026-01-01T00:04:00.000Z",
    });

    expect(run).toMatchObject({
      id: "run-1",
      boardId: "board-1",
      proposalId: "proposal-1",
      retryOfRunId: "run-0",
      status: "succeeded",
      stage: "schema_validation",
      model: "test-model",
      sourceCount: 3,
      includedSourceCount: 2,
      sourceCharCount: 1234,
      promptCharCount: 200,
      responseCharCount: 300,
      cardCount: 4,
      questionCount: 1,
      warningCount: 1,
      progressiveRecordCount: 2,
      progressiveSummary: {
        recordCount: 2,
        questionCount: 1,
        warningCount: 1,
        latestQuestion: "Clarify scope?",
        latestWarning: "Needs review.",
      },
      events: [
        {
          stage: "schema_validation",
          title: "Validated schema",
          summary: "Validated records.",
          metadata: { cardCount: 4 },
          createdAt: "2026-01-01T00:02:00.000Z",
        },
      ],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:03:00.000Z",
      completedAt: "2026-01-01T00:04:00.000Z",
    });
    expect(run.progressiveRecords).toEqual([
      { type: "question", question: "Clarify scope?" },
      { type: "warning", message: "Needs review." },
    ]);
    expect(run.planningSnapshots).toEqual([
      expect.objectContaining({
        id: "snapshot-1",
        boardId: "board-1",
        runId: "run-1",
        kind: "final",
        planningStatus: "succeeded",
        planningStage: "schema_validation",
        createdAt: "2026-01-01T00:03:00.000Z",
        cardIds: ["card-1"],
        cards: [expect.objectContaining({ cardId: "card-1", sourceId: "synthesis:shell", renderFingerprint: "rendered-card-1" })],
      }),
    ]);
  });

  it("maps project board synthesis run rows with empty optional collections when JSON is invalid", () => {
    const run = mapProjectBoardSynthesisRunRow({
      id: "run-2",
      board_id: "board-1",
      proposal_id: null,
      retry_of_run_id: null,
      status: "running",
      stage: "model_request",
      model: null,
      source_count: 0,
      included_source_count: 0,
      source_char_count: 0,
      prompt_char_count: null,
      response_char_count: null,
      card_count: null,
      question_count: null,
      warning_count: 0,
      error: null,
      events_json: "not json",
      progressive_records_json: "not json",
      planning_snapshots_json: null,
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: null,
    });

    expect(run).toEqual({
      id: "run-2",
      boardId: "board-1",
      proposalId: undefined,
      retryOfRunId: undefined,
      status: "running",
      stage: "model_request",
      model: undefined,
      sourceCount: 0,
      includedSourceCount: 0,
      sourceCharCount: 0,
      promptCharCount: undefined,
      responseCharCount: undefined,
      cardCount: undefined,
      questionCount: undefined,
      warningCount: 0,
      error: undefined,
      events: [],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      completedAt: undefined,
    });
  });

  it("normalizes project board planning snapshots conservatively", () => {
    const fallbackCreatedAt = "2026-01-01T00:00:00.000Z";
    const sourceHashes = [
      {
        sourceId: "source-1",
        kind: "implementation_file",
        sourceKey: "source-key-1",
        path: "src/App.tsx",
        contentHash: "hash-1",
        changeState: "changed",
        includeInSynthesis: true,
      },
    ];
    const cards = [
      {
        cardId: "card-1",
        sourceId: "source-1",
        sourceKind: "manual",
        title: "Create shell",
        status: "blocked",
        candidateStatus: "ready_to_create",
        sourceRefs: ["source-1"],
        blockedBy: ["card-0"],
        renderFingerprint: "card-fingerprint-1",
        orchestrationTaskId: "task-1",
      },
    ];

    expect(
      normalizeProjectBoardPlanningSnapshot(
        {
          id: " snapshot-1 ",
          boardId: " board-1 ",
          runId: " run-1 ",
          kind: "final",
          planningStatus: "unsupported",
          planningStage: "schema_validation",
          createdAt: "  ",
          cardCount: 2.6,
          readyCandidateCount: -2,
          ticketizedCount: Number.NaN,
          sourceHashes: [
            {
              sourceId: " source-1 ",
              kind: "implementation_file",
              sourceKey: " source-key-1 ",
              path: " src/App.tsx ",
              contentHash: " hash-1 ",
              changeState: "changed",
              includeInSynthesis: true,
            },
            { sourceId: "", kind: "markdown" },
            { sourceId: "source-2", kind: "unsupported" },
          ],
          cardIds: [" card-1 ", "", 42],
          cards: [
            {
              cardId: " card-1 ",
              sourceId: " source-1 ",
              sourceKind: "manual",
              title: "Create shell",
              status: "blocked",
              candidateStatus: "ready_to_create",
              sourceRefs: ["source-1", 42],
              blockedBy: ["card-0", null],
              renderFingerprint: " card-fingerprint-1 ",
              orchestrationTaskId: " task-1 ",
            },
            { cardId: "card-2", sourceId: "source-1", renderFingerprint: "  " },
          ],
          renderFingerprint: "",
        } as never,
        fallbackCreatedAt,
      ),
    ).toEqual([
      {
        id: "snapshot-1",
        boardId: "board-1",
        runId: "run-1",
        kind: "final",
        planningStatus: "running",
        planningStage: "schema_validation",
        createdAt: fallbackCreatedAt,
        cardCount: 3,
        readyCandidateCount: 0,
        ticketizedCount: 0,
        sourceHashes,
        cardIds: [" card-1 "],
        cards,
        renderFingerprint: projectBoardPlanningStableHash("planning-snapshot", { sourceHashes, cards }),
      },
    ]);

    expect(normalizeProjectBoardPlanningSnapshot({ id: "   " } as never, fallbackCreatedAt)).toEqual([]);
    expect(
      normalizeProjectBoardPlanningSnapshot(
        {
          id: "snapshot-2",
          boardId: "board-1",
          runId: "run-1",
          kind: "final",
          planningStatus: "running",
          planningStage: "unsupported",
        } as never,
        fallbackCreatedAt,
      ),
    ).toEqual([]);
  });

  it("serializes project board planning hash inputs stably", () => {
    expect(projectBoardPlanningStableJson({ b: 2, a: [{ z: true, y: null }] })).toBe('{"a":[{"y":null,"z":true}],"b":2}');
    expect(projectBoardPlanningStableHash("prefix", { b: 2, a: 1 })).toBe(projectBoardPlanningStableHash("prefix", { a: 1, b: 2 }));
  });

  it("parses persisted string lists conservatively", () => {
    expect(parseProjectBoardStringList(JSON.stringify(["a", 1, "b"]))).toEqual(["a", "b"]);
    expect(parseProjectBoardStringList(JSON.stringify({ a: "b" }))).toEqual([]);
    expect(parseProjectBoardStringList("not json")).toEqual([]);
    expect(parseProjectBoardStringList(null)).toEqual([]);
  });

  it("filters touched fields to supported project board card fields", () => {
    expect(
      parseProjectBoardCardTouchedFields(
        JSON.stringify(["candidateStatus", "dependencies", "clarificationDecisions", "uiMockMetadata", "bogus"]),
      ),
    ).toEqual(["candidateStatus", "dependencies", "clarificationDecisions", "uiMockMetadata"]);
  });

  it("maps project board card split outcomes conservatively", () => {
    expect(
      mapProjectBoardCardSplitOutcome(
        JSON.stringify({
          status: "approved",
          source: "unsupported",
          sourceRunId: "run-1",
          reason: "Split is ready.",
          partialProofSummary: "Parent proof is partial.",
          completedCriteria: ["Shell exists.", 42],
          remainingCriteria: ["Wire visual state."],
          childCardIds: ["card-2", null, "card-3"],
          maxRuntimeMs: 120000,
          elapsedMs: Number.NaN,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:01:00.000Z",
        }),
      ),
    ).toEqual({
      status: "approved",
      source: "manual",
      sourceRunId: "run-1",
      reason: "Split is ready.",
      partialProofSummary: "Parent proof is partial.",
      completedCriteria: ["Shell exists."],
      remainingCriteria: ["Wire visual state."],
      childCardIds: ["card-2", "card-3"],
      maxRuntimeMs: 120000,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(mapProjectBoardCardSplitOutcome(JSON.stringify({ status: "unsupported" }))).toBeUndefined();
    expect(mapProjectBoardCardSplitOutcome("not json")).toBeUndefined();
  });

  it("maps project board card proof reviews conservatively", () => {
    const rawFollowUpSuggestion = {
      title: "Capture visual proof",
      labels: ["proof"],
    };
    const mapped = mapProjectBoardCardProofReview(
      JSON.stringify({
        status: "needs_follow_up",
        summary: "More proof is needed.",
        satisfied: ["Unit proof recorded.", 7],
        missing: ["Visual proof missing.", null],
        followUpCardIds: ["card-2", false, "card-3"],
        runId: "run-1",
        reviewedAt: "2026-01-01T00:02:00.000Z",
        reviewer: "ambient_pi",
        model: "gmi-test-model",
        confidence: 0.82,
        evidenceQuality: "mixed",
        recommendedAction: "follow_up",
        deterministicStatus: "ready_for_review",
        deterministicSummary: "Deterministic checks need visual proof.",
        judgeDurationMs: 1200,
        followUpSuggestion: rawFollowUpSuggestion,
      }),
      (value) =>
        value && typeof value === "object" && !Array.isArray(value) && (value as { title?: unknown }).title === rawFollowUpSuggestion.title
          ? { title: "Capture visual proof", labels: ["proof"] }
          : undefined,
    );

    expect(mapped).toEqual({
      status: "needs_follow_up",
      summary: "More proof is needed.",
      satisfied: ["Unit proof recorded."],
      missing: ["Visual proof missing."],
      followUpCardIds: ["card-2", "card-3"],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:02:00.000Z",
      reviewer: "ambient_pi",
      model: "gmi-test-model",
      confidence: 0.82,
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
      deterministicStatus: "ready_for_review",
      deterministicSummary: "Deterministic checks need visual proof.",
      judgeDurationMs: 1200,
      followUpSuggestion: { title: "Capture visual proof", labels: ["proof"] },
    });
    expect(mapProjectBoardCardProofReview(JSON.stringify({ status: "unsupported" }))).toBeUndefined();
    expect(mapProjectBoardCardProofReview("not json")).toBeUndefined();
  });

  it("identifies stale project board proof review application blockers", () => {
    const proofReviewJson = (runId: string) =>
      JSON.stringify({
        status: "done",
        summary: "Proof accepted.",
        satisfied: [],
        missing: [],
        followUpCardIds: [],
        runId,
        reviewedAt: "2026-01-01T00:00:00.000Z",
      });

    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-newer",
        runId: "run-1",
        proofReviewJson: proofReviewJson("run-1"),
        requireCurrentReview: false,
      }),
    ).toBe("newer_run_started");
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: null,
        requireCurrentReview: false,
      }),
    ).toBeUndefined();
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: null,
        requireCurrentReview: true,
      }),
    ).toBe("proof_review_cleared");
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: proofReviewJson("run-1"),
        requireCurrentReview: true,
      }),
    ).toBeUndefined();
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: proofReviewJson("run-old"),
        requireCurrentReview: true,
      }),
    ).toBe("proof_review_superseded");
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: "not json",
        requireCurrentReview: true,
      }),
    ).toBe("proof_review_superseded");
  });

  it("detects closed done card rows from status and proof review", () => {
    expect(projectBoardCardRowIsClosedDone({ status: "done", proof_review_json: null })).toBe(true);
    expect(
      projectBoardCardRowIsClosedDone({
        status: "review",
        proof_review_json: JSON.stringify({
          status: "done",
          summary: "Proof is complete.",
          satisfied: ["All proof recorded."],
          missing: [],
          reviewedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    ).toBe(true);
    expect(
      projectBoardCardRowIsClosedDone({
        status: "review",
        proof_review_json: JSON.stringify({
          status: "needs_follow_up",
          summary: "More proof is needed.",
          satisfied: [],
          missing: ["Visual proof missing."],
          reviewedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    ).toBe(false);
    expect(projectBoardCardRowIsClosedDone({ status: "review", proof_review_json: null })).toBe(false);
    expect(projectBoardCardRowIsClosedDone({ status: "review", proof_review_json: "not json" })).toBe(false);
  });

  it("parses persisted card test plans with the same conservative defaults", () => {
    expect(
      parseProjectBoardCardTestPlan(
        JSON.stringify({
          unit: [" unit ", 1, "unit"],
          integration: [" integration "],
          visual: "not-array",
          manual: [" manual "],
        }),
      ),
    ).toEqual({
      unit: ["unit"],
      integration: ["integration"],
      visual: [],
      manual: ["manual"],
    });
    expect(parseProjectBoardCardTestPlan("not json")).toEqual({ unit: [], integration: [], visual: [], manual: [] });
    expect(parseProjectBoardCardTestPlan(null)).toEqual({ unit: [], integration: [], visual: [], manual: [] });
  });

  it("maps project board execution artifact rows with JSON object fallbacks", () => {
    expect(
      mapProjectBoardExecutionArtifactRow({
        id: "artifact-1",
        board_id: "board-1",
        card_id: "card-1",
        status: "completed",
        source: "unexpected",
        agent_id: "agent-1",
        pi_session_id: null,
        workspace_branch: "feature/one",
        started_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:01:00.000Z",
        completed_at: null,
        proof_json: JSON.stringify({
          summary: "Proof passed.",
          commands: ["pnpm test"],
          changedFiles: ["src/app.ts"],
          screenshots: [],
          browserTraces: [],
          visualChecks: [],
          manualChecks: [],
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
        handoff_json: "not json",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      id: "artifact-1",
      boardId: "board-1",
      cardId: "card-1",
      status: "completed",
      source: "git",
      agentId: "agent-1",
      workspaceBranch: "feature/one",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      proof: {
        summary: "Proof passed.",
        commands: ["pnpm test"],
        changedFiles: ["src/app.ts"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        createdAt: "2026-01-01T00:01:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("maps project board source rows and derives a source key when missing", () => {
    const mapped = mapProjectBoardSourceRow({
      id: "source-1",
      board_id: "board-1",
      source_kind: "markdown",
      source_key: null,
      content_hash: "hash-1",
      change_state: "changed",
      title: "Spec",
      summary: "Source summary.",
      excerpt: null,
      path: "docs/spec.md",
      thread_id: null,
      artifact_id: null,
      message_id: null,
      byte_size: 123,
      mtime: null,
      classification_reason: "Useful source.",
      classified_by: "user",
      classification_confidence: 0.9,
      authority_role: "primary",
      include_in_synthesis: 1,
      relevance: 7,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
    });

    expect(mapped).toMatchObject({
      id: "source-1",
      boardId: "board-1",
      kind: "markdown",
      contentHash: "hash-1",
      changeState: "changed",
      title: "Spec",
      path: "docs/spec.md",
      byteSize: 123,
      classificationReason: "Useful source.",
      classifiedBy: "user",
      classificationConfidence: 0.9,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 7,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(mapped.sourceKey).toEqual(expect.any(String));
    expect(mapped.sourceKey?.length).toBeGreaterThan(0);
  });

  it("maps project board event rows with conservative metadata parsing", () => {
    expect(
      mapProjectBoardEventRow({
        id: "event-1",
        board_id: "board-1",
        event_kind: "card_updated",
        title: "Card updated",
        summary: "A card changed.",
        entity_kind: null,
        entity_id: "card-1",
        metadata_json: "not json",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      id: "event-1",
      boardId: "board-1",
      kind: "card_updated",
      title: "Card updated",
      summary: "A card changed.",
      entityId: "card-1",
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("maps project board charter rows with conservative JSON policy parsing", () => {
    expect(
      mapProjectBoardCharterRow({
        id: "charter-1",
        board_id: "board-1",
        version: 2,
        status: "active",
        goal: "Ship the project.",
        current_state: "Draft exists.",
        target_user: "Operators",
        non_goals_json: JSON.stringify(["Rewrite everything", 42, "Skip proof"]),
        quality_bar: "High confidence proof.",
        test_policy_json: JSON.stringify({ unit: true }),
        decision_policy_json: "not json",
        dependency_policy_json: JSON.stringify(["not-object"]),
        budget_policy_json: JSON.stringify({ maxPassesPerCard: 3 }),
        source_policy_json: JSON.stringify({ includeMarkdown: true }),
        markdown: "# Charter",
        project_summary_json: JSON.stringify({
          summary: "Project summary.",
          majorSystems: ["board"],
          sourceCoverage: [],
          risks: [],
          dependencyHints: [],
          unresolvedDecisions: [],
          citations: [],
          coverageGaps: [],
          sourceChecksumSet: ["source-1:hash"],
          charterAnswerChecksum: "checksum",
          generatedAt: "2026-01-01T00:00:00.000Z",
          generator: "fallback_heuristic",
        }),
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:01:00.000Z",
      }),
    ).toEqual({
      id: "charter-1",
      boardId: "board-1",
      version: 2,
      status: "active",
      goal: "Ship the project.",
      currentState: "Draft exists.",
      targetUser: "Operators",
      nonGoals: ["Rewrite everything", "Skip proof"],
      qualityBar: "High confidence proof.",
      testPolicy: { unit: true },
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: { maxPassesPerCard: 3 },
      sourcePolicy: { includeMarkdown: true },
      markdown: "# Charter",
      projectSummary: {
        summary: "Project summary.",
        majorSystems: ["board"],
        sourceCoverage: [],
        risks: [],
        dependencyHints: [],
        unresolvedDecisions: [],
        citations: [],
        coverageGaps: [],
        sourceChecksumSet: ["source-1:hash"],
        charterAnswerChecksum: "checksum",
        generatedAt: "2026-01-01T00:00:00.000Z",
        generator: "fallback_heuristic",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
  });

  it("maps project board question rows and flags stale suggestions from source context", () => {
    const sources = [
      mapProjectBoardSourceRow({
        id: "source-1",
        board_id: "board-1",
        source_kind: "markdown",
        source_key: "file:docs/spec.md",
        content_hash: null,
        change_state: null,
        title: "Spec",
        summary: "Current product spec.",
        excerpt: null,
        path: "docs/spec.md",
        thread_id: null,
        artifact_id: null,
        message_id: null,
        byte_size: null,
        mtime: null,
        classification_reason: null,
        classified_by: null,
        classification_confidence: null,
        authority_role: "primary",
        include_in_synthesis: 1,
        relevance: 10,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:01:00.000Z",
      }),
    ];
    const question = "What proof is required?";
    const contextFingerprint = projectBoardKickoffDefaultContextFingerprint({ question, sources });

    const mapped = mapProjectBoardQuestionRow(
      {
        id: "question-1",
        board_id: "board-1",
        question_order: 0,
        question,
        required: 1,
        answer: "Use the strict proof policy.",
        answered_at: "2026-01-01T00:02:00.000Z",
        suggested_answer: "Run unit and visual proof.",
        suggestion_rationale: "The source names UI work.",
        suggestion_confidence: "high",
        suggestion_source_ids_json: JSON.stringify(["source-1", 7, "source-2"]),
        suggestion_context_fingerprint: contextFingerprint,
        suggestion_generated_at: "2026-01-01T00:01:00.000Z",
        suggestion_model: "fallback",
        suggestion_provider_error: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:02:00.000Z",
      },
      sources,
    );

    expect(mapped).toMatchObject({
      id: "question-1",
      boardId: "board-1",
      question,
      required: true,
      answer: "Use the strict proof policy.",
      answeredAt: "2026-01-01T00:02:00.000Z",
      suggestedAnswer: "Run unit and visual proof.",
      suggestedAnswerRationale: "The source names UI work.",
      suggestedAnswerConfidence: "high",
      suggestedAnswerSourceIds: ["source-1", "source-2"],
      suggestedAnswerContextFingerprint: contextFingerprint,
      suggestedAnswerGeneratedAt: "2026-01-01T00:01:00.000Z",
      suggestedAnswerModel: "fallback",
      suggestedAnswerStale: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    const stale = mapProjectBoardQuestionRow(
      {
        id: "question-1",
        board_id: "board-1",
        question_order: 0,
        question,
        required: 0,
        answer: null,
        answered_at: null,
        suggested_answer: "Run unit proof.",
        suggestion_rationale: null,
        suggestion_confidence: "unsupported",
        suggestion_source_ids_json: null,
        suggestion_context_fingerprint: "stale-fingerprint",
        suggestion_generated_at: null,
        suggestion_model: null,
        suggestion_provider_error: "Provider unavailable.",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:02:00.000Z",
      },
      sources,
    );

    expect(stale.required).toBe(false);
    expect(stale.suggestedAnswerConfidence).toBeUndefined();
    expect(stale.suggestedAnswerSourceIds).toEqual([]);
    expect(stale.suggestedAnswerStale).toBe(true);
    expect(stale.suggestedAnswerProviderError).toBe("Provider unavailable.");
  });
});
