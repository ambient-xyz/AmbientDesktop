import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { RunStatus, ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowRecordingLibraryEntry, WorkflowRecordingState } from "../../shared/workflowTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import {
  activeThreadHasWorkflowRecordingStatus,
  activeWorkflowRecordingForState,
  createAppWorkflowRecordingActions,
  createAppWorkflowRecordingActionsForApp,
  type AppWorkflowRecordingActionsForAppInput,
  workflowRecordingInitialGoalMessageInput,
  workflowRecordingArchiveConfirmation,
  workflowRecordingArchiveInput,
  workflowRecordingGoalFromInput,
  workflowRecordingRunStatusesWithStarting,
  workflowRecordingStartInput,
  workflowRecordingVersionInput,
} from "./AppWorkflowRecordingActions";

describe("App workflow recording actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("trims optional start goals while preserving workspace path", () => {
    expect(workflowRecordingGoalFromInput("  build a workflow  ")).toBe("build a workflow");
    expect(workflowRecordingGoalFromInput("   ")).toBeUndefined();
    expect(workflowRecordingStartInput("  build a workflow  ", "/repo")).toEqual({
      goal: "build a workflow",
      workspacePath: "/repo",
    });
    expect(workflowRecordingStartInput("   ", "/repo")).toEqual({ workspacePath: "/repo" });
  });

  it("builds the initial message for a new workflow recording chat", () => {
    const state = desktopState({ activeThreadId: "recording-thread" });

    expect(workflowRecordingInitialGoalMessageInput(state, "Make the weekly report")).toEqual({
      threadId: "recording-thread",
      content: "Make the weekly report",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "ambient",
      thinkingLevel: "medium",
      delivery: "prompt",
      context: [],
    });
    expect(workflowRecordingRunStatusesWithStarting({ other: "idle" }, "recording-thread")).toEqual({
      other: "idle",
      "recording-thread": "starting",
    });
  });

  it("starts a workflow recording and immediately submits the goal to the new Workflow Chat", async () => {
    const next = desktopState({ activeThreadId: "recording-thread" });
    const startWorkflowRecording = vi.fn(async () => next);
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: { startWorkflowRecording, sendMessage },
      setTimeout: (handler: TimerHandler, timeout?: number) => globalThis.setTimeout(handler, timeout),
    });
    const controller = createController();

    await controller.actions.startWorkflowRecording("  Make the weekly report  ");

    expect(startWorkflowRecording).toHaveBeenCalledWith({
      goal: "Make the weekly report",
      workspacePath: "/repo",
    });
    expect(controller.applyCreatedThreadState).toHaveBeenCalledWith(next, "/repo");
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith(
      "Workflow recording prompt sent to Ambient.",
      "recording-thread",
    );
    expect(controller.runStatus.value).toBe("starting");
    expect(controller.threadRunStatuses.value).toEqual({ "recording-thread": "starting" });
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: "recording-thread",
      content: "Make the weekly report",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "ambient",
      thinkingLevel: "medium",
      delivery: "prompt",
      context: [],
    });
    expect(controller.scheduleComposerDraftFocus).not.toHaveBeenCalled();
  });

  it("does not submit a workflow goal when the created recording thread state is stale", async () => {
    const next = desktopState({ activeThreadId: "recording-stale" });
    const startWorkflowRecording = vi.fn(async () => next);
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { startWorkflowRecording, sendMessage } });
    const controller = createController({ createdThreadApplied: false });

    await expect(controller.actions.startWorkflowRecording("  Make the weekly report  ")).resolves.toBe(false);

    expect(controller.applyCreatedThreadState).toHaveBeenCalledWith(next, "/repo");
    expect(controller.setSidebarArea).not.toHaveBeenCalled();
    expect(controller.closeProjectBoard).not.toHaveBeenCalled();
    expect(controller.resetPromptHistory).not.toHaveBeenCalled();
    expect(controller.resetRunActivityLines).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(controller.runStatus.value).toBe("idle");
    expect(controller.threadRunStatuses.value).toEqual({});
    expect(controller.setError).toHaveBeenCalledWith("Created workflow recording thread state was superseded before the launch could be applied.");
  });

  it("restores the workflow goal to the composer when immediate submission fails", async () => {
    const next = desktopState({ activeThreadId: "recording-thread" });
    vi.stubGlobal("window", {
      ambientDesktop: {
        startWorkflowRecording: vi.fn(async () => next),
        sendMessage: vi.fn(async () => {
          throw new Error("send failed");
        }),
      },
    });
    const controller = createController();

    const started = await controller.actions.startWorkflowRecording("Make the weekly report");

    expect(started, JSON.stringify(controller.setError.mock.calls)).toBe(true);

    expect(controller.setError).toHaveBeenLastCalledWith("send failed");
    expect(controller.runStatus.value).toBe("error");
    expect(controller.scheduleComposerDraftFocus).toHaveBeenCalledWith("Make the weekly report");
  });

  it("maps App owner state into workflow recording actions", async () => {
    vi.useFakeTimers();
    const next = desktopState({ activeThreadId: "recording-thread" });
    const startWorkflowRecording = vi.fn(async () => next);
    const sendMessage = vi.fn(async () => {
      throw new Error("send failed");
    });
    vi.stubGlobal("window", {
      ambientDesktop: { startWorkflowRecording, sendMessage },
      setTimeout: (handler: TimerHandler, timeout?: number) => globalThis.setTimeout(handler, timeout),
    });
    const controller = createForAppController();

    const started = await controller.actions.startWorkflowRecording("Make the weekly report");

    expect(started, JSON.stringify(controller.setError.mock.calls)).toBe(true);

    expect(controller.applyCreatedThreadState).toHaveBeenCalledWith(next, "/repo");
    expect(controller.projectBoardOpen.value).toBe(false);
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith(
      "Workflow recording prompt sent to Ambient.",
      "recording-thread",
    );
    expect(controller.runStatus.value).toBe("error");
    expect(controller.threadRunStatuses.value).toEqual({ "recording-thread": "starting" });

    await vi.runAllTimersAsync();

    expect(controller.setComposerDraft).toHaveBeenCalledWith("Make the weekly report");
    expect(controller.focusEnd).toHaveBeenCalledOnce();
  });

  it("finds the active recording from a returned desktop state", () => {
    const recording = workflowRecording({ status: "stopped" });
    expect(activeWorkflowRecordingForState(desktopState({
      activeThreadId: "thread-2",
      threads: [
        thread({ id: "thread-1" }),
        thread({ id: "thread-2", workflowRecording: recording }),
      ],
    }))).toBe(recording);
  });

  it("checks active-thread recording status before issuing lifecycle actions", () => {
    expect(activeThreadHasWorkflowRecordingStatus(thread({ workflowRecording: workflowRecording({ status: "recording" }) }), "recording")).toBe(true);
    expect(activeThreadHasWorkflowRecordingStatus(thread({ workflowRecording: workflowRecording({ status: "stopped" }) }), "recording")).toBe(false);
    expect(activeThreadHasWorkflowRecordingStatus(undefined, "recording")).toBe(false);
  });

  it("sends a stopped workflow recording review request with the existing activity reset behavior", async () => {
    const requestWorkflowRecordingReview = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { requestWorkflowRecordingReview } });
    const recording = workflowRecording({ status: "stopped", review: { status: "draft", draft: workflowDraft() } });
    const controller = createController({
      activeThread: thread({ workflowRecording: recording }),
      state: desktopState({ activeThreadId: "thread-1" }),
    });

    await controller.actions.sendWorkflowRecordingReviewPrompt();

    expect(controller.setError).toHaveBeenCalledWith(undefined);
    expect(controller.setContextError).toHaveBeenCalledWith(undefined);
    expect(controller.contextAttachments.value).toEqual([]);
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith(
      "Workflow recording stopped; dedicated review sent to Ambient.",
      "thread-1",
    );
    expect(controller.runStatus.value).toBe("starting");
    expect(controller.threadRunStatuses.value).toEqual({ "thread-1": "starting" });
    expect(requestWorkflowRecordingReview).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("retries workflow recording review after aborting the active run", async () => {
    const abortRun = vi.fn(async () => undefined);
    const requestWorkflowRecordingReview = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { abortRun, requestWorkflowRecordingReview } });
    const recording = workflowRecording({ status: "stopped", review: { status: "draft", draft: workflowDraft() } });
    const controller = createController({
      abortArmed: true,
      running: true,
      state: desktopState({ activeThreadId: "thread-1" }),
    });

    await controller.actions.retryWorkflowRecordingReview(recording);

    expect(abortRun).toHaveBeenCalledWith("thread-1");
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith(
      "Workflow recording review retry sent to a fresh Ambient session.",
      "thread-1",
    );
    expect(requestWorkflowRecordingReview).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("keeps archive and version request shapes stable", () => {
    const playbook = workflowPlaybook({ id: "playbook-1", title: "Review invoices", version: 7 });
    expect(workflowRecordingArchiveConfirmation(playbook)).toBe(
      "Archive \"Review invoices\"? It will be hidden from default workflow search and suggestions, but its package and versions will be kept.",
    );
    expect(workflowRecordingArchiveInput(playbook)).toEqual({
      id: "playbook-1",
      baseVersion: 7,
      reason: "Archived from Workflow Recordings.",
    });
    expect(workflowRecordingVersionInput(playbook)).toEqual({
      id: "playbook-1",
      baseVersion: 7,
    });
  });
});

