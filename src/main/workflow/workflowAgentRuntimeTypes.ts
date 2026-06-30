import type { WorkflowApprovalStatus, WorkflowManifest, WorkflowRecoveryContext, WorkflowRecoveryTargetKind } from "../../shared/workflowTypes";

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
