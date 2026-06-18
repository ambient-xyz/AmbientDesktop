import { createHash } from "node:crypto";
import type { WorkflowApprovalStatus, WorkflowConnectorDataRetention, WorkflowConnectorManifestGrant, WorkflowManifest } from "../../shared/workflowTypes";
import { WorkflowPausedError, type WorkflowEventSink, type WorkflowRuntimeEvent } from "./workflowAgentRuntime";
import { listWorkspaceFiles } from "../workspace/workspaceFiles";

export type WorkflowConnectorAuthType = "none" | "oauth2" | "oauth2_pkce";
export type WorkflowConnectorAuthStatus = "available" | "not_configured" | "connecting" | "expired" | "revoked" | "error" | "unavailable";
export type WorkflowConnectorOperationSideEffect = "none" | "read_personal_data" | "write_external";
export type WorkflowConnectorMutationPolicy = "unsupported" | "staged_until_approved" | "apply_after_approval";

export interface WorkflowConnectorAuthDescriptor {
  type: WorkflowConnectorAuthType;
  status: WorkflowConnectorAuthStatus;
  providerId?: string;
  scopesUrl?: string;
}

export interface WorkflowConnectorAccountDescriptor {
  id: string;
  label: string;
}

export interface WorkflowConnectorScopeDescriptor {
  id: string;
  label: string;
  description: string;
  personalData: boolean;
}

export interface WorkflowConnectorPaginationDescriptor {
  cursorField?: string;
  itemsPath?: string;
  nextPageTokenPath?: string;
  pageTokenInputPath?: string;
  pageSizeInputPath?: string;
  defaultPageSize: number;
  maxPageSize: number;
}

export interface WorkflowConnectorRateLimitDescriptor {
  requestsPerMinute: number;
  burst: number;
}

export interface WorkflowConnectorSyncDescriptor {
  cursorKind: "none" | "opaque" | "timestamp";
  supportsIncremental: boolean;
}

export interface WorkflowConnectorOperationDescriptor {
  name: string;
  label: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  requiredScopes: string[];
  sideEffects: WorkflowConnectorOperationSideEffect;
  supportsDryRun: boolean;
  idempotencyKey: "required" | "recommended" | "not-supported";
  mutationPolicy: WorkflowConnectorMutationPolicy;
  pagination?: WorkflowConnectorPaginationDescriptor;
  defaultTimeoutMs: number;
}

export interface WorkflowConnectorDescriptor {
  id: string;
  label: string;
  description: string;
  auth: WorkflowConnectorAuthDescriptor;
  accounts: WorkflowConnectorAccountDescriptor[];
  scopes: WorkflowConnectorScopeDescriptor[];
  operations: WorkflowConnectorOperationDescriptor[];
  rateLimit: WorkflowConnectorRateLimitDescriptor;
  sync: WorkflowConnectorSyncDescriptor;
  defaultDataRetention: WorkflowConnectorDataRetention;
  dataMinimization: string[];
}

export interface WorkflowConnectorCallInput {
  connectorId: string;
  operation: string;
  input?: unknown;
  accountId?: string;
  idempotencyKey?: string;
  dryRun?: boolean;
  nodeId?: string;
  edgeId?: string;
  itemKey?: string;
}

export type WorkflowConnectorHandler = (input: WorkflowConnectorCallInput) => Promise<unknown> | unknown;

export interface WorkflowConnectorApprovalPreview {
  service: string;
  action: string;
  accountId?: string;
  objectIds?: Record<string, string>;
  summary: string;
  diff: string[];
  sendsExternalCommunication: boolean;
}

export type WorkflowConnectorApprovalPreviewer = (input: WorkflowConnectorCallInput) => WorkflowConnectorApprovalPreview;

export interface WorkflowConnectorRegistration {
  descriptor: WorkflowConnectorDescriptor;
  handlers: Record<string, WorkflowConnectorHandler>;
  approvalPreviewers?: Record<string, WorkflowConnectorApprovalPreviewer>;
}

export interface WorkflowConnectorBridge {
  call(input: WorkflowConnectorCallInput): Promise<unknown>;
}

export interface WorkflowConnectorAuthorizationInput {
  descriptor: WorkflowConnectorDescriptor;
  operation: WorkflowConnectorOperationDescriptor;
  grant: WorkflowConnectorManifestGrant;
  callInput: WorkflowConnectorCallInput;
}

