import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  parseMcpAutowireCandidate,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
  type McpAutowireValidationReport,
} from "./mcpAutowireSchemas";

export const MCP_AUTOWIRE_PLAN_REVISION_SCHEMA_VERSION = "ambient-mcp-autowire-plan-revisions-v1";

export type McpAutowirePlanRevisionSource = "plan" | "review" | "edit" | "runtime-repair" | "install";

export interface McpAutowirePlanRevision {
  revisionId: string;
  parentRevisionId?: string;
  candidateRef?: string;
  candidateHash: string;
  candidateId: string;
  serverId?: string;
  workloadName?: string;
  targetUrl?: string;
  sourceUrl?: string;
  source: McpAutowirePlanRevisionSource;
  summary: string;
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  edit?: {
    reason?: string;
    operations: McpAutowirePlanEditOperation[];
    permissionExpanding: boolean;
    approvalReasons: string[];
  };
  createdAt: string;
}

export interface McpAutowirePlanRevisionStore {
  recordCandidate(input: McpAutowirePlanRevisionRecordInput): McpAutowirePlanRevision;
  list(input?: McpAutowirePlanRevisionListInput): McpAutowirePlanRevision[];
  read(revisionId: string): McpAutowirePlanRevision | undefined;
  latestForCandidateRef(candidateRef: string): McpAutowirePlanRevision | undefined;
  latestForCandidateHash(candidateHash: string): McpAutowirePlanRevision | undefined;
  latestForInstalledServer(input: { serverId?: string; workloadName?: string }): McpAutowirePlanRevision | undefined;
}

export interface McpAutowirePlanRevisionStoreOptions {
  storagePath?: string;
  maxEntries?: number;
  now?: () => string;
}

export interface McpAutowirePlanRevisionRecordInput {
  candidate: McpAutowireCandidate | Record<string, unknown>;
  source: McpAutowirePlanRevisionSource;
  summary: string;
  candidateRef?: string;
  parentRevisionId?: string;
  serverId?: string;
  workloadName?: string;
  targetUrl?: string;
  edit?: McpAutowirePlanRevision["edit"];
}

export interface McpAutowirePlanRevisionListInput {
  candidateRef?: string;
  candidateHash?: string;
  serverId?: string;
  workloadName?: string;
  limit?: number;
}

export type McpAutowirePlanEditOperation =
  | {
    op: "network.allowlist.add";
    hosts: string[];
    ports?: number[];
    justification: string;
  }
  | {
    op: "network.mode.set";
    mode: "disabled" | "local-only" | "allowlist" | "isolated" | "broad";
    justification: string;
  }
  | {
    op: "filesystem.mount.add";
    path: string;
    containerPath: string;
    mode: "read-only" | "read-write";
    purpose: string;
  }
  | {
    op: "filesystem.mount.remove";
    path?: string;
    containerPath?: string;
  }
  | {
    op: "runtime.packageArgument.add";
    argument: {
      type: "positional" | "flag" | "switch" | "env" | "unknown";
      name?: string;
      valueHint?: string;
      isFixed: boolean;
    };
    reason: string;
  }
  | {
    op: "runtime.packageArgument.remove";
    type?: "positional" | "flag" | "switch" | "env" | "unknown";
    name?: string;
    valueHint?: string;
  }
  | {
    op: "secret.declare";
    name: string;
    required: boolean;
    purpose: string;
    evidenceRefs?: string[];
  }
  | {
    op: "validation.expectedTools.add";
    tools: string[];
  }
  | {
    op: "validation.smokeCall.set";
    tool: string;
    arguments: Record<string, unknown>;
  };

export interface McpAutowirePlanEditDescribeInput {
  candidate: McpAutowireCandidate | Record<string, unknown>;
  candidateRef?: string;
  expectedCandidateHash?: string;
  parentRevisionId?: string;
  reason?: string;
  operations: unknown[];
}

export interface McpAutowirePlanEditDescribeResult {
  status: "ready-for-apply" | "needs-review" | "invalid";
  candidateRef?: string;
  parentRevisionId?: string;
  originalCandidate: McpAutowireCandidate;
  editedCandidate?: McpAutowireCandidate;
  originalCandidateHash: string;
  editedCandidateHash?: string;
  validation: McpAutowireValidationReport;
  operations: McpAutowirePlanEditOperation[];
  changedPaths: string[];
  noOpReasons: string[];
  permissionExpanding: boolean;
  approvalRequired: true;
  approvalReasons: string[];
  reason?: string;
  nextToolName?: "ambient_mcp_autowire_review";
  nextToolInput?: Record<string, unknown>;
}

export interface McpAutowirePlanEditApplyResult extends Omit<McpAutowirePlanEditDescribeResult, "status"> {
  status: "applied" | "needs-review" | "invalid";
  revision?: McpAutowirePlanRevision;
  candidateRef?: string;
  nextToolName?: "ambient_mcp_autowire_review";
  nextToolInput?: Record<string, unknown>;
}

export interface McpAutowireRuntimeRepairDescribeInput {
  candidate: McpAutowireCandidate | Record<string, unknown>;
  candidateRef?: string;
  expectedCandidateHash?: string;
  parentRevisionId?: string;
  serverId?: string;
  workloadName?: string;
  failureText?: string;
  logText?: string;
  reason?: string;
}

export interface McpAutowireRuntimeRepairDescribeResult {
  status: "repair-available" | "needs-more-context" | "invalid";
  serverId?: string;
  workloadName?: string;
  candidateRef?: string;
  parentRevisionId?: string;
  detectedIssues: string[];
  operations: McpAutowirePlanEditOperation[];
  editPreview?: McpAutowirePlanEditDescribeResult;
  guidance: string[];
}

interface StoredRevisionFile {
  schemaVersion: typeof MCP_AUTOWIRE_PLAN_REVISION_SCHEMA_VERSION;
  revisions: McpAutowirePlanRevision[];
}

