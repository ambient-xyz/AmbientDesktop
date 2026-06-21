import type Database from "better-sqlite3";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardProofReview,
  ProjectBoardProofDecisionAction,
  RefreshProjectBoardDecisionDraftsInput,
  ProjectBoardSplitDecisionAction,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import {
  ProjectStoreProjectBoardCardCandidateSplitRepository,
  type ProjectStoreProjectBoardCardCandidateSplitRepositoryDeps,
} from "./projectBoardCardCandidateSplitRepository";
import {
  ProjectStoreProjectBoardCardProofReviewRepository,
  type ProjectStoreProjectBoardCardProofReviewRepositoryDeps,
} from "./projectBoardCardProofReviewRepository";
import {
  ProjectStoreProjectBoardCardSplitDecisionRepository,
  type ProjectStoreProjectBoardCardSplitDecisionRepositoryDeps,
} from "./projectBoardCardSplitDecisionRepository";
import {
  ProjectStoreProjectBoardCardRunFeedbackRepository,
  type ProjectStoreProjectBoardCardRunFeedbackRepositoryExternalDeps,
} from "./projectBoardCardRunFeedbackRepository";
import {
  ProjectStoreProjectBoardCardDraftMutationRepository,
  type ProjectStoreProjectBoardCardDraftMutationRepositoryDeps,
  type UpdateProjectBoardCardMutationInput,
} from "./projectBoardCardDraftMutationRepository";
import {
  ProjectStoreProjectBoardCardTicketizationRepository,
  type ProjectStoreProjectBoardCardTicketizationRepositoryDeps,
} from "./projectBoardCardTicketizationRepository";
import type { ProjectBoardRunArtifactProjection } from "./projectStoreProjectBoardFacade";
import {
  type ProjectBoardCardStoreRow,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardRunFollowUpInsertOptions,
} from "./projectBoardMappers";

export type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";

export interface ProjectStoreProjectBoardCardMutationRepositoryDeps
  extends ProjectStoreProjectBoardCardDraftMutationRepositoryDeps,
    ProjectStoreProjectBoardCardTicketizationRepositoryDeps,
    ProjectStoreProjectBoardCardProofReviewRepositoryDeps,
    ProjectStoreProjectBoardCardSplitDecisionRepositoryDeps,
    ProjectStoreProjectBoardCardRunFeedbackRepositoryExternalDeps,
    ProjectStoreProjectBoardCardCandidateSplitRepositoryDeps {}

export class ProjectStoreProjectBoardCardMutationRepository {
  private readonly candidateSplitMutations: ProjectStoreProjectBoardCardCandidateSplitRepository;
  private readonly draftMutations: ProjectStoreProjectBoardCardDraftMutationRepository;
  private readonly ticketizationMutations: ProjectStoreProjectBoardCardTicketizationRepository;
  private readonly proofReviewMutations: ProjectStoreProjectBoardCardProofReviewRepository;
  private readonly splitDecisionMutations: ProjectStoreProjectBoardCardSplitDecisionRepository;
  private readonly runFeedbackMutations: ProjectStoreProjectBoardCardRunFeedbackRepository;

  constructor(db: Database.Database, deps: ProjectStoreProjectBoardCardMutationRepositoryDeps) {
    this.candidateSplitMutations = new ProjectStoreProjectBoardCardCandidateSplitRepository(db, deps);
    this.draftMutations = new ProjectStoreProjectBoardCardDraftMutationRepository(db, deps);
    this.ticketizationMutations = new ProjectStoreProjectBoardCardTicketizationRepository(db, deps);
    this.proofReviewMutations = new ProjectStoreProjectBoardCardProofReviewRepository(db, deps);
    this.splitDecisionMutations = new ProjectStoreProjectBoardCardSplitDecisionRepository(db, deps);
    this.runFeedbackMutations = new ProjectStoreProjectBoardCardRunFeedbackRepository(db, {
      ...deps,
      updateCard: (input) => this.draftMutations.updateCard(input),
    });
  }

