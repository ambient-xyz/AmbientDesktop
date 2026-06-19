import { useEffect, useState } from "react";

import type { AmbientGeneratedCapabilitySummary, AmbientPluginCapabilityDiagnostics, AmbientPluginRegistry, CapabilityBuilderHistoryEntry, CapabilityBuilderHistoryResult, CodexHostedMarketplaceReport, CodexPluginCatalog, FirstPartyGoogleIntegrationState, ManagedDevServerSummary, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import {
  buildCapabilityBuilderHistoryPreviewPrompt,
  buildCapabilityBuilderHistoryRepairPlanPrompt,
  buildCapabilityBuilderHistoryReregisterPrompt,
  buildGeneratedCapabilityRemovalPlanPrompt,
  buildGeneratedCapabilityUpdatePlanPrompt,
  buildGeneratedCapabilityValidationPrompt,
  codexMarketplaceAddActionState,
  type AmbientPluginRuntimeFilter,
  type AmbientPluginSourceFilter,
} from "./pluginUiModel";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
import type { PluginPanelView } from "./RightPanelPluginHost";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

type UseRightPanelPluginCatalogControllerInput = {
  workspacePath: string;
  onStartCapabilityBuilder: (prompt: string, newChat: boolean, activityLine?: string) => Promise<CapabilityBuilderPromptResult>;
  onGoogleIntegrationChanged: (googleIntegration: FirstPartyGoogleIntegrationState | undefined) => void;
  mcp: {
    prepareCatalogLoad: () => void;
    clearInspection: () => void;
    clearRuntimeSnapshots: () => void;
    setRuntimeSnapshots: (snapshots: PluginMcpRuntimeSnapshot[]) => void;
    setManagedDevServers: (servers: ManagedDevServerSummary[]) => void;
  };
};

export function useRightPanelPluginCatalogController({
  workspacePath,
  onStartCapabilityBuilder,
  onGoogleIntegrationChanged,
  mcp,
}: UseRightPanelPluginCatalogControllerInput) {
  const [pluginCatalog, setPluginCatalog] = useState<CodexPluginCatalog | undefined>();
  const [hostedMarketplaceReport, setHostedMarketplaceReport] = useState<CodexHostedMarketplaceReport | undefined>();
  const [ambientPluginRegistry, setAmbientPluginRegistry] = useState<AmbientPluginRegistry | undefined>();
  const [pluginView, setPluginView] = useState<PluginPanelView>("capabilities");
  const [pluginSourceFilter, setPluginSourceFilter] = useState<AmbientPluginSourceFilter>("all");
  const [pluginRuntimeFilter, setPluginRuntimeFilter] = useState<AmbientPluginRuntimeFilter>("all");
  const [pluginCapabilityDiagnostics, setPluginCapabilityDiagnostics] = useState<AmbientPluginCapabilityDiagnostics | undefined>();
  const [pluginCapabilityDiagnosticsBusy, setPluginCapabilityDiagnosticsBusy] = useState<string | undefined>();
  const [pluginCapabilityDiagnosticsError, setPluginCapabilityDiagnosticsError] = useState<string | undefined>();
  const [capabilityBuilderHistory, setCapabilityBuilderHistory] = useState<CapabilityBuilderHistoryResult | undefined>();
  const [capabilityBuilderHistoryLoading, setCapabilityBuilderHistoryLoading] = useState(false);
  const [capabilityBuilderHistoryError, setCapabilityBuilderHistoryError] = useState<string | undefined>();
  const [capabilityBuilderHistoryPreviewStarting, setCapabilityBuilderHistoryPreviewStarting] = useState<string | undefined>();
  const [capabilityBuilderHistoryRepairPlanning, setCapabilityBuilderHistoryRepairPlanning] = useState<string | undefined>();
  const [capabilityBuilderHistoryReregisterStarting, setCapabilityBuilderHistoryReregisterStarting] = useState<string | undefined>();
  const [generatedCapabilitySourceOpening, setGeneratedCapabilitySourceOpening] = useState<string | undefined>();
  const [generatedCapabilityValidationStarting, setGeneratedCapabilityValidationStarting] = useState<string | undefined>();
  const [generatedCapabilityUpdatePlanning, setGeneratedCapabilityUpdatePlanning] = useState<string | undefined>();
  const [generatedCapabilityRemovalPlanning, setGeneratedCapabilityRemovalPlanning] = useState<string | undefined>();
  const [selectedPluginDetailId, setSelectedPluginDetailId] = useState<string | undefined>();
  const [codexMarketplaceSourceInput, setCodexMarketplaceSourceInput] = useState("");
  const [codexMarketplaceNameInput, setCodexMarketplaceNameInput] = useState("");
  const [codexMarketplaceAllowExperimental, setCodexMarketplaceAllowExperimental] = useState(false);
  const [codexMarketplaceAdding, setCodexMarketplaceAdding] = useState(false);
  const [codexMarketplaceRemoving, setCodexMarketplaceRemoving] = useState<string | undefined>();
  const [pluginCatalogError, setPluginCatalogError] = useState<string | undefined>();
  const [pluginDependencyInstalling, setPluginDependencyInstalling] = useState<string | undefined>();
  const [pluginDependencyStatus, setPluginDependencyStatus] = useState<ApiKeyStatus | undefined>();

  useEffect(() => {
    setPluginCatalog(undefined);
    setHostedMarketplaceReport(undefined);
    setAmbientPluginRegistry(undefined);
    setCapabilityBuilderHistory(undefined);
    setCapabilityBuilderHistoryError(undefined);
    setCodexMarketplaceRemoving(undefined);
  }, [workspacePath]);

  async function loadPluginCatalog() {
    setPluginCatalogError(undefined);
    mcp.prepareCatalogLoad();
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      const [catalog, registry, runtimeSnapshots, devServers] = await Promise.all([
        window.ambientDesktop.discoverCodexPlugins(),
        window.ambientDesktop.listAmbientPluginRegistry(),
        window.ambientDesktop.listPluginMcpRuntimeSnapshots(),
        window.ambientDesktop.listManagedDevServers(),
      ]);
      setPluginCatalog(catalog);
      setAmbientPluginRegistry(registry);
      mcp.setRuntimeSnapshots(runtimeSnapshots);
      mcp.setManagedDevServers(devServers);
      setPluginCapabilityDiagnostics((current) =>
        current && registry.capabilities.some((capability) => capability.id === current.capabilityId) ? current : undefined,
      );
      const hostedMarketplace = await window.ambientDesktop.inspectCodexHostedMarketplace();
      setHostedMarketplaceReport(hostedMarketplace);
      onGoogleIntegrationChanged(await window.ambientDesktop.getFirstPartyGoogleIntegration());
    } catch (error) {
      setPluginCatalogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadCapabilityBuilderHistory() {
    setCapabilityBuilderHistoryLoading(true);
    setCapabilityBuilderHistoryError(undefined);
    try {
      setCapabilityBuilderHistory(await window.ambientDesktop.getCapabilityBuilderHistory({ includeRegistered: true, includeDrafts: true }));
    } catch (error) {
      setCapabilityBuilderHistoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilityBuilderHistoryLoading(false);
    }
  }

  async function loadAmbientPluginRegistry() {
    const [registry, google] = await Promise.all([
      window.ambientDesktop.listAmbientPluginRegistry(),
      window.ambientDesktop.getFirstPartyGoogleIntegration(),
    ]);
    setAmbientPluginRegistry(registry);
    onGoogleIntegrationChanged(google);
  }

  async function inspectAmbientPluginCapability(capabilityId: string) {
    if (pluginCapabilityDiagnostics?.capabilityId === capabilityId) {
      setPluginCapabilityDiagnostics(undefined);
      setPluginCapabilityDiagnosticsError(undefined);
      return;
    }
    setPluginCapabilityDiagnosticsBusy(capabilityId);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      setPluginCapabilityDiagnostics(await window.ambientDesktop.getAmbientPluginCapabilityDiagnostics({ capabilityId }));
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginCapabilityDiagnosticsBusy(undefined);
    }
  }

  async function revealGeneratedCapabilitySource(path: string | undefined) {
    if (!path) return;
    setGeneratedCapabilitySourceOpening(path);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      await window.ambientDesktop.revealWorkspacePath(path);
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratedCapabilitySourceOpening(undefined);
    }
  }

  async function startGeneratedCapabilityValidation(packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) {
    if (!generated?.sourcePath) return;
    setGeneratedCapabilityValidationStarting(generated.sourcePath);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      await onStartCapabilityBuilder(buildGeneratedCapabilityValidationPrompt({ packageName, generated }), true);
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratedCapabilityValidationStarting(undefined);
    }
  }

  async function startGeneratedCapabilityUpdatePlan(packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) {
    if (!generated?.sourcePath) return;
    setGeneratedCapabilityUpdatePlanning(generated.sourcePath);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      await onStartCapabilityBuilder(buildGeneratedCapabilityUpdatePlanPrompt({ packageName, generated }), true);
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratedCapabilityUpdatePlanning(undefined);
    }
  }

  async function startGeneratedCapabilityRemovalPlan(packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) {
    if (!generated?.sourcePath) return;
    setGeneratedCapabilityRemovalPlanning(generated.sourcePath);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      await onStartCapabilityBuilder(buildGeneratedCapabilityRemovalPlanPrompt({ packageName, generated }), true);
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratedCapabilityRemovalPlanning(undefined);
    }
  }

  async function startCapabilityBuilderHistoryPreview(entry: CapabilityBuilderHistoryEntry) {
    setCapabilityBuilderHistoryPreviewStarting(entry.relativeRootPath);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      await onStartCapabilityBuilder(buildCapabilityBuilderHistoryPreviewPrompt(entry), true);
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilityBuilderHistoryPreviewStarting(undefined);
    }
  }

  async function startCapabilityBuilderHistoryReregister(entry: CapabilityBuilderHistoryEntry) {
    setCapabilityBuilderHistoryReregisterStarting(entry.relativeRootPath);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      await onStartCapabilityBuilder(buildCapabilityBuilderHistoryReregisterPrompt(entry), true);
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilityBuilderHistoryReregisterStarting(undefined);
    }
  }

  async function startCapabilityBuilderHistoryRepairPlan(entry: CapabilityBuilderHistoryEntry) {
    setCapabilityBuilderHistoryRepairPlanning(entry.relativeRootPath);
    setPluginCapabilityDiagnosticsError(undefined);
    try {
      await onStartCapabilityBuilder(buildCapabilityBuilderHistoryRepairPlanPrompt(entry), true);
    } catch (error) {
      setPluginCapabilityDiagnosticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setCapabilityBuilderHistoryRepairPlanning(undefined);
    }
  }

  async function setPluginEnabled(pluginId: string, enabled: boolean) {
    setPluginCatalogError(undefined);
    mcp.clearInspection();
    try {
      setPluginCatalog(await window.ambientDesktop.setCodexPluginEnabled({ pluginId, enabled }));
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginCatalogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function setPluginTrusted(pluginId: string, trusted: boolean) {
    setPluginCatalogError(undefined);
    mcp.clearRuntimeSnapshots();
    try {
      setPluginCatalog(await window.ambientDesktop.setCodexPluginTrusted({ pluginId, trusted }));
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginCatalogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function importCodexPlugin(pluginId: string) {
    setPluginCatalogError(undefined);
    mcp.clearInspection();
    try {
      setPluginCatalog(await window.ambientDesktop.importCodexPlugin({ pluginId }));
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginCatalogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function addCodexMarketplace() {
    const action = codexMarketplaceAddActionState(codexMarketplaceSourceInput, codexMarketplaceAdding, codexMarketplaceAllowExperimental);
    if (action.disabled) return;
    setPluginCatalogError(undefined);
    mcp.clearInspection();
    setCodexMarketplaceAdding(true);
    try {
      setPluginCatalog(
        await window.ambientDesktop.addCodexMarketplace({
          source: codexMarketplaceSourceInput,
          ...(codexMarketplaceNameInput.trim() ? { name: codexMarketplaceNameInput.trim() } : {}),
          ...(codexMarketplaceAllowExperimental ? { allowExperimental: true } : {}),
        }),
      );
      setCodexMarketplaceSourceInput("");
      setCodexMarketplaceNameInput("");
      setCodexMarketplaceAllowExperimental(false);
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginCatalogError(error instanceof Error ? error.message : String(error));
    } finally {
      setCodexMarketplaceAdding(false);
    }
  }

  async function removeCodexMarketplace(sourceId: string, source: string) {
    setPluginCatalogError(undefined);
    mcp.clearInspection();
    setCodexMarketplaceRemoving(sourceId);
    try {
      setPluginCatalog(await window.ambientDesktop.removeCodexMarketplace({ source }));
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginCatalogError(error instanceof Error ? error.message : String(error));
    } finally {
      setCodexMarketplaceRemoving(undefined);
    }
  }

  async function uninstallCodexPlugin(pluginId: string) {
    setPluginCatalogError(undefined);
    mcp.clearInspection();
    try {
      setPluginCatalog(await window.ambientDesktop.uninstallCodexPlugin({ pluginId }));
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginCatalogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function installCodexPluginDependencies(pluginId: string) {
    setPluginCatalogError(undefined);
    setPluginDependencyStatus(undefined);
    mcp.clearInspection();
    setPluginDependencyInstalling(pluginId);
    try {
      const result = await window.ambientDesktop.installCodexPluginDependencies({ pluginId });
      setPluginDependencyStatus({
        kind: "success",
        message: `Installed dependencies for ${result.pluginName} with ${result.command.join(" ")}.`,
      });
      await loadPluginCatalog();
    } catch (error) {
      setPluginDependencyStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginDependencyInstalling(undefined);
    }
  }

  return {
    pluginCatalog,
    hostedMarketplaceReport,
    ambientPluginRegistry,
    pluginView,
    setPluginView,
    pluginSourceFilter,
    setPluginSourceFilter,
    pluginRuntimeFilter,
    setPluginRuntimeFilter,
    pluginCapabilityDiagnostics,
    pluginCapabilityDiagnosticsBusy,
    pluginCapabilityDiagnosticsError,
    capabilityBuilderHistory,
    capabilityBuilderHistoryLoading,
    capabilityBuilderHistoryError,
    capabilityBuilderHistoryPreviewStarting,
    capabilityBuilderHistoryRepairPlanning,
    capabilityBuilderHistoryReregisterStarting,
    generatedCapabilitySourceOpening,
    generatedCapabilityValidationStarting,
    generatedCapabilityUpdatePlanning,
    generatedCapabilityRemovalPlanning,
    selectedPluginDetailId,
    setSelectedPluginDetailId,
    codexMarketplaceSourceInput,
    setCodexMarketplaceSourceInput,
    codexMarketplaceNameInput,
    setCodexMarketplaceNameInput,
    codexMarketplaceAllowExperimental,
    setCodexMarketplaceAllowExperimental,
    codexMarketplaceAdding,
    codexMarketplaceRemoving,
    pluginCatalogError,
    setPluginCatalogError,
    pluginDependencyInstalling,
    pluginDependencyStatus,
    loadPluginCatalog,
    loadCapabilityBuilderHistory,
    loadAmbientPluginRegistry,
    inspectAmbientPluginCapability,
    revealGeneratedCapabilitySource,
    startGeneratedCapabilityValidation,
    startGeneratedCapabilityUpdatePlan,
    startGeneratedCapabilityRemovalPlan,
    startCapabilityBuilderHistoryPreview,
    startCapabilityBuilderHistoryReregister,
    startCapabilityBuilderHistoryRepairPlan,
    setPluginEnabled,
    setPluginTrusted,
    importCodexPlugin,
    addCodexMarketplace,
    removeCodexMarketplace,
    uninstallCodexPlugin,
    installCodexPluginDependencies,
  };
}
