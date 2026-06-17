import { createHash } from "node:crypto";
import { z } from "zod";
import {
  projectBoardClarificationCanonicalKey,
  projectBoardClarificationDecisionId,
} from "../../shared/projectBoardClarificationDecisions";

export const PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION = 1;
export const PROJECT_BOARD_ARTIFACT_ROOT = ".ambient/board";

const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,159}$/;
const gitCommitPattern = /^[a-f0-9]{7,64}$/i;

const artifactIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(artifactIdPattern, "Use letters, numbers, '.', '_', ':', '#', or '-' and start with a letter or number.");
const optionalArtifactIdSchema = artifactIdSchema.optional();
const isoDateSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO-style date/time string.");
const looseObjectSchema = z.record(z.string(), z.unknown());
const stringListSchema = z.array(z.string().min(1).max(2000));
const optionalStringSchema = z.string().min(1).optional();

const boardStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
const charterStatusSchema = z.enum(["draft", "active", "superseded"]);
const cardStatusSchema = z.enum(["draft", "ready", "in_progress", "review", "done", "blocked", "archived"]);
const candidateStatusSchema = z.enum(["needs_clarification", "ready_to_create", "evidence", "duplicate", "rejected"]);
const cardSourceKindSchema = z.enum(["planner_plan", "manual", "run_follow_up", "local_task_import", "board_synthesis"]);
const proposalStatusSchema = z.enum(["pending", "applied", "superseded", "rejected"]);
const proposalCardReviewStatusSchema = z.enum(["pending", "accepted", "deferred", "rejected", "merged"]);
const projectBoardUiMockRoleSchema = z.enum(["mock_gate", "gated_implementation"]);
const pmReviewReadinessSchema = z.enum(["ready_for_activation", "ready_for_card_generation", "needs_answers", "needs_source_refresh", "blocked"]);
const pmReviewSourceConfidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
const pmReviewGitStateSchema = z.enum(["local_only", "git_no_remote", "git_ready", "unknown"]);
const sourceKindSchema = z.enum([
  "thread",
  "plan_artifact",
  "architecture_artifact",
  "functional_spec",
  "implementation_plan",
  "workflow_artifact",
  "implementation_file",
  "test_artifact",
  "git_state",
  "ignored",
  "markdown",
]);
const sourceChangeStateSchema = z.enum(["new", "changed", "unchanged", "removed"]);

const kickoffContextBriefSourceSchema = z
  .object({
    sourceId: artifactIdSchema,
    sourceKey: z.string().min(1).max(500).optional(),
    title: z.string().min(1).max(500),
    kind: sourceKindSchema,
    authorityRole: z.enum(["primary", "supporting", "context", "proof", "ignored"]).optional(),
    includeInSynthesis: z.boolean(),
    relevance: z.number().finite(),
    path: z.string().min(1).max(2000).optional(),
    threadId: z.string().min(1).max(2000).optional(),
    artifactId: z.string().min(1).max(2000).optional(),
    summary: z.string().max(2000),
    keyFacts: stringListSchema.default([]),
    proofExpectations: stringListSchema.default([]),
    dependencyHints: stringListSchema.default([]),
    risks: stringListSchema.default([]),
  })
  .strict();

const kickoffContextBriefSchema = z
  .object({
    summary: z.string().max(4000),
    sourceIds: z.array(artifactIdSchema).default([]),
    durablePlanSourceIds: z.array(artifactIdSchema).default([]),
    includedSourceCount: z.number().int().nonnegative(),
    ignoredSourceCount: z.number().int().nonnegative(),
    sourceNotes: z.array(kickoffContextBriefSourceSchema).default([]),
    proofExpectations: stringListSchema.default([]),
    dependencyHints: stringListSchema.default([]),
    risks: stringListSchema.default([]),
    unresolvedSignals: stringListSchema.default([]),
    generatedAt: isoDateSchema,
    generator: z.enum(["source_digest", "ambient_rlm"]),
  })
  .strict();

const charterProjectSummarySchema = z
  .object({
    summary: z.string().max(8000),
    majorSystems: stringListSchema.default([]),
    sourceCoverage: stringListSchema.default([]),
    risks: stringListSchema.default([]),
    dependencyHints: stringListSchema.default([]),
    unresolvedDecisions: stringListSchema.default([]),
    citations: stringListSchema.default([]),
    coverageGaps: stringListSchema.default([]),
    sourceChecksumSet: stringListSchema.default([]),
    charterAnswerChecksum: z.string().min(8).max(128),
    kickoffContextBrief: kickoffContextBriefSchema.optional(),
    generatedAt: isoDateSchema,
    generator: z.enum(["ambient_rlm", "fallback_heuristic"]),
  })
  .strict();

