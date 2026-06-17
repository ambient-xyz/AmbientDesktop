import type {
  ToolArgumentProgressSnapshot,
  ToolEditInputPreview,
  ToolEventDetails,
  ToolLongformInputPreview,
} from "../../../shared/types";
import type { ToolResultDetails } from "../../pi/piEventMapper";
import { AMBIENT_SUBAGENT_TOOL_NAME } from "../../subagents/subagentPiTools";

export interface SubagentParentControlAbortIntent {
  reason: string;
  message: string;
  toolCallId: string;
  parentRunId?: string;
  waitBarrierId?: string;
  idempotencyKey?: string;
  decision?: string;
}

export function toolMessageMetadata(
  status: "running" | "done" | "error",
  toolCallId: string,
  toolName: string,
  artifactPath?: string,
  resultDetails?: ToolResultDetails,
  longformInputPreview?: ToolLongformInputPreview,
  editInputPreview?: ToolEditInputPreview,
  argumentProgress?: ToolArgumentProgressSnapshot,
): Record<string, unknown> {
  const mediaArtifact = resultDetails?.mediaArtifact;
  return {
    status,
    toolCallId,
    toolName,
    ...(mediaArtifact?.artifactPath || artifactPath ? { artifactPath: mediaArtifact?.artifactPath ?? artifactPath } : {}),
    ...(mediaArtifact
      ? {
          mediaArtifact,
          ...(mediaArtifact.renderedInline === true ? { renderedInline: true } : {}),
          ...(mediaArtifact.inlinePreviewEligible === true ? { inlinePreviewEligible: true } : {}),
        }
      : {}),
    ...(resultDetails ? { toolResultDetails: resultDetails } : {}),
    ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
    ...(editInputPreview ? { toolEditInputPreview: editInputPreview } : {}),
    ...(argumentProgress ? { toolArgumentProgress: argumentProgress } : {}),
  };
}

export function subagentParentControlAbortIntentFromToolEnd(
  normalized: {
    toolCallId: string;
    label: string;
    details?: ToolEventDetails;
  },
  rawEvent: unknown,
): SubagentParentControlAbortIntent | undefined {
  const records = subagentToolResultRecordCandidates(rawEvent);
  const matchingRecord = records.find((record) => {
    const toolName = optionalString(record.toolName) ?? optionalString(record.registeredName) ?? normalized.details?.toolName ?? normalized.label;
    const runtime = optionalString(record.runtime) ?? normalized.details?.runtime;
    const action = optionalString(record.action);
    const parentResolution = objectRecord(record.parentResolution);
    const resolutionArtifact = objectRecord(record.resolutionArtifact);
    const parentMailboxEvent = objectRecord(record.parentMailboxEvent);
    const parentMailboxPayload = objectRecord(parentMailboxEvent.payload);
    return (
      toolName === AMBIENT_SUBAGENT_TOOL_NAME &&
      runtime === "ambient-subagents" &&
      action === "resolve_barrier" &&
      (
        parentResolution.action === "cancel_parent" ||
        resolutionArtifact.parentCancellationRequested === true ||
        parentMailboxPayload.parentCancellationRequested === true
      )
    );
  });
  if (!matchingRecord) return undefined;
  const parentResolution = objectRecord(matchingRecord.parentResolution);
  const waitBarrier = objectRecord(matchingRecord.waitBarrier);
  const resolutionArtifact = objectRecord(matchingRecord.resolutionArtifact);
  const userDecision = objectRecord(resolutionArtifact.userDecision);
  const waitBarrierId = optionalString(waitBarrier.id) ?? optionalString(matchingRecord.waitBarrierId);
  const idempotencyKey = optionalString(matchingRecord.idempotencyKey) ?? optionalString(userDecision.idempotencyKey);
  const parentRunId = optionalString(matchingRecord.parentRunId);
  const decision = optionalString(userDecision.decision) ?? "cancel_parent";
  const reason = waitBarrierId
    ? `Parent run cancelled by user while resolving sub-agent wait barrier ${waitBarrierId}.`
    : "Parent run cancelled by user while resolving a sub-agent wait barrier.";
  return {
    reason,
    message: reason,
    toolCallId: normalized.toolCallId,
    ...(parentRunId ? { parentRunId } : {}),
    ...(waitBarrierId ? { waitBarrierId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    decision,
    ...(optionalString(parentResolution.reason) ? { reason: optionalString(parentResolution.reason)! } : {}),
  };
}

export function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function subagentToolResultRecordCandidates(rawEvent: unknown): Record<string, unknown>[] {
  const candidates: unknown[] = [];
  const raw = objectRecord(rawEvent);
  candidates.push(raw.details, raw.result, objectRecord(raw.result).details);
  const message = objectRecord(raw.message);
  candidates.push(message.details, message.content, objectRecord(message.content).details);
  const records = candidates
    .flatMap((candidate) => nestedRecordCandidates(candidate))
    .filter((record) => Object.keys(record).length > 0);
  const unique = new Set<Record<string, unknown>>();
  for (const record of records) unique.add(record);
  return [...unique];
}

function nestedRecordCandidates(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((item) => nestedRecordCandidates(item));
  const record = objectRecord(value);
  if (!Object.keys(record).length) return [];
  const nestedDetails = objectRecord(record.details);
  const nestedResultDetails = objectRecord(record.resultDetails);
  const nestedPayload = objectRecord(record.payload);
  return [
    record,
    ...nestedRecordCandidates(nestedDetails),
    ...nestedRecordCandidates(nestedResultDetails),
    ...nestedRecordCandidates(nestedPayload),
  ];
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
