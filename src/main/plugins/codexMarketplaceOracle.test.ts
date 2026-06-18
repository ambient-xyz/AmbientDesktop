import { describe, expect, it } from "vitest";
import type { CodexPluginCatalog } from "../../shared/pluginTypes";
import {
  compareAmbientCatalogToHostedMarketplaces,
  codexMarketplaceProtocolMethods,
  inspectCodexHostedMarketplace,
  type CodexAppServerMarketplaceClient,
} from "./codexMarketplaceOracle";

const goldenIt = process.env.AMBIENT_CODEX_APP_SERVER_GOLDEN === "1" ? it : it.skip;

function catalog(): CodexPluginCatalog {
  return {
    marketplaces: [".agents/plugins/marketplace.json"],
    errors: [],
    plugins: [
      {
        id: ".agents/plugins/marketplace.json:documents",
        name: "documents",
        version: "1.0.0",
        description: "Documents plugin",
        marketplaceName: "Ambient Local Imports",
        marketplacePath: ".agents/plugins/marketplace.json",
        rootPath: "/tmp/documents",
        sourceKind: "workspace",
        compatibilityTier: "supported",
        compatibilityNotes: [],
        supportLabels: [],
        skills: [],
        mcpServers: [],
        enabled: true,
        trusted: true,
        errors: [],
      },
    ],
    importCandidates: [
      {
        id: "codex-cache:openai-curated/github/1.0.0",
        name: "github",
        version: "1.0.0",
        description: "GitHub plugin",
        marketplaceName: "Codex cache: openai-curated",
        marketplacePath: "~/.codex/plugins/cache",
        rootPath: "/tmp/github",
        sourceKind: "codex-cache",
        compatibilityTier: "partial",
        compatibilityNotes: [],
        supportLabels: [],
        skills: [],
        mcpServers: [],
        enabled: false,
        trusted: false,
        errors: [],
      },
    ],
  };
}

