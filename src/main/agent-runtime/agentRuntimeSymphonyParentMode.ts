import {
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import {
  symphonyPatternPreflightSnapshot,
  symphonyWorkflowLaunchStateSnapshot,
  SYMPHONY_MODE_STATE_SCHEMA_VERSION,
  type SymphonyModeStateSnapshot,
  type SymphonyModeToggleState,
  type SymphonyParentModePolicyStateSnapshot,
} from "../../shared/symphonyModeState";
import type { SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { SendMessageInput, SendMessageComposerIntent } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { callableWorkflowToolName } from "./agentRuntimeCallableWorkflowFacade";

export const SYMPHONY_PARENT_MODE_ACTIVE_RUN_HANDOFF_ERROR =
  "Wait for the current Ambient run to finish before launching Symphony. Symphony parent mode cannot be steered into an unrestricted active session.";
export const SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR =
  "Symphony parent mode did not queue a callable workflow task for this run. Retry, re-scope, or exit Symphony mode instead of answering from the parent.";
export const SYMPHONY_PARENT_MODE_RECOVERY_ACTIONS = [
  {
    id: "retry_launch",
    label: "Retry launch",
    description: "Ask Ambient to try the same Symphony workflow launch again from the retained request.",
  },
  {
    id: "choose_another_pattern",
    label: "Choose another pattern",
    description: "Return to the Symphony pattern picker and select a better orchestration shape.",
  },
  {
    id: "clarify_scope",
    label: "Clarify scope",
    description: "Add missing inputs, evidence requirements, or blocking policy before launching.",
  },
  {
    id: "cancel_symphony",
    label: "Cancel Symphony",
    description: "Stop this orchestration attempt without letting the parent substitute worker output.",
  },
  {
    id: "exit_symphony_mode",
    label: "Exit Symphony mode",
    description: "Turn off conductor lock so the next user-approved turn can run as an ordinary parent thread.",
  },
] as const;

export interface SymphonyParentModePolicy {
  enabled: true;
  reason: "symphony-composer-run-once" | "symphony-slash-command";
  launchRequirement: "required_this_turn" | "preflight_may_ask";
  directExecutionPolicy: "deny_substantive_tools";
  expectedWorkflowToolName: string;
  expectedWorkflowSourceKind: "symphony_recipe";
  expectedPatternId: string;
}

export interface SymphonyParentModeVerifiedLaunch {
  parentThreadId: string;
  parentRunId: string;
  taskId: string;
  toolName: string;
  sourceKind: string;
}

export type SymphonyParentModeLaunchValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function isSymphonyParentModeMissingWorkflowTaskError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR;
}

export type SymphonyParentModeRuntimeSendInput<T extends SendMessageInput = SendMessageInput> = T & {
  symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
  symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined;
};

export function buildSymphonyModeStateSnapshot(input: {
  thread: Pick<ThreadSummary, "kind">;
  composerIntent?: SendMessageComposerIntent | undefined;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  policy?: SymphonyParentModePolicy | undefined;
  verifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined;
  toggleState?: SymphonyModeToggleState | undefined;
}): SymphonyModeStateSnapshot {
  const composerIntentKind = input.composerIntent?.kind;
  const explicitToggleState = input.toggleState;
  const selectedPatternId = selectedPatternIdForComposerIntent(input.composerIntent);
  const selectedPatternSource = composerIntentKind === "slash-command" ? "slash_command" : "composer_intent";
  if (input.thread.kind === "subagent_child") {
    return {
      schemaVersion: SYMPHONY_MODE_STATE_SCHEMA_VERSION,
      kind: "unavailable",
      reason: "subagent_child_thread",
      toggleState: explicitToggleState === "on" ? "unknown" : explicitToggleState ?? "unknown",
      featureFlagSnapshot: input.featureFlagSnapshot,
      ...(composerIntentKind ? { composerIntentKind } : {}),
      patternPreflight: symphonyPatternPreflightSnapshot({
        state: "not_required",
        source: "none",
      }),
      launch: symphonyWorkflowLaunchStateSnapshot({
        state: "not_required",
      }),
    };
  }
  if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) {
    return {
      schemaVersion: SYMPHONY_MODE_STATE_SCHEMA_VERSION,
      kind: "unavailable",
      reason: "ambient_subagents_disabled",
      toggleState: explicitToggleState === "on" ? "unknown" : explicitToggleState ?? "off",
      featureFlagSnapshot: input.featureFlagSnapshot,
      ...(composerIntentKind ? { composerIntentKind } : {}),
      patternPreflight: selectedPatternId
        ? symphonyPatternPreflightSnapshot({
          state: "selected",
          source: selectedPatternSource,
          selectedPatternId,
        })
        : symphonyPatternPreflightSnapshot({
          state: "not_required",
          source: "none",
        }),
      launch: symphonyWorkflowLaunchStateSnapshot({
        state: "not_required",
      }),
    };
  }
  const policy = input.policy ?? resolveSymphonyParentModePolicy({
    thread: input.thread,
    composerIntent: input.composerIntent,
    featureFlagSnapshot: input.featureFlagSnapshot,
  });
  if (policy) {
    return {
      schemaVersion: SYMPHONY_MODE_STATE_SCHEMA_VERSION,
      kind: "symphony_parent",
      reason: policy.reason,
      toggleState: "on",
      featureFlagSnapshot: input.featureFlagSnapshot,
      ...(composerIntentKind ? { composerIntentKind } : {}),
      patternPreflight: symphonyPatternPreflightSnapshot({
        state: "selected",
        source: policy.reason === "symphony-slash-command" ? "slash_command" : "composer_intent",
        selectedPatternId: policy.expectedPatternId as SymphonyWorkflowPatternId,
      }),
      launch: input.verifiedLaunch
        ? symphonyWorkflowLaunchStateSnapshot({
          state: "verified",
          expectedWorkflowToolName: policy.expectedWorkflowToolName,
          expectedWorkflowSourceKind: policy.expectedWorkflowSourceKind,
          taskId: input.verifiedLaunch.taskId,
          parentThreadId: input.verifiedLaunch.parentThreadId,
          parentRunId: input.verifiedLaunch.parentRunId,
        })
        : symphonyWorkflowLaunchStateSnapshot({
          state: policy.launchRequirement === "required_this_turn" ? "required_pending" : "preflight_may_ask",
          expectedWorkflowToolName: policy.expectedWorkflowToolName,
          expectedWorkflowSourceKind: policy.expectedWorkflowSourceKind,
        }),
      parentModePolicy: symphonyParentModePolicyStateSnapshot(policy),
    };
  }
  if (input.composerIntent?.kind === "symphony-workflow") {
    return {
      schemaVersion: SYMPHONY_MODE_STATE_SCHEMA_VERSION,
      kind: "symphony_armed",
      reason: input.composerIntent.action === "save-recipe" ? "symphony_save_recipe" : "symphony_preflight_pending",
      toggleState: "on",
      featureFlagSnapshot: input.featureFlagSnapshot,
      composerIntentKind,
      patternPreflight: symphonyPatternPreflightSnapshot({
        state: selectedPatternId ? "selected" : "pending_detection",
        source: "composer_intent",
        ...(selectedPatternId ? { selectedPatternId } : {}),
      }),
      launch: symphonyWorkflowLaunchStateSnapshot({
        state: "not_required",
      }),
    };
  }
  if (explicitToggleState === "on") {
    return {
      schemaVersion: SYMPHONY_MODE_STATE_SCHEMA_VERSION,
      kind: "symphony_armed",
      reason: "symphony_preflight_pending",
      toggleState: "on",
      featureFlagSnapshot: input.featureFlagSnapshot,
      ...(composerIntentKind ? { composerIntentKind } : {}),
      patternPreflight: symphonyPatternPreflightSnapshot({
        state: "pending_detection",
        source: "symphony_toggle",
      }),
      launch: symphonyWorkflowLaunchStateSnapshot({
        state: "not_required",
      }),
    };
  }
  return {
    schemaVersion: SYMPHONY_MODE_STATE_SCHEMA_VERSION,
    kind: "generic_subagents",
    reason: composerIntentKind ? "non_symphony_intent" : "no_symphony_intent",
    toggleState: explicitToggleState ?? "off",
    featureFlagSnapshot: input.featureFlagSnapshot,
    ...(composerIntentKind ? { composerIntentKind } : {}),
    patternPreflight: symphonyPatternPreflightSnapshot({
      state: "not_required",
      source: "none",
    }),
    launch: symphonyWorkflowLaunchStateSnapshot({
      state: "not_required",
    }),
  };
}

