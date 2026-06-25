import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import {
  mcpDefaultCatalogUpdatePreviewText,
  mcpDefaultCapabilityInstallPreviewText,
  mcpInstalledServersText,
  mcpRegistryInstallPreviewText,
  mcpServerSearchResultsText,
  type McpInstalledServerSummary,
} from "./mcpInstallCatalog";
import { redactSensitiveText } from "./mcpSecurityFacade";
import {
  errorMessage,
  objectInput,
  optionalBoolean,
  optionalNumber,
  optionalString,
  previewRegistryInstallWithStoredSecrets,
  requiredString,
  runtimeVolumesInput,
  secretBindingsInput,
  selectInstalledServer,
  toolResult,
  type McpServerPiToolDefinition,
} from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions } from "./mcpServerPiToolTypes";
import type { ToolHiveInstalledServerState } from "./mcpToolRuntimeFacade";

export function createMcpServerDiscoveryPiToolDefinitions(options: McpServerPiToolOptions): McpServerPiToolDefinition[] {
  const search = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_search"));
  const describe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_describe"));
  const list = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_list"));
  const diagnostics = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_diagnostics"));
  const defaultUpdateDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_default_update_describe"));
  return [
    {
      ...search,
      parameters: search.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const query = optionalString(input.query);
        const limit = optionalNumber(input.limit);
        const refresh = optionalBoolean(input.refresh);
        onUpdate?.({
          content: [{ type: "text", text: `Searching ToolHive MCP registry${query ? ` for "${query}"` : ""}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_search",
            status: "searching",
            query,
          },
        });
        const results = await options.catalog.searchRegistryServers({ query, limit, refresh });
        return toolResult(mcpServerSearchResultsText(results), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_search",
          status: "complete",
          query,
          resultCount: results.length,
          servers: results.map((result) => ({
            serverId: result.serverId,
            title: result.title,
            catalogSource: result.catalogSource,
            repositoryUrl: result.repositoryUrl,
            installed: result.installed,
            workloadName: result.workloadName,
            riskHints: result.riskHints,
            nextAction: result.nextAction,
          })),
        });
      },
    },
    {
      ...describe,
      parameters: describe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const serverId = requiredString(input, "serverId");
        const refresh = optionalBoolean(input.refresh);
        const secretBindings = secretBindingsInput(input.secretBindings);
        const runtimeVolumes = runtimeVolumesInput(input.runtimeVolumes);
        onUpdate?.({
          content: [{ type: "text", text: `Building MCP install review for ${serverId}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_describe",
            status: "reviewing",
            serverId,
          },
        });
        const defaultCapabilityId = options.catalog.defaultCapabilityIdForServerId(serverId);
        if (defaultCapabilityId) {
          const preview = await options.catalog.previewDefaultCapabilityInstall({ capabilityId: defaultCapabilityId });
          return toolResult(mcpDefaultCapabilityInstallPreviewText(preview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_describe",
            status: preview.review.blockers.length ? "blocked" : "ready-for-review",
            serverId,
            capabilityId: defaultCapabilityId,
            catalogSource: "ambient-default",
            defaultCapability: true,
            candidateId: preview.candidate.id,
            validationStatus: preview.validation.status,
            blockerCount: preview.review.blockers.length,
            warningCount: preview.review.warnings.length,
            runPlan: preview.runPlan,
            permissionProfile: {
              path: preview.permissionProfile.path,
              sha256: preview.permissionProfile.sha256,
            },
            expectedTools: preview.candidate.validationPlan.expectedTools,
          });
        }
        const preview = await previewRegistryInstallWithStoredSecrets(options, {
          serverId,
          refresh,
          explicitSecretBindings: secretBindings,
          runtimeVolumes,
        });
        return toolResult(mcpRegistryInstallPreviewText(preview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_describe",
          status: preview.review.blockers.length ? "blocked" : "ready-for-review",
          serverId,
          candidateId: preview.candidate.id,
          validationStatus: preview.validation.status,
          blockerCount: preview.review.blockers.length,
          warningCount: preview.review.warnings.length,
          runPlan: preview.runPlan,
          toolHiveVolumes: preview.toolHiveVolumes,
          permissionProfile: {
            path: preview.permissionProfile.path,
            sha256: preview.permissionProfile.sha256,
          },
          expectedTools: preview.candidate.validationPlan.expectedTools,
        });
      },
    },
    {
      ...list,
      parameters: list.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, _params, _signal, onUpdate) => {
        onUpdate?.({
          content: [{ type: "text", text: "Listing Ambient-managed ToolHive MCP servers." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_list",
            status: "listing",
          },
        });
        const inventory = await options.catalog.listInstalledServerInventory();
        return toolResult(mcpInstalledServersText(inventory.servers, { unmanagedWorkloads: inventory.unmanagedWorkloads }), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_list",
          status: "complete",
          serverCount: inventory.servers.length,
          unmanagedWorkloadCount: inventory.unmanagedWorkloads.length,
          servers: inventory.servers,
          unmanagedWorkloads: inventory.unmanagedWorkloads,
        });
      },
    },
    {
      ...diagnostics,
      parameters: diagnostics.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        const logLines = optionalNumber(input.logLines);
        if (!serverId && !workloadName) throw new Error("serverId or workloadName is required.");
        onUpdate?.({
          content: [{ type: "text", text: "Reading Ambient MCP server diagnostics." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_diagnostics",
            status: "diagnosing",
            serverId,
            workloadName,
          },
        });
        const diagnosticsResult = await mcpServerDiagnostics(options, { serverId, workloadName, logLines });
        return toolResult(mcpServerDiagnosticsText(diagnosticsResult), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_diagnostics",
          status: "complete",
          serverId: diagnosticsResult.server.serverId,
          workloadName: diagnosticsResult.server.workloadName,
          workloadStatus: diagnosticsResult.server.workloadStatus,
          endpoint: diagnosticsResult.server.endpoint,
          installValidationStatus: diagnosticsResult.server.installValidationStatus,
          validationError: diagnosticsResult.server.installValidationError,
          descriptorHash: diagnosticsResult.server.lastKnownToolDescriptorHash,
          descriptorReviewStatus: diagnosticsResult.server.toolDescriptorReviewStatus,
          permissionProfileSha256: diagnosticsResult.permissionProfile?.sha256,
          permissionProfileVerified: diagnosticsResult.permissionProfile?.sha256Verified,
          secretBindingCount: diagnosticsResult.server.secretBindingCount ?? 0,
          logExitCode: diagnosticsResult.logs?.exitCode,
          logRedacted: diagnosticsResult.logs?.redacted,
        });
      },
    },
    {
      ...defaultUpdateDescribe,
      parameters: defaultUpdateDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        onUpdate?.({
          content: [{ type: "text", text: "Reviewing Ambient MCP default catalog update state." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_default_update_describe",
            status: "reviewing",
            serverId,
            workloadName,
          },
        });
        const preview = await options.catalog.previewDefaultCatalogUpdate({ serverId, workloadName });
        return toolResult(mcpDefaultCatalogUpdatePreviewText(preview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_default_update_describe",
          status: preview.status,
          serverId: preview.serverId,
          workloadName: preview.workloadName,
          currentDescriptorHash: preview.currentDescriptorHash,
          installedDescriptorHash: preview.installedDescriptorHash,
          diffCount: preview.diffs.length,
          diffs: preview.diffs,
          nextAction: preview.nextAction,
        });
      },
    },
  ];
}

