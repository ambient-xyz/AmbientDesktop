import type { WorkflowRecoveryContext } from "../../shared/workflowTypes";
import { WorkflowInputPausedError, WorkflowManualPausedError, WorkflowPausedError, isWorkflowPausedError } from "./workflowAgentRuntimeErrors";
import type {
  WorkflowAskUserOptions,
  WorkflowApprovalDecisionResolver,
  WorkflowApprovalRequest,
  WorkflowBatchOptions,
  WorkflowCheckpointStore,
  WorkflowCollectionChunkOptions,
  WorkflowCollectionDedupeOptions,
  WorkflowCollectionMapOptions,
  WorkflowChunkedCollection,
  WorkflowDedupedCollection,
  WorkflowDocumentRenderOptions,
  WorkflowMappedCollection,
  WorkflowModelMapOptions,
  WorkflowModelMappedCollection,
  WorkflowModelReduceContext,
  WorkflowModelReduceOptions,
  WorkflowNodeMetadata,
  WorkflowPaginateConnectorOptions,
  WorkflowPaginateToolOptions,
  WorkflowPaginatedCollection,
  WorkflowRenderedDocument,
  WorkflowRuntimeEvent,
  WorkflowRuntimeMetadata,
  WorkflowRuntimePrimitives,
  WorkflowUserInputRequest,
  WorkflowUserInputResponse,
  WorkflowUserInputResponseResolver,
} from "./workflowAgentRuntimeTypes";

export interface WorkflowRuntimePrimitivesContext {
  abortSignal?: AbortSignal;
  recovery?: WorkflowRecoveryContext;
  checkpointStore: WorkflowCheckpointStore;
  nextApprovalId(changeSet: unknown, metadata?: WorkflowNodeMetadata): string;
  nextUserInputId(request: Omit<WorkflowUserInputRequest, "id" | "status">, metadata?: WorkflowNodeMetadata): string;
  approvalDecision?: WorkflowApprovalDecisionResolver;
  userInputResponse?: WorkflowUserInputResponseResolver;
  throwIfAborted(): void;
  manualPauseError(): WorkflowManualPausedError | undefined;
  matchingRecovery(action: WorkflowRecoveryContext["action"], metadata?: WorkflowRuntimeMetadata): WorkflowRecoveryContext | undefined;
  eventData(metadata: WorkflowRuntimeMetadata | undefined, extra?: Record<string, unknown>): Record<string, unknown> | undefined;
  errorMessage(error: unknown): string;
  emit(event: WorkflowRuntimeEvent): Promise<void>;
  runBatch<T, R>(items: T[], options: WorkflowBatchOptions, fn: (item: T, index: number) => Promise<R> | R): Promise<R[]>;
  paginateTool(
    options: WorkflowPaginateToolOptions,
    fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
  ): Promise<WorkflowPaginatedCollection>;
  paginateConnector(
    options: WorkflowPaginateConnectorOptions,
    fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
  ): Promise<WorkflowPaginatedCollection>;
  mapCollection<T, R>(
    items: T[],
    options: WorkflowCollectionMapOptions,
    mapItem: (item: T, index: number) => Promise<R> | R,
  ): Promise<WorkflowMappedCollection>;
  dedupeCollection(items: unknown[], options: WorkflowCollectionDedupeOptions): Promise<WorkflowDedupedCollection>;
  chunkCollection(items: unknown[], options: WorkflowCollectionChunkOptions): Promise<WorkflowChunkedCollection>;
  renderDocument(input: unknown, options: WorkflowDocumentRenderOptions): Promise<WorkflowRenderedDocument>;
  mapModel<T, R>(
    items: T[],
    options: WorkflowModelMapOptions,
    mapItem: (item: T, index: number) => Promise<R> | R,
  ): Promise<WorkflowModelMappedCollection<R>>;
  reduceModel<R>(
    items: unknown[],
    options: WorkflowModelReduceOptions,
    reduceItems: (items: unknown[], context: WorkflowModelReduceContext) => Promise<R> | R,
  ): Promise<R>;
}

