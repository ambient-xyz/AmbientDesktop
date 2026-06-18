import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import type { AmbientPermissionGrant, PermissionGrantScopeKind, PermissionPromptResponseMode } from "../../shared/permissionTypes";
import type { McpToolDescriptor } from "./mcpToolBridge";
import { isSecretReference } from "./mcpSecurityFacade";

export type McpPermissionResourceKind =
  | "tool-call"
  | "network"
  | "local-endpoint"
  | "filesystem"
  | "secret"
  | "persistent-store"
  | "runtime"
  | "external-account";

export type McpPermissionAction = "call" | "connect" | "read" | "write" | "use-secret" | "execute" | "mutate";
export type McpPermissionRisk = "low" | "medium" | "high";

export interface McpPermissionSubject {
  serverId: string;
  workloadName: string;
  toolName: string;
  toolRef: string;
  descriptorHash?: string;
  runtimeLane?: string;
  sourceKind?: string;
  sourceUrl?: string;
  packageIdentifier?: string;
}

export interface McpPermissionResource {
  kind: McpPermissionResourceKind;
  action: McpPermissionAction;
  label: string;
  identity: string;
  risk: McpPermissionRisk;
  evidence: string;
}

export interface McpPermissionHardDenial {
  code: string;
  message: string;
  resource?: string;
}

export interface McpPermissionPolicyEvaluation {
  subject: McpPermissionSubject;
  resources: McpPermissionResource[];
  hardDenials: McpPermissionHardDenial[];
  grantTargetLabel: string;
  grantTargetIdentity: string;
  grantConditions: Record<string, unknown>;
  reusableScopes: PermissionGrantScopeKind[];
  recommendedResponse: PermissionPromptResponseMode;
}

export interface McpPermissionPolicyInput {
  descriptor: McpToolDescriptor;
  toolArguments: Record<string, unknown>;
  workspacePath?: string;
  projectPath?: string;
}

export interface McpPermissionGrantPlanningContext {
  threadId?: string;
  workflowThreadId?: string;
  projectPath?: string;
  workspacePath?: string;
}

export interface McpPermissionPromptGrantPlan {
  grantTargetLabel: string;
  grantTargetIdentity: string;
  grantConditions: Record<string, unknown>;
  reusableScopes: PermissionGrantScopeKind[];
  detailText?: string;
  profile?: "exact" | "public-web-egress" | "local-endpoint" | "filesystem-directory";
}

export type McpPermissionPromptCopyGroupKind =
  | "public-web"
  | "local-endpoint"
  | "workspace-files"
  | "secret"
  | "runtime"
  | "persistent-store"
  | "external-account"
  | "tool"
  | "blocked";

export interface McpPermissionPromptCopyGroup {
  kind: McpPermissionPromptCopyGroupKind;
  label: string;
  body: string;
  resources: string[];
  risk: McpPermissionRisk;
}

export interface McpPermissionPromptCopy {
  heading: string;
  summary: string;
  groups: McpPermissionPromptCopyGroup[];
  hardBoundaries: string[];
  outputGuardrails: string[];
  suggestedResponse: PermissionPromptResponseMode;
}

export interface McpPermissionPromptRuntimeContext {
  publicWebEgressGrantEnforced?: boolean;
  reusableScopeLimit?: PermissionGrantScopeKind[];
}

export interface McpDescriptorDriftGrantInvalidationInput {
  grants: AmbientPermissionGrant[];
  serverId: string;
  workloadName: string;
  previousDescriptorHash?: string;
  descriptorHash?: string;
}

interface ResourceCollector {
  resources: Map<string, McpPermissionResource>;
  denials: McpPermissionHardDenial[];
}

interface ArgumentVisit {
  path: string;
  key?: string;
  value: unknown;
}

interface FilesystemDirectoryGrantCandidate {
  action: "read" | "write";
  directoryLabel: string;
  directoryIdentity: string;
}

export function evaluateMcpToolCallPermission(input: McpPermissionPolicyInput): McpPermissionPolicyEvaluation {
  const collector: ResourceCollector = { resources: new Map(), denials: [] };
  const descriptor = input.descriptor;
  const subject: McpPermissionSubject = {
    serverId: descriptor.serverId,
    workloadName: descriptor.workloadName,
    toolName: descriptor.name,
    toolRef: descriptor.toolRef,
    ...(descriptor.descriptorHash ? { descriptorHash: descriptor.descriptorHash } : {}),
  };

  addResource(collector, {
    kind: "tool-call",
    action: "call",
    label: descriptor.toolRef,
    identity: ["tool", descriptor.serverId, descriptor.workloadName, descriptor.name, descriptor.descriptorHash ?? "no-descriptor-hash"].join(":"),
    risk: descriptor.policy?.callPolicy === "approval-required" ? "high" : "medium",
    evidence: "Selected MCP tool descriptor.",
  });

  if (descriptor.endpoint) normalizeUrlResource(collector, descriptor.endpoint, "descriptor.endpoint");
  for (const visit of visitArgumentValues(input.toolArguments)) {
    normalizeArgumentValue(collector, visit, input);
  }
  normalizeDescriptorTextResources(collector, descriptor);

  const resources = [...collector.resources.values()].sort(compareResources);
  const grantTargetIdentity = [
    "ambient-mcp-tool-call-v1",
    subject.serverId,
    subject.workloadName,
    subject.toolName,
    subject.descriptorHash ?? "no-descriptor-hash",
    ...resources.map((resource) => resource.identity),
  ].join("\0");
  const highRisk = resources.some((resource) => resource.risk === "high");
  const reusableScopes = collector.denials.length ? [] : reusableScopesForResources(resources, input);

  return {
    subject,
    resources,
    hardDenials: collector.denials,
    grantTargetLabel: `Call MCP tool ${subject.serverId}/${subject.toolName}`,
    grantTargetIdentity,
    grantConditions: {
      kind: "ambient-mcp-tool-call",
      schemaVersion: "ambient-mcp-permission-policy-v1",
      subject,
      resources: resources.map((resource) => ({
        kind: resource.kind,
        action: resource.action,
        identity: resource.identity,
        label: resource.label,
        risk: resource.risk,
      })),
      descriptorHash: subject.descriptorHash,
    },
    reusableScopes,
    recommendedResponse: highRisk ? "always_thread" : input.projectPath ? "always_project" : "always_thread",
  };
}

