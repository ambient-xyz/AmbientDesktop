import type {
  AmbientPluginAppAuthSummary,
  AmbientPluginAvailability,
  AmbientPluginCapabilityKind,
  AmbientPluginCapabilitySummary,
  AmbientGeneratedCapabilitySummary,
  AmbientPluginInstallState,
  AmbientPluginRegistry,
  AmbientPluginRuntime,
  AmbientPluginSourceKind,
  AmbientPluginSummary,
  CodexPluginCatalog,
  CodexPluginSummary,
  PiPackageCatalog,
  PiPackageResourceKind,
  PiPackageSummary,
} from "../../shared/types";
import type {
  AmbientCliPackageCatalog,
  AmbientCliPackageCommand,
  AmbientCliPackageHealthCheckResult,
  AmbientCliPackageSummary,
} from "../ambientCliPackages";
import { ambientCliCapabilityId, ambientCliRegistryPluginId } from "../ambientCliPackages";
import { firstPartyDesktopToolDescriptors, type DesktopToolDescriptor } from "../desktopToolRegistry";

const ambientBuiltInPluginId = "ambient-built-in:desktop-tools";

export function buildAmbientPluginRegistry(input: {
  codexCatalog: CodexPluginCatalog;
  piPackageCatalog: PiPackageCatalog;
  ambientCliCatalog?: AmbientCliPackageCatalog;
  appAuth?: Map<string, AmbientPluginAppAuthSummary>;
}): AmbientPluginRegistry {
  const codexPlugins = [
    ...input.codexCatalog.plugins.map((plugin) => pluginSummaryFromCodex(plugin)),
    ...input.codexCatalog.importCandidates.map((plugin) => pluginSummaryFromCodex(plugin)),
  ];
  const codexCapabilities = [
    ...input.codexCatalog.plugins.flatMap((plugin) => capabilitiesFromCodexPlugin(plugin, input.appAuth)),
    ...input.codexCatalog.importCandidates.flatMap((plugin) => capabilitiesFromCodexPlugin(plugin, input.appAuth)),
  ];
  const piPlugins = input.piPackageCatalog.packages.map((pkg) => pluginSummaryFromPiPackage(pkg));
  const piCapabilities = input.piPackageCatalog.packages.flatMap((pkg) => capabilitiesFromPiPackage(pkg));
  const ambientCliCatalog = input.ambientCliCatalog ?? { packages: [], errors: [] };
  const cliPlugins = ambientCliCatalog.packages.map((pkg) => pluginSummaryFromAmbientCliPackage(pkg));
  const cliCapabilities = ambientCliCatalog.packages.flatMap((pkg) => capabilitiesFromAmbientCliPackage(pkg));
  const builtInCapabilities = capabilitiesFromBuiltInDesktopTools();
  const builtInPlugins = [builtInDesktopToolsPluginSummary(builtInCapabilities.length)];

  return {
    plugins: dedupePlugins([...builtInPlugins, ...codexPlugins, ...piPlugins, ...cliPlugins]),
    capabilities: dedupeCapabilities([...builtInCapabilities, ...codexCapabilities, ...piCapabilities, ...cliCapabilities]),
    sources: ["Ambient built-ins", ...input.codexCatalog.marketplaces, ...(ambientCliCatalog.packages.length ? ["Ambient CLI packages"] : [])],
    errors: [...input.codexCatalog.errors, ...input.piPackageCatalog.errors, ...ambientCliCatalog.errors],
    sourceNotes: [
      "Ambient built-in tools are always installed and governed by Ambient permission policy.",
      ...input.piPackageCatalog.sourceNotes,
      ...(ambientCliCatalog.packages.length ? ["Ambient CLI packages expose descriptor-backed commands through ambient_cli with per-run approval."] : []),
    ],
  };
}

export function listAmbientPluginRuntimeCapabilities(
  registry: AmbientPluginRegistry,
  runtime: AmbientPluginRuntime,
): AmbientPluginCapabilitySummary[] {
  return registry.capabilities.filter((capability) => capability.runtimeSupport.includes(runtime));
}