  createManualCard(input: { boardId: string; title?: string; description?: string }): ProjectBoardCard {
    return this.draftMutations.createManualCard(input);
  }

  attachLocalTaskToProjectBoard(input: { taskId: string; mode: "attach" | "evidence" }): ProjectBoardCard {
    return this.ticketizationMutations.attachLocalTaskToProjectBoard(input);
  }

  splitProjectBoardCard(cardId: string): ProjectBoardCard[] {
    return this.candidateSplitMutations.splitProjectBoardCard(cardId);
  }

  createProjectBoardProofFollowUpForRun(
    run: OrchestrationRun,
    parent: ProjectBoardCardStoreRow,
    review: ProjectBoardProofReviewDraft,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    return this.proofReviewMutations.createProjectBoardProofFollowUpForRun(run, parent, review, options);
  }

  createProjectBoardFollowUpCandidatesForRun(
    run: OrchestrationRun,
    parentRow?: ProjectBoardCardStoreRow,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    return this.proofReviewMutations.createProjectBoardFollowUpCandidatesForRun(run, parentRow, options);
  }

  materializeProjectBoardPulledHandoffFollowUps(boardId: string, runArtifacts: ProjectBoardRunArtifactProjection[]): string[] {
    return this.proofReviewMutations.materializeProjectBoardPulledHandoffFollowUps(boardId, runArtifacts);
  }

  isProjectBoardProofReviewRunCurrent(runId: string, requireCurrentReview = false): boolean {
    return this.proofReviewMutations.isProjectBoardProofReviewRunCurrent(runId, requireCurrentReview);
  }

  applyProjectBoardCardProofReview(input: {
    runId: string;
    review: ProjectBoardCardProofReview;
    requireCurrentReview?: boolean;
    allowStaleRun?: boolean;
  }): ProjectBoardCard | undefined {
    return this.proofReviewMutations.applyProjectBoardCardProofReview(input);
  }

  resolveProjectBoardProofDecision(input: { cardId: string; action: ProjectBoardProofDecisionAction; reason?: string }): ProjectBoardCard {
    return this.proofReviewMutations.resolveProjectBoardProofDecision(input);
  }

  resolveProjectBoardSplitDecision(input: { cardId: string; action: ProjectBoardSplitDecisionAction; reason?: string }): ProjectBoardCard {
    return this.splitDecisionMutations.resolveProjectBoardSplitDecision(input);
  }

  updateCard(input: UpdateProjectBoardCardMutationInput): ProjectBoardCard {
    return this.draftMutations.updateCard(input);
  }

  updateCardCandidateStatus(
    cardId: string,
    candidateStatus: ProjectBoardCardCandidateStatus,
    options: { actor?: "user" | "system"; reason?: string; relatedCardId?: string } = {},
  ): ProjectBoardCard {
    return this.draftMutations.updateCardCandidateStatus(cardId, candidateStatus, options);
  }

  approveProjectBoardCard(cardId: string): ProjectBoardCard {
    return this.ticketizationMutations.approveProjectBoardCard(cardId);
  }

  createReadyProjectBoardTasks(boardId: string): ProjectBoardCard[] {
    return this.ticketizationMutations.createReadyProjectBoardTasks(boardId);
  }

  resolvePiUpdate(input: { cardId: string; action: "apply" | "ignore" }): ProjectBoardCard {
    return this.draftMutations.resolvePiUpdate(input);
  }

  addRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard {
    return this.runFeedbackMutations.addRunFeedback(input);
  }

  applyDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): ProjectBoardCard {
    return this.runFeedbackMutations.applyDecisionImpactFeedback(input);
  }

  refreshDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): ProjectBoardCard {
    return this.runFeedbackMutations.refreshDecisionDrafts(input);
  }

}