interface McpServerDiagnosticsResult {
  server: McpInstalledServerSummary;
  state?: ToolHiveInstalledServerState;
  permissionProfile?: {
    path: string;
    sha256: string;
    expectedSha256: string;
    sha256Verified: boolean;
    network?: {
      mode: "broad" | "allowlist" | "isolated";
      allowHosts: string[];
      allowPorts: number[];
    };
    filesystem?: {
      workspaceRead: boolean;
      workspaceWrite: boolean;
      extraMountCount: number;
    };
    error?: string;
  };
  logs?: {
    status: "fetched" | "skipped" | "failed";
    exitCode?: number;
    text?: string;
    redacted?: boolean;
    error?: string;
  };
}

async function mcpServerDiagnostics(
  options: McpServerPiToolOptions,
  input: { serverId?: string; workloadName?: string; logLines?: number },
): Promise<McpServerDiagnosticsResult> {
  const servers = await options.catalog.listInstalledServers();
  const server = selectInstalledServer(servers, input);
  const state = (await options.toolHive.readState()).installedServers.find((candidate) => candidate.workloadName === server.workloadName);
  let permissionProfile: McpServerDiagnosticsResult["permissionProfile"];
  try {
    const profile = await options.toolHive.readInstalledServerPermissionProfile(server.workloadName);
    const summary = permissionProfileSummary(profile.profile);
    permissionProfile = {
      path: profile.path,
      sha256: profile.sha256,
      expectedSha256: profile.expectedSha256,
      sha256Verified: profile.sha256Verified,
      ...summary,
    };
  } catch (error) {
    permissionProfile = {
      path: server.permissionProfilePath,
      sha256: "",
      expectedSha256: server.permissionProfileSha256,
      sha256Verified: false,
      error: errorMessage(error),
    };
  }

  let logs: McpServerDiagnosticsResult["logs"];
  const guidedLocal = server.runtimeLane === "guided-local-bridge" || server.registrySource === "guided-local-bridge";
  if (guidedLocal) {
    logs = {
      status: "skipped",
      text: "Guided-local bridge endpoints are user-run software; Ambient has no ToolHive workload logs for this registration.",
    };
  } else {
    try {
      const command = await options.toolHive.readWorkloadLogs(server.workloadName, input.logLines ?? 80);
      const raw = [command.stdout, command.stderr].filter(Boolean).join("\n").trim();
      const redacted = truncateDiagnosticText(redactSensitiveText(raw || "(no recent ToolHive logs returned)"), 6_000);
      logs = {
        status: command.exitCode === 0 ? "fetched" : "failed",
        exitCode: command.exitCode,
        text: redacted,
        redacted: redacted !== raw,
        ...(command.exitCode === 0 ? {} : { error: `ToolHive logs exited ${command.exitCode}` }),
      };
    } catch (error) {
      logs = { status: "failed", error: errorMessage(error) };
    }
  }

  return {
    server,
    ...(state ? { state } : {}),
    ...(permissionProfile ? { permissionProfile } : {}),
    ...(logs ? { logs } : {}),
  };
}