export type WorkflowConnectorAccountAuthorizer = (input: WorkflowConnectorAuthorizationInput) => Promise<void> | void;
export type WorkflowConnectorApprovalDecisionResolver = (
  approvalId: string,
  changeSet: Record<string, unknown>,
) => Promise<WorkflowApprovalStatus | undefined> | WorkflowApprovalStatus | undefined;
export type WorkflowConnectorReviewGrantResolver = (
  input: WorkflowConnectorAuthorizationInput & { auditPolicy: WorkflowConnectorAuditPolicy },
) => Promise<{ grantId: string; targetLabel: string; reason: string } | undefined> | { grantId: string; targetLabel: string; reason: string } | undefined;

export interface WorkflowConnectorBridgeOptions {
  manifest: WorkflowManifest;
  registrations: WorkflowConnectorRegistration[];
  dryRun?: boolean;
  eventSink?: WorkflowEventSink;
  accountAuthorizer?: WorkflowConnectorAccountAuthorizer;
  connectorApprovalDecision?: WorkflowConnectorApprovalDecisionResolver;
  connectorReviewGrantResolver?: WorkflowConnectorReviewGrantResolver;
  approvalScope?: {
    artifactId?: string;
    sourceHash?: string;
    manifestHash?: string;
  };
}

export interface WorkflowConnectorAuditPolicy {
  dataRetention: WorkflowConnectorDataRetention;
  personalData: boolean;
}

export function fixtureWorkflowConnector(records: Array<Record<string, unknown>> = []): WorkflowConnectorRegistration {
  const normalizedRecords = records.map((record, index) => ({
    id: typeof record.id === "string" ? record.id : `fixture-${index + 1}`,
    ...record,
  }));

  return {
    descriptor: validateWorkflowConnectorDescriptor({
      id: "fixture.readonly",
      label: "Fixture Read-only Connector",
      description: "Harmless read-only connector for Workflow Agent connector plumbing tests.",
      auth: { type: "none", status: "available" },
      accounts: [{ id: "fixture", label: "Local fixture" }],
      scopes: [
        {
          id: "fixture.records.read",
          label: "Read fixture records",
          description: "Read non-personal local fixture records supplied by the test harness.",
          personalData: false,
        },
      ],
      operations: [
        {
          name: "listRecords",
          label: "List records",
          description: "Return a bounded page of local fixture records.",
          inputSchema: {
            type: "object",
            properties: {
              cursor: { type: "string", description: "Optional opaque cursor from a previous page." },
              limit: { type: "number", description: "Maximum records to return, capped by the connector." },
            },
            additionalProperties: false,
          },
          outputSchema: {
            type: "object",
            properties: {
              records: { type: "array" },
              nextCursor: { type: ["string", "null"] },
            },
            required: ["records"],
          },
          requiredScopes: ["fixture.records.read"],
          sideEffects: "none",
          supportsDryRun: true,
          idempotencyKey: "not-supported",
          mutationPolicy: "unsupported",
          pagination: {
            cursorField: "cursor",
            itemsPath: "records",
            nextPageTokenPath: "nextCursor",
            pageTokenInputPath: "cursor",
            pageSizeInputPath: "limit",
            defaultPageSize: 25,
            maxPageSize: 100,
          },
          defaultTimeoutMs: 5_000,
        },
        {
          name: "getRecord",
          label: "Get record",
          description: "Return a single local fixture record by id.",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Fixture record id." },
            },
            required: ["id"],
            additionalProperties: false,
          },
          outputSchema: {
            type: "object",
            properties: {
              record: { type: ["object", "null"] },
            },
            required: ["record"],
          },
          requiredScopes: ["fixture.records.read"],
          sideEffects: "none",
          supportsDryRun: true,
          idempotencyKey: "not-supported",
          mutationPolicy: "unsupported",
          defaultTimeoutMs: 5_000,
        },
      ],
      rateLimit: { requestsPerMinute: 120, burst: 10 },
      sync: { cursorKind: "opaque", supportsIncremental: false },
      defaultDataRetention: "redacted_audit",
      dataMinimization: [
        "Fixture records are caller-supplied local data, not account data.",
        "Connector audit events store summaries instead of full record bodies.",
      ],
    }),
    handlers: {
      listRecords: (call) => {
        const input = objectInput(call.input);
        const cursor = typeof input.cursor === "string" ? Number.parseInt(input.cursor, 10) : 0;
        const start = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
        const requestedLimit = typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : 25;
        const limit = Math.max(1, Math.min(Math.floor(requestedLimit), 100));
        const page = normalizedRecords.slice(start, start + limit);
        const next = start + limit < normalizedRecords.length ? String(start + limit) : undefined;
        return { records: page, nextCursor: next };
      },
      getRecord: (call) => {
        const input = objectInput(call.input);
        if (typeof input.id !== "string" || !input.id.trim()) throw new Error("getRecord id is required.");
        return { record: normalizedRecords.find((record) => record.id === input.id) ?? null };
      },
    },
  };
}

