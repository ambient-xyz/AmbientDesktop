import type { Dispatch, SetStateAction } from "react";

import type { DesktopState, SendMessageComposerIntent } from "../../shared/desktopTypes";
import type { MessageDelivery } from "../../shared/threadTypes";
import type { SaveSymphonyWorkflowRecipeInput } from "../../shared/workflowTypes";
import type { SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import type { AppendRunActivityLine } from "./AppRunActivity";
import type { SubmitDraftOptions } from "./AppComposerSubmitActions";
import {
  symphonyWorkflowBuilderComposerUiModel,
  type SymphonyWorkflowBuilderDraft,
  type SymphonyWorkflowBuilderUiModel,
} from "./symphonyWorkflowBuilderUiModel";

export type SymphonyBuilderAction = "run-once" | "save-recipe";

type SymphonyComposerIntent = Extract<SendMessageComposerIntent, { kind: "symphony-workflow" }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function compactSymphonyIntentValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entries = Object.entries(value)
    .map(([entryKey, entryValue]) => [entryKey, compactSymphonyIntentValue(entryValue)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function nonEmptySymphonyIntentField<K extends "stepAnswers" | "metricCustomizations">(
  key: K,
  value: SymphonyComposerIntent[K] | undefined,
): Pick<SymphonyComposerIntent, K> | Record<string, never> {
  if (!value) return {};
  const entries = Object.entries(value)
    .map(([entryKey, entryValue]) => [entryKey, compactSymphonyIntentValue(entryValue)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);
  return entries.length ? { [key]: Object.fromEntries(entries) } as Pick<SymphonyComposerIntent, K> : {};
}

function nonEmptySymphonyRecipeField<K extends "stepAnswers" | "metricCustomizations">(
  key: K,
  value: SaveSymphonyWorkflowRecipeInput[K] | undefined,
): Pick<SaveSymphonyWorkflowRecipeInput, K> | Record<string, never> {
  if (!value) return {};
  const entries = Object.entries(value)
    .map(([entryKey, entryValue]) => [entryKey, compactSymphonyIntentValue(entryValue)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);
  return entries.length ? { [key]: Object.fromEntries(entries) } as Pick<SaveSymphonyWorkflowRecipeInput, K> : {};
}

export function nextSymphonyBuilderDraftForStepChoice(
  current: SymphonyWorkflowBuilderDraft,
  stepId: string,
  choiceId: string,
): SymphonyWorkflowBuilderDraft {
  return {
    ...current,
    stepAnswers: {
      ...current.stepAnswers,
      [stepId]: { choiceId },
    },
  };
}

export function nextSymphonyBuilderDraftForCustomText(
  current: SymphonyWorkflowBuilderDraft,
  stepId: string,
  customText: string,
): SymphonyWorkflowBuilderDraft {
  return {
    ...current,
    stepAnswers: {
      ...current.stepAnswers,
      [stepId]: { customText },
    },
  };
}

export function nextSymphonyBuilderDraftForMetric(
  current: SymphonyWorkflowBuilderDraft,
  metricId: string,
  value: string,
): SymphonyWorkflowBuilderDraft {
  return {
    ...current,
    metricCustomizations: {
      ...current.metricCustomizations,
      [metricId]: value,
    },
  };
}

export function symphonyComposerIntentForDraft({
  action,
  draft,
  selectedPatternId,
  subagentUiEnabled,
}: {
  action: SymphonyBuilderAction;
  draft: SymphonyWorkflowBuilderDraft;
  selectedPatternId?: SymphonyWorkflowPatternId;
  subagentUiEnabled: boolean;
}): SendMessageComposerIntent | undefined {
  if (!subagentUiEnabled) return undefined;
  const patternId = selectedPatternId ?? draft.patternId;
  if (!patternId) return undefined;
  return {
    kind: "symphony-workflow",
    action,
    patternId,
    ...(draft.blocking !== undefined ? { blocking: draft.blocking } : {}),
    ...nonEmptySymphonyIntentField("stepAnswers", draft.stepAnswers),
    ...nonEmptySymphonyIntentField("metricCustomizations", draft.metricCustomizations),
  };
}

export function symphonyRecipeSaveInputForDraft({
  activeThreadId,
  draft,
  goal,
  selectedPatternId,
  subagentUiEnabled,
}: {
  activeThreadId?: string;
  draft: SymphonyWorkflowBuilderDraft;
  goal: string;
  selectedPatternId?: SymphonyWorkflowPatternId;
  subagentUiEnabled: boolean;
}): SaveSymphonyWorkflowRecipeInput | undefined {
  if (!activeThreadId || !subagentUiEnabled) return undefined;
  const patternId = selectedPatternId ?? draft.patternId;
  const trimmedGoal = goal.trim();
  if (!patternId || !trimmedGoal) return undefined;
  return {
    threadId: activeThreadId,
    patternId,
    goal: trimmedGoal,
    ...(draft.blocking !== undefined ? { blocking: draft.blocking } : {}),
    ...nonEmptySymphonyRecipeField("stepAnswers", draft.stepAnswers),
    ...nonEmptySymphonyRecipeField("metricCustomizations", draft.metricCustomizations),
  };
}

export function createAppSymphonyBuilderControls({
  appendRunActivityLine,
  focusComposerEnd,
  getComposerDraft,
  rememberDesktopState,
  refreshWorkflowRecordingLibraryOverride,
  setError,
  setLocalDeepResearchModeArmed,
  setState,
  setSymphonyBuilderActionBusy,
  setSymphonyBuilderDraft,
  state,
  submitDraft,
  subagentUiEnabled,
  symphonyBuilderActionBusy,
  symphonyBuilderDraft,
  symphonyBuilderModel,
}: {
  appendRunActivityLine: AppendRunActivityLine;
  focusComposerEnd: () => void;
  getComposerDraft: () => string;
  rememberDesktopState: (next: DesktopState) => void;
  refreshWorkflowRecordingLibraryOverride: (includeArchived?: boolean) => Promise<void>;
  setError: (message: string | undefined) => void;
  setLocalDeepResearchModeArmed: (next: boolean) => void;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setSymphonyBuilderActionBusy: Dispatch<SetStateAction<SymphonyBuilderAction | undefined>>;
  setSymphonyBuilderDraft: Dispatch<SetStateAction<SymphonyWorkflowBuilderDraft>>;
  state: DesktopState | undefined;
  submitDraft: (requestedDelivery: MessageDelivery, followUpModifier?: boolean, options?: SubmitDraftOptions) => Promise<void>;
  subagentUiEnabled: boolean;
  symphonyBuilderActionBusy: SymphonyBuilderAction | undefined;
  symphonyBuilderDraft: SymphonyWorkflowBuilderDraft;
  symphonyBuilderModel: SymphonyWorkflowBuilderUiModel | undefined;
}): {
  changeSymphonyBlocking: (blocking: boolean) => void;
  changeSymphonyMetric: (metricId: string, value: string) => void;
  changeSymphonyStepCustomText: (stepId: string, customText: string) => void;
  selectSymphonyPattern: (patternId: SymphonyWorkflowPatternId) => void;
  selectSymphonyStepChoice: (stepId: string, choiceId: string) => void;
  submitSymphonyBuilderAction: (action: SymphonyBuilderAction) => Promise<void>;
  toggleSymphonyBuilder: () => void;
} {
  const selectedPatternId = symphonyBuilderModel?.selectedPattern?.id;

  function toggleSymphonyBuilder(): void {
    if (!subagentUiEnabled) return;
    const opening = !symphonyBuilderDraft.open;
    setSymphonyBuilderDraft((current) => ({ ...current, open: opening }));
    if (opening) setLocalDeepResearchModeArmed(false);
    window.setTimeout(focusComposerEnd, 0);
  }

  function selectSymphonyPattern(patternId: SymphonyWorkflowPatternId): void {
    setSymphonyBuilderDraft((current) => ({ ...current, patternId }));
  }

  function selectSymphonyStepChoice(stepId: string, choiceId: string): void {
    setSymphonyBuilderDraft((current) => nextSymphonyBuilderDraftForStepChoice(current, stepId, choiceId));
  }

  function changeSymphonyStepCustomText(stepId: string, customText: string): void {
    setSymphonyBuilderDraft((current) => nextSymphonyBuilderDraftForCustomText(current, stepId, customText));
  }

  function changeSymphonyMetric(metricId: string, value: string): void {
    setSymphonyBuilderDraft((current) => nextSymphonyBuilderDraftForMetric(current, metricId, value));
  }

  function changeSymphonyBlocking(blocking: boolean): void {
    setSymphonyBuilderDraft((current) => ({ ...current, blocking }));
  }

  async function submitSymphonyBuilderAction(action: SymphonyBuilderAction): Promise<void> {
    const currentModel = state
      ? symphonyWorkflowBuilderComposerUiModel({
          featureFlagSnapshot: state.featureFlagSnapshot,
          draft: symphonyBuilderDraft,
          composerGoal: getComposerDraft(),
        })
      : undefined;
    if (!currentModel?.launchCard || currentModel.launchCard.confirmDisabled || symphonyBuilderActionBusy) return;
    if (action === "save-recipe") {
      const input = symphonyRecipeSaveInputForDraft({
        activeThreadId: state?.activeThreadId,
        draft: symphonyBuilderDraft,
        goal: getComposerDraft(),
        selectedPatternId,
        subagentUiEnabled,
      });
      if (!input) return;
      setSymphonyBuilderActionBusy(action);
      setError(undefined);
      try {
        const next = await window.ambientDesktop.saveSymphonyWorkflowRecipe(input);
        rememberDesktopState(next);
        setState(next);
        void refreshWorkflowRecordingLibraryOverride(false);
        appendRunActivityLine("Symphony recipe saved to the workflow catalog.", "state", {}, input.threadId);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSymphonyBuilderActionBusy(undefined);
      }
      return;
    }

    const composerIntent = symphonyComposerIntentForDraft({
      action,
      draft: symphonyBuilderDraft,
      selectedPatternId,
      subagentUiEnabled,
    });
    if (!composerIntent) return;
    setSymphonyBuilderActionBusy(action);
    try {
      await submitDraft("prompt", false, {
        composerIntent,
        activityLine: action === "run-once"
          ? "Symphony workflow launch sent to Ambient."
          : "Symphony recipe save request sent to Ambient.",
      });
    } finally {
      setSymphonyBuilderActionBusy(undefined);
    }
  }

  return {
    changeSymphonyBlocking,
    changeSymphonyMetric,
    changeSymphonyStepCustomText,
    selectSymphonyPattern,
    selectSymphonyStepChoice,
    submitSymphonyBuilderAction,
    toggleSymphonyBuilder,
  };
}