export function createMcpAutowirePlanRevisionStore(options: McpAutowirePlanRevisionStoreOptions = {}): McpAutowirePlanRevisionStore {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 200));
  const now = options.now ?? (() => new Date().toISOString());
  let revisions = readStoredRevisions(options.storagePath);
  const persist = () => {
    revisions = revisions.slice(-maxEntries);
    persistStoredRevisions(options.storagePath, revisions);
  };
  return {
    recordCandidate(input) {
      const candidate = parseMcpAutowireCandidate(input.candidate);
      const validation = validateMcpAutowireCandidate(candidate);
      if (!validation.candidate || !validation.candidateHash) {
        throw new Error(`Cannot record invalid MCP autowire candidate revision: ${validation.blockers.map((issue) => issue.message).join("; ")}`);
      }
      const createdAt = now();
      const revision: McpAutowirePlanRevision = stripUndefined({
        revisionId: revisionIdFor({
          candidateId: candidate.id,
          candidateHash: validation.candidateHash,
          createdAt,
          source: input.source,
          parentRevisionId: input.parentRevisionId,
        }),
        parentRevisionId: input.parentRevisionId,
        candidateRef: input.candidateRef,
        candidateHash: validation.candidateHash,
        candidateId: candidate.id,
        serverId: input.serverId ?? candidate.id,
        workloadName: input.workloadName,
        targetUrl: input.targetUrl,
        sourceUrl: candidate.source.url,
        source: input.source,
        summary: input.summary,
        candidate: validation.candidate,
        validation,
        edit: input.edit,
        createdAt,
      });
      revisions.push(revision);
      persist();
      return revision;
    },
    list(input = {}) {
      const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? 50)));
      return revisions
        .filter((revision) => matchesRevisionFilter(revision, input))
        .slice()
        .reverse()
        .slice(0, limit);
    },
    read(revisionId) {
      return revisions.find((revision) => revision.revisionId === revisionId);
    },
    latestForCandidateRef(candidateRef) {
      return latestRevision(revisions.filter((revision) => revision.candidateRef === candidateRef));
    },
    latestForCandidateHash(candidateHash) {
      return latestRevision(revisions.filter((revision) => revision.candidateHash === candidateHash));
    },
    latestForInstalledServer(input) {
      return latestRevision(revisions.filter((revision) =>
        Boolean(input.workloadName && revision.workloadName === input.workloadName) ||
        Boolean(input.serverId && revision.serverId === input.serverId),
      ));
    },
  };
}

export function describeMcpAutowirePlanEdit(input: McpAutowirePlanEditDescribeInput): McpAutowirePlanEditDescribeResult {
  const originalCandidate = parseMcpAutowireCandidate(input.candidate);
  const originalValidation = validateMcpAutowireCandidate(originalCandidate);
  if (!originalValidation.candidateHash) throw new Error("Original MCP autowire candidate is invalid.");
  if (input.expectedCandidateHash && input.expectedCandidateHash !== originalValidation.candidateHash) {
    throw new Error(`MCP autowire candidate hash changed before plan edit. Expected ${input.expectedCandidateHash}, found ${originalValidation.candidateHash}.`);
  }
  const operations = normalizeEditOperations(input.operations);
  const editedCandidate = cloneCandidate(originalCandidate);
  const changedPaths = new Set<string>();
  const noOpReasons: string[] = [];
  for (const operation of operations) {
    applyEditOperation(editedCandidate, operation, changedPaths, noOpReasons);
  }
  const validation = validateMcpAutowireCandidate(editedCandidate);
  const editedHash = validation.candidateHash;
  const schemaInvalid = !validation.candidate || !editedHash;
  const expansion = editPermissionExpansion(originalCandidate, editedCandidate, operations);
  const result: McpAutowirePlanEditDescribeResult = {
    status: schemaInvalid ? "invalid" : validation.blockers.length ? "needs-review" : "ready-for-apply",
    candidateRef: input.candidateRef,
    parentRevisionId: input.parentRevisionId,
    originalCandidate,
    ...(validation.candidate ? { editedCandidate: validation.candidate } : {}),
    originalCandidateHash: originalValidation.candidateHash,
    ...(editedHash ? { editedCandidateHash: editedHash } : {}),
    validation,
    operations,
    changedPaths: [...changedPaths].sort(),
    noOpReasons,
    permissionExpanding: expansion.permissionExpanding,
    approvalRequired: true,
    approvalReasons: expansion.approvalReasons,
    ...(input.reason ? { reason: input.reason } : {}),
  };
  if (!schemaInvalid && input.candidateRef) {
    result.nextToolName = "ambient_mcp_autowire_review";
    result.nextToolInput = {
      candidateRef: input.candidateRef,
      ...(editedHash ? { expectedCandidateHash: editedHash } : {}),
    };
  }
  return result;
}

export function applyMcpAutowirePlanEdit(input: {
  describeResult: McpAutowirePlanEditDescribeResult;
  store?: McpAutowirePlanRevisionStore;
  putCandidateRef?: (candidate: Record<string, unknown>, candidateHash?: string) => string | undefined;
}): McpAutowirePlanEditApplyResult {
  const describe = input.describeResult;
  if (!describe.editedCandidate || !describe.editedCandidateHash) {
    return {
      ...describe,
      status: "invalid",
      nextToolName: undefined,
      nextToolInput: undefined,
    };
  }
  const candidateRef = input.putCandidateRef?.(describe.editedCandidate as unknown as Record<string, unknown>, describe.editedCandidateHash) ?? describe.candidateRef;
  const revision = input.store?.recordCandidate({
    candidate: describe.editedCandidate,
    source: "edit",
    summary: describe.reason ?? `Applied ${describe.operations.length} MCP autowire plan edit${describe.operations.length === 1 ? "" : "s"}.`,
    candidateRef,
    parentRevisionId: describe.parentRevisionId,
    edit: {
      reason: describe.reason,
      operations: describe.operations,
      permissionExpanding: describe.permissionExpanding,
      approvalReasons: describe.approvalReasons,
    },
  });
  return {
    ...describe,
    status: describe.validation.blockers.length ? "needs-review" : "applied",
    candidateRef,
    ...(revision ? { revision } : {}),
    nextToolName: candidateRef ? "ambient_mcp_autowire_review" : undefined,
    nextToolInput: candidateRef
      ? { candidateRef, expectedCandidateHash: describe.editedCandidateHash }
      : { candidate: describe.editedCandidate, expectedCandidateHash: describe.editedCandidateHash },
  };
}

