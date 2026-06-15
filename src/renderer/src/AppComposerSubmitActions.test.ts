import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  RunStatus,
  SttMessageMetadata,
  ThreadGoal,
  WorkspaceContextReference,
} from "../../shared/types";
import {
  createAppComposerSubmitActions,
  localDeepResearchSubmitOptions,
  shouldArmComposerGoal,
  submittedComposerDelivery,
  workflowRecordingEditContextForContent,
  type PendingWorkflowRecordingEditContext,
} from "./AppComposerSubmitActions";
import type { SttDraftMetadataState } from "./sttUiModel";

describe("App composer submit actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("models Local Deep Research delivery and goal arming decisions", () => {
    expect(localDeepResearchSubmitOptions(false)).toEqual({
      composerIntent: { kind: "local-deep-research" },
      activityLine: "Local Deep Research request sent to Ambient.",
    });
    expect(localDeepResearchSubmitOptions(true)).toEqual({
      composerIntent: { kind: "local-deep-research" },
      activityLine: "Queued Local Deep Research for the current run.",
    });
    expect(submittedComposerDelivery({
      followUpModifier: false,
      localDeepResearchModeRequested: true,
      requestedDelivery: "prompt",
      running: true,
    })).toBe("follow-up");
    expect(shouldArmComposerGoal({
      activeThreadGoal: undefined,
      delivery: "prompt",
      goalModeArmed: true,
      mode: "agent",
      running: false,
    })).toBe(true);
    expect(shouldArmComposerGoal({
      activeThreadGoal: { goalId: "goal-1" } as ThreadGoal,
      delivery: "prompt",
      goalModeArmed: true,
      mode: "agent",
      running: false,
    })).toBe(false);
  });

  it("selects workflow edit context only when the submitted content still has the draft prefix", () => {
    const pending = workflowEditContext();

    expect(workflowRecordingEditContextForContent(pending, "Edit: add a retry step")).toEqual(pending);
    expect(workflowRecordingEditContextForContent(pending, "Different prompt")).toBeUndefined();
    expect(workflowRecordingEditContextForContent(undefined, "Edit: add a retry step")).toBeUndefined();
  });

  it("intercepts secret slash commands before sending", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("window", { ambientDesktop: { sendMessage } });
    const controller = createController({ draft: "/secret brave-search BRAVE_API_KEY" });

    await controller.actions.submitDraft("prompt");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(controller.draft.value).toBe("");
    expect(controller.sttDraftMetadata.value).toBeUndefined();
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
    expect(controller.openAmbientCliSecretDialog).toHaveBeenCalledWith({
      packageName: "brave-search",
      envName: "BRAVE_API_KEY",
    });
  });

  it("sends normal composer prompts with context, STT metadata, workflow edit context, and goal mode", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { sendMessage } });
    const context = [contextRef("README.md")];
    const pending = workflowEditContext();
    const sttMetadata = sttMessageMetadata();
    const controller = createController({
      contextAttachments: context,
      draft: "Edit: add a retry step",
      goalModeArmed: true,
      pendingWorkflowRecordingEditContext: pending,
      sttDraftMetadata: {
        content: "Edit: add a retry step",
        metadata: sttMetadata,
      },
    });

    await controller.actions.submitDraft("prompt");

    expect(controller.updateThreadSettings).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: "thread-1",
      content: "Edit: add a retry step",
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient",
      thinkingLevel: "medium",
      delivery: "prompt",
      context,
      workflowRecordingEditContext: pending,
      stt: sttMetadata,
      goalMode: { enabled: true },
    });
    expect(controller.draft.value).toBe("");
    expect(controller.contextAttachments.value).toEqual([]);
    expect(controller.pendingWorkflowRecordingEditContext.value).toBeUndefined();
    expect(controller.registerPendingSubmittedPrompt).toHaveBeenCalledWith({
      threadId: "thread-1",
      content: "Edit: add a retry step",
      delivery: "prompt",
    });
    expect(controller.removePendingSubmittedPrompt).not.toHaveBeenCalled();
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Prompt sent to Ambient.");
    expect(controller.runStatus.value).toBe("starting");
    expect(controller.threadRunStatuses.value).toEqual({ "thread-1": "starting" });
    expect(controller.goalModeArmed.value).toBe(false);
  });

  it("restores draft, context, STT metadata, and workflow edit context after send failure", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        sendMessage: vi.fn(async () => {
          throw new Error("send failed");
        }),
      },
    });
    const context = [contextRef("README.md")];
    const pending = workflowEditContext();
    const sttDraftMetadata = {
      content: "Edit: add a retry step",
      metadata: sttMessageMetadata(),
    };
    const controller = createController({
      contextAttachments: context,
      draft: "Edit: add a retry step",
      pendingWorkflowRecordingEditContext: pending,
      sttDraftMetadata,
    });

    await controller.actions.submitDraft("prompt");

    expect(controller.setError).toHaveBeenCalledWith("send failed");
    expect(controller.removePendingSubmittedPrompt).toHaveBeenCalledWith("pending-submitted-1");
    expect(controller.draft.value).toBe("Edit: add a retry step");
    expect(controller.contextAttachments.value).toEqual(context);
    expect(controller.pendingWorkflowRecordingEditContext.value).toEqual(pending);
    expect(controller.sttDraftMetadata.value).toEqual(sttDraftMetadata);
    expect(controller.runStatus.value).toBe("error");
  });

  it("blocks Ambient Review feedback when attachments are still selected", async () => {
    const requestWorkflowRecordingReview = vi.fn();
    vi.stubGlobal("window", { ambientDesktop: { requestWorkflowRecordingReview } });
    const controller = createController({
      activeThreadWorkflowRecordingStopped: true,
      contextAttachments: [contextRef("README.md")],
      draft: "Looks good, but tighten the assertions",
      workflowRecordingReviewFeedbackActive: true,
    });

    await controller.actions.submitDraft("prompt");

    expect(requestWorkflowRecordingReview).not.toHaveBeenCalled();
    expect(controller.setError).toHaveBeenCalledWith("Ambient Review feedback cannot include file attachments. Remove attachments, or close the review panel to send a normal message.");
    expect(controller.draft.value).toBe("Looks good, but tighten the assertions");
  });
});