export function createWorkflowRuntimePrimitives(context: WorkflowRuntimePrimitivesContext): WorkflowRuntimePrimitives {
  const requireApproval = async (changeSet: unknown, metadata?: WorkflowNodeMetadata): Promise<WorkflowApprovalRequest> => {
    context.throwIfAborted();
    const request = { id: context.nextApprovalId(changeSet, metadata), changeSet, status: "pending" as const };
    await context.emit({ type: "approval.required", data: context.eventData(metadata, { id: request.id, changeSet }) });
    const decision = await context.approvalDecision?.(request.id, changeSet);
    if (decision === "approved") {
      const approved = { ...request, status: "approved" as const };
      await context.emit({ type: "approval.approved", message: request.id, data: context.eventData(metadata, { id: request.id, source: "resume" }) });
      return approved;
    }
    if (decision === "rejected") {
      await context.emit({ type: "approval.rejected", message: request.id, data: context.eventData(metadata, { id: request.id, source: "resume" }) });
      throw new Error(`Workflow approval rejected: ${request.id}`);
    }
    throw new WorkflowPausedError(request);
  };
  const askUser = async (
    prompt: string,
    options: WorkflowAskUserOptions = {},
    metadata?: WorkflowNodeMetadata,
  ): Promise<WorkflowUserInputResponse> => {
    context.throwIfAborted();
    const requestBase = {
      prompt: prompt.trim(),
      choices: options.choices ?? [],
      allowFreeform: options.allowFreeform ?? true,
      data: options.data,
    };
    if (!requestBase.prompt) throw new Error("workflow.askUser prompt is required.");
    const request: WorkflowUserInputRequest = {
      id: context.nextUserInputId(requestBase, metadata),
      ...requestBase,
      status: "pending",
    };
    await context.emit({ type: "workflow.input.required", message: request.prompt, data: context.eventData(metadata, { ...request }) });
    const response = await context.userInputResponse?.(request);
    if (response) {
      await context.emit({
        type: "workflow.input.received",
        message: request.id,
        data: context.eventData(metadata, { ...response, prompt: request.prompt }),
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
      context.throwIfAborted();
      const metadata = typeof metadataOrFn === "function" ? undefined : metadataOrFn;
      const fn = typeof metadataOrFn === "function" ? metadataOrFn : maybeFn;
      if (!fn) throw new Error(`Workflow step is missing a callback: ${name}`);
      await context.emit({ type: "step.start", message: name, data: context.eventData(metadata) });
      try {
        const result = await fn();
        await context.emit({ type: "step.end", message: name, data: context.eventData(metadata) });
        return result;
      } catch (error) {
        const manualPause = context.manualPauseError();
        if (isWorkflowPausedError(error) || manualPause) {
          await context.emit({
            type: "step.paused",
            message: name,
            data: context.eventData(
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
        await context.emit({
          type: "step.error",
          message: name,
          data: context.eventData(metadata, { error: context.errorMessage(error) }),
        });
        throw error;
      }
    },
    batch: async <T, R>(
      items: T[],
      options: WorkflowBatchOptions,
      fn: (item: T, index: number) => Promise<R> | R,
    ): Promise<R[]> => context.runBatch(items, options, fn),
    paginateTool: async (options, fetchPage) => context.paginateTool(options, fetchPage),
    paginateConnector: async (options, fetchPage) => context.paginateConnector(options, fetchPage),
    mapCollection: async <T, R>(items: T[], options: WorkflowCollectionMapOptions, mapItem: (item: T, index: number) => Promise<R> | R) =>
      context.mapCollection(items, options, mapItem),
    dedupeCollection: async (items, options) => context.dedupeCollection(items, options),
    chunkCollection: async (items, options) => context.chunkCollection(items, options),
    renderDocument: async (input, options) => context.renderDocument(input, options),
    mapModel: async <T, R>(items: T[], options: WorkflowModelMapOptions, mapItem: (item: T, index: number) => Promise<R> | R) =>
      context.mapModel(items, options, mapItem),
    reduceModel: async <R>(items: unknown[], options: WorkflowModelReduceOptions, reduceItems: (items: unknown[], context: WorkflowModelReduceContext) => Promise<R> | R) =>
      context.reduceModel(items, options, reduceItems),
    checkpoint: async (key: string, value: unknown): Promise<void> => {
      context.throwIfAborted();
      await context.checkpointStore.set(key, value);
      await context.emit({ type: "checkpoint.write", message: key });
    },
    resumePoint: async <T>(key: string, fn: () => Promise<T> | T): Promise<T> => {
      context.throwIfAborted();
      const existing = await context.checkpointStore.get<T>(key);
      if (existing !== undefined) {
        await context.emit({ type: "checkpoint.resume", message: key });
        return existing;
      }
      const value = await fn();
      context.throwIfAborted();
      await context.checkpointStore.set(key, value);
      await context.emit({ type: "checkpoint.write", message: key });
      return value;
    },
    requireApproval,
    askUser,
    stageMutation: async <T>(changeSet: unknown, apply: () => Promise<T> | T, metadata?: WorkflowNodeMetadata): Promise<T> => {
      context.throwIfAborted();
      await context.emit({ type: "mutation.staged", data: context.eventData(metadata, { changeSet }) });
      const approval = await requireApproval(changeSet, metadata);
      const result = await apply();
      context.throwIfAborted();
      await context.emit({ type: "mutation.applied", data: context.eventData(metadata, { approvalId: approval.id }) });
      return result;
    },
    skipItem: async (metadata?: WorkflowNodeMetadata): Promise<boolean> => {
      context.throwIfAborted();
      const recovery = context.matchingRecovery("skip_item", metadata);
      if (!recovery) return false;
      await context.emit({
        type: "workflow.recovery.skipped_item",
        message: recovery.targetItemKey,
        data: context.eventData(metadata, {
          sourceRunId: recovery.sourceRunId,
          sourceEventId: recovery.sourceEventId,
          action: recovery.action,
        }),
      });
      return true;
    },
    emit: (event: WorkflowRuntimeEvent): Promise<void> => context.emit(event),
    abortSignal: context.abortSignal,
    recovery: context.recovery,
  };
}
