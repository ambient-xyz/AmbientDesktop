import { createHash } from "node:crypto";
import type { WorkflowProgramIR, WorkflowProgramNode } from "../shared/workflowProgramIr";

export interface WorkflowProgramLoweringMetrics {
  operationCount: number;
  loweringCacheHits: number;
  loweringCacheMisses: number;
  loweringCacheWrites: number;
}

export type WorkflowProgramLoweredOperationKind =
  | "runtime.tool"
  | "runtime.tool_paginate"
  | "runtime.browser_intervention"
  | "runtime.connector"
  | "runtime.connector_paginate"
  | "runtime.connector_map"
  | "runtime.collection_map"
  | "runtime.collection_filter"
  | "runtime.collection_dedupe"
  | "runtime.collection_chunk"
  | "runtime.document_render"
  | "runtime.model"
  | "runtime.model_map"
  | "runtime.model_reduce"
  | "runtime.mutation"
  | "runtime.review"
  | "runtime.approval"
  | "runtime.branch"
  | "runtime.loop"
  | "runtime.error_handler"
  | "runtime.checkpoint"
  | "runtime.template"
  | "runtime.output";

export interface WorkflowProgramLoweredOperation {
  nodeId: string;
  nodeKind: WorkflowProgramNode["kind"];
  operationKind: WorkflowProgramLoweredOperationKind;
  dependsOn: string[];
  nodeHash: string;
  operationHash: string;
  codegenTemplate: string;
  sourceMapLabel: string;
  outputType?: string;
  resumeKey?: string;
  toolName?: string;
  connectorId?: string;
  connectorOperation?: string;
  modelTask?: string;
  mutationPolicy?: "read_only" | "staged_until_approved" | "apply_after_approval";
  node: WorkflowProgramNode;
}

export interface WorkflowProgramLoweredOperationPlan {
  schemaVersion: 1;
  title: string;
  goal: string;
  programHash: string;
  operationPlanHash: string;
  operations: WorkflowProgramLoweredOperation[];
}

export interface WorkflowProgramLoweredOperationCacheEntry {
  operationHash: string;
  operation: WorkflowProgramLoweredOperation;
}

export interface LowerWorkflowProgramInput {
  program: WorkflowProgramIR;
  loweredOperationCache?: Map<string, WorkflowProgramLoweredOperationCacheEntry>;
}

export function lowerWorkflowProgram(input: LowerWorkflowProgramInput): { plan: WorkflowProgramLoweredOperationPlan; metrics: WorkflowProgramLoweringMetrics } {
  const orderedNodes = topologicalProgramNodes(input.program);
  const operationHashes = new Map<string, string>();
  const operations: WorkflowProgramLoweredOperation[] = [];
  const metrics: WorkflowProgramLoweringMetrics = {
    operationCount: orderedNodes.length,
    loweringCacheHits: 0,
    loweringCacheMisses: 0,
    loweringCacheWrites: 0,
  };
  const programHash = stableHash({
    version: input.program.version,
    title: input.program.title,
    goal: input.program.goal,
    summary: input.program.summary,
    successCriteria: input.program.successCriteria ?? [],
    inputs: input.program.inputs ?? {},
    budgets: input.program.budgets ?? {},
    openQuestions: input.program.openQuestions ?? [],
    nodes: orderedNodes,
    edges: input.program.edges ?? [],
  });

  for (const node of orderedNodes) {
    const nodeHash = stableHash(node);
    const dependencyOperationHashes = (node.dependsOn ?? []).map((dependencyId) => operationHashes.get(dependencyId) ?? stableHash(dependencyId));
    const operationHash = stableHash({
      loweringVersion: 1,
      nodeHash,
      dependencyOperationHashes,
    });
    const cached = input.loweredOperationCache?.get(node.id);
    if (cached?.operationHash === operationHash) {
      metrics.loweringCacheHits += 1;
      const operation = cloneJson(cached.operation);
      operations.push(operation);
      operationHashes.set(node.id, operation.operationHash);
      continue;
    }
    metrics.loweringCacheMisses += 1;
    const operation = lowerWorkflowProgramNode(node, nodeHash, operationHash);
    operations.push(operation);
    operationHashes.set(node.id, operation.operationHash);
    if (input.loweredOperationCache) {
      input.loweredOperationCache.set(node.id, { operationHash, operation: cloneJson(operation) });
      metrics.loweringCacheWrites += 1;
    }
  }

  const planWithoutHash = {
    schemaVersion: 1,
    title: input.program.title,
    goal: input.program.goal,
    programHash,
    operations,
  } satisfies Omit<WorkflowProgramLoweredOperationPlan, "operationPlanHash">;
  return {
    plan: {
      schemaVersion: 1,
      title: planWithoutHash.title,
      goal: planWithoutHash.goal,
      programHash: planWithoutHash.programHash,
      operationPlanHash: stableHash(planWithoutHash),
      operations: planWithoutHash.operations,
    },
    metrics,
  };
}

