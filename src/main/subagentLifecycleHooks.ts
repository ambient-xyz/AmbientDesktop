import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRunSummary } from "../shared/types";

export const SUBAGENT_LIFECYCLE_HOOK_SCHEMA_VERSION = "ambient-subagent-lifecycle-hook-v1" as const;

export type SubagentLifecycleHook = "SubagentStart" | "SubagentStop" | "SubagentClose";

export type SubagentLifecycleEventType =
  | "subagent.lifecycle_started"
  | "subagent.lifecycle_stopped"
  | "subagent.lifecycle_closed";

export interface SubagentLifecycleArtifactPointers {
  artifactPath?: string;
  fullOutputPath?: string;
  structuredOutputPath?: string;
  provenanceHash?: string;
  status?: string;
  partial?: boolean;
}

export interface SubagentLifecycleHookPreview {
  schemaVersion: typeof SUBAGENT_LIFECYCLE_HOOK_SCHEMA_VERSION;
  hook: SubagentLifecycleHook;
  runId: string;
  parentRunId: string;
  parentThreadId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  status: SubagentRunStatus;
  finalStatus?: SubagentRunStatus;
  parentTranscriptPath: string;
  childTranscriptPath: string;
  artifactPointers?: SubagentLifecycleArtifactPointers;
  createdAt: string;
  closedAt?: string;
}

export function subagentLifecycleEventType(hook: SubagentLifecycleHook): SubagentLifecycleEventType {
  if (hook === "SubagentStart") return "subagent.lifecycle_started";
  if (hook === "SubagentStop") return "subagent.lifecycle_stopped";
  return "subagent.lifecycle_closed";
}

export function subagentLifecycleHookPreview(input: {
  hook: SubagentLifecycleHook;
  run: SubagentRunSummary;
  resultArtifact?: unknown;
  createdAt: string;
}): SubagentLifecycleHookPreview {
  const artifactPointers = subagentLifecycleArtifactPointers(input.resultArtifact ?? input.run.resultArtifact);
  return {
    schemaVersion: SUBAGENT_LIFECYCLE_HOOK_SCHEMA_VERSION,
    hook: input.hook,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    parentThreadId: input.run.parentThreadId,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    status: input.run.status,
    finalStatus: input.hook === "SubagentStop" ? input.run.status : undefined,
    parentTranscriptPath: subagentTranscriptPath(input.run.parentThreadId),
    childTranscriptPath: subagentTranscriptPath(input.run.childThreadId),
    artifactPointers,
    createdAt: input.createdAt,
    closedAt: input.hook === "SubagentClose" ? input.run.closedAt : undefined,
  };
}

export function subagentTranscriptPath(threadId: string): string {
  return `ambient://threads/${threadId}/transcript`;
}

function subagentLifecycleArtifactPointers(value: unknown): SubagentLifecycleArtifactPointers | undefined {
  const artifact = recordValue(value);
  if (!artifact) return undefined;
  const pointers: SubagentLifecycleArtifactPointers = {
    artifactPath: stringField(artifact, "artifactPath"),
    fullOutputPath: stringField(artifact, "fullOutputPath"),
    structuredOutputPath: stringField(artifact, "structuredOutputPath"),
    provenanceHash: stringField(artifact, "provenanceHash"),
    status: stringField(artifact, "status"),
    partial: booleanField(artifact, "partial"),
  };
  if (Object.values(pointers).every((item) => item === undefined)) return undefined;
  return pointers;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}
