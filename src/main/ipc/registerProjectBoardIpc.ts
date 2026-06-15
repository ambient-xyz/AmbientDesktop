import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AnswerProjectBoardQuestionInput,
  AnswerProjectBoardSynthesisProposalQuestionInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  ApplyProjectBoardSynthesisProposalInput,
  CancelProjectBoardRevisionInput,
  DesktopState,
  DeferProjectBoardSynthesisSectionsInput,
  FinalizeProjectBoardKickoffInput,
  PauseProjectBoardSynthesisInput,
  ProjectBoardCard,
  ProjectBoardGitCardClaimInput,
  ProjectBoardGitCardClaimReleaseInput,
  ProjectBoardGitSyncInput,
  ProjectBoardGitSyncStatus,
  PromotePlannerPlanToBoardInput,
  RecomputeProjectBoardProofCoverageInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  RefreshProjectBoardSourcesInput,
  RefineProjectBoardSynthesisInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  ResetProjectBoardInput,
  ResolveProjectBoardCardPiUpdateInput,
  ResolveProjectBoardDeliverableIntegrationInput,
  ResolveProjectBoardProofDecisionInput,
  ResolveProjectBoardSplitDecisionInput,
  RetryProjectBoardSynthesisInput,
  RerunProjectBoardProofInput,
  ReviseProjectBoardInput,
  ReviewProjectBoardSynthesisProposalCardInput,
  SeedProjectBoardCanonicalProjectionDogfoodInput,
  SeedProjectBoardDeliverableIntegrationDogfoodInput,
  SeedProjectBoardProofJudgmentDogfoodInput,
  SeedProjectBoardSemanticIdleDogfoodInput,
  SplitProjectBoardCardInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  SuggestProjectBoardProofInput,
  UpdateProjectBoardCardCandidateInput,
  UpdateProjectBoardCardInput,
  UpdateProjectBoardSourceInput,
  UpdateProjectBoardStatusInput,
  AddProjectBoardCardRunFeedbackInput,
  ApproveProjectBoardCardInput,
  AttachProjectBoardLocalTaskInput,
  CopyProjectBoardSessionToThreadInput,
  CreateProjectBoardInput,
  CreateProjectBoardCardInput,
  CreateReadyProjectBoardTasksInput,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const projectBoardCreateIpcChannels = [
  "project-board:create",
] as const;

export const projectBoardLifecycleIpcChannels = [
  "project-board:update-status",
  "project-board:revise",
  "project-board:cancel-revision",
  "project-board:reset",
] as const;

export const projectBoardGitIpcChannels = [
  "project-board:git-sync-status",
  "project-board:git-export",
  "project-board:git-commit",
  "project-board:git-push",
  "project-board:git-pull",
  "project-board:git-apply-pulled",
  "project-board:git-claim-card",
  "project-board:git-release-card-claim",
  "project-board:git-expire-card-claim",
  "project-board:git-resolve-card-claim-conflicts",
] as const;

export const projectBoardCardIpcChannels = [
  "project-board:resolve-split-decision",
  "project-board:create-ready-tasks",
  "project-board:split-card",
  "project-board:create-card",
  "project-board:attach-local-task",
  "project-board:update-card",
  "project-board:update-card-candidate",
  "project-board:resolve-card-pi-update",
  "project-board:add-run-feedback",
  "project-board:copy-session-to-thread",
] as const;

export const projectBoardProofIpcChannels = [
  "project-board:approve-card",
  "project-board:resolve-proof-decision",
  "project-board:rerun-proof",
  "project-board:resolve-deliverable-integration",
  "project-board:recompute-proof-coverage",
  "project-board:suggest-proof",
] as const;

export const projectBoardFeedbackIpcChannels = [
  "project-board:apply-decision-impact-feedback",
  "project-board:refresh-decision-drafts",
  "project-board:regenerate-decision-drafts",
  "project-board:refresh-source-drafts",
  "project-board:regenerate-source-drafts",
  "project-board:apply-source-impact-feedback",
] as const;

export const projectBoardDefaultsIpcChannels = [
  "project-board:suggest-clarification-defaults",
  "project-board:suggest-kickoff-defaults",
] as const;

export const projectBoardProposalIpcChannels = [
  "project-board:answer-synthesis-proposal-question",
  "project-board:review-synthesis-proposal-card",
  "project-board:apply-synthesis-proposal",
] as const;

export const projectBoardSourceQuestionIpcChannels = [
  "project-board:update-source",
  "project-board:answer-question",
] as const;

export const projectBoardPromoteIpcChannels = [
  "project-board:promote-plan",
] as const;

export const projectBoardDeferIpcChannels = [
  "project-board:defer-synthesis-sections",
] as const;

export const projectBoardPauseIpcChannels = [
  "project-board:pause-synthesis",
] as const;

export const projectBoardDogfoodIpcChannels = [
  "project-board:dogfood-seed-semantic-idle-section",
  "project-board:dogfood-seed-proof-judgment",
  "project-board:dogfood-seed-canonical-projection",
  "project-board:dogfood-seed-deliverable-integration",
] as const;

export const projectBoardKickoffIpcChannels = [
  "project-board:finalize-kickoff",
] as const;

export const projectBoardSourceRefreshIpcChannels = [
  "project-board:refresh-sources",
] as const;

export const projectBoardSynthesisRetryIpcChannels = [
  "project-board:retry-synthesis",
  "project-board:abandon-synthesis-run",
] as const;

export const projectBoardSynthesisRefinementIpcChannels = [
  "project-board:refine-synthesis",
] as const;

