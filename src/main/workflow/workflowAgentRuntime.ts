import { createHash } from "node:crypto";
import type { WorkflowApprovalStatus, WorkflowManifest, WorkflowRecoveryContext, WorkflowRecoveryTargetKind } from "../../shared/workflowTypes";
import { WorkflowInputPausedError, WorkflowManualPausedError, WorkflowPausedError } from "./workflowAgentRuntimeErrors";
import {
  chunkWorkflowRuntimeCollection,
  dedupeWorkflowRuntimeCollection,
  mapWorkflowRuntimeCollection,
  mapWorkflowRuntimeModel,
  paginateWorkflowRuntimeConnector,
  paginateWorkflowRuntimeTool,
  reduceWorkflowRuntimeModel,
  renderWorkflowRuntimeDocument,
  runWorkflowRuntimeBatch,
  workflowRuntimeEventData,
  type WorkflowRuntimeCollectionContext,
} from "./workflowRuntimeCollectionController";
import { createWorkflowRuntimePrimitives } from "./workflowRuntimePrimitives";

export { WorkflowInputPausedError, WorkflowManualPausedError, WorkflowPausedError, isWorkflowPausedError } from "./workflowAgentRuntimeErrors";

export interface WorkflowRuntimeEvent {
  type: string;
  message?: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  data?: Record<string, unknown>;
}

export interface WorkflowEventSink {
  append(event: WorkflowRuntimeEvent): Promise<void> | void;
}

export interface WorkflowCheckpointStore {
  get<T = unknown>(key: string): Promise<T | undefined> | T | undefined;
  set(key: string, value: unknown): Promise<void> | void;
}

export interface WorkflowBatchOptions {
  name?: string;
  maxConcurrency?: number;
  nodeId?: string;
  edgeId?: string;
  itemKey?: string;
  targetKind?: WorkflowRecoveryTargetKind;
  checkpointKey?: string;
}

export interface WorkflowPaginateConnectorOptions extends WorkflowNodeMetadata {
  name?: string;
  input?: Record<string, unknown>;
  pageSize?: number;
  maxItems: number;
  maxPages: number;
  itemsPath?: string;
  nextPageTokenPath?: string;
  pageTokenInputPath?: string;
  pageSizeInputPath?: string;
  dedupeKeyPath?: string;
  checkpointKey?: string;
}

export interface WorkflowPaginateToolOptions extends WorkflowNodeMetadata {
  name?: string;
  input?: Record<string, unknown>;
  pageQueries?: unknown[];
  queryInputPath?: string;
  pageSize?: number;
  maxItems: number;
  maxPages: number;
  itemsPath?: string;
  nextPageTokenPath?: string;
  pageTokenInputPath?: string;
  pageSizeInputPath?: string;
  dedupeKeyPath?: string;
  checkpointKey?: string;
}

export interface WorkflowPaginatedCollection {
  items: unknown[];
  pages: unknown[];
  count: number;
  pageCount: number;
  truncated: boolean;
  nextPageToken?: string;
  maxItems: number;
  maxPages: number;
  pageSize?: number;
}

export interface WorkflowCollectionMapOptions extends WorkflowNodeMetadata {
  name?: string;
  maxItems: number;
  checkpointKey?: string;
}

export interface WorkflowMappedCollection {
  items: unknown[];
  count: number;
  sourceCount: number;
  truncated: boolean;
  maxItems: number;
}

export type WorkflowCollectionDedupeStrategy = "exact" | "url_canonical";

export interface WorkflowCollectionDedupeOptions extends WorkflowNodeMetadata {
  name?: string;
  keyPath?: string;
  strategy?: WorkflowCollectionDedupeStrategy;
  maxItems: number;
  checkpointKey?: string;
}

export interface WorkflowDedupedCollection {
  items: unknown[];
  count: number;
  sourceCount: number;
  duplicateCount: number;
  truncated: boolean;
  maxItems: number;
  keyPath?: string;
  strategy: WorkflowCollectionDedupeStrategy;
}

export interface WorkflowCollectionChunkOptions extends WorkflowNodeMetadata {
  name?: string;
  chunkSize: number;
  maxChunks: number;
  checkpointKey?: string;
}

export interface WorkflowCollectionChunk {
  id: string;
  index: number;
  start: number;
  end: number;
  count: number;
  items: unknown[];
}