export function mcpPermissionPolicyDetailText(evaluation: McpPermissionPolicyEvaluation): string {
  const resourceLines = evaluation.resources.length
    ? evaluation.resources.map((resource) => `- ${resource.kind}:${resource.action} ${resource.label} (${resource.risk})`).join("\n")
    : "- none";
  const denialLines = evaluation.hardDenials.length
    ? evaluation.hardDenials.map((denial) => `- ${denial.code}: ${denial.message}`).join("\n")
    : "- none";
  const scopeText = evaluation.reusableScopes.length ? evaluation.reusableScopes.join(", ") : "none";
  return [
    "MCP permission policy:",
    `- Subject: ${evaluation.subject.toolRef}`,
    evaluation.subject.descriptorHash ? `- Descriptor hash: ${evaluation.subject.descriptorHash}` : undefined,
    `- Reusable scopes: ${scopeText}`,
    "- Normalized resources:",
    resourceLines,
    "- Hard denials:",
    denialLines,
  ].filter((line) => line !== undefined).join("\n");
}

export function mcpPermissionPolicyBlockedMessage(evaluation: McpPermissionPolicyEvaluation): string {
  return [
    `MCP tool call blocked by Ambient MCP permission policy: ${evaluation.hardDenials.map((denial) => denial.message).join(" ")}`,
    "",
    mcpPermissionPolicyPromptCopyText(evaluation),
  ].join("\n");
}

export function mcpPermissionPolicyPromptCopy(evaluation: McpPermissionPolicyEvaluation): McpPermissionPromptCopy {
  const groups = mcpPermissionPromptCopyGroups(evaluation);
  return {
    heading: "MCP tool permission",
    summary: evaluation.hardDenials.length
      ? "Ambient blocked this MCP tool call before prompting because it requested a resource outside the generic MCP approval boundary."
      : `Ambient is asking before ${evaluation.subject.serverId}/${evaluation.subject.toolName} uses the resources below.`,
    groups,
    hardBoundaries: [
      "Public-web grants never include localhost, private LAN, link-local/cloud metadata, file URLs, sockets/IPC, raw secret values, or insecure public HTTP.",
      "Local endpoints, filesystem access, persistent stores, external accounts, runtime/process/browser control, and secrets stay in separate reviewed permission groups.",
      "Descriptor drift revokes prior MCP tool-call grants until the changed descriptor snapshot is reviewed again.",
    ],
    outputGuardrails: [
      "Large text responses are allowed; Ambient returns a bounded preview and materializes the complete output as a workspace artifact when it cannot safely fit inline.",
      "Downloads and binary artifacts must stay behind Ambient-managed artifacts or reviewed filesystem writes; raw bytes and secret-bearing values are not exposed in chat, logs, descriptors, or tool arguments.",
    ],
    suggestedResponse: evaluation.recommendedResponse,
  };
}

export function mcpPermissionPolicyPromptCopyText(evaluation: McpPermissionPolicyEvaluation): string {
  const copy = mcpPermissionPolicyPromptCopy(evaluation);
  return [
    "MCP permission summary:",
    `- ${copy.summary}`,
    `- Suggested default: ${copy.suggestedResponse}`,
    "- Permission groups:",
    ...copy.groups.map((group) => [
      `  - ${group.label} (${group.risk}): ${group.body}`,
      group.resources.length ? `    Resources: ${group.resources.join(", ")}` : undefined,
    ].filter((line): line is string => Boolean(line))).flat(),
    "- Hard boundaries:",
    ...copy.hardBoundaries.map((line) => `  - ${line}`),
    "- Response and download guardrails:",
    ...copy.outputGuardrails.map((line) => `  - ${line}`),
  ].join("\n");
}

export function planMcpPermissionPromptGrant(input: {
  evaluation: McpPermissionPolicyEvaluation;
  existingGrants: AmbientPermissionGrant[];
  context?: McpPermissionGrantPlanningContext;
  runtime?: McpPermissionPromptRuntimeContext;
}): McpPermissionPromptGrantPlan {
  const { evaluation } = input;
  if (evaluation.hardDenials.length) {
    return exactGrantPlan(evaluation, input.runtime?.reusableScopeLimit);
  }
  const activeGrants = input.existingGrants.filter((grant) => activeGrantAppliesToContext(grant, input.context));
  const exactHash = pluginToolGrantHash(evaluation.grantTargetIdentity);
  if (activeGrants.some((grant) => grant.actionKind === "plugin_tool_execute" && grant.targetKind === "tool" && grant.targetHash === exactHash)) {
    return exactGrantPlan(evaluation, input.runtime?.reusableScopeLimit);
  }
  if (isPublicWebEgressCandidate(evaluation)) {
    return planPublicWebEgressGrant({
      evaluation,
      activeGrants,
      reusableScopeLimit: input.runtime?.reusableScopeLimit,
      publicWebEgressGrantEnforced: input.runtime?.publicWebEgressGrantEnforced,
    });
  }
  if (isLocalEndpointGrantCandidate(evaluation)) {
    return planLocalEndpointGrant({
      evaluation,
      activeGrants,
      reusableScopeLimit: input.runtime?.reusableScopeLimit,
    });
  }
  const filesystemPlan = filesystemDirectoryCandidate(evaluation);
  if (filesystemPlan) {
    return planFilesystemDirectoryGrant({
      evaluation,
      activeGrants,
      candidate: filesystemPlan,
      reusableScopeLimit: input.runtime?.reusableScopeLimit,
    });
  }
  return exactGrantPlan(evaluation, input.runtime?.reusableScopeLimit);
}

