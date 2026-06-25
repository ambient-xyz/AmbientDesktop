import type { OrchestrationRun, OrchestrationTask, ResolveOrchestrationWorkflowImpactAction } from "../../shared/workflowTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  CopyProjectBoardSessionToThreadInput,
  RecomputeProjectBoardProofCoverageInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardProofReview,
  ProjectBoardCardTestPlan,
  ProjectBoardCharter,
  ProjectBoardCharterProjectSummary,
  ProjectBoardProofDecisionAction,
  ProjectBoardPmReviewReport,
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSourceKind,
  ProjectBoardStatus,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
  ProjectBoardSummary,
  ProjectBoardSplitDecisionAction,
} from "../../shared/projectBoardTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { ProjectBoardDeliverableIntegrationAction } from "../../shared/projectBoardDeliverables";
import type { ApplyProjectBoardClarificationDefaultSuggestionsInput } from "./projectBoardClarificationDefaultRepository";
import type { ProjectBoardDependencyArtifactImportResult } from "./projectBoardMappers";
import type { ApplyProjectBoardKickoffDefaultSuggestionsInput } from "./projectBoardQuestionRepository";
import type { ProjectStoreProjectBoardRepositoryFactory } from "./projectBoardRepositoryFactory";
import type {
  ProjectBoardProofReviewContext,
  ProjectBoardRow,
  ProjectBoardSourceClassificationInput,
  ProjectBoardSourceInput,
  ProjectBoardSynthesisApplyOptions,
  StageProjectBoardDecisionDraftPiUpdatesInput,
  StageProjectBoardSourceDraftPiUpdatesInput,
} from "./projectStoreFacadeHelpers";
import type {
  ProjectBoardArtifactProjection,
  ProjectBoardProofSuggestion,
  ProjectBoardSynthesisDraft,
  ProjectBoardTaskToolAction,
  ProjectBoardTaskToolActionTransport,
} from "./projectStoreProjectBoardFacade";
import type { ProjectStoreRepositoryFactory } from "./projectStoreRepositoryFactory";

abstract class ProjectStoreProjectBoardFacadeBase {
  protected abstract readonly projectBoardRepos: ProjectStoreProjectBoardRepositoryFactory;
  protected abstract readonly repos: ProjectStoreRepositoryFactory;

  abstract getWorkspace(): WorkspaceState;
}

export abstract class ProjectStoreProjectBoardSynthesisFacadeMethods extends ProjectStoreProjectBoardFacadeBase {
  getActiveProjectBoard(sourceThreadId?: string): ProjectBoardSummary | undefined {
    return this.getProjectBoardForPath(this.getWorkspace().path, sourceThreadId);
  }

  getProjectBoardForPath(projectPath: string, sourceThreadId?: string): ProjectBoardSummary | undefined {
    let row = this.projectBoardRepos.projectBoards().findActiveProjectBoardRow(projectPath, sourceThreadId);
    if (row && this.reconcileCompactPlannerPlanDraftBoard(row)) {
      row = this.projectBoardRepos.projectBoards().getProjectBoardRow(row.id);
    }
    return row ? this.projectBoardRepos.projectBoards().mapProjectBoard(row) : undefined;
  }

  getProjectBoard(boardId: string): ProjectBoardSummary | undefined {
    const row = this.projectBoardRepos.projectBoards().getProjectBoardRow(boardId);
    return row ? this.projectBoardRepos.projectBoards().mapProjectBoard(row) : undefined;
  }

  private reconcileCompactPlannerPlanDraftBoard(boardRow: ProjectBoardRow): boolean {
    return this.projectBoardRepos.projectBoardCompactPlannerPlans().reconcileCompactPlannerPlanDraftBoard(boardRow);
  }

