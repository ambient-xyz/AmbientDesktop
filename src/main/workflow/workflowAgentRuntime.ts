import { createHash } from "node:crypto";
import type { WorkflowApprovalStatus, WorkflowManifest, WorkflowRecoveryContext, WorkflowRecoveryTargetKind } from "../../shared/types";

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

interface WorkflowRuntimeMetadata extends WorkflowNodeMetadata {
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
  private readonly approvalId: WorkflowApprovalIdFactory;
  private readonly userInputId: WorkflowUserInputIdFactory;
  private approvalCount = 0;
  private userInputCount = 0;

  constructor(private readonly options: WorkflowRuntimeOptions) {
    this.allowedTools = new Set(options.manifest.tools);
    this.checkpointStore = options.checkpointStore ?? new MemoryWorkflowCheckpointStore();
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
    const requireApproval = async (changeSet: unknown, metadata?: WorkflowNodeMetadata): Promise<WorkflowApprovalRequest> => {
      this.throwIfAborted();
      this.approvalCount += 1;
      const request = { id: this.approvalId(changeSet, this.approvalCount, metadata), changeSet, status: "pending" as const };
      await this.emit({ type: "approval.required", data: workflowEventData(metadata, { id: request.id, changeSet }) });
      const decision = await this.options.approvalDecision?.(request.id, changeSet);
      if (decision === "approved") {
        const approved = { ...request, status: "approved" as const };
        await this.emit({ type: "approval.approved", message: request.id, data: workflowEventData(metadata, { id: request.id, source: "resume" }) });
        return approved;
      }
      if (decision === "rejected") {
        await this.emit({ type: "approval.rejected", message: request.id, data: workflowEventData(metadata, { id: request.id, source: "resume" }) });
        throw new Error(`Workflow approval rejected: ${request.id}`);
      }
      throw new WorkflowPausedError(request);
    };
    const askUser = async (
      prompt: string,
      options: WorkflowAskUserOptions = {},
      metadata?: WorkflowNodeMetadata,
    ): Promise<WorkflowUserInputResponse> => {
      this.throwIfAborted();
      this.userInputCount += 1;
      const requestBase = {
        prompt: prompt.trim(),
        choices: options.choices ?? [],
        allowFreeform: options.allowFreeform ?? true,
        data: options.data,
      };
      if (!requestBase.prompt) throw new Error("workflow.askUser prompt is required.");
      const request: WorkflowUserInputRequest = {
        id: this.userInputId(requestBase, this.userInputCount, metadata),
        ...requestBase,
        status: "pending",
      };
      await this.emit({ type: "workflow.input.required", message: request.prompt, data: workflowEventData(metadata, { ...request }) });
      const response = await this.options.userInputResponse?.(request);
      if (response) {
        await this.emit({
          type: "workflow.input.received",
          message: request.id,
          data: workflowEventData(metadata, { ...response, prompt: request.prompt }),
        });
        return response;
      }
      throw new WorkflowInputPausedError(request);
    };

    return {
      step: async <T>(
        name: string,
        metadataOrFn: WorkflowNodeMetadata | (() => Promise<T> | T),
        maybeFn?: () => Promise<T> | T,
      ): Promise<T> => {
        this.throwIfAborted();
        const metadata = typeof metadataOrFn === "function" ? undefined : metadataOrFn;
        const fn = typeof metadataOrFn === "function" ? metadataOrFn : maybeFn;
        if (!fn) throw new Error(`Workflow step is missing a callback: ${name}`);
        await this.emit({ type: "step.start", message: name, data: workflowEventData(metadata) });
        try {
          const result = await fn();
          await this.emit({ type: "step.end", message: name, data: workflowEventData(metadata) });
          return result;
        } catch (error) {
          const manualPause = this.manualPauseError();
          if (isWorkflowPausedError(error) || manualPause) {
            await this.emit({
              type: "step.paused",
              message: name,
              data: workflowEventData(
                metadata,
                error instanceof WorkflowPausedError
                  ? { approvalId: error.approval.id }
                  : error instanceof WorkflowInputPausedError
                    ? { inputRequestId: error.input.id }
                    : { reason: "manual_pause" },
              ),
            });
            throw manualPause ?? error;
          }
          await this.emit({
            type: "step.error",
            message: name,
            data: workflowEventData(metadata, { error: error instanceof Error ? error.message : String(error) }),
          });
          throw error;
        }
      },
      batch: async <T, R>(
        items: T[],
        options: WorkflowBatchOptions,
        fn: (item: T, index: number) => Promise<R> | R,
      ): Promise<R[]> => this.runBatch(items, options, fn),
      paginateTool: async (options, fetchPage) => this.paginateTool(options, fetchPage),
      paginateConnector: async (options, fetchPage) => this.paginateConnector(options, fetchPage),
      mapCollection: async <T, R>(items: T[], options: WorkflowCollectionMapOptions, mapItem: (item: T, index: number) => Promise<R> | R) =>
        this.mapCollection(items, options, mapItem),
      dedupeCollection: async (items, options) => this.dedupeCollection(items, options),
      chunkCollection: async (items, options) => this.chunkCollection(items, options),
      renderDocument: async (input, options) => this.renderDocument(input, options),
      mapModel: async <T, R>(items: T[], options: WorkflowModelMapOptions, mapItem: (item: T, index: number) => Promise<R> | R) =>
        this.mapModel(items, options, mapItem),
      reduceModel: async <R>(items: unknown[], options: WorkflowModelReduceOptions, reduceItems: (items: unknown[], context: WorkflowModelReduceContext) => Promise<R> | R) =>
        this.reduceModel(items, options, reduceItems),
      checkpoint: async (key: string, value: unknown): Promise<void> => {
        this.throwIfAborted();
        await this.checkpointStore.set(key, value);
        await this.emit({ type: "checkpoint.write", message: key });
      },
      resumePoint: async <T>(key: string, fn: () => Promise<T> | T): Promise<T> => {
        this.throwIfAborted();
        const existing = await this.checkpointStore.get<T>(key);
        if (existing !== undefined) {
          await this.emit({ type: "checkpoint.resume", message: key });
          return existing;
        }
        const value = await fn();
        this.throwIfAborted();
        await this.checkpointStore.set(key, value);
        await this.emit({ type: "checkpoint.write", message: key });
        return value;
      },
      requireApproval,
      askUser,
      stageMutation: async <T>(changeSet: unknown, apply: () => Promise<T> | T, metadata?: WorkflowNodeMetadata): Promise<T> => {
        this.throwIfAborted();
        await this.emit({ type: "mutation.staged", data: workflowEventData(metadata, { changeSet }) });
        const approval = await requireApproval(changeSet, metadata);
        const result = await apply();
        this.throwIfAborted();
        await this.emit({ type: "mutation.applied", data: workflowEventData(metadata, { approvalId: approval.id }) });
        return result;
      },
      skipItem: async (metadata?: WorkflowNodeMetadata): Promise<boolean> => {
        this.throwIfAborted();
        const recovery = this.matchingRecovery("skip_item", metadata);
        if (!recovery) return false;
        await this.emit({
          type: "workflow.recovery.skipped_item",
          message: recovery.targetItemKey,
          data: workflowEventData(metadata, {
            sourceRunId: recovery.sourceRunId,
            sourceEventId: recovery.sourceEventId,
            action: recovery.action,
          }),
        });
        return true;
      },
      emit: (event: WorkflowRuntimeEvent): Promise<void> => this.emit(event),
      abortSignal: this.options.abortSignal,
      recovery: this.options.recovery,
    };
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

  private async paginateTool(
    options: WorkflowPaginateToolOptions,
    fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
  ): Promise<WorkflowPaginatedCollection> {
    this.throwIfAborted();
    const name = options.name ?? "paginate tool";
    const maxItems = Math.max(1, Math.floor(options.maxItems));
    const maxPages = Math.max(1, Math.floor(options.maxPages));
    const pageSize = options.pageSize === undefined ? undefined : Math.max(1, Math.floor(options.pageSize));
    const itemsPath = options.itemsPath ?? "items";
    const nextPageTokenPath = options.nextPageTokenPath;
    const pageTokenInputPath = options.pageTokenInputPath ?? "pageToken";
    const queryInputPath = options.queryInputPath ?? "query";
    const pageQueries = Array.isArray(options.pageQueries) ? options.pageQueries.filter((query): query is string => typeof query === "string" && query.trim().length > 0) : [];
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:tool-paginate`;
    const existing = await this.checkpointStore.get<WorkflowPaginatedCheckpointState>(checkpointKey);
    if (existing?.complete) {
      await this.emit({ type: "collection.paginate.resume", message: name, data: workflowEventData(options, { pageCount: existing.pageCount, count: existing.count, source: "tool" }) });
      return publicPaginatedCollection(existing);
    }

    const pages = Array.isArray(existing?.pages) ? [...existing.pages] : [];
    const items = Array.isArray(existing?.items) ? [...existing.items] : [];
    const seenKeys = new Set(Array.isArray(existing?.seenKeys) ? existing.seenKeys.filter((item): item is string => typeof item === "string") : []);
    let nextPageToken = typeof existing?.nextPageToken === "string" && existing.nextPageToken ? existing.nextPageToken : undefined;
    let pageIndex = Math.max(0, Math.floor(existing?.nextPageIndex ?? existing?.pageCount ?? pages.length));
    let forcedTruncated = existing?.truncated === true;

    await this.emit({ type: "collection.paginate.start", message: name, data: workflowEventData(options, { maxItems, maxPages, pageSize, resumePage: pageIndex, source: "tool" }) });
    while (pageIndex < maxPages && items.length < maxItems) {
      this.throwIfAborted();
      if (pageQueries.length > 0 && pageIndex >= pageQueries.length) break;
      if (pageIndex > 0 && !nextPageToken && pageQueries.length === 0) break;
      const pageMetadata = workflowPageMetadata(options, pageIndex, checkpointKey);
      const skippedPage = this.matchingRecovery("skip_item", pageMetadata);
      if (skippedPage) {
        await this.emitSkippedRecoveryTarget(name, pageMetadata, {
          index: pageIndex,
          pageIndex: pageIndex + 1,
          total: maxPages,
          sourceRunId: skippedPage.sourceRunId,
          sourceEventId: skippedPage.sourceEventId,
          action: skippedPage.action,
          source: "tool",
        });
        pageIndex += 1;
        forcedTruncated = true;
        const partial = paginatedCollectionState({ items, pages, maxItems, maxPages, pageSize, nextPageToken, seenKeys, complete: false, nextPageIndex: pageIndex, truncated: true });
        await this.checkpointStore.set(checkpointKey, partial);
        if (pageQueries.length === 0) break;
        continue;
      }
      const pageInput = cloneRecord(options.input ?? {});
      if (pageSize !== undefined && options.pageSizeInputPath) setPath(pageInput, options.pageSizeInputPath, pageSize);
      if (pageQueries.length > 0) setPath(pageInput, queryInputPath, pageQueries[pageIndex]!);
      if (nextPageToken) setPath(pageInput, pageTokenInputPath, nextPageToken);
      await this.emit({
        type: "collection.page.start",
        message: name,
        data: workflowEventData(pageMetadata, {
          pageIndex: pageIndex + 1,
          maxPages,
          currentCount: items.length,
          hasPageToken: Boolean(nextPageToken),
          hasPageQuery: pageQueries.length > 0,
          source: "tool",
        }),
      });
      let page: unknown;
      let pageItems: unknown;
      try {
        page = await fetchPage(pageInput, pageIndex);
        pageItems = readPath(page, itemsPath);
        if (!Array.isArray(pageItems)) throw new Error(`Paginated tool page ${pageIndex + 1} did not return array at ${itemsPath || "<root>"}.`);
      } catch (error) {
        await this.emit({
          type: "collection.page.error",
          message: name,
          data: workflowEventData(pageMetadata, {
            pageIndex: pageIndex + 1,
            maxPages,
            currentCount: items.length,
            source: "tool",
            error: errorMessage(error),
          }),
        });
        throw error;
      }
      let accepted = 0;
      for (const item of pageItems) {
        if (items.length >= maxItems) break;
        const dedupeKey = options.dedupeKeyPath ? readPath(item, options.dedupeKeyPath) : undefined;
        if (dedupeKey !== undefined && dedupeKey !== null) {
          const key = String(dedupeKey);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
        }
        items.push(item);
        accepted += 1;
      }
      pages.push(page);
      const rawNextPageToken = nextPageTokenPath ? readPath(page, nextPageTokenPath) : undefined;
      nextPageToken = typeof rawNextPageToken === "string" && rawNextPageToken ? rawNextPageToken : undefined;
      pageIndex += 1;
      const partial = paginatedCollectionState({ items, pages, maxItems, maxPages, pageSize, nextPageToken, seenKeys, complete: false, nextPageIndex: pageIndex });
      await this.checkpointStore.set(checkpointKey, partial);
      await this.emit({
        type: "collection.page.end",
        message: name,
        data: workflowEventData(pageMetadata, { pageIndex, accepted, pageItems: pageItems.length, count: items.length, nextPageToken: Boolean(nextPageToken), source: "tool" }),
      });
    }

    const finalState = paginatedCollectionState({ items, pages, maxItems, maxPages, pageSize, nextPageToken, seenKeys, complete: true, nextPageIndex: pageIndex, truncated: forcedTruncated ? true : undefined });
    await this.checkpointStore.set(checkpointKey, finalState);
    await this.emit({
      type: "collection.paginate.end",
      message: name,
      data: workflowEventData(options, { pageCount: finalState.pageCount, count: finalState.count, truncated: finalState.truncated, nextPageToken: Boolean(finalState.nextPageToken), source: "tool" }),
    });
    return publicPaginatedCollection(finalState);
  }

  private async paginateConnector(
    options: WorkflowPaginateConnectorOptions,
    fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
  ): Promise<WorkflowPaginatedCollection> {
    this.throwIfAborted();
    const name = options.name ?? "paginate";
    const maxItems = Math.max(1, Math.floor(options.maxItems));
    const maxPages = Math.max(1, Math.floor(options.maxPages));
    const pageSize = options.pageSize === undefined ? undefined : Math.max(1, Math.floor(options.pageSize));
    const itemsPath = options.itemsPath ?? "items";
    const nextPageTokenPath = options.nextPageTokenPath ?? "nextPageToken";
    const pageTokenInputPath = options.pageTokenInputPath ?? "pageToken";
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:paginate`;
    const existing = await this.checkpointStore.get<WorkflowPaginatedCheckpointState>(checkpointKey);
    if (existing?.complete) {
      await this.emit({ type: "collection.paginate.resume", message: name, data: workflowEventData(options, { pageCount: existing.pageCount, count: existing.count }) });
      return publicPaginatedCollection(existing);
    }

    const pages = Array.isArray(existing?.pages) ? [...existing.pages] : [];
    const items = Array.isArray(existing?.items) ? [...existing.items] : [];
    const seenKeys = new Set(Array.isArray(existing?.seenKeys) ? existing.seenKeys.filter((item): item is string => typeof item === "string") : []);
    let nextPageToken = typeof existing?.nextPageToken === "string" && existing.nextPageToken ? existing.nextPageToken : undefined;
    let pageIndex = Math.max(0, Math.floor(existing?.nextPageIndex ?? existing?.pageCount ?? pages.length));
    const forcedTruncated = existing?.truncated === true;

    await this.emit({ type: "collection.paginate.start", message: name, data: workflowEventData(options, { maxItems, maxPages, pageSize, resumePage: pageIndex }) });
    while (pageIndex < maxPages && items.length < maxItems) {
      this.throwIfAborted();
      if (pageIndex > 0 && !nextPageToken) break;
      const pageMetadata = workflowPageMetadata(options, pageIndex, checkpointKey);
      const skippedPage = this.matchingRecovery("skip_item", pageMetadata);
      if (skippedPage) {
        await this.emitSkippedRecoveryTarget(name, pageMetadata, {
          index: pageIndex,
          pageIndex: pageIndex + 1,
          total: maxPages,
          sourceRunId: skippedPage.sourceRunId,
          sourceEventId: skippedPage.sourceEventId,
          action: skippedPage.action,
          continuedWithPartial: true,
        });
        const partial = paginatedCollectionState({ items, pages, maxItems, maxPages, pageSize, nextPageToken, seenKeys, complete: true, nextPageIndex: pageIndex + 1, truncated: true });
        await this.checkpointStore.set(checkpointKey, partial);
        await this.emit({
          type: "collection.paginate.end",
          message: name,
          data: workflowEventData(options, { pageCount: partial.pageCount, count: partial.count, truncated: partial.truncated, nextPageToken: Boolean(partial.nextPageToken), continuedWithPartial: true }),
        });
        return publicPaginatedCollection(partial);
      }
      const pageInput = cloneRecord(options.input ?? {});
      if (pageSize !== undefined && options.pageSizeInputPath) setPath(pageInput, options.pageSizeInputPath, pageSize);
      if (nextPageToken) setPath(pageInput, pageTokenInputPath, nextPageToken);
      await this.emit({
        type: "collection.page.start",
        message: name,
        data: workflowEventData(pageMetadata, { pageIndex: pageIndex + 1, maxPages, currentCount: items.length, hasPageToken: Boolean(nextPageToken) }),
      });
      let page: unknown;
      let pageItems: unknown;
      try {
        page = await fetchPage(pageInput, pageIndex);
        pageItems = readPath(page, itemsPath);
        if (!Array.isArray(pageItems)) throw new Error(`Paginated connector page ${pageIndex + 1} did not return array at ${itemsPath}.`);
      } catch (error) {
        await this.emit({
          type: "collection.page.error",
          message: name,
          data: workflowEventData(pageMetadata, {
            pageIndex: pageIndex + 1,
            maxPages,
            currentCount: items.length,
            error: errorMessage(error),
          }),
        });
        throw error;
      }
      let accepted = 0;
      for (const item of pageItems) {
        if (items.length >= maxItems) break;
        const dedupeKey = options.dedupeKeyPath ? readPath(item, options.dedupeKeyPath) : undefined;
        if (dedupeKey !== undefined && dedupeKey !== null) {
          const key = String(dedupeKey);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
        }
        items.push(item);
        accepted += 1;
      }
      pages.push(page);
      const rawNextPageToken = readPath(page, nextPageTokenPath);
      nextPageToken = typeof rawNextPageToken === "string" && rawNextPageToken ? rawNextPageToken : undefined;
      pageIndex += 1;
      const partial = paginatedCollectionState({ items, pages, maxItems, maxPages, pageSize, nextPageToken, seenKeys, complete: false, nextPageIndex: pageIndex });
      await this.checkpointStore.set(checkpointKey, partial);
      await this.emit({
        type: "collection.page.end",
        message: name,
        data: workflowEventData(pageMetadata, { pageIndex, accepted, pageItems: pageItems.length, count: items.length, nextPageToken: Boolean(nextPageToken) }),
      });
    }

    const finalState = paginatedCollectionState({ items, pages, maxItems, maxPages, pageSize, nextPageToken, seenKeys, complete: true, nextPageIndex: pageIndex, truncated: forcedTruncated ? true : undefined });
    await this.checkpointStore.set(checkpointKey, finalState);
    await this.emit({
      type: "collection.paginate.end",
      message: name,
      data: workflowEventData(options, { pageCount: finalState.pageCount, count: finalState.count, truncated: finalState.truncated, nextPageToken: Boolean(finalState.nextPageToken) }),
    });
    return publicPaginatedCollection(finalState);
  }

  private async mapCollection<T, R>(
    items: T[],
    options: WorkflowCollectionMapOptions,
    mapItem: (item: T, index: number) => Promise<R> | R,
  ): Promise<WorkflowMappedCollection> {
    this.throwIfAborted();
    if (!Array.isArray(items)) throw new Error("workflow.mapCollection items must be an array.");
    const name = options.name ?? "map collection";
    const maxItems = Math.max(1, Math.floor(options.maxItems));
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:collection-map`;
    const existing = await this.checkpointStore.get<WorkflowMappedCollection & { complete?: boolean }>(checkpointKey);
    if (existing?.complete) {
      await this.emit({ type: "collection.map.resume", message: name, data: workflowEventData(options, { count: existing.count, sourceCount: existing.sourceCount }) });
      return publicMappedCollection(existing);
    }
    const selected = items.slice(0, maxItems);
    await this.emit({ type: "collection.map.start", message: name, data: workflowEventData(options, { total: selected.length, sourceCount: items.length, maxItems }) });
    const mapped = new Array<unknown>(selected.length);
    for (const [index, item] of selected.entries()) {
      this.throwIfAborted();
      const itemMetadata = batchItemMetadata({ ...options, targetKind: "item", checkpointKey }, item, index);
      const recovery = this.matchingRecovery("skip_item", itemMetadata);
      if (recovery) {
        await this.emitSkippedRecoveryTarget(name, itemMetadata, {
          index,
          completed: index + 1,
          total: selected.length,
          sourceRunId: recovery.sourceRunId,
          sourceEventId: recovery.sourceEventId,
          action: recovery.action,
        });
        continue;
      }
      try {
        mapped[index] = await mapItem(item, index);
      } catch (error) {
        await this.emit({
          type: "collection.map.item.failed",
          message: name,
          data: workflowEventData(itemMetadata, {
            index,
            completed: index,
            total: selected.length,
            error: errorMessage(error),
          }),
        });
        throw error;
      }
      await this.emit({ type: "collection.map.item", message: name, data: workflowEventData(itemMetadata, { index, completed: index + 1, total: selected.length }) });
    }
    const mappedItems = mapped.filter((item) => item !== undefined);
    const finalState: WorkflowMappedCollection & { complete: true } = {
      items: mappedItems,
      count: mappedItems.length,
      sourceCount: items.length,
      truncated: items.length > maxItems,
      maxItems,
      complete: true,
    };
    await this.checkpointStore.set(checkpointKey, finalState);
    await this.emit({ type: "collection.map.end", message: name, data: workflowEventData(options, { count: finalState.count, sourceCount: finalState.sourceCount, truncated: finalState.truncated }) });
    return publicMappedCollection(finalState);
  }

  private async dedupeCollection(items: unknown[], options: WorkflowCollectionDedupeOptions): Promise<WorkflowDedupedCollection> {
    this.throwIfAborted();
    if (!Array.isArray(items)) throw new Error("workflow.dedupeCollection items must be an array.");
    const name = options.name ?? "dedupe collection";
    const maxItems = Math.max(1, Math.floor(options.maxItems));
    const strategy = options.strategy ?? "url_canonical";
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:collection-dedupe`;
    const existing = await this.checkpointStore.get<WorkflowDedupedCollection & { complete?: boolean }>(checkpointKey);
    if (existing?.complete) {
      await this.emit({
        type: "collection.dedupe.resume",
        message: name,
        data: workflowEventData(options, { count: existing.count, sourceCount: existing.sourceCount, duplicateCount: existing.duplicateCount }),
      });
      return publicDedupedCollection(existing);
    }

    await this.emit({ type: "collection.dedupe.start", message: name, data: workflowEventData(options, { sourceCount: items.length, maxItems, keyPath: options.keyPath, strategy }) });
    const retained: unknown[] = [];
    const seen = new Set<string>();
    let duplicateCount = 0;
    let uniqueCount = 0;
    for (const [index, item] of items.entries()) {
      this.throwIfAborted();
      const key = collectionDedupeKey(item, { keyPath: options.keyPath, strategy }, index);
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      uniqueCount += 1;
      if (retained.length < maxItems) retained.push(item);
    }
    const finalState: WorkflowDedupedCollection & { complete: true } = {
      items: retained,
      count: retained.length,
      sourceCount: items.length,
      duplicateCount,
      truncated: uniqueCount > maxItems,
      maxItems,
      ...(options.keyPath ? { keyPath: options.keyPath } : {}),
      strategy,
      complete: true,
    };
    await this.checkpointStore.set(checkpointKey, finalState);
    await this.emit({
      type: "collection.dedupe.end",
      message: name,
      data: workflowEventData(options, { count: finalState.count, sourceCount: finalState.sourceCount, duplicateCount, truncated: finalState.truncated, uniqueCount, keyPath: options.keyPath, strategy }),
    });
    return publicDedupedCollection(finalState);
  }

  private async chunkCollection(items: unknown[], options: WorkflowCollectionChunkOptions): Promise<WorkflowChunkedCollection> {
    this.throwIfAborted();
    if (!Array.isArray(items)) throw new Error("workflow.chunkCollection items must be an array.");
    const name = options.name ?? "chunk collection";
    const chunkSize = Math.max(1, Math.floor(options.chunkSize));
    const maxChunks = Math.max(1, Math.floor(options.maxChunks));
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:collection-chunk`;
    const existing = await this.checkpointStore.get<WorkflowChunkedCollection & { complete?: boolean }>(checkpointKey);
    if (existing?.complete) {
      await this.emit({ type: "collection.chunk.resume", message: name, data: workflowEventData(options, { count: existing.count, itemCount: existing.itemCount }) });
      return publicChunkedCollection(existing);
    }
    const maxItems = chunkSize * maxChunks;
    const selected = items.slice(0, maxItems);
    const chunks: WorkflowCollectionChunk[] = [];
    for (let start = 0; start < selected.length && chunks.length < maxChunks; start += chunkSize) {
      const chunkItems = selected.slice(start, start + chunkSize);
      const index = chunks.length;
      chunks.push({
        id: `${options.nodeId ?? "chunk"}-${index + 1}`,
        index,
        start,
        end: start + chunkItems.length,
        count: chunkItems.length,
        items: chunkItems,
      });
    }
    const finalState: WorkflowChunkedCollection & { complete: true } = {
      chunks,
      count: chunks.length,
      itemCount: selected.length,
      sourceCount: items.length,
      truncated: items.length > maxItems,
      chunkSize,
      maxChunks,
      complete: true,
    };
    await this.checkpointStore.set(checkpointKey, finalState);
    await this.emit({ type: "collection.chunk.end", message: name, data: workflowEventData(options, { count: finalState.count, itemCount: finalState.itemCount, sourceCount: finalState.sourceCount, truncated: finalState.truncated }) });
    return publicChunkedCollection(finalState);
  }

  private async renderDocument(input: unknown, options: WorkflowDocumentRenderOptions): Promise<WorkflowRenderedDocument> {
    this.throwIfAborted();
    const name = options.name ?? "render document";
    const format = options.format ?? "markdown";
    if (format !== "markdown" && format !== "html" && format !== "pdf") throw new Error(`Unsupported workflow document format: ${String(format)}`);
    const title = normalizedDocumentTitle(options.title, name);
    const artifactPath = normalizedDocumentPath(options.path, title, format);
    const maxSourceChars = Math.max(1_000, Math.floor(options.maxSourceChars ?? 200_000));
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:document-render`;
    const existing = await this.checkpointStore.get<WorkflowRenderedDocument & { complete?: boolean }>(checkpointKey);
    if (existing?.complete) {
      await this.emit({ type: "document.render.resume", message: name, data: workflowEventData(options, { format: existing.format, path: existing.artifactPath, bytes: existing.bytes }) });
      return publicRenderedDocument(existing);
    }

    await this.emit({ type: "document.render.start", message: name, data: workflowEventData(options, { format, path: artifactPath }) });
    const markdown = renderMarkdownDocument(input, title);
    const sourceChars = markdown.length;
    const truncated = sourceChars > maxSourceChars;
    const boundedMarkdown = truncated ? `${markdown.slice(0, maxSourceChars)}\n\n[Document render truncated ${sourceChars - maxSourceChars} source chars]` : markdown;
    const content =
      format === "markdown"
        ? boundedMarkdown
        : format === "html"
          ? renderHtmlDocument(boundedMarkdown, title)
          : renderPdfDocument(boundedMarkdown, title);
    const result: WorkflowRenderedDocument & { complete: true } = {
      title,
      format,
      mimeType: documentMimeType(format),
      artifactPath,
      path: artifactPath,
      content,
      bytes: utf8ByteLength(content),
      sourceChars,
      truncated,
      complete: true,
    };
    await this.checkpointStore.set(checkpointKey, result);
    await this.emit({ type: "document.render.end", message: name, data: workflowEventData(options, { format, path: artifactPath, bytes: result.bytes, sourceChars, truncated }) });
    return publicRenderedDocument(result);
  }

  private async mapModel<T, R>(
    items: T[],
    options: WorkflowModelMapOptions,
    mapItem: (item: T, index: number) => Promise<R> | R,
  ): Promise<WorkflowModelMappedCollection<R>> {
    this.throwIfAborted();
    if (!Array.isArray(items)) throw new Error("workflow.mapModel items must be an array.");
    const name = options.name ?? "map model";
    const maxItems = Math.max(1, Math.floor(options.maxItems));
    const selected = items.slice(0, maxItems);
    const maxConcurrency = Math.max(1, Math.min(Math.floor(options.maxConcurrency ?? 1), selected.length || 1));
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:model-map`;
    const existing = await this.checkpointStore.get<WorkflowModelMappedCollection<R> & { complete?: boolean }>(checkpointKey);
    if (existing?.complete) {
      await this.emit({ type: "model.map.resume", message: name, data: workflowEventData(options, { count: existing.count, sourceCount: existing.sourceCount }) });
      return publicModelMappedCollection(existing);
    }

    const partialItems = Array.isArray(existing?.items) ? [...existing.items] : [];
    await this.emit({ type: "model.map.start", message: name, data: workflowEventData(options, { total: selected.length, sourceCount: items.length, maxItems, maxConcurrency }) });
    const mapped = await this.runBatch(selected, { name, nodeId: options.nodeId, edgeId: options.edgeId, maxConcurrency, checkpointKey }, async (item, index) => {
      const cached = partialItems[index];
      if (cached) return cached as WorkflowModelMapItemResult<T, R>;
      const result = await mapItem(item, index);
      const entry: WorkflowModelMapItemResult<T, R> = { item, result, index };
      partialItems[index] = entry as WorkflowModelMapItemResult<unknown, R>;
      const partialState = modelMappedCollectionState({
        items: partialItems,
        sourceCount: items.length,
        truncated: items.length > maxItems,
        maxItems,
        maxConcurrency,
        complete: false,
      });
      await this.checkpointStore.set(checkpointKey, partialState);
      return entry;
    });
    const entries = mapped.filter((item): item is WorkflowModelMapItemResult<T, R> => Boolean(item));
    const finalState = modelMappedCollectionState({
      items: entries,
      sourceCount: items.length,
      truncated: items.length > maxItems,
      maxItems,
      maxConcurrency,
      complete: true,
    });
    await this.checkpointStore.set(checkpointKey, finalState);
    await this.emit({ type: "model.map.end", message: name, data: workflowEventData(options, { count: finalState.count, sourceCount: finalState.sourceCount, truncated: finalState.truncated }) });
    return publicModelMappedCollection(finalState);
  }

  private async reduceModel<R>(
    items: unknown[],
    options: WorkflowModelReduceOptions,
    reduceItems: (items: unknown[], context: WorkflowModelReduceContext) => Promise<R> | R,
  ): Promise<R> {
    this.throwIfAborted();
    if (!Array.isArray(items)) throw new Error("workflow.reduceModel items must be an array.");
    const name = options.name ?? "reduce model";
    const maxInputItems = Math.max(1, Math.floor(options.maxInputItems));
    const selected = items.slice(0, maxInputItems);
    const strategy = options.strategy ?? "single_pass";
    const checkpointKey = options.checkpointKey ?? `${options.nodeId ?? name}:model-reduce`;
    const existing = await this.checkpointStore.get<{ complete?: boolean; result?: R }>(checkpointKey);
    if (existing?.complete) {
      await this.emit({ type: "model.reduce.resume", message: name, data: workflowEventData(options, { selectedCount: selected.length, sourceCount: items.length }) });
      return existing.result as R;
    }
    const baseContext: WorkflowModelReduceContext = {
      sourceCount: items.length,
      selectedCount: selected.length,
      truncated: items.length > maxInputItems,
      strategy,
    };
    await this.emit({ type: "model.reduce.start", message: name, data: workflowEventData(options, baseContext as unknown as Record<string, unknown>) });
    if (strategy !== "tree") {
      const result = await reduceItems(selected, baseContext);
      await this.checkpointStore.set(checkpointKey, { complete: true, result, context: baseContext });
      await this.emit({ type: "model.reduce.end", message: name, data: workflowEventData(options, baseContext as unknown as Record<string, unknown>) });
      return result;
    }

    const maxFanIn = normalizedTreeFanIn(options.maxFanIn);
    const maxLevels = normalizedTreeLevels(options.maxLevels);
    const levels: Array<{ level: number; inputCount: number; outputCount: number; groupCount: number }> = [];
    let current: unknown[] = selected;
    let level = 0;
    let modelCallIndex = 0;
    while (current.length > maxFanIn) {
      if (level >= maxLevels) {
        throw new Error(`workflow.reduceModel tree strategy could not reduce ${current.length} items within maxLevels ${maxLevels} using maxFanIn ${maxFanIn}.`);
      }
      const groups = chunkItems(current, maxFanIn);
      const levelMetadata = workflowEventData(options, { level, inputCount: current.length, groupCount: groups.length, maxFanIn, maxLevels });
      await this.emit({ type: "model.reduce.level.start", message: name, data: levelMetadata });
      const groupResults = await this.runBatch(
        groups,
        { name: `${name} level ${level + 1}`, nodeId: options.nodeId, edgeId: options.edgeId, maxConcurrency: Math.min(4, groups.length) },
        async (group, groupIndex) => {
          const context: WorkflowModelReduceContext = {
            ...baseContext,
            selectedCount: group.length,
            level,
            groupIndex,
            groupCount: groups.length,
            maxFanIn,
            maxLevels,
            final: false,
            inputCount: current.length,
            outputCount: groups.length,
            modelCallIndex: modelCallIndex++,
          };
          await this.emit({ type: "model.reduce.group.start", message: name, data: workflowEventData(options, context as unknown as Record<string, unknown>) });
          const result = await reduceItems(group, context);
          await this.emit({ type: "model.reduce.group.end", message: name, data: workflowEventData(options, context as unknown as Record<string, unknown>) });
          await this.checkpointStore.set(checkpointKey, { complete: false, levels, currentLevel: level, completedGroupIndex: groupIndex, modelCallIndex });
          return result;
        },
      );
      levels.push({ level, inputCount: current.length, outputCount: groupResults.length, groupCount: groups.length });
      current = groupResults;
      await this.emit({ type: "model.reduce.level.end", message: name, data: workflowEventData(options, { level, inputCount: levels.at(-1)?.inputCount, outputCount: current.length, groupCount: groups.length, maxFanIn, maxLevels }) });
      level += 1;
    }

    const finalContext: WorkflowModelReduceContext = {
      ...baseContext,
      selectedCount: current.length,
      level,
      groupIndex: 0,
      groupCount: 1,
      maxFanIn,
      maxLevels,
      final: true,
      inputCount: current.length,
      outputCount: 1,
      modelCallIndex,
    };
    await this.emit({ type: "model.reduce.final.start", message: name, data: workflowEventData(options, finalContext as unknown as Record<string, unknown>) });
    const result = await reduceItems(current, finalContext);
    await this.checkpointStore.set(checkpointKey, {
      complete: true,
      result,
      context: finalContext,
      tree: { sourceCount: items.length, selectedCount: selected.length, truncated: items.length > maxInputItems, maxFanIn, maxLevels, levels, modelCalls: modelCallIndex + 1 },
    });
    await this.emit({ type: "model.reduce.final.end", message: name, data: workflowEventData(options, finalContext as unknown as Record<string, unknown>) });
    await this.emit({
      type: "model.reduce.end",
      message: name,
      data: workflowEventData(options, { ...finalContext, levelCount: levels.length + 1, modelCalls: modelCallIndex + 1 } as unknown as Record<string, unknown>),
    });
    return result;
  }

  private async runBatch<T, R>(
    items: T[],
    options: WorkflowBatchOptions,
    fn: (item: T, index: number) => Promise<R> | R,
  ): Promise<R[]> {
    this.throwIfAborted();
    const name = options.name ?? "batch";
    const maxConcurrency = Math.max(1, Math.min(options.maxConcurrency ?? 1, items.length || 1));
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    await this.emit({ type: "batch.start", message: name, data: workflowEventData(options, { total: items.length, maxConcurrency }) });

    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        this.throwIfAborted();
        const index = nextIndex;
        nextIndex += 1;
        const itemMetadata = batchItemMetadata(options, items[index], index);
        const recovery = this.matchingRecovery("skip_item", itemMetadata);
        if (recovery) {
          await this.emitSkippedRecoveryTarget(name, itemMetadata, {
            index,
            completed: index + 1,
            total: items.length,
            sourceRunId: recovery.sourceRunId,
            sourceEventId: recovery.sourceEventId,
            action: recovery.action,
          });
          continue;
        }
        try {
          results[index] = await fn(items[index], index);
        } catch (error) {
          await this.emit({
            type: "batch.item.failed",
            message: name,
            data: workflowEventData(itemMetadata, {
              index,
              completed: index,
              total: items.length,
              error: errorMessage(error),
            }),
          });
          throw error;
        }
        await this.emit({ type: "batch.item", message: name, data: workflowEventData(itemMetadata, { index, completed: index + 1, total: items.length }) });
      }
    };

    await Promise.all(Array.from({ length: maxConcurrency }, () => worker()));
    await this.emit({ type: "batch.end", message: name, data: workflowEventData(options, { total: items.length }) });
    return results;
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

  private async emitSkippedRecoveryTarget(name: string, metadata: WorkflowRuntimeMetadata, extra: Record<string, unknown>): Promise<void> {
    await this.emit({
      type: "workflow.recovery.skipped_item",
      message: name,
      data: workflowEventData(metadata, extra),
    });
  }
}

function batchItemMetadata(options: WorkflowBatchOptions, item: unknown, index: number): WorkflowRuntimeMetadata {
  const itemKey = options.itemKey ?? itemKeyFromItem(item, index);
  return {
    nodeId: options.nodeId,
    edgeId: options.edgeId,
    itemKey,
    targetKind: options.targetKind ?? recoveryTargetKindFromItem(item),
    targetIndex: index,
    checkpointKey: options.checkpointKey,
  };
}

function itemKeyFromItem(item: unknown, index: number): string {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    for (const key of ["itemKey", "id", "key"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
  }
  return String(index);
}

function recoveryTargetKindFromItem(item: unknown): WorkflowRecoveryTargetKind {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    if (
      typeof record.id === "string" &&
      typeof record.index === "number" &&
      typeof record.start === "number" &&
      typeof record.end === "number" &&
      Array.isArray(record.items)
    ) {
      return "chunk";
    }
  }
  return "item";
}

function workflowPageMetadata(options: WorkflowNodeMetadata, pageIndex: number, checkpointKey: string): WorkflowRuntimeMetadata {
  return {
    nodeId: options.nodeId,
    edgeId: options.edgeId,
    itemKey: `page-${pageIndex + 1}`,
    targetKind: "page",
    targetIndex: pageIndex,
    checkpointKey,
  };
}

function normalizedTreeFanIn(value: number | undefined): number {
  return Math.max(2, Math.min(64, Math.floor(value ?? 8)));
}

function normalizedTreeLevels(value: number | undefined): number {
  return Math.max(1, Math.min(12, Math.floor(value ?? 8)));
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function workflowEventData(metadata: WorkflowRuntimeMetadata | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> | undefined {
  const data = { ...extra };
  if (metadata?.nodeId) data.graphNodeId = metadata.nodeId;
  if (metadata?.edgeId) data.graphEdgeId = metadata.edgeId;
  if (metadata?.itemKey) data.itemKey = metadata.itemKey;
  if (metadata?.targetKind) data.targetKind = metadata.targetKind;
  if (metadata?.targetIndex !== undefined) data.targetIndex = metadata.targetIndex;
  if (metadata?.checkpointKey) data.checkpointKey = metadata.checkpointKey;
  return Object.keys(data).length > 0 ? data : undefined;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function readPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => (current == null ? undefined : (current as Record<string, unknown>)[key]), value);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function collectionDedupeKey(
  item: unknown,
  options: { keyPath?: string; strategy: WorkflowCollectionDedupeStrategy },
  index: number,
): string {
  const rawKey = options.keyPath ? readPath(item, options.keyPath) : inferredCollectionDedupeKey(item);
  if (rawKey === undefined || rawKey === null) return `index:${index}`;
  const stringKey = typeof rawKey === "string" ? rawKey.trim() : stableStringify(rawKey);
  if (!stringKey) return `index:${index}`;
  if (options.strategy === "exact") return `exact:${stringKey}`;
  return `url:${canonicalUrlKey(stringKey) ?? stringKey.toLowerCase()}`;
}

function inferredCollectionDedupeKey(item: unknown): unknown {
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return item;
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  const record = item as Record<string, unknown>;
  for (const key of ["canonicalUrl", "url", "link", "href", "id", "key"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return stableStringify(record);
}

function canonicalUrlKey(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (
        normalized.startsWith("utm_") ||
        [
          "fbclid",
          "gclid",
          "dclid",
          "gbraid",
          "wbraid",
          "mc_cid",
          "mc_eid",
          "igshid",
          "ref",
          "ref_src",
          "spm",
        ].includes(normalized)
      ) {
        url.searchParams.delete(key);
      }
    }
    const params = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    );
    url.search = "";
    for (const [key, paramValue] of params) url.searchParams.append(key, paramValue);
    url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    return url.toString();
  } catch {
    return undefined;
  }
}

function paginatedCollectionState(input: {
  items: unknown[];
  pages: unknown[];
  maxItems: number;
  maxPages: number;
  pageSize?: number;
  nextPageToken?: string;
  seenKeys: Set<string>;
  complete: boolean;
  nextPageIndex?: number;
  truncated?: boolean;
}): WorkflowPaginatedCheckpointState {
  const computedTruncated = input.items.length >= input.maxItems || Boolean(input.nextPageToken && input.pages.length >= input.maxPages);
  const truncated = input.truncated ?? computedTruncated;
  return {
    items: input.items,
    pages: input.pages,
    count: input.items.length,
    pageCount: input.pages.length,
    truncated,
    ...(input.nextPageToken ? { nextPageToken: input.nextPageToken } : {}),
    maxItems: input.maxItems,
    maxPages: input.maxPages,
    ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
    complete: input.complete,
    seenKeys: [...input.seenKeys],
    nextPageIndex: input.nextPageIndex ?? input.pages.length,
  };
}

function publicPaginatedCollection(state: WorkflowPaginatedCollection & { complete?: boolean; seenKeys?: string[] }): WorkflowPaginatedCollection {
  return {
    items: state.items,
    pages: state.pages,
    count: state.count,
    pageCount: state.pageCount,
    truncated: state.truncated,
    ...(state.nextPageToken ? { nextPageToken: state.nextPageToken } : {}),
    maxItems: state.maxItems,
    maxPages: state.maxPages,
    ...(state.pageSize !== undefined ? { pageSize: state.pageSize } : {}),
  };
}

type WorkflowPaginatedCheckpointState = WorkflowPaginatedCollection & {
  complete?: boolean;
  seenKeys?: string[];
  nextPageIndex?: number;
};

function publicMappedCollection(state: WorkflowMappedCollection & { complete?: boolean }): WorkflowMappedCollection {
  return {
    items: state.items,
    count: state.count,
    sourceCount: state.sourceCount,
    truncated: state.truncated,
    maxItems: state.maxItems,
  };
}

function publicDedupedCollection(state: WorkflowDedupedCollection & { complete?: boolean }): WorkflowDedupedCollection {
  return {
    items: state.items,
    count: state.count,
    sourceCount: state.sourceCount,
    duplicateCount: state.duplicateCount,
    truncated: state.truncated,
    maxItems: state.maxItems,
    ...(state.keyPath ? { keyPath: state.keyPath } : {}),
    strategy: state.strategy,
  };
}

function publicChunkedCollection(state: WorkflowChunkedCollection & { complete?: boolean }): WorkflowChunkedCollection {
  return {
    chunks: state.chunks,
    count: state.count,
    itemCount: state.itemCount,
    sourceCount: state.sourceCount,
    truncated: state.truncated,
    chunkSize: state.chunkSize,
    maxChunks: state.maxChunks,
  };
}

function publicRenderedDocument(state: WorkflowRenderedDocument & { complete?: boolean }): WorkflowRenderedDocument {
  return {
    title: state.title,
    format: state.format,
    mimeType: state.mimeType,
    artifactPath: state.artifactPath,
    path: state.path,
    content: state.content,
    bytes: state.bytes,
    sourceChars: state.sourceChars,
    truncated: state.truncated,
  };
}

function modelMappedCollectionState<R>(input: {
  items: Array<WorkflowModelMapItemResult<unknown, R>>;
  sourceCount: number;
  truncated: boolean;
  maxItems: number;
  maxConcurrency: number;
  complete: boolean;
}): WorkflowModelMappedCollection<R> & { complete: boolean } {
  const items = input.items.filter((item): item is WorkflowModelMapItemResult<unknown, R> => Boolean(item));
  return {
    items,
    results: items.map((item) => item.result),
    count: items.length,
    sourceCount: input.sourceCount,
    truncated: input.truncated,
    maxItems: input.maxItems,
    maxConcurrency: input.maxConcurrency,
    complete: input.complete,
  };
}

function publicModelMappedCollection<R>(state: WorkflowModelMappedCollection<R> & { complete?: boolean }): WorkflowModelMappedCollection<R> {
  return {
    items: state.items,
    results: state.results,
    count: state.count,
    sourceCount: state.sourceCount,
    truncated: state.truncated,
    maxItems: state.maxItems,
    maxConcurrency: state.maxConcurrency,
  };
}

function normalizedDocumentTitle(title: unknown, fallback: string): string {
  const value = title == null ? "" : typeof title === "string" ? title : scalarPreview(title);
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback || "Workflow Report";
}

function normalizedDocumentPath(path: string | undefined, title: string, format: WorkflowDocumentRenderFormat): string {
  if (path?.trim()) return path.trim();
  const extension = format === "markdown" ? "md" : format;
  const filename = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `reports/${filename || "workflow-report"}.${extension}`;
}

function documentMimeType(format: WorkflowDocumentRenderFormat): string {
  if (format === "markdown") return "text/markdown; charset=utf-8";
  if (format === "html") return "text/html; charset=utf-8";
  return "application/pdf";
}

function renderMarkdownDocument(input: unknown, title: string): string {
  const body = markdownBody(input);
  const hasHeading = /^\s*#\s+/m.test(body);
  return `${hasHeading ? "" : `# ${title}\n\n`}${body.trim()}\n`;
}

function markdownBody(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    for (const key of ["markdown", "content", "value"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    for (const key of ["report", "summary"]) {
      const value = record[key];
      if (typeof value !== "string" || !value.trim()) continue;
      const siblingEntries = Object.entries(record).filter(([candidate, nested]) => candidate !== key && nested !== undefined);
      if (siblingEntries.length === 0) return value;
      const siblingMarkdown = renderMarkdownValue(Object.fromEntries(siblingEntries), 0).trim();
      return siblingMarkdown ? `${value.trim()}\n\n${siblingMarkdown}` : value;
    }
  }
  return renderMarkdownValue(input, 0).trim() || "(No document content.)";
}

function renderMarkdownValue(value: unknown, depth: number): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "_None._";
    return value.map((item) => `- ${renderMarkdownValue(item, depth + 1).replace(/\n+/g, "\n  ")}`).join("\n");
  }
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>).filter(([, nested]) => nested !== undefined);
  if (entries.length === 0) return "_None._";
  const headingLevel = "#".repeat(Math.min(depth + 2, 6));
  return entries
    .map(([key, nested]) => {
      const rendered = renderMarkdownValue(nested, depth + 1);
      if (depth <= 1 && nested && typeof nested === "object") return `${headingLevel} ${humanizeDocumentKey(key)}\n\n${rendered}`;
      return `**${humanizeDocumentKey(key)}:** ${rendered}`;
    })
    .join("\n\n");
}

function renderHtmlDocument(markdown: string, title: string): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    `  <title>${escapeHtml(title)}</title>`,
    '  <style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;margin:40px;max-width:920px}pre{white-space:pre-wrap}</style>',
    "</head>",
    "<body>",
    `  <pre>${escapeHtml(markdown)}</pre>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function renderPdfDocument(markdown: string, title: string): string {
  const lines = pdfTextLines(markdown, title);
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  if (pages.length === 0) pages.push([title]);
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  const fontObjectId = 3 + pages.length * 2;
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);
  for (const [index, pageLines] of pages.entries()) {
    const pageObjectId = pageObjectIds[index]!;
    const contentObjectId = pageObjectId + 1;
    const stream = pdfContentStream(pageLines);
    objects.push(`${pageObjectId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`);
    objects.push(`${contentObjectId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  }
  objects.push(`${fontObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  const header = "%PDF-1.4\n";
  let offset = header.length;
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }
  const xrefOffset = offset;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  return `${header}${objects.join("")}${xref}`;
}

function pdfTextLines(markdown: string, title: string): string[] {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/[#*_`>|]/g, "")
    .split(/\r?\n/)
    .flatMap((line) => wrapPdfLine(line.trim(), 92));
  return [title, "", ...plain].filter((line, index, lines) => line || lines[index - 1] !== "");
}

function wrapPdfLine(line: string, width: number): string[] {
  if (!line) return [""];
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length <= width ? word : word.slice(0, width);
  }
  if (current) lines.push(current);
  return lines;
}

function pdfContentStream(lines: string[]): string {
  return ["BT", "/F1 11 Tf", "50 750 Td", "14 TL", ...lines.map((line) => `(${escapePdfText(line)}) Tj\nT*`), "ET"].join("\n");
}

function escapePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function humanizeDocumentKey(key: string): string {
  return key
    .replace(/[-_.:]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scalarPreview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `Collection (${value.length})`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["title", "name", "label", "summary"]) {
      const nested = record[key];
      if (typeof nested === "string" && nested.trim()) return nested;
    }
  }
  return "Workflow Report";
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WorkflowPausedError extends Error {
  constructor(readonly approval: WorkflowApprovalRequest) {
    super(`Workflow paused for approval: ${approval.id}`);
    this.name = "WorkflowPausedError";
  }
}

export class WorkflowInputPausedError extends Error {
  constructor(readonly input: WorkflowUserInputRequest) {
    super(`Workflow paused for user input: ${input.id}`);
    this.name = "WorkflowInputPausedError";
  }
}

export class WorkflowManualPausedError extends Error {
  constructor(readonly reason = "Workflow paused by user.") {
    super(reason);
    this.name = "WorkflowManualPausedError";
  }
}

export function isWorkflowPausedError(error: unknown): error is WorkflowPausedError | WorkflowInputPausedError | WorkflowManualPausedError {
  return error instanceof WorkflowPausedError || error instanceof WorkflowInputPausedError || error instanceof WorkflowManualPausedError;
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