export interface RegisterProjectBoardCreateIpcDependencies {
  handleIpc: HandleIpc;
  createProjectBoard(input: CreateProjectBoardInput): MaybePromise<DesktopState>;
}

export interface RegisterProjectBoardLifecycleIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  updateProjectBoardStatus(host: Host, input: UpdateProjectBoardStatusInput): void;
  startProjectBoardRevision(host: Host, input: ReviseProjectBoardInput): void;
  cancelProjectBoardRevision(host: Host, input: CancelProjectBoardRevisionInput): void;
  resetProjectBoard(host: Host, input: ResetProjectBoardInput): void;
}

export interface RegisterProjectBoardGitIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  getProjectBoardGitSyncStatus(host: Host, input: ProjectBoardGitSyncInput): MaybePromise<ProjectBoardGitSyncStatus>;
  exportProjectBoardGitArtifacts(host: Host, input: ProjectBoardGitSyncInput): MaybePromise<ProjectBoardGitSyncStatus>;
  commitProjectBoardGitArtifacts(host: Host, input: ProjectBoardGitSyncInput): MaybePromise<ProjectBoardGitSyncStatus>;
  pushProjectBoardGitArtifacts(host: Host, input: ProjectBoardGitSyncInput): MaybePromise<ProjectBoardGitSyncStatus>;
  pullProjectBoardGitArtifacts(host: Host, input: ProjectBoardGitSyncInput): MaybePromise<ProjectBoardGitSyncStatus>;
  applyProjectBoardGitProjection(host: Host, input: ProjectBoardGitSyncInput): MaybePromise<DesktopState>;
  claimProjectBoardGitCard(host: Host, input: ProjectBoardGitCardClaimInput): MaybePromise<DesktopState>;
  releaseProjectBoardGitCardClaim(host: Host, input: ProjectBoardGitCardClaimReleaseInput): MaybePromise<DesktopState>;
  expireProjectBoardGitCardClaim(host: Host, input: ProjectBoardGitCardClaimReleaseInput): MaybePromise<DesktopState>;
  resolveProjectBoardGitCardClaimConflicts(host: Host, input: ProjectBoardGitCardClaimReleaseInput): MaybePromise<DesktopState>;
}

export interface RegisterProjectBoardCardIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  requireProjectRuntimeHostForProjectBoardCard(cardId: string): Host;
  requireProjectRuntimeHostForOrchestrationTask(taskId: string): Host;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  resolveProjectBoardSplitDecision(host: Host, input: ResolveProjectBoardSplitDecisionInput): void;
  createReadyProjectBoardTasks(host: Host, input: CreateReadyProjectBoardTasksInput): number;
  isAutoDispatchEnabled(host: Host): boolean;
  scheduleAutoDispatch(host: Host): void;
  splitProjectBoardCard(host: Host, input: SplitProjectBoardCardInput): void;
  createProjectBoardCard(host: Host, input: CreateProjectBoardCardInput): void;
  attachProjectBoardLocalTask(host: Host, input: AttachProjectBoardLocalTaskInput): void;
  updateProjectBoardCard(host: Host, input: UpdateProjectBoardCardInput): void;
  updateProjectBoardCardCandidate(host: Host, input: UpdateProjectBoardCardCandidateInput): void;
  resolveProjectBoardCardPiUpdate(host: Host, input: ResolveProjectBoardCardPiUpdateInput): void;
  addProjectBoardCardRunFeedback(host: Host, input: AddProjectBoardCardRunFeedbackInput): void;
  copyProjectBoardSessionToThread(host: Host, input: CopyProjectBoardSessionToThreadInput): { id: string };
}

export interface RegisterProjectBoardProofIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  requireProjectRuntimeHostForProjectBoardCard(cardId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  approveProjectBoardCard(host: Host, input: ApproveProjectBoardCardInput): Pick<ProjectBoardCard, "orchestrationTaskId">;
  resolveProjectBoardProofDecision(host: Host, input: ResolveProjectBoardProofDecisionInput): Pick<ProjectBoardCard, "orchestrationTaskId">;
  isAutoDispatchEnabled(host: Host): boolean;
  scheduleAutoDispatch(host: Host): void;
  rerunProjectBoardProof(host: Host, input: RerunProjectBoardProofInput, onProgress: () => void): MaybePromise<void>;
  resolveProjectBoardDeliverableIntegration(host: Host, input: ResolveProjectBoardDeliverableIntegrationInput): MaybePromise<void>;
  recomputeProjectBoardProofCoverage(host: Host, input: RecomputeProjectBoardProofCoverageInput): void;
  suggestProjectBoardProof(host: Host, input: SuggestProjectBoardProofInput): MaybePromise<void>;
}

export interface RegisterProjectBoardFeedbackIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  requireProjectRuntimeHostForProjectBoardCard(cardId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  applyProjectBoardDecisionImpactFeedback(host: Host, input: ApplyProjectBoardDecisionImpactFeedbackInput): void;
  refreshProjectBoardDecisionDrafts(host: Host, input: RefreshProjectBoardDecisionDraftsInput): void;
  regenerateProjectBoardDecisionDrafts(host: Host, input: RegenerateProjectBoardDecisionDraftsInput): MaybePromise<void>;
  refreshProjectBoardSourceDrafts(host: Host, input: RefreshProjectBoardSourceDraftsInput): void;
  regenerateProjectBoardSourceDrafts(host: Host, input: RegenerateProjectBoardSourceDraftsInput): MaybePromise<void>;
  applyProjectBoardSourceImpactFeedback(host: Host, input: ApplyProjectBoardSourceImpactFeedbackInput): void;
}

export interface RegisterProjectBoardDefaultsIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  suggestProjectBoardClarificationDefaults(host: Host, input: SuggestProjectBoardClarificationDefaultsInput): MaybePromise<void>;
  suggestProjectBoardKickoffDefaults(host: Host, input: SuggestProjectBoardKickoffDefaultsInput): MaybePromise<void>;
}

export interface RegisterProjectBoardProposalIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoardSynthesisProposal(proposalId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  answerProjectBoardSynthesisProposalQuestion(host: Host, input: AnswerProjectBoardSynthesisProposalQuestionInput): void;
  reviewProjectBoardSynthesisProposalCard(host: Host, input: ReviewProjectBoardSynthesisProposalCardInput): void;
  applyProjectBoardSynthesisProposal(host: Host, input: ApplyProjectBoardSynthesisProposalInput): void;
}

export interface RegisterProjectBoardSourceQuestionIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoardSource(sourceId: string): Host;
  requireProjectRuntimeHostForProjectBoardQuestion(questionId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  updateProjectBoardSource(host: Host, input: UpdateProjectBoardSourceInput): void;
  answerProjectBoardQuestion(host: Host, input: AnswerProjectBoardQuestionInput): void;
}

export interface RegisterProjectBoardPromoteIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): Host;
  assertProjectBoardMutationAllowedForActiveThread(host: Host, action: string): void;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  promotePlannerPlanToBoard(host: Host, input: PromotePlannerPlanToBoardInput): void;
}

export interface RegisterProjectBoardDeferIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  deferProjectBoardSynthesisSections(host: Host, input: DeferProjectBoardSynthesisSectionsInput): void;
}

export interface RegisterProjectBoardPauseIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  pauseProjectBoardSynthesis(host: Host, input: PauseProjectBoardSynthesisInput): void;
}

export interface RegisterProjectBoardDogfoodIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectBoardDogfoodTestHook(channel: string): void;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
  seedProjectBoardSemanticIdleDogfood(host: Host, input: SeedProjectBoardSemanticIdleDogfoodInput): void;
  seedProjectBoardProofJudgmentDogfood(host: Host, input: SeedProjectBoardProofJudgmentDogfoodInput): MaybePromise<unknown>;
  seedProjectBoardCanonicalProjectionDogfood(host: Host, input: SeedProjectBoardCanonicalProjectionDogfoodInput): MaybePromise<unknown>;
  seedProjectBoardDeliverableIntegrationDogfood(host: Host, input: SeedProjectBoardDeliverableIntegrationDogfoodInput): MaybePromise<unknown>;
}

export interface RegisterProjectBoardKickoffIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  finalizeProjectBoardKickoff(host: Host, input: FinalizeProjectBoardKickoffInput): MaybePromise<DesktopState>;
}

export interface RegisterProjectBoardSourceRefreshIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  refreshProjectBoardSources(host: Host, input: RefreshProjectBoardSourcesInput): MaybePromise<DesktopState>;
}

export interface RegisterProjectBoardSynthesisRetryIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  retryProjectBoardSynthesis(host: Host, input: RetryProjectBoardSynthesisInput): MaybePromise<DesktopState>;
  abandonProjectBoardSynthesisRun(host: Host, input: { boardId: string; runId: string; reason?: string }): MaybePromise<DesktopState>;
}

export interface RegisterProjectBoardSynthesisRefinementIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForProjectBoard(boardId: string): Host;
  refineProjectBoardSynthesis(host: Host, input: RefineProjectBoardSynthesisInput): MaybePromise<DesktopState>;
}

