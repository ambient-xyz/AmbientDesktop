import { describe, expect, it } from "vitest";

import type { ToolArgumentProgressSnapshot, ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { ToolResultDetails } from "../pi/piEventMapper";
import { runtimeToolUpdateEventModel } from "./toolUpdateEvents";

const previousLongformInputPreview: ToolLongformInputPreview = {
  kind: "longform-input",
  summary: "Previous longform",
  items: [],
};

const incomingLongformInputPreview: ToolLongformInputPreview = {
  kind: "longform-input",
  summary: "Incoming longform",
  items: [],
};

const previousEditInputPreview: ToolEditInputPreview = {
  kind: "edit-input",
  path: "patches/previous.diff",
  summary: "Previous edit",
  edits: [],
};

const incomingEditInputPreview: ToolEditInputPreview = {
  kind: "edit-input",
  path: "patches/incoming.diff",
  summary: "Incoming edit",
  edits: [],
};

describe("toolUpdateEvents", () => {
  it("skips updates when the running tool message is missing", () => {
    expect(runtimeToolUpdateEventModel({
      kind: "tool-update",
      toolCallId: "tool-call-1",
      label: "bash",
      content: "partial output",
    }, {
      workspacePath: "/workspace",
      permissionMode: "workspace",
    })).toEqual({
      shouldUpdateMessage: false,
      reason: "missing-message",
      toolCallId: "tool-call-1",
      label: "bash",
      resultContent: "partial output",
    });
  });

  it("skips updates when the tool result content is empty", () => {
    expect(runtimeToolUpdateEventModel({
      kind: "tool-update",
      toolCallId: "tool-call-2",
      label: "bash",
      content: "",
    }, {
      workspacePath: "/workspace",
      permissionMode: "workspace",
      messageId: "message-1",
    })).toEqual({
      shouldUpdateMessage: false,
      reason: "empty-result",
      toolCallId: "tool-call-2",
      label: "bash",
      resultContent: "",
    });
  });

  it("models a running tool result update with previous input, previews, progress, and details", () => {
    const progress = progressSnapshot({ phase: "execution" });
    const resultDetails: ToolResultDetails = { runtime: "mcp", outputChars: 42 };

    expect(runtimeToolUpdateEventModel({
      kind: "tool-update",
      toolCallId: "tool-call-3",
      label: "ambient_mcp_tool_call",
      content: "Fetched docs.",
      details: {
        source: "plugin-mcp",
        pluginName: "Context7",
        toolName: "query-docs",
      },
      resultDetails,
    }, {
      workspacePath: "/workspace",
      permissionMode: "workspace",
      messageId: "message-3",
      previousInputContent: "{\"query\":\"docs\"}",
      previousLongformInputPreview,
      previousEditInputPreview,
      argumentProgress: progress,
    })).toEqual({
      shouldUpdateMessage: true,
      toolCallId: "tool-call-3",
      label: "ambient_mcp_tool_call",
      messageId: "message-3",
      resultContent: "Fetched docs.",
      toolEventStatus: "running",
      longformInputPreview: previousLongformInputPreview,
      editInputPreview: previousEditInputPreview,
      resultUpdateInput: {
        toolCallId: "tool-call-3",
        label: "ambient_mcp_tool_call",
        inputContent: "{\"query\":\"docs\"}",
        resultContent: "Fetched docs.",
        workspacePath: "/workspace",
        permissionMode: "workspace",
        messageStatus: "running",
        statusLabel: "running",
        eventStatus: "running",
        existingMessageId: "message-3",
        details: {
          source: "plugin-mcp",
          pluginName: "Context7",
          toolName: "query-docs",
        },
        resultDetails,
        longformInputPreview: previousLongformInputPreview,
        editInputPreview: previousEditInputPreview,
        argumentProgress: progress,
      },
    });
  });

  it("prefers incoming previews over previous previews", () => {
    const updateEvent = runtimeToolUpdateEventModel({
      kind: "tool-update",
      toolCallId: "tool-call-4",
      label: "edit",
      content: "patched",
      longformInputPreview: incomingLongformInputPreview,
      editInputPreview: incomingEditInputPreview,
    }, {
      workspacePath: "/workspace",
      permissionMode: "full-access",
      messageId: "message-4",
      previousLongformInputPreview,
      previousEditInputPreview,
    });

    expect(updateEvent.shouldUpdateMessage).toBe(true);
    if (!updateEvent.shouldUpdateMessage) return;
    expect(updateEvent.longformInputPreview).toBe(incomingLongformInputPreview);
    expect(updateEvent.editInputPreview).toBe(incomingEditInputPreview);
    expect(updateEvent.resultUpdateInput.longformInputPreview).toBe(incomingLongformInputPreview);
    expect(updateEvent.resultUpdateInput.editInputPreview).toBe(incomingEditInputPreview);
  });
});

function progressSnapshot(overrides: Partial<ToolArgumentProgressSnapshot> = {}): ToolArgumentProgressSnapshot {
  return {
    version: 1,
    phase: "argument_stream",
    eventType: "tool_execution_start",
    toolCallId: "tool-call-3",
    toolName: "ambient_mcp_tool_call",
    uiStatus: "running",
    argumentStartedAt: "2026-06-15T00:00:00.000Z",
    argumentUpdatedAt: "2026-06-15T00:00:00.500Z",
    argumentElapsedMs: 500,
    argumentComplete: true,
    inputChars: 0,
    deltaChars: 0,
    totalDeltaChars: 0,
    maxDeltaChars: 0,
    observedArgumentChars: 0,
    argumentEventCount: 1,
    toolcallDeltaCount: 0,
    meaningfulGrowthCount: 0,
    charsPerSecond: 0,
    ...overrides,
  };
}