export const boardArtifactEventTypes = [
  "board.created",
  "board.reset",
  "board.archived",
  "board.status_changed",
  "board.synthesized",
  "board.ready_tasks_created",
  "charter.revision_started",
  "charter.question_answered",
  "charter.kickoff_defaults_suggested",
  "charter.applied",
  "charter.summary_refreshed",
  "source.snapshot_created",
  "source.classified",
  "source.changed",
  "sources.refreshed",
  "plan.promoted",
  "proposal.started",
  "proposal.progress",
  "proposal.partial_card_created",
  "proposal.question_created",
  "proposal.question_answered",
  "proposal.card_reviewed",
  "proposal.applied",
  "proposal.coverage_updated",
  "proposal.failed",
  "proposal.completed",
  "card.created",
  "card.updated",
  "card.status_changed",
  "card.dependency_added",
  "card.dependency_removed",
  "card.approved",
  "card.split",
  "card.ticketized",
  "card.execution_session_assigned",
  "card.claimed",
  "card.heartbeat",
  "card.claim_released",
  "card.claim_expired",
  "board.execution_readiness_blocked",
  "board.workflow_created",
  "board.workflow_impact_resolved",
  "board.workflow_repaired",
  "board.workflow_settings_updated",
  "board.workflow_raw_updated",
  "card.blocked",
  "card.completed",
  "card.proof_reviewed",
  "card.followup_created",
  "local_task.attached",
  "local_task.imported_as_evidence",
  "run.prepared",
  "run.started",
  "run.progress",
  "run.completed",
  "run.failed",
  "run.blocked",
  "run.canceled",
  "run.stalled",
  "run.handoff_created",
  "run.deliverable_integration_resolved",
] as const;

const boardArtifactEventTypeSchema = z.enum(boardArtifactEventTypes);

const projectRelativePathSchema = z
  .string()
  .min(1)
  .max(600)
  .refine((value) => !isAbsoluteOrEscapingPath(value), "Use a project-relative path that does not escape the project root.");

const sourceRefSchema = z
  .object({
    sourceId: optionalArtifactIdSchema,
    path: projectRelativePathSchema.optional(),
    range: z.string().min(1).max(240).optional(),
    quote: z.string().max(1000).optional(),
    note: z.string().max(1000).optional(),
    contentHash: z.string().min(8).max(128).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.sourceId || value.path), "Source refs need either sourceId or path.");

const clarificationAnswerArtifactSchema = z
  .object({
    question: z.string().min(1).max(500),
    answer: z.string().min(1).max(1500),
    answeredAt: isoDateSchema,
  })
  .strict();

const clarificationSuggestionArtifactSchema = z
  .object({
    question: z.string().min(1).max(500),
    suggestedAnswer: z.string().min(1).max(1500),
    rationale: z.string().min(1).max(1000),
    confidence: z.enum(["high", "medium", "low"]).default("low"),
    safeToAccept: z.boolean().default(false),
    questionKind: z.enum(["expert_default", "user_preference", "external_constraint"]).default("user_preference"),
  })
  .strict();

const clarificationDecisionArtifactSchema = z
  .object({
    id: artifactIdSchema.optional(),
    question: z.string().min(1).max(500),
    canonicalKey: z.string().min(1).max(180).optional(),
    source: z.enum(["card", "description", "acceptance_criteria", "answer_history"]).default("card"),
    state: z.enum(["open", "answered", "duplicate", "dismissed"]).default("open"),
    duplicateOf: artifactIdSchema.optional(),
    answer: z.string().min(1).max(1500).optional(),
    answeredAt: isoDateSchema.optional(),
    suggestedAnswer: z.string().min(1).max(1500).optional(),
    rationale: z.string().min(1).max(1000).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    safeToAccept: z.boolean().default(false),
    questionKind: z.enum(["expert_default", "user_preference", "external_constraint"]).optional(),
    createdAt: isoDateSchema.optional(),
    updatedAt: isoDateSchema.optional(),
  })
  .strict()
  .transform((decision) => {
    const question = decision.question.trim();
    return {
      ...decision,
      id: decision.id?.trim() || projectBoardClarificationDecisionId(question),
      question,
      canonicalKey: decision.canonicalKey?.trim() || projectBoardClarificationCanonicalKey(question),
    };
  });

const runFeedbackArtifactSchema = z
  .object({
    id: artifactIdSchema,
    feedback: z.string().min(1).max(1500),
    source: z.enum(["manual", "decision_impact", "proof_review", "source_impact"]).default("manual"),
    decisionQuestion: z.string().min(1).max(500).optional(),
    decisionAnswer: z.string().min(1).max(1500).optional(),
    sourceImpactEventId: z.string().min(1).max(120).optional(),
    sourceImpactEventIds: z.array(z.string().min(1).max(120)).max(100).optional(),
    sourceIds: z.array(z.string().min(1).max(200)).max(100).optional(),
    createdAt: isoDateSchema,
    createdBy: z.string().min(1).max(120).optional(),
  })
  .strict();

