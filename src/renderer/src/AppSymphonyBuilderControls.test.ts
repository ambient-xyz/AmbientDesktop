import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { DesktopState } from "../../shared/desktopTypes";
import type { MessageDelivery } from "../../shared/threadTypes";
import type { SubmitDraftOptions } from "./AppComposerSubmitActions";
import {
  compactSymphonyIntentValue,
  createAppSymphonyBuilderControls,
  nextSymphonyBuilderDraftForCustomText,
  nextSymphonyBuilderDraftForMetric,
  nextSymphonyBuilderDraftForStepChoice,
  shouldRouteComposerSubmitThroughSymphony,
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

  it("routes normal composer submit through Symphony only when no higher-priority composer mode is armed", () => {
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "agent",
    })).toBe(true);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "planner",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: true,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: true,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: true,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: true,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "/compact now",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "/plan compare these options",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "/secret BRAVE_API_KEY",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "/private/tmp/repo: compare these files",
      collaborationMode: "agent",
    })).toBe(true);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: true,
      workflowRecordingEditActive: false,
      composerDraft: "Please revise this recording.",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: true,
      composerDraft: "Update this playbook section.",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: false,
      symphonyBuilderOpen: true,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "agent",
    })).toBe(false);
    expect(shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled: true,
      symphonyBuilderOpen: false,
      localDeepResearchModeArmed: false,
      slashCommandSelected: false,
      running: false,
      goalModeArmed: false,
      workflowRecordingReviewFeedbackActive: false,
      workflowRecordingEditActive: false,
      composerDraft: "Compare these plans.",
      collaborationMode: "agent",
    })).toBe(false);
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

    await expect(controller.actions.submitSymphonyBuilderAction("run-once")).resolves.toBe(true);

    expect(controller.actionBusy.value).toBeUndefined();
    expect(controller.setContextError).toHaveBeenLastCalledWith(undefined);
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

  it("intercepts ordinary composer submit while Symphony is open and blocks incomplete launch cards", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal("window", { setTimeout });
    const controller = createController({
      draft: { open: true, patternId: "map_reduce" },
      submitDraft,
    });

    await expect(controller.actions.submitSymphonyComposerPrompt()).resolves.toBe(false);

    expect(submitDraft).not.toHaveBeenCalled();
    expect(controller.draft.value.open).toBe(true);
    expect(controller.setContextError).toHaveBeenCalledWith("Complete required reducer success metric before confirming the launch card.");
    expect(controller.focusComposerEnd).toHaveBeenCalledOnce();
  });

  it("routes ordinary composer submit through Run once when Symphony is open and ready", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const controller = createController({
      draft: readyDraft(),
      submitDraft,
    });

    await expect(controller.actions.submitSymphonyComposerPrompt()).resolves.toBe(true);

    expect(submitDraft).toHaveBeenCalledWith("prompt", false, expect.objectContaining({
      composerIntent: expect.objectContaining({
        kind: "symphony-workflow",
        action: "run-once",
        patternId: "map_reduce",
      }),
    }));
  });

  it("auto-selects a clear Symphony pattern before sending when no pattern was explicitly chosen", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const controller = createController({
      composerDraft: "Compare each of these source packets and synthesize a cited recommendation.",
      draft: {
        open: true,
        metricCustomizations: {
          "map_reduce-metric": "Every source packet has a cited summary before reduction.",
        },
      },
      submitDraft,
    });

    await expect(controller.actions.submitSymphonyComposerPrompt()).resolves.toBe(true);

    expect(controller.draft.value.patternId).toBe("map_reduce");
    expect(controller.draft.value.preflightSelection).toEqual(expect.objectContaining({
      source: "auto-selected",
      patternId: "map_reduce",
      confidence: expect.any(Number),
      rationale: expect.stringContaining("split comparable inputs"),
      rolePlan: expect.arrayContaining(["explorer", "summarizer"]),
      expectedChildren: expect.stringContaining("explorer child"),
    }));
    expect(submitDraft).toHaveBeenCalledWith("prompt", false, expect.objectContaining({
      composerIntent: expect.objectContaining({
        kind: "symphony-workflow",
        action: "run-once",
        patternId: "map_reduce",
      }),
    }));
  });

  it("reclassifies stale auto-selected patterns when the composer goal changes after a blocked launch", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const firstRender = createController({
      composerDraft: "Compare each of these source packets and synthesize a cited recommendation.",
      draft: {
        open: true,
      },
      submitDraft,
    });

    await expect(firstRender.actions.submitSymphonyComposerPrompt()).resolves.toBe(false);

    expect(submitDraft).not.toHaveBeenCalled();
    expect(firstRender.draft.value.patternId).toBe("map_reduce");
    expect(firstRender.draft.value.preflightSelection?.goal).toBe("Compare each of these source packets and synthesize a cited recommendation.");

    const secondRender = createController({
      composerDraft: "Draft the implementation and have an independent reviewer verify tests and weak spots.",
      draft: {
        ...firstRender.draft.value,
        metricCustomizations: {
          "imitate_and_verify-metric": "Verifier must independently confirm tests and weak spots.",
        },
      },
      submitDraft,
    });

    await expect(secondRender.actions.submitSymphonyComposerPrompt()).resolves.toBe(true);

    expect(secondRender.draft.value.patternId).toBe("imitate_and_verify");
    expect(secondRender.draft.value.preflightSelection).toEqual(expect.objectContaining({
      source: "auto-selected",
      patternId: "imitate_and_verify",
      goal: "Draft the implementation and have an independent reviewer verify tests and weak spots.",
    }));
    expect(submitDraft).toHaveBeenCalledWith("prompt", false, expect.objectContaining({
      composerIntent: expect.objectContaining({
        kind: "symphony-workflow",
        action: "run-once",
        patternId: "imitate_and_verify",
      }),
    }));
  });

  it("reclassifies stale auto-selected patterns before saving a recipe for a changed goal", async () => {
    const nextState = desktopState();
    const saveSymphonyWorkflowRecipe = vi.fn(async () => nextState);
    vi.stubGlobal("window", { ambientDesktop: { saveSymphonyWorkflowRecipe } });
    const firstRender = createController({
      composerDraft: "Compare each of these source packets and synthesize a cited recommendation.",
      draft: {
        open: true,
      },
    });

    await expect(firstRender.actions.submitSymphonyComposerPrompt()).resolves.toBe(false);

    expect(firstRender.draft.value.patternId).toBe("map_reduce");

    const secondRender = createController({
      composerDraft: "Draft the implementation and have an independent reviewer verify tests and weak spots.",
      draft: {
        ...firstRender.draft.value,
        metricCustomizations: {
          "imitate_and_verify-metric": "Verifier must independently confirm tests and weak spots.",
        },
      },
    });

    await expect(secondRender.actions.submitSymphonyBuilderAction("save-recipe")).resolves.toBe(true);

    expect(saveSymphonyWorkflowRecipe).toHaveBeenCalledWith(expect.objectContaining({
      patternId: "imitate_and_verify",
      goal: "Draft the implementation and have an independent reviewer verify tests and weak spots.",
    }));
    expect(secondRender.draft.value.patternId).toBe("imitate_and_verify");
  });

  it("asks a bounded clarification question instead of launching when the pattern is ambiguous", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const controller = createController({
      composerDraft: "Help me with this.",
      draft: {
        open: true,
        metricCustomizations: {
          "map_reduce-metric": "Coverage must be explicit.",
        },
      },
      submitDraft,
    });

    await expect(controller.actions.submitSymphonyComposerPrompt()).resolves.toBe(false);

    expect(submitDraft).not.toHaveBeenCalled();
    expect(controller.setContextError).toHaveBeenCalledWith(expect.stringContaining("Which Symphony pattern should coordinate this request?"));
    expect(controller.setContextError).toHaveBeenCalledWith(expect.stringContaining("Custom"));
    expect(controller.draft.value.preflightClarification).toEqual(expect.objectContaining({
      goal: "Help me with this.",
      question: "Which Symphony pattern should coordinate this request?",
      candidates: expect.arrayContaining([
        expect.objectContaining({
          patternId: expect.any(String),
          label: expect.any(String),
          confidenceLabel: expect.stringContaining("confidence"),
        }),
      ]),
    }));
  });

  it("clears pending preflight clarification when the user chooses a pattern control", () => {
    const controller = createController({
      draft: {
        open: true,
        preflightClarification: {
          schemaVersion: "ambient-symphony-pattern-preflight-v1",
          goal: "Help me with this.",
          question: "Which Symphony pattern should coordinate this request?",
          candidates: [
            {
              patternId: "map_reduce",
              label: "Map-Reduce",
              confidenceLabel: "20% confidence",
              rationale: "Possible fit.",
              expectedChildren: "Explorer children plus a reducer.",
            },
          ],
          customOption: {
            label: "Custom details",
            description: "Add custom orchestration details to the request, then send again.",
          },
          missingInputs: ["Select a pattern before launch."],
        },
      },
    });

    controller.actions.selectSymphonyPattern("pipeline");

    expect(controller.draft.value.patternId).toBe("pipeline");
    expect(controller.draft.value.preflightClarification).toBeUndefined();
    expect(controller.draft.value.preflightSelection).toBeUndefined();
  });

  it("preserves the follow-up modifier when ordinary composer submit routes through Symphony", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const controller = createController({
      draft: readyDraft(),
      submitDraft,
    });

    await expect(controller.actions.submitSymphonyComposerPrompt(true)).resolves.toBe(true);

    expect(submitDraft).toHaveBeenCalledWith("prompt", true, expect.objectContaining({
      composerIntent: expect.objectContaining({
        kind: "symphony-workflow",
        action: "run-once",
      }),
    }));
  });

  it("clears conflicting composer modes when Symphony opens", () => {
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal("window", { setTimeout });
    const controller = createController({ draft: { open: false } });

    controller.actions.toggleSymphonyBuilder();

    expect(controller.draft.value.open).toBe(true);
    expect(controller.setLocalDeepResearchModeArmed).toHaveBeenCalledWith(false);
    expect(controller.goalModeArmed.value).toBe(false);
  });

  it("does not open Symphony while Planner Mode is active", () => {
    const controller = createController({
      draft: { open: false },
      state: desktopState({ collaborationMode: "planner" }),
    });

    controller.actions.toggleSymphonyBuilder();

    expect(controller.draft.value.open).toBe(false);
    expect(controller.setContextError).toHaveBeenCalledWith("Switch to Agent mode before using Symphony.");
  });

  it("allows an already-open Symphony builder to close in Planner Mode", () => {
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal("window", { setTimeout });
    const controller = createController({
      draft: { open: true },
      state: desktopState({ collaborationMode: "planner" }),
    });

    controller.actions.toggleSymphonyBuilder();

    expect(controller.draft.value.open).toBe(false);
    expect(controller.setContextError).not.toHaveBeenCalledWith("Switch to Agent mode before using Symphony.");
  });

  it("blocks direct Symphony actions after the thread switches to Planner Mode", async () => {
    const submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn;
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal("window", { setTimeout });
    const controller = createController({
      draft: readyDraft(),
      state: desktopState({ collaborationMode: "planner" }),
      submitDraft,
    });

    await expect(controller.actions.submitSymphonyBuilderAction("run-once")).resolves.toBe(false);

    expect(submitDraft).not.toHaveBeenCalled();
    expect(controller.draft.value.open).toBe(true);
    expect(controller.setContextError).toHaveBeenCalledWith("Switch to Agent mode before using Symphony.");
  });

  it("saves recipes through Desktop and refreshes workflow library state", async () => {
    const nextState = desktopState();
    const saveSymphonyWorkflowRecipe = vi.fn(async () => nextState);
    vi.stubGlobal("window", { ambientDesktop: { saveSymphonyWorkflowRecipe } });
    const controller = createController({ draft: readyDraft() });

    await expect(controller.actions.submitSymphonyBuilderAction("save-recipe")).resolves.toBe(true);

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
  composerDraft = "Audit the simplification plan.",
  draft = {},
  submitDraft = vi.fn(async () => undefined) as unknown as SubmitDraftFn,
  subagentUiEnabled = true,
  state: inputState,
}: {
  actionBusy?: SymphonyBuilderAction;
  composerDraft?: string;
  draft?: SymphonyWorkflowBuilderDraft;
  state?: DesktopState;
  submitDraft?: SubmitDraftFn;
  subagentUiEnabled?: boolean;
} = {}) {
  const state = statefulSetter<DesktopState | undefined>(inputState ?? desktopState());
  const draftState = statefulSetter<SymphonyWorkflowBuilderDraft>(draft);
  const actionBusyState = statefulSetter<SymphonyBuilderAction | undefined>(actionBusy);
  const goalModeArmedState = statefulSetter(true);
  const appendRunActivityLine = vi.fn();
  const focusComposerEnd = vi.fn();
  const rememberDesktopState = vi.fn();
  const refreshWorkflowRecordingLibraryOverride = vi.fn(async () => undefined);
  const setError = vi.fn();
  const setContextError = vi.fn();
  const setLocalDeepResearchModeArmed = vi.fn();
  const model = symphonyWorkflowBuilderUiModel({
    featureFlagSnapshot: state.value!.featureFlagSnapshot,
    draft,
  });
  return {
    actions: createAppSymphonyBuilderControls({
      appendRunActivityLine,
      focusComposerEnd,
      getComposerDraft: () => composerDraft,
      rememberDesktopState,
      refreshWorkflowRecordingLibraryOverride,
      setContextError,
      setError,
      setGoalModeArmed: goalModeArmedState.set,
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
    goalModeArmed: goalModeArmedState,
    refreshWorkflowRecordingLibraryOverride,
    rememberDesktopState,
    setContextError,
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

function desktopState(settings: Partial<DesktopState["settings"]> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    settings: {
      collaborationMode: "agent",
      ...settings,
    },
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
