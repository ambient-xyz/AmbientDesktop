import { createHash } from "node:crypto";
import type { DesktopToolDescriptor } from "../desktopToolRegistry";
import {
  connectorOperationDescriptor,
  validateWorkflowProgramNodeCapabilities,
  type WorkflowProgramAmbientCliCapability,
  type WorkflowProgramDiagnostic,
} from "./workflowProgramCapabilityResolver";
import type { WorkflowConnectorDescriptor, WorkflowConnectorOperationDescriptor } from "../workflowConnectors";
import {
  workflowProgramKnownOutputPathList,
  workflowProgramNodeOutputSummary,
  workflowProgramOutputIsObject,
  workflowProgramRefPathExists,
  workflowProgramSchemaObjectKeys,
} from "./workflowProgramOutputContracts";
import { isWorkflowProgramLoopMapToolCall } from "../../shared/workflowProgramIr";
import type {
  WorkflowProgramBrowserInterventionNode,
  WorkflowProgramCollectionChunkNode,
  WorkflowProgramCollectionDedupeNode,
  WorkflowProgramCollectionFilterNode,
  WorkflowProgramConnectorCallNode,
  WorkflowProgramConnectorMapNode,
  WorkflowProgramConnectorPaginateNode,
  WorkflowProgramIR,
  WorkflowProgramModelCallNode,
  WorkflowProgramModelReduceNode,
  WorkflowProgramMutationStageNode,
  WorkflowProgramNode,
  WorkflowProgramToolCallNode,
} from "../../shared/workflowProgramIr";

export { workflowProgramSchemaObjectKeys } from "./workflowProgramOutputContracts";

export interface WorkflowProgramIncrementalValidationMetrics {
  nodeCount: number;
  dependencyLevelCount: number;
  maxDependencyLevelWidth: number;
  validationConcurrency: number;
  validationCacheHits: number;
  validationCacheMisses: number;
  validationCacheWrites: number;
}

export interface WorkflowProgramNodeValidationCacheEntry {
  nodeHash: string;
  diagnostics: WorkflowProgramDiagnostic[];
}

export interface ValidateWorkflowProgramStaticInput {
  program: WorkflowProgramIR;
  toolDescriptors: DesktopToolDescriptor[];
  connectorDescriptors: WorkflowConnectorDescriptor[];
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[];
  validateGoogleReadOnly: boolean;
  nodeValidationCache?: Map<string, WorkflowProgramNodeValidationCacheEntry>;
  validationConcurrency?: number;
}

const DEFAULT_WORKFLOW_PROGRAM_VALIDATION_CONCURRENCY = 4;
const WORKFLOW_PROGRAM_STATIC_CALL_CEILING = 1000;
const DIRECT_MODEL_LARGE_COLLECTION_ITEM_THRESHOLD = 50;

export async function validateWorkflowProgramStatic(
  input: ValidateWorkflowProgramStaticInput,
): Promise<{ diagnostics: WorkflowProgramDiagnostic[]; metrics: WorkflowProgramIncrementalValidationMetrics }> {
  const validationConcurrency = Math.max(1, Math.floor(input.validationConcurrency ?? DEFAULT_WORKFLOW_PROGRAM_VALIDATION_CONCURRENCY));
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const nodesById = new Map(input.program.nodes.map((node) => [node.id, node]));
  const toolsByName = new Map(input.toolDescriptors.map((tool) => [tool.name, tool]));
  const connectorsById = new Map(input.connectorDescriptors.map((connector) => [connector.id, connector]));
  const levels = workflowProgramNodeDependencyLevels(input.program);
  const nodeValidationHashes = workflowProgramNodeValidationHashes({
    program: input.program,
    levels,
    toolDescriptors: input.toolDescriptors,
    connectorDescriptors: input.connectorDescriptors,
    ambientCliCapabilities: input.ambientCliCapabilities,
    validateGoogleReadOnly: input.validateGoogleReadOnly,
  });
  const diagnosticsByNodeId = new Map<string, WorkflowProgramDiagnostic[]>();
  const metrics: WorkflowProgramIncrementalValidationMetrics = {
    nodeCount: input.program.nodes.length,
    dependencyLevelCount: levels.length,
    maxDependencyLevelWidth: levels.reduce((max, level) => Math.max(max, level.length), 0),
    validationConcurrency,
    validationCacheHits: 0,
    validationCacheMisses: 0,
    validationCacheWrites: 0,
  };

  diagnostics.push(...validateProgramGlobalShape(input.program));

  for (const level of levels) {
    for (const batch of workflowProgramNodeBatches(level, validationConcurrency)) {
      await Promise.all(
        batch.map(async ({ node, index }) => {
          const nodeHash = nodeValidationHashes.get(node.id) ?? stableHash(node);
          const cached = input.nodeValidationCache?.get(node.id);
          if (cached?.nodeHash === nodeHash) {
            metrics.validationCacheHits += 1;
            diagnosticsByNodeId.set(node.id, cloneDiagnostics(cached.diagnostics));
            return;
          }
          metrics.validationCacheMisses += 1;
          const nodeDiagnostics = [
            ...validateProgramNodeShape(node, index, nodesById, toolsByName, connectorsById),
            ...validateWorkflowProgramNodeCapabilities({
              program: input.program,
              node,
              nodeIndex: index,
              toolsByName,
              connectorsById,
              ambientCliCapabilities: input.ambientCliCapabilities,
              validateGoogleReadOnly: input.validateGoogleReadOnly,
            }),
            ...validateProgramNodeDataflow({
              node,
              nodeIndex: index,
              toolsByName,
              connectorsById,
              nodesById,
            }),
          ];
          diagnosticsByNodeId.set(node.id, nodeDiagnostics);
          if (input.nodeValidationCache) {
            input.nodeValidationCache.set(node.id, { nodeHash, diagnostics: cloneDiagnostics(nodeDiagnostics) });
            metrics.validationCacheWrites += 1;
          }
        }),
      );
    }
  }

  for (const node of input.program.nodes) {
    diagnostics.push(...(diagnosticsByNodeId.get(node.id) ?? []));
  }
  diagnostics.push(...validateProgramBudgets(input.program));
  diagnostics.push(...validateLongContextSourceAuditPreservation(input.program));
  diagnostics.push(...validateLocalDirectorySkippedMetadataPreservation(input.program));
  diagnostics.push(...validateConnectorCollectionEvidenceReachability(input.program));
  return { diagnostics, metrics };
}

export function emptyWorkflowProgramIncrementalValidationMetrics(
  validationConcurrency = DEFAULT_WORKFLOW_PROGRAM_VALIDATION_CONCURRENCY,
): WorkflowProgramIncrementalValidationMetrics {
  return {
    nodeCount: 0,
    dependencyLevelCount: 0,
    maxDependencyLevelWidth: 0,
    validationConcurrency,
    validationCacheHits: 0,
    validationCacheMisses: 0,
    validationCacheWrites: 0,
  };
}

export function validateWorkflowProgramJsonSchemaValue(
  value: unknown,
  schema: unknown,
  path: string,
  nodeId?: string,
): WorkflowProgramDiagnostic[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const validate = (candidate: unknown, candidateSchema: unknown, candidatePath: string) => {
    if (!candidateSchema || typeof candidateSchema !== "object" || Array.isArray(candidateSchema)) return;
    const record = candidateSchema as Record<string, unknown>;
    if (Array.isArray(record.enum) && !record.enum.some((item) => item === candidate)) {
      diagnostics.push(errorDiagnostic("tool.args_schema_invalid", `Expected one of ${record.enum.map(String).join(", ")}.`, candidatePath, nodeId));
      return;
    }
    const types = jsonSchemaTypes(record);
    if (types.length > 0 && !types.some((type) => jsonSchemaTypeMatches(candidate, type))) {
      diagnostics.push(errorDiagnostic("tool.args_schema_invalid", `Expected ${types.join(" or ")} value.`, candidatePath, nodeId));
      return;
    }
    if (types.includes("object") || (record.properties && candidate && typeof candidate === "object" && !Array.isArray(candidate))) {
      validateJsonObject(candidate, record, candidatePath, validate, diagnostics, nodeId);
      return;
    }
    if (types.includes("array") && Array.isArray(candidate) && record.items) {
      candidate.forEach((item, index) => validate(item, record.items, `${candidatePath}/${index}`));
    }
  };
  validate(value, schema, path);
  return diagnostics;
}

function validateProgramGlobalShape(program: WorkflowProgramIR): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const nodesById = new Map<string, WorkflowProgramNode>();
  for (const [index, node] of program.nodes.entries()) {
    if (nodesById.has(node.id)) {
      diagnostics.push(errorDiagnostic("ir.duplicate_node", `Duplicate workflow IR node id: ${node.id}`, `/nodes/${index}/id`, node.id));
    }
    nodesById.set(node.id, node);
  }
  diagnostics.push(...validateAcyclicProgram(program));
  return diagnostics;
}

