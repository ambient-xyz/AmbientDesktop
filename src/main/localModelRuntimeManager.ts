import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { LocalRuntimeLeaseRecord } from "../shared/types";
import { sampleProcessResidentMemory, type LocalLlamaResidentMemorySample } from "./localLlamaResidencyPolicy";
import {
  DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS,
  isActiveLocalRuntimeLease,
} from "./localRuntimeInventory";

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

export class LocalModelRuntimeStartupError extends Error {
  readonly failure: LocalModelRuntimeStartupFailure;

  constructor(failure: LocalModelRuntimeStartupFailure) {
    super(failure.message);
    this.name = "LocalModelRuntimeStartupError";
    this.failure = failure;
  }
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

export interface LocalModelRuntimeManagerOptions {
  spawnProcess?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  fetchImpl?: typeof fetch;
  processAlive?: (pid: number) => boolean;
  killProcess?: (pid: number, signal?: NodeJS.Signals) => void;
  sampleMemory?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface ActiveRuntime {
  key: string;
  state: LocalModelRuntimeState;
  leases: Map<string, ActiveRuntimeLeaseMetadata>;
  idleTimer?: ReturnType<typeof setTimeout>;
}

interface ActiveRuntimeLeaseMetadata {
  acquiredAt: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  ownerDisplayName?: string;
}

interface ActiveRuntimeLeaseReservation extends ActiveRuntimeLeaseMetadata {
  leaseId: string;
}

interface NormalizedAcquireInput extends Omit<LocalModelRuntimeAcquireInput, "providerId" | "stateRootPath" | "args" | "cwd" | "startupTimeoutMs" | "idleTimeoutMs"> {
  providerId: string;
  stateRootPath: string;
  args: string[];
  cwd: string;
  startupTimeoutMs: number;
  idleTimeoutMs: number;
}

const defaultProviderId = "local";
const defaultStartupTimeoutMs = 60_000;
const defaultIdleTimeoutMs = 5 * 60_000;
const maxLocalRuntimeLeaseJournalEntries = 50;

export class LocalModelRuntimeManager {
  private readonly activeRuntimes = new Map<string, ActiveRuntime>();
  private readonly leases = new Map<string, ActiveRuntime>();
  private readonly spawnProcess: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  private readonly fetchImpl: typeof fetch;
  private readonly processAlive: (pid: number) => boolean;
  private readonly killProcess: (pid: number, signal?: NodeJS.Signals) => void;
  private readonly sampleMemory: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: LocalModelRuntimeManagerOptions = {}) {
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.processAlive = options.processAlive ?? defaultProcessAlive;
    this.killProcess = options.killProcess ?? defaultKillProcess;
    this.sampleMemory = options.sampleMemory ?? sampleProcessResidentMemory;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  }

  async acquire(input: LocalModelRuntimeAcquireInput): Promise<LocalModelRuntimeLease> {
    const normalized = normalizeAcquireInput(input);
    const reservation = createLocalRuntimeLeaseReservation(this.now(), normalized);
    const key = runtimeKey(normalized);
    const existingActive = this.activeRuntimes.get(key);
    if (existingActive && this.processAlive(existingActive.state.pid)) {
      return this.createLease(existingActive, "active", reservation);
    }

    const persisted = await readLocalModelRuntimeState(normalized.stateRootPath, normalized.runtimeId);
    const command = [normalized.command, ...normalized.args];
    if (persisted?.status === "running" && persisted.pid && this.processAlive(persisted.pid)) {
      if (sameCommand(persisted.command, command) && persisted.healthUrl === normalized.healthUrl) {
        const health = await probeLocalModelRuntimeHealth(persisted.healthUrl, { fetchImpl: this.fetchImpl, timeoutMs: 2500 });
        if (health.ok) {
          const active = this.rememberActive(key, {
            ...persisted,
            idleTimeoutMs: normalized.idleTimeoutMs,
            lastUsedAt: this.now().toISOString(),
          });
          return this.createLease(active, "persisted", reservation);
        }
      }
      await this.stopState(persisted);
    }

    const state = await this.launchRuntime(normalized, command, reservation);
    const active = this.rememberActive(key, state);
    return this.createLease(active, "started", reservation, { acquiringJournaled: true });
  }