  applyProjectBoardArtifactProjection(projectPath: string, projection: ProjectBoardArtifactProjection): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardArtifactProjections().applyProjectBoardArtifactProjection(projectPath, projection);
  }

  createProjectBoard(
    input: { title?: string; summary?: string; replaceActive?: boolean; sourceThreadId?: string } = {},
  ): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().createProjectBoard(input);
  }

  /** The compact durable-plan card covering this board's whole scope, if it is
   * already ticketized or executing. While such a card is in flight, an automatic
   * planning pass can only propose duplicate step cards for work already underway. */
  projectBoardExecutingPlannerPlanCard(boardId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardPlannerPlanPromotions().projectBoardExecutingPlannerPlanCard(boardId);
  }

  /** Records the park decision and returns the in-flight plan card, or undefined when
   * the automatic planning pass may proceed. */
  parkAutomaticPlanningForExecutingPlanCard(boardId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardPlannerPlanPromotions().parkAutomaticPlanningForExecutingPlanCard(boardId);
  }

  applyProjectBoardSynthesis(
    boardId: string,
    synthesis: ProjectBoardSynthesisDraft,
    options: ProjectBoardSynthesisApplyOptions = {},
  ): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSynthesisApply().applyProjectBoardSynthesis(boardId, synthesis, options);
  }

  createProjectBoardSynthesisProposal(input: {
    boardId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().createProjectBoardSynthesisProposal(input);
  }

  updateProjectBoardSynthesisProposal(input: {
    proposalId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().updateProjectBoardSynthesisProposal(input);
  }

  getProjectBoardSynthesisProposal(proposalId: string): ProjectBoardSynthesisProposal | undefined {
    return this.projectBoardRepos.projectBoardSynthesisProposals().getProjectBoardSynthesisProposal(proposalId);
  }

  getLatestPendingProjectBoardSynthesisProposal(boardId: string): ProjectBoardSynthesisProposal | undefined {
    return this.projectBoardRepos.projectBoardSynthesisProposals().getLatestPendingProjectBoardSynthesisProposal(boardId);
  }

  createProjectBoardSynthesisRun(input: {
    boardId: string;
    model?: string;
    retryOfRunId?: string;
    initialStage?: ProjectBoardSynthesisRunStage;
    initialTitle?: string;
    initialSummary?: string;
    initialMetadata?: Record<string, unknown>;
    sourceCount?: number;
    includedSourceCount?: number;
    sourceCharCount?: number;
  }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().createProjectBoardSynthesisRun(input);
  }

  getProjectBoardSynthesisRun(runId: string): ProjectBoardSynthesisRun | undefined {
    return this.projectBoardRepos.projectBoardSynthesisRuns().getProjectBoardSynthesisRun(runId);
  }

  getRunningProjectBoardSynthesisRun(
    boardId: string,
    input: { excludeStages?: ProjectBoardSynthesisRunStage[] } = {},
  ): ProjectBoardSynthesisRun | undefined {
    return this.projectBoardRepos.projectBoardSynthesisRuns().getRunningProjectBoardSynthesisRun(boardId, input);
  }

  failStaleProjectBoardSynthesisRuns(input: { boardId: string; staleBefore: string; reason: string }): ProjectBoardSynthesisRun[] {
    return this.projectBoardRepos.projectBoardSynthesisRuns().failStaleProjectBoardSynthesisRuns(input);
  }

  markProjectBoardSynthesisRunStalled(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().markProjectBoardSynthesisRunStalled(input);
  }

  requestProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().requestProjectBoardSynthesisRunPause(input);
  }

  markProjectBoardSynthesisRunPaused(input: {
    boardId: string;
    runId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().markProjectBoardSynthesisRunPaused(input);
  }

  abandonProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().abandonProjectBoardSynthesisRunPause(input);
  }

  supersedeProjectBoardSynthesisCardsForStartFresh(input: { boardId: string; runId: string; reason?: string }): {
    supersededDraftCardIds: string[];
    demotedPreservedCardIds: string[];
    preservedCardIds: string[];
  } {
    return this.projectBoardRepos.projectBoardSynthesisStartFresh().supersedeProjectBoardSynthesisCardsForStartFresh(input);
  }

  recordProjectBoardSynthesisRunEvent(
    runId: string,
    input: {
      stage: ProjectBoardSynthesisRunStage;
      title: string;
      summary: string;
      metadata?: Record<string, unknown>;
      status?: ProjectBoardSynthesisRunStatus;
      proposalId?: string;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
      error?: string;
      completedAt?: string;
      skipPlanningSnapshot?: boolean;
    },
  ): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().recordProjectBoardSynthesisRunEvent(runId, input);
  }

  updateProjectBoardSynthesisRunProgress(
    runId: string,
    input: {
      stage?: ProjectBoardSynthesisRunStage;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
    },
  ): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().updateProjectBoardSynthesisRunProgress(runId, input);
  }

  tryUpdateProjectBoardSynthesisRunProgress(
    runId: string,
    input: {
      stage?: ProjectBoardSynthesisRunStage;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
    },
  ): ProjectBoardSynthesisRun | undefined {
    return this.projectBoardRepos.projectBoardSynthesisRuns().tryUpdateProjectBoardSynthesisRunProgress(runId, input);
  }

  recordProjectBoardSynthesisRunProgressiveRecords(
    runId: string,
    records: ProjectBoardSynthesisRunProgressiveRecord[],
    input: { title?: string; summary?: string } = {},
  ): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().recordProjectBoardSynthesisRunProgressiveRecords(runId, records, input);
  }

  recordProjectBoardPlanningSnapshotForRun(
    runId: string,
    kind: ProjectBoardPlanningSnapshotKind = "manual",
  ): ProjectBoardPlanningSnapshot | undefined {
    return this.projectBoardRepos.projectBoardPlanningSnapshots().recordProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  private appendProjectBoardPlanningSnapshotForRun(
    runId: string,
    kind: ProjectBoardPlanningSnapshotKind,
  ): ProjectBoardPlanningSnapshot | undefined {
    return this.projectBoardRepos.projectBoardPlanningSnapshots().appendProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  private latestStableProjectBoardPlanningSnapshot(boardId: string): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined {
    return this.projectBoardRepos.projectBoardPlanningSnapshots().latestStableProjectBoardPlanningSnapshot(boardId);
  }

  answerProjectBoardSynthesisProposalQuestion(input: {
    proposalId: string;
    questionIndex: number;
    answer: string;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().answerProjectBoardSynthesisProposalQuestion(input);
  }

  reviewProjectBoardSynthesisProposalCard(input: {
    proposalId: string;
    sourceId: string;
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus;
    reason?: string;
    mergeTargetCardId?: string;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().reviewProjectBoardSynthesisProposalCard(input);
  }

  applyProjectBoardSynthesisProposal(input: { proposalId: string; replaceExistingDraft?: boolean }): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSynthesisApply().applyProjectBoardSynthesisProposal(input);
  }
}

export abstract class ProjectStoreProjectBoardCardFacadeMethods extends ProjectStoreProjectBoardSynthesisFacadeMethods {
  updateProjectBoardStatus(boardId: string, status: ProjectBoardStatus): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().updateProjectBoardStatus(boardId, status);
  }

  resetProjectBoard(boardId: string): void {
    this.projectBoardRepos.projectBoardLifecycle().resetProjectBoard(boardId);
  }

  startProjectBoardRevision(input: { boardId: string; reason?: string }): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().startProjectBoardRevision(input);
  }

  cancelProjectBoardRevision(boardId: string): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().cancelProjectBoardRevision(boardId);
  }

  promotePlannerPlanToBoard(artifactId: string): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardPlannerPlanPromotions().promotePlannerPlanToBoard(artifactId);
  }

  getProjectBoardCard(cardId: string): ProjectBoardCard {
    return this.projectBoardRepos.projectBoards().getProjectBoardCard(cardId);
  }

  private tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoards().tryGetProjectBoardCard(cardId);
  }

  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoards().getProjectBoardCardForOrchestrationTask(taskId);
  }

  refreshProjectBoardTaskDescriptionForTask(taskId: string): OrchestrationTask | undefined {
    return this.repos.projectBoardLinkedTasks().refreshProjectBoardTaskDescriptionForTask(taskId);
  }

  private updateOrchestrationTaskDescription(taskId: string, description: string): void {
    this.repos.orchestration().updateOrchestrationTask({ id: taskId, description });
  }

  getProjectBoardCardForExecutionThread(threadId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoards().getProjectBoardCardForExecutionThread(threadId);
  }

  getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId: string): string[] {
    const card = this.getProjectBoardCardForExecutionThread(threadId);
    if (!card) return [];
    return this.projectBoardRepos.projectBoardDependencyExecutionContexts().projectBoardDependencyWorkspacePathsForCard(card);
  }

  async importProjectBoardDependencyArtifactsForTask(input: {
    taskId: string;
    workspacePath: string;
    createdAt?: string;
  }): Promise<ProjectBoardDependencyArtifactImportResult> {
    return this.projectBoardRepos.projectBoardDependencyArtifacts().importProjectBoardDependencyArtifactsForTask(input);
  }

  getProjectBoardProofReviewContextForRun(runId: string): ProjectBoardProofReviewContext | undefined {
    return this.projectBoardRepos.projectBoardRunProgress().getProjectBoardProofReviewContextForRun(runId);
  }

  recordProjectBoardCardRunProgressEvent(input: {
    boardId: string;
    cardId: string;
    runId: string;
    title: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.projectBoardRepos.projectBoardRunProgress().recordProjectBoardCardRunProgressEvent(input);
  }

  recordProjectBoardTaskToolAction(input: {
    runId: string;
    cardId: string;
    taskId?: string;
    action: ProjectBoardTaskToolAction;
    toolName?: string;
    source?: ProjectBoardTaskToolActionTransport;
  }): OrchestrationRun | undefined {
    return this.projectBoardRepos.projectBoardRunProgress().recordProjectBoardTaskToolAction(input);
  }

  isProjectBoardProofReviewRunCurrent(runId: string, requireCurrentReview = false): boolean {
    return this.projectBoardRepos.projectBoardCardMutations().isProjectBoardProofReviewRunCurrent(runId, requireCurrentReview);
  }

  applyProjectBoardCardProofReview(input: {
    runId: string;
    review: ProjectBoardCardProofReview;
    requireCurrentReview?: boolean;
    allowStaleRun?: boolean;
  }): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardCardMutations().applyProjectBoardCardProofReview(input);
  }

  beginProjectBoardCardRun(input: { runId: string }): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardRunProgress().beginProjectBoardCardRun(input);
  }

  recomputeProjectBoardProofCoverage(input: RecomputeProjectBoardProofCoverageInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardProofSuggestions().recomputeProjectBoardProofCoverage(input);
  }

  applyProjectBoardClarificationDefaultSuggestions(input: ApplyProjectBoardClarificationDefaultSuggestionsInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardClarificationDefaults().applyProjectBoardClarificationDefaultSuggestions(input);
  }

  applyProjectBoardProofSuggestions(input: {
    boardId: string;
    suggestions: ProjectBoardProofSuggestion[];
    targetCardIds?: string[];
    model?: string;
    telemetry?: { promptCharCount?: number; responseCharCount?: number; requestDurationMs?: number };
    fallbackUsed?: boolean;
    providerError?: string;
  }): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardProofSuggestions().applyProjectBoardProofSuggestions(input);
  }

  resolveProjectBoardProofDecision(input: { cardId: string; action: ProjectBoardProofDecisionAction; reason?: string }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().resolveProjectBoardProofDecision(input);
  }

  async resolveProjectBoardDeliverableIntegration(input: {
    boardId: string;
    runId: string;
    action: ProjectBoardDeliverableIntegrationAction;
    reason?: string;
  }): Promise<void> {
    return this.projectBoardRepos.projectBoardDeliverableIntegrations().resolveProjectBoardDeliverableIntegration(input);
  }

  resolveProjectBoardSplitDecision(input: { cardId: string; action: ProjectBoardSplitDecisionAction; reason?: string }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().resolveProjectBoardSplitDecision(input);
  }

  ensureProjectBoardCardExecutionThreadForTask(input: { taskId: string; workspacePath: string }): ThreadSummary | undefined {
    return this.projectBoardRepos.projectBoardCardExecutionSessions().ensureProjectBoardCardExecutionThreadForTask(input);
  }

  copyProjectBoardSessionToThread(input: CopyProjectBoardSessionToThreadInput): ThreadSummary {
    return this.projectBoardRepos.projectBoardSessionCopies().copyProjectBoardSessionToThread(input);
  }

  recordProjectBoardExecutionReadinessBlocker(input: {
    boardId: string;
    source: "auto_dispatch" | "manual_prepare";
    blocker: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error";
    title: string;
    summary: string;
    workflowPath?: string;
    error?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    return this.projectBoardRepos.projectBoardExecutionReadiness().recordProjectBoardExecutionReadinessBlocker(input);
  }

  recordProjectBoardWorkflowCreated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    source: "auto_dispatch" | "manual_prepare" | "preparation" | "scheduled_preparation";
    workspaceStrategy?: "git-worktree" | "directory";
    autoDispatch?: boolean;
    maxConcurrentAgents?: number;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowCreated(input);
  }

  recordProjectBoardWorkflowRepair(input: {
    boardId: string;
    action: "restore_generated_default" | "use_existing_anyway";
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowRepair(input);
  }

  recordProjectBoardWorkflowSettingsUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changedFields: string[];
    diff?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowSettingsUpdated(input);
  }

  recordProjectBoardWorkflowRawUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changed: boolean;
    diff?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowRawUpdated(input);
  }

  resolveProjectBoardWorkflowImpact(input: {
    boardId: string;
    action: ResolveOrchestrationWorkflowImpactAction;
    runIds: string[];
    workflowPath?: string;
    workflowHash?: string;
    createdAt?: string;
  }): { clearedRunIds: string[]; skippedRuns: { runId: string; reason: string }[] } {
    return this.projectBoardRepos.projectBoardWorkflows().resolveProjectBoardWorkflowImpact(input);
  }

  approveProjectBoardCard(cardId: string): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().approveProjectBoardCard(cardId);
  }

  createReadyProjectBoardTasks(boardId: string): ProjectBoardCard[] {
    return this.projectBoardRepos.projectBoardCardMutations().createReadyProjectBoardTasks(boardId);
  }

  splitProjectBoardCard(cardId: string): ProjectBoardCard[] {
    return this.projectBoardRepos.projectBoardCardMutations().splitProjectBoardCard(cardId);
  }

  createProjectBoardManualCard(input: { boardId: string; title?: string; description?: string }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().createManualCard(input);
  }

  attachLocalTaskToProjectBoard(input: { taskId: string; mode: "attach" | "evidence" }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().attachLocalTaskToProjectBoard(input);
  }

  updateProjectBoardCard(input: {
    cardId: string;
    title?: string;
    description?: string;
    candidateStatus?: ProjectBoardCardCandidateStatus;
    priority?: number | null;
    phase?: string | null;
    labels?: string[];
    blockedBy?: string[];
    acceptanceCriteria?: string[];
    testPlan?: ProjectBoardCardTestPlan;
    sourceRefs?: string[];
    clarificationQuestions?: string[];
    clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
    clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
    clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().updateCard(input);
  }

  updateProjectBoardCardCandidateStatus(
    cardId: string,
    candidateStatus: ProjectBoardCardCandidateStatus,
    options: { actor?: "user" | "system"; reason?: string; relatedCardId?: string } = {},
  ): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().updateCardCandidateStatus(cardId, candidateStatus, options);
  }

  resolveProjectBoardCardPiUpdate(input: { cardId: string; action: "apply" | "ignore" }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().resolvePiUpdate(input);
  }

  addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().addRunFeedback(input);
  }

  applyProjectBoardDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().applyDecisionImpactFeedback(input);
  }

  refreshProjectBoardDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().refreshDecisionDrafts(input);
  }

  stageProjectBoardSourceDraftPiUpdates(input: StageProjectBoardSourceDraftPiUpdatesInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSources().stageProjectBoardSourceDraftPiUpdates(input);
  }

  stageProjectBoardDecisionDraftPiUpdates(input: StageProjectBoardDecisionDraftPiUpdatesInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().stageDecisionDraftPiUpdates(input);
  }

  refreshProjectBoardSourceDrafts(input: RefreshProjectBoardSourceDraftsInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSources().refreshProjectBoardSourceDrafts(input);
  }

  applyProjectBoardSourceImpactFeedback(input: ApplyProjectBoardSourceImpactFeedbackInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSources().applyProjectBoardSourceImpactFeedback(input);
  }

  replaceProjectBoardSources(boardId: string, sources: ProjectBoardSourceInput[]): ProjectBoardSource[] {
    return this.projectBoardRepos.projectBoardSources().replaceProjectBoardSources(boardId, sources);
  }

  getProjectBoardSource(sourceId: string): ProjectBoardSource {
    return this.projectBoardRepos.projectBoardSources().getProjectBoardSource(sourceId);
  }

  updateProjectBoardSource(input: { sourceId: string; kind: ProjectBoardSourceKind; includeInSynthesis?: boolean }): ProjectBoardSource {
    return this.projectBoardRepos.projectBoardSources().updateProjectBoardSource(input);
  }

  applyProjectBoardSourceClassifications(boardId: string, inputs: ProjectBoardSourceClassificationInput[]): ProjectBoardSource[] {
    return this.projectBoardRepos.projectBoardSources().applyProjectBoardSourceClassifications(boardId, inputs);
  }
}

