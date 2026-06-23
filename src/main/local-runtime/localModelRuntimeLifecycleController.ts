import type { LocalRuntimeLeaseRecord } from "../../shared/localRuntimeTypes";
import type {
  LocalModelRuntimeRestartInput,
  LocalModelRuntimeRestartResult,
  LocalModelRuntimeStartInput,
  LocalModelRuntimeStartResult,
  LocalModelRuntimeState,
  LocalModelRuntimeStopInput,
  LocalModelRuntimeStopResult,
} from "./localModelRuntimeManager";

export interface LocalModelRuntimeLifecycleActiveRuntime {
  key: string;
  state: LocalModelRuntimeState;
  leases: ReadonlyMap<string, unknown>;
  idleTimer?: ReturnType<typeof setTimeout>;
}

export interface LocalModelRuntimeLifecycleControllerOptions {
  findActiveRuntime(runtimeId: string): LocalModelRuntimeLifecycleActiveRuntime | undefined;
  activeLeaseRecords(active: LocalModelRuntimeLifecycleActiveRuntime, leaseIds: string[]): LocalRuntimeLeaseRecord[];
  activePersistedLeaseRecords(stateRootPath: string, runtimeId: string): Promise<LocalRuntimeLeaseRecord[]>;
  readRuntimeState(stateRootPath: string, runtimeId: string): Promise<LocalModelRuntimeState | undefined>;
  processAlive(pid: number): boolean;
  now(): Date;
  dropInactiveRuntime(active: LocalModelRuntimeLifecycleActiveRuntime): void;
  stopActiveRuntime(active: LocalModelRuntimeLifecycleActiveRuntime): Promise<void>;
  stopPersistedRuntime(state: LocalModelRuntimeState): Promise<LocalModelRuntimeState>;
  startPersistedRuntime(state: LocalModelRuntimeState, stateRootPath: string): Promise<LocalModelRuntimeState>;
  restartActiveRuntime(active: LocalModelRuntimeLifecycleActiveRuntime, stateRootPath?: string): Promise<LocalModelRuntimeState>;
  restartPersistedRuntime(state: LocalModelRuntimeState, stateRootPath: string): Promise<LocalModelRuntimeState>;
}

export class LocalModelRuntimeLifecycleController {
  constructor(private readonly options: LocalModelRuntimeLifecycleControllerOptions) {}

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
    const active = this.options.findActiveRuntime(runtimeId);
    if (active) {
      const activeLeaseIds = [...active.leases.keys()];
      if (activeLeaseIds.length > 0) {
        const activeLeases = this.options.activeLeaseRecords(active, activeLeaseIds);
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
        await this.options.stopActiveRuntime(active);
        return {
          schemaVersion: "ambient-local-model-runtime-stop-v1",
          status: "stopped",
          runtimeId,
          forceRequested,
          pid,
          stoppedAt: this.options.now().toISOString(),
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
    const persisted = await this.options.readRuntimeState(input.stateRootPath, runtimeId);
    if (!persisted?.pid) {
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "not-found",
        runtimeId,
        forceRequested,
        reason: "No persisted managed local runtime state was found for that runtime id.",
      };
    }
    const persistedActiveLeases = await this.options.activePersistedLeaseRecords(input.stateRootPath, runtimeId);
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
      await this.options.stopPersistedRuntime(persisted);
      return {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "stopped",
        runtimeId,
        forceRequested,
        pid: persisted.pid,
        stoppedAt: this.options.now().toISOString(),
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

    const active = this.options.findActiveRuntime(runtimeId);
    if (active) {
      const activeLeaseIds = [...active.leases.keys()];
      if (activeLeaseIds.length > 0) {
        const activeLeases = this.options.activeLeaseRecords(active, activeLeaseIds);
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
      if (this.options.processAlive(active.state.pid)) {
        return {
          schemaVersion: "ambient-local-model-runtime-start-v1",
          status: "blocked",
          runtimeId,
          previousPid: active.state.pid,
          reason: "Local runtime is already running.",
        };
      }
      this.options.dropInactiveRuntime(active);
    }

    if (!input.stateRootPath) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "not-found",
        runtimeId,
        reason: "Ambient has no active in-process runtime with that id and no persisted state root was provided.",
      };
    }
    const persisted = await this.options.readRuntimeState(input.stateRootPath, runtimeId);
    if (!persisted?.pid) {
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "not-found",
        runtimeId,
        reason: "No persisted managed local runtime state was found for that runtime id.",
      };
    }
    const persistedActiveLeases = await this.options.activePersistedLeaseRecords(input.stateRootPath, runtimeId);
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
    if (persisted.status === "running" && this.options.processAlive(persisted.pid)) {
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
      const state = await this.options.startPersistedRuntime(persisted, input.stateRootPath);
      return {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "started",
        runtimeId,
        previousPid,
        pid: state.pid,
        startedAt: this.options.now().toISOString(),
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

    const active = this.options.findActiveRuntime(runtimeId);
    if (active) {
      const activeLeaseIds = [...active.leases.keys()];
      if (activeLeaseIds.length > 0) {
        const activeLeases = this.options.activeLeaseRecords(active, activeLeaseIds);
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
        const state = await this.options.restartActiveRuntime(active, input.stateRootPath);
        return {
          schemaVersion: "ambient-local-model-runtime-restart-v1",
          status: "restarted",
          runtimeId,
          forceRequested,
          previousPid,
          pid: state.pid,
          restartedAt: this.options.now().toISOString(),
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
    const persisted = await this.options.readRuntimeState(input.stateRootPath, runtimeId);
    if (!persisted?.pid) {
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "not-found",
        runtimeId,
        forceRequested,
        reason: "No persisted managed local runtime state was found for that runtime id.",
      };
    }
    const persistedActiveLeases = await this.options.activePersistedLeaseRecords(input.stateRootPath, runtimeId);
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
      const state = await this.options.restartPersistedRuntime(persisted, input.stateRootPath);
      return {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "restarted",
        runtimeId,
        forceRequested,
        previousPid,
        pid: state.pid,
        restartedAt: this.options.now().toISOString(),
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
}
