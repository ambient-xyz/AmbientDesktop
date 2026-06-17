import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  LocalDeepResearchRunBudget,
  RunStatus,
  SlashCommandSelection,
  SttMessageMetadata,
  ThreadGoal,
  WorkspaceContextReference,
} from "../../shared/types";
import { resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
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
    const budget = resolveLocalDeepResearchRunBudget(undefined);
    expect(localDeepResearchSubmitOptions(false, budget)).toEqual({
      composerIntent: {
        kind: "local-deep-research",
        localDeepResearch: budget,
      },
      activityLine: "Local Deep Research request sent to Ambient.",
    });
    expect(localDeepResearchSubmitOptions(true, budget)).toEqual({
      composerIntent: {
        kind: "local-deep-research",
        localDeepResearch: budget,
      },
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

  it("snapshots the selected Local Deep Research budget into the sent composer intent", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { sendMessage } });
    const budget = resolveLocalDeepResearchRunBudget(undefined, { effort: "deep", maxToolCalls: 60 });
    const controller = createController({
      draft: "Compare local research paths.",
      localDeepResearchModeArmed: true,
      localDeepResearchRunBudget: budget,
    });

    await controller.actions.submitComposerDraft("prompt");

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: "Compare local research paths.",
      composerIntent: {
        kind: "local-deep-research",
        localDeepResearch: budget,
      },
    }));
    expect(controller.localDeepResearchModeArmedRef.current).toBe(false);
  });

  it("blocks chat submission while Local Deep Research is running in the thread", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { sendMessage } });
    const controller = createController({
      draft: "Can you add a note?",
      localDeepResearchRunActive: true,
      running: true,
    });

    await controller.actions.submitComposerDraft("prompt");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(controller.contextError.value).toBe("Local Deep Research is running in this thread. Stop it or wait for it to finish before sending another message.");
    expect(controller.draft.value).toBe("Can you add a note?");
    expect(controller.appendRunActivityLine).not.toHaveBeenCalled();
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

  it("sends and restores selected slash command intents", async () => {
    const selection = slashCommandSelection();
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(async () => ({
          schemaVersion: "ambient-slash-command-describe-v1",
          status: "described",
          entryId: selection.entryId,
          entry: {
            id: selection.entryId,
            command: selection.command,
            aliases: [],
            title: selection.title,
            kind: selection.kind,
            sourceKind: selection.sourceKind,
            invocationKind: selection.invocationKind,
            availability: "available",
            badges: ["Skill"],
            icon: "sparkles",
            sourceId: selection.sourceId,
            sourceName: selection.sourceName,
            sourceVersion: selection.sourceVersion,
            sourceFingerprint: selection.sourceFingerprint,
            requiresParameters: false,
            searchText: "reviewer",
          },
          parameters: [],
          diagnostics: [],
        })),
        sendMessage: vi.fn(async () => {
          throw new Error("send failed");
        }),
      },
    });
    const controller = createController({
      draft: "Review the migration.",
      selectedSlashCommand: selection,
    });

    await controller.actions.submitDraft("prompt");

    expect(window.ambientDesktop.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      composerIntent: {
        kind: "slash-command",
        selection,
      },
    }));
    expect(controller.slashCommandSelection.value).toEqual(selection);
    expect(controller.draft.value).toBe("Review the migration.");
  });

  it("submits bare selected slash command intents", async () => {
    const selection = slashCommandSelection();
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(async () => availableSlashCommandDescription(selection)),
        sendMessage,
      },
    });
    const controller = createController({
      draft: "",
      selectedSlashCommand: selection,
    });

    await controller.actions.submitDraft("prompt");

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: selection.command,
      composerIntent: {
        kind: "slash-command",
        selection,
      },
    }));
  });

  it("requires prompt input before sending selected slash commands with required parameters", async () => {
    const selection = {
      ...slashCommandSelection(),
      requiresParameters: true,
    };
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(async () => availableSlashCommandDescription(selection)),
        sendMessage,
      },
    });
    const controller = createController({
      draft: "",
      selectedSlashCommand: selection,
    });

    await controller.actions.submitDraft("prompt");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(window.ambientDesktop.describeSlashCommand).not.toHaveBeenCalled();
    expect(controller.contextError.value).toBe("Add input for reviewer before sending this slash command.");
    expect(controller.slashCommandSelection.value).toEqual(selection);
  });

  it("does not clear a newly selected slash command when an earlier send completes", async () => {
    const initialSelection = slashCommandSelection();
    const nextSelection = {
      ...slashCommandSelection(),
      entryId: "codex-plugin-skill:next-reviewer",
      command: "/next-reviewer",
      title: "next-reviewer",
      sourceId: "plugin-next-reviewer",
      sourceName: "next-reviewer",
      sourceFingerprint: "def456",
    };
    const send = deferred<void>();
    const sendMessage = vi.fn(() => send.promise);
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(async () => ({
          schemaVersion: "ambient-slash-command-describe-v1",
          status: "described",
          entryId: initialSelection.entryId,
          entry: {
            id: initialSelection.entryId,
            command: initialSelection.command,
            aliases: [],
            title: initialSelection.title,
            kind: initialSelection.kind,
            sourceKind: initialSelection.sourceKind,
            invocationKind: initialSelection.invocationKind,
            availability: "available",
            badges: ["Skill"],
            icon: "sparkles",
            sourceId: initialSelection.sourceId,
            sourceName: initialSelection.sourceName,
            sourceVersion: initialSelection.sourceVersion,
            sourceFingerprint: initialSelection.sourceFingerprint,
            requiresParameters: false,
            searchText: "reviewer",
          },
          parameters: [],
          diagnostics: [],
        })),
        sendMessage,
      },
    });
    const controller = createController({
      draft: "Review the migration.",
      selectedSlashCommand: initialSelection,
    });

    const submit = controller.actions.submitDraft("prompt");
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(controller.slashCommandSelection.value).toBeUndefined();

    controller.slashCommandSelection.set(nextSelection);
    send.resolve(undefined);
    await submit;

    expect(controller.slashCommandSelection.value).toEqual(nextSelection);
  });

  it("does not restore a failed send slash command over a newer selection", async () => {
    const initialSelection = slashCommandSelection();
    const nextSelection = {
      ...slashCommandSelection(),
      entryId: "codex-plugin-skill:next-reviewer",
      command: "/next-reviewer",
      title: "next-reviewer",
      sourceId: "plugin-next-reviewer",
      sourceName: "next-reviewer",
      sourceFingerprint: "def456",
    };
    const send = deferred<void>();
    const sendMessage = vi.fn(() => send.promise);
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(async () => availableSlashCommandDescription(initialSelection)),
        sendMessage,
      },
    });
    const controller = createController({
      draft: "Review the migration.",
      selectedSlashCommand: initialSelection,
    });

    const submit = controller.actions.submitDraft("prompt");
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledOnce();

    controller.draft.value = "Review the follow-up.";
    controller.slashCommandSelection.set(nextSelection);
    send.reject(new Error("send failed"));
    await submit;

    expect(controller.draft.value).toBe("Review the follow-up.");
    expect(controller.slashCommandSelection.value).toEqual(nextSelection);
  });

  it("cancels slash command sends when the composer changes during validation", async () => {
    const selection = slashCommandSelection();
    const validation = deferred<ReturnType<typeof availableSlashCommandDescription>>();
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(() => validation.promise),
        sendMessage,
      },
    });
    const controller = createController({
      draft: "Review the migration.",
      selectedSlashCommand: selection,
    });

    const submit = controller.actions.submitDraft("prompt");
    await flushPromises();
    expect(controller.draft.value).toBe("");
    expect(controller.slashCommandSelection.value).toBeUndefined();

    controller.draft.value = "Review the follow-up.";
    validation.resolve(availableSlashCommandDescription(selection));
    await submit;

    expect(sendMessage).not.toHaveBeenCalled();
    expect(controller.contextError.value).toBe("Slash command send was canceled because the composer changed. Send again when ready.");
    expect(controller.draft.value).toBe("Review the follow-up.");
  });

  it("preserves selected slash commands when local composer commands conflict", async () => {
    const selection = slashCommandSelection();
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(async () => availableSlashCommandDescription(selection)),
        sendMessage,
      },
    });
    const controller = createController({
      draft: "/plan",
      selectedSlashCommand: selection,
    });

    await controller.actions.submitDraft("prompt");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(window.ambientDesktop.describeSlashCommand).not.toHaveBeenCalled();
    expect(controller.contextError.value).toBe("Remove the selected slash command before using this composer action.");
    expect(controller.draft.value).toBe("/plan");
    expect(controller.slashCommandSelection.value).toEqual(selection);
  });

  it("rejects unavailable slash command selections before sending", async () => {
    const selection = slashCommandSelection();
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        describeSlashCommand: vi.fn(async () => ({
          schemaVersion: "ambient-slash-command-describe-v1",
          status: "described",
          entryId: selection.entryId,
          entry: {
            id: selection.entryId,
            command: selection.command,
            aliases: [],
            title: selection.title,
            kind: selection.kind,
            sourceKind: selection.sourceKind,
            invocationKind: selection.invocationKind,
            availability: "untrusted",
            availabilityReason: "Plugin must be trusted before its skills can be invoked.",
            badges: ["Skill"],
            icon: "sparkles",
            requiresParameters: false,
            searchText: "reviewer",
          },
          parameters: [],
          diagnostics: [],
        })),
        sendMessage,
      },
    });
    const controller = createController({
      draft: "Review the migration.",
      selectedSlashCommand: selection,
    });

    await controller.actions.submitDraft("prompt");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(controller.contextError.value).toBe("Plugin must be trusted before its skills can be invoked.");
    expect(controller.draft.value).toBe("Review the migration.");
    expect(controller.slashCommandSelection.value).toEqual(selection);
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
  localDeepResearchRunActive = false,
  localDeepResearchRunBudget = resolveLocalDeepResearchRunBudget(undefined),
  pendingWorkflowRecordingEditContext = undefined,
  running = false,
  selectedSlashCommand = undefined,
  state = desktopState(),
  sttDraftMetadata = undefined,
  workflowRecordingReviewFeedbackActive = false,
}: {
  activeThreadWorkflowRecordingStopped?: boolean;
  contextAttachments?: WorkspaceContextReference[];
  draft?: string;
  goalModeArmed?: boolean;
  localDeepResearchModeArmed?: boolean;
  localDeepResearchRunActive?: boolean;
  localDeepResearchRunBudget?: LocalDeepResearchRunBudget;
  pendingWorkflowRecordingEditContext?: PendingWorkflowRecordingEditContext;
  running?: boolean;
  selectedSlashCommand?: SlashCommandSelection;
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
  const slashCommandSelectionState = statefulSetter<SlashCommandSelection | undefined>(selectedSlashCommand);
  const sttDraftMetadataState = statefulSetter<SttDraftMetadataState | undefined>(sttDraftMetadata);
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const localDeepResearchModeArmedRef = { current: localDeepResearchModeArmed };
  const localDeepResearchRunBudgetRef = { current: localDeepResearchRunBudget };
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
      getSlashCommandSelection: () => slashCommandSelectionState.value,
      goalModeArmed,
      localDeepResearchRunActive,
      localDeepResearchModeArmedRef,
      localDeepResearchRunBudgetRef,
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
      setSlashCommandSelection: slashCommandSelectionState.set,
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
    localDeepResearchModeArmedRef,
    openAmbientCliSecretDialog,
    pendingWorkflowRecordingEditContext: pendingWorkflowRecordingEditContextState,
    registerPendingSubmittedPrompt,
    removePendingSubmittedPrompt,
    resetPromptHistory,
    resetRunActivityLines,
    runStatus,
    setError,
    slashCommandSelection: slashCommandSelectionState,
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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

function slashCommandSelection(): SlashCommandSelection {
  return {
    schemaVersion: "ambient-slash-command-invocation-v1",
    entryId: "codex-plugin-skill:reviewer",
    command: "/reviewer",
    title: "reviewer",
    kind: "skill",
    sourceKind: "codex-plugin",
    invocationKind: "codex-plugin-skill",
    sourceId: "plugin-reviewer",
    sourceName: "reviewer",
    sourceVersion: "1.0.0",
    sourceFingerprint: "abc123",
    requiresParameters: false,
  };
}

function availableSlashCommandDescription(selection: SlashCommandSelection) {
  return {
    schemaVersion: "ambient-slash-command-describe-v1",
    status: "described",
    entryId: selection.entryId,
    entry: {
      id: selection.entryId,
      command: selection.command,
      aliases: [],
      title: selection.title,
      kind: selection.kind,
      sourceKind: selection.sourceKind,
      invocationKind: selection.invocationKind,
      availability: "available",
      badges: ["Skill"],
      icon: "sparkles",
      sourceId: selection.sourceId,
      sourceName: selection.sourceName,
      sourceVersion: selection.sourceVersion,
      sourceFingerprint: selection.sourceFingerprint,
      requiresParameters: Boolean(selection.requiresParameters),
      searchText: "reviewer",
    },
    parameters: [],
    diagnostics: [],
  } as const;
}
