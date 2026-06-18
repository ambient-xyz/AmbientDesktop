import { describe, expect, it } from "vitest";
import {
  AMBIENT_MODEL_RUNTIME_PROFILES,
  createAmbientModelRuntimeSnapshotFromProfile,
} from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION, type SubagentRunStatus } from "../../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../../shared/subagentRoles";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import {
  appendMappedSubagentRuntimeEvent,
  type SubagentRuntimeEventPersistenceStore,
} from "./subagentRuntimeEventPersistence";

describe("subagentRuntimeEventPersistence", () => {
  it("persists mapped child runtime events with run-event attribution and artifact paths", () => {
    const run = subagentRun({ status: "needs_attention" });
    const { store, appended } = appendStore();

    const persisted = appendMappedSubagentRuntimeEvent(store, {
      run,
      source: "child_runtime",
      event: {
        type: "tool_result",
        status: "needs_attention",
        message: "Tool result is waiting on a child-scoped approval.",
        toolName: "workspace.apply_patch",
        artifactPath: "test-results/subagents/child-run-1/tool-result.json",
        createdAt: "2026-06-06T00:00:01.000Z",
        details: {
          toolCategory: "workspace.write",
          approvalSource: "permission_grant",
          approvalGrantId: "approval-worker",
          worktreeIsolated: true,
          worktreePath: "/repo/.ambient-codex/worktrees/child-run-1",
        },
      },
    });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual({
      runId: "child-run-1",
      input: {
        type: "subagent.runtime_event",
        preview: persisted.runtimeEvent,
        artifactPath: "test-results/subagents/child-run-1/tool-result.json",
        createdAt: "2026-06-06T00:00:01.000Z",
      },
    });
    expect(persisted.runEvent).toEqual({
      runId: "child-run-1",
      sequence: 1,
      type: "subagent.runtime_event",
      createdAt: "2026-06-06T00:00:01.000Z",
      preview: persisted.runtimeEvent,
      artifactPath: "test-results/subagents/child-run-1/tool-result.json",
    });
    expect(persisted.runtimeEvent).toMatchObject({
      schemaVersion: "ambient-subagent-runtime-event-v1",
      type: "tool_result",
      source: "child_runtime",
      runId: "child-run-1",
      parentRunId: "parent-run-1",
      childThreadId: "child-thread-1",
      status: "needs_attention",
      toolName: "workspace.apply_patch",
      artifactPath: "test-results/subagents/child-run-1/tool-result.json",
      createdAt: "2026-06-06T00:00:01.000Z",
      details: {
        approvalSource: "permission_grant",
        approvalGrantId: "approval-worker",
        toolCategory: "workspace.write",
        worktreeIsolated: true,
        worktreePath: "/repo/.ambient-codex/worktrees/child-run-1",
      },
    });
  });

  it("rejects large mapped runtime output when no full artifact path is available", () => {
    const { store, appended } = appendStore();

    expect(() => appendMappedSubagentRuntimeEvent(store, {
      run: subagentRun(),
      source: "wait_agent",
      event: {
        type: "assistant_delta",
        textPreview: "assistant output ".repeat(100),
        createdAt: "2026-06-06T00:00:02.000Z",
      },
    })).toThrow(/Large child runtime output would be clipped or truncated without a full artifact path/);
    expect(appended).toHaveLength(0);
  });

  it("rejects nested truncated large-output previews that lack a full artifact path", () => {
    const { store, appended } = appendStore();

    expect(() => appendMappedSubagentRuntimeEvent(store, {
      run: subagentRun(),
      source: "child_runtime",
      event: {
        type: "tool_result",
        status: "running",
        message: "Tool returned a truncated stdout preview.",
        toolName: "ambient_cli",
        createdAt: "2026-06-06T00:00:02.000Z",
        details: {
          largeOutputPreview: {
            kind: "large-output",
            summary: "stdout · 17,000 chars · 16,000 preview",
            items: [{
              label: "stdout",
              chars: 17_000,
              previewChars: 16_000,
              truncated: true,
            }],
          },
        },
      },
    })).toThrow(/large-output items: stdout 17000\/16000/);
    expect(appended).toHaveLength(0);

    const persisted = appendMappedSubagentRuntimeEvent(store, {
      run: subagentRun(),
      source: "child_runtime",
      event: {
        type: "tool_result",
        status: "running",
        message: "Tool returned an artifact-backed stdout preview.",
        toolName: "ambient_cli",
        createdAt: "2026-06-06T00:00:03.000Z",
        details: {
          largeOutputPreview: {
            kind: "large-output",
            summary: "stdout · full output: .ambient/tool-outputs/stdout.txt",
            items: [{
              label: "stdout",
              chars: 17_000,
              previewChars: 16_000,
              truncated: true,
              artifactPath: ".ambient/tool-outputs/stdout.txt",
            }],
          },
        },
      },
    });

    expect(persisted.runEvent.preview).toMatchObject({
      details: {
        largeOutputPreview: {
          items: [expect.objectContaining({ artifactPath: ".ambient/tool-outputs/stdout.txt" })],
        },
      },
    });
    expect(appended).toHaveLength(1);
  });

  it("persists usage and local-memory runtime telemetry as child-attributed previews", () => {
    const { store } = appendStore();

    const persisted = appendMappedSubagentRuntimeEvent(store, {
      run: subagentRun(),
      source: "child_runtime",
      event: {
        type: "usage",
        tokenCount: 123,
        costMicros: 456,
        localMemoryBytes: 789,
        createdAt: "2026-06-06T00:00:03.000Z",
      },
    });

    expect(persisted.runtimeEvent).toMatchObject({
      type: "usage",
      source: "child_runtime",
      runId: "child-run-1",
      parentRunId: "parent-run-1",
      childThreadId: "child-thread-1",
      tokenCount: 123,
      costMicros: 456,
      localMemoryBytes: 789,
      createdAt: "2026-06-06T00:00:03.000Z",
    });
    expect(persisted.runEvent).toEqual({
      runId: "child-run-1",
      sequence: 1,
      type: "subagent.runtime_event",
      createdAt: "2026-06-06T00:00:03.000Z",
      preview: persisted.runtimeEvent,
    });
  });
});

function subagentRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  const model = AMBIENT_MODEL_RUNTIME_PROFILES[0];
  const canonicalTaskPath = overrides.canonicalTaskPath ?? "root/1:worker";
  const roleId: SubagentRoleId = "worker";
  return {
    id: "child-run-1",
    protocolVersion: AMBIENT_SUBAGENT_PROTOCOL_VERSION,
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    childThreadId: "child-thread-1",
    canonicalTaskPath,
    roleId,
    roleProfileSnapshot: getDefaultSubagentRoleProfile(roleId),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running" as SubagentRunStatus,
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      settings: { subagents: true },
      generatedAt: "2026-06-06T00:00:00.000Z",
    }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(
      model.modelId,
      model,
      "2026-06-06T00:00:00.000Z",
    ),
    capacityLeaseSnapshot: resolveSubagentCapacityLease({
      parentThreadId: "parent-thread-1",
      parentRunId: "parent-run-1",
      canonicalTaskPath,
      roleId,
      model,
      now: "2026-06-06T00:00:00.000Z",
    }),
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function appendStore(): {
  store: SubagentRuntimeEventPersistenceStore;
  appended: Array<{
    runId: string;
    input: Parameters<SubagentRuntimeEventPersistenceStore["appendSubagentRunEvent"]>[1];
  }>;
} {
  const appended: Array<{
    runId: string;
    input: Parameters<SubagentRuntimeEventPersistenceStore["appendSubagentRunEvent"]>[1];
  }> = [];
  return {
    appended,
    store: {
      appendSubagentRunEvent(runId, input): SubagentRunEventSummary {
        appended.push({ runId, input });
        return {
          runId,
          sequence: appended.length,
          type: input.type,
          createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
          ...(input.preview !== undefined ? { preview: input.preview } : {}),
          ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
        };
      },
    },
  };
}
