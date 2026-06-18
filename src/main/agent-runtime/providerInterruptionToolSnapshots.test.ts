import { describe, expect, it } from "vitest";

import type { ToolArgumentProgressSnapshot, ToolIntentSnapshot } from "../../shared/threadTypes";
import {
  runtimeOpenProviderInterruptionToolSnapshots,
  type PersistPreparedProviderInterruptionArguments,
} from "./providerInterruptionToolSnapshots";

const intent: ToolIntentSnapshot = {
  version: 1,
  toolCallId: "tool-call-1",
  toolName: "file_write",
  operationKind: "write_or_mutate",
  targetSummary: "/workspace/file.txt",
  declaredPurpose: "Write requested content.",
  materiality: "required_before_final_answer",
  substituteAllowed: false,
  createdAt: "2026-06-15T00:00:00.000Z",
};

describe("providerInterruptionToolSnapshots", () => {
  it("captures prepared unexecuted tool calls with persisted recovery arguments", () => {
    const persisted: Parameters<PersistPreparedProviderInterruptionArguments>[0][] = [];
    const snapshots = runtimeOpenProviderInterruptionToolSnapshots({
      toolCallIds: ["tool-call-1"],
      workspacePath: "/workspace",
      runId: "run-1",
      progressForToolCall: () => progressSnapshot({ argumentComplete: true, observedArgumentChars: 20 }),
      toolInputs: new Map([["tool-call-1", "{\"path\":\"/workspace/file.txt\"}"]]),
      toolRecoveryInputs: new Map([["tool-call-1", "{\"path\":\"/workspace/file.txt\",\"content\":\"exact\"}"]]),
      toolLabels: new Map(),
      startedToolCallIds: new Set(),
      toolIntents: new Map([["tool-call-1", intent]]),
      persistPreparedArguments: (input) => {
        persisted.push(input);
        return {
          recoveryArgumentPath: "/workspace/.ambient/recovery/tool-call-1.txt",
          workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.txt",
          recoveryArgumentSha256: "abc123",
          recoveryArgumentParseStatus: "valid_json",
        };
      },
    });

    expect(persisted).toEqual([{
      workspacePath: "/workspace",
      runId: "run-1",
      toolCallId: "tool-call-1",
      inputText: "{\"path\":\"/workspace/file.txt\",\"content\":\"exact\"}",
    }]);
    expect(snapshots).toEqual([expect.objectContaining({
      toolCallId: "tool-call-1",
      toolName: "file_write",
      phase: "arguments_prepared_not_executed",
      certainty: "prepared_only",
      executionStarted: false,
      argumentComplete: true,
      inputChars: 30,
      inputPreview: "{\"path\":\"/workspace/file.txt\"}",
      recoveryArgumentPath: "/workspace/.ambient/recovery/tool-call-1.txt",
      workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.txt",
      recoveryArgumentSha256: "abc123",
      recoveryArgumentParseStatus: "valid_json",
      intent,
    })]);
  });

  it("does not persist recovery arguments once execution started", () => {
    let persisted = false;
    const snapshots = runtimeOpenProviderInterruptionToolSnapshots({
      toolCallIds: ["tool-call-1"],
      workspacePath: "/workspace",
      runId: "run-1",
      progressForToolCall: () => progressSnapshot({
        argumentComplete: true,
        executionStartedAt: "2026-06-15T00:00:01.000Z",
      }),
      toolInputs: new Map([["tool-call-1", "{\"path\":\"/workspace/file.txt\"}"]]),
      toolRecoveryInputs: new Map(),
      toolLabels: new Map(),
      startedToolCallIds: new Set(["tool-call-1"]),
      toolIntents: new Map(),
      persistPreparedArguments: () => {
        persisted = true;
        throw new Error("should not persist");
      },
    });

    expect(persisted).toBe(false);
    expect(snapshots).toEqual([expect.objectContaining({
      phase: "execution_started_unknown",
      certainty: "started_unknown",
      executionStarted: true,
      argumentComplete: true,
      executionStartedAt: "2026-06-15T00:00:01.000Z",
    })]);
    expect(snapshots[0]).not.toHaveProperty("recoveryArgumentPath");
  });

  it("skips ids without progress or visible input", () => {
    const snapshots = runtimeOpenProviderInterruptionToolSnapshots({
      toolCallIds: ["missing-tool"],
      workspacePath: "/workspace",
      runId: "run-1",
      progressForToolCall: () => undefined,
      toolInputs: new Map(),
      toolRecoveryInputs: new Map(),
      toolLabels: new Map([["missing-tool", "file_write"]]),
      startedToolCallIds: new Set(),
      toolIntents: new Map(),
      persistPreparedArguments: () => {
        throw new Error("should not persist");
      },
    });

    expect(snapshots).toEqual([]);
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
