import type { DesktopToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { connectorOperationDescriptor } from "./workflowProgramCapabilityResolver";
import type { WorkflowConnectorDescriptor } from "../workflow/workflowConnectors";
import type {
  WorkflowProgramConnectorCallNode,
  WorkflowProgramConnectorPaginateNode,
  WorkflowProgramMutationStageNode,
  WorkflowProgramNode,
  WorkflowProgramNodeKind,
  WorkflowProgramToolCallNode,
} from "../../shared/workflowProgramIr";

export const WORKFLOW_PROGRAM_OUTPUT_CONTRACT_NODE_KINDS = [
  "tool.call",
  "tool.paginate",
  "model.call",
  "browser.intervention",
  "connector.call",
  "connector.paginate",
  "connector.map",
  "collection.map",
  "collection.filter",
  "collection.dedupe",
  "collection.chunk",
  "document.render",
  "checkpoint.write",
  "mutation.stage",
  "review.input",
  "approval.required",
  "branch.if",
  "loop.map",
  "model.map",
  "model.reduce",
  "transform.template",
  "error.handle",
  "output.final",
] as const satisfies readonly WorkflowProgramNodeKind[];

type MissingWorkflowProgramOutputContractKind = Exclude<
  WorkflowProgramNodeKind,
  (typeof WORKFLOW_PROGRAM_OUTPUT_CONTRACT_NODE_KINDS)[number]
>;

const workflowProgramOutputContractKindCompleteness: Record<MissingWorkflowProgramOutputContractKind, never> = {};
void workflowProgramOutputContractKindCompleteness;

export interface WorkflowProgramOutputContractContext {
  toolsByName?: Map<string, DesktopToolDescriptor>;
  connectorsById?: Map<string, WorkflowConnectorDescriptor>;
  nodesById?: Map<string, WorkflowProgramNode>;
}

const KNOWN_TOOL_OUTPUT_FIELDS: Record<string, string[]> = {
  bash: ["command", "stdout", "stderr", "exitCode"],
  file_read: ["path", "content", "truncated", "kind"],
  local_directory_list: ["rootPath", "rootName", "entries", "truncated", "totalKnownEntries", "skipped"],
  local_file_read: ["path", "absolutePath", "fileUrl", "content", "truncated", "kind", "language", "size", "mtimeMs", "officeText"],
  file_write: ["path", "bytes"],
  google_workspace_call: ["ok", "methodId", "files", "events", "handle", "fileHandle"],
  google_workspace_status: ["status", "accounts"],
  google_workspace_search_methods: ["methods"],
  google_workspace_materialize_file: ["path"],
  ambient_visual_analyze: ["summary", "observations", "limitations", "artifacts", "image", "video", "referenceImage", "inputImages", "sampledFrames"],
  ambient_visual_minicpm_setup: [
    "provider",
    "action",
    "status",
    "packageName",
    "validation",
    "diagnostics",
    "runtimeCandidates",
    "installStatuses",
    "nextSteps",
  ],
  ambient_local_deep_research_setup: [
    "capabilityId",
    "setupStatus",
    "modelSelection",
    "modelInstall",
    "llamaRuntime",
    "managedAssets",
    "installResult",
    "validation",
    "smoke",
    "providerSnapshot",
    "warnings",
    "blockers",
    "nextActions",
  ],
  ambient_local_deep_research_run: [
    "capabilityId",
    "status",
    "setupStatus",
    "modelProfileId",
    "contextTokens",
    "providerSnapshot",
    "toolExecutions",
    "finalText",
    "error",
    "artifacts",
    "llamaServer",
  ],
};

const GENERIC_TOOL_OUTPUT_FIELDS = ["ok", "value", "items", "artifactPath", "metadata", "truncated"];
const GENERIC_CONNECTOR_OUTPUT_FIELDS = ["ok", "value", "items", "metadata", "truncated"];

export function workflowProgramOutputContractCompleteness(): {
  expectedKinds: string[];
  contractKinds: string[];
  missingKinds: string[];
  extraKinds: string[];
} {
  const expectedKinds = WORKFLOW_PROGRAM_OUTPUT_CONTRACT_NODE_KINDS.slice().sort();
  const contractKinds = workflowProgramOutputContractKindList().slice().sort();
  const expected = new Set(expectedKinds);
  const contract = new Set(contractKinds);
  return {
    expectedKinds,
    contractKinds,
    missingKinds: expectedKinds.filter((kind) => !contract.has(kind)),
    extraKinds: contractKinds.filter((kind) => !expected.has(kind as WorkflowProgramNodeKind)),
  };
}

export function workflowProgramSchemaObjectKeys(schema: unknown): Set<string> | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const record = schema as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object" && !Array.isArray(record.properties) ? record.properties : undefined;
  if (properties) return new Set(Object.keys(properties as Record<string, unknown>));
  if (Object.values(record).every((value) => typeof value === "string" || Array.isArray(value) || (value && typeof value === "object"))) return new Set(Object.keys(record));
  return undefined;
}

