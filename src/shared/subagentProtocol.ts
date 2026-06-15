import type {
  AmbientFeatureFlagSnapshot,
} from "./featureFlags";
import type {
  AmbientModelRuntimeSnapshot,
} from "./ambientModels";

export const AMBIENT_SUBAGENT_PROTOCOL_VERSION = "ambient-subagent-v1" as const;

export type AmbientSubagentProtocolVersion = typeof AMBIENT_SUBAGENT_PROTOCOL_VERSION;

export type SubagentRunStatus =
  | "reserved"
  | "starting"
  | "running"
  | "waiting"
  | "needs_attention"
  | "completed"
  | "failed"
  | "stopped"
  | "cancelled"
  | "timed_out"
  | "detached"
  | "aborted_partial";

export type SubagentDependencyMode = "required" | "optional_background" | "supervisor_attention";

export type SubagentWaitBarrierMode = "required_all" | "required_any" | "quorum" | "optional_background";

export type SubagentWaitBarrierStatus =
  | "waiting_on_children"
  | "satisfied"
  | "failed"
  | "timed_out"
  | "cancelled";

export type SubagentWaitBarrierFailurePolicy = "fail_parent" | "ask_user" | "degrade_partial" | "retry_child";

export type SubagentPromptMode = "append" | "replace" | "fresh";

export type SubagentForkMode = "full_history" | "recent_turns" | "no_history";

export interface SubagentCanonicalTaskPath {
  parentThreadId: string;
  parentRunId: string;
  childThreadId: string;
  childRunId: string;
  path: string;
  depth: number;
}

export interface SubagentRunIdentity {
  protocolVersion: AmbientSubagentProtocolVersion;
  parentThreadId: string;
  parentRunId: string;
  childThreadId: string;
  childRunId: string;
  canonicalPath: string;
  featureFlags: AmbientFeatureFlagSnapshot;
  modelRuntime: AmbientModelRuntimeSnapshot;
}

export interface SubagentResultArtifact {
  schemaVersion: "ambient-subagent-result-artifact-v1";
  runId: string;
  status: Extract<SubagentRunStatus, "completed" | "failed" | "stopped" | "cancelled" | "timed_out" | "detached" | "aborted_partial">;
  partial: boolean;
  summary: string;
  childThreadId: string;
  artifactPath?: string;
  fullOutputPath?: string;
  structuredOutputPath?: string;
  structuredOutput?: unknown;
  provenanceHash?: string;
}

export type SubagentRuntimeEventType =
  | "started"
  | "assistant_delta"
  | "tool_call"
  | "tool_result"
  | "status"
  | "usage"
  | "completed"
  | "error"
  | "cancelled";

export type SubagentRuntimeEventSource =
  | "spawn_agent"
  | "followup_agent"
  | "wait_agent"
  | "cancel_agent"
  | "retry_child"
  | "child_runtime"
  | "approval_response";

export interface SubagentRuntimeEvent {
  schemaVersion: "ambient-subagent-runtime-event-v1";
  type: SubagentRuntimeEventType;
  source: SubagentRuntimeEventSource;
  runId: string;
  parentThreadId: string;
  parentRunId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  createdAt: string;
  status?: SubagentRunStatus;
  message?: string;
  textPreview?: string;
  toolName?: string;
  artifactPath?: string;
  tokenCount?: number;
  costMicros?: number;
  localMemoryBytes?: number;
  details?: Record<string, unknown>;
}

export type SubagentRuntimeEventInput =
  Omit<SubagentRuntimeEvent, "schemaVersion" | "source" | "runId" | "parentThreadId" | "parentRunId" | "childThreadId" | "canonicalTaskPath" | "createdAt"> & {
    source?: SubagentRuntimeEventSource;
    createdAt?: string;
  };

type SubagentRuntimeEventRunIdentity =
  Pick<SubagentRunIdentity, "parentThreadId" | "parentRunId" | "childThreadId"> & {
    id: string;
    canonicalTaskPath: string;
  };