const testPlanArtifactSchema = z
  .object({
    unit: stringListSchema,
    integration: stringListSchema,
    visual: stringListSchema,
    manual: stringListSchema,
  })
  .strict();

const actorSchema = z
  .object({
    kind: z.enum(["ambient-desktop", "pi-planner", "pi-worker", "user", "importer"]),
    agentId: optionalStringSchema,
    displayName: optionalStringSchema,
    appInstanceId: optionalStringSchema,
    piSessionId: optionalStringSchema,
  })
  .strict();

export const boardConfigArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    boardId: artifactIdSchema,
    title: z.string().min(1).max(240),
    status: boardStatusSchema,
    summary: z.string().max(4000).default(""),
    projectName: z.string().max(240).optional(),
    activeCharterId: optionalArtifactIdSchema,
    collaboration: z
      .object({
        mode: z.enum(["local", "git"]).default("local"),
        boardBranch: z.string().min(1).max(240).optional(),
        remote: z.string().min(1).max(240).optional(),
      })
      .strict()
      .default({ mode: "local" }),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .strict();

export const charterArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    charterId: artifactIdSchema,
    boardId: artifactIdSchema,
    version: z.number().int().positive(),
    status: charterStatusSchema,
    goal: z.string().max(6000),
    currentState: z.string().max(6000),
    targetUser: z.string().max(3000),
    nonGoals: stringListSchema,
    qualityBar: z.string().max(6000),
    testPolicy: looseObjectSchema,
    decisionPolicy: looseObjectSchema,
    dependencyPolicy: looseObjectSchema,
    budgetPolicy: looseObjectSchema,
    sourcePolicy: looseObjectSchema,
    markdown: z.string().max(80_000),
    projectSummary: charterProjectSummarySchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .strict();

export const sourceClassificationArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    sourceId: artifactIdSchema,
    sourceKey: z.string().min(1).max(500),
    contentHash: z.string().min(8).max(128).optional(),
    detectedKind: sourceKindSchema,
    effectiveKind: sourceKindSchema,
    userKind: sourceKindSchema.optional(),
    confidence: z.number().min(0).max(1),
    classificationReason: z.string().max(4000),
    authorityRole: z.enum(["primary", "supporting", "context", "proof", "ignored"]),
    includeInSynthesis: z.boolean(),
    notableScope: z.string().max(4000).optional(),
    warnings: stringListSchema.default([]),
    classifiedBy: z.enum(["ambient_pi", "fallback_heuristic", "user"]),
    classifiedAt: isoDateSchema,
  })
  .strict();

