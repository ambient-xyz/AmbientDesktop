import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { subagentCapacityProviderProfileSnapshot } from "../../shared/subagentCapacity";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import {
  SUBAGENT_LIFECYCLE_HOOK_SCHEMA_VERSION,
  subagentLifecycleEventType,
  subagentLifecycleHookPreview,
  subagentTranscriptPath,
} from "./subagentLifecycleHooks";
import type { SubagentRunSummary } from "../../shared/types";

describe("subagent lifecycle hooks", () => {
  it("records durable start transcript refs", () => {
    const run = subagentRun({ status: "reserved" });

    expect(subagentLifecycleEventType("SubagentStart")).toBe("subagent.lifecycle_started");
    expect(subagentLifecycleHookPreview({
      hook: "SubagentStart",
      run,
      createdAt: "2026-06-05T00:00:00.000Z",
    })).toMatchObject({
      schemaVersion: SUBAGENT_LIFECYCLE_HOOK_SCHEMA_VERSION,
      hook: "SubagentStart",
      runId: "child-run",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      status: "reserved",
      parentTranscriptPath: "ambient://threads/parent-thread/transcript",
      childTranscriptPath: "ambient://threads/child-thread/transcript",
    });
  });

  it("records stop artifact pointers and final status without copying result content", () => {
    const run = subagentRun({
      status: "completed",
      completedAt: "2026-06-05T00:01:00.000Z",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "child-run",
        childThreadId: "child-thread",
        status: "completed",
        partial: false,
        summary: "Done.",
        artifactPath: "/workspace/.ambient/subagents/child-run/result.json",
        fullOutputPath: "/workspace/.ambient/subagents/child-run/full.txt",
        structuredOutputPath: "/workspace/.ambient/subagents/child-run/structured.json",
        structuredOutput: {
          status: "complete",
          details: "Do not copy structured child output into lifecycle previews.",
        },
        provenanceHash: "hash-1",
      },
    });

    expect(subagentLifecycleEventType("SubagentStop")).toBe("subagent.lifecycle_stopped");
    const preview = subagentLifecycleHookPreview({
      hook: "SubagentStop",
      run,
      createdAt: "2026-06-05T00:01:00.000Z",
    });
    expect(preview).toMatchObject({
      hook: "SubagentStop",
      status: "completed",
      finalStatus: "completed",
      artifactPointers: {
        artifactPath: "/workspace/.ambient/subagents/child-run/result.json",
        fullOutputPath: "/workspace/.ambient/subagents/child-run/full.txt",
        structuredOutputPath: "/workspace/.ambient/subagents/child-run/structured.json",
        provenanceHash: "hash-1",
        status: "completed",
        partial: false,
      },
    });
    expect(preview.artifactPointers).not.toHaveProperty("summary");
    expect(preview.artifactPointers).not.toHaveProperty("structuredOutput");
  });

  it("records close time without deleting transcript refs", () => {
    const run = subagentRun({ status: "completed", closedAt: "2026-06-05T00:02:00.000Z" });

    expect(subagentLifecycleEventType("SubagentClose")).toBe("subagent.lifecycle_closed");
    expect(subagentLifecycleHookPreview({
      hook: "SubagentClose",
      run,
      createdAt: "2026-06-05T00:02:00.000Z",
    })).toMatchObject({
      hook: "SubagentClose",
      closedAt: "2026-06-05T00:02:00.000Z",
      parentTranscriptPath: subagentTranscriptPath("parent-thread"),
      childTranscriptPath: subagentTranscriptPath("child-thread"),
    });
  });
});

function subagentRun(overrides: Partial<SubagentRunSummary>): SubagentRunSummary {
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "reserved",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-05T00:00:00.000Z"),
    capacityLeaseSnapshot: {
      schemaVersion: "ambient-subagent-capacity-lease-v1",
      leaseId: "lease-1",
      status: "reserved",
      resolvedAt: "2026-06-05T00:00:00.000Z",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunId: "child-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      depth: {
        depth: 1,
        maxDepth: 1,
        allowed: true,
        reason: "Within depth limit.",
      },
      provider: {
        providerId: "ambient",
        modelId: AMBIENT_DEFAULT_MODEL,
        locality: "cloud",
        profile: subagentCapacityProviderProfileSnapshot(resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL)),
        openRunCount: 0,
        projectedOpenRunCount: 1,
        concurrencyLimit: 2,
        allowed: true,
        reason: "Within provider concurrency limit.",
      },
      localMemory: {
        outcome: "not_applicable",
        allowed: true,
        reason: "Cloud model does not reserve local memory.",
      },
      blockingReasons: [],
    },
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}
