import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CodexMarketplaceSourceSummary, CodexPluginSummary } from "../../shared/pluginTypes";
import {
  RightPanelPluginMarketplacePane,
  type RightPanelPluginMarketplacePaneProps,
} from "./RightPanelPluginMarketplacePane";

function baseProps(overrides: Partial<RightPanelPluginMarketplacePaneProps> = {}): RightPanelPluginMarketplacePaneProps {
  return {
    marketplaceSources: [],
    importCandidates: [],
    importCodexPlugin: vi.fn(),
    ...overrides,
  };
}

function marketplaceSource(): CodexMarketplaceSourceSummary {
  return {
    id: "ambient-curated",
    label: "Ambient Curated",
    source: "https://example.test/marketplace.json",
    kind: "ambient-curated",
    removable: false,
    pluginCount: 2,
    signatureStatus: "verified",
    signatureKeyId: "key-1",
    contentChecksum: "sha256-marketplace",
  };
}

function plugin(overrides: Partial<CodexPluginSummary> = {}): CodexPluginSummary {
  return {
    id: "doc-tools",
    name: "doc-tools",
    displayName: "Doc Tools",
    version: "1.2.3",
    description: "Document workflow plugin.",
    marketplaceName: "Ambient Curated",
    marketplacePath: "https://example.test/marketplace.json",
    marketplaceKind: "ambient-curated",
    rootPath: "/tmp/plugins/doc-tools",
    sourceKind: "remote-marketplace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: ["chat", "workflow"],
    skills: [],
    mcpServers: [],
    sourceType: "git",
    sourceUrl: "https://example.test/doc-tools.git",
    sourceRef: "main",
    sourceSha: "abc123",
    sourceChecksum: "sha256-plugin",
    sourceBundleChecksum: "sha256-bundle",
    publisher: "Ambient",
    license: "MIT",
    ambientCompatibility: "Ambient Desktop",
    capabilitySummary: ["Document Sync"],
    authPolicy: "optional",
    enabled: true,
    trusted: true,
    errors: [],
    ...overrides,
  };
}

describe("RightPanelPluginMarketplacePane", () => {
  it("renders empty marketplace states", () => {
    const html = renderToStaticMarkup(<RightPanelPluginMarketplacePane {...baseProps()} />);

    expect(html).toContain("Ambient Curated Marketplace");
    expect(html).toContain("0 plugins");
    expect(html).toContain("No Ambient curated marketplace source is configured for this workspace.");
    expect(html).toContain("No curated plugins are available from the configured sources.");
  });

  it("renders curated, remote, and local cache import candidates", () => {
    const html = renderToStaticMarkup(
      <RightPanelPluginMarketplacePane
        {...baseProps({
          marketplaceSources: [marketplaceSource()],
          importCandidates: [
            plugin(),
            plugin({
              id: "remote-tool",
              name: "remote-tool",
              displayName: undefined,
              marketplaceName: "Remote Tools",
              marketplaceKind: "remote",
              sourceKind: "remote-marketplace",
              sourceUrl: "https://example.test/remote-tool.git",
            }),
            plugin({
              id: "cache-tool",
              name: "cache-tool",
              displayName: "Cache Tool",
              marketplaceName: "Local Cache",
              marketplaceKind: "workspace",
              sourceKind: "codex-cache",
              sourceUrl: undefined,
              sourcePath: "/tmp/cache/cache-tool",
            }),
          ],
        })}
      />,
    );

    expect(html).toContain("Ambient Curated");
    expect(html).toContain("2 plugins");
    expect(html).toContain("Signature verified");
    expect(html).toContain("key key-1");
    expect(html).toContain("sha256-marketplace");
    expect(html).toContain("Curated Plugins");
    expect(html).toContain("Doc Tools");
    expect(html).toContain("Document workflow plugin.");
    expect(html).toContain("Ambient Desktop");
    expect(html).toContain("capabilities: Document Sync");
    expect(html).toContain("Other Remote Marketplaces");
    expect(html).toContain("remote-tool");
    expect(html).toContain("Local Codex Cache");
    expect(html).toContain("Cache Tool");
    expect(html).toContain("path: /tmp/cache/cache-tool");
  });
});
