import { z } from "zod";
import type { WorkflowProgramIR, WorkflowProgramNode } from "../../shared/workflowProgramIr";
import type { WorkflowProgramDiagnostic } from "./workflowProgramCapabilityResolver";

export type WorkflowProgramIrParseResult =
  | { success: true; program: WorkflowProgramIR }
  | { success: false; diagnostics: WorkflowProgramDiagnostic[] };

const nodeIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const MODEL_TASK_MAX_CHARS = 240;
const NODE_DESCRIPTION_MAX_CHARS = 2000;
const outputContractSchema = z.object({
  type: z.string().min(1).max(120).optional(),
  schema: z.unknown().optional(),
});
const nodeBaseSchema = z.object({
  id: nodeIdSchema,
  label: z.string().min(1).max(240).optional(),
  description: z.string().max(2000).optional(),
  dependsOn: z.array(nodeIdSchema).max(100).optional(),
  output: outputContractSchema.optional(),
});
const toolCallNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("tool.call"),
  tool: z.string().min(1).max(160),
  args: z.unknown().optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const toolPaginateNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("tool.paginate"),
  tool: z.string().min(1).max(160),
  input: z.unknown().optional(),
  pageQueries: z.unknown().optional(),
  queryInputPath: z.string().min(1).max(240).optional(),
  pageSize: z.number().int().positive().max(1000).optional(),
  maxItems: z.number().int().positive().max(1000),
  maxPages: z.number().int().positive().max(1000),
  itemsPath: z.string().max(240).optional(),
  nextPageTokenPath: z.string().min(1).max(240).optional(),
  pageTokenInputPath: z.string().min(1).max(240).optional(),
  pageSizeInputPath: z.string().min(1).max(240).optional(),
  dedupeKeyPath: z.string().min(1).max(240).optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const mutationStageNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("mutation.stage"),
  tool: z.string().min(1).max(160),
  args: z.unknown().optional(),
  changeSet: z.unknown().optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const reviewChoiceSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  label: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
});
const reviewInputNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("review.input"),
  prompt: z.unknown(),
  choices: z.array(reviewChoiceSchema).max(20).optional(),
  allowFreeform: z.boolean().optional(),
  data: z.unknown().optional(),
});
const approvalRequiredNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("approval.required"),
  changeSet: z.unknown(),
});
const branchIfNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("branch.if"),
  condition: z.unknown(),
  then: z.unknown(),
  else: z.unknown().optional(),
});
const loopMapNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("loop.map"),
  items: z.unknown(),
  itemName: z.string().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  map: z.unknown(),
  maxItems: z.number().int().positive().max(1000).optional(),
  maxConcurrency: z.number().int().positive().max(16).optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const collectionMapNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("collection.map"),
  items: z.unknown(),
  itemName: z.string().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  map: z.unknown(),
  maxItems: z.number().int().positive().max(1000),
  resumeKey: z.string().min(1).max(160).optional(),
});
const collectionFilterNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("collection.filter"),
  items: z.unknown(),
  itemName: z.string().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  maxItems: z.number().int().positive().max(1000),
  includeExtensions: z.array(z.string().min(1).max(32)).max(40).optional(),
  includeNamePrefixes: z.array(z.string().min(1).max(120)).max(40).optional(),
  excludeNamePrefixes: z.array(z.string().min(1).max(120)).max(40).optional(),
  excludeNameIncludes: z.array(z.string().min(1).max(120)).max(40).optional(),
  requireFile: z.boolean().optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const collectionDedupeNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("collection.dedupe"),
  items: z.unknown(),
  keyPath: z.string().min(1).max(240).optional(),
  strategy: z.enum(["exact", "url_canonical"]).optional(),
  maxItems: z.number().int().positive().max(1000),
  resumeKey: z.string().min(1).max(160).optional(),
});
const collectionChunkNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("collection.chunk"),
  items: z.unknown(),
  chunkSize: z.number().int().positive().max(1000),
  maxChunks: z.number().int().positive().max(1000),
  resumeKey: z.string().min(1).max(160).optional(),
});
const documentRenderNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("document.render"),
  input: z.unknown(),
  title: z.unknown().optional(),
  format: z.enum(["markdown", "html", "pdf"]),
  path: z.string().min(1).max(500).optional(),
  maxSourceChars: z.number().int().positive().min(1000).max(1_000_000).optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const errorHandleNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("error.handle"),
  try: z.unknown(),
  fallback: z.unknown(),
  errorMessage: z.string().min(1).max(500).optional(),
});
const modelCallNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("model.call"),
  task: z.string().min(1).max(240),
  input: z.unknown().optional(),
  output: outputContractSchema.extend({ schema: z.unknown() }),
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).max(5).optional(),
      onInvalid: z.enum(["retry", "fail"]).optional(),
    })
    .optional(),
});
const modelMapNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("model.map"),
  items: z.unknown(),
  itemName: z.string().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  task: z.string().min(1).max(240),
  input: z.unknown().optional(),
  output: outputContractSchema.extend({ schema: z.unknown() }),
  maxItems: z.number().int().positive().max(1000),
  maxConcurrency: z.number().int().positive().max(16).optional(),
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).max(5).optional(),
      onInvalid: z.enum(["retry", "fail"]).optional(),
    })
    .optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const modelReduceNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("model.reduce"),
  items: z.unknown(),
  task: z.string().min(1).max(240),
  input: z.unknown().optional(),
  output: outputContractSchema.extend({ schema: z.unknown() }),
  strategy: z.enum(["single_pass", "tree"]).optional(),
  maxInputItems: z.number().int().positive().max(1000),
  maxFanIn: z.number().int().min(2).max(64).optional(),
  maxLevels: z.number().int().min(1).max(12).optional(),
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).max(5).optional(),
      onInvalid: z.enum(["retry", "fail"]).optional(),
    })
    .optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const browserInterventionNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("browser.intervention"),
  tool: z.enum(["browser_search", "browser_nav", "browser_content", "browser_login"]),
  args: z.unknown().optional(),
  source: z.unknown().optional(),
  skipIf: z.unknown().optional(),
  prompt: z.unknown().optional(),
  choices: z.array(reviewChoiceSchema).max(20).optional(),
  allowFreeform: z.boolean().optional(),
  retry: z
    .object({
      maxAttempts: z.number().int().min(0).max(2).optional(),
      onStillBlocked: z.enum(["fail", "return_skipped"]).optional(),
    })
    .optional(),
  screenshot: z
    .object({
      enabled: z.boolean().optional(),
      args: z.unknown().optional(),
    })
    .optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const connectorCallNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("connector.call"),
  connectorId: z.string().min(1).max(160),
  operation: z.string().min(1).max(160),
  input: z.unknown().optional(),
  accountId: z.string().min(1).max(160).optional(),
  idempotencyKey: z.string().min(1).max(240).optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const connectorPaginateNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("connector.paginate"),
  connectorId: z.string().min(1).max(160),
  operation: z.string().min(1).max(160),
  input: z.unknown().optional(),
  accountId: z.string().min(1).max(160).optional(),
  idempotencyKey: z.string().min(1).max(240).optional(),
  pageSize: z.number().int().positive().max(1000).optional(),
  maxItems: z.number().int().positive().max(1000),
  maxPages: z.number().int().positive().max(1000),
  itemsPath: z.string().min(1).max(240).optional(),
  nextPageTokenPath: z.string().min(1).max(240).optional(),
  pageTokenInputPath: z.string().min(1).max(240).optional(),
  pageSizeInputPath: z.string().min(1).max(240).optional(),
  dedupeKeyPath: z.string().min(1).max(240).optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const connectorMapNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("connector.map"),
  connectorId: z.string().min(1).max(160),
  operation: z.string().min(1).max(160),
  items: z.unknown(),
  itemName: z.string().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  input: z.unknown().optional(),
  accountId: z.string().min(1).max(160).optional(),
  idempotencyKey: z.string().min(1).max(240).optional(),
  maxItems: z.number().int().positive().max(1000).optional(),
  maxConcurrency: z.number().int().positive().max(16).optional(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const checkpointNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("checkpoint.write"),
  key: z.string().min(1).max(160),
  value: z.unknown(),
  resumeKey: z.string().min(1).max(160).optional(),
});
const templateNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("transform.template"),
  template: z.string().min(1).max(20000),
  vars: z.record(z.string(), z.unknown()).optional(),
});
const finalOutputNodeSchema = nodeBaseSchema.extend({
  kind: z.literal("output.final"),
  value: z.unknown(),
});
const programNodeSchema = z.discriminatedUnion("kind", [
  toolCallNodeSchema,
  toolPaginateNodeSchema,
  modelCallNodeSchema,
  browserInterventionNodeSchema,
  connectorCallNodeSchema,
  connectorPaginateNodeSchema,
  connectorMapNodeSchema,
  collectionMapNodeSchema,
  collectionFilterNodeSchema,
  collectionDedupeNodeSchema,
  collectionChunkNodeSchema,
  documentRenderNodeSchema,
  checkpointNodeSchema,
  mutationStageNodeSchema,
  reviewInputNodeSchema,
  approvalRequiredNodeSchema,
  branchIfNodeSchema,
  loopMapNodeSchema,
  modelMapNodeSchema,
  modelReduceNodeSchema,
  templateNodeSchema,
  errorHandleNodeSchema,
  finalOutputNodeSchema,
]);
const programSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(240),
  goal: z.string().min(1).max(4000),
  summary: z.string().max(4000).optional(),
  successCriteria: z.array(z.string().min(1).max(1000)).max(50).optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  nodes: z.array(programNodeSchema).min(1).max(200),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(200).optional(),
        source: nodeIdSchema,
        target: nodeIdSchema,
        type: z.enum(["data_flow", "control_flow", "condition", "retry", "resume"]).optional(),
        label: z.string().max(240).optional(),
      }),
    )
    .optional(),
  budgets: z
    .object({
      maxToolCalls: z.number().int().positive().max(1000).optional(),
      maxModelCalls: z.number().int().positive().max(1000).optional(),
      maxConnectorCalls: z.number().int().nonnegative().max(1000).optional(),
      maxRunMs: z.number().int().positive().max(24 * 60 * 60 * 1000).optional(),
    })
    .optional(),
  openQuestions: z.array(z.string().min(1).max(1000)).max(50).optional(),
});

