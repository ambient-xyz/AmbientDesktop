import type { RunDiagnostics } from "../../shared/threadTypes";

export type PersistedRunStatus = "starting" | "streaming" | "tool" | "done" | "error" | "aborted" | "interrupted";
export type ActivePersistedRunStatus = Extract<PersistedRunStatus, "starting" | "streaming" | "tool">;
export type TerminalPersistedRunStatus = Exclude<PersistedRunStatus, ActivePersistedRunStatus>;

export interface RunRow {
  id: string;
  thread_id: string;
  assistant_message_id: string;
  status: PersistedRunStatus;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
  diagnostics_json: string | null;
  diagnostics_detail_json?: string | null;
}

export interface RunRecord {
  id: string;
  threadId: string;
  assistantMessageId: string;
  status: PersistedRunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
  diagnostics?: RunDiagnostics;
}

export function mapRunRow(row: RunRow): RunRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    assistantMessageId: row.assistant_message_id,
    status: row.status,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    diagnostics: row.diagnostics_detail_json
      ? parseJsonObject<RunDiagnostics | undefined>(row.diagnostics_detail_json, undefined)
      : row.diagnostics_json
        ? parseJsonObject<RunDiagnostics | undefined>(row.diagnostics_json, undefined)
        : undefined,
  };
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