function planPublicWebEgressGrant(input: {
  evaluation: McpPermissionPolicyEvaluation;
  activeGrants: AmbientPermissionGrant[];
  reusableScopeLimit?: PermissionGrantScopeKind[];
  publicWebEgressGrantEnforced?: boolean;
}): McpPermissionPromptGrantPlan {
  const { evaluation, activeGrants } = input;
  const broadPlan = publicWebEgressGrantPlan(evaluation, activeGrants);
  const broadHash = pluginToolGrantHash(broadPlan.grantTargetIdentity);
  if (activeGrants.some((grant) => grant.actionKind === "plugin_tool_execute" && grant.targetKind === "tool" && grant.targetHash === broadHash)) {
    return input.publicWebEgressGrantEnforced === false
      ? exactGrantPlan(evaluation, input.reusableScopeLimit)
      : withReusableScopeLimit(broadPlan, input.reusableScopeLimit);
  }

  const priorHosts = priorPublicWebHosts(evaluation, activeGrants);
  if (priorHosts.length < 3) {
    return exactGrantPlan(evaluation, input.reusableScopeLimit);
  }
  if (input.publicWebEgressGrantEnforced === false) {
    return exactGrantPlan(evaluation, input.reusableScopeLimit);
  }
  return withReusableScopeLimit({
    ...broadPlan,
    detailText: [
      "MCP reusable grant suggestion - public web access:",
      `- Ambient found ${priorHosts.length} prior host-specific public HTTPS grants for this same MCP tool descriptor.`,
      `- Prior hosts: ${priorHosts.slice(0, 5).join(", ")}${priorHosts.length > 5 ? ", ..." : ""}`,
      "- Choosing an always option now creates a public-web grant for this MCP tool descriptor.",
      "- Private networks, localhost, cloud metadata, file URLs, and insecure HTTP remain blocked by policy.",
      "- Large responses still use bounded previews with full materialization when needed.",
    ].join("\n"),
  }, input.reusableScopeLimit);
}

function planLocalEndpointGrant(input: {
  evaluation: McpPermissionPolicyEvaluation;
  activeGrants: AmbientPermissionGrant[];
  reusableScopeLimit?: PermissionGrantScopeKind[];
}): McpPermissionPromptGrantPlan {
  const { evaluation, activeGrants } = input;
  const localPlan = localEndpointGrantPlan(evaluation, activeGrants);
  const localHash = pluginToolGrantHash(localPlan.grantTargetIdentity);
  if (activeGrants.some((grant) => grant.actionKind === "plugin_tool_execute" && grant.targetKind === "tool" && grant.targetHash === localHash)) {
    return withReusableScopeLimit(localPlan, input.reusableScopeLimit);
  }

  const priorEndpoints = priorLocalEndpoints(evaluation, activeGrants);
  if (priorEndpoints.length < 2) return exactGrantPlan(evaluation, input.reusableScopeLimit);
  return withReusableScopeLimit({
    ...localPlan,
    detailText: [
      "MCP reusable grant suggestion - local endpoints:",
      `- Ambient found ${priorEndpoints.length} prior exact loopback endpoint grants for this same MCP tool descriptor.`,
      `- Prior endpoints: ${priorEndpoints.slice(0, 5).join(", ")}${priorEndpoints.length > 5 ? ", ..." : ""}`,
      "- Choosing an always option now creates a local-endpoint grant for this MCP tool descriptor.",
      "- This does not include public web, private LAN, cloud metadata, file URLs, or filesystem access.",
    ].join("\n"),
  }, input.reusableScopeLimit);
}

function planFilesystemDirectoryGrant(input: {
  evaluation: McpPermissionPolicyEvaluation;
  activeGrants: AmbientPermissionGrant[];
  candidate: FilesystemDirectoryGrantCandidate;
  reusableScopeLimit?: PermissionGrantScopeKind[];
}): McpPermissionPromptGrantPlan {
  const { evaluation, activeGrants, candidate } = input;
  const directoryPlan = filesystemDirectoryGrantPlan(evaluation, activeGrants, candidate);
  const directoryHash = pluginToolGrantHash(directoryPlan.grantTargetIdentity);
  if (activeGrants.some((grant) => grant.actionKind === "plugin_tool_execute" && grant.targetKind === "tool" && grant.targetHash === directoryHash)) {
    return withReusableScopeLimit(directoryPlan, input.reusableScopeLimit);
  }

  const priorPaths = priorFilesystemPaths(evaluation, activeGrants, candidate);
  if (priorPaths.length < 3) return exactGrantPlan(evaluation, input.reusableScopeLimit);
  return withReusableScopeLimit({
    ...directoryPlan,
    detailText: [
      "MCP reusable grant suggestion - workspace files:",
      `- Ambient found ${priorPaths.length} prior ${candidate.action} grants in ${candidate.directoryLabel} for this same MCP tool descriptor.`,
      `- Prior paths: ${priorPaths.slice(0, 5).join(", ")}${priorPaths.length > 5 ? ", ..." : ""}`,
      `- Choosing an always option now creates a ${candidate.action} grant for files directly under ${candidate.directoryLabel}.`,
      "- This does not include other directories, public web, local endpoints, process execution, or secrets.",
    ].join("\n"),
  }, input.reusableScopeLimit);
}

function normalizeArgumentValue(collector: ResourceCollector, visit: ArgumentVisit, input: McpPermissionPolicyInput): void {
  const key = visit.key ?? "";
  if (looksSecretKey(key) && visit.value !== undefined && visit.value !== null && visit.value !== "") {
    if (typeof visit.value === "string" && isSecretReference(visit.value.trim())) {
      addResource(collector, {
        kind: "secret",
        action: "use-secret",
        label: `${key} Ambient secret reference`,
        identity: `secret-ref:${key}`,
        risk: "high",
        evidence: `Tool argument ${visit.path} is an Ambient-owned secret reference.`,
      });
    } else {
      collector.denials.push({
        code: "mcp.raw_secret_argument",
        message: `Tool argument ${visit.path} looks like a raw secret. Use Ambient-managed MCP secret binding instead of passing secret values to MCP tools.`,
        resource: visit.path,
      });
    }
  }

  if (looksRuntimeExecutionArgument(key, visit.value)) {
    addRuntimeArgumentResource(collector, visit, input.descriptor);
  }

  if (typeof visit.value !== "string" || !visit.value.trim()) return;
  const value = visit.value.trim();
  for (const url of urlsInString(value)) normalizeUrlResource(collector, url, visit.path);
  if (looksSocketIpcArgument(key, value)) {
    collector.denials.push({
      code: "mcp.socket_ipc_argument",
      message: `MCP tool argument ${visit.path} targets a socket or IPC endpoint. Socket and IPC access require a reviewed guided runtime path, not a generic MCP tool call.`,
      resource: visit.path,
    });
    return;
  }
  if (looksPathLikeArgument(key, value)) normalizePathResource(collector, visit.path, key, value, input.workspacePath);
}