export function describeMcpAutowireRuntimeRepair(input: McpAutowireRuntimeRepairDescribeInput): McpAutowireRuntimeRepairDescribeResult {
  const candidate = parseMcpAutowireCandidate(input.candidate);
  const operations = suggestedRuntimeRepairOperations(candidate, [input.failureText, input.logText].filter(Boolean).join("\n"));
  const detectedIssues = runtimeRepairDetectedIssues(candidate, [input.failureText, input.logText].filter(Boolean).join("\n"), operations);
  if (!operations.length) {
    return {
      status: "needs-more-context",
      serverId: input.serverId,
      workloadName: input.workloadName,
      candidateRef: input.candidateRef,
      parentRevisionId: input.parentRevisionId,
      detectedIssues,
      operations,
      guidance: [
        "No safe typed Autowire edit could be inferred from the provided runtime evidence.",
        "Run ambient_mcp_server_diagnostics and include the exact validation error, blocked URL/host, missing env name, or required host path.",
        "Do not edit ToolHive permission profiles or Ambient state files directly.",
      ],
    };
  }
  const editPreview = describeMcpAutowirePlanEdit({
    candidate,
    candidateRef: input.candidateRef,
    parentRevisionId: input.parentRevisionId,
    expectedCandidateHash: input.expectedCandidateHash,
    reason: input.reason ?? "Repair MCP runtime failure with typed Autowire plan edits.",
    operations,
  });
  return {
    status: editPreview.status === "invalid" ? "invalid" : "repair-available",
    serverId: input.serverId,
    workloadName: input.workloadName,
    candidateRef: input.candidateRef,
    parentRevisionId: input.parentRevisionId,
    detectedIssues,
    operations,
    editPreview,
    guidance: [
      "Review the typed repair operations and approval reasons.",
      "If the user approves, call ambient_mcp_runtime_repair_apply with the same selector and evidence.",
      "After apply, route through ambient_mcp_autowire_review and the normal install/reinstall tool; do not mutate raw ToolHive state.",
    ],
  };
}

export function mcpAutowirePlanRevisionListText(revisions: McpAutowirePlanRevision[]): string {
  if (!revisions.length) return "No MCP autowire plan revisions match that query.";
  return [
    `MCP autowire plan revisions: ${revisions.length}`,
    ...revisions.map((revision) => [
      `- ${revision.revisionId}`,
      `  candidate: ${revision.candidateId} ${revision.candidateRef ? `(${revision.candidateRef})` : ""}`,
      `  source: ${revision.source}; hash: ${revision.candidateHash}`,
      `  status: ${revision.validation.status}; blockers: ${revision.validation.blockers.length}; warnings: ${revision.validation.warnings.length}`,
      revision.serverId ? `  server: ${revision.serverId}${revision.workloadName ? ` / ${revision.workloadName}` : ""}` : undefined,
      `  summary: ${revision.summary}`,
    ].filter(Boolean).join("\n")),
  ].join("\n");
}

export function mcpAutowirePlanRevisionReadText(revision: McpAutowirePlanRevision): string {
  return [
    `MCP autowire plan revision ${revision.revisionId}`,
    `Candidate: ${revision.candidateId}`,
    `Source: ${revision.source}`,
    `Hash: ${revision.candidateHash}`,
    revision.candidateRef ? `Candidate ref: ${revision.candidateRef}` : undefined,
    revision.parentRevisionId ? `Parent revision: ${revision.parentRevisionId}` : undefined,
    revision.serverId ? `Server: ${revision.serverId}${revision.workloadName ? ` / ${revision.workloadName}` : ""}` : undefined,
    `Created: ${revision.createdAt}`,
    `Summary: ${revision.summary}`,
    "",
    `Validation: ${revision.validation.status} (${revision.validation.outcome})`,
    revision.validation.blockers.length ? `Blockers:\n${revision.validation.blockers.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}` : "Blockers: none.",
    revision.validation.warnings.length ? `Warnings:\n${revision.validation.warnings.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}` : "Warnings: none.",
    revision.edit ? [
      "",
      `Edit operations: ${revision.edit.operations.length}`,
      ...revision.edit.operations.map((operation) => `- ${editOperationSummary(operation)}`),
      `Permission expanding: ${revision.edit.permissionExpanding ? "yes" : "no"}`,
    ].join("\n") : undefined,
    "",
    "Candidate JSON:",
    JSON.stringify(revision.candidate, null, 2),
  ].filter(Boolean).join("\n");
}

export function mcpAutowirePlanEditText(result: McpAutowirePlanEditDescribeResult | McpAutowirePlanEditApplyResult): string {
  const applied = "revision" in result && result.revision;
  return [
    applied ? "MCP autowire plan edit applied." : "MCP autowire plan edit preview.",
    `Status: ${result.status}`,
    `Original hash: ${result.originalCandidateHash}`,
    result.editedCandidateHash ? `Edited hash: ${result.editedCandidateHash}` : undefined,
    applied ? `Revision: ${result.revision?.revisionId}` : undefined,
    result.candidateRef ? `Candidate ref: ${result.candidateRef}` : undefined,
    "",
    `Operations: ${result.operations.length}`,
    ...result.operations.map((operation) => `- ${editOperationSummary(operation)}`),
    result.noOpReasons.length ? `No-op notes:\n${result.noOpReasons.map((reason) => `- ${reason}`).join("\n")}` : undefined,
    result.changedPaths.length ? `Changed paths:\n${result.changedPaths.map((path) => `- ${path}`).join("\n")}` : "Changed paths: none.",
    "",
    `Approval required: yes`,
    `Permission expanding: ${result.permissionExpanding ? "yes" : "no"}`,
    result.approvalReasons.length ? `Approval reasons:\n${result.approvalReasons.map((reason) => `- ${reason}`).join("\n")}` : "Approval reasons: plan edits always require explicit user approval.",
    "",
    `Validation: ${result.validation.status} (${result.validation.outcome})`,
    result.validation.blockers.length ? `Blockers:\n${result.validation.blockers.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}` : "Blockers: none.",
    result.validation.warnings.length ? `Warnings:\n${result.validation.warnings.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}` : "Warnings: none.",
    result.nextToolName ? `Next tool: ${result.nextToolName} ${JSON.stringify(result.nextToolInput)}` : undefined,
  ].filter(Boolean).join("\n");
}