const projectBoardProjectIdSchema = z.string().min(1).max(128);
const projectBoardCreateSchema = z.object({
  projectId: projectBoardProjectIdSchema,
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().trim().max(2000).optional(),
});
const projectBoardStatusSchema = z.object({
  boardId: z.string().min(1).max(120),
  status: z.enum(["draft", "active", "paused", "archived"]),
});
const reviseProjectBoardSchema = z.object({
  boardId: z.string().min(1).max(120),
  reason: z.string().trim().max(1000).optional(),
});
const cancelProjectBoardRevisionSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const resetProjectBoardSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const projectBoardGitSyncSchema = z.object({
  boardId: z.string().min(1).max(120),
  message: z.string().trim().max(500).optional(),
  resolutions: z
    .array(
      z
        .object({
          changeId: z.string().min(1).max(300).optional(),
          entityId: z.string().min(1).max(180).optional(),
          resolution: z.enum(["apply_pulled", "keep_local", "defer"]),
        })
        .refine((value) => Boolean(value.changeId || value.entityId), "A projection resolution needs a changeId or entityId."),
    )
    .max(100)
    .optional(),
});
const projectBoardGitCardClaimSchema = z.object({
  boardId: z.string().min(1).max(120),
  cardId: z.string().min(1).max(120),
});
const projectBoardGitCardClaimReleaseSchema = z.object({
  boardId: z.string().min(1).max(120),
  cardId: z.string().min(1).max(120),
  force: z.boolean().optional(),
  reason: z.string().trim().max(1000).optional(),
});
const resolveProjectBoardSplitDecisionSchema = z.object({
  cardId: z.string().min(1).max(120),
  action: z.enum(["approve_split", "reject_split", "retry_original", "merge_followups", "mark_replaced", "accept_done_via_split"]),
  reason: z.string().trim().max(1000).optional(),
});
const createReadyProjectBoardTasksSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const splitProjectBoardCardSchema = z.object({
  cardId: z.string().min(1).max(120),
});
const createProjectBoardCardSchema = z.object({
  boardId: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(4000).optional(),
});
const attachProjectBoardLocalTaskSchema = z.object({
  taskId: z.string().min(1).max(120),
  mode: z.enum(["attach", "evidence"]),
});
const projectBoardCardTestPlanSchema = z.object({
  unit: z.array(z.string().trim().max(500)).max(20),
  integration: z.array(z.string().trim().max(500)).max(20),
  visual: z.array(z.string().trim().max(500)).max(20),
  manual: z.array(z.string().trim().max(500)).max(20),
});
const projectBoardCardClarificationAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(1500),
  answeredAt: z.string().trim().min(1).max(80),
});
const projectBoardCardClarificationSuggestionSchema = z.object({
  question: z.string().trim().min(1).max(500),
  suggestedAnswer: z.string().trim().min(1).max(1500),
  rationale: z.string().trim().min(1).max(1000),
  confidence: z.enum(["high", "medium", "low"]),
  safeToAccept: z.boolean(),
  questionKind: z.enum(["expert_default", "user_preference", "external_constraint"]),
});
const updateProjectBoardCardSchema = z.object({
  cardId: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(4000).optional(),
  candidateStatus: z.enum(["needs_clarification", "ready_to_create", "evidence", "duplicate", "rejected"]).optional(),
  priority: z.number().int().min(0).max(100).nullable().optional(),
  phase: z.string().trim().max(80).nullable().optional(),
  labels: z.array(z.string().trim().max(60)).max(20).optional(),
  blockedBy: z.array(z.string().trim().max(120)).max(50).optional(),
  acceptanceCriteria: z.array(z.string().trim().max(500)).max(30).optional(),
  testPlan: projectBoardCardTestPlanSchema.optional(),
  sourceRefs: z.array(z.string().trim().max(500)).max(20).optional(),
  clarificationQuestions: z.array(z.string().trim().max(500)).max(8).optional(),
  clarificationSuggestions: z.array(projectBoardCardClarificationSuggestionSchema).max(20).optional(),
  clarificationAnswers: z.array(projectBoardCardClarificationAnswerSchema).max(20).optional(),
});
const updateProjectBoardCardCandidateSchema = z.object({
  cardId: z.string().min(1).max(120),
  candidateStatus: z.enum(["needs_clarification", "ready_to_create", "evidence", "duplicate", "rejected"]),
});
const resolveProjectBoardCardPiUpdateSchema = z.object({
  cardId: z.string().min(1).max(120),
  action: z.enum(["apply", "ignore"]),
});
const addProjectBoardCardRunFeedbackSchema = z.object({
  cardId: z.string().min(1).max(120),
  feedback: z.string().trim().min(1).max(1500),
  source: z.enum(["manual", "decision_impact", "proof_review", "source_impact"]).optional(),
  decisionQuestion: z.string().trim().max(500).optional(),
  decisionAnswer: z.string().trim().max(1500).optional(),
  sourceImpactEventId: z.string().trim().max(120).optional(),
  sourceImpactEventIds: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  sourceIds: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
});
const copyProjectBoardSessionToThreadSchema = z.object({
  cardId: z.string().min(1).max(120),
  runId: z.string().min(1).max(120),
});
const approveProjectBoardCardSchema = z.object({
  cardId: z.string().min(1).max(120),
});
const resolveProjectBoardProofDecisionSchema = z.object({
  cardId: z.string().min(1).max(120),
  action: z.enum(["accept_done", "retry", "mark_blocked"]),
  reason: z.string().trim().max(1000).optional(),
});
const rerunProjectBoardProofSchema = z.object({
  cardId: z.string().min(1).max(120),
  reason: z.string().trim().max(1000).optional(),
});
const resolveProjectBoardDeliverableIntegrationSchema = z.object({
  boardId: z.string().min(1).max(120),
  runId: z.string().min(1).max(120),
  action: z.enum(["apply_to_root", "export_bundle", "defer"]),
  reason: z.string().trim().max(1000).optional(),
});
const recomputeProjectBoardProofCoverageSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const suggestProjectBoardProofSchema = z.object({
  boardId: z.string().min(1).max(120),
  cardIds: z.array(z.string().min(1).max(120)).max(12).optional(),
});
const applyProjectBoardDecisionImpactFeedbackSchema = z.object({
  cardId: z.string().min(1).max(120),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(1500),
});
const refreshProjectBoardDecisionDraftsSchema = z.object({
  cardId: z.string().min(1).max(120),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(1500),
});
const regenerateProjectBoardDecisionDraftsSchema = z.object({
  cardId: z.string().min(1).max(120),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(1500),
});
const refreshProjectBoardSourceDraftsSchema = z.object({
  boardId: z.string().min(1).max(120),
  sourceId: z.string().min(1).max(200).optional(),
  sourceIds: z.array(z.string().min(1).max(200)).max(100).optional(),
  sourceImpactEventId: z.string().min(1).max(120).optional(),
});
const regenerateProjectBoardSourceDraftsSchema = z.object({
  boardId: z.string().min(1).max(120),
  sourceId: z.string().min(1).max(200).optional(),
  sourceIds: z.array(z.string().min(1).max(200)).max(100).optional(),
  sourceImpactEventId: z.string().min(1).max(120).optional(),
});
const applyProjectBoardSourceImpactFeedbackSchema = z.object({
  boardId: z.string().min(1).max(120),
  sourceId: z.string().min(1).max(200).optional(),
  sourceIds: z.array(z.string().min(1).max(200)).max(100).optional(),
  sourceImpactEventId: z.string().min(1).max(120).optional(),
});
const suggestProjectBoardClarificationDefaultsSchema = z.object({
  boardId: z.string().min(1).max(120),
  cardIds: z.array(z.string().min(1).max(120)).max(50).optional(),
});
const suggestProjectBoardKickoffDefaultsSchema = z.object({
  boardId: z.string().min(1).max(120),
  questionIds: z.array(z.string().min(1).max(120)).max(20).optional(),
});
const answerProjectBoardSynthesisProposalQuestionSchema = z.object({
  proposalId: z.string().min(1).max(120),
  questionIndex: z.number().int().min(0).max(100),
  answer: z.string().trim().min(1).max(4000),
});
const reviewProjectBoardSynthesisProposalCardSchema = z.object({
  proposalId: z.string().min(1).max(120),
  sourceId: z.string().trim().min(1).max(180),
  reviewStatus: z.enum(["pending", "accepted", "deferred", "rejected", "merged"]),
  reason: z.string().trim().max(1000).optional(),
  mergeTargetCardId: z.string().trim().min(1).max(120).optional(),
});
const applyProjectBoardSynthesisProposalSchema = z.object({
  proposalId: z.string().min(1).max(120),
  replaceExistingDraft: z.boolean().optional(),
});
const projectBoardSourceKindSchema = z.enum([
  "thread",
  "plan_artifact",
  "architecture_artifact",
  "functional_spec",
  "implementation_plan",
  "report_artifact",
  "workflow_artifact",
  "implementation_file",
  "test_artifact",
  "git_state",
  "ignored",
  "markdown",
]);
const updateProjectBoardSourceSchema = z.object({
  sourceId: z.string().min(1).max(120),
  kind: projectBoardSourceKindSchema,
  includeInSynthesis: z.boolean().optional(),
});
const answerProjectBoardQuestionSchema = z.object({
  questionId: z.string().min(1).max(120),
  answer: z.string().trim().min(1).max(4000),
});
const promotePlannerPlanToBoardSchema = z.object({
  artifactId: z.string().min(1).max(120),
});
const deferProjectBoardSynthesisSectionsSchema = z.object({
  boardId: z.string().min(1).max(120),
  runId: z.string().min(1).max(120),
  reason: z.string().trim().max(1000).optional(),
});
const pauseProjectBoardSynthesisSchema = z.object({
  boardId: z.string().min(1).max(120),
  runId: z.string().min(1).max(120),
  reason: z.string().trim().max(1000).optional(),
});
const seedProjectBoardSemanticIdleDogfoodSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const seedProjectBoardProofJudgmentDogfoodSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const seedProjectBoardCanonicalProjectionDogfoodSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const seedProjectBoardDeliverableIntegrationDogfoodSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const finalizeProjectBoardKickoffSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const refreshProjectBoardSourcesSchema = z.object({
  boardId: z.string().min(1).max(120),
});
const retryProjectBoardSynthesisSchema = z.object({
  boardId: z.string().min(1).max(120),
  retryOfRunId: z.string().min(1).max(120).optional(),
  mode: z.enum(["full", "failed_sections", "stalled_run", "continue_batch", "paused_run", "start_fresh"]).optional(),
});
const abandonProjectBoardSynthesisRunSchema = z
  .object({
    boardId: z.string().min(1),
    runId: z.string().min(1),
    reason: z.string().max(500).optional(),
  })
  .strict();
