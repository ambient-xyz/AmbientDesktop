export type WorkflowProgramNodeKind =
  | "tool.call"
  | "tool.paginate"
  | "model.call"
  | "browser.intervention"
  | "connector.call"
  | "connector.paginate"
  | "connector.map"
  | "collection.map"
  | "collection.filter"
  | "collection.dedupe"
  | "collection.chunk"
  | "document.render"
  | "checkpoint.write"
  | "mutation.stage"
  | "review.input"
  | "approval.required"
  | "branch.if"
  | "loop.map"
  | "model.map"
  | "model.reduce"
  | "transform.template"
  | "error.handle"
  | "output.final";

export type WorkflowProgramGraphEdgeType = "data_flow" | "control_flow" | "condition" | "retry" | "resume";

export type WorkflowProgramValue =
  | null
  | string
  | number
  | boolean
  | WorkflowProgramValue[]
  | { [key: string]: WorkflowProgramValue }
  | { literal: unknown }
  | { fromHandle: string; path?: string; subPath?: string }
  | { fromNode: string; path?: string }
  | { fromItem: string; path?: string }
  | { template: string; vars?: Record<string, WorkflowProgramValue> };

export interface WorkflowProgramOutputContract {
  type?: string;
  schema?: unknown;
}

export interface WorkflowProgramNodeBase {
  id: string;
  kind: WorkflowProgramNodeKind;
  label?: string;
  description?: string;
  dependsOn?: string[];
  output?: WorkflowProgramOutputContract;
}

export interface WorkflowProgramToolCallNode extends WorkflowProgramNodeBase {
  kind: "tool.call";
  tool: string;
  args?: WorkflowProgramValue;
  resumeKey?: string;
}

export interface WorkflowProgramToolPaginateNode extends WorkflowProgramNodeBase {
  kind: "tool.paginate";
  tool: string;
  input?: WorkflowProgramValue;
  pageQueries?: WorkflowProgramValue;
  queryInputPath?: string;
  pageSize?: number;
  maxItems: number;
  maxPages: number;
  itemsPath?: string;
  nextPageTokenPath?: string;
  pageTokenInputPath?: string;
  pageSizeInputPath?: string;
  dedupeKeyPath?: string;
  resumeKey?: string;
}

export interface WorkflowProgramMutationStageNode extends WorkflowProgramNodeBase {
  kind: "mutation.stage";
  tool: string;
  args?: WorkflowProgramValue;
  changeSet?: WorkflowProgramValue;
  resumeKey?: string;
}

export interface WorkflowProgramReviewChoice {
  id: string;
  label: string;
  description?: string;
}

export interface WorkflowProgramReviewInputNode extends WorkflowProgramNodeBase {
  kind: "review.input";
  prompt: WorkflowProgramValue;
  choices?: WorkflowProgramReviewChoice[];
  allowFreeform?: boolean;
  data?: WorkflowProgramValue;
}

export interface WorkflowProgramApprovalRequiredNode extends WorkflowProgramNodeBase {
  kind: "approval.required";
  changeSet: WorkflowProgramValue;
}

export interface WorkflowProgramBranchIfNode extends WorkflowProgramNodeBase {
  kind: "branch.if";
  condition: WorkflowProgramValue;
  then: WorkflowProgramValue;
  else?: WorkflowProgramValue;
}

export interface WorkflowProgramLoopMapToolCall {
  kind: "tool.call";
  tool: string;
  args?: WorkflowProgramValue;
  label?: string;
  output?: WorkflowProgramOutputContract;
  resumeKey?: string;
}

export type WorkflowProgramLoopMapExpression = WorkflowProgramValue | WorkflowProgramLoopMapToolCall;

export interface WorkflowProgramLoopMapNode extends WorkflowProgramNodeBase {
  kind: "loop.map";
  items: WorkflowProgramValue;
  itemName?: string;
  map: WorkflowProgramLoopMapExpression;
  maxItems?: number;
  maxConcurrency?: number;
  resumeKey?: string;
}

