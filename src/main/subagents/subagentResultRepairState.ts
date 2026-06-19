import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import { isSubagentTerminalStatus } from "./subagentRunStatus";

export const SUBAGENT_RESULT_REPAIR_STATE_SCHEMA_VERSION =
  "ambient-subagent-result-repair-state-v1" as const;

export interface SubagentResultRepairState {
  schemaVersion: typeof SUBAGENT_RESULT_REPAIR_STATE_SCHEMA_VERSION;
  state: "result_contract_repair_pending" | "result_contract_repair_exhausted";
  reason: string;
  detectedAt: string;
  eventSequence: number;
  hadAssistantText?: boolean;
  latestInternalFollowupAt?: string;
  latestInternalFollowupSequence?: number;
  latestInternalFollowupAttempt?: number;
  maxAttempts?: number;
  exhaustedAt?: string;
  exhaustedSequence?: number;
}

export function subagentResultRepairStateForRun(input: {
  run: Pick<SubagentRunSummary, "status">;
  events: readonly SubagentRunEventSummary[];
}): SubagentResultRepairState | undefined {
  const latestRepairRequired = latestEventOfType(input.events, "subagent.result_contract_followup_required");
  if (!latestRepairRequired) return undefined;
  const latestRepairExhausted = latestEventOfTypeAfter(
    input.events,
    "subagent.result_contract_repair_exhausted",
    latestRepairRequired.sequence,
  );
  const preview = recordValue(latestRepairRequired.preview);
  const reason = stringValue(preview?.reason) ?? "Structured result contract repair is pending.";
  const latestInternalFollowup = latestEventOfTypeAfter(
    input.events,
    "subagent.internal_post_tool_followup_started",
    latestRepairRequired.sequence,
  );
  const followupPreview = recordValue(latestInternalFollowup?.preview);
  if (latestRepairExhausted) {
    const exhaustionPreview = recordValue(latestRepairExhausted.preview);
    return {
      schemaVersion: SUBAGENT_RESULT_REPAIR_STATE_SCHEMA_VERSION,
      state: "result_contract_repair_exhausted",
      reason: stringValue(exhaustionPreview?.reason) ?? reason,
      detectedAt: latestRepairRequired.createdAt,
      eventSequence: latestRepairRequired.sequence,
      exhaustedAt: latestRepairExhausted.createdAt,
      exhaustedSequence: latestRepairExhausted.sequence,
      ...(typeof preview?.hadAssistantText === "boolean" ? { hadAssistantText: preview.hadAssistantText } : {}),
      ...(latestInternalFollowup ? {
        latestInternalFollowupAt: latestInternalFollowup.createdAt,
        latestInternalFollowupSequence: latestInternalFollowup.sequence,
      } : {}),
      ...(typeof followupPreview?.attempt === "number" ? { latestInternalFollowupAttempt: followupPreview.attempt } : {}),
      ...(typeof exhaustionPreview?.maxAttempts === "number" ? { maxAttempts: exhaustionPreview.maxAttempts } : {}),
      ...(typeof followupPreview?.maxAttempts === "number" && typeof exhaustionPreview?.maxAttempts !== "number" ? { maxAttempts: followupPreview.maxAttempts } : {}),
    };
  }
  if (isSubagentTerminalStatus(input.run.status)) return undefined;
  const latestTerminalResult = latestEventOfTypes(input.events, [
    "subagent.result_ready",
    "subagent.result_failed",
    "subagent.child_session_failed",
  ]);
  if (latestTerminalResult && latestTerminalResult.sequence > latestRepairRequired.sequence) return undefined;
  return {
    schemaVersion: SUBAGENT_RESULT_REPAIR_STATE_SCHEMA_VERSION,
    state: "result_contract_repair_pending",
    reason,
    detectedAt: latestRepairRequired.createdAt,
    eventSequence: latestRepairRequired.sequence,
    ...(typeof preview?.hadAssistantText === "boolean" ? { hadAssistantText: preview.hadAssistantText } : {}),
    ...(latestInternalFollowup ? {
      latestInternalFollowupAt: latestInternalFollowup.createdAt,
      latestInternalFollowupSequence: latestInternalFollowup.sequence,
    } : {}),
    ...(typeof followupPreview?.attempt === "number" ? { latestInternalFollowupAttempt: followupPreview.attempt } : {}),
    ...(typeof followupPreview?.maxAttempts === "number" ? { maxAttempts: followupPreview.maxAttempts } : {}),
  };
}

function latestEventOfType(
  events: readonly SubagentRunEventSummary[],
  type: string,
): SubagentRunEventSummary | undefined {
  return latestEventOfTypes(events, [type]);
}

function latestEventOfTypeAfter(
  events: readonly SubagentRunEventSummary[],
  type: string,
  sequence: number,
): SubagentRunEventSummary | undefined {
  return latestEventOfTypes(events.filter((event) => event.sequence > sequence), [type]);
}

function latestEventOfTypes(
  events: readonly SubagentRunEventSummary[],
  types: readonly string[],
): SubagentRunEventSummary | undefined {
  let latest: SubagentRunEventSummary | undefined;
  for (const event of events) {
    if (!types.includes(event.type)) continue;
    if (!latest || event.sequence > latest.sequence) latest = event;
  }
  return latest;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