function workflowRecording(overrides: Partial<WorkflowRecordingState> = {}): WorkflowRecordingState {
  return {
    status: overrides.status ?? "recording",
    startedAt: "2026-06-13T00:00:00.000Z",
    stoppedAt: overrides.stoppedAt,
    goal: overrides.goal,
    review: overrides.review,
    ...overrides,
  };
}

function workflowDraft(): NonNullable<WorkflowRecordingState["review"]>["draft"] {
  return {
    status: "draft",
    source: "deterministic_capture",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceCapturedAt: "2026-06-13T00:00:00.000Z",
    intent: "Review a stopped workflow",
    inputs: [],
    successfulExamples: [],
    doNot: [],
    validation: [],
    outputShape: [],
    evidenceSummary: {
      messageCount: 1,
      toolResultCount: 0,
      successfulToolResultCount: 0,
      failedToolResultCount: 0,
      skippedToolResultCount: 0,
      permissionBlockedToolResultCount: 0,
      redactionCount: 0,
    },
  };
}

function createController({
  abortArmed = false,
  activeThread,
  createdThreadApplied = true,
  running = false,
  state = desktopState(),
}: {
  abortArmed?: boolean;
  activeThread?: ThreadSummary;
  createdThreadApplied?: boolean;
  running?: boolean;
  state?: DesktopState | undefined;
} = {}) {
  const runStatus = statefulSetter<RunStatus>("idle");
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const applyCreatedThreadState = vi.fn(() => createdThreadApplied);
  const applyRunStatusDesktopState = vi.fn();
  const closeProjectBoard = vi.fn();
  const refreshWorkflowRecordingLibraryOverride = vi.fn(async () => undefined);
  const resetPromptHistory = vi.fn();
  const resetRunActivityLines = vi.fn();
  const scheduleComposerDraftFocus = vi.fn();
  const contextAttachments = statefulSetter<WorkspaceContextReference[]>([]);
  const setContextError = vi.fn();
  const setError = vi.fn();
  const setSelectedWorkflowRecordingId = vi.fn();
  const setSidebarArea = vi.fn();

  return {
    actions: createAppWorkflowRecordingActions({
      abortArmed,
      activeThread,
      applyCreatedThreadState,
      applyRunStatusDesktopState,
      closeProjectBoard,
      refreshWorkflowRecordingLibraryOverride,
      resetPromptHistory,
      resetRunActivityLines,
      running,
      scheduleComposerDraftFocus,
      setContextAttachments: contextAttachments.set,
      setContextError,
      setError,
      setRunStatus: runStatus.set,
      setSelectedWorkflowRecordingId,
      setSidebarArea,
      setThreadRunStatuses: threadRunStatuses.set,
      state,
      workflowLibraryIncludeArchived: false,
    }),
    applyCreatedThreadState,
    applyRunStatusDesktopState,
    closeProjectBoard,
    contextAttachments,
    refreshWorkflowRecordingLibraryOverride,
    resetPromptHistory,
    resetRunActivityLines,
    runStatus,
    scheduleComposerDraftFocus,
    setContextError,
    setError,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
    threadRunStatuses,
  };
}