export interface WorkflowChunkedCollection {
  chunks: WorkflowCollectionChunk[];
  count: number;
  itemCount: number;
  sourceCount: number;
  truncated: boolean;
  chunkSize: number;
  maxChunks: number;
}

export type WorkflowDocumentRenderFormat = "markdown" | "html" | "pdf";

export interface WorkflowDocumentRenderOptions extends WorkflowNodeMetadata {
  name?: string;
  title?: unknown;
  format?: WorkflowDocumentRenderFormat;
  path?: string;
  maxSourceChars?: number;
  checkpointKey?: string;
}

export interface WorkflowRenderedDocument {
  title: string;
  format: WorkflowDocumentRenderFormat;
  mimeType: string;
  artifactPath: string;
  path: string;
  content: string;
  bytes: number;
  sourceChars: number;
  truncated: boolean;
}

export interface WorkflowModelMapOptions extends WorkflowNodeMetadata {
  name?: string;
  maxItems: number;
  maxConcurrency?: number;
  checkpointKey?: string;
}

export interface WorkflowModelMapItemResult<T = unknown, R = unknown> {
  item: T;
  result: R;
  index: number;
}

export interface WorkflowModelMappedCollection<R = unknown> {
  items: Array<WorkflowModelMapItemResult<unknown, R>>;
  results: R[];
  count: number;
  sourceCount: number;
  truncated: boolean;
  maxItems: number;
  maxConcurrency: number;
}

export interface WorkflowModelReduceOptions extends WorkflowNodeMetadata {
  name?: string;
  maxInputItems: number;
  strategy?: "single_pass" | "tree";
  maxFanIn?: number;
  maxLevels?: number;
  checkpointKey?: string;
}

export interface WorkflowModelReduceContext {
  sourceCount: number;
  selectedCount: number;
  truncated: boolean;
  strategy: "single_pass" | "tree";
  level?: number;
  groupIndex?: number;
  groupCount?: number;
  maxFanIn?: number;
  maxLevels?: number;
  final?: boolean;
  inputCount?: number;
  outputCount?: number;
  modelCallIndex?: number;
}

export interface WorkflowNodeMetadata {
  nodeId?: string;
  edgeId?: string;
  itemKey?: string;
}

export interface WorkflowRuntimeMetadata extends WorkflowNodeMetadata {
  targetKind?: WorkflowRecoveryTargetKind;
  targetIndex?: number;
  checkpointKey?: string;
}

export interface WorkflowApprovalRequest {
  id: string;
  changeSet: unknown;
  status: WorkflowApprovalStatus;
}

export interface WorkflowUserInputChoice {
  id: string;
  label: string;
  description?: string;
}

export interface WorkflowAskUserOptions {
  choices?: WorkflowUserInputChoice[];
  allowFreeform?: boolean;
  data?: Record<string, unknown>;
}

export interface WorkflowUserInputRequest {
  id: string;
  prompt: string;
  choices: WorkflowUserInputChoice[];
  allowFreeform: boolean;
  data?: Record<string, unknown>;
  status: "pending";
}

export interface WorkflowUserInputResponse {
  requestId: string;
  choiceId?: string;
  text?: string;
  data?: unknown;
}

export type WorkflowApprovalDecision = Exclude<WorkflowApprovalStatus, "pending">;
export type WorkflowApprovalIdFactory = (changeSet: unknown, index: number, metadata?: WorkflowNodeMetadata) => string;
export type WorkflowApprovalDecisionResolver = (
  approvalId: string,
  changeSet: unknown,
) => Promise<WorkflowApprovalDecision | undefined> | WorkflowApprovalDecision | undefined;
export type WorkflowUserInputIdFactory = (request: Omit<WorkflowUserInputRequest, "id" | "status">, index: number, metadata?: WorkflowNodeMetadata) => string;
export type WorkflowUserInputResponseResolver = (
  request: WorkflowUserInputRequest,
) => Promise<WorkflowUserInputResponse | undefined> | WorkflowUserInputResponse | undefined;