export function workspaceInventoryConnector(workspacePath: string): WorkflowConnectorRegistration {
  return {
    descriptor: workspaceInventoryConnectorDescriptor(),
    handlers: {
      listFiles: async (call) => {
        const input = objectInput(call.input);
        const requestedLimit = typeof input.maxEntries === "number" && Number.isFinite(input.maxEntries) ? input.maxEntries : 100;
        const maxEntries = Math.max(1, Math.min(Math.floor(requestedLimit), 300));
        const tree = await listWorkspaceFiles(workspacePath);
        return {
          rootName: tree.rootName,
          entries: tree.entries.slice(0, maxEntries),
          truncated: tree.truncated || tree.entries.length > maxEntries,
          totalKnownEntries: tree.entries.length,
        };
      },
    },
  };
}

export function workspaceInventoryConnectorDescriptor(): WorkflowConnectorDescriptor {
  return validateWorkflowConnectorDescriptor({
    id: "workspace.inventory",
    label: "Workspace Inventory",
    description: "Read a bounded, non-personal inventory of files in the active workspace.",
    auth: { type: "none", status: "available" },
    accounts: [{ id: "workspace", label: "Active workspace" }],
    scopes: [
      {
        id: "workspace.files.read",
        label: "Read workspace file inventory",
        description: "Read file names, directory names, file sizes, and tree shape inside the active workspace.",
        personalData: false,
      },
    ],
    operations: [
      {
        name: "listFiles",
        label: "List files",
        description: "Return a bounded workspace file tree without reading file contents.",
        inputSchema: {
          type: "object",
          properties: {
            maxEntries: { type: "number", description: "Maximum file tree entries to return, capped at 300." },
          },
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: {
            rootName: { type: "string" },
            entries: { type: "array" },
            truncated: { type: "boolean" },
            totalKnownEntries: { type: "number" },
          },
          required: ["rootName", "entries", "truncated", "totalKnownEntries"],
        },
        requiredScopes: ["workspace.files.read"],
        sideEffects: "none",
        supportsDryRun: true,
        idempotencyKey: "not-supported",
        mutationPolicy: "unsupported",
        pagination: { cursorField: "maxEntries", defaultPageSize: 100, maxPageSize: 300 },
        defaultTimeoutMs: 10_000,
      },
    ],
    rateLimit: { requestsPerMinute: 300, burst: 30 },
    sync: { cursorKind: "none", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: ["Returns paths, sizes, and tree shape only; it does not read file contents."],
  });
}

export function createWorkflowConnectorBridge(options: WorkflowConnectorBridgeOptions): WorkflowConnectorBridge {
  const registrations = new Map(options.registrations.map((registration) => [registration.descriptor.id, registration]));
  const grants = connectorGrants(options.manifest);
  validateWorkflowConnectorManifest(options.manifest, options.registrations.map((registration) => registration.descriptor));
  let calls = 0;

  return {
    call: async (callInput) => {
      const registration = registrations.get(callInput.connectorId);
      if (!registration) throw new Error(`No Workflow connector registered for: ${callInput.connectorId}`);
      const operation = operationDescriptor(registration.descriptor, callInput.operation);
      const grant = grants.get(callInput.connectorId);
      if (!grant) throw new Error(`Workflow manifest does not allow connector: ${callInput.connectorId}`);
      enforceConnectorGrant(registration.descriptor, operation, grant, callInput, options.manifest);
      const effectiveCallInput = options.dryRun ? { ...callInput, dryRun: true } : callInput;
      const auditPolicy = connectorAuditPolicy(registration.descriptor, operation, grant);
      await options.accountAuthorizer?.({ descriptor: registration.descriptor, operation, grant, callInput: effectiveCallInput });
      await enforceConnectorReview({
        options,
        descriptor: registration.descriptor,
        operation,
        grant,
        callInput: effectiveCallInput,
        auditPolicy,
        approvalPreviewer: registration.approvalPreviewers?.[operation.name],
      });
      calls += 1;
      if (options.manifest.maxConnectorCalls !== undefined && calls > options.manifest.maxConnectorCalls) {
        throw new Error(`Workflow exceeded max connector calls (${options.manifest.maxConnectorCalls}).`);
      }
      validateJsonObjectInput(`${effectiveCallInput.connectorId}.${effectiveCallInput.operation}`, operation.inputSchema, effectiveCallInput.input ?? {});
      if (options.dryRun && !operation.supportsDryRun) {
        const skipped = { dryRun: true, skipped: true, connectorId: effectiveCallInput.connectorId, operation: effectiveCallInput.operation };
        await options.eventSink?.append({
          type: "connector.dry_run",
          message: `${effectiveCallInput.connectorId}.${effectiveCallInput.operation}`,
          data: connectorAuditData(operation, auditPolicy, effectiveCallInput.input, skipped, true),
        });
        return skipped;
      }
      const handler = registration.handlers[effectiveCallInput.operation];
      if (!handler) throw new Error(`No Workflow connector handler registered for: ${effectiveCallInput.connectorId}.${effectiveCallInput.operation}`);
      return callConnector({
        callInput: effectiveCallInput,
        operation,
        auditPolicy,
        handler,
        eventSink: options.eventSink,
      });
    },
  };
}

export function validateWorkflowConnectorDescriptor(descriptor: WorkflowConnectorDescriptor): WorkflowConnectorDescriptor {
  assertIdentifier(descriptor.id, "connector id");
  assertNonEmpty(descriptor.label, "connector label");
  assertNonEmpty(descriptor.description, "connector description");
  if (!["none", "oauth2", "oauth2_pkce"].includes(descriptor.auth.type)) throw new Error(`${descriptor.id} has invalid auth type.`);
  if (!["available", "not_configured", "connecting", "expired", "revoked", "error", "unavailable"].includes(descriptor.auth.status)) {
    throw new Error(`${descriptor.id} has invalid auth status.`);
  }
  if (descriptor.auth.type !== "none") assertIdentifier(descriptor.auth.providerId ?? descriptor.id, `${descriptor.id} auth provider id`);
  if (!descriptor.accounts.length && descriptor.auth.status === "available") {
    throw new Error(`${descriptor.id} must declare at least one account when available.`);
  }

  const scopeIds = new Set<string>();
  for (const scope of descriptor.scopes) {
    assertIdentifier(scope.id, `${descriptor.id} scope id`);
    assertNonEmpty(scope.label, `${scope.id} label`);
    assertNonEmpty(scope.description, `${scope.id} description`);
    if (scopeIds.has(scope.id)) throw new Error(`${descriptor.id} declares duplicate scope: ${scope.id}`);
    scopeIds.add(scope.id);
  }

  const operationNames = new Set<string>();
  for (const operation of descriptor.operations) {
    assertIdentifier(operation.name, `${descriptor.id} operation name`);
    assertNonEmpty(operation.label, `${descriptor.id}.${operation.name} label`);
    assertNonEmpty(operation.description, `${descriptor.id}.${operation.name} description`);
    if (operationNames.has(operation.name)) throw new Error(`${descriptor.id} declares duplicate operation: ${operation.name}`);
    operationNames.add(operation.name);
    if (!["none", "read_personal_data", "write_external"].includes(operation.sideEffects)) {
      throw new Error(`${descriptor.id}.${operation.name} has invalid side effect tag.`);
    }
    if (!["unsupported", "staged_until_approved", "apply_after_approval"].includes(operation.mutationPolicy)) {
      throw new Error(`${descriptor.id}.${operation.name} has invalid mutation policy.`);
    }
    if (operation.sideEffects === "write_external" && operation.mutationPolicy === "unsupported") {
      throw new Error(`${descriptor.id}.${operation.name} writes externally but has no mutation policy.`);
    }
    if (operation.sideEffects === "write_external" && operation.idempotencyKey === "not-supported") {
      throw new Error(`${descriptor.id}.${operation.name} writes externally without idempotency support.`);
    }
    for (const scope of operation.requiredScopes) {
      if (!scopeIds.has(scope)) throw new Error(`${descriptor.id}.${operation.name} references unknown scope: ${scope}`);
    }
    if (operation.defaultTimeoutMs <= 0) throw new Error(`${descriptor.id}.${operation.name} must have a positive timeout.`);
    if (operation.pagination) {
      const pagination = operation.pagination;
      if (pagination.defaultPageSize <= 0 || pagination.maxPageSize <= 0 || pagination.defaultPageSize > pagination.maxPageSize) {
        throw new Error(`${descriptor.id}.${operation.name} has invalid pagination page-size bounds.`);
      }
      if (!pagination.cursorField && !pagination.pageTokenInputPath) {
        throw new Error(`${descriptor.id}.${operation.name} pagination must declare cursorField or pageTokenInputPath.`);
      }
      if (pagination.itemsPath !== undefined) assertNonEmpty(pagination.itemsPath, `${descriptor.id}.${operation.name} pagination itemsPath`);
      if (pagination.nextPageTokenPath !== undefined) assertNonEmpty(pagination.nextPageTokenPath, `${descriptor.id}.${operation.name} pagination nextPageTokenPath`);
      if (pagination.pageTokenInputPath !== undefined) assertNonEmpty(pagination.pageTokenInputPath, `${descriptor.id}.${operation.name} pagination pageTokenInputPath`);
      if (pagination.pageSizeInputPath !== undefined) assertNonEmpty(pagination.pageSizeInputPath, `${descriptor.id}.${operation.name} pagination pageSizeInputPath`);
    }
  }

  if (descriptor.rateLimit.requestsPerMinute <= 0 || descriptor.rateLimit.burst <= 0) {
    throw new Error(`${descriptor.id} must declare positive rate limits.`);
  }
  if (!["none", "opaque", "timestamp"].includes(descriptor.sync.cursorKind)) throw new Error(`${descriptor.id} has invalid cursor kind.`);
  if (!["none", "redacted_audit", "run_artifact"].includes(descriptor.defaultDataRetention)) {
    throw new Error(`${descriptor.id} has invalid data retention policy.`);
  }
  return descriptor;
}

export function validateWorkflowConnectorManifest(
  manifest: WorkflowManifest,
  descriptors: WorkflowConnectorDescriptor[] = [],
): void {
  const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  for (const grant of manifest.connectors ?? []) {
    const descriptor = descriptorsById.get(grant.connectorId);
    if (!descriptor) throw new Error(`Workflow manifest declares unavailable connector: ${grant.connectorId}`);
    if (descriptor.auth.status !== "available") {
      throw new Error(`Workflow connector is not available: ${grant.connectorId} (${descriptor.auth.status})`);
    }
    if (grant.accountId && !descriptor.accounts.some((account) => account.id === grant.accountId)) {
      throw new Error(`Workflow connector grant references unknown account: ${grant.connectorId}/${grant.accountId}`);
    }
    if (!["none", "redacted_audit", "run_artifact"].includes(grant.dataRetention)) {
      throw new Error(`Workflow connector grant has invalid data retention: ${grant.connectorId}`);
    }
    const scopeIds = new Set(descriptor.scopes.map((scope) => scope.id));
    const grantedScopes = new Set(grant.scopes);
    for (const scope of grant.scopes) {
      if (!scopeIds.has(scope)) throw new Error(`Workflow connector grant references unknown scope: ${grant.connectorId}/${scope}`);
    }
    for (const operationName of grant.operations) {
      const operation = operationDescriptor(descriptor, operationName);
      for (const requiredScope of operation.requiredScopes) {
        if (!grantedScopes.has(requiredScope)) {
          throw new Error(`Workflow connector grant for ${grant.connectorId}.${operationName} is missing scope: ${requiredScope}`);
        }
      }
      if (manifest.mutationPolicy === "read_only" && operation.sideEffects === "write_external") {
        throw new Error(`Workflow connector mutation requires a non-read-only manifest: ${grant.connectorId}.${operationName}`);
      }
    }
  }
}

export function workflowConnectorCompilerSection(descriptors: WorkflowConnectorDescriptor[] = []): string {
  if (descriptors.length === 0) {
    return [
      "Available Workflow connectors:",
      "- none",
      "Connector rule: no Gmail, Calendar, Slack, or account connector may be simulated with raw tools. If needed, return openQuestions.",
    ].join("\n");
  }
  return [
    "Available Workflow connectors:",
    ...descriptors.map((descriptor) =>
      [
        `- ${descriptor.id}: ${descriptor.description}`,
        `  auth: ${descriptor.auth.type}/${descriptor.auth.status}; accounts: ${descriptor.accounts.map((account) => account.id).join(", ") || "none"}`,
        `  scopes: ${descriptor.scopes.map((scope) => `${scope.id}${scope.personalData ? " (personal-data)" : ""}`).join(", ") || "none"}`,
        `  operations: ${descriptor.operations.map((operation) => operationSummary(operation)).join("; ") || "none"}`,
        `  retention: ${descriptor.defaultDataRetention}; rateLimit: ${descriptor.rateLimit.requestsPerMinute}/min`,
      ].join("\n"),
    ),
    "Connector syntax: use connector.call for one connector request, connector.paginate for bounded cursor/page-token retrieval, and connector.map for bounded detail fan-out over an array.",
    "If source calls connectors.call(...), manifest.connectors must grant the connector id, operation names, exact scopes, account id when known, and dataRetention.",
    "Personal-data connector retention: use dataRetention=redacted_audit by default, dataRetention=none when audit records should omit values, and dataRetention=run_artifact only when the user explicitly wants raw connector values in run artifacts.",
    "Connector rule: listed account connectors should be used through connectors.call; unavailable account connectors must not be simulated with raw tools.",
  ].join("\n");
}

function operationSummary(operation: WorkflowConnectorOperationDescriptor): string {
  const pagination = operation.pagination
    ? `; page=${operation.pagination.pageTokenInputPath ?? operation.pagination.cursorField}/${operation.pagination.itemsPath ?? "items"}:${operation.pagination.nextPageTokenPath ?? "next"}/${operation.pagination.defaultPageSize}-${operation.pagination.maxPageSize}`
    : "";
  return `${operation.name} [${operation.sideEffects}; scopes=${operation.requiredScopes.join("+") || "none"}${pagination}; input=${JSON.stringify(operation.inputSchema)}]`;
}

function connectorGrants(manifest: WorkflowManifest): Map<string, WorkflowConnectorManifestGrant> {
  return new Map((manifest.connectors ?? []).map((grant) => [grant.connectorId, grant]));
}

function enforceConnectorGrant(
  descriptor: WorkflowConnectorDescriptor,
  operation: WorkflowConnectorOperationDescriptor,
  grant: WorkflowConnectorManifestGrant,
  callInput: WorkflowConnectorCallInput,
  manifest: WorkflowManifest,
): void {
  if (!grant.operations.includes(operation.name)) {
    throw new Error(`Workflow manifest does not allow connector operation: ${descriptor.id}.${operation.name}`);
  }
  const grantedScopes = new Set(grant.scopes);
  for (const scope of operation.requiredScopes) {
    if (!grantedScopes.has(scope)) throw new Error(`Workflow connector operation missing scope: ${descriptor.id}.${operation.name}/${scope}`);
  }
  if (callInput.accountId && grant.accountId && callInput.accountId !== grant.accountId) {
    throw new Error(`Workflow connector call used an ungranted account: ${descriptor.id}/${callInput.accountId}`);
  }
  if (!callInput.accountId && grant.accountId) callInput.accountId = grant.accountId;
  if (operation.sideEffects === "write_external" && manifest.mutationPolicy === "read_only") {
    throw new Error(`Workflow connector mutation requires a non-read-only manifest: ${descriptor.id}.${operation.name}`);
  }
  if (operation.idempotencyKey === "required" && !callInput.idempotencyKey?.trim()) {
    throw new Error(`Workflow connector operation requires an idempotency key: ${descriptor.id}.${operation.name}`);
  }
}

async function enforceConnectorReview(input: {
  options: WorkflowConnectorBridgeOptions;
  descriptor: WorkflowConnectorDescriptor;
  operation: WorkflowConnectorOperationDescriptor;
  grant: WorkflowConnectorManifestGrant;
  callInput: WorkflowConnectorCallInput;
  auditPolicy: WorkflowConnectorAuditPolicy;
  approvalPreviewer?: WorkflowConnectorApprovalPreviewer;
}): Promise<void> {
  if (!connectorCallNeedsReview(input.operation, input.grant, input.auditPolicy)) return;
  const changeSet = connectorReviewChangeSet(input);
  const approvalId = connectorReviewApprovalId(input.options.approvalScope, changeSet);
  const grantDecision = await input.options.connectorReviewGrantResolver?.({
    descriptor: input.descriptor,
    operation: input.operation,
    grant: input.grant,
    callInput: input.callInput,
    auditPolicy: input.auditPolicy,
  });
  if (grantDecision) {
    await input.options.eventSink?.append({
      type: "connector.review.approved",
      message: approvalId,
      data: {
        id: approvalId,
        changeSet,
        source: "persistent_grant",
        grantId: grantDecision.grantId,
        targetLabel: grantDecision.targetLabel,
        reason: grantDecision.reason,
      },
    });
    return;
  }
  const decision = await input.options.connectorApprovalDecision?.(approvalId, changeSet);
  if (decision === "approved") {
    await input.options.eventSink?.append({
      type: "connector.review.approved",
      message: approvalId,
      data: { id: approvalId, changeSet, source: "resume" },
    });
    return;
  }
  if (decision === "rejected") {
    await input.options.eventSink?.append({
      type: "connector.review.rejected",
      message: approvalId,
      data: { id: approvalId, changeSet, source: "resume" },
    });
    throw new Error(`Workflow connector review rejected: ${approvalId}`);
  }
  await input.options.eventSink?.append({
    type: "connector.review.required",
    message: approvalId,
    data: { id: approvalId, changeSet },
  });
  throw new WorkflowPausedError({ id: approvalId, changeSet, status: "pending" });
}

function connectorCallNeedsReview(
  operation: WorkflowConnectorOperationDescriptor,
  grant: WorkflowConnectorManifestGrant,
  auditPolicy: WorkflowConnectorAuditPolicy,
): boolean {
  return auditPolicy.personalData || operation.sideEffects === "write_external" || grant.dataRetention === "run_artifact";
}

function connectorReviewChangeSet(input: {
  descriptor: WorkflowConnectorDescriptor;
  operation: WorkflowConnectorOperationDescriptor;
  grant: WorkflowConnectorManifestGrant;
  callInput: WorkflowConnectorCallInput;
  auditPolicy: WorkflowConnectorAuditPolicy;
  options: WorkflowConnectorBridgeOptions;
  approvalPreviewer?: WorkflowConnectorApprovalPreviewer;
}): Record<string, unknown> {
  return stableValue({
    kind: "connector-grant",
    connectorId: input.descriptor.id,
    connectorLabel: input.descriptor.label,
    operation: input.operation.name,
    operationLabel: input.operation.label,
    accountId: input.callInput.accountId ?? input.grant.accountId,
    scopes: [...input.grant.scopes].sort(),
    operations: [...input.grant.operations].sort(),
    dataRetention: input.grant.dataRetention,
    personalData: input.auditPolicy.personalData,
    sideEffects: input.operation.sideEffects,
    mutationPolicy: input.operation.mutationPolicy,
    supportsDryRun: input.operation.supportsDryRun,
    idempotencyKey: input.operation.idempotencyKey,
    inputSummary: connectorAuditSummary(input.callInput.input, input.auditPolicy),
    approvalPreview: input.approvalPreviewer?.(input.callInput),
    approvalScope: input.options.approvalScope,
  }) as Record<string, unknown>;
}

function connectorReviewApprovalId(scope: WorkflowConnectorBridgeOptions["approvalScope"], changeSet: Record<string, unknown>): string {
  const hash = createHash("sha256").update(stableStringify({ scope, changeSet })).digest("hex").slice(0, 16);
  return `connector-review-${hash}`;
}

function operationDescriptor(
  descriptor: WorkflowConnectorDescriptor,
  operationName: string,
): WorkflowConnectorOperationDescriptor {
  const operation = descriptor.operations.find((candidate) => candidate.name === operationName);
  if (!operation) throw new Error(`Workflow connector does not expose operation: ${descriptor.id}.${operationName}`);
  return operation;
}

async function callConnector(input: {
  callInput: WorkflowConnectorCallInput;
  operation: WorkflowConnectorOperationDescriptor;
  auditPolicy: WorkflowConnectorAuditPolicy;
  handler: WorkflowConnectorHandler;
  eventSink?: WorkflowEventSink;
}): Promise<unknown> {
  const message = `${input.callInput.connectorId}.${input.callInput.operation}`;
  const startedAt = Date.now();
  await input.eventSink?.append({
    type: "connector.start",
    message,
    ...connectorTraceMetadata(input.callInput, connectorAuditData(input.operation, input.auditPolicy, input.callInput.input)),
  });
  try {
    const result = await withTimeout(
      Promise.resolve(input.handler(input.callInput)),
      input.operation.defaultTimeoutMs,
      message,
    );
    await input.eventSink?.append({
      type: "connector.end",
      message,
      ...connectorTraceMetadata(input.callInput, {
        durationMs: Date.now() - startedAt,
        ...connectorAuditData(input.operation, input.auditPolicy, input.callInput.input, result, true),
      }),
    });
    return result;
  } catch (error) {
    await input.eventSink?.append({
      type: "connector.error",
      message,
      ...connectorTraceMetadata(input.callInput, {
        durationMs: Date.now() - startedAt,
        error: connectorAuditError(error, input.auditPolicy),
      }),
    });
    throw error;
  }
}

function connectorTraceMetadata(
  callInput: WorkflowConnectorCallInput,
  data: Record<string, unknown> = {},
): Pick<WorkflowRuntimeEvent, "graphNodeId" | "graphEdgeId" | "itemKey" | "data"> {
  const enriched = { ...data };
  if (callInput.nodeId) enriched.graphNodeId = callInput.nodeId;
  if (callInput.edgeId) enriched.graphEdgeId = callInput.edgeId;
  if (callInput.itemKey) enriched.itemKey = callInput.itemKey;
  return {
    graphNodeId: callInput.nodeId,
    graphEdgeId: callInput.edgeId,
    itemKey: callInput.itemKey,
    data: Object.keys(enriched).length > 0 ? enriched : undefined,
  };
}

function connectorAuditPolicy(
  descriptor: WorkflowConnectorDescriptor,
  operation: WorkflowConnectorOperationDescriptor,
  grant: WorkflowConnectorManifestGrant,
): WorkflowConnectorAuditPolicy {
  return {
    dataRetention: grant.dataRetention,
    personalData: connectorOperationHasPersonalData(descriptor, operation),
  };
}

function connectorOperationHasPersonalData(
  descriptor: WorkflowConnectorDescriptor,
  operation: WorkflowConnectorOperationDescriptor,
): boolean {
  if (operation.sideEffects === "read_personal_data") return true;
  const scopes = new Map(descriptor.scopes.map((scope) => [scope.id, scope]));
  return operation.requiredScopes.some((scopeId) => scopes.get(scopeId)?.personalData === true);
}

function connectorAuditData(
  operation: WorkflowConnectorOperationDescriptor,
  auditPolicy: WorkflowConnectorAuditPolicy,
  callInput?: unknown,
  output?: unknown,
  includeOutput = false,
): Record<string, unknown> {
  return {
    sideEffects: operation.sideEffects,
    personalData: auditPolicy.personalData,
    dataRetention: auditPolicy.dataRetention,
    inputSummary: connectorAuditSummary(callInput, auditPolicy),
    ...(includeOutput ? { outputSummary: connectorAuditSummary(output, auditPolicy) } : {}),
  };
}

function connectorAuditSummary(value: unknown, auditPolicy: WorkflowConnectorAuditPolicy): string {
  if (!auditPolicy.personalData || auditPolicy.dataRetention === "run_artifact") return summarizeValue(value);
  if (auditPolicy.dataRetention === "none") return "[omitted: connector personal data retention=none]";
  return summarizeValue(redactPersonalData(value));
}

function connectorAuditError(error: unknown, auditPolicy: WorkflowConnectorAuditPolicy): string {
  if (auditPolicy.personalData && auditPolicy.dataRetention !== "run_artifact") {
    return "Connector operation failed; details omitted by personal-data retention policy.";
  }
  return error instanceof Error ? error.message : String(error);
}

function redactPersonalData(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return {
      type: "array",
      count: value.length,
      sample: value.slice(0, 3).map(redactPersonalData),
    };
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactPersonalData(item)]));
  }
  return "[redacted]";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stableValue((value as Record<string, unknown>)[key])]));
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function assertIdentifier(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) throw new Error(`${label} is not a safe identifier: ${value}`);
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