export function getAmbientPluginCapabilityDiagnostics(
  registry: AmbientPluginRegistry,
  capabilityId: string,
): {
  capabilityId: string;
  capability?: AmbientPluginCapabilitySummary;
  plugin?: AmbientPluginSummary;
  diagnostics: string[];
  availabilityReason?: string;
} {
  const workflowToolCapability = parsePluginMcpToolCapabilityId(capabilityId);
  const capability =
    registry.capabilities.find((item) => item.id === capabilityId) ??
    (workflowToolCapability
      ? registry.capabilities.find(
          (item) =>
            item.pluginId === workflowToolCapability.pluginId &&
            item.kind === "mcp-tool" &&
            item.serverName === workflowToolCapability.serverName,
        )
      : undefined);
  const plugin = capability ? registry.plugins.find((item) => item.sourcePluginId === capability.pluginId) : undefined;
  return {
    capabilityId,
    ...(capability ? { capability } : {}),
    ...(plugin ? { plugin } : {}),
    diagnostics: [
      ...(workflowToolCapability && capability?.id !== capabilityId
        ? [`Workflow tool capability resolves through MCP server capability: ${capability?.id ?? "unavailable"}.`]
        : []),
      ...(capability?.diagnostics ?? []),
      ...(plugin?.diagnostics ?? []),
      ...(!capability ? [`Capability was not found: ${capabilityId}`] : []),
    ],
    ...(capability?.availabilityReason ? { availabilityReason: capability.availabilityReason } : {}),
  };
}

export function pluginMcpToolCapabilityId(input: {
  pluginId: string;
  serverName: string;
  toolName: string;
}): string {
  return [input.pluginId, "mcp-tool", input.serverName, input.toolName].map((part) => encodeURIComponent(part)).join(":");
}

function parsePluginMcpToolCapabilityId(
  capabilityId: string,
): { pluginId: string; serverName: string; toolName: string } | undefined {
  const parts = capabilityId.split(":");
  if (parts.length !== 4 || parts[1] !== "mcp-tool") return undefined;
  try {
    return {
      pluginId: decodeURIComponent(parts[0]),
      serverName: decodeURIComponent(parts[2]),
      toolName: decodeURIComponent(parts[3]),
    };
  } catch {
    return undefined;
  }
}

function pluginSummaryFromCodex(plugin: CodexPluginSummary): AmbientPluginSummary {
  return {
    id: ambientPluginId("codex", plugin.id),
    sourcePluginId: plugin.id,
    sourceKind: codexSourceKind(plugin),
    sourceLabel: plugin.marketplaceName,
    name: plugin.name,
    displayName: plugin.displayName,
    description: plugin.description,
    version: plugin.version,
    installState: codexInstallState(plugin),
    compatibilityTier: plugin.compatibilityTier,
    enabled: plugin.enabled,
    trusted: plugin.trusted,
    capabilityCount: capabilitiesFromCodexPlugin(plugin).length,
    supportLabels: plugin.supportLabels,
    diagnostics: [...plugin.compatibilityNotes, ...plugin.errors],
  };
}

function capabilitiesFromCodexPlugin(
  plugin: CodexPluginSummary,
  appAuth?: Map<string, AmbientPluginAppAuthSummary>,
): AmbientPluginCapabilitySummary[] {
  const sourceKind = codexSourceKind(plugin);
  return [
    ...plugin.skills.map((skill) => ({
      id: capabilityId(plugin.id, "skill", skill.path),
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginDisplayName: plugin.displayName,
      kind: "skill" as const,
      name: skill.name,
      displayName: skill.name,
      description: skill.description,
      sourceKind,
      runtimeSupport: ["chat", "workflow", "automation"] satisfies AmbientPluginRuntime[],
      enabled: plugin.enabled,
      trusted: plugin.trusted,
      availability: codexCapabilityAvailability(plugin, false),
      availabilityReason: codexAvailabilityReason(plugin, false),
      path: skill.path,
      supportLabels: plugin.supportLabels,
      diagnostics: plugin.errors,
    })),
    ...plugin.mcpServers.map((server) => ({
      id: capabilityId(plugin.id, "mcp-server", server.name),
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginDisplayName: plugin.displayName,
      kind: "mcp-tool" as const,
      name: server.name,
      displayName: server.name,
      description: `MCP server declared by ${plugin.displayName ?? plugin.name}.`,
      sourceKind,
      runtimeSupport: ["chat", "workflow", "automation"] satisfies AmbientPluginRuntime[],
      enabled: plugin.enabled,
      trusted: plugin.trusted,
      availability: codexCapabilityAvailability(plugin, true),
      availabilityReason: codexAvailabilityReason(plugin, true),
      path: plugin.rootPath,
      serverName: server.name,
      supportLabels: plugin.supportLabels,
      diagnostics: [
        ...plugin.errors,
        ...(plugin.dependencyStatus?.required && !plugin.dependencyStatus.installed ? [plugin.dependencyStatus.reason ?? "Plugin MCP dependencies are not installed."] : []),
        ...(server.command ? [] : ["MCP server command is missing."]),
      ],
    })),
    ...codexAppCapabilities(plugin, sourceKind, appAuth),
  ];
}