function validateProgramNodeShape(
  node: WorkflowProgramNode,
  nodeIndex: number,
  nodesById: Map<string, WorkflowProgramNode>,
  toolsByName: Map<string, DesktopToolDescriptor>,
  connectorsById: Map<string, WorkflowConnectorDescriptor>,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  for (const dependencyId of node.dependsOn ?? []) {
    if (!nodesById.has(dependencyId)) {
      diagnostics.push(errorDiagnostic("ir.missing_dependency", `Node ${node.id} depends on missing node ${dependencyId}.`, `/nodes/${nodeIndex}/dependsOn`, node.id));
    }
    if (dependencyId === node.id) {
      diagnostics.push(errorDiagnostic("ir.self_dependency", `Node ${node.id} depends on itself.`, `/nodes/${nodeIndex}/dependsOn`, node.id));
    }
  }
  diagnostics.push(...validateValueReferences(nodeValueInputs(node), nodesById, `/nodes/${nodeIndex}`, node.id));
  for (const entry of nodeValueInputEntries(node, nodeIndex)) {
    diagnostics.push(...validateUnloweredHandleReferences(entry.value, entry.path, node.id));
  }
  diagnostics.push(...validateItemReferencesForNode(node, nodeIndex));
  diagnostics.push(...validateCollectionMapLiteralStrings(node, nodeIndex));
  diagnostics.push(...validateCollectionInputReferencesForNode(node, nodeIndex, nodesById, toolsByName, connectorsById));
  return diagnostics;
}

function validateCollectionMapLiteralStrings(node: WorkflowProgramNode, nodeIndex: number): WorkflowProgramDiagnostic[] {
  if (node.kind !== "collection.map") return [];
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      diagnostics.push(
        errorDiagnostic(
          "ir.collection_map_literal_string_ambiguous",
          `collection.map value ${JSON.stringify(value)} is a literal string. Use {"fromItem":"${node.itemName ?? "item"}","path":"${value}"} to copy a field, or {"literal":${JSON.stringify(value)}} for an intentional constant.`,
          path,
          node.id,
        ),
      );
      return;
    }
    if (!value || typeof value !== "object" || isProgramRef(value) || isProgramItemRef(value)) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (Object.keys(value as Record<string, unknown>).length === 1 && "literal" in (value as Record<string, unknown>)) return;
    if (typeof (value as { template?: unknown }).template === "string") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) visit(item, `${path}/${key}`);
  };
  visit(node.map, `/nodes/${nodeIndex}/map`);
  return diagnostics;
}

function validateCollectionInputReferencesForNode(
  node: WorkflowProgramNode,
  nodeIndex: number,
  nodesById: Map<string, WorkflowProgramNode>,
  toolsByName: Map<string, DesktopToolDescriptor>,
  connectorsById: Map<string, WorkflowConnectorDescriptor>,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const collectionInput =
    node.kind === "connector.map"
      ? { value: node.items, label: "connector.map items", path: `/nodes/${nodeIndex}/items` }
      : node.kind === "connector.paginate"
        ? undefined
      : node.kind === "collection.map"
        ? { value: node.items, label: "collection.map items", path: `/nodes/${nodeIndex}/items` }
      : node.kind === "collection.filter"
        ? { value: node.items, label: "collection.filter items", path: `/nodes/${nodeIndex}/items` }
      : node.kind === "collection.dedupe"
        ? { value: node.items, label: "collection.dedupe items", path: `/nodes/${nodeIndex}/items` }
      : node.kind === "collection.chunk"
        ? { value: node.items, label: "collection.chunk items", path: `/nodes/${nodeIndex}/items` }
      : node.kind === "model.map"
        ? { value: node.items, label: "model.map items", path: `/nodes/${nodeIndex}/items` }
      : node.kind === "model.reduce"
        ? { value: node.items, label: "model.reduce items", path: `/nodes/${nodeIndex}/items` }
      : node.kind === "loop.map"
        ? { value: node.items, label: "loop.map items", path: `/nodes/${nodeIndex}/items` }
        : undefined;
  if (!collectionInput) return diagnostics;
  if (isProgramRef(collectionInput.value)) {
    const source = nodesById.get(collectionInput.value.fromNode);
    if (source && !collectionInput.value.path && workflowProgramOutputIsObject(source)) {
      const knownPaths = workflowProgramKnownOutputPathList(source, { toolsByName, connectorsById, nodesById });
      diagnostics.push(
        errorDiagnostic(
          "ir.array_reference_path_required",
          `${collectionInput.label} must reference a concrete array output path such as records, messages, threads, items, entries, or value.${knownPaths ? ` Known output paths on ${source.id}: ${knownPaths}.` : ""}`,
          collectionInput.path,
          node.id,
        ),
      );
    }
  }
  if (Array.isArray(collectionInput.value) && collectionInput.value.some((item) => isProgramRef(item))) {
    diagnostics.push(
      errorDiagnostic(
        "ir.array_reference_wrapped",
        `${collectionInput.label} should reference an array directly as { fromNode, path }, not wrap that reference in a one-element array.`,
        collectionInput.path,
        node.id,
      ),
    );
  }
  return diagnostics;
}

function validateItemReferencesForNode(node: WorkflowProgramNode, nodeIndex: number): WorkflowProgramDiagnostic[] {
  if (node.kind === "loop.map") {
    return [
      ...validateScopedItemReferences(node.items, new Set(), `/nodes/${nodeIndex}/items`, node.id),
      ...validateScopedItemReferences(node.map, new Set([node.itemName ?? "item"]), `/nodes/${nodeIndex}/map`, node.id),
    ];
  }
  if (node.kind === "connector.map") {
    return [
      ...validateScopedItemReferences(node.items, new Set(), `/nodes/${nodeIndex}/items`, node.id),
      ...validateScopedItemReferences(node.input, new Set([node.itemName ?? "item"]), `/nodes/${nodeIndex}/input`, node.id),
    ];
  }
  if (node.kind === "collection.map") {
    return [
      ...validateScopedItemReferences(node.items, new Set(), `/nodes/${nodeIndex}/items`, node.id),
      ...validateScopedItemReferences(node.map, new Set([node.itemName ?? "item"]), `/nodes/${nodeIndex}/map`, node.id),
    ];
  }
  if (node.kind === "collection.filter") {
    return validateScopedItemReferences(node.items, new Set(), `/nodes/${nodeIndex}/items`, node.id);
  }
  if (node.kind === "collection.dedupe") {
    return validateScopedItemReferences(node.items, new Set(), `/nodes/${nodeIndex}/items`, node.id);
  }
  if (node.kind === "model.map") {
    return [
      ...validateScopedItemReferences(node.items, new Set(), `/nodes/${nodeIndex}/items`, node.id),
      ...validateScopedItemReferences(node.input, new Set([node.itemName ?? "item"]), `/nodes/${nodeIndex}/input`, node.id),
    ];
  }
  return nodeValueInputs(node).flatMap((value, inputIndex) => validateScopedItemReferences(value, new Set(), `/nodes/${nodeIndex}/input/${inputIndex}`, node.id));
}

function validateScopedItemReferences(
  value: unknown,
  allowedItemNames: Set<string>,
  path: string,
  nodeId: string,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    if (isProgramItemRef(candidate)) {
      if (!allowedItemNames.has(candidate.fromItem)) {
        diagnostics.push(
          errorDiagnostic(
            "ir.local_item_reference_out_of_scope",
            `Node ${nodeId} references loop item ${candidate.fromItem}, but that item is not in scope.`,
            `${candidatePath}/fromItem`,
            nodeId,
          ),
        );
      }
      return;
    }
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) visit(item, `${candidatePath}/${key}`);
  };
  visit(value, path);
  return diagnostics;
}

function validateAcyclicProgram(program: WorkflowProgramIR): WorkflowProgramDiagnostic[] {
  const byId = new Map(program.nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (node: WorkflowProgramNode) => {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) {
      diagnostics.push(errorDiagnostic("ir.dependency_cycle", `Workflow IR dependency cycle includes node ${node.id}.`, "/nodes", node.id));
      return;
    }
    visiting.add(node.id);
    for (const dependencyId of node.dependsOn ?? []) {
      const dependency = byId.get(dependencyId);
      if (dependency) visit(dependency);
    }
    visiting.delete(node.id);
    visited.add(node.id);
  };
  for (const node of program.nodes) visit(node);
  return diagnostics;
}

function validateValueReferences(
  value: unknown,
  nodesById: Map<string, WorkflowProgramNode>,
  path: string,
  nodeId: string,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.fromNode === "string") {
      if (!nodesById.has(record.fromNode)) {
        diagnostics.push(errorDiagnostic("ir.missing_value_source", `Node ${nodeId} references missing output node ${record.fromNode}.`, `${candidatePath}/fromNode`, nodeId));
      }
      return;
    }
    for (const [key, item] of Object.entries(record)) visit(item, `${candidatePath}/${key}`);
  };
  visit(value, path);
  return diagnostics;
}