export function mcpAutowireRuntimeRepairText(result: McpAutowireRuntimeRepairDescribeResult | (McpAutowireRuntimeRepairDescribeResult & { applyResult?: McpAutowirePlanEditApplyResult })): string {
  const applied = "applyResult" in result && result.applyResult;
  return [
    applied ? "MCP runtime repair plan applied." : "MCP runtime repair preview.",
    `Status: ${applied ? result.applyResult?.status : result.status}`,
    result.serverId ? `Server: ${result.serverId}${result.workloadName ? ` / ${result.workloadName}` : ""}` : undefined,
    result.candidateRef ? `Candidate ref: ${result.candidateRef}` : undefined,
    result.parentRevisionId ? `Parent revision: ${result.parentRevisionId}` : undefined,
    "",
    result.detectedIssues.length ? `Detected issues:\n${result.detectedIssues.map((issue) => `- ${issue}`).join("\n")}` : "Detected issues: none.",
    result.operations.length ? `Suggested operations:\n${result.operations.map((operation) => `- ${editOperationSummary(operation)}`).join("\n")}` : "Suggested operations: none.",
    "",
    ...result.guidance.map((item) => `- ${item}`),
    result.editPreview ? [
      "",
      mcpAutowirePlanEditText(applied ? result.applyResult ?? result.editPreview : result.editPreview),
    ].join("\n") : undefined,
  ].filter(Boolean).join("\n");
}

function normalizeEditOperations(value: unknown[]): McpAutowirePlanEditOperation[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("operations must contain at least one MCP autowire plan edit operation.");
  return value.map((operation, index) => normalizeEditOperation(operation, index));
}

function suggestedRuntimeRepairOperations(candidate: McpAutowireCandidate, evidenceText: string): McpAutowirePlanEditOperation[] {
  const operations: McpAutowirePlanEditOperation[] = [];
  const network = suggestedNetworkRepair(candidate, evidenceText);
  if (network) operations.push(network);
  operations.push(...suggestedFilesystemRepairs(candidate, evidenceText));
  operations.push(...suggestedPackageArgumentRepairs(candidate, evidenceText));
  operations.push(...suggestedSecretRepairs(candidate, evidenceText));
  operations.push(...suggestedValidationRepairs(candidate, evidenceText));
  return operations;
}

function suggestedNetworkRepair(candidate: McpAutowireCandidate, evidenceText: string): McpAutowirePlanEditOperation | undefined {
  if (!evidenceText.trim()) return undefined;
  if (!/(network|egress|permission|denied|blocked|allowlist|connect|fetch|http|https|host)/i.test(evidenceText)) return undefined;
  if (candidate.permissions.network.mode === "broad") return undefined;
  const existingHosts = new Set(candidate.permissions.network.allowHosts.map((host) => host.toLowerCase()));
  const existingPorts = new Set(candidate.permissions.network.allowPorts);
  const hosts = new Set<string>();
  const ports = new Set<number>();
  for (const target of extractNetworkTargets(evidenceText)) {
    if (!existingHosts.has(target.host)) hosts.add(target.host);
    if (target.port && !existingPorts.has(target.port)) ports.add(target.port);
  }
  if (!hosts.size && !ports.size) return undefined;
  return {
    op: "network.allowlist.add",
    hosts: [...hosts],
    ports: ports.size ? [...ports] : undefined,
    justification: "Runtime evidence shows the MCP server attempted to reach this host and was blocked by the current network plan.",
  };
}

function suggestedSecretRepairs(candidate: McpAutowireCandidate, evidenceText: string): McpAutowirePlanEditOperation[] {
  if (!evidenceText.trim()) return [];
  const declared = new Set(candidate.secrets.map((secret) => secret.name));
  const operations: McpAutowirePlanEditOperation[] = [];
  const lines = evidenceText.split(/\r?\n/).filter((line) =>
    /(environment|env var|api key|token|secret)/i.test(line) ||
    /\b(?:missing|required|not set)\b.*\b(?:environment|env|variable|key|token|secret)\b/i.test(line)
  );
  for (const line of lines) {
    const matches = line.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
    for (const envName of matches) {
      if (declared.has(envName) || /^(HTTP|HTTPS|URL|JSON|MCP|API|ENV|PATH|HOME|ENOENT|EACCES|EPERM)$/.test(envName)) continue;
      declared.add(envName);
      operations.push({
        op: "secret.declare",
        name: envName,
        required: true,
        purpose: `Runtime evidence reports missing environment variable ${envName}.`,
      });
    }
  }
  return operations;
}

function suggestedFilesystemRepairs(candidate: McpAutowireCandidate, evidenceText: string): McpAutowirePlanEditOperation[] {
  if (!evidenceText.trim()) return [];
  if (!/(mount|filesystem|file|directory|ENOENT|no such file|not mounted|permission denied)/i.test(evidenceText)) return [];
  const existing = new Set(candidate.permissions.filesystem.extraMounts.flatMap((mount) => [
    mount.path,
    mount.containerPath,
  ].filter(Boolean)));
  const operations: McpAutowirePlanEditOperation[] = [];
  for (const mount of extractMountRepairTargets(evidenceText)) {
    if (existing.has(mount.path) || existing.has(mount.containerPath)) continue;
    existing.add(mount.path);
    existing.add(mount.containerPath);
    operations.push({
      op: "filesystem.mount.add",
      path: mount.path,
      containerPath: mount.containerPath,
      mode: mount.mode,
      purpose: "Runtime diagnostics identified this exact host/container mount requirement.",
    });
  }
  return operations;
}

function suggestedPackageArgumentRepairs(candidate: McpAutowireCandidate, evidenceText: string): McpAutowirePlanEditOperation[] {
  if (!evidenceText.trim() || !candidate.runtime.package) return [];
  const operations: McpAutowirePlanEditOperation[] = [];
  const existing = candidate.runtime.package.packageArguments;
  for (const line of evidenceText.split(/\r?\n/)) {
    if (/(unknown|unrecognized|unsupported|invalid)\s+(?:option|flag|argument|arg)/i.test(line)) {
      const flag = extractFlagFromLine(line);
      if (flag && existing.some((argument) => argument.name === flag || argument.valueHint === flag)) {
        operations.push({
          op: "runtime.packageArgument.remove",
          name: flag,
        });
      }
      continue;
    }
    if (!/(missing|required|requires|needs|expected).*(argument|arg|flag|switch|option|command)/i.test(line)) continue;
    const argument = extractPackageArgumentFromLine(line);
    if (!argument) continue;
    const duplicate = existing.some((candidateArgument) =>
      candidateArgument.type === argument.type &&
      candidateArgument.name === argument.name &&
      candidateArgument.valueHint === argument.valueHint
    );
    if (!duplicate) {
      operations.push({
        op: "runtime.packageArgument.add",
        argument,
        reason: "Runtime diagnostics identified this exact package/server argument requirement.",
      });
    }
  }
  return operations;
}