  async release(leaseId: string): Promise<LocalModelRuntimeReleaseResult> {
    const active = this.leases.get(leaseId);
    if (!active) return { status: "not-found", leaseId };
    const metadata = active.leases.get(leaseId) ?? { acquiredAt: active.state.lastUsedAt };
    const releasingState = await this.touchActive(active);
    await writeLocalModelRuntimeLeaseJournalRecord(active.state.stateDir, localModelRuntimeLeaseRecord({
      leaseId,
      metadata,
      state: releasingState,
      status: "releasing",
    }));
    this.leases.delete(leaseId);
    active.leases.delete(leaseId);
    const releasedAt = releasingState.lastUsedAt;
    const runtimeLease = localModelRuntimeLeaseRecord({
      leaseId,
      metadata,
      state: releasingState,
      status: "released",
    });
    if (active.leases.size > 0) {
      await writeLocalModelRuntimeLeaseJournalRecord(active.state.stateDir, runtimeLease);
      return { status: "still-leased", leaseId, pid: active.state.pid, remainingLeases: active.leases.size, releasedAt, runtimeLease };
    }
    if (active.state.idleTimeoutMs <= 0) {
      await this.stopActive(active);
      await writeLocalModelRuntimeLeaseJournalRecord(releasingState.stateDir, runtimeLease);
      return { status: "stopped", leaseId, pid: active.state.pid, remainingLeases: 0, releasedAt, runtimeLease };
    }
    await writeLocalModelRuntimeLeaseJournalRecord(active.state.stateDir, runtimeLease);
    this.scheduleIdleCleanup(active);
    return {
      status: "released",
      leaseId,
      pid: active.state.pid,
      remainingLeases: 0,
      releasedAt,
      idleCleanupDueAt: localModelRuntimeIdleCleanupDueAt(releasedAt, active.state.idleTimeoutMs),
      runtimeLease,
    };
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.activeRuntimes.values()].map((active) => this.stopActive(active)));
  }

  async stopRuntime(input: LocalModelRuntimeStopInput): Promise<LocalModelRuntimeStopResult> {
    const runtimeId = input.runtimeId.trim();
    const forceRequested = input.force === true;
    if (!runtimeId) {
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "failed",
        runtimeId,
        forceRequested,
        error: "Local model runtime Stop requires a runtimeId.",
      };
    }
    const active = [...this.activeRuntimes.values()].find((candidate) => candidate.state.runtimeId === runtimeId);
    if (active) {
      const activeLeaseIds = [...active.leases.keys()];
      if (activeLeaseIds.length > 0) {
        const activeLeases = this.activeLeaseRecords(active, activeLeaseIds);
        return {
          schemaVersion: "ambient-local-model-runtime-stop-v1",
          status: "blocked",
          runtimeId,
          forceRequested,
          pid: active.state.pid,
          activeLeaseIds,
          activeLeases,
          reason: forceRequested
            ? "Forced termination requires explicit cancellation or failure marking for active sub-agent leases before Ambient stops their local runtime."
            : "Active local runtime leases block ordinary Stop.",
        };
      }
      try {
        const pid = active.state.pid;
        await this.stopActive(active);
        return {
          schemaVersion: "ambient-local-model-runtime-stop-v1",
          status: "stopped",
          runtimeId,
          forceRequested,
          pid,
          stoppedAt: this.now().toISOString(),
        };
      } catch (error) {
        return {
          schemaVersion: "ambient-local-model-runtime-stop-v1",
          status: "failed",
          runtimeId,
          forceRequested,
          pid: active.state.pid,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    if (!input.stateRootPath) {
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "not-found",
        runtimeId,
        forceRequested,
        reason: "Ambient has no active in-process runtime with that id and no persisted state root was provided.",
      };
    }
    const persisted = await readLocalModelRuntimeState(input.stateRootPath, runtimeId);
    if (!persisted?.pid) {
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "not-found",
        runtimeId,
        forceRequested,
        reason: "No persisted managed local runtime state was found for that runtime id.",
      };
    }
    const persistedActiveLeases = await this.activePersistedLeaseRecords(input.stateRootPath, runtimeId);
    if (persistedActiveLeases.length > 0) {
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "blocked",
        runtimeId,
        forceRequested,
        pid: persisted.pid,
        activeLeaseIds: persistedActiveLeases.map((lease) => lease.leaseId),
        activeLeases: persistedActiveLeases,
        reason: forceRequested
          ? "Forced termination requires explicit cancellation or failure marking for active sub-agent leases before Ambient stops their local runtime."
          : "Active local runtime leases block ordinary Stop.",
      };
    }
    try {
      await this.stopState(persisted);
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "stopped",
        runtimeId,
        forceRequested,
        pid: persisted.pid,
        stoppedAt: this.now().toISOString(),
      };
    } catch (error) {
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "failed",
        runtimeId,
        forceRequested,
        pid: persisted.pid,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async startRuntime(input: LocalModelRuntimeStartInput): Promise<LocalModelRuntimeStartResult> {
    const runtimeId = input.runtimeId.trim();
    if (!runtimeId) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "failed",
        runtimeId,
        error: "Local model runtime Start requires a runtimeId.",
      };
    }

    const active = [...this.activeRuntimes.values()].find((candidate) => candidate.state.runtimeId === runtimeId);
    if (active) {
      const activeLeaseIds = [...active.leases.keys()];
      if (activeLeaseIds.length > 0) {
        const activeLeases = this.activeLeaseRecords(active, activeLeaseIds);
        return {
          schemaVersion: "ambient-local-model-runtime-start-v1",
          status: "blocked",
          runtimeId,
          previousPid: active.state.pid,
          activeLeaseIds,
          activeLeases,
          reason: "Active local runtime leases block ordinary Start.",
        };
      }
      if (this.processAlive(active.state.pid)) {
        return {
          schemaVersion: "ambient-local-model-runtime-start-v1",
          status: "blocked",
          runtimeId,
          previousPid: active.state.pid,
          reason: "Local runtime is already running.",
        };
      }
      if (active.idleTimer) clearTimeout(active.idleTimer);
      this.activeRuntimes.delete(active.key);
    }

    if (!input.stateRootPath) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "not-found",
        runtimeId,
        reason: "Ambient has no active in-process runtime with that id and no persisted state root was provided.",
      };
    }
    const persisted = await readLocalModelRuntimeState(input.stateRootPath, runtimeId);
    if (!persisted?.pid) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "not-found",
        runtimeId,
        reason: "No persisted managed local runtime state was found for that runtime id.",
      };
    }
    const persistedActiveLeases = await this.activePersistedLeaseRecords(input.stateRootPath, runtimeId);
    if (persistedActiveLeases.length > 0) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "blocked",
        runtimeId,
        previousPid: persisted.pid,
        activeLeaseIds: persistedActiveLeases.map((lease) => lease.leaseId),
        activeLeases: persistedActiveLeases,
        reason: "Active local runtime leases block ordinary Start.",
      };
    }
    if (persisted.status === "running" && this.processAlive(persisted.pid)) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "blocked",
        runtimeId,
        previousPid: persisted.pid,
        reason: "Local runtime is already running.",
      };
    }
    const previousPid = persisted.pid;
    try {
      const normalized = normalizedAcquireInputFromState(persisted, input.stateRootPath);
      const state = await this.launchRuntime(normalized, [normalized.command, ...normalized.args]);
      this.rememberIdleRuntime(runtimeKey(normalized), state);
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "started",
        runtimeId,
        previousPid,
        pid: state.pid,
        startedAt: this.now().toISOString(),
      };
    } catch (error) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "failed",
        runtimeId,
        previousPid,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async restartRuntime(input: LocalModelRuntimeRestartInput): Promise<LocalModelRuntimeRestartResult> {
    const runtimeId = input.runtimeId.trim();
    const forceRequested = input.force === true;
    if (!runtimeId) {
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "failed",
        runtimeId,
        forceRequested,
        error: "Local model runtime Restart requires a runtimeId.",
      };
    }

    const active = [...this.activeRuntimes.values()].find((candidate) => candidate.state.runtimeId === runtimeId);
    if (active) {
      const activeLeaseIds = [...active.leases.keys()];
      if (activeLeaseIds.length > 0) {
        const activeLeases = this.activeLeaseRecords(active, activeLeaseIds);
        return {
          schemaVersion: "ambient-local-model-runtime-restart-v1",
          status: "blocked",
          runtimeId,
          forceRequested,
          previousPid: active.state.pid,
          activeLeaseIds,
          activeLeases,
          reason: forceRequested
            ? "Forced restart requires explicit cancellation or failure marking for active sub-agent leases before Ambient restarts their local runtime."
            : "Active local runtime leases block ordinary Restart.",
        };
      }
      const previousPid = active.state.pid;
      try {
        const normalized = normalizedAcquireInputFromState(active.state, input.stateRootPath);
        await this.stopActive(active);
        const state = await this.launchRuntime(normalized, [normalized.command, ...normalized.args]);
        this.rememberIdleRuntime(runtimeKey(normalized), state);
        return {
          schemaVersion: "ambient-local-model-runtime-restart-v1",
          status: "restarted",
          runtimeId,
          forceRequested,
          previousPid,
          pid: state.pid,
          restartedAt: this.now().toISOString(),
        };
      } catch (error) {
        return {
          schemaVersion: "ambient-local-model-runtime-restart-v1",
          status: "failed",
          runtimeId,
          forceRequested,
          previousPid,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    if (!input.stateRootPath) {
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "not-found",
        runtimeId,
        forceRequested,
        reason: "Ambient has no active in-process runtime with that id and no persisted state root was provided.",
      };
    }
    const persisted = await readLocalModelRuntimeState(input.stateRootPath, runtimeId);
    if (!persisted?.pid) {
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "not-found",
        runtimeId,
        forceRequested,
        reason: "No persisted managed local runtime state was found for that runtime id.",
      };
    }
    const persistedActiveLeases = await this.activePersistedLeaseRecords(input.stateRootPath, runtimeId);
    if (persistedActiveLeases.length > 0) {
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "blocked",
        runtimeId,
        forceRequested,
        previousPid: persisted.pid,
        activeLeaseIds: persistedActiveLeases.map((lease) => lease.leaseId),
        activeLeases: persistedActiveLeases,
        reason: forceRequested
          ? "Forced restart requires explicit cancellation or failure marking for active sub-agent leases before Ambient restarts their local runtime."
          : "Active local runtime leases block ordinary Restart.",
      };
    }
    const previousPid = persisted.pid;
    try {
      const normalized = normalizedAcquireInputFromState(persisted, input.stateRootPath);
      await this.stopState(persisted);
      const state = await this.launchRuntime(normalized, [normalized.command, ...normalized.args]);
      this.rememberIdleRuntime(runtimeKey(normalized), state);
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "restarted",
        runtimeId,
        forceRequested,
        previousPid,
        pid: state.pid,
        restartedAt: this.now().toISOString(),
      };
    } catch (error) {
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "failed",
        runtimeId,
        forceRequested,
        previousPid,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  activeRuntimeLeases(): LocalRuntimeLeaseRecord[] {
    return [...this.leases.entries()].map(([leaseId, active]) =>
      localModelRuntimeLeaseRecord({
        leaseId,
        metadata: active.leases.get(leaseId) ?? { acquiredAt: active.state.lastUsedAt },
        state: active.state,
      })
    );
  }

  async persistedRuntimeLeases(stateRootPath: string): Promise<LocalRuntimeLeaseRecord[]> {
    return readLocalModelRuntimeLeaseJournals(stateRootPath);
  }

  private activeLeaseRecords(active: ActiveRuntime, leaseIds: string[]): LocalRuntimeLeaseRecord[] {
    return leaseIds.map((leaseId) =>
      localModelRuntimeLeaseRecord({
        leaseId,
        metadata: active.leases.get(leaseId) ?? { acquiredAt: active.state.lastUsedAt },
        state: active.state,
      })
    );
  }

  private async activePersistedLeaseRecords(stateRootPath: string, runtimeId: string): Promise<LocalRuntimeLeaseRecord[]> {
    const leases = await readRepairedLocalModelRuntimeLeaseJournal(stateRootPath, runtimeId, {
      processAlive: this.processAlive,
      now: this.now,
      staleMs: DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS,
    });
    return leases.filter((lease) =>
      isActiveLocalRuntimeLease(lease, {
        now: this.now(),
        staleMs: DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS,
      })
    );
  }

  private async launchRuntime(
    input: NormalizedAcquireInput,
    command: string[],
    reservation?: ActiveRuntimeLeaseReservation,
  ): Promise<LocalModelRuntimeState> {
    const stateDir = localModelRuntimeStateDir(input.stateRootPath, input.runtimeId);
    await mkdir(stateDir, { recursive: true });
    if (reservation) {
      await writeLocalModelRuntimeLeaseJournalRecord(stateDir, localModelRuntimeLeaseRecordFromAcquireInput({
        reservation,
        input,
        status: "acquiring",
      }));
    }
    const stdoutPath = join(stateDir, "runtime.stdout.log");
    const stderrPath = join(stateDir, "runtime.stderr.log");
    const stdoutFd = openAppend(stdoutPath);
    const stderrFd = openAppend(stderrPath);
    let child: ChildProcess;
    try {
      child = this.spawnProcess(input.command, input.args, {
        cwd: input.cwd,
        detached: true,
        stdio: ["ignore", stdoutFd, stderrFd],
        env: { ...process.env, ...input.env },
      });
    } catch (error) {
      if (reservation) {
        await writeLocalModelRuntimeLeaseJournalRecord(stateDir, localModelRuntimeLeaseRecordFromAcquireInput({
          reservation,
          input,
          status: "crashed",
          lastHeartbeatAt: this.now().toISOString(),
        }));
      }
      throw error;
    } finally {
      closeFd(stdoutFd);
      closeFd(stderrFd);
    }
    if (!child.pid) {
      if (reservation) {
        await writeLocalModelRuntimeLeaseJournalRecord(stateDir, localModelRuntimeLeaseRecordFromAcquireInput({
          reservation,
          input,
          status: "crashed",
          lastHeartbeatAt: this.now().toISOString(),
        }));
      }
      throw new Error("Local model runtime process did not expose a process id.");
    }
    child.unref();
    const now = this.now().toISOString();
    const state: LocalModelRuntimeState = {
      schemaVersion: "ambient-local-model-runtime-state-v1",
      runtimeId: input.runtimeId,
      providerId: input.providerId,
      modelId: input.modelId,
      ...(input.profileId ? { profileId: input.profileId } : {}),
      pid: child.pid,
      status: "running",
      command,
      cwd: input.cwd,
      stateDir,
      stdoutPath,
      stderrPath,
      startedAt: now,
      lastUsedAt: now,
      idleTimeoutMs: input.idleTimeoutMs,
      ...(input.healthUrl ? { healthUrl: input.healthUrl } : {}),
      ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
      ...(input.parentThreadId ? { parentThreadId: input.parentThreadId } : {}),
      ...(input.subagentThreadId ? { subagentThreadId: input.subagentThreadId } : {}),
      ...(input.subagentRunId ? { subagentRunId: input.subagentRunId } : {}),
      ...(input.ownerDisplayName ? { ownerDisplayName: input.ownerDisplayName } : {}),
      ...(input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.estimatedResidentMemoryBytes } : {}),
    };
    await writeLocalModelRuntimeState(state);
    const health = await this.waitForHealth(state, input.startupTimeoutMs);
    if (!health.ok) {
      const failure = localModelRuntimeStartupFailure({
        state,
        startupTimeoutMs: input.startupTimeoutMs,
        health,
      });
      if (reservation) {
        await writeLocalModelRuntimeLeaseJournalRecord(stateDir, localModelRuntimeLeaseRecord({
          leaseId: reservation.leaseId,
          metadata: reservation,
          state: {
            ...state,
            lastUsedAt: this.now().toISOString(),
          },
          status: "crashed",
        }));
      }
      await this.clearState(state);
      throw new LocalModelRuntimeStartupError(failure);
    }
    return this.sampleAndWriteState(state);
  }

  private async waitForHealth(state: LocalModelRuntimeState, startupTimeoutMs: number): Promise<LocalModelRuntimeHealthProbe> {
    const started = Date.now();
    let last: LocalModelRuntimeHealthProbe | undefined;
    while (Date.now() - started < startupTimeoutMs) {
      if (!this.processAlive(state.pid)) {
        return { ok: false, healthUrl: state.healthUrl, error: "Local model runtime exited during startup." };
      }
      last = await probeLocalModelRuntimeHealth(state.healthUrl, { fetchImpl: this.fetchImpl, timeoutMs: 3000 });
      if (last.ok) return last;
      await this.sleep(250);
    }
    if (last) {
      return {
        ...last,
        ok: false,
        timedOut: true,
        error: last.error
          ? `Local model runtime did not become healthy within ${startupTimeoutMs}ms. Last error: ${last.error}`
          : `Local model runtime did not become healthy within ${startupTimeoutMs}ms.`,
      };
    }
    return {
      ok: false,
      healthUrl: state.healthUrl,
      timedOut: true,
      error: `Local model runtime did not become healthy within ${startupTimeoutMs}ms.`,
    };
  }

  private async createLease(
    active: ActiveRuntime,
    source: LocalModelRuntimeAcquireSource,
    reservation: ActiveRuntimeLeaseReservation,
    options: { acquiringJournaled?: boolean } = {},
  ): Promise<LocalModelRuntimeLease> {
    if (active.idleTimer) {
      clearTimeout(active.idleTimer);
      active.idleTimer = undefined;
    }
    const { leaseId, ...metadata } = reservation;
    active.leases.set(leaseId, metadata);
    this.leases.set(leaseId, active);
    if (!options.acquiringJournaled) {
      await writeLocalModelRuntimeLeaseJournalRecord(active.state.stateDir, localModelRuntimeLeaseRecord({
        leaseId,
        metadata,
        state: active.state,
        status: "acquiring",
      }));
    }
    const state = await this.touchActive(active);
    const runtimeLease = localModelRuntimeLeaseRecord({ leaseId, metadata, state });
    await writeLocalModelRuntimeLeaseJournalRecord(state.stateDir, runtimeLease);
    return {
      leaseId,
      state,
      acquisition: {
        schemaVersion: "ambient-local-model-runtime-acquisition-v1",
        source,
        leaseId,
        runtimeId: state.runtimeId,
        providerId: state.providerId,
        modelId: state.modelId,
        ...(state.profileId ? { profileId: state.profileId } : {}),
        pid: state.pid,
        acquiredAt: metadata.acquiredAt,
        activeLeases: active.leases.size,
        runtimeLease,
      },
      runtimeLease,
      release: () => this.release(leaseId),
      touch: () => this.touchLease(leaseId),
    };
  }

  private async touchLease(leaseId: string): Promise<LocalModelRuntimeState> {
    const active = this.leases.get(leaseId);
    if (!active) throw new Error(`Local model runtime lease not found: ${leaseId}`);
    const state = await this.touchActive(active);
    await writeLocalModelRuntimeLeaseJournalRecord(state.stateDir, localModelRuntimeLeaseRecord({
      leaseId,
      metadata: active.leases.get(leaseId) ?? { acquiredAt: state.lastUsedAt },
      state,
    }));
    return state;
  }

  private async touchActive(active: ActiveRuntime): Promise<LocalModelRuntimeState> {
    active.state.lastUsedAt = this.now().toISOString();
    active.state.status = "running";
    delete active.state.stoppedAt;
    active.state = await this.sampleAndWriteState(active.state);
    return active.state;
  }

  private async sampleAndWriteState(state: LocalModelRuntimeState): Promise<LocalModelRuntimeState> {
    const memory = await this.sampleMemory(state.pid).catch(() => undefined);
    const next = memory
      ? {
        ...state,
        actualResidentMemoryBytes: memory.residentMemoryBytes,
        memorySampledAt: memory.sampledAt,
      }
      : state;
    await writeLocalModelRuntimeState(next);
    return next;
  }

  private rememberActive(key: string, state: LocalModelRuntimeState): ActiveRuntime {
    const active: ActiveRuntime = { key, state, leases: new Map() };
    this.activeRuntimes.set(key, active);
    return active;
  }

  private rememberIdleRuntime(key: string, state: LocalModelRuntimeState): ActiveRuntime {
    const active = this.rememberActive(key, state);
    this.scheduleIdleCleanup(active);
    return active;
  }

  private scheduleIdleCleanup(active: ActiveRuntime): void {
    if (active.idleTimer) clearTimeout(active.idleTimer);
    if (active.state.idleTimeoutMs <= 0) return;
    active.idleTimer = setTimeout(() => {
      if (active.leases.size === 0) void this.stopActive(active).catch(() => undefined);
    }, active.state.idleTimeoutMs);
    if (typeof active.idleTimer === "object" && "unref" in active.idleTimer && typeof active.idleTimer.unref === "function") {
      active.idleTimer.unref();
    }
  }

  private async stopActive(active: ActiveRuntime): Promise<void> {
    if (active.idleTimer) clearTimeout(active.idleTimer);
    for (const leaseId of active.leases.keys()) {
      const runtimeLease = localModelRuntimeLeaseRecord({
        leaseId,
        metadata: active.leases.get(leaseId) ?? { acquiredAt: active.state.lastUsedAt },
        state: active.state,
        status: "crashed",
      });
      await writeLocalModelRuntimeLeaseJournalRecord(active.state.stateDir, runtimeLease);
      this.leases.delete(leaseId);
    }
    active.leases.clear();
    active.state = await this.stopState(active.state);
    this.activeRuntimes.delete(active.key);
  }

  private async stopState(state: LocalModelRuntimeState): Promise<LocalModelRuntimeState> {
    if (state.status === "running" && this.processAlive(state.pid)) {
      this.terminate(state.pid);
      await this.sleep(500);
      if (this.processAlive(state.pid)) {
        try {
          this.killProcess(state.pid, "SIGKILL");
        } catch {
          // The process may have exited between liveness checks.
        }
      }
    }
    const stoppedAt = this.now().toISOString();
    const stopped: LocalModelRuntimeState = {
      ...state,
      status: "stopped",
      stoppedAt,
      lastUsedAt: stoppedAt,
    };
    delete stopped.actualResidentMemoryBytes;
    delete stopped.memorySampledAt;
    await writeLocalModelRuntimeState(stopped);
    return stopped;
  }

  private async clearState(state: LocalModelRuntimeState): Promise<void> {
    if (state.status === "running" && this.processAlive(state.pid)) {
      this.terminate(state.pid);
      await this.sleep(500);
      if (this.processAlive(state.pid)) {
        try {
          this.killProcess(state.pid, "SIGKILL");
        } catch {
          // The process may have exited between liveness checks.
        }
      }
    }
    await rm(localModelRuntimeStatePath(state.stateDir), { force: true });
  }

  private terminate(pid: number): void {
    try {
      this.killProcess(pid, "SIGTERM");
    } catch {
      // The process may have exited between the liveness check and termination.
    }
  }
}

