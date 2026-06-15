import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { DesktopState, MessageDelivery } from "../../shared/types";
import type { SubmitDraftOptions } from "./AppComposerSubmitActions";
import {
  compactSymphonyIntentValue,
  createAppSymphonyBuilderControls,
  nextSymphonyBuilderDraftForCustomText,
  nextSymphonyBuilderDraftForMetric,
  nextSymphonyBuilderDraftForStepChoice,
  symphonyComposerIntentForDraft,
  symphonyRecipeSaveInputForDraft,
  type SymphonyBuilderAction,
} from "./AppSymphonyBuilderControls";
import {
  symphonyWorkflowBuilderUiModel,
  type SymphonyWorkflowBuilderDraft,
} from "./symphonyWorkflowBuilderUiModel";

type SubmitDraftFn = (requestedDelivery: MessageDelivery, followUpModifier?: boolean, options?: SubmitDraftOptions) => Promise<void>;

describe("App Symphony builder controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compacts blank Symphony intent fields without changing meaningful values", () => {
    expect(compactSymphonyIntentValue({
      keep: " value ",
      drop: "   ",
      nested: {
        choiceId: "files",
        customText: "",
      },
      emptyObject: {
        customText: "   ",
      },
    })).toEqual({
      keep: "value",
      nested: { choiceId: "files" },
    });
  });

  it("updates Symphony draft answers and metrics without dropping siblings", () => {
    const draft: SymphonyWorkflowBuilderDraft = {
      stepAnswers: { existing: { choiceId: "old" } },
      metricCustomizations: { existingMetric: "old metric" },
    };

    expect(nextSymphonyBuilderDraftForStepChoice(draft, "scope", "files")).toMatchObject({
      stepAnswers: {
        existing: { choiceId: "old" },
        scope: { choiceId: "files" },
      },
    });
    expect(nextSymphonyBuilderDraftForCustomText(draft, "limits", "No writes")).toMatchObject({
      stepAnswers: {
        existing: { choiceId: "old" },
        limits: { customText: "No writes" },
      },
    });
    expect(nextSymphonyBuilderDraftForMetric(draft, "map_reduce-metric", "Coverage")).toMatchObject({
      metricCustomizations: {
        existingMetric: "old metric",
        "map_reduce-metric": "Coverage",
      },
    });
  });

  it("builds run-once composer intents with selected pattern fallback and compact fields", () => {
    expect(symphonyComposerIntentForDraft({
      action: "run-once",
      draft: { patternId: "map_reduce" },
      subagentUiEnabled: false,
    })).toBeUndefined();

    expect(symphonyComposerIntentForDraft({
      action: "run-once",
      draft: {
        patternId: "map_reduce",
        blocking: true,
        stepAnswers: {
          scope: { choiceId: "files" },
          blank: { customText: "   " },
        },
        metricCustomizations: {
          "map_reduce-metric": " Every slice cites evidence. ",
          empty: " ",
        },
      },
      selectedPatternId: "pipeline",
      subagentUiEnabled: true,
    })).toEqual({
      kind: "symphony-workflow",
      action: "run-once",
      patternId: "pipeline",
      blocking: true,
      stepAnswers: { scope: { choiceId: "files" } },
      metricCustomizations: { "map_reduce-metric": "Every slice cites evidence." },
    });
  });

  it("builds recipe save input only when thread, feature, pattern, and goal are available", () => {
    expect(symphonyRecipeSaveInputForDraft({
      activeThreadId: "thread-1",
      draft: { patternId: "map_reduce" },
      goal: "   ",
      subagentUiEnabled: true,
    })).toBeUndefined();

    expect(symphonyRecipeSaveInputForDraft({
      activeThreadId: "thread-1",
      draft: {
        patternId: "map_reduce",
        blocking: false,
        stepAnswers: { scope: { choiceId: "files" } },
        metricCustomizations: { "map_reduce-metric": " Cite every mapped file. " },
      },
      goal: " Audit the simplification plan. ",
      subagentUiEnabled: true,
    })).toEqual({
      threadId: "thread-1",
      patternId: "map_reduce",
      goal: "Audit the simplification plan.",
      blocking: false,
      stepAnswers: { scope: { choiceId: "files" } },
      metricCustomizations: { "map_reduce-metric": "Cite every mapped file." },
    });
  });

  it("toggles the builder open and disarms Local Deep Research", () => {
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal("window", { setTimeout });
    const controller = createController({
      draft: { open: false },
      subagentUiEnabled: true,
    });

    controller.actions.toggleSymphonyBuilder();

    expect(controller.draft.value.open).toBe(true);
    expect(controller.setLocalDeepResearchModeArmed).toHaveBeenCalledWith(false);
    expect(controller.focusComposerEnd).toHaveBeenCalledOnce();
    expect(setTimeout).toHaveBeenCalledOnce();
  });

  it("sends run-once requests through the composer submit path and clears busy state", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const controller = createController({
      draft: readyDraft(),
      submitDraft,
    });

    await controller.actions.submitSymphonyBuilderAction("run-once");

    expect(controller.actionBusy.value).toBeUndefined();
    expect(submitDraft).toHaveBeenCalledWith("prompt", false, {
      composerIntent: {
        kind: "symphony-workflow",
        action: "run-once",
        patternId: "map_reduce",
        blocking: true,
        metricCustomizations: {
          "map_reduce-metric": "Every mapped slice reports cited implementation evidence.",
        },
      },
      activityLine: "Symphony workflow launch sent to Ambient.",
    });
  });

  it("saves recipes through Desktop and refreshes workflow library state", async () => {
    const nextState = desktopState();
    const saveSymphonyWorkflowRecipe = vi.fn(async () => nextState);
    vi.stubGlobal("window", { ambientDesktop: { saveSymphonyWorkflowRecipe } });
    const controller = createController({ draft: readyDraft() });

    await controller.actions.submitSymphonyBuilderAction("save-recipe");

    expect(saveSymphonyWorkflowRecipe).toHaveBeenCalledWith({
      threadId: "thread-1",
      patternId: "map_reduce",
      goal: "Audit the simplification plan.",
      blocking: true,
      metricCustomizations: {
        "map_reduce-metric": "Every mapped slice reports cited implementation evidence.",
      },
    });
    expect(controller.rememberDesktopState).toHaveBeenCalledWith(nextState);
    expect(controller.state.value).toBe(nextState);
    expect(controller.refreshWorkflowRecordingLibraryOverride).toHaveBeenCalledWith(false);
    expect(controller.appendRunActivityLine).toHaveBeenCalledWith(
      "Symphony recipe saved to the workflow catalog.",
      "state",
      {},
      "thread-1",
    );
    expect(controller.actionBusy.value).toBeUndefined();
  });
});