function createController({
  activeThreadWorkflowRecordingStopped = false,
  contextAttachments = [],
  draft = "Hello",
  goalModeArmed = false,
  localDeepResearchModeArmed = false,
  pendingWorkflowRecordingEditContext = undefined,
  running = false,
  state = desktopState(),
  sttDraftMetadata = undefined,
  workflowRecordingReviewFeedbackActive = false,
}: {
  activeThreadWorkflowRecordingStopped?: boolean;
  contextAttachments?: WorkspaceContextReference[];
  draft?: string;
  goalModeArmed?: boolean;
  localDeepResearchModeArmed?: boolean;
  pendingWorkflowRecordingEditContext?: PendingWorkflowRecordingEditContext;
  running?: boolean;
  state?: DesktopState | undefined;
  sttDraftMetadata?: SttDraftMetadataState;
  workflowRecordingReviewFeedbackActive?: boolean;
} = {}) {
  const draftState = { value: draft };
  const contextAttachmentsState = statefulSetter<WorkspaceContextReference[]>(contextAttachments);
  const contextError = statefulSetter<string | undefined>(undefined);
  const goalModeArmedState = statefulSetter(goalModeArmed);
  const pendingWorkflowRecordingEditContextState = statefulSetter<PendingWorkflowRecordingEditContext | undefined>(pendingWorkflowRecordingEditContext);
  const runStatus = statefulSetter<RunStatus>("idle");
  const sttDraftMetadataState = statefulSetter<SttDraftMetadataState | undefined>(sttDraftMetadata);
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const localDeepResearchModeArmedRef = { current: localDeepResearchModeArmed };
  const appendRunActivityLine = vi.fn();
  const compactActiveThread = vi.fn(async () => undefined);
  const openAmbientCliSecretDialog = vi.fn();
  const registerPendingSubmittedPrompt = vi.fn(() => "pending-submitted-1");
  const removePendingSubmittedPrompt = vi.fn();
  const resetPromptHistory = vi.fn();
  const resetRunActivityLines = vi.fn();
  const setError = vi.fn();
  const updateThreadSettings = vi.fn(async () => undefined);

  return {
    actions: createAppComposerSubmitActions({
      activeThreadWorkflowRecordingStopped,
      appendRunActivityLine,
      compactActiveThread,
      contextAttachments,
      getComposerDraft: () => draftState.value,
      goalModeArmed,
      localDeepResearchModeArmedRef,
      openAmbientCliSecretDialog,
      registerPendingSubmittedPrompt,
      pendingWorkflowRecordingEditContext,
      resetPromptHistory,
      removePendingSubmittedPrompt,
      resetRunActivityLines,
      running,
      setComposerDraft: (value) => {
        draftState.value = value;
      },
      setContextAttachments: contextAttachmentsState.set,
      setContextError: contextError.set,
      setError,
      setGoalModeArmed: goalModeArmedState.set,
      setLocalDeepResearchModeArmed: (next) => {
        localDeepResearchModeArmedRef.current = next;
      },
      setPendingWorkflowRecordingEditContext: pendingWorkflowRecordingEditContextState.set,
      setRunStatus: runStatus.set,
      setSttDraftMetadata: sttDraftMetadataState.set,
      setThreadRunStatuses: threadRunStatuses.set,
      state,
      sttDraftMetadata,
      updateThreadSettings,
      workflowRecordingReviewFeedbackActive,
    }),
    appendRunActivityLine,
    compactActiveThread,
    contextAttachments: contextAttachmentsState,
    contextError,
    draft: draftState,
    goalModeArmed: goalModeArmedState,
    openAmbientCliSecretDialog,
    pendingWorkflowRecordingEditContext: pendingWorkflowRecordingEditContextState,
    registerPendingSubmittedPrompt,
    removePendingSubmittedPrompt,
    resetPromptHistory,
    resetRunActivityLines,
    runStatus,
    setError,
    sttDraftMetadata: sttDraftMetadataState,
    threadRunStatuses,
    updateThreadSettings,
  };
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

function desktopState(settings: Partial<DesktopState["settings"]> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    settings: {
      collaborationMode: "agent",
      model: "ambient",
      permissionMode: "full-access",
      thinkingLevel: "medium",
      ...settings,
    },
  } as DesktopState;
}

function contextRef(path: string): WorkspaceContextReference {
  return {
    kind: "file",
    name: path,
    path,
  };
}

function workflowEditContext(): PendingWorkflowRecordingEditContext {
  return {
    draftPrefix: "Edit:",
    recordingId: "recording-1",
    playbookId: "playbook-1",
    stepId: "step-1",
  } as unknown as PendingWorkflowRecordingEditContext;
}

function sttMessageMetadata(): SttMessageMetadata {
  return {
    utteranceId: "utt-1",
    language: "en",
    status: "ready",
    text: "Edit: add a retry step",
  } as unknown as SttMessageMetadata;
}
