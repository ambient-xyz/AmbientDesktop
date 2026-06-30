import type { ChildProcess, SpawnOptions } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { LocalRuntimeLeaseRecord } from "../../shared/localRuntimeTypes";
import type {
  ActiveRuntimeLeaseReservation,
  LocalModelRuntimeHealthProbe,
  LocalModelRuntimeStartupFailure,
  LocalModelRuntimeStartupFailureReason,
  LocalModelRuntimeState,
  NormalizedAcquireInput,
} from "./localModelRuntimeTypes";

interface RuntimeLeaseRecordFromStateInput {
  leaseId: string;
  metadata: ActiveRuntimeLeaseReservation;
  state: LocalModelRuntimeState;
  status?: LocalRuntimeLeaseRecord["status"];
}

interface RuntimeLeaseRecordFromAcquireInput {
  reservation: ActiveRuntimeLeaseReservation;
  input: NormalizedAcquireInput;
  status: LocalRuntimeLeaseRecord["status"];
  lastHeartbeatAt?: string;
  pid?: number;
}

export interface LocalModelRuntimeLaunchControllerOptions {
  spawnProcess: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  fetchImpl: typeof fetch;
  processAlive: (pid: number) => boolean;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  stateDirForRuntime: (stateRootPath: string, runtimeId: string) => string;
  writeRuntimeState: (state: LocalModelRuntimeState) => Promise<void>;
  writeLeaseJournalRecord: (stateDir: string, lease: LocalRuntimeLeaseRecord) => Promise<void>;
  leaseRecordFromAcquireInput: (input: RuntimeLeaseRecordFromAcquireInput) => LocalRuntimeLeaseRecord;
  leaseRecordFromState: (input: RuntimeLeaseRecordFromStateInput) => LocalRuntimeLeaseRecord;
  clearRuntimeState: (state: LocalModelRuntimeState) => Promise<void>;
  sampleAndWriteState: (state: LocalModelRuntimeState) => Promise<LocalModelRuntimeState>;
}

export class LocalModelRuntimeStartupError extends Error {
  readonly failure: LocalModelRuntimeStartupFailure;

  constructor(failure: LocalModelRuntimeStartupFailure) {
    super(failure.message);
    this.name = "LocalModelRuntimeStartupError";
    this.failure = failure;
  }
}

export class LocalModelRuntimeLaunchController {
  private readonly spawnProcess: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  private readonly fetchImpl: typeof fetch;
  private readonly processAlive: (pid: number) => boolean;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly stateDirForRuntime: (stateRootPath: string, runtimeId: string) => string;
  private readonly writeRuntimeState: (state: LocalModelRuntimeState) => Promise<void>;
  private readonly writeLeaseJournalRecord: (stateDir: string, lease: LocalRuntimeLeaseRecord) => Promise<void>;
  private readonly leaseRecordFromAcquireInput: (input: RuntimeLeaseRecordFromAcquireInput) => LocalRuntimeLeaseRecord;
  private readonly leaseRecordFromState: (input: RuntimeLeaseRecordFromStateInput) => LocalRuntimeLeaseRecord;
  private readonly clearRuntimeState: (state: LocalModelRuntimeState) => Promise<void>;
  private readonly sampleAndWriteState: (state: LocalModelRuntimeState) => Promise<LocalModelRuntimeState>;

  constructor(options: LocalModelRuntimeLaunchControllerOptions) {
    this.spawnProcess = options.spawnProcess;
    this.fetchImpl = options.fetchImpl;
    this.processAlive = options.processAlive;
    this.now = options.now;
    this.sleep = options.sleep;
    this.stateDirForRuntime = options.stateDirForRuntime;
    this.writeRuntimeState = options.writeRuntimeState;
    this.writeLeaseJournalRecord = options.writeLeaseJournalRecord;
    this.leaseRecordFromAcquireInput = options.leaseRecordFromAcquireInput;
    this.leaseRecordFromState = options.leaseRecordFromState;
    this.clearRuntimeState = options.clearRuntimeState;
    this.sampleAndWriteState = options.sampleAndWriteState;
  }

  async launchRuntime(
    input: NormalizedAcquireInput,
    command: string[],
    reservation?: ActiveRuntimeLeaseReservation,
  ): Promise<LocalModelRuntimeState> {
    const stateDir = this.stateDirForRuntime(input.stateRootPath, input.runtimeId);
    await mkdir(stateDir, { recursive: true });
    if (reservation) {
      await this.writeLeaseJournalRecord(
        stateDir,
        this.leaseRecordFromAcquireInput({
          reservation,
          input,
          status: "acquiring",
        }),
      );
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
        await this.writeLeaseJournalRecord(
          stateDir,
          this.leaseRecordFromAcquireInput({
            reservation,
            input,
            status: "crashed",
            lastHeartbeatAt: this.now().toISOString(),
          }),
        );
      }
      throw error;
    } finally {
      closeFd(stdoutFd);
      closeFd(stderrFd);
    }
    if (!child.pid) {
      if (reservation) {
        await this.writeLeaseJournalRecord(
          stateDir,
          this.leaseRecordFromAcquireInput({
            reservation,
            input,
            status: "crashed",
            lastHeartbeatAt: this.now().toISOString(),
          }),
        );
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
    await this.writeRuntimeState(state);
    const health = await this.waitForHealth(state, input.startupTimeoutMs);
    if (!health.ok) {
      const failure = localModelRuntimeStartupFailure({
        state,
        startupTimeoutMs: input.startupTimeoutMs,
        health,
      });
      if (reservation) {
        await this.writeLeaseJournalRecord(
          stateDir,
          this.leaseRecordFromState({
            leaseId: reservation.leaseId,
            metadata: reservation,
            state: {
              ...state,
              lastUsedAt: this.now().toISOString(),
            },
            status: "crashed",
          }),
        );
      }
      await this.clearRuntimeState(state);
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

function localModelRuntimeStartupFailure(input: {
  state: LocalModelRuntimeState;
  startupTimeoutMs: number;
  health: LocalModelRuntimeHealthProbe;
}): LocalModelRuntimeStartupFailure {
  const reason: LocalModelRuntimeStartupFailureReason =
    input.health.error === "Local model runtime exited during startup."
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