function localModelRuntimeLeaseRecord(input: {
  leaseId: string;
  metadata: ActiveRuntimeLeaseMetadata;
  state: LocalModelRuntimeState;
  status?: LocalRuntimeLeaseRecord["status"];
}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: input.leaseId,
    ...(input.metadata.parentThreadId ?? input.state.parentThreadId ? { parentThreadId: input.metadata.parentThreadId ?? input.state.parentThreadId } : {}),
    ...(input.metadata.subagentThreadId ?? input.state.subagentThreadId ? { subagentThreadId: input.metadata.subagentThreadId ?? input.state.subagentThreadId } : {}),
    ...(input.metadata.subagentRunId ?? input.state.subagentRunId ? { subagentRunId: input.metadata.subagentRunId ?? input.state.subagentRunId } : {}),
    ...(input.metadata.ownerDisplayName ?? input.state.ownerDisplayName ? { ownerDisplayName: input.metadata.ownerDisplayName ?? input.state.ownerDisplayName } : {}),
    modelRuntimeId: input.state.runtimeId,
    ...(input.state.profileId ? { modelProfileId: input.state.profileId } : {}),
    modelId: input.state.modelId,
    providerId: input.state.providerId,
    capabilityKind: "local-text",
    ...(input.state.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.state.estimatedResidentMemoryBytes } : {}),
    ...(input.state.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: input.state.actualResidentMemoryBytes } : {}),
    pid: input.state.pid,
    ...(input.state.healthUrl ? { endpoint: input.state.healthUrl } : {}),
    acquiredAt: input.metadata.acquiredAt,
    lastHeartbeatAt: input.state.lastUsedAt,
    status: input.status ?? "running",
  };
}

