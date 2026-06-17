import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  ThreadWorktreeSummary,
} from "../../shared/types";
import type { SubagentChildRuntimeLaunchPreflightResult } from "../pi/piChildSessionAdapter";
import type { SubagentModelScopeResolution } from "../model-provider/modelScopeResolver";
import {
  compactSubagentCapacityLeaseForPi,
  compactSubagentRunForPi,
} from "./subagentAgentStatus";
import {
  compactSubagentModelScopeForPi,
  compactSubagentParentMailboxForPi,
  compactSubagentRuntimeLaunchPreflightForPi,
  compactSubagentThreadWorktreeForPi,
  previewSubagentSpawnText,
} from "./subagentSpawnFailure";

export const SUBAGENT_PI_TOOL_RESULT_SCHEMA_VERSION =
  "ambient-subagent-pi-tool-result-v1" as const;

export function subagentPiToolResult(
  text: string,
  details: Record<string, unknown>,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export function previewSubagentPiToolText(text: string, limit = 240): string {
  return previewSubagentSpawnText(text, limit);
}

export function compactSubagentPiToolThreadWorktree(worktree: ThreadWorktreeSummary): Record<string, unknown> {
  return compactSubagentThreadWorktreeForPi(worktree);
}

export function compactSubagentPiToolCapacityLease(lease: SubagentCapacityLeaseSnapshot): Record<string, unknown> {
  return compactSubagentCapacityLeaseForPi(lease);
}

export function compactSubagentPiToolRuntimeLaunchPreflight(
  preflight: SubagentChildRuntimeLaunchPreflightResult,
): Record<string, unknown> {
  return compactSubagentRuntimeLaunchPreflightForPi(preflight);
}

export function compactSubagentPiToolRun(run: SubagentRunSummary): Record<string, unknown> {
  return compactSubagentRunForPi(run);
}

export function compactSubagentPiToolModelScope(scope: SubagentModelScopeResolution): Record<string, unknown> {
  return compactSubagentModelScopeForPi(scope);
}

export function compactSubagentPiToolRunEvent(event: SubagentRunEventSummary): Record<string, unknown> {
  return {
    sequence: event.sequence,
    type: event.type,
    createdAt: event.createdAt,
    ...(event.preview !== undefined ? { preview: event.preview } : {}),
    ...(event.artifactPath ? { artifactPath: event.artifactPath } : {}),
  };
}

export function compactSubagentPiToolMailboxEvent(event: SubagentMailboxEventSummary): Record<string, unknown> {
  return {
    id: event.id,
    runId: event.runId,
    direction: event.direction,
    type: event.type,
    deliveryState: event.deliveryState,
    createdAt: event.createdAt,
    ...(event.deliveredAt ? { deliveredAt: event.deliveredAt } : {}),
  };
}

export function compactSubagentPiToolParentMailboxEvent(event: SubagentParentMailboxEventSummary): Record<string, unknown> {
  return compactSubagentParentMailboxForPi(event);
}
