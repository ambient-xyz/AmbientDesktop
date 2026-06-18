import type { PermissionGrantScopeKind } from "../../shared/permissionTypes";
import type { McpPermissionPolicyEvaluation, McpPermissionResource } from "./mcpPermissionPolicyService";
import type { ToolHiveInstalledServerState } from "./mcpToolRuntimeFacade";

export type McpRuntimePermissionStatus = "enforced" | "broad-runtime-profile" | "not-applicable" | "blocked";
export type McpRuntimeNetworkMode = "isolated" | "allowlist" | "broad" | "unknown";
export type McpRuntimeFilesystemMode = "isolated" | "allowlist" | "broad" | "unknown";

export interface McpRuntimePermissionEnforcementInput {
  permission: McpPermissionPolicyEvaluation;
  server: ToolHiveInstalledServerState;
  permissionProfile: Record<string, unknown>;
  profilePath: string;
  profileSha256: string;
  expectedProfileSha256: string;
  profileSha256Verified: boolean;
}

export interface McpRuntimePermissionEnforcement {
  status: McpRuntimePermissionStatus;
  serverId: string;
  workloadName: string;
  blockers: string[];
  warnings: string[];
  profilePath: string;
  profileSha256: string;
  expectedProfileSha256: string;
  profileSha256Verified: boolean;
  networkMode: McpRuntimeNetworkMode;
  allowHosts: string[];
  allowPorts: number[];
  filesystemMode: McpRuntimeFilesystemMode;
  allowReadPaths: string[];
  allowWritePaths: string[];
  publicWebEgressGrantEnforced: boolean;
  deniedResources: McpRuntimePermissionDeniedResource[];
  repairHint?: McpRuntimePermissionRepairHint;
  reusableScopeLimit?: PermissionGrantScopeKind[];
}

export interface McpRuntimePermissionDeniedResource {
  kind: McpPermissionResource["kind"] | "permission-profile";
  action?: McpPermissionResource["action"];
  label: string;
  identity: string;
  risk?: McpPermissionResource["risk"];
  evidence?: string;
  host?: string;
  port?: number;
  reason: string;
}

export interface McpRuntimePermissionRepairHint {
  schemaVersion: "ambient-mcp-runtime-repair-hint-v1";
  nextToolName: "ambient_mcp_runtime_repair_describe";
  nextToolInput: {
    serverId: string;
    workloadName: string;
    failureText: string;
    reason: string;
  };
  profileSummary: {
    networkMode: McpRuntimeNetworkMode;
    allowHosts: string[];
    allowPorts: number[];
    filesystemMode: McpRuntimeFilesystemMode;
    allowReadPaths: string[];
    allowWritePaths: string[];
    profileSha256Verified: boolean;
  };
  deniedResources: McpRuntimePermissionDeniedResource[];
  guidance: string[];
}