function selectedPatternIdForComposerIntent(
  composerIntent?: SendMessageComposerIntent | undefined,
): SymphonyWorkflowPatternId | undefined {
  if (composerIntent?.kind === "symphony-workflow") return composerIntent.patternId;
  if (
    composerIntent?.kind === "slash-command" &&
    composerIntent.selection.sourceKind === "symphony" &&
    typeof composerIntent.selection.sourceId === "string"
  ) {
    return composerIntent.selection.sourceId as SymphonyWorkflowPatternId;
  }
  return undefined;
}

function symphonyParentModePolicyStateSnapshot(
  policy: SymphonyParentModePolicy,
): SymphonyParentModePolicyStateSnapshot {
  return {
    enabled: true,
    reason: policy.reason,
    launchRequirement: policy.launchRequirement,
    directExecutionPolicy: policy.directExecutionPolicy,
    expectedWorkflowToolName: policy.expectedWorkflowToolName,
    expectedWorkflowSourceKind: policy.expectedWorkflowSourceKind,
    expectedPatternId: policy.expectedPatternId,
  };
}

export function resolveSymphonyParentModePolicy(input: {
  thread: Pick<ThreadSummary, "kind">;
  composerIntent?: SendMessageComposerIntent | undefined;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
}): SymphonyParentModePolicy | undefined {
  if (input.thread.kind === "subagent_child") return undefined;
  if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) return undefined;
  const intent = input.composerIntent;
  if (!intent) return undefined;
  if (intent.kind === "symphony-workflow") {
    return intent.action === "run-once"
      ? {
        enabled: true,
        reason: "symphony-composer-run-once",
        launchRequirement: "required_this_turn",
        directExecutionPolicy: "deny_substantive_tools",
        expectedWorkflowToolName: callableWorkflowToolName(intent.patternId),
        expectedWorkflowSourceKind: "symphony_recipe",
        expectedPatternId: intent.patternId,
      }
      : undefined;
  }
  if (
    intent.kind === "slash-command" &&
    intent.selection.sourceKind === "symphony" &&
    (
      intent.selection.invocationKind === "symphony-recipe" ||
      intent.selection.invocationKind === "callable-workflow"
    )
  ) {
    if (!intent.selection.sourceId) return undefined;
    const expectedPatternId = intent.selection.sourceId as SymphonyWorkflowPatternId;
    return {
      enabled: true,
      reason: "symphony-slash-command",
      launchRequirement: "preflight_may_ask",
      directExecutionPolicy: "deny_substantive_tools",
      expectedWorkflowToolName: callableWorkflowToolName(expectedPatternId),
      expectedWorkflowSourceKind: "symphony_recipe",
      expectedPatternId,
    };
  }
  return undefined;
}

