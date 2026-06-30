import type { DesktopState } from "../../shared/desktopTypes";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  AttachProjectBoardLocalTaskMode,
  CopyProjectBoardSessionToThreadInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardProofDecisionAction,
  ProjectBoardQuestion,
  ProjectBoardSplitDecisionAction,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectSummary,
  RefineProjectBoardSynthesisInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  RerunProjectBoardProofInput,
  ResolveProjectBoardCardPiUpdateInput,
  ResolveProjectBoardDeliverableIntegrationInput,
  RetryProjectBoardSynthesisInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  SuggestProjectBoardProofInput,
  UpdateProjectBoardCardInput,
  UpdateProjectBoardSourceInput,
} from "../../shared/projectBoardTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { ProjectBoardLiveSessionActivityLine } from "./projectBoardUiModel";

export type ProjectBoardWorkspaceProps = {
  project: ProjectSummary;
  busy: boolean;
  sourceBusy: boolean;
  sourceImpactBusy: boolean;
  kickoffDefaultsBusy: boolean;
  refineBusy: boolean;
  refineMode?: RefineProjectBoardSynthesisInput["mode"];
  proposalAnswerBusy?: string;
  proposalCardReviewBusy?: string;
  proposalApplyBusy: boolean;
  finalizeBusy: boolean;
  synthesisRetryBusy: boolean;
  synthesisDeferBusy: boolean;
  synthesisPauseBusy: boolean;
  revisionBusy: boolean;
  orchestrationRevision: number;
  runActivityLinesByThread: Record<string, ProjectBoardLiveSessionActivityLine[]>;
  threadRunStatuses: Record<string, RunStatus>;
  onBuild: () => void;
  onReviseBoard: (boardId: string) => void;
  onCancelRevision: (boardId: string) => void;
  onResetBoard: () => void;
  onApproveCard: (card: ProjectBoardCard) => void;
  onResolveProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => Promise<void> | void;
  onRerunProof: (input: RerunProjectBoardProofInput) => Promise<void> | void;
  onResolveDeliverableIntegration: (input: ResolveProjectBoardDeliverableIntegrationInput) => Promise<void> | void;
  onRecomputeProofCoverage: (boardId: string) => Promise<void> | void;
  onSuggestProof: (input: SuggestProjectBoardProofInput) => Promise<void> | void;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => Promise<void> | void;
  onCreateReadyTasks: (boardId: string) => void;
  onSplitCard: (cardId: string) => void;
  onCreateCard: (boardId: string) => Promise<DesktopState | undefined>;
  onAttachLocalTask: (taskId: string, mode: AttachProjectBoardLocalTaskMode) => Promise<void>;
  onUpdateCard: (input: UpdateProjectBoardCardInput) => void;
  onUpdateCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => void;
  onResolveCardPiUpdate: (input: ResolveProjectBoardCardPiUpdateInput) => void;
  onAddRunFeedback: (input: AddProjectBoardCardRunFeedbackInput) => Promise<void> | void;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => Promise<void> | void;
  onSuggestClarificationDefaults: (input: SuggestProjectBoardClarificationDefaultsInput) => Promise<void> | void;
  onSuggestKickoffDefaults: (input: SuggestProjectBoardKickoffDefaultsInput) => Promise<void> | void;
  onApplyDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void> | void;
  onRefreshDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRegenerateDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRefreshSourceDrafts: (input: RefreshProjectBoardSourceDraftsInput) => Promise<void> | void;
  onRegenerateSourceDrafts: (input: RegenerateProjectBoardSourceDraftsInput) => Promise<void> | void;
  onApplySourceImpactFeedback: (input: ApplyProjectBoardSourceImpactFeedbackInput) => Promise<void> | void;
  onRefreshSources: (boardId: string) => void;
  onRefineWithPi: (boardId: string) => void;
  onRefineProposal: (
    boardId: string,
    proposalId: string,
    mode?: Extract<RefineProjectBoardSynthesisInput["mode"], "charter_review" | "board_synthesis">,
  ) => void;
  onElaborateSources: (boardId: string, sourceIds: string[], objective?: string) => void;
  onAnswerProposalQuestion: (proposalId: string, questionIndex: number, answer: string) => void;
  onReviewProposalCard: (
    proposalId: string,
    sourceId: string,
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus,
    reason?: string,
    mergeTargetCardId?: string,
  ) => void;
  onApplyProposal: (proposalId: string) => void;
  onUpdateSource: (input: UpdateProjectBoardSourceInput) => void;
  onAnswerQuestion: (question: ProjectBoardQuestion, answer: string) => void;
  onFinalizeKickoff: (boardId: string) => void;
  onPauseSynthesis: (boardId: string, runId: string) => void;
  onRetrySynthesis: (boardId: string, retryOfRunId?: string, mode?: RetryProjectBoardSynthesisInput["mode"]) => void;
  onDeferSynthesisSections: (boardId: string, runId: string) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onClose: () => void;
};