export function evaluateMcpRuntimePermissionEnforcement(input: McpRuntimePermissionEnforcementInput): McpRuntimePermissionEnforcement {
  const networkProfile = classifyNetworkProfile(input.permissionProfile);
  const filesystemProfile = classifyFilesystemProfile(input.permissionProfile);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const deniedResources: McpRuntimePermissionDeniedResource[] = [];
  if (!input.profileSha256Verified) {
    blockers.push(`Installed ToolHive permission profile hash changed for ${input.server.workloadName}; expected ${input.expectedProfileSha256}, found ${input.profileSha256}.`);
    deniedResources.push({
      kind: "permission-profile",
      label: input.profilePath,
      identity: `permission-profile:${input.server.workloadName}`,
      reason: "Installed ToolHive permission profile hash changed.",
    });
  }

  const runtimeLane = input.server.sourceIdentity?.runtimeLane;
  const networkResources = input.permission.resources.filter((resource) => resource.kind === "network");
  const localEndpointResources = input.permission.resources.filter((resource) => resource.kind === "local-endpoint" && resource.evidence !== "descriptor.endpoint");
  const filesystemResources = input.permission.resources.filter((resource) => resource.kind === "filesystem");
  if (runtimeLane === "guided-local-bridge" && networkResources.length) {
    blockers.push("Guided local MCP bridges cannot satisfy external network resources through ToolHive containment. Use a ToolHive-managed runtime for network-capable MCP tools.");
    deniedResources.push(...networkResources.map((resource) => deniedResource(resource, "Guided local MCP bridges cannot satisfy external network resources through ToolHive containment.")));
  }
  if (runtimeLane !== "guided-local-bridge" && localEndpointResources.length) {
    blockers.push("Loopback MCP tool arguments require a guided local bridge runtime. ToolHive-managed standard MCP runtimes cannot safely grant arbitrary host-loopback access from tool arguments.");
    deniedResources.push(...localEndpointResources.map((resource) => deniedResource(resource, "Loopback MCP tool arguments require a guided local bridge runtime.")));
  }

  if (networkResources.length) {
    if (networkProfile.mode === "isolated") {
      blockers.push("Installed ToolHive permission profile is network-isolated but this MCP tool call requests outbound network access.");
      deniedResources.push(...networkResources.map((resource) => deniedResource(resource, "Installed ToolHive permission profile is network-isolated.")));
    } else if (networkProfile.mode === "allowlist") {
      for (const resource of networkResources) {
        const target = parseNetworkResource(resource.identity);
        if (!target) {
          blockers.push(`MCP network resource is not representable as an exact HTTPS host grant: ${resource.identity}.`);
          deniedResources.push(deniedResource(resource, "MCP network resource is not representable as an exact HTTPS host grant."));
          continue;
        }
        if (!networkProfile.allows(target.host, target.port)) {
          blockers.push(`Installed ToolHive permission profile does not allow ${target.host}:${target.port}. Reinstall or update the MCP server permission profile before calling this tool.`);
          deniedResources.push(deniedResource(resource, `Installed ToolHive permission profile does not allow ${target.host}:${target.port}.`, target));
        }
      }
    } else if (networkProfile.mode === "broad") {
      warnings.push("Installed ToolHive permission profile allows broad outbound network access, so Ambient cannot enforce this call's exact host grant at the runtime boundary.");
    } else {
      warnings.push("Installed ToolHive permission profile network shape is unknown; Ambient cannot prove exact runtime network enforcement for this call.");
    }
  } else if (networkProfile.mode === "broad") {
    warnings.push("Installed ToolHive permission profile allows broad outbound network access. This MCP call has no explicit network argument, but hidden tool behavior is governed by the install-time runtime profile.");
  }

  if (filesystemResources.length) {
    if (filesystemProfile.mode === "isolated") {
      blockers.push("Installed ToolHive permission profile is filesystem-isolated but this MCP tool call requests filesystem access.");
      deniedResources.push(...filesystemResources.map((resource) => deniedResource(resource, "Installed ToolHive permission profile is filesystem-isolated.")));
    } else if (filesystemProfile.mode === "unknown") {
      blockers.push("Installed ToolHive permission profile does not declare filesystem access, so Ambient cannot prove runtime filesystem enforcement for this MCP tool call.");
      deniedResources.push(...filesystemResources.map((resource) => deniedResource(resource, "Installed ToolHive permission profile does not declare filesystem access.")));
    } else if (filesystemProfile.mode === "allowlist") {
      for (const resource of filesystemResources) {
        if (!filesystemProfile.allows(resource.identity)) {
          blockers.push(`Installed ToolHive permission profile does not allow ${resource.label}. Reinstall or update the MCP server permission profile before calling this tool.`);
          deniedResources.push(deniedResource(resource, `Installed ToolHive permission profile does not allow ${resource.label}.`));
        }
      }
    } else if (filesystemProfile.mode === "broad") {
      warnings.push("Installed ToolHive permission profile allows broad filesystem access, so Ambient cannot enforce this call's exact path grant at the runtime boundary.");
    }
  } else if (filesystemProfile.mode === "broad") {
    warnings.push("Installed ToolHive permission profile allows broad filesystem access. This MCP call has no explicit filesystem argument, but hidden tool behavior is governed by the install-time runtime profile.");
  }

  const status: McpRuntimePermissionStatus = blockers.length
    ? "blocked"
    : runtimeLane === "guided-local-bridge"
      ? "not-applicable"
      : networkProfile.mode === "broad" || filesystemProfile.mode === "broad"
        ? "broad-runtime-profile"
        : "enforced";

  const enforcement: McpRuntimePermissionEnforcement = {
    status,
    serverId: input.server.serverId,
    workloadName: input.server.workloadName,
    blockers,
    warnings,
    profilePath: input.profilePath,
    profileSha256: input.profileSha256,
    expectedProfileSha256: input.expectedProfileSha256,
    profileSha256Verified: input.profileSha256Verified,
    networkMode: networkProfile.mode,
    allowHosts: networkProfile.allowHosts,
    allowPorts: networkProfile.allowPorts,
    filesystemMode: filesystemProfile.mode,
    allowReadPaths: filesystemProfile.allowReadPaths,
    allowWritePaths: filesystemProfile.allowWritePaths,
    publicWebEgressGrantEnforced: false,
    deniedResources,
    ...(status === "broad-runtime-profile"
      || status === "not-applicable"
      || (networkProfile.mode === "unknown" && networkResources.length)
      || (filesystemProfile.mode === "unknown" && filesystemResources.length)
      ? { reusableScopeLimit: ["thread"] as PermissionGrantScopeKind[] }
      : {}),
  };
  const repairHint = runtimeRepairHint(enforcement);
  return repairHint ? { ...enforcement, repairHint } : enforcement;
}