export function resolveSymphonyParentModePolicyForRuntimeSend(input: {
  thread: Pick<ThreadSummary, "kind">;
  composerIntent?: SendMessageComposerIntent | undefined;
  carriedPolicy?: SymphonyParentModePolicy | undefined;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
}): SymphonyParentModePolicy | undefined {
  if (input.thread.kind === "subagent_child") return undefined;
  if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) return undefined;
  return input.carriedPolicy ?? resolveSymphonyParentModePolicy({
    thread: input.thread,
    composerIntent: input.composerIntent,
    featureFlagSnapshot: input.featureFlagSnapshot,
  });
}

export function carrySymphonyParentModePolicy<T extends SendMessageInput>(
  input: T,
  policy?: SymphonyParentModePolicy | undefined,
): SymphonyParentModeRuntimeSendInput<T> {
  if (!policy) return input as SymphonyParentModeRuntimeSendInput<T>;
  return {
    ...input,
    symphonyParentModePolicy: policy,
  };
}

export function carrySymphonyParentModeVerifiedLaunch<T extends SendMessageInput>(
  input: T,
  verifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
): SymphonyParentModeRuntimeSendInput<T>;
export function carrySymphonyParentModeVerifiedLaunch(
  input: undefined,
  verifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
): undefined;
export function carrySymphonyParentModeVerifiedLaunch<T extends SendMessageInput>(
  input: T | undefined,
  verifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
): SymphonyParentModeRuntimeSendInput<T> | undefined;
export function carrySymphonyParentModeVerifiedLaunch<T extends SendMessageInput>(
  input: T | undefined,
  verifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
): SymphonyParentModeRuntimeSendInput<T> | undefined {
  if (!input) return undefined;
  if (!verifiedLaunch) return input as SymphonyParentModeRuntimeSendInput<T>;
  return {
    ...input,
    symphonyParentModeVerifiedLaunch: verifiedLaunch,
  };
}

export function shouldRejectSymphonyParentModeActiveRunHandoff(input: {
  activeRunPresent: boolean;
  policy?: SymphonyParentModePolicy | undefined;
}): boolean {
  return input.activeRunPresent && Boolean(input.policy);
}