function validateJsonObjectInput(label: string, schema: unknown, input: unknown): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const objectSchema = schema as {
    type?: unknown;
    properties?: Record<string, { type?: unknown }>;
    required?: unknown;
    additionalProperties?: unknown;
  };
  if (objectSchema.type !== "object") return;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} input must be an object.`);
  }

  const record = input as Record<string, unknown>;
  const required = Array.isArray(objectSchema.required)
    ? objectSchema.required.filter((item): item is string => typeof item === "string")
    : [];
  for (const key of required) {
    if (!(key in record)) throw new Error(`${label} input is missing required field: ${key}`);
  }
  const properties = objectSchema.properties ?? {};
  if (objectSchema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in properties)) throw new Error(`${label} input has unexpected field: ${key}`);
    }
  }
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in record)) continue;
    const expectedType = propertySchema.type;
    if (Array.isArray(expectedType)) continue;
    if (typeof expectedType !== "string") continue;
    if (expectedType === "number" && (typeof record[key] !== "number" || !Number.isFinite(record[key]))) {
      throw new Error(`${label} input field ${key} must be a number.`);
    }
    if (expectedType !== "number" && typeof record[key] !== expectedType) {
      throw new Error(`${label} input field ${key} must be a ${expectedType}.`);
    }
  }
}

function summarizeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value.replace(/\s+/g, " ").trim(), 220);
  try {
    return truncate(JSON.stringify(value), 220);
  } catch {
    return truncate(String(value), 220);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Workflow connector timed out after ${timeoutMs}ms: ${operationName}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