export function emptyWorkflowProgramLoweringMetrics(): WorkflowProgramLoweringMetrics {
  return {
    operationCount: 0,
    loweringCacheHits: 0,
    loweringCacheMisses: 0,
    loweringCacheWrites: 0,
  };
}

function lowerWorkflowProgramNode(node: WorkflowProgramNode, nodeHash: string, operationHash: string): WorkflowProgramLoweredOperation {
  const loweredNode = cloneJson(node);
  const base = {
    nodeId: node.id,
    nodeKind: node.kind,
    operationKind: loweredOperationKind(node),
    dependsOn: [...(node.dependsOn ?? [])],
    nodeHash,
    operationHash,
    codegenTemplate: codegenTemplateForNode(node),
    sourceMapLabel: node.label ?? humanizeNodeId(node.id),
    outputType: node.output?.type,
    node: loweredNode,
  } satisfies Omit<
    WorkflowProgramLoweredOperation,
    "toolName" | "connectorId" | "connectorOperation" | "modelTask" | "mutationPolicy" | "resumeKey"
  >;
  if (node.kind === "tool.call") {
    return compactLoweredOperation({ ...base, toolName: node.tool, resumeKey: node.resumeKey });
  }
  if (node.kind === "tool.paginate") {
    return compactLoweredOperation({ ...base, toolName: node.tool, resumeKey: node.resumeKey ?? node.id });
  }
  if (node.kind === "mutation.stage") {
    return compactLoweredOperation({
      ...base,
      toolName: node.tool,
      resumeKey: node.resumeKey,
      mutationPolicy: "staged_until_approved",
    });
  }
  if (node.kind === "connector.call") {
    return compactLoweredOperation({
      ...base,
      connectorId: node.connectorId,
      connectorOperation: node.operation,
      resumeKey: node.resumeKey,
    });
  }
  if (node.kind === "connector.paginate") {
    return compactLoweredOperation({
      ...base,
      connectorId: node.connectorId,
      connectorOperation: node.operation,
      resumeKey: node.resumeKey ?? node.id,
    });
  }
  if (node.kind === "connector.map") {
    return compactLoweredOperation({
      ...base,
      connectorId: node.connectorId,
      connectorOperation: node.operation,
      resumeKey: node.resumeKey ?? node.id,
    });
  }
  if (node.kind === "collection.map" || node.kind === "collection.filter" || node.kind === "collection.dedupe" || node.kind === "collection.chunk" || node.kind === "document.render") {
    return compactLoweredOperation({ ...base, resumeKey: node.resumeKey ?? node.id });
  }
  if (node.kind === "browser.intervention") {
    return compactLoweredOperation({ ...base, toolName: node.tool, resumeKey: node.resumeKey ?? node.id });
  }
  if (node.kind === "model.call") {
    return compactLoweredOperation({ ...base, modelTask: node.task, resumeKey: node.id });
  }
  if (node.kind === "model.map" || node.kind === "model.reduce") {
    return compactLoweredOperation({ ...base, modelTask: node.task, resumeKey: node.resumeKey ?? node.id });
  }
  if (node.kind === "checkpoint.write") {
    return compactLoweredOperation({ ...base, resumeKey: node.resumeKey });
  }
  return compactLoweredOperation(base);
}

