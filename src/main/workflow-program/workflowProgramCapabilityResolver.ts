import type { DesktopToolDescriptor } from "./workflowProgramDesktopToolFacade";
import { GOOGLE_WORKSPACE_METHOD_CATALOG, GOOGLE_WORKSPACE_METHOD_CATALOG_VERSION, normalizeMethodId } from "./workflowProgramGoogleWorkspaceFacade";
import type { WorkflowConnectorDescriptor, WorkflowConnectorOperationDescriptor } from "./workflowProgramWorkflowFacade";
import { isWorkflowProgramLoopMapToolCall } from "../../shared/workflowProgramIr";
import type {
  WorkflowProgramBrowserInterventionNode,
  WorkflowProgramConnectorCallNode,
  WorkflowProgramConnectorMapNode,
  WorkflowProgramConnectorPaginateNode,
  WorkflowProgramIR,
  WorkflowProgramLoopMapToolCall,
  WorkflowProgramModelReduceNode,
  WorkflowProgramMutationStageNode,
  WorkflowProgramNode,
  WorkflowProgramToolCallNode,
  WorkflowProgramToolPaginateNode,
} from "../../shared/workflowProgramIr";
import type { GoogleWorkspaceMethodSideEffect, GoogleWorkspaceMethodSummary } from "../../shared/pluginTypes";
import type { WorkflowAmbientCliCapabilityGrant, WorkflowGoogleWorkspaceMethodGrant, WorkflowManifest } from "../../shared/workflowTypes";

export interface WorkflowProgramDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  path: string;
  nodeId?: string;
  validatorId?: string;
  repairHint?: string;
}

export interface WorkflowProgramAmbientCliCapability extends WorkflowAmbientCliCapabilityGrant {
  availability?: "available" | "unavailable";
  missingEnv?: string[];
}

export interface ValidateWorkflowProgramNodeCapabilitiesInput {
  program: WorkflowProgramIR;
  node: WorkflowProgramNode;
  nodeIndex: number;
  toolsByName: Map<string, DesktopToolDescriptor>;
  connectorsById: Map<string, WorkflowConnectorDescriptor>;
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[];
  validateGoogleReadOnly: boolean;
}

export interface ResolveWorkflowProgramManifestInput {
  nodes: WorkflowProgramNode[];
  program: WorkflowProgramIR;
  toolDescriptors?: DesktopToolDescriptor[];
  connectorDescriptors: WorkflowConnectorDescriptor[];
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[];
}

const GOOGLE_WRITE_METHOD_PATTERN =
  /\.(create|insert|update|patch|delete|trash|untrash|copy|send|batchUpdate|modify|watch|stop|import|emptyTrash|set|clear|append|move)(?:$|\.)/i;
const GOOGLE_READ_METHOD_PATTERN =
  /\.(get|list|search|export|download|freebusy|query|watchlist|labels|permissions)(?:$|\.)/i;
const BROWSER_USER_ACTION_TOOLS = new Set(["browser_search", "browser_nav", "browser_content", "browser_login"]);

export function validateWorkflowProgramNodeCapabilities(input: ValidateWorkflowProgramNodeCapabilitiesInput): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (input.node.kind === "connector.call" || input.node.kind === "connector.map" || input.node.kind === "connector.paginate") {
    diagnostics.push(...validateConnectorCapabilityNode(input.node, input.nodeIndex, input.connectorsById, input.validateGoogleReadOnly));
    return diagnostics;
  }
  if (input.node.kind === "browser.intervention") {
    diagnostics.push(...validateBrowserInterventionCapabilityNode(input.node, input.nodeIndex, input.toolsByName));
    return diagnostics;
  }
  if (input.node.kind === "tool.paginate") {
    diagnostics.push(...validateToolPaginationCapabilityNode(input.node, input.nodeIndex, input.toolsByName));
    return diagnostics;
  }
  if (input.node.kind === "loop.map" && isWorkflowProgramLoopMapToolCall(input.node.map)) {
    const descriptor = input.toolsByName.get(input.node.map.tool);
    if (!descriptor) {
      diagnostics.push(
        errorDiagnostic("ir.unavailable_tool", `Node ${input.node.id} references unavailable loop.map tool ${input.node.map.tool}.`, `/nodes/${input.nodeIndex}/map/tool`, input.node.id),
      );
      return diagnostics;
    }
    if (descriptor.sideEffects === "write-workspace" || descriptor.sideEffects === "write-external" || descriptor.sideEffects === "control-browser") {
      diagnostics.push(
        errorDiagnostic(
          "ir.loop_map_tool_side_effect_unsupported",
          `loop.map tool fan-out may only call read-only, deterministic, or local run-process tools. Use explicit mutation.stage, connector.map, or review-gated browser nodes for ${input.node.map.tool}.`,
          `/nodes/${input.nodeIndex}/map/tool`,
          input.node.id,
        ),
      );
    }
    diagnostics.push(...validateNestedToolCapabilityPolicies(input.program, input.node.map, input.nodeIndex, input.ambientCliCapabilities, input.validateGoogleReadOnly, input.node.id));
    return diagnostics;
  }
  const toolNode = workflowProgramToolNode(input.node);
  if (!toolNode) return diagnostics;
  const descriptor = input.toolsByName.get(toolNode.tool);
  if (!descriptor) {
    diagnostics.push(errorDiagnostic("ir.unavailable_tool", `Node ${input.node.id} references unavailable tool ${toolNode.tool}.`, `/nodes/${input.nodeIndex}/tool`, input.node.id));
    return diagnostics;
  }
  if (input.node.kind === "tool.call" && descriptor.sideEffects === "write-workspace") {
    diagnostics.push(
      errorDiagnostic(
        "ir.mutation_stage_required",
        `Tool ${toolNode.tool} writes workspace state and must be represented as mutation.stage so Ambient can stage it for approval.`,
        `/nodes/${input.nodeIndex}/kind`,
        input.node.id,
      ),
    );
  }
  if (toolNode.tool === "ambient_cli") {
    diagnostics.push(...validateAmbientCliCapabilityNode(toolNode, input.nodeIndex, input.ambientCliCapabilities));
    diagnostics.push(...validateAmbientCliDescribePreflight(input.program, toolNode, input.nodeIndex, input.ambientCliCapabilities));
  }
  if (toolNode.tool === "ambient_cli_secret_request" || toolNode.tool === "ambient_cli_env_bind") {
    diagnostics.push(...validateAmbientCliSecretSetupNode(toolNode, input.nodeIndex, input.ambientCliCapabilities));
  }
  if (toolNode.tool === "ambient_cli_describe") {
    diagnostics.push(...validateAmbientCliDescribeDiscovery(input.program, toolNode, input.nodeIndex, input.ambientCliCapabilities));
  }
  if (input.validateGoogleReadOnly && toolNode.tool === "google_workspace_call") {
    diagnostics.push(...validateGoogleWorkspaceCallPolicy(input.program, toolNode, input.nodeIndex));
  }
  if (input.validateGoogleReadOnly && toolNode.tool === "google_workspace_search_methods") {
    diagnostics.push(...validateGoogleWorkspaceMethodSearchPolicy(toolNode, input.nodeIndex));
  }
  if (input.validateGoogleReadOnly && toolNode.tool === "google_workspace_materialize_file" && !dependsOnGoogleWorkspaceCall(input.program, input.node)) {
    diagnostics.push(
      errorDiagnostic(
        "google.materialize_requires_file_handle",
        "google_workspace_materialize_file must depend on a read-only google_workspace_call that produced the managed file handle.",
        `/nodes/${input.nodeIndex}/dependsOn`,
        input.node.id,
      ),
    );
  }
  if (toolNode.tool.startsWith("browser_")) {
    diagnostics.push(...validateBrowserInterventionPolicy(input.program, toolNode, input.nodeIndex));
  }
  return diagnostics;
}