function validateUnloweredHandleReferences(value: unknown, path: string, nodeId: string): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.fromHandle === "string") {
      diagnostics.push(
        errorDiagnostic(
          "ir.unlowered_handle_reference",
          `Node ${nodeId} still contains compiler-owned handle ${JSON.stringify(record.fromHandle)}. Handles must be lowered by the path registry before static validation.`,
          `${candidatePath}/fromHandle`,
          nodeId,
        ),
      );
      return;
    }
    for (const [key, item] of Object.entries(record)) visit(item, `${candidatePath}/${key}`);
  };
  visit(value, path);
  return diagnostics;
}

function validateProgramNodeDataflow(input: {
  node: WorkflowProgramNode;
  nodeIndex: number;
  toolsByName: Map<string, DesktopToolDescriptor>;
  connectorsById: Map<string, WorkflowConnectorDescriptor>;
  nodesById: Map<string, WorkflowProgramNode>;
}): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  for (const valueInput of nodeValueInputEntries(input.node, input.nodeIndex)) {
    diagnostics.push(...validateKnownReferencePaths(valueInput.value, input.nodesById, input.toolsByName, input.connectorsById, valueInput.path, input.node.id));
  }
  diagnostics.push(...validateRedundantStageApproval(input.node, input.nodeIndex, input.nodesById));
  if (input.node.kind === "connector.call" || input.node.kind === "connector.map" || input.node.kind === "connector.paginate") {
    diagnostics.push(...validateConnectorInputStatic(input.node, input.nodeIndex, input.connectorsById, input.nodesById));
    return diagnostics;
  }
  if (input.node.kind === "collection.chunk") {
    diagnostics.push(...validateCollectionChunkCapacity(input.node, input.nodeIndex, input.nodesById));
    return diagnostics;
  }
  if (input.node.kind === "collection.filter") {
    diagnostics.push(...validateCollectionFilterCapacity(input.node, input.nodeIndex, input.nodesById));
    return diagnostics;
  }
  if (input.node.kind === "collection.dedupe") {
    diagnostics.push(...validateCollectionDedupeCapacity(input.node, input.nodeIndex, input.nodesById));
    return diagnostics;
  }
  if (input.node.kind === "model.reduce") {
    diagnostics.push(...validateModelReduceTreeShape(input.node, input.nodeIndex));
    return diagnostics;
  }
  if (input.node.kind === "model.call") {
    diagnostics.push(...validateModelCallLongContextRouting(input.node, input.nodeIndex, input.toolsByName, input.nodesById));
    return diagnostics;
  }
  if (input.node.kind === "tool.paginate") {
    const descriptor = input.toolsByName.get(input.node.tool);
    if (descriptor) {
      diagnostics.push(
        ...validateStructuredInputStatic({
          owner: `Paginated tool ${input.node.tool}`,
          input: workflowProgramToolPaginateValidationInput(input.node),
          schema: descriptor.inputSchema,
          nodeIndex: input.nodeIndex,
          inputPath: "input",
          nodeId: input.node.id,
          nodesById: input.nodesById,
        }),
      );
    }
    return diagnostics;
  }
  if (input.node.kind === "browser.intervention") {
    const descriptor = input.toolsByName.get(input.node.tool);
    if (descriptor) diagnostics.push(...validateBrowserInterventionInputStatic(input.node, input.nodeIndex, descriptor, input.toolsByName, input.nodesById));
    return diagnostics;
  }
  if (input.node.kind === "loop.map" && isWorkflowProgramLoopMapToolCall(input.node.map)) {
    diagnostics.push(...validateLoopMapLiteralItemReferencePaths(input.node, input.nodeIndex));
    const descriptor = input.toolsByName.get(input.node.map.tool);
    if (descriptor) {
      diagnostics.push(
        ...validateStructuredInputStatic({
          owner: `Loop map tool ${input.node.map.tool}`,
          input: input.node.map.args ?? {},
          schema: descriptor.inputSchema,
          nodeIndex: input.nodeIndex,
          inputPath: "map/args",
          nodeId: input.node.id,
          nodesById: input.nodesById,
        }),
      );
    }
    return diagnostics;
  }
  const toolNode = workflowProgramToolNode(input.node);
  if (!toolNode) return diagnostics;
  const descriptor = input.toolsByName.get(toolNode.tool);
  if (!descriptor) return diagnostics;
  diagnostics.push(...validateToolArgsStatic(toolNode, input.nodeIndex, descriptor, input.nodesById));
  return diagnostics;
}

function validateLoopMapLiteralItemReferencePaths(
  node: Extract<WorkflowProgramNode, { kind: "loop.map" }>,
  nodeIndex: number,
): WorkflowProgramDiagnostic[] {
  const items = workflowProgramLiteralArray(node.items);
  if (!items) return [];
  const itemName = node.itemName ?? "item";
  const refs = workflowProgramItemRefs(node.map, itemName, `/nodes/${nodeIndex}/map`);
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  for (const ref of refs) {
    if (!ref.refPath) continue;
    for (const [itemIndex, item] of items.entries()) {
      if (!workflowProgramLiteralItemHasPath(item, ref.refPath)) {
        diagnostics.push(
          errorDiagnostic(
            "ir.loop_map_literal_item_path_missing",
            `loop.map item ${itemIndex} does not contain ${JSON.stringify(ref.refPath)} for {fromItem:${JSON.stringify(itemName)},path:${JSON.stringify(ref.refPath)}}. Use literal items with that field, change the reference path, or use explicit browser/read nodes for fixed URLs.`,
            `${ref.path}/path`,
            node.id,
          ),
        );
      }
    }
  }
  return diagnostics;
}

function validateRedundantStageApproval(
  node: WorkflowProgramNode,
  nodeIndex: number,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  if (node.kind !== "approval.required") return [];
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    if (isProgramRef(candidate)) {
      const source = nodesById.get(candidate.fromNode);
      if (source?.kind === "mutation.stage") {
        diagnostics.push(
          errorDiagnostic(
            "ir.redundant_stage_approval",
            `Node ${node.id} tries to approve staged mutation ${source.id}. mutation.stage already pauses for approval; remove this approval.required node and route downstream outputs from the mutation.stage result.`,
            `${candidatePath}/fromNode`,
            node.id,
          ),
        );
      }
      return;
    }
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) visit(item, `${candidatePath}/${key}`);
  };
  visit(node.changeSet, `/nodes/${nodeIndex}/changeSet`);
  return diagnostics;
}

function validateModelCallLongContextRouting(
  node: WorkflowProgramModelCallNode,
  nodeIndex: number,
  toolsByName: Map<string, DesktopToolDescriptor>,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  if (!toolsByName.has("long_context_process")) return [];
  const riskyRefs = modelCallLargeCollectionRefs(node.input, nodesById, `/nodes/${nodeIndex}/input`);
  return riskyRefs.map((ref) =>
    errorDiagnostic(
      "model.long_context_preprocessor_required",
      `model.call node ${node.id} passes ${ref.description} directly to Ambient. Insert a long_context_process tool.call before this model.call, or route the collection through collection.chunk plus model.map/model.reduce. Generated model-input compaction is only a last-resort guard and must not be the primary path for large or long-field evidence.`,
      ref.path,
      node.id,
    ),
  );
}

function validateLongContextSourceAuditPreservation(program: WorkflowProgramIR): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const nodesById = new Map(program.nodes.map((node) => [node.id, node]));
  for (const [nodeIndex, node] of program.nodes.entries()) {
    if (node.kind !== "tool.call" || node.tool !== "long_context_process") continue;
    const args = node.args && typeof node.args === "object" && !Array.isArray(node.args) ? (node.args as Record<string, unknown>) : {};
    const textRefs = workflowProgramValueReferences(args.text, `/nodes/${nodeIndex}/args/text`);
    const seen = new Set<string>();
    for (const ref of textRefs) {
      if (seen.has(ref.fromNode)) continue;
      seen.add(ref.fromNode);
      const source = nodesById.get(ref.fromNode);
      if (!source || workflowProgramNodeHasAuditCheckpoint(source)) continue;
      diagnostics.push(
        errorDiagnostic(
          "audit.long_context_source_not_checkpointed",
          `long_context_process node ${node.id} reads ${source.id}, but ${source.kind} output is not checkpoint-backed. Feed source tool, connector, collection, or explicit checkpoint.write output directly into long_context_process so full source evidence remains available in run audit.`,
          ref.path,
          node.id,
        ),
      );
    }
  }
  return diagnostics;
}

