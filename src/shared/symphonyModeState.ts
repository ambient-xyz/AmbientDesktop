import type { AmbientFeatureFlagSnapshot } from "./featureFlags";
import type { SymphonyWorkflowPatternId } from "./symphonyWorkflowRecipes";

export const SYMPHONY_MODE_STATE_SCHEMA_VERSION = "ambient-symphony-mode-state-v1" as const;
export const SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION = "ambient-symphony-pattern-preflight-v1" as const;
export const SYMPHONY_WORKFLOW_LAUNCH_STATE_SCHEMA_VERSION = "ambient-symphony-workflow-launch-state-v1" as const;

export type SymphonyModeToggleState = "off" | "on" | "unknown";
export type SymphonyModeStateKind =
  | "unavailable"
  | "generic_subagents"
  | "symphony_armed"
  | "symphony_parent";
export type SymphonyModeUnavailableReason =
  | "ambient_subagents_disabled"
  | "subagent_child_thread";
export type SymphonyModeGenericReason =
  | "no_symphony_intent"
  | "non_symphony_intent";
export type SymphonyModeArmedReason =
  | "symphony_save_recipe"
  | "symphony_preflight_pending";
export type SymphonyModeParentReason =
  | "symphony-composer-run-once"
  | "symphony-slash-command";
export type SymphonyPatternPreflightState =
  | "not_required"
  | "pending_detection"
  | "needs_clarification"
  | "selected";
export type SymphonyPatternPreflightSource =
  | "none"
  | "symphony_toggle"
  | "composer_intent"
  | "slash_command";
export type SymphonyWorkflowLaunchState =
  | "not_required"
  | "required_pending"
  | "preflight_may_ask"
  | "verified";

export interface SymphonyPatternPreflightSnapshot {
  schemaVersion: typeof SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION;
  state: SymphonyPatternPreflightState;
  source: SymphonyPatternPreflightSource;
  selectedPatternId?: SymphonyWorkflowPatternId;
  pendingQuestionId?: string;
  candidatePatternIds?: SymphonyWorkflowPatternId[];
}

export interface SymphonyWorkflowLaunchStateSnapshot {
  schemaVersion: typeof SYMPHONY_WORKFLOW_LAUNCH_STATE_SCHEMA_VERSION;
  state: SymphonyWorkflowLaunchState;
  expectedWorkflowToolName?: string;
  expectedWorkflowSourceKind?: "symphony_recipe";
  taskId?: string;
  parentThreadId?: string;
  parentRunId?: string;
}

interface SymphonyModeStateSnapshotBase {
  schemaVersion: typeof SYMPHONY_MODE_STATE_SCHEMA_VERSION;
  kind: SymphonyModeStateKind;
  toggleState: SymphonyModeToggleState;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  composerIntentKind?: string;
  patternPreflight: SymphonyPatternPreflightSnapshot;
  launch: SymphonyWorkflowLaunchStateSnapshot;
}

export interface SymphonyUnavailableModeStateSnapshot extends SymphonyModeStateSnapshotBase {
  kind: "unavailable";
  reason: SymphonyModeUnavailableReason;
  toggleState: "off" | "unknown";
}

export interface SymphonyGenericSubagentsModeStateSnapshot extends SymphonyModeStateSnapshotBase {
  kind: "generic_subagents";
  reason: SymphonyModeGenericReason;
  toggleState: "off" | "unknown";
}

export interface SymphonyArmedModeStateSnapshot extends SymphonyModeStateSnapshotBase {
  kind: "symphony_armed";
  reason: SymphonyModeArmedReason;
  toggleState: "on";
}

export interface SymphonyParentModePolicyStateSnapshot {
  enabled: true;
  reason: SymphonyModeParentReason;
  launchRequirement: "required_this_turn" | "preflight_may_ask";
  directExecutionPolicy: "deny_substantive_tools";
  expectedWorkflowToolName: string;
  expectedWorkflowSourceKind: "symphony_recipe";
  expectedPatternId: string;
}

export interface SymphonyParentModeStateSnapshot extends SymphonyModeStateSnapshotBase {
  kind: "symphony_parent";
  reason: SymphonyModeParentReason;
  toggleState: "on";
  parentModePolicy: SymphonyParentModePolicyStateSnapshot;
}

export type SymphonyModeStateSnapshot =
  | SymphonyUnavailableModeStateSnapshot
  | SymphonyGenericSubagentsModeStateSnapshot
  | SymphonyArmedModeStateSnapshot
  | SymphonyParentModeStateSnapshot;

export function symphonyPatternPreflightSnapshot(
  input: Omit<SymphonyPatternPreflightSnapshot, "schemaVersion">,
): SymphonyPatternPreflightSnapshot {
  return {
    schemaVersion: SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION,
    ...input,
  };
}

export function symphonyWorkflowLaunchStateSnapshot(
  input: Omit<SymphonyWorkflowLaunchStateSnapshot, "schemaVersion">,
): SymphonyWorkflowLaunchStateSnapshot {
  return {
    schemaVersion: SYMPHONY_WORKFLOW_LAUNCH_STATE_SCHEMA_VERSION,
    ...input,
  };
}
