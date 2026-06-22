import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import {
  createAppComposerShellProps,
  type AppComposerShellPropsInput,
} from "./AppComposerShellProps";

type DesktopStateInput = Omit<Partial<DesktopState>, "settings" | "sttQueue"> & {
  settings?: Partial<Omit<DesktopState["settings"], "stt" | "thinkingDisplay">> & {
    stt?: Partial<DesktopState["settings"]["stt"]>;
    thinkingDisplay?: Partial<DesktopState["settings"]["thinkingDisplay"]>;
  };
  sttQueue?: Partial<DesktopState["sttQueue"]>;
};

describe("App composer shell props", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives speech composer presentation from STT provider, queue, and composer state", () => {
    const props = createAppComposerShellProps(baseInput({
      state: desktopState({
        settings: {
          stt: {
            enabled: true,
            providerCapabilityId: "qwen-asr",
          },
        },
        sttQueue: {
          activeUtteranceId: undefined,
          queuedUtteranceIds: ["utt-1"],
        },
      }),
      sttComposer: { status: "idle" },
      sttProviders: [
        {
          available: true,
          availabilityReason: "",
          capabilityId: "qwen-asr",
          command: "transcribe",
          installed: true,
          languages: [],
          label: "Qwen3-ASR",
          packageId: "ambient-stt-qwen",
          packageName: "ambient-stt-qwen",
          providerId: "qwen",
        },
      ],
    }));

    expect(props.showSttComposerStrip).toBe(true);
    expect(props.sttQueuedSpeechLabel).toBe("1 speech utterance queued");
    expect(props.sttComposerStripStatus).toBe("queued");
    expect(props.sttComposerDisabled).toBe(false);
    expect(props.sttComposerTitle).toBe("Push to talk");
  });

  it("keeps composer callback adapters and planner revision routing stable", () => {
    const abortRun = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { abortRun } });
    const artifact = { id: "plan-1" } as PlannerPlanArtifact;
    const sendPlannerDurableRevision = vi.fn();
    const openPlannerRevisionDialog = vi.fn();
    const updateThreadSettings = vi.fn();
    const updateThinkingDisplaySettings = vi.fn();
    const submitSymphonyBuilderAction = vi.fn();
    const requestThreadPermissionModeChange = vi.fn();
    const projectBoardActions = { addPlannerPlanToBoard: vi.fn() };
    const props = createAppComposerShellProps(baseInput({
      getComposerDraft: () => " refine this ",
      latestDurablePlannerPlanArtifact: artifact,
      openPlannerRevisionDialog,
      projectBoardActions,
      requestThreadPermissionModeChange,
      sendPlannerDurableRevision,
      state: desktopState({
        activeThreadId: "thread-42",
        settings: {
          thinkingDisplay: { mode: "transient" },
        },
      }),
      submitSymphonyBuilderAction,
      updateThinkingDisplaySettings,
      updateThreadSettings,
    }));

    props.onReviseLatestPlannerPlan();
    props.onCollaborationModeChange("planner");
    props.onPermissionModeChange("full-access");
    props.onThinkingDisplayModeChange("full");
    props.onThinkingLevelChange("high");
    props.onSelectComposerModel("moonshotai/kimi-k2.7-code");
    props.onRunSymphonyOnce();
    props.onSaveSymphonyRecipe();
    props.onAddPlannerPlanToBoard(artifact);
    props.onAbortRun();

    expect(sendPlannerDurableRevision).toHaveBeenCalledWith(artifact, "refine this", { clearComposer: true });
    expect(openPlannerRevisionDialog).not.toHaveBeenCalled();
    expect(updateThreadSettings).toHaveBeenCalledWith({ collaborationMode: "planner" });
    expect(updateThreadSettings).toHaveBeenCalledWith({ thinkingLevel: "high" });
    expect(updateThreadSettings).toHaveBeenCalledWith({ model: "moonshotai/kimi-k2.7-code" });
    expect(requestThreadPermissionModeChange).toHaveBeenCalledWith("full-access");
    expect(updateThinkingDisplaySettings).toHaveBeenCalledWith({ mode: "full", showRunStatusCard: true });
    expect(submitSymphonyBuilderAction.mock.calls).toEqual([["run-once"], ["save-recipe"]]);
    expect(projectBoardActions.addPlannerPlanToBoard).toHaveBeenCalledWith(artifact);
    expect(abortRun).toHaveBeenCalledWith("thread-42");
  });

  it("routes empty planner revisions to the revision dialog", () => {
    const artifact = { id: "plan-2" } as PlannerPlanArtifact;
    const sendPlannerDurableRevision = vi.fn();
    const openPlannerRevisionDialog = vi.fn();
    const props = createAppComposerShellProps(baseInput({
      getComposerDraft: () => "   ",
      latestDurablePlannerPlanArtifact: artifact,
      openPlannerRevisionDialog,
      sendPlannerDurableRevision,
    }));

    props.onReviseLatestPlannerPlan();

    expect(sendPlannerDurableRevision).not.toHaveBeenCalled();
    expect(openPlannerRevisionDialog).toHaveBeenCalledWith(artifact);
  });

  it("keeps Local Deep Research effort adapters stable", () => {
    const setLocalDeepResearchBudgetOverride = vi.fn();
    const props = createAppComposerShellProps(baseInput({
      setLocalDeepResearchBudgetOverride,
      state: desktopState({
        settings: {
          collaborationMode: "agent",
        },
      }),
    }));

    props.onSelectLocalDeepResearchEffort("deep");
    props.onLocalDeepResearchCustomMaxToolCallsChange(24);

    expect(setLocalDeepResearchBudgetOverride).toHaveBeenCalledWith({ effort: "deep" });
    expect(setLocalDeepResearchBudgetOverride).toHaveBeenCalledWith({ effort: "custom", maxToolCalls: 24 });
  });
});

