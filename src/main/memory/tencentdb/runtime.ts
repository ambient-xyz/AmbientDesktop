import type { AgentMemorySettings } from "../../../shared/agentMemorySettings";
import { isAgentMemoryActiveForThread } from "../../../shared/agentMemorySettings";
import type {
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryContextAccountingSnapshot,
  AgentMemoryOperationStatus,
  AgentMemoryRuntimeSnapshot,
} from "../../../shared/agentMemoryDiagnostics";
import { isAmbientTencentDbMemoryEnabled, type AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";
import type { EmbeddingProviderCandidate } from "../../../shared/localRuntimeTypes";
import type { ThreadSummary, WorkspaceState } from "../../../shared/types";
import { AmbientTencentMemoryHostAdapter } from "./ambientHostAdapter";
import { AmbientTencentMemoryLlmRunnerFactory, type AmbientTencentMemoryLlmDelegate } from "./ambientLlmRunner";
import {
  resolveAmbientTencentMemoryEmbeddingProvider,
  type AmbientTencentMemoryEmbeddingResolution,
  type AmbientTencentMemoryEmbeddingPrepareInput,
  type AmbientTencentMemoryEmbeddingPrepareResult,
  type AmbientTencentMemoryEmbeddingStartInput,
  type AmbientTencentMemoryEmbeddingStartResult,
} from "./ambientEmbeddingProvider";
import { ambientTencentMemoryDefaultConfig } from "./config";
import { ambientTencentMemoryDataDir, ensureAmbientTencentMemoryStorageSchema } from "./storage";
import { loadAmbientReviewedTencentMemoryCore, type TencentMemoryCoreConstructorLoader } from "./optionalCore";
import type {
  TencentMemoryCaptureResult,
  TencentMemoryAdminDeleteInput,
  TencentMemoryAdminInspectInput,
  TencentMemoryAdminInspectResult,
  TencentMemoryAdminRow,
  TencentMemoryAdminService,
  TencentMemoryAdminUpdateInput,
  TencentMemoryCompletedTurn,
  TencentMemoryConfig,
  TencentMemoryCore,
  TencentMemoryLogger,
  TencentMemoryRecallResult,
} from "./upstreamContracts";

export const TENCENT_MEMORY_SEARCH_TOOL_NAME = "tdai_memory_search" as const;
export const TENCENT_CONVERSATION_SEARCH_TOOL_NAME = "tdai_conversation_search" as const;
export const TENCENT_MEMORY_INSPECT_TOOL_NAME = "ambient_memory_inspect" as const;
export const TENCENT_MEMORY_UPDATE_TOOL_NAME = "ambient_memory_update" as const;
export const TENCENT_MEMORY_DELETE_TOOL_NAME = "ambient_memory_delete" as const;
export const TENCENT_MEMORY_ACTIVE_TOOL_NAMES = [
  TENCENT_MEMORY_SEARCH_TOOL_NAME,
  TENCENT_CONVERSATION_SEARCH_TOOL_NAME,
  TENCENT_MEMORY_INSPECT_TOOL_NAME,
  TENCENT_MEMORY_UPDATE_TOOL_NAME,
  TENCENT_MEMORY_DELETE_TOOL_NAME,
] as const;

const DEFAULT_RECALL_CONTEXT_CHAR_LIMIT = 6_000;

export type TencentMemoryRuntimeSnapshot = AgentMemoryRuntimeSnapshot;

export interface TencentMemoryRecallContext {
  text: string;
  recall: TencentMemoryRecallResult;
  truncated: boolean;
}

export interface CreateTencentDbMemoryRuntimeInput {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  memorySettings: AgentMemorySettings;
  storageHealthy?: boolean;
  logger?: TencentMemoryLogger;
  config?: TencentMemoryConfig;
  loadCoreConstructor?: TencentMemoryCoreConstructorLoader;
  runWithAmbientPi?: AmbientTencentMemoryLlmDelegate;
  listEmbeddingProviders?: (workspacePath: string) => Promise<EmbeddingProviderCandidate[]> | EmbeddingProviderCandidate[];
  prepareEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingPrepareInput) => Promise<AmbientTencentMemoryEmbeddingPrepareResult> | AmbientTencentMemoryEmbeddingPrepareResult;
  startEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingStartInput) => Promise<AmbientTencentMemoryEmbeddingStartResult> | AmbientTencentMemoryEmbeddingStartResult;
  fetchEmbedding?: typeof fetch;
  defaultModelRef?: string;
  now?: () => Date;
  onSnapshot?: (snapshot: TencentMemoryRuntimeSnapshot) => void;
}