export function activeToolNamesForSymphonyParentMode(input: {
  activeToolNames: readonly string[];
  policy?: SymphonyParentModePolicy | undefined;
  conductorToolNames: readonly string[];
}): string[] {
  if (!input.policy) return [...input.activeToolNames];
  const conductorToolNames = new Set(input.conductorToolNames);
  return dedupeToolNames(input.activeToolNames.filter((toolName) => conductorToolNames.has(toolName)));
}

export function shouldRequireSymphonyParentModeLaunch(input: {
  policy?: SymphonyParentModePolicy | undefined;
}): boolean {
  return input.policy?.launchRequirement === "required_this_turn";
}

export function validateSymphonyParentModeCallableWorkflowPrelaunch(input: {
  policy?: SymphonyParentModePolicy | undefined;
  launchVerified?: boolean | undefined;
  request: {
    parentThreadId: string;
    parentRunId: string;
    toolName: string;
    sourceKind: string;
  };
  existingTasks: readonly Pick<
    CallableWorkflowTaskSummary,
    "id" | "parentThreadId" | "parentRunId" | "toolName" | "sourceKind"
  >[];
}): SymphonyParentModeLaunchValidationResult {
  const policy = input.policy;
  if (!policy) return { allowed: true };
  const expected = `${policy.expectedWorkflowToolName} (${policy.expectedWorkflowSourceKind})`;
  const received = `${input.request.toolName} (${input.request.sourceKind})`;
  if (input.launchVerified) {
    return {
      allowed: false,
      reason: `Symphony parent mode already verified a workflow launch for this run; refusing another launch of ${received}.`,
    };
  }
  if (input.request.toolName !== policy.expectedWorkflowToolName ||
    input.request.sourceKind !== policy.expectedWorkflowSourceKind) {
    return {
      allowed: false,
      reason: `Symphony parent mode expected ${expected} and refused ${received}.`,
    };
  }
  const currentRunTasks = input.existingTasks.filter((task) =>
    task.parentThreadId === input.request.parentThreadId &&
    task.parentRunId === input.request.parentRunId
  );
  if (currentRunTasks.length > 0) {
    return {
      allowed: false,
      reason: `Symphony parent mode already has ${currentRunTasks.length} callable workflow task(s) for this parent run.`,
    };
  }
  return { allowed: true };
}

export function resolveSymphonyParentModeVerifiedLaunch(input: {
  policy?: SymphonyParentModePolicy | undefined;
  carriedLaunch?: SymphonyParentModeVerifiedLaunch | undefined;
  parentThreadId: string;
  parentRunId: string;
  tasks: readonly Pick<
    CallableWorkflowTaskSummary,
    "id" | "parentThreadId" | "parentRunId" | "toolName" | "sourceKind"
  >[];
}): SymphonyParentModeVerifiedLaunch | undefined {
  const policy = input.policy;
  if (!policy) return undefined;
  const currentRunTasks = input.tasks.filter((task) =>
    task.parentThreadId === input.parentThreadId &&
    task.parentRunId === input.parentRunId
  );
  const matches = currentRunTasks.filter((task) =>
    task.toolName === policy.expectedWorkflowToolName &&
    task.sourceKind === policy.expectedWorkflowSourceKind
  );
  if (input.carriedLaunch) {
    if (currentRunTasks.length > 0) return undefined;
    return input.carriedLaunch.parentThreadId === input.parentThreadId &&
      input.carriedLaunch.toolName === policy.expectedWorkflowToolName &&
      input.carriedLaunch.sourceKind === policy.expectedWorkflowSourceKind
      ? input.carriedLaunch
      : undefined;
  }
  if (matches.length !== 1 || currentRunTasks.length !== 1) return undefined;
  const [task] = matches;
  return {
    parentThreadId: task.parentThreadId,
    parentRunId: task.parentRunId,
    taskId: task.id,
    toolName: task.toolName,
    sourceKind: task.sourceKind,
  };
}

export function shouldRebuildSessionForSymphonyParentMode(input: {
  cachedSymphonyParentMode?: boolean | undefined;
  nextPolicy?: SymphonyParentModePolicy | undefined;
  cachedPolicyKey?: string | undefined;
  cachedLaunchVerified?: boolean | undefined;
  nextLaunchVerified?: boolean | undefined;
}): boolean {
  return Boolean(input.cachedSymphonyParentMode) !== Boolean(input.nextPolicy) ||
    (input.cachedPolicyKey ?? "") !== (input.nextPolicy?.expectedWorkflowToolName ?? "") ||
    Boolean(input.cachedLaunchVerified) !== Boolean(input.nextLaunchVerified);
}

function dedupeToolNames(toolNames: readonly string[]): string[] {
  return [...new Set(toolNames)];
}