function baseInput(input: Partial<AppComposerShellPropsInput> = {}): AppComposerShellPropsInput {
  const noop = vi.fn();
  return {
    attachComposerFiles: noop,
    attachExistingWorktreeFromFooter: noop,
    clearActiveGoal: noop,
    compactActiveThread: noop,
    duplicateActiveThreadFromTranscript: noop,
    editActiveGoalObjective: noop,
    exportActiveChat: noop,
    getComposerDraft: () => "",
    openGitSummaryPanel: noop,
    openPlannerRevisionDialog: noop,
    pauseOrResumeActiveGoal: noop,
    previewArtifact: noop,
    projectBoardActions: { addPlannerPlanToBoard: noop },
    recoverActiveThreadContext: noop,
    recoverActiveThreadContextAndRetryLatest: noop,
    requestThreadPermissionModeChange: noop,
    retrySttComposerTranscription: noop,
    runProjectBoardThreadPlanAction: noop,
    sendPlannerDurableRevision: noop,
    setActiveGoalBudget: noop,
    setChatExportStatus: noop,
    setGoalMenuOpen: noop,
    setLocalDeepResearchBudgetOverride: noop,
    startSttComposerRecording: noop,
    stopSttComposerRecording: noop,
    sttComposer: { status: "idle" },
    sttProviders: [],
    submitSymphonyBuilderAction: noop,
    switchBranch: noop,
    toggleGoalMode: noop,
    updateThinkingDisplaySettings: noop,
    updateThreadSettings: noop,
    state: desktopState(),
    ...input,
  } as AppComposerShellPropsInput;
}

function desktopState(input: DesktopStateInput = {}): DesktopState {
  const { settings: inputSettings = {}, ...stateInput } = input;
  const baseSettings = {
    collaborationMode: "agent",
    stt: {
      enabled: false,
      autoSendAfterTranscription: false,
      bargeIn: { enabled: false },
      mode: "push_to_talk",
      noSpeechGate: { enabled: false },
      providerCapabilityId: undefined,
      pushToTalkShortcut: undefined,
      silenceFinalizeSeconds: 1,
      spokenLanguage: "en",
    },
    thinkingDisplay: {
      mode: "transient",
      showRunStatusCard: true,
    },
  } as unknown as DesktopState["settings"];
  return {
    activeThreadId: "thread-1",
    messages: [],
    settings: {
      ...baseSettings,
      ...inputSettings,
      stt: {
        ...baseSettings.stt,
        ...inputSettings.stt,
      },
      thinkingDisplay: {
        ...baseSettings.thinkingDisplay,
        ...inputSettings.thinkingDisplay,
      },
    },
    sttQueue: {
      phase: "idle",
      activeUtteranceId: undefined,
      queuedUtteranceIds: [],
      ...input.sttQueue,
    },
    ...stateInput,
  } as DesktopState;
}
