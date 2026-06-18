import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage, ToolIntentSnapshot } from "../../shared/threadTypes";
import { ToolArgumentProgressTracker } from "./agentRuntimeToolRuntimeFacade";
import { createRuntimeToolEventDispatcher } from "./runtimeToolEventDispatcher";
import { createRuntimeToolMessageController } from "./runtimeToolMessageController";

function message(input: Partial<ChatMessage> & { id: string; role?: ChatMessage["role"]; content?: string }): ChatMessage {
  return {
    ...input,
    id: input.id,
    threadId: input.threadId ?? "thread-1",
    role: input.role ?? "tool",
    content: input.content ?? "",
    createdAt: input.createdAt ?? "2026-06-15T00:00:00.000Z",
    metadata: input.metadata,
  };
}

function intentSnapshot(toolCallId: string, toolName: string): ToolIntentSnapshot {
  return {
    version: 1,
    toolCallId,
    toolName,
    operationKind: "tool_execution",
    materiality: "important",
    substituteAllowed: true,
    createdAt: "2026-06-15T00:00:00.000Z",
  };
}

function setup() {
  const messages = new Map<string, ChatMessage>();
  const events: DesktopEvent[] = [];
  const completedTools: unknown[] = [];
  const startedToolCallIds = new Set<string>();
  const refreshBrowsersForArtifactChange = vi.fn();
  let nextId = 1;
  const toolMessages = createRuntimeToolMessageController({
    threadId: "thread-1",
    workspacePath: "/workspace",
    permissionMode: "workspace",
    progressForToolCall: (toolCallId) => toolArgumentProgress.current(toolCallId),
    startedToolCallIds,
    listMessages: () => [...messages.values()],
    addToolMessage: vi.fn((input) => {
      const created = message({
        id: `tool-message-${nextId}`,
        threadId: input.threadId,
        content: input.content,
        metadata: input.metadata,
      });
      nextId += 1;
      messages.set(created.id, created);
      return created;
    }),
    replaceMessage: vi.fn((messageId, content, metadata) => {
      const existing = messages.get(messageId);
      if (!existing) throw new Error(`Missing message ${messageId}`);
      const updated = { ...existing, content, metadata };
      messages.set(messageId, updated);
      return updated;
    }),
    emitRunEvent: vi.fn((event) => {
      events.push(event);
    }),
  });
  const toolArgumentProgress = new ToolArgumentProgressTracker();
  const dispatcher = createRuntimeToolEventDispatcher({
    runId: "run-1",
    workspacePath: "/workspace",
    permissionMode: "workspace",
    toolMessages,
    toolArgumentProgress,
    toolArgumentWatchdog: {
      schedule: vi.fn(),
    },
    toolExecutionWatchdog: {
      begin: vi.fn(),
      mark: vi.fn(),
      finish: vi.fn(),
    },
    postToolContinuation: {
      markToolStart: vi.fn(),
      markToolEnd: vi.fn(),
    },
    startedToolCallIds,
    clearEmptyAssistantStallWatchdog: vi.fn(),
    clearAssistantTerminalCompletion: vi.fn(),
    markFirstToolArgumentObserved: vi.fn(),
    markFirstToolExecutionObserved: vi.fn(),
    rememberToolIntent: vi.fn((toolCallId, toolName) => intentSnapshot(toolCallId, toolName)),
    trackInterruptedToolCallRecovery: vi.fn((_, __, ___, ____, progress) => progress),
    markInterruptedToolCallNoLongerRecoverable: vi.fn((_, progress) => progress),
    persistToolArgumentDiagnostics: vi.fn(),
    setActiveRunToolStatus: vi.fn(),
    setLastCompletedTool: vi.fn((tool) => {
      completedTools.push(tool);
    }),
    markAssistantTextNotObservedAfterLastToolEnd: vi.fn(),
    requestSubagentParentControlAbort: vi.fn(),
    refreshBrowsersForArtifactChange,
  });
  return {
    dispatcher,
    toolMessages,
    toolArgumentProgress,
    messages,
    events,
    completedTools,
    startedToolCallIds,
    refreshBrowsersForArtifactChange,
  };
}

describe("createRuntimeToolEventDispatcher", () => {
  it("applies tool input events, records recovery input, upserts a preparing message, and emits a running tool event", () => {
    const { dispatcher, toolMessages, events } = setup();

    expect(dispatcher.handle({
      kind: "tool-input-start",
      toolCallId: "tool-call-1",
      label: "file_write",
      content: "{\"path\":\"/workspace/public/out.txt\"}",
      input: { path: "/workspace/public/out.txt" },
    }, {}, 1)).toBe(true);

    expect(toolMessages.inputContent("tool-call-1")).toContain("public/out.txt");
    expect(toolMessages.recoveryInput("tool-call-1")).toContain("public/out.txt");
    expect(events.map((event) => event.type)).toEqual(["message-created", "tool-event"]);
    expect(events.at(-1)).toEqual(expect.objectContaining({
      type: "tool-event",
      label: "file_write",
      status: "running",
    }));
  });

  it("applies tool-start events, marks execution state, and updates the existing tool message", () => {
    const { dispatcher, startedToolCallIds, events } = setup();
    dispatcher.handle({
      kind: "tool-input-end",
      toolCallId: "tool-call-1",
      label: "shell",
      content: "{\"command\":\"pnpm test\"}",
      input: { command: "pnpm test" },
    }, {}, 1);

    expect(dispatcher.handle({
      kind: "tool-start",
      toolCallId: "tool-call-1",
      label: "shell",
      content: "{\"command\":\"pnpm test\"}",
      details: { runtime: "local" },
    }, {}, 2)).toBe(true);

    expect(startedToolCallIds.has("tool-call-1")).toBe(true);
    expect(events.at(-2)).toEqual(expect.objectContaining({ type: "message-updated" }));
    expect(events.at(-1)).toEqual(expect.objectContaining({
      type: "tool-event",
      label: "shell",
      status: "running",
    }));
  });

  it("applies terminal tool results, records the completed-tool snapshot, cleans cached inputs, and refreshes changed artifacts", () => {
    const { dispatcher, toolMessages, completedTools, events, refreshBrowsersForArtifactChange } = setup();
    dispatcher.handle({
      kind: "tool-input-end",
      toolCallId: "tool-call-1",
      label: "file_write",
      content: "{\"path\":\"/workspace/public/out.txt\"}",
      input: { path: "/workspace/public/out.txt" },
    }, {}, 1);
    dispatcher.handle({
      kind: "tool-start",
      toolCallId: "tool-call-1",
      label: "file_write",
      content: "{\"path\":\"/workspace/public/out.txt\"}",
    }, {}, 2);

    expect(dispatcher.handle({
      kind: "tool-end",
      toolCallId: "tool-call-1",
      label: "file_write",
      content: "wrote file",
      status: "done",
    }, {}, 3)).toBe(true);

    expect(completedTools).toEqual([
      expect.objectContaining({
        runId: "run-1",
        toolCallId: "tool-call-1",
        status: "done",
        eventSeqAtEnd: 3,
        messageId: "tool-message-1",
      }),
    ]);
    expect(toolMessages.inputContent("tool-call-1")).toBeUndefined();
    expect(events.at(-2)).toEqual(expect.objectContaining({ type: "message-updated" }));
    expect(events.at(-1)).toEqual(expect.objectContaining({
      type: "tool-event",
      status: "done",
      artifactPath: "public/out.txt",
    }));
    expect(refreshBrowsersForArtifactChange).toHaveBeenCalledWith("public/out.txt");
  });
});