export abstract class ProjectStoreProjectBoardQuestionFacadeMethods extends ProjectStoreProjectBoardCardFacadeMethods {
  ensureProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    return this.projectBoardRepos.projectBoardQuestions().ensureProjectBoardQuestions(boardId);
  }

  getProjectBoardQuestion(questionId: string): ProjectBoardQuestion {
    return this.projectBoardRepos.projectBoardQuestions().getProjectBoardQuestion(questionId);
  }

  answerProjectBoardQuestion(questionId: string, answer: string): ProjectBoardQuestion {
    return this.projectBoardRepos.projectBoardQuestions().answerProjectBoardQuestion(questionId, answer);
  }

  applyProjectBoardKickoffDefaultSuggestions(input: ApplyProjectBoardKickoffDefaultSuggestionsInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardQuestions().applyProjectBoardKickoffDefaultSuggestions(input);
  }

  finalizeProjectBoardKickoff(boardId: string): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().finalizeProjectBoardKickoff(boardId);
  }

  buildActiveProjectBoardCharterProjectSummary(boardId: string, generatedAt = new Date().toISOString()): ProjectBoardCharterProjectSummary {
    return this.projectBoardRepos.projectBoardLifecycle().buildActiveProjectBoardCharterProjectSummary(boardId, generatedAt);
  }

  updateProjectBoardCharterProjectSummary(input: {
    boardId: string;
    summary: ProjectBoardCharterProjectSummary;
    title?: string;
    eventSummary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().updateProjectBoardCharterProjectSummary(input);
  }

  getProjectBoardCharter(charterId: string): ProjectBoardCharter {
    return this.projectBoardRepos.projectBoards().getProjectBoardCharter(charterId);
  }
}

export abstract class ProjectStoreProjectBoardFacadeMethods extends ProjectStoreProjectBoardQuestionFacadeMethods {}
