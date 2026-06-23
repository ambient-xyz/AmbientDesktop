import type {
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpDefaultCapabilityInstallProgress,
  AmbientPluginRuntime,
  AmbientPluginSourceKind,
  CodexMarketplaceSourceSummary,
} from "../../shared/pluginTypes";
import {
  filterAmbientCapabilities,
  filterAmbientPluginsBySource,
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  pluginAuthCompleteActionState,
  type AmbientPluginRuntimeFilter,
  type AmbientPluginSourceFilter,
} from "./pluginUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
import type { PluginPanelView, RightPanelPluginHostProps } from "./RightPanelPluginHostTypes";

export const pluginPanelViews: PluginPanelView[] = ["home", "capabilities", "mcp", "marketplace", "installed", "sources", "diagnostics"];

export const pluginRuntimeFilters: AmbientPluginRuntimeFilter[] = ["all", "chat", "workflow", "automation", "ui"];

export const pluginSourceFilters: AmbientPluginSourceFilter[] = [
  "all",
  "ambient-built-in",
  "ambient-cli",
  "codex-workspace",
  "codex-cache",
  "codex-ambient-curated",
  "codex-remote-marketplace",
  "pi-ambient-workspace",
  "pi-ambient-global",
  "pi-workspace",
  "pi-project-settings",
  "pi-user-settings",
  "pi-gallery",
];

export function pluginPanelViewLabel(view: PluginPanelView): string {
  if (view === "capabilities") return "Install Capabilities";
  if (view === "mcp") return "MCP Servers";
  return formatTaskState(view);
}

export function pluginRuntimeFilterLabel(runtime: AmbientPluginRuntimeFilter): string {
  return runtime === "all" ? "All runtimes" : formatTaskState(runtime as AmbientPluginRuntime);
}

export function mcpContainerRuntimeInstallProgressStatus(
  progress?: AmbientMcpContainerRuntimeManagedInstallProgress,
): ApiKeyStatus | undefined {
  if (!progress) return undefined;
  const failed = progress.status === "failed" || progress.status === "blocked" || progress.status === "adapter-unavailable";
  const succeeded = progress.phase === "completed" && progress.status === "succeeded";
  return {
    kind: failed ? "error" : succeeded ? "success" : "info",
    message: progress.logPath ? `${progress.message} Log: ${progress.logPath}` : progress.message,
  };
}

export function mcpDefaultCapabilityInstallProgressStatus(progress?: AmbientMcpDefaultCapabilityInstallProgress): ApiKeyStatus | undefined {
  if (!progress) return undefined;
  return {
    kind: progress.status === "failed" ? "error" : progress.status === "succeeded" ? "success" : "info",
    message: progress.message,
  };
}

export function buildRightPanelPluginHostModel(host: RightPanelPluginHostProps) {
  const registry = host.ambientPluginRegistry;
  const installedPlugins = registry?.plugins.filter((plugin) => plugin.installState !== "importable") ?? [];
  const importablePlugins = registry?.plugins.filter((plugin) => plugin.installState === "importable") ?? [];
  const sourceOptions = pluginSourceFilters.filter(
    (source) =>
      source === "all" ||
      Boolean(
        registry?.plugins.some((plugin) => plugin.sourceKind === source) ||
        registry?.capabilities.some((capability) => capability.sourceKind === source),
      ),
  );
  const filteredInstalledPlugins = filterAmbientPluginsBySource(installedPlugins, host.pluginSourceFilter);
  const filteredCapabilities = registry
    ? filterAmbientCapabilities(registry.capabilities, { source: host.pluginSourceFilter, runtime: host.pluginRuntimeFilter })
    : [];
  const pluginAuthCompleteAction = pluginAuthCompleteActionState(
    Boolean(host.pluginAuthPending),
    host.pluginAuthCode,
    host.pluginAuthBusy === `complete:${host.pluginAuthPending?.state ?? ""}`,
  );
  const availableCapabilities = registry?.capabilities.filter((capability) => capability.availability === "available").length ?? 0;
  const authRequiredCapabilities = registry?.capabilities.filter((capability) => capability.availability === "auth-required").length ?? 0;
  const trustRequiredCapabilities = registry?.capabilities.filter((capability) => capability.availability === "untrusted").length ?? 0;
  const errorCapabilities = registry?.capabilities.filter((capability) => capability.availability === "error").length ?? 0;
  const noConfiguredCoreCapabilities =
    Boolean(registry) &&
    availableCapabilities === 0 &&
    host.voiceProviders.length === 0 &&
    host.sttProviders.length === 0 &&
    !host.state.settings.search.webSearch;
  const showFirstRunCapabilityOnboarding = noConfiguredCoreCapabilities && !host.firstRunCapabilityOnboardingDismissed;
  const codexMarketplaceSources: CodexMarketplaceSourceSummary[] =
    host.pluginCatalog?.marketplaceSources ??
    registry?.sources.map(
      (source): CodexMarketplaceSourceSummary => ({ id: source, label: source, source, kind: "workspace", removable: false }),
    ) ??
    [];
  const mcpContainerRuntimeReady = host.mcpContainerRuntimeStatus?.status === "ready";
  const mcpContainerRuntimeToneClass = mcpContainerRuntimeTone(host.mcpContainerRuntimeStatus?.status);
  const mcpContainerRuntimeLabel = mcpContainerRuntimeStatusLabel(host.mcpContainerRuntimeStatus?.status);
  const mcpContainerRuntimeDiagnosticsAction = mcpContainerRuntimeDiagnosticsActionState(host.mcpContainerRuntimeStatus, {
    error: host.mcpContainerRuntimeError,
    busy: host.diagnosticBusy,
  });
  const mcpContainerRuntimeInstallProgressStatusView = mcpContainerRuntimeInstallProgressStatus(host.mcpContainerRuntimeInstallProgress);
  const mcpDefaultCapabilityInstallProgressStatusView = mcpDefaultCapabilityInstallProgressStatus(host.mcpDefaultCapabilityInstallProgress);
  const mcpContainerRuntimeSetupResume = mcpContainerRuntimeSetupResumeRows(host.mcpContainerRuntimeStatus);

  return {
    registry,
    installedPlugins,
    importablePlugins,
    sourceOptions: sourceOptions as Array<"all" | AmbientPluginSourceKind>,
    filteredInstalledPlugins,
    filteredCapabilities,
    pluginAuthCompleteAction,
    availableCapabilities,
    authRequiredCapabilities,
    trustRequiredCapabilities,
    errorCapabilities,
    showFirstRunCapabilityOnboarding,
    codexMarketplaceSources,
    mcpContainerRuntimeReady,
    mcpContainerRuntimeToneClass,
    mcpContainerRuntimeLabel,
    mcpContainerRuntimeDiagnosticsAction,
    mcpContainerRuntimeInstallProgressStatusView,
    mcpDefaultCapabilityInstallProgressStatusView,
    mcpContainerRuntimeSetupResume,
  };
}

export type RightPanelPluginHostModel = ReturnType<typeof buildRightPanelPluginHostModel>;
