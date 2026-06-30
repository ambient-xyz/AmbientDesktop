import type { AmbientFeatureFlagSettings } from "./featureFlags";
import type { AgentMemorySettings } from "./agentMemorySettings";
import type { AgentMemoryEmbeddingDiagnostics, AgentMemoryNativeDependencyPreflight } from "./agentMemoryEmbeddingDiagnosticsTypes";

export const AGENT_MEMORY_STARTER_STATES = [
  "off",
  "setup_required",
  "installing",
  "starting",
  "ready",
  "needs_repair",
  "disabling",
] as const;

export type AgentMemoryStarterState = typeof AGENT_MEMORY_STARTER_STATES[number];

export const AGENT_MEMORY_STARTER_BLOCKER_CODES = [
  "feature_disabled",
  "global_memory_disabled",
  "thread_memory_disabled",
  "storage_unhealthy",
  "managed_embeddings_disabled",
  "model_missing",
  "model_mismatch",
  "runtime_missing",
  "runtime_unsupported",
  "resident_runtime_conflict",
  "native_preflight_failed",
  "embedding_preflight_failed",
  "install_failed",
  "start_failed",
  "stop_failed",
] as const;

export type AgentMemoryStarterBlockerCode = typeof AGENT_MEMORY_STARTER_BLOCKER_CODES[number];

export const AGENT_MEMORY_STARTER_NEXT_ACTIONS = [
  "enable",
  "install",
  "repair",
  "start",
  "retry_preflight",
  "open_logs",
  "disable",
  "clear_memory",
] as const;

export type AgentMemoryStarterNextAction = typeof AGENT_MEMORY_STARTER_NEXT_ACTIONS[number];

export type AgentMemoryStarterOperationKind =
  | "status"
  | "enable"
  | "repair"
  | "disable";

export interface AgentMemoryStarterEnableInput {
  enableCurrentThread?: boolean;
  enableNewThreads?: boolean;
}

export interface AgentMemoryStarterRepairInput {
  enableCurrentThread?: boolean;
  enableNewThreads?: boolean;
}

export type AgentMemoryStarterDisableInput = Record<string, never>;

export interface AgentMemoryStarterBlocker {
  code: AgentMemoryStarterBlockerCode;
  message: string;
  detail?: string;
  retryable: boolean;
}

export interface AgentMemoryStarterAssetStatus {
  state: "unknown" | "missing" | "mismatch" | "installing" | "present" | "unsupported";
  path?: string;
  expectedBytes?: number;
  actualBytes?: number;
  expectedSha256?: string;
  artifactId?: string;
  receiptPath?: string;
  message?: string;
}

export interface AgentMemoryStarterRuntimeStatus {
  state: "unknown" | "stopped" | "starting" | "running" | "blocked" | "failed";
  runtimeId?: string;
  leaseId?: string;
  endpoint?: string;
  ownerThreadId?: string;
  message?: string;
}

export interface AgentMemoryStarterThreadScopeStatus {
  activeThreadId?: string;
  activeThreadMemoryEnabled: boolean;
  defaultThreadEnabled: boolean;
  enabledThreadCount?: number;
  activeThreadCount?: number;
}

export interface AgentMemoryStarterSettingsSnapshot {
  featureFlags: Pick<AmbientFeatureFlagSettings, "tencentDbMemory">;
  memory: AgentMemorySettings;
}

export interface AgentMemoryStarterStatus {
  schemaVersion: "ambient-agent-memory-starter-status-v1";
  checkedAt: string;
  operationId?: string;
  state: AgentMemoryStarterState;
  settings: AgentMemoryStarterSettingsSnapshot;
  threadScope: AgentMemoryStarterThreadScopeStatus;
  assets: {
    model: AgentMemoryStarterAssetStatus;
    runtime: AgentMemoryStarterAssetStatus;
  };
  runtime: AgentMemoryStarterRuntimeStatus;
  embedding: AgentMemoryEmbeddingDiagnostics;
  nativePreflight: AgentMemoryNativeDependencyPreflight;
  blockers: AgentMemoryStarterBlocker[];
  nextActions: AgentMemoryStarterNextAction[];
}

export interface AgentMemoryStarterOperationLogEntry {
  at: string;
  step: string;
  status: "started" | "skipped" | "passed" | "blocked" | "failed";
  message: string;
  blockerCode?: AgentMemoryStarterBlockerCode;
  artifactPath?: string;
}

export interface AgentMemoryStarterOperationResult {
  schemaVersion: "ambient-agent-memory-starter-operation-result-v1";
  operationId: string;
  operation: AgentMemoryStarterOperationKind;
  startedAt: string;
  completedAt: string;
  status: AgentMemoryStarterStatus;
  log: AgentMemoryStarterOperationLogEntry[];
}

export function isAgentMemoryStarterTerminalState(state: AgentMemoryStarterState): boolean {
  return state === "off" || state === "ready" || state === "needs_repair";
}

export function agentMemoryStarterPrimaryAction(
  status: Pick<AgentMemoryStarterStatus, "state" | "nextActions">,
): AgentMemoryStarterNextAction | undefined {
  if (status.state === "off") return "enable";
  if (status.state === "setup_required") {
    return status.nextActions.find((action) =>
      action === "install" ||
      action === "repair" ||
      action === "start" ||
      action === "retry_preflight" ||
      action === "enable"
    );
  }
  if (status.state === "needs_repair") return status.nextActions.find((action) => action === "repair" || action === "retry_preflight" || action === "start");
  if (status.state === "ready") return status.nextActions.includes("disable") ? "disable" : undefined;
  return undefined;
}