function normalizeUrlResource(collector: ResourceCollector, value: string, evidence: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return;
  }
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "");
  const hostPort = port ? `${host}:${port}` : host;
  if (parsed.protocol === "file:") {
    collector.denials.push({
      code: "mcp.file_url_argument",
      message: `MCP tool arguments must not use file URLs (${redactedUrlForMessage(parsed)}). Use reviewed filesystem grants instead.`,
      resource: value,
    });
    return;
  }
  if (isSocketIpcProtocol(parsed.protocol)) {
    collector.denials.push({
      code: "mcp.socket_ipc_argument",
      message: `MCP tool arguments must not use socket or IPC URLs (${redactedUrlForMessage(parsed)}). Use a reviewed guided runtime path for socket or IPC access.`,
      resource: value,
    });
    return;
  }
  if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
    collector.denials.push({
      code: "mcp.unsupported_endpoint_protocol",
      message: `MCP tool argument endpoint protocol ${parsed.protocol} is not supported by the generic MCP permission path. Use a reviewed local or remote endpoint runtime path.`,
      resource: value,
    });
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  if (isLoopbackHost(host)) {
    addResource(collector, {
      kind: "local-endpoint",
      action: "connect",
      label: hostPort,
      identity: `local-endpoint:${hostPort}`,
      risk: "medium",
      evidence,
    });
    return;
  }
  if (isDeniedNetworkHost(host)) {
    collector.denials.push({
      code: "mcp.denied_network_target",
      message: `MCP tool network target ${host} is private, link-local, or cloud metadata and requires a more specific runtime path than a public-web MCP grant.`,
      resource: host,
    });
    return;
  }
  if (parsed.protocol !== "https:") {
    collector.denials.push({
      code: "mcp.insecure_public_http",
      message: `MCP public network target ${host} must use HTTPS.`,
      resource: host,
    });
    return;
  }
  addResource(collector, {
    kind: "network",
    action: "connect",
    label: hostPort,
    identity: `network:https:${hostPort}`,
    risk: "medium",
    evidence,
  });
}

function normalizePathResource(
  collector: ResourceCollector,
  path: string,
  key: string,
  value: string,
  workspacePath: string | undefined,
): void {
  const action: McpPermissionAction = /(?:write|save|output|dest|target|create|delete|remove|edit)/i.test(key) ? "write" : "read";
  const resolved = value.startsWith("~/") ? value : isAbsolute(value) ? resolve(value) : workspacePath ? resolve(workspacePath, value) : value;
  const workspaceRelative = workspacePath && isAbsolute(resolved) ? relative(resolve(workspacePath), resolved) : undefined;
  const insideWorkspace = Boolean(workspaceRelative && workspaceRelative !== ".." && !workspaceRelative.startsWith(`..${"/"}`) && workspaceRelative !== "");
  const label = insideWorkspace && workspaceRelative ? `workspace:${workspaceRelative}` : resolved;
  addResource(collector, {
    kind: "filesystem",
    action,
    label,
    identity: `filesystem:${action}:${label}`,
    risk: insideWorkspace ? "medium" : "high",
    evidence: `Tool argument ${path}.`,
  });
}

function normalizeDescriptorTextResources(collector: ResourceCollector, descriptor: McpToolDescriptor): void {
  const text = [
    descriptor.name,
    descriptor.description ?? "",
    JSON.stringify(descriptor.inputSchema ?? {}),
  ].join(" ").toLowerCase();
  if (mentionsRuntimeProcess(text)) {
    addResource(collector, {
      kind: "runtime",
      action: "execute",
      label: `${descriptor.serverId}/${descriptor.name} process execution`,
      identity: `runtime:process:${descriptor.serverId}:${descriptor.name}`,
      risk: "high",
      evidence: "Tool descriptor mentions process or command execution semantics.",
    });
  }
  if (mentionsBrowserRuntime(text)) {
    addResource(collector, {
      kind: "runtime",
      action: "execute",
      label: `${descriptor.serverId}/${descriptor.name} browser runtime`,
      identity: `runtime:browser:${descriptor.serverId}:${descriptor.name}`,
      risk: "high",
      evidence: "Tool descriptor mentions browser automation/runtime semantics.",
    });
  }
  if (/\b(memory|database|postgres|mysql|sqlite|redis|vector|embedding|cache|store|persist|index)\b/.test(text)) {
    addResource(collector, {
      kind: "persistent-store",
      action: /\b(write|create|update|delete|remove|insert|upsert|store|index)\b/.test(text) ? "write" : "read",
      label: `${descriptor.serverId}/${descriptor.name}`,
      identity: `persistent-store:${descriptor.serverId}:${descriptor.name}`,
      risk: "high",
      evidence: "Tool descriptor mentions persistent storage semantics.",
    });
  }
  if (/\b(github|gitlab|slack|google|gmail|drive|calendar|notion|linear|jira|stripe|aws|azure|cloudflare)\b/.test(text)) {
    addResource(collector, {
      kind: "external-account",
      action: "connect",
      label: `${descriptor.serverId}/${descriptor.name}`,
      identity: `external-account:${descriptor.serverId}:${descriptor.name}`,
      risk: "high",
      evidence: "Tool descriptor mentions an external account or API surface.",
    });
  }
}