const refineProjectBoardSynthesisSchema = z.object({
  boardId: z.string().min(1).max(120),
  proposalId: z.string().min(1).max(120).optional(),
  mode: z.enum(["charter_review", "board_synthesis", "source_elaboration"]).optional(),
  sourceIds: z.array(z.string().min(1).max(120)).max(24).optional(),
  objective: z.string().trim().min(1).max(2000).optional(),
});

export function registerProjectBoardCreateIpc({
  handleIpc,
  createProjectBoard,
}: RegisterProjectBoardCreateIpcDependencies): void {
  handleIpc("project-board:create", (_event, raw: CreateProjectBoardInput) => {
    const input = projectBoardCreateSchema.parse(raw);
    return createProjectBoard(input);
  });
}

export function registerProjectBoardLifecycleIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  updateProjectBoardStatus,
  startProjectBoardRevision,
  cancelProjectBoardRevision,
  resetProjectBoard,
}: RegisterProjectBoardLifecycleIpcDependencies<Host>): void {
  handleIpc("project-board:update-status", (_event, raw: UpdateProjectBoardStatusInput) => {
    const input = projectBoardStatusSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    updateProjectBoardStatus(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:revise", (_event, raw: ReviseProjectBoardInput) => {
    const input = reviseProjectBoardSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    startProjectBoardRevision(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:cancel-revision", (_event, raw: CancelProjectBoardRevisionInput) => {
    const input = cancelProjectBoardRevisionSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    cancelProjectBoardRevision(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:reset", (_event, raw: ResetProjectBoardInput) => {
    const input = resetProjectBoardSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    resetProjectBoard(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardGitIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  getProjectBoardGitSyncStatus,
  exportProjectBoardGitArtifacts,
  commitProjectBoardGitArtifacts,
  pushProjectBoardGitArtifacts,
  pullProjectBoardGitArtifacts,
  applyProjectBoardGitProjection,
  claimProjectBoardGitCard,
  releaseProjectBoardGitCardClaim,
  expireProjectBoardGitCardClaim,
  resolveProjectBoardGitCardClaimConflicts,
}: RegisterProjectBoardGitIpcDependencies<Host>): void {
  handleIpc("project-board:git-sync-status", (_event, raw: ProjectBoardGitSyncInput) => {
    const input = projectBoardGitSyncSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return getProjectBoardGitSyncStatus(host, input);
  });

  handleIpc("project-board:git-export", async (_event, raw: ProjectBoardGitSyncInput) => {
    const input = projectBoardGitSyncSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return exportProjectBoardGitArtifacts(host, input);
  });

  handleIpc("project-board:git-commit", async (_event, raw: ProjectBoardGitSyncInput) => {
    const input = projectBoardGitSyncSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return commitProjectBoardGitArtifacts(host, input);
  });

  handleIpc("project-board:git-push", async (_event, raw: ProjectBoardGitSyncInput) => {
    const input = projectBoardGitSyncSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return pushProjectBoardGitArtifacts(host, input);
  });

  handleIpc("project-board:git-pull", async (_event, raw: ProjectBoardGitSyncInput) => {
    const input = projectBoardGitSyncSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return pullProjectBoardGitArtifacts(host, input);
  });

  handleIpc("project-board:git-apply-pulled", async (_event, raw: ProjectBoardGitSyncInput) => {
    const input = projectBoardGitSyncSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return applyProjectBoardGitProjection(host, input);
  });

  handleIpc("project-board:git-claim-card", async (_event, raw: ProjectBoardGitCardClaimInput) => {
    const input = projectBoardGitCardClaimSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return claimProjectBoardGitCard(host, input);
  });

  handleIpc("project-board:git-release-card-claim", async (_event, raw: ProjectBoardGitCardClaimReleaseInput) => {
    const input = projectBoardGitCardClaimReleaseSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return releaseProjectBoardGitCardClaim(host, input);
  });

  handleIpc("project-board:git-expire-card-claim", async (_event, raw: ProjectBoardGitCardClaimReleaseInput) => {
    const input = projectBoardGitCardClaimReleaseSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return expireProjectBoardGitCardClaim(host, input);
  });

  handleIpc("project-board:git-resolve-card-claim-conflicts", async (_event, raw: ProjectBoardGitCardClaimReleaseInput) => {
    const input = projectBoardGitCardClaimReleaseSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return resolveProjectBoardGitCardClaimConflicts(host, input);
  });
}

export function registerProjectBoardCardIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  requireProjectRuntimeHostForProjectBoardCard,
  requireProjectRuntimeHostForOrchestrationTask,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  setProjectHostActiveThreadId,
  resolveProjectBoardSplitDecision,
  createReadyProjectBoardTasks,
  isAutoDispatchEnabled,
  scheduleAutoDispatch,
  splitProjectBoardCard,
  createProjectBoardCard,
  attachProjectBoardLocalTask,
  updateProjectBoardCard,
  updateProjectBoardCardCandidate,
  resolveProjectBoardCardPiUpdate,
  addProjectBoardCardRunFeedback,
  copyProjectBoardSessionToThread,
}: RegisterProjectBoardCardIpcDependencies<Host>): void {
  handleIpc("project-board:resolve-split-decision", (_event, raw: ResolveProjectBoardSplitDecisionInput) => {
    const input = resolveProjectBoardSplitDecisionSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    resolveProjectBoardSplitDecision(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:create-ready-tasks", (_event, raw: CreateReadyProjectBoardTasksInput) => {
    const input = createReadyProjectBoardTasksSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    const ticketizedCount = createReadyProjectBoardTasks(host, input);
    if (ticketizedCount > 0 && isAutoDispatchEnabled(host)) scheduleAutoDispatch(host);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:split-card", (_event, raw: SplitProjectBoardCardInput) => {
    const input = splitProjectBoardCardSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    splitProjectBoardCard(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:create-card", (_event, raw: CreateProjectBoardCardInput) => {
    const input = createProjectBoardCardSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    createProjectBoardCard(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:attach-local-task", (_event, raw: AttachProjectBoardLocalTaskInput) => {
    const input = attachProjectBoardLocalTaskSchema.parse(raw);
    const host = requireProjectRuntimeHostForOrchestrationTask(input.taskId);
    attachProjectBoardLocalTask(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:update-card", (_event, raw: UpdateProjectBoardCardInput) => {
    const input = updateProjectBoardCardSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    updateProjectBoardCard(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:update-card-candidate", (_event, raw: UpdateProjectBoardCardCandidateInput) => {
    const input = updateProjectBoardCardCandidateSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    updateProjectBoardCardCandidate(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:resolve-card-pi-update", (_event, raw: ResolveProjectBoardCardPiUpdateInput) => {
    const input = resolveProjectBoardCardPiUpdateSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    resolveProjectBoardCardPiUpdate(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:add-run-feedback", (_event, raw: AddProjectBoardCardRunFeedbackInput) => {
    const input = addProjectBoardCardRunFeedbackSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    addProjectBoardCardRunFeedback(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:copy-session-to-thread", (_event, raw: CopyProjectBoardSessionToThreadInput) => {
    const input = copyProjectBoardSessionToThreadSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    const thread = copyProjectBoardSessionToThread(host, input);
    setProjectHostActiveThreadId(host, thread.id);
    emitProjectStateIfActive(host, thread.id);
    return readStateForProjectHostAction(host, thread.id);
  });
}

export function registerProjectBoardProofIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  requireProjectRuntimeHostForProjectBoardCard,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  approveProjectBoardCard,
  resolveProjectBoardProofDecision,
  isAutoDispatchEnabled,
  scheduleAutoDispatch,
  rerunProjectBoardProof,
  resolveProjectBoardDeliverableIntegration,
  recomputeProjectBoardProofCoverage,
  suggestProjectBoardProof,
}: RegisterProjectBoardProofIpcDependencies<Host>): void {
  handleIpc("project-board:approve-card", (_event, raw: ApproveProjectBoardCardInput) => {
    const input = approveProjectBoardCardSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    const approved = approveProjectBoardCard(host, input);
    if (approved.orchestrationTaskId && isAutoDispatchEnabled(host)) scheduleAutoDispatch(host);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:resolve-proof-decision", (_event, raw: ResolveProjectBoardProofDecisionInput) => {
    const input = resolveProjectBoardProofDecisionSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    const card = resolveProjectBoardProofDecision(host, input);
    if (input.action === "retry" && card.orchestrationTaskId && isAutoDispatchEnabled(host)) scheduleAutoDispatch(host);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:rerun-proof", async (_event, raw: RerunProjectBoardProofInput) => {
    const input = rerunProjectBoardProofSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    await rerunProjectBoardProof(host, input, () => emitProjectStateIfActive(host));
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:resolve-deliverable-integration", async (_event, raw: ResolveProjectBoardDeliverableIntegrationInput) => {
    const input = resolveProjectBoardDeliverableIntegrationSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    await resolveProjectBoardDeliverableIntegration(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:recompute-proof-coverage", (_event, raw: RecomputeProjectBoardProofCoverageInput) => {
    const input = recomputeProjectBoardProofCoverageSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    recomputeProjectBoardProofCoverage(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:suggest-proof", async (_event, raw: SuggestProjectBoardProofInput) => {
    const input = suggestProjectBoardProofSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    await suggestProjectBoardProof(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardFeedbackIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  requireProjectRuntimeHostForProjectBoardCard,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  applyProjectBoardDecisionImpactFeedback,
  refreshProjectBoardDecisionDrafts,
  regenerateProjectBoardDecisionDrafts,
  refreshProjectBoardSourceDrafts,
  regenerateProjectBoardSourceDrafts,
  applyProjectBoardSourceImpactFeedback,
}: RegisterProjectBoardFeedbackIpcDependencies<Host>): void {
  handleIpc("project-board:apply-decision-impact-feedback", (_event, raw: ApplyProjectBoardDecisionImpactFeedbackInput) => {
    const input = applyProjectBoardDecisionImpactFeedbackSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    applyProjectBoardDecisionImpactFeedback(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:refresh-decision-drafts", (_event, raw: RefreshProjectBoardDecisionDraftsInput) => {
    const input = refreshProjectBoardDecisionDraftsSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    refreshProjectBoardDecisionDrafts(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:regenerate-decision-drafts", async (_event, raw: RegenerateProjectBoardDecisionDraftsInput) => {
    const input = regenerateProjectBoardDecisionDraftsSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardCard(input.cardId);
    await regenerateProjectBoardDecisionDrafts(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:refresh-source-drafts", (_event, raw: RefreshProjectBoardSourceDraftsInput) => {
    const input = refreshProjectBoardSourceDraftsSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    refreshProjectBoardSourceDrafts(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:regenerate-source-drafts", async (_event, raw: RegenerateProjectBoardSourceDraftsInput) => {
    const input = regenerateProjectBoardSourceDraftsSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    await regenerateProjectBoardSourceDrafts(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:apply-source-impact-feedback", (_event, raw: ApplyProjectBoardSourceImpactFeedbackInput) => {
    const input = applyProjectBoardSourceImpactFeedbackSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    applyProjectBoardSourceImpactFeedback(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardDefaultsIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  suggestProjectBoardClarificationDefaults,
  suggestProjectBoardKickoffDefaults,
}: RegisterProjectBoardDefaultsIpcDependencies<Host>): void {
  handleIpc("project-board:suggest-clarification-defaults", async (_event, raw: SuggestProjectBoardClarificationDefaultsInput) => {
    const input = suggestProjectBoardClarificationDefaultsSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    await suggestProjectBoardClarificationDefaults(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:suggest-kickoff-defaults", async (_event, raw: SuggestProjectBoardKickoffDefaultsInput) => {
    const input = suggestProjectBoardKickoffDefaultsSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    await suggestProjectBoardKickoffDefaults(host, input);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardProposalIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoardSynthesisProposal,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  answerProjectBoardSynthesisProposalQuestion,
  reviewProjectBoardSynthesisProposalCard,
  applyProjectBoardSynthesisProposal,
}: RegisterProjectBoardProposalIpcDependencies<Host>): void {
  handleIpc("project-board:answer-synthesis-proposal-question", (_event, raw: AnswerProjectBoardSynthesisProposalQuestionInput) => {
    const input = answerProjectBoardSynthesisProposalQuestionSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardSynthesisProposal(input.proposalId);
    answerProjectBoardSynthesisProposalQuestion(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:review-synthesis-proposal-card", (_event, raw: ReviewProjectBoardSynthesisProposalCardInput) => {
    const input = reviewProjectBoardSynthesisProposalCardSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardSynthesisProposal(input.proposalId);
    reviewProjectBoardSynthesisProposalCard(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:apply-synthesis-proposal", (_event, raw: ApplyProjectBoardSynthesisProposalInput) => {
    const input = applyProjectBoardSynthesisProposalSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardSynthesisProposal(input.proposalId);
    applyProjectBoardSynthesisProposal(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardSourceQuestionIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoardSource,
  requireProjectRuntimeHostForProjectBoardQuestion,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  updateProjectBoardSource,
  answerProjectBoardQuestion,
}: RegisterProjectBoardSourceQuestionIpcDependencies<Host>): void {
  handleIpc("project-board:update-source", (_event, raw: UpdateProjectBoardSourceInput) => {
    const input = updateProjectBoardSourceSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardSource(input.sourceId);
    updateProjectBoardSource(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:answer-question", (_event, raw: AnswerProjectBoardQuestionInput) => {
    const input = answerProjectBoardQuestionSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoardQuestion(input.questionId);
    answerProjectBoardQuestion(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardPromoteIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForPlannerPlanArtifact,
  assertProjectBoardMutationAllowedForActiveThread,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  promotePlannerPlanToBoard,
}: RegisterProjectBoardPromoteIpcDependencies<Host>): void {
  handleIpc("project-board:promote-plan", (_event, raw: PromotePlannerPlanToBoardInput) => {
    const input = promotePlannerPlanToBoardSchema.parse(raw);
    const host = requireProjectRuntimeHostForPlannerPlanArtifact(input.artifactId);
    assertProjectBoardMutationAllowedForActiveThread(host, "add a plan to a project board");
    promotePlannerPlanToBoard(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardDeferIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  deferProjectBoardSynthesisSections,
}: RegisterProjectBoardDeferIpcDependencies<Host>): void {
  handleIpc("project-board:defer-synthesis-sections", (_event, raw: DeferProjectBoardSynthesisSectionsInput) => {
    const input = deferProjectBoardSynthesisSectionsSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    deferProjectBoardSynthesisSections(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardPauseIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  pauseProjectBoardSynthesis,
}: RegisterProjectBoardPauseIpcDependencies<Host>): void {
  handleIpc("project-board:pause-synthesis", (_event, raw: PauseProjectBoardSynthesisInput) => {
    const input = pauseProjectBoardSynthesisSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    pauseProjectBoardSynthesis(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerProjectBoardDogfoodIpc<Host>({
  handleIpc,
  requireProjectBoardDogfoodTestHook,
  requireProjectRuntimeHostForProjectBoard,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  seedProjectBoardSemanticIdleDogfood,
  seedProjectBoardProofJudgmentDogfood,
  seedProjectBoardCanonicalProjectionDogfood,
  seedProjectBoardDeliverableIntegrationDogfood,
}: RegisterProjectBoardDogfoodIpcDependencies<Host>): void {
  handleIpc("project-board:dogfood-seed-semantic-idle-section", (_event, raw: SeedProjectBoardSemanticIdleDogfoodInput) => {
    requireProjectBoardDogfoodTestHook("project-board:dogfood-seed-semantic-idle-section");
    const input = seedProjectBoardSemanticIdleDogfoodSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    seedProjectBoardSemanticIdleDogfood(host, input);
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });

  handleIpc("project-board:dogfood-seed-proof-judgment", (_event, raw: SeedProjectBoardProofJudgmentDogfoodInput) => {
    requireProjectBoardDogfoodTestHook("project-board:dogfood-seed-proof-judgment");
    const input = seedProjectBoardProofJudgmentDogfoodSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return seedProjectBoardProofJudgmentDogfood(host, input);
  });

  handleIpc("project-board:dogfood-seed-canonical-projection", (_event, raw: SeedProjectBoardCanonicalProjectionDogfoodInput) => {
    requireProjectBoardDogfoodTestHook("project-board:dogfood-seed-canonical-projection");
    const input = seedProjectBoardCanonicalProjectionDogfoodSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return seedProjectBoardCanonicalProjectionDogfood(host, input);
  });

  handleIpc("project-board:dogfood-seed-deliverable-integration", (_event, raw: SeedProjectBoardDeliverableIntegrationDogfoodInput) => {
    requireProjectBoardDogfoodTestHook("project-board:dogfood-seed-deliverable-integration");
    const input = seedProjectBoardDeliverableIntegrationDogfoodSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return seedProjectBoardDeliverableIntegrationDogfood(host, input);
  });
}

export function registerProjectBoardKickoffIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  finalizeProjectBoardKickoff,
}: RegisterProjectBoardKickoffIpcDependencies<Host>): void {
  handleIpc("project-board:finalize-kickoff", (_event, raw: FinalizeProjectBoardKickoffInput) => {
    const input = finalizeProjectBoardKickoffSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return finalizeProjectBoardKickoff(host, input);
  });
}

export function registerProjectBoardSourceRefreshIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  refreshProjectBoardSources,
}: RegisterProjectBoardSourceRefreshIpcDependencies<Host>): void {
  handleIpc("project-board:refresh-sources", (_event, raw: RefreshProjectBoardSourcesInput) => {
    const input = refreshProjectBoardSourcesSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return refreshProjectBoardSources(host, input);
  });
}

export function registerProjectBoardSynthesisRetryIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  retryProjectBoardSynthesis,
  abandonProjectBoardSynthesisRun,
}: RegisterProjectBoardSynthesisRetryIpcDependencies<Host>): void {
  handleIpc("project-board:retry-synthesis", (_event, raw: RetryProjectBoardSynthesisInput) => {
    const input = retryProjectBoardSynthesisSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return retryProjectBoardSynthesis(host, input);
  });
  handleIpc("project-board:abandon-synthesis-run", (_event, raw: { boardId: string; runId: string; reason?: string }) => {
    const input = abandonProjectBoardSynthesisRunSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return abandonProjectBoardSynthesisRun(host, input);
  });
}

export function registerProjectBoardSynthesisRefinementIpc<Host>({
  handleIpc,
  requireProjectRuntimeHostForProjectBoard,
  refineProjectBoardSynthesis,
}: RegisterProjectBoardSynthesisRefinementIpcDependencies<Host>): void {
  handleIpc("project-board:refine-synthesis", (_event, raw: RefineProjectBoardSynthesisInput) => {
    const input = refineProjectBoardSynthesisSchema.parse(raw);
    const host = requireProjectRuntimeHostForProjectBoard(input.boardId);
    return refineProjectBoardSynthesis(host, input);
  });
}
