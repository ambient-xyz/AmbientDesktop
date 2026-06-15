import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ChatMessage,
  DesktopState,
  RunStatus,
  WorkspaceContextReference,
} from "../../shared/types";
import {
  createAppComposerRetryActions,
  retryPromptAllowed,
  retryPromptContext,
} from "./AppComposerRetryActions";

describe("App composer retry actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows retry only for non-empty user messages while idle with state", () => {
    expect(retryPromptAllowed({
      message: { role: "user", content: "retry me" } as ChatMessage,
      running: false,
      stateAvailable: true,
    })).toBe(true);
    expect(retryPromptAllowed({
      message: { role: "assistant", content: "retry me" } as ChatMessage,
      running: false,
      stateAvailable: true,
    })).toBe(false);
    expect(retryPromptAllowed({
      message: { role: "user", content: "   " } as ChatMessage,
      running: false,
      stateAvailable: true,
    })).toBe(false);
    expect(retryPromptAllowed({
      message: { role: "user", content: "retry me" } as ChatMessage,
      running: true,
      stateAvailable: true,
    })).toBe(false);
  });

  it("reads retry context from message metadata", () => {
    expect(retryPromptContext({
      metadata: {
        context: [
          { kind: "file", path: "README.md", name: "README.md", size: 10 },
          { kind: "directory", path: "src", name: "src" },
          { kind: "bad", path: "ignored", name: "ignored" },
        ],
      },
    } as unknown as ChatMessage)).toEqual([
      { kind: "file", path: "README.md", name: "README.md", size: 10 },
      { kind: "directory", path: "src", name: "src" },
    ]);
  });

  it("sends retry prompts with context and workflow edit metadata", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", { ambientDesktop: { sendMessage } });
    const controller = createController();
    const message = retryMessage();

    await controller.actions.retryFailedPrompt(message);

    expect(controller.setError).toHaveBeenCalledWith(undefined);
    expect(controller.contextError.value).toBeUndefined();
    expect(controller.contextAttachments.value).toEqual([]);
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
    expect(controller.resetRunActivityLines).toHaveBeenCalledWith("Retry sent to Ambient.");
    expect(controller.runStatus.value).toBe("starting");
    expect(controller.threadRunStatuses.value).toEqual({ "thread-1": "starting" });
    expect(sendMessage).toHaveBeenCalledWith({
      threadId: "thread-1",
      content: "Retry this prompt",
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "ambient",
      thinkingLevel: "medium",
      delivery: "prompt",
      context: [{ kind: "file", path: "README.md", name: "README.md" }],
      workflowRecordingEditContext: workflowEditContext(),
      retryOfMessageId: "message-1",
    });
  });

  it("restores retry context and marks the run failed when send fails", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        sendMessage: vi.fn(async () => {
          throw new Error("retry failed");
        }),
      },
    });
    const controller = createController();

    await controller.actions.retryFailedPrompt(retryMessage());

    expect(controller.setError).toHaveBeenCalledWith("retry failed");
    expect(controller.contextAttachments.value).toEqual([{ kind: "file", path: "README.md", name: "README.md" }]);
    expect(controller.runStatus.value).toBe("error");
  });
});

function createController({
  running = false,
  state = desktopState(),
}: {
  running?: boolean;
  state?: DesktopState | undefined;
} = {}) {
  const contextAttachments = statefulSetter<WorkspaceContextReference[]>([]);
  const contextError = statefulSetter<string | undefined>("previous error");
  const runStatus = statefulSetter<RunStatus>("idle");
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const resetPromptHistory = vi.fn();
  const resetRunActivityLines = vi.fn();
  const setError = vi.fn();
  return {
    actions: createAppComposerRetryActions({
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
    contextAttachments,
    contextError,
    resetPromptHistory,
    resetRunActivityLines,
    runStatus,
    setError,
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

function desktopState(): DesktopState {
  return {
    activeThreadId: "thread-1",
    settings: {
      collaborationMode: "agent",
      model: "ambient",
      permissionMode: "full-access",
      thinkingLevel: "medium",
    },
  } as DesktopState;
}

function retryMessage(): ChatMessage {
  return {
    id: "message-1",
    role: "user",
    content: "Retry this prompt",
    metadata: {
      context: [{ kind: "file", path: "README.md", name: "README.md" }],
      workflowRecordingEditContext: workflowEditContext(),
    },
  } as unknown as ChatMessage;
}

function workflowEditContext() {
  return {
    id: "recording-1",
    title: "Recorded workflow",
    version: 2,
    manifestPath: "/tmp/manifest.json",
    markdownPath: "/tmp/playbook.md",
    sidecarPath: "/tmp/playbook.json",
    transcriptPath: "/tmp/transcript.jsonl",
  };
}
