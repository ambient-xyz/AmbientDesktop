import type { DesktopState } from "../../shared/desktopTypes";
import type {
  CreateReadyProjectBoardTasksInput,
  ProjectBoardCard,
  ProjectBoardProofDecisionAction,
  ProjectBoardSplitDecisionAction,
  RecomputeProjectBoardProofCoverageInput,
  ResolveProjectBoardDeliverableIntegrationInput,
  RerunProjectBoardProofInput,
  SplitProjectBoardCardInput,
  SuggestProjectBoardProofInput,
} from "../../shared/projectBoardTypes";
import {
  normalizedProjectBoardActionError,
  projectBoardActionErrorMessage,
} from "./AppProjectBoardActionSupport";

export function createAppProjectBoardProofActions({
  applyProjectBoardState,
  setError,
}: {
  applyProjectBoardState: (next: DesktopState) => void;
  setError: (message: string | undefined) => void;
}): {
  approveProjectBoardCard: (card: ProjectBoardCard) => Promise<void>;
  createReadyProjectBoardTasks: (input: CreateReadyProjectBoardTasksInput) => Promise<void>;
  recomputeProjectBoardProofCoverage: (input: RecomputeProjectBoardProofCoverageInput) => Promise<void>;
  resolveProjectBoardDeliverableIntegration: (input: ResolveProjectBoardDeliverableIntegrationInput) => Promise<void>;
  resolveProjectBoardProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => Promise<void>;
  resolveProjectBoardSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => Promise<void>;
  rerunProjectBoardProof: (input: RerunProjectBoardProofInput) => Promise<void>;
  splitProjectBoardCard: (input: SplitProjectBoardCardInput) => Promise<void>;
  suggestProjectBoardProof: (input: SuggestProjectBoardProofInput) => Promise<void>;
} {
  async function approveProjectBoardCard(card: ProjectBoardCard) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.approveProjectBoardCard({ cardId: card.id });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function resolveProjectBoardProofDecision(cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.resolveProjectBoardProofDecision({ cardId, action, reason });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function rerunProjectBoardProof(input: RerunProjectBoardProofInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.rerunProjectBoardProof(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
      throw error;
    }
  }

  async function resolveProjectBoardDeliverableIntegration(input: ResolveProjectBoardDeliverableIntegrationInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.resolveProjectBoardDeliverableIntegration(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
      throw error;
    }
  }

  async function recomputeProjectBoardProofCoverage(input: RecomputeProjectBoardProofCoverageInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.recomputeProjectBoardProofCoverage(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
      throw error;
    }
  }

  async function suggestProjectBoardProof(input: SuggestProjectBoardProofInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.suggestProjectBoardProof(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
      throw error;
    }
  }

  async function resolveProjectBoardSplitDecision(cardId: string, action: ProjectBoardSplitDecisionAction) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.resolveProjectBoardSplitDecision({ cardId, action });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function createReadyProjectBoardTasks(input: CreateReadyProjectBoardTasksInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.createReadyProjectBoardTasks(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function splitProjectBoardCard(input: SplitProjectBoardCardInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.splitProjectBoardCard(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  return {
    approveProjectBoardCard,
    createReadyProjectBoardTasks,
    recomputeProjectBoardProofCoverage,
    resolveProjectBoardDeliverableIntegration,
    resolveProjectBoardProofDecision,
    resolveProjectBoardSplitDecision,
    rerunProjectBoardProof,
    splitProjectBoardCard,
    suggestProjectBoardProof,
  };
}

export type AppProjectBoardProofActions = ReturnType<typeof createAppProjectBoardProofActions>;