function truncateDiagnosticText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function permissionProfileSummary(
  profile: unknown,
): Pick<NonNullable<McpServerDiagnosticsResult["permissionProfile"]>, "network" | "filesystem"> {
  const record = isPlainRecord(profile) ? profile : {};
  const network = isPlainRecord(record.network) ? record.network : {};
  const outbound = isPlainRecord(network.outbound) ? network.outbound : {};
  const allowHosts = stringArray(outbound.allow_host ?? outbound.allowHost ?? outbound.allow_hosts ?? outbound.allowHosts);
  const allowPorts = numberArray(outbound.allow_port ?? outbound.allowPort ?? outbound.allow_ports ?? outbound.allowPorts);
  const broad = outbound.insecure_allow_all === true || outbound.insecureAllowAll === true;
  const filesystem = isPlainRecord(record.filesystem) ? record.filesystem : {};
  const extraMounts = Array.isArray(filesystem.extraMounts) ? filesystem.extraMounts : [];
  return {
    network: {
      mode: broad ? "broad" : allowHosts.length || allowPorts.length ? "allowlist" : "isolated",
      allowHosts,
      allowPorts,
    },
    filesystem: {
      workspaceRead: filesystem.workspaceRead === true,
      workspaceWrite: filesystem.workspaceWrite === true,
      extraMountCount: extraMounts.length,
    },
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => Number.isInteger(entry) && entry > 0 && entry <= 65535) : [];
}