export function workflowProgramRefPathExists(
  source: WorkflowProgramNode,
  path: string,
  context?: WorkflowProgramOutputContractContext | Map<string, WorkflowConnectorDescriptor>,
): boolean {
  const firstSegment = path.split(".").filter(Boolean)[0];
  if (!firstSegment) return true;
  if (source.kind === "tool.call" && source.tool === "browser_search" && /^\d+$/.test(firstSegment)) return true;
  const normalized = normalizeOutputContractContext(context);
  return workflowProgramKnownOutputFieldsInternal(source, normalized, new Set()).includes(firstSegment);
}

export function workflowProgramKnownOutputPathList(
  source: WorkflowProgramNode,
  context?: WorkflowProgramOutputContractContext | Map<string, WorkflowConnectorDescriptor>,
): string | undefined {
  const fields = workflowProgramKnownOutputFields(source, context);
  if (!fields.length) return undefined;
  const displayFields = source.kind === "tool.call" && source.tool === "browser_search" ? [...fields, "<numeric result index>"] : fields;
  return displayFields.join(", ");
}

export function workflowProgramKnownOutputFields(
  source: WorkflowProgramNode,
  context?: WorkflowProgramOutputContractContext | Map<string, WorkflowConnectorDescriptor>,
): string[] {
  const normalized = normalizeOutputContractContext(context);
  return workflowProgramKnownOutputFieldsInternal(source, normalized, new Set());
}

function workflowProgramKnownOutputFieldsInternal(
  source: WorkflowProgramNode,
  context: WorkflowProgramOutputContractContext,
  seenNodeIds: Set<string>,
): string[] {
  if (seenNodeIds.has(source.id)) return [];
  const nextSeenNodeIds = new Set(seenNodeIds);
  nextSeenNodeIds.add(source.id);
  const declaredKeys = workflowProgramSchemaObjectKeys(source.output?.schema);
  const fields = new Set<string>();
  for (const field of baseWorkflowProgramOutputFields(source, context, nextSeenNodeIds)) fields.add(field);
  for (const field of declaredKeys ?? []) fields.add(field);
  return [...fields];
}

export function workflowProgramNodeOutputSummary(node: WorkflowProgramNode): string {
  if (node.kind === "model.call") return "schema-validated model output";
  if (node.kind === "model.map") return "bounded per-item schema-validated model outputs";
  if (node.kind === "model.reduce") return "schema-validated reduced model output";
  if (node.kind === "tool.call") return `${node.tool} result`;
  if (node.kind === "tool.paginate") return `${node.tool} paginated results`;
  if (node.kind === "connector.call") return `${node.connectorId}.${node.operation} result`;
  if (node.kind === "connector.paginate") return `${node.connectorId}.${node.operation} paginated results`;
  if (node.kind === "connector.map") return `${node.connectorId}.${node.operation} mapped results`;
  if (node.kind === "collection.map") return "deterministically mapped collection";
  if (node.kind === "collection.filter") return "deterministically filtered collection";
  if (node.kind === "collection.dedupe") return "deterministically deduplicated collection";
  if (node.kind === "collection.chunk") return "deterministically chunked collection";
  if (node.kind === "document.render") return "deterministically rendered document";
  if (node.kind === "mutation.stage") return `${node.tool} staged mutation result`;
  if (node.kind === "review.input") return "user input response";
  if (node.kind === "browser.intervention") return "browser result with optional user-action handoff";
  if (node.kind === "approval.required") return "approval decision";
  if (node.kind === "branch.if") return "conditional branch value";
  if (node.kind === "loop.map") return "mapped item values";
  if (node.kind === "error.handle") return "handled value or fallback";
  if (node.kind === "checkpoint.write") return "checkpoint value";
  if (node.kind === "transform.template") return "rendered template value";
  return "final workflow output";
}

export function workflowProgramOutputIsObject(source: WorkflowProgramNode): boolean {
  return workflowProgramKnownOutputFields(source).length > 0;
}

function workflowProgramOutputContractKindList(): readonly WorkflowProgramNodeKind[] {
  return WORKFLOW_PROGRAM_OUTPUT_CONTRACT_NODE_KINDS;
}

function normalizeOutputContractContext(
  context?: WorkflowProgramOutputContractContext | Map<string, WorkflowConnectorDescriptor>,
): WorkflowProgramOutputContractContext {
  if (!context) return {};
  if (context instanceof Map) return { connectorsById: context };
  return context;
}

