import { describe, expect, it, vi } from "vitest";

import { AMBIENT_DEFAULT_MODEL, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentParentMailboxEventSummary } from "../../shared/subagentTypes";
import { resolveSubagentModelScope } from "./subagentModelProviderFacade";
import type { SubagentChildRuntimeLaunchPreflightResult } from "./subagentPiRuntimeFacade";
import {
  recordScheduledSubagentSpawnPolicyFailure,
  recordSubagentPreRunSpawnFailure,
  SUBAGENT_PRE_RUN_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION,
  type SubagentPreRunSpawnFailureRecorderStore,
} from "./subagentPreRunSpawnFailureRecorder";

describe("subagentPreRunSpawnFailureRecorder", () => {
  it("appends model-scope failures through the typed parent-mailbox builder", () => {
    const store = fakeStore();
    const role = getDefaultSubagentRoleProfile("explorer");
    const modelScope = resolveSubagentModelScope({ role, requestedModelId: "custom/unregistered-model" });

    const event = recordSubagentPreRunSpawnFailure({
      store,
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      phase: "phase-2-pi-tool-surface",
      toolCallId: "spawn-bad-model",
      task: "Inspect using the requested custom model.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope,
      idempotencyKey: "spawn:bad-model",
      reason: "Selected model is not eligible for sub-agent runs (custom/unregistered-model).",
    });

    expect(SUBAGENT_PRE_RUN_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION).toBe("ambient-subagent-pre-run-spawn-failure-recorder-v1");
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledTimes(1);
    expect(event).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.spawn_failed",
      deliveryState: "queued",
      idempotencyKey: "spawn:bad-model",
      payload: expect.objectContaining({
        schemaVersion: "ambient-subagent-spawn-failure-v1",
        phase: "phase-2-pi-tool-surface",
        failureStage: "model_scope",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        toolCallId: "spawn-bad-model",
        requestedRoleId: "explorer",
        roleId: "explorer",
        modelScope: expect.objectContaining({
          source: "caller_override",
          selectedModelId: "custom/unregistered-model",
          blockingReasons: expect.arrayContaining([
            "Model is not registered in this Ambient Desktop build.",
          ]),
        }),
      }),
    });
  });

  it("preserves runtime preflight, capacity, and unavailable extension evidence", () => {
    const store = fakeStore();
    const role = getDefaultSubagentRoleProfile("explorer");
    const modelScope = resolveSubagentModelScope({ role, parentModelId: AMBIENT_DEFAULT_MODEL });
    const capacityLease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      now: "2026-06-06T00:00:00.000Z",
    });

    const event = recordSubagentPreRunSpawnFailure({
      store,
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run" },
      phase: "phase-2-pi-tool-surface",
      toolCallId: "spawn-local-runtime-denied",
      task: "Launch local worker.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope,
      failureStage: "runtime_launch_preflight",
      runtimeLaunchPreflight: runtimePreflight(),
      capacityLease,
      unavailableExtensionTools: [{ id: "missing_search", categoryId: "workspace.read" }],
      reason: "Sub-agent runtime launch preflight failed: local runtime is unavailable.",
    });

    expect(event.idempotencyKey).toContain("subagent:spawn-failed:");
    expect(event.payload).toMatchObject({
      failureStage: "runtime_launch_preflight",
      runtimeLaunchPreflight: {
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
        runtime: "local_text",
        allowed: false,
        capacity: {
          localMemory: {
            outcome: "refuse",
            allowed: false,
          },
        },
        details: {
          launchReadiness: {
            descriptor: {
              runtimeId: "local-text-runtime",
              argCount: 2,
            },
          },
        },
      },
      capacityLease: {
        schemaVersion: "ambient-subagent-capacity-lease-v1",
        status: "reserved",
      },
      unavailableExtensionTools: [{ id: "missing_search", categoryId: "workspace.read" }],
    });
    expect((event.payload as any).runtimeLaunchPreflight.details.launchReadiness.descriptor.args).toBeUndefined();
  });

  it("appends scheduled-spawn policy failures before live child creation", () => {
    const store = fakeStore();
    const event = recordScheduledSubagentSpawnPolicyFailure({
      store,
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      phase: "phase-2-pi-tool-surface",
      toolCallId: "spawn-scheduled",
      task: "Report stale TODOs.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      role: getDefaultSubagentRoleProfile("explorer"),
      scheduledSpawnFields: ["scheduledAt", "recurrence"],
      idempotencyKey: "spawn:scheduled",
    });

    expect(event).toMatchObject({
      type: "subagent.spawn_failed",
      deliveryState: "queued",
      idempotencyKey: "spawn:scheduled",
      parentMessageId: "assistant-message",
      payload: expect.objectContaining({
        schemaVersion: "ambient-subagent-spawn-failure-v1",
        failureStage: "scheduling_policy",
        schedulingPolicy: "live_parent_only",
        scheduledSpawnFields: ["scheduledAt", "recurrence"],
        reason: expect.stringContaining("cannot inherit live parent context"),
        automationGuidance: expect.stringContaining("automation layer"),
      }),
    });
  });
});

function fakeStore(): SubagentPreRunSpawnFailureRecorderStore & {
  appendSubagentParentMailboxEvent: ReturnType<typeof vi.fn>;
} {
  const appendSubagentParentMailboxEvent = vi.fn((input): SubagentParentMailboxEventSummary => ({
    id: `parent-mailbox-${appendSubagentParentMailboxEvent.mock.calls.length}`,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState ?? "queued",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
  }));
  return { appendSubagentParentMailboxEvent };
}

function runtimePreflight(): SubagentChildRuntimeLaunchPreflightResult {
  return {
    schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
    runtime: "local_text",
    allowed: false,
    blockers: ["Local runtime is unavailable."],
    warnings: ["Use GMI Cloud while local runtime is offline."],
    capacity: {
      localMemory: {
        outcome: "refuse",
        allowed: false,
        reason: "Projected local-model resident memory exceeds the configured ceiling.",
      },
    },
    details: {
      launchReadiness: {
        schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
        ready: false,
        descriptor: {
          runtimeId: "local-text-runtime",
          command: "",
          args: ["--serve", "--json"],
          argCount: 2,
        },
      },
    },
  };
}