export function isTencentDbMemoryActiveForThread(input: {
  thread: Pick<ThreadSummary, "memoryEnabled">;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  memorySettings: AgentMemorySettings;
  storageHealthy?: boolean;
}): boolean {
  return isAgentMemoryActiveForThread({
    featureEnabled: isAmbientTencentDbMemoryEnabled(input.featureFlagSnapshot),
    settings: input.memorySettings,
    threadMemoryEnabled: Boolean(input.thread.memoryEnabled),
    storageHealthy: input.storageHealthy,
  });
}

export function createTencentDbMemoryRuntimeForThread(
  input: CreateTencentDbMemoryRuntimeInput,
): AmbientTencentDbMemoryRuntime | undefined {
  if (!isTencentDbMemoryActiveForThread(input)) return undefined;
  const dataDir = ambientTencentMemoryDataDir(input.workspace.statePath);
  return new AmbientTencentDbMemoryRuntime({
    threadId: input.thread.id,
    workspacePath: input.workspace.path,
    dataDir,
    sessionId: input.thread.id,
    sessionKey: tencentMemorySessionKeyForThread(input.thread.id),
    logger: input.logger ?? consoleTencentMemoryLogger(input.thread.id),
    config: input.config,
    memorySettings: input.memorySettings,
    extractionEnabled: Boolean(input.runWithAmbientPi),
    loadCoreConstructor: input.loadCoreConstructor ?? loadAmbientReviewedTencentMemoryCore,
    runWithAmbientPi: input.runWithAmbientPi ?? unavailableAmbientPiMemoryRunner,
    listEmbeddingProviders: input.listEmbeddingProviders,
    prepareEmbeddingProviderRuntime: input.prepareEmbeddingProviderRuntime,
    startEmbeddingProviderRuntime: input.startEmbeddingProviderRuntime,
    fetchEmbedding: input.fetchEmbedding,
    defaultModelRef: input.defaultModelRef ?? input.thread.model,
    now: input.now,
    onSnapshot: input.onSnapshot,
  });
}

export function tencentMemorySessionKeyForThread(threadId: string): string {
  return `ambient-thread:${threadId}`;
}

export function formatTencentMemoryRecallContext(
  recall: TencentMemoryRecallResult,
  charLimit = DEFAULT_RECALL_CONTEXT_CHAR_LIMIT,
): TencentMemoryRecallContext | undefined {
  const parts = [
    recall.prependContext?.trim(),
    recall.appendSystemContext?.trim(),
  ].filter((part): part is string => Boolean(part));
  if (!parts.length) return undefined;

  const header = [
    "<ambient_memory_context>",
    "Source: TencentDB Agent Memory (experimental)",
    recall.recallStrategy ? `Recall strategy: ${recall.recallStrategy}` : undefined,
  ].filter(Boolean).join("\n");
  const footer = "</ambient_memory_context>";
  const body = parts.join("\n\n");
  const maxBodyChars = Math.max(0, charLimit - header.length - footer.length - 32);
  const truncated = body.length > maxBodyChars;
  const boundedBody = truncated ? `${body.slice(0, Math.max(0, maxBodyChars)).trimEnd()}\n[truncated]` : body;
  return {
    text: `${header}\n${boundedBody}\n${footer}`,
    recall,
    truncated,
  };
}

export interface AmbientTencentDbMemoryRuntimeOptions {
  threadId: string;
  workspacePath: string;
  dataDir: string;
  sessionId: string;
  sessionKey: string;
  logger: TencentMemoryLogger;
  config?: TencentMemoryConfig;
  memorySettings: AgentMemorySettings;
  extractionEnabled: boolean;
  loadCoreConstructor: TencentMemoryCoreConstructorLoader;
  runWithAmbientPi: AmbientTencentMemoryLlmDelegate;
  listEmbeddingProviders?: (workspacePath: string) => Promise<EmbeddingProviderCandidate[]> | EmbeddingProviderCandidate[];
  prepareEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingPrepareInput) => Promise<AmbientTencentMemoryEmbeddingPrepareResult> | AmbientTencentMemoryEmbeddingPrepareResult;
  startEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingStartInput) => Promise<AmbientTencentMemoryEmbeddingStartResult> | AmbientTencentMemoryEmbeddingStartResult;
  fetchEmbedding?: typeof fetch;
  defaultModelRef?: string;
  now?: () => Date;
  onSnapshot?: (snapshot: TencentMemoryRuntimeSnapshot) => void;
}

