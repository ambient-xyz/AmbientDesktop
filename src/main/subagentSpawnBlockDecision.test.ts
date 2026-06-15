import { describe, expect, it } from "vitest";

import { AMBIENT_DEFAULT_MODEL, resolveAmbientModelRuntimeProfile } from "../shared/ambientModels";
import {
  subagentCapacityProviderProfileSnapshot,
  type SubagentCapacityLeaseSnapshot,
} from "../shared/subagentCapacity";
import type { SubagentToolScopeSnapshotSummary } from "../shared/types";
import type { SubagentToolScopeLaunchDenial } from "./subagentToolScopeLaunchPolicy";
import {
  resolveSubagentSpawnBlockDecision,
  SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION,
} from "./subagentSpawnBlockDecision";

describe("subagentSpawnBlockDecision", () => {
  it("gives capacity blocks precedence over tool-scope denials after reservation", () => {
    const decision = resolveSubagentSpawnBlockDecision({
      capacityLease: capacityLease("blocked", ["Provider gmi-cloud would exceed its sub-agent concurrency limit."]),
      launchDenial: launchDenial("requested_scope_denied", "Requested tool scope was denied."),
      toolScopeSnapshot: toolScopeSnapshot(),
    });

    expect(SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION).toBe("ambient-subagent-spawn-block-decision-v1");
    expect(decision).toEqual({
      schemaVersion: "ambient-subagent-spawn-block-decision-v1",
      blocked: true,
      failureStage: "capacity",
      reason: "Provider gmi-cloud would exceed its sub-agent concurrency limit.",
      approvalUnavailable: false,
      capacityBlocked: true,
      toolScopeBlocked: false,
      capacityBlockingReasons: ["Provider gmi-cloud would exceed its sub-agent concurrency limit."],
    });
  });

  it("uses the capacity fallback reason when a blocked lease has no specific blockers", () => {
    expect(resolveSubagentSpawnBlockDecision({
      capacityLease: capacityLease("blocked", []),
      toolScopeSnapshot: toolScopeSnapshot(),
    })).toMatchObject({
      blocked: true,
      failureStage: "capacity",
      reason: "Sub-agent capacity was unavailable.",
      capacityBlockingReasons: [],
    });
  });

  it("turns launch denials into tool-scope blocks with approval-unavailable metadata", () => {
    const decision = resolveSubagentSpawnBlockDecision({
      capacityLease: capacityLease("reserved", []),
      launchDenial: launchDenial(
        "requested_scope_denied",
        "Requested sub-agent tool scope was denied: connector.read requires approval.",
      ),
      toolScopeSnapshot: toolScopeSnapshot({
        approvalMode: "non_interactive",
        deniedCategories: [
          { id: "connector.read", reason: "Capability requires interactive approval, but this launch is non-interactive." },
        ],
        deniedTools: [
          {
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: "Capability requires interactive approval, but this launch is non-interactive.",
          },
        ],
      }),
    });

    expect(decision).toEqual({
      schemaVersion: "ambient-subagent-spawn-block-decision-v1",
      blocked: true,
      failureStage: "tool_scope",
      reason: "Requested sub-agent tool scope was denied: connector.read requires approval.",
      approvalUnavailable: true,
      capacityBlocked: false,
      toolScopeBlocked: true,
      capacityBlockingReasons: [],
      launchDenialKind: "requested_scope_denied",
    });
  });

  it("allows launch when capacity is reserved and no launch denial is present", () => {
    expect(resolveSubagentSpawnBlockDecision({
      capacityLease: capacityLease("reserved", []),
      toolScopeSnapshot: toolScopeSnapshot(),
    })).toEqual({
      schemaVersion: "ambient-subagent-spawn-block-decision-v1",
      blocked: false,
      approvalUnavailable: false,
      capacityBlocked: false,
      toolScopeBlocked: false,
      capacityBlockingReasons: [],
    });
  });
});

function launchDenial(kind: SubagentToolScopeLaunchDenial["kind"], reason: string): SubagentToolScopeLaunchDenial {
  return {
    schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
    kind,
    reason,
    explicitToolRequest: true,
    deniedCategoryIds: ["connector.read"],
    deniedToolIds: ["connector_app:gmail.search"],
  };
}

function capacityLease(
  status: SubagentCapacityLeaseSnapshot["status"],
  blockingReasons: string[],
): SubagentCapacityLeaseSnapshot {
  return {
    schemaVersion: "ambient-subagent-capacity-lease-v1",
    leaseId: "lease-1",
    status,
    resolvedAt: "2026-06-06T00:00:00.000Z",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    depth: {
      depth: 1,
      maxDepth: 1,
      allowed: true,
      reason: "Sub-agent depth is within limit.",
    },
    provider: {
      providerId: "ambient",
      modelId: AMBIENT_DEFAULT_MODEL,
      locality: "cloud",
      profile: subagentCapacityProviderProfileSnapshot(resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL)),
      openRunCount: 0,
      projectedOpenRunCount: 1,
      allowed: status !== "blocked",
      reason: status === "blocked" ? "Provider capacity blocked." : "Provider capacity available.",
    },
    localMemory: {
      outcome: "not_applicable",
      allowed: true,
      reason: "Cloud model does not consume local runtime memory.",
    },
    blockingReasons,
  };
}

function toolScopeSnapshot(
  scopeOverrides: Partial<SubagentToolScopeSnapshotSummary["scope"]> = {},
): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence: 1,
    createdAt: "2026-06-06T00:00:00.000Z",
    resolverInputs: {
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
    },
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["workspace.read"],
      piVisibleCategories: ["workspace.read"],
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
      ...scopeOverrides,
    },
  };
}