export const sourceSnapshotArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    snapshotId: artifactIdSchema,
    boardId: artifactIdSchema,
    createdAt: isoDateSchema,
    sources: z.array(
      z
        .object({
          sourceId: artifactIdSchema,
          sourceKey: z.string().min(1).max(500),
          kind: sourceKindSchema,
          changeState: sourceChangeStateSchema,
          title: z.string().min(1).max(400),
          summary: z.string().max(4000),
          excerpt: z.string().max(80_000).optional(),
          path: projectRelativePathSchema.optional(),
          threadId: optionalStringSchema,
          artifactId: optionalStringSchema,
          messageId: optionalStringSchema,
          contentHash: z.string().min(8).max(128).optional(),
          byteSize: z.number().int().nonnegative().optional(),
          mtime: isoDateSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();

const addCardsObjectiveProvenanceSchema = z
  .object({
    objective: z.string().min(1).max(2000),
    groundingMode: z.enum(["selected_sources", "source_scan", "objective_only"]),
    selectedSourceIds: z.array(artifactIdSchema).default([]),
    sourceRefCount: z.number().int().nonnegative(),
    weakGrounding: z.boolean(),
    sourceGap: z.string().min(1).max(2000).optional(),
  })
  .strict();

export const cardArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    cardId: artifactIdSchema,
    boardId: artifactIdSchema,
    title: z.string().min(1).max(240),
    description: z.string().max(20_000),
    status: cardStatusSchema,
    candidateStatus: candidateStatusSchema,
    priority: z.number().int().nonnegative().optional(),
    phase: z.string().min(1).max(200).optional(),
    labels: stringListSchema,
    blockedBy: z.array(artifactIdSchema),
    unresolvedBlockers: z.array(z.string().min(1).max(500)).default([]),
    acceptanceCriteria: stringListSchema,
    testPlan: testPlanArtifactSchema,
    sourceKind: cardSourceKindSchema,
    sourceId: artifactIdSchema,
    sourceRefs: z.array(sourceRefSchema).default([]),
    clarificationQuestions: stringListSchema.default([]),
    clarificationSuggestions: z.array(clarificationSuggestionArtifactSchema).optional(),
    clarificationAnswers: z.array(clarificationAnswerArtifactSchema).default([]),
    clarificationDecisions: z.array(clarificationDecisionArtifactSchema).optional(),
    runFeedback: z.array(runFeedbackArtifactSchema).default([]),
    objectiveProvenance: addCardsObjectiveProvenanceSchema.optional(),
    orchestrationTaskId: optionalArtifactIdSchema,
    executionThreadId: optionalStringSchema,
    executionSessionPolicy: z.enum(["reuse_card_session", "fresh_context"]).optional(),
    uiMockRole: projectBoardUiMockRoleSchema.optional(),
    requiresUiMockApproval: z.boolean().optional(),
    proofReview: looseObjectSchema.optional(),
    splitOutcome: looseObjectSchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .strict();

export const boardEventArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    eventId: artifactIdSchema,
    boardId: artifactIdSchema,
    type: boardArtifactEventTypeSchema,
    entityKind: z.enum(["board", "charter", "source", "proposal", "card", "run", "task"]).optional(),
    entityId: optionalArtifactIdSchema,
    actor: actorSchema.optional(),
    baseCommit: z.string().regex(gitCommitPattern).optional(),
    createdAt: isoDateSchema,
    payload: looseObjectSchema,
  })
  .strict();

export const proposalManifestArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    proposalRunId: artifactIdSchema,
    boardId: artifactIdSchema,
    status: z.enum(["running", "pause_requested", "paused", "abandoned", "succeeded", "failed"]),
    stage: z.enum(["source_scan", "source_classification", "planning", "importing", "paused", "completed", "failed"]),
    model: z.string().min(1).max(200).optional(),
    sourceCount: z.number().int().nonnegative(),
    sourceCharCount: z.number().int().nonnegative(),
    promptCharCount: z.number().int().nonnegative().optional(),
    responseCharCount: z.number().int().nonnegative().optional(),
    cardCount: z.number().int().nonnegative().optional(),
    questionCount: z.number().int().nonnegative().optional(),
    warningCount: z.number().int().nonnegative().default(0),
    startedAt: isoDateSchema,
    updatedAt: isoDateSchema,
    completedAt: isoDateSchema.optional(),
    error: z.string().max(4000).optional(),
  })
  .strict();

const progressRecordSchema = z
  .object({
    type: z.literal("progress"),
    stage: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    summary: z.string().max(4000),
    createdAt: isoDateSchema,
    metadata: looseObjectSchema.default({}),
  })
  .strict();

const partialCardRecordSchema = z
  .object({
    type: z.literal("candidate_card"),
    sourceId: artifactIdSchema,
    title: z.string().min(1).max(240),
    description: z.string().max(20_000),
    candidateStatus: candidateStatusSchema.default("needs_clarification"),
    priority: z.number().int().nonnegative().optional(),
    phase: z.string().min(1).max(200).optional(),
    labels: stringListSchema.default([]),
    blockedBy: z.array(artifactIdSchema).default([]),
    sourceRefs: z.array(sourceRefSchema).default([]),
    clarificationQuestions: stringListSchema.default([]),
    clarificationSuggestions: z.array(clarificationSuggestionArtifactSchema).optional(),
    clarificationDecisions: z.array(clarificationDecisionArtifactSchema).optional(),
    acceptanceCriteria: stringListSchema,
    testPlan: testPlanArtifactSchema,
    objectiveProvenance: addCardsObjectiveProvenanceSchema.optional(),
    uiMockRole: projectBoardUiMockRoleSchema.optional(),
    requiresUiMockApproval: z.boolean().optional(),
  })
  .strict();

const proposalAnswerArtifactSchema = z
  .object({
    questionIndex: z.number().int().nonnegative(),
    question: z.string().min(1).max(2000),
    answer: z.string().min(1).max(6000),
    answeredAt: isoDateSchema,
  })
  .strict();

const proposalCardArtifactSchema = z
  .object({
    sourceId: artifactIdSchema,
    title: z.string().min(1).max(240),
    description: z.string().max(20_000),
    candidateStatus: candidateStatusSchema,
    priority: z.number().int().nonnegative().optional(),
    phase: z.string().min(1).max(200).optional(),
    labels: stringListSchema,
    blockedBy: z.array(artifactIdSchema),
    acceptanceCriteria: stringListSchema,
    testPlan: testPlanArtifactSchema,
    sourceRefs: stringListSchema,
    clarificationQuestions: stringListSchema.default([]),
    clarificationSuggestions: z.array(clarificationSuggestionArtifactSchema).optional(),
    clarificationDecisions: z.array(clarificationDecisionArtifactSchema).default([]),
    objectiveProvenance: addCardsObjectiveProvenanceSchema.optional(),
    uiMockRole: projectBoardUiMockRoleSchema.optional(),
    requiresUiMockApproval: z.boolean().optional(),
    reviewStatus: proposalCardReviewStatusSchema,
    reviewReason: z.string().max(2000).optional(),
    mergeTargetCardId: artifactIdSchema.optional(),
    reviewedAt: isoDateSchema.optional(),
  })
  .strict();

