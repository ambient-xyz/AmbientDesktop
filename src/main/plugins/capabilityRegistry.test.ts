import { describe, expect, it } from "vitest";
import type { AmbientPluginAppAuthSummary, CodexPluginCatalog, PiPackageCatalog } from "../../shared/pluginTypes";
import { ambientCliCapabilityId, ambientCliRegistryPluginId, type AmbientCliPackageCatalog } from "../ambient-cli/ambientCliPackages";
import {
  buildAmbientPluginRegistry,
  getAmbientPluginCapabilityDiagnostics,
  listAmbientPluginRuntimeCapabilities,
  pluginMcpToolCapabilityId,
} from "./capabilityRegistry";

function codexCatalog(): CodexPluginCatalog {
  return {
    marketplaces: [".agents/plugins/marketplace.json"],
    importCandidates: [],
    errors: [],
    plugins: [
      {
        id: "marketplace:fake-app",
        name: "fake-app",
        version: "1.0.0",
        description: "Fake app plugin",
        marketplaceName: "Fixture",
        marketplacePath: ".agents/plugins/marketplace.json",
        rootPath: "/tmp/fake-app",
        sourceKind: "workspace",
        compatibilityTier: "partial",
        compatibilityNotes: [
          "Codex app connector metadata can be authorized through Ambient when a matching provider is registered; connector operations remain gated on an Ambient connector bridge.",
        ],
        supportLabels: [],
        skills: [],
        mcpServers: [{ name: "records", command: "node", args: ["server.js"], envKeys: [] }],
        appsPath: "/tmp/fake-app/.app.json",
        apps: [{ name: "fake", connectorId: "fake.oauth.records", path: "/tmp/fake-app/.app.json" }],
        imported: true,
        enabled: true,
        trusted: false,
        errors: [],
      },
    ],
  };
}

function emptyPiCatalog(): PiPackageCatalog {
  return { packages: [], errors: [], sourceNotes: [] };
}

function emptyCodexCatalog(): CodexPluginCatalog {
  return { marketplaces: [], importCandidates: [], errors: [], plugins: [] };
}