function validateLocalDirectorySkippedMetadataPreservation(program: WorkflowProgramIR): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const localDirectoryNodeIds = new Set(
    program.nodes
      .filter((node): node is WorkflowProgramToolCallNode => node.kind === "tool.call" && node.tool === "local_directory_list")
      .map((node) => node.id),
  );
  if (localDirectoryNodeIds.size === 0) return diagnostics;

  for (const [nodeIndex, node] of program.nodes.entries()) {
    for (const surface of localDirectoryMetadataSurfaces(node, nodeIndex)) {
      const refs = workflowProgramValueReferences(surface.value, surface.path);
      for (const localDirectoryNodeId of localDirectoryNodeIds) {
        const refsForDirectory = refs.filter((ref) => ref.fromNode === localDirectoryNodeId);
        const wholeResultEntryAlias = refsForDirectory.find(
          (ref) => workflowProgramRefFirstPathSegment(ref.refPath) === undefined && workflowProgramValuePathLooksLikeEntries(ref.path),
        );
        if (wholeResultEntryAlias) {
          diagnostics.push(
            errorDiagnostic(
              "audit.local_directory_entries_path_required",
              `Node ${node.id} aliases the whole local_directory_list result from ${localDirectoryNodeId} as entries. Reference path "entries" for visible entries, and carry skipped, truncated, and totalKnownEntries separately so directory coverage is explicit.`,
              wholeResultEntryAlias.path,
              node.id,
            ),
          );
          continue;
        }
        const entryRefs = refsForDirectory.filter((ref) => workflowProgramRefFirstPathSegment(ref.refPath) === "entries");
        if (entryRefs.length === 0) continue;

        const hasSkipped = refsForDirectory.some((ref) => workflowProgramRefFirstPathSegment(ref.refPath) === "skipped");
        const hasTruncated = refsForDirectory.some((ref) => workflowProgramRefFirstPathSegment(ref.refPath) === "truncated");
        const hasTotalKnownEntries = refsForDirectory.some((ref) => workflowProgramRefFirstPathSegment(ref.refPath) === "totalKnownEntries");
        if (hasSkipped && hasTruncated && hasTotalKnownEntries) continue;

        diagnostics.push(
          errorDiagnostic(
            "audit.local_directory_skipped_metadata_required",
            `Node ${node.id} consumes entries from local_directory_list node ${localDirectoryNodeId} without preserving explicit coverage metadata. Include skipped, truncated, and totalKnownEntries from the same directory result as separate fields in ${surface.label}; report skipped counts/reasons as metadata only and do not read skipped contents.`,
            entryRefs[0]?.path ?? surface.path,
            node.id,
          ),
        );
      }
    }
  }
  return diagnostics;
}

function validateConnectorCollectionEvidenceReachability(program: WorkflowProgramIR): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const connectorCollectionNodes = program.nodes.filter(
    (node): node is WorkflowProgramConnectorPaginateNode => node.kind === "connector.paginate",
  );
  if (connectorCollectionNodes.length === 0) return diagnostics;

  const nodeIndexes = new Map(program.nodes.map((node, index) => [node.id, index]));
  const consumersBySourceId = new Map<string, Set<string>>();
  for (const node of program.nodes) {
    for (const referencedNodeId of new Set(nodeValueInputs(node).flatMap((value) => workflowProgramReferencedNodeIds(value)))) {
      let consumers = consumersBySourceId.get(referencedNodeId);
      if (!consumers) {
        consumers = new Set();
        consumersBySourceId.set(referencedNodeId, consumers);
      }
      consumers.add(node.id);
    }
  }

  const evidenceSinkIds = new Set(
    program.nodes
      .filter(
        (node) =>
          node.kind === "model.call" ||
          node.kind === "model.map" ||
          node.kind === "model.reduce" ||
          node.kind === "output.final" ||
          node.kind === "document.render" ||
          (node.kind === "tool.call" && node.tool === "long_context_process"),
      )
      .map((node) => node.id),
  );

  for (const node of connectorCollectionNodes) {
    if (connectorCollectionReachesSink(node.id, consumersBySourceId, evidenceSinkIds)) continue;
    const nodeIndex = nodeIndexes.get(node.id) ?? 0;
    diagnostics.push(
      errorDiagnostic(
        "audit.connector_collection_evidence_unconsumed",
        `Connector collection node ${node.id} collects ${node.connectorId}.${node.operation} results, but no model, long-context preprocessor, rendered document, or final output consumes that collection through data references. Feed its items through collection.map/chunk/model input, long_context_process, or final output so connector evidence cannot disappear at runtime.`,
        `/nodes/${nodeIndex}`,
        node.id,
      ),
    );
  }

  return diagnostics;
}

function connectorCollectionReachesSink(
  sourceNodeId: string,
  consumersBySourceId: Map<string, Set<string>>,
  evidenceSinkIds: Set<string>,
): boolean {
  const queue = [...(consumersBySourceId.get(sourceNodeId) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    if (evidenceSinkIds.has(nodeId)) return true;
    for (const consumerId of consumersBySourceId.get(nodeId) ?? []) queue.push(consumerId);
  }
  return false;
}

interface WorkflowProgramLocalDirectoryMetadataSurface {
  value: unknown;
  path: string;
  label: string;
}

function localDirectoryMetadataSurfaces(node: WorkflowProgramNode, nodeIndex: number): WorkflowProgramLocalDirectoryMetadataSurface[] {
  if (node.kind === "model.call") return [{ value: node.input, path: `/nodes/${nodeIndex}/input`, label: "model.call input" }];
  if (node.kind === "model.map") {
    return [
      { value: node.items, path: `/nodes/${nodeIndex}/items`, label: "model.map items" },
      { value: node.input, path: `/nodes/${nodeIndex}/input`, label: "model.map input" },
    ];
  }
  if (node.kind === "model.reduce") {
    return [
      { value: node.items, path: `/nodes/${nodeIndex}/items`, label: "model.reduce items" },
      { value: node.input, path: `/nodes/${nodeIndex}/input`, label: "model.reduce input" },
    ];
  }
  if (node.kind === "document.render") return [{ value: node.input, path: `/nodes/${nodeIndex}/input`, label: "document.render input" }];
  if (node.kind === "checkpoint.write") return [{ value: node.value, path: `/nodes/${nodeIndex}/value`, label: "checkpoint.write value" }];
  if (node.kind === "output.final") return [{ value: node.value, path: `/nodes/${nodeIndex}/value`, label: "output.final value" }];
  return [];
}

interface WorkflowProgramValueReference {
  fromNode: string;
  path: string;
  refPath?: string;
}

function workflowProgramValueReferences(value: unknown, path: string): WorkflowProgramValueReference[] {
  const refs: WorkflowProgramValueReference[] = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    if (isProgramRef(candidate)) {
      refs.push({ fromNode: candidate.fromNode, path: candidatePath, refPath: candidate.path });
      return;
    }
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) visit(item, `${candidatePath}/${key}`);
  };
  visit(value, path);
  return refs;
}

function workflowProgramRefFirstPathSegment(path: string | undefined): string | undefined {
  return path?.split(".").filter(Boolean)[0];
}

function workflowProgramValuePathLooksLikeEntries(path: string): boolean {
  const segment = path.split("/").filter(Boolean).at(-1)?.toLowerCase();
  return segment === "entries" || segment === "items" || segment === "files" || segment === "documents";
}

function workflowProgramNodeHasAuditCheckpoint(node: WorkflowProgramNode): boolean {
  if (node.kind === "tool.call") return true;
  if (node.kind === "tool.paginate") return true;
  if (node.kind === "connector.call") return true;
  if (node.kind === "connector.paginate") return true;
  if (node.kind === "connector.map") return true;
  if (node.kind === "collection.map") return true;
  if (node.kind === "collection.filter") return true;
  if (node.kind === "collection.dedupe") return true;
  if (node.kind === "collection.chunk") return true;
  if (node.kind === "document.render") return true;
  if (node.kind === "model.call") return true;
  if (node.kind === "model.map") return true;
  if (node.kind === "model.reduce") return true;
  if (node.kind === "browser.intervention") return true;
  if (node.kind === "loop.map") return isWorkflowProgramLoopMapToolCall(node.map);
  if (node.kind === "checkpoint.write") return true;
  if (node.kind === "output.final") return true;
  return false;
}

interface ModelCallLargeCollectionRef {
  path: string;
  description: string;
}

function modelCallLargeCollectionRefs(
  value: unknown,
  nodesById: Map<string, WorkflowProgramNode>,
  path: string,
): ModelCallLargeCollectionRef[] {
  const refs: ModelCallLargeCollectionRef[] = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    if (isProgramRef(candidate)) {
      const source = nodesById.get(candidate.fromNode);
      const risky = source ? largeCollectionRefDescription(source, candidate.path) : undefined;
      if (risky) refs.push({ path: candidatePath, description: risky });
      return;
    }
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) visit(item, `${candidatePath}/${key}`);
  };
  visit(value, path);
  return refs;
}