export function resolveWorkflowProgramManifest(input: ResolveWorkflowProgramManifestInput): WorkflowManifest {
  const tools = new Set<string>();
  const connectorGrants = new Map<string, NonNullable<WorkflowManifest["connectors"]>[number]>();
  const connectorsById = new Map(input.connectorDescriptors.map((connector) => [connector.id, connector]));
  const toolsByName = new Map((input.toolDescriptors ?? []).map((tool) => [tool.name, tool]));
  const ambientCliCapabilityGrants = new Map<string, WorkflowAmbientCliCapabilityGrant>();
  const googleWorkspaceMethodGrants = new Map<string, WorkflowGoogleWorkspaceMethodGrant>();
  const budgetUsage = workflowProgramBudgetUsage(input.nodes);
  const inferredMaxRunMs = workflowProgramInferredMaxRunMs(input.nodes, connectorsById, toolsByName);
  let mutationPolicy: WorkflowManifest["mutationPolicy"] = "read_only";
  for (const node of input.nodes) {
    if (node.kind === "tool.call") tools.add(node.tool);
    if (node.kind === "tool.paginate") tools.add(node.tool);
    if (node.kind === "loop.map" && isWorkflowProgramLoopMapToolCall(node.map)) tools.add(node.map.tool);
    if (node.kind === "browser.intervention") {
      tools.add(node.tool);
      if (node.screenshot && node.screenshot.enabled !== false) tools.add("browser_screenshot");
    }
    if (node.kind === "mutation.stage") {
      tools.add(node.tool);
      mutationPolicy = "staged_until_approved";
    }
    if (node.kind === "connector.call" || node.kind === "connector.map" || node.kind === "connector.paginate") {
      const descriptor = connectorsById.get(node.connectorId);
      const operation = descriptor ? connectorOperationDescriptor(descriptor, node.operation) : undefined;
      if (descriptor && operation) {
        const grantKey = `${node.connectorId}:${node.accountId ?? ""}`;
        const existing = connectorGrants.get(grantKey);
        const grant = {
          connectorId: node.connectorId,
          ...(node.accountId ? { accountId: node.accountId } : {}),
          scopes: operation.requiredScopes,
          operations: [node.operation],
          dataRetention: descriptor.defaultDataRetention,
        };
        connectorGrants.set(grantKey, existing ? mergeConnectorGrant(existing, grant) : grant);
        if (operation.sideEffects === "write_external") {
          mutationPolicy = operation.mutationPolicy === "apply_after_approval" ? "apply_after_approval" : "staged_until_approved";
        }
      }
    }
    if (node.kind === "model.call" || node.kind === "model.map" || node.kind === "model.reduce") tools.add("ambient.responses");
    const toolNodes = workflowProgramToolNodes(node);
    for (const toolNode of toolNodes) {
      if (toolNode.tool !== "google_workspace_call") continue;
      const grant = googleWorkspaceMethodGrantFromToolCall(input.program, toolNode);
      if (grant) {
        const grantKey = googleWorkspaceMethodGrantKey(grant);
        const existing = googleWorkspaceMethodGrants.get(grantKey);
        googleWorkspaceMethodGrants.set(grantKey, existing ? mergeGoogleWorkspaceMethodGrant(existing, grant) : grant);
      }
    }
    for (const toolNode of toolNodes) {
      if (toolNode.tool === "ambient_cli") {
        const capability = matchingAmbientCliCapability(toolNode.args, input.ambientCliCapabilities);
        if (capability) ambientCliCapabilityGrants.set(capability.capabilityId, ambientCliGrantFromCapability(capability));
      }
    }
  }
  return {
    tools: [...tools],
    ...(ambientCliCapabilityGrants.size ? { ambientCliCapabilities: [...ambientCliCapabilityGrants.values()] } : {}),
    ...(googleWorkspaceMethodGrants.size ? { googleWorkspaceMethods: [...googleWorkspaceMethodGrants.values()] } : {}),
    ...(connectorGrants.size ? { connectors: [...connectorGrants.values()] } : {}),
    mutationPolicy,
    ...(input.program.budgets?.maxToolCalls !== undefined ? { maxToolCalls: input.program.budgets.maxToolCalls } : budgetUsage.toolCalls > 0 ? { maxToolCalls: budgetUsage.toolCalls } : {}),
    ...(input.program.budgets?.maxModelCalls !== undefined ? { maxModelCalls: input.program.budgets.maxModelCalls } : budgetUsage.modelCalls > 0 ? { maxModelCalls: budgetUsage.modelCalls } : {}),
    ...(input.program.budgets?.maxConnectorCalls !== undefined
      ? { maxConnectorCalls: input.program.budgets.maxConnectorCalls }
      : budgetUsage.connectorCalls > 0
        ? { maxConnectorCalls: budgetUsage.connectorCalls }
        : {}),
    ...(input.program.budgets?.maxRunMs !== undefined || inferredMaxRunMs > 0
      ? { maxRunMs: Math.max(input.program.budgets?.maxRunMs ?? 0, inferredMaxRunMs) }
      : {}),
  };
}

function validateNestedToolCapabilityPolicies(
  program: WorkflowProgramIR,
  node: WorkflowProgramLoopMapToolCall,
  nodeIndex: number,
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[],
  validateGoogleReadOnly: boolean,
  nodeId: string,
): WorkflowProgramDiagnostic[] {
  const toolNode: WorkflowProgramToolCallNode = {
    id: nodeId,
    kind: "tool.call",
    tool: node.tool,
    args: node.args,
  };
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (toolNode.tool === "ambient_cli") {
    diagnostics.push(...validateAmbientCliCapabilityNode(toolNode, nodeIndex, ambientCliCapabilities));
    diagnostics.push(...validateAmbientCliDescribePreflight(program, toolNode, nodeIndex, ambientCliCapabilities));
  }
  if (toolNode.tool === "ambient_cli_secret_request" || toolNode.tool === "ambient_cli_env_bind") {
    diagnostics.push(...validateAmbientCliSecretSetupNode(toolNode, nodeIndex, ambientCliCapabilities));
  }
  if (toolNode.tool === "ambient_cli_describe") {
    diagnostics.push(...validateAmbientCliDescribeDiscovery(program, toolNode, nodeIndex, ambientCliCapabilities));
  }
  if (validateGoogleReadOnly && toolNode.tool === "google_workspace_call") {
    diagnostics.push(...validateGoogleWorkspaceCallPolicy(program, toolNode, nodeIndex));
  }
  if (validateGoogleReadOnly && toolNode.tool === "google_workspace_search_methods") {
    diagnostics.push(...validateGoogleWorkspaceMethodSearchPolicy(toolNode, nodeIndex));
  }
  if (toolNode.tool.startsWith("browser_")) {
    diagnostics.push(...validateBrowserInterventionPolicy(program, toolNode, nodeIndex));
  }
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    path: diagnostic.path.replace(`/nodes/${nodeIndex}/args`, `/nodes/${nodeIndex}/map/args`).replace(`/nodes/${nodeIndex}/tool`, `/nodes/${nodeIndex}/map/tool`),
  }));
}