const pmReviewReportArtifactSchema = z
  .object({
    readiness: pmReviewReadinessSchema,
    summary: z.string().min(1).max(1000),
    sourceConfidence: pmReviewSourceConfidenceSchema.default("unknown"),
    sourceConfidenceNotes: stringListSchema.default([]),
    gitState: pmReviewGitStateSchema.default("unknown"),
    gitStateNotes: stringListSchema.default([]),
    blockingQuestions: stringListSchema,
    risks: stringListSchema,
    sourceConflicts: stringListSchema,
    sourceAuthorityNotes: stringListSchema,
    recommendedActivationScope: z.string().min(1).max(1200),
    cardGenerationConstraints: stringListSchema,
  })
  .strict();

export const proposalFinalArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    proposalId: artifactIdSchema,
    boardId: artifactIdSchema,
    status: proposalStatusSchema,
    summary: z.string().max(4000),
    goal: z.string().max(6000),
    currentState: z.string().max(6000),
    targetUser: z.string().max(3000),
    qualityBar: z.string().max(6000),
    assumptions: stringListSchema,
    questions: stringListSchema,
    answers: z.array(proposalAnswerArtifactSchema),
    sourceNotes: stringListSchema,
    cards: z.array(proposalCardArtifactSchema),
    reviewReport: pmReviewReportArtifactSchema.optional(),
    model: z.string().min(1).max(200).optional(),
    durationMs: z.number().int().nonnegative().optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    appliedAt: isoDateSchema.optional(),
  })
  .strict();

const questionRecordSchema = z
  .object({
    type: z.literal("question"),
    questionId: artifactIdSchema,
    question: z.string().min(1).max(2000),
    charterSection: z.string().min(1).max(200).optional(),
    cardId: artifactIdSchema.optional(),
    required: z.boolean().default(true),
    createdAt: isoDateSchema,
  })
  .strict();

const proposalFinalRecordSchema = z
  .object({
    type: z.literal("proposal_final"),
    summary: z.string().max(4000),
    goal: z.string().max(6000),
    currentState: z.string().max(6000),
    targetUser: z.string().max(3000),
    qualityBar: z.string().max(6000),
    assumptions: stringListSchema.default([]),
    questions: stringListSchema.default([]),
    sourceNotes: stringListSchema.default([]),
    createdAt: isoDateSchema,
    metadata: looseObjectSchema.default({}),
  })
  .strict();

const sourceCoverageRecordSchema = z
  .object({
    type: z.literal("source_coverage"),
    sourceId: artifactIdSchema,
    range: z.string().min(1).max(240).optional(),
    status: z.enum(["covered", "partial", "unresolved", "ignored"]),
    cardIds: z.array(artifactIdSchema).default([]),
    note: z.string().max(4000).optional(),
    updatedAt: isoDateSchema,
  })
  .strict();

const dependencyEdgeRecordSchema = z
  .object({
    type: z.literal("dependency_edge"),
    fromCardId: artifactIdSchema,
    toCardId: artifactIdSchema,
    reason: z.string().max(2000).optional(),
    createdAt: isoDateSchema,
  })
  .strict()
  .refine((value) => value.fromCardId !== value.toCardId, "Dependency edges cannot point to the same card.");

const warningRecordSchema = z
  .object({
    type: z.literal("warning"),
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(4000),
    createdAt: isoDateSchema,
    metadata: looseObjectSchema.default({}),
  })
  .strict();

const errorRecordSchema = z
  .object({
    type: z.literal("error"),
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(4000),
    recoverable: z.boolean().default(true),
    createdAt: isoDateSchema,
    metadata: looseObjectSchema.default({}),
  })
  .strict();

export const proposalJsonlRecordArtifactSchema = z.discriminatedUnion("type", [
  progressRecordSchema,
  partialCardRecordSchema,
  questionRecordSchema,
  proposalFinalRecordSchema,
  sourceCoverageRecordSchema,
  dependencyEdgeRecordSchema,
  warningRecordSchema,
  errorRecordSchema,
]);