const DEFAULT_MUTATION_TOOL_NAMES = new Set(["file_write", "google_workspace_materialize_file", "media_download"]);
const WORKFLOW_PROGRAM_WRAPPER_KEYS = [
  "program",
  "programIR",
  "programIr",
  "workflowProgram",
  "workflowProgramIR",
  "workflowProgramIr",
  "workflow_program_ir",
  "workflow_program",
  "workflowPlan",
  "workflow_plan",
  "workflowDefinition",
  "workflow_definition",
  "compiledWorkflow",
  "workflow",
  "ir",
  "plan",
  "artifact",
  "response",
  "result",
  "data",
  "draft",
];
const WORKFLOW_PROGRAM_NODE_ARRAY_KEYS = ["nodes", "steps", "workflowSteps", "operations", "tasks", "actions", "components", "stages"];

export function parseWorkflowProgramIr(raw: unknown): WorkflowProgramIrParseResult {
  const parsed = programSchema.safeParse(normalizeWorkflowProgramInput(raw));
  if (!parsed.success) {
    return {
      success: false,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "ir.schema_invalid",
        severity: "error" as const,
        message: `${issue.message} at /${issue.path.join("/")}`,
        path: `/${issue.path.join("/")}`,
      })),
    };
  }
  return { success: true, program: normalizeProgram(parsed.data as WorkflowProgramIR) };
}

