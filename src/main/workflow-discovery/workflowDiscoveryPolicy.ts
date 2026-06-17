import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import type {
  AmbientPermissionGrant,
  PermissionAuditDecisionSource,
  PermissionGrantActionKind,
  PermissionGrantTargetKind,
  PermissionMode,
  PermissionRequest,
  PermissionRisk,
  WorkflowDiscoveryContextEvidence,
  WorkflowDiscoveryContextCapability,
  SearchRoutingSettings,
} from "../../shared/types";
import { findMatchingPermissionGrant, permissionGrantTargetHash } from "../permissions/permissionGrants";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import type { WorkflowConnectorDescriptor } from "../workflow/workflowConnectors";

const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_CONTENT_FILES = 6;
const DEFAULT_MAX_CONTENT_BYTES = 2_048;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".ambient", ".ambient-codex", "dist", "out", "release", "build", ".next"]);
const SECRET_FILE_PATTERN = /(^\.env($|\.)|id_rsa|id_dsa|\.pem$|\.p12$|\.pfx$|secret|token|credential|password)/i;
const DATA_FILE_EXTENSIONS = new Set([".md", ".txt", ".csv", ".json", ".jsonl", ".yaml", ".yml", ".tsv", ".xlsx", ".docx", ".pdf"]);
const TEXT_CONTENT_EXTENSIONS = new Set([".md", ".txt", ".csv", ".json", ".jsonl", ".yaml", ".yml", ".tsv"]);
const REDACTED = "[REDACTED]";

export interface WorkflowDiscoveryFileCandidate {
  path: string;
  extension: string;
  sizeBytes: number;
  reason: string;
  mtimeMs?: number;
  metadataAccess?: WorkflowDiscoveryPolicyDecisionAction;
}

export interface WorkflowDiscoverySkippedPath {
  path: string;
  reason: string;
}

export interface WorkflowDiscoveryConnectorCapability {
  connectorId: string;
  label: string;
  accountLabels: string[];
  operationLabels: string[];
  operations: Array<{
    name: string;
    label: string;
    description: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    sideEffects: string;
    supportsDryRun: boolean;
    mutationPolicy: string;
    defaultTimeoutMs: number;
  }>;
  policy: string;
}

export interface WorkflowDiscoveryPluginCapability {
  toolName: string;
  originalToolName?: string;
  label: string;
  description?: string;
  parameters?: unknown;
  pluginId: string;
  pluginName: string;
  serverName: string;
  startable: boolean;
}

export interface WorkflowDiscoveryAmbientCliCapability {
  capabilityId: string;
  registryPluginId: string;
  packageId: string;
  packageName: string;
  command: string;
  description?: string;
  availability: "available" | "unavailable";
  availabilityReason: string;
  risk: string[];
  missingEnv: string[];
  whyMatched: string[];
}

export type WorkflowDiscoveryStage = "initial_discovery" | "followup_discovery" | "revision_discovery" | "debug_rewrite_discovery";
export type WorkflowDiscoveryPolicyDecisionAction = "allow" | "allow_by_full_access" | "allow_by_persistent_grant" | "prompt" | "deny";
export interface WorkflowDiscoveryPolicyDecision {
  stage: WorkflowDiscoveryStage;
  capability: WorkflowDiscoveryContextCapability;
  actionKind: PermissionGrantActionKind;
  action: WorkflowDiscoveryPolicyDecisionAction;
  targetKind: PermissionGrantTargetKind;
  targetLabel: string;
  targetHash: string;
  reason: string;
  auditDetail: string;
  decisionSource?: PermissionAuditDecisionSource;
  grantId?: string;
  risk: PermissionRisk;
}

export interface WorkflowDiscoveryContentExcerpt {
  path: string;
  extension: string;
  sizeBytes: number;
  excerpt: string;
  truncated: boolean;
  access: Extract<WorkflowDiscoveryPolicyDecisionAction, "allow_by_full_access" | "allow_by_persistent_grant">;
  grantId?: string;
  targetHash: string;
}