export function connectorOperationDescriptor(
  descriptor: WorkflowConnectorDescriptor,
  operationName: string,
): WorkflowConnectorOperationDescriptor | undefined {
  return descriptor.operations.find((operation) => operation.name === operationName);
}

function validateBrowserInterventionCapabilityNode(
  node: WorkflowProgramBrowserInterventionNode,
  nodeIndex: number,
  toolsByName: Map<string, DesktopToolDescriptor>,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (!toolsByName.has(node.tool)) {
    diagnostics.push(errorDiagnostic("ir.unavailable_tool", `browser.intervention references unavailable browser tool ${node.tool}.`, `/nodes/${nodeIndex}/tool`, node.id));
    return diagnostics;
  }
  if (!BROWSER_USER_ACTION_TOOLS.has(node.tool)) {
    diagnostics.push(
      errorDiagnostic(
        "browser.intervention_tool_unsupported",
        "browser.intervention may only wrap browser_search, browser_nav, browser_content, or browser_login because those tools can return browser user-action state.",
        `/nodes/${nodeIndex}/tool`,
        node.id,
      ),
    );
  }
  if (node.tool === "browser_login" && (node.retry?.maxAttempts ?? 0) > 0) {
    diagnostics.push(
      errorDiagnostic(
        "browser.login_intervention_retry_unsupported",
        "browser.intervention with browser_login must use retry.maxAttempts:0 because the user-completed MFA/passkey step should be verified by a downstream browser_content or browser_nav node, not by refilling credentials.",
        `/nodes/${nodeIndex}/retry/maxAttempts`,
        node.id,
      ),
    );
  }
  if (node.screenshot?.enabled !== false && node.screenshot && !toolsByName.has("browser_screenshot")) {
    diagnostics.push(errorDiagnostic("ir.unavailable_tool", "browser.intervention screenshot capture requires browser_screenshot.", `/nodes/${nodeIndex}/screenshot`, node.id));
  }
  return diagnostics;
}