export class AmbientTencentDbMemoryRuntime {
  readonly activeToolNames = TENCENT_MEMORY_ACTIVE_TOOL_NAMES;
  private corePromise?: Promise<TencentMemoryCore | undefined>;
  private core?: TencentMemoryCore;
  private admin?: TencentMemoryAdminService;
  private disposed = false;
  private lastInitialize?: AgentMemoryOperationStatus;
  private lastRecall?: AgentMemoryOperationStatus;
  private lastCapture?: AgentMemoryOperationStatus;
  private lastSearch?: AgentMemoryOperationStatus;
  private lastEmbedding?: AgentMemoryOperationStatus;
  private embeddingDiagnostics?: AgentMemoryEmbeddingDiagnostics;
  private releaseEmbeddingRuntime?: () => Promise<void>;
  private lastContextInjection?: AgentMemoryContextAccountingSnapshot;

  constructor(private readonly options: AmbientTencentDbMemoryRuntimeOptions) {}

  get sessionKey(): string {
    return this.options.sessionKey;
  }

  snapshot(): TencentMemoryRuntimeSnapshot {
    return {
      active: !this.disposed,
      threadId: this.options.threadId,
      dataDir: this.options.dataDir,
      sessionKey: this.options.sessionKey,
      ...(this.embeddingDiagnostics ? { embedding: this.embeddingDiagnostics } : {}),
      ...(this.lastInitialize ? { lastInitialize: this.lastInitialize } : {}),
      ...(this.lastEmbedding ? { lastEmbedding: this.lastEmbedding } : {}),
      ...(this.lastRecall ? { lastRecall: this.lastRecall } : {}),
      ...(this.lastCapture ? { lastCapture: this.lastCapture } : {}),
      ...(this.lastSearch ? { lastSearch: this.lastSearch } : {}),
      ...(this.lastContextInjection ? { lastContextInjection: this.lastContextInjection } : {}),
    };
  }

  recordContextInjection(input: Omit<AgentMemoryContextAccountingSnapshot, "at">): void {
    this.lastContextInjection = {
      ...input,
      at: (this.options.now?.() ?? new Date()).toISOString(),
    };
    this.emitSnapshot();
  }

