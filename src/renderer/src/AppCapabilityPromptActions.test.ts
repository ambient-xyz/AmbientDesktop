import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  RunStatus,
  WorkspaceContextReference,
} from "../../shared/types";
import {
  createAppCapabilityPromptActions,
  remoteSurfaceActivationActivityLine,
  threadRunStatusesWithStarting,
} from "./AppCapabilityPromptActions";

describe("App capability prompt actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps remote activation activity copy stable", () => {
    expect(remoteSurfaceActivationActivityLine("telegram")).toBe("Remote Ambient Surface Telegram setup sent to Ambient.");
    expect(remoteSurfaceActivationActivityLine("signal")).toBe("Remote Ambient Surface Signal check sent to Ambient.");
    expect(remoteSurfaceActivationActivityLine("choose")).toBe("Remote Ambient Surface setup sent to Ambient.");
  });

  it("marks one thread as starting without dropping sibling run statuses", () => {
    expect(threadRunStatusesWithStarting({ "thread-2": "streaming" }, "thread-1")).toEqual({
      "thread-1": "starting",
      "thread-2": "streaming",
    });
  });

  it("sends Telegram setup prompts through the active thread", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { sendMessage } });
    const controller = createController();

    await controller.actions.sendTelegramSessionSetupPrompt("Set up Telegram.");

    expect(controller.setError).toHaveBeenCalledWith(undefined);
    expect(controller.contextError.value).toBeUndefined();
    expect(controller.contextAttachments.value).toEqual([]);
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Telegram setup action sent to Ambient.");
    expect(controller.runStatus.value).toBe("starting");
    expect(controller.threadRunStatuses.value).toEqual({ "thread-1": "starting" });
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: "thread-1",
      content: "Set up Telegram.",
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient",
      thinkingLevel: "medium",
      delivery: "prompt",
    });
  });

  it("marks tool-action prompts failed when sendMessage rejects", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        sendMessage: vi.fn(async () => {
          throw new Error("send failed");
        }),
      },
    });
    const controller = createController();

    await controller.actions.sendRemoteSurfaceActivationPrompt("Remote setup");

    expect(controller.setError).toHaveBeenCalledWith("send failed");
    expect(controller.runStatus.value).toBe("error");
  });

  it("starts Capability Builder prompts in a new chat when requested", async () => {
    const createdState = desktopState({ activeThreadId: "thread-2", workspacePath: "/workspace" });
    const createThread = vi.fn(async () => createdState);
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { createThread, sendMessage } });
    const controller = createController();

    await controller.actions.startCapabilityBuilderPrompt("Build a capability.", true, "Capability launch.");

    expect(createThread).toHaveBeenCalledWith({
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient",
      thinkingLevel: "medium",
      workspacePath: "/workspace",
    });
    expect(controller.applyCreatedThreadState).toHaveBeenCalledWith(createdState, "/active-workspace");
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Capability launch.");
    expect(controller.threadRunStatuses.value).toEqual({ "thread-2": "starting" });
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: "thread-2",
      content: "Build a capability.",
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient",
      thinkingLevel: "medium",
      delivery: "prompt",
      context: [],
    });
  });

  it("routes welcome remote-surface setup through Capability Builder prompt copy", async () => {
    const createdState = desktopState({ activeThreadId: "thread-remote", workspacePath: "/workspace" });
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        createThread: vi.fn(async () => createdState),
        sendMessage,
      },
    });
    const controller = createController();

    await controller.actions.startWelcomeRemoteSurfaceActivation("signal");

    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Remote Ambient Surface Signal check sent to Ambient.");
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-remote",
      content: expect.stringContaining("Provider preference: Signal."),
      context: [],
    }));
  });

  it("falls back when first-run host facts are unavailable", async () => {
    const createdState = desktopState({ activeThreadId: "thread-onboarding", workspacePath: "/workspace" });
    const sendMessage = vi.fn(async () => undefined);
    const getVoiceOnboardingHostFacts = vi.fn(async () => {
      throw new Error("facts unavailable");
    });
    vi.stubGlobal("window", {
      ambientDesktop: {
        createThread: vi.fn(async () => createdState),
        getVoiceOnboardingHostFacts,
        sendMessage,
      },
    });
    const controller = createController();

    await controller.actions.startWelcomeFirstRunCapabilityOnboarding();

    expect(getVoiceOnboardingHostFacts).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-onboarding",
      content: expect.stringContaining("Ambient first-run capability onboarding request."),
      context: [],
    }));
  });
});

function createController({
  running = false,
  state = desktopState(),
}: {
  running?: boolean;
  state?: DesktopState | undefined;
} = {}) {
  const contextAttachments = statefulSetter<WorkspaceContextReference[]>([{ kind: "file", path: "old", name: "old" }]);
  const contextError = statefulSetter<string | undefined>("old context error");
  const runStatus = statefulSetter<RunStatus>("idle");
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const applyCreatedThreadState = vi.fn();
  const resetPromptHistory = vi.fn();
  const resetRunActivityLines = vi.fn();
  const setError = vi.fn();
  return {
    actions: createAppCapabilityPromptActions({
      applyCreatedThreadState,
      resetPromptHistory,
      resetRunActivityLines,
      running,
      setContextAttachments: contextAttachments.set,
      setContextError: contextError.set,
      setError,
      setRunStatus: runStatus.set,
      setThreadRunStatuses: threadRunStatuses.set,
      state,
    }),
    applyCreatedThreadState,
    contextAttachments,
    contextError,
    resetPromptHistory,
    resetRunActivityLines,
    runStatus,
    setError,
    threadRunStatuses,
  };
}

function desktopState({
  activeThreadId = "thread-1",
  workspacePath = "/workspace",
}: {
  activeThreadId?: string;
  workspacePath?: string;
} = {}): DesktopState {
  return {
    activeThreadId,
    activeWorkspace: { path: "/active-workspace" },
    providerCatalog: {
      cards: [],
    },
    settings: {
      collaborationMode: "agent",
      model: "ambient",
      permissionMode: "full-access",
      thinkingLevel: "medium",
    },
    workspace: { path: workspacePath },
  } as unknown as DesktopState;
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
