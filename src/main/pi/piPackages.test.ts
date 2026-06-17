import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverPiPackages, installPiPackageSource, parsePiPackageGalleryHtml, previewPiPackageInstallSource, uninstallPiPackageSource } from "./piPackages";

describe("discoverPiPackages", () => {
  it("inspects workspace package pi manifest without executing resources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-package-"));
    const markerPath = join(workspace, "extension-ran.txt");
    try {
      await mkdir(join(workspace, "extensions"), { recursive: true });
      await writeFile(
        join(workspace, "package.json"),
        `${JSON.stringify(
          {
            name: "ambient-pi-fixture",
            version: "1.2.3",
            description: "Pi package fixture",
            keywords: ["pi-package"],
            license: "MIT",
            pi: {
              extensions: ["./extensions/index.ts"],
              skills: ["./skills"],
              prompts: ["./prompts/review.md"],
              themes: ["./themes/ambient.json"],
              image: "https://example.test/screenshot.png",
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(workspace, "extensions", "index.ts"),
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(markerPath)}, "executed");\n`,
        "utf8",
      );

      await withIsolatedPiPackageSources(workspace, async () => {
        const catalog = await discoverPiPackages(workspace);
        expect(catalog.packages).toHaveLength(1);
        expect(catalog.packages[0]).toMatchObject({
          name: "ambient-pi-fixture",
          version: "1.2.3",
          sourceKind: "workspace",
          compatibilityTier: "partial",
          image: "https://example.test/screenshot.png",
          resourceCounts: { extension: 1, skill: 1, prompt: 1, theme: 1 },
          supportLabels: expect.arrayContaining(["Extensions (code)", "Skills", "Prompts", "Themes", "Inspect only"]),
        });
        expect(catalog.packages[0].compatibilityNotes.join("\n")).toContain("disabled until Ambient has package sandboxing");
        await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("loads the repo Pi fixture package with all resource kinds", async () => {
    const fixturePath = join(process.cwd(), "plugins", "pi-fixture");

    await withIsolatedPiPackageSources(fixturePath, async () => {
      const catalog = await discoverPiPackages(fixturePath);
      expect(catalog.packages).toHaveLength(1);
      expect(catalog.packages[0]).toMatchObject({
        name: "ambient-pi-fixture",
        version: "0.1.0",
        sourceKind: "workspace",
        compatibilityTier: "partial",
        image: "https://example.test/pi-fixture.png",
        resourceCounts: { extension: 1, skill: 1, prompt: 1, theme: 1 },
        resources: [
          { kind: "extension", path: "./extensions/index.ts", source: "manifest" },
          { kind: "skill", path: "./skills/workspace-review", source: "manifest" },
          { kind: "prompt", path: "./prompts/review.md", source: "manifest" },
          { kind: "theme", path: "./themes/ambient.json", source: "manifest" },
        ],
      });
      expect(catalog.sourceNotes.join("\n")).toContain("execution-disabled");
    });
  });

  it("surfaces Pi package dependencies without installing or executing them", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-deps-"));
    try {
      await mkdir(join(workspace, "skills", "review"), { recursive: true });
      await mkdir(join(workspace, "node_modules", "installed-runtime"), { recursive: true });
      await writeFile(
        join(workspace, "package.json"),
        `${JSON.stringify(
          {
            name: "pi-with-deps",
            version: "0.1.0",
            keywords: ["pi-package"],
            dependencies: {
              "installed-runtime": "1.0.0",
              "missing-runtime": "2.0.0",
            },
            pi: {
              skills: ["./skills/review"],
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(workspace, "skills", "review", "SKILL.md"), "# Review\n", "utf8");

      await withIsolatedPiPackageSources(workspace, async () => {
        const catalog = await discoverPiPackages(workspace);
        expect(catalog.packages[0]).toMatchObject({
          name: "pi-with-deps",
          dependencyStatus: {
            required: true,
            installed: false,
            packageNames: ["installed-runtime", "missing-runtime"],
            missingPackages: ["missing-runtime"],
          },
          supportLabels: expect.arrayContaining(["Dependencies missing"]),
        });
        expect(catalog.packages[0].compatibilityNotes.join("\n")).toContain("will not install or execute Pi package dependencies");
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discovers package-root SKILL.md files by convention", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-root-skill-"));
    try {
      await writeFile(
        join(workspace, "package.json"),
        `${JSON.stringify({ name: "root-skill-pi", version: "0.1.0", description: "Root skill package" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(workspace, "SKILL.md"), "# Root Skill\n", "utf8");

      await withIsolatedPiPackageSources(workspace, async () => {
        const catalog = await discoverPiPackages(workspace);
        expect(catalog.packages).toHaveLength(1);
        expect(catalog.packages[0]).toMatchObject({
          name: "root-skill-pi",
          compatibilityTier: "supported",
          resourceCounts: { extension: 0, skill: 1, prompt: 0, theme: 0 },
          resources: [{ kind: "skill", path: "./SKILL.md", source: "convention" }],
          supportLabels: expect.arrayContaining(["Skills"]),
        });
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reads project Pi settings package specs and local package filters", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-settings-"));
    try {
      await mkdir(join(workspace, ".pi", "local-package", "skills", "inspect"), { recursive: true });
      await writeFile(
        join(workspace, ".pi", "settings.json"),
        `${JSON.stringify(
          {
            packages: [
              "npm:pi-subagents@1.0.0",
              { source: "./local-package", skills: ["skills/inspect"], extensions: [] },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(workspace, ".pi", "local-package", "package.json"),
        `${JSON.stringify({ name: "local-pi-package", version: "0.1.0", keywords: ["pi-package"] }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(workspace, ".pi", "local-package", "skills", "inspect", "SKILL.md"), "# Inspect\n", "utf8");

      await withIsolatedPiPackageSources(workspace, async () => {
        const catalog = await discoverPiPackages(workspace);
        const byName = new Map(catalog.packages.map((pkg) => [pkg.name, pkg]));
        expect(byName.get("pi-subagents")).toMatchObject({
          sourceKind: "project-settings",
          packageSpec: "npm:pi-subagents@1.0.0",
          compatibilityTier: "unsupported",
          supportLabels: expect.arrayContaining(["Configured package", "Install disabled", "Inspect only"]),
        });
        expect(byName.get("local-pi-package")).toMatchObject({
          sourceKind: "project-settings",
          compatibilityTier: "supported",
          resourceCounts: { extension: 0, skill: 2, prompt: 0, theme: 0 },
        });
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs Pi package sources into Ambient-owned workspace state without changing Pi settings", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-install-"));
    try {
      await withIsolatedPiPackageSources(workspace, async () => {
        const catalog = await installPiPackageSource(workspace, { source: "pi-subagents", scope: "workspace" });
        const installed = catalog.packages.find((pkg) => pkg.name === "pi-subagents");

        expect(installed).toMatchObject({
          sourceKind: "ambient-workspace",
          sourceLabel: "Ambient workspace Pi packages",
          packageSpec: "npm:pi-subagents",
          installCommand: "pi install npm:pi-subagents",
          installed: true,
          installScope: "workspace",
          supportLabels: expect.arrayContaining(["Ambient installed", "Execution disabled"]),
        });
        expect(installed?.compatibilityNotes.join("\n")).toContain("Installed in Ambient-managed Pi package state");

        const ambientConfig = JSON.parse(await readFile(join(workspace, ".ambient", "plugins", "pi-packages.json"), "utf8"));
        expect(ambientConfig.packages).toEqual([{ source: "npm:pi-subagents", scope: "workspace" }]);
        await expect(readFile(join(workspace, ".pi", "settings.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs local workspace Pi package sources only when they stay in the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-local-install-"));
    try {
      await withIsolatedPiPackageSources(workspace, async () => {
        await mkdir(join(workspace, "local-pi", "skills", "review"), { recursive: true });
        await writeFile(
          join(workspace, "local-pi", "package.json"),
          `${JSON.stringify({ name: "local-installed-pi", version: "0.2.0", keywords: ["pi-package"] }, null, 2)}\n`,
          "utf8",
        );
        await writeFile(join(workspace, "local-pi", "skills", "review", "SKILL.md"), "# Review\n", "utf8");

        const catalog = await installPiPackageSource(workspace, { source: "./local-pi", scope: "workspace" });
        expect(catalog.packages.find((pkg) => pkg.name === "local-installed-pi")).toMatchObject({
          sourceKind: "ambient-workspace",
          installed: true,
          compatibilityTier: "supported",
          resourceCounts: { extension: 0, skill: 1, prompt: 0, theme: 0 },
        });

        await expect(installPiPackageSource(workspace, { source: "../outside", scope: "workspace" })).rejects.toThrow(
          "Workspace-scoped local Pi package sources must stay inside the workspace.",
        );
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews local Pi package install without executing resources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-preview-"));
    const markerPath = join(workspace, "extension-ran.txt");
    try {
      await withIsolatedPiPackageSources(workspace, async () => {
        await mkdir(join(workspace, "local-pi", "extensions"), { recursive: true });
        await mkdir(join(workspace, "local-pi", "skills", "review"), { recursive: true });
        await writeFile(
          join(workspace, "local-pi", "package.json"),
          `${JSON.stringify(
            {
              name: "preview-pi",
              version: "0.1.0",
              keywords: ["pi-package"],
              pi: {
                extensions: ["./extensions/index.ts"],
                skills: ["./skills/review/SKILL.md"],
              },
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
        await writeFile(
          join(workspace, "local-pi", "extensions", "index.ts"),
          `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(markerPath)}, "executed");\n`,
          "utf8",
        );
        await writeFile(join(workspace, "local-pi", "skills", "review", "SKILL.md"), "# Review\n", "utf8");

        const preview = await previewPiPackageInstallSource(workspace, { source: "./local-pi", scope: "workspace" });
        expect(preview).toMatchObject({
          source: "./local-pi",
          normalizedSource: "./local-pi",
          scope: "workspace",
          installable: true,
          candidate: expect.objectContaining({
            name: "preview-pi",
            installed: true,
            installScope: "workspace",
            resourceCounts: { extension: 1, skill: 1, prompt: 0, theme: 0 },
            compatibilityTier: "partial",
          }),
          notes: expect.arrayContaining([
            "This package declares executable extensions. Ambient can record the package source, but extension execution remains blocked.",
          ]),
        });
        await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks preview commit for invalid local Pi package sources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-invalid-preview-"));
    try {
      await withIsolatedPiPackageSources(workspace, async () => {
        await mkdir(join(workspace, "empty-pi"), { recursive: true });
        const preview = await previewPiPackageInstallSource(workspace, { source: "./empty-pi", scope: "workspace" });
        expect(preview).toMatchObject({
          installable: false,
          errors: expect.arrayContaining(["Missing package.json.", "No Pi resources were declared in package metadata or conventional directories."]),
        });
        await expect(installPiPackageSource(workspace, { source: "./empty-pi", scope: "workspace" })).rejects.toThrow("Pi package source is not installable");
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs global local Pi package sources as absolute paths outside workspace state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-global-install-"));
    try {
      await withIsolatedPiPackageSources(workspace, async () => {
        const packageRoot = join(workspace, "global-pi");
        await mkdir(join(packageRoot, "skills", "review"), { recursive: true });
        await writeFile(
          join(packageRoot, "package.json"),
          `${JSON.stringify({ name: "global-installed-pi", version: "0.4.0", keywords: ["pi-package"] }, null, 2)}\n`,
          "utf8",
        );
        await writeFile(join(packageRoot, "skills", "review", "SKILL.md"), "# Review\n", "utf8");

        const catalog = await installPiPackageSource(workspace, { source: "./global-pi", scope: "global" });
        expect(catalog.packages.find((pkg) => pkg.name === "global-installed-pi")).toMatchObject({
          sourceKind: "ambient-global",
          sourceLabel: "Ambient global Pi packages",
          packageSpec: packageRoot,
          installed: true,
          installScope: "global",
          compatibilityTier: "supported",
          resourceCounts: { extension: 0, skill: 1, prompt: 0, theme: 0 },
        });

        const globalConfig = JSON.parse(await readFile(process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH!, "utf8"));
        expect(globalConfig.packages).toEqual([{ source: packageRoot, scope: "global" }]);
        await expect(readFile(join(workspace, ".ambient", "plugins", "pi-packages.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uninstalls only Ambient-managed Pi package sources without changing Pi settings", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-uninstall-"));
    try {
      await withIsolatedPiPackageSources(workspace, async () => {
        await mkdir(join(workspace, "local-pi", "skills", "review"), { recursive: true });
        await mkdir(join(workspace, ".pi"), { recursive: true });
        await writeFile(
          join(workspace, "local-pi", "package.json"),
          `${JSON.stringify({ name: "removable-pi", version: "0.5.0", keywords: ["pi-package"] }, null, 2)}\n`,
          "utf8",
        );
        await writeFile(join(workspace, "local-pi", "skills", "review", "SKILL.md"), "# Review\n", "utf8");
        await writeFile(join(workspace, ".pi", "settings.json"), `${JSON.stringify({ packages: [] }, null, 2)}\n`, "utf8");

        const installed = await installPiPackageSource(workspace, { source: "./local-pi", scope: "workspace" });
        const packageId = installed.packages.find((pkg) => pkg.name === "removable-pi")!.id;
        const uninstalled = await uninstallPiPackageSource(workspace, { packageId });

        expect(uninstalled.packages.find((pkg) => pkg.name === "removable-pi")).toBeUndefined();
        const ambientConfig = JSON.parse(await readFile(join(workspace, ".ambient", "plugins", "pi-packages.json"), "utf8"));
        expect(ambientConfig.packages).toEqual([]);
        expect(JSON.parse(await readFile(join(workspace, ".pi", "settings.json"), "utf8"))).toEqual({ packages: [] });
        await expect(uninstallPiPackageSource(workspace, { packageId })).rejects.toThrow("Pi package was not found.");
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("marks Ambient-installed declarative packages enabled only from Ambient state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-enable-"));
    try {
      await withIsolatedPiPackageSources(workspace, async () => {
        await mkdir(join(workspace, "local-pi", "skills", "review"), { recursive: true });
        await writeFile(
          join(workspace, "local-pi", "package.json"),
          `${JSON.stringify({ name: "enabled-pi-skills", version: "0.3.0", keywords: ["pi-package"] }, null, 2)}\n`,
          "utf8",
        );
        await writeFile(join(workspace, "local-pi", "skills", "review", "SKILL.md"), "# Review\n", "utf8");

        const installed = await installPiPackageSource(workspace, { source: "./local-pi", scope: "workspace" });
        const packageId = installed.packages.find((pkg) => pkg.name === "enabled-pi-skills")!.id;
        const enabledCatalog = await discoverPiPackages(workspace, { isPackageEnabled: (id) => id === packageId });

        expect(enabledCatalog.packages.find((pkg) => pkg.id === packageId)).toMatchObject({
          installed: true,
          enabled: true,
          supportLabels: expect.arrayContaining(["Enabled", "Declarative resources enabled"]),
        });
        expect(enabledCatalog.packages.find((pkg) => pkg.id === packageId)?.supportLabels).not.toContain("Execution disabled");
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("parsePiPackageGalleryHtml", () => {
  it("parses pi.dev package cards into inspect-only candidates", () => {
    const catalog = parsePiPackageGalleryHtml(`
      <article class="surface-panel" data-package-card="true" data-package-name="pi-mcp-adapter" data-package-search="pi-mcp-adapter mcp adapter"
        data-package-types="extension skill" data-package-downloads="13452" data-package-date="1777058467893" data-package-path="/packages/pi-mcp-adapter">
        <h3><a href="/packages/pi-mcp-adapter">pi-mcp-adapter</a></h3>
        <p class="packages-desc">MCP adapter extension for Pi</p>
        <span class="meta-chip packages-badge" data-type="extension">extension</span>
      </article>
    `);

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      name: "pi-mcp-adapter",
      sourceKind: "pi-gallery",
      packageSpec: "npm:pi-mcp-adapter",
      installCommand: "pi install npm:pi-mcp-adapter",
      sourceUrl: "https://pi.dev/packages/pi-mcp-adapter",
      description: "MCP adapter extension for Pi",
      downloadsPerMonth: 13452,
      resourceCounts: { extension: 1, skill: 1, prompt: 0, theme: 0 },
      supportLabels: expect.arrayContaining(["pi.dev gallery", "Install disabled", "Extensions (code)", "Skills", "Inspect only"]),
    });
  });
});

async function withIsolatedPiPackageSources<T>(workspace: string, action: () => Promise<T>): Promise<T> {
  const previousGalleryDisabled = process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED;
  const previousUserSettings = process.env.AMBIENT_PI_USER_SETTINGS_PATH;
  const previousGlobalPackages = process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH;
  process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED = "1";
  process.env.AMBIENT_PI_USER_SETTINGS_PATH = join(workspace, "missing-user-settings.json");
  process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH = join(workspace, "missing-global-packages.json");
  try {
    return await action();
  } finally {
    restoreEnv("AMBIENT_PI_PACKAGE_GALLERY_DISABLED", previousGalleryDisabled);
    restoreEnv("AMBIENT_PI_USER_SETTINGS_PATH", previousUserSettings);
    restoreEnv("AMBIENT_PI_GLOBAL_PACKAGES_PATH", previousGlobalPackages);
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