describe("inspectCodexHostedMarketplace", () => {
  it("returns a sidecar-required report when no app-server oracle is configured", async () => {
    const report = await inspectCodexHostedMarketplace(catalog(), "/workspace", {
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "sidecar-required",
      source: "ambient",
      checkedAt: "2026-01-01T00:00:00.000Z",
      ambientCandidateCount: 1,
      marketplaceCount: 0,
      pluginCount: 0,
    });
    expect(report.protocolMethods).toEqual(expect.arrayContaining(["plugin/list", "plugin/install", "marketplace/add"]));
    expect(report.message).toContain("sidecar-gated");
  });

  it("normalizes and compares plugin/list responses from a Codex app-server oracle", async () => {
    const client: CodexAppServerMarketplaceClient = {
      sourceLabel: "fake codex app-server",
      async initialize() {
        return { codexHome: "/Users/neo/.codex", platformFamily: "macos" };
      },
      async listPlugins(params) {
        expect(params).toEqual({ cwds: ["/workspace"] });
        return {
          featuredPluginIds: ["github@openai-curated"],
          marketplaceLoadErrors: [{ message: "optional marketplace failed" }],
          marketplaces: [
            {
              name: "openai-curated",
              interface: { displayName: "OpenAI Curated" },
              plugins: [
                { id: "github@openai-curated", name: "github", installed: false, enabled: false, source: { type: "remote" } },
                { plugin: { id: "documents@openai-primary-runtime", name: "documents", interface: { displayName: "Documents" } }, installed: true, enabled: true },
                { id: "slack@openai-curated", plugin: { authPolicy: "ON_INSTALL" }, summary: { interface: { displayName: "Slack" } } },
              ],
            },
          ],
        };
      },
      async readPlugin(params) {
        if (params.pluginName === "github") {
          expect(params).toEqual({ pluginName: "github", remoteMarketplaceName: "openai-curated" });
          return {
            plugin: {
              id: "github@openai-curated",
              summary: { name: "github", interface: { displayName: "GitHub" } },
              skills: [{ name: "gh-address-comments" }],
              mcpServers: [{ name: "github" }],
              apps: [{ name: "github" }],
            },
          };
        }
        if (params.pluginName === "documents") {
          expect(params).toEqual({ pluginName: "documents", remoteMarketplaceName: "openai-curated" });
          return {
            plugin: {
              id: "documents@openai-primary-runtime",
              summary: { name: "documents", interface: { displayName: "Documents" } },
              skills: [{ name: "documents" }],
            },
          };
        }
        throw new Error(`unexpected read probe ${String(params.pluginName)}`);
      },
    };

    const report = await inspectCodexHostedMarketplace(catalog(), "/workspace", {
      client,
      now: () => new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(report).toMatchObject({
      status: "available",
      source: "codex-app-server",
      command: "fake codex app-server",
      codexHome: "/Users/neo/.codex",
      platformFamily: "macos",
      marketplaceCount: 1,
      pluginCount: 3,
      ambientCandidateCount: 1,
      matchedPluginCount: 2,
      readComparisonCount: 2,
      missingInAmbient: ["slack"],
      extraInAmbient: [],
      marketplaceLoadErrors: ["optional marketplace failed"],
    });
    expect(report.marketplaces[0]?.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "github", marketplaceKind: "hosted-codex", sourceType: "remote" }),
        expect.objectContaining({ name: "documents", displayName: "Documents", installed: true }),
        expect.objectContaining({ name: "slack", displayName: "Slack", authPolicy: "ON_INSTALL" }),
      ]),
    );
    expect(report.marketplaces[0]).toMatchObject({
      marketplaceKind: "hosted-codex",
      displayName: "OpenAI Curated",
    });
    expect(report.readComparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pluginName: "github", marketplaceName: "openai-curated", status: "matched", displayName: "GitHub", skillCount: 1, mcpServerCount: 1, appCount: 1 }),
        expect.objectContaining({ pluginName: "documents", marketplaceName: "openai-curated", status: "matched", displayName: "Documents", skillCount: 1 }),
      ]),
    );
  });

  it("records plugin/read probe errors without failing the hosted marketplace report", async () => {
    const client: CodexAppServerMarketplaceClient = {
      sourceLabel: "partial codex app-server",
      async initialize() {
        return {};
      },
      async listPlugins() {
        return {
          marketplaces: [
            {
              name: "openai-curated",
              plugins: [{ id: "github@openai-curated", name: "github" }],
            },
          ],
        };
      },
      async readPlugin() {
        throw new Error("plugin detail unavailable");
      },
    };

    const report = await inspectCodexHostedMarketplace(catalog(), "/workspace", { client });

    expect(report).toMatchObject({
      status: "available",
      readComparisonCount: 1,
      readComparisons: [
        {
          pluginName: "github",
          marketplaceName: "openai-curated",
          status: "error",
          error: "plugin detail unavailable",
        },
      ],
    });
  });

  it("reports app-server oracle errors without losing local marketplace support", async () => {
    const client: CodexAppServerMarketplaceClient = {
      sourceLabel: "broken codex app-server",
      async initialize() {
        return {};
      },
      async listPlugins() {
        throw new Error("login required");
      },
    };

    const report = await inspectCodexHostedMarketplace(catalog(), "/workspace", { client });

    expect(report).toMatchObject({
      status: "error",
      source: "codex-app-server",
      command: "broken codex app-server",
      message: "Codex app-server marketplace oracle failed: login required",
      ambientCandidateCount: 1,
      marketplaceCount: 0,
    });
    expect(report.notes.join("\n")).toContain("Local, cache, and Git-backed marketplace support");
  });

  goldenIt("matches the real Codex app-server plugin/list protocol", async () => {
    const previousOracle = process.env.AMBIENT_CODEX_APP_SERVER_ORACLE;
    process.env.AMBIENT_CODEX_APP_SERVER_ORACLE = "1";
    try {
      const report = await inspectCodexHostedMarketplace(catalog(), process.cwd());

      expect(report).toMatchObject({
        status: "available",
        source: "codex-app-server",
        protocolMethods: codexMarketplaceProtocolMethods,
      });
      expect(report.marketplaceCount).toBeGreaterThan(0);
      expect(report.pluginCount).toBeGreaterThan(0);
      expect(report.marketplaces[0]).toMatchObject({
        name: expect.any(String),
        pluginCount: expect.any(Number),
        plugins: expect.any(Array),
      });
    } finally {
      if (previousOracle === undefined) delete process.env.AMBIENT_CODEX_APP_SERVER_ORACLE;
      else process.env.AMBIENT_CODEX_APP_SERVER_ORACLE = previousOracle;
    }
  }, 30_000);
});

describe("compareAmbientCatalogToHostedMarketplaces", () => {
  it("compares by plugin name across Ambient and hosted marketplace responses", () => {
    const comparison = compareAmbientCatalogToHostedMarketplaces(catalog(), [
      {
        name: "openai-curated",
        marketplaceKind: "hosted-codex",
        pluginCount: 2,
        plugins: [
          { name: "github", marketplaceName: "openai-curated", marketplaceKind: "hosted-codex" },
          { name: "gmail", marketplaceName: "openai-curated", marketplaceKind: "hosted-codex" },
        ],
      },
    ]);

    expect(comparison).toEqual({
      ambientCandidateCount: 1,
      matchedPluginCount: 1,
      missingInAmbient: ["gmail"],
      extraInAmbient: [],
    });
  });
});