function codexAppCapabilities(
  plugin: CodexPluginSummary,
  sourceKind: AmbientPluginSourceKind,
  appAuth?: Map<string, AmbientPluginAppAuthSummary>,
): AmbientPluginCapabilitySummary[] {
  if (!plugin.appsPath) return [];
  const apps = plugin.apps?.length
    ? plugin.apps
    : [{ name: plugin.displayName ?? plugin.name, connectorId: "unknown", path: plugin.appsPath }];
  return apps.map((app) => {
    const auth = appAuth?.get(app.connectorId);
    const authAvailability = codexAppAvailability(plugin, auth);
    return {
      id: capabilityId(plugin.id, "app", `${app.name}:${app.connectorId}`),
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginDisplayName: plugin.displayName,
      kind: "app" as const,
      name: app.name,
      displayName: app.name,
      description: `Codex app connector metadata (${app.connectorId}).`,
      sourceKind,
      runtimeSupport: ["chat", "workflow", "automation", "ui"] satisfies AmbientPluginRuntime[],
      enabled: plugin.enabled,
      trusted: plugin.trusted,
      availability: authAvailability,
      availabilityReason: codexAppAvailabilityReason(plugin, auth, authAvailability),
      path: app.path,
      connectorId: app.connectorId,
      authStatus: auth?.status ?? "unavailable",
      authProviderId: auth?.providerId,
      authAccountCount: auth?.accounts.length ?? 0,
      authAccounts: auth?.accounts ?? [],
      supportLabels: plugin.supportLabels,
      diagnostics: [
        ...plugin.compatibilityNotes,
        ...(auth?.unavailableReason ? [auth.unavailableReason] : []),
      ],
    };
  });
}

function builtInDesktopToolsPluginSummary(capabilityCount: number): AmbientPluginSummary {
  return {
    id: ambientPluginId("ambient", ambientBuiltInPluginId),
    sourcePluginId: ambientBuiltInPluginId,
    sourceKind: "ambient-built-in",
    sourceLabel: "Ambient built-ins",
    name: "ambient-desktop-tools",
    displayName: "Ambient Desktop Tools",
    description: "First-party desktop, browser, shell, and workspace tools provided by Ambient.",
    version: "built-in",
    installState: "installed",
    compatibilityTier: "supported",
    enabled: true,
    trusted: true,
    capabilityCount,
    supportLabels: ["Built in", "Permission policy", "Desktop tools"],
    diagnostics: ["Built-in tools are available through Ambient Desktop and do not require plugin installation."],
  };
}

function capabilitiesFromBuiltInDesktopTools(): AmbientPluginCapabilitySummary[] {
  return firstPartyDesktopToolDescriptors().map((descriptor) => capabilityFromBuiltInDesktopTool(descriptor));
}

function capabilityFromBuiltInDesktopTool(descriptor: DesktopToolDescriptor): AmbientPluginCapabilitySummary {
  return {
    id: capabilityId(ambientBuiltInPluginId, "desktop-tool", descriptor.name),
    pluginId: ambientBuiltInPluginId,
    pluginName: "ambient-desktop-tools",
    pluginDisplayName: "Ambient Desktop Tools",
    kind: "tool",
    name: descriptor.name,
    displayName: descriptor.label,
    description: descriptor.description,
    sourceKind: "ambient-built-in",
    runtimeSupport: builtInRuntimeSupport(descriptor),
    enabled: true,
    trusted: true,
    availability: "available",
    toolName: descriptor.name,
    inputSchema: descriptor.inputSchema,
    supportLabels: [
      "Built in",
      descriptor.supportsDryRun ? "Dry-run capable" : "No dry-run",
      descriptor.supportsUndo ? "Undo capable" : "No undo",
      `Scope: ${descriptor.permissionScope}`,
    ],
    diagnostics: [
      `Source: ${descriptor.source}`,
      `Side effects: ${descriptor.sideEffects}`,
      `Permission scope: ${descriptor.permissionScope}`,
      `Default timeout: ${descriptor.defaultTimeoutMs}ms`,
      `Idempotency: ${descriptor.idempotency}`,
    ],
  };
}