describe("buildAmbientPluginRegistry app auth mapping", () => {
  it("includes Ambient built-in desktop tools as first-class capabilities", () => {
    const registry = buildAmbientPluginRegistry({ codexCatalog: emptyCodexCatalog(), piPackageCatalog: emptyPiCatalog() });

    expect(registry.plugins.find((plugin) => plugin.sourcePluginId === "ambient-built-in:desktop-tools")).toMatchObject({
      name: "ambient-desktop-tools",
      displayName: "Ambient Desktop Tools",
      sourceKind: "ambient-built-in",
      installState: "installed",
      enabled: true,
      trusted: true,
      compatibilityTier: "supported",
    });
    expect(registry.sources).toContain("Ambient built-ins");
    expect(registry.sourceNotes.join("\n")).toContain("Ambient built-in tools");
    expect(registry.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ambient-built-in:desktop-tools:desktop-tool:bash",
          pluginId: "ambient-built-in:desktop-tools",
          kind: "tool",
          name: "bash",
          sourceKind: "ambient-built-in",
          runtimeSupport: ["chat", "workflow", "automation"],
          availability: "available",
          trusted: true,
        }),
        expect.objectContaining({
          id: "ambient-built-in:desktop-tools:desktop-tool:file_read",
          name: "file_read",
          runtimeSupport: ["workflow", "automation"],
        }),
        expect.objectContaining({
          id: "ambient-built-in:desktop-tools:desktop-tool:google_workspace_status",
          name: "google_workspace_status",
          runtimeSupport: ["chat", "ui"],
          availability: "available",
        }),
      ]),
    );
  });

  it("marks app capabilities available when plugin auth has an available account", () => {
    const appAuth = new Map<string, AmbientPluginAppAuthSummary>([
      [
        "fake.oauth.records",
        {
          connectorId: "fake.oauth.records",
          providerId: "fake.oauth",
          providerLabel: "Fake OAuth Records",
          status: "available",
          accounts: [
            {
              id: "fake.oauth:fake-user",
              accountId: "fake-user",
              label: "Fake User",
              email: "fake-user@example.test",
              status: "available",
              grantedScopes: ["fake.records.read"],
              connectedAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    ]);

    const registry = buildAmbientPluginRegistry({ codexCatalog: codexCatalog(), piPackageCatalog: emptyPiCatalog(), appAuth });
    const app = registry.capabilities.find((capability) => capability.kind === "app");

    expect(app).toMatchObject({
      availability: "available",
      connectorId: "fake.oauth.records",
      authStatus: "available",
      authProviderId: "fake.oauth",
      authAccountCount: 1,
      authAccounts: [expect.objectContaining({ email: "fake-user@example.test" })],
    });
  });

  it("marks app capabilities auth-required when no provider/account can authorize them", () => {
    const registry = buildAmbientPluginRegistry({ codexCatalog: codexCatalog(), piPackageCatalog: emptyPiCatalog() });
    const app = registry.capabilities.find((capability) => capability.kind === "app");

    expect(app).toMatchObject({
      availability: "auth-required",
      authStatus: "unavailable",
      authAccountCount: 0,
      availabilityReason: "Codex app descriptor is parsed, but no Ambient auth provider is registered yet.",
    });
  });

  it("maps Ambient-curated Codex marketplace entries to a first-class registry source kind", () => {
    const catalog = codexCatalog();
    catalog.plugins = [];
    catalog.importCandidates = [
      {
        ...codexCatalog().plugins[0]!,
        id: "remote-marketplace:curated",
        name: "curated-fixture",
        marketplaceKind: "ambient-curated",
        marketplaceName: "Ambient Curated Marketplace",
        sourceKind: "remote-marketplace",
        imported: false,
        enabled: false,
        trusted: false,
        sourceChecksum: `sha256:${"a".repeat(64)}`,
        capabilitySummary: ["Curated fixture"],
      },
    ];

    const registry = buildAmbientPluginRegistry({ codexCatalog: catalog, piPackageCatalog: emptyPiCatalog() });

    expect(registry.plugins.find((plugin) => plugin.name === "curated-fixture")).toMatchObject({
      sourceKind: "codex-ambient-curated",
      sourceLabel: "Ambient Curated Marketplace",
      installState: "importable",
    });
    expect(registry.capabilities.find((capability) => capability.pluginName === "curated-fixture")).toMatchObject({
      sourceKind: "codex-ambient-curated",
      availability: "disabled",
    });
  });

  it("blocks MCP capabilities when plugin package dependencies need explicit install", () => {
    const catalog = codexCatalog();
    const plugin = catalog.plugins[0]!;
    catalog.plugins = [
      {
        ...plugin,
        trusted: true,
        dependencyStatus: {
          packageJsonPath: "/tmp/fake-app/package.json",
          manager: "npm",
          installCommand: ["npm", "install", "--ignore-scripts"],
          required: true,
          installed: false,
          missingPackages: ["fixture-runtime"],
          reason: "Plugin MCP dependencies are not installed: fixture-runtime.",
        },
      },
    ];
    const registry = buildAmbientPluginRegistry({ codexCatalog: catalog, piPackageCatalog: emptyPiCatalog() });
    const mcp = registry.capabilities.find((capability) => capability.kind === "mcp-tool");

    expect(mcp).toMatchObject({
      availability: "disabled",
      availabilityReason: "Plugin MCP dependencies are not installed: fixture-runtime.",
      diagnostics: expect.arrayContaining(["Plugin MCP dependencies are not installed: fixture-runtime."]),
    });
  });

  it("maps Pi package resources into disabled runtime-neutral capabilities", () => {
    const registry = buildAmbientPluginRegistry({
      codexCatalog: emptyCodexCatalog(),
      piPackageCatalog: {
        packages: [
          {
            id: "ambient-workspace:/workspace/plugins/pi-fixture/package.json:./plugins/pi-fixture",
            name: "ambient-pi-fixture",
            version: "0.1.0",
            sourceKind: "ambient-workspace",
            sourceLabel: "Ambient workspace Pi packages",
            packageSpec: "./plugins/pi-fixture",
            installed: true,
            installScope: "workspace",
            keywords: ["pi-package"],
            resourceCounts: { extension: 1, skill: 1, prompt: 1, theme: 1 },
            resources: [
              { kind: "extension", path: "./extensions/index.ts", source: "manifest" },
              { kind: "skill", path: "./skills/workspace-review", source: "manifest" },
              { kind: "prompt", path: "./prompts/review.md", source: "manifest" },
              { kind: "theme", path: "./themes/ambient.json", source: "manifest" },
            ],
            compatibilityTier: "partial",
            compatibilityNotes: ["Installed in Ambient-managed Pi package state."],
            supportLabels: ["Ambient installed", "Execution disabled"],
            errors: [],
          },
        ],
        errors: [],
        sourceNotes: [],
      },
    });

    const piPlugin = registry.plugins.find((plugin) => plugin.name === "ambient-pi-fixture");
    expect(piPlugin).toMatchObject({
      name: "ambient-pi-fixture",
      sourceKind: "pi-ambient-workspace",
      installState: "installed",
      enabled: false,
      trusted: false,
      capabilityCount: 4,
    });

    const byName = new Map(registry.capabilities.map((capability) => [capability.name, capability]));
    expect(byName.get("./extensions/index.ts")).toMatchObject({
      kind: "runtime-extension",
      runtimeSupport: ["chat"],
      availability: "disabled",
      availabilityReason: "Pi extensions require trust and sandboxing before Ambient can load executable code.",
    });
    expect(byName.get("./skills/workspace-review")).toMatchObject({ kind: "skill", runtimeSupport: ["chat"] });
    expect(byName.get("./prompts/review.md")).toMatchObject({ kind: "prompt", runtimeSupport: ["chat", "ui"] });
    expect(byName.get("./themes/ambient.json")).toMatchObject({ kind: "theme", runtimeSupport: ["ui"] });
  });

  it("marks enabled declarative Pi package resources available while keeping extensions blocked", () => {
    const registry = buildAmbientPluginRegistry({
      codexCatalog: emptyCodexCatalog(),
      piPackageCatalog: {
        packages: [
          {
            id: "ambient-workspace:/workspace/plugins/pi-skills/package.json:./plugins/pi-skills",
            name: "ambient-pi-skills",
            sourceKind: "ambient-workspace",
            sourceLabel: "Ambient workspace Pi packages",
            packageSpec: "./plugins/pi-skills",
            installed: true,
            enabled: true,
            installScope: "workspace",
            keywords: ["pi-package"],
            resourceCounts: { extension: 0, skill: 1, prompt: 1, theme: 0 },
            resources: [
              { kind: "skill", path: "./skills/review", source: "manifest" },
              { kind: "prompt", path: "./prompts/review.md", source: "manifest" },
            ],
            compatibilityTier: "supported",
            compatibilityNotes: ["Enabled declarative resources."],
            supportLabels: ["Ambient installed", "Enabled"],
            errors: [],
          },
          {
            id: "ambient-workspace:/workspace/plugins/pi-extension/package.json:./plugins/pi-extension",
            name: "ambient-pi-extension",
            sourceKind: "ambient-workspace",
            sourceLabel: "Ambient workspace Pi packages",
            packageSpec: "./plugins/pi-extension",
            installed: true,
            enabled: false,
            installScope: "workspace",
            keywords: ["pi-package"],
            resourceCounts: { extension: 1, skill: 0, prompt: 0, theme: 0 },
            resources: [{ kind: "extension", path: "./extensions/index.ts", source: "manifest" }],
            compatibilityTier: "partial",
            compatibilityNotes: ["Extensions stay disabled."],
            supportLabels: ["Extensions (code)", "Execution disabled"],
            errors: [],
          },
        ],
        errors: [],
        sourceNotes: [],
      },
    });

    expect(registry.plugins.find((plugin) => plugin.name === "ambient-pi-skills")).toMatchObject({ enabled: true, trusted: true });
    expect(registry.capabilities.find((capability) => capability.name === "./skills/review")).toMatchObject({
      availability: "available",
      availabilityReason: "Declarative Pi resource is enabled without running package extension code.",
    });
    expect(registry.capabilities.find((capability) => capability.name === "./extensions/index.ts")).toMatchObject({
      availability: "disabled",
      trusted: false,
      availabilityReason: "Pi extensions require trust and sandboxing before Ambient can load executable code.",
    });
  });

  it("maps Ambient CLI package commands and skills into registry capabilities with health diagnostics", () => {
    const ambientCliCatalog: AmbientCliPackageCatalog = {
      packages: [
        {
          id: "ambient-cli:./.ambient/cli-packages/imported/json:ambient-json-cli",
          name: "ambient-json-cli",
          version: "0.1.0",
          description: "JSON helper CLI package.",
          rootPath: "/workspace/.ambient/cli-packages/imported/json",
          source: "./.ambient/cli-packages/imported/json",
          installed: true,
          skills: [{ name: "ambient-json-cli", description: "Use JSON CLI.", path: "/workspace/.ambient/cli-packages/imported/json/skills/json/SKILL.md" }],
          commands: [
            {
              name: "json-pick",
              description: "Pick a JSON field.",
              command: "node",
              args: ["./bin/json-pick.mjs"],
              cwd: "workspace",
              healthCheck: ["node", "./bin/json-pick.mjs", "health.json", "message"],
            },
          ],
          envRequirements: [],
          generated: {
            schemaVersion: "ambient-capability-builder-v1",
            status: "registered",
            goal: "Pick JSON fields",
            kind: "CLI tool",
            provider: "Node",
            outputArtifactTypes: ["JSON"],
            locality: "local",
            sourcePath: "./.ambient/capability-builder/packages/ambient-json-cli",
            lastValidatedAt: "2026-05-06T00:00:00.000Z",
            registeredAt: "2026-05-06T00:01:00.000Z",
            installedPackageId: "ambient-cli:generated",
            installedSource: "./.ambient/cli-packages/imported/json",
            refs: {
              latest: "abc123",
              lastRepair: "repair789",
              installed: "def456",
              lastValidated: "abc123",
              lastValidatedHash: "hash123",
            },
          },
          healthChecks: [
            {
              commandName: "json-pick",
              command: ["node", "./bin/json-pick.mjs", "health.json", "message"],
              cwd: "/workspace/.ambient/cli-packages/imported/json",
              passed: true,
              stdout: "healthy",
            },
          ],
          errors: [],
        },
      ],
      errors: [],
    };

    const registry = buildAmbientPluginRegistry({
      codexCatalog: emptyCodexCatalog(),
      piPackageCatalog: emptyPiCatalog(),
      ambientCliCatalog,
    });

    expect(registry.sources).toContain("Ambient CLI packages");
    expect(registry.plugins.find((plugin) => plugin.name === "ambient-json-cli")).toMatchObject({
      id: ambientCliRegistryPluginId(ambientCliCatalog.packages[0]!.id),
      sourceKind: "ambient-cli",
      sourceLabel: "Ambient CLI packages",
      installState: "installed",
      compatibilityTier: "supported",
      enabled: true,
      trusted: true,
      capabilityCount: 2,
      supportLabels: expect.arrayContaining(["Ambient CLI", "Approval required", "Generated", "Build registered", "Health checks", "Artifact JSON"]),
      diagnostics: expect.arrayContaining([
        "Generated by Ambient Capability Builder.",
        "Build status: registered",
        "Goal: Pick JSON fields",
        "Builder source: ./.ambient/capability-builder/packages/ambient-json-cli",
        "Last repair ref: repair789",
        "Installed ref: def456",
      ]),
      generated: expect.objectContaining({
        schemaVersion: "ambient-capability-builder-v1",
        status: "registered",
        sourcePath: "./.ambient/capability-builder/packages/ambient-json-cli",
        refs: expect.objectContaining({ installed: "def456", lastRepair: "repair789", lastValidatedHash: "hash123" }),
      }),
    });
    expect(registry.capabilities.find((capability) => capability.name === "json-pick")).toMatchObject({
      id: ambientCliCapabilityId(ambientCliCatalog.packages[0]!.id, "tool", "json-pick"),
      kind: "tool",
      sourceKind: "ambient-cli",
      runtimeSupport: ["chat", "workflow"],
      availability: "available",
      availabilityReason: "Ambient CLI package is installed; command execution still requires per-run approval.",
      toolName: "ambient_cli",
      supportLabels: expect.arrayContaining(["Generated", "Build registered", "Artifact JSON"]),
      diagnostics: expect.arrayContaining(["Generated by Ambient Capability Builder.", "Latest diagnostic health check passed."]),
      generated: expect.objectContaining({
        sourcePath: "./.ambient/capability-builder/packages/ambient-json-cli",
        refs: expect.objectContaining({ installed: "def456" }),
      }),
    });
    expect(registry.capabilities.find((capability) => capability.name === "ambient-json-cli")).toMatchObject({
      id: ambientCliCapabilityId(ambientCliCatalog.packages[0]!.id, "skill", ambientCliCatalog.packages[0]!.skills[0]!.path),
      kind: "skill",
      sourceKind: "ambient-cli",
      runtimeSupport: ["chat"],
      availability: "available",
    });
  });

  it("filters capabilities by runtime and returns capability diagnostics", () => {
    const registry = buildAmbientPluginRegistry({ codexCatalog: codexCatalog(), piPackageCatalog: emptyPiCatalog() });
    const workflowCapabilities = listAmbientPluginRuntimeCapabilities(registry, "workflow");

    expect(workflowCapabilities.map((capability) => capability.name)).toEqual(
      expect.arrayContaining(["bash", "file_read", "fake", "records"]),
    );
    expect(workflowCapabilities.find((capability) => capability.name === "browser_search")).toMatchObject({
      sourceKind: "ambient-built-in",
      availability: "available",
    });

    const app = registry.capabilities.find((capability) => capability.name === "fake");
    expect(app).toBeTruthy();
    expect(getAmbientPluginCapabilityDiagnostics(registry, app!.id)).toMatchObject({
      capabilityId: app!.id,
      capability: expect.objectContaining({ name: "fake" }),
      plugin: expect.objectContaining({ name: "fake-app" }),
      diagnostics: expect.arrayContaining([
        "Codex app connector metadata can be authorized through Ambient when a matching provider is registered; connector operations remain gated on an Ambient connector bridge.",
      ]),
      availabilityReason: "Codex app descriptor is parsed, but no Ambient auth provider is registered yet.",
    });

    expect(getAmbientPluginCapabilityDiagnostics(registry, "missing")).toMatchObject({
      capabilityId: "missing",
      diagnostics: ["Capability was not found: missing"],
    });
  });

  it("resolves workflow plugin tool capability ids through registry diagnostics", () => {
    const registry = buildAmbientPluginRegistry({ codexCatalog: codexCatalog(), piPackageCatalog: emptyPiCatalog() });
    const capabilityId = pluginMcpToolCapabilityId({
      pluginId: "marketplace:fake-app",
      serverName: "records",
      toolName: "search_records",
    });

    expect(getAmbientPluginCapabilityDiagnostics(registry, capabilityId)).toMatchObject({
      capabilityId,
      capability: expect.objectContaining({
        id: "marketplace:fake-app:mcp-server:records",
        name: "records",
        availability: "untrusted",
      }),
      plugin: expect.objectContaining({ name: "fake-app" }),
      diagnostics: expect.arrayContaining([
        "Workflow tool capability resolves through MCP server capability: marketplace:fake-app:mcp-server:records.",
      ]),
      availabilityReason: "Trust this plugin before running local MCP tools.",
    });
  });
});