function largeCollectionRefDescription(source: WorkflowProgramNode, path: string | undefined): string | undefined {
  if (source.kind === "tool.call" && source.tool === "long_context_process") return undefined;
  if (source.kind === "model.map" || source.kind === "model.reduce") return undefined;
  const collectionPath = path?.split(".").filter(Boolean)[0];
  if (source.kind === "connector.map" && (!collectionPath || collectionPath === "items")) {
    const maxItems = source.maxItems ?? DIRECT_MODEL_LARGE_COLLECTION_ITEM_THRESHOLD;
    if (maxItems >= DIRECT_MODEL_LARGE_COLLECTION_ITEM_THRESHOLD) return `up to ${maxItems} connector fan-out item${maxItems === 1 ? "" : "s"} from ${source.id}.${collectionPath ?? "<object>"}`;
  }
  if (
    (source.kind === "tool.paginate" ||
      source.kind === "connector.paginate" ||
      source.kind === "collection.map" ||
      source.kind === "collection.filter" ||
      source.kind === "collection.dedupe") &&
    collectionPath === "items"
  ) {
    const maxItems = source.maxItems;
    if (maxItems >= DIRECT_MODEL_LARGE_COLLECTION_ITEM_THRESHOLD) return `up to ${maxItems} collection item${maxItems === 1 ? "" : "s"} from ${source.id}.items`;
  }
  if (source.kind === "collection.chunk" && collectionPath === "chunks") {
    const maxItems = source.chunkSize * source.maxChunks;
    if (maxItems >= DIRECT_MODEL_LARGE_COLLECTION_ITEM_THRESHOLD) return `up to ${source.maxChunks} chunks covering ${maxItems} item${maxItems === 1 ? "" : "s"} from ${source.id}.chunks`;
  }
  return undefined;
}

function workflowProgramToolPaginateValidationInput(node: Extract<WorkflowProgramNode, { kind: "tool.paginate" }>): unknown {
  const input = cloneValidationObject(node.input ?? {});
  if (!input || typeof input !== "object" || Array.isArray(input) || isProgramRef(input)) return input;
  const record = input as Record<string, unknown>;
  const pageQueries = Array.isArray(node.pageQueries) ? node.pageQueries.filter((query): query is string => typeof query === "string" && query.trim().length > 0) : [];
  if (pageQueries.length > 0 && node.queryInputPath) setValidationPath(record, node.queryInputPath, pageQueries[0]);
  if (node.pageSize !== undefined && node.pageSizeInputPath) setValidationPath(record, node.pageSizeInputPath, node.pageSize);
  return record;
}

function cloneValidationObject(value: unknown): unknown {
  if (!value || typeof value !== "object" || isProgramRef(value) || isProgramItemRef(value)) return value;
  if (Array.isArray(value)) return value.map(cloneValidationObject);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneValidationObject(item)]));
}

function setValidationPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next) || isProgramRef(next) || isProgramItemRef(next)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function validateConnectorInputStatic(
  node: WorkflowProgramConnectorCallNode | WorkflowProgramConnectorMapNode | WorkflowProgramConnectorPaginateNode,
  nodeIndex: number,
  connectorsById: Map<string, WorkflowConnectorDescriptor>,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  const descriptor = connectorsById.get(node.connectorId);
  const operation = descriptor ? connectorOperationDescriptor(descriptor, node.operation) : undefined;
  if (!operation) return [];
  return [
    ...validateStructuredInputStatic({
      owner: `Connector ${node.connectorId}.${node.operation}`,
      input: node.input ?? {},
      schema: operation.inputSchema,
      nodeIndex,
      inputPath: "input",
      nodeId: node.id,
      nodesById,
    }),
    ...validateConnectorOutputSchemaOverrideStatic(node, nodeIndex, operation),
  ];
}

function validateConnectorOutputSchemaOverrideStatic(
  node: WorkflowProgramConnectorCallNode | WorkflowProgramConnectorMapNode | WorkflowProgramConnectorPaginateNode,
  nodeIndex: number,
  operation: WorkflowConnectorOperationDescriptor,
): WorkflowProgramDiagnostic[] {
  if (node.kind !== "connector.call") return [];
  const expectedKeys = workflowProgramSchemaObjectKeys(operation.outputSchema);
  const overrideKeys = workflowProgramSchemaObjectKeys(node.output?.schema);
  if (!expectedKeys?.size || !overrideKeys?.size) return [];
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  for (const key of overrideKeys) {
    if (!expectedKeys.has(key)) {
      diagnostics.push(
        errorDiagnostic(
          "connector.output_schema_unknown_property",
          `Connector ${node.connectorId}.${node.operation} output schema does not declare ${key}; use one of ${[...expectedKeys].join(", ")} or omit the override.`,
          `/nodes/${nodeIndex}/output/schema/${key}`,
          node.id,
        ),
      );
    }
  }
  return diagnostics;
}

function validateCollectionChunkCapacity(
  node: WorkflowProgramCollectionChunkNode,
  nodeIndex: number,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  const maxCapacity = node.chunkSize * node.maxChunks;
  const sourceMaxItems = workflowProgramStaticCollectionMaxItems(node.items, nodesById);
  if (sourceMaxItems === undefined || sourceMaxItems <= maxCapacity) return [];
  return [
    warningDiagnostic(
      "collection.chunk_capacity_truncates_static_source",
      `collection.chunk capacity ${maxCapacity} is lower than the upstream static bound ${sourceMaxItems}; downstream model.map will only see the first ${maxCapacity} item${maxCapacity === 1 ? "" : "s"}.`,
      `/nodes/${nodeIndex}/maxChunks`,
      node.id,
    ),
  ];
}

function validateCollectionDedupeCapacity(
  node: WorkflowProgramCollectionDedupeNode,
  nodeIndex: number,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  const sourceMaxItems = workflowProgramStaticCollectionMaxItems(node.items, nodesById);
  if (sourceMaxItems === undefined || sourceMaxItems <= node.maxItems) return [];
  return [
    warningDiagnostic(
      "collection.dedupe_capacity_truncates_static_source",
      `collection.dedupe maxItems ${node.maxItems} is lower than the upstream static bound ${sourceMaxItems}; downstream nodes will see at most ${node.maxItems} unique item${node.maxItems === 1 ? "" : "s"}.`,
      `/nodes/${nodeIndex}/maxItems`,
      node.id,
    ),
  ];
}

function validateModelReduceTreeShape(node: WorkflowProgramModelReduceNode, nodeIndex: number): WorkflowProgramDiagnostic[] {
  if (node.strategy !== "tree") return [];
  const maxFanIn = normalizedModelReduceTreeFanIn(node);
  const maxLevels = normalizedModelReduceTreeLevels(node);
  let current = Math.max(0, Math.floor(node.maxInputItems));
  let level = 0;
  while (current > maxFanIn && level < maxLevels) {
    current = Math.ceil(current / maxFanIn);
    level += 1;
  }
  if (current <= maxFanIn) return [];
  return [
    errorDiagnostic(
      "model.reduce_tree_depth_too_low",
      `model.reduce tree maxLevels ${maxLevels} cannot reduce maxInputItems ${node.maxInputItems} with maxFanIn ${maxFanIn}. Increase maxLevels or maxFanIn.`,
      `/nodes/${nodeIndex}/maxLevels`,
      node.id,
    ),
  ];
}

function validateCollectionFilterCapacity(
  node: WorkflowProgramCollectionFilterNode,
  nodeIndex: number,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  const sourceMaxItems = workflowProgramStaticCollectionMaxItems(node.items, nodesById);
  if (sourceMaxItems === undefined || sourceMaxItems <= node.maxItems) return [];
  return [
    warningDiagnostic(
      "collection.filter_capacity_truncates_static_source",
      `collection.filter maxItems ${node.maxItems} is lower than the upstream static bound ${sourceMaxItems}; downstream nodes will see at most ${node.maxItems} retained item${node.maxItems === 1 ? "" : "s"}.`,
      `/nodes/${nodeIndex}/maxItems`,
      node.id,
    ),
  ];
}

function workflowProgramStaticCollectionMaxItems(value: unknown, nodesById: Map<string, WorkflowProgramNode>): number | undefined {
  if (Array.isArray(value)) return value.length;
  if (!isProgramRef(value)) return undefined;
  const source = nodesById.get(value.fromNode);
  if (!source) return undefined;
  if (source.kind === "tool.paginate" && value.path === "items") return source.maxItems;
  if (source.kind === "connector.paginate" && value.path === "items") return source.maxItems;
  if (source.kind === "connector.map" && value.path === "items") return source.maxItems ?? 1000;
  if (source.kind === "collection.map" && value.path === "items") return source.maxItems;
  if (source.kind === "collection.filter" && value.path === "items") return source.maxItems;
  if (source.kind === "collection.dedupe" && value.path === "items") return source.maxItems;
  if (source.kind === "collection.chunk" && value.path === "chunks") return source.maxChunks;
  if (source.kind === "model.map" && (value.path === "items" || value.path === "results")) return source.maxItems;
  if (source.kind === "loop.map" && value.path === "items") return source.maxItems ?? 1000;
  return undefined;
}

