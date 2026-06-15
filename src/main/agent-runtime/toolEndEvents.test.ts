import { describe, expect, it } from "vitest";

import type {
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import type { ToolResultDetails } from "../piEventMapper";
import { runtimeToolEndEventModel } from "./toolEndEvents";

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

describe("toolEndEvents", () => {
  it("models a successful terminal replacement update", () => {
    const progress = progressSnapshot({ phase: "completed" });
    const resultDetails: ToolResultDetails = { runtime: "mcp", outputChars: 42 };

    expect(runtimeToolEndEventModel({
      kind: "tool-end",
      toolCallId: "tool-call-1",
      label: "ambient_mcp_tool_call",
      content: "Fetched docs.",
      status: "done",
      details: {
        source: "plugin-mcp",
        pluginName: "Context7",
        toolName: "query-docs",
      },
      resultDetails,
    }, {
      workspacePath: "/workspace",
      permissionMode: "workspace",
      messageId: "message-1",
      previousInputContent: "{\"query\":\"docs\"}",
      previousLongformInputPreview,
      previousEditInputPreview,
      argumentProgress: progress,
    })).toEqual({
      toolCallId: "tool-call-1",
      label: "ambient_mcp_tool_call",
      terminalStatus: "done",
      statusLabel: "completed",
      toolEventStatus: "completed",
      resultContent: "Fetched docs.",
      longformInputPreview: previousLongformInputPreview,
      editInputPreview: previousEditInputPreview,
      resultUpdateInput: {
        toolCallId: "tool-call-1",
        label: "ambient_mcp_tool_call",
        inputContent: "{\"query\":\"docs\"}",
        resultContent: "Fetched docs.",
        workspacePath: "/workspace",
        permissionMode: "workspace",
        messageStatus: "done",
        statusLabel: "completed",
        eventStatus: "completed",
        existingMessageId: "message-1",
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

  it("models an error terminal update without an existing message", () => {
    expect(runtimeToolEndEventModel({
      kind: "tool-end",
      toolCallId: "tool-call-2",
      label: "bash",
      content: "Command failed.",
      status: "error",
    }, {
      workspacePath: "/workspace",
      permissionMode: "full-access",
    })).toEqual({
      toolCallId: "tool-call-2",
      label: "bash",
      terminalStatus: "error",
      statusLabel: "failed",
      toolEventStatus: "error",
      resultContent: "Command failed.",
      resultUpdateInput: {
        toolCallId: "tool-call-2",
        label: "bash",
        inputContent: "",
        resultContent: "Command failed.",
        workspacePath: "/workspace",
        permissionMode: "full-access",
        messageStatus: "error",
        statusLabel: "failed",
        eventStatus: "error",
      },
    });
  });

  it("prefers incoming previews over previous previews", () => {
    const endEvent = runtimeToolEndEventModel({
      kind: "tool-end",
      toolCallId: "tool-call-3",
      label: "edit",
      content: "patched",
      status: "done",
      longformInputPreview: incomingLongformInputPreview,
      editInputPreview: incomingEditInputPreview,
    }, {
      workspacePath: "/workspace",
      permissionMode: "workspace",
      previousLongformInputPreview,
      previousEditInputPreview,
    });

    expect(endEvent.longformInputPreview).toBe(incomingLongformInputPreview);
    expect(endEvent.editInputPreview).toBe(incomingEditInputPreview);
    expect(endEvent.resultUpdateInput.longformInputPreview).toBe(incomingLongformInputPreview);
    expect(endEvent.resultUpdateInput.editInputPreview).toBe(incomingEditInputPreview);
  });
});

function progressSnapshot(overrides: Partial<ToolArgumentProgressSnapshot> = {}): ToolArgumentProgressSnapshot {
  return {
    version: 1,
    phase: "execution",
    eventType: "tool_execution_end",
    toolCallId: "tool-call-1",
    toolName: "ambient_mcp_tool_call",
    uiStatus: "completed",
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
