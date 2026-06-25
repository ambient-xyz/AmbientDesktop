import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AmbientPluginCapabilitySummary } from "../../shared/pluginTypes";
import {
  pluginCapabilityDescriptionMetadata,
  RightPanelPluginCapabilitiesPane,
  type RightPanelPluginCapabilitiesPaneProps,
} from "./RightPanelPluginCapabilitiesPane";

function baseProps(overrides: Partial<RightPanelPluginCapabilitiesPaneProps> = {}): RightPanelPluginCapabilitiesPaneProps {
  return {
    capabilities: [],
    running: false,
    googleSetupAccountHint: "",
    setGoogleSetupAccountHint: vi.fn(),
    setPluginAuthStatus: vi.fn(),
    startPluginAppAuth: vi.fn(),
    installGoogleWorkspaceCli: vi.fn(),
    confirmGoogleWorkspaceAccount: vi.fn(),
    startGoogleWorkspaceSetup: vi.fn(),
    importGoogleWorkspaceOAuthClient: vi.fn(),
    validateGoogleWorkspace: vi.fn(),
    cancelGoogleWorkspaceSetup: vi.fn(),
    testPluginAuthAccount: vi.fn(),
    disconnectGoogleWorkspace: vi.fn(),
    disconnectPluginAuthAccount: vi.fn(),
    revokePluginAuthAccount: vi.fn(),
    revealGeneratedCapabilitySource: vi.fn(),
    startGeneratedCapabilityValidation: vi.fn(),
    startGeneratedCapabilityUpdatePlan: vi.fn(),
    startGeneratedCapabilityRemovalPlan: vi.fn(),
    inspectAmbientPluginCapability: vi.fn(),
    ...overrides,
  };
}

function generatedAppCapability(): AmbientPluginCapabilitySummary {
  return {
    id: "capability-1",
    pluginId: "plugin-1",
    pluginName: "doc-tools",
    pluginDisplayName: "Doc Tools",
    kind: "app",
    name: "document_sync",
    displayName: "Document Sync",
    description: "Connects document workflows to an external service.",
    sourceKind: "codex-workspace",
    runtimeSupport: ["chat", "workflow"],
    enabled: true,
    trusted: true,
    availability: "auth-required",
    availabilityReason: "Sign in before this connector can run.",
    connectorId: "demo.documents",
    authStatus: "expired",
    authProviderId: "demo-provider",
    authAccountCount: 1,
    authAccounts: [
      {
        id: "account-1",
        accountId: "alice@example.test",
        label: "Alice Docs",
        email: "alice@example.test",
        status: "expired",
        grantedScopes: ["documents.read"],
        connectedAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
    ],
    supportLabels: ["generated"],
    diagnostics: [],
    generated: {
      schemaVersion: "ambient-capability-builder-v1",
      outputArtifactTypes: ["text/markdown"],
      sourcePath: "capabilities/document-sync",
      refs: {},
    },
  };
}

describe("RightPanelPluginCapabilitiesPane", () => {
  it("renders the Google card and empty capability state", () => {
    const html = renderToStaticMarkup(<RightPanelPluginCapabilitiesPane {...baseProps()} />);

    expect(html).toContain("Google Workspace");
    expect(html).toContain("No plugin capabilities match the selected filters.");
  });

  it("renders capability auth, diagnostics, and generated management actions", () => {
    const capability = generatedAppCapability();
    const html = renderToStaticMarkup(
      <RightPanelPluginCapabilitiesPane
        {...baseProps({
          capabilities: [capability],
          pluginCapabilityDiagnostics: {
            capabilityId: capability.id,
            capability,
            diagnostics: ["OAuth token expired"],
            availabilityReason: "Needs connector sign-in",
          },
        })}
      />,
    );

    expect(html).toContain("Document Sync");
    expect(html).toContain("Connects document workflows");
    expect(html).toContain("plugin-capability-description-wrap");
    expect(html).not.toContain('title="Connects document workflows');
    expect(html).toContain("Reconnect");
    expect(html).toContain("Details");
    expect(html).toContain("Open source");
    expect(html).toContain("Needs auth");
    expect(html).toContain("Auth Expired");
    expect(html).toContain("Alice Docs");
    expect(html).toContain("alice@example.test");
    expect(html).toContain("Capability Details");
    expect(html).toContain("Needs connector sign-in");
    expect(html).toContain("OAuth token expired");
    expect(html).toContain("Generated capability management starts");
    expect(html).toContain("Validate");
    expect(html).toContain("Plan update");
    expect(html).toContain("Plan removal");
  });

  it("formats capability description popover metadata from plugin, status, source, and command fields", () => {
    const capability = {
      ...generatedAppCapability(),
      kind: "mcp-tool" as const,
      availability: "available" as const,
      serverName: "documents",
      toolName: "sync_documents",
      connectorId: undefined,
    };

    expect(pluginCapabilityDescriptionMetadata(capability)).toEqual([
      "Doc Tools",
      "Available",
      "MCP tool",
      "Codex workspace",
      "MCP documents",
      "Tool sync_documents",
    ]);
  });
});