function mcpServerDiagnosticsText(input: McpServerDiagnosticsResult): string {
  const server = input.server;
  const profile = input.permissionProfile;
  const logs = input.logs;
  const secretText = server.secretBindingCount
    ? `${server.secretBindingCount} binding(s)${server.secretBindingEnvNames?.length ? ` env=${server.secretBindingEnvNames.join(",")}` : ""}${server.derivedSecretBindingCount ? ` derived=${server.derivedSecretBindingCount}` : ""}`
    : "none";
  return [
    `MCP server diagnostics for ${server.serverId}.`,
    `Workload: ${server.workloadName}`,
    `Runtime status: ${server.workloadStatus ?? "unknown"}`,
    server.endpoint ? `Endpoint: ${server.endpoint}` : "Endpoint: none",
    `Install validation: ${server.installValidationStatus ?? "unknown"}`,
    server.installValidationError ? `Validation error: ${server.installValidationError}` : undefined,
    `Descriptor snapshot: ${server.lastKnownToolDescriptorHash ?? "none"}`,
    typeof server.lastKnownToolCount === "number" ? `Last known tools: ${server.lastKnownToolCount}` : undefined,
    server.toolDescriptorReviewStatus ? `Descriptor review: ${server.toolDescriptorReviewStatus}` : undefined,
    server.toolDescriptorReviewReason ? `Descriptor review reason: ${server.toolDescriptorReviewReason}` : undefined,
    server.lastToolDiscoveryAt ? `Last tool discovery: ${server.lastToolDiscoveryAt}` : undefined,
    profile ? `Permission profile: ${profile.path}` : undefined,
    profile
      ? `Permission profile sha256: ${profile.sha256 || "unreadable"} expected=${profile.expectedSha256} verified=${profile.sha256Verified}`
      : undefined,
    profile?.network
      ? `Network permission: ${profile.network.mode}${profile.network.allowHosts.length ? ` hosts=${profile.network.allowHosts.join(",")}` : ""}${profile.network.allowPorts.length ? ` ports=${profile.network.allowPorts.join(",")}` : ""}`
      : undefined,
    profile?.filesystem
      ? `Filesystem permission: workspaceRead=${profile.filesystem.workspaceRead} workspaceWrite=${profile.filesystem.workspaceWrite} extraMounts=${profile.filesystem.extraMountCount}`
      : undefined,
    profile?.error ? `Permission profile error: ${profile.error}` : undefined,
    `Secret bindings: ${secretText}`,
    logs ? `Log status: ${logs.status}${typeof logs.exitCode === "number" ? ` exit=${logs.exitCode}` : ""}` : undefined,
    logs?.error ? `Log error: ${logs.error}` : undefined,
    logs?.text ? ["Recent ToolHive logs:", logs.text].join("\n") : undefined,
    "",
    server.installValidationStatus === "validation_failed"
      ? validationFailureNextAction(logs?.text)
      : "Next: use ambient_mcp_tool_search/describe for callable tools, or rerun diagnostics if runtime status changes.",
  ]
    .filter(Boolean)
    .join("\n");
}

function validationFailureNextAction(logText: string | undefined): string {
  if (logText && /arguments are required:\s*file/i.test(logText) && /--mcp\b/i.test(logText)) {
    return [
      "Next: diagnostics indicate the package default CLI ran without its MCP/server-mode switch.",
      'Remove this unhealthy server, rerun ambient_mcp_autowire_plan with the same source, and prefer a Standard MCP candidate that keeps the same package identifier but adds fixed packageArguments [{ type: "switch", name: "--mcp", isFixed: true }].',
      "If evidence instead requires a different executable or python -m module, use runtime.package.entrypoint and defer to a reviewed custom ToolHive source image when ToolHive cannot encode the override.",
    ].join(" ");
  }
  return "Next: fix the package/runtime issue, reinstall when ready, or remove this server with ambient_mcp_server_uninstall.";
}
