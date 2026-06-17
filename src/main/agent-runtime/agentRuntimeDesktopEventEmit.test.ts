import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/types";
import {
  emitAgentRuntimeDesktopEvent,
  type AgentRuntimeDesktopEventWindow,
} from "./agentRuntimeDesktopEventEmit";
import type { AgentRuntimeEventWorkspaceScopeStore } from "./agentRuntimeEventWorkspaceScope";

describe("agentRuntimeDesktopEventEmit", () => {
  it("scopes and sends desktop events to the renderer", () => {
    const send = vi.fn();
    const window = desktopWindow({ send });

    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), deps({
      getWindow: () => window,
      store: eventStore(),
    }));

    expect(send).toHaveBeenCalledWith("desktop:event", {
      type: "message-delta",
      messageId: "message-1",
      threadId: "thread-1",
      delta: "hello",
      workspacePath: "/workspace",
    });
  });

  it("does not send when the renderer window is unavailable or unhealthy", () => {
    const send = vi.fn();

    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), deps({
      getWindow: () => undefined,
    }));
    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), deps({
      getWindow: () => desktopWindow({ send, windowDestroyed: true }),
    }));
    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), deps({
      getWindow: () => desktopWindow({ send, webContentsDestroyed: true }),
    }));
    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), deps({
      getWindow: () => desktopWindow({ send, webContentsCrashed: true }),
    }));

    expect(send).not.toHaveBeenCalled();
  });

  it("warns about renderer send failures with the existing throttle", () => {
    const warn = vi.fn();
    const send = vi.fn(() => {
      throw new Error("renderer is gone");
    });
    let lastRendererSendFailureAt = 0;
    let now = 20_000;

    const input = deps({
      getWindow: () => desktopWindow({ send }),
      nowMs: () => now,
      warn,
      lastRendererSendFailureAt: () => lastRendererSendFailureAt,
      setLastRendererSendFailureAt: (value) => {
        lastRendererSendFailureAt = value;
      },
    });

    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), input);
    now = 25_000;
    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), input);
    now = 31_000;
    emitAgentRuntimeDesktopEvent(messageDeltaEvent(), input);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, "[runtime] Dropped desktop event after renderer became unavailable: renderer is gone");
    expect(warn).toHaveBeenNthCalledWith(2, "[runtime] Dropped desktop event after renderer became unavailable: renderer is gone");
    expect(lastRendererSendFailureAt).toBe(31_000);
  });

  it("preserves existing workspace paths without re-scoping", () => {
    const send = vi.fn();
    const event: DesktopEvent = {
      type: "message-delta",
      messageId: "message-1",
      threadId: "thread-1",
      delta: "hello",
      workspacePath: "/explicit",
    };

    emitAgentRuntimeDesktopEvent(event, deps({
      getWindow: () => desktopWindow({ send }),
      store: eventStore("/fallback"),
    }));

    expect(send).toHaveBeenCalledWith("desktop:event", {
      type: "message-delta",
      messageId: "message-1",
      threadId: "thread-1",
      delta: "hello",
      workspacePath: "/explicit",
    });
  });
});

function messageDeltaEvent(): DesktopEvent {
  return {
    type: "message-delta",
    messageId: "message-1",
    threadId: "thread-1",
    delta: "hello",
  };
}

function deps(overrides: Partial<Parameters<typeof emitAgentRuntimeDesktopEvent>[1]> = {}): Parameters<typeof emitAgentRuntimeDesktopEvent>[1] {
  let lastRendererSendFailureAt = 0;
  return {
    getWindow: () => desktopWindow(),
    store: eventStore(),
    lastRendererSendFailureAt: () => lastRendererSendFailureAt,
    setLastRendererSendFailureAt: (value) => {
      lastRendererSendFailureAt = value;
    },
    nowMs: () => 20_000,
    warn: vi.fn(),
    ...overrides,
  };
}

function desktopWindow(overrides: {
  send?: AgentRuntimeDesktopEventWindow["webContents"]["send"];
  windowDestroyed?: boolean;
  webContentsDestroyed?: boolean;
  webContentsCrashed?: boolean;
} = {}): AgentRuntimeDesktopEventWindow {
  return {
    isDestroyed: () => overrides.windowDestroyed === true,
    webContents: {
      isDestroyed: () => overrides.webContentsDestroyed === true,
      isCrashed: () => overrides.webContentsCrashed === true,
      send: overrides.send ?? vi.fn(),
    },
  };
}

function eventStore(workspacePath = "/workspace"): AgentRuntimeEventWorkspaceScopeStore {
  return {
    getThread: () => ({ workspacePath }),
    getWorkspace: () => ({ path: workspacePath }),
    getWorkflowAgentThreadSummary: () => ({ projectPath: workspacePath }),
    getWorkflowArtifact: () => ({ workflowThreadId: "workflow-thread-1" }),
  };
}
