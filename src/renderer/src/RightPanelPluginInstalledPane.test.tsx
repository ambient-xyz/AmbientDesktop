import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AmbientPluginCapabilitySummary, AmbientPluginSummary, CodexPluginSummary } from "../../shared/pluginTypes";
import {
  RightPanelPluginInstalledPane,
  type RightPanelPluginInstalledPaneProps,
} from "./RightPanelPluginInstalledPane";

function baseProps(overrides: Partial<RightPanelPluginInstalledPaneProps> = {}): RightPanelPluginInstalledPaneProps {
  return {
    plugins: [],
    capabilities: [],
    codexPlugins: [],
    setSelectedPluginDetailId: vi.fn(),
    running: false,
    revealGeneratedCapabilitySource: vi.fn(),
    setPluginTrusted: vi.fn(),
    setPluginEnabled: vi.fn(),
    uninstallCodexPlugin: vi.fn(),
    startGeneratedCapabilityValidation: vi.fn(),
    startGeneratedCapabilityUpdatePlan: vi.fn(),
    startGeneratedCapabilityRemovalPlan: vi.fn(),
    installCodexPluginDependencies: vi.fn(),
    ...overrides,
  };
}

function installedPluginFixture(): AmbientPluginSummary {
  return {
    id: "installed-1",
    sourcePluginId: "codex-plugin-1",
    sourceKind: "codex-workspace",
    sourceLabel: "Workspace marketplace",
    name: "doc-tools",
    displayName: "Doc Tools",
    description: "Document workflow plugin.",
    version: "1.2.3",
    installState: "installed",
    compatibilityTier: "supported",
    enabled: true,
    trusted: true,
    capabilityCount: 1,
    supportLabels: ["chat", "workflow"],
    diagnostics: [],
    generated: {
      schemaVersion: "ambient-capability-builder-v1",
      status: "validated",
      outputArtifactTypes: ["text/markdown"],
      sourcePath: "capabilities/doc-tools",
      registeredAt: "2026-05-01T00:00:00.000Z",
      lastValidatedAt: "2026-05-02T00:00:00.000Z",
      refs: {
        installed: "abc123",
        lastValidated: "def456",
      },
    },
  };
}

function codexPluginFixture(): CodexPluginSummary {
  return {
    id: "codex-plugin-1",
    name: "doc-tools",
    version: "1.2.3",
    description: "Document workflow plugin.",
    marketplaceName: "Workspace",
    marketplacePath: "/tmp/marketplace.json",
    rootPath: "/tmp/plugins/doc-tools",
    sourceKind: "workspace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: ["chat", "workflow"],
    skills: [],
    mcpServers: [],
    dependencyStatus: {
      packageJsonPath: "/tmp/plugins/doc-tools/package.json",
      manager: "pnpm",
      installCommand: ["pnpm", "install"],
      required: true,
      installed: false,
      missingPackages: ["left-pad", "yaml"],
    },
    sourceType: "local",
    sourcePath: "/tmp/plugins/doc-tools",
    sourceRef: "main",
    sourceSha: "abc123",
    publisher: "Ambient",
    license: "MIT",
    ambientCompatibility: "Ambient Desktop",
    capabilitySummary: ["Document Sync"],
    authPolicy: "optional",
    enabled: true,
    trusted: true,
    errors: [],
  };
}

function capabilityFixture(): AmbientPluginCapabilitySummary {
  return {
    id: "capability-1",
    pluginId: "codex-plugin-1",
    pluginName: "doc-tools",
    pluginDisplayName: "Doc Tools",
    kind: "mcp-tool",
    name: "sync_document",
    displayName: "Sync Document",
    sourceKind: "codex-workspace",
    runtimeSupport: ["chat", "workflow"],
    enabled: true,
    trusted: true,
    availability: "available",
    toolName: "sync_document",
    serverName: "doc-tools",
    supportLabels: [],
    diagnostics: [],
  };
}

describe("RightPanelPluginInstalledPane", () => {
  it("renders the empty installed-plugin state", () => {
    const html = renderToStaticMarkup(<RightPanelPluginInstalledPane {...baseProps()} />);

    expect(html).toContain("No installed plugins match the selected source filter.");
  });

  it("renders codex plugin detail, generated actions, dependencies, and capability summary", () => {
    const plugin = installedPluginFixture();
    const html = renderToStaticMarkup(
      <RightPanelPluginInstalledPane
        {...baseProps({
          plugins: [plugin],
          codexPlugins: [codexPluginFixture()],
          capabilities: [capabilityFixture()],
          selectedPluginDetailId: plugin.id,
        })}
      />,
    );

    expect(html).toContain("Doc Tools");
    expect(html).toContain("Document workflow plugin.");
    expect(html).toContain("Revoke trust");
    expect(html).toContain("Uninstall");
    expect(html).toContain("Plugin Details");
    expect(html).toContain("Workspace marketplace");
    expect(html).toContain("builder source: capabilities/doc-tools");
    expect(html).toContain("root: /tmp/plugins/doc-tools");
    expect(html).toContain("Dependencies missing via pnpm");
    expect(html).toContain("left-pad, yaml");
    expect(html).toContain("Install dependencies");
    expect(html).toContain("Generated capability management starts");
    expect(html).toContain("Validate");
    expect(html).toContain("Plan update");
    expect(html).toContain("Plan removal");
    expect(html).toContain("Sync Document - MCP tool - Chat, Workflow");
  });
});