export interface WorkflowProgramCollectionMapNode extends WorkflowProgramNodeBase {
  kind: "collection.map";
  items: WorkflowProgramValue;
  itemName?: string;
  map: WorkflowProgramValue;
  maxItems: number;
  resumeKey?: string;
}

export interface WorkflowProgramCollectionFilterNode extends WorkflowProgramNodeBase {
  kind: "collection.filter";
  items: WorkflowProgramValue;
  itemName?: string;
  maxItems: number;
  includeExtensions?: string[];
  includeNamePrefixes?: string[];
  excludeNamePrefixes?: string[];
  excludeNameIncludes?: string[];
  requireFile?: boolean;
  resumeKey?: string;
}

export type WorkflowProgramCollectionDedupeStrategy = "exact" | "url_canonical";

export interface WorkflowProgramCollectionDedupeNode extends WorkflowProgramNodeBase {
  kind: "collection.dedupe";
  items: WorkflowProgramValue;
  keyPath?: string;
  strategy?: WorkflowProgramCollectionDedupeStrategy;
  maxItems: number;
  resumeKey?: string;
}

export interface WorkflowProgramCollectionChunkNode extends WorkflowProgramNodeBase {
  kind: "collection.chunk";
  items: WorkflowProgramValue;
  chunkSize: number;
  maxChunks: number;
  resumeKey?: string;
}

export type WorkflowProgramDocumentRenderFormat = "markdown" | "html" | "pdf";

export interface WorkflowProgramDocumentRenderNode extends WorkflowProgramNodeBase {
  kind: "document.render";
  input: WorkflowProgramValue;
  title?: WorkflowProgramValue;
  format: WorkflowProgramDocumentRenderFormat;
  path?: string;
  maxSourceChars?: number;
  resumeKey?: string;
}

export interface WorkflowProgramErrorHandleNode extends WorkflowProgramNodeBase {
  kind: "error.handle";
  try: WorkflowProgramValue;
  fallback: WorkflowProgramValue;
  errorMessage?: string;
}

export interface WorkflowProgramModelCallNode extends WorkflowProgramNodeBase {
  kind: "model.call";
  task: string;
  input?: WorkflowProgramValue;
  output: WorkflowProgramOutputContract & { schema: unknown };
  retry?: { maxAttempts?: number; onInvalid?: "retry" | "fail" };
}

export interface WorkflowProgramModelMapNode extends WorkflowProgramNodeBase {
  kind: "model.map";
  items: WorkflowProgramValue;
  itemName?: string;
  task: string;
  input?: WorkflowProgramValue;
  output: WorkflowProgramOutputContract & { schema: unknown };
  maxItems: number;
  maxConcurrency?: number;
  retry?: { maxAttempts?: number; onInvalid?: "retry" | "fail" };
  resumeKey?: string;
}

export interface WorkflowProgramModelReduceNode extends WorkflowProgramNodeBase {
  kind: "model.reduce";
  items: WorkflowProgramValue;
  task: string;
  input?: WorkflowProgramValue;
  output: WorkflowProgramOutputContract & { schema: unknown };
  strategy?: "single_pass" | "tree";
  maxInputItems: number;
  maxFanIn?: number;
  maxLevels?: number;
  retry?: { maxAttempts?: number; onInvalid?: "retry" | "fail" };
  resumeKey?: string;
}

export interface WorkflowProgramBrowserInterventionNode extends WorkflowProgramNodeBase {
  kind: "browser.intervention";
  tool: "browser_search" | "browser_nav" | "browser_content" | "browser_login";
  args?: WorkflowProgramValue;
  source?: WorkflowProgramValue;
  skipIf?: WorkflowProgramValue;
  prompt?: WorkflowProgramValue;
  choices?: WorkflowProgramReviewChoice[];
  allowFreeform?: boolean;
  retry?: { maxAttempts?: number; onStillBlocked?: "fail" | "return_skipped" };
  screenshot?: { enabled?: boolean; args?: WorkflowProgramValue };
  resumeKey?: string;
}

