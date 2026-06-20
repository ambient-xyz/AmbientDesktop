import type { Dispatch, SetStateAction } from "react";

import type { DesktopState, SendMessageComposerIntent } from "../../shared/desktopTypes";
import type { CollaborationMode, MessageDelivery } from "../../shared/threadTypes";
import {
  resolveSymphonyPatternPreflight,
  symphonyPatternClarificationMessage,
} from "../../shared/symphonyPatternPreflight";
import type { SaveSymphonyWorkflowRecipeInput } from "../../shared/workflowTypes";
import type { SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import type { AppendRunActivityLine } from "./AppRunActivity";
import type { SubmitDraftOptions } from "./AppComposerSubmitActions";
import {
  parseCollaborationSlashCommand,
  parseSecretSlashCommand,
} from "./plannerModeUiModel";
import {
  symphonyWorkflowBuilderComposerUiModel,
  symphonyWorkflowBuilderPreflightClarification,
  symphonyWorkflowBuilderPreflightSelection,
  type SymphonyWorkflowBuilderDraft,
  type SymphonyWorkflowBuilderUiModel,
} from "./symphonyWorkflowBuilderUiModel";

export type SymphonyBuilderAction = "run-once" | "save-recipe";

type SymphonyComposerIntent = Extract<SendMessageComposerIntent, { kind: "symphony-workflow" }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function shouldRouteComposerSubmitThroughSymphony(input: {
  subagentUiEnabled: boolean;
  symphonyBuilderOpen: boolean | undefined;
  localDeepResearchModeArmed: boolean;
  slashCommandSelected: boolean;
  running: boolean;
  goalModeArmed: boolean;
  workflowRecordingReviewFeedbackActive: boolean;
  workflowRecordingEditActive: boolean;
  composerDraft: string;
  collaborationMode: CollaborationMode;
}): boolean {
  return input.subagentUiEnabled &&
    Boolean(input.symphonyBuilderOpen) &&
    input.collaborationMode !== "planner" &&
    !input.localDeepResearchModeArmed &&
    !input.slashCommandSelected &&
    !input.running &&
    !input.goalModeArmed &&
    !input.workflowRecordingReviewFeedbackActive &&
    !input.workflowRecordingEditActive &&
    !composerDraftHasLocalCommand(input.composerDraft, input.collaborationMode);
}

function composerDraftHasLocalCommand(draft: string, collaborationMode: CollaborationMode): boolean {
  const parsedSecretCommand = parseSecretSlashCommand(draft);
  if (parsedSecretCommand.isSecretCommand) return true;
  const parsedCollaborationCommand = parseCollaborationSlashCommand(draft, collaborationMode);
  if (parsedCollaborationCommand.content !== draft.trim() || parsedCollaborationCommand.mode !== collaborationMode) return true;
  const trimmed = draft.trim();
  return trimmed === "/compact" || trimmed.startsWith("/compact ");
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

export function shouldResolveSymphonyPatternPreflight(
  draft: SymphonyWorkflowBuilderDraft,
  composerGoal: string,
): boolean {
  if (!draft.patternId) return true;
  if (!draft.preflightSelection) return false;
  return draft.preflightSelection.patternId !== draft.patternId ||
    draft.preflightSelection.goal !== composerGoal.trim();
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
  setContextError,
  setGoalModeArmed,
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
  rememberDesktopState: (next: DesktopState) => DesktopState | false | void;
  refreshWorkflowRecordingLibraryOverride: (includeArchived?: boolean) => Promise<void>;
  setError: (message: string | undefined) => void;
  setContextError: (message: string | undefined) => void;
  setGoalModeArmed: Dispatch<SetStateAction<boolean>>;
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
  submitSymphonyBuilderAction: (action: SymphonyBuilderAction, followUpModifier?: boolean) => Promise<boolean>;
  submitSymphonyComposerPrompt: (followUpModifier?: boolean) => Promise<boolean>;
  toggleSymphonyBuilder: () => void;
} {
  const selectedPatternId = symphonyBuilderModel?.selectedPattern?.id;

  function toggleSymphonyBuilder(): void {
    if (!subagentUiEnabled) return;
    const opening = !symphonyBuilderDraft.open;
    if (opening && state?.settings.collaborationMode === "planner") {
      setContextError("Switch to Agent mode before using Symphony.");
      return;
    }
    setSymphonyBuilderDraft((current) => ({ ...current, open: opening }));
    if (opening) {
      setLocalDeepResearchModeArmed(false);
      setGoalModeArmed(false);
    }
    scheduleComposerFocus();
  }

  function selectSymphonyPattern(patternId: SymphonyWorkflowPatternId): void {
    setSymphonyBuilderDraft((current) => {
      const {
        preflightClarification: _preflightClarification,
        preflightSelection: _preflightSelection,
        ...rest
      } = current;
      return { ...rest, patternId };
    });
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

  function scheduleComposerFocus(): void {
    const schedule = typeof window !== "undefined" && typeof window.setTimeout === "function"
      ? window.setTimeout.bind(window)
      : globalThis.setTimeout.bind(globalThis);
    schedule(focusComposerEnd, 0);
  }

  function blockSymphonySubmit(message: string, options: {
    clearAutoSelection?: boolean;
    preflightClarification?: SymphonyWorkflowBuilderDraft["preflightClarification"];
  } = {}): false {
    setContextError(message);
    setSymphonyBuilderDraft((current) => {
      if (options.clearAutoSelection && current.preflightSelection) {
        const {
          patternId: _patternId,
          preflightClarification: _preflightClarification,
          preflightSelection: _preflightSelection,
          ...rest
        } = current;
        return {
          ...rest,
          open: true,
          ...(options.preflightClarification ? { preflightClarification: options.preflightClarification } : {}),
        };
      }
      return {
        ...current,
        open: true,
        ...(options.preflightClarification ? { preflightClarification: options.preflightClarification } : {}),
      };
    });
    scheduleComposerFocus();
    return false;
  }

  async function submitSymphonyBuilderAction(action: SymphonyBuilderAction, followUpModifier = false): Promise<boolean> {
    if (state?.settings.collaborationMode === "planner") {
      return blockSymphonySubmit("Switch to Agent mode before using Symphony.");
    }
    const composerGoal = getComposerDraft();
    const preflight = shouldResolveSymphonyPatternPreflight(symphonyBuilderDraft, composerGoal)
      ? resolveSymphonyPatternPreflight(composerGoal)
      : undefined;
    if (preflight?.kind === "clarify") {
      return blockSymphonySubmit(symphonyPatternClarificationMessage(preflight), {
        clearAutoSelection: true,
        preflightClarification: symphonyWorkflowBuilderPreflightClarification(preflight, composerGoal),
      });
    }
    const preflightSelection = preflight?.kind === "selected"
      ? symphonyWorkflowBuilderPreflightSelection(preflight.selected, preflight.candidates, composerGoal)
      : undefined;
    const resolvedDraft: SymphonyWorkflowBuilderDraft = preflight?.kind === "selected"
      ? (() => {
          const { preflightClarification: _preflightClarification, ...rest } = symphonyBuilderDraft;
          return { ...rest, patternId: preflight.selected.patternId, preflightSelection };
        })()
      : symphonyBuilderDraft;
    if (preflight?.kind === "selected") {
      setSymphonyBuilderDraft((current) => {
        if (!shouldResolveSymphonyPatternPreflight(current, composerGoal)) return current;
        const { preflightClarification: _preflightClarification, ...rest } = current;
        return { ...rest, patternId: preflight.selected.patternId, preflightSelection };
      });
    }
    const currentModel = state
      ? symphonyWorkflowBuilderComposerUiModel({
          featureFlagSnapshot: state.featureFlagSnapshot,
          draft: resolvedDraft,
          composerGoal,
        })
      : undefined;
    if (!currentModel?.launchCard) return blockSymphonySubmit("Open Symphony and choose a pattern before sending this request.");
    if (currentModel.launchCard.confirmDisabled) {
      return blockSymphonySubmit(currentModel.launchCard.confirmDisabledReason ?? "Complete the Symphony launch card before sending this request.");
    }
    if (symphonyBuilderActionBusy) return false;
    if (action === "save-recipe") {
      const input = symphonyRecipeSaveInputForDraft({
        activeThreadId: state?.activeThreadId,
        draft: resolvedDraft,
        goal: composerGoal,
        selectedPatternId: resolvedDraft.patternId ?? selectedPatternId,
        subagentUiEnabled,
      });
      if (!input) return blockSymphonySubmit("Complete the Symphony recipe goal and pattern before saving.");
      setSymphonyBuilderActionBusy(action);
      setError(undefined);
      setContextError(undefined);
      try {
        const next = await window.ambientDesktop.saveSymphonyWorkflowRecipe(input);
        const remembered = rememberDesktopState(next);
        if (remembered === false) return true;
        setState(remembered ?? next);
        void refreshWorkflowRecordingLibraryOverride(false);
        appendRunActivityLine("Symphony recipe saved to the workflow catalog.", "state", {}, input.threadId);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setSymphonyBuilderActionBusy(undefined);
      }
    }

    const composerIntent = symphonyComposerIntentForDraft({
      action,
      draft: resolvedDraft,
      selectedPatternId: resolvedDraft.patternId ?? selectedPatternId,
      subagentUiEnabled,
    });
    if (!composerIntent) return blockSymphonySubmit("Complete the Symphony pattern before sending this request.");
    setSymphonyBuilderActionBusy(action);
    setContextError(undefined);
    try {
      await submitDraft("prompt", followUpModifier, {
        composerIntent,
        activityLine: action === "run-once"
          ? "Symphony workflow launch sent to Ambient."
          : "Symphony recipe save request sent to Ambient.",
      });
      return true;
    } finally {
      setSymphonyBuilderActionBusy(undefined);
    }
  }

  function submitSymphonyComposerPrompt(followUpModifier = false): Promise<boolean> {
    if (!subagentUiEnabled || !symphonyBuilderDraft.open) return Promise.resolve(false);
    return submitSymphonyBuilderAction("run-once", followUpModifier);
  }

  return {
    changeSymphonyBlocking,
    changeSymphonyMetric,
    changeSymphonyStepCustomText,
    selectSymphonyPattern,
    selectSymphonyStepChoice,
    submitSymphonyBuilderAction,
    submitSymphonyComposerPrompt,
    toggleSymphonyBuilder,
  };
}
