import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  installAmbientCliPackageSource,
  previewAmbientCliPackageInstallSource,
  runAmbientCliPackageCommand,
  saveAmbientCliPackageEnvSecret,
  setAmbientCliPackageEnvBinding,
} from "./ambientCliPackages";
import {
  braveSearchOverlayDescriptor,
  execFileAsync,
  git,
  seedCliFixture,
  seedCliPackageWithLocalDependency,
} from "./ambientCliPackagesTestSupport";

describe("Ambient CLI package install source tail", () => {
  it("binds declared env requirements from Desktop-managed workspace secret files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-env-"));
    try {
      const root = join(workspace, "brave-search");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ name: "brave-search", version: "1.0.0", description: "Headless web search via Brave Search" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(root, "search.js"),
        [
          "if (!process.env.BRAVE_API_KEY) throw new Error('missing key');",
          "process.stdout.write(process.env.BRAVE_API_KEY === 'test-brave-key' ? 'configured' : 'unexpected');",
          "",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        join(root, "SKILL.md"),
        [
          "---",
          "name: brave-search",
          "description: Web search and content extraction via Brave Search API.",
          "---",
          "",
          "# Brave Search",
          "",
        ].join("\n"),
        "utf8",
      );
      const descriptor = { ...braveSearchOverlayDescriptor(), env: ["BRAVE_API_KEY"] };

      const preview = await previewAmbientCliPackageInstallSource(workspace, { source: "./brave-search", descriptor });
      expect(preview).toMatchObject({
        installable: true,
        envStatus: [expect.objectContaining({ name: "BRAVE_API_KEY", configured: false })],
        errors: [],
      });

      await installAmbientCliPackageSource(workspace, { source: "./brave-search", descriptor });
      await expect(runAmbientCliPackageCommand(workspace, { packageName: "brave-search", command: "search" })).rejects.toThrow(
        "Ambient CLI package env requirements are missing: BRAVE_API_KEY",
      );

      await writeFile(join(workspace, "brave_api_key.txt"), "test-brave-key\n", "utf8");
      await expect(
        setAmbientCliPackageEnvBinding(workspace, {
          packageName: "brave-search",
          envName: "BRAVE_API_KEY",
          filePath: "./brave_api_key.txt",
        }),
      ).resolves.toMatchObject({ configured: true, source: "file", filePath: "./brave_api_key.txt" });

      const result = await runAmbientCliPackageCommand(workspace, { packageName: "brave-search", command: "search" });
      expect(result.stdout).toBe("configured");
      expect(result.stdout).not.toContain("test-brave-key");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("saves pasted env secrets as app-managed references before binding", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-secret-"));
    try {
      await expect(
        saveAmbientCliPackageEnvSecret(workspace, {
          packageName: "brave-search",
          envName: "BRAVE_API_KEY",
          value: "pasted-brave-key",
        }),
      ).resolves.toMatchObject({
        name: "BRAVE_API_KEY",
        configured: true,
        source: "managed-secret",
        secretRef: expect.stringMatching(/^ambient-secret-ref:v1:[a-f0-9]{64}$/),
      });
      const bindings = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "env-bindings.json"), "utf8"));
      expect(bindings.bindings).toEqual([
        expect.objectContaining({
          packageName: "brave-search",
          envName: "BRAVE_API_KEY",
          secretRef: expect.stringMatching(/^ambient-secret-ref:v1:[a-f0-9]{64}$/),
        }),
      ]);
      expect(bindings.bindings[0]).not.toHaveProperty("filePath");
      expect(existsSync(join(workspace, ".ambient", "cli-packages", "secrets"))).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("migrates legacy managed workspace secret files before command execution", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-legacy-secret-"));
    try {
      const root = join(workspace, "brave-search");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ name: "brave-search", version: "1.0.0", description: "Headless web search via Brave Search" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(root, "search.js"),
        [
          "if (!process.env.BRAVE_API_KEY) throw new Error('missing key');",
          "process.stdout.write(process.env.BRAVE_API_KEY === 'legacy-brave-key' ? 'configured' : 'unexpected');",
          "",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        join(root, "SKILL.md"),
        [
          "---",
          "name: brave-search",
          "description: Web search and content extraction via Brave Search API.",
          "---",
          "",
          "# Brave Search",
          "",
        ].join("\n"),
        "utf8",
      );
      const descriptor = { ...braveSearchOverlayDescriptor(), env: ["BRAVE_API_KEY"] };
      await installAmbientCliPackageSource(workspace, { source: "./brave-search", descriptor });

      const legacySecretPath = join(workspace, ".ambient", "cli-packages", "secrets", "brave-search", "BRAVE_API_KEY.secret");
      await mkdir(join(legacySecretPath, ".."), { recursive: true });
      await writeFile(legacySecretPath, "legacy-brave-key\n", "utf8");
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "env-bindings.json"),
        `${JSON.stringify(
          {
            bindings: [
              {
                packageName: "brave-search",
                envName: "BRAVE_API_KEY",
                filePath: "./.ambient/cli-packages/secrets/brave-search/BRAVE_API_KEY.secret",
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = await runAmbientCliPackageCommand(workspace, { packageName: "brave-search", command: "search" });
      const bindings = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "env-bindings.json"), "utf8"));

      expect(result.stdout).toBe("configured");
      expect(existsSync(legacySecretPath)).toBe(false);
      expect(bindings.bindings).toEqual([
        expect.objectContaining({
          packageName: "brave-search",
          envName: "BRAVE_API_KEY",
          secretRef: expect.stringMatching(/^ambient-secret-ref:v1:[a-f0-9]{64}$/),
        }),
      ]);
      expect(bindings.bindings[0]).not.toHaveProperty("filePath");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects Ambient CLI env bindings outside the workspace or from empty files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-env-reject-"));
    try {
      await writeFile(join(workspace, "empty.txt"), "\n", "utf8");
      await expect(
        setAmbientCliPackageEnvBinding(workspace, {
          packageName: "brave-search",
          envName: "BRAVE_API_KEY",
          filePath: "../outside.txt",
        }),
      ).rejects.toThrow("Ambient CLI env binding file must stay inside the workspace.");
      await expect(
        setAmbientCliPackageEnvBinding(workspace, {
          packageName: "brave-search",
          envName: "BRAVE_API_KEY",
          filePath: "./empty.txt",
        }),
      ).rejects.toThrow("Ambient CLI env binding file is empty.");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs lockfile-backed npm dependencies before health checks when requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-deps-"));
    try {
      const root = join(workspace, "brave-search");
      await seedCliPackageWithLocalDependency(root);
      const descriptor = {
        ...braveSearchOverlayDescriptor(),
        commands: {
          search: {
            command: "node",
            args: ["./search.js"],
            cwd: "package",
            description: "Run Brave Search.",
            healthCheck: ["node", "./search.js", "health"],
          },
        },
      };

      const missingDepsPreview = await previewAmbientCliPackageInstallSource(workspace, { source: "./brave-search", descriptor });
      expect(missingDepsPreview).toMatchObject({
        installable: true,
        healthChecks: [],
        errors: [],
      });

      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "./brave-search",
        descriptor,
        installDependencies: true,
      });
      expect(preview).toMatchObject({
        installable: false,
        dependencyInstall: expect.objectContaining({
          attempted: false,
          passed: true,
          skipped: true,
          command: ["npm", "ci", "--ignore-scripts"],
          reason: expect.stringContaining("not run during package preview"),
        }),
        healthChecks: [],
        errors: [expect.stringContaining("immutable sha-pinned source")],
      });

      await expect(
        installAmbientCliPackageSource(workspace, {
          source: "./brave-search",
          descriptor,
          installDependencies: true,
        }),
      ).rejects.toThrow(/immutable sha-pinned source/);
      await expect(readFile(join(root, "node_modules", "ambient-helper", "index.js"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires immutable sources for optional npm dependencies", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-optional-deps-"));
    try {
      const root = join(workspace, "brave-search");
      await seedCliPackageWithLocalDependency(root, "optionalDependencies");
      const descriptor = {
        ...braveSearchOverlayDescriptor(),
        commands: {
          search: {
            command: "node",
            args: ["./search.js"],
            cwd: "package",
            description: "Run Brave Search.",
            healthCheck: ["node", "./search.js", "health"],
          },
        },
      };

      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "./brave-search",
        descriptor,
        installDependencies: true,
      });
      expect(preview).toMatchObject({
        installable: false,
        dependencyInstall: expect.objectContaining({
          attempted: false,
          passed: true,
          skipped: true,
          command: ["npm", "ci", "--ignore-scripts"],
          reason: expect.stringContaining("not run during package preview"),
        }),
        healthChecks: [],
        errors: [expect.stringContaining("immutable sha-pinned source")],
      });

      await expect(
        installAmbientCliPackageSource(workspace, {
          source: "./brave-search",
          descriptor,
          installDependencies: true,
        }),
      ).rejects.toThrow(/immutable sha-pinned source/);
      await expect(readFile(join(root, "node_modules", "ambient-helper", "index.js"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects dependency setup for npm packages without a package lock", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-no-lock-"));
    try {
      const root = join(workspace, "cli-fixture");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ name: "no-lock-cli", version: "0.1.0", dependencies: { "ambient-helper": "file:./deps/ambient-helper" } }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(root, "ambient-cli.json"),
        `${JSON.stringify({ name: "no-lock-cli", commands: { noop: { command: "node", args: ["--version"], cwd: "package" } } }, null, 2)}\n`,
        "utf8",
      );

      const preview = await previewAmbientCliPackageInstallSource(workspace, { source: "./cli-fixture", installDependencies: true });
      expect(preview).toMatchObject({
        installable: false,
        dependencyInstall: expect.objectContaining({
          attempted: false,
          passed: false,
          reason: expect.stringContaining("Missing package-lock.json"),
        }),
      });
      expect(preview.errors).toEqual(expect.arrayContaining([expect.stringContaining("Missing package-lock.json")]));
      await expect(installAmbientCliPackageSource(workspace, { source: "./cli-fixture", installDependencies: true })).rejects.toThrow(
        /Missing package-lock\.json/,
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews and installs pinned Git-backed CLI packages from a repository subdirectory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-workspace-"));
    try {
      const repo = join(workspace, "cli-repo");
      await seedCliFixture(repo);
      await git(["init"], repo);
      await git(["add", "."], repo);
      await git(["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed cli package"], repo);
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sha = String(stdout).trim();

      const preview = await previewAmbientCliPackageInstallSource(workspace, { source: repo, path: "./cli-fixture", sha });
      expect(preview).toMatchObject({
        source: repo,
        path: "./cli-fixture",
        sha,
        installable: true,
        candidate: expect.objectContaining({ name: "ambient-json-cli" }),
        errors: [],
      });

      const installed = await installAmbientCliPackageSource(workspace, { source: repo, path: "./cli-fixture", sha });
      expect(installed).toMatchObject({ name: "ambient-json-cli", installed: true });
      expect(installed.source).toContain(".ambient/cli-packages/imported");

      await writeFile(join(workspace, "payload.json"), `${JSON.stringify({ message: "git cli" })}\n`, "utf8");
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-json-cli",
        command: "json-pick",
        args: ["payload.json", "message"],
      });
      expect(result.stdout?.trim()).toBe("git cli");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects external Git helper sources before preview cloning CLI packages", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-unsafe-git-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "ext::sh -c touch /tmp/ambient-cli-ext-owned",
        path: "./cli-fixture",
        sha: "0123456789abcdef0123456789abcdef01234567",
      });
      expect(preview).toMatchObject({
        installable: false,
        errors: [expect.stringMatching(/external Git helper protocols are not allowed|Unsupported Git source/i)],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts credential-bearing Git sources in failed CLI package previews", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-credential-git-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "https://user:token@example.test/repo.git",
        path: "./cli-fixture",
        sha: "0123456789abcdef0123456789abcdef01234567",
      });
      expect(preview.installable).toBe(false);
      expect(preview.source).toBe("https://example.test/repo.git");
      expect(JSON.stringify(preview)).not.toContain("token");
      expect(preview.errors.join("\n")).toMatch(/must not embed credentials/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts credential-bearing Git sources in no-sha CLI package previews", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-no-sha-credential-git-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "https://user:token@example.test/repo.git",
        path: "./cli-fixture",
      });
      expect(preview.installable).toBe(false);
      expect(preview.source).toBe("https://example.test/repo.git");
      expect(JSON.stringify(preview)).not.toContain("token");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not treat Windows absolute local preview paths as credential-bearing Git URLs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-windows-path-preview-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "C:\\workspace\\cli-fixture",
      });
      expect(preview.installable).toBe(false);
      expect(preview.source).toBe("C:\\workspace\\cli-fixture");
      expect(preview.errors.join("\n")).not.toMatch(/credentials|query strings|fragments/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts credentials embedded in rejected helper-shaped Git preview sources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-helper-credential-git-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "git+ext::https://user:token@example.test/repo.git",
        path: "./cli-fixture",
        sha: "0123456789abcdef0123456789abcdef01234567",
      });
      expect(preview.installable).toBe(false);
      expect(preview.source).toBe("git+ext::https://example.test/repo.git");
      expect(JSON.stringify(preview)).not.toContain("token");
      expect(preview.errors.join("\n")).toMatch(/external Git helper protocols are not allowed/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts token query strings in failed CLI package Git previews", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-query-token-git-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "https://example.test/repo.git?token=secret#access_token=also",
        path: "./cli-fixture",
        sha: "0123456789abcdef0123456789abcdef01234567",
      });
      expect(preview.installable).toBe(false);
      expect(preview.source).toBe("https://example.test/repo.git");
      expect(JSON.stringify(preview)).not.toContain("secret");
      expect(JSON.stringify(preview)).not.toContain("also");
      expect(preview.errors.join("\n")).toMatch(/must not include query strings/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("strips helper-wrapped Git preview query strings even without credential-shaped names", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-helper-query-git-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "git+ext::https://example.test/repo.git?auth=secret",
        path: "./cli-fixture",
        sha: "0123456789abcdef0123456789abcdef01234567",
      });
      expect(preview.installable).toBe(false);
      expect(preview.source).toBe("git+ext::https://example.test/repo.git");
      expect(JSON.stringify(preview)).not.toContain("secret");
      expect(preview.errors.join("\n")).toMatch(/external Git helper protocols are not allowed/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts helper-wrapped Git preview credentials when query strings are also present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-helper-combined-credential-git-"));
    try {
      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "git+ext::https://user:token@example.test/repo.git?auth=secret",
        path: "./cli-fixture",
        sha: "0123456789abcdef0123456789abcdef01234567",
      });
      expect(preview.installable).toBe(false);
      expect(preview.source).toBe("git+ext::https://example.test/repo.git");
      expect(JSON.stringify(preview)).not.toContain("token");
      expect(JSON.stringify(preview)).not.toContain("secret");
      expect(preview.errors.join("\n")).toMatch(/external Git helper protocols are not allowed/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews and installs pinned Git package subdirectories with a descriptor overlay", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-git-overlay-"));
    try {
      const repo = join(workspace, "pi-skills");
      const packageRoot = join(repo, "brave-search");
      await mkdir(packageRoot, { recursive: true });
      await writeFile(join(repo, "README.md"), "# skills\n", "utf8");
      await writeFile(
        join(packageRoot, "package.json"),
        `${JSON.stringify({ name: "brave-search", version: "1.0.0", description: "Headless web search via Brave Search" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(packageRoot, "search.js"), "process.stdout.write(process.argv.slice(2).join('|'));\n", "utf8");
      await writeFile(
        join(packageRoot, "SKILL.md"),
        [
          "---",
          "name: brave-search",
          "description: Web search and content extraction via Brave Search API.",
          "---",
          "",
          "# Brave Search",
          "",
        ].join("\n"),
        "utf8",
      );
      await git(["init"], repo);
      await git(["add", "."], repo);
      await git(["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed brave package"], repo);
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sha = String(stdout).trim();
      const descriptor = braveSearchOverlayDescriptor();

      const preview = await previewAmbientCliPackageInstallSource(workspace, { source: repo, path: "./brave-search", sha, descriptor });
      expect(preview).toMatchObject({
        installable: true,
        candidate: expect.objectContaining({ name: "brave-search", commands: [expect.objectContaining({ name: "search" })] }),
        errors: [],
      });

      const installed = await installAmbientCliPackageSource(workspace, { source: repo, path: "./brave-search", sha, descriptor });
      expect(installed).toMatchObject({ name: "brave-search", installed: true });

      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "brave-search",
        command: "search",
        args: ["git", "overlay"],
      });
      expect(result.stdout).toBe("git|overlay");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