function validateGoogleWorkspaceCallPolicy(
  program: WorkflowProgramIR,
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const methodId = literalStringProperty(node.args, "methodId");
  if (!methodId) {
    return [
      errorDiagnostic(
        "google.method_id_required",
        "google_workspace_call nodes must use a literal methodId for policy validation.",
        `/nodes/${nodeIndex}/args/methodId`,
        node.id,
      ),
    ];
  }
  const methodMetadata = googleWorkspaceCatalogMethod(methodId);
  if (!methodMetadata) {
    diagnostics.push(
      errorDiagnostic(
        "google.method_metadata_required",
        `Google method ${methodId} must be present in the local Google Workspace method catalog so the compiler can infer exact read grants.`,
        `/nodes/${nodeIndex}/args/methodId`,
        node.id,
      ),
    );
  }
  if (!isReadOnlyGoogleMethod(methodId) || (methodMetadata && !isGoogleWorkspaceReadSideEffect(methodMetadata.sideEffect))) {
    diagnostics.push(
      errorDiagnostic(
        "google.write_method_rejected",
        `Google method ${methodId} is not allowed in read-only workflow compiler tests.`,
        `/nodes/${nodeIndex}/args/methodId`,
        node.id,
      ),
    );
  }
  if (googleWorkspaceMethodRequiresAccountHint(methodId) && !hasGoogleAccountHintProvenance(program, node)) {
    diagnostics.push(
      errorDiagnostic(
        "google.account_hint_required",
        `Google method ${methodId} must include accountHint as an explicit account handle or a reference derived from google_workspace_status.`,
        `/nodes/${nodeIndex}/args/accountHint`,
        node.id,
      ),
    );
  }
  if (isReadOnlyGoogleMethod(methodId) && hasReadOnlyGoogleWritePayload(node.args, methodId)) {
    diagnostics.push(
      errorDiagnostic(
        "google.read_only_payload_rejected",
        `Read-only Google method ${methodId} must not include write payload fields such as body, upload, or gmailDraft.`,
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    );
  }
  if (calendarMethodRequiresTimeRange(methodId) && !hasCalendarTimeRangeAndTimezone(node.args)) {
    diagnostics.push(
      errorDiagnostic(
        "google.calendar_time_range_required",
        `Calendar method ${methodId} must include explicit timeMin, timeMax, and timeZone fields in params or body.`,
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    );
  }
  return diagnostics;
}

function validateGoogleWorkspaceMethodSearchPolicy(
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const sideEffect = literalStringProperty(node.args, "sideEffect");
  if (sideEffect && !["metadata_read", "personal_content_read", "unknown"].includes(sideEffect)) {
    diagnostics.push(
      errorDiagnostic(
        "google.search_methods_read_only_required",
        `google_workspace_search_methods sideEffect ${sideEffect} is not allowed in the read-only workflow compiler path.`,
        `/nodes/${nodeIndex}/args/sideEffect`,
        node.id,
      ),
    );
  }
  const httpMethod = literalStringProperty(node.args, "httpMethod")?.toUpperCase();
  if (httpMethod && !["GET", "HEAD", "POST"].includes(httpMethod)) {
    diagnostics.push(
      errorDiagnostic(
        "google.search_methods_read_only_required",
        `google_workspace_search_methods httpMethod ${httpMethod} is not allowed in the read-only workflow compiler path.`,
        `/nodes/${nodeIndex}/args/httpMethod`,
        node.id,
      ),
    );
  }
  return diagnostics;
}

function validateToolPaginationCapabilityNode(
  node: WorkflowProgramToolPaginateNode,
  nodeIndex: number,
  toolsByName: Map<string, DesktopToolDescriptor>,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const descriptor = toolsByName.get(node.tool);
  if (!descriptor) {
    diagnostics.push(errorDiagnostic("ir.unavailable_tool", `Node ${node.id} references unavailable tool ${node.tool}.`, `/nodes/${nodeIndex}/tool`, node.id));
    return diagnostics;
  }
  if (descriptor.sideEffects === "write-workspace" || descriptor.sideEffects === "write-external" || descriptor.sideEffects === "control-browser") {
    diagnostics.push(
      errorDiagnostic(
        "tool.pagination_side_effect_unsupported",
        `tool.paginate may only call read-only tools with bounded page contracts. ${node.tool} has side effect class ${descriptor.sideEffects}.`,
        `/nodes/${nodeIndex}/tool`,
        node.id,
      ),
    );
  }
  const pagination = descriptor.pagination;
  if (!pagination) {
    diagnostics.push(
      errorDiagnostic("tool.pagination_unsupported", `Tool ${node.tool} does not declare pagination metadata.`, `/nodes/${nodeIndex}/tool`, node.id),
    );
    return diagnostics;
  }
  const pageSize = node.pageSize ?? pagination.defaultPageSize;
  if (pageSize > pagination.maxPageSize) {
    diagnostics.push(
      errorDiagnostic(
        "tool.pagination_page_size_too_large",
        `tool.paginate pageSize ${pageSize} exceeds ${node.tool} max page size ${pagination.maxPageSize}.`,
        `/nodes/${nodeIndex}/pageSize`,
        node.id,
      ),
    );
  }
  if (node.itemsPath === undefined && pagination.itemsPath === undefined) {
    diagnostics.push(
      errorDiagnostic("tool.pagination_items_path_required", `tool.paginate requires itemsPath because ${node.tool} does not define one.`, `/nodes/${nodeIndex}/itemsPath`, node.id),
    );
  }
  const pageQueries = Array.isArray(node.pageQueries) ? node.pageQueries.filter((query) => typeof query === "string" && query.trim()) : [];
  const hasTokenContract = Boolean(node.nextPageTokenPath ?? pagination.nextPageTokenPath) && Boolean(node.pageTokenInputPath ?? pagination.pageTokenInputPath);
  if (node.maxPages > 1 && !hasTokenContract && pageQueries.length === 0) {
    diagnostics.push(
      errorDiagnostic(
        "tool.pagination_page_queries_required",
        `tool.paginate for ${node.tool} needs pageQueries for multi-page collection because the tool does not expose a next-page token contract.`,
        `/nodes/${nodeIndex}/pageQueries`,
        node.id,
      ),
    );
  }
  if (pageQueries.length > 0 && pageQueries.length < node.maxPages) {
    diagnostics.push(
      errorDiagnostic(
        "tool.pagination_page_queries_too_few",
        `tool.paginate declares maxPages ${node.maxPages} but only ${pageQueries.length} pageQueries.`,
        `/nodes/${nodeIndex}/pageQueries`,
        node.id,
      ),
    );
  }
  return diagnostics;
}

function validateConnectorCapabilityNode(
  node: WorkflowProgramConnectorCallNode | WorkflowProgramConnectorMapNode | WorkflowProgramConnectorPaginateNode,
  nodeIndex: number,
  connectorsById: Map<string, WorkflowConnectorDescriptor>,
  validateGoogleReadOnly: boolean,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const descriptor = connectorsById.get(node.connectorId);
  if (!descriptor) {
    diagnostics.push(errorDiagnostic("connector.unavailable", `Node ${node.id} references unavailable connector ${node.connectorId}.`, `/nodes/${nodeIndex}/connectorId`, node.id));
    return diagnostics;
  }
  if (descriptor.auth.status !== "available") {
    diagnostics.push(
      errorDiagnostic(
        "connector.unavailable",
        `Connector ${node.connectorId} is not available for workflow compilation (${descriptor.auth.status}).`,
        `/nodes/${nodeIndex}/connectorId`,
        node.id,
      ),
    );
  }
  const operation = connectorOperationDescriptor(descriptor, node.operation);
  if (!operation) {
    diagnostics.push(errorDiagnostic("connector.operation_unavailable", `Connector ${node.connectorId} has no operation ${node.operation}.`, `/nodes/${nodeIndex}/operation`, node.id));
    return diagnostics;
  }
  if (node.accountId && !descriptor.accounts.some((account) => account.id === node.accountId)) {
    diagnostics.push(
      errorDiagnostic("connector.account_unavailable", `Connector ${node.connectorId} has no account ${node.accountId}.`, `/nodes/${nodeIndex}/accountId`, node.id),
    );
  }
  if (operation.idempotencyKey === "required" && !node.idempotencyKey?.trim()) {
    diagnostics.push(
      errorDiagnostic(
        "connector.idempotency_key_required",
        `Connector operation ${node.connectorId}.${node.operation} requires an idempotencyKey.`,
        `/nodes/${nodeIndex}/idempotencyKey`,
        node.id,
      ),
    );
  }
  if (validateGoogleReadOnly && isGoogleConnectorId(node.connectorId) && operation.sideEffects === "write_external") {
    diagnostics.push(
      errorDiagnostic(
        "connector.read_only_write_operation_rejected",
        `Google connector operation ${node.connectorId}.${node.operation} writes external state and is not allowed in the read-only workflow compiler path.`,
        `/nodes/${nodeIndex}/operation`,
        node.id,
      ),
    );
  }
  if (node.kind === "connector.paginate") {
    const pagination = operation.pagination;
    if (!pagination) {
      diagnostics.push(
        errorDiagnostic(
          "connector.pagination_unsupported",
          `Connector operation ${node.connectorId}.${node.operation} does not declare pagination metadata.`,
          `/nodes/${nodeIndex}/operation`,
          node.id,
        ),
      );
    } else {
      const pageSize = node.pageSize ?? pagination.defaultPageSize;
      if (pageSize > pagination.maxPageSize) {
        diagnostics.push(
          errorDiagnostic(
            "connector.pagination_page_size_too_large",
            `connector.paginate pageSize ${pageSize} exceeds ${node.connectorId}.${node.operation} max page size ${pagination.maxPageSize}.`,
            `/nodes/${nodeIndex}/pageSize`,
            node.id,
          ),
        );
      }
      if (!node.itemsPath && !pagination.itemsPath) {
        diagnostics.push(
          errorDiagnostic(
            "connector.pagination_items_path_required",
            `connector.paginate requires itemsPath because ${node.connectorId}.${node.operation} does not define one.`,
            `/nodes/${nodeIndex}/itemsPath`,
            node.id,
          ),
        );
      }
      if (!node.nextPageTokenPath && !pagination.nextPageTokenPath) {
        diagnostics.push(
          errorDiagnostic(
            "connector.pagination_next_token_path_required",
            `connector.paginate requires nextPageTokenPath because ${node.connectorId}.${node.operation} does not define one.`,
            `/nodes/${nodeIndex}/nextPageTokenPath`,
            node.id,
          ),
        );
      }
      if (!node.pageTokenInputPath && !pagination.pageTokenInputPath && !pagination.cursorField) {
        diagnostics.push(
          errorDiagnostic(
            "connector.pagination_token_input_path_required",
            `connector.paginate requires pageTokenInputPath because ${node.connectorId}.${node.operation} does not define one.`,
            `/nodes/${nodeIndex}/pageTokenInputPath`,
            node.id,
          ),
        );
      }
    }
  }
  return diagnostics;
}

function isGoogleConnectorId(connectorId: string): boolean {
  return connectorId.startsWith("google.");
}

function validateAmbientCliCapabilityNode(
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (!node.args || typeof node.args !== "object" || Array.isArray(node.args) || isProgramRef(node.args)) {
    return [
      errorDiagnostic(
        "ambient_cli.literal_identity_required",
        "ambient_cli nodes must use literal object args with packageName or packageId plus command so the compiler can bind an approved capability grant.",
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    ];
  }
  diagnostics.push(...validateAmbientCliSecretValuePolicy(node, nodeIndex));

  const command = literalStringProperty(node.args, "command");
  const packageId = literalStringProperty(node.args, "packageId");
  const packageName = literalStringProperty(node.args, "packageName");
  if (!command) {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.literal_command_required",
        "ambient_cli nodes must use a literal args.command that matches a selected Ambient CLI capability.",
        `/nodes/${nodeIndex}/args/command`,
        node.id,
      ),
    );
  }
  if (!packageId && !packageName) {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.literal_identity_required",
        "ambient_cli nodes must use a literal args.packageName or args.packageId that matches a selected Ambient CLI capability.",
        `/nodes/${nodeIndex}/args/packageName`,
        node.id,
      ),
    );
  }
  if (diagnostics.length > 0) return diagnostics;

  const capability = matchingAmbientCliCapability(node.args, ambientCliCapabilities);
  if (!capability) {
    const selected = ambientCliCapabilities.map((item) => `${item.packageName}:${item.command}`).join(", ");
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.capability_required",
        `ambient_cli node ${node.id} must match a selected Ambient CLI capability grant before codegen.${selected ? ` Selected capabilities: ${selected}.` : " No Ambient CLI capabilities were selected."}`,
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    );
    return diagnostics;
  }
  if (capability.availability === "unavailable") {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.capability_unavailable",
        `Ambient CLI capability ${capability.packageName}:${capability.command} is unavailable and cannot be compiled into an executable workflow.`,
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    );
  }
  if (capability.missingEnv?.length) {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.capability_missing_env",
        `Ambient CLI capability ${capability.packageName}:${capability.command} is missing required environment bindings: ${capability.missingEnv.join(", ")}. Compile a setup workflow with ambient_cli_secret_request or ambient_cli_env_bind, then recompile once Desktop reports the env as configured.`,
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    );
  }
  return diagnostics;
}