function suggestedValidationRepairs(candidate: McpAutowireCandidate, evidenceText: string): McpAutowirePlanEditOperation[] {
  if (!evidenceText.trim()) return [];
  if (!/(discovered|available|exposed|returned|descriptor).*\btools?\b/i.test(evidenceText)) return [];
  const existing = new Set(candidate.validationPlan.expectedTools);
  const tools = extractDiscoveredToolNames(evidenceText).filter((tool) => !existing.has(tool));
  return tools.length ? [{ op: "validation.expectedTools.add", tools }] : [];
}

function runtimeRepairDetectedIssues(
  candidate: McpAutowireCandidate,
  evidenceText: string,
  operations: McpAutowirePlanEditOperation[],
): string[] {
  const issues: string[] = operations.map((operation) => editOperationSummary(operation));
  if (/(ENOENT|no such file|file not found|missing file|mount)/i.test(evidenceText) && !operations.some((operation) => operation.op.startsWith("filesystem."))) {
    issues.push("Filesystem-related failure text was present, but Ambient needs an explicit host path, container path, mode, and purpose before proposing a mount edit.");
  }
  if (!issues.length && candidate.validationPlan.expectedTools.length === 0 && /tools\/list|descriptor|no tools/i.test(evidenceText)) {
    issues.push("Tool descriptor validation failed, but no safe plan edit was inferred. Capture diagnostics and check for upstream server startup errors.");
  }
  return issues;
}

function extractNetworkTargets(text: string): Array<{ host: string; port?: number }> {
  const targets: Array<{ host: string; port?: number }> = [];
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>),]+/gi)) {
    try {
      const url = new URL(match[0]);
      const port = url.port ? Number(url.port) : url.protocol === "http:" ? 80 : 443;
      targets.push({ host: normalizeHost(url.hostname), port });
    } catch {
      // Ignore malformed URL-shaped text; repair describe must stay best-effort.
    }
  }
  for (const match of text.matchAll(/\b(?:host|hostname|domain|connect(?:ion)? to|blocked)\s+([A-Za-z0-9.-]+\.[A-Za-z]{2,})(?::(\d{1,5}))?/gi)) {
    try {
      targets.push({
        host: normalizeHost(match[1]),
        ...(match[2] ? { port: Number(match[2]) } : {}),
      });
    } catch {
      // Ignore non-host snippets.
    }
  }
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (!Number.isFinite(target.port ?? 443)) return false;
    const key = `${target.host}:${target.port ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractMountRepairTargets(text: string): Array<{ path: string; containerPath: string; mode: "read-only" | "read-write" }> {
  const targets: Array<{ path: string; containerPath: string; mode: "read-only" | "read-write" }> = [];
  for (const line of text.split(/\r?\n/)) {
    const keyedHostPath = keyedPathValue(line, ["hostPath", "host_path", "host path"]);
    const keyedContainerPath = keyedPathValue(line, ["containerPath", "container_path", "container path"]);
    if (keyedHostPath && keyedContainerPath) {
      targets.push({
        path: keyedHostPath,
        containerPath: keyedContainerPath,
        mode: repairMountMode(line),
      });
      continue;
    }
    const arrow = line.match(/\bmount\b[^/\n]*(\/[^\s"'`,;]+)\s*(?:->|=>|to)\s*(\/[^\s"'`,;]+)/i);
    if (arrow?.[1] && arrow[2]) {
      targets.push({
        path: cleanPathToken(arrow[1]),
        containerPath: cleanPathToken(arrow[2]),
        mode: repairMountMode(line),
      });
    }
  }
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (!target.path.startsWith("/") || !target.containerPath.startsWith("/")) return false;
    const key = `${target.path}\0${target.containerPath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function keyedPathValue(line: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const match = line.match(new RegExp(`\\b${escapedKey}\\b\\s*[:=]\\s*("[^"]+"|'[^']+'|\`[^\`]+\`|/[^\\s"',;]+)`, "i"));
    if (match?.[1]) return cleanPathToken(match[1]);
  }
  return undefined;
}