export function mcpRuntimePermissionEnforcementDetailText(enforcement: McpRuntimePermissionEnforcement): string {
  const blockerLines = enforcement.blockers.length ? enforcement.blockers.map((blocker) => `- ${blocker}`) : ["- none"];
  const warningLines = enforcement.warnings.length ? enforcement.warnings.map((warning) => `- ${warning}`) : ["- none"];
  return [
    "MCP runtime enforcement:",
    `- Status: ${enforcement.status}`,
    `- Permission profile: ${enforcement.profilePath}`,
    `- Profile hash verified: ${enforcement.profileSha256Verified ? "yes" : "no"}`,
    `- Network mode: ${enforcement.networkMode}`,
    enforcement.allowHosts.length ? `- Allowed hosts: ${enforcement.allowHosts.join(", ")}` : undefined,
    enforcement.allowPorts.length ? `- Allowed ports: ${enforcement.allowPorts.join(", ")}` : undefined,
    `- Filesystem mode: ${enforcement.filesystemMode}`,
    enforcement.allowReadPaths.length ? `- Allowed read paths: ${enforcement.allowReadPaths.join(", ")}` : undefined,
    enforcement.allowWritePaths.length ? `- Allowed write paths: ${enforcement.allowWritePaths.join(", ")}` : undefined,
    "- Blockers:",
    ...blockerLines,
    "- Warnings:",
    ...warningLines,
  ].filter((line) => line !== undefined).join("\n");
}

export function mcpRuntimePermissionBlockedMessage(enforcement: McpRuntimePermissionEnforcement): string {
  const repairHint = enforcement.blockers.some((blocker) => /filesystem|permission profile|network/i.test(blocker))
    ? " This is a server runtime-profile issue, not a per-tool policy issue: do not use ambient_mcp_tool_policy_update, shell, /tmp workarounds, or direct ToolHive profile reads. Reinstall or repair the Ambient-managed ToolHive server with a permission profile that exposes only the required managed exchange or host allowlist, then retry ambient_mcp_tool_call."
    : "";
  const structuredHint = enforcement.repairHint
    ? ` Next repair tool: ${enforcement.repairHint.nextToolName} ${JSON.stringify(enforcement.repairHint.nextToolInput)}.`
    : "";
  return `MCP tool call blocked by Ambient runtime permission enforcement: ${enforcement.blockers.join(" ")}${repairHint}${structuredHint}`;
}

function deniedResource(
  resource: McpPermissionResource,
  reason: string,
  target?: { host: string; port: number },
): McpRuntimePermissionDeniedResource {
  return {
    kind: resource.kind,
    action: resource.action,
    label: resource.label,
    identity: resource.identity,
    risk: resource.risk,
    evidence: resource.evidence,
    ...(target ? { host: target.host, port: target.port } : {}),
    reason,
  };
}