function builtInRuntimeSupport(descriptor: DesktopToolDescriptor): AmbientPluginRuntime[] {
  if (descriptor.runtimeSupport?.length) return [...descriptor.runtimeSupport];
  if (descriptor.name.startsWith("file_")) return ["workflow", "automation"];
  return ["chat", "workflow", "automation"];
}

function pluginSummaryFromPiPackage(pkg: PiPackageSummary): AmbientPluginSummary {
  const trusted = pkg.resourceCounts.extension === 0;
  return {
    id: ambientPluginId("pi", pkg.id),
    sourcePluginId: pkg.id,
    sourceKind: piSourceKind(pkg.sourceKind),
    sourceLabel: pkg.sourceLabel,
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    installState: pkg.installed ? "installed" : pkg.sourceKind === "pi-gallery" ? "importable" : "discovered",
    compatibilityTier: pkg.compatibilityTier,
    enabled: Boolean(pkg.enabled),
    trusted,
    capabilityCount: pkg.resources.length,
    supportLabels: pkg.supportLabels,
    diagnostics: [...pkg.compatibilityNotes, ...pkg.errors],
  };
}

function capabilitiesFromPiPackage(pkg: PiPackageSummary): AmbientPluginCapabilitySummary[] {
  return pkg.resources.map((resource) => ({
    id: capabilityId(pkg.id, resource.kind, resource.path),
    pluginId: pkg.id,
    pluginName: pkg.name,
    kind: piCapabilityKind(resource.kind),
    name: resource.path,
    displayName: resource.path,
    description: `${pkg.name} ${resource.kind} resource.`,
    sourceKind: piSourceKind(pkg.sourceKind),
    runtimeSupport: piRuntimeSupport(resource.kind),
    enabled: Boolean(pkg.enabled),
    trusted: resource.kind !== "extension",
    availability: piCapabilityAvailability(pkg, resource.kind),
    availabilityReason: piCapabilityAvailabilityReason(pkg, resource.kind),
    path: resource.path,
    supportLabels: pkg.supportLabels,
    diagnostics: [...pkg.compatibilityNotes, ...pkg.errors],
  }));
}

function pluginSummaryFromAmbientCliPackage(pkg: AmbientCliPackageSummary): AmbientPluginSummary {
  const healthFailures = cliHealthFailures(pkg);
  return {
    id: ambientCliRegistryPluginId(pkg.id),
    sourcePluginId: pkg.id,
    sourceKind: "ambient-cli",
    sourceLabel: "Ambient CLI packages",
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    installState: pkg.installed ? "installed" : "discovered",
    compatibilityTier: pkg.errors.length > 0 || healthFailures.length > 0 ? "unsupported" : "supported",
    enabled: pkg.installed && pkg.errors.length === 0,
    trusted: true,
    capabilityCount: pkg.commands.length + pkg.skills.length,
    supportLabels: [
      "Ambient CLI",
      "Approval required",
      ...(pkg.generated ? ["Generated", generatedStatusLabel(pkg)] : []),
      ...(pkg.commands.some((command) => command.healthCheck?.length) ? ["Health checks"] : []),
      ...(pkg.generated?.outputArtifactTypes.length ? pkg.generated.outputArtifactTypes.map((artifact) => `Artifact ${artifact}`) : []),
    ],
    diagnostics: [
      `Package root: ${pkg.rootPath}`,
      `Package source: ${pkg.source}`,
      ...ambientCliGeneratedDiagnostics(pkg),
      ...pkg.errors,
      ...healthFailures.map((check) => `Health check failed for ${check.commandName}: ${check.error ?? check.stderr ?? "failed"}`),
    ],
    ...(pkg.generated ? { generated: ambientCliGeneratedSummary(pkg) } : {}),
  };
}