function mcpPermissionPromptCopyGroups(evaluation: McpPermissionPolicyEvaluation): McpPermissionPromptCopyGroup[] {
  const groups = new Map<McpPermissionPromptCopyGroupKind, McpPermissionPromptCopyGroup>();
  if (evaluation.hardDenials.length) {
    groups.set("blocked", {
      kind: "blocked",
      label: "Blocked boundary",
      body: "Ambient will not offer a grant for these resources in the generic MCP tool-call path.",
      resources: evaluation.hardDenials.map((denial) => `${denial.code}${denial.resource ? ` ${denial.resource}` : ""}`),
      risk: "high",
    });
  }
  for (const resource of evaluation.resources) {
    const group = promptCopyGroupForResource(resource);
    const existing = groups.get(group.kind);
    if (!existing) {
      groups.set(group.kind, group);
      continue;
    }
    existing.resources.push(...group.resources);
    existing.risk = highestRisk(existing.risk, group.risk);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    resources: [...new Set(group.resources)].sort(),
  }));
}

function promptCopyGroupForResource(resource: McpPermissionResource): McpPermissionPromptCopyGroup {
  switch (resource.kind) {
    case "network":
      return {
        kind: "public-web",
        label: "Public web access",
        body: resource.identity === "network:https:*"
          ? "Allows this MCP tool descriptor to connect to public HTTPS hosts requested by future calls."
          : "Allows this MCP tool call to connect to the listed public HTTPS host.",
        resources: [resource.label],
        risk: resource.risk,
      };
    case "local-endpoint":
      return {
        kind: "local-endpoint",
        label: "Local endpoint access",
        body: "Allows this MCP tool descriptor to reach reviewed loopback endpoints on this machine.",
        resources: [resource.label],
        risk: resource.risk,
      };
    case "filesystem":
      return {
        kind: "workspace-files",
        label: "Workspace file access",
        body: "Allows the listed read or write operation for workspace-scoped files only.",
        resources: [`${resource.action} ${resource.label}`],
        risk: resource.risk,
      };
    case "secret":
      return {
        kind: "secret",
        label: "Ambient-managed secret use",
        body: "Allows a secret reference that Ambient owns and redacts; raw secret values are not allowed.",
        resources: [resource.label],
        risk: resource.risk,
      };
    case "runtime":
      return {
        kind: "runtime",
        label: "Runtime or browser control",
        body: "Allows high-risk runtime behavior described by the MCP tool descriptor or arguments.",
        resources: [resource.label],
        risk: resource.risk,
      };
    case "persistent-store":
      return {
        kind: "persistent-store",
        label: "Persistent storage",
        body: "Allows this MCP tool to read or write durable memory, database, cache, vector, or index state.",
        resources: [resource.label],
        risk: resource.risk,
      };
    case "external-account":
      return {
        kind: "external-account",
        label: "External account or API",
        body: "Allows this MCP tool to interact with a named third-party account or API surface.",
        resources: [resource.label],
        risk: resource.risk,
      };
    case "tool-call":
      return {
        kind: "tool",
        label: "MCP tool call",
        body: "Allows the selected installed MCP tool descriptor to run with the reviewed argument shape.",
        resources: [resource.label],
        risk: resource.risk,
      };
  }
}

function highestRisk(left: McpPermissionRisk, right: McpPermissionRisk): McpPermissionRisk {
  const order: Record<McpPermissionRisk, number> = { low: 0, medium: 1, high: 2 };
  return order[right] > order[left] ? right : left;
}

function visitArgumentValues(value: unknown, path = "$", key?: string): ArgumentVisit[] {
  const visits: ArgumentVisit[] = [{ path, key, value }];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visits.push(...visitArgumentValues(entry, `${path}[${index}]`, key)));
  } else if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      visits.push(...visitArgumentValues(childValue, `${path}.${childKey}`, childKey));
    }
  }
  return visits;
}

