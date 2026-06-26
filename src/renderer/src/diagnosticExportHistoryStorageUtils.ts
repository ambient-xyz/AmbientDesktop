import type { AgentMemoryStarterStatus } from "../../shared/agentMemoryStarter";
import type { AgentMemoryStorageDiagnostics } from "../../shared/agentMemoryDiagnostics";
import type { DiagnosticExportHealthStatus, DiagnosticExportSubagentReplayTranscriptItem } from "../../shared/diagnosticTypes";
import {
  AGENT_MEMORY_STARTER_BLOCKER_CODES,
  AGENT_MEMORY_STARTER_NEXT_ACTIONS,
  AGENT_MEMORY_STARTER_STATES,
} from "../../shared/agentMemoryStarter";

export const MAX_SUMMARY_MESSAGE_CHARS = 1_000;
export const MAX_EVIDENCE_STRING_CHARS = 500;
export const MAX_ERROR_MESSAGES = 8;
export const MAX_REPLAY_ROWS = 240;
export const MAX_RESTART_REPAIR_IDS = 120;
export const MAX_LOCAL_RUNTIME_EVIDENCE_ROWS = 240;
export const MAX_LOCAL_RUNTIME_EVIDENCE_IDS = 120;

const AGENT_MEMORY_STARTER_STATE_VALUES = new Set<string>(AGENT_MEMORY_STARTER_STATES);
const AGENT_MEMORY_STARTER_BLOCKER_CODE_VALUES = new Set<string>(AGENT_MEMORY_STARTER_BLOCKER_CODES);
const AGENT_MEMORY_STARTER_NEXT_ACTION_VALUES = new Set<string>(AGENT_MEMORY_STARTER_NEXT_ACTIONS);

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function boundedString(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length <= limit ? value : value.slice(0, Math.max(0, limit));
}

export function boundedStringArray(value: unknown, limit: number, stringLimit: number): string[] {
  return arrayValue(value)
    .flatMap((entry) => {
      const parsed = boundedString(entry, stringLimit);
      return parsed ? [parsed] : [];
    })
    .slice(0, Math.max(0, limit));
}

export function healthStatusValue(value: unknown): DiagnosticExportHealthStatus | undefined {
  return value === "healthy" || value === "needs_attention" || value === "error" || value === "unavailable" ? value : undefined;
}

export function agentMemoryStarterState(value: unknown): AgentMemoryStarterStatus["state"] | undefined {
  return typeof value === "string" && AGENT_MEMORY_STARTER_STATE_VALUES.has(value)
    ? (value as AgentMemoryStarterStatus["state"])
    : undefined;
}

export function agentMemoryStarterBlockerCode(value: unknown): AgentMemoryStarterStatus["blockers"][number]["code"] | undefined {
  return typeof value === "string" && AGENT_MEMORY_STARTER_BLOCKER_CODE_VALUES.has(value)
    ? (value as AgentMemoryStarterStatus["blockers"][number]["code"])
    : undefined;
}

export function agentMemoryStarterNextAction(value: unknown): AgentMemoryStarterStatus["nextActions"][number] | undefined {
  return typeof value === "string" && AGENT_MEMORY_STARTER_NEXT_ACTION_VALUES.has(value)
    ? (value as AgentMemoryStarterStatus["nextActions"][number])
    : undefined;
}

export function agentMemoryStarterAssetState(value: unknown): AgentMemoryStarterStatus["assets"]["model"]["state"] | undefined {
  return value === "unknown" ||
    value === "missing" ||
    value === "mismatch" ||
    value === "installing" ||
    value === "present" ||
    value === "unsupported"
    ? value
    : undefined;
}

export function agentMemoryStarterRuntimeState(value: unknown): AgentMemoryStarterStatus["runtime"]["state"] | undefined {
  return value === "unknown" ||
    value === "stopped" ||
    value === "starting" ||
    value === "running" ||
    value === "blocked" ||
    value === "failed"
    ? value
    : undefined;
}

export function agentMemoryOperationStatusKind(
  value: unknown,
): NonNullable<AgentMemoryStorageDiagnostics["runtimeSnapshots"][number]["lastInitialize"]>["status"] | undefined {
  return value === "idle" || value === "ok" || value === "unavailable" || value === "error" ? value : undefined;
}

export function chatRoleValue(value: unknown): DiagnosticExportSubagentReplayTranscriptItem["role"] | undefined {
  return value === "user" || value === "assistant" || value === "system" || value === "tool" ? value : undefined;
}