function validateProgramBudgets(program: WorkflowProgramIR): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const details = workflowProgramBudgetUsageDetails(program.nodes);
  const usage = details.totals;
  for (const kind of ["toolCalls", "modelCalls", "connectorCalls"] as const) {
    const calls = usage[kind];
    if (calls <= WORKFLOW_PROGRAM_STATIC_CALL_CEILING) continue;
    const budgetName =
      kind === "toolCalls" ? "maxToolCalls" : kind === "modelCalls" ? "maxModelCalls" : "maxConnectorCalls";
    diagnostics.push(
      errorDiagnostic(
        `budget.${snakeBudgetName(budgetName)}_ceiling_exceeded`,
        `Workflow IR requires at least ${calls} static ${budgetLabel(kind)} calls, which exceeds the single-workflow ceiling of ${WORKFLOW_PROGRAM_STATIC_CALL_CEILING}. ${budgetDiagnosticContributors(
          details.contributors[kind],
        )} Split this into smaller tiers, reduce the requested item/detail fan-out, or collect only metadata first and add an explicit review/approval step before compiling a follow-up detail batch.`,
        `/budgets/${budgetName}`,
        details.contributors[kind][0]?.nodeId,
      ),
    );
  }
  if (program.budgets?.maxToolCalls !== undefined && program.budgets.maxToolCalls < usage.toolCalls) {
    diagnostics.push(
      errorDiagnostic(
        "budget.max_tool_calls_too_low",
        `Workflow IR declares maxToolCalls ${program.budgets.maxToolCalls}, but the static plan requires at least ${usage.toolCalls} tool call${usage.toolCalls === 1 ? "" : "s"}.`,
        "/budgets/maxToolCalls",
      ),
    );
  }
  if (program.budgets?.maxModelCalls !== undefined && program.budgets.maxModelCalls < usage.modelCalls) {
    diagnostics.push(
      errorDiagnostic(
        "budget.max_model_calls_too_low",
        `Workflow IR declares maxModelCalls ${program.budgets.maxModelCalls}, but the static plan requires at least ${usage.modelCalls} model call${usage.modelCalls === 1 ? "" : "s"}.`,
        "/budgets/maxModelCalls",
      ),
    );
  }
  if (program.budgets?.maxConnectorCalls !== undefined && program.budgets.maxConnectorCalls < usage.connectorCalls) {
    diagnostics.push(
      errorDiagnostic(
        "budget.max_connector_calls_too_low",
        `Workflow IR declares maxConnectorCalls ${program.budgets.maxConnectorCalls}, but the static plan requires at least ${usage.connectorCalls} connector call${usage.connectorCalls === 1 ? "" : "s"}.`,
        "/budgets/maxConnectorCalls",
      ),
    );
  }
  return diagnostics;
}

interface WorkflowProgramBudgetUsageDetails {
  totals: { toolCalls: number; modelCalls: number; connectorCalls: number };
  contributors: Record<"toolCalls" | "modelCalls" | "connectorCalls", WorkflowProgramBudgetContributor[]>;
}

interface WorkflowProgramBudgetContributor {
  nodeId: string;
  nodeKind: WorkflowProgramNode["kind"];
  calls: number;
}

function workflowProgramBudgetUsageDetails(nodes: WorkflowProgramNode[]): WorkflowProgramBudgetUsageDetails {
  const contributors: WorkflowProgramBudgetUsageDetails["contributors"] = { toolCalls: [], modelCalls: [], connectorCalls: [] };
  for (const node of nodes) {
    const toolCalls = workflowProgramNodeToolCallBudget(node);
    const modelCalls = workflowProgramNodeModelCallBudget(node);
    const connectorCalls = workflowProgramNodeConnectorCallBudget(node);
    if (toolCalls > 0) contributors.toolCalls.push({ nodeId: node.id, nodeKind: node.kind, calls: toolCalls });
    if (modelCalls > 0) contributors.modelCalls.push({ nodeId: node.id, nodeKind: node.kind, calls: modelCalls });
    if (connectorCalls > 0) contributors.connectorCalls.push({ nodeId: node.id, nodeKind: node.kind, calls: connectorCalls });
  }
  for (const entries of Object.values(contributors)) entries.sort((a, b) => b.calls - a.calls || a.nodeId.localeCompare(b.nodeId));
  return {
    contributors,
    totals: {
      toolCalls: contributors.toolCalls.reduce((sum, entry) => sum + entry.calls, 0),
      modelCalls: contributors.modelCalls.reduce((sum, entry) => sum + entry.calls, 0),
      connectorCalls: contributors.connectorCalls.reduce((sum, entry) => sum + entry.calls, 0),
    },
  };
}

function workflowProgramNodeToolCallBudget(node: WorkflowProgramNode): number {
  if (node.kind === "tool.call" || node.kind === "mutation.stage") return 1;
  if (node.kind === "tool.paginate") return node.maxPages;
  if (node.kind === "browser.intervention") return 2 + (node.screenshot && node.screenshot.enabled !== false ? 1 : 0);
  if (node.kind === "loop.map" && isWorkflowProgramLoopMapToolCall(node.map)) return node.maxItems ?? WORKFLOW_PROGRAM_STATIC_CALL_CEILING;
  return 0;
}

function workflowProgramNodeModelCallBudget(node: WorkflowProgramNode): number {
  if (node.kind === "model.call") return 1;
  if (node.kind === "model.map") return node.maxItems;
  if (node.kind === "model.reduce") return workflowProgramModelReduceCallBudget(node);
  return 0;
}

function workflowProgramNodeConnectorCallBudget(node: WorkflowProgramNode): number {
  if (node.kind === "connector.call") return 1;
  if (node.kind === "connector.paginate") return node.maxPages;
  if (node.kind === "connector.map") return node.maxItems ?? WORKFLOW_PROGRAM_STATIC_CALL_CEILING;
  return 0;
}

function budgetLabel(kind: "toolCalls" | "modelCalls" | "connectorCalls"): string {
  if (kind === "toolCalls") return "tool";
  if (kind === "modelCalls") return "model";
  return "connector";
}

function snakeBudgetName(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function budgetDiagnosticContributors(contributors: WorkflowProgramBudgetContributor[]): string {
  const top = contributors.slice(0, 3);
  if (!top.length) return "";
  return `Largest contributors: ${top.map((entry) => `${entry.nodeId} (${entry.nodeKind})=${entry.calls}`).join(", ")}.`;
}

function validateKnownReferencePaths(
  value: unknown,
  nodesById: Map<string, WorkflowProgramNode>,
  toolsByName: Map<string, DesktopToolDescriptor>,
  connectorsById: Map<string, WorkflowConnectorDescriptor>,
  path: string,
  nodeId: string,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    if (isProgramRef(candidate)) {
      const source = nodesById.get(candidate.fromNode);
      if (source && candidate.path && !workflowProgramRefPathExists(source, candidate.path, { toolsByName, connectorsById, nodesById })) {
        const knownPaths = workflowProgramKnownOutputPathList(source, { toolsByName, connectorsById, nodesById });
        diagnostics.push(
          errorDiagnostic(
            "ir.unknown_output_path",
            `Node ${nodeId} references path ${candidate.path} on ${candidate.fromNode}, but that output path is not known for ${workflowProgramNodeOutputSummary(source)}.${knownPaths ? ` Known valid first-segment paths: ${knownPaths}.` : ""}`,
            `${candidatePath}/path`,
            nodeId,
          ),
        );
      }
      return;
    }
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) visit(item, `${candidatePath}/${key}`);
  };
  visit(value, path);
  return diagnostics;
}

function validateToolArgsStatic(
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
  descriptor: DesktopToolDescriptor,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  return validateStructuredInputStatic({
    owner: `Tool ${node.tool}`,
    input: node.args ?? {},
    schema: descriptor.inputSchema,
    nodeIndex,
    inputPath: "args",
    nodeId: node.id,
    nodesById,
  });
}

function validateBrowserInterventionInputStatic(
  node: WorkflowProgramBrowserInterventionNode,
  nodeIndex: number,
  descriptor: DesktopToolDescriptor,
  toolsByName: Map<string, DesktopToolDescriptor>,
  nodesById: Map<string, WorkflowProgramNode>,
): WorkflowProgramDiagnostic[] {
  const diagnostics = validateStructuredInputStatic({
    owner: `Browser intervention tool ${node.tool}`,
    input: node.args ?? {},
    schema: descriptor.inputSchema,
    nodeIndex,
    inputPath: "args",
    nodeId: node.id,
    nodesById,
  });
  const screenshotDescriptor = node.screenshot?.enabled === false ? undefined : node.screenshot ? toolsByName.get("browser_screenshot") : undefined;
  if (screenshotDescriptor) {
    diagnostics.push(
      ...validateStructuredInputStatic({
        owner: "Browser intervention screenshot",
        input: node.screenshot?.args ?? {},
        schema: screenshotDescriptor.inputSchema,
        nodeIndex,
        inputPath: "args",
        nodeId: node.id,
        nodesById,
      }),
    );
  }
  diagnostics.push(...validateBrowserInterventionSkipIfStatic(node, nodeIndex));
  return diagnostics;
}