function urlsInString(value: string): string[] {
  const direct = (() => {
    try {
      return new URL(value), [value];
    } catch {
      return [];
    }
  })();
  const embedded = [...value.matchAll(/\b(?:https?|file|unix|socket|ipc|pipe|npipe|wss?):\/\/[^\s"'`<>)]+/gi)].map((match) => match[0]);
  return [...new Set([...direct, ...embedded])];
}

function addResource(collector: ResourceCollector, resource: McpPermissionResource): void {
  collector.resources.set(resource.identity, resource);
}

function compareResources(left: McpPermissionResource, right: McpPermissionResource): number {
  return left.kind.localeCompare(right.kind) || left.identity.localeCompare(right.identity);
}

function reusableScopesForResources(resources: McpPermissionResource[], input: McpPermissionPolicyInput): PermissionGrantScopeKind[] {
  const scopes: PermissionGrantScopeKind[] = ["thread"];
  const hasHighRisk = resources.some((resource) => resource.risk === "high");
  if (input.projectPath) scopes.push("project");
  if (input.workspacePath && !hasHighRisk) scopes.push("workspace");
  return scopes;
}

function looksSecretKey(key: string): boolean {
  return /(?:api[-_]?key|authorization|bearer|credential|password|secret|token|cookie)/i.test(key);
}

function looksPathLikeArgument(key: string, value: string): boolean {
  if (/^(?:https?|file|unix|socket|ipc|pipe|npipe|wss?):\/\//i.test(value)) return false;
  if (!/(?:path|file|dir|folder|output|input|save|dest|target)/i.test(key)) return false;
  return value.startsWith("~/") || isAbsolute(value) || /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value);
}

function looksSocketIpcArgument(key: string, value: string): boolean {
  if (!/(?:socket|sock|ipc|pipe|npipe|unix)/i.test(key)) return false;
  const normalizedValue = value.toLowerCase();
  return /(?:^|\/)(?:docker|containerd|podman|colima|ssh-agent|gpg-agent)[._-]?(?:engine)?\.sock$/i.test(value)
    || /\.sock$/i.test(value)
    || normalizedValue.startsWith("\\\\.\\pipe\\")
    || normalizedValue.startsWith("//./pipe/");
}

function looksRuntimeExecutionArgument(key: string, value: unknown): boolean {
  if (!/(?:^|[_-])(?:command|cmd|shell|script|exec|executable|program|process|argv|args|entrypoint|runtime|container)(?:$|[_-])/i.test(key)) {
    return false;
  }
  if (Array.isArray(value)) return value.some((entry) => typeof entry === "string" && entry.trim());
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/(?:^|\s)(?:bash|sh|zsh|fish|powershell|cmd(?:\.exe)?|python\d*|node|npx|uvx|npm|pnpm|yarn|bun|deno|docker|podman|kubectl|terraform|git|gh|curl|wget|make|cargo|go|java|mvn|gradle)\b/i.test(trimmed)) {
    return true;
  }
  return /[;&|`$<>]/.test(trimmed);
}

function addRuntimeArgumentResource(collector: ResourceCollector, visit: ArgumentVisit, descriptor: McpToolDescriptor): void {
  const argumentHash = hashRuntimeArgument(visit.path, visit.value);
  addResource(collector, {
    kind: "runtime",
    action: "execute",
    label: `${descriptor.serverId}/${descriptor.name} runtime argument ${visit.path}`,
    identity: `runtime:argument:${descriptor.serverId}:${descriptor.name}:${argumentHash}`,
    risk: "high",
    evidence: `Tool argument ${visit.path} supplies process/runtime execution input.`,
  });
}

function hashRuntimeArgument(path: string, value: unknown): string {
  return createHash("sha256")
    .update(`${path}\0${stringifyRuntimeArgumentForHash(value)}`)
    .digest("hex")
    .slice(0, 16);
}

function stringifyRuntimeArgumentForHash(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

function mentionsRuntimeProcess(text: string): boolean {
  return /\b(?:shell|subprocess|terminal|command|commands|execute|exec|spawn|script|scripts|npx|uvx|docker|container|containers|podman|kubectl|kubernetes|terraform|python script|node script)\b/i.test(text);
}

function mentionsBrowserRuntime(text: string): boolean {
  return /\b(?:browser|chrome|chromium|playwright|puppeteer|selenium|webdriver|headless|screenshot|screenshots|dom automation|page automation)\b/i.test(text);
}

function isSocketIpcProtocol(protocol: string): boolean {
  return protocol === "unix:" || protocol === "socket:" || protocol === "ipc:" || protocol === "pipe:" || protocol === "npipe:";
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || host === "0.0.0.0" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function isDeniedNetworkHost(host: string): boolean {
  if (host === "169.254.169.254" || host === "metadata.google.internal") return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (/^169\.254(?:\.\d{1,3}){2}$/.test(host)) return true;
  if (/^(?:fc|fd|fe80):/i.test(host)) return true;
  return false;
}

function redactedUrlForMessage(url: URL): string {
  return `${url.protocol}//${url.hostname}${url.pathname ? "/..." : ""}`;
}

function exactGrantPlan(evaluation: McpPermissionPolicyEvaluation, reusableScopeLimit?: PermissionGrantScopeKind[]): McpPermissionPromptGrantPlan {
  return {
    grantTargetLabel: evaluation.grantTargetLabel,
    grantTargetIdentity: evaluation.grantTargetIdentity,
    grantConditions: evaluation.grantConditions,
    reusableScopes: limitReusableScopes(evaluation.reusableScopes, reusableScopeLimit),
    profile: "exact",
  };
}

function publicWebEgressGrantPlan(
  evaluation: McpPermissionPolicyEvaluation,
  activeGrants: AmbientPermissionGrant[],
): McpPermissionPromptGrantPlan {
  const resources = publicWebEgressGrantResources(evaluation);
  return {
    grantTargetLabel: `Call MCP tool ${evaluation.subject.serverId}/${evaluation.subject.toolName} for public HTTPS hosts`,
    grantTargetIdentity: [
      "ambient-mcp-tool-call-v1",
      evaluation.subject.serverId,
      evaluation.subject.workloadName,
      evaluation.subject.toolName,
      evaluation.subject.descriptorHash ?? "no-descriptor-hash",
      "profile:public-web-egress",
      ...resources.map((resource) => resource.identity),
    ].join("\0"),
    grantConditions: {
      ...evaluation.grantConditions,
      profile: "public-web-egress",
      profileReason: "Repeated compatible public HTTPS approvals for this MCP tool descriptor.",
      observedPriorHosts: priorPublicWebHosts(evaluation, activeGrants),
      resources: resources.map((resource) => ({
        kind: resource.kind,
        action: resource.action,
        identity: resource.identity,
        label: resource.label,
        risk: resource.risk,
      })),
    },
    reusableScopes: evaluation.reusableScopes,
    profile: "public-web-egress",
  };
}

function withReusableScopeLimit(plan: McpPermissionPromptGrantPlan, reusableScopeLimit: PermissionGrantScopeKind[] | undefined): McpPermissionPromptGrantPlan {
  return reusableScopeLimit ? { ...plan, reusableScopes: limitReusableScopes(plan.reusableScopes, reusableScopeLimit) } : plan;
}

function limitReusableScopes(scopes: PermissionGrantScopeKind[], limit: PermissionGrantScopeKind[] | undefined): PermissionGrantScopeKind[] {
  return limit ? scopes.filter((scope) => limit.includes(scope)) : scopes;
}

function publicWebEgressGrantResources(evaluation: McpPermissionPolicyEvaluation): McpPermissionResource[] {
  const nonNetwork = evaluation.resources.filter((resource) => resource.kind !== "network");
  const publicWebResource: McpPermissionResource = {
    kind: "network",
    action: "connect",
    label: "Public HTTPS hosts",
    identity: "network:https:*",
    risk: "medium",
    evidence: "Escalated after repeated compatible public HTTPS MCP grants.",
  };
  return [
    ...nonNetwork,
    publicWebResource,
  ].sort(compareResources);
}

function isPublicWebEgressCandidate(evaluation: McpPermissionPolicyEvaluation): boolean {
  if (evaluation.resources.some((resource) => resource.risk === "high")) return false;
  const networkResources = evaluation.resources.filter((resource) => resource.kind === "network");
  if (!networkResources.length) return false;
  return evaluation.resources.every((resource) => {
    if (resource.kind === "network") return resource.action === "connect" && resource.identity.startsWith("network:https:") && resource.identity !== "network:https:*";
    return resource.kind === "tool-call" || resource.kind === "local-endpoint";
  });
}

function localEndpointGrantPlan(
  evaluation: McpPermissionPolicyEvaluation,
  activeGrants: AmbientPermissionGrant[],
): McpPermissionPromptGrantPlan {
  const resources = localEndpointGrantResources(evaluation);
  return {
    grantTargetLabel: `Call MCP tool ${evaluation.subject.serverId}/${evaluation.subject.toolName} for reviewed loopback endpoints`,
    grantTargetIdentity: [
      "ambient-mcp-tool-call-v1",
      evaluation.subject.serverId,
      evaluation.subject.workloadName,
      evaluation.subject.toolName,
      evaluation.subject.descriptorHash ?? "no-descriptor-hash",
      "profile:local-endpoint",
      ...resources.map((resource) => resource.identity),
    ].join("\0"),
    grantConditions: {
      ...evaluation.grantConditions,
      profile: "local-endpoint",
      profileReason: "Repeated compatible loopback endpoint approvals for this MCP tool descriptor.",
      observedPriorEndpoints: priorLocalEndpoints(evaluation, activeGrants),
      resources: resources.map((resource) => ({
        kind: resource.kind,
        action: resource.action,
        identity: resource.identity,
        label: resource.label,
        risk: resource.risk,
      })),
    },
    reusableScopes: evaluation.reusableScopes,
    profile: "local-endpoint",
  };
}

function localEndpointGrantResources(evaluation: McpPermissionPolicyEvaluation): McpPermissionResource[] {
  const nonLocalEndpoint = evaluation.resources.filter((resource) => resource.kind !== "local-endpoint");
  const localEndpointResource: McpPermissionResource = {
    kind: "local-endpoint",
    action: "connect",
    label: "Reviewed loopback endpoints",
    identity: "local-endpoint:loopback:*",
    risk: "medium",
    evidence: "Escalated after repeated compatible loopback MCP grants.",
  };
  return [
    ...nonLocalEndpoint,
    localEndpointResource,
  ].sort(compareResources);
}

function isLocalEndpointGrantCandidate(evaluation: McpPermissionPolicyEvaluation): boolean {
  if (evaluation.resources.some((resource) => resource.risk === "high")) return false;
  const localResources = evaluation.resources.filter((resource) => resource.kind === "local-endpoint");
  if (!localResources.length) return false;
  return evaluation.resources.every((resource) => {
    if (resource.kind === "local-endpoint") return resource.action === "connect" && resource.identity.startsWith("local-endpoint:") && resource.identity !== "local-endpoint:loopback:*";
    return resource.kind === "tool-call";
  });
}

function filesystemDirectoryGrantPlan(
  evaluation: McpPermissionPolicyEvaluation,
  activeGrants: AmbientPermissionGrant[],
  candidate: FilesystemDirectoryGrantCandidate,
): McpPermissionPromptGrantPlan {
  const resources = filesystemDirectoryGrantResources(evaluation, candidate);
  return {
    grantTargetLabel: `Call MCP tool ${evaluation.subject.serverId}/${evaluation.subject.toolName} for ${candidate.directoryLabel}`,
    grantTargetIdentity: [
      "ambient-mcp-tool-call-v1",
      evaluation.subject.serverId,
      evaluation.subject.workloadName,
      evaluation.subject.toolName,
      evaluation.subject.descriptorHash ?? "no-descriptor-hash",
      "profile:filesystem-directory",
      candidate.directoryIdentity,
      ...resources.map((resource) => resource.identity),
    ].join("\0"),
    grantConditions: {
      ...evaluation.grantConditions,
      profile: "filesystem-directory",
      profileReason: "Repeated compatible same-directory filesystem approvals for this MCP tool descriptor.",
      filesystemAction: candidate.action,
      filesystemDirectory: candidate.directoryLabel,
      observedPriorPaths: priorFilesystemPaths(evaluation, activeGrants, candidate),
      resources: resources.map((resource) => ({
        kind: resource.kind,
        action: resource.action,
        identity: resource.identity,
        label: resource.label,
        risk: resource.risk,
      })),
    },
    reusableScopes: evaluation.reusableScopes,
    profile: "filesystem-directory",
  };
}

function filesystemDirectoryGrantResources(
  evaluation: McpPermissionPolicyEvaluation,
  candidate: FilesystemDirectoryGrantCandidate,
): McpPermissionResource[] {
  const nonFilesystem = evaluation.resources.filter((resource) => resource.kind !== "filesystem");
  const directoryResource: McpPermissionResource = {
    kind: "filesystem",
    action: candidate.action,
    label: `${candidate.directoryLabel}/*`,
    identity: `${candidate.directoryIdentity}:*`,
    risk: "medium",
    evidence: "Escalated after repeated compatible same-directory MCP filesystem grants.",
  };
  return [
    ...nonFilesystem,
    directoryResource,
  ].sort(compareResources);
}

function filesystemDirectoryCandidate(evaluation: McpPermissionPolicyEvaluation): FilesystemDirectoryGrantCandidate | undefined {
  if (evaluation.resources.some((resource) => resource.risk === "high")) return undefined;
  const filesystemResources = evaluation.resources.filter((resource) => resource.kind === "filesystem");
  if (!filesystemResources.length) return undefined;
  if (!evaluation.resources.every((resource) => resource.kind === "tool-call" || resource.kind === "filesystem" || resource.kind === "local-endpoint")) return undefined;
  const parsed = filesystemResources.map(filesystemDirectoryForResource);
  if (parsed.some((entry) => !entry)) return undefined;
  const first = parsed[0]!;
  if (!parsed.every((entry) => entry?.action === first.action && entry.directoryIdentity === first.directoryIdentity)) return undefined;
  return first;
}

function priorPublicWebHosts(evaluation: McpPermissionPolicyEvaluation, grants: AmbientPermissionGrant[]): string[] {
  const hosts = new Set<string>();
  for (const grant of grants) {
    const resources = compatibleMcpGrantResources(evaluation, grant);
    if (!resources) continue;
    for (const resource of resources) {
      if (resource.kind !== "network" || resource.action !== "connect") continue;
      if (typeof resource.identity !== "string" || !resource.identity.startsWith("network:https:") || resource.identity === "network:https:*") continue;
      hosts.add(resource.label || resource.identity.slice("network:https:".length));
    }
  }
  return [...hosts].sort();
}

function priorLocalEndpoints(evaluation: McpPermissionPolicyEvaluation, grants: AmbientPermissionGrant[]): string[] {
  const endpoints = new Set<string>();
  for (const grant of grants) {
    const resources = compatibleMcpGrantResources(evaluation, grant);
    if (!resources) continue;
    for (const resource of resources) {
      if (resource.kind !== "local-endpoint" || resource.action !== "connect") continue;
      if (typeof resource.identity !== "string" || !resource.identity.startsWith("local-endpoint:") || resource.identity === "local-endpoint:loopback:*") continue;
      endpoints.add(resource.label || resource.identity.slice("local-endpoint:".length));
    }
  }
  return [...endpoints].sort();
}

function priorFilesystemPaths(
  evaluation: McpPermissionPolicyEvaluation,
  grants: AmbientPermissionGrant[],
  candidate: FilesystemDirectoryGrantCandidate,
): string[] {
  const paths = new Set<string>();
  for (const grant of grants) {
    const resources = compatibleMcpGrantResources(evaluation, grant);
    if (!resources) continue;
    for (const resource of resources) {
      if (resource.kind !== "filesystem" || resource.action !== candidate.action) continue;
      if (typeof resource.identity !== "string" || resource.identity === `${candidate.directoryIdentity}:*`) continue;
      const directory = filesystemDirectoryForIdentity(resource.identity);
      if (directory?.directoryIdentity !== candidate.directoryIdentity || directory.action !== candidate.action) continue;
      paths.add(resource.label || resource.identity.slice(`filesystem:${candidate.action}:`.length));
    }
  }
  return [...paths].sort();
}

function filesystemDirectoryForResource(resource: McpPermissionResource): FilesystemDirectoryGrantCandidate | undefined {
  if (resource.kind !== "filesystem") return undefined;
  if (resource.action !== "read" && resource.action !== "write") return undefined;
  return filesystemDirectoryForIdentity(resource.identity);
}

function filesystemDirectoryForIdentity(identity: unknown): FilesystemDirectoryGrantCandidate | undefined {
  if (typeof identity !== "string") return undefined;
  const match = identity.match(/^filesystem:(read|write):(workspace:.+)$/);
  if (!match) return undefined;
  const action = match[1] as "read" | "write";
  const pathLabel = match[2];
  if (pathLabel.endsWith("/*")) return undefined;
  const slashIndex = pathLabel.lastIndexOf("/");
  if (slashIndex <= "workspace:".length) return undefined;
  const directoryLabel = pathLabel.slice(0, slashIndex);
  return {
    action,
    directoryLabel,
    directoryIdentity: `filesystem:${action}:${directoryLabel}`,
  };
}

function compatibleMcpGrantResources(
  evaluation: McpPermissionPolicyEvaluation,
  grant: AmbientPermissionGrant,
): Array<{ kind?: unknown; action?: unknown; identity?: unknown; label?: string }> | undefined {
  if (grant.actionKind !== "plugin_tool_execute" || grant.targetKind !== "tool") return undefined;
  const conditions = grant.conditions;
  if (!conditions || conditions.kind !== "ambient-mcp-tool-call") return undefined;
  if (conditions.schemaVersion !== "ambient-mcp-permission-policy-v1") return undefined;
  if (conditions.descriptorHash !== evaluation.subject.descriptorHash) return undefined;
  const subject = conditions.subject;
  if (!subject || typeof subject !== "object") return undefined;
  const subjectRecord = subject as Record<string, unknown>;
  if (subjectRecord.serverId !== evaluation.subject.serverId) return undefined;
  if (subjectRecord.workloadName !== evaluation.subject.workloadName) return undefined;
  if (subjectRecord.toolName !== evaluation.subject.toolName) return undefined;
  const resources = conditions.resources;
  return Array.isArray(resources) ? resources as Array<{ kind?: unknown; action?: unknown; identity?: unknown; label?: string }> : undefined;
}

function activeGrantAppliesToContext(grant: AmbientPermissionGrant, context: McpPermissionGrantPlanningContext | undefined): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) return false;
  if (!context) return true;
  if (grant.scopeKind === "thread") return Boolean(context.threadId && grant.threadId === context.threadId);
  if (grant.scopeKind === "workflow_thread") return Boolean(context.workflowThreadId && grant.workflowThreadId === context.workflowThreadId);
  if (grant.scopeKind === "project") return Boolean(context.projectPath && grant.projectPath === context.projectPath);
  if (grant.scopeKind === "workspace") return Boolean(context.workspacePath && grant.workspacePath === context.workspacePath);
  return grant.scopeKind === "global_plugin";
}

function pluginToolGrantHash(identity: string): string {
  return createHash("sha256").update(`plugin_tool_execute\0tool\0${identity}`).digest("hex");
}

export function mcpPermissionGrantIdentityHash(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

export function mcpPermissionGrantIdsForDescriptorDrift(input: McpDescriptorDriftGrantInvalidationInput): string[] {
  if (!input.previousDescriptorHash || input.previousDescriptorHash === input.descriptorHash) return [];
  return input.grants
    .filter((grant) => mcpPermissionGrantMatchesPreviousDescriptorHash(grant, input))
    .map((grant) => grant.id);
}

function mcpPermissionGrantMatchesPreviousDescriptorHash(
  grant: AmbientPermissionGrant,
  input: McpDescriptorDriftGrantInvalidationInput,
): boolean {
  if (grant.revokedAt) return false;
  if (grant.actionKind !== "plugin_tool_execute" || grant.targetKind !== "tool") return false;
  const conditions = grant.conditions;
  if (!conditions || conditions.kind !== "ambient-mcp-tool-call") return false;
  if (conditions.schemaVersion !== "ambient-mcp-permission-policy-v1") return false;
  const subject = conditions.subject;
  if (!subject || typeof subject !== "object") return false;
  const subjectRecord = subject as Record<string, unknown>;
  if (subjectRecord.serverId !== input.serverId) return false;
  if (subjectRecord.workloadName !== input.workloadName) return false;
  const grantDescriptorHash = typeof conditions.descriptorHash === "string"
    ? conditions.descriptorHash
    : typeof subjectRecord.descriptorHash === "string"
      ? subjectRecord.descriptorHash
      : undefined;
  return grantDescriptorHash === input.previousDescriptorHash;
}