function createForAppController() {
  const runStatus = statefulSetter<RunStatus>("idle");
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const contextAttachments = statefulSetter<WorkspaceContextReference[]>([]);
  const projectBoardOpen = statefulSetter(true);
  const applyCreatedThreadState = vi.fn(() => true);
  const applyRunStatusDesktopState = vi.fn();
  const resetPromptHistory = vi.fn();
  const resetRunActivityLines = vi.fn();
  const setComposerDraft = vi.fn();
  const focusEnd = vi.fn();
  const setContextError = vi.fn();
  const setError = vi.fn();
  const setSelectedWorkflowRecordingId = vi.fn();
  const setSidebarArea = vi.fn();
  const refreshWorkflowRecordingLibraryOverride = vi.fn(async () => undefined);

  return {
    actions: createAppWorkflowRecordingActionsForApp({
      activeThread: thread(),
      appDesktopStateAppliers: {
        applyCreatedThreadState,
        applyRunStatusDesktopState,
      },
      composerShellState: {
        composerInputRef: { current: { focusEnd } },
        setComposerDraft,
      },
      coreLifecycleControls: {
        resetRunActivityLines,
      },
      projectBoardControls: {
        setProjectBoardOpen: projectBoardOpen.set,
      },
      resetPromptHistory,
      runActivityState: {
        abortArmed: false,
        setRunStatus: runStatus.set,
        setThreadRunStatuses: threadRunStatuses.set,
      },
      running: false,
      shellUiState: {
        setError,
        setSidebarArea,
      },
      state: desktopState(),
      workflowRecordingLibraryControls: {
        refreshWorkflowRecordingLibraryOverride,
        setSelectedWorkflowRecordingId,
        workflowLibraryIncludeArchived: false,
      },
      workflowRuntimeState: {
        setContextAttachments: contextAttachments.set,
        setContextError,
      },
    } as unknown as AppWorkflowRecordingActionsForAppInput),
    applyCreatedThreadState,
    applyRunStatusDesktopState,
    contextAttachments,
    focusEnd,
    projectBoardOpen,
    refreshWorkflowRecordingLibraryOverride,
    resetPromptHistory,
    resetRunActivityLines,
    runStatus,
    setComposerDraft,
    setContextError,
    setError,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
    threadRunStatuses,
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

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: overrides.id ?? "thread",
    title: overrides.title ?? "Thread",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-13T00:00:00.000Z",
    workspacePath: overrides.workspacePath ?? "/repo",
    lastMessagePreview: overrides.lastMessagePreview ?? "",
    permissionMode: overrides.permissionMode ?? "workspace",
    collaborationMode: overrides.collaborationMode ?? "agent",
    model: overrides.model ?? "ambient",
    thinkingLevel: overrides.thinkingLevel ?? "medium",
    ...overrides,
  };
}