function validateBrowserInterventionSkipIfStatic(
  node: WorkflowProgramBrowserInterventionNode,
  nodeIndex: number,
): WorkflowProgramDiagnostic[] {
  if (node.skipIf === undefined || typeof node.skipIf === "boolean") return [];
  if (isProgramRef(node.skipIf)) {
    if (node.skipIf.path === "skipped") return [];
    return [
      errorDiagnostic(
        "browser.intervention_skipif_requires_skipped_flag",
        `browser.intervention skipIf must reference a prior browser intervention skipped flag. Use {"fromNode":"${node.skipIf.fromNode}","path":"skipped"} or remove skipIf; referencing ${JSON.stringify(node.skipIf.path ?? "")} can skip the browser read after a successful source fetch.`,
        `/nodes/${nodeIndex}/skipIf/path`,
        node.id,
      ),
    ];
  }
  return [
    errorDiagnostic(
      "browser.intervention_skipif_requires_skipped_flag",
      "browser.intervention skipIf must be a boolean literal or a direct reference shaped as {\"fromNode\":\"...\",\"path\":\"skipped\"}.",
      `/nodes/${nodeIndex}/skipIf`,
      node.id,
    ),
  ];
}

function validateStructuredInputStatic(input: {
  owner: string;
  input: unknown;
  schema: unknown;
  nodeIndex: number;
  inputPath: string;
  nodeId: string;
  nodesById: Map<string, WorkflowProgramNode>;
}): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (!input.schema || typeof input.schema !== "object" || Array.isArray(input.schema)) return diagnostics;
  const objectSchema = input.schema as Record<string, unknown>;
  if (objectSchema.type !== "object" || !input.input || typeof input.input !== "object" || Array.isArray(input.input) || isProgramRef(input.input)) return diagnostics;
  const args = input.input as Record<string, unknown>;
  const properties = objectSchema.properties && typeof objectSchema.properties === "object" && !Array.isArray(objectSchema.properties) ? (objectSchema.properties as Record<string, unknown>) : {};
  const required = Array.isArray(objectSchema.required) ? objectSchema.required.filter((item): item is string => typeof item === "string") : [];
  for (const key of required) {
    if (!(key in args)) {
      diagnostics.push(
        errorDiagnostic("input.required_missing", `${input.owner} requires ${input.inputPath}.${key}.`, `/nodes/${input.nodeIndex}/${input.inputPath}/${key}`, input.nodeId),
      );
    }
  }
  if (objectSchema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!(key in properties)) {
        diagnostics.push(
          errorDiagnostic("input.unknown_property", `${input.owner} does not accept ${input.inputPath}.${key}.`, `/nodes/${input.nodeIndex}/${input.inputPath}/${key}`, input.nodeId),
        );
      }
    }
  }
  for (const [key, value] of Object.entries(args)) {
    const propertySchema = properties[key];
    if (!propertySchema) continue;
    diagnostics.push(...validateStructuredReferenceShapes(value, propertySchema, `/nodes/${input.nodeIndex}/${input.inputPath}/${key}`, input));
  }
  return diagnostics;
}

function validateStructuredReferenceShapes(
  value: unknown,
  schema: unknown,
  path: string,
  input: {
    owner: string;
    inputPath: string;
    nodeId: string;
    nodesById: Map<string, WorkflowProgramNode>;
  },
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return diagnostics;
  if (isProgramRef(value)) {
    if (schemaExpectsPrimitive(schema)) {
      const source = input.nodesById.get(value.fromNode);
      if (source && !value.path && workflowProgramOutputIsObject(source)) {
        const knownPaths = workflowProgramKnownOutputPathList(source, { nodesById: input.nodesById });
        diagnostics.push(
          errorDiagnostic(
            "ir.reference_path_required",
            `${input.owner} ${input.inputPath} expects a primitive value; reference ${value.fromNode} with a concrete output path such as content, path, stdout, or summary.${knownPaths ? ` Known output paths on ${source.id}: ${knownPaths}.` : ""}`,
            path,
            input.nodeId,
          ),
        );
      }
    }
    return diagnostics;
  }
  if (isProgramItemRef(value)) {
    if (schemaExpectsPrimitive(schema) && !value.path) {
      diagnostics.push(
        errorDiagnostic(
          "ir.item_reference_path_required",
          `${input.owner} ${input.inputPath} expects a primitive value; item reference ${value.fromItem} needs a concrete output path such as id, threadId, path, name, or content.`,
          path,
          input.nodeId,
        ),
      );
    }
    return diagnostics;
  }
  if (!value || typeof value !== "object") return diagnostics;
  const record = schema as Record<string, unknown>;
  if (Array.isArray(value)) {
    if (!record.items) return diagnostics;
    value.forEach((item, index) => diagnostics.push(...validateStructuredReferenceShapes(item, record.items, `${path}/${index}`, input)));
    return diagnostics;
  }
  const properties = record.properties && typeof record.properties === "object" && !Array.isArray(record.properties) ? (record.properties as Record<string, unknown>) : {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const propertySchema = properties[key];
    if (propertySchema) diagnostics.push(...validateStructuredReferenceShapes(item, propertySchema, `${path}/${key}`, input));
  }
  return diagnostics;
}

function workflowProgramNodeDependencyLevels(program: WorkflowProgramIR): Array<Array<{ node: WorkflowProgramNode; index: number }>> {
  const nodes = program.nodes.map((node, index) => ({ node, index }));
  const byId = new Map(program.nodes.map((node) => [node.id, node]));
  const remaining = new Map(nodes.map((entry) => [entry.node.id, entry]));
  const completed = new Set<string>();
  const levels: Array<Array<{ node: WorkflowProgramNode; index: number }>> = [];
  while (remaining.size > 0) {
    const ready = nodes.filter(
      (entry) =>
        remaining.has(entry.node.id) &&
        (entry.node.dependsOn ?? []).every((dependencyId) => !byId.has(dependencyId) || completed.has(dependencyId)),
    );
    if (ready.length === 0) {
      levels.push([...remaining.values()].sort((left, right) => left.index - right.index));
      break;
    }
    levels.push(ready);
    for (const entry of ready) {
      remaining.delete(entry.node.id);
      completed.add(entry.node.id);
    }
  }
  return levels;
}

function workflowProgramNodeBatches<T>(items: T[], concurrency: number): T[][] {
  const size = Math.max(1, Math.floor(concurrency));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

function workflowProgramNodeValidationHashes(input: {
  program: WorkflowProgramIR;
  levels: Array<Array<{ node: WorkflowProgramNode; index: number }>>;
  toolDescriptors: DesktopToolDescriptor[];
  connectorDescriptors: WorkflowConnectorDescriptor[];
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[];
  validateGoogleReadOnly: boolean;
}): Map<string, string> {
  const contentHashes = new Map(input.program.nodes.map((node) => [node.id, stableHash(node)]));
  const validationHashes = new Map<string, string>();
  const policyHash = stableHash({
    tools: input.toolDescriptors.map((tool) => ({
      name: tool.name,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      permissionScope: tool.permissionScope,
      sideEffects: tool.sideEffects,
      pagination: tool.pagination,
    })),
    connectors: input.connectorDescriptors.map((connector) => ({
      id: connector.id,
      auth: connector.auth,
      accounts: connector.accounts,
      operations: connector.operations.map((operation) => ({
        name: operation.name,
        sideEffects: operation.sideEffects,
        inputSchema: operation.inputSchema,
        outputSchema: operation.outputSchema,
        requiredScopes: operation.requiredScopes,
        idempotencyKey: operation.idempotencyKey,
      })),
    })),
    ambientCliCapabilities: input.ambientCliCapabilities,
    validateGoogleReadOnly: input.validateGoogleReadOnly,
  });
  for (const level of input.levels) {
    for (const { node } of level) {
      const directDependencyHashes = (node.dependsOn ?? []).map((dependencyId) => validationHashes.get(dependencyId) ?? contentHashes.get(dependencyId) ?? dependencyId);
      const referenceHashes = [...new Set(nodeValueInputs(node).flatMap((value) => workflowProgramReferencedNodeIds(value)))]
        .sort()
        .map((referenceId) => validationHashes.get(referenceId) ?? contentHashes.get(referenceId) ?? referenceId);
      validationHashes.set(
        node.id,
        stableHash({
          policyHash,
          node,
          directDependencyHashes,
          referenceHashes,
          programNodeIds: input.program.nodes.map((candidate) => candidate.id),
        }),
      );
    }
  }
  return validationHashes;
}

function workflowProgramReferencedNodeIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(workflowProgramReferencedNodeIds);
  if (isProgramRef(value)) return [value.fromNode];
  return Object.values(value as Record<string, unknown>).flatMap(workflowProgramReferencedNodeIds);
}

function workflowProgramLiteralArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const literal = (value as { literal?: unknown }).literal;
  return Array.isArray(literal) ? literal : undefined;
}