export interface WorkflowDiscoveryPolicyContext {
  projectPath: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  stage: WorkflowDiscoveryStage;
  workflowThreadId?: string;
  threadId?: string;
  scannedAt: string;
  files: WorkflowDiscoveryFileCandidate[];
  skippedPaths: WorkflowDiscoverySkippedPath[];
  contentExcerpts: WorkflowDiscoveryContentExcerpt[];
  accessDecisions: WorkflowDiscoveryPolicyDecision[];
  contextEvidence: WorkflowDiscoveryContextEvidence[];
  connectors: WorkflowDiscoveryConnectorCapability[];
  pluginTools: WorkflowDiscoveryPluginCapability[];
  ambientCliCapabilities: WorkflowDiscoveryAmbientCliCapability[];
  searchRoutingSettings?: SearchRoutingSettings;
  policyNotes: string[];
}

export interface WorkflowDiscoveryRequestedContextAccess {
  capability: WorkflowDiscoveryContextCapability;
  targetLabel: string;
  targetKind?: PermissionGrantTargetKind;
}

export interface WorkflowDiscoveryPolicyInput {
  projectPath: string;
  workspacePath?: string;
  permissionMode?: PermissionMode;
  stage?: WorkflowDiscoveryStage;
  workflowThreadId?: string;
  threadId?: string;
  grants?: AmbientPermissionGrant[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  pluginRegistrations?: PluginMcpToolRegistration[];
  ambientCliCapabilities?: WorkflowDiscoveryAmbientCliCapability[];
  searchRoutingSettings?: SearchRoutingSettings;
  requestedContextAccess?: WorkflowDiscoveryRequestedContextAccess[];
  contextEvidence?: WorkflowDiscoveryContextEvidence[];
  maxFiles?: number;
  maxContentFiles?: number;
  maxContentBytes?: number;
  now?: Date;
}

export interface WorkflowDiscoveryProviderPolicyPayload {
  projectPath: string;
  permissionMode: PermissionMode;
  stage: WorkflowDiscoveryStage;
  scannedAt: string;
  files: WorkflowDiscoveryFileCandidate[];
  contentExcerpts: WorkflowDiscoveryContentExcerpt[];
  contextEvidence: WorkflowDiscoveryContextEvidence[];
  skippedPathSummary: Array<{ reason: string; count: number }>;
  blockedAccessSummary: Array<{ capability: WorkflowDiscoveryContextCapability; action: WorkflowDiscoveryPolicyDecisionAction; reason: string; count: number }>;
  grantsUsed: Array<{ capability: WorkflowDiscoveryContextCapability; targetKind: PermissionGrantTargetKind; targetLabel: string; grantId: string }>;
  connectors: WorkflowDiscoveryConnectorCapability[];
  pluginTools: WorkflowDiscoveryPluginCapability[];
  ambientCliCapabilities: WorkflowDiscoveryAmbientCliCapability[];
  searchRoutingSettings?: SearchRoutingSettings;
  policyNotes: string[];
}

export function buildWorkflowDiscoveryPolicyContext(input: WorkflowDiscoveryPolicyInput): WorkflowDiscoveryPolicyContext {
  const permissionMode = input.permissionMode ?? "workspace";
  const stage = input.stage ?? "initial_discovery";
  const workspacePath = input.workspacePath ?? input.projectPath;
  const threadId = input.threadId ?? input.workflowThreadId;
  const grants = input.grants ?? [];
  const decisionInput = {
    permissionMode,
    stage,
    workflowThreadId: input.workflowThreadId,
    threadId,
    projectPath: input.projectPath,
    workspacePath,
    grants,
  };
  const { files, skippedPaths, accessDecisions } = scanWorkflowDiscoveryFiles({
    root: input.projectPath,
    maxFiles: input.maxFiles ?? DEFAULT_MAX_FILES,
    decisionInput,
  });
  const contentResult = readGrantedContentExcerpts({
    root: input.projectPath,
    files,
    maxContentFiles: input.maxContentFiles ?? DEFAULT_MAX_CONTENT_FILES,
    maxContentBytes: input.maxContentBytes ?? DEFAULT_MAX_CONTENT_BYTES,
    decisionInput,
  });
  const requestedContextDecisions = classifyRequestedContextAccess(input.requestedContextAccess ?? [], decisionInput);
  const allAccessDecisions = uniqueDiscoveryPolicyDecisions([...accessDecisions, ...contentResult.decisions, ...requestedContextDecisions]);
  return {
    projectPath: input.projectPath,
    workspacePath,
    permissionMode,
    stage,
    workflowThreadId: input.workflowThreadId,
    threadId,
    scannedAt: (input.now ?? new Date()).toISOString(),
    files,
    skippedPaths,
    contentExcerpts: contentResult.excerpts,
    accessDecisions: allAccessDecisions,
    contextEvidence: input.contextEvidence ?? [],
    connectors: (input.connectorDescriptors ?? []).map((connector) => ({
      connectorId: connector.id,
      label: connector.label,
      accountLabels: connector.accounts.map((account) => account.label),
      operationLabels: connector.operations.map((operation) => operation.label),
      operations: connector.operations.map((operation) => ({
        name: operation.name,
        label: operation.label,
        description: operation.description,
        inputSchema: operation.inputSchema,
        outputSchema: operation.outputSchema,
        sideEffects: operation.sideEffects,
        supportsDryRun: operation.supportsDryRun,
        mutationPolicy: operation.mutationPolicy,
        defaultTimeoutMs: operation.defaultTimeoutMs,
      })),
      policy: `${connector.auth.status}; metadata only during discovery; content reads require explicit grants`,
    })),
    pluginTools: (input.pluginRegistrations ?? []).map((registration) => ({
      toolName: registration.registeredName,
      originalToolName: registration.originalName,
      label: registration.label,
      description: registration.description,
      parameters: registration.parameters,
      pluginId: registration.launchPlan.pluginId,
      pluginName: registration.launchPlan.pluginName,
      serverName: registration.launchPlan.serverName,
      startable: registration.launchPlan.startable,
    })),
    ambientCliCapabilities: (input.ambientCliCapabilities ?? []).map((capability) => ({
      capabilityId: capability.capabilityId,
      registryPluginId: capability.registryPluginId,
      packageId: capability.packageId,
      packageName: capability.packageName,
      command: capability.command,
      ...(capability.description ? { description: capability.description } : {}),
      availability: capability.availability,
      availabilityReason: capability.availabilityReason,
      risk: capability.risk,
      missingEnv: capability.missingEnv,
      whyMatched: capability.whyMatched,
    })),
    ...(input.searchRoutingSettings ? { searchRoutingSettings: input.searchRoutingSettings } : {}),
    policyNotes: [
      "Discovery may inspect base-directory file metadata and safe filenames, but not file contents.",
      "File content excerpts are included only when Full Access is active or an explicit discovery/content grant already matches.",
      "Secret-like files and generated/dependency directories are excluded from discovery scans.",
      "Connector capability and account metadata may be inspected before grants.",
      "Ambient CLI command descriptors may be inspected before grants, but command execution and health checks are not run during discovery.",
      "Connector content, account data, plugin execution, Ambient CLI command execution, shell commands, and mutations require explicit grants or runtime approval.",
      "Requested web, connector, plugin, Ambient CLI, browser, and shell context is represented as access requests; discovery policy does not execute those capabilities while building provider context.",
      "Discovery never performs mutations; local writes and remote mutations are denied in discovery context gathering.",
    ],
  };
}

export function classifyWorkflowDiscoveryContextRequest(input: {
  permissionMode: PermissionMode;
  stage: WorkflowDiscoveryStage;
  workflowThreadId?: string;
  threadId?: string;
  projectPath: string;
  workspacePath: string;
  grants?: AmbientPermissionGrant[];
  capability: WorkflowDiscoveryContextCapability;
  targetLabel: string;
  targetKind?: PermissionGrantTargetKind;
}): WorkflowDiscoveryPolicyDecision {
  const mapping = discoveryPermissionMapping(input.capability, input.targetKind);
  const targetHash = permissionGrantTargetHash(mapping.actionKind, mapping.targetKind, input.targetLabel);
  const base = {
    stage: input.stage,
    capability: input.capability,
    actionKind: mapping.actionKind,
    targetKind: mapping.targetKind,
    targetLabel: input.targetLabel,
    targetHash,
    auditDetail: `${input.capability}: ${redactPathLike(input.targetLabel)}`,
    risk: mapping.risk,
  };
  if (isAlwaysAllowedDiscoveryCapability(input.capability)) {
    return {
      ...base,
      action: "allow",
      reason: "Safe discovery metadata is allowed without a grant.",
      decisionSource: "policy",
    };
  }
  if (isDeniedDiscoveryCapability(input.capability)) {
    return {
      ...base,
      action: "deny",
      reason: "Discovery context gathering is read-only; mutations and local writes are out of scope.",
      decisionSource: "denied_by_policy",
    };
  }
  if (input.permissionMode === "full-access") {
    return {
      ...base,
      action: "allow_by_full_access",
      reason: "Full Access bypass permits richer discovery inspection without creating a persistent grant.",
      decisionSource: "allowed_by_full_access",
    };
  }

  const grant = findMatchingPermissionGrant(
    input.grants ?? [],
    permissionRequestForDiscoveryDecision({
      threadId: input.threadId ?? input.workflowThreadId ?? "workflow-discovery",
      capability: input.capability,
      targetLabel: input.targetLabel,
      actionKind: mapping.actionKind,
      targetKind: mapping.targetKind,
      targetHash,
      risk: mapping.risk,
    }),
    {
      permissionMode: input.permissionMode,
      threadId: input.threadId ?? input.workflowThreadId ?? "workflow-discovery",
      workflowThreadId: input.workflowThreadId,
      projectPath: input.projectPath,
      workspacePath: input.workspacePath,
    },
  );
  if (grant) {
    return {
      ...base,
      action: "allow_by_persistent_grant",
      reason: "A matching persistent permission grant allows this discovery context.",
      decisionSource: "persistent_grant",
      grantId: grant.id,
    };
  }
  return {
    ...base,
    action: "prompt",
    reason: "This discovery context requires an explicit permission grant before it can be included.",
    decisionSource: "denied_by_policy",
  };
}

export function workflowDiscoveryProviderPolicyPayload(context: WorkflowDiscoveryPolicyContext): WorkflowDiscoveryProviderPolicyPayload {
  const skippedPathCounts = new Map<string, number>();
  for (const skippedPath of context.skippedPaths) {
    skippedPathCounts.set(skippedPath.reason, (skippedPathCounts.get(skippedPath.reason) ?? 0) + 1);
  }
  return {
    projectPath: context.projectPath,
    permissionMode: context.permissionMode,
    stage: context.stage,
    scannedAt: context.scannedAt,
    files: context.files,
    contentExcerpts: context.contentExcerpts,
    contextEvidence: context.contextEvidence,
    skippedPathSummary: [...skippedPathCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => left.reason.localeCompare(right.reason)),
    blockedAccessSummary: summarizeAccessDecisions(
      context.accessDecisions.filter((decision) => decision.action === "prompt" || decision.action === "deny"),
    ),
    grantsUsed: context.accessDecisions
      .filter((decision) => decision.action === "allow_by_persistent_grant" && decision.grantId)
      .map((decision) => ({
        capability: decision.capability,
        targetKind: decision.targetKind,
        targetLabel: decision.targetLabel,
        grantId: decision.grantId!,
      })),
    connectors: context.connectors,
    pluginTools: context.pluginTools,
    ambientCliCapabilities: context.ambientCliCapabilities,
    ...(context.searchRoutingSettings ? { searchRoutingSettings: context.searchRoutingSettings } : {}),
    policyNotes: context.policyNotes,
  };
}

export function workflowDiscoveryPolicyContextSummary(context: WorkflowDiscoveryPolicyContext): string {
  const fileGroups = summarizeFileGroups(context.files);
  const skippedSecrets = context.skippedPaths.filter((item) => item.reason.includes("secret")).length;
  const lines = [
    `Base directory: ${context.projectPath}`,
    `Discovery scan: ${context.files.length} candidate file${context.files.length === 1 ? "" : "s"}${fileGroups ? ` (${fileGroups})` : ""}.`,
    context.files.length ? `Candidate files: ${context.files.slice(0, 8).map((file) => file.path).join(", ")}.` : undefined,
    context.contentExcerpts.length ? `Granted content excerpts: ${context.contentExcerpts.map((excerpt) => excerpt.path).join(", ")}.` : undefined,
    context.contextEvidence.length ? `Approved external context evidence: ${context.contextEvidence.map((evidence) => `${evidence.capability} ${evidence.targetLabel} (${evidence.items.length} item${evidence.items.length === 1 ? "" : "s"})`).join("; ")}.` : undefined,
    blockedFileContentCount(context) ? `Content reads withheld pending grants: ${blockedFileContentCount(context)}.` : undefined,
    requestedExternalAccessSummary(context),
    skippedSecrets ? `Secret-like paths skipped: ${skippedSecrets}.` : undefined,
    context.connectors.length
      ? `Connector metadata: ${context.connectors.map((connector) => `${connector.label} [${connector.operationLabels.join(", ")}]`).join("; ")}.`
      : "Connector metadata: no connector descriptors available.",
    context.pluginTools.length
      ? `Plugin tools: ${context.pluginTools.map((tool) => `${tool.label} via ${tool.pluginName}`).join("; ")}.`
      : "Plugin tools: none available for discovery.",
    context.ambientCliCapabilities.length
      ? `Ambient CLI commands: ${context.ambientCliCapabilities.map((capability) => `${capability.packageName}:${capability.command}`).join("; ")}.`
      : "Ambient CLI commands: none available for discovery.",
    `Policy: ${context.policyNotes.join(" ")}`,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function classifyRequestedContextAccess(
  requests: WorkflowDiscoveryRequestedContextAccess[],
  decisionInput: Omit<Parameters<typeof classifyWorkflowDiscoveryContextRequest>[0], "capability" | "targetLabel" | "targetKind">,
): WorkflowDiscoveryPolicyDecision[] {
  return requests
    .map((request) => ({
      ...request,
      targetLabel: request.targetLabel.trim().replace(/\s+/g, " ").slice(0, 240),
    }))
    .filter((request) => request.targetLabel)
    .map((request) =>
      classifyWorkflowDiscoveryContextRequest({
        ...decisionInput,
        capability: request.capability,
        targetLabel: request.targetLabel,
        targetKind: request.targetKind,
      }),
    );
}

function uniqueDiscoveryPolicyDecisions(decisions: WorkflowDiscoveryPolicyDecision[]): WorkflowDiscoveryPolicyDecision[] {
  const seen = new Set<string>();
  const unique: WorkflowDiscoveryPolicyDecision[] = [];
  for (const decision of decisions) {
    const key = `${decision.capability}\0${decision.targetHash}\0${decision.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(decision);
  }
  return unique;
}

function requestedExternalAccessSummary(context: WorkflowDiscoveryPolicyContext): string | undefined {
  const requested = context.accessDecisions.filter(
    (decision) =>
      decision.action !== "allow" &&
      [
        "connector_account_data",
        "connector_content",
        "plugin_tool_execute",
        "browser_network",
        "browser_control",
        "browser_profile",
        "shell_command",
      ].includes(decision.capability),
  );
  if (!requested.length) return undefined;
  const groups = new Map<string, string[]>();
  for (const decision of requested) {
    const label = decision.capability.replace(/_/g, " ");
    groups.set(label, [...(groups.get(label) ?? []), decision.targetLabel]);
  }
  return `Additional context access needed: ${[...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([label, targets]) => `${label} (${targets.slice(0, 3).join(", ")}${targets.length > 3 ? ` +${targets.length - 3}` : ""})`)
    .join("; ")}.`;
}

function scanWorkflowDiscoveryFiles(input: {
  root: string;
  maxFiles: number;
  decisionInput: Omit<Parameters<typeof classifyWorkflowDiscoveryContextRequest>[0], "capability" | "targetLabel" | "targetKind">;
}): {
  files: WorkflowDiscoveryFileCandidate[];
  skippedPaths: WorkflowDiscoverySkippedPath[];
  accessDecisions: WorkflowDiscoveryPolicyDecision[];
} {
  const files: WorkflowDiscoveryFileCandidate[] = [];
  const skippedPaths: WorkflowDiscoverySkippedPath[] = [];
  const accessDecisions: WorkflowDiscoveryPolicyDecision[] = [];
  const visit = (dir: string) => {
    if (files.length >= input.maxFiles) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      skippedPaths.push({ path: safeRelative(input.root, dir), reason: "directory could not be read" });
      return;
    }
    for (const entry of entries.sort()) {
      if (files.length >= input.maxFiles) return;
      const path = join(dir, entry);
      const rel = safeRelative(input.root, path);
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        skippedPaths.push({ path: rel, reason: "path could not be inspected" });
        continue;
      }
      if (stat.isSymbolicLink()) {
        skippedPaths.push({ path: rel, reason: "symbolic link skipped" });
        continue;
      }
      if (stat.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry)) {
          skippedPaths.push({ path: rel, reason: "generated or dependency directory skipped" });
          continue;
        }
        visit(path);
        continue;
      }
      if (!stat.isFile()) continue;
      if (SECRET_FILE_PATTERN.test(entry) || SECRET_FILE_PATTERN.test(rel)) {
        const decision = classifyWorkflowDiscoveryContextRequest({
          ...input.decisionInput,
          capability: "secret_path_metadata",
          targetLabel: rel,
          targetKind: "path",
        });
        accessDecisions.push(decision);
        if (decision.action === "allow_by_full_access" || decision.action === "allow_by_persistent_grant") {
          files.push({
            path: rel,
            extension: extname(entry).toLowerCase() || "(none)",
            sizeBytes: stat.size,
            mtimeMs: stat.mtimeMs,
            reason: "secret-like file metadata explicitly allowed for discovery",
            metadataAccess: decision.action,
          });
        } else {
          skippedPaths.push({ path: rel, reason: "secret-like file skipped" });
        }
        continue;
      }
      const extension = extname(entry).toLowerCase();
      if (!DATA_FILE_EXTENSIONS.has(extension)) continue;
      const decision = classifyWorkflowDiscoveryContextRequest({
        ...input.decisionInput,
        capability: "file_metadata",
        targetLabel: rel,
        targetKind: "path",
      });
      accessDecisions.push(decision);
      files.push({
        path: rel,
        extension: extension || "(none)",
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        reason: dataFileReason(extension),
        metadataAccess: decision.action,
      });
    }
  };
  visit(input.root);
  return { files, skippedPaths, accessDecisions };
}

function dataFileReason(extension: string): string {
  if ([".md", ".txt"].includes(extension)) return "documentation or notes";
  if ([".csv", ".tsv", ".xlsx", ".json", ".jsonl"].includes(extension)) return "structured data source";
  if ([".yaml", ".yml"].includes(extension)) return "configuration or structured notes";
  return "document-like data source";
}

function summarizeFileGroups(files: WorkflowDiscoveryFileCandidate[]): string {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.extension, (counts.get(file.extension) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([extension, count]) => `${count} ${extension}`)
    .join(", ");
}

function readGrantedContentExcerpts(input: {
  root: string;
  files: WorkflowDiscoveryFileCandidate[];
  maxContentFiles: number;
  maxContentBytes: number;
  decisionInput: Omit<Parameters<typeof classifyWorkflowDiscoveryContextRequest>[0], "capability" | "targetLabel" | "targetKind">;
}): { excerpts: WorkflowDiscoveryContentExcerpt[]; decisions: WorkflowDiscoveryPolicyDecision[] } {
  const excerpts: WorkflowDiscoveryContentExcerpt[] = [];
  const decisions: WorkflowDiscoveryPolicyDecision[] = [];
  let attemptedContentFiles = 0;
  for (const file of input.files) {
    if (!TEXT_CONTENT_EXTENSIONS.has(file.extension)) continue;
    if (attemptedContentFiles >= input.maxContentFiles) break;
    attemptedContentFiles += 1;
    const decision = classifyWorkflowDiscoveryContextRequest({
      ...input.decisionInput,
      capability: file.reason.includes("secret-like") ? "secret_path_metadata" : "file_content",
      targetLabel: file.path,
      targetKind: "path",
    });
    decisions.push(decision);
    if (decision.action !== "allow_by_full_access" && decision.action !== "allow_by_persistent_grant") continue;
    try {
      const buffer = readFileSync(join(input.root, file.path));
      const excerptBytes = buffer.subarray(0, input.maxContentBytes);
      const rawExcerpt = excerptBytes.toString("utf8");
      excerpts.push({
        path: file.path,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        excerpt: redactDiscoveryText(rawExcerpt),
        truncated: buffer.length > excerptBytes.length,
        access: decision.action,
        grantId: decision.grantId,
        targetHash: decision.targetHash,
      });
    } catch {
      decisions.push({
        ...decision,
        action: "deny",
        reason: "Granted file content could not be read during discovery.",
        decisionSource: "denied_by_policy",
      });
    }
  }
  return { excerpts, decisions };
}

function isAlwaysAllowedDiscoveryCapability(capability: WorkflowDiscoveryContextCapability): boolean {
  return ["request_text", "prior_answers", "graph_summary", "file_metadata", "connector_metadata", "plugin_metadata"].includes(capability);
}

function isDeniedDiscoveryCapability(capability: WorkflowDiscoveryContextCapability): boolean {
  return capability === "local_file_write" || capability === "remote_mutation";
}

function discoveryPermissionMapping(
  capability: WorkflowDiscoveryContextCapability,
  targetKind?: PermissionGrantTargetKind,
): { actionKind: PermissionGrantActionKind; targetKind: PermissionGrantTargetKind; risk: PermissionRisk } {
  if (capability === "file_content") return { actionKind: "file_content_read", targetKind: targetKind ?? "path", risk: "outside-workspace" };
  if (capability === "secret_path_metadata") return { actionKind: "secret_path_read", targetKind: targetKind ?? "path", risk: "secret-path" };
  if (capability === "connector_account_data") return { actionKind: "connector_account_data_read", targetKind: targetKind ?? "connector_account", risk: "plugin-tool" };
  if (capability === "connector_content") return { actionKind: "connector_content_read", targetKind: targetKind ?? "connector", risk: "plugin-tool" };
  if (capability === "plugin_tool_execute") return { actionKind: "plugin_tool_execute", targetKind: targetKind ?? "tool", risk: "plugin-tool" };
  if (capability === "shell_command") return { actionKind: "shell_command", targetKind: targetKind ?? "shell_command_prefix", risk: "workspace-command" };
  if (capability === "browser_network") return { actionKind: "browser_network", targetKind: targetKind ?? "browser_origin", risk: "browser-network" };
  if (capability === "browser_control") return { actionKind: "browser_control", targetKind: targetKind ?? "browser_origin", risk: "browser-control" };
  if (capability === "browser_profile") return { actionKind: "browser_profile", targetKind: targetKind ?? "browser_origin", risk: "browser-profile" };
  if (capability === "local_file_write") return { actionKind: "local_file_write", targetKind: targetKind ?? "path", risk: "destructive-command" };
  if (capability === "remote_mutation") return { actionKind: "remote_mutation", targetKind: targetKind ?? "mutation_policy", risk: "destructive-command" };
  return { actionKind: "file_metadata_read", targetKind: targetKind ?? "risk", risk: "outside-workspace" };
}

function permissionRequestForDiscoveryDecision(input: {
  threadId: string;
  capability: WorkflowDiscoveryContextCapability;
  targetLabel: string;
  actionKind: PermissionGrantActionKind;
  targetKind: PermissionGrantTargetKind;
  targetHash: string;
  risk: PermissionRisk;
}): Omit<PermissionRequest, "id"> {
  return {
    threadId: input.threadId,
    toolName: `workflow_discovery:${input.capability}`,
    title: "Allow workflow discovery context?",
    message: "Workflow Discovery wants to include additional context while designing the workflow.",
    detail: input.targetLabel,
    risk: input.risk,
    grantActionKind: input.actionKind,
    grantTargetKind: input.targetKind,
    grantTargetLabel: input.targetLabel,
    grantTargetHash: input.targetHash,
    grantConditions: { discoveryOnly: true },
  };
}

function summarizeAccessDecisions(decisions: WorkflowDiscoveryPolicyDecision[]): WorkflowDiscoveryProviderPolicyPayload["blockedAccessSummary"] {
  const counts = new Map<string, { capability: WorkflowDiscoveryContextCapability; action: WorkflowDiscoveryPolicyDecisionAction; reason: string; count: number }>();
  for (const decision of decisions) {
    const key = `${decision.capability}\0${decision.action}\0${decision.reason}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        capability: decision.capability,
        action: decision.action,
        reason: decision.reason,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort((left, right) => left.capability.localeCompare(right.capability) || left.reason.localeCompare(right.reason));
}

function blockedFileContentCount(context: WorkflowDiscoveryPolicyContext): number {
  return context.accessDecisions.filter((decision) => decision.capability === "file_content" && decision.action === "prompt").length;
}

function redactDiscoveryText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b((?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?)([^"',}\s]{4,})/gi,
      `$1${REDACTED}`,
    )
    .replace(/\b(?:sk|zai|ambient|glm)-[A-Za-z0-9._-]{20,}\b/gi, REDACTED)
    .replace(/\b[A-Za-z0-9+/=_-]{64,}\b/g, REDACTED);
}

function redactPathLike(value: string): string {
  return SECRET_FILE_PATTERN.test(value) ? REDACTED : value;
}

function safeRelative(root: string, path: string): string {
  return relative(root, path) || basename(path);
}