function capabilitiesFromAmbientCliPackage(pkg: AmbientCliPackageSummary): AmbientPluginCapabilitySummary[] {
  return [
    ...pkg.skills.map((skill) => ({
      id: ambientCliCapabilityId(pkg.id, "skill", skill.path),
      pluginId: pkg.id,
      pluginName: pkg.name,
      kind: "skill" as const,
      name: skill.name,
      displayName: skill.name,
      description: skill.description,
      sourceKind: "ambient-cli" as const,
      runtimeSupport: ["chat"] satisfies AmbientPluginRuntime[],
      enabled: pkg.installed && pkg.errors.length === 0,
      trusted: true,
      availability: ambientCliCapabilityAvailability(pkg),
      availabilityReason: ambientCliCapabilityAvailabilityReason(pkg),
      path: skill.path,
      supportLabels: ["Ambient CLI", "Skill"],
      diagnostics: [`Skill path: ${skill.path}`, ...pkg.errors],
      ...(pkg.generated ? { generated: ambientCliGeneratedSummary(pkg) } : {}),
    })),
    ...pkg.commands.map((command) => ({
      id: ambientCliCapabilityId(pkg.id, "tool", command.name),
      pluginId: pkg.id,
      pluginName: pkg.name,
      kind: "tool" as const,
      name: command.name,
      displayName: command.name,
      description: command.description ?? `Ambient CLI command declared by ${pkg.name}.`,
      sourceKind: "ambient-cli" as const,
      runtimeSupport: ["chat", "workflow"] satisfies AmbientPluginRuntime[],
      enabled: pkg.installed && pkg.errors.length === 0,
      trusted: true,
      availability: ambientCliCapabilityAvailability(pkg, command),
      availabilityReason: ambientCliCapabilityAvailabilityReason(pkg, command),
      path: pkg.rootPath,
      toolName: "ambient_cli",
      supportLabels: [
        "Ambient CLI",
        "Approval required",
        ...(pkg.generated ? ["Generated", generatedStatusLabel(pkg)] : []),
        ...(pkg.generated?.outputArtifactTypes.length ? pkg.generated.outputArtifactTypes.map((artifact) => `Artifact ${artifact}`) : []),
        ...(command.healthCheck?.length ? ["Health check"] : []),
      ],
      diagnostics: ambientCliCommandDiagnostics(pkg, command),
      ...(pkg.generated ? { generated: ambientCliGeneratedSummary(pkg) } : {}),
    })),
  ];
}

function ambientCliGeneratedSummary(pkg: AmbientCliPackageSummary): AmbientGeneratedCapabilitySummary {
  const generated = pkg.generated;
  if (!generated) throw new Error("Ambient CLI package is not generated.");
  return {
    schemaVersion: generated.schemaVersion,
    ...(generated.status ? { status: generated.status } : {}),
    ...(generated.goal ? { goal: generated.goal } : {}),
    ...(generated.kind ? { kind: generated.kind } : {}),
    ...(generated.provider ? { provider: generated.provider } : {}),
    outputArtifactTypes: generated.outputArtifactTypes,
    ...(generated.locality ? { locality: generated.locality } : {}),
    ...(generated.sourcePath ? { sourcePath: generated.sourcePath } : {}),
    ...(generated.lastValidatedAt ? { lastValidatedAt: generated.lastValidatedAt } : {}),
    ...(generated.registeredAt ? { registeredAt: generated.registeredAt } : {}),
    ...(generated.installedPackageId ? { installedPackageId: generated.installedPackageId } : {}),
    ...(generated.installedSource ? { installedSource: generated.installedSource } : {}),
    ...(generated.installedVersion ? { installedVersion: generated.installedVersion } : {}),
    refs: { ...generated.refs },
  };
}

function ambientCliCommandDiagnostics(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): string[] {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  return [
    `Package root: ${pkg.rootPath}`,
    ...ambientCliGeneratedDiagnostics(pkg),
    `Command: ${[command.command, ...command.args].join(" ")}`,
    `CWD policy: ${command.cwd}`,
    "Runs through ambient_cli and requires approval before execution.",
    ...(command.healthCheck?.length ? [`Health check: ${command.healthCheck.join(" ")}`] : ["No health check declared."]),
    ...(health ? [health.passed ? "Latest diagnostic health check passed." : `Latest diagnostic health check failed: ${health.error ?? health.stderr ?? "failed"}`] : []),
    ...pkg.errors,
  ];
}