function runtimeRepairHint(enforcement: McpRuntimePermissionEnforcement): McpRuntimePermissionRepairHint | undefined {
  if (enforcement.status !== "blocked") return undefined;
  if (!enforcement.deniedResources.some((resource) => resource.kind === "network" || resource.kind === "filesystem" || resource.kind === "permission-profile")) return undefined;
  const failureText = [
    `MCP runtime permission enforcement blocked ${enforcement.serverId}/${enforcement.workloadName}.`,
    ...enforcement.blockers.map((blocker) => `Blocker: ${blocker}`),
    ...enforcement.deniedResources.map((resource) => `Denied ${resource.kind}: ${resource.label} (${resource.identity})${resource.host ? ` host=${resource.host}:${resource.port ?? 443}` : ""}; reason=${resource.reason}`),
  ].join("\n");
  return {
    schemaVersion: "ambient-mcp-runtime-repair-hint-v1",
    nextToolName: "ambient_mcp_runtime_repair_describe",
    nextToolInput: {
      serverId: enforcement.serverId,
      workloadName: enforcement.workloadName,
      failureText,
      reason: "Repair blocked MCP runtime permission enforcement with typed Autowire plan edits.",
    },
    profileSummary: {
      networkMode: enforcement.networkMode,
      allowHosts: enforcement.allowHosts,
      allowPorts: enforcement.allowPorts,
      filesystemMode: enforcement.filesystemMode,
      allowReadPaths: enforcement.allowReadPaths,
      allowWritePaths: enforcement.allowWritePaths,
      profileSha256Verified: enforcement.profileSha256Verified,
    },
    deniedResources: enforcement.deniedResources,
    guidance: [
      "Call ambient_mcp_runtime_repair_describe with nextToolInput to preview a typed repair.",
      "If the user approves, call ambient_mcp_runtime_repair_apply with the same selector and evidence.",
      "Do not use ambient_mcp_tool_policy_update, shell, direct ToolHive commands, or raw permission-profile edits for runtime repair.",
    ],
  };
}

function classifyNetworkProfile(profile: Record<string, unknown>): {
  mode: McpRuntimeNetworkMode;
  allowHosts: string[];
  allowPorts: number[];
  allows: (host: string, port: number) => boolean;
} {
  const network = recordValue(profile.network);
  const outbound = recordValue(network?.outbound) ?? network ?? {};
  const allowHosts = stringList(outbound, ["allow_host", "allowHost", "allow_hosts", "allowHosts", "hosts", "host"]);
  const allowPorts = numberList(outbound, ["allow_port", "allowPort", "allow_ports", "allowPorts", "ports", "port"]);
  const broad = outbound.insecure_allow_all === true || outbound.insecureAllowAll === true || outbound.mode === "broad" || network?.mode === "broad";
  const mode: McpRuntimeNetworkMode = broad
    ? "broad"
    : allowHosts.length || allowPorts.length
      ? "allowlist"
      : Object.keys(outbound).length || network
        ? "isolated"
        : "unknown";
  return {
    mode,
    allowHosts,
    allowPorts,
    allows: (host, port) => {
      if (mode === "broad") return true;
      if (mode !== "allowlist") return false;
      const hostAllowed = allowHosts.some((allowed) => hostMatches(allowed, host));
      const portAllowed = allowPorts.length === 0 || allowPorts.includes(port);
      return hostAllowed && portAllowed;
    },
  };
}

function classifyFilesystemProfile(profile: Record<string, unknown>): {
  mode: McpRuntimeFilesystemMode;
  allowReadPaths: string[];
  allowWritePaths: string[];
  allows: (identity: string) => boolean;
} {
  const filesystem = recordValue(profile.filesystem);
  const rawReadPaths = stringList(filesystem ?? {}, ["allow_read", "allowRead", "allow_read_paths", "allowReadPaths", "read", "readPaths", "read_paths"]);
  const rawWritePaths = stringList(filesystem ?? {}, ["allow_write", "allowWrite", "allow_write_paths", "allowWritePaths", "write", "writePaths", "write_paths"]);
  const mountPaths = mountPathLists(filesystem?.extraMounts ?? filesystem?.mounts);
  const workspaceRead = filesystem?.workspaceRead === true || filesystem?.workspace_read === true;
  const workspaceWrite = filesystem?.workspaceWrite === true || filesystem?.workspace_write === true;
  const broad = filesystem?.insecure_allow_all === true
    || filesystem?.insecureAllowAll === true
    || filesystem?.allow_all === true
    || filesystem?.allowAll === true
    || filesystem?.mode === "broad";
  const allowReadPaths = normalizeFilesystemAllowPaths([
    ...rawReadPaths,
    ...mountPaths.readPaths,
    ...(workspaceRead || workspaceWrite ? ["workspace:*"] : []),
  ]);
  const allowWritePaths = normalizeFilesystemAllowPaths([
    ...rawWritePaths,
    ...mountPaths.writePaths,
    ...(workspaceWrite ? ["workspace:*"] : []),
  ]);
  const hasShape = Boolean(filesystem);
  const mode: McpRuntimeFilesystemMode = broad
    ? "broad"
    : allowReadPaths.length || allowWritePaths.length
      ? "allowlist"
      : hasShape
        ? "isolated"
        : "unknown";
  return {
    mode,
    allowReadPaths,
    allowWritePaths,
    allows: (identity) => {
      if (mode === "broad") return true;
      if (mode !== "allowlist") return false;
      const parsed = parseFilesystemResource(identity);
      if (!parsed) return false;
      const allowedPaths = parsed.action === "write" ? allowWritePaths : [...allowReadPaths, ...allowWritePaths];
      return allowedPaths.some((allowed) => pathGrantMatches(allowed, parsed.pathLabel));
    },
  };
}