export const plannerActionArtifactSchema = z
  .object({
    type: z.literal("planner_action"),
    actionId: artifactIdSchema,
    proposalRunId: optionalArtifactIdSchema,
    action: z.enum([
      "section_status_updated",
      "candidate_card_created",
      "question_created",
      "proposal_finalized",
      "source_coverage_reported",
      "dependency_linked",
      "warning_reported",
      "error_reported",
    ]),
    sourceRecordType: z.string().min(1).max(120),
    sourceRecordKey: z.string().min(1).max(500),
    title: z.string().min(1).max(240),
    summary: z.string().max(4000),
    sourceId: optionalArtifactIdSchema,
    cardId: optionalArtifactIdSchema,
    sectionId: optionalArtifactIdSchema,
    sectionHeading: z.string().min(1).max(240).optional(),
    status: z.string().min(1).max(120).optional(),
    createdAt: isoDateSchema,
    payload: looseObjectSchema.default({}),
  })
  .strict();

export const runManifestArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    runId: artifactIdSchema,
    boardId: artifactIdSchema,
    cardId: artifactIdSchema,
    status: z.enum(["queued", "claimed", "prepared", "preparing", "running", "completed", "failed", "blocked", "canceled", "stalled", "review"]),
    agentId: optionalStringSchema,
    piSessionId: optionalStringSchema,
    workspaceBranch: z.string().min(1).max(240).optional(),
    baseCommit: z.string().regex(gitCommitPattern).optional(),
    startedAt: isoDateSchema,
    updatedAt: isoDateSchema,
    completedAt: isoDateSchema.optional(),
  })
  .strict();

export const runProofArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    runId: artifactIdSchema,
    boardId: artifactIdSchema,
    cardId: artifactIdSchema,
    summary: z.string().max(8000),
    commands: z.array(z.string().min(1).max(2000)).default([]),
    changedFiles: z.array(projectRelativePathSchema).default([]),
    screenshots: z.array(projectRelativePathSchema).default([]),
    browserTraces: z.array(projectRelativePathSchema).default([]),
    visualChecks: z.array(looseObjectSchema).default([]),
    manualChecks: stringListSchema.default([]),
    createdAt: isoDateSchema,
  })
  .strict();

export const runHandoffArtifactSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION),
    runId: artifactIdSchema,
    boardId: artifactIdSchema,
    cardId: artifactIdSchema,
    summary: z.string().min(1).max(12_000),
    completed: stringListSchema.default([]),
    remaining: stringListSchema.default([]),
    risks: stringListSchema.default([]),
    followUps: z
      .array(
        z
          .object({
            title: z.string().min(1).max(240),
            reason: z.string().max(2000),
            blockedBy: z.array(artifactIdSchema).default([]),
          })
          .strict(),
      )
      .default([]),
    createdAt: isoDateSchema,
  })
  .strict();

export type BoardConfigArtifact = z.infer<typeof boardConfigArtifactSchema>;
export type CharterArtifact = z.infer<typeof charterArtifactSchema>;
export type SourceClassificationArtifact = z.infer<typeof sourceClassificationArtifactSchema>;
export type SourceSnapshotArtifact = z.infer<typeof sourceSnapshotArtifactSchema>;
export type CardArtifact = z.infer<typeof cardArtifactSchema>;
export type BoardEventArtifact = z.infer<typeof boardEventArtifactSchema>;
export type ProposalManifestArtifact = z.infer<typeof proposalManifestArtifactSchema>;
export type ProposalFinalArtifact = z.infer<typeof proposalFinalArtifactSchema>;
export type ProposalJsonlRecordArtifact = z.infer<typeof proposalJsonlRecordArtifactSchema>;
export type PlannerActionArtifact = z.infer<typeof plannerActionArtifactSchema>;
export type RunManifestArtifact = z.infer<typeof runManifestArtifactSchema>;
export type RunProofArtifact = z.infer<typeof runProofArtifactSchema>;
export type RunHandoffArtifact = z.infer<typeof runHandoffArtifactSchema>;

export interface ProjectBoardArtifactSetInput {
  config: unknown;
  charter?: unknown;
  sourceSnapshots?: unknown[];
  sourceClassifications?: unknown[];
  cards?: unknown[];
  events?: unknown[];
  runManifests?: unknown[];
  runProofs?: unknown[];
  runHandoffs?: unknown[];
}

export interface ProjectBoardArtifactSet {
  config: BoardConfigArtifact;
  charter?: CharterArtifact;
  sourceSnapshots: SourceSnapshotArtifact[];
  sourceClassifications: SourceClassificationArtifact[];
  cards: CardArtifact[];
  events: BoardEventArtifact[];
  runManifests: RunManifestArtifact[];
  runProofs: RunProofArtifact[];
  runHandoffs: RunHandoffArtifact[];
}

export class ProjectBoardArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectBoardArtifactValidationError";
  }
}

