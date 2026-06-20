import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  CodexMarketplaceSourceSummary,
  PiPackageCatalog,
} from "../../shared/pluginTypes";
import {
  RightPanelPluginSourcesPane,
  type RightPanelPluginSourcesPaneProps,
} from "./RightPanelPluginSourcesPane";

function baseProps(overrides: Partial<RightPanelPluginSourcesPaneProps> = {}): RightPanelPluginSourcesPaneProps {
  return {
    running: false,
    capabilityBuilderHistoryLoading: false,
    codexMarketplaceSources: [],
    codexMarketplaceSourceInput: "",
    setCodexMarketplaceSourceInput: vi.fn(),
    codexMarketplaceNameInput: "",
    setCodexMarketplaceNameInput: vi.fn(),
    codexMarketplaceAllowExperimental: false,
    setCodexMarketplaceAllowExperimental: vi.fn(),
    codexMarketplaceAdding: false,
    selectedPiPackageDetailId: undefined,
    setSelectedPiPackageDetailId: vi.fn(),
    piPackageInstalling: false,
    piExtensionSandboxInstalling: false,
    piExtensionSandboxClearingHistory: false,
    piPrivilegedClearingHistory: false,
    piPrivilegedScanning: false,
    piPrivilegedInstalling: false,
    piPackageSourceInput: "",
    setPiPackageSourceInput: vi.fn(),
    piPackageInstallScope: "workspace",
    setPiPackageInstallScope: vi.fn(),
    permissionAudit: [],
    addCodexMarketplace: vi.fn(),
    removeCodexMarketplace: vi.fn(),
    loadCapabilityBuilderHistory: vi.fn(),
    startCapabilityBuilderHistoryPreview: vi.fn(),
    startCapabilityBuilderHistoryReregister: vi.fn(),
    startCapabilityBuilderHistoryRepairPlan: vi.fn(),
    revealGeneratedCapabilitySource: vi.fn(),
    startGeneratedCapabilityUpdatePlan: vi.fn(),
    startGeneratedCapabilityRemovalPlan: vi.fn(),
    installPiPackage: vi.fn(),
    installPiExtensionSandboxPackage: vi.fn(),
    scanPiPrivilegedPackage: vi.fn(),
    installPiPrivilegedPackage: vi.fn(),
    uninstallPiPackage: vi.fn(),
    setPiPackageEnabled: vi.fn(),
    uninstallPiExtensionSandboxPackage: vi.fn(),
    clearPiExtensionSandboxHistory: vi.fn(),
    disablePiPrivilegedPackage: vi.fn(),
    uninstallPiPrivilegedPackage: vi.fn(),
    clearPiPrivilegedPackageHistory: vi.fn(),
    ...overrides,
  };
}

function generatedHistoryEntry(): CapabilityBuilderHistoryEntry {
  return {
    packageName: "sync-docs",
    rootPath: "/tmp/workspace/.ambient/capability-builder/sync-docs",
    relativeRootPath: ".ambient/capability-builder/sync-docs",
    gitSha: "abc123",
    valid: true,
    status: "validated",
    goal: "Build sync docs.",
    kind: "mcp-tool",
    provider: "ambient",
    installedPresent: false,
    lastValidatedAt: "2026-05-02T00:00:00.000Z",
    registeredAt: "2026-05-01T00:00:00.000Z",
    validationArtifacts: [],
    refs: {
      installed: "installed-ref",
      lastValidated: "validated-ref",
      lastRepair: null,
    },
    commandNames: ["sync_docs"],
    envNames: [],
    artifactOutputTypes: ["application/pdf"],
    logFiles: [],
    possibleArtifactFiles: [],
    errors: [],
    warnings: ["Check OAuth scope."],
  };
}

function generatedHistory(): CapabilityBuilderHistoryResult {
  return {
    rootPath: "/tmp/workspace/.ambient/capability-builder",
    relativeRootPath: ".ambient/capability-builder",
    entries: [generatedHistoryEntry()],
    errors: ["stale draft ignored"],
  };
}

function marketplaceSource(): CodexMarketplaceSourceSummary {
  return {
    id: "workspace-marketplace",
    label: "Workspace Marketplace",
    source: "./marketplace.json",
    kind: "workspace",
    removable: true,
    pluginCount: 2,
    signatureStatus: "verified",
    signatureKeyId: "key-1",
    contentChecksum: "sha256-marketplace",
  };
}

function piPackageCatalog(): PiPackageCatalog {
  return {
    packages: [
      {
        id: "pi-helpers",
        name: "pi-helpers",
        version: "1.0.0",
        description: "Pi helper package.",
        sourceKind: "workspace",
        sourceLabel: "Workspace",
        packageSpec: "npm:pi-helpers",
        installed: false,
        enabled: false,
        installScope: "workspace",
        keywords: [],
        resourceCounts: {
          extension: 1,
          skill: 0,
          prompt: 0,
          theme: 0,
        },
        resources: [],
        compatibilityTier: "supported",
        compatibilityNotes: ["Ready for workspace install."],
        supportLabels: [],
        errors: [],
      },
    ],
    errors: [],
    sourceNotes: ["Workspace scan complete."],
  };
}

describe("RightPanelPluginSourcesPane", () => {
  it("renders empty generated source and marketplace states", () => {
    const html = renderToStaticMarkup(<RightPanelPluginSourcesPane {...baseProps()} />);

    expect(html).toContain("Add Codex Marketplace");
    expect(html).toContain("No generated capability sources have been created in this workspace yet.");
    expect(html).toContain("No Codex marketplace source is configured for this workspace.");
  });

  it("renders generated capability history, marketplace source metadata, and Pi package candidates", () => {
    const html = renderToStaticMarkup(
      <RightPanelPluginSourcesPane
        {...baseProps({
          capabilityBuilderHistory: generatedHistory(),
          codexMarketplaceSources: [marketplaceSource()],
          piPackageCatalog: piPackageCatalog(),
          piPackageSourceInput: "npm:pi-helpers",
        })}
      />,
    );

    expect(html).toContain("sync-docs");
    expect(html).toContain("Build sync docs.");
    expect(html).toContain("Valid preview");
    expect(html).toContain("Not installed");
    expect(html).toContain(".ambient/capability-builder/sync-docs");
    expect(html).toContain("Discovery error: stale draft ignored");
    expect(html).toContain("Check OAuth scope.");
    expect(html).toContain("Workspace Marketplace");
    expect(html).toContain("./marketplace.json");
    expect(html).toContain("sha256-marketplace");
    expect(html).toContain("Pi Packages");
    expect(html).toContain("pi-helpers");
    expect(html).toContain("Pi helper package.");
    expect(html).toContain("npm:pi-helpers");
    expect(html).toContain("Workspace scan complete.");
  });
});