function createController({
  actionBusy,
  draft = {},
  submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn,
  subagentUiEnabled = true,
}: {
  actionBusy?: SymphonyBuilderAction;
  draft?: SymphonyWorkflowBuilderDraft;
  submitDraft?: SubmitDraftFn;
  subagentUiEnabled?: boolean;
} = {}) {
  const state = statefulSetter<DesktopState | undefined>(desktopState());
  const draftState = statefulSetter<SymphonyWorkflowBuilderDraft>(draft);
  const actionBusyState = statefulSetter<SymphonyBuilderAction | undefined>(actionBusy);
  const appendRunActivityLine = vi.fn();
  const focusComposerEnd = vi.fn();
  const rememberDesktopState = vi.fn();
  const refreshWorkflowRecordingLibraryOverride = vi.fn(async () => undefined);
  const setError = vi.fn();
  const setLocalDeepResearchModeArmed = vi.fn();
  const model = symphonyWorkflowBuilderUiModel({
    featureFlagSnapshot: state.value!.featureFlagSnapshot,
    draft,
  });
  return {
    actions: createAppSymphonyBuilderControls({
      appendRunActivityLine,
      focusComposerEnd,
      getComposerDraft: () => "Audit the simplification plan.",
      rememberDesktopState,
      refreshWorkflowRecordingLibraryOverride,
      setError,
      setLocalDeepResearchModeArmed,
      setState: state.set,
      setSymphonyBuilderActionBusy: actionBusyState.set,
      setSymphonyBuilderDraft: draftState.set,
      state: state.value,
      submitDraft,
      subagentUiEnabled,
      symphonyBuilderActionBusy: actionBusyState.value,
      symphonyBuilderDraft: draft,
      symphonyBuilderModel: model,
    }),
    actionBusy: actionBusyState,
    appendRunActivityLine,
    draft: draftState,
    focusComposerEnd,
    refreshWorkflowRecordingLibraryOverride,
    rememberDesktopState,
    setError,
    setLocalDeepResearchModeArmed,
    state,
  };
}

function readyDraft(): SymphonyWorkflowBuilderDraft {
  return {
    open: true,
    patternId: "map_reduce",
    blocking: true,
    metricCustomizations: {
      "map_reduce-metric": "Every mapped slice reports cited implementation evidence.",
    },
  };
}

function desktopState(): DesktopState {
  return {
    activeThreadId: "thread-1",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
  } as DesktopState;
}

function statefulSetter<T>(initial: T): {
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { value: initial };
  return {
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    },
  };
}