function validateAmbientCliSecretSetupNode(
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (!node.args || typeof node.args !== "object" || Array.isArray(node.args) || isProgramRef(node.args)) {
    return [
      errorDiagnostic(
        "ambient_cli.secret_literal_args_required",
        `${node.tool} nodes must use literal object args with packageName or packageId plus envName so Desktop can validate the declared secret requirement without exposing a value.`,
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    ];
  }
  diagnostics.push(...validateAmbientCliSecretValuePolicy(node, nodeIndex));

  const packageId = literalStringProperty(node.args, "packageId");
  const packageName = literalStringProperty(node.args, "packageName");
  const envName = literalStringProperty(node.args, "envName");
  if (!packageId && !packageName) {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.secret_package_required",
        `${node.tool} nodes must identify the installed package with literal args.packageName or args.packageId.`,
        `/nodes/${nodeIndex}/args/packageName`,
        node.id,
      ),
    );
  }
  if (!envName) {
    diagnostics.push(
      errorDiagnostic("ambient_cli.secret_env_required", `${node.tool} nodes must use a literal args.envName.`, `/nodes/${nodeIndex}/args/envName`, node.id),
    );
  } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.secret_env_invalid",
        `${node.tool} args.envName must be an environment-variable name, not a secret value or free-form text.`,
        `/nodes/${nodeIndex}/args/envName`,
        node.id,
      ),
    );
  }
  if (diagnostics.length > 0) return diagnostics;

  const packageCapabilities = matchingAmbientCliPackageCapabilities(node.args, ambientCliCapabilities);
  if (packageCapabilities.length === 0) {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.secret_package_unselected",
        `${node.tool} must target an installed Ambient CLI package selected in compiler capability metadata.`,
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    );
    return diagnostics;
  }
  const declaredMissingEnv = new Set(packageCapabilities.flatMap((capability) => capability.missingEnv ?? []));
  if (!declaredMissingEnv.has(envName!)) {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.secret_env_not_declared",
        `${node.tool} args.envName must match a missing declared env requirement for ${packageName ?? packageId}. Declared missing env: ${[...declaredMissingEnv].join(", ") || "none"}.`,
        `/nodes/${nodeIndex}/args/envName`,
        node.id,
      ),
    );
  }

  if (node.tool === "ambient_cli_secret_request" && node.kind !== "tool.call") {
    diagnostics.push(
      errorDiagnostic(
        "ambient_cli.secret_request_tool_call_required",
        "ambient_cli_secret_request must be a tool.call because Desktop owns the secret-entry dialog and no workspace mutation is applied by the workflow.",
        `/nodes/${nodeIndex}/kind`,
        node.id,
      ),
    );
  }
  if (node.tool === "ambient_cli_env_bind") {
    if (node.kind !== "mutation.stage") {
      diagnostics.push(
        errorDiagnostic(
          "ambient_cli.env_bind_mutation_stage_required",
          "ambient_cli_env_bind must be represented as mutation.stage so the workspace-local secret-file binding is approval-bound.",
          `/nodes/${nodeIndex}/kind`,
          node.id,
        ),
      );
    }
    const filePath = literalStringProperty(node.args, "filePath");
    if (!filePath) {
      diagnostics.push(
        errorDiagnostic(
          "ambient_cli.env_bind_file_path_required",
          "ambient_cli_env_bind must use a literal workspace-relative args.filePath; never pass a secret value or file contents.",
          `/nodes/${nodeIndex}/args/filePath`,
          node.id,
        ),
      );
    } else if (!isSafeAmbientCliEnvBindPath(filePath)) {
      diagnostics.push(
        errorDiagnostic(
          "ambient_cli.env_bind_file_path_invalid",
          "ambient_cli_env_bind args.filePath must be a workspace-relative user secret file path, not an absolute path, traversal, home shortcut, or Ambient internal state path.",
          `/nodes/${nodeIndex}/args/filePath`,
          node.id,
        ),
      );
    }
  }
  return diagnostics;
}