function workflowProgramItemRefs(
  value: unknown,
  itemName: string,
  path: string,
): Array<{ path: string; refPath?: string }> {
  const refs: Array<{ path: string; refPath?: string }> = [];
  const visit = (candidate: unknown, candidatePath: string) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${candidatePath}/${index}`));
      return;
    }
    if (isProgramItemRef(candidate)) {
      if (candidate.fromItem === itemName) refs.push({ path: candidatePath, refPath: candidate.path });
      return;
    }
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) visit(item, `${candidatePath}/${key}`);
  };
  visit(value, path);
  return refs;
}

function workflowProgramLiteralItemHasPath(item: unknown, path: string): boolean {
  if (!path) return true;
  let current = item;
  for (const segment of path.split(".").filter(Boolean)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return false;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") return false;
    if (!(segment in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

function nodeValueInputs(node: WorkflowProgramNode): unknown[] {
  if (node.kind === "tool.call") return [node.args];
  if (node.kind === "tool.paginate") return [node.input, node.pageQueries];
  if (node.kind === "browser.intervention") return [node.args, node.source, node.skipIf, node.prompt, node.screenshot?.args];
  if (node.kind === "connector.call") return [node.input];
  if (node.kind === "connector.paginate") return [node.input];
  if (node.kind === "connector.map") return [node.items, node.input];
  if (node.kind === "collection.map") return [node.items, node.map];
  if (node.kind === "collection.filter") return [node.items];
  if (node.kind === "collection.dedupe") return [node.items];
  if (node.kind === "collection.chunk") return [node.items];
  if (node.kind === "document.render") return [node.input, node.title];
  if (node.kind === "model.call") return [node.input];
  if (node.kind === "model.map") return [node.items, node.input];
  if (node.kind === "model.reduce") return [node.items, node.input];
  if (node.kind === "mutation.stage") return [node.args, node.changeSet];
  if (node.kind === "review.input") return [node.prompt, node.data];
  if (node.kind === "approval.required") return [node.changeSet];
  if (node.kind === "branch.if") return [node.condition, node.then, node.else];
  if (node.kind === "loop.map") return [node.items, node.map];
  if (node.kind === "error.handle") return [node.try, node.fallback];
  if (node.kind === "checkpoint.write") return [node.value];
  if (node.kind === "transform.template") return [node.vars];
  if (node.kind === "output.final") return [node.value];
  return [];
}

function nodeValueInputEntries(node: WorkflowProgramNode, nodeIndex: number): Array<{ value: unknown; path: string }> {
  const nodePath = `/nodes/${nodeIndex}`;
  if (node.kind === "tool.call") return [{ value: node.args, path: `${nodePath}/args` }];
  if (node.kind === "tool.paginate") return [{ value: node.input, path: `${nodePath}/input` }, { value: node.pageQueries, path: `${nodePath}/pageQueries` }];
  if (node.kind === "browser.intervention") {
    return [
      { value: node.args, path: `${nodePath}/args` },
      { value: node.source, path: `${nodePath}/source` },
      { value: node.skipIf, path: `${nodePath}/skipIf` },
      { value: node.prompt, path: `${nodePath}/prompt` },
      { value: node.screenshot?.args, path: `${nodePath}/screenshot/args` },
    ];
  }
  if (node.kind === "connector.call" || node.kind === "connector.paginate") return [{ value: node.input, path: `${nodePath}/input` }];
  if (node.kind === "connector.map") return [{ value: node.items, path: `${nodePath}/items` }, { value: node.input, path: `${nodePath}/input` }];
  if (node.kind === "collection.map") return [{ value: node.items, path: `${nodePath}/items` }, { value: node.map, path: `${nodePath}/map` }];
  if (node.kind === "collection.filter") return [{ value: node.items, path: `${nodePath}/items` }];
  if (node.kind === "collection.dedupe" || node.kind === "collection.chunk") return [{ value: node.items, path: `${nodePath}/items` }];
  if (node.kind === "document.render") return [{ value: node.input, path: `${nodePath}/input` }, { value: node.title, path: `${nodePath}/title` }];
  if (node.kind === "model.call") return [{ value: node.input, path: `${nodePath}/input` }];
  if (node.kind === "model.map" || node.kind === "model.reduce") return [{ value: node.items, path: `${nodePath}/items` }, { value: node.input, path: `${nodePath}/input` }];
  if (node.kind === "mutation.stage") return [{ value: node.args, path: `${nodePath}/args` }, { value: node.changeSet, path: `${nodePath}/changeSet` }];
  if (node.kind === "review.input") return [{ value: node.prompt, path: `${nodePath}/prompt` }, { value: node.data, path: `${nodePath}/data` }];
  if (node.kind === "approval.required") return [{ value: node.changeSet, path: `${nodePath}/changeSet` }];
  if (node.kind === "branch.if") return [{ value: node.condition, path: `${nodePath}/condition` }, { value: node.then, path: `${nodePath}/then` }, { value: node.else, path: `${nodePath}/else` }];
  if (node.kind === "loop.map") return [{ value: node.items, path: `${nodePath}/items` }, { value: node.map, path: `${nodePath}/map` }];
  if (node.kind === "error.handle") return [{ value: node.try, path: `${nodePath}/try` }, { value: node.fallback, path: `${nodePath}/fallback` }];
  if (node.kind === "checkpoint.write") return [{ value: node.value, path: `${nodePath}/value` }];
  if (node.kind === "transform.template") return [{ value: node.vars, path: `${nodePath}/vars` }];
  if (node.kind === "output.final") return [{ value: node.value, path: `${nodePath}/value` }];
  return nodeValueInputs(node).map((value, index) => ({ value, path: `${nodePath}/${index}` }));
}

function validateJsonObject(
  candidate: unknown,
  schema: Record<string, unknown>,
  path: string,
  validate: (candidate: unknown, schema: unknown, path: string) => void,
  diagnostics: WorkflowProgramDiagnostic[],
  nodeId?: string,
): void {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
  const record = candidate as Record<string, unknown>;
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? (schema.properties as Record<string, unknown>) : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
  for (const key of required) {
    if (!(key in record)) diagnostics.push(errorDiagnostic("tool.args_schema_invalid", `Missing required property ${key}.`, `${path}/${key}`, nodeId));
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in properties)) diagnostics.push(errorDiagnostic("tool.args_schema_invalid", `Unexpected property ${key}.`, `${path}/${key}`, nodeId));
    }
  }
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (key in record) validate(record[key], propertySchema, `${path}/${key}`);
  }
}

function schemaExpectsPrimitive(schema: unknown): boolean {
  const types = jsonSchemaTypes(schema);
  return types.some((type) => type === "string" || type === "number" || type === "integer" || type === "boolean");
}

function jsonSchemaTypes(schema: unknown): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const type = (schema as Record<string, unknown>).type;
  if (Array.isArray(type)) return type.filter((item): item is string => typeof item === "string");
  return typeof type === "string" ? [type] : [];
}

function jsonSchemaTypeMatches(value: unknown, type: string): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "object") return Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (type === "array") return Array.isArray(value);
  if (type === "null") return value === null;
  return true;
}

function workflowProgramBudgetUsage(nodes: WorkflowProgramNode[]): { toolCalls: number; modelCalls: number; connectorCalls: number } {
  return workflowProgramBudgetUsageDetails(nodes).totals;
}

function workflowProgramModelReduceCallBudget(node: WorkflowProgramModelReduceNode): number {
  if (node.strategy !== "tree") return 1;
  const maxFanIn = normalizedModelReduceTreeFanIn(node);
  const maxLevels = normalizedModelReduceTreeLevels(node);
  let current = Math.max(0, Math.floor(node.maxInputItems));
  let calls = 0;
  let level = 0;
  while (current > maxFanIn && level < maxLevels) {
    const groups = Math.ceil(current / maxFanIn);
    calls += groups;
    current = groups;
    level += 1;
  }
  return calls + 1;
}

function normalizedModelReduceTreeFanIn(node: WorkflowProgramModelReduceNode): number {
  return Math.max(2, Math.min(64, Math.floor(node.maxFanIn ?? 8)));
}

function normalizedModelReduceTreeLevels(node: WorkflowProgramModelReduceNode): number {
  return Math.max(1, Math.min(12, Math.floor(node.maxLevels ?? 8)));
}

function workflowProgramToolNode(node: WorkflowProgramNode | undefined): WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode | undefined {
  return node?.kind === "tool.call" || node?.kind === "mutation.stage" ? node : undefined;
}

function isProgramRef(value: unknown): value is { fromNode: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromNode?: unknown }).fromNode === "string");
}

function isProgramItemRef(value: unknown): value is { fromItem: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromItem?: unknown }).fromItem === "string");
}

function cloneDiagnostics(diagnostics: WorkflowProgramDiagnostic[]): WorkflowProgramDiagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic }));
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

function errorDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "error", message, path, ...(nodeId ? { nodeId } : {}) };
}

function warningDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "warning", message, path, ...(nodeId ? { nodeId } : {}) };
}
