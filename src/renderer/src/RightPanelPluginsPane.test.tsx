import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import { RightPanelPluginsPane, type RightPanelPluginsPaneProps } from "./RightPanelPluginsPane";

function InfoTooltip({ label, text }: { label?: string; text: string }) {
  return <span data-label={label}>{text}</span>;
}

function callable() {
  return vi.fn();
}

function baseProps(overrides: Partial<RightPanelPluginsPaneProps> = {}): RightPanelPluginsPaneProps {
  return {
    InfoTooltip,
    state: {
      settings: {
        permissionMode: "full-access",
        search: { webSearch: false },
      },
    } as unknown as DesktopState,
    running: false,
    voiceProviders: [],
    sttProviders: [],
    permissionAudit: [],
    pluginCatalogPane: {
      pluginView: "capabilities",
      setPluginView: callable(),
      pluginSourceFilter: "all",
      setPluginSourceFilter: callable(),
      pluginRuntimeFilter: "all",
      setPluginRuntimeFilter: callable(),
      capabilityBuilderHistoryLoading: false,
      selectedPluginDetailId: undefined,
      setSelectedPluginDetailId: callable(),
      codexMarketplaceSourceInput: "",
      setCodexMarketplaceSourceInput: callable(),
      codexMarketplaceNameInput: "",
      setCodexMarketplaceNameInput: callable(),
      codexMarketplaceAllowExperimental: false,
      setCodexMarketplaceAllowExperimental: callable(),
      codexMarketplaceAdding: false,
      pluginCatalogError: "Catalog unavailable",
      loadPluginCatalog: callable(),
      loadCapabilityBuilderHistory: callable(),
      inspectAmbientPluginCapability: callable(),
      revealGeneratedCapabilitySource: callable(),
      startGeneratedCapabilityValidation: callable(),
      startGeneratedCapabilityUpdatePlan: callable(),
      startGeneratedCapabilityRemovalPlan: callable(),
      startCapabilityBuilderHistoryPreview: callable(),
      startCapabilityBuilderHistoryReregister: callable(),
      startCapabilityBuilderHistoryRepairPlan: callable(),
      setPluginEnabled: callable(),
      setPluginTrusted: callable(),
      importCodexPlugin: callable(),
      addCodexMarketplace: callable(),
      removeCodexMarketplace: callable(),
      uninstallCodexPlugin: callable(),
      installCodexPluginDependencies: callable(),
    } as unknown as RightPanelPluginsPaneProps["pluginCatalogPane"],
    mcpPane: {
      runtimeSnapshots: [],
      inspecting: false,
      serverQuery: "",
      setServerQuery: callable(),
      registryResults: [],
      installedServers: [],
      managedDevServers: [],
      containerRuntimeBusy: false,
      containerRuntimeLaunchBusy: false,
      setContainerRuntimeModalOpen: callable(),
      inspectPluginMcp: callable(),
      refreshContainerRuntimeStatus: callable(),
      launchContainerRuntimeInstaller: callable(),
      installDefaultCapability: callable(),
      loadManagedDevServers: callable(),
      stopManagedDevServerProcess: callable(),
      searchRegistryServers: callable(),
      loadInstalledServers: callable(),
      acceptToolDescriptorReview: callable(),
      uninstallServer: callable(),
      describeRegistryServer: callable(),
      installRegistryServer: callable(),
      restartPluginMcpRuntime: callable(),
      stopPluginMcpRuntime: callable(),
    } as unknown as RightPanelPluginsPaneProps["mcpPane"],
    settingsPane: {
      firstRunCapabilityOnboardingDismissed: false,
      firstRunCapabilityOnboardingStarting: false,
      resumeFirstRunCapabilityOnboarding: callable(),
      startFirstRunCapabilityOnboarding: callable(),
      dismissFirstRunCapabilityOnboarding: callable(),
    } as unknown as RightPanelPluginsPaneProps["settingsPane"],
    diagnosticsPane: {
      diagnosticBusy: false,
      exportDiagnostics: callable(),
    } as unknown as RightPanelPluginsPaneProps["diagnosticsPane"],
    pluginAuthPane: {
      setPluginAuthStatus: callable(),
      setPluginAuthPending: callable(),
      pluginAuthCode: "",
      setPluginAuthCode: callable(),
      googleSetupAccountHint: "",
      setGoogleSetupAccountHint: callable(),
      completePluginAppAuth: callable(),
      startPluginAppAuth: callable(),
      installGoogleWorkspaceCli: callable(),
      confirmGoogleWorkspaceAccount: callable(),
      startGoogleWorkspaceSetup: callable(),
      importGoogleWorkspaceOAuthClient: callable(),
      validateGoogleWorkspace: callable(),
      cancelGoogleWorkspaceSetup: callable(),
      testPluginAuthAccount: callable(),
      disconnectGoogleWorkspace: callable(),
      disconnectPluginAuthAccount: callable(),
      revokePluginAuthAccount: callable(),
    } as unknown as RightPanelPluginsPaneProps["pluginAuthPane"],
    googleIntegrationBridge: {
      onGoogleIntegrationChanged: callable(),
    },
    capabilityBuilderLauncher: {
      setOpen: callable(),
    } as unknown as RightPanelPluginsPaneProps["capabilityBuilderLauncher"],
    piPackagePane: {
      piPackageInspecting: false,
      selectedPiPackageDetailId: undefined,
      setSelectedPiPackageDetailId: callable(),
      piPackageInstalling: false,
      piExtensionSandboxInstalling: false,
      piExtensionSandboxClearingHistory: false,
      piPrivilegedClearingHistory: false,
      piPrivilegedScanning: false,
      piPrivilegedInstalling: false,
      piPackageSourceInput: "",
      setPiPackageSourceInput: callable(),
      piPackageInstallScope: "workspace",
      setPiPackageInstallScope: callable(),
      inspectPiPackages: callable(),
      installPiPackage: callable(),
      installPiExtensionSandboxPackage: callable(),
      scanPiPrivilegedPackage: callable(),
      installPiPrivilegedPackage: callable(),
      uninstallPiPackage: callable(),
      setPiPackageEnabled: callable(),
      uninstallPiExtensionSandboxPackage: callable(),
      clearPiExtensionSandboxHistory: callable(),
      disablePiPrivilegedPackage: callable(),
      uninstallPiPrivilegedPackage: callable(),
      clearPiPrivilegedPackageHistory: callable(),
    } as unknown as RightPanelPluginsPaneProps["piPackagePane"],
    onOpenMcpRuntimeSettings: callable(),
    ...overrides,
  };
}

describe("RightPanelPluginsPane", () => {
  it("keeps plugin host action and status wiring behind a typed adapter", () => {
    const html = renderToStaticMarkup(<RightPanelPluginsPane {...baseProps()} />);

    expect(html).toContain("Refresh");
    expect(html).toContain("Add capability");
    expect(html).toContain("Inspect MCP");
    expect(html).toContain("Inspect Pi packages");
    expect(html).toContain("Catalog unavailable");
  });
});
