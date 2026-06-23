import type {
  ProjectBoardCard,
  ProjectBoardCardProofReview,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardStatus,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import {
  normalizeRunFollowUps,
  projectBoardMissingProofItems,
  projectBoardProofEvidenceText,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofOfWorkForRun,
  projectBoardProofReviewClosureModelForApplication,
  projectBoardRuntimeBudgetCompletedCriteria,
  projectBoardRuntimeBudgetExceeded,
  projectBoardRuntimeBudgetFollowUpClarificationQuestion,
  projectBoardRuntimeBudgetFollowUpDescription,
  projectBoardRuntimeBudgetHasMeaningfulProgress,
  projectBoardRuntimeBudgetRemainingCriteria,
  projectBoardRuntimeBudgetReviewForApplication,
  projectBoardRuntimeBudgetSplitOutcomeForReview,
  projectBoardTaskStateForProofReview,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardRunFollowUpInsertOptions,
} from "./projectBoardMappers";

export interface ProjectBoardProofReviewApplicationPreparation {
  inputReview: ProjectBoardCardProofReview;
  explicitFollowUpOptions?: ProjectBoardRunFollowUpInsertOptions;
  proofFollowUpDraft?: ProjectBoardProofReviewDraft;
  proofFollowUpOptions?: ProjectBoardRunFollowUpInsertOptions;
  proofFollowUpSuggestionAvailable: boolean;
  proofFollowUpSuggestionTitle?: string;
  runtimeBudgetSplit: boolean;
  runtimeBudgetCompleted: string[];
  runtimeBudgetRemaining: string[];
}

export interface ProjectBoardProofReviewApplicationCompletion {
  review: ProjectBoardCardProofReview;
  splitOutcome?: ProjectBoardCardSplitOutcome;
  nextCardStatus: ProjectBoardCardStatus;
  taskState: string;
  reviewedEvent: {
    title: string;
    summary: string;
    metadata: Record<string, unknown>;
  };
  splitEvent?: {
    title: string;
    summary: string;
    metadata: Record<string, unknown>;
  };
}

export function prepareProjectBoardProofReviewApplication(input: {
  run: OrchestrationRun;
  parentCard: ProjectBoardCard;
  review: ProjectBoardCardProofReview;
}): ProjectBoardProofReviewApplicationPreparation {
  const proof = projectBoardProofOfWorkForRun(input.run.proofOfWork, input.run, input.parentCard);
  const proofText = projectBoardProofEvidenceText(input.run.error, proof);
  const inputReview = projectBoardProofReviewClosureModelForApplication(
    projectBoardRuntimeBudgetReviewForApplication(input.review, proof, proofText, input.run.workspacePath),
    projectBoardMissingProofItems(input.parentCard, proofText, proof, input.run.workspacePath),
  );
  const runtimeBudgetSplit =
    projectBoardRuntimeBudgetExceeded(proof) &&
    inputReview.status === "needs_follow_up" &&
    projectBoardRuntimeBudgetHasMeaningfulProgress(proof, proofText, inputReview.satisfied, input.run.workspacePath);
  const runtimeBudgetRemaining = runtimeBudgetSplit
    ? projectBoardRuntimeBudgetRemainingCriteria(input.parentCard, proof, input.review)
    : [];
  const runtimeBudgetCompleted = runtimeBudgetSplit
    ? projectBoardRuntimeBudgetCompletedCriteria(proof, input.review.satisfied, input.run.workspacePath)
    : [];
  const hasExplicitFollowUps = normalizeRunFollowUps(input.run.proofOfWork?.followUps).length > 0;
  const explicitFollowUpOptions: ProjectBoardRunFollowUpInsertOptions | undefined = runtimeBudgetSplit
    ? {
        blockByParent: false,
        labels: ["runtime-split-follow-up", "derived-from-parent"],
        clarificationQuestions: [projectBoardRuntimeBudgetFollowUpClarificationQuestion(input.parentCard.title)],
      }
    : undefined;
  const proofFollowUpSuggestionOptions = runtimeBudgetSplit
    ? undefined
    : projectBoardProofFollowUpOptionsFromSuggestion(inputReview.followUpSuggestion);
  const proofFollowUpDraft: ProjectBoardProofReviewDraft | undefined =
    inputReview.status === "needs_follow_up" && !hasExplicitFollowUps
      ? {
          status: inputReview.status,
          summary: inputReview.summary,
          satisfied: inputReview.satisfied,
          missing: inputReview.missing,
        }
      : undefined;
  const proofFollowUpOptions =
    proofFollowUpDraft && runtimeBudgetSplit
      ? {
          blockByParent: false,
          labels: ["runtime-split-follow-up", "derived-from-parent"],
          title: `Continue ${input.parentCard.title}`.slice(0, 180),
          description: projectBoardRuntimeBudgetFollowUpDescription(
            input.parentCard.title,
            input.review,
            runtimeBudgetCompleted,
            runtimeBudgetRemaining,
          ),
          acceptanceCriteria: runtimeBudgetRemaining,
          clarificationQuestions: [projectBoardRuntimeBudgetFollowUpClarificationQuestion(input.parentCard.title)],
          sourceIdSuffix: "runtime-split",
        }
      : proofFollowUpSuggestionOptions;

  return {
    inputReview,
    explicitFollowUpOptions,
    proofFollowUpDraft,
    proofFollowUpOptions,
    proofFollowUpSuggestionAvailable: Boolean(proofFollowUpSuggestionOptions),
    proofFollowUpSuggestionTitle: proofFollowUpSuggestionOptions?.title,
    runtimeBudgetSplit,
    runtimeBudgetCompleted,
    runtimeBudgetRemaining,
  };
}

export function completeProjectBoardProofReviewApplication(input: {
  run: OrchestrationRun;
  parentCard: ProjectBoardCard;
  preparation: ProjectBoardProofReviewApplicationPreparation;
  explicitFollowUpIds: string[];
  proofFollowUpIds: string[];
  now: string;
}): ProjectBoardProofReviewApplicationCompletion {
  const review: ProjectBoardCardProofReview = {
    ...input.preparation.inputReview,
    followUpCardIds: [
      ...new Set([
        ...input.preparation.inputReview.followUpCardIds,
        ...input.explicitFollowUpIds,
        ...input.proofFollowUpIds,
      ]),
    ],
    runId: input.run.id,
    reviewedAt: input.now,
  };
  const splitOutcome = input.preparation.runtimeBudgetSplit
    ? projectBoardRuntimeBudgetSplitOutcomeForReview(input.parentCard, input.run, review, review.followUpCardIds, input.now)
    : undefined;
  const nextCardStatus: ProjectBoardCardStatus =
    review.status === "done" ? "done" : review.status === "ready_for_review" ? "review" : "blocked";

  return {
    review,
    splitOutcome,
    nextCardStatus,
    taskState: projectBoardTaskStateForProofReview(review.status),
    reviewedEvent: {
      title: review.reviewer === "ambient_pi" ? "Card proof reviewed by Pi" : "Card proof reviewed",
      summary: review.summary,
      metadata: {
        cardId: input.parentCard.id,
        runId: input.run.id,
        status: review.status,
        missing: review.missing,
        satisfied: review.satisfied,
        followUpCardIds: review.followUpCardIds,
        reviewer: review.reviewer ?? "deterministic",
        model: review.model,
        confidence: review.confidence,
        evidenceQuality: review.evidenceQuality,
        recommendedAction: review.recommendedAction,
        deterministicStatus: review.deterministicStatus,
        followUpSuggestionUsed: input.proofFollowUpIds.length > 0 && input.preparation.proofFollowUpSuggestionAvailable,
        followUpSuggestionTitle: input.preparation.proofFollowUpSuggestionTitle,
        splitOutcome: splitOutcome
          ? {
              source: splitOutcome.source,
              status: splitOutcome.status,
              childCardIds: splitOutcome.childCardIds,
              completedCriteria: splitOutcome.completedCriteria.length,
              remainingCriteria: splitOutcome.remainingCriteria.length,
            }
          : undefined,
      },
    },
    splitEvent: splitOutcome
      ? {
          title: "Runtime-budget split proposed",
          summary: `${input.parentCard.title} timed out after meaningful progress; ${splitOutcome.childCardIds.length} follow-up card${
            splitOutcome.childCardIds.length === 1 ? "" : "s"
          } now represent the remaining scope.`,
          metadata: {
            cardId: input.parentCard.id,
            runId: input.run.id,
            reason: splitOutcome.reason,
            completedCriteria: splitOutcome.completedCriteria,
            remainingCriteria: splitOutcome.remainingCriteria,
            childCardIds: splitOutcome.childCardIds,
          },
        }
      : undefined,
  };
}
