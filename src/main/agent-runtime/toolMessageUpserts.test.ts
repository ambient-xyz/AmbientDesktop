import { describe, expect, it } from "vitest";

import type {
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolLongformInputPreview,
} from "../../shared/types";
import { runtimeToolInputMessageUpsert } from "./toolMessageUpserts";

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

describe("toolMessageUpserts", () => {
  it("builds a running tool message update while preserving existing previews", () => {
    const progress = progressSnapshot({ argumentComplete: true });

    expect(runtimeToolInputMessageUpsert({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "prepared",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      workspacePath: "/workspace",
      existingMessageId: "message-1",
      previousLongformInputPreview,
      previousEditInputPreview,
      argumentProgress: progress,
    })).toEqual({
      toolCallId: "tool-call-1",
      label: "file_write",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      existingMessageId: "message-1",
      artifactPath: "public/out.webp",
      content: "file_write prepared\n\nInput\n{\"path\":\"/workspace/public/out.webp\"}",
      metadata: {
        status: "running",
        toolCallId: "tool-call-1",
        toolName: "file_write",
        artifactPath: "public/out.webp",
        toolLongformInputPreview: previousLongformInputPreview,
        toolEditInputPreview: previousEditInputPreview,
        toolArgumentProgress: progress,
      },
      persistedLongformInputPreview: previousLongformInputPreview,
      persistedEditInputPreview: previousEditInputPreview,
    });
  });

  it("prefers incoming previews over previous previews", () => {
    const upsert = runtimeToolInputMessageUpsert({
      toolCallId: "tool-call-1",
      label: "file_write",
      statusLabel: "running",
      inputContent: "{\"path\":\"/workspace/public/out.webp\"}",
      workspacePath: "/workspace",
      longformInputPreview: incomingLongformInputPreview,
      editInputPreview: incomingEditInputPreview,
      previousLongformInputPreview,
      previousEditInputPreview,
    });

    expect(upsert.persistedLongformInputPreview).toBe(incomingLongformInputPreview);
    expect(upsert.persistedEditInputPreview).toBe(incomingEditInputPreview);
    expect(upsert.metadata).toEqual(expect.objectContaining({
      toolLongformInputPreview: incomingLongformInputPreview,
      toolEditInputPreview: incomingEditInputPreview,
    }));
  });

  it("builds a new shell tool message without artifact metadata when no artifact is present", () => {
    expect(runtimeToolInputMessageUpsert({
      toolCallId: "tool-call-2",
      label: "bash",
      statusLabel: "preparing",
      inputContent: "pnpm test",
      workspacePath: "/workspace",
    })).toEqual({
      toolCallId: "tool-call-2",
      label: "bash",
      inputContent: "pnpm test",
      content: "bash preparing\n\nCommand\npnpm test",
      metadata: {
        status: "running",
        toolCallId: "tool-call-2",
        toolName: "bash",
      },
    });
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
