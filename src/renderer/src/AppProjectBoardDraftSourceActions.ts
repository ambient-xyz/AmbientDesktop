import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type {
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  ResolveProjectBoardCardPiUpdateInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  UpdateProjectBoardSourceInput,
} from "../../shared/projectBoardTypes";
import { normalizedProjectBoardActionError, projectBoardActionErrorMessage } from "./AppProjectBoardActionSupport";

export function createAppProjectBoardDraftSourceActions({
  applyProjectBoardState,
  projectBoardKickoffDefaultsBusy,
  setError,
  setProjectBoardKickoffDefaultsBusy,
  setProjectBoardSourceBusy,
  setProjectBoardSourceImpactBusy,
}: {
  applyProjectBoardState: (next: DesktopState) => void;
  projectBoardKickoffDefaultsBusy: boolean;
  setError: (message: string | undefined) => void;
  setProjectBoardKickoffDefaultsBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSourceBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSourceImpactBusy: Dispatch<SetStateAction<boolean>>;
}): {
  applyProjectBoardDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void>;
  applyProjectBoardSourceImpactFeedback: (input: ApplyProjectBoardSourceImpactFeedbackInput) => Promise<void>;
  refreshProjectBoardDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void>;
  refreshProjectBoardSourceDrafts: (input: RefreshProjectBoardSourceDraftsInput) => Promise<void>;
  refreshProjectBoardSources: (boardId: string) => Promise<void>;
  regenerateProjectBoardDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void>;
  regenerateProjectBoardSourceDrafts: (input: RegenerateProjectBoardSourceDraftsInput) => Promise<void>;
  resolveProjectBoardCardPiUpdate: (input: ResolveProjectBoardCardPiUpdateInput) => Promise<void>;
  suggestProjectBoardClarificationDefaults: (input: SuggestProjectBoardClarificationDefaultsInput) => Promise<void>;
  suggestProjectBoardKickoffDefaults: (input: SuggestProjectBoardKickoffDefaultsInput) => Promise<void>;
  updateProjectBoardSource: (input: UpdateProjectBoardSourceInput) => Promise<void>;
} {
  async function suggestProjectBoardClarificationDefaults(input: SuggestProjectBoardClarificationDefaultsInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.suggestProjectBoardClarificationDefaults(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    }
  }

  async function suggestProjectBoardKickoffDefaults(input: SuggestProjectBoardKickoffDefaultsInput) {
    if (projectBoardKickoffDefaultsBusy) return;
    setProjectBoardKickoffDefaultsBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.suggestProjectBoardKickoffDefaults(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    } finally {
      setProjectBoardKickoffDefaultsBusy(false);
    }
  }

  async function applyProjectBoardDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.applyProjectBoardDecisionImpactFeedback(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    }
  }

  async function refreshProjectBoardDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.refreshProjectBoardDecisionDrafts(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    }
  }

  async function regenerateProjectBoardDecisionDrafts(input: RegenerateProjectBoardDecisionDraftsInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.regenerateProjectBoardDecisionDrafts(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    }
  }

  async function regenerateProjectBoardSourceDrafts(input: RegenerateProjectBoardSourceDraftsInput) {
    setError(undefined);
    setProjectBoardSourceImpactBusy(true);
    try {
      const next = await window.ambientDesktop.regenerateProjectBoardSourceDrafts(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    } finally {
      setProjectBoardSourceImpactBusy(false);
    }
  }

  async function refreshProjectBoardSourceDrafts(input: RefreshProjectBoardSourceDraftsInput) {
    setError(undefined);
    setProjectBoardSourceImpactBusy(true);
    try {
      const next = await window.ambientDesktop.refreshProjectBoardSourceDrafts(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    } finally {
      setProjectBoardSourceImpactBusy(false);
    }
  }

  async function applyProjectBoardSourceImpactFeedback(input: ApplyProjectBoardSourceImpactFeedbackInput) {
    setError(undefined);
    setProjectBoardSourceImpactBusy(true);
    try {
      const next = await window.ambientDesktop.applyProjectBoardSourceImpactFeedback(input);
      applyProjectBoardState(next);
    } catch (error) {
      const normalized = normalizedProjectBoardActionError(error);
      setError(normalized.message);
      throw normalized;
    } finally {
      setProjectBoardSourceImpactBusy(false);
    }
  }

  async function resolveProjectBoardCardPiUpdate(input: ResolveProjectBoardCardPiUpdateInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.resolveProjectBoardCardPiUpdate(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function refreshProjectBoardSources(boardId: string) {
    setProjectBoardSourceBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.refreshProjectBoardSources({ boardId });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    } finally {
      setProjectBoardSourceBusy(false);
    }
  }

  async function updateProjectBoardSource(input: UpdateProjectBoardSourceInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.updateProjectBoardSource(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  return {
    applyProjectBoardDecisionImpactFeedback,
    applyProjectBoardSourceImpactFeedback,
    refreshProjectBoardDecisionDrafts,
    refreshProjectBoardSourceDrafts,
    refreshProjectBoardSources,
    regenerateProjectBoardDecisionDrafts,
    regenerateProjectBoardSourceDrafts,
    resolveProjectBoardCardPiUpdate,
    suggestProjectBoardClarificationDefaults,
    suggestProjectBoardKickoffDefaults,
    updateProjectBoardSource,
  };
}
