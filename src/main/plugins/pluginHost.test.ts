import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeOAuthConnectorProvider } from "./pluginsWorkflowAuthFacade";
import { AmbientPluginHost } from "./pluginHost";

function withPluginDiscoveryEnv<T>(action: () => Promise<T>): Promise<T> {
  const previousCacheRoot = process.env.AMBIENT_CODEX_PLUGIN_CACHE_ROOT;
  const previousRemoteMarketplaces = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES_PATH;
  const previousCuratedPath = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH;
  const previousCuratedUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL;
  const previousCuratedDefaultUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL;
  const previousPiGalleryDisabled = process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED;
  const previousPiUserSettings = process.env.AMBIENT_PI_USER_SETTINGS_PATH;
  const previousPiGlobalPackages = process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH;
  process.env.AMBIENT_CODEX_PLUGIN_CACHE_ROOT = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES_PATH = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL = "0";
  process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED = "1";
  process.env.AMBIENT_PI_USER_SETTINGS_PATH = join(process.cwd(), ".ambient-test-missing-pi-settings.json");
  process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH = join(process.cwd(), ".ambient-test-missing-pi-packages.json");

  return action().finally(() => {
    restoreEnv("AMBIENT_CODEX_PLUGIN_CACHE_ROOT", previousCacheRoot);
    restoreEnv("AMBIENT_CODEX_REMOTE_MARKETPLACES_PATH", previousRemoteMarketplaces);
    restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_PATH", previousCuratedPath);
    restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_URL", previousCuratedUrl);
    restoreEnv("AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL", previousCuratedDefaultUrl);
    restoreEnv("AMBIENT_PI_PACKAGE_GALLERY_DISABLED", previousPiGalleryDisabled);
    restoreEnv("AMBIENT_PI_USER_SETTINGS_PATH", previousPiUserSettings);
    restoreEnv("AMBIENT_PI_GLOBAL_PACKAGES_PATH", previousPiGlobalPackages);
  });
}

