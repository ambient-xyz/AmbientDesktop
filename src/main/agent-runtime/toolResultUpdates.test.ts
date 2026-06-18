import { describe, expect, it } from "vitest";

import type { ToolArgumentProgressSnapshot, ToolEditInputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import type { ToolResultDetails } from "./agentRuntimePiFacade";
import { runtimeToolResultMessageUpdate } from "./toolResultUpdates";

const longformInputPreview: ToolLongformInputPreview = {
  kind: "longform-input",
  summary: "Long input",
  items: [],
};

const editInputPreview: ToolEditInputPreview = {
  kind: "edit-input",
  path: "patches/edit.diff",
  summary: "Patch",
  edits: [],
};

describe("toolResultUpdates", () => {
  it("builds running tool result updates with plugin event labels", () => {
    const progress = progressSnapshot({ phase: "execution" });
    const resultDetails: ToolResultDetails = { runtime: "mcp", outputChars: 42 };

    expect(runtimeToolResultMessageUpdate({
      toolCallId: "tool-call-1",
      label: "ambient_mcp_tool_call",
      inputContent: "{\"query\":\"docs\"}",
      resultContent: "Fetched docs.",
      workspacePath: "/workspace",
      permissionMode: "workspace",
      messageStatus: "running",
      statusLabel: "running",
      eventStatus: "running",
      existingMessageId: "message-1",
      details: {
        source: "plugin-mcp",
        pluginName: "Context7",
        toolName: "query-docs",
      },
      resultDetails,
      longformInputPreview,
      editInputPreview,
      argumentProgress: progress,
    })).toEqual({
      toolCallId: "tool-call-1",
      label: "ambient_mcp_tool_call",
      inputContent: "{\"query\":\"docs\"}",
      resultContent: "Fetched docs.",
      existingMessageId: "message-1",
      content: "ambient_mcp_tool_call running\n\nInput\n{\"query\":\"docs\"}\n\nResult\nFetched docs.",
      metadata: {
        status: "running",
        toolCallId: "tool-call-1",
        toolName: "ambient_mcp_tool_call",
        toolResultDetails: resultDetails,
        toolLongformInputPreview: longformInputPreview,
        toolEditInputPreview: editInputPreview,
        toolArgumentProgress: progress,
      },
      toolEventLabel: "Context7: query-docs",
      toolEventDetails: {
        source: "plugin-mcp",
        runtime: "chat",
        permissionMode: "workspace",
        pluginName: "Context7",
        toolName: "query-docs",
        result: "running",
        toolPhase: "execution",
        toolArgumentProgress: progress,
      },
    });
  });

  it("builds terminal replacement updates with artifact metadata", () => {
    const progress = progressSnapshot({ phase: "completed" });

    expect(runtimeToolResultMessageUpdate({
      toolCallId: "tool-call-2",
      label: "file_write",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      resultContent: "Wrote file.",
      workspacePath: "/workspace",
      permissionMode: "full-access",
      messageStatus: "done",
      statusLabel: "completed",
      eventStatus: "completed",
      existingMessageId: "message-2",
      argumentProgress: progress,
    })).toEqual({
      toolCallId: "tool-call-2",
      label: "file_write",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      resultContent: "Wrote file.",
      existingMessageId: "message-2",
      artifactPath: "public/out.webp",
      content: "file_write completed\n\nInput\n{\"path\":\"/workspace/public/out.webp\"}\n\nResult\nWrote file.",
      metadata: {
        status: "done",
        toolCallId: "tool-call-2",
        toolName: "file_write",
        artifactPath: "public/out.webp",
        toolArgumentProgress: progress,
      },
      toolEventLabel: "file_write",
      toolEventDetails: {
        source: "pi-builtin",
        runtime: "chat",
        permissionMode: "full-access",
        toolName: "file_write",
        result: "completed",
        toolPhase: "completed",
        toolArgumentProgress: progress,
      },
    });
  });

  it("builds terminal new-message updates without replaying input in the transcript", () => {
    const update = runtimeToolResultMessageUpdate({
      toolCallId: "tool-call-3",
      label: "file_write",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      resultContent: "Wrote file.",
      workspacePath: "/workspace",
      permissionMode: "workspace",
      messageStatus: "error",
      statusLabel: "failed",
      eventStatus: "error",
    });

    expect(update.content).toBe("file_write failed\n\nResult\nWrote file.");
    expect(update.artifactPath).toBe("public/out.webp");
    expect(update.metadata).toEqual({
      status: "error",
      toolCallId: "tool-call-3",
      toolName: "file_write",
      artifactPath: "public/out.webp",
    });
    expect(update).not.toHaveProperty("existingMessageId");
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