function localModelRuntimeLeaseRecordFromAcquireInput(input: {
  reservation: ActiveRuntimeLeaseReservation;
  input: NormalizedAcquireInput;
  status: LocalRuntimeLeaseRecord["status"];
  lastHeartbeatAt?: string;
  pid?: number;
}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: input.reservation.leaseId,
    ...(input.input.parentThreadId ? { parentThreadId: input.input.parentThreadId } : {}),
    ...(input.input.subagentThreadId ? { subagentThreadId: input.input.subagentThreadId } : {}),
    ...(input.input.subagentRunId ? { subagentRunId: input.input.subagentRunId } : {}),
    ...(input.input.ownerDisplayName ? { ownerDisplayName: input.input.ownerDisplayName } : {}),
    modelRuntimeId: input.input.runtimeId,
    ...(input.input.profileId ? { modelProfileId: input.input.profileId } : {}),
    modelId: input.input.modelId,
    providerId: input.input.providerId,
    capabilityKind: "local-text",
    ...(input.input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.input.estimatedResidentMemoryBytes } : {}),
    ...(input.pid !== undefined ? { pid: input.pid } : {}),
    ...(input.input.healthUrl ? { endpoint: input.input.healthUrl } : {}),
    acquiredAt: input.reservation.acquiredAt,
    lastHeartbeatAt: input.lastHeartbeatAt ?? input.reservation.acquiredAt,
    status: input.status,
  };
}