function baseWorkflowProgramOutputFields(source: WorkflowProgramNode, context: WorkflowProgramOutputContractContext, seenNodeIds: Set<string>): string[] {
  switch (source.kind) {
    case "tool.call":
      return workflowProgramToolOutputFields(source, context);
    case "tool.paginate":
      return ["items", "pages", "count", "pageCount", "truncated", "nextPageToken", "maxItems", "maxPages", "pageSize"];
    case "model.call":
      return setToSortedArray(workflowProgramSchemaObjectKeys(source.output.schema));
    case "browser.intervention":
      return [
        "browserIntervention",
        "content",
        "links",
        "openedTitle",
        "pageTitle",
        "pageUrl",
        "raw",
        "reason",
        "results",
        "screenshot",
        "skipped",
        "source",
        "text",
        "textChars",
        "textTruncated",
        "toolName",
        "url",
      ];
    case "connector.call":
      return workflowProgramConnectorCallOutputFields(source, context);
    case "connector.paginate":
      return ["items", "pages", "count", "pageCount", "truncated", "nextPageToken", "maxItems", "maxPages", "pageSize"];
    case "connector.map":
      return ["count", "items", "sourceCount", "truncated"];
    case "collection.map":
      return ["count", "items", "maxItems", "sourceCount", "truncated"];
    case "collection.filter":
      return ["count", "filter", "items", "matchedCount", "maxItems", "sourceCount", "truncated"];
    case "collection.dedupe":
      return ["count", "duplicateCount", "items", "keyPath", "maxItems", "sourceCount", "strategy", "truncated"];
    case "collection.chunk":
      return ["chunks", "chunkSize", "count", "itemCount", "maxChunks", "sourceCount", "truncated"];
    case "document.render":
      return ["artifactPath", "bytes", "content", "format", "mimeType", "path", "sourceChars", "title", "truncated"];
    case "checkpoint.write":
      return ["key", "value", ...workflowProgramLiteralObjectKeys(source.value)];
    case "mutation.stage":
      return workflowProgramToolOutputFields(source, context);
    case "review.input":
      return ["choiceId", "prompt", "requestId", "text"];
    case "approval.required":
      return ["changeSet", "id", "status"];
    case "branch.if":
      return ["branch", "condition", "value"];
    case "loop.map":
      return ["count", "items", "truncated"];
    case "model.map":
      return ["count", "items", "maxConcurrency", "maxItems", "results", "sourceCount", "truncated"];
    case "model.reduce":
      return setToSortedArray(workflowProgramSchemaObjectKeys(source.output.schema));
    case "transform.template":
      return ["value"];
    case "error.handle":
      return ["error", "fallback", "ok", "value", ...workflowProgramErrorHandlePassthroughFields(source, context, seenNodeIds)];
    case "output.final":
      return ["value"];
  }
}

function workflowProgramErrorHandlePassthroughFields(
  source: Extract<WorkflowProgramNode, { kind: "error.handle" }>,
  context: WorkflowProgramOutputContractContext,
  seenNodeIds: Set<string>,
): string[] {
  const fields = new Set<string>();
  for (const value of [source.try, source.fallback]) {
    for (const field of workflowProgramValuePassthroughFields(value, context, seenNodeIds)) fields.add(field);
  }
  return setToSortedArray(fields).filter((field) => field !== "error" && field !== "fallback" && field !== "ok" && field !== "value");
}

function workflowProgramValuePassthroughFields(value: unknown, context: WorkflowProgramOutputContractContext, seenNodeIds: Set<string>): string[] {
  if (isWorkflowProgramRef(value)) {
    if (value.path) return [];
    const source = context.nodesById?.get(value.fromNode);
    if (!source) return [];
    return workflowProgramKnownOutputFieldsInternal(source, context, seenNodeIds);
  }
  return workflowProgramLiteralObjectKeys(value);
}

function isWorkflowProgramRef(value: unknown): value is { fromNode: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromNode?: unknown }).fromNode === "string");
}

function workflowProgramConnectorCallOutputFields(
  source: WorkflowProgramConnectorCallNode | WorkflowProgramConnectorPaginateNode,
  context: WorkflowProgramOutputContractContext,
): string[] {
  const connector = context.connectorsById?.get(source.connectorId);
  const operation = connector ? connectorOperationDescriptor(connector, source.operation) : undefined;
  const descriptorKeys = workflowProgramSchemaObjectKeys(operation?.outputSchema);
  return descriptorKeys?.size ? setToSortedArray(descriptorKeys) : GENERIC_CONNECTOR_OUTPUT_FIELDS;
}

function workflowProgramToolOutputFields(
  source: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  context: WorkflowProgramOutputContractContext,
): string[] {
  const descriptorKeys = workflowProgramSchemaObjectKeys(context.toolsByName?.get(source.tool)?.outputSchema);
  const knownFields = knownToolOutputFields(source.tool);
  const descriptorFields = [...(descriptorKeys ?? [])];
  const fields = new Set<string>([
    ...(knownFields.length || descriptorFields.length ? [] : genericToolOutputFields(source.tool)),
    ...knownFields,
    ...descriptorFields,
  ]);
  return [...fields];
}

function genericToolOutputFields(tool: string): string[] {
  if (tool.startsWith("browser_")) return ["content", "ok", "results", "screenshotPath", "text", "tool", "url", "userAction"];
  if (tool.startsWith("ambient_cli")) return ["exitCode", "json", "ok", "stderr", "stdout"];
  return GENERIC_TOOL_OUTPUT_FIELDS;
}

function knownToolOutputFields(tool: string): string[] {
  return KNOWN_TOOL_OUTPUT_FIELDS[tool] ?? [];
}

function workflowProgramLiteralObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  if ("fromNode" in value || "fromItem" in value || "literal" in value || "template" in value) return [];
  return Object.keys(value);
}

function setToSortedArray(values: Set<string> | undefined): string[] {
  if (!values?.size) return [];
  return [...values].sort();
}
