import type { LocalRuntimeLeaseRecord } from "../../shared/localRuntimeTypes";

export interface LocalModelRuntimeAcquireInput {
  runtimeId: string;
  providerId?: string;
  modelId: string;
  profileId?: string;
  stateRootPath: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  healthUrl?: string;
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
  estimatedResidentMemoryBytes?: number;
}

export interface LocalModelRuntimeState {
  schemaVersion: "ambient-local-model-runtime-state-v1";
  runtimeId: string;
  providerId: string;
  modelId: string;
  profileId?: string;
  pid: number;
  status: "running" | "stopped";
  command: string[];
  cwd: string;
  stateDir: string;
  stdoutPath: string;
  stderrPath: string;
  startedAt: string;
  lastUsedAt: string;
  stoppedAt?: string;
  idleTimeoutMs: number;
  healthUrl?: string;
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
}

export type LocalModelRuntimeAcquireSource = "started" | "active" | "persisted";

export interface LocalModelRuntimeAcquisition {
  schemaVersion: "ambient-local-model-runtime-acquisition-v1";
  source: LocalModelRuntimeAcquireSource;
  leaseId: string;
  runtimeId: string;
  providerId: string;
  modelId: string;
  profileId?: string;
  pid: number;
  acquiredAt: string;
  activeLeases: number;
  runtimeLease: LocalRuntimeLeaseRecord;
}

export interface LocalModelRuntimeHealthProbe {
  ok: boolean;
  healthUrl?: string;
  statusCode?: number;
  latencyMs?: number;
  body?: unknown;
  textPreview?: string;
  error?: string;
  timedOut?: boolean;
}

export type LocalModelRuntimeStartupFailureReason = "process_exited" | "startup_timeout" | "health_unhealthy";

export interface LocalModelRuntimeStartupFailure {
  schemaVersion: "ambient-local-model-runtime-startup-failure-v1";
  reason: LocalModelRuntimeStartupFailureReason;
  message: string;
  runtimeId: string;
  providerId: string;
  modelId: string;
  profileId?: string;
  pid: number;
  command: string[];
  cwd: string;
  stateDir: string;
  stdoutPath: string;
  stderrPath: string;
  startupTimeoutMs: number;
  health: LocalModelRuntimeHealthProbe;
}

export interface LocalModelRuntimeLease {
  leaseId: string;
  state: LocalModelRuntimeState;
  acquisition: LocalModelRuntimeAcquisition;
  runtimeLease: LocalRuntimeLeaseRecord;
  release: () => Promise<LocalModelRuntimeReleaseResult>;
  touch: () => Promise<LocalModelRuntimeState>;
}

export interface LocalModelRuntimeReleaseResult {
  status: "released" | "still-leased" | "stopped" | "not-found" | "failed";
  leaseId: string;
  pid?: number;
  remainingLeases?: number;
  releasedAt?: string;
  idleCleanupDueAt?: string;
  runtimeLease?: LocalRuntimeLeaseRecord;
  error?: string;
}

export interface LocalModelRuntimeLeaseJournal {
  schemaVersion: "ambient-local-runtime-lease-journal-v1";
  runtimeId: string;
  updatedAt: string;
  leases: LocalRuntimeLeaseRecord[];
}

export interface LocalModelRuntimeLeaseJournalRepairOptions {
  processAlive?: (pid: number) => boolean;
  now?: () => Date;
  staleMs?: number;
}

export type LocalModelRuntimeLeaseRecoveryIssueKind = "dead_runtime_crashed" | "stale_active_lease";
export type LocalModelRuntimeLeaseRecoverySource = "lease_journal" | "runtime_status";

export interface LocalModelRuntimeLeaseRecoveryIssue {
  schemaVersion: "ambient-local-runtime-lease-recovery-issue-v1";
  source: LocalModelRuntimeLeaseRecoverySource;
  kind: LocalModelRuntimeLeaseRecoveryIssueKind;
  runtimeId?: string;
  leaseId: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  providerId?: string;
  capabilityKind: LocalRuntimeLeaseRecord["capabilityKind"];
  pid?: number;
  endpoint?: string;
  acquiredAt: string;
  previousLastHeartbeatAt: string;
  lastHeartbeatAt: string;
  previousStatus: LocalRuntimeLeaseRecord["status"];
  status: LocalRuntimeLeaseRecord["status"];
  repaired: boolean;
  observedAt: string;
  message: string;
}

export interface LocalModelRuntimeLeaseRecoverySummary {
  schemaVersion: "ambient-local-runtime-lease-recovery-v1";
  capturedAt: string;
  issueCount: number;
  repairedLeaseIds: string[];
  staleLeaseIds: string[];
  crashedLeaseIds: string[];
  issues: LocalModelRuntimeLeaseRecoveryIssue[];
}

export interface LocalModelRuntimeLeaseJournalRecoveryResult {
  leases: LocalRuntimeLeaseRecord[];
  recovery: LocalModelRuntimeLeaseRecoverySummary;
}

export interface LocalModelRuntimeStopInput {
  runtimeId: string;
  stateRootPath?: string;
  force?: boolean;
}

export interface LocalModelRuntimeStopResult {
  schemaVersion: "ambient-local-model-runtime-stop-v1";
  status: "stopped" | "blocked" | "not-found" | "failed";
  runtimeId: string;
  forceRequested: boolean;
  pid?: number;
  activeLeaseIds?: string[];
  activeLeases?: LocalRuntimeLeaseRecord[];
  stoppedAt?: string;
  reason?: string;
  error?: string;
}

export interface LocalModelRuntimeStartInput {
  runtimeId: string;
  stateRootPath?: string;
}

export interface LocalModelRuntimeStartResult {
  schemaVersion: "ambient-local-model-runtime-start-v1";
  status: "started" | "blocked" | "not-found" | "failed";
  runtimeId: string;
  previousPid?: number;
  pid?: number;
  activeLeaseIds?: string[];
  activeLeases?: LocalRuntimeLeaseRecord[];
  startedAt?: string;
  reason?: string;
  error?: string;
}

export interface LocalModelRuntimeRestartInput {
  runtimeId: string;
  stateRootPath?: string;
  force?: boolean;
}

export interface LocalModelRuntimeRestartResult {
  schemaVersion: "ambient-local-model-runtime-restart-v1";
  status: "restarted" | "blocked" | "not-found" | "failed";
  runtimeId: string;
  forceRequested: boolean;
  previousPid?: number;
  pid?: number;
  activeLeaseIds?: string[];
  activeLeases?: LocalRuntimeLeaseRecord[];
  restartedAt?: string;
  reason?: string;
  error?: string;
}

export interface ActiveRuntimeLeaseMetadata {
  acquiredAt: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
}

export interface ActiveRuntimeLeaseReservation extends ActiveRuntimeLeaseMetadata {
  leaseId: string;
}

export interface NormalizedAcquireInput extends Omit<
  LocalModelRuntimeAcquireInput,
  "providerId" | "stateRootPath" | "args" | "cwd" | "startupTimeoutMs" | "idleTimeoutMs"
> {
  providerId: string;
  stateRootPath: string;
  args: string[];
  cwd: string;
  startupTimeoutMs: number;
  idleTimeoutMs: number;
}