function createLocalRuntimeLeaseReservation(
  now: Date,
  input: NormalizedAcquireInput,
): ActiveRuntimeLeaseReservation {
  return {
    acquiredAt: now.toISOString(),
    leaseId: `local-model-lease-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
    ...(input.parentThreadId ? { parentThreadId: input.parentThreadId } : {}),
    ...(input.subagentThreadId ? { subagentThreadId: input.subagentThreadId } : {}),
    ...(input.subagentRunId ? { subagentRunId: input.subagentRunId } : {}),
    ...(input.ownerDisplayName ? { ownerDisplayName: input.ownerDisplayName } : {}),
  };
}

export function isLocalModelRuntimeStartupError(error: unknown): error is LocalModelRuntimeStartupError {
  if (error instanceof LocalModelRuntimeStartupError) return true;
  if (!error || typeof error !== "object") return false;
  const failure = (error as { failure?: unknown }).failure;
  return Boolean(
    failure &&
    typeof failure === "object" &&
    (failure as { schemaVersion?: unknown }).schemaVersion === "ambient-local-model-runtime-startup-failure-v1",
  );
}

export async function probeLocalModelRuntimeHealth(
  healthUrl: string | undefined,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<LocalModelRuntimeHealthProbe> {
  if (!healthUrl) {
    return {
      ok: true,
      textPreview: "No health URL configured; process liveness is the health signal.",
    };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);
  const started = Date.now();
  try {
    const response = await fetchImpl(healthUrl, { signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      healthUrl,
      statusCode: response.status,
      latencyMs: Date.now() - started,
      body: parseJsonLenient(text),
      textPreview: previewText(text, 2000),
    };
  } catch (error) {
    return {
      ok: false,
      healthUrl,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function localModelRuntimeStateDir(stateRootPath: string, runtimeId: string): string {
  return resolve(stateRootPath, sanitizePathSegment(runtimeId));
}

export async function readLocalModelRuntimeState(stateRootPath: string, runtimeId: string): Promise<LocalModelRuntimeState | undefined> {
  return readLocalModelRuntimeStateFromDir(localModelRuntimeStateDir(stateRootPath, runtimeId));
}

async function readLocalModelRuntimeStateFromDir(stateDir: string): Promise<LocalModelRuntimeState | undefined> {
  try {
    const parsed = JSON.parse(await readFile(localModelRuntimeStatePath(stateDir), "utf8")) as LocalModelRuntimeState;
    if (parsed.schemaVersion !== "ambient-local-model-runtime-state-v1") return undefined;
    return {
      ...parsed,
      status: parsed.status === "stopped" ? "stopped" : "running",
      idleTimeoutMs: typeof parsed.idleTimeoutMs === "number" ? parsed.idleTimeoutMs : defaultIdleTimeoutMs,
    };
  } catch {
    return undefined;
  }
}

export async function readLocalModelRuntimeLeaseJournal(
  stateRootPath: string,
  runtimeId: string,
): Promise<LocalRuntimeLeaseRecord[]> {
  const journal = await readLocalModelRuntimeLeaseJournalFromDir(localModelRuntimeStateDir(stateRootPath, runtimeId));
  return journal?.leases ?? [];
}

export async function readRepairedLocalModelRuntimeLeaseJournal(
  stateRootPath: string,
  runtimeId: string,
  options: LocalModelRuntimeLeaseJournalRepairOptions = {},
): Promise<LocalRuntimeLeaseRecord[]> {
  return (await readRepairedLocalModelRuntimeLeaseJournalWithRecovery(stateRootPath, runtimeId, options)).leases;
}

export async function readRepairedLocalModelRuntimeLeaseJournalWithRecovery(
  stateRootPath: string,
  runtimeId: string,
  options: LocalModelRuntimeLeaseJournalRepairOptions = {},
): Promise<LocalModelRuntimeLeaseJournalRecoveryResult> {
  const now = (options.now ?? (() => new Date()))();
  const result = await readRepairedLocalModelRuntimeLeaseJournalFromDir(
    localModelRuntimeStateDir(stateRootPath, runtimeId),
    { ...options, now: () => now },
  );
  return {
    leases: result.journal?.leases ?? [],
    recovery: result.recovery,
  };
}

export async function readLocalModelRuntimeLeaseJournals(
  stateRootPath: string,
): Promise<LocalRuntimeLeaseRecord[]> {
  const root = resolve(stateRootPath);
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  });
  const journals = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => readLocalModelRuntimeLeaseJournalFromDir(join(root, entry.name))));
  return mergeLocalRuntimeLeaseRecords(journals.flatMap((journal) => journal?.leases ?? []));
}

export async function readRepairedLocalModelRuntimeLeaseJournals(
  stateRootPath: string,
  options: LocalModelRuntimeLeaseJournalRepairOptions = {},
): Promise<LocalRuntimeLeaseRecord[]> {
  return (await readRepairedLocalModelRuntimeLeaseJournalsWithRecovery(stateRootPath, options)).leases;
}

export async function readRepairedLocalModelRuntimeLeaseJournalsWithRecovery(
  stateRootPath: string,
  options: LocalModelRuntimeLeaseJournalRepairOptions = {},
): Promise<LocalModelRuntimeLeaseJournalRecoveryResult> {
  const root = resolve(stateRootPath);
  const now = (options.now ?? (() => new Date()))();
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  });
  const journals = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => readRepairedLocalModelRuntimeLeaseJournalFromDir(join(root, entry.name), { ...options, now: () => now })));
  return {
    leases: mergeLocalRuntimeLeaseRecords(journals.flatMap((result) => result.journal?.leases ?? [])),
    recovery: mergeLocalModelRuntimeLeaseRecoverySummaries(
      journals.map((result) => result.recovery),
      now.toISOString(),
    ),
  };
}

async function writeLocalModelRuntimeState(state: LocalModelRuntimeState): Promise<void> {
  await mkdir(state.stateDir, { recursive: true });
  await writeFile(localModelRuntimeStatePath(state.stateDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function localModelRuntimeStatePath(stateDir: string): string {
  return join(stateDir, "runtime-state.json");
}

async function writeLocalModelRuntimeLeaseJournalRecord(
  stateDir: string,
  lease: LocalRuntimeLeaseRecord,
): Promise<void> {
  const existing = await readLocalModelRuntimeLeaseJournalFromDir(stateDir);
  const leases = mergeLocalRuntimeLeaseRecords([
    lease,
    ...(existing?.leases ?? []),
  ]).slice(0, maxLocalRuntimeLeaseJournalEntries);
  const journal: LocalModelRuntimeLeaseJournal = {
    schemaVersion: "ambient-local-runtime-lease-journal-v1",
    runtimeId: lease.modelRuntimeId ?? localRuntimeIdFromStateDir(stateDir),
    updatedAt: lease.lastHeartbeatAt,
    leases,
  };
  await mkdir(stateDir, { recursive: true });
  await writeFile(localModelRuntimeLeaseJournalPath(stateDir), `${JSON.stringify(journal, null, 2)}\n`, "utf8");
}

async function readLocalModelRuntimeLeaseJournalFromDir(
  stateDir: string,
): Promise<LocalModelRuntimeLeaseJournal | undefined> {
  try {
    const parsed = JSON.parse(await readFile(localModelRuntimeLeaseJournalPath(stateDir), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const record = parsed as {
      schemaVersion?: unknown;
      runtimeId?: unknown;
      updatedAt?: unknown;
      leases?: unknown;
    };
    if (record.schemaVersion !== "ambient-local-runtime-lease-journal-v1") return undefined;
    const runtimeId = typeof record.runtimeId === "string" && record.runtimeId.trim()
      ? record.runtimeId.trim()
      : localRuntimeIdFromStateDir(stateDir);
    const leases = Array.isArray(record.leases)
      ? mergeLocalRuntimeLeaseRecords(record.leases.flatMap((lease) => normalizeLocalRuntimeLeaseRecord(lease) ?? []))
      : [];
    return {
      schemaVersion: "ambient-local-runtime-lease-journal-v1",
      runtimeId,
      updatedAt: typeof record.updatedAt === "string" && record.updatedAt.trim()
        ? record.updatedAt
        : leases[0]?.lastHeartbeatAt ?? new Date(0).toISOString(),
      leases,
    };
  } catch (error) {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  }
}

async function readRepairedLocalModelRuntimeLeaseJournalFromDir(
  stateDir: string,
  options: LocalModelRuntimeLeaseJournalRepairOptions,
): Promise<{ journal?: LocalModelRuntimeLeaseJournal; recovery: LocalModelRuntimeLeaseRecoverySummary }> {
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const journal = await readLocalModelRuntimeLeaseJournalFromDir(stateDir);
  if (!journal?.leases.length) {
    return { journal, recovery: emptyLocalModelRuntimeLeaseRecoverySummary(observedAt) };
  }
  const state = await readLocalModelRuntimeStateFromDir(stateDir);
  const processAlive = options.processAlive ?? defaultProcessAlive;
  const staleRecovery = localModelRuntimeStaleLeaseRecoverySummary({
    leases: journal.leases,
    observedAt,
    staleMs: options.staleMs,
    source: "lease_journal",
  });
  if (!state || state.status !== "running" || !state.pid || processAlive(state.pid)) {
    return { journal, recovery: staleRecovery };
  }
  const activeLeases = journal.leases.filter((lease) => isActiveLocalRuntimeLease(lease));
  if (!activeLeases.length) return { journal, recovery: staleRecovery };
  const crashRecovery = activeLeases.map((lease) => localModelRuntimeLeaseRecoveryIssue({
    source: "lease_journal",
    kind: "dead_runtime_crashed",
    runtimeId: journal.runtimeId,
    lease,
    observedAt,
    repaired: true,
    pid: lease.pid ?? state.pid,
    lastHeartbeatAt: observedAt,
    status: "crashed",
    message: `Local runtime lease ${lease.leaseId} was repaired to crashed because managed runtime ${journal.runtimeId} pid ${state.pid} was not alive.`,
  }));
  for (const lease of activeLeases) {
    await writeLocalModelRuntimeLeaseJournalRecord(stateDir, {
      ...lease,
      pid: lease.pid ?? state.pid,
      lastHeartbeatAt: observedAt,
      status: "crashed",
    });
  }
  const repairedJournal = await readLocalModelRuntimeLeaseJournalFromDir(stateDir);
  return {
    journal: repairedJournal,
    recovery: mergeLocalModelRuntimeLeaseRecoverySummaries([
      staleRecovery,
      localModelRuntimeLeaseRecoverySummary(crashRecovery, observedAt),
    ], observedAt),
  };
}

export function localModelRuntimeStaleLeaseRecoverySummary(input: {
  leases: readonly LocalRuntimeLeaseRecord[];
  observedAt: string;
  staleMs?: number;
  source: LocalModelRuntimeLeaseRecoverySource;
}): LocalModelRuntimeLeaseRecoverySummary {
  if (input.staleMs === undefined) return emptyLocalModelRuntimeLeaseRecoverySummary(input.observedAt);
  const issues = input.leases
    .filter((lease) =>
      isActiveLocalRuntimeLease(lease) &&
      !isActiveLocalRuntimeLease(lease, {
        now: input.observedAt,
        staleMs: input.staleMs,
      })
    )
    .map((lease) => localModelRuntimeLeaseRecoveryIssue({
      source: input.source,
      kind: "stale_active_lease",
      runtimeId: lease.modelRuntimeId,
      lease,
      observedAt: input.observedAt,
      repaired: false,
      status: lease.status,
      message: `Local runtime lease ${lease.leaseId} last heartbeat at ${lease.lastHeartbeatAt} is stale at ${input.observedAt}; it remains visible but no longer blocks ordinary runtime lifecycle changes.`,
    }));
  return localModelRuntimeLeaseRecoverySummary(issues, input.observedAt);
}

function localModelRuntimeLeaseRecoveryIssue(input: {
  source: LocalModelRuntimeLeaseRecoverySource;
  kind: LocalModelRuntimeLeaseRecoveryIssueKind;
  runtimeId?: string;
  lease: LocalRuntimeLeaseRecord;
  observedAt: string;
  repaired: boolean;
  status: LocalRuntimeLeaseRecord["status"];
  lastHeartbeatAt?: string;
  pid?: number;
  message: string;
}): LocalModelRuntimeLeaseRecoveryIssue {
  const lease = input.lease;
  const pid = input.pid ?? lease.pid;
  return {
    schemaVersion: "ambient-local-runtime-lease-recovery-issue-v1",
    source: input.source,
    kind: input.kind,
    ...(input.runtimeId ? { runtimeId: input.runtimeId } : {}),
    leaseId: lease.leaseId,
    ...(lease.parentThreadId ? { parentThreadId: lease.parentThreadId } : {}),
    ...(lease.subagentThreadId ? { subagentThreadId: lease.subagentThreadId } : {}),
    ...(lease.subagentRunId ? { subagentRunId: lease.subagentRunId } : {}),
    ...(lease.ownerDisplayName ? { ownerDisplayName: lease.ownerDisplayName } : {}),
    ...(lease.modelRuntimeId ? { modelRuntimeId: lease.modelRuntimeId } : {}),
    ...(lease.modelProfileId ? { modelProfileId: lease.modelProfileId } : {}),
    ...(lease.modelId ? { modelId: lease.modelId } : {}),
    ...(lease.providerId ? { providerId: lease.providerId } : {}),
    capabilityKind: lease.capabilityKind,
    ...(pid !== undefined ? { pid } : {}),
    ...(lease.endpoint ? { endpoint: lease.endpoint } : {}),
    acquiredAt: lease.acquiredAt,
    previousLastHeartbeatAt: lease.lastHeartbeatAt,
    lastHeartbeatAt: input.lastHeartbeatAt ?? lease.lastHeartbeatAt,
    previousStatus: lease.status,
    status: input.status,
    repaired: input.repaired,
    observedAt: input.observedAt,
    message: input.message,
  };
}

export function mergeLocalModelRuntimeLeaseRecoverySummaries(
  summaries: readonly LocalModelRuntimeLeaseRecoverySummary[],
  capturedAt: string,
): LocalModelRuntimeLeaseRecoverySummary {
  return localModelRuntimeLeaseRecoverySummary(
    summaries.flatMap((summary) => summary.issues),
    capturedAt,
  );
}

function localModelRuntimeLeaseRecoverySummary(
  issues: readonly LocalModelRuntimeLeaseRecoveryIssue[],
  capturedAt: string,
): LocalModelRuntimeLeaseRecoverySummary {
  const uniqueIssues = dedupeLocalModelRuntimeLeaseRecoveryIssues(issues);
  return {
    schemaVersion: "ambient-local-runtime-lease-recovery-v1",
    capturedAt,
    issueCount: uniqueIssues.length,
    repairedLeaseIds: uniqueLeaseIds(uniqueIssues
      .filter((issue) => issue.repaired)
      .map((issue) => issue.leaseId)),
    staleLeaseIds: uniqueLeaseIds(uniqueIssues
      .filter((issue) => issue.kind === "stale_active_lease")
      .map((issue) => issue.leaseId)),
    crashedLeaseIds: uniqueLeaseIds(uniqueIssues
      .filter((issue) => issue.kind === "dead_runtime_crashed" || issue.status === "crashed")
      .map((issue) => issue.leaseId)),
    issues: uniqueIssues,
  };
}

function emptyLocalModelRuntimeLeaseRecoverySummary(capturedAt: string): LocalModelRuntimeLeaseRecoverySummary {
  return localModelRuntimeLeaseRecoverySummary([], capturedAt);
}

function dedupeLocalModelRuntimeLeaseRecoveryIssues(
  issues: readonly LocalModelRuntimeLeaseRecoveryIssue[],
): LocalModelRuntimeLeaseRecoveryIssue[] {
  const seen = new Set<string>();
  const result: LocalModelRuntimeLeaseRecoveryIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.kind}:${issue.leaseId}:${issue.status}:${issue.repaired ? "repaired" : "observed"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

function uniqueLeaseIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function localModelRuntimeLeaseJournalPath(stateDir: string): string {
  return join(stateDir, "runtime-leases.json");
}

function normalizeAcquireInput(input: LocalModelRuntimeAcquireInput): NormalizedAcquireInput {
  const runtimeId = input.runtimeId.trim();
  if (!runtimeId) throw new Error("Local model runtime requires a runtimeId.");
  const command = input.command.trim();
  if (!command) throw new Error("Local model runtime requires a launch command.");
  const modelId = input.modelId.trim();
  if (!modelId) throw new Error("Local model runtime requires a modelId.");
  return {
    ...input,
    runtimeId,
    providerId: input.providerId?.trim() || defaultProviderId,
    modelId,
    profileId: input.profileId?.trim(),
    stateRootPath: resolve(input.stateRootPath),
    command,
    args: input.args ?? [],
    cwd: resolve(input.cwd ?? input.stateRootPath),
    startupTimeoutMs: normalizeNonNegativeInteger(input.startupTimeoutMs ?? defaultStartupTimeoutMs, "startupTimeoutMs"),
    idleTimeoutMs: normalizeNonNegativeInteger(input.idleTimeoutMs ?? defaultIdleTimeoutMs, "idleTimeoutMs"),
  };
}

function normalizedAcquireInputFromState(
  state: LocalModelRuntimeState,
  stateRootPath?: string,
): NormalizedAcquireInput {
  const [command, ...args] = Array.isArray(state.command) ? state.command : [];
  if (!command?.trim()) throw new Error("Persisted local model runtime state does not include a restartable command.");
  return normalizeAcquireInput({
    runtimeId: state.runtimeId,
    providerId: state.providerId,
    modelId: state.modelId,
    ...(state.profileId ? { profileId: state.profileId } : {}),
    stateRootPath: stateRootPath ? resolve(stateRootPath) : dirname(state.stateDir),
    command,
    args,
    cwd: state.cwd,
    ...(state.healthUrl ? { healthUrl: state.healthUrl } : {}),
    ...(state.ownerThreadId ? { ownerThreadId: state.ownerThreadId } : {}),
    ...(state.parentThreadId ? { parentThreadId: state.parentThreadId } : {}),
    ...(state.subagentThreadId ? { subagentThreadId: state.subagentThreadId } : {}),
    ...(state.subagentRunId ? { subagentRunId: state.subagentRunId } : {}),
    ...(state.ownerDisplayName ? { ownerDisplayName: state.ownerDisplayName } : {}),
    idleTimeoutMs: state.idleTimeoutMs,
    ...(state.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: state.estimatedResidentMemoryBytes } : {}),
  });
}

function runtimeKey(input: NormalizedAcquireInput): string {
  return [
    input.runtimeId,
    input.providerId,
    input.modelId,
    input.profileId ?? "",
    input.command,
    ...input.args,
    input.cwd,
    input.healthUrl ?? "",
  ].join("\0");
}

function sameCommand(left: string[] | undefined, right: string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeNonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for ${name}: ${value}`);
  const normalized = Math.floor(value);
  if (normalized < 0) throw new Error(`${name} must be non-negative.`);
  return normalized;
}