export interface WorkflowProgramConnectorCallNode extends WorkflowProgramNodeBase {
  kind: "connector.call";
  connectorId: string;
  operation: string;
  input?: WorkflowProgramValue;
  accountId?: string;
  idempotencyKey?: string;
  resumeKey?: string;
}

export interface WorkflowProgramConnectorPaginateNode extends WorkflowProgramNodeBase {
  kind: "connector.paginate";
  connectorId: string;
  operation: string;
  input?: WorkflowProgramValue;
  accountId?: string;
  idempotencyKey?: string;
  pageSize?: number;
  maxItems: number;
  maxPages: number;
  itemsPath?: string;
  nextPageTokenPath?: string;
  pageTokenInputPath?: string;
  pageSizeInputPath?: string;
  dedupeKeyPath?: string;
  resumeKey?: string;
}

export interface WorkflowProgramConnectorMapNode extends WorkflowProgramNodeBase {
  kind: "connector.map";
  connectorId: string;
  operation: string;
  items: WorkflowProgramValue;
  itemName?: string;
  input?: WorkflowProgramValue;
  accountId?: string;
  idempotencyKey?: string;
  maxItems?: number;
  maxConcurrency?: number;
  resumeKey?: string;
}

export interface WorkflowProgramCheckpointNode extends WorkflowProgramNodeBase {
  kind: "checkpoint.write";
  key: string;
  value: WorkflowProgramValue;
  resumeKey?: string;
}

export interface WorkflowProgramTemplateNode extends WorkflowProgramNodeBase {
  kind: "transform.template";
  template: string;
  vars?: Record<string, WorkflowProgramValue>;
}

export interface WorkflowProgramFinalOutputNode extends WorkflowProgramNodeBase {
  kind: "output.final";
  value: WorkflowProgramValue;
}

export type WorkflowProgramNode =
  | WorkflowProgramToolCallNode
  | WorkflowProgramToolPaginateNode
  | WorkflowProgramModelCallNode
  | WorkflowProgramBrowserInterventionNode
  | WorkflowProgramConnectorCallNode
  | WorkflowProgramConnectorPaginateNode
  | WorkflowProgramConnectorMapNode
  | WorkflowProgramCollectionMapNode
  | WorkflowProgramCollectionFilterNode
  | WorkflowProgramCollectionDedupeNode
  | WorkflowProgramCollectionChunkNode
  | WorkflowProgramDocumentRenderNode
  | WorkflowProgramCheckpointNode
  | WorkflowProgramMutationStageNode
  | WorkflowProgramReviewInputNode
  | WorkflowProgramApprovalRequiredNode
  | WorkflowProgramBranchIfNode
  | WorkflowProgramLoopMapNode
  | WorkflowProgramModelMapNode
  | WorkflowProgramModelReduceNode
  | WorkflowProgramTemplateNode
  | WorkflowProgramErrorHandleNode
  | WorkflowProgramFinalOutputNode;

export interface WorkflowProgramGraphEdge {
  id?: string;
  source: string;
  target: string;
  type?: WorkflowProgramGraphEdgeType;
  label?: string;
}

export interface WorkflowProgramBudgets {
  maxToolCalls?: number;
  maxModelCalls?: number;
  maxConnectorCalls?: number;
  maxRunMs?: number;
}

export interface WorkflowProgramIR {
  version: 1;
  title: string;
  goal: string;
  summary?: string;
  successCriteria?: string[];
  inputs?: Record<string, unknown>;
  nodes: WorkflowProgramNode[];
  edges?: WorkflowProgramGraphEdge[];
  budgets?: WorkflowProgramBudgets;
  openQuestions?: string[];
}

export function isWorkflowProgramLoopMapToolCall(value: unknown): value is WorkflowProgramLoopMapToolCall {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { kind?: unknown }).kind === "tool.call" &&
      typeof (value as { tool?: unknown }).tool === "string" &&
      Boolean((value as { tool?: string }).tool?.trim()),
  );
}
