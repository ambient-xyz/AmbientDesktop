import { describe, expect, it } from "vitest";
import { ToolArgumentProgressTracker } from "./toolArgumentProgress";

const t0 = Date.parse("2026-05-21T10:00:00.000Z");

describe("ToolArgumentProgressTracker", () => {
  it("records argument stream timing separately from execution timing", () => {
    const tracker = new ToolArgumentProgressTracker();

    tracker.recordArgumentEvent({
      toolCallId: "call-1",
      toolName: "write",
      eventType: "toolcall_start",
      inputContent: "{}",
      nowMs: t0,
    });
    const delta = tracker.recordArgumentEvent({
      toolCallId: "call-1",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: '{ "path": "index.html", "content": "hello" }',
      longformInputPreview: {
        kind: "longform-input",
        summary: "index.html",
        items: [
          {
            label: "File",
            fieldPath: "content",
            path: "index.html",
            preview: "hello",
            chars: 5,
            truncated: false,
          },
        ],
      },
      nowMs: t0 + 500,
    });
    const prepared = tracker.recordArgumentEvent({
      toolCallId: "call-1",
      toolName: "write",
      eventType: "toolcall_end",
      inputContent: '{ "path": "index.html", "content": "hello world" }',
      longformInputPreview: {
        kind: "longform-input",
        summary: "index.html",
        items: [
          {
            label: "File",
            fieldPath: "content",
            path: "index.html",
            preview: "hello world",
            chars: 11,
            truncated: false,
          },
        ],
      },
      nowMs: t0 + 1_000,
    });
    const executing = tracker.markExecutionStart({
      toolCallId: "call-1",
      toolName: "write",
      nowMs: t0 + 1_500,
    });
    const completed = tracker.markExecutionEnd({
      toolCallId: "call-1",
      toolName: "write",
      nowMs: t0 + 2_250,
    });

    expect(delta).toMatchObject({
      eventType: "toolcall_delta",
      phase: "argument_stream",
      deltaChars: 42,
      inputChars: 44,
      observedArgumentChars: 44,
      argumentElapsedMs: 500,
      toolcallDeltaCount: 1,
      contentFieldChars: 5,
      contentFieldDeltaChars: 5,
    });
    expect(prepared).toMatchObject({
      eventType: "toolcall_end",
      argumentComplete: true,
      argumentElapsedMs: 1_000,
      contentFieldChars: 11,
      uiStatus: "write arguments prepared (50 chars); waiting to run.",
    });
    expect(executing).toMatchObject({
      phase: "execution",
      eventType: "tool_execution_start",
      argumentElapsedMs: 1_000,
      executionElapsedMs: 0,
      uiStatus: "write is executing (50 chars).",
    });
    expect(completed).toMatchObject({
      phase: "completed",
      eventType: "tool_execution_end",
      executionElapsedMs: 750,
      uiStatus: "write finished.",
    });
    expect(tracker.diagnostics(t0 + 2_250)).toMatchObject({
      active: [],
      completed: [expect.objectContaining({ toolCallId: "call-1", phase: "completed" })],
    });
  });

  it("keeps a long write argument stream active when it never ends", () => {
    const tracker = new ToolArgumentProgressTracker();
    tracker.recordArgumentEvent({
      toolCallId: "call-long",
      toolName: "write",
      eventType: "toolcall_start",
      inputContent: "{}",
      nowMs: t0,
    });
    const longPayload = `{ "path": "plan.md", "content": "${"a".repeat(12_000)}" }`;
    const snapshot = tracker.recordArgumentEvent({
      toolCallId: "call-long",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: longPayload,
      longformInputPreview: {
        kind: "longform-input",
        summary: "plan.md",
        items: [
          {
            label: "File",
            fieldPath: "content",
            path: "plan.md",
            preview: "a".repeat(80),
            chars: 12_000,
            truncated: true,
          },
        ],
      },
      nowMs: t0 + 2_000,
    });

    expect(snapshot).toMatchObject({
      phase: "argument_stream",
      eventType: "toolcall_delta",
      argumentComplete: false,
      inputChars: longPayload.length,
      observedArgumentChars: longPayload.length,
      contentFieldChars: 12_000,
      uiStatus: `write is streaming a large argument (${longPayload.length.toLocaleString("en-US")} chars).`,
    });
    expect(snapshot.charsPerSecond).toBeGreaterThan(6_000);
    expect(tracker.diagnostics(t0 + 3_000)).toMatchObject({
      active: [
        expect.objectContaining({
          toolCallId: "call-long",
          argumentComplete: false,
          lastMeaningfulGrowthMsAgo: 1_000,
        }),
      ],
      completed: [],
    });
  });

  it("does not treat keep-alive argument updates as meaningful growth", () => {
    const tracker = new ToolArgumentProgressTracker();
    tracker.recordArgumentEvent({
      toolCallId: "call-keepalive",
      toolName: "write",
      eventType: "toolcall_start",
      inputContent: "{}",
      nowMs: t0,
    });
    const first = tracker.recordArgumentEvent({
      toolCallId: "call-keepalive",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: '{ "path": "plan.md" }',
      nowMs: t0 + 250,
    });
    const keepAlive = tracker.recordArgumentEvent({
      toolCallId: "call-keepalive",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: '{ "path": "plan.md" }',
      nowMs: t0 + 1_250,
    });

    expect(first.meaningfulGrowthCount).toBe(2);
    expect(keepAlive).toMatchObject({
      deltaChars: 0,
      meaningfulGrowthCount: 2,
      toolcallDeltaCount: 2,
      lastMeaningfulGrowthMsAgo: 1_000,
    });
  });

  it("reports pending argument streams as stalled after keep-alive updates without growth", () => {
    const tracker = new ToolArgumentProgressTracker();
    tracker.recordArgumentEvent({
      toolCallId: "call-stalled",
      toolName: "write",
      eventType: "toolcall_start",
      inputContent: "{}",
      nowMs: t0,
    });
    tracker.recordArgumentEvent({
      toolCallId: "call-stalled",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: '{ "path": "plan.md" }',
      nowMs: t0 + 500,
    });
    tracker.recordArgumentEvent({
      toolCallId: "call-stalled",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: '{ "path": "plan.md" }',
      nowMs: t0 + 5_000,
    });

    expect(tracker.nextActiveArgumentStallDelayMs(30_000, t0 + 10_000)).toBe(20_500);
    expect(tracker.stalledActiveArgument(30_000, t0 + 30_499)).toBeUndefined();
    expect(tracker.stalledActiveArgument(30_000, t0 + 30_500)).toMatchObject({
      toolCallId: "call-stalled",
      toolName: "write",
      phase: "argument_stream",
      argumentComplete: false,
      lastMeaningfulGrowthMsAgo: 30_000,
      meaningfulGrowthCount: 2,
    });

    tracker.recordArgumentEvent({
      toolCallId: "call-stalled",
      toolName: "write",
      eventType: "toolcall_end",
      inputContent: '{ "path": "plan.md" }',
      nowMs: t0 + 31_000,
    });

    expect(tracker.stalledActiveArgument(30_000, t0 + 70_000)).toBeUndefined();
    expect(tracker.nextActiveArgumentStallDelayMs(30_000, t0 + 70_000)).toBeUndefined();
  });

  it("uses longform content size when the rendered tool input is bounded", () => {
    const tracker = new ToolArgumentProgressTracker();
    const boundedInput = '{ "path": "plan.md", "content": "aaaaaaaaaa..." }';
    const snapshot = tracker.recordArgumentEvent({
      toolCallId: "call-bounded",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: boundedInput,
      longformInputPreview: {
        kind: "longform-input",
        summary: "plan.md",
        items: [
          {
            label: "File",
            fieldPath: "content",
            path: "plan.md",
            preview: "a".repeat(80),
            chars: 25_000,
            truncated: true,
          },
        ],
      },
      nowMs: t0 + 1_000,
    });

    expect(snapshot).toMatchObject({
      inputChars: boundedInput.length,
      contentFieldChars: 25_000,
      contentFieldDeltaChars: 25_000,
      observedArgumentChars: 25_000,
      uiStatus: "write is streaming a large argument (25,000 chars).",
    });
  });
});
