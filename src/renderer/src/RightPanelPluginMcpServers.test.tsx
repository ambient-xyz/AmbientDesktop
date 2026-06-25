import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult } from "../../shared/pluginTypes";
import { RightPanelPluginMcpServers } from "./RightPanelPluginMcpServers";

describe("RightPanelPluginMcpServers", () => {
  it("renders search, installed server, registry result, and selected preview sections", () => {
    const html = renderToStaticMarkup(
      <RightPanelPluginMcpServers
        query="context7"
        installedServers={[installedServer()]}
        registryResults={[registryResult()]}
        selectedPreview={installPreview()}
        runtimeReady={true}
        runtimeBusy={false}
        onQueryChange={vi.fn()}
        onSearchRegistry={vi.fn()}
        onLoadInstalledServers={vi.fn()}
        onAcceptToolReview={vi.fn()}
        onUninstallServer={vi.fn()}
        onDescribeServer={vi.fn()}
        onInstallServer={vi.fn()}
      />,
    );

    expect(html).toContain("ToolHive Registry");
    expect(html).toContain('value="context7"');
    expect(html).toContain("Installed MCP Servers");
    expect(html).toContain("context7");
    expect(html).toContain("ambient-context7");
    expect(html).toContain("Review current tools");
    expect(html).toContain("Uninstall");
    expect(html).toContain("Registry Results");
    expect(html).toContain("Context7 Registry");
    expect(html).toContain("Review");
    expect(html).toContain("https://github.com/upstash/context7");
    expect(html).toContain("Context7 Preview");
    expect(html).toContain("streamable-http");
    expect(html).toContain("Install");
    expect(html).toContain("resolve-library-id");
  });

  it("disables selected preview install when the isolated runtime is not ready", () => {
    const html = renderToStaticMarkup(
      <RightPanelPluginMcpServers
        query="context7"
        installedServers={[]}
        registryResults={[]}
        selectedPreview={installPreview()}
        runtimeReady={false}
        runtimeBusy={false}
        onQueryChange={vi.fn()}
        onSearchRegistry={vi.fn()}
        onLoadInstalledServers={vi.fn()}
        onAcceptToolReview={vi.fn()}
        onUninstallServer={vi.fn()}
        onDescribeServer={vi.fn()}
        onInstallServer={vi.fn()}
      />,
    );

    expect(html).toContain("No Ambient-managed ToolHive MCP servers are installed.");
    expect(html).toContain("Search the ToolHive registry to review installable MCP servers.");
    expect(html).toContain("Runtime needed");
    expect(html).toContain("Set up the isolated Docker/Podman runtime before installing MCP servers.");
  });
});

function installedServer(): AmbientMcpInstalledServerSummary {
  return {
    serverId: "context7",
    workloadName: "ambient-context7",
    registrySource: "toolhive",
    permissionProfilePath: "/tmp/context7-profile.json",
    permissionProfileSha256: "profile-sha",
    createdAt: "2026-06-23T12:00:00.000Z",
    updatedAt: "2026-06-23T12:05:00.000Z",
    workloadStatus: "running",
    endpoint: "http://127.0.0.1:4000/mcp",
    lastKnownToolCount: 2,
    lastKnownToolDescriptorHash: "abcdef1234567890",
    toolDescriptorReviewStatus: "needs-review",
    toolDescriptorReviewReason: "Tool descriptors changed.",
    toolPolicyCount: 3,
    hiddenToolPolicyCount: 1,
    blockedToolPolicyCount: 1,
  };
}

function registryResult(): AmbientMcpServerSearchResult {
  return {
    serverId: "context7",
    title: "Context7 Registry",
    description: "Documentation lookup tools.",
    status: "active",
    tier: "community",
    transport: "streamable-http",
    repositoryUrl: "https://github.com/upstash/context7",
    tags: ["docs", "search"],
    tools: ["resolve-library-id", "get-library-docs"],
    installed: false,
    riskHints: ["network"],
  };
}

function installPreview(): AmbientMcpInstallPreview {
  return {
    serverId: "context7",
    title: "Context7 Preview",
    summary: "Install Context7 through ToolHive.",
    sourceSummary: "ToolHive registry",
    runtimeSummary: "streamable-http",
    permissionSummary: "workspace profile",
    secretSummary: "no secrets",
    validationSummary: "valid",
    blockers: [],
    warnings: ["Review network access."],
    riskLevel: "medium",
    riskReasons: ["Network access"],
    runPlan: {
      serverId: "context7",
      workloadName: "ambient-context7",
      group: "ambient",
      isolateNetwork: false,
      transport: "streamable-http",
      permissionProfilePath: "/tmp/context7-profile.json",
      sourceRef: "toolhive:context7",
    },
    permissionProfile: {
      path: "/tmp/context7-profile.json",
      sha256: "profile-sha",
    },
    expectedTools: ["resolve-library-id", "get-library-docs"],
    reviewText: "Review Context7 before installing.",
  };
}