function loweredOperationKind(node: WorkflowProgramNode): WorkflowProgramLoweredOperationKind {
  if (node.kind === "tool.call") return "runtime.tool";
  if (node.kind === "tool.paginate") return "runtime.tool_paginate";
  if (node.kind === "browser.intervention") return "runtime.browser_intervention";
  if (node.kind === "connector.call") return "runtime.connector";
  if (node.kind === "connector.paginate") return "runtime.connector_paginate";
  if (node.kind === "connector.map") return "runtime.connector_map";
  if (node.kind === "collection.map") return "runtime.collection_map";
  if (node.kind === "collection.filter") return "runtime.collection_filter";
  if (node.kind === "collection.dedupe") return "runtime.collection_dedupe";
  if (node.kind === "collection.chunk") return "runtime.collection_chunk";
  if (node.kind === "document.render") return "runtime.document_render";
  if (node.kind === "model.call") return "runtime.model";
  if (node.kind === "model.map") return "runtime.model_map";
  if (node.kind === "model.reduce") return "runtime.model_reduce";
  if (node.kind === "mutation.stage") return "runtime.mutation";
  if (node.kind === "review.input") return "runtime.review";
  if (node.kind === "approval.required") return "runtime.approval";
  if (node.kind === "branch.if") return "runtime.branch";
  if (node.kind === "loop.map") return "runtime.loop";
  if (node.kind === "error.handle") return "runtime.error_handler";
  if (node.kind === "checkpoint.write") return "runtime.checkpoint";
  if (node.kind === "transform.template") return "runtime.template";
  return "runtime.output";
}

function codegenTemplateForNode(node: WorkflowProgramNode): string {
  if (node.kind === "tool.call") return "workflow.resumePoint -> workflow.step -> tools.<tool>";
  if (node.kind === "tool.paginate") return "workflow.paginateTool -> tools.<tool> pages";
  if (node.kind === "browser.intervention") {
    return node.tool === "browser_login"
      ? "workflow.resumePoint -> tools.browser_login -> conditional workflow.askUser -> downstream browser verification"
      : "workflow.resumePoint -> tools.<browser> -> conditional workflow.askUser -> retry";
  }
  if (node.kind === "connector.call") return "workflow.resumePoint -> connectors.call";
  if (node.kind === "connector.paginate") return "workflow.paginateConnector -> connectors.call pages";
  if (node.kind === "connector.map") return "workflow.resumePoint -> workflow.batch -> connectors.call";
  if (node.kind === "collection.map") return "workflow.mapCollection -> deterministic per-item value";
  if (node.kind === "collection.filter") return "workflow.step -> deterministic bounded filter";
  if (node.kind === "collection.dedupe") return "workflow.dedupeCollection -> deterministic key/canonical URL dedupe";
  if (node.kind === "collection.chunk") return "workflow.chunkCollection -> deterministic bounded chunks";
  if (node.kind === "document.render") return "workflow.renderDocument -> deterministic artifact content";
  if (node.kind === "model.call") return "workflow.resumePoint -> ambient.call";
  if (node.kind === "model.map") return "workflow.mapModel -> bounded ambient.call fan-out";
  if (node.kind === "model.reduce") return "workflow.reduceModel -> ambient.call reducer";
  if (node.kind === "mutation.stage") return "workflow.stageMutation -> tools.<tool>";
  if (node.kind === "review.input") return "workflow.askUser";
  if (node.kind === "approval.required") return "workflow.requireApproval";
  if (node.kind === "branch.if") return "workflow.step -> deterministic branch";
  if (node.kind === "loop.map") return "workflow.step -> deterministic map";
  if (node.kind === "error.handle") return "workflow.step -> deterministic fallback";
  if (node.kind === "checkpoint.write") return node.resumeKey ? "workflow.resumePoint -> checkpoint value" : "workflow.checkpoint";
  if (node.kind === "transform.template") return "renderTemplate";
  return "workflow.checkpoint -> output";
}

function topologicalProgramNodes(program: WorkflowProgramIR): WorkflowProgramNode[] {
  const byId = new Map(program.nodes.map((node) => [node.id, node]));
  const ordered: WorkflowProgramNode[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: WorkflowProgramNode) => {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) throw new Error(`Workflow IR dependency cycle includes node ${node.id}.`);
    visiting.add(node.id);
    for (const dependencyId of node.dependsOn ?? []) {
      const dependency = byId.get(dependencyId);
      if (dependency) visit(dependency);
    }
    visiting.delete(node.id);
    visited.add(node.id);
    ordered.push(node);
  };
  for (const node of program.nodes) visit(node);
  return ordered;
}

function compactLoweredOperation(operation: Record<string, unknown>): WorkflowProgramLoweredOperation {
  return Object.fromEntries(Object.entries(operation).filter(([, value]) => value !== undefined)) as unknown as WorkflowProgramLoweredOperation;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function humanizeNodeId(id: string): string {
  return id
    .replace(/[-_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
