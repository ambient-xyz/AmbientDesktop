import { describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  addCodexMarketplaceSource,
  commitCodexPluginInstallSource,
  discoverCodexPlugins,
  importCodexPluginFromCache,
  previewCodexPluginInstallSource,
  removeCodexMarketplaceSource,
  uninstallCodexPlugin,
} from "./codexPlugins";

const execFileAsync = promisify(execFile);

describe("discoverCodexPlugins", () => {
  const curatedChecksum = `sha256:${"c".repeat(64)}`;

  it("loads repo marketplace fixture plugins with skills and MCP servers", async () => {
    const catalog = await withPluginCache("0", () => discoverCodexPlugins(process.cwd()));
    const plugin = catalog.plugins.find((item) => item.name === "ambient-fixture");

    expect(catalog.marketplaces).toContain(".agents/plugins/marketplace.json");
    expect(plugin).toMatchObject({
      name: "ambient-fixture",
      version: "0.1.0",
      displayName: "Ambient Fixture",
      category: "Productivity",
      sourceKind: "workspace",
      compatibilityTier: "supported",
      authPolicy: "ON_INSTALL",
      errors: [],
    });
    expect(plugin?.supportLabels).toEqual(expect.arrayContaining(["Auth policy"]));
    expect(plugin?.skills).toEqual([
      expect.objectContaining({
        name: "workspace-inspector",
        description: "Inspect a workspace and summarize notable files for fixture-plugin tests.",
      }),
    ]);
    expect(plugin?.mcpServers).toEqual([
      {
        name: "ambient-fixture",
        command: "node",
        args: ["./scripts/fixture-mcp.js"],
        envKeys: ["AMBIENT_FIXTURE"],
      },
    ]);
    expect(catalog.importCandidates).toEqual([]);
  });

  it("discovers Codex plugin MCP metadata without starting plugin server code", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-codex-no-exec-"));
    const markerPath = join(workspace, "mcp-ran.txt");
    try {
      const pluginRoot = join(workspace, "plugins", "no-exec");
      await mkdir(join(workspace, ".agents", "plugins"), { recursive: true });
      await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
      await writeFile(
        join(workspace, ".agents", "plugins", "marketplace.json"),
        `${JSON.stringify(
          {
            name: "no-exec-marketplace",
            plugins: [
              {
                name: "no-exec",
                source: { source: "local", path: "./plugins/no-exec" },
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(pluginRoot, ".codex-plugin", "plugin.json"),
        `${JSON.stringify(
          {
            name: "no-exec",
            version: "0.1.0",
            description: "Discovery must not execute this MCP server.",
            mcpServers: "./.mcp.json",
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(pluginRoot, ".mcp.json"),
        `${JSON.stringify(
          {
            mcpServers: {
              "no-exec-server": {
                command: "node",
                args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "executed")`],
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace));

      expect(catalog.plugins.find((plugin) => plugin.name === "no-exec")).toMatchObject({
        compatibilityTier: "supported",
        mcpServers: [{ name: "no-exec-server", command: "node", args: expect.any(Array), envKeys: [] }],
      });
      await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discovers local Codex cache import candidates with compatibility tiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-codex-cache-"));
    try {
      await seedCachePlugin(root, "openai-curated", "github", "b092358b", {
        name: "github",
        version: "0.1.0",
        description: "GitHub plugin",
        skills: "./skills/",
        apps: "./.app.json",
        interface: { displayName: "GitHub", shortDescription: "Triage PRs", category: "Coding" },
      });

      const catalog = await withPluginCache(root, () => discoverCodexPlugins(process.cwd()));
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "github");

      expect(candidate).toMatchObject({
        displayName: "GitHub",
        sourceKind: "codex-cache",
        compatibilityTier: "partial",
        marketplaceName: "Codex cache: openai-curated",
        enabled: false,
        trusted: false,
      });
      expect(candidate?.compatibilityNotes).toContain(
        "Codex app connector metadata can be authorized through Ambient when a matching provider is registered; connector operations remain gated on an Ambient connector bridge.",
      );
      expect(candidate?.supportLabels).toEqual(expect.arrayContaining(["GitHub skills", "PR/issue workflows", "Connector auth"]));
      expect(candidate?.skills).toHaveLength(1);
      expect(candidate?.apps).toEqual([{ name: "github", connectorId: "connector_github", path: expect.stringContaining(".app.json") }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("treats app-only Codex plugins as auth-manageable partial compatibility", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-codex-cache-"));
    try {
      await seedCachePlugin(root, "openai-curated", "app-only", "0.1.0", {
        name: "app-only",
        version: "0.1.0",
        description: "App-only plugin",
        apps: "./.app.json",
        interface: { displayName: "App Only", shortDescription: "Connector auth only", category: "Productivity" },
      });

      const catalog = await withPluginCache(root, () => discoverCodexPlugins(process.cwd()));
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "app-only");

      expect(candidate).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["Connector auth"]),
        apps: [{ name: "app-only", connectorId: "connector_app-only", path: expect.stringContaining(".app.json") }],
      });
      expect(candidate?.compatibilityNotes.join("\n")).toContain("connector operations remain gated");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds specific compatibility profiles for common Codex cache plugins", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-codex-cache-"));
    try {
      await seedCachePlugin(root, "openai-curated", "gmail", "b092358b", {
        name: "gmail",
        version: "0.1.0",
        description: "Gmail plugin",
        skills: "./skills/",
        apps: "./.app.json",
        interface: { displayName: "Gmail", shortDescription: "Inbox workflows", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-curated", "google-calendar", "b092358b", {
        name: "google-calendar",
        version: "1.2.0",
        description: "Google Calendar plugin",
        skills: "./skills/",
        apps: "./.app.json",
        interface: { displayName: "Google Calendar", shortDescription: "Calendar workflows", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-curated", "google-drive", "b092358b", {
        name: "google-drive",
        version: "0.1.0",
        description: "Google Drive plugin",
        skills: "./skills/",
        apps: "./.app.json",
        interface: { displayName: "Google Drive", shortDescription: "Drive workflows", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-curated", "slack", "b092358b", {
        name: "slack",
        version: "0.1.0",
        description: "Slack plugin",
        skills: "./skills/",
        apps: "./.app.json",
        interface: { displayName: "Slack", shortDescription: "Slack workflows", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-primary-runtime", "documents", "26.426.12240", {
        name: "documents",
        version: "26.426.12240",
        description: "Documents plugin",
        skills: "./skills/",
        interface: { displayName: "Documents", shortDescription: "Create documents", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-primary-runtime", "spreadsheets", "26.426.12240", {
        name: "spreadsheets",
        version: "26.426.12240",
        description: "Spreadsheets plugin",
        skills: "./skills/",
        interface: { displayName: "Spreadsheets", shortDescription: "Create spreadsheets", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-primary-runtime", "presentations", "26.426.12240", {
        name: "presentations",
        version: "26.426.12240",
        description: "Presentations plugin",
        skills: "./skills/",
        interface: { displayName: "Presentations", shortDescription: "Create presentations", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-bundled", "browser-use", "0.1.0-alpha1", {
        name: "browser-use",
        version: "0.1.0-alpha1",
        description: "Browser Use plugin",
        skills: "./skills/",
        interface: { displayName: "Browser Use", shortDescription: "Control browser", category: "Engineering" },
      });
      await seedCachePlugin(root, "openai-bundled", "computer-use", "1.0.758", {
        name: "computer-use",
        version: "1.0.758",
        description: "Computer Use plugin",
        mcpServers: "./.mcp.json",
        interface: { displayName: "Computer Use", shortDescription: "Control desktop", category: "Productivity" },
      });
      await seedCachePlugin(root, "openai-bundled", "latex-tectonic", "0.1.0", {
        name: "latex-tectonic",
        version: "0.1.0",
        description: "LaTeX Tectonic plugin",
        skills: "./skills/",
        interface: { displayName: "LaTeX Tectonic", shortDescription: "Compile LaTeX", category: "Engineering" },
      });

      const catalog = await withPluginCache(root, () => discoverCodexPlugins(process.cwd()));
      const byName = new Map(catalog.importCandidates.map((plugin) => [plugin.name, plugin]));

      expect(byName.get("gmail")).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["Gmail skills", "Inbox workflows", "Connector auth"]),
      });
      expect(byName.get("google-calendar")).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["Calendar skills", "Scheduling workflows", "Connector auth"]),
      });
      expect(byName.get("google-drive")).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["Drive skills", "Docs/Sheets/Slides workflows", "Connector auth"]),
      });
      expect(byName.get("slack")).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["Slack skills", "Team communication workflows", "Connector auth"]),
      });
      expect(byName.get("documents")).toMatchObject({
        compatibilityTier: "supported",
        supportLabels: expect.arrayContaining(["Document skills", "Local artifact workflow"]),
      });
      expect(byName.get("spreadsheets")).toMatchObject({
        compatibilityTier: "supported",
        supportLabels: expect.arrayContaining(["Spreadsheet skills", "Local artifact workflow"]),
      });
      expect(byName.get("presentations")).toMatchObject({
        compatibilityTier: "supported",
        supportLabels: expect.arrayContaining(["Presentation skills", "Local artifact workflow"]),
      });
      expect(byName.get("browser-use")).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["Ambient Browser adapter", "Browser skill bridge"]),
      });
      expect(byName.get("browser-use")?.compatibilityNotes.join("\n")).toContain("built-in Browser tools");
      expect(byName.get("computer-use")).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["Native MCP helper", "High-trust desktop control", "macOS gated"]),
      });
      expect(byName.get("computer-use")?.mcpServers).toEqual([
        {
          name: "computer-use",
          command: "./Codex Computer Use.app/Contents/MacOS/helper",
          args: ["mcp"],
          envKeys: [],
        },
      ]);
      expect(byName.get("latex-tectonic")).toMatchObject({
        compatibilityTier: "partial",
        supportLabels: expect.arrayContaining(["LaTeX skills", "Bundled binary", "Execution policy required"]),
      });
      expect(byName.get("latex-tectonic")?.compatibilityNotes.join("\n")).toContain("bundled Tectonic executable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("marks MCP plugin package dependencies as requiring explicit install", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-codex-cache-"));
    try {
      await seedCachePlugin(root, "openai-curated", "needs-deps", "0.1.0", {
        name: "needs-deps",
        version: "0.1.0",
        description: "Plugin with MCP package dependencies",
        mcpServers: "./.mcp.json",
      });
      await writeFile(
        join(root, "openai-curated", "needs-deps", "0.1.0", "package.json"),
        `${JSON.stringify({ dependencies: { "fixture-runtime": "1.0.0" }, devDependencies: { "@fixture/dev-runtime": "1.0.0" } }, null, 2)}\n`,
        "utf8",
      );

      const catalog = await withPluginCache(root, () => discoverCodexPlugins(process.cwd()));
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "needs-deps");

      expect(candidate).toMatchObject({
        compatibilityTier: "partial",
        dependencyStatus: {
          manager: "npm",
          installCommand: ["npm", "install", "--ignore-scripts"],
          required: true,
          installed: false,
          missingPackages: ["@fixture/dev-runtime", "fixture-runtime"],
        },
      });
      expect(candidate?.compatibilityNotes.join("\n")).toContain("dependencies require explicit installation");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("imports a compatible Codex cache plugin into the workspace marketplace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const cache = await mkdtemp(join(tmpdir(), "ambient-codex-cache-"));
    try {
      await seedCachePlugin(cache, "openai-primary-runtime", "documents", "1.2.3", {
        name: "documents",
        version: "1.2.3",
        description: "Document plugin",
        skills: "./skills/",
        interface: { displayName: "Documents", shortDescription: "Render documents", category: "Productivity" },
      });
      const before = await withPluginCache(cache, () => discoverCodexPlugins(workspace));
      const candidate = before.importCandidates[0];

      await withPluginCache(cache, () => importCodexPluginFromCache(workspace, { pluginId: candidate.id }));

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins).toEqual([
        expect.objectContaining({
          name: "documents",
          source: expect.objectContaining({ source: "local", path: expect.stringContaining("./.ambient-codex/imported-plugins/documents-1.2.3") }),
        }),
      ]);

      const after = await withPluginCache(cache, () => discoverCodexPlugins(workspace));
      expect(after.plugins.find((plugin) => plugin.name === "documents")).toMatchObject({
        sourceKind: "workspace",
        compatibilityTier: "supported",
        displayName: "Documents",
      });
      expect(after.importCandidates.find((plugin) => plugin.name === "documents")).toMatchObject({
        imported: true,
        compatibilityTier: "supported",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("uninstalls an Ambient-imported Codex plugin from the workspace marketplace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const cache = await mkdtemp(join(tmpdir(), "ambient-codex-cache-"));
    try {
      await seedCachePlugin(cache, "openai-primary-runtime", "documents", "1.2.3", {
        name: "documents",
        version: "1.2.3",
        description: "Document plugin",
        skills: "./skills/",
        interface: { displayName: "Documents", shortDescription: "Render documents", category: "Productivity" },
      });
      const before = await withPluginCache(cache, () => discoverCodexPlugins(workspace));
      const candidate = before.importCandidates[0];
      const imported = await withPluginCache(cache, () => importCodexPluginFromCache(workspace, { pluginId: candidate.id }));
      await expect(stat(imported.rootPath)).resolves.toBeDefined();

      await withPluginCache(cache, () => uninstallCodexPlugin(workspace, { pluginId: imported.id }));

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins).toEqual([]);
      await expect(stat(imported.rootPath)).rejects.toMatchObject({ code: "ENOENT" });
      const after = await withPluginCache(cache, () => discoverCodexPlugins(workspace));
      expect(after.plugins.find((plugin) => plugin.name === "documents")).toBeUndefined();
      expect(after.importCandidates.find((plugin) => plugin.name === "documents")).toMatchObject({
        imported: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("discovers Git-backed remote marketplace candidates without loading remote code", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    try {
      const marketplacePath = await seedRemoteMarketplace(remoteRoot);

      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "remote-helper");

      expect(catalog.marketplaces).toContain("Remote: OpenAI Compatible Fixture");
      expect(candidate).toMatchObject({
        displayName: "Remote Helper",
        sourceKind: "remote-marketplace",
        compatibilityTier: "partial",
        marketplaceName: "OpenAI Compatible Fixture",
        sourceType: "git-subdir",
        sourceUrl: "https://github.com/example/codex-plugins.git",
        sourcePath: "./plugins/remote-helper",
        sourceRef: "main",
        authPolicy: "ON_INSTALL",
        imported: false,
        enabled: false,
        trusted: false,
      });
      expect(candidate?.supportLabels).toEqual(expect.arrayContaining(["Remote marketplace", "Ambient-owned registration", "Execution disabled", "Auth policy"]));
      expect(candidate?.skills).toEqual([]);
      expect(candidate?.mcpServers).toEqual([]);
      expect(candidate?.compatibilityNotes.join("\n")).toContain("does not fetch or run remote plugin code yet");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("registers a remote marketplace candidate in Ambient-owned workspace state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    try {
      const marketplacePath = await seedRemoteMarketplace(remoteRoot);
      const before = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = before.importCandidates.find((plugin) => plugin.name === "remote-helper");
      expect(candidate).toBeTruthy();

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath);

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins).toEqual([
        expect.objectContaining({
          name: "remote-helper",
          source: expect.objectContaining({
            source: "git-subdir",
            url: "https://github.com/example/codex-plugins.git",
            path: "./plugins/remote-helper",
            ref: "main",
          }),
          policy: { authentication: "ON_INSTALL" },
        }),
      ]);

      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        sourceKind: "remote-marketplace",
        compatibilityTier: "partial",
        imported: true,
        authPolicy: "ON_INSTALL",
        enabled: false,
      });
      expect(after.importCandidates.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        imported: true,
        compatibilityTier: "partial",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("preserves curated marketplace metadata for remote candidates and registrations", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    try {
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: {
          source: "remote-metadata",
          url: "https://plugins.example.test/remote-helper",
          path: "./plugins/remote-helper",
          ref: "fixture",
        },
        license: "MIT",
        publisher: "Ambient",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: "sha256:fixture-checksum",
            capabilitySummary: ["Skill-only artifact", "Connector metadata"],
            compatibility: {
              status: "Ambient verified fixture",
              tier: "supported",
              notes: ["License cleared for Ambient marketplace tests."],
              supportLabels: ["License cleared"],
            },
          },
        },
      });
      const before = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = before.importCandidates.find((plugin) => plugin.name === "remote-helper");

      expect(before.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Configured remote marketplace",
            source: marketplacePath,
            kind: "ambient-curated",
          }),
        ]),
      );
      expect(candidate).toMatchObject({
        sourceKind: "remote-marketplace",
        marketplaceKind: "ambient-curated",
        compatibilityTier: "partial",
        publisher: "Ambient",
        license: "MIT",
        sourceChecksum: "sha256:fixture-checksum",
        ambientCompatibility: "Ambient verified fixture",
        ambientCompatibilityTier: "supported",
        ambientCompatibilityNotes: ["License cleared for Ambient marketplace tests."],
        ambientSupportLabels: ["License cleared"],
        capabilitySummary: ["Skill-only artifact", "Connector metadata"],
        supportLabels: expect.arrayContaining(["Ambient curated", "License cleared"]),
      });
      expect(candidate?.compatibilityNotes.join("\n")).toContain("Ambient marketplace compatibility: Ambient verified fixture.");

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath);

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins[0]).toMatchObject({
        name: "remote-helper",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: "sha256:fixture-checksum",
            capabilitySummary: ["Skill-only artifact", "Connector metadata"],
            compatibility: {
              status: "Ambient verified fixture",
              tier: "supported",
              notes: ["License cleared for Ambient marketplace tests."],
              supportLabels: ["License cleared"],
            },
          },
        },
      });

      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        imported: true,
        marketplaceKind: "ambient-curated",
        publisher: "Ambient",
        license: "MIT",
        sourceChecksum: "sha256:fixture-checksum",
        ambientCompatibility: "Ambient verified fixture",
        capabilitySummary: ["Skill-only artifact", "Connector metadata"],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("loads configured Ambient curated marketplace sources as first-class non-removable sources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-curated-plugin-repo-"));
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const { stdout: commitStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sourceSha = String(commitStdout).trim();
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: {
          source: "git-subdir",
          url: repo,
          path: "./plugins/remote-helper",
          sha: sourceSha,
        },
        publisher: "Ambient",
        license: "MIT",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: curatedChecksum,
            capabilitySummary: ["Curated source fixture"],
            compatibility: {
              status: "Ambient curated source fixture",
              tier: "supported",
            },
          },
        },
      });

      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), "0", marketplacePath);
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "remote-helper");

      expect(catalog.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: `path:${marketplacePath}`,
            label: "Ambient curated marketplace",
            source: marketplacePath,
            kind: "ambient-curated",
            removable: false,
            pluginCount: 1,
            contentChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          }),
        ]),
      );
      expect(candidate).toMatchObject({
        marketplacePath: "Ambient curated marketplace",
        marketplaceKind: "ambient-curated",
        publisher: "Ambient",
        license: "MIT",
        sourceChecksum: curatedChecksum,
        sourceSha,
        capabilitySummary: ["Curated source fixture"],
      });

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), "0", marketplacePath);
      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), "0", marketplacePath);

      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        imported: true,
        marketplaceKind: "ambient-curated",
        sourceChecksum: curatedChecksum,
        sourceSha,
      });
      expect(after.importCandidates.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        imported: true,
        updateAvailable: false,
        marketplaceKind: "ambient-curated",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("browses the checked-in Ambient curated marketplace artifact", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const marketplacePath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.json");
    try {
      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), "0", marketplacePath, "0");
      const documents = catalog.importCandidates.find((plugin) => plugin.name === "documents-fixture");

      expect(catalog.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Ambient curated marketplace",
            source: marketplacePath,
            kind: "ambient-curated",
            removable: false,
            pluginCount: 6,
            contentChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            signatureStatus: "verified",
            signatureKeyId: "ambient-curated-fixture-2026-05",
            signatureGeneratedAt: "2026-05-01T00:00:00.000Z",
          }),
        ]),
      );
      expect(catalog.importCandidates.filter((plugin) => plugin.marketplaceKind === "ambient-curated")).toHaveLength(6);
      expect(documents).toMatchObject({
        sourceKind: "remote-marketplace",
        marketplaceKind: "ambient-curated",
        publisher: "Ambient",
        license: "MIT",
        sourceChecksum: `sha256:${"1".repeat(64)}`,
        sourceSha: "1111111111111111111111111111111111111111",
        capabilitySummary: ["Skill-only artifact", "Document workflow helper"],
      });

    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails closed when a required Ambient curated marketplace signature is missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-missing-signature-"));
    const fixtureMarketplacePath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.json");
    const marketplacePath = join(remoteRoot, "marketplace.json");
    try {
      await writeFile(marketplacePath, await readFile(fixtureMarketplacePath, "utf8"), "utf8");

      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), "0", marketplacePath, "0");

      expect(catalog.importCandidates.filter((plugin) => plugin.marketplaceKind === "ambient-curated")).toHaveLength(0);
      expect(catalog.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Ambient curated marketplace",
            kind: "ambient-curated",
            signatureStatus: "missing",
          }),
        ]),
      );
      expect(catalog.errors.join("\n")).toContain("Ambient curated marketplace signature is missing");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("rejects modified Ambient curated marketplace artifacts when the detached signature no longer matches", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-bad-signature-"));
    const fixtureMarketplacePath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.json");
    const fixtureSignaturePath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.signature.json");
    const marketplacePath = join(remoteRoot, "marketplace.json");
    const signaturePath = join(remoteRoot, "marketplace.signature.json");
    try {
      const marketplace = JSON.parse(await readFile(fixtureMarketplacePath, "utf8"));
      marketplace.plugins[0].version = "9.9.9";
      await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, "utf8");
      await writeFile(signaturePath, await readFile(fixtureSignaturePath, "utf8"), "utf8");

      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), "0", marketplacePath, "0");

      expect(catalog.importCandidates.filter((plugin) => plugin.marketplaceKind === "ambient-curated")).toHaveLength(0);
      expect(catalog.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Ambient curated marketplace",
            kind: "ambient-curated",
            signatureStatus: "invalid",
          }),
        ]),
      );
      expect(catalog.errors.join("\n")).toContain("signature checksum mismatch");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("loads the signed default Ambient curated marketplace URL when no explicit curated source is configured", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const defaultMarketplaceUrl = "https://updates.example.test/desktop/plugins/marketplace.json";
    const fixtureMarketplacePath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.json");
    const fixtureSignaturePath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.signature.json");
    const previousFetch = globalThis.fetch;
    const previousCache = process.env.AMBIENT_CODEX_PLUGIN_CACHE;
    const previousCuratedPath = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH;
    const previousCuratedUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL;
    const previousCuratedDefaultUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL;
    const previousCuratedDisableDefault = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DISABLE_DEFAULT;
    const previousCuratedAllowUnsigned = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED;
    const previousCuratedTrustFixtureKey = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY;
    const previousRemotePath = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH;
    const previousRemoteUrl = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL;
    const previousRemoteList = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES;
    try {
      const marketplaceContent = await readFile(fixtureMarketplacePath, "utf8");
      const signatureContent = await readFile(fixtureSignaturePath, "utf8");
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url === defaultMarketplaceUrl) return new Response(marketplaceContent, { status: 200 });
        if (url === "https://updates.example.test/desktop/plugins/marketplace.signature.json") return new Response(signatureContent, { status: 200 });
        return new Response("not found", { status: 404 });
      };
      process.env.AMBIENT_CODEX_PLUGIN_CACHE = "0";
      delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH;
      delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL;
      delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED;
      delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DISABLE_DEFAULT;
      process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL = defaultMarketplaceUrl;
      process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY = "1";
      process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH = "0";
      process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL = "0";
      process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES = "0";

      const catalog = await discoverCodexPlugins(workspace);

      expect(catalog.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: `url:${defaultMarketplaceUrl}`,
            source: defaultMarketplaceUrl,
            kind: "ambient-curated",
            removable: false,
            pluginCount: 6,
            signatureStatus: "verified",
          }),
        ]),
      );
      expect(catalog.importCandidates.filter((plugin) => plugin.marketplaceKind === "ambient-curated")).toHaveLength(6);
    } finally {
      globalThis.fetch = previousFetch;
      restoreEnv("AMBIENT_CODEX_PLUGIN_CACHE", previousCache);
      restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_PATH", previousCuratedPath);
      restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_URL", previousCuratedUrl);
      restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL", previousCuratedDefaultUrl);
      restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_DISABLE_DEFAULT", previousCuratedDisableDefault);
      restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED", previousCuratedAllowUnsigned);
      restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY", previousCuratedTrustFixtureKey);
      restoreEnv("AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH", previousRemotePath);
      restoreEnv("AMBIENT_CODEX_REMOTE_MARKETPLACE_URL", previousRemoteUrl);
      restoreEnv("AMBIENT_CODEX_REMOTE_MARKETPLACES", previousRemoteList);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects invalid configured Ambient curated marketplace sources without losing source diagnostics", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-invalid-curated-marketplace-"));
    try {
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        publisher: "Ambient",
        license: "MIT",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            capabilitySummary: ["Missing checksum fixture"],
            compatibility: {
              status: "Missing checksum",
              tier: "supported",
            },
          },
        },
      });

      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), "0", marketplacePath);

      expect(catalog.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Ambient curated marketplace",
            source: marketplacePath,
            kind: "ambient-curated",
            removable: false,
          }),
        ]),
      );
      expect(catalog.importCandidates.find((plugin) => plugin.name === "remote-helper")).toBeUndefined();
      expect(catalog.errors.join("\n")).toContain("Ambient curated marketplace validation failed");
      expect(catalog.errors.join("\n")).toContain("missing ambient.marketplace.checksum");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("marks curated remote marketplace candidates as updates when their checksum changes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    try {
      let marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: {
          source: "remote-metadata",
          url: "https://plugins.example.test/remote-helper",
          path: "./plugins/remote-helper",
          ref: "fixture",
        },
        ambient: {
          marketplace: {
            publisher: "Ambient",
            checksum: "sha256:first-fixture-checksum",
            compatibility: { status: "Ambient verified fixture", tier: "supported" },
          },
        },
      });
      const firstCandidate = (await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath)).importCandidates.find(
        (plugin) => plugin.name === "remote-helper",
      );
      expect(firstCandidate).toMatchObject({
        imported: false,
        updateAvailable: false,
        marketplaceKind: "ambient-curated",
        sourceChecksum: "sha256:first-fixture-checksum",
      });
      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: firstCandidate!.id }), marketplacePath);

      marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: {
          source: "remote-metadata",
          url: "https://plugins.example.test/remote-helper",
          path: "./plugins/remote-helper",
          ref: "fixture",
        },
        ambient: {
          marketplace: {
            publisher: "Ambient",
            checksum: "sha256:second-fixture-checksum",
            compatibility: { status: "Ambient verified fixture", tier: "supported" },
          },
        },
      });
      const updateCatalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const updateCandidate = updateCatalog.importCandidates.find((plugin) => plugin.name === "remote-helper");
      expect(updateCandidate).toMatchObject({
        imported: false,
        updateAvailable: true,
        marketplaceKind: "ambient-curated",
        sourceChecksum: "sha256:second-fixture-checksum",
      });

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: updateCandidate!.id }), marketplacePath);

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0]).toMatchObject({
        name: "remote-helper",
        ambient: { marketplace: { checksum: "sha256:second-fixture-checksum" } },
      });
      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        marketplaceKind: "ambient-curated",
        sourceChecksum: "sha256:second-fixture-checksum",
      });
      expect(after.importCandidates.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        imported: true,
        updateAvailable: false,
        sourceChecksum: "sha256:second-fixture-checksum",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("previews a Codex marketplace install source without mutating workspace plugin state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    try {
      const sourceSha = "a".repeat(40);
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: "https://plugins.example.test/remote-helper.git", path: "./plugins/remote-helper", sha: sourceSha },
      });

      const preview = await withPluginCache("0", () => previewCodexPluginInstallSource(workspace, { source: remoteRoot, name: "Preview fixture" }));

      expect(preview).toMatchObject({
        source: remoteRoot,
        name: "Preview fixture",
        installableCount: 0,
        errors: [],
        marketplaceSources: [
          expect.objectContaining({
            label: "Preview fixture",
            source: marketplacePath,
            pluginCount: 1,
          }),
        ],
      });
      expect(preview.candidates).toEqual([
        expect.objectContaining({
          name: "remote-helper",
          sourceKind: "remote-marketplace",
          sourceSha,
          imported: false,
        }),
      ]);
      await expect(stat(join(workspace, ".agents", "plugins", "marketplace.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("blocks loopback Codex marketplace preview URL before fetch", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const previousFetch = globalThis.fetch;
    try {
      const fetchImpl = vi.fn(async () => new Response("should not fetch", { status: 200 }));
      globalThis.fetch = fetchImpl as typeof fetch;

      const preview = await withPluginCache(
        "0",
        () => previewCodexPluginInstallSource(workspace, { source: "http://127.0.0.1:43111/marketplace.json", name: "Loopback fixture" }),
      );

      expect(preview.installableCount).toBe(0);
      expect(preview.errors.join("\n")).toMatch(/plugin-preview URL egress blocked loopback/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = previousFetch;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks Codex marketplace redirects into metadata endpoints before the redirected fetch", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const previousFetch = globalThis.fetch;
    try {
      const fetchImpl = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        }),
      );
      globalThis.fetch = fetchImpl as typeof fetch;

      const preview = await withPluginCache(
        "0",
        () => previewCodexPluginInstallSource(workspace, { source: "https://plugins.example.test/marketplace.json", name: "Redirect fixture" }),
      );

      expect(preview.installableCount).toBe(0);
      expect(preview.errors.join("\n")).toMatch(/plugin-preview URL egress blocked (metadata|link-local)/i);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = previousFetch;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks remote Git plugin install egress before Git reaches a loopback source URL", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("git endpoint should not be reached");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Loopback Git fixture did not bind a TCP port.");
    try {
      const sourceUrl = `http://127.0.0.1:${address.port}/blocked.git`;
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git", url: sourceUrl, sha: "a".repeat(40) },
      });

      await expect(
        withPluginCache(
          "0",
          () => commitCodexPluginInstallSource(workspace, { source: remoteRoot, pluginName: "remote-helper" }),
          marketplacePath,
        ),
      ).rejects.toThrow(/Remote Git installs require a local Git path or file URL/i);
      expect(requestCount).toBe(0);
    } finally {
      server.close();
      await once(server, "close");
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("commits a pinned local Git Codex marketplace install source into Ambient-owned imports", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-remote-plugin-repo-"));
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sourceSha = String(stdout).trim();
      const sourceUrl = repo;
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: sourceSha },
      });

      const result = await withPluginCache(
        "0",
        () => commitCodexPluginInstallSource(workspace, { source: remoteRoot, pluginName: "remote-helper" }),
        marketplacePath,
      );

      expect(result).toMatchObject({
        source: remoteRoot,
        plugin: expect.objectContaining({
          name: "remote-helper",
          compatibilityTier: "supported",
          sourceKind: "workspace",
          sourceSha,
        }),
      });
      expect(Date.parse(result.installedAt)).not.toBeNaN();

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins[0]).toMatchObject({
        name: "remote-helper",
        source: expect.objectContaining({ source: "local" }),
        ambient: {
          provenance: expect.objectContaining({
            sourceType: "git-subdir",
            url: sourceUrl,
            path: "./plugins/remote-helper",
            sha: sourceSha,
          }),
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("installs local Git-backed remote marketplace candidates as local Codex plugin imports", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-remote-plugin-repo-"));
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const { stdout: commitStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sourceSha = String(commitStdout).trim();
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: repo, path: "./plugins/remote-helper", sha: sourceSha },
      });
      const before = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = before.importCandidates.find((plugin) => plugin.name === "remote-helper");
      expect(candidate).toMatchObject({ sourceKind: "remote-marketplace", imported: false, sourceSha });

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath);

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins[0]).toMatchObject({
        name: "remote-helper",
        source: expect.objectContaining({ source: "local" }),
        ambient: {
          provenance: {
            sourceType: "git-subdir",
            url: repo,
            path: "./plugins/remote-helper",
            sha: sourceSha,
          },
        },
        policy: { authentication: "ON_INSTALL" },
      });
      expect(marketplace.plugins[0].source.path).toContain("./.ambient-codex/imported-plugins/");

      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        sourceKind: "workspace",
        sourceType: "git-subdir",
        sourceUrl: repo,
        sourcePath: "./plugins/remote-helper",
        sourceSha,
        authPolicy: "ON_INSTALL",
        compatibilityTier: "supported",
        skills: [
          expect.objectContaining({
            name: "remote-helper",
            description: "Use the remote helper fixture.",
          }),
        ],
      });
      expect(after.importCandidates.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        imported: true,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("registers pinned HTTPS Git-backed remote marketplace candidates without cloning them", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-remote-plugin-repo-"));
    const sourceUrl = "https://plugins.example.test/remote-helper.git";
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const { stdout: commitStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sourceSha = String(commitStdout).trim();
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: sourceSha },
      });
      const before = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = before.importCandidates.find((plugin) => plugin.name === "remote-helper");
      expect(candidate).toMatchObject({ sourceKind: "remote-marketplace", imported: false, sourceUrl, sourceSha });

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath);

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins[0]).toMatchObject({
        name: "remote-helper",
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: sourceSha },
      });

      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        sourceKind: "remote-marketplace",
        sourceUrl,
        sourceSha,
        compatibilityTier: "partial",
        skills: [],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("registers Ambient-curated HTTPS Git marketplace candidates without cloning them", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-curated-plugin-repo-"));
    const sourceUrl = "https://plugins.example.test/ambient/curated-helper.git";
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const { stdout: commitStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sourceSha = String(commitStdout).trim();
      const bundleChecksum = await testPluginBundleChecksum(join(repo, "plugins", "remote-helper"));
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: sourceSha },
        publisher: "Ambient",
        license: "MIT",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: `sha256:${"d".repeat(64)}`,
            bundleChecksum,
            capabilitySummary: ["Curated HTTPS Git fixture"],
            compatibility: { status: "Ambient verified HTTPS Git fixture", tier: "supported" },
          },
        },
      });
      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "remote-helper");
      expect(candidate).toMatchObject({
        marketplaceKind: "ambient-curated",
        sourceKind: "remote-marketplace",
        sourceUrl,
        sourceSha,
        sourceBundleChecksum: bundleChecksum,
      });

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath);

      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins[0]).toMatchObject({
        name: "remote-helper",
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: sourceSha },
        ambient: {
          marketplace: {
            bundleChecksum,
            capabilitySummary: ["Curated HTTPS Git fixture"],
          },
        },
      });

      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        sourceKind: "remote-marketplace",
        marketplaceKind: "ambient-curated",
        sourceUrl,
        sourceSha,
        sourceBundleChecksum: bundleChecksum,
        skills: [],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("registers unpinned Ambient-curated Git marketplace metadata without cloning", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    try {
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: "https://plugins.example.test/ambient/unpinned.git", path: "./plugins/remote-helper", ref: "main" },
        publisher: "Ambient",
        license: "MIT",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: `sha256:${"e".repeat(64)}`,
            capabilitySummary: ["Unpinned Git fixture"],
            compatibility: { status: "Ambient curated unpinned fixture", tier: "supported" },
          },
        },
      });
      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "remote-helper");

      await expect(
        withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath),
      ).resolves.toMatchObject({
        imported: true,
        marketplaceKind: "ambient-curated",
        sourceUrl: "https://plugins.example.test/ambient/unpinned.git",
        sourceRef: "main",
        sourceSha: undefined,
        sourceKind: "remote-marketplace",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("registers Ambient-curated Git metadata with an unreachable pinned SHA without cloning", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-curated-plugin-repo-"));
    const sourceUrl = "https://plugins.example.test/ambient/wrong-sha.git";
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        publisher: "Ambient",
        license: "MIT",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: `sha256:${"f".repeat(64)}`,
            capabilitySummary: ["Wrong SHA fixture"],
            compatibility: { status: "Ambient curated wrong SHA fixture", tier: "supported" },
          },
        },
      });
      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "remote-helper");

      await expect(
        withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath),
      ).resolves.toMatchObject({
        imported: true,
        marketplaceKind: "ambient-curated",
        sourceUrl,
        sourceSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceKind: "remote-marketplace",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("registers Ambient-curated Git metadata without inspecting remote manifests", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-curated-plugin-repo-"));
    const sourceUrl = "https://plugins.example.test/ambient/missing-manifest.git";
    try {
      await seedGitBackedRemotePluginRepo(repo, { manifest: false });
      const { stdout: commitStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sourceSha = String(commitStdout).trim();
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: sourceSha },
        publisher: "Ambient",
        license: "MIT",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: `sha256:${"1".repeat(64)}`,
            capabilitySummary: ["Missing manifest fixture"],
            compatibility: { status: "Ambient curated missing manifest fixture", tier: "partial" },
          },
        },
      });
      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "remote-helper");

      await expect(
        withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath),
      ).resolves.toMatchObject({
        imported: true,
        marketplaceKind: "ambient-curated",
        sourceUrl,
        sourceSha,
        sourceKind: "remote-marketplace",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("registers Ambient-curated Git metadata without verifying remote bundle checksums", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-curated-plugin-repo-"));
    const sourceUrl = "https://plugins.example.test/ambient/bad-checksum.git";
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const { stdout: commitStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sourceSha = String(commitStdout).trim();
      const marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: sourceUrl, path: "./plugins/remote-helper", sha: sourceSha },
        publisher: "Ambient",
        license: "MIT",
        ambient: {
          marketplace: {
            publisher: "Ambient",
            license: "MIT",
            checksum: `sha256:${"2".repeat(64)}`,
            bundleChecksum: `sha256:${"3".repeat(64)}`,
            capabilitySummary: ["Bad checksum fixture"],
            compatibility: { status: "Ambient curated bad checksum fixture", tier: "supported" },
          },
        },
      });
      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const candidate = catalog.importCandidates.find((plugin) => plugin.name === "remote-helper");

      await expect(
        withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: candidate!.id }), marketplacePath),
      ).resolves.toMatchObject({
        imported: true,
        marketplaceKind: "ambient-curated",
        sourceUrl,
        sourceSha,
        sourceBundleChecksum: `sha256:${"3".repeat(64)}`,
        sourceKind: "remote-marketplace",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("updates Git-backed remote marketplace imports and removes the prior imported bundle", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    const repo = await mkdtemp(join(tmpdir(), "ambient-remote-plugin-repo-"));
    try {
      await seedGitBackedRemotePluginRepo(repo);
      const { stdout: firstCommitStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const firstSha = String(firstCommitStdout).trim();
      let marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: repo, path: "./plugins/remote-helper", sha: firstSha },
      });
      const firstCandidate = (await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath)).importCandidates.find(
        (plugin) => plugin.name === "remote-helper",
      );
      const firstImport = await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: firstCandidate!.id }), marketplacePath);
      await expect(stat(firstImport.rootPath)).resolves.toBeDefined();

      const secondSha = await commitRemotePluginChange(repo, "Use the updated remote helper fixture.");
      marketplacePath = await seedRemoteMarketplace(remoteRoot, {
        source: { source: "git-subdir", url: repo, path: "./plugins/remote-helper", sha: secondSha },
      });
      const updateCatalog = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      const updateCandidate = updateCatalog.importCandidates.find((plugin) => plugin.name === "remote-helper");
      expect(updateCandidate).toMatchObject({
        imported: false,
        updateAvailable: true,
        sourceSha: secondSha,
      });

      await withPluginCache("0", () => importCodexPluginFromCache(workspace, { pluginId: updateCandidate!.id }), marketplacePath);

      await expect(stat(firstImport.rootPath)).rejects.toMatchObject({ code: "ENOENT" });
      const marketplace = JSON.parse(await readFile(join(workspace, ".agents", "plugins", "marketplace.json"), "utf8"));
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0]).toMatchObject({
        name: "remote-helper",
        ambient: { provenance: { sha: secondSha } },
      });
      const after = await withPluginCache("0", () => discoverCodexPlugins(workspace), marketplacePath);
      expect(after.plugins.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        sourceSha: secondSha,
        skills: [expect.objectContaining({ description: "Use the updated remote helper fixture." })],
      });
      expect(after.importCandidates.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        imported: true,
        updateAvailable: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("adds local Codex marketplace sources to Ambient-owned workspace state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ambient-remote-marketplace-"));
    try {
      const marketplacePath = await seedRemoteMarketplace(remoteRoot);

      await withPluginCache("0", () => addCodexMarketplaceSource(workspace, { source: remoteRoot, name: "Local fixture" }));

      const config = JSON.parse(await readFile(join(workspace, ".ambient-codex", "remote-marketplaces.json"), "utf8"));
      expect(config.marketplaces).toEqual([{ name: "Local fixture", path: marketplacePath }]);

      const catalog = await withPluginCache("0", () => discoverCodexPlugins(workspace));
      expect(catalog.marketplaceSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: `path:${marketplacePath}`,
            label: "Local fixture",
            source: marketplacePath,
            kind: "remote",
            removable: true,
          }),
        ]),
      );
      expect(catalog.importCandidates.find((plugin) => plugin.name === "remote-helper")).toMatchObject({
        sourceKind: "remote-marketplace",
        marketplaceName: "OpenAI Compatible Fixture",
      });

      await withPluginCache("0", () => removeCodexMarketplaceSource(workspace, { source: marketplacePath }));
      const removedConfig = JSON.parse(await readFile(join(workspace, ".ambient-codex", "remote-marketplaces.json"), "utf8"));
      expect(removedConfig.marketplaces).toEqual([]);
      const afterRemove = await withPluginCache("0", () => discoverCodexPlugins(workspace));
      expect(afterRemove.importCandidates.find((plugin) => plugin.name === "remote-helper")).toBeUndefined();
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("normalizes GitHub shorthand marketplace sources and deduplicates entries", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    try {
      await withPluginCache("0", () => addCodexMarketplaceSource(workspace, { source: "openai/codex-plugins", name: "Codex Plugins" }));
      await withPluginCache("0", () => addCodexMarketplaceSource(workspace, { source: "github:openai/codex-plugins" }));
      await withPluginCache("0", () => addCodexMarketplaceSource(workspace, { source: "git@github.com:openai/codex-plugins.git" }));

      const config = JSON.parse(await readFile(join(workspace, ".ambient-codex", "remote-marketplaces.json"), "utf8"));
      expect(config.marketplaces).toEqual([
        {
          url: "https://raw.githubusercontent.com/openai/codex-plugins/main/marketplace.json",
        },
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires explicit experimental opt-in for arbitrary marketplace URLs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-workspace-"));
    try {
      await expect(
        withPluginCache("0", () => addCodexMarketplaceSource(workspace, { source: "https://plugins.example.test/marketplace.json" })),
      ).rejects.toThrow("Arbitrary Codex marketplace URLs are experimental");

      await withPluginCache("0", () =>
        addCodexMarketplaceSource(workspace, {
          source: "https://plugins.example.test/marketplace.json",
          name: "Experimental fixture",
          allowExperimental: true,
        }),
      );
      await withPluginCache("0", () =>
        addCodexMarketplaceSource(workspace, {
          source: "https://github.com/openai/codex-plugins",
          name: "GitHub fixture",
        }),
      );

      const config = JSON.parse(await readFile(join(workspace, ".ambient-codex", "remote-marketplaces.json"), "utf8"));
      expect(config.marketplaces).toEqual([
        {
          name: "Experimental fixture",
          url: "https://plugins.example.test/marketplace.json",
        },
        {
          name: "GitHub fixture",
          url: "https://raw.githubusercontent.com/openai/codex-plugins/main/marketplace.json",
        },
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function seedCachePlugin(
  root: string,
  publisher: string,
  name: string,
  version: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const pluginRoot = join(root, publisher, name, version);
  await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
  await writeFile(join(pluginRoot, ".codex-plugin", "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (manifest.skills) {
    await mkdir(join(pluginRoot, "skills", name), { recursive: true });
    await writeFile(
      join(pluginRoot, "skills", name, "SKILL.md"),
      ["---", `name: ${name}`, `description: ${name} skill`, "---", "", "Use this plugin in tests.", ""].join("\n"),
      "utf8",
    );
  }
  if (manifest.apps) {
    await writeFile(
      join(pluginRoot, ".app.json"),
      `${JSON.stringify({ apps: { [name]: { id: `connector_${name}` } } }, null, 2)}\n`,
      "utf8",
    );
  }
  if (manifest.mcpServers) {
    await writeFile(
      join(pluginRoot, ".mcp.json"),
      `${JSON.stringify({ mcpServers: { [name]: { command: "./Codex Computer Use.app/Contents/MacOS/helper", args: ["mcp"] } } }, null, 2)}\n`,
      "utf8",
    );
  }
}

async function seedRemoteMarketplace(root: string, pluginOverrides: Record<string, unknown> = {}): Promise<string> {
  const marketplacePath = join(root, "marketplace.json");
  await writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "openai-compatible-fixture",
        interface: { displayName: "OpenAI Compatible Fixture" },
        plugins: [
          {
            name: "remote-helper",
            version: "0.3.0",
            description: "Remote helper metadata fixture.",
            source: {
              source: "git-subdir",
              url: "https://github.com/example/codex-plugins.git",
              path: "./plugins/remote-helper",
              ref: "main",
            },
            category: "Productivity",
            interface: {
              displayName: "Remote Helper",
              shortDescription: "Browse remote Codex marketplace metadata.",
              category: "Productivity",
            },
            policy: { authentication: "ON_INSTALL" },
            ...pluginOverrides,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return marketplacePath;
}

async function seedGitBackedRemotePluginRepo(repo: string, options: { manifest?: boolean } = {}): Promise<void> {
  const pluginRoot = join(repo, "plugins", "remote-helper");
  if (options.manifest !== false) await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
  await mkdir(join(pluginRoot, "skills", "remote-helper"), { recursive: true });
  if (options.manifest !== false) {
    await writeFile(
      join(pluginRoot, ".codex-plugin", "plugin.json"),
      `${JSON.stringify(
        {
          name: "remote-helper",
          version: "0.3.0",
          description: "Remote helper manifest",
          skills: "./skills/",
          interface: { displayName: "Remote Helper", shortDescription: "Remote helper workflows", category: "Remote" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
  await writeFile(
    join(pluginRoot, "skills", "remote-helper", "SKILL.md"),
    ["---", "name: remote-helper", "description: Use the remote helper fixture.", "---", "", "Use this fixture in tests.", ""].join("\n"),
    "utf8",
  );
  await git(["init"], repo);
  await git(["add", "."], repo);
  await git(["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed remote plugin"], repo);
}

async function commitRemotePluginChange(repo: string, description: string): Promise<string> {
  await writeFile(
    join(repo, "plugins", "remote-helper", "skills", "remote-helper", "SKILL.md"),
    ["---", "name: remote-helper", `description: ${description}`, "---", "", "Use this updated fixture in tests.", ""].join("\n"),
    "utf8",
  );
  await git(["add", "."], repo);
  await git(["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "update remote plugin"], repo);
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
  return String(stdout).trim();
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

async function withGitUrlRewrite<T>(sourceUrl: string, repo: string, action: () => Promise<T>): Promise<T> {
  const previousCount = process.env.GIT_CONFIG_COUNT;
  const previousKey = process.env.GIT_CONFIG_KEY_0;
  const previousValue = process.env.GIT_CONFIG_VALUE_0;
  process.env.GIT_CONFIG_COUNT = "1";
  process.env.GIT_CONFIG_KEY_0 = `url.${pathToFileURL(repo).href}.insteadOf`;
  process.env.GIT_CONFIG_VALUE_0 = sourceUrl;
  try {
    return await action();
  } finally {
    restoreEnv("GIT_CONFIG_COUNT", previousCount);
    restoreEnv("GIT_CONFIG_KEY_0", previousKey);
    restoreEnv("GIT_CONFIG_VALUE_0", previousValue);
  }
}

async function testPluginBundleChecksum(pluginRoot: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(directory: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = join(directory, entry.name);
      const relativePath = relative(pluginRoot, fullPath).split(sep).join("/");
      if (entry.isDirectory()) {
        hash.update(`dir\0${relativePath}\0`);
        await visit(fullPath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0`);
        hash.update(await readFile(fullPath));
        hash.update("\0");
      }
    }
  }
  await visit(pluginRoot);
  return `sha256:${hash.digest("hex")}`;
}

async function withPluginCache<T>(
  cacheRoot: string,
  action: () => Promise<T>,
  remoteMarketplacePath = "0",
  curatedMarketplacePath = "0",
  allowUnsignedCuratedMarketplace = "1",
): Promise<T> {
  const previousCache = process.env.AMBIENT_CODEX_PLUGIN_CACHE;
  const previousCuratedPath = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH;
  const previousCuratedUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL;
  const previousCuratedAllowUnsigned = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED;
  const previousCuratedDefaultUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL;
  const previousCuratedTrustFixtureKey = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY;
  const previousRemotePath = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH;
  const previousRemoteUrl = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL;
  const previousRemoteList = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES;
  process.env.AMBIENT_CODEX_PLUGIN_CACHE = cacheRoot;
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH = curatedMarketplacePath;
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED = allowUnsignedCuratedMarketplace;
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY = "1";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH = remoteMarketplacePath;
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES = "0";
  try {
    return await action();
  } finally {
    if (previousCache === undefined) delete process.env.AMBIENT_CODEX_PLUGIN_CACHE;
    else process.env.AMBIENT_CODEX_PLUGIN_CACHE = previousCache;
    if (previousCuratedPath === undefined) delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH;
    else process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH = previousCuratedPath;
    if (previousCuratedUrl === undefined) delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL;
    else process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL = previousCuratedUrl;
    if (previousCuratedAllowUnsigned === undefined) delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED;
    else process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED = previousCuratedAllowUnsigned;
    if (previousCuratedDefaultUrl === undefined) delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL;
    else process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL = previousCuratedDefaultUrl;
    if (previousCuratedTrustFixtureKey === undefined) delete process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY;
    else process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY = previousCuratedTrustFixtureKey;
    if (previousRemotePath === undefined) delete process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH;
    else process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH = previousRemotePath;
    if (previousRemoteUrl === undefined) delete process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL;
    else process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL = previousRemoteUrl;
    if (previousRemoteList === undefined) delete process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES;
    else process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES = previousRemoteList;
  }
}

function restoreEnv(key: string, previousValue: string | undefined): void {
  if (previousValue === undefined) delete process.env[key];
  else process.env[key] = previousValue;
}