export function validateBoardConfigArtifact(value: unknown): BoardConfigArtifact {
  return parseArtifact(boardConfigArtifactSchema, value, "board config");
}

export function validateCharterArtifact(value: unknown): CharterArtifact {
  return parseArtifact(charterArtifactSchema, value, "charter");
}

export function validateSourceSnapshotArtifact(value: unknown): SourceSnapshotArtifact {
  return parseArtifact(sourceSnapshotArtifactSchema, value, "source snapshot");
}

export function validateSourceClassificationArtifact(value: unknown): SourceClassificationArtifact {
  return parseArtifact(sourceClassificationArtifactSchema, value, "source classification");
}

export function validateCardArtifact(value: unknown): CardArtifact {
  return parseArtifact(cardArtifactSchema, value, "card");
}

export function validateBoardEventArtifact(value: unknown): BoardEventArtifact {
  return parseArtifact(boardEventArtifactSchema, value, "board event");
}

export function validateProposalManifestArtifact(value: unknown): ProposalManifestArtifact {
  return parseArtifact(proposalManifestArtifactSchema, value, "proposal manifest");
}

export function validateProposalFinalArtifact(value: unknown): ProposalFinalArtifact {
  return parseArtifact(proposalFinalArtifactSchema, value, "proposal final");
}

export function validateProposalJsonlRecordArtifact(value: unknown): ProposalJsonlRecordArtifact {
  return parseArtifact(proposalJsonlRecordArtifactSchema, value, "proposal JSONL record");
}

export function validatePlannerActionArtifact(value: unknown): PlannerActionArtifact {
  return parseArtifact(plannerActionArtifactSchema, value, "planner action");
}

export function validateRunManifestArtifact(value: unknown): RunManifestArtifact {
  return parseArtifact(runManifestArtifactSchema, value, "run manifest");
}

export function validateRunProofArtifact(value: unknown): RunProofArtifact {
  return parseArtifact(runProofArtifactSchema, value, "run proof");
}

export function validateRunHandoffArtifact(value: unknown): RunHandoffArtifact {
  return parseArtifact(runHandoffArtifactSchema, value, "run handoff");
}

export function parseBoardArtifactJson<T>(text: string, schema: z.ZodType<T>, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ProjectBoardArtifactValidationError(`${label}: invalid JSON: ${errorMessage(error)}`);
  }
  return parseArtifact(schema, parsed, label);
}

export function parseBoardArtifactJsonl<T>(text: string, schema: z.ZodType<T>, label: string): T[] {
  const records: T[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    records.push(parseBoardArtifactJson(line, schema, `${label} line ${index + 1}`));
  });
  return records;
}

export function serializeBoardArtifact(value: unknown): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

