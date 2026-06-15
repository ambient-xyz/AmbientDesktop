import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  DesktopEvent,
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import {
  createRuntimePermissionWaitController,
  type RuntimePermissionWaitActiveToolExecution,
  type RuntimePermissionWaitControllerInput,
} from "./runtimePermissionWaitController";

const createdAt = "2026-06-15T00:00:00.000Z";

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "tool-message-1",
    threadId: "thread-1",
    role: "tool",
    content: "tool content",
    createdAt,
    ...overrides,
  };
}

function progressSnapshot(overrides: Partial<ToolArgumentProgressSnapshot> = {}): ToolArgumentProgressSnapshot {
  return {
    version: 1,
    phase: "argument_stream",
    eventType: "toolcall_delta",
    toolCallId: "tool-call-1",
    toolName: "ambient_write_file",
    uiStatus: "Preparing input",
    argumentStartedAt: createdAt,
    argumentUpdatedAt: createdAt,
    argumentElapsedMs: 1000,
    argumentComplete: false,
    inputChars: 12,
    deltaChars: 12,
    totalDeltaChars: 12,
    maxDeltaChars: 12,
    observedArgumentChars: 12,
    argumentEventCount: 1,
    toolcallDeltaCount: 1,
    meaningfulGrowthCount: 1,
    charsPerSecond: 12,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<RuntimePermissionWaitControllerInput> = {},
): RuntimePermissionWaitControllerInput & {
  emitted: DesktopEvent[];
  activeToolExecution: RuntimePermissionWaitActiveToolExecution | undefined;
  activeToolExecutionCount: { value: number };
  nowMs: { value: number };
} {
  const emitted: DesktopEvent[] = [];
  const activeToolExecutionCount = { value: 0 };
  const nowMs = { value: 1_000 };
  const longformInputPreview: ToolLongformInputPreview = {
    kind: "longform-input",
    summary: "large input",
    items: [],
  };
  const editInputPreview: ToolEditInputPreview = {
    kind: "edit-input",
    path: "patch.diff",
    summary: "patch",
    edits: [],
  };
  const input: RuntimePermissionWaitControllerInput & {
    emitted: DesktopEvent[];
    activeToolExecution: RuntimePermissionWaitActiveToolExecution | undefined;
    activeToolExecutionCount: { value: number };
    nowMs: { value: number };
  } = {
    threadId: "thread-1",
    activeToolExecution: { toolCallId: "tool-call-1", toolName: "ambient_write_file" },
    activeToolExecutionCount,
    nowMs,
    getActiveToolExecution: vi.fn(() => input.activeToolExecution),
    getActiveToolExecutionCount: vi.fn(() => activeToolExecutionCount.value),
    getToolMessageId: vi.fn((toolCallId) => toolCallId === "tool-call-1" ? "tool-message-1" : undefined),
    getToolInputContent: vi.fn(() => "{\"path\":\"demo.txt\"}"),
    getToolLongformInputPreview: vi.fn(() => longformInputPreview),
    getToolEditInputPreview: vi.fn(() => editInputPreview),
    getToolArgumentProgress: vi.fn(() => progressSnapshot()),
    markRunActivity: vi.fn(() => true),
    markToolExecutionActivity: vi.fn(),
    pauseStreamWatchdog: vi.fn(),
    resumeStreamWatchdog: vi.fn(),
    clearToolArgumentWatchdog: vi.fn(),
    scheduleToolArgumentWatchdog: vi.fn(),
    clearToolExecutionWatchdog: vi.fn(),
    scheduleToolExecutionWatchdog: vi.fn(),
    replaceMessage: vi.fn((messageId, content, metadata) => chatMessage({ id: messageId, content, metadata })),
    emitRunEvent: vi.fn((event) => {
      emitted.push(event);
    }),
    now: vi.fn(() => nowMs.value),
    emitted,
    ...overrides,
  };
  return input;
}

describe("createRuntimePermissionWaitController", () => {
  it("pauses stream/tool watchdogs and writes a waiting tool card when a wait begins", () => {
    const input = baseInput();
    const controller = createRuntimePermissionWaitController(input);

    const finish = controller.begin({
      toolName: "ambient_write_file",
      requestId: "approval-1",
      title: "Write file",
      risk: "workspace-command",
    });

    expect(controller.isWaiting()).toBe(true);
    expect(input.pauseStreamWatchdog).toHaveBeenCalledTimes(1);
    expect(input.clearToolArgumentWatchdog).toHaveBeenCalledTimes(1);
    expect(input.clearToolExecutionWatchdog).toHaveBeenCalledTimes(1);
    expect(input.markRunActivity).toHaveBeenCalledTimes(1);
    expect(input.markToolExecutionActivity).toHaveBeenCalledWith("tool-call-1", "ambient_write_file");
    expect(input.replaceMessage).toHaveBeenCalledWith(
      "tool-message-1",
      expect.stringContaining("Waiting for Ambient Desktop approval: Write file."),
      expect.objectContaining({
        status: "running",
        toolCallId: "tool-call-1",
        toolName: "ambient_write_file",
        toolLongformInputPreview: expect.objectContaining({ summary: "large input" }),
        toolEditInputPreview: expect.objectContaining({ path: "patch.diff" }),
        toolArgumentProgress: expect.objectContaining({ toolCallId: "tool-call-1" }),
      }),
    );
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        kind: "permission",
        status: "waiting",
        requestId: "approval-1",
        title: "Write file",
      }),
    }));

    finish({ allowed: true });
  });

  it("updates the active tool card on heartbeat", () => {
    vi.useFakeTimers();
    try {
      const input = baseInput();
      const controller = createRuntimePermissionWaitController(input);

      controller.begin({ toolName: "ambient_write_file" });
      input.nowMs.value = 6_000;
      vi.advanceTimersByTime(5_000);

      expect(input.replaceMessage).toHaveBeenCalledTimes(2);
      expect(input.replaceMessage).toHaveBeenLastCalledWith(
        "tool-message-1",
        expect.any(String),
        expect.objectContaining({
          toolResultDetails: expect.objectContaining({
            status: "awaiting-approval",
            heartbeatCount: 2,
            elapsedMs: 5_000,
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes the wait, writes resolution, and resumes stream watchdogs when no tool is active", () => {
    const input = baseInput();
    const controller = createRuntimePermissionWaitController(input);
    const finish = controller.begin({ toolName: "ambient_write_file" });

    input.nowMs.value = 3_250;
    finish({ allowed: true, mode: "allow_once" });

    expect(controller.isWaiting()).toBe(false);
    expect(input.scheduleToolArgumentWatchdog).toHaveBeenCalledTimes(1);
    expect(input.resumeStreamWatchdog).toHaveBeenCalledTimes(1);
    expect(input.scheduleToolExecutionWatchdog).not.toHaveBeenCalled();
    expect(input.replaceMessage).toHaveBeenLastCalledWith(
      "tool-message-1",
      expect.stringContaining("Ambient Desktop approval resolved for ambient_write_file."),
      expect.objectContaining({
        toolResultDetails: expect.objectContaining({
          status: "approval-resolved",
          elapsedMs: 2_250,
        }),
      }),
    );
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        kind: "permission",
        status: "finished",
        allowed: true,
        mode: "allow_once",
      }),
    }));
  });

  it("reschedules the tool execution watchdog instead of resuming the stream while a tool is active", () => {
    const input = baseInput();
    input.activeToolExecutionCount.value = 1;
    const controller = createRuntimePermissionWaitController(input);

    const finish = controller.begin({ toolName: "ambient_write_file" });
    finish({ allowed: false });

    expect(input.scheduleToolExecutionWatchdog).toHaveBeenCalledTimes(1);
    expect(input.scheduleToolArgumentWatchdog).not.toHaveBeenCalled();
    expect(input.resumeStreamWatchdog).not.toHaveBeenCalled();
  });

  it("keeps watchdogs paused until nested waits all finish", () => {
    const input = baseInput();
    const controller = createRuntimePermissionWaitController(input);

    const finishFirst = controller.begin({ toolName: "ambient_write_file" });
    const finishSecond = controller.begin({ toolName: "ambient_read_file" });
    finishFirst({ allowed: true });

    expect(controller.isWaiting()).toBe(true);
    expect(input.pauseStreamWatchdog).toHaveBeenCalledTimes(1);
    expect(input.resumeStreamWatchdog).not.toHaveBeenCalled();

    finishSecond({ allowed: true });

    expect(controller.isWaiting()).toBe(false);
    expect(input.resumeStreamWatchdog).toHaveBeenCalledTimes(1);
  });

  it("still emits wait activities when there is no active tool card to update", () => {
    const input = baseInput();
    input.activeToolExecution = undefined;
    const controller = createRuntimePermissionWaitController(input);

    const finish = controller.begin({ toolName: "ambient_shell" });
    finish({ error: "permission prompt closed" });

    expect(input.replaceMessage).not.toHaveBeenCalled();
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({ status: "waiting", toolName: "ambient_shell" }),
    }));
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({ status: "finished", toolName: "ambient_shell" }),
    }));
  });
});
