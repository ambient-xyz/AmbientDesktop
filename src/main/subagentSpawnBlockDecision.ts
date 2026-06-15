import type { SubagentCapacityLeaseSnapshot } from "../shared/subagentCapacity";
import type { SubagentToolScopeSnapshotSummary } from "../shared/types";
import type { SubagentSpawnFailureStage } from "./subagentSpawnFailure";
import {
  subagentToolScopeApprovalUnavailable,
} from "./subagentToolScopeSnapshot";
import type {
  SubagentToolScopeLaunchDenial,
  SubagentToolScopeLaunchDenialKind,
} from "./subagentToolScopeLaunchPolicy";

export const SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION = "ambient-subagent-spawn-block-decision-v1" as const;

export type SubagentSpawnBlockFailureStage = Extract<SubagentSpawnFailureStage, "capacity" | "tool_scope">;

interface SubagentSpawnBlockDecisionBase {
  schemaVersion: typeof SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION;
  approvalUnavailable: boolean;
  capacityBlocked: boolean;
  toolScopeBlocked: boolean;
  capacityBlockingReasons: string[];
}

export interface SubagentSpawnBlockedDecision extends SubagentSpawnBlockDecisionBase {
  blocked: true;
  failureStage: SubagentSpawnBlockFailureStage;
  reason: string;
  launchDenialKind?: SubagentToolScopeLaunchDenialKind;
}

export interface SubagentSpawnUnblockedDecision extends SubagentSpawnBlockDecisionBase {
  blocked: false;
}

export type SubagentSpawnBlockDecision =
  | SubagentSpawnBlockedDecision
  | SubagentSpawnUnblockedDecision;

export function resolveSubagentSpawnBlockDecision(input: {
  capacityLease: SubagentCapacityLeaseSnapshot;
  launchDenial?: SubagentToolScopeLaunchDenial;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
}): SubagentSpawnBlockDecision {
  const approvalUnavailable = subagentToolScopeApprovalUnavailable(input.toolScopeSnapshot);
  const capacityBlockingReasons = [...input.capacityLease.blockingReasons];
  if (input.capacityLease.status === "blocked") {
    return {
      schemaVersion: SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION,
      blocked: true,
      failureStage: "capacity",
      reason: capacityBlockingReasons.join("; ") || "Sub-agent capacity was unavailable.",
      approvalUnavailable,
      capacityBlocked: true,
      toolScopeBlocked: false,
      capacityBlockingReasons,
    };
  }
  if (input.launchDenial) {
    return {
      schemaVersion: SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION,
      blocked: true,
      failureStage: "tool_scope",
      reason: input.launchDenial.reason,
      approvalUnavailable,
      capacityBlocked: false,
      toolScopeBlocked: true,
      capacityBlockingReasons,
      launchDenialKind: input.launchDenial.kind,
    };
  }
  return {
    schemaVersion: SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION,
    blocked: false,
    approvalUnavailable,
    capacityBlocked: false,
    toolScopeBlocked: false,
    capacityBlockingReasons,
  };
}
