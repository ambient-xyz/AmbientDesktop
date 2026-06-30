import { createHash } from "node:crypto";
import type { WorkflowRecoveryContext } from "../../shared/workflowTypes";
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
import type {
  WorkflowAmbientHandlers,
  WorkflowApprovalIdFactory,
  WorkflowCheckpointStore,
  WorkflowConnectorHandlers,
  WorkflowNodeMetadata,
  WorkflowProgram,
  WorkflowRuntimeEvent,
  WorkflowRuntimeMetadata,
  WorkflowRuntimeOptions,
  WorkflowRuntimePrimitives,
  WorkflowToolHandlers,
  WorkflowUserInputIdFactory,
  WorkflowUserInputRequest,
} from "./workflowAgentRuntimeTypes";

export { WorkflowInputPausedError, WorkflowManualPausedError, WorkflowPausedError, isWorkflowPausedError } from "./workflowAgentRuntimeErrors";
export type * from "./workflowAgentRuntimeTypes";

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