function generatedStatusLabel(pkg: AmbientCliPackageSummary): string {
  return `Build ${pkg.generated?.status ?? "generated"}`;
}

function ambientCliGeneratedDiagnostics(pkg: AmbientCliPackageSummary): string[] {
  const generated = pkg.generated;
  if (!generated) return [];
  return [
    "Generated by Ambient Capability Builder.",
    generated.status ? `Build status: ${generated.status}` : undefined,
    generated.goal ? `Goal: ${generated.goal}` : undefined,
    generated.kind ? `Kind: ${generated.kind}` : undefined,
    generated.provider ? `Provider/runtime: ${generated.provider}` : undefined,
    generated.locality ? `Locality: ${generated.locality}` : undefined,
    generated.outputArtifactTypes.length ? `Artifacts: ${generated.outputArtifactTypes.join(", ")}` : undefined,
    generated.sourcePath ? `Builder source: ${generated.sourcePath}` : undefined,
    generated.lastValidatedAt ? `Last validated: ${generated.lastValidatedAt}` : undefined,
    generated.registeredAt ? `Registered: ${generated.registeredAt}` : undefined,
    generated.refs.latest ? `Latest ref: ${generated.refs.latest}` : undefined,
    generated.refs.lastRepair ? `Last repair ref: ${generated.refs.lastRepair}` : undefined,
    generated.refs.lastValidated ? `Last validated ref: ${generated.refs.lastValidated}` : undefined,
    generated.refs.installed ? `Installed ref: ${generated.refs.installed}` : undefined,
    generated.installedPackageId ? `Installed package id: ${generated.installedPackageId}` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function ambientCliCapabilityAvailability(pkg: AmbientCliPackageSummary, command?: AmbientCliPackageCommand): AmbientPluginAvailability {
  if (pkg.errors.length > 0) return "error";
  const health = command ? pkg.healthChecks?.find((check) => check.commandName === command.name) : undefined;
  if (health && !health.passed) return "error";
  if (!pkg.installed) return "disabled";
  return "available";
}

function ambientCliCapabilityAvailabilityReason(pkg: AmbientCliPackageSummary, command?: AmbientCliPackageCommand): string | undefined {
  const health = command ? pkg.healthChecks?.find((check) => check.commandName === command.name) : undefined;
  if (pkg.errors.length > 0) return pkg.errors[0] ?? "Ambient CLI package descriptor has errors.";
  if (health && !health.passed) return `Ambient CLI package health check failed for ${health.commandName}.`;
  if (!pkg.installed) return "Install this Ambient CLI package before running its commands or mounting its skills.";
  return "Ambient CLI package is installed; command execution still requires per-run approval.";
}

function cliHealthFailures(pkg: AmbientCliPackageSummary): AmbientCliPackageHealthCheckResult[] {
  return pkg.healthChecks?.filter((check) => !check.passed) ?? [];
}

function piCapabilityAvailability(pkg: PiPackageSummary, kind: PiPackageResourceKind): AmbientPluginAvailability {
  if (pkg.errors.length > 0 || pkg.compatibilityTier === "unsupported") return "unsupported";
  if (!pkg.installed) return "disabled";
  if (kind === "extension") return pkg.enabled ? "untrusted" : "disabled";
  if (!pkg.enabled) return "disabled";
  return "available";
}

function piCapabilityAvailabilityReason(pkg: PiPackageSummary, kind: PiPackageResourceKind): string {
  if (pkg.errors.length > 0 || pkg.compatibilityTier === "unsupported") return "Pi package resource is unsupported by Ambient.";
  if (!pkg.installed) return "Pi packages are inspect-only until explicitly managed by Ambient.";
  if (kind === "extension") return "Pi extensions require trust and sandboxing before Ambient can load executable code.";
  if (!pkg.enabled) return "Enable this Ambient-managed Pi package to expose declarative resources to Ambient.";
  return "Declarative Pi resource is enabled without running package extension code.";
}

function codexSourceKind(plugin: Pick<CodexPluginSummary, "sourceKind" | "marketplaceKind">): AmbientPluginSourceKind {
  if (plugin.sourceKind === "codex-cache") return "codex-cache";
  if (plugin.marketplaceKind === "ambient-curated") return "codex-ambient-curated";
  if (plugin.sourceKind === "remote-marketplace") return "codex-remote-marketplace";
  return "codex-workspace";
}

function piSourceKind(kind: PiPackageSummary["sourceKind"]): AmbientPluginSourceKind {
  if (kind === "ambient-workspace") return "pi-ambient-workspace";
  if (kind === "ambient-global") return "pi-ambient-global";
  if (kind === "project-settings") return "pi-project-settings";
  if (kind === "user-settings") return "pi-user-settings";
  if (kind === "pi-gallery") return "pi-gallery";
  return "pi-workspace";
}

function piCapabilityKind(kind: PiPackageResourceKind): AmbientPluginCapabilityKind {
  if (kind === "extension") return "runtime-extension";
  return kind;
}

function piRuntimeSupport(kind: PiPackageResourceKind): AmbientPluginRuntime[] {
  if (kind === "theme") return ["ui"];
  if (kind === "prompt") return ["chat", "ui"];
  return ["chat"];
}

function codexInstallState(plugin: CodexPluginSummary): AmbientPluginInstallState {
  if (plugin.imported || plugin.sourceKind === "workspace") return "installed";
  return "importable";
}

function codexCapabilityAvailability(plugin: CodexPluginSummary, requiresTrust: boolean): AmbientPluginAvailability {
  if (plugin.errors.length > 0) return "error";
  if (plugin.compatibilityTier === "unsupported") return "unsupported";
  if (!plugin.imported && plugin.sourceKind !== "workspace") return "disabled";
  if (!plugin.enabled) return "disabled";
  if (requiresTrust && plugin.dependencyStatus?.required && !plugin.dependencyStatus.installed) return "disabled";
  if (requiresTrust && !plugin.trusted) return "untrusted";
  return "available";
}

function codexAvailabilityReason(plugin: CodexPluginSummary, requiresTrust: boolean): string | undefined {
  const availability = codexCapabilityAvailability(plugin, requiresTrust);
  if (availability === "error") return plugin.errors[0] ?? "Plugin has manifest or marketplace errors.";
  if (availability === "unsupported") return "Plugin is not supported by Ambient Desktop yet.";
  if (availability === "disabled" && !plugin.imported && plugin.sourceKind !== "workspace") return "Import or register this plugin before use.";
  if (availability === "disabled" && requiresTrust && plugin.dependencyStatus?.required && !plugin.dependencyStatus.installed) {
    return plugin.dependencyStatus.reason ?? "Install plugin dependencies before running local MCP tools.";
  }
  if (availability === "disabled") return "Plugin is disabled.";
  if (availability === "untrusted") return "Trust this plugin before running local MCP tools.";
  return undefined;
}

function codexAppAvailability(
  plugin: CodexPluginSummary,
  auth: AmbientPluginAppAuthSummary | undefined,
): AmbientPluginAvailability {
  const base = codexCapabilityAvailability(plugin, false);
  if (base !== "available") return base;
  return auth?.status === "available" ? "available" : "auth-required";
}

function codexAppAvailabilityReason(
  plugin: CodexPluginSummary,
  auth: AmbientPluginAppAuthSummary | undefined,
  availability: AmbientPluginAvailability,
): string | undefined {
  if (availability !== "auth-required") return codexAvailabilityReason(plugin, false);
  if (!auth) return "Codex app descriptor is parsed, but no Ambient auth provider is registered yet.";
  if (auth.unavailableReason) return auth.unavailableReason;
  if (auth.status === "not_configured") return "Connect an account before using this Codex app capability.";
  return `Codex app account is not available (${auth.status}).`;
}

function ambientPluginId(prefix: "codex" | "pi" | "ambient", id: string): string {
  return `${prefix}:${id}`;
}

function capabilityId(pluginId: string, kind: string, key: string): string {
  return `${pluginId}:${kind}:${key}`;
}

function dedupePlugins(plugins: AmbientPluginSummary[]): AmbientPluginSummary[] {
  const seen = new Set<string>();
  return plugins.filter((plugin) => {
    if (seen.has(plugin.id)) return false;
    seen.add(plugin.id);
    return true;
  });
}

function dedupeCapabilities(capabilities: AmbientPluginCapabilitySummary[]): AmbientPluginCapabilitySummary[] {
  const seen = new Set<string>();
  return capabilities.filter((capability) => {
    if (seen.has(capability.id)) return false;
    seen.add(capability.id);
    return true;
  });
}