function cleanPathToken(value: string): string {
  return value.trim().replace(/^["'`]+|["'`.,;:]+$/g, "");
}

function repairMountMode(line: string): "read-only" | "read-write" {
  return /\b(read-write|rw|writeable|writable)\b/i.test(line) ? "read-write" : "read-only";
}

function extractPackageArgumentFromLine(line: string): Extract<McpAutowirePlanEditOperation, { op: "runtime.packageArgument.add" }>["argument"] | undefined {
  const flagWithEquals = line.match(/(?:^|\s)(-{1,2}[A-Za-z0-9][\w.-]*)=([^\s`"',;]+)/);
  if (flagWithEquals?.[1] && flagWithEquals[2]) {
    return {
      type: "flag",
      name: flagWithEquals[1],
      valueHint: cleanArgumentToken(flagWithEquals[2]),
      isFixed: true,
    };
  }
  const flag = extractFlagFromLine(line);
  if (flag) {
    const value = line.match(new RegExp(`${escapeRegExp(flag)}\\s+(?:value\\s+)?([A-Za-z0-9_./:@-]+)`, "i"))?.[1];
    if (value && !value.startsWith("-") && !/(argument|arg|flag|switch|option|command|required|missing|requires|needs|expected)$/i.test(value)) {
      return { type: "flag", name: flag, valueHint: cleanArgumentToken(value), isFixed: true };
    }
    return { type: "switch", name: flag, isFixed: true };
  }
  const positional = line.match(/\b(?:positional\s+)?(?:argument|arg)\s+("[^"]+"|'[^']+'|`[^`]+`|\/[^\s"',;]+)/i)?.[1];
  if (positional) {
    return {
      type: "positional",
      valueHint: cleanArgumentToken(positional),
      isFixed: true,
    };
  }
  return undefined;
}

function extractFlagFromLine(line: string): string | undefined {
  return line.match(/(?:^|\s)(-{1,2}[A-Za-z0-9][\w.-]*)\b/)?.[1];
}

function cleanArgumentToken(value: string): string {
  return value.trim().replace(/^["'`]+|["'`.,;:]+$/g, "");
}

function extractDiscoveredToolNames(text: string): string[] {
  const stopWords = new Set([
    "available",
    "descriptor",
    "discovered",
    "exposed",
    "returned",
    "server",
    "tool",
    "tools",
    "validation",
  ]);
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/(discovered|available|exposed|returned|descriptor).*\btools?\b/i.test(line)) continue;
    const markerPattern = /\btools?\b\s*(?:are|were|:|-)?\s*/gi;
    let afterMarker = "";
    let marker: RegExpExecArray | null;
    while ((marker = markerPattern.exec(line))) {
      afterMarker = line.slice(markerPattern.lastIndex);
    }
    for (const match of afterMarker.matchAll(/\b[A-Za-z][A-Za-z0-9_-]{1,80}\b/g)) {
      const name = match[0];
      if (stopWords.has(name.toLowerCase())) continue;
      if (/^\d+$/.test(name)) continue;
      if (!names.includes(name)) names.push(name);
      if (names.length >= 20) return names;
    }
  }
  return names;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEditOperation(value: unknown, index: number): McpAutowirePlanEditOperation {
  const object = objectInput(value, `operations[${index}]`);
  const op = requiredString(object, "op", `operations[${index}]`);
  if (op === "network.allowlist.add") {
    const hosts = stringArray(object.hosts).map(normalizeHost).filter(uniqueString);
    if (!hosts.length) throw new Error(`operations[${index}].hosts must include at least one host.`);
    return {
      op,
      hosts,
      ports: numberArray(object.ports, 1, 65535),
      justification: requiredString(object, "justification", `operations[${index}]`),
    };
  }
  if (op === "network.mode.set") {
    const mode = requiredString(object, "mode", `operations[${index}]`);
    if (!["disabled", "local-only", "allowlist", "isolated", "broad"].includes(mode)) {
      throw new Error(`operations[${index}].mode is not a supported network mode.`);
    }
    return {
      op,
      mode: mode as Extract<McpAutowirePlanEditOperation, { op: "network.mode.set" }>["mode"],
      justification: requiredString(object, "justification", `operations[${index}]`),
    };
  }
  if (op === "filesystem.mount.add") {
    const mode = requiredString(object, "mode", `operations[${index}]`);
    if (mode !== "read-only" && mode !== "read-write") throw new Error(`operations[${index}].mode must be read-only or read-write.`);
    const path = requiredString(object, "path", `operations[${index}]`);
    const containerPath = requiredString(object, "containerPath", `operations[${index}]`);
    if (!path.startsWith("/")) throw new Error(`operations[${index}].path must be an absolute host path.`);
    if (!containerPath.startsWith("/")) throw new Error(`operations[${index}].containerPath must be an absolute container path.`);
    return {
      op,
      path,
      containerPath,
      mode,
      purpose: requiredString(object, "purpose", `operations[${index}]`),
    };
  }
  if (op === "filesystem.mount.remove") {
    const path = optionalString(object.path);
    const containerPath = optionalString(object.containerPath);
    if (!path && !containerPath) throw new Error(`operations[${index}] must include path or containerPath.`);
    return stripUndefined({ op, path, containerPath });
  }
  if (op === "runtime.packageArgument.add") {
    const argument = objectInput(object.argument, `operations[${index}].argument`);
    const type = requiredString(argument, "type", `operations[${index}].argument`);
    if (!["positional", "flag", "switch", "env", "unknown"].includes(type)) throw new Error(`operations[${index}].argument.type is invalid.`);
    return {
      op,
      argument: stripUndefined({
        type: type as Extract<McpAutowirePlanEditOperation, { op: "runtime.packageArgument.add" }>["argument"]["type"],
        name: optionalString(argument.name),
        valueHint: optionalString(argument.valueHint),
        isFixed: optionalBoolean(argument.isFixed) ?? false,
      }),
      reason: requiredString(object, "reason", `operations[${index}]`),
    };
  }
  if (op === "runtime.packageArgument.remove") {
    const type = optionalString(object.type);
    if (type && !["positional", "flag", "switch", "env", "unknown"].includes(type)) throw new Error(`operations[${index}].type is invalid.`);
    return stripUndefined({
      op,
      type: type as Extract<McpAutowirePlanEditOperation, { op: "runtime.packageArgument.remove" }>["type"],
      name: optionalString(object.name),
      valueHint: optionalString(object.valueHint),
    });
  }
  if (op === "secret.declare") {
    return {
      op,
      name: requiredString(object, "name", `operations[${index}]`).trim().toUpperCase(),
      required: optionalBoolean(object.required) ?? true,
      purpose: requiredString(object, "purpose", `operations[${index}]`),
      evidenceRefs: stringArray(object.evidenceRefs),
    };
  }
  if (op === "validation.expectedTools.add") {
    const tools = stringArray(object.tools).filter(uniqueString);
    if (!tools.length) throw new Error(`operations[${index}].tools must include at least one tool name.`);
    return { op, tools };
  }
  if (op === "validation.smokeCall.set") {
    return {
      op,
      tool: requiredString(object, "tool", `operations[${index}]`),
      arguments: objectInput(object.arguments, `operations[${index}].arguments`),
    };
  }
  throw new Error(`Unsupported MCP autowire plan edit operation ${op}.`);
}

function applyEditOperation(
  candidate: McpAutowireCandidate,
  operation: McpAutowirePlanEditOperation,
  changedPaths: Set<string>,
  noOpReasons: string[],
): void {
  if (operation.op === "network.allowlist.add") {
    if (candidate.permissions.network.mode !== "allowlist") {
      candidate.permissions.network.mode = "allowlist";
      changedPaths.add("$.permissions.network.mode");
    }
    candidate.permissions.network.justification = operation.justification;
    changedPaths.add("$.permissions.network.justification");
    for (const host of operation.hosts) {
      if (!candidate.permissions.network.allowHosts.includes(host)) {
        candidate.permissions.network.allowHosts.push(host);
        changedPaths.add("$.permissions.network.allowHosts");
      } else {
        noOpReasons.push(`Network host ${host} was already allowlisted.`);
      }
    }
    for (const port of operation.ports ?? []) {
      if (!candidate.permissions.network.allowPorts.includes(port)) {
        candidate.permissions.network.allowPorts.push(port);
        changedPaths.add("$.permissions.network.allowPorts");
      } else {
        noOpReasons.push(`Network port ${port} was already allowlisted.`);
      }
    }
    return;
  }
  if (operation.op === "network.mode.set") {
    if (candidate.permissions.network.mode === operation.mode) {
      noOpReasons.push(`Network mode was already ${operation.mode}.`);
    } else {
      candidate.permissions.network.mode = operation.mode;
      changedPaths.add("$.permissions.network.mode");
    }
    candidate.permissions.network.justification = operation.justification;
    changedPaths.add("$.permissions.network.justification");
    return;
  }
  if (operation.op === "filesystem.mount.add") {
    const existing = candidate.permissions.filesystem.extraMounts.find((mount) =>
      mount.path === operation.path || mount.containerPath === operation.containerPath,
    );
    if (existing) {
      existing.path = operation.path;
      existing.containerPath = operation.containerPath;
      existing.mode = operation.mode;
      existing.purpose = operation.purpose;
      noOpReasons.push(`Updated existing filesystem mount for ${operation.path}.`);
    } else {
      candidate.permissions.filesystem.extraMounts.push({
        path: operation.path,
        containerPath: operation.containerPath,
        mode: operation.mode,
        purpose: operation.purpose,
      });
    }
    changedPaths.add("$.permissions.filesystem.extraMounts");
    return;
  }
  if (operation.op === "filesystem.mount.remove") {
    const before = candidate.permissions.filesystem.extraMounts.length;
    candidate.permissions.filesystem.extraMounts = candidate.permissions.filesystem.extraMounts.filter((mount) =>
      !(operation.path && mount.path === operation.path) && !(operation.containerPath && mount.containerPath === operation.containerPath),
    );
    if (candidate.permissions.filesystem.extraMounts.length === before) {
      noOpReasons.push(`No filesystem mount matched ${operation.path ?? operation.containerPath}.`);
    } else {
      changedPaths.add("$.permissions.filesystem.extraMounts");
    }
    return;
  }
  if (operation.op === "runtime.packageArgument.add") {
    if (!candidate.runtime.package) {
      noOpReasons.push("No runtime.package exists, so no package argument was added.");
      return;
    }
    const exists = candidate.runtime.package.packageArguments.some((argument) =>
      argument.type === operation.argument.type &&
      argument.name === operation.argument.name &&
      argument.valueHint === operation.argument.valueHint,
    );
    if (exists) {
      noOpReasons.push(`Package argument ${packageArgumentLabel(operation.argument)} already exists.`);
      return;
    }
    candidate.runtime.package.packageArguments.push(operation.argument);
    changedPaths.add("$.runtime.package.packageArguments");
    return;
  }
  if (operation.op === "runtime.packageArgument.remove") {
    if (!candidate.runtime.package) {
      noOpReasons.push("No runtime.package exists, so no package argument was removed.");
      return;
    }
    const before = candidate.runtime.package.packageArguments.length;
    candidate.runtime.package.packageArguments = candidate.runtime.package.packageArguments.filter((argument) =>
      !(operation.type ? argument.type === operation.type : true) ||
      !(operation.name ? argument.name === operation.name : true) ||
      !(operation.valueHint ? argument.valueHint === operation.valueHint : true),
    );
    if (candidate.runtime.package.packageArguments.length === before) noOpReasons.push("No package argument matched the remove operation.");
    else changedPaths.add("$.runtime.package.packageArguments");
    return;
  }
  if (operation.op === "secret.declare") {
    const evidenceRefs = operation.evidenceRefs?.length ? operation.evidenceRefs : candidate.permissions.evidenceRefs;
    const existing = candidate.secrets.find((secret) => secret.name === operation.name);
    if (existing) {
      existing.required = operation.required;
      existing.purpose = operation.purpose;
      existing.evidenceRefs = evidenceRefs;
      noOpReasons.push(`Updated existing secret declaration ${operation.name}.`);
    } else {
      candidate.secrets.push({
        name: operation.name,
        required: operation.required,
        secret: true,
        purpose: operation.purpose,
        evidenceRefs,
      });
    }
    changedPaths.add("$.secrets");
    return;
  }
  if (operation.op === "validation.expectedTools.add") {
    for (const tool of operation.tools) {
      if (!candidate.validationPlan.expectedTools.includes(tool)) {
        candidate.validationPlan.expectedTools.push(tool);
        changedPaths.add("$.validationPlan.expectedTools");
      } else {
        noOpReasons.push(`Expected tool ${tool} was already declared.`);
      }
    }
    return;
  }
  if (operation.op === "validation.smokeCall.set") {
    candidate.validationPlan.smokeCall = {
      tool: operation.tool,
      arguments: operation.arguments,
    };
    changedPaths.add("$.validationPlan.smokeCall");
  }
}

function editPermissionExpansion(
  before: McpAutowireCandidate,
  after: McpAutowireCandidate,
  operations: McpAutowirePlanEditOperation[],
): { permissionExpanding: boolean; approvalReasons: string[] } {
  const reasons = new Set<string>();
  if (networkModeRank(after.permissions.network.mode) > networkModeRank(before.permissions.network.mode)) {
    reasons.add(`Network mode expands from ${before.permissions.network.mode} to ${after.permissions.network.mode}.`);
  }
  const beforeHosts = new Set(before.permissions.network.allowHosts);
  const beforePorts = new Set(before.permissions.network.allowPorts);
  const addedHosts = after.permissions.network.allowHosts.filter((host) => !beforeHosts.has(host));
  const addedPorts = after.permissions.network.allowPorts.filter((port) => !beforePorts.has(port));
  if (addedHosts.length) reasons.add(`Adds network host allowlist entries: ${addedHosts.join(", ")}.`);
  if (addedPorts.length) reasons.add(`Adds network port allowlist entries: ${addedPorts.join(", ")}.`);
  if (after.permissions.filesystem.workspaceWrite && !before.permissions.filesystem.workspaceWrite) reasons.add("Adds workspace write access.");
  const beforeMountKeys = new Set(before.permissions.filesystem.extraMounts.map((mount) => `${mount.path}\0${mount.containerPath ?? ""}\0${mount.mode}`));
  const addedMounts = after.permissions.filesystem.extraMounts.filter((mount) => !beforeMountKeys.has(`${mount.path}\0${mount.containerPath ?? ""}\0${mount.mode}`));
  if (addedMounts.length) reasons.add(`Adds filesystem mount${addedMounts.length === 1 ? "" : "s"}: ${addedMounts.map((mount) => `${mount.path}:${mount.containerPath ?? "default"}:${mount.mode}`).join(", ")}.`);
  const beforeSecrets = new Set(before.secrets.map((secret) => secret.name));
  const addedSecrets = after.secrets.filter((secret) => !beforeSecrets.has(secret.name));
  if (addedSecrets.length) reasons.add(`Adds secret declaration${addedSecrets.length === 1 ? "" : "s"}: ${addedSecrets.map((secret) => secret.name).join(", ")}.`);
  if (operations.length) reasons.add("All MCP autowire plan edits require explicit user approval before they are recorded.");
  return {
    permissionExpanding: [...reasons].some((reason) => !reason.startsWith("All MCP")),
    approvalReasons: [...reasons],
  };
}

function editOperationSummary(operation: McpAutowirePlanEditOperation): string {
  if (operation.op === "network.allowlist.add") return `add network allowlist hosts=${operation.hosts.join(",")} ports=${operation.ports?.join(",") ?? "none"}: ${operation.justification}`;
  if (operation.op === "network.mode.set") return `set network mode ${operation.mode}: ${operation.justification}`;
  if (operation.op === "filesystem.mount.add") return `add filesystem mount ${operation.path} -> ${operation.containerPath} (${operation.mode}): ${operation.purpose}`;
  if (operation.op === "filesystem.mount.remove") return `remove filesystem mount ${operation.path ?? operation.containerPath}`;
  if (operation.op === "runtime.packageArgument.add") return `add package argument ${packageArgumentLabel(operation.argument)}: ${operation.reason}`;
  if (operation.op === "runtime.packageArgument.remove") return `remove package argument ${[operation.type, operation.name, operation.valueHint].filter(Boolean).join(":") || "matching selector"}`;
  if (operation.op === "secret.declare") return `declare ${operation.required ? "required" : "optional"} secret ${operation.name}: ${operation.purpose}`;
  if (operation.op === "validation.expectedTools.add") return `add expected tools ${operation.tools.join(", ")}`;
  return `set smoke call ${operation.tool}`;
}

function packageArgumentLabel(argument: { type: string; name?: string; valueHint?: string }): string {
  return [argument.type, argument.name, argument.valueHint].filter(Boolean).join(":");
}

function matchesRevisionFilter(revision: McpAutowirePlanRevision, input: McpAutowirePlanRevisionListInput): boolean {
  if (input.candidateRef && revision.candidateRef !== input.candidateRef) return false;
  if (input.candidateHash && revision.candidateHash !== input.candidateHash) return false;
  if (input.serverId && revision.serverId !== input.serverId) return false;
  if (input.workloadName && revision.workloadName !== input.workloadName) return false;
  return true;
}

function latestRevision(revisions: McpAutowirePlanRevision[]): McpAutowirePlanRevision | undefined {
  return revisions.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function readStoredRevisions(storagePath: string | undefined): McpAutowirePlanRevision[] {
  if (!storagePath) return [];
  try {
    const parsed = JSON.parse(readFileSync(storagePath, "utf8")) as StoredRevisionFile;
    if (parsed?.schemaVersion !== MCP_AUTOWIRE_PLAN_REVISION_SCHEMA_VERSION || !Array.isArray(parsed.revisions)) return [];
    return parsed.revisions.filter(isStoredRevision);
  } catch {
    return [];
  }
}

function persistStoredRevisions(storagePath: string | undefined, revisions: McpAutowirePlanRevision[]): void {
  if (!storagePath) return;
  const file: StoredRevisionFile = {
    schemaVersion: MCP_AUTOWIRE_PLAN_REVISION_SCHEMA_VERSION,
    revisions,
  };
  mkdirSync(dirname(storagePath), { recursive: true, mode: 0o700 });
  const tempPath = `${storagePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, JSON.stringify(file, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, storagePath);
}

function isStoredRevision(value: unknown): value is McpAutowirePlanRevision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const revision = value as Partial<McpAutowirePlanRevision>;
  return typeof revision.revisionId === "string" &&
    typeof revision.candidateHash === "string" &&
    typeof revision.candidateId === "string" &&
    typeof revision.source === "string" &&
    typeof revision.summary === "string" &&
    Boolean(revision.candidate && typeof revision.candidate === "object" && !Array.isArray(revision.candidate)) &&
    Boolean(revision.validation && typeof revision.validation === "object" && !Array.isArray(revision.validation)) &&
    typeof revision.createdAt === "string";
}

function revisionIdFor(input: {
  candidateId: string;
  candidateHash: string;
  createdAt: string;
  source: string;
  parentRevisionId?: string;
}): string {
  const hash = sha256Hex([input.candidateId, input.candidateHash, input.createdAt, input.source, input.parentRevisionId ?? ""].join("\0")).slice(0, 12);
  return `ambient-mcp-revision:${safeRefSegment(input.candidateId)}:${input.candidateHash.slice(0, 12)}:${hash}`;
}

function cloneCandidate(candidate: McpAutowireCandidate): McpAutowireCandidate {
  return parseMcpAutowireCandidate(JSON.parse(JSON.stringify(candidate)));
}

function objectInput(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string, label: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}.${key} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim()) : [];
}

function numberArray(value: unknown, min: number, max: number): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map((entry) => Math.floor(Number(entry))).filter((entry) => Number.isInteger(entry) && entry >= min && entry <= max);
  return result.length ? result.filter((entry, index) => result.indexOf(entry) === index) : undefined;
}

function normalizeHost(value: string): string {
  const trimmed = value.trim();
  let host = trimmed;
  if (/^https?:\/\//i.test(trimmed)) host = new URL(trimmed).hostname;
  if (host.includes("/") || host.includes("*") || /\s/.test(host)) throw new Error(`Invalid network allowlist host ${value}.`);
  host = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!host) throw new Error("Network allowlist host cannot be empty.");
  return host;
}

function uniqueString(value: string, index: number, array: string[]): boolean {
  return array.indexOf(value) === index;
}

function networkModeRank(mode: McpAutowireCandidate["permissions"]["network"]["mode"]): number {
  if (mode === "disabled") return 0;
  if (mode === "local-only") return 1;
  if (mode === "allowlist") return 2;
  if (mode === "isolated") return 2;
  return 3;
}

function safeRefSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "candidate";
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
