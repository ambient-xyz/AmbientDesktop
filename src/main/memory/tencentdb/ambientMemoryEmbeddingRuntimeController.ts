import type { AgentMemorySettings } from "../../../shared/agentMemorySettings";
import type {
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryOperationStatus,
} from "../../../shared/agentMemoryDiagnostics";
import type { EmbeddingProviderCandidate } from "../../../shared/localRuntimeTypes";
import {
  resolveAmbientTencentMemoryEmbeddingProvider,
  type AmbientTencentMemoryEmbeddingPrepareInput,
  type AmbientTencentMemoryEmbeddingPrepareResult,
  type AmbientTencentMemoryEmbeddingResolution,
  type AmbientTencentMemoryEmbeddingStartInput,
  type AmbientTencentMemoryEmbeddingStartResult,
} from "./ambientEmbeddingProvider";
import type { TencentMemoryConfig, TencentMemoryCore, TencentMemoryLogger } from "./upstreamContracts";

export interface AmbientTencentMemoryRuntimeEmbeddingControllerOptions {
  config?: TencentMemoryConfig;
  memorySettings: AgentMemorySettings;
  workspacePath: string;
  listEmbeddingProviders?: (workspacePath: string) => Promise<EmbeddingProviderCandidate[]> | EmbeddingProviderCandidate[];
  prepareEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingPrepareInput) => Promise<AmbientTencentMemoryEmbeddingPrepareResult> | AmbientTencentMemoryEmbeddingPrepareResult;
  startEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingStartInput) => Promise<AmbientTencentMemoryEmbeddingStartResult> | AmbientTencentMemoryEmbeddingStartResult;
  fetchEmbedding?: typeof fetch;
  logger: TencentMemoryLogger;
  now?: () => Date;
  onSnapshot?: () => void;
}

export interface AmbientTencentMemoryRuntimeEmbeddingSnapshot {
  embedding?: AgentMemoryEmbeddingDiagnostics;
  lastEmbedding?: AgentMemoryOperationStatus;
}

export class AmbientTencentMemoryRuntimeEmbeddingController {
  private embeddingDiagnostics?: AgentMemoryEmbeddingDiagnostics;
  private lastEmbedding?: AgentMemoryOperationStatus;
  private releaseEmbeddingRuntime?: () => Promise<void>;

  constructor(private readonly options: AmbientTencentMemoryRuntimeEmbeddingControllerOptions) {}

  snapshot(): AmbientTencentMemoryRuntimeEmbeddingSnapshot {
    return {
      ...(this.embeddingDiagnostics ? { embedding: this.embeddingDiagnostics } : {}),
      ...(this.lastEmbedding ? { lastEmbedding: this.lastEmbedding } : {}),
    };
  }