export function createSubagentRuntimeEvent(input: {
  run: SubagentRuntimeEventRunIdentity;
  source: SubagentRuntimeEventSource;
  event: SubagentRuntimeEventInput;
}): SubagentRuntimeEvent {
  return {
    schemaVersion: "ambient-subagent-runtime-event-v1",
    source: input.event.source ?? input.source,
    runId: input.run.id,
    parentThreadId: input.run.parentThreadId,
    parentRunId: input.run.parentRunId,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    createdAt: input.event.createdAt ?? new Date().toISOString(),
    type: input.event.type,
    ...(input.event.status ? { status: input.event.status } : {}),
    ...(input.event.message ? { message: input.event.message } : {}),
    ...(input.event.textPreview ? { textPreview: input.event.textPreview } : {}),
    ...(input.event.toolName ? { toolName: input.event.toolName } : {}),
    ...(input.event.artifactPath ? { artifactPath: input.event.artifactPath } : {}),
    ...(typeof input.event.tokenCount === "number" ? { tokenCount: input.event.tokenCount } : {}),
    ...(typeof input.event.costMicros === "number" ? { costMicros: input.event.costMicros } : {}),
    ...(typeof input.event.localMemoryBytes === "number" ? { localMemoryBytes: input.event.localMemoryBytes } : {}),
    ...(input.event.details ? { details: input.event.details } : {}),
  };
}

const SYNTHESIS_SAFE_STATUSES = new Set<SubagentRunStatus>(["completed"]);
const TERMINAL_RESULT_STATUSES = new Set<SubagentRunStatus>([
  "completed",
  "failed",
  "stopped",
  "cancelled",
  "timed_out",
  "detached",
  "aborted_partial",
]);

export function subagentResultCanBeSynthesized(input: { status: SubagentRunStatus; partial?: boolean }): boolean {
  if (SYNTHESIS_SAFE_STATUSES.has(input.status)) return true;
  return Boolean(input.partial) && input.status === "aborted_partial";
}

export interface SubagentResultArtifactValidation {
  valid: boolean;
  synthesisAllowed: boolean;
  partial: boolean;
  status?: SubagentRunStatus;
  reason?: string;
}

export function validateSubagentResultArtifactForSynthesis(artifact: unknown): SubagentResultArtifactValidation {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return invalidSubagentResultArtifact("Missing sub-agent result artifact.");
  }
  const record = artifact as Record<string, unknown>;
  if (record.schemaVersion !== "ambient-subagent-result-artifact-v1") {
    return invalidSubagentResultArtifact("Result artifact schema version is not ambient-subagent-result-artifact-v1.");
  }
  if (typeof record.runId !== "string" || !record.runId.trim()) {
    return invalidSubagentResultArtifact("Result artifact is missing runId.");
  }
  if (typeof record.childThreadId !== "string" || !record.childThreadId.trim()) {
    return invalidSubagentResultArtifact("Result artifact is missing childThreadId.");
  }
  if (typeof record.summary !== "string" || !record.summary.trim()) {
    return invalidSubagentResultArtifact("Result artifact summary is empty.");
  }
  if (typeof record.partial !== "boolean") {
    return invalidSubagentResultArtifact("Result artifact partial flag is missing.");
  }
  const status = typeof record.status === "string" ? (record.status as SubagentRunStatus) : undefined;
  if (!status || !TERMINAL_RESULT_STATUSES.has(status)) {
    return invalidSubagentResultArtifact("Result artifact status is not a terminal sub-agent status.");
  }
  const synthesisAllowed = subagentResultCanBeSynthesized({ status, partial: record.partial });
  return {
    valid: true,
    synthesisAllowed,
    partial: record.partial,
    status,
    ...(synthesisAllowed ? {} : { reason: "Result artifact status is not safe for parent synthesis." }),
  };
}

function invalidSubagentResultArtifact(reason: string): SubagentResultArtifactValidation {
  return {
    valid: false,
    synthesisAllowed: false,
    partial: false,
    reason,
  };
}

export function buildSubagentCanonicalPath(input: {
  parentPath?: string;
  roleId: string;
  spawnIndex: number;
}): string {
  const prefix = input.parentPath?.trim() || "root";
  const role = input.roleId.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "child";
  return `${prefix}/${input.spawnIndex}:${role}`;
}
