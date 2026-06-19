/**
 * Phase 0 structural contracts for TencentCloud/TencentDB-Agent-Memory.
 *
 * These mirror the upstream host-neutral boundary at commit
 * a21ef3f66aebd549dcccc63084c572231b62d245:
 * - src/core/types.ts
 * - src/core/tdai-core.ts
 *
 * They are intentionally structural so Phase 0 can prove Ambient's adapter seam
 * without installing the upstream package before its OpenClaw postinstall path
 * is removed or bypassed.
 */

export interface TencentMemoryLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface TencentMemoryRuntimeContext {
  userId: string;
  sessionId: string;
  sessionKey: string;
  platform: string;
  agentIdentity?: string;
  agentContext?: "primary" | "subagent" | "cron" | "flush";
  workspaceDir: string;
  dataDir: string;
}

export interface TencentMemoryLlmRunParams {
  prompt: string;
  systemPrompt?: string;
  taskId: string;
  timeoutMs?: number;
  maxTokens?: number;
  workspaceDir?: string;
  instanceId?: string;
}

export interface TencentMemoryLlmRunner {
  run(params: TencentMemoryLlmRunParams): Promise<string>;
}

export interface TencentMemoryLlmRunnerCreateOptions {
  modelRef?: string;
  enableTools?: boolean;
}

export interface TencentMemoryLlmRunnerFactory {
  createRunner(opts?: TencentMemoryLlmRunnerCreateOptions): TencentMemoryLlmRunner;
}

export interface TencentMemoryHostAdapter {
  /**
   * Upstream currently branches on "openclaw" versus non-OpenClaw. Until
   * upstream accepts an explicit Ambient host type, Ambient should present as
   * "standalone" and set RuntimeContext.platform to "ambient-desktop".
   */
  readonly hostType: "openclaw" | "hermes" | "standalone";
  getRuntimeContext(): TencentMemoryRuntimeContext;
  getLogger(): TencentMemoryLogger;
  getLLMRunnerFactory(): TencentMemoryLlmRunnerFactory;
}

export interface TencentMemoryRecallResult {
  prependContext?: string;
  appendSystemContext?: string;
  recalledL1Memories?: Array<{ content: string; score: number; type: string }>;
  recalledL3Persona?: string | null;
  recallStrategy?: string;
}

export interface TencentMemoryCompletedTurn {
  userText: string;
  assistantText: string;
  messages: unknown[];
  sessionKey: string;
  sessionId?: string;
  startedAt?: number;
  originalUserMessageCount?: number;
}

export interface TencentMemoryCaptureResult {
  l0RecordedCount: number;
  schedulerNotified: boolean;
  l0VectorsWritten: number;
  filteredMessages: Array<{
    role: string;
    content: string;
    timestamp: number;
  }>;
}

export interface TencentMemorySearchParams {
  query: string;
  limit?: number;
  type?: string;
  scene?: string;
}

export interface TencentMemoryConversationSearchParams {
  query: string;
  limit?: number;
  sessionKey?: string;
}

export type TencentMemoryConfig = Record<string, unknown>;

export interface TencentMemoryCoreOptions {
  hostAdapter: TencentMemoryHostAdapter;
  config: TencentMemoryConfig;
  sessionFilter?: unknown;
  instanceId?: string;
}

export interface TencentMemoryStoreInitStatus {
  completed: boolean;
  needsReindex: boolean;
  vectorStoreAvailable: boolean;
  embeddingServiceAvailable: boolean;
  reindexReason?: string;
  error?: string;
}

export interface TencentMemoryReindexProgress {
  done: number;
  total: number;
  layer: "L1" | "L0";
}

export interface TencentMemoryReindexResult {
  status: "not_required" | "complete" | "skipped" | "error";
  l1Count: number;
  l0Count: number;
  reason?: string;
  error?: string;
}

export interface TencentMemoryCore {
  initialize(): Promise<void>;
  destroy?(): Promise<void>;
  handleBeforeRecall(userText: string, sessionKey: string): Promise<TencentMemoryRecallResult>;
  handleTurnCommitted(turn: TencentMemoryCompletedTurn): Promise<TencentMemoryCaptureResult>;
  searchMemories(params: TencentMemorySearchParams): Promise<{ text: string; total: number; strategy: string }>;
  searchConversations(params: TencentMemoryConversationSearchParams): Promise<{ text: string; total: number }>;
  getVectorStore?(): unknown;
  getEmbeddingService?(): unknown;
  getStoreInitStatus?(): TencentMemoryStoreInitStatus;
  waitForStoreReady?(): Promise<void>;
  reindexAllEmbeddings?(
    onProgress?: (progress: TencentMemoryReindexProgress) => void,
  ): Promise<TencentMemoryReindexResult>;
}

export type TencentMemoryCoreConstructor = new (options: TencentMemoryCoreOptions) => TencentMemoryCore;

export type TencentMemoryAdminLayer = "l1" | "l0" | "l2" | "l3";

export interface TencentMemoryAdminRow {
  id: string;
  layer: TencentMemoryAdminLayer;
  content: string;
  preview: string;
  type?: string;
  priority?: number;
  sceneName?: string;
  sessionKey?: string;
  sessionId?: string;
  role?: string;
  filename?: string;
  updatedAt?: string;
  source: "tencentdb";
}

export interface TencentMemoryAdminInspectInput {
  layer?: TencentMemoryAdminLayer | "all";
  scope?: "thread" | "workspace";
  query?: string;
  limit?: number;
  sessionKey?: string;
  sessionId?: string;
}

export interface TencentMemoryAdminInspectResult {
  rows: TencentMemoryAdminRow[];
  total: number;
  truncated: boolean;
}

export interface TencentMemoryAdminUpdateInput {
  layer: "l1" | "l2" | "l3";
  id: string;
  content: string;
  type?: string;
  priority?: number;
  sceneName?: string;
  sessionKey?: string;
  sessionId?: string;
  filename?: string;
}

export interface TencentMemoryAdminCreateInput {
  layer?: "l1";
  content: string;
  type?: string;
  priority?: number;
  sceneName?: string;
  sessionKey?: string;
  sessionId?: string;
  sourceMessageIds?: string[];
}

export interface TencentMemoryAdminDeleteInput {
  layer: TencentMemoryAdminLayer;
  ids: string[];
}

export interface TencentMemoryAdminService {
  inspect(input?: TencentMemoryAdminInspectInput): Promise<TencentMemoryAdminInspectResult>;
  create(input: TencentMemoryAdminCreateInput): Promise<TencentMemoryAdminRow>;
  update(input: TencentMemoryAdminUpdateInput): Promise<TencentMemoryAdminRow>;
  delete(input: TencentMemoryAdminDeleteInput): Promise<{ deleted: string[]; failed: string[] }>;
}

export interface CreateTencentMemoryAdminServiceInput {
  core: TencentMemoryCore;
  dataDir: string;
  logger?: TencentMemoryLogger;
}

export type TencentMemoryAdminServiceFactory =
  (input: CreateTencentMemoryAdminServiceInput) => TencentMemoryAdminService;
