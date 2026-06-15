import { describe, expect, it } from "vitest";

import type {
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import { runtimeOpenToolFailureUpdates } from "./openToolFailureUpdates";

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

describe("openToolFailureUpdates", () => {
  it("builds interrupted message and tool-event updates for open tool calls", () => {
    const progress = progressSnapshot({
      argumentComplete: true,
      inputChars: 42,
      observedArgumentChars: 42,
    });

    const updates = runtimeOpenToolFailureUpdates({
      toolMessageIds: new Map([["tool-call-1", "message-1"]]),
      workspacePath: "/workspace",
      permissionMode: "workspace",
      progressForToolCall: () => progress,
      toolInputs: new Map([["tool-call-1", "{\"path\":\"/workspace/public/out.webp\"}"]]),
      toolLabels: new Map(),
      toolLongformInputPreviews: new Map([["tool-call-1", longformInputPreview]]),
      toolEditInputPreviews: new Map([["tool-call-1", editInputPreview]]),
      startedToolCallIds: new Set(),
      reason: "Ambient/Pi stream interrupted before this tool completed.",
    });

    expect(updates).toEqual([{
      toolCallId: "tool-call-1",
      messageId: "message-1",
      label: "file_write",
      resolvedReason: "Ambient/Pi stream interrupted before this tool completed.",
      visibleInput: "{\"path\":\"/workspace/public/out.webp\"}",
      artifactPath: "public/out.webp",
      messageContent: [
        "file_write interrupted",
        "Input\n{\"path\":\"/workspace/public/out.webp\"}",
        "Result\nAmbient/Pi stream interrupted before this tool completed.",
      ].join("\n\n"),
      messageMetadata: {
        status: "error",
        toolCallId: "tool-call-1",
        toolName: "file_write",
        artifactPath: "public/out.webp",
        toolLongformInputPreview: longformInputPreview,
        toolEditInputPreview: editInputPreview,
        toolArgumentProgress: progress,
      },
      toolEventLabel: "file_write",
      toolEventDetails: {
        source: "pi-builtin",
        runtime: "chat",
        permissionMode: "workspace",
        toolName: "file_write",
        result: "error",
        toolPhase: "argument_stream",
        toolArgumentProgress: progress,
      },
    }]);
  });

  it("resolves functional reasons with execution-started context", () => {
    const contexts: unknown[] = [];
    const progress = progressSnapshot({ executionStartedAt: "2026-06-15T00:00:01.000Z" });

    const updates = runtimeOpenToolFailureUpdates({
      toolMessageIds: new Map([["tool-call-1", "message-1"]]),
      workspacePath: "/workspace",
      permissionMode: "full-access",
      progressForToolCall: () => progress,
      toolInputs: new Map(),
      toolLabels: new Map([["tool-call-1", "fallback_tool"]]),
      toolLongformInputPreviews: new Map(),
      toolEditInputPreviews: new Map(),
      startedToolCallIds: new Set(["tool-call-1"]),
      reason: (context) => {
        contexts.push(context);
        return context.executionStarted ? "Tool may have started." : "Tool did not start.";
      },
    });

    expect(contexts).toEqual([{
      toolCallId: "tool-call-1",
      label: "file_write",
      executionStarted: true,
      progress,
    }]);
    expect(updates).toEqual([expect.objectContaining({
      resolvedReason: "Tool may have started.",
      visibleInput: "",
      messageContent: "file_write interrupted\n\nResult\nTool may have started.",
    })]);
    expect(updates[0].messageMetadata).toEqual(expect.objectContaining({
      status: "error",
      toolCallId: "tool-call-1",
      toolName: "file_write",
      toolArgumentProgress: progress,
    }));
  });

  it("skips ids without progress or visible input", () => {
    const updates = runtimeOpenToolFailureUpdates({
      toolMessageIds: new Map([["tool-call-1", "message-1"]]),
      workspacePath: "/workspace",
      permissionMode: "workspace",
      progressForToolCall: () => undefined,
      toolInputs: new Map(),
      toolLabels: new Map([["tool-call-1", "file_write"]]),
      toolLongformInputPreviews: new Map(),
      toolEditInputPreviews: new Map(),
      startedToolCallIds: new Set(),
      reason: "No update.",
    });

    expect(updates).toEqual([]);
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