export interface WorkflowRuntimePrimitives {
  step<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
  step<T>(name: string, metadata: WorkflowNodeMetadata, fn: () => Promise<T> | T): Promise<T>;
  batch<T, R>(items: T[], options: WorkflowBatchOptions, fn: (item: T, index: number) => Promise<R> | R): Promise<R[]>;
  paginateTool(options: WorkflowPaginateToolOptions, fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown): Promise<WorkflowPaginatedCollection>;
  paginateConnector(options: WorkflowPaginateConnectorOptions, fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown): Promise<WorkflowPaginatedCollection>;
  mapCollection<T = unknown, R = unknown>(items: T[], options: WorkflowCollectionMapOptions, mapItem: (item: T, index: number) => Promise<R> | R): Promise<WorkflowMappedCollection>;
  dedupeCollection(items: unknown[], options: WorkflowCollectionDedupeOptions): Promise<WorkflowDedupedCollection>;
  chunkCollection(items: unknown[], options: WorkflowCollectionChunkOptions): Promise<WorkflowChunkedCollection>;
  renderDocument(input: unknown, options: WorkflowDocumentRenderOptions): Promise<WorkflowRenderedDocument>;
  mapModel<T = unknown, R = unknown>(items: T[], options: WorkflowModelMapOptions, mapItem: (item: T, index: number) => Promise<R> | R): Promise<WorkflowModelMappedCollection<R>>;
  reduceModel<R = unknown>(items: unknown[], options: WorkflowModelReduceOptions, reduceItems: (items: unknown[], context: WorkflowModelReduceContext) => Promise<R> | R): Promise<R>;
  checkpoint(key: string, value: unknown): Promise<void>;
  resumePoint<T>(key: string, fn: () => Promise<T> | T): Promise<T>;
  requireApproval(changeSet: unknown, metadata?: WorkflowNodeMetadata): Promise<WorkflowApprovalRequest>;
  askUser(prompt: string, options?: WorkflowAskUserOptions, metadata?: WorkflowNodeMetadata): Promise<WorkflowUserInputResponse>;
  stageMutation<T>(changeSet: unknown, apply: () => Promise<T> | T, metadata?: WorkflowNodeMetadata): Promise<T>;
  skipItem(metadata?: WorkflowNodeMetadata): Promise<boolean>;
  emit(event: WorkflowRuntimeEvent): Promise<void>;
  abortSignal?: AbortSignal;
  recovery?: WorkflowRecoveryContext;
}

export type WorkflowToolHandler = (input: unknown) => Promise<unknown> | unknown;
export type WorkflowToolHandlers = Record<string, WorkflowToolHandler>;
export type WorkflowAmbientHandlers = Record<string, WorkflowToolHandler>;
export type WorkflowConnectorHandlers = Record<string, WorkflowToolHandler>;

export interface WorkflowProgramContext {
  workflow: WorkflowRuntimePrimitives;
  tools: WorkflowToolHandlers;
  ambient: WorkflowAmbientHandlers;
  connectors: WorkflowConnectorHandlers;
}

export type WorkflowProgram = (context: WorkflowProgramContext) => Promise<void> | void;

export interface WorkflowRuntimeOptions {
  manifest: WorkflowManifest;
  eventSink?: WorkflowEventSink;
  checkpointStore?: WorkflowCheckpointStore;
  abortSignal?: AbortSignal;
  recovery?: WorkflowRecoveryContext;
  approvalId?: WorkflowApprovalIdFactory;
  approvalDecision?: WorkflowApprovalDecisionResolver;
  userInputId?: WorkflowUserInputIdFactory;
  userInputResponse?: WorkflowUserInputResponseResolver;
  suppressFailureEvent?: (error: unknown) => boolean;
}

export class MemoryWorkflowCheckpointStore implements WorkflowCheckpointStore {
  private readonly values = new Map<string, unknown>();

  get<T = unknown>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values.entries());
  }
}

export class WorkflowAgentRuntime {
  private readonly allowedTools: Set<string>;
  private readonly checkpointStore: WorkflowCheckpointStore;
  private readonly collectionContext: WorkflowRuntimeCollectionContext;
  private readonly approvalId: WorkflowApprovalIdFactory;
  private readonly userInputId: WorkflowUserInputIdFactory;
  private approvalCount = 0;
  private userInputCount = 0;