  async resolveConfig(): Promise<AmbientTencentMemoryEmbeddingResolution> {
    if (this.options.config) {
      this.embeddingDiagnostics = {
        enabled: false,
        status: "disabled",
        message: "TencentDB memory embedding resolution skipped because a custom memory config was supplied.",
      };
      this.lastEmbedding = this.status("idle", this.embeddingDiagnostics.message);
      this.emitSnapshot();
      return { diagnostics: this.embeddingDiagnostics };
    }
    const resolution = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: this.options.memorySettings,
      workspacePath: this.options.workspacePath,
      listEmbeddingProviders: this.options.listEmbeddingProviders,
      prepareEmbeddingProviderRuntime: this.options.prepareEmbeddingProviderRuntime,
      startEmbeddingProviderRuntime: this.options.startEmbeddingProviderRuntime,
      fetchImpl: this.options.fetchEmbedding,
      logger: this.options.logger,
    });
    this.releaseEmbeddingRuntime = resolution.releaseEmbeddingRuntime;
    this.embeddingDiagnostics = resolution.diagnostics;
    const status = resolution.diagnostics.status === "ready"
      ? "ok"
      : resolution.diagnostics.status === "error"
        ? "error"
        : resolution.diagnostics.status === "disabled"
          ? "idle"
          : "unavailable";
    this.lastEmbedding = this.status(status, resolution.diagnostics.message, {
      providerId: resolution.diagnostics.providerId,
      modelId: resolution.diagnostics.modelId,
      modelProfileId: resolution.diagnostics.modelProfileId,
      dimensions: resolution.diagnostics.dimensions,
      endpoint: resolution.diagnostics.endpoint,
    });
    this.emitSnapshot();
    return resolution;
  }

  async refreshStoreStatus(core: TencentMemoryCore): Promise<void> {
    if (!this.embeddingDiagnostics || this.embeddingDiagnostics.status !== "ready") return;
    await core.waitForStoreReady?.().catch((error) => {
      this.options.logger.warn(`TencentDB memory store readiness check failed: ${errorMessage(error)}`);
    });
    const storeStatus = core.getStoreInitStatus?.();
    if (!storeStatus) {
      this.updateDiagnostics({
        reindexStatus: "unknown",
      });
      return;
    }
    if (storeStatus.error) {
      this.updateDiagnostics({
        reindexStatus: "error",
        lastError: storeStatus.error,
        message: `TencentDB memory store initialization failed; vector recall will remain unavailable: ${storeStatus.error}`,
      });
      return;
    }
    if (!storeStatus.needsReindex) {
      this.updateDiagnostics({
        reindexStatus: "not_required",
      });
      return;
    }

    const reason = storeStatus.reindexReason ?? "embedding provider/model/dimensions changed";
    this.updateDiagnostics({
      reindexStatus: "pending",
      message: `Ambient-managed embedding provider is ready; TencentDB vector reindex is pending: ${reason}.`,
    });

    if (!core.reindexAllEmbeddings) {
      this.updateDiagnostics({
        reindexStatus: "pending",
        lastError: "TencentDB core does not expose reindexAllEmbeddings().",
        message: "TencentDB vector reindex is pending, but the reviewed core does not expose a reindex hook.",
      });
      return;
    }

    const result = await core.reindexAllEmbeddings((progress) => {
      this.updateDiagnostics({
        reindexStatus: "partial",
        message: `TencentDB vector reindex in progress: ${progress.layer} ${progress.done}/${progress.total}.`,
      });
    });

    if (result.status === "complete") {
      this.updateDiagnostics({
        reindexStatus: "complete",
        message: `TencentDB vector reindex complete: L1=${result.l1Count}, L0=${result.l0Count}.`,
      });
      return;
    }
    if (result.status === "not_required") {
      this.updateDiagnostics({
        reindexStatus: "not_required",
        message: "TencentDB vector reindex was not required.",
      });
      return;
    }
    if (result.status === "skipped") {
      this.updateDiagnostics({
        reindexStatus: "pending",
        lastError: result.reason ?? "TencentDB vector reindex was skipped.",
        message: `TencentDB vector reindex is still pending: ${result.reason ?? "reindex was skipped"}.`,
      });
      return;
    }
    this.updateDiagnostics({
      reindexStatus: "error",
      lastError: result.error ?? "TencentDB vector reindex failed.",
      message: `TencentDB vector reindex failed: ${result.error ?? "unknown error"}.`,
    });
  }

  async release(): Promise<void> {
    if (!this.releaseEmbeddingRuntime) return;
    const release = this.releaseEmbeddingRuntime;
    this.releaseEmbeddingRuntime = undefined;
    try {
      await release();
    } catch (error) {
      this.options.logger.warn(`TencentDB memory embedding runtime release failed: ${errorMessage(error)}`);
    }
  }

  private updateDiagnostics(patch: Partial<AgentMemoryEmbeddingDiagnostics>): void {
    if (!this.embeddingDiagnostics) return;
    const { lastError, ...rest } = patch;
    this.embeddingDiagnostics = {
      ...this.embeddingDiagnostics,
      ...rest,
      ...(lastError !== undefined ? { lastError } : {}),
    };
    if (lastError === undefined && "lastError" in patch) {
      delete this.embeddingDiagnostics.lastError;
    }
    this.lastEmbedding = this.status(
      this.embeddingDiagnostics.status === "error" || this.embeddingDiagnostics.reindexStatus === "error" ? "error" : "ok",
      this.embeddingDiagnostics.message,
      {
        providerId: this.embeddingDiagnostics.providerId,
        modelId: this.embeddingDiagnostics.modelId,
        modelProfileId: this.embeddingDiagnostics.modelProfileId,
        dimensions: this.embeddingDiagnostics.dimensions,
        endpoint: this.embeddingDiagnostics.endpoint,
      },
    );
    this.emitSnapshot();
  }

  private status(
    status: AgentMemoryOperationStatus["status"],
    message?: string,
    extra: Partial<Pick<AgentMemoryOperationStatus, "providerId" | "modelId" | "modelProfileId" | "dimensions" | "endpoint">> = {},
  ): AgentMemoryOperationStatus {
    return {
      status,
      at: (this.options.now?.() ?? new Date()).toISOString(),
      ...(message ? { message } : {}),
      ...extra,
    };
  }

  private emitSnapshot(): void {
    this.options.onSnapshot?.();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