describe("AmbientPluginHost", () => {
  it("applies Ambient-owned enablement and trust state to Codex plugin catalogs", async () => {
    const host = new AmbientPluginHost();
    const trustFingerprints = new Map<string, string | undefined>();

    const catalog = await withPluginDiscoveryEnv(() =>
      host.readCodexPluginCatalog(process.cwd(), {
        isPluginEnabled: (pluginId) => pluginId.includes("ambient-fixture"),
        isPluginTrusted: (pluginId, pluginFingerprint) => {
          trustFingerprints.set(pluginId, pluginFingerprint);
          return pluginId.includes("ambient-fixture") && pluginFingerprint?.includes('"version":"0.1.0"') === true;
        },
      }),
    );

    const fixture = catalog.plugins.find((plugin) => plugin.name === "ambient-fixture");
    expect(fixture).toMatchObject({
      enabled: true,
      trusted: true,
      sourceKind: "workspace",
    });
    expect(trustFingerprints.get(fixture!.id)).toContain('"sourceKind":"workspace"');
  });

  it("reads a single Codex plugin with Ambient-owned state applied", async () => {
    const host = new AmbientPluginHost();

    const plugin = await withPluginDiscoveryEnv(() =>
      host.readCodexPlugin(
        process.cwd(),
        { pluginId: ".agents/plugins/marketplace.json:ambient-fixture" },
        {
          isPluginEnabled: () => true,
          isPluginTrusted: () => true,
        },
      ),
    );

    expect(plugin).toMatchObject({
      name: "ambient-fixture",
      sourceKind: "workspace",
      enabled: true,
      trusted: true,
    });

    await expect(
      withPluginDiscoveryEnv(() =>
        host.readCodexPlugin(
          process.cwd(),
          { pluginId: "missing-plugin" },
          {
            isPluginEnabled: () => false,
            isPluginTrusted: () => false,
          },
        ),
      ),
    ).rejects.toThrow("Codex plugin was not found.");
  });

  it("normalizes Codex plugin capabilities into a runtime-neutral registry", async () => {
    const host = new AmbientPluginHost();

    const registry = await withPluginDiscoveryEnv(() =>
      host.listRegistry(process.cwd(), {
        isPluginEnabled: () => true,
        isPluginTrusted: () => false,
      }),
    );

    const fixture = registry.plugins.find((plugin) => plugin.name === "ambient-fixture");
    expect(fixture).toMatchObject({
      sourceKind: "codex-workspace",
      installState: "installed",
      enabled: true,
      trusted: false,
      capabilityCount: 2,
    });

    expect(registry.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "skill",
          pluginName: "ambient-fixture",
          availability: "available",
          runtimeSupport: ["chat", "workflow", "automation"],
        }),
        expect.objectContaining({
          kind: "mcp-tool",
          pluginName: "ambient-fixture",
          availability: "untrusted",
          serverName: "ambient-fixture",
        }),
      ]),
    );
  });

  it("keeps MCP inspection behind the host and honors disabled plugin state", async () => {
    const host = new AmbientPluginHost();

    const inspection = await withPluginDiscoveryEnv(() =>
      host.inspectCodexPluginMcp(
        process.cwd(),
        {
          isPluginEnabled: () => false,
          isPluginTrusted: () => false,
        },
        { timeoutMs: 500, workspacePath: process.cwd() },
      ),
    );

    expect(inspection.servers).toContainEqual(
      expect.objectContaining({
        pluginName: "ambient-fixture",
        status: "skipped",
        reason: "Plugin is disabled.",
      }),
    );
  });

  it("exposes plugin app auth lifecycle operations without leaking PKCE verifier state", async () => {
    const host = new AmbientPluginHost({ auth: { providers: [fakeOAuthConnectorProvider()] } });

    const pending = host.startPluginAppAuth({ connectorId: "fake.oauth.records", scopes: ["fake.records.read"] });
    expect(pending).toMatchObject({
      connectorId: "fake.oauth.records",
      providerId: "fake.oauth",
      requestedScopes: ["fake.records.read"],
      authorizationUrl: expect.stringContaining("code_challenge_method=S256"),
    });
    expect(JSON.stringify(pending)).not.toContain("codeVerifier");

    const account = await host.completePluginAppAuth({ state: pending.state, code: "primary" });
    expect(account).toMatchObject({
      id: "fake.oauth:fake-user",
      status: "available",
      email: "fake-user@example.test",
    });

    await expect(host.testPluginAuthAccount({ accountId: account.id })).resolves.toMatchObject({ status: "available" });
    await expect(host.revokePluginAuthAccount({ accountId: account.id })).resolves.toMatchObject({ status: "revoked" });
  });

  it("enables declarative Pi package skill paths without allowing extension packages", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-host-pi-"));
    const host = new AmbientPluginHost();
    try {
      await mkdir(join(workspace, "skills-only", "skills", "review"), { recursive: true });
      await writeFile(
        join(workspace, "skills-only", "package.json"),
        `${JSON.stringify({ name: "skills-only", keywords: ["pi-package"] }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(workspace, "skills-only", "skills", "review", "SKILL.md"), "# Review\n", "utf8");

      await mkdir(join(workspace, "extension-package", "extensions"), { recursive: true });
      await writeFile(
        join(workspace, "extension-package", "package.json"),
        `${JSON.stringify({ name: "extension-package", keywords: ["pi-package"], pi: { extensions: ["./extensions/index.ts"] } }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(workspace, "extension-package", "extensions", "index.ts"), "export {};\n", "utf8");

      await withPluginDiscoveryEnv(async () => {
        const installed = await host.installPiPackage(workspace, { source: "./skills-only", scope: "workspace" });
        const packageId = installed.packages.find((pkg) => pkg.name === "skills-only")!.id;
        const state = {
          isPluginEnabled: () => true,
          isPluginTrusted: () => false,
          isPiPackageEnabled: (id: string) => id === packageId,
        };

        await expect(host.validatePiPackageEnablement(workspace, { packageId, enabled: true }, state)).resolves.toBeUndefined();
        await expect(host.enabledPiSkillPaths(workspace, state)).resolves.toEqual([join(workspace, "skills-only", "skills", "review")]);

        const extensionCatalog = await host.installPiPackage(workspace, { source: "./extension-package", scope: "workspace" }, state);
        const extensionId = extensionCatalog.packages.find((pkg) => pkg.name === "extension-package")!.id;
        await expect(host.validatePiPackageEnablement(workspace, { packageId: extensionId, enabled: true }, state)).rejects.toThrow(
          "Pi packages with extensions cannot be enabled",
        );

        const afterUninstall = await host.uninstallPiPackage(workspace, { packageId }, state);
        expect(afterUninstall.packages.find((pkg) => pkg.id === packageId)).toBeUndefined();
        await expect(host.enabledPiSkillPaths(workspace, state)).resolves.toEqual([]);
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