function desktopState(overrides: Partial<DesktopState> = {}): DesktopState {
  return {
    activeThreadId: overrides.activeThreadId ?? "thread",
    activeWorkspace: overrides.activeWorkspace ?? ({ path: "/repo" } as DesktopState["activeWorkspace"]),
    settings: overrides.settings ?? ({
      collaborationMode: "agent",
      model: "ambient",
      permissionMode: "workspace",
      thinkingLevel: "medium",
    } as DesktopState["settings"]),
    threads: overrides.threads ?? [],
    workspace: overrides.workspace ?? ({ path: "/repo" } as DesktopState["workspace"]),
    ...overrides,
  } as DesktopState;
}

function workflowPlaybook(overrides: Partial<WorkflowRecordingLibraryEntry> = {}): WorkflowRecordingLibraryEntry {
  return {
    id: overrides.id ?? "playbook",
    title: overrides.title ?? "Playbook",
    version: overrides.version ?? 1,
    enabled: overrides.enabled ?? true,
    savedAt: overrides.savedAt ?? "2026-06-13T00:00:00.000Z",
    manifestPath: overrides.manifestPath ?? "/repo/playbook/manifest.json",
    markdownPath: overrides.markdownPath ?? "/repo/playbook/playbook.md",
    sidecarPath: overrides.sidecarPath ?? "/repo/playbook/sidecar.json",
    transcriptPath: overrides.transcriptPath ?? "/repo/playbook/transcript.jsonl",
    summary: overrides.summary ?? "Summary",
    toolNames: overrides.toolNames ?? [],
    outputShape: overrides.outputShape ?? [],
    versions: overrides.versions ?? [],
    ...overrides,
  };
}
