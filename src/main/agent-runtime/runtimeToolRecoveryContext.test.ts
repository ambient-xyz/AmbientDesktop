import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolArgumentProgressTracker } from "../tool-runtime/toolArgumentProgress";
import {
  createRuntimeToolRecoveryContext,
  type RuntimeToolRecoveryDiagnosticsPatch,
} from "./runtimeToolRecoveryContext";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "ambient-runtime-tool-recovery-"));
  tempDirs.push(dir);
  return dir;
}

function createContext(overrides: Partial<Parameters<typeof createRuntimeToolRecoveryContext>[0]> = {}) {
  const progress = overrides.toolArgumentProgress ?? new ToolArgumentProgressTracker();
  let now = 1_000;
  const diagnostics: RuntimeToolRecoveryDiagnosticsPatch[] = [];
  const context = createRuntimeToolRecoveryContext({
    workspacePath: workspace(),
    runId: "run-1",
    thresholdChars: 10,
    toolArgumentProgress: progress,
    isRunStoreActive: vi.fn(() => true),
    updateRunDiagnostics: vi.fn((patch) => diagnostics.push(patch)),
    retrySourceUserMessageId: vi.fn(() => "user-1"),
    turnGoal: vi.fn(() => "Please write the report."),
    assistantLeadIn: vi.fn(() => "I will update the report."),
    recoveryInput: vi.fn(() => undefined),
    inputContent: vi.fn(() => undefined),
    recoveryInputSource: vi.fn(() => undefined),
    nowMs: vi.fn(() => now),
    ...overrides,
  });
  return {
    context,
    progress,
    diagnostics,
    setNow: (next: number) => {
      now = next;
    },
  };
}

describe("createRuntimeToolRecoveryContext", () => {
  it("captures interrupted raw tool input with the remembered tool intent", () => {
    const { context, progress } = createContext();
    const largeVisibleInput = "x".repeat(1_100);
    const intent = context.rememberToolIntent(
      "tool-1",
      "write",
      { path: "report.md", content: "hello" },
      largeVisibleInput,
    );
    const snapshot = progress.recordArgumentEvent({
      toolCallId: "tool-1",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: largeVisibleInput,
      nowMs: 1,
    });

    const recovered = context.trackInterruptedToolCallRecovery(
      "tool-1",
      "write",
      { path: "report.md", content: largeVisibleInput },
      largeVisibleInput,
      snapshot,
    );

    expect(recovered.interruptedToolCallRecovery).toMatchObject({
      toolCallId: "tool-1",
      toolName: "write",
      source: "raw_tool_input",
      status: "capturing",
      intent,
    });
    expect(context.toolIntentSnapshots.get("tool-1")).toBe(intent);
  });

  it("force-captures recovery text from cached tool message input", () => {
    const { context, progress } = createContext({
      recoveryInput: vi.fn(() => "cached recovery input"),
      recoveryInputSource: vi.fn(() => "raw_tool_input" as const),
    });
    const snapshot = progress.recordArgumentEvent({
      toolCallId: "tool-2",
      toolName: "write",
      eventType: "toolcall_start",
      inputContent: "",
      nowMs: 1,
    });

    const recovered = context.forceInterruptedToolCallRecovery(snapshot);

    expect(recovered.interruptedToolCallRecovery).toMatchObject({
      toolCallId: "tool-2",
      toolName: "write",
      source: "raw_tool_input",
      capturedChars: "cached recovery input".length,
    });
  });

  it("marks captured arguments no longer recoverable once execution starts", () => {
    const { context, progress } = createContext();
    const largeVisibleInput = "x".repeat(1_100);
    const snapshot = progress.recordArgumentEvent({
      toolCallId: "tool-3",
      toolName: "write",
      eventType: "toolcall_delta",
      inputContent: largeVisibleInput,
      nowMs: 1,
    });
    const captured = context.trackInterruptedToolCallRecovery("tool-3", "write", undefined, largeVisibleInput, snapshot);

    const completed = context.markInterruptedToolCallNoLongerRecoverable("tool-3", captured);

    expect(completed.interruptedToolCallRecovery).toMatchObject({
      toolCallId: "tool-3",
      status: "completed",
    });
    expect(context.interruptedToolCallRecovery.recoverable()).toEqual([]);
  });

  it("throttles diagnostics unless persistence is forced", () => {
    const { context, diagnostics, setNow } = createContext();

    context.persistToolArgumentDiagnostics();
    setNow(1_500);
    context.persistToolArgumentDiagnostics();
    context.persistToolArgumentDiagnostics(true);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toHaveProperty("toolArgumentStreams");
    expect(diagnostics[0]).toHaveProperty("interruptedToolCallRecovery");
  });
});
