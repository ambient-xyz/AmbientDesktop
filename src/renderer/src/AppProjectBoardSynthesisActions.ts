import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type {
  DeferProjectBoardSynthesisSectionsInput,
  ProjectBoardSynthesisProposalCardReviewStatus,
  RefineProjectBoardSynthesisInput,
  RetryProjectBoardSynthesisInput,
} from "../../shared/projectBoardTypes";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function projectBoardProposalQuestionBusyKey(proposalId: string, questionIndex: number): string {
  return `${proposalId}:${questionIndex}`;
}

export function projectBoardProposalCardReviewBusyKey(proposalId: string, sourceId: string): string {
  return `${proposalId}:${sourceId}`;
}

export function projectBoardSynthesisPauseReason(): string {
  return "Pause requested from the project-board progress panel.";
}

export function createAppProjectBoardSynthesisActions({
  applyProjectBoardState,
  setError,
  setProjectBoardProposalAnswerBusy,
  setProjectBoardProposalApplyBusy,
  setProjectBoardProposalCardReviewBusy,
  setProjectBoardRefineBusy,
  setProjectBoardRefineMode,
  setProjectBoardSynthesisDeferBusy,
  setProjectBoardSynthesisPauseBusy,
  setProjectBoardSynthesisRetryBusy,
}: {
  applyProjectBoardState: (next: DesktopState) => void;
  setError: (message: string | undefined) => void;
  setProjectBoardProposalAnswerBusy: Dispatch<SetStateAction<string | undefined>>;
  setProjectBoardProposalApplyBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardProposalCardReviewBusy: Dispatch<SetStateAction<string | undefined>>;
  setProjectBoardRefineBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardRefineMode: Dispatch<SetStateAction<RefineProjectBoardSynthesisInput["mode"] | undefined>>;
  setProjectBoardSynthesisDeferBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSynthesisPauseBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSynthesisRetryBusy: Dispatch<SetStateAction<boolean>>;
}) {
  async function refineProjectBoardWithPi(
    boardId: string,
    proposalId?: string,
    input?: Pick<RefineProjectBoardSynthesisInput, "mode" | "sourceIds" | "objective">,
  ) {
    setProjectBoardRefineBusy(true);
    setProjectBoardRefineMode(input?.mode ?? "charter_review");
    setError(undefined);
    try {
      const next = await window.ambientDesktop.refineProjectBoardSynthesis({ boardId, proposalId, ...input });
      applyProjectBoardState(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setProjectBoardRefineBusy(false);
      setProjectBoardRefineMode(undefined);
    }
  }

  async function answerProjectBoardSynthesisProposalQuestion(proposalId: string, questionIndex: number, answer: string) {
    setProjectBoardProposalAnswerBusy(projectBoardProposalQuestionBusyKey(proposalId, questionIndex));
    setError(undefined);
    try {
      const next = await window.ambientDesktop.answerProjectBoardSynthesisProposalQuestion({ proposalId, questionIndex, answer });
      applyProjectBoardState(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setProjectBoardProposalAnswerBusy(undefined);
    }
  }

  async function reviewProjectBoardSynthesisProposalCard(
    proposalId: string,
    sourceId: string,
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus,
    reason?: string,
    mergeTargetCardId?: string,
  ) {
    setProjectBoardProposalCardReviewBusy(projectBoardProposalCardReviewBusyKey(proposalId, sourceId));
    setError(undefined);
    try {
      const next = await window.ambientDesktop.reviewProjectBoardSynthesisProposalCard({
        proposalId,
        sourceId,
        reviewStatus,
        reason,
        mergeTargetCardId,
      });
      applyProjectBoardState(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setProjectBoardProposalCardReviewBusy(undefined);
    }
  }

  async function applyProjectBoardSynthesisProposal(proposalId: string) {
    setProjectBoardProposalApplyBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.applyProjectBoardSynthesisProposal({ proposalId, replaceExistingDraft: true });
      applyProjectBoardState(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setProjectBoardProposalApplyBusy(false);
    }
  }

  async function retryProjectBoardSynthesis(input: RetryProjectBoardSynthesisInput) {
    setProjectBoardSynthesisRetryBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.retryProjectBoardSynthesis(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setProjectBoardSynthesisRetryBusy(false);
    }
  }

  async function pauseProjectBoardSynthesis(boardId: string, runId: string) {
    setProjectBoardSynthesisPauseBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.pauseProjectBoardSynthesis({
        boardId,
        runId,
        reason: projectBoardSynthesisPauseReason(),
      });
      applyProjectBoardState(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setProjectBoardSynthesisPauseBusy(false);
    }
  }

  async function deferProjectBoardSynthesisSections(input: DeferProjectBoardSynthesisSectionsInput) {
    setProjectBoardSynthesisDeferBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.deferProjectBoardSynthesisSections(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setProjectBoardSynthesisDeferBusy(false);
    }
  }

  return {
    answerProjectBoardSynthesisProposalQuestion,
    applyProjectBoardSynthesisProposal,
    deferProjectBoardSynthesisSections,
    pauseProjectBoardSynthesis,
    refineProjectBoardWithPi,
    retryProjectBoardSynthesis,
    reviewProjectBoardSynthesisProposalCard,
  };
}