export function stableBoardArtifactId(prefix: string, parts: Array<string | number | undefined | null>): string {
  const material = parts.map((part) => (part === undefined || part === null ? "" : String(part))).join("\0");
  const hash = createHash("sha256").update(material).digest("hex").slice(0, 10);
  const slug = material
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safePrefix || "id"}-${slug || "item"}-${hash}`;
}

export function boardEventArtifactPath(event: Pick<BoardEventArtifact, "createdAt" | "eventId">): string {
  const date = new Date(event.createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new ProjectBoardArtifactValidationError(`board event ${event.eventId}: invalid createdAt date.`);
  }
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const timestamp = event.createdAt.replace(/[^A-Za-z0-9]/g, "");
  return `${PROJECT_BOARD_ARTIFACT_ROOT}/events/${year}/${month}/${day}/${timestamp}-${event.eventId}.json`;
}

export function validateProjectBoardArtifactSet(input: ProjectBoardArtifactSetInput): ProjectBoardArtifactSet {
  const config = validateBoardConfigArtifact(input.config);
  const charter = input.charter === undefined ? undefined : validateCharterArtifact(input.charter);
  const sourceSnapshots = (input.sourceSnapshots ?? []).map(validateSourceSnapshotArtifact);
  const sourceClassifications = (input.sourceClassifications ?? []).map(validateSourceClassificationArtifact);
  const cards = (input.cards ?? []).map(validateCardArtifact);
  const events = (input.events ?? []).map(validateBoardEventArtifact);
  const runManifests = (input.runManifests ?? []).map(validateRunManifestArtifact);
  const runProofs = (input.runProofs ?? []).map(validateRunProofArtifact);
  const runHandoffs = (input.runHandoffs ?? []).map(validateRunHandoffArtifact);
  const errors: string[] = [];

  if (charter && charter.boardId !== config.boardId) errors.push(`charter ${charter.charterId} belongs to board ${charter.boardId}, not ${config.boardId}.`);
  for (const snapshot of sourceSnapshots) {
    if (snapshot.boardId !== config.boardId) errors.push(`source snapshot ${snapshot.snapshotId} belongs to board ${snapshot.boardId}, not ${config.boardId}.`);
  }
  for (const card of cards) {
    if (card.boardId !== config.boardId) errors.push(`card ${card.cardId} belongs to board ${card.boardId}, not ${config.boardId}.`);
  }
  for (const event of events) {
    if (event.boardId !== config.boardId) errors.push(`event ${event.eventId} belongs to board ${event.boardId}, not ${config.boardId}.`);
  }
  for (const manifest of runManifests) {
    if (manifest.boardId !== config.boardId) errors.push(`run ${manifest.runId} manifest belongs to board ${manifest.boardId}, not ${config.boardId}.`);
  }
  for (const proof of runProofs) {
    if (proof.boardId !== config.boardId) errors.push(`run ${proof.runId} proof belongs to board ${proof.boardId}, not ${config.boardId}.`);
  }
  for (const handoff of runHandoffs) {
    if (handoff.boardId !== config.boardId) errors.push(`run ${handoff.runId} handoff belongs to board ${handoff.boardId}, not ${config.boardId}.`);
  }

  const cardIds = new Set<string>();
  const cardRefs = new Set<string>();
  for (const card of cards) {
    if (cardIds.has(card.cardId)) errors.push(`duplicate card id ${card.cardId}.`);
    cardIds.add(card.cardId);
    cardRefs.add(card.cardId);
    cardRefs.add(card.sourceId);
  }

  const runManifestIds = new Set<string>();
  const runManifestById = new Map<string, RunManifestArtifact>();
  for (const manifest of runManifests) {
    if (runManifestIds.has(manifest.runId)) errors.push(`duplicate run manifest id ${manifest.runId}.`);
    runManifestIds.add(manifest.runId);
    runManifestById.set(manifest.runId, manifest);
    if (cardIds.size > 0 && !cardIds.has(manifest.cardId)) errors.push(`run ${manifest.runId} references missing card ${manifest.cardId}.`);
  }

  const sourceIds = new Set<string>();
  for (const snapshot of sourceSnapshots) {
    for (const source of snapshot.sources) sourceIds.add(source.sourceId);
  }
  for (const classification of sourceClassifications) sourceIds.add(classification.sourceId);

  for (const card of cards) {
    for (const blocker of card.blockedBy) {
      if (!cardRefs.has(blocker)) errors.push(`card ${card.cardId} has missing dependency ${blocker}.`);
    }
    if (sourceIds.size > 0) {
      for (const ref of card.sourceRefs) {
        if (ref.sourceId && !sourceIds.has(ref.sourceId)) errors.push(`card ${card.cardId} references missing source ${ref.sourceId}.`);
      }
    }
  }

  for (const proof of runProofs) {
    const manifest = runManifestById.get(proof.runId);
    if (runManifestById.size > 0 && !manifest) errors.push(`run proof ${proof.runId} has no matching manifest.`);
    if (manifest && manifest.cardId !== proof.cardId) errors.push(`run proof ${proof.runId} references card ${proof.cardId}, not manifest card ${manifest.cardId}.`);
    if (cardIds.size > 0 && !cardIds.has(proof.cardId)) errors.push(`run proof ${proof.runId} references missing card ${proof.cardId}.`);
  }
  for (const handoff of runHandoffs) {
    const manifest = runManifestById.get(handoff.runId);
    if (runManifestById.size > 0 && !manifest) errors.push(`run handoff ${handoff.runId} has no matching manifest.`);
    if (manifest && manifest.cardId !== handoff.cardId) errors.push(`run handoff ${handoff.runId} references card ${handoff.cardId}, not manifest card ${manifest.cardId}.`);
    if (cardIds.size > 0 && !cardIds.has(handoff.cardId)) errors.push(`run handoff ${handoff.runId} references missing card ${handoff.cardId}.`);
  }

  if (errors.length > 0) throw new ProjectBoardArtifactValidationError(errors.join("\n"));
  const result: ProjectBoardArtifactSet = {
    config,
    sourceSnapshots,
    sourceClassifications,
    cards,
    events,
    runManifests,
    runProofs,
    runHandoffs,
  };
  if (charter) result.charter = charter;
  return result;
}

function parseArtifact<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ProjectBoardArtifactValidationError(`${label}: ${formatZodIssues(result.error.issues)}`);
}

function formatZodIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const next = record[key];
    if (next !== undefined) sorted[key] = sortJsonValue(next);
  }
  return sorted;
}

function isAbsoluteOrEscapingPath(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("~") || /^[A-Za-z]:[\\/]/.test(value) || value.includes("\\")) return true;
  return value.split("/").some((segment) => segment === "..");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