function parseFilesystemResource(identity: string): { action: "read" | "write"; pathLabel: string } | undefined {
  const match = identity.match(/^filesystem:(read|write):(.+)$/);
  if (!match) return undefined;
  return { action: match[1] as "read" | "write", pathLabel: match[2] };
}

function parseNetworkResource(identity: string): { host: string; port: number } | undefined {
  const prefix = "network:https:";
  if (!identity.startsWith(prefix) || identity === `${prefix}*`) return undefined;
  const hostPort = identity.slice(prefix.length);
  const lastColon = hostPort.lastIndexOf(":");
  if (lastColon <= 0) return undefined;
  const host = hostPort.slice(0, lastColon).toLowerCase();
  const port = Number(hostPort.slice(lastColon + 1));
  if (!host || !Number.isInteger(port) || port <= 0) return undefined;
  return { host, port };
}

function hostMatches(allowed: string, host: string): boolean {
  const normalizedAllowed = allowed.trim().toLowerCase();
  const normalizedHost = host.trim().toLowerCase();
  if (!normalizedAllowed) return false;
  if (normalizedAllowed === normalizedHost) return true;
  if (normalizedAllowed.startsWith(".")) return normalizedHost.endsWith(normalizedAllowed);
  if (normalizedAllowed.startsWith("*.")) return normalizedHost === normalizedAllowed.slice(2) || normalizedHost.endsWith(normalizedAllowed.slice(1));
  return false;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function mountPathLists(value: unknown): { readPaths: string[]; writePaths: string[] } {
  if (!Array.isArray(value)) return { readPaths: [], writePaths: [] };
  const readPaths: string[] = [];
  const writePaths: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      readPaths.push(entry);
      continue;
    }
    const mount = recordValue(entry);
    if (!mount) continue;
    const paths = mountGrantPaths(mount);
    if (!paths.length) continue;
    const mode = stringField(mount, ["mode", "access", "permission"])?.toLowerCase() ?? "read";
    if (mode.includes("write") || mode === "rw" || mode === "readwrite" || mode === "read-write") {
      writePaths.push(...paths);
      readPaths.push(...paths);
    } else {
      readPaths.push(...paths);
    }
  }
  return { readPaths, writePaths };
}

function mountGrantPaths(mount: Record<string, unknown>): string[] {
  const hostPath = stringField(mount, ["path", "source", "hostPath", "host_path"]);
  const containerPath = stringField(mount, ["containerPath", "container_path", "target", "destination"]);
  return [...new Set([hostPath, containerPath].flatMap((path) => path ? recursivePathGrant(path) : []))];
}

function recursivePathGrant(path: string): string[] {
  const normalized = path.replace(/\/+$/, "") || path;
  if (!normalized || normalized === "/" || normalized === "workspace:*" || normalized.endsWith("/*")) return [path];
  return [normalized, `${normalized}/*`];
}

function stringList(record: Record<string, unknown>, keys: string[]): string[] {
  const values = keys.flatMap((key) => {
    const value = record[key];
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  });
  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function numberList(record: Record<string, unknown>, keys: string[]): number[] {
  const values = keys.flatMap((key) => {
    const value = record[key];
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  });
  return [...new Set(values.map((value) => typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined)
    .filter((value): value is number => value !== undefined && Number.isInteger(value) && value > 0))].sort((left, right) => left - right);
}

function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeFilesystemAllowPaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))].sort();
}

function pathGrantMatches(grantPath: string, pathLabel: string): boolean {
  if (grantPath === "*" || grantPath === "/*" || grantPath === "workspace:*") {
    return grantPath === "*" || grantPath === "/*" ? !pathLabel.startsWith("workspace:") : pathLabel.startsWith("workspace:");
  }
  if (grantPath.endsWith("/*")) {
    const prefix = grantPath.slice(0, -1);
    return pathLabel.startsWith(prefix);
  }
  return pathLabel === grantPath;
}