export function normalizeWorkflowProgramInput(raw: unknown): unknown {
  const unwrapped = unwrapWorkflowProgramCandidate(raw);
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return unwrapped;
  const record = unwrapped as Record<string, unknown>;
  const title = stringField(record, "title") ?? stringField(record, "name") ?? stringField(record, "goal") ?? "Workflow";
  const goal = stringField(record, "goal") ?? stringField(record, "objective") ?? stringField(record, "summary") ?? title;
  const nodes = workflowProgramNodeArray(record) ?? record.nodes;
  const edges =
    arrayField(record, "edges") ??
    arrayField(record, "links") ??
    arrayField(record, "dependencies") ??
    arrayField(record, "connections") ??
    record.edges;
  return {
    ...record,
    version: record.version ?? 1,
    title,
    goal,
    summary: stringField(record, "summary") ?? goal,
    nodes: Array.isArray(nodes) ? nodes.map(normalizeWorkflowProgramNodeInput) : nodes,
    edges: Array.isArray(edges) ? edges.map(normalizeWorkflowProgramEdgeInput) : edges,
  };
}

function unwrapWorkflowProgramCandidate(raw: unknown, depth = 0): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (depth > 4) return raw;
  const record = raw as Record<string, unknown>;
  if (workflowProgramNodeArray(record)) return raw;
  for (const key of WORKFLOW_PROGRAM_WRAPPER_KEYS) {
    const candidate = record[key];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const unwrapped = unwrapWorkflowProgramCandidate(candidate, depth + 1);
    if (unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped) && workflowProgramNodeArray(unwrapped as Record<string, unknown>)) return unwrapped;
  }
  return raw;
}

export function normalizeProgram(program: WorkflowProgramIR): WorkflowProgramIR {
  return {
    ...program,
    nodes: program.nodes.map(normalizeProgramNode),
    edges: (program.edges ?? []).map((edge) => ({
      ...edge,
      id: edge.id ?? `${edge.source}-to-${edge.target}`,
      type: edge.type ?? "data_flow",
    })),
    successCriteria: program.successCriteria ?? [],
    openQuestions: program.openQuestions ?? [],
  };
}

function normalizeWorkflowProgramNodeInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const node = raw as Record<string, unknown>;
  const kind = normalizeWorkflowProgramNodeKind(stringField(node, "kind") ?? stringField(node, "type"));
  const id = stringField(node, "id") ?? stringField(node, "nodeId") ?? stringField(node, "name");
  const label = stringField(node, "label");
  const dependsOn = Array.isArray(node.dependsOn) ? node.dependsOn : Array.isArray(node.dependencies) ? node.dependencies : node.dependsOn;
  const base = {
    ...node,
    ...(id ? { id } : {}),
    ...(label ? { label: truncateString(compactWhitespace(label), MODEL_TASK_MAX_CHARS) } : {}),
    ...(kind ? { kind } : {}),
    ...(dependsOn ? { dependsOn } : {}),
  };
  if (kind === "tool.call") {
    const tool = stringField(node, "tool") ?? stringField(node, "toolName") ?? stringField(node, "name");
    return {
      ...base,
      tool,
      args: normalizeWorkflowProgramToolArgsInput(tool, node.args ?? node.input ?? node.params ?? {}),
    };
  }
  if (kind === "tool.paginate") {
    const tool = stringField(node, "tool") ?? stringField(node, "toolName") ?? stringField(node, "name");
    return {
      ...base,
      tool,
      input: normalizeWorkflowProgramToolArgsInput(tool, node.input ?? node.args ?? node.params ?? {}),
      pageQueries: node.pageQueries ?? node.queries ?? node.queryVariants,
      queryInputPath: stringField(node, "queryInputPath"),
      pageSize: node.pageSize,
      maxItems: node.maxItems,
      maxPages: node.maxPages,
      itemsPath: stringField(node, "itemsPath"),
      nextPageTokenPath: stringField(node, "nextPageTokenPath"),
      pageTokenInputPath: stringField(node, "pageTokenInputPath"),
      pageSizeInputPath: stringField(node, "pageSizeInputPath"),
      dedupeKeyPath: stringField(node, "dedupeKeyPath"),
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "mutation.stage") {
    const tool = stringField(node, "tool") ?? stringField(node, "toolName") ?? stringField(node, "name");
    const args = normalizeWorkflowProgramToolArgsInput(tool, node.args ?? node.input ?? node.params ?? {});
    return {
      ...base,
      tool,
      args,
      changeSet: node.changeSet ?? node.review ?? node.mutation ?? { tool, args },
    };
  }
  if (kind === "model.call") {
    const outputSchema = modelOutputSchemaFromNode(node);
    const rawTask = stringField(node, "task") ?? stringField(node, "modelTask") ?? stringField(node, "label") ?? id ?? "model.call";
    return {
      ...base,
      ...modelTaskDescriptionPatch(node, rawTask),
      task: normalizeModelTask(rawTask),
      input: node.input ?? node.args ?? {},
      output: { ...(node.output && typeof node.output === "object" && !Array.isArray(node.output) ? (node.output as Record<string, unknown>) : {}), schema: outputSchema },
    };
  }
  if (kind === "model.map") {
    const outputSchema = modelOutputSchemaFromNode(node);
    const rawTask = stringField(node, "task") ?? stringField(node, "modelTask") ?? stringField(node, "label") ?? id ?? "model.map";
    return {
      ...base,
      items: node.items ?? node.inputItems ?? node.collection ?? [],
      itemName: stringField(node, "itemName") ?? stringField(node, "as") ?? "item",
      ...modelTaskDescriptionPatch(node, rawTask),
      task: normalizeModelTask(rawTask),
      input: node.input ?? node.args ?? {},
      output: { ...(node.output && typeof node.output === "object" && !Array.isArray(node.output) ? (node.output as Record<string, unknown>) : {}), schema: outputSchema },
      maxItems: node.maxItems,
      maxConcurrency: node.maxConcurrency,
      retry: node.retry,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "model.reduce") {
    const outputSchema = modelOutputSchemaFromNode(node);
    const rawTask = stringField(node, "task") ?? stringField(node, "modelTask") ?? stringField(node, "label") ?? id ?? "model.reduce";
    return {
      ...base,
      items: node.items ?? node.inputItems ?? node.collection ?? [],
      ...modelTaskDescriptionPatch(node, rawTask),
      task: normalizeModelTask(rawTask),
      input: node.input ?? node.args ?? {},
      output: { ...(node.output && typeof node.output === "object" && !Array.isArray(node.output) ? (node.output as Record<string, unknown>) : {}), schema: outputSchema },
      strategy: node.strategy,
      maxInputItems: node.maxInputItems ?? node.maxItems,
      maxFanIn: node.maxFanIn ?? node.fanIn ?? node.treeFanIn,
      maxLevels: node.maxLevels ?? node.treeLevels,
      retry: node.retry,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "browser.intervention") {
    const tool = stringField(node, "tool") ?? stringField(node, "toolName") ?? "browser_nav";
    return {
      ...base,
      tool,
      args: normalizeWorkflowProgramToolArgsInput(tool, node.args ?? node.input ?? node.params ?? {}),
      source: node.source ?? node.dataSource ?? node.context ?? {},
      skipIf: node.skipIf ?? node.skipWhen,
      prompt: node.prompt ?? node.question ?? node.message,
      choices: node.choices,
      allowFreeform: node.allowFreeform,
      retry: node.retry,
      screenshot: node.screenshot,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "connector.call") {
    const connectorId = stringField(node, "connectorId") ?? stringField(node, "connector");
    const operation = stringField(node, "operation") ?? stringField(node, "operationName") ?? stringField(node, "name");
    return {
      ...base,
      connectorId,
      operation,
      input: node.input ?? node.args ?? node.params ?? {},
      accountId: node.accountId,
      idempotencyKey: node.idempotencyKey,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "connector.paginate") {
    const connectorId = stringField(node, "connectorId") ?? stringField(node, "connector");
    const operation = stringField(node, "operation") ?? stringField(node, "operationName") ?? stringField(node, "name");
    return {
      ...base,
      connectorId,
      operation,
      input: node.input ?? node.args ?? node.params ?? {},
      accountId: node.accountId,
      idempotencyKey: node.idempotencyKey,
      pageSize: node.pageSize,
      maxItems: node.maxItems ?? node.limit ?? node.maxResults,
      maxPages: node.maxPages ?? node.pageCount,
      itemsPath: stringField(node, "itemsPath"),
      nextPageTokenPath: stringField(node, "nextPageTokenPath") ?? stringField(node, "nextCursorPath"),
      pageTokenInputPath: stringField(node, "pageTokenInputPath") ?? stringField(node, "cursorInputPath"),
      pageSizeInputPath: stringField(node, "pageSizeInputPath"),
      dedupeKeyPath: stringField(node, "dedupeKeyPath"),
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "connector.map") {
    const connectorId = stringField(node, "connectorId") ?? stringField(node, "connector");
    const operation = stringField(node, "operation") ?? stringField(node, "operationName") ?? stringField(node, "name");
    return {
      ...base,
      connectorId,
      operation,
      items: node.items ?? node.inputItems ?? node.collection ?? [],
      itemName: stringField(node, "itemName") ?? stringField(node, "as") ?? "item",
      input: node.input ?? node.args ?? node.params ?? {},
      accountId: node.accountId,
      idempotencyKey: node.idempotencyKey,
      maxItems: node.maxItems,
      maxConcurrency: node.maxConcurrency,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "review.input") {
    return {
      ...base,
      prompt: node.prompt ?? node.question ?? node.message ?? stringField(node, "label") ?? "Review this workflow output.",
      choices: normalizeReviewInputChoices(node.choices),
      allowFreeform: node.allowFreeform,
      data: node.data ?? node.input ?? node.args ?? {},
    };
  }
  if (kind === "approval.required") {
    return {
      ...base,
      changeSet: node.changeSet ?? node.review ?? node.input ?? node.args ?? {},
    };
  }
  if (kind === "branch.if") {
    return {
      ...base,
      condition: node.condition ?? node.when ?? node.if ?? node.predicate ?? false,
      then: node.then ?? node.thenValue ?? node.trueValue ?? node.value ?? true,
      else: node.else ?? node.elseValue ?? node.falseValue ?? false,
    };
  }
  if (kind === "loop.map") {
    return {
      ...base,
      items: node.items ?? node.input ?? node.collection ?? [],
      itemName: stringField(node, "itemName") ?? stringField(node, "as") ?? "item",
      map: node.map ?? node.body ?? node.template ?? { fromItem: "item" },
      maxItems: node.maxItems,
      maxConcurrency: node.maxConcurrency,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "collection.map") {
    return {
      ...base,
      items: node.items ?? node.input ?? node.collection ?? [],
      itemName: stringField(node, "itemName") ?? stringField(node, "as") ?? "item",
      map: node.map ?? node.body ?? node.template ?? { fromItem: "item" },
      maxItems: node.maxItems,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "collection.filter") {
    return {
      ...base,
      items: node.items ?? node.input ?? node.collection ?? [],
      itemName: stringField(node, "itemName") ?? stringField(node, "as") ?? "item",
      maxItems: node.maxItems ?? node.limit ?? node.maxResults ?? 1000,
      includeExtensions: stringArrayField(node, "includeExtensions") ?? stringArrayField(node, "extensions") ?? stringArrayField(node, "fileExtensions"),
      includeNamePrefixes:
        stringArrayField(node, "includeNamePrefixes") ??
        stringArrayField(node, "includeNamePrefix") ??
        stringArrayField(node, "namePrefixes") ??
        stringArrayField(node, "namePrefix") ??
        stringArrayField(node, "prefixes") ??
        stringArrayField(node, "prefix"),
      excludeNamePrefixes: stringArrayField(node, "excludeNamePrefixes"),
      excludeNameIncludes: stringArrayField(node, "excludeNameIncludes") ?? stringArrayField(node, "excludeNameSubstrings"),
      requireFile: typeof node.requireFile === "boolean" ? node.requireFile : undefined,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "collection.dedupe") {
    const keyPath =
      stringField(node, "keyPath") ??
      stringField(node, "dedupeKeyPath") ??
      stringField(node, "canonicalKeyPath") ??
      stringField(node, "path");
    return {
      ...base,
      items: node.items ?? node.input ?? node.collection ?? [],
      ...(keyPath ? { keyPath } : {}),
      strategy: normalizeCollectionDedupeStrategy(stringField(node, "strategy") ?? stringField(node, "dedupeStrategy")),
      maxItems: node.maxItems ?? node.limit ?? node.maxResults ?? 1000,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "collection.chunk") {
    return {
      ...base,
      items: node.items ?? node.input ?? node.collection ?? [],
      chunkSize: node.chunkSize ?? node.size,
      maxChunks: node.maxChunks,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "document.render") {
    return {
      ...base,
      input: node.input ?? node.value ?? node.content ?? node.document ?? {},
      title: node.title ?? node.name ?? node.label,
      format: stringField(node, "format")?.toLowerCase() ?? "markdown",
      path: stringField(node, "path") ?? stringField(node, "artifactPath") ?? stringField(node, "outputPath"),
      maxSourceChars: node.maxSourceChars,
      resumeKey: node.resumeKey,
    };
  }
  if (kind === "error.handle") {
    return {
      ...base,
      try: node.try ?? node.input ?? node.value ?? null,
      fallback: node.fallback ?? node.default ?? null,
      errorMessage: stringField(node, "errorMessage") ?? stringField(node, "message"),
    };
  }
  if (kind === "checkpoint.write") {
    return {
      ...base,
      key: stringField(node, "key") ?? id ?? "checkpoint",
      value: node.value ?? node.input ?? node.args ?? {},
    };
  }
  if (kind === "transform.template") {
    return {
      ...base,
      template: stringField(node, "template") ?? stringField(node, "content") ?? "{{value}}",
      vars: node.vars ?? node.input ?? {},
    };
  }
  if (kind === "output.final") {
    return {
      ...base,
      value: node.value ?? node.output ?? node.input ?? {},
    };
  }
  return base;
}

function normalizeWorkflowProgramToolArgsInput(tool: string | undefined, args: unknown): unknown {
  if (tool !== "google_workspace_materialize_file" || !args || typeof args !== "object" || Array.isArray(args)) return args;
  const record = args as Record<string, unknown>;
  if ("handle" in record || !("fileHandle" in record)) return args;
  const { fileHandle, ...rest } = record;
  return { ...rest, handle: fileHandle };
}

function modelOutputSchemaFromNode(node: Record<string, unknown>): unknown {
  const output = node.output && typeof node.output === "object" && !Array.isArray(node.output) ? (node.output as Record<string, unknown>) : undefined;
  const candidate = node.outputSchema ?? node.outputContract ?? node.schema ?? output?.schema ?? (isObjectJsonSchema(output) ? output : undefined);
  return normalizeModelOutputSchema(candidate ?? { result: "unknown" });
}

function normalizeModelOutputSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const record = schema as Record<string, unknown>;
  if (!isObjectJsonSchema(record)) return normalizeModelFieldSchema(record);
  const properties = record.properties as Record<string, unknown>;
  const required = Array.isArray(record.required) ? new Set(record.required.filter((value): value is string => typeof value === "string")) : undefined;
  const entries = Object.entries(properties).filter(([key]) => !required || required.size === 0 || required.has(key));
  return Object.fromEntries(entries.map(([key, value]) => [key, normalizeModelFieldSchema(value)]));
}

function normalizeModelFieldSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const record = { ...(schema as Record<string, unknown>) };
  if (Array.isArray(record.type)) {
    const nonNull = record.type.find((value): value is string => typeof value === "string" && value.toLowerCase() !== "null");
    if (nonNull) record.type = nonNull;
  }
  return record;
}

function isObjectJsonSchema(schema: unknown): schema is { type?: unknown; properties: Record<string, unknown>; required?: unknown } {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const record = schema as Record<string, unknown>;
  const type = record.type;
  const isObjectType = type === "object" || (Array.isArray(type) && type.includes("object"));
  return isObjectType && Boolean(record.properties && typeof record.properties === "object" && !Array.isArray(record.properties));
}

function normalizeReviewInputChoices(choices: unknown): unknown {
  if (!Array.isArray(choices)) return choices;
  return choices.slice(0, 20).map((choice, index) => normalizeReviewInputChoice(choice, index));
}

function normalizeReviewInputChoice(choice: unknown, index: number): { id: string; label: string; description?: string } {
  if (typeof choice === "string") {
    return { id: normalizeReviewChoiceId(choice, index), label: normalizeReviewChoiceLabel(choice, index) };
  }
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
    const fallback = `Choice ${index + 1}`;
    return { id: normalizeReviewChoiceId(fallback, index), label: fallback };
  }
  const record = choice as Record<string, unknown>;
  const rawId =
    stringField(record, "id") ??
    stringField(record, "value") ??
    stringField(record, "key") ??
    stringField(record, "name") ??
    stringFromReviewChoiceValue(record.id) ??
    stringFromReviewChoiceValue(record.value) ??
    stringFromReviewChoiceValue(record.label) ??
    `choice-${index + 1}`;
  const rawLabel =
    stringField(record, "label") ??
    stringField(record, "title") ??
    stringField(record, "text") ??
    stringFromReviewChoiceValue(record.label) ??
    stringFromReviewChoiceValue(record.title) ??
    stringFromReviewChoiceValue(record.text) ??
    stringFromReviewChoiceValue(record.id) ??
    rawId;
  const description = stringField(record, "description") ?? stringField(record, "detail") ?? stringField(record, "help");
  return {
    id: normalizeReviewChoiceId(rawId, index),
    label: normalizeReviewChoiceLabel(rawLabel, index),
    ...(description ? { description: truncateString(compactWhitespace(description), 500) } : {}),
  };
}

function stringFromReviewChoiceValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const nested =
    stringField(record, "literal") ??
    stringField(record, "value") ??
    stringField(record, "id") ??
    stringField(record, "label") ??
    stringField(record, "text") ??
    stringField(record, "path") ??
    stringField(record, "fromNode");
  if (nested) return nested;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function normalizeReviewChoiceId(value: string, index: number): string {
  const normalized = compactWhitespace(value)
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[-_.:]+$/, "")
    .slice(0, 80);
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(normalized) ? normalized : `choice-${index + 1}`;
}

function normalizeReviewChoiceLabel(value: string, index: number): string {
  const normalized = truncateString(compactWhitespace(value), 160);
  return normalized || `Choice ${index + 1}`;
}

function normalizeWorkflowProgramEdgeInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const edge = raw as Record<string, unknown>;
  return {
    ...edge,
    source: stringField(edge, "source") ?? stringField(edge, "from"),
    target: stringField(edge, "target") ?? stringField(edge, "to"),
  };
}

function normalizeModelTask(value: string): string {
  return truncateString(compactWhitespace(value), MODEL_TASK_MAX_CHARS);
}

function modelTaskDescriptionPatch(node: Record<string, unknown>, rawTask: string): { description?: string } {
  const task = compactWhitespace(rawTask);
  if (task.length <= MODEL_TASK_MAX_CHARS || stringField(node, "description")) return {};
  return { description: truncateString(`Original model task: ${task}`, NODE_DESCRIPTION_MAX_CHARS) };
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function normalizeWorkflowProgramNodeKind(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, ".");
  const aliases: Record<string, string> = {
    tool: "tool.call",
    "tool.call": "tool.call",
    "toolcall": "tool.call",
    "tool.call.node": "tool.call",
    "tool.paginate": "tool.paginate",
    toolpaginate: "tool.paginate",
    "tool.page": "tool.paginate",
    "tool.search": "tool.paginate",
    "search.paginate": "tool.paginate",
    "browser.search.paginate": "tool.paginate",
    "browser.search.pages": "tool.paginate",
    model: "model.call",
    "model.call": "model.call",
    "ambient.call": "model.call",
    llm: "model.call",
    "model.map": "model.map",
    modelmap: "model.map",
    "map.model": "model.map",
    "foreach.model": "model.map",
    "model.each": "model.map",
    "model.reduce": "model.reduce",
    modelreduce: "model.reduce",
    reduce: "model.reduce",
    "reduce.model": "model.reduce",
    "browser.intervention": "browser.intervention",
    "browser.user.action": "browser.intervention",
    "browser.useraction": "browser.intervention",
    "browser.handoff": "browser.intervention",
    browserhandoff: "browser.intervention",
    connector: "connector.call",
    "connector.call": "connector.call",
    "connectorcall": "connector.call",
    "connector.call.node": "connector.call",
    "connector.map": "connector.map",
    connectormap: "connector.map",
    "connector.each": "connector.map",
    "map.connector": "connector.map",
    "foreach.connector": "connector.map",
    "connector.paginate": "connector.paginate",
    connectorpaginate: "connector.paginate",
    paginate: "connector.paginate",
    pagination: "connector.paginate",
    "collection.map": "collection.map",
    collectionmap: "collection.map",
    "map.collection": "collection.map",
    "collection.each": "collection.map",
    "collection.filter": "collection.filter",
    collectionfilter: "collection.filter",
    "filter.collection": "collection.filter",
    "collection.select": "collection.filter",
    collectionselect: "collection.filter",
    filter: "collection.filter",
    "collection.dedupe": "collection.dedupe",
    collectiondedupe: "collection.dedupe",
    "dedupe.collection": "collection.dedupe",
    dedupe: "collection.dedupe",
    unique: "collection.dedupe",
    "collection.unique": "collection.dedupe",
    collectionunique: "collection.dedupe",
    "collection.chunk": "collection.chunk",
    collectionchunk: "collection.chunk",
    chunk: "collection.chunk",
    chunks: "collection.chunk",
    document: "document.render",
    "document.render": "document.render",
    documentrender: "document.render",
    "render.document": "document.render",
    renderdocument: "document.render",
    render: "document.render",
    "pdf.render": "document.render",
    "render.pdf": "document.render",
    mutation: "mutation.stage",
    "mutation.stage": "mutation.stage",
    "stage.mutation": "mutation.stage",
    "stagemutation": "mutation.stage",
    review: "review.input",
    "review.input": "review.input",
    "ask.user": "review.input",
    "user.input": "review.input",
    askuser: "review.input",
    approval: "approval.required",
    "approval.required": "approval.required",
    "require.approval": "approval.required",
    requireapproval: "approval.required",
    branch: "branch.if",
    if: "branch.if",
    "branch.if": "branch.if",
    branchif: "branch.if",
    condition: "branch.if",
    loop: "loop.map",
    map: "loop.map",
    "loop.map": "loop.map",
    loopmap: "loop.map",
    foreach: "loop.map",
    "for.each": "loop.map",
    error: "error.handle",
    "error.handle": "error.handle",
    errorhandle: "error.handle",
    "handle.error": "error.handle",
    fallback: "error.handle",
    checkpoint: "checkpoint.write",
    "checkpoint.write": "checkpoint.write",
    template: "transform.template",
    transform: "transform.template",
    "transform.template": "transform.template",
    output: "output.final",
    final: "output.final",
    "output.final": "output.final",
  };
  return aliases[normalized] ?? value;
}

function normalizeProgramNode(node: WorkflowProgramNode): WorkflowProgramNode {
  const normalized = { ...node, dependsOn: [...new Set(node.dependsOn ?? [])].sort() };
  if (normalized.kind === "tool.call" && DEFAULT_MUTATION_TOOL_NAMES.has(normalized.tool)) {
    return {
      ...normalized,
      kind: "mutation.stage",
      changeSet: { tool: normalized.tool, args: normalized.args ?? {} },
    };
  }
  if (
    normalized.kind === "loop.map" ||
    normalized.kind === "connector.map" ||
    normalized.kind === "collection.map" ||
    normalized.kind === "collection.filter" ||
    normalized.kind === "model.map"
  ) {
    return {
      ...normalized,
      itemName: normalized.itemName ?? "item",
    };
  }
  return normalized;
}

function normalizeCollectionDedupeStrategy(value: string | undefined): "exact" | "url_canonical" {
  if (!value) return "url_canonical";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "exact") return "exact";
  return "url_canonical";
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function stringArrayField(value: Record<string, unknown>, key: string): string[] | undefined {
  const field = value[key];
  if (Array.isArray(field)) {
    return field.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (typeof field === "string" && field.trim()) return [field.trim()];
  return undefined;
}

function arrayField(value: Record<string, unknown>, key: string): unknown[] | undefined {
  const field = value[key];
  return Array.isArray(field) ? field : undefined;
}

function workflowProgramNodeArray(value: Record<string, unknown>): unknown[] | undefined {
  for (const key of WORKFLOW_PROGRAM_NODE_ARRAY_KEYS) {
    const array = arrayField(value, key);
    if (array) return array;
  }
  return undefined;
}
