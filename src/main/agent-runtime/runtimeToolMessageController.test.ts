import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage, ToolArgumentProgressSnapshot, ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import { createRuntimeToolMessageController } from "./runtimeToolMessageController";
import { runtimeToolResultMessageUpdate } from "./toolResultUpdates";

const longformInputPreview: ToolLongformInputPreview = {
  kind: "longform-input",
  summary: "Large input",
  items: [],
};

const editInputPreview: ToolEditInputPreview = {
  kind: "edit-input",
  path: "patches/edit.diff",
  summary: "Patch input",
  edits: [],
};

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

function setup() {
  const messages = new Map<string, ChatMessage>();
  const events: DesktopEvent[] = [];
  let nextId = 1;
  const controller = createRuntimeToolMessageController({
    threadId: "thread-1",
    workspacePath: "/workspace",
    permissionMode: "workspace",
    progressForToolCall: () => progressSnapshot({ argumentComplete: true, observedArgumentChars: 42 }),
    startedToolCallIds: new Set(),
    listMessages: () => [...messages.values()],
    addToolMessage: vi.fn((input) => {
      const created = message({
        id: `tool-message-${nextId}`,
        threadId: input.threadId,
        role: "tool",
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
  return { controller, messages, events };
}

describe("createRuntimeToolMessageController", () => {
  it("creates and then updates a running tool message while preserving previews", () => {
    const { controller, messages, events } = setup();

    const first = controller.upsertInputMessage({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "preparing",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      longformInputPreview,
      editInputPreview,
    });
    const second = controller.upsertInputMessage({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "running",
      inputContent: "{\"path\":\"/workspace/public/out.webp\",\"mode\":\"replace\"}",
    });

    expect(first.id).toBe("tool-message-1");
    expect(second.id).toBe("tool-message-1");
    expect(controller.size()).toBe(1);
    expect(controller.inputContent("tool-call-1")).toContain("\"mode\":\"replace\"");
    expect(controller.longformInputPreview("tool-call-1")).toBe(longformInputPreview);
    expect(controller.editInputPreview("tool-call-1")).toBe(editInputPreview);
    expect(messages.get("tool-message-1")).toMatchObject({
      content: expect.stringContaining("file_write running"),
      metadata: expect.objectContaining({
        status: "running",
        toolCallId: "tool-call-1",
        toolLongformInputPreview: longformInputPreview,
        toolEditInputPreview: editInputPreview,
      }),
    });
    expect(events.map((event) => event.type)).toEqual(["message-created", "message-updated"]);
  });

  it("emits running tool events with artifact metadata from the stored message", () => {
    const { controller, events } = setup();
    const toolMessage = controller.upsertInputMessage({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "running",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      argumentProgress: progressSnapshot(),
    });

    controller.emitRunningToolEvent({
      label: "file_write",
      status: "running",
      argumentProgress: progressSnapshot(),
      message: toolMessage,
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: "tool-event",
      threadId: "thread-1",
      label: "file_write",
      status: "running",
      artifactPath: "public/out.webp",
      details: expect.objectContaining({
        permissionMode: "workspace",
        toolName: "file_write",
      }),
    }));
  });

  it("applies terminal result updates and emits message plus tool events", () => {
    const { controller, messages, events } = setup();
    controller.upsertInputMessage({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "running",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
    });
    const resultUpdate = runtimeToolResultMessageUpdate({
      toolCallId: "tool-call-1",
      label: "file_write",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      resultContent: "wrote file",
      workspacePath: "/workspace",
      permissionMode: "workspace",
      messageStatus: "done",
      statusLabel: "completed",
      eventStatus: "completed",
      existingMessageId: controller.messageId("tool-call-1"),
    });

    const updated = controller.applyResultUpdate(resultUpdate, "done");

    expect(updated.id).toBe("tool-message-1");
    expect(messages.get(updated.id)).toMatchObject({
      content: expect.stringContaining("wrote file"),
      metadata: expect.objectContaining({ status: "done" }),
    });
    expect(events.at(-2)).toEqual(expect.objectContaining({ type: "message-updated" }));
    expect(events.at(-1)).toEqual(expect.objectContaining({
      type: "tool-event",
      status: "done",
      artifactPath: "public/out.webp",
    }));
  });

  it("marks open tool messages failed and clears cached input state", () => {
    const { controller, messages, events } = setup();
    controller.upsertInputMessage({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "running",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      longformInputPreview,
      editInputPreview,
      argumentProgress: progressSnapshot({ argumentComplete: true }),
    });
    controller.rememberRecoveryInput("tool-call-1", "prepared args", "visible_tool_input");

    const count = controller.markOpenToolMessagesFailed("Ambient/Pi stream interrupted before this tool completed.");

    expect(count).toBe(1);
    expect(messages.get("tool-message-1")).toMatchObject({
      content: expect.stringContaining("Ambient/Pi stream interrupted before this tool completed."),
      metadata: expect.objectContaining({
        status: "error",
        toolLongformInputPreview: longformInputPreview,
        toolEditInputPreview: editInputPreview,
      }),
    });
    expect(controller.inputContent("tool-call-1")).toBeUndefined();
    expect(controller.recoveryInput("tool-call-1")).toBeUndefined();
    expect(controller.longformInputPreview("tool-call-1")).toBeUndefined();
    expect(events.at(-2)).toEqual(expect.objectContaining({ type: "message-updated" }));
    expect(events.at(-1)).toEqual(expect.objectContaining({ type: "tool-event", status: "error" }));
  });
});

function progressSnapshot(overrides: Partial<ToolArgumentProgressSnapshot> = {}): ToolArgumentProgressSnapshot {
  return {
    version: 1,
    phase: "argument_stream",
    eventType: "toolcall_end",
    toolCallId: "tool-call-1",
    toolName: "file_write",
    uiStatus: "prepared",
    argumentStartedAt: "2026-06-15T00:00:00.000Z",
    argumentUpdatedAt: "2026-06-15T00:00:00.500Z",
    argumentElapsedMs: 500,
    argumentComplete: false,
    inputChars: 0,
    deltaChars: 0,
    totalDeltaChars: 0,
    maxDeltaChars: 0,
    observedArgumentChars: 0,
    argumentEventCount: 1,
    toolcallDeltaCount: 1,
    meaningfulGrowthCount: 1,
    charsPerSecond: 0,
    ...overrides,
  };
}