  constructor(private readonly options: WorkflowRuntimeOptions) {
    this.allowedTools = new Set(options.manifest.tools);
    this.checkpointStore = options.checkpointStore ?? new MemoryWorkflowCheckpointStore();
    this.collectionContext = {
      checkpointStore: this.checkpointStore,
      throwIfAborted: () => this.throwIfAborted(),
      matchingRecovery: (action, metadata) => this.matchingRecovery(action, metadata),
      emit: (event) => this.emit(event),
    };
    this.approvalId = options.approvalId ?? defaultApprovalId;
    this.userInputId = options.userInputId ?? defaultUserInputId;
  }

  async run(
    program: WorkflowProgram,
    input: { tools?: WorkflowToolHandlers; ambient?: WorkflowAmbientHandlers; connectors?: WorkflowConnectorHandlers } = {},
  ): Promise<void> {
    await this.emit({
      type: "workflow.start",
      data: {
        tools: [...this.allowedTools],
        connectors: this.options.manifest.connectors?.map((grant) => grant.connectorId) ?? [],
      },
    });
    try {
      await program({
        workflow: this.createPrimitives(),
        tools: this.bindTools(input.tools ?? {}),
        ambient: input.ambient ?? {},
        connectors: input.connectors ?? {},
      });
      await this.emit({ type: "workflow.succeeded" });
    } catch (error) {
      if (error instanceof WorkflowPausedError) {
        await this.emit({
          type: "workflow.paused",
          message: error.approval.id,
          data: { id: error.approval.id, changeSet: error.approval.changeSet },
        });
        throw error;
      }
      if (error instanceof WorkflowInputPausedError) {
        await this.emit({
          type: "workflow.paused",
          message: error.input.id,
          data: { id: error.input.id, prompt: error.input.prompt, reason: "Workflow is waiting for user input." },
        });
        throw error;
      }
      const manualPause = error instanceof WorkflowManualPausedError ? error : this.manualPauseError();
      if (manualPause) {
        await this.emit({
          type: "workflow.paused",
          message: manualPause.reason,
          data: { reason: "manual_pause", detail: manualPause.reason },
        });
        throw manualPause;
      }
      if (!this.options.suppressFailureEvent?.(error)) {
        await this.emit({
          type: "workflow.failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  private createPrimitives(): WorkflowRuntimePrimitives {
    return createWorkflowRuntimePrimitives({
      abortSignal: this.options.abortSignal,
      recovery: this.options.recovery,
      checkpointStore: this.checkpointStore,
      approvalDecision: this.options.approvalDecision,
      userInputResponse: this.options.userInputResponse,
      nextApprovalId: (changeSet, metadata) => {
        this.approvalCount += 1;
        return this.approvalId(changeSet, this.approvalCount, metadata);
      },
      nextUserInputId: (request, metadata) => {
        this.userInputCount += 1;
        return this.userInputId(request, this.userInputCount, metadata);
      },
      throwIfAborted: () => this.throwIfAborted(),
      manualPauseError: () => this.manualPauseError(),
      matchingRecovery: (action, metadata) => this.matchingRecovery(action, metadata),
      eventData: (metadata, extra) => workflowRuntimeEventData(metadata, extra),
      errorMessage,
      emit: (event) => this.emit(event),
      runBatch: (items, options, fn) => runWorkflowRuntimeBatch(this.collectionContext, items, options, fn),
      paginateTool: (options, fetchPage) => paginateWorkflowRuntimeTool(this.collectionContext, options, fetchPage),
      paginateConnector: (options, fetchPage) => paginateWorkflowRuntimeConnector(this.collectionContext, options, fetchPage),
      mapCollection: (items, options, mapItem) => mapWorkflowRuntimeCollection(this.collectionContext, items, options, mapItem),
      dedupeCollection: (items, options) => dedupeWorkflowRuntimeCollection(this.collectionContext, items, options),
      chunkCollection: (items, options) => chunkWorkflowRuntimeCollection(this.collectionContext, items, options),
      renderDocument: (input, options) => renderWorkflowRuntimeDocument(this.collectionContext, input, options),
      mapModel: (items, options, mapItem) => mapWorkflowRuntimeModel(this.collectionContext, items, options, mapItem),
      reduceModel: (items, options, reduceItems) => reduceWorkflowRuntimeModel(this.collectionContext, items, options, reduceItems),
    });
  }

  private bindTools(handlers: WorkflowToolHandlers): WorkflowToolHandlers {
    return new Proxy(
      {},
      {
        get: (_target, property) => {
          if (typeof property !== "string") return undefined;
          if (!this.allowedTools.has(property)) {
            throw new Error(`Workflow attempted to call undeclared tool: ${property}`);
          }
          const handler = handlers[property];
          if (!handler) throw new Error(`Workflow tool is declared but has no implementation: ${property}`);
          return async (input: unknown): Promise<unknown> => {
            this.throwIfAborted();
            await this.emit({ type: "tool.start", message: property });
            try {
              const result = await handler(input);
              await this.emit({ type: "tool.end", message: property });
              return result;
            } catch (error) {
              await this.emit({
                type: "tool.error",
                message: property,
                data: { error: error instanceof Error ? error.message : String(error) },
              });
              throw error;
            }
          };
        },
      },
    ) as WorkflowToolHandlers;
  }

  private async emit(event: WorkflowRuntimeEvent): Promise<void> {
    await this.options.eventSink?.append(event);
  }

  private throwIfAborted(): void {
    if (!this.options.abortSignal?.aborted) return;
    const manualPause = this.manualPauseError();
    if (manualPause) throw manualPause;
    throw new Error("Workflow run canceled.");
  }

  private manualPauseError(): WorkflowManualPausedError | undefined {
    const reason = this.options.abortSignal?.reason;
    return this.options.abortSignal?.aborted && reason instanceof WorkflowManualPausedError ? reason : undefined;
  }

  private matchingRecovery(action: WorkflowRecoveryContext["action"], metadata?: WorkflowRuntimeMetadata): WorkflowRecoveryContext | undefined {
    const recovery = this.options.recovery;
    if (!recovery || recovery.action !== action) return undefined;
    if (recovery.targetGraphNodeId && metadata?.nodeId !== recovery.targetGraphNodeId) return undefined;
    if (recovery.targetGraphEdgeId && metadata?.edgeId !== recovery.targetGraphEdgeId) return undefined;
    if (recovery.targetItemKey && metadata?.itemKey !== recovery.targetItemKey) return undefined;
    const metadataTargetKind = metadata?.targetKind ?? (metadata?.itemKey ? "item" : undefined);
    if (recovery.targetKind && metadataTargetKind !== recovery.targetKind) return undefined;
    const needsExactOrdinal = recovery.targetKind === "page" || recovery.targetKind === "chunk";
    if (needsExactOrdinal && recovery.targetIndex !== undefined && metadata?.targetIndex !== recovery.targetIndex) return undefined;
    if (!needsExactOrdinal && recovery.targetIndex !== undefined && metadata?.targetIndex !== undefined && metadata.targetIndex !== recovery.targetIndex) return undefined;
    if (needsExactOrdinal && recovery.targetCheckpointKey && metadata?.checkpointKey !== recovery.targetCheckpointKey) return undefined;
    return recovery;
  }

}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultApprovalId(changeSet: unknown, index: number, metadata?: WorkflowNodeMetadata): string {
  const hash = createHash("sha256").update(stableStringify(metadataIdBasis(metadata) ?? changeSet)).digest("hex").slice(0, 16);
  return `approval-${index}-${hash}`;
}

function defaultUserInputId(request: Omit<WorkflowUserInputRequest, "id" | "status">, index: number, metadata?: WorkflowNodeMetadata): string {
  const metadataBasis = metadataIdBasis(metadata);
  const idBasis = metadataBasis
    ? {
        ...metadataBasis,
        prompt: request.prompt,
        allowFreeform: request.allowFreeform,
        choices: request.choices.map((choice) => ({ id: choice.id, label: choice.label })),
      }
    : request;
  const hash = createHash("sha256").update(stableStringify(idBasis)).digest("hex").slice(0, 16);
  return `input-${index}-${hash}`;
}

function metadataIdBasis(metadata?: WorkflowNodeMetadata): WorkflowNodeMetadata | undefined {
  if (!metadata?.nodeId && !metadata?.edgeId && !metadata?.itemKey) return undefined;
  return {
    ...(metadata.nodeId ? { nodeId: metadata.nodeId } : {}),
    ...(metadata.edgeId ? { edgeId: metadata.edgeId } : {}),
    ...(metadata.itemKey ? { itemKey: metadata.itemKey } : {}),
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableValue(record[key])]));
}