  async recall(userText: string): Promise<TencentMemoryRecallContext | undefined> {
    const core = await this.ensureCore();
    if (!core) return undefined;
    try {
      const recall = await core.handleBeforeRecall(userText, this.options.sessionKey);
      const context = formatTencentMemoryRecallContext(recall);
      this.lastRecall = this.status("ok", context ? "Recall context prepared." : "No memories recalled.", {
        strategy: recall.recallStrategy,
        total: recall.recalledL1Memories?.length,
      });
      this.emitSnapshot();
      return context;
    } catch (error) {
      this.lastRecall = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB memory recall failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  async capture(turn: Omit<TencentMemoryCompletedTurn, "sessionKey" | "sessionId">): Promise<TencentMemoryCaptureResult | undefined> {
    const core = await this.ensureCore();
    if (!core) return undefined;
    try {
      const result = await core.handleTurnCommitted({
        ...turn,
        sessionKey: this.options.sessionKey,
        sessionId: this.options.sessionId,
      });
      this.lastCapture = this.status("ok", "Turn captured.", {
        total: result.l0RecordedCount,
      });
      this.emitSnapshot();
      return result;
    } catch (error) {
      this.lastCapture = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB memory capture failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  async searchMemories(params: { query: string; limit?: number; type?: string; scene?: string }): Promise<{ text: string; total: number; strategy: string } | undefined> {
    const core = await this.ensureCore();
    if (!core) return undefined;
    try {
      const result = await core.searchMemories(params);
      this.lastSearch = this.status("ok", "Memory search completed.", {
        total: result.total,
        strategy: result.strategy,
      });
      this.emitSnapshot();
      return result;
    } catch (error) {
      this.lastSearch = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB memory search failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  async searchConversations(params: { query: string; limit?: number; sessionKey?: string }): Promise<{ text: string; total: number } | undefined> {
    const core = await this.ensureCore();
    if (!core) return undefined;
    try {
      const result = await core.searchConversations({
        ...params,
        sessionKey: params.sessionKey ?? this.options.sessionKey,
      });
      this.lastSearch = this.status("ok", "Conversation search completed.", {
        total: result.total,
      });
      this.emitSnapshot();
      return result;
    } catch (error) {
      this.lastSearch = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB conversation search failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  async inspectMemories(params: TencentMemoryAdminInspectInput = {}): Promise<TencentMemoryAdminInspectResult | undefined> {
    const admin = await this.ensureAdmin();
    if (!admin) return undefined;
    try {
      const sessionKey = params.scope === "workspace"
        ? params.sessionKey
        : params.sessionKey ?? this.options.sessionKey;
      const result = await admin.inspect({
        ...params,
        ...(sessionKey ? { sessionKey } : {}),
      });
      this.lastSearch = this.status("ok", "Memory inspect completed.", {
        total: result.total,
      });
      this.emitSnapshot();
      return result;
    } catch (error) {
      this.lastSearch = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB memory inspect failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  async updateMemory(params: TencentMemoryAdminUpdateInput): Promise<TencentMemoryAdminRow | undefined> {
    const admin = await this.ensureAdmin();
    if (!admin) return undefined;
    try {
      const result = await admin.update({
        ...params,
        ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      });
      this.lastSearch = this.status("ok", "Memory update completed.", {
        total: 1,
      });
      this.emitSnapshot();
      return result;
    } catch (error) {
      this.lastSearch = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB memory update failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  async deleteMemory(params: TencentMemoryAdminDeleteInput): Promise<{ deleted: string[]; failed: string[] } | undefined> {
    const admin = await this.ensureAdmin();
    if (!admin) return undefined;
    try {
      const result = await admin.delete(params);
      this.lastSearch = this.status("ok", "Memory delete completed.", {
        total: result.deleted.length,
      });
      this.emitSnapshot();
      return result;
    } catch (error) {
      this.lastSearch = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB memory delete failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const core = this.core;
    this.core = undefined;
    this.admin = undefined;
    this.corePromise = undefined;
    this.emitSnapshot();
    if (core?.destroy) {
      try {
        await core.destroy();
      } catch (error) {
        this.options.logger.warn(`TencentDB memory destroy failed: ${errorMessage(error)}`);
      }
    }
    if (this.releaseEmbeddingRuntime) {
      const release = this.releaseEmbeddingRuntime;
      this.releaseEmbeddingRuntime = undefined;
      try {
        await release();
      } catch (error) {
        this.options.logger.warn(`TencentDB memory embedding runtime release failed: ${errorMessage(error)}`);
      }
    }
  }

  private async ensureCore(): Promise<TencentMemoryCore | undefined> {
    if (this.disposed) return undefined;
    if (!this.corePromise) this.corePromise = this.initializeCore();
    return this.corePromise;
  }

  private async ensureAdmin(): Promise<TencentMemoryAdminService | undefined> {
    await this.ensureCore();
    if (!this.admin) {
      this.options.logger.warn("TencentDB memory admin service is unavailable.");
    }
    return this.admin;
  }

  private async initializeCore(): Promise<TencentMemoryCore | undefined> {
    try {
      await ensureAmbientTencentMemoryStorageSchema(this.options.dataDir, this.options.now?.() ?? new Date());
    } catch (error) {
      this.lastInitialize = this.status("error", errorMessage(error));
      this.options.logger.warn(`TencentDB memory storage schema check failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }

    const embeddingResolution = await this.resolveEmbeddingConfig();
    const config = this.options.config ?? ambientTencentMemoryDefaultConfig({
      extractionEnabled: this.options.extractionEnabled,
      embedding: embeddingResolution.config,
    });

    const loadResult = await this.options.loadCoreConstructor();
    if (!loadResult.Core) {
      this.lastInitialize = this.status("unavailable", loadResult.unavailableReason ?? "TencentDB memory core unavailable.", {
        moduleSpecifier: loadResult.moduleSpecifier,
      });
      this.options.logger.warn(this.lastInitialize.message ?? "TencentDB memory core unavailable.");
      this.emitSnapshot();
      return undefined;
    }

    try {
      const hostAdapter = new AmbientTencentMemoryHostAdapter({
        threadId: this.options.threadId,
        workspacePath: this.options.workspacePath,
        dataDir: this.options.dataDir,
        logger: this.options.logger,
        sessionId: this.options.sessionId,
        sessionKey: this.options.sessionKey,
        llmRunnerFactory: new AmbientTencentMemoryLlmRunnerFactory({
          workspaceDir: this.options.workspacePath,
          defaultModelRef: this.options.defaultModelRef,
          runWithAmbientPi: this.options.runWithAmbientPi,
        }),
      });
      const core = new loadResult.Core({
        hostAdapter,
        config,
        instanceId: `ambient:${this.options.threadId}`,
      });
      await core.initialize();
      this.core = core;
      this.admin = loadResult.createMemoryAdminService?.({
        core,
        dataDir: this.options.dataDir,
        logger: this.options.logger,
      });
      await this.refreshEmbeddingStoreStatus(core);
      this.lastInitialize = this.status("ok", "TencentDB memory core initialized.", {
        moduleSpecifier: loadResult.moduleSpecifier,
      });
      this.emitSnapshot();
      return core;
    } catch (error) {
      this.lastInitialize = this.status("error", errorMessage(error), {
        moduleSpecifier: loadResult.moduleSpecifier,
      });
      this.options.logger.warn(`TencentDB memory core initialization failed: ${errorMessage(error)}`);
      this.emitSnapshot();
      return undefined;
    }
  }

  private async resolveEmbeddingConfig(): Promise<AmbientTencentMemoryEmbeddingResolution> {
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

  private async refreshEmbeddingStoreStatus(core: TencentMemoryCore): Promise<void> {
    if (!this.embeddingDiagnostics || this.embeddingDiagnostics.status !== "ready") return;
    await core.waitForStoreReady?.().catch((error) => {
      this.options.logger.warn(`TencentDB memory store readiness check failed: ${errorMessage(error)}`);
    });
    const storeStatus = core.getStoreInitStatus?.();
    if (!storeStatus) {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "unknown",
      });
      return;
    }
    if (storeStatus.error) {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "error",
        lastError: storeStatus.error,
        message: `TencentDB memory store initialization failed; vector recall will remain unavailable: ${storeStatus.error}`,
      });
      return;
    }
    if (!storeStatus.needsReindex) {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "not_required",
      });
      return;
    }

    const reason = storeStatus.reindexReason ?? "embedding provider/model/dimensions changed";
    this.updateEmbeddingDiagnostics({
      reindexStatus: "pending",
      message: `Ambient-managed embedding provider is ready; TencentDB vector reindex is pending: ${reason}.`,
    });

    if (!core.reindexAllEmbeddings) {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "pending",
        lastError: "TencentDB core does not expose reindexAllEmbeddings().",
        message: "TencentDB vector reindex is pending, but the reviewed core does not expose a reindex hook.",
      });
      return;
    }

    const result = await core.reindexAllEmbeddings((progress) => {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "partial",
        message: `TencentDB vector reindex in progress: ${progress.layer} ${progress.done}/${progress.total}.`,
      });
    });

    if (result.status === "complete") {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "complete",
        message: `TencentDB vector reindex complete: L1=${result.l1Count}, L0=${result.l0Count}.`,
      });
      return;
    }
    if (result.status === "not_required") {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "not_required",
        message: "TencentDB vector reindex was not required.",
      });
      return;
    }
    if (result.status === "skipped") {
      this.updateEmbeddingDiagnostics({
        reindexStatus: "pending",
        lastError: result.reason ?? "TencentDB vector reindex was skipped.",
        message: `TencentDB vector reindex is still pending: ${result.reason ?? "reindex was skipped"}.`,
      });
      return;
    }
    this.updateEmbeddingDiagnostics({
      reindexStatus: "error",
      lastError: result.error ?? "TencentDB vector reindex failed.",
      message: `TencentDB vector reindex failed: ${result.error ?? "unknown error"}.`,
    });
  }

  private updateEmbeddingDiagnostics(patch: Partial<AgentMemoryEmbeddingDiagnostics>): void {
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
    extra: Partial<Pick<AgentMemoryOperationStatus, "moduleSpecifier" | "total" | "strategy" | "providerId" | "modelId" | "modelProfileId" | "dimensions" | "endpoint">> = {},
  ): AgentMemoryOperationStatus {
    return {
      status,
      at: (this.options.now?.() ?? new Date()).toISOString(),
      ...(message ? { message } : {}),
      ...extra,
    };
  }

  private emitSnapshot(): void {
    this.options.onSnapshot?.(this.snapshot());
  }
}

function consoleTencentMemoryLogger(threadId: string): TencentMemoryLogger {
  const prefix = `[tencentdb-memory:${threadId}]`;
  return {
    debug: (message) => console.debug(`${prefix} ${message}`),
    info: (message) => console.info(`${prefix} ${message}`),
    warn: (message) => console.warn(`${prefix} ${message}`),
    error: (message) => console.error(`${prefix} ${message}`),
  };
}

async function unavailableAmbientPiMemoryRunner(): Promise<string> {
  throw new Error("TencentDB memory LLM runner is not configured for this Ambient runtime.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