function localModelRuntimeStartupFailure(input: {
  state: LocalModelRuntimeState;
  startupTimeoutMs: number;
  health: LocalModelRuntimeHealthProbe;
}): LocalModelRuntimeStartupFailure {
  const reason: LocalModelRuntimeStartupFailureReason = input.health.error === "Local model runtime exited during startup."
    ? "process_exited"
    : input.health.timedOut
      ? "startup_timeout"
      : "health_unhealthy";
  return {
    schemaVersion: "ambient-local-model-runtime-startup-failure-v1",
    reason,
    message: `Local model runtime did not become healthy: ${input.health.error ?? input.health.textPreview ?? "unknown health response"}`,
    runtimeId: input.state.runtimeId,
    providerId: input.state.providerId,
    modelId: input.state.modelId,
    ...(input.state.profileId ? { profileId: input.state.profileId } : {}),
    pid: input.state.pid,
    command: input.state.command,
    cwd: input.state.cwd,
    stateDir: input.state.stateDir,
    stdoutPath: input.state.stdoutPath,
    stderrPath: input.state.stderrPath,
    startupTimeoutMs: input.startupTimeoutMs,
    health: input.health,
  };
}

function localModelRuntimeIdleCleanupDueAt(releasedAt: string, idleTimeoutMs: number): string | undefined {
  const timestamp = Date.parse(releasedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp + idleTimeoutMs).toISOString();
}

