import type {
  CodexPluginCatalog,
  PermissionGrantScopeKind,
  PermissionRisk,
  CodexPluginSummary,
  ThreadSummary,
  WorkspaceState,
} from "../../../shared/types";
import type {
  CommitCodexPluginInstallInput,
  CodexPluginInstallCommitResult,
  CodexPluginInstallPreview,
  PreviewCodexPluginInstallInput,
} from "../codex/codexPlugins";

export interface PluginInstallApplyToolUpdate {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

export type PluginInstallApplyToolResult = PluginInstallApplyToolUpdate;

export interface PluginInstallApplyPermissionRequestModel {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface PluginInstallCommitParams {
  source: string;
  name?: string;
  pluginId?: string;
  pluginName?: string;
}

export interface PluginActivationParams {
  pluginId?: string;
  pluginName?: string;
  installDependencies: boolean;
}

export function pluginInstallCommitParams(input: Record<string, unknown>): PluginInstallCommitParams {
  return {
    source: requiredString(input, "source"),
    name: optionalString(input.name),
    pluginId: optionalString(input.pluginId),
    pluginName: optionalString(input.pluginName),
  };
}

export function pluginActivationParams(input: Record<string, unknown>): PluginActivationParams {
  const params = {
    pluginId: optionalString(input.pluginId),
    pluginName: optionalString(input.pluginName),
    installDependencies: optionalBoolean(input.installDependencies) ?? false,
  };
  if (!params.pluginId && !params.pluginName) throw new Error("pluginId or pluginName is required.");
  return params;
}

export function pluginInstallPreviewInput(input: {
  source: string;
  name?: string;
}): PreviewCodexPluginInstallInput {
  return {
    source: input.source,
    ...(input.name ? { name: input.name } : {}),
  };
}

export function pluginInstallCommitInput(input: {
  source: string;
  name?: string;
  pluginId?: string;
  pluginName?: string;
}): CommitCodexPluginInstallInput {
  return {
    source: input.source,
    ...(input.name ? { name: input.name } : {}),
    ...(input.pluginId ? { pluginId: input.pluginId } : {}),
    ...(input.pluginName ? { pluginName: input.pluginName } : {}),
  };
}

export function pluginInstallPreviewUpdate(input: {
  source: string;
  pluginId?: string;
  pluginName?: string;
}): PluginInstallApplyToolUpdate {
  return {
    content: [{ type: "text", text: `Previewing plugin install source ${input.source} before requesting approval.` }],
    details: {
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_install_commit",
      status: "previewing",
      source: input.source,
      pluginId: input.pluginId,
      pluginName: input.pluginName,
    },
  };
}

export function selectPluginInstallCandidateForRuntime(
  preview: CodexPluginInstallPreview,
  selector: { pluginId?: string; pluginName?: string },
): CodexPluginSummary {
  if (selector.pluginId) {
    const candidate = preview.candidates.find((plugin) => plugin.id === selector.pluginId);
    if (!candidate) throw new Error(`Plugin install preview did not include pluginId "${selector.pluginId}".`);
    return candidate;
  }

  if (selector.pluginName) {
    const matches = preview.candidates.filter(
      (plugin) => plugin.name === selector.pluginName || plugin.displayName === selector.pluginName,
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Plugin name "${selector.pluginName}" matched multiple preview candidates. Specify pluginId.`);
    throw new Error(`Plugin install preview did not include pluginName "${selector.pluginName}".`);
  }

  if (preview.candidates.length === 1) return preview.candidates[0];
  if (!preview.candidates.length) throw new Error("Plugin install preview did not include any candidates.");
  throw new Error("Plugin install preview included multiple candidates. Specify pluginId or pluginName.");
}

export function pluginInstallApprovalDetail(
  workspace: WorkspaceState,
  preview: CodexPluginInstallPreview,
  candidate: CodexPluginSummary,
): string {
  const capabilities = [
    candidate.skills.length ? `${candidate.skills.length} skills` : undefined,
    candidate.mcpServers.length ? `${candidate.mcpServers.length} MCP servers` : undefined,
    candidate.apps?.length ? `${candidate.apps.length} apps` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `Workspace: ${workspace.path}`,
    `Source: ${preview.source}`,
    `Plugin: ${candidate.displayName ?? candidate.name}`,
    `Plugin id: ${candidate.id}`,
    candidate.version ? `Version: ${candidate.version}` : undefined,
    `Compatibility: ${candidate.compatibilityTier}`,
    candidate.sourceUrl ? `Git URL: ${candidate.sourceUrl}` : undefined,
    candidate.sourcePath ? `Source path: ${candidate.sourcePath}` : undefined,
    candidate.sourceRef ? `Ref: ${candidate.sourceRef}` : undefined,
    candidate.sourceSha ? `SHA: ${candidate.sourceSha}` : "SHA: missing",
    capabilities ? `Capabilities: ${capabilities}` : "Capabilities: metadata only",
    candidate.dependencyStatus?.required ? `Dependencies: ${candidate.dependencyStatus.installed ? "installed" : "missing"}` : "Dependencies: none declared",
  ]
    .filter(Boolean)
    .join("\n");
}

export function pluginInstallGrantIdentity(input: {
  source: string;
  name?: string;
  pluginId?: string;
  pluginName?: string;
  selected: CodexPluginSummary;
}): string {
  return [
    "ambient_plugin_install_commit",
    input.source,
    input.name ?? "",
    input.pluginId ?? "",
    input.pluginName ?? "",
    input.selected.id,
    input.selected.rootPath ?? "",
  ].join("\0");
}

export function pluginInstallPermissionRequest(input: {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  source: string;
  name?: string;
  pluginId?: string;
  pluginName?: string;
  preview: CodexPluginInstallPreview;
  selected: CodexPluginSummary;
}): PluginInstallApplyPermissionRequestModel {
  return {
    thread: input.thread,
    workspace: input.workspace,
    toolName: "ambient_plugin_install_commit",
    title: `Install Codex plugin "${input.selected.displayName ?? input.selected.name}"?`,
    message:
      "Ambient wants to clone and import this pinned Git-backed Codex plugin into the workspace. This does not enable, trust, install dependencies, or run plugin code.",
    detail: pluginInstallApprovalDetail(input.workspace, input.preview, input.selected),
    grantTargetLabel: `Install Codex plugin ${input.selected.displayName ?? input.selected.name}`,
    grantTargetIdentity: pluginInstallGrantIdentity({
      source: input.source,
      name: input.name,
      pluginId: input.pluginId,
      pluginName: input.pluginName,
      selected: input.selected,
    }),
    allowedReason: "Plugin install approved by Ambient permission grant policy.",
    deniedReason: "Plugin install prompt denied or timed out.",
  };
}

export function pluginInstallInstallingUpdate(input: {
  source: string;
  selected: CodexPluginSummary;
}): PluginInstallApplyToolUpdate {
  return {
    content: [{ type: "text", text: `Installing Codex plugin "${input.selected.displayName ?? input.selected.name}".` }],
    details: {
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_install_commit",
      status: "installing",
      source: input.source,
      pluginId: input.selected.id,
      pluginName: input.selected.name,
    },
  };
}

export function pluginInstallCommitText(result: CodexPluginInstallCommitResult): string {
  const plugin = result.plugin;
  const capabilities = [
    plugin.skills.length ? `${plugin.skills.length} skills` : undefined,
    plugin.mcpServers.length ? `${plugin.mcpServers.length} MCP servers` : undefined,
    plugin.apps?.length ? `${plugin.apps.length} apps` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    "Plugin install committed",
    `Source: ${result.source}`,
    `Plugin: ${plugin.displayName ?? plugin.name}`,
    `Plugin id: ${plugin.id}`,
    plugin.version ? `Version: ${plugin.version}` : undefined,
    `Compatibility: ${plugin.compatibilityTier}`,
    capabilities ? `Capabilities: ${capabilities}` : "Capabilities: metadata only",
    plugin.dependencyStatus?.required && !plugin.dependencyStatus.installed ? "Dependencies: missing; install dependencies before enabling dependent tools." : undefined,
    "Plugin MCP runtimes were reset. Enable and trust the plugin separately before running plugin tools.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function pluginInstallCommitDetails(input: {
  source: string;
  result: CodexPluginInstallCommitResult;
}): Record<string, unknown> {
  return {
    runtime: "ambient-plugin-install",
    toolName: "ambient_plugin_install_commit",
    source: input.source,
    pluginId: input.result.plugin.id,
    pluginName: input.result.plugin.name,
    compatibilityTier: input.result.plugin.compatibilityTier,
    installedAt: input.result.installedAt,
    resetPluginMcpRuntimes: true,
  };
}

export function pluginInstallCommitToolResult(input: {
  source: string;
  result: CodexPluginInstallCommitResult;
}): PluginInstallApplyToolResult {
  return {
    content: [{ type: "text", text: pluginInstallCommitText(input.result) }],
    details: pluginInstallCommitDetails(input),
  };
}

export function selectInstalledPluginForRuntime(
  catalog: CodexPluginCatalog,
  selector: { pluginId?: string; pluginName?: string },
): CodexPluginSummary {
  if (selector.pluginId) {
    const plugin = catalog.plugins.find((candidate) => candidate.id === selector.pluginId);
    if (!plugin) throw new Error(`Installed Codex plugin "${selector.pluginId}" was not found.`);
    return plugin;
  }

  if (selector.pluginName) {
    const matches = catalog.plugins.filter((plugin) => plugin.name === selector.pluginName || plugin.displayName === selector.pluginName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Installed Codex plugin name "${selector.pluginName}" matched multiple plugins. Specify pluginId.`);
    throw new Error(`Installed Codex plugin "${selector.pluginName}" was not found.`);
  }

  throw new Error("pluginId or pluginName is required.");
}

export function pluginActivationApprovalDetail(
  workspace: WorkspaceState,
  plugin: CodexPluginSummary,
  installDependencies: boolean,
): string {
  const capabilities = [
    plugin.skills.length ? `${plugin.skills.length} skills` : undefined,
    plugin.mcpServers.length ? `${plugin.mcpServers.length} MCP servers` : undefined,
    plugin.apps?.length ? `${plugin.apps.length} apps` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `Workspace: ${workspace.path}`,
    `Plugin: ${plugin.displayName ?? plugin.name}`,
    `Plugin id: ${plugin.id}`,
    `Directory: ${plugin.rootPath}`,
    `Compatibility: ${plugin.compatibilityTier}`,
    capabilities ? `Capabilities: ${capabilities}` : "Capabilities: metadata only",
    `Currently enabled: ${plugin.enabled ? "yes" : "no"}`,
    `Currently trusted: ${plugin.trusted ? "yes" : "no"}`,
    plugin.dependencyStatus?.required
      ? `Dependencies: ${plugin.dependencyStatus.installed ? "installed" : "missing"} via ${plugin.dependencyStatus.manager}`
      : "Dependencies: none declared",
    installDependencies && plugin.dependencyStatus?.required
      ? `Dependency command: ${plugin.dependencyStatus.installCommand.join(" ")}`
      : undefined,
    installDependencies && plugin.dependencyStatus?.missingPackages.length
      ? `Missing packages: ${plugin.dependencyStatus.missingPackages.slice(0, 20).join(", ")}`
      : undefined,
    "Trust: not granted by this activation; MCP tools still prompt on first use.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function pluginActivationInspectUpdate(input: {
  pluginId?: string;
  pluginName?: string;
  installDependencies: boolean;
}): PluginInstallApplyToolUpdate {
  return {
    content: [{ type: "text", text: `Inspecting installed Codex plugin ${input.pluginId ?? input.pluginName}.` }],
    details: {
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_activate",
      status: "inspecting",
      pluginId: input.pluginId,
      pluginName: input.pluginName,
      installDependencies: input.installDependencies,
    },
  };
}

export function pluginActivationGrantIdentity(plugin: CodexPluginSummary, installDependencies: boolean): string {
  return ["ambient_plugin_activate", plugin.id, installDependencies ? "install-dependencies" : "enable-only"].join("\0");
}

export function pluginActivationPermissionRequest(input: {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  plugin: CodexPluginSummary;
  installDependencies: boolean;
}): PluginInstallApplyPermissionRequestModel {
  return {
    thread: input.thread,
    workspace: input.workspace,
    toolName: "ambient_plugin_activate",
    title: `Activate Codex plugin "${input.plugin.displayName ?? input.plugin.name}"?`,
    message: input.installDependencies
      ? "Ambient wants to install this plugin's declared dependencies and enable it. Plugin MCP tools will still require first-use trust."
      : "Ambient wants to enable this installed plugin. Plugin MCP tools will still require first-use trust.",
    detail: pluginActivationApprovalDetail(input.workspace, input.plugin, input.installDependencies),
    grantTargetLabel: `Activate Codex plugin ${input.plugin.displayName ?? input.plugin.name}`,
    grantTargetIdentity: pluginActivationGrantIdentity(input.plugin, input.installDependencies),
    allowedReason: "Plugin activation approved by Ambient permission grant policy.",
    deniedReason: "Plugin activation prompt denied or timed out.",
  };
}

export function pluginActivationDependencyState(plugin: CodexPluginSummary): {
  dependenciesRequired: boolean;
  dependenciesMissing: boolean;
} {
  const dependenciesRequired = Boolean(plugin.dependencyStatus?.required);
  return {
    dependenciesRequired,
    dependenciesMissing: Boolean(dependenciesRequired && !plugin.dependencyStatus?.installed),
  };
}

export function pluginActivationMissingDependenciesMessage(plugin: CodexPluginSummary): string {
  return `Codex plugin "${plugin.displayName ?? plugin.name}" has missing dependencies. Re-run ambient_plugin_activate with installDependencies=true after the user approves dependency installation.`;
}

export function pluginActivationDependencyInstallInput(plugin: CodexPluginSummary): { pluginId: string } {
  return { pluginId: plugin.id };
}

export function pluginActivationDependencyInstallUpdate(plugin: CodexPluginSummary): PluginInstallApplyToolUpdate {
  return {
    content: [{ type: "text", text: `Installing dependencies for Codex plugin "${plugin.displayName ?? plugin.name}".` }],
    details: {
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_activate",
      status: "installing-dependencies",
      pluginId: plugin.id,
      pluginName: plugin.name,
    },
  };
}

export function pluginActivationText(input: {
  plugin: CodexPluginSummary;
  dependenciesRequired: boolean;
  installedDependencies: boolean;
}): string {
  const lines = [
    "Plugin activated",
    `Plugin: ${input.plugin.displayName ?? input.plugin.name}`,
    `Plugin id: ${input.plugin.id}`,
    input.dependenciesRequired
      ? input.installedDependencies
        ? "Dependencies: installed"
        : "Dependencies: already installed"
      : "Dependencies: none declared",
    "Plugin MCP runtimes were reset.",
    "Plugin MCP tools still require first-use trust and will be available after the Pi session refreshes or on the next turn.",
  ];
  return lines.join("\n");
}

export function pluginActivationDetails(input: {
  plugin: CodexPluginSummary;
  installedDependencies: boolean;
}): Record<string, unknown> {
  return {
    runtime: "ambient-plugin-install",
    toolName: "ambient_plugin_activate",
    pluginId: input.plugin.id,
    pluginName: input.plugin.name,
    enabled: true,
    installedDependencies: input.installedDependencies,
    resetPluginMcpRuntimes: true,
    availability: "next-session-refresh",
  };
}

export function pluginActivationToolResult(input: {
  plugin: CodexPluginSummary;
  dependenciesRequired: boolean;
  installedDependencies: boolean;
}): PluginInstallApplyToolResult {
  return {
    content: [{ type: "text", text: pluginActivationText(input) }],
    details: pluginActivationDetails({
      plugin: input.plugin,
      installedDependencies: input.installedDependencies,
    }),
  };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