function validateAmbientCliSecretValuePolicy(
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const scan = (value: unknown, path: string) => {
    if (value === undefined || value === null) return;
    if (isProgramRef(value)) return;
    if (isProgramLiteral(value)) {
      scan(value.literal, `${path}/literal`);
      return;
    }
    if (typeof value === "string") {
      if (ambientCliSecretMetadataPath(path)) return;
      if (isAmbientCliSecretFlag(value) || looksLikeSecretLiteral(value)) {
        diagnostics.push(
          errorDiagnostic(
            "ambient_cli.secret_value_rejected",
            "Ambient CLI workflow IR must not contain secret values or secret-bearing CLI flags. Use ambient_cli_secret_request or ambient_cli_env_bind so Desktop injects declared env requirements at runtime.",
            path,
            node.id,
          ),
        );
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${path}/${index}`));
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      scan(item, `${path}/${escapeJsonPointerSegment(key)}`);
    }
  };
  scan(node.args, `/nodes/${nodeIndex}/args`);
  return diagnostics;
}

function ambientCliSecretMetadataPath(path: string): boolean {
  return /\/(?:packageId|packageName|command|envName|filePath|cwd|query|kind|limit|includeUnavailable|includeSkill|includeSummary|maxSkillChars)$/.test(path);
}

function isAmbientCliSecretFlag(value: string): boolean {
  return /^--?(?:api[-_]?key|access[-_]?token|token|secret|password|credential)(?:=.*)?$/i.test(value.trim());
}

function looksLikeSecretLiteral(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return [
    /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bgsk_[A-Za-z0-9_-]{20,}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bAIza[0-9A-Za-z_-]{20,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    /\b(?:api[_-]?key|token|secret|password|credential)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i,
  ].some((pattern) => pattern.test(trimmed));
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function validateAmbientCliDescribePreflight(
  program: WorkflowProgramIR,
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowProgramDiagnostic[] {
  const command = literalStringProperty(node.args, "command");
  const packageId = literalStringProperty(node.args, "packageId");
  const packageName = literalStringProperty(node.args, "packageName");
  if (!command || (!packageId && !packageName)) return [];
  const capability = matchingAmbientCliCapability(node.args, ambientCliCapabilities);
  const describeNode = program.nodes.find((candidate) => {
    const toolNode = workflowProgramToolNode(candidate);
    if (toolNode?.tool !== "ambient_cli_describe") return false;
    const describeCommand = literalStringProperty(toolNode.args, "command");
    const describePackageId = literalStringProperty(toolNode.args, "packageId");
    const describePackageName = literalStringProperty(toolNode.args, "packageName");
    const samePackage =
      (packageId && describePackageId === packageId) ||
      (packageName && describePackageName === packageName) ||
      (capability?.packageId && describePackageId === capability.packageId) ||
      (capability?.packageName && describePackageName === capability.packageName);
    return Boolean(samePackage && (!describeCommand || describeCommand === command));
  });
  if (describeNode && dependsTransitivelyOn(program, node, describeNode.id)) return [];
  return [
    errorDiagnostic(
      "ambient_cli.describe_required",
      `ambient_cli node ${node.id} must depend on ambient_cli_describe for ${packageName ?? packageId}:${command} before first execution.`,
      `/nodes/${nodeIndex}/dependsOn`,
      node.id,
    ),
  ];
}

function validateAmbientCliDescribeDiscovery(
  program: WorkflowProgramIR,
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowProgramDiagnostic[] {
  if (!node.args || typeof node.args !== "object" || Array.isArray(node.args) || isProgramRef(node.args)) {
    return [
      errorDiagnostic(
        "ambient_cli.describe_literal_identity_required",
        "ambient_cli_describe nodes must use literal object args with packageName or packageId so the compiler can verify discovery provenance.",
        `/nodes/${nodeIndex}/args`,
        node.id,
      ),
    ];
  }
  const packageId = literalStringProperty(node.args, "packageId");
  const packageName = literalStringProperty(node.args, "packageName");
  const command = literalStringProperty(node.args, "command");
  if (!packageId && !packageName) {
    return [
      errorDiagnostic(
        "ambient_cli.describe_literal_identity_required",
        "ambient_cli_describe nodes must use a literal args.packageName or args.packageId selected from prior Ambient CLI discovery.",
        `/nodes/${nodeIndex}/args/packageName`,
        node.id,
      ),
    ];
  }
  if (matchingAmbientCliDescribeCapability(node.args, ambientCliCapabilities)) return [];
  const searchNode = program.nodes.find((candidate) => {
    const toolNode = workflowProgramToolNode(candidate);
    return toolNode?.tool === "ambient_cli_search" && dependsTransitivelyOn(program, node, candidate.id) && ambientCliSearchCanGroundDescribe(toolNode.args, { packageName, command });
  });
  if (searchNode) return [];
  return [
    errorDiagnostic(
      "ambient_cli.search_required",
      `ambient_cli_describe node ${node.id} must depend on ambient_cli_search unless ${packageName ?? packageId}${command ? `:${command}` : ""} is already present in selected compiler capability metadata.`,
      `/nodes/${nodeIndex}/dependsOn`,
      node.id,
    ),
  ];
}

function validateBrowserInterventionPolicy(
  program: WorkflowProgramIR,
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
  nodeIndex: number,
): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (BROWSER_USER_ACTION_TOOLS.has(node.tool) && literalBooleanProperty(node.args, "waitForUserAction") === false && !hasDirectReviewInputForNode(program, node.id)) {
    diagnostics.push(
      errorDiagnostic(
        "browser.intervention_review_required",
        `${node.tool} with waitForUserAction:false must feed a review.input node with bounded browserIntervention data before the workflow continues.`,
        `/nodes/${nodeIndex}/args/waitForUserAction`,
        node.id,
      ),
    );
  }
  if (node.tool === "browser_login" && !hasDirectReviewInputForNode(program, node.id)) {
    diagnostics.push(
      errorDiagnostic(
        "browser.login_review_required",
        "browser_login must feed a review.input node so MFA, CAPTCHA, passkey, or device-confirmation state is handled by the user instead of an automatic retry loop.",
        `/nodes/${nodeIndex}/tool`,
        node.id,
      ),
    );
  }
  if (objectHasProperty(node.args, "userActionId") && !dependsOnReviewInput(program, node)) {
    diagnostics.push(
      errorDiagnostic(
        "browser.user_action_resume_requires_review",
        `${node.tool} userActionId resumes must depend on a prior review.input confirming the user completed the browser intervention.`,
        `/nodes/${nodeIndex}/args/userActionId`,
        node.id,
      ),
    );
  }
  return diagnostics;
}

function ambientCliGrantFromCapability(capability: WorkflowProgramAmbientCliCapability): WorkflowAmbientCliCapabilityGrant {
  return {
    capabilityId: capability.capabilityId,
    registryPluginId: capability.registryPluginId,
    packageId: capability.packageId,
    packageName: capability.packageName,
    command: capability.command,
  };
}

function googleWorkspaceMethodGrantFromToolCall(
  program: WorkflowProgramIR,
  node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode,
): WorkflowGoogleWorkspaceMethodGrant | undefined {
  const rawMethodId = literalStringProperty(node.args, "methodId");
  if (!rawMethodId) return undefined;
  const method = googleWorkspaceMethodSummaryForCompiler(rawMethodId);
  const accountHint = literalStringProperty(node.args, "accountHint")?.trim();
  const grant: WorkflowGoogleWorkspaceMethodGrant = {
    methodId: method.id,
    ...(accountHint ? { accountHint } : {}),
    accountProvenance: accountHint ? "literal" : hasGoogleAccountHintProvenance(program, node) ? "google_workspace_status" : "unspecified",
    service: method.service,
    resource: method.resource,
    method: method.method,
    httpMethod: method.httpMethod,
    ...(method.path ? { path: method.path } : {}),
    scopes: googleWorkspaceLeastPrivilegeReadScopes(method),
    sideEffect: method.sideEffect,
    dataRetention: googleWorkspaceDataRetention(method.sideEffect),
    dryRunSupported: method.dryRunSupported,
    catalogVersion: GOOGLE_WORKSPACE_METHOD_CATALOG_VERSION,
    ...(calendarMethodRequiresTimeRange(method.id) ? { requiresTimeRange: true } : {}),
    ...(googleWorkspaceCallCanMaterializeFile(method.id, node.args) ? { materializesFile: true } : {}),
  };
  return grant;
}

function googleWorkspaceMethodSummaryForCompiler(methodId: string): GoogleWorkspaceMethodSummary {
  const normalized = normalizeMethodId(methodId);
  const cataloged = googleWorkspaceCatalogMethod(normalized);
  if (cataloged) return cataloged;
  const parts = normalized.split(".");
  const service = parts[0]!;
  return {
    id: normalized,
    service,
    resource: parts.slice(1, -1).join("."),
    method: parts.at(-1)!,
    label: normalized,
    description: `Google Workspace API method ${normalized}.`,
    httpMethod: "GET",
    scopes: [],
    sideEffect: "personal_content_read",
    dryRunSupported: false,
  };
}

function googleWorkspaceCatalogMethod(methodId: string): GoogleWorkspaceMethodSummary | undefined {
  try {
    const normalized = normalizeMethodId(methodId);
    return GOOGLE_WORKSPACE_METHOD_CATALOG.find((method) => method.id === normalized);
  } catch {
    return undefined;
  }
}

function isReadOnlyGoogleMethod(methodId: string): boolean {
  if (GOOGLE_WRITE_METHOD_PATTERN.test(methodId)) return false;
  return GOOGLE_READ_METHOD_PATTERN.test(methodId) || /^(drive|gmail|calendar|docs|sheets|slides)\./i.test(methodId);
}

function isGoogleWorkspaceReadSideEffect(sideEffect: GoogleWorkspaceMethodSideEffect): boolean {
  return sideEffect === "metadata_read" || sideEffect === "personal_content_read";
}

function googleWorkspaceMethodRequiresAccountHint(methodId: string): boolean {
  return /^(drive|gmail|calendar|docs|sheets|slides)\./i.test(methodId);
}

function hasGoogleAccountHintProvenance(program: WorkflowProgramIR, node: WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode): boolean {
  const accountHint = objectProperty(node.args, "accountHint");
  if (literalStringProperty(node.args, "accountHint")?.trim()) return true;
  if (!isProgramRef(accountHint)) return false;
  const source = program.nodes.find((candidate) => candidate.id === accountHint.fromNode);
  return workflowProgramToolNode(source)?.tool === "google_workspace_status";
}

function hasReadOnlyGoogleWritePayload(args: unknown, methodId: string): boolean {
  if (googleReadOnlyMethodAllowsBody(methodId)) {
    return objectHasProperty(args, "upload") || objectHasProperty(args, "gmailDraft");
  }
  return objectHasProperty(args, "body") || objectHasProperty(args, "upload") || objectHasProperty(args, "gmailDraft");
}

function googleReadOnlyMethodAllowsBody(methodId: string): boolean {
  return /^calendar\.freebusy\.query$/i.test(methodId);
}

function calendarMethodRequiresTimeRange(methodId: string): boolean {
  return /^calendar\.(events\.list|freebusy\.query)$/i.test(methodId);
}

function hasCalendarTimeRangeAndTimezone(args: unknown): boolean {
  const params = objectProperty(args, "params");
  const body = objectProperty(args, "body");
  return objectHasLiteralString(params, "timeMin") && objectHasLiteralString(params, "timeMax") && objectHasLiteralString(params, "timeZone")
    ? true
    : objectHasLiteralString(body, "timeMin") && objectHasLiteralString(body, "timeMax") && objectHasLiteralString(body, "timeZone");
}

function dependsOnGoogleWorkspaceCall(program: WorkflowProgramIR, node: WorkflowProgramNode): boolean {
  const byId = new Map(program.nodes.map((candidate) => [candidate.id, candidate]));
  return (node.dependsOn ?? []).some((dependencyId) => workflowProgramToolNode(byId.get(dependencyId))?.tool === "google_workspace_call");
}

function googleWorkspaceLeastPrivilegeReadScopes(method: GoogleWorkspaceMethodSummary): string[] {
  const readScopes = method.scopes.filter((scope) => /\.(?:readonly|metadata)$/i.test(scope) || /\/auth\/[^/\s]*(?:readonly|metadata)$/i.test(scope));
  const scopes = readScopes.length ? readScopes : method.scopes;
  return [...new Set(scopes)].sort();
}

function googleWorkspaceDataRetention(sideEffect: GoogleWorkspaceMethodSideEffect): WorkflowGoogleWorkspaceMethodGrant["dataRetention"] {
  return sideEffect === "metadata_read" ? "redacted_audit" : "run_artifact";
}

function googleWorkspaceCallCanMaterializeFile(methodId: string, args: unknown): boolean {
  if (methodId === "drive.files.export") return true;
  if (methodId !== "drive.files.get") return false;
  const params = objectProperty(args, "params");
  return literalStringProperty(params, "alt") === "media";
}

function googleWorkspaceMethodGrantKey(grant: WorkflowGoogleWorkspaceMethodGrant): string {
  return [grant.accountHint ?? "", grant.accountProvenance, grant.methodId].join("\0");
}

function mergeGoogleWorkspaceMethodGrant(
  left: WorkflowGoogleWorkspaceMethodGrant,
  right: WorkflowGoogleWorkspaceMethodGrant,
): WorkflowGoogleWorkspaceMethodGrant {
  return {
    ...left,
    scopes: [...new Set([...left.scopes, ...right.scopes])].sort(),
    dataRetention: strongestConnectorDataRetention(left.dataRetention, right.dataRetention),
    requiresTimeRange: left.requiresTimeRange || right.requiresTimeRange || undefined,
    materializesFile: left.materializesFile || right.materializesFile || undefined,
  };
}

function mergeConnectorGrant(
  left: NonNullable<WorkflowManifest["connectors"]>[number],
  right: NonNullable<WorkflowManifest["connectors"]>[number],
): NonNullable<WorkflowManifest["connectors"]>[number] {
  return {
    ...left,
    scopes: [...new Set([...left.scopes, ...right.scopes])],
    operations: [...new Set([...left.operations, ...right.operations])],
    dataRetention: strongestConnectorDataRetention(left.dataRetention, right.dataRetention),
  };
}

function strongestConnectorDataRetention(
  left: NonNullable<WorkflowManifest["connectors"]>[number]["dataRetention"],
  right: NonNullable<WorkflowManifest["connectors"]>[number]["dataRetention"],
): NonNullable<WorkflowManifest["connectors"]>[number]["dataRetention"] {
  const rank = { none: 0, redacted_audit: 1, run_artifact: 2 };
  return rank[right] > rank[left] ? right : left;
}

function matchingAmbientCliCapability(
  args: unknown,
  capabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowProgramAmbientCliCapability | undefined {
  const command = literalStringProperty(args, "command");
  const packageId = literalStringProperty(args, "packageId");
  const packageName = literalStringProperty(args, "packageName");
  if (!command || (!packageId && !packageName)) return undefined;
  return capabilities.find(
    (capability) =>
      capability.command === command &&
      ((packageId && capability.packageId === packageId) || (packageName && capability.packageName === packageName)),
  );
}

function matchingAmbientCliDescribeCapability(
  args: unknown,
  capabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowProgramAmbientCliCapability | undefined {
  const command = literalStringProperty(args, "command");
  const packageId = literalStringProperty(args, "packageId");
  const packageName = literalStringProperty(args, "packageName");
  if (!packageId && !packageName) return undefined;
  return capabilities.find(
    (capability) =>
      (!command || capability.command === command) &&
      ((packageId && capability.packageId === packageId) || (packageName && capability.packageName === packageName)),
  );
}

function matchingAmbientCliPackageCapabilities(
  args: unknown,
  capabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowProgramAmbientCliCapability[] {
  const packageId = literalStringProperty(args, "packageId");
  const packageName = literalStringProperty(args, "packageName");
  if (!packageId && !packageName) return [];
  return capabilities.filter((capability) => (packageId && capability.packageId === packageId) || (packageName && capability.packageName === packageName));
}

function isSafeAmbientCliEnvBindPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || /[\r\n]/.test(normalized)) return false;
  if (normalized.startsWith("/") || normalized.startsWith("//") || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("~")) return false;
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (segments.length === 0) return false;
  if (segments.some((segment) => segment === "..")) return false;
  if (segments[0] === ".ambient" || segments[0] === ".ambient-codex") return false;
  return true;
}

function ambientCliSearchCanGroundDescribe(searchArgs: unknown, describe: { packageName?: string; command?: string }): boolean {
  const searchPackageName = literalStringProperty(searchArgs, "packageName");
  const searchCommand = literalStringProperty(searchArgs, "command");
  if (searchPackageName && describe.packageName && searchPackageName !== describe.packageName) return false;
  if (searchCommand && describe.command && searchCommand !== describe.command) return false;
  return true;
}

function hasDirectReviewInputForNode(program: WorkflowProgramIR, nodeId: string): boolean {
  return program.nodes.some(
    (candidate) => candidate.kind === "review.input" && (candidate.dependsOn ?? []).includes(nodeId) && nodeValueInputs(candidate).some((value) => valueContainsFromNode(value, nodeId)),
  );
}

function dependsOnReviewInput(program: WorkflowProgramIR, node: WorkflowProgramNode): boolean {
  const byId = new Map(program.nodes.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    const candidate = byId.get(nodeId);
    if (!candidate) return false;
    if (candidate.kind === "review.input") return true;
    return (candidate.dependsOn ?? []).some(visit);
  };
  return (node.dependsOn ?? []).some(visit);
}

function dependsTransitivelyOn(program: WorkflowProgramIR, node: WorkflowProgramNode, dependencyId: string): boolean {
  const byId = new Map(program.nodes.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  const visit = (candidateId: string): boolean => {
    if (candidateId === dependencyId) return true;
    if (visited.has(candidateId)) return false;
    visited.add(candidateId);
    const candidate = byId.get(candidateId);
    return Boolean(candidate && (candidate.dependsOn ?? []).some(visit));
  };
  return (node.dependsOn ?? []).some(visit);
}

function valueContainsFromNode(value: unknown, nodeId: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => valueContainsFromNode(item, nodeId));
  if (isProgramRef(value)) return value.fromNode === nodeId;
  return Object.values(value as Record<string, unknown>).some((item) => valueContainsFromNode(item, nodeId));
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

function workflowProgramToolNode(node: WorkflowProgramNode | undefined): WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode | undefined {
  return node?.kind === "tool.call" || node?.kind === "mutation.stage" ? node : undefined;
}

function workflowProgramToolNodes(node: WorkflowProgramNode): Array<WorkflowProgramToolCallNode | WorkflowProgramMutationStageNode> {
  const toolNode = workflowProgramToolNode(node);
  if (toolNode) return [toolNode];
  if (node.kind === "loop.map" && isWorkflowProgramLoopMapToolCall(node.map)) {
    return [{ id: node.id, kind: "tool.call", tool: node.map.tool, args: node.map.args, output: node.map.output }];
  }
  return [];
}

function workflowProgramBudgetUsage(nodes: WorkflowProgramNode[]): { toolCalls: number; modelCalls: number; connectorCalls: number } {
  let toolCalls = 0;
  let modelCalls = 0;
  let connectorCalls = 0;
  for (const node of nodes) {
    if (node.kind === "tool.call" || node.kind === "mutation.stage") toolCalls += 1;
    if (node.kind === "tool.paginate") toolCalls += node.maxPages;
    if (node.kind === "browser.intervention") toolCalls += 1 + (node.screenshot && node.screenshot.enabled !== false ? 1 : 0);
    if (node.kind === "loop.map" && isWorkflowProgramLoopMapToolCall(node.map)) toolCalls += node.maxItems ?? 1000;
    if (node.kind === "model.call") modelCalls += 1;
    if (node.kind === "model.map") modelCalls += node.maxItems;
    if (node.kind === "model.reduce") modelCalls += workflowProgramModelReduceCallBudget(node);
    if (node.kind === "connector.call") connectorCalls += 1;
    if (node.kind === "connector.paginate") connectorCalls += node.maxPages;
    if (node.kind === "connector.map") connectorCalls += node.maxItems ?? 1000;
  }
  return { toolCalls, modelCalls, connectorCalls };
}

function workflowProgramModelReduceCallBudget(node: WorkflowProgramModelReduceNode): number {
  if (node.strategy !== "tree") return 1;
  const maxFanIn = Math.max(2, Math.min(64, Math.floor(node.maxFanIn ?? 8)));
  const maxLevels = Math.max(1, Math.min(12, Math.floor(node.maxLevels ?? 8)));
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

function workflowProgramInferredMaxRunMs(
  nodes: WorkflowProgramNode[],
  connectorsById: Map<string, WorkflowConnectorDescriptor>,
  toolsByName: Map<string, DesktopToolDescriptor>,
): number {
  let maxRunMs = 0;
  for (const node of nodes) {
    if (node.kind === "tool.call" || node.kind === "mutation.stage") maxRunMs += toolsByName.get(node.tool)?.defaultTimeoutMs ?? 30_000;
    if (node.kind === "tool.paginate") maxRunMs += Math.max(1, Math.floor(node.maxPages)) * (toolsByName.get(node.tool)?.defaultTimeoutMs ?? 30_000);
    if (node.kind === "loop.map" && isWorkflowProgramLoopMapToolCall(node.map)) {
      const maxItems = Math.max(0, Math.floor(node.maxItems ?? 1000));
      const maxConcurrency = Math.max(1, Math.floor(node.maxConcurrency ?? 4));
      const timeoutMs = toolsByName.get(node.map.tool)?.defaultTimeoutMs ?? 30_000;
      maxRunMs += Math.ceil(maxItems / maxConcurrency) * timeoutMs;
    }
    if (node.kind === "browser.intervention") maxRunMs += 120_000;
    if (node.kind === "model.call") maxRunMs += 120_000;
    if (node.kind === "model.map") {
      const maxItems = Math.max(0, Math.floor(node.maxItems));
      const maxConcurrency = Math.max(1, Math.floor(node.maxConcurrency ?? 4));
      maxRunMs += Math.ceil(maxItems / maxConcurrency) * 120_000;
    }
    if (node.kind === "model.reduce") maxRunMs += workflowProgramModelReduceCallBudget(node) * 120_000;
    if (node.kind === "connector.call" || node.kind === "connector.map" || node.kind === "connector.paginate") {
      const descriptor = connectorsById.get(node.connectorId);
      const operation = descriptor ? connectorOperationDescriptor(descriptor, node.operation) : undefined;
      const timeoutMs = operation?.defaultTimeoutMs ?? 30_000;
      if (node.kind === "connector.call") {
        maxRunMs += timeoutMs;
      } else if (node.kind === "connector.paginate") {
        maxRunMs += Math.max(1, Math.floor(node.maxPages)) * timeoutMs;
      } else {
        const maxItems = Math.max(0, Math.floor(node.maxItems ?? 1000));
        const maxConcurrency = Math.max(1, Math.floor(node.maxConcurrency ?? 4));
        maxRunMs += Math.ceil(maxItems / maxConcurrency) * timeoutMs;
      }
    }
  }
  return maxRunMs;
}

function literalStringProperty(value: unknown, key: string): string | undefined {
  const property = objectProperty(value, key);
  if (typeof property === "string") return property;
  if (isProgramLiteral(property) && typeof property.literal === "string") return property.literal;
  return undefined;
}

function literalBooleanProperty(value: unknown, key: string): boolean | undefined {
  const property = objectProperty(value, key);
  if (typeof property === "boolean") return property;
  if (isProgramLiteral(property) && typeof property.literal === "boolean") return property.literal;
  return undefined;
}

function objectHasProperty(value: unknown, key: string): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key));
}

function objectProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function objectHasLiteralString(value: unknown, key: string): boolean {
  return Boolean(literalStringProperty(value, key)?.trim());
}

function isProgramLiteral(value: unknown): value is { literal: unknown } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "literal" in value);
}

function isProgramRef(value: unknown): value is { fromNode: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromNode?: unknown }).fromNode === "string");
}

function errorDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "error", message, path, ...(nodeId ? { nodeId } : {}) };
}
