import { describe, expect, it, vi } from "vitest";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { createDefaultModelRuntimeRegistry } from "./subagentModelProviderFacade";
import type { SubagentChildRuntimeLaunchPreflightResult } from "./subagentPiRuntimeFacade";
import {
  buildSubagentSpawnCapacityLeaseInput,
  buildSubagentSpawnRuntimePreflightInput,
  resolveSubagentSpawnCapacityLease,
  resolveSubagentSpawnRuntimePreflight,
  shouldRecordSubagentPreRunCapacityFailure,
  SUBAGENT_SPAWN_PREFLIGHT_RESOLVER_SCHEMA_VERSION,
} from "./subagentSpawnPreflightResolver";

describe("subagentSpawnPreflightResolver", () => {
  it("builds and executes runtime launch preflight inputs without inventing a runtime", async () => {
    const role = getDefaultSubagentRoleProfile("summarizer");
    const model = createDefaultModelRuntimeRegistry().resolveProfile(role.defaultModelId);
    const preflightInput = buildSubagentSpawnRuntimePreflightInput({
      parentThread: parentThread(),
      task: "Summarize the latest notes.",
      role,
      model,
      dependencyMode: "required",
      forkMode: "recent_turns",
      promptMode: "append",
      canonicalTaskPath: "root/0:summarizer",
      idempotencyKey: "spawn:key",
    });
    const preflightResult = runtimePreflight();
    const runtime = {
      preflightChildLaunch: vi.fn(async () => preflightResult),
    };

    expect(SUBAGENT_SPAWN_PREFLIGHT_RESOLVER_SCHEMA_VERSION).toBe("ambient-subagent-spawn-preflight-resolver-v1");
    expect(preflightInput).toMatchObject({
      parentThread: expect.objectContaining({ id: "parent-thread" }),
      task: "Summarize the latest notes.",
      role: expect.objectContaining({ id: "summarizer" }),
      model: expect.objectContaining({ modelId: model.modelId }),
      dependencyMode: "required",
      forkMode: "recent_turns",
      promptMode: "append",
      canonicalTaskPath: "root/0:summarizer",
      idempotencyKey: "spawn:key",
    });
    await expect(resolveSubagentSpawnRuntimePreflight({ preflightInput })).resolves.toBeUndefined();
    await expect(resolveSubagentSpawnRuntimePreflight({ runtime, preflightInput })).resolves.toBe(preflightResult);
    expect(runtime.preflightChildLaunch).toHaveBeenCalledWith(preflightInput);
  });

  it("maps parent, model, existing run, and local-memory preflight data into capacity leases", async () => {
    const role = getDefaultSubagentRoleProfile("summarizer");
    const model = createDefaultModelRuntimeRegistry().resolveProfile(role.defaultModelId);
    const runtimeLaunchPreflight = runtimePreflight({
      localMemoryAllowed: false,
      localMemoryReason: "Projected local memory is over budget.",
    });
    const existingRuns = [
      existingRun({
        id: "cloud-run",
        status: "running",
        providerId: model.providerId,
        modelId: model.modelId,
      }),
      existingRun({
        id: "closed-run",
        status: "completed",
        closedAt: "2026-06-06T00:00:00.000Z",
        providerId: "local",
        modelId: "local-text",
      }),
    ];

    const resolverInput = buildSubagentSpawnCapacityLeaseInput({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      canonicalTaskPath: "root/0:summarizer",
      roleId: "summarizer",
      model,
      existingRuns,
      runtimeLaunchPreflight,
    });
    const resolveCapacityLease = vi.fn((input) =>
      resolveSubagentCapacityLease({ ...input, leaseId: "lease:custom" }));
    const lease = await resolveSubagentSpawnCapacityLease({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      canonicalTaskPath: "root/0:summarizer",
      roleId: "summarizer",
      model,
      existingRuns,
      runtimeLaunchPreflight,
      resolveCapacityLease,
    });

    expect(resolverInput).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:summarizer",
      roleId: "summarizer",
      localMemory: expect.objectContaining({
        allowed: false,
        reason: "Projected local memory is over budget.",
      }),
      existingRuns: [
        expect.objectContaining({
          id: "cloud-run",
          status: "running",
          modelRuntimeSnapshot: { profile: { profileId: model.profileId, providerId: model.providerId, modelId: model.modelId } },
        }),
        expect.objectContaining({
          id: "closed-run",
          status: "completed",
          closedAt: "2026-06-06T00:00:00.000Z",
          modelRuntimeSnapshot: { profile: { profileId: "local:local-text", providerId: "local", modelId: "local-text" } },
        }),
      ],
    });
    expect(resolveCapacityLease).toHaveBeenCalledWith(resolverInput);
    expect(lease).toMatchObject({
      leaseId: "lease:custom",
      status: "blocked",
      blockingReasons: ["Projected local memory is over budget."],
    });
  });

  it("records pre-run capacity failures only for denied runtime local-memory preflights", () => {
    const role = getDefaultSubagentRoleProfile("summarizer");
    const model = createDefaultModelRuntimeRegistry().resolveProfile(role.defaultModelId);
    const deniedPreflight = runtimePreflight({
      localMemoryAllowed: false,
      localMemoryReason: "Local runtime would exceed memory.",
    });
    const deniedLease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:summarizer",
      roleId: role.id,
      model,
      localMemory: deniedPreflight.capacity?.localMemory,
    });
    const providerBlockedLease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:summarizer",
      roleId: role.id,
      model,
      providerConcurrencyLimit: 1,
      existingRuns: [
        existingRun({
          id: "open-provider-run",
          status: "running",
          providerId: model.providerId,
          modelId: model.modelId,
        }),
      ],
    });
    const allowedPreflight = runtimePreflight();

    expect(shouldRecordSubagentPreRunCapacityFailure(deniedLease, deniedPreflight)).toBe(true);
    expect(shouldRecordSubagentPreRunCapacityFailure(deniedLease, undefined)).toBe(false);
    expect(shouldRecordSubagentPreRunCapacityFailure(deniedLease, allowedPreflight)).toBe(false);
    expect(shouldRecordSubagentPreRunCapacityFailure(providerBlockedLease, deniedPreflight)).toBe(false);
  });
});

function parentThread(): ThreadSummary {
  return {
    id: "parent-thread",
    kind: "chat",
    title: "Parent",
    workspacePath: "/tmp/ambient-parent",
    model: "glm-5.1",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    thinkingLevel: "medium",
    canonicalTaskPath: "root",
  };
}

function runtimePreflight(input: {
  localMemoryAllowed?: boolean;
  localMemoryReason?: string;
} = {}): SubagentChildRuntimeLaunchPreflightResult {
  const allowed = input.localMemoryAllowed ?? true;
  const reason = input.localMemoryReason ?? "Local memory is within the configured limit.";
  return {
    schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
    runtime: "local_text",
    allowed: true,
    blockers: [],
    warnings: [],
    capacity: {
      localMemory: {
        outcome: allowed ? "within-limit" : "refuse",
        allowed,
        reason,
      },
    },
  };
}

function existingRun(input: {
  id: string;
  status: SubagentRunSummary["status"];
  closedAt?: string;
  providerId: string;
  modelId: string;
  profileId?: string;
}): SubagentRunSummary {
  return {
    id: input.id,
    status: input.status,
    ...(input.closedAt ? { closedAt: input.closedAt } : {}),
    modelRuntimeSnapshot: {
      profile: {
        profileId: input.profileId ?? `${input.providerId}:${input.modelId}`,
        providerId: input.providerId,
        modelId: input.modelId,
      },
    },
  } as SubagentRunSummary;
}