function openAppend(path: string): number {
  return openSync(path, "a");
}

function closeFd(fd: number): void {
  try {
    closeSync(fd);
  } catch {
    // The descriptor may already have been consumed by a failed spawn on some platforms.
  }
}

function parseJsonLenient(text: string): unknown {
  try {
    return text.trim() ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function previewText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "--").replace(/^[.-]+|[.-]+$/g, "") || "local-model-runtime";
}

function localRuntimeIdFromStateDir(stateDir: string): string {
  const normalized = resolve(stateDir);
  const segment = normalized.split(/[\\/]/).filter(Boolean).pop();
  return segment?.trim() || "local-model-runtime";
}

function mergeLocalRuntimeLeaseRecords(leases: LocalRuntimeLeaseRecord[]): LocalRuntimeLeaseRecord[] {
  const byId = new Map<string, LocalRuntimeLeaseRecord>();
  for (const lease of leases) {
    const existing = byId.get(lease.leaseId);
    if (!existing || leaseRecordTimestamp(lease) > leaseRecordTimestamp(existing)) {
      byId.set(lease.leaseId, lease);
    }
  }
  return [...byId.values()].sort((left, right) => leaseRecordTimestamp(right) - leaseRecordTimestamp(left));
}

function normalizeLocalRuntimeLeaseRecord(value: unknown): LocalRuntimeLeaseRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== "ambient-local-runtime-lease-v1") return undefined;
  const leaseId = stringValue(record.leaseId);
  const capabilityKind = stringValue(record.capabilityKind);
  const acquiredAt = stringValue(record.acquiredAt);
  const lastHeartbeatAt = stringValue(record.lastHeartbeatAt);
  const status = stringValue(record.status);
  if (!leaseId || !capabilityKind || !acquiredAt || !lastHeartbeatAt || !status) return undefined;
  if (!["local-deep-research", "minicpm-v", "local-text", "voice", "embeddings"].includes(capabilityKind)) return undefined;
  if (!["acquiring", "running", "idle", "releasing", "released", "crashed"].includes(status)) return undefined;
  const parentThreadId = stringValue(record.parentThreadId);
  const subagentThreadId = stringValue(record.subagentThreadId);
  const subagentRunId = stringValue(record.subagentRunId);
  const ownerDisplayName = stringValue(record.ownerDisplayName);
  const modelRuntimeId = stringValue(record.modelRuntimeId);
  const modelProfileId = stringValue(record.modelProfileId);
  const modelId = stringValue(record.modelId);
  const providerId = stringValue(record.providerId);
  const estimatedResidentMemoryBytes = numberValue(record.estimatedResidentMemoryBytes);
  const actualResidentMemoryBytes = numberValue(record.actualResidentMemoryBytes);
  const pid = numberValue(record.pid);
  const endpoint = stringValue(record.endpoint);
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId,
    ...(parentThreadId ? { parentThreadId } : {}),
    ...(subagentThreadId ? { subagentThreadId } : {}),
    ...(subagentRunId ? { subagentRunId } : {}),
    ...(ownerDisplayName ? { ownerDisplayName } : {}),
    ...(modelRuntimeId ? { modelRuntimeId } : {}),
    ...(modelProfileId ? { modelProfileId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(providerId ? { providerId } : {}),
    capabilityKind: capabilityKind as LocalRuntimeLeaseRecord["capabilityKind"],
    ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    ...(actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes } : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(endpoint ? { endpoint } : {}),
    acquiredAt,
    lastHeartbeatAt,
    status: status as LocalRuntimeLeaseRecord["status"],
  };
}

function leaseRecordTimestamp(lease: LocalRuntimeLeaseRecord): number {
  const heartbeat = Date.parse(lease.lastHeartbeatAt);
  if (Number.isFinite(heartbeat)) return heartbeat;
  const acquired = Date.parse(lease.acquiredAt);
  return Number.isFinite(acquired) ? acquired : 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultKillProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  process.kill(pid, signal);
}
