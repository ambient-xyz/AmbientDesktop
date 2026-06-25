import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCapabilityBuilderRepair,
  capabilityBuilderApplyRepairText,
  capabilityBuilderDependencyRuntimeGuidance,
  capabilityBuilderHistoryText,
  capabilityBuilderInstallDepsOutputPreview,
  capabilityBuilderInstallDepsText,
  capabilityBuilderListFilesText,
  capabilityBuilderListFilesOutputPreview,
  capabilityBuilderRegistrationRepairText,
  capabilityBuilderRemovalPlanText,
  capabilityBuilderPreviewText,
  capabilityBuilderReadFileText,
  capabilityBuilderRegisterText,
  capabilityBuilderRepairPlanText,
  capabilityBuilderScaffoldText,
  capabilityBuilderUpdatePlanText,
  capabilityBuilderUnregisterText,
  capabilityBuilderValidateText,
  capabilityBuilderWriteFileText,
  discoverCapabilityBuilderHistory,
  installCapabilityBuilderDependencies,
  listCapabilityBuilderFiles,
  planCapabilityBuilderRemoval,
  planCapabilityBuilderRepair,
  planCapabilityBuilderUpdate,
  previewCapabilityBuilderPackage,
  readCapabilityBuilderFile,
  registerCapabilityBuilderPackage,
  repairCapabilityBuilderRegistrationMetadata,
  saveCapabilityBuilderEnvSecret,
  scaffoldCapabilityBuilderPackage,
  unregisterCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
  writeCapabilityBuilderFile,
} from "./capabilityBuilder";
import { uninstallAmbientCliPackageSource } from "./capabilityBuilderAmbientCliFacade";
import { MANAGED_INSTALL_ROOT_ENV } from "./capabilityBuilderSetupFacade";

describe("Capability Builder scaffold", () => {
  it("creates a deterministic managed Ambient CLI package with Git provenance", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        kind: "artifact generator",
        provider: "Piper",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      expect(result.name).toBe("ambient-piper-tts");
      expect(result.relativeRootPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts");
      expect(result.sourceRef).toMatchObject({
        kind: "capability-builder-source",
        packageName: "ambient-piper-tts",
        relativeRootPath: "./.ambient/capability-builder/packages/ambient-piper-tts",
        sourcePath: "./.ambient/capability-builder/packages/ambient-piper-tts",
      });
      expect(result.files).toEqual(["ambient-cli.json", "SKILL.md", "scripts/run.mjs", "tests/smoke.test.mjs"]);
      expect(result.gitSha).toMatch(/^[a-f0-9]{40}$/);
      await expect(stat(join(result.rootPath, ".git"))).resolves.toBeTruthy();
      expect(capabilityBuilderScaffoldText(result)).toContain("Python setup guidance: default to a package-local .venv");

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      expect(descriptor).toMatchObject({
        name: "ambient-piper-tts",
        version: "0.1.0",
        skills: "./SKILL.md",
        commands: {
          piper_tts: {
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
            healthCheck: ["node", "./scripts/run.mjs", "--health"],
          },
        },
        artifacts: { outputTypes: ["WAV"] },
      });
      await expect(readFile(result.skillPath, "utf8")).resolves.toContain("Generate WAV voice files from text using Piper");
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        schemaVersion: "ambient-capability-builder-v1",
        name: "ambient-piper-tts",
        version: "0.1.0",
        status: "draft",
      });

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      expect(preview).toMatchObject({
        packageName: "ambient-piper-tts",
        valid: true,
        errors: [],
        warnings: [],
        descriptor: {
          name: "ambient-piper-tts",
          commandNames: ["piper_tts"],
          envNames: [],
          envRequirements: [],
          networkHosts: [],
          modelAssets: [],
          artifactOutputTypes: ["WAV"],
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("lists, reads, and writes managed Builder source without generic workspace paths", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-files-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "file-tools",
        goal: "Generate text artifacts",
      });

      const listed = await listCapabilityBuilderFiles(workspace, { sourcePath: scaffold.sourceRef.sourcePath });
      expect(listed.files.map((file) => file.path)).toEqual(expect.arrayContaining(["SKILL.md", "ambient-cli.json", "scripts/run.mjs"]));
      expect(capabilityBuilderListFilesText(listed)).toContain("ambient_capability_builder_read_file");

      const read = await readCapabilityBuilderFile(workspace, {
        sourcePath: scaffold.sourceRef.sourcePath,
        filePath: "SKILL.md",
      });
      expect(read.content).toContain("Generate text artifacts");
      expect(read.truncated).toBe(false);
      expect(capabilityBuilderReadFileText(read)).toContain("File: SKILL.md");

      const written = await writeCapabilityBuilderFile(workspace, {
        sourcePath: scaffold.sourceRef.sourcePath,
        filePath: "notes/plan.md",
        content: "# Plan\n\nUse Builder file tools.\n",
        reason: "Record package notes",
      });
      expect(written).toMatchObject({
        packageName: "ambient-file-tools",
        filePath: "notes/plan.md",
        created: true,
        reason: "Record package notes",
      });
      expect(written.gitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(capabilityBuilderWriteFileText(written)).toContain("ambient_capability_builder_preview");
      await expect(readFile(join(scaffold.rootPath, "notes", "plan.md"), "utf8")).resolves.toContain("Builder file tools");
      await expect(
        writeCapabilityBuilderFile(workspace, {
          sourcePath: scaffold.sourceRef.sourcePath,
          filePath: "capability-build.json",
          content: "{}",
          reason: "overwrite metadata",
        }),
      ).rejects.toThrow(/metadata or logs/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("bounds Builder file listing and omits generated directories by default", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-large-list-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "large-list",
        goal: "Inspect source without generated dependency blowups",
      });
      const generatedPackageRoot = join(scaffold.rootPath, ".venv", "lib", "python3.12", "site-packages", "huge_dep");
      await mkdir(generatedPackageRoot, { recursive: true });
      await writeFile(join(generatedPackageRoot, "module_a.py"), "print('a')\n", "utf8");
      await writeFile(join(generatedPackageRoot, "module_b.py"), "print('b')\n", "utf8");
      const generatedCacheRoot = join(scaffold.rootPath, ".cache", "bulk");
      await mkdir(generatedCacheRoot, { recursive: true });
      for (let index = 0; index < 1_001; index += 1) {
        await writeFile(join(generatedCacheRoot, `entry-${index}.txt`), "x", "utf8");
      }
      await mkdir(join(scaffold.rootPath, "docs", "deep", "nested"), { recursive: true });
      await writeFile(join(scaffold.rootPath, "docs", "deep", "nested", "notes.md"), "# Notes\n", "utf8");

      const listed = await listCapabilityBuilderFiles(workspace, { sourcePath: scaffold.sourceRef.sourcePath });
      expect(listed.files.map((file) => file.path)).toEqual(expect.arrayContaining(["SKILL.md", "ambient-cli.json", "scripts/run.mjs"]));
      expect(listed.files.some((file) => file.path.startsWith(".venv/"))).toBe(false);
      expect(listed.omittedDirectories).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ".venv", reason: "generated", fileCount: 2 })]),
      );
      expect(listed.omittedDirectories).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ".cache", reason: "generated", fileCount: 1_000, truncated: true })]),
      );
      expect(capabilityBuilderListFilesText(listed)).toContain("Generated/dependency directories are summarized");
      expect(capabilityBuilderListFilesText(listed)).toContain("long_context_process");
      expect(capabilityBuilderListFilesText(listed)).toContain("file_read");
      expect(listed.inventoryArtifact).toMatchObject({
        path: expect.stringMatching(/^\.ambient\/tool-outputs\//),
        inventoryFileCountTruncated: false,
      });
      expect(capabilityBuilderListFilesOutputPreview(listed)).toMatchObject({
        kind: "large-output",
        items: [
          expect.objectContaining({
            artifactPath: listed.inventoryArtifact?.path,
            suggestedTools: ["file_read", "long_context_process"],
          }),
        ],
      });
      const inventoryText = await readFile(join(workspace, listed.inventoryArtifact!.path), "utf8");
      expect(inventoryText).toContain("Ambient Capability Builder filtered file inventory");
      expect(inventoryText).toContain("Generated content: omitted by default");
      expect(inventoryText).toContain("- scripts/run.mjs");
      expect(inventoryText).toContain("- .venv/");
      expect(inventoryText).not.toContain("huge_dep/module_a.py");

      await expect(
        listCapabilityBuilderFiles(workspace, {
          sourcePath: scaffold.sourceRef.sourcePath,
          includeGenerated: true,
        }),
      ).rejects.toThrow(/includeGenerated=true requires a narrow pathPrefix/);

      const generatedPage = await listCapabilityBuilderFiles(workspace, {
        sourcePath: scaffold.sourceRef.sourcePath,
        pathPrefix: ".venv/lib/python3.12/site-packages/huge_dep",
        includeGenerated: true,
        maxEntries: 1,
      });
      expect(generatedPage.files).toHaveLength(1);
      expect(generatedPage.totalFileCountTruncated).toBe(true);
      expect(generatedPage.nextCursor).toBeTruthy();
      expect(capabilityBuilderListFilesText(generatedPage)).toContain("Structured next page input:");
      expect(capabilityBuilderListFilesText(generatedPage)).toContain(`"pathPrefix":".venv/lib/python3.12/site-packages/huge_dep"`);
      expect(capabilityBuilderListFilesText(generatedPage)).toContain(`"includeGenerated":true`);
      expect(generatedPage.inventoryArtifact).toMatchObject({
        inventoryFileCount: 2,
        inventoryFileCountTruncated: false,
      });
      const generatedInventoryText = await readFile(join(workspace, generatedPage.inventoryArtifact!.path), "utf8");
      expect(generatedInventoryText).toContain("Generated content: included for this scoped request");
      expect(generatedInventoryText).toContain("- .venv/lib/python3.12/site-packages/huge_dep/module_a.py");
      expect(generatedInventoryText).toContain("- .venv/lib/python3.12/site-packages/huge_dep/module_b.py");
      await expect(
        listCapabilityBuilderFiles(workspace, {
          sourcePath: scaffold.sourceRef.sourcePath,
          pathPrefix: "scripts",
          maxEntries: 1,
          cursor: generatedPage.nextCursor,
        }),
      ).rejects.toThrow(/cursor is invalid or does not match/);
      const otherScaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "other-large-list",
        goal: "Inspect another package",
      });
      const otherGeneratedRoot = join(otherScaffold.rootPath, ".venv", "lib", "python3.12", "site-packages", "huge_dep");
      await mkdir(otherGeneratedRoot, { recursive: true });
      await writeFile(join(otherGeneratedRoot, "module_a.py"), "print('other')\n", "utf8");
      await expect(
        listCapabilityBuilderFiles(workspace, {
          sourcePath: otherScaffold.sourceRef.sourcePath,
          pathPrefix: ".venv/lib/python3.12/site-packages/huge_dep",
          includeGenerated: true,
          maxEntries: 1,
          cursor: generatedPage.nextCursor,
        }),
      ).rejects.toThrow(/cursor is invalid or does not match/);
      const generatedNextPage = await listCapabilityBuilderFiles(workspace, {
        sourcePath: scaffold.sourceRef.sourcePath,
        pathPrefix: ".venv/lib/python3.12/site-packages/huge_dep",
        includeGenerated: true,
        maxEntries: 1,
        cursor: generatedPage.nextCursor,
      });
      expect([...generatedPage.files, ...generatedNextPage.files].map((file) => file.path).sort()).toEqual([
        ".venv/lib/python3.12/site-packages/huge_dep/module_a.py",
        ".venv/lib/python3.12/site-packages/huge_dep/module_b.py",
      ]);

      const depthLimited = await listCapabilityBuilderFiles(workspace, {
        sourcePath: scaffold.sourceRef.sourcePath,
        pathPrefix: "docs",
        maxDepth: 1,
      });
      expect(depthLimited.files).toEqual([]);
      expect(depthLimited.omittedDirectories).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "docs/deep/nested", reason: "maxDepth", fileCount: 1 })]),
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews env secret metadata and declared network hosts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "brave-api-check",
        goal: "Check Brave Search API connectivity.",
        locality: "network",
      });
      await writeFile(
        result.descriptorPath,
        `${JSON.stringify(
          {
            name: "ambient-brave-api-check",
            version: "0.1.0",
            description: "Check Brave Search API connectivity.",
            skills: "./SKILL.md",
            env: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
            networkHosts: ["api.search.brave.com"],
            commands: {
              brave_check: {
                command: "node",
                args: ["./scripts/run.mjs"],
                cwd: "package",
                description: "Fetch a tiny Brave Search response.",
                healthCheck: ["node", "--version"],
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "brave-api-check" });
      expect(preview.valid).toBe(true);
      expect(preview.descriptor).toMatchObject({
        envNames: ["BRAVE_API_KEY"],
        envRequirements: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
        networkHosts: ["api.search.brave.com"],
      });
      expect(preview.risks).toEqual(
        expect.arrayContaining([
          expect.stringContaining("required env secrets: BRAVE_API_KEY"),
          expect.stringContaining("network/API hosts: api.search.brave.com"),
        ]),
      );
      const text = capabilityBuilderPreviewText(preview);
      expect(text).toContain("BRAVE_API_KEY (required, Brave Search API key.)");
      expect(text).toContain("network hosts: api.search.brave.com");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("scaffolds search providers as stdout-first unless file artifacts are explicit", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "brave-search",
        goal: "Search Brave Search and return concise JSON results",
        installerShape: "search-provider",
        kind: "connector/API",
        provider: "Brave Search",
        locality: "network",
        responseFormats: ["JSON"],
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      expect(descriptor.responseFormats).toEqual(["JSON"]);
      expect(descriptor.artifacts).toMatchObject({
        outputTypes: [],
        policy: "return concise JSON/text in stdout; only write files for explicit export or large-output requests",
      });
      await expect(readFile(result.skillPath, "utf8")).resolves.toContain("Return concise search results on stdout by default");
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        installerShape: "search-provider",
        outputArtifactTypes: [],
        responseFormats: ["JSON"],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("warns when network-looking commands omit declared network hosts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "hidden-api-tool",
        goal: "Call an API without declaring hosts.",
        locality: "network",
      });
      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.commands.hidden_api = {
        command: "node",
        args: ["./scripts/api.mjs"],
        cwd: "package",
        description: "Fetch an API endpoint.",
        healthCheck: ["node", "--version"],
      };
      delete descriptor.commands.hidden_api_tool;
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "hidden-api-tool" });
      expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringContaining("appears to use network/API behavior")]));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("confines generated names to the managed builder root", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "../../evil",
        goal: "Do a thing",
      });
      expect(result.relativeRootPath).toBe("./.ambient/capability-builder/packages/ambient-evil");
      await expect(scaffoldCapabilityBuilderPackage(workspace, { name: "../../evil", goal: "Again" })).rejects.toThrow("already exists");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("resolves managed packages by descriptor name when the folder slug differs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "brave-search-add-brave-search-as-an-ambient-web",
        goal: "Add Brave Search as an Ambient web search provider",
        installerShape: "search-provider",
        provider: "Brave Search",
        locality: "network",
        envNames: ["BRAVE_API_KEY"],
        networkHosts: ["api.search.brave.com"],
        responseFormats: ["JSON"],
      });
      const descriptor = JSON.parse(await readFile(scaffold.descriptorPath, "utf8"));
      descriptor.name = "ambient-brave-search";
      descriptor.env = [{ name: "BRAVE_API_KEY", required: true }];
      await writeFile(scaffold.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      manifest.name = "ambient-brave-search";
      await writeFile(scaffold.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const byPackageName = await previewCapabilityBuilderPackage(workspace, { packageName: "ambient-brave-search" });
      const bySourcePath = await previewCapabilityBuilderPackage(workspace, { sourcePath: scaffold.relativeRootPath });
      const history = await discoverCapabilityBuilderHistory(workspace, { packageName: "ambient-brave-search" });
      const saved = await saveCapabilityBuilderEnvSecret(workspace, {
        sourcePath: scaffold.relativeRootPath,
        envName: "BRAVE_API_KEY",
        value: "test-brave-key",
      });

      expect(byPackageName.relativeRootPath).toBe(scaffold.relativeRootPath);
      expect(byPackageName.packageName).toBe("ambient-brave-search");
      expect(bySourcePath.relativeRootPath).toBe(scaffold.relativeRootPath);
      expect(history.entries.map((entry) => entry.relativeRootPath)).toEqual([scaffold.relativeRootPath]);
      expect(capabilityBuilderHistoryText(history)).toContain(`sourcePath: ${scaffold.relativeRootPath}`);
      expect(saved).toMatchObject({
        packageName: "ambient-brave-search",
        sourcePath: scaffold.relativeRootPath,
        envName: "BRAVE_API_KEY",
        configured: true,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires an exact sourcePath when a descriptor package name is ambiguous", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const first = await scaffoldCapabilityBuilderPackage(workspace, { name: "duplicate-one", goal: "First duplicate" });
      const second = await scaffoldCapabilityBuilderPackage(workspace, { name: "duplicate-two", goal: "Second duplicate" });
      for (const descriptorPath of [first.descriptorPath, second.descriptorPath]) {
        const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
        descriptor.name = "ambient-duplicate";
        await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      }

      await expect(previewCapabilityBuilderPackage(workspace, { packageName: "ambient-duplicate" })).rejects.toThrow(
        'Capability builder package name "ambient-duplicate" matched multiple managed sources',
      );
      await expect(previewCapabilityBuilderPackage(workspace, { sourcePath: second.relativeRootPath })).resolves.toMatchObject({
        relativeRootPath: second.relativeRootPath,
        packageName: "ambient-duplicate",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reports static preview errors, warnings, and dependency risks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "network-tool",
        goal: "Fetch a thing",
      });
      await writeFile(
        result.descriptorPath,
        `${JSON.stringify(
          {
            name: "ambient-network-tool",
            version: "0.1.0",
            skills: "../outside",
            commands: {
              "bad command": {
                command: "sh",
                args: ["../do.sh"],
                cwd: "elsewhere",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(result.rootPath, "package.json"),
        `${JSON.stringify({ scripts: { postinstall: "node setup.js" }, dependencies: { axios: "^1.0.0" } }, null, 2)}\n`,
        "utf8",
      );
      const preview = await previewCapabilityBuilderPackage(workspace, { path: result.relativeRootPath });
      expect(preview.valid).toBe(false);
      expect(preview.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("unsupported cwd"), expect.stringContaining("skills path escapes")]),
      );
      expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringContaining("has no healthCheck")]));
      expect(preview.risks).toEqual(
        expect.arrayContaining([
          expect.stringContaining("uses a shell entrypoint"),
          expect.stringContaining("parent traversal"),
          expect.stringContaining("lifecycle scripts"),
          expect.stringContaining("declares dependencies"),
        ]),
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates a read-only update plan with approval checkpoints and rollback context", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        kind: "artifact generator",
        provider: "Piper",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      const descriptor = JSON.parse(await readFile(scaffold.descriptorPath, "utf8"));
      descriptor.version = "0.2.0";
      await writeFile(scaffold.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const result = await planCapabilityBuilderUpdate(workspace, {
        packageName: "piper-tts",
        requestedChanges: "Add a speed option and preserve WAV artifact output.",
        targetVersion: "0.2.0",
        notes: "Keep the command name stable.",
      });

      expect(result).toMatchObject({
        packageName: "ambient-piper-tts",
        requestedChanges: "Add a speed option and preserve WAV artifact output.",
        targetVersion: "0.2.0",
        notes: "Keep the command name stable.",
        mutationProhibited: true,
        errors: [],
        preview: {
          valid: true,
          descriptor: {
            commandNames: ["piper_tts"],
            artifactOutputTypes: ["WAV"],
          },
        },
        buildManifest: {
          status: "draft",
          provider: "Piper",
        },
      });
      expect(result.recommendedSteps).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Add a speed option"),
          expect.stringContaining("ambient_capability_builder_preview"),
          expect.stringContaining("ambient_capability_builder_validate"),
        ]),
      );
      expect(result.approvalCheckpoints).toEqual(expect.arrayContaining([expect.stringContaining("dependency/setup commands")]));
      expect(result.rollbackPlan).toEqual(expect.arrayContaining([expect.stringContaining(scaffold.gitSha!)]));
      expect(capabilityBuilderUpdatePlanText(result)).toContain("Mode: read-only planning");
      expect(capabilityBuilderUpdatePlanText(result)).toContain("Next: present this update plan");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates a read-only removal plan with installed state, inventory, and rollback context", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        kind: "artifact generator",
        provider: "Piper",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(join(scaffold.rootPath, "capability-validation-log.jsonl"), '{"status":"succeeded"}\n', "utf8");
      await writeFile(join(scaffold.rootPath, "sample.wav"), "RIFF test", "utf8");

      const result = await planCapabilityBuilderRemoval(workspace, {
        packageName: "piper-tts",
        installedPackageId: "ambient-cli:generated:ambient-piper-tts",
        installedSource: "./.ambient/cli-packages/imported/ambient-piper-tts",
        reason: "User wants to hide the capability from search.",
        notes: "Preserve source and artifacts.",
      });

      expect(result).toMatchObject({
        packageName: "ambient-piper-tts",
        sourceExists: true,
        installedPackageId: "ambient-cli:generated:ambient-piper-tts",
        installedSource: "./.ambient/cli-packages/imported/ambient-piper-tts",
        reason: "User wants to hide the capability from search.",
        notes: "Preserve source and artifacts.",
        mutationProhibited: true,
        errors: [],
        preview: {
          valid: true,
          descriptor: {
            commandNames: ["piper_tts"],
            artifactOutputTypes: ["WAV"],
          },
        },
        buildManifest: {
          status: "draft",
          provider: "Piper",
        },
      });
      expect(result.sourceInventory.logFiles).toContain("capability-validation-log.jsonl");
      expect(result.sourceInventory.possibleArtifactFiles).toContain("sample.wav");
      expect(result.recommendedSteps).toEqual(expect.arrayContaining([expect.stringContaining("disable/unregister")]));
      expect(result.approvalCheckpoints).toEqual(expect.arrayContaining([expect.stringContaining("artifact deletion")]));
      expect(result.rollbackPlan).toEqual(expect.arrayContaining([expect.stringContaining(scaffold.gitSha!)]));
      expect(result.preserveByDefault).toEqual(expect.arrayContaining(["managed builder source", "generated artifacts"]));
      expect(capabilityBuilderRemovalPlanText(result)).toContain("Mode: read-only planning");
      expect(capabilityBuilderRemovalPlanText(result)).toContain("Next: present this removal plan");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discovers preserved generated capability builder history after unregister", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        outputArtifactTypes: ["WAV"],
      });
      await writeFile(
        join(workspace, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "tests", "smoke.test.mjs"),
        "import { writeFileSync } from 'node:fs';\nwriteFileSync('sample.wav', 'RIFF test');\n",
        "utf8",
      );
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      await unregisterCapabilityBuilderPackage(workspace, {
        packageName: "piper-tts",
        installedPackageId: registered.installedPackage.id,
      });

      const history = await discoverCapabilityBuilderHistory(workspace);

      expect(history.errors).toEqual([]);
      expect(history.entries).toHaveLength(1);
      expect(history.entries[0]).toMatchObject({
        packageName: "ambient-piper-tts",
        status: "unregistered",
        valid: true,
        installedPresent: false,
        provider: "Piper",
        artifactOutputTypes: ["WAV"],
        commandNames: ["piper_tts"],
      });
      expect(history.entries[0]).not.toHaveProperty("installedPackageId");
      expect(history.entries[0].logFiles).toEqual(expect.arrayContaining(["capability-validation-log.jsonl"]));
      expect(history.entries[0].refs.installed).toBeNull();
      expect(capabilityBuilderHistoryText(history)).toContain("status: unregistered");

      const filtered = await discoverCapabilityBuilderHistory(workspace, { packageName: "piper-tts", includeRegistered: false });
      expect(filtered.entries.map((entry) => entry.packageName)).toEqual(["ambient-piper-tts"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps invalid preserved generated capability sources visible in history", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const brokenRoot = join(workspace, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
      await mkdir(brokenRoot, { recursive: true });
      await writeFile(join(brokenRoot, "ambient-cli.json"), `${JSON.stringify({ version: "0.1.0", commands: {} }, null, 2)}\n`, "utf8");

      const history = await discoverCapabilityBuilderHistory(workspace);

      expect(history.errors).toEqual([]);
      expect(history.entries).toHaveLength(1);
      expect(history.entries[0]).toMatchObject({
        packageName: "ambient-broken-tts",
        status: "invalid",
        valid: false,
        installedPresent: false,
        commandNames: [],
      });
      expect(history.entries[0].errors).toEqual(
        expect.arrayContaining(["Descriptor name is required.", "Descriptor must declare at least one command.", "SKILL.md is missing."]),
      );
      expect(capabilityBuilderHistoryText(history)).toContain("status: invalid");
      expect(capabilityBuilderHistoryText(history)).toContain("errors: Descriptor name is required.");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates a read-only repair plan for invalid generated capability sources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const brokenRoot = join(workspace, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
      await mkdir(brokenRoot, { recursive: true });
      await writeFile(
        join(brokenRoot, "ambient-cli.json"),
        `${JSON.stringify({ version: "0.1.0", commands: {}, artifacts: { outputTypes: ["WAV"] } }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(brokenRoot, "capability-validation-log.jsonl"), '{"status":"failed"}\n', "utf8");

      const result = await planCapabilityBuilderRepair(workspace, {
        packageName: "broken-tts",
        requestedRepair: "Make this TTS capability valid and ensure it produces WAV files.",
        notes: "Keep the package name stable.",
      });

      expect(result).toMatchObject({
        packageName: "ambient-broken-tts",
        requestedRepair: "Make this TTS capability valid and ensure it produces WAV files.",
        notes: "Keep the package name stable.",
        mutationProhibited: true,
        preview: {
          valid: false,
          descriptor: {
            commandNames: [],
            artifactOutputTypes: ["WAV"],
          },
        },
      });
      expect(result.errors).toEqual(
        expect.arrayContaining(["Descriptor name is required.", "Descriptor must declare at least one command.", "SKILL.md is missing."]),
      );
      expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("smoke.test.mjs is missing")]));
      expect(result.sourceInventory.logFiles).toContain("capability-validation-log.jsonl");
      expect(result.recommendedSteps).toEqual(expect.arrayContaining([expect.stringContaining("Repair static preview errors first")]));
      expect(result.validationPlan).toEqual(expect.arrayContaining([expect.stringContaining("ambient_capability_builder_validate")]));
      expect(result.rollbackPlan).toEqual(expect.arrayContaining([expect.stringContaining("Record the current source Git SHA")]));
      expect(capabilityBuilderRepairPlanText(result)).toContain("Ambient Capability Builder repair plan");
      expect(capabilityBuilderRepairPlanText(result)).toContain("Mode: read-only planning");
      expect(capabilityBuilderRepairPlanText(result)).toContain("Next: present this repair plan");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("applies approved repair files and invalidates stale validation metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const brokenRoot = join(workspace, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
      await mkdir(brokenRoot, { recursive: true });
      await writeFile(join(brokenRoot, "ambient-cli.json"), `${JSON.stringify({ version: "0.1.0", commands: {} }, null, 2)}\n`, "utf8");
      await writeFile(
        join(brokenRoot, "capability-build.json"),
        `${JSON.stringify(
          {
            schemaVersion: "ambient-capability-builder-v1",
            name: "ambient-broken-tts",
            version: "0.1.0",
            status: "validated",
            lastValidatedAt: "2026-01-01T00:00:00.000Z",
            registeredAt: "2026-01-01T00:00:00.000Z",
            refs: { lastValidated: "old", lastValidatedHash: "stale-hash", installed: "old" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = await applyCapabilityBuilderRepair(workspace, {
        packageName: "broken-tts",
        reason: "Make the generated TTS package statically valid before validation.",
        files: [
          {
            path: "ambient-cli.json",
            rationale: "Repair descriptor name, skill path, command, health check, and WAV artifact declaration.",
            content: `${JSON.stringify(
              {
                name: "ambient-broken-tts",
                version: "0.1.1",
                description: "Generate tiny WAV files from text.",
                skills: "./SKILL.md",
                commands: {
                  broken_tts: {
                    description: "Generate a tiny WAV file from text.",
                    command: "node",
                    args: ["./scripts/run.mjs"],
                    cwd: "package",
                    healthCheck: ["node", "./scripts/run.mjs", "--health"],
                  },
                },
                artifacts: { outputTypes: ["WAV"] },
              },
              null,
              2,
            )}\n`,
          },
          {
            path: "SKILL.md",
            rationale: "Restore Pi guidance for using the repaired command through Ambient CLI.",
            content:
              "---\nname: ambient-broken-tts\ndescription: Generate tiny WAV files from text.\n---\n\nUse `broken_tts` through `ambient_cli`.\n",
          },
          {
            path: "scripts/run.mjs",
            rationale: "Add a health-checkable command wrapper.",
            content: "#!/usr/bin/env node\nif (process.argv.includes('--health')) process.stdout.write('ok\\n');\n",
          },
          {
            path: "tests/smoke.test.mjs",
            rationale: "Add a smoke test placeholder before full validation.",
            content: "import { writeFileSync } from 'node:fs';\nwriteFileSync('sample.wav', 'RIFF test');\n",
          },
        ],
      });

      expect(result.packageName).toBe("ambient-broken-tts");
      expect(result.repairGitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.gitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.files).toEqual([
        expect.objectContaining({ path: "ambient-cli.json", created: false }),
        expect.objectContaining({ path: "SKILL.md", created: true }),
        expect.objectContaining({ path: "scripts/run.mjs", created: true }),
        expect.objectContaining({ path: "tests/smoke.test.mjs", created: true }),
      ]);
      expect(capabilityBuilderApplyRepairText(result)).toContain("prior validation metadata was cleared");
      expect(capabilityBuilderApplyRepairText(result)).toContain(`Repair Git SHA: ${result.repairGitSha}`);
      await expect(stat(join(brokenRoot, ".git"))).resolves.toBeTruthy();

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "broken-tts" });
      expect(preview.valid).toBe(true);
      expect(preview.descriptor?.commandNames).toEqual(["broken_tts"]);
      expect(preview.descriptor?.artifactOutputTypes).toEqual(["WAV"]);

      const manifest = JSON.parse(await readFile(join(brokenRoot, "capability-build.json"), "utf8"));
      expect(manifest).toMatchObject({
        status: "draft",
        lastRepairReason: "Make the generated TTS package statically valid before validation.",
        lastValidatedAt: null,
        registeredAt: null,
        refs: {
          latest: result.repairGitSha,
          lastValidated: null,
          lastValidatedHash: null,
          lastRepair: result.repairGitSha,
        },
      });
      expect(manifest.lastRepairedAt).toEqual(expect.any(String));

      const repairedHistory = await discoverCapabilityBuilderHistory(workspace, { packageName: "broken-tts" });
      expect(repairedHistory.entries[0].refs.lastRepair).toBe(result.repairGitSha);
      expect(capabilityBuilderHistoryText(repairedHistory)).toContain(`repair ref: ${result.repairGitSha}`);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects approved repair writes that escape managed source or target builder metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });

      await expect(
        applyCapabilityBuilderRepair(workspace, {
          packageName: "piper-tts",
          reason: "Attempt an unsafe repair.",
          files: [{ path: "../outside.txt", content: "nope", rationale: "Should be blocked." }],
        }),
      ).rejects.toThrow("escapes the package root");

      await expect(
        applyCapabilityBuilderRepair(workspace, {
          packageName: "piper-tts",
          reason: "Attempt a metadata edit.",
          files: [{ path: "capability-build.json", content: "{}", rationale: "Should be host-owned." }],
        }),
      ).rejects.toThrow("metadata or logs");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("runs approved dependency commands inside the managed package and records bounded output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      const result = await installCapabilityBuilderDependencies(workspace, {
        packageName: "piper-tts",
        commands: [
          {
            command: process.execPath,
            args: ["-e", "process.stdout.write('x'.repeat(4100))"],
            cwd: ".",
            rationale: "Verify dependency command output capture.",
          },
        ],
      });

      expect(result.succeeded).toBe(true);
      expect(result.startedAt).toEqual(expect.any(String));
      expect(result.completedAt).toEqual(expect.any(String));
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        status: "succeeded",
        cwd: ".",
        stdoutLength: 4100,
        stdoutTruncated: true,
        stderrLength: 0,
      });
      expect(result.commands[0].stdoutPreview).toHaveLength(4000);
      await expect(readFile(result.logPath, "utf8")).resolves.toContain('"stdoutLength":4100');
      expect(capabilityBuilderInstallDepsText(result)).toContain("4100 chars total");
      expect(capabilityBuilderInstallDepsText(result)).toContain("Total duration:");
      expect(capabilityBuilderInstallDepsText(result)).toContain("do not add arbitrary post-command wait padding");
      expect(capabilityBuilderInstallDepsOutputPreview(result)).toMatchObject({
        kind: "large-output",
        summary: expect.stringContaining("stdout 4,100 chars"),
        items: [
          {
            label: "command 1 stdout",
            chars: 4100,
            previewChars: 4000,
            truncated: true,
            artifactPath: "./.ambient/capability-builder/packages/ambient-piper-tts/capability-deps-log.jsonl",
            suggestedTools: ["file_read"],
          },
        ],
      });
      expect(capabilityBuilderInstallDepsOutputPreview(result)?.summary).not.toContain("stderr 0 chars");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reports dependency and validation logs relative to an app-managed install root", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-workspace-"));
    const appManagedRoot = await mkdtemp(join(tmpdir(), "ambient-capability-builder-app-root-"));
    const previousManagedRoot = process.env[MANAGED_INSTALL_ROOT_ENV];
    process.env[MANAGED_INSTALL_ROOT_ENV] = appManagedRoot;
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      const expectedRoot = join(appManagedRoot, ".ambient", "capability-builder", "packages", "ambient-piper-tts");
      expect(scaffold.rootPath).toBe(expectedRoot);
      expect(scaffold.relativeRootPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts");

      const deps = await installCapabilityBuilderDependencies(workspace, {
        packageName: "piper-tts",
        commands: [
          {
            command: process.execPath,
            args: ["-e", "process.stdout.write('managed-root')"],
            cwd: ".",
            rationale: "Verify dependency log path when managed installs live outside the workspace.",
          },
        ],
      });
      expect(deps.logPath).toBe(join(expectedRoot, "capability-deps-log.jsonl"));
      expect(deps.relativeLogPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts/capability-deps-log.jsonl");
      expect(capabilityBuilderInstallDepsText(deps)).toContain(
        "Log: ./.ambient/capability-builder/packages/ambient-piper-tts/capability-deps-log.jsonl",
      );
      expect(capabilityBuilderInstallDepsOutputPreview(deps)?.items[0].artifactPath).toBe(
        "./.ambient/capability-builder/packages/ambient-piper-tts/capability-deps-log.jsonl",
      );

      const validation = await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      expect(validation.logPath).toBe(join(expectedRoot, "capability-validation-log.jsonl"));
      expect(validation.relativeLogPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl");
      expect(capabilityBuilderValidateText(validation)).toContain(
        "Log: ./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl",
      );
      await expect(readFile(validation.logPath, "utf8")).resolves.toContain('"source":"healthCheck"');
    } finally {
      if (previousManagedRoot === undefined) delete process.env[MANAGED_INSTALL_ROOT_ENV];
      else process.env[MANAGED_INSTALL_ROOT_ENV] = previousManagedRoot;
      await rm(appManagedRoot, { recursive: true, force: true });
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("calls out package-manager mediated runtimes in dependency guidance", () => {
    const notes = capabilityBuilderDependencyRuntimeGuidance([
      { command: "uv", args: ["run", "--with", "scrapling", "python", "--version"], rationale: "Exercise mediated runtime guidance." },
    ]);

    expect(notes.join("\n")).toContain("`uv run --with ...` is a package-manager mediated runtime");
    expect(notes.join("\n")).toContain("the command result is still the completion signal");
    expect(notes.join("\n")).toContain("do not add arbitrary post-command wait padding");
  });

  it("calls out Python package install targets in dependency guidance", () => {
    const globalPipNotes = capabilityBuilderDependencyRuntimeGuidance([
      { command: "python3", args: ["-m", "pip", "install", "scrapling"], rationale: "Install Python dependencies." },
    ]);
    const venvPipNotes = capabilityBuilderDependencyRuntimeGuidance([
      {
        command: "uv",
        args: ["pip", "install", "--python", ".venv/bin/python", "scrapling"],
        rationale: "Install Python dependencies into .venv.",
      },
    ]);

    expect(globalPipNotes.join("\n")).toContain("Python package install detected");
    expect(globalPipNotes.join("\n")).toContain("Bare/global pip install forms should be rewritten");
    expect(venvPipNotes.join("\n")).toContain("Python package install detected");
    expect(venvPipNotes.join("\n")).not.toContain("Bare/global pip install forms should be rewritten");
  });

  it("rejects dependency command cwd escapes before running anything", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await expect(
        installCapabilityBuilderDependencies(workspace, {
          packageName: "piper-tts",
          commands: [
            {
              command: process.execPath,
              args: ["-e", "process.stdout.write('should not run')"],
              cwd: "../outside",
              rationale: "Attempt to escape the package root.",
            },
          ],
        }),
      ).rejects.toThrow("cwd escapes the package root");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("captures failed dependency command output and stops the sequence", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      const result = await installCapabilityBuilderDependencies(workspace, {
        packageName: "piper-tts",
        commands: [
          {
            command: process.execPath,
            args: ["-e", "process.stderr.write('bad setup'); process.exit(7)"],
            rationale: "Exercise failure capture.",
          },
          {
            command: process.execPath,
            args: ["-e", "process.stdout.write('skipped')"],
            rationale: "This should not run after failure.",
          },
        ],
      });

      expect(result.succeeded).toBe(false);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        status: "failed",
        exitCode: 7,
        stderrPreview: "bad setup",
        stderrLength: 9,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("runs descriptor health checks and smoke tests during validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });

      expect(result.succeeded).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.commands.map((command) => command.source)).toEqual(["healthCheck", "smokeTest"]);
      expect(result.commands[0]).toMatchObject({
        timeoutProfile: "healthCheck",
        timeoutMs: 120_000,
        idleTimeoutMs: 120_000,
      });
      expect(result.validatedAt).toBeTruthy();
      await expect(readFile(result.logPath, "utf8")).resolves.toContain('"source":"healthCheck"');
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest).toMatchObject({ status: "validated", lastValidatedAt: result.validatedAt });
      expect(manifest.refs.lastValidated).toMatch(/^[a-f0-9]{40}$/);
      expect(manifest.lastValidationLogPath).toBe(
        "./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl",
      );
      expect(manifest.lastValidationArtifacts).toEqual([]);
      expect(capabilityBuilderValidateText(result)).toContain("Status: succeeded");
      expect(capabilityBuilderValidateText(result)).toContain("Total duration:");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("applies descriptor timeout profiles and avoids unjustified CPU device selection during validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    const previousDevices = process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES;
    const previousRecommended = process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE;
    process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES = "mps,cpu";
    process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE = "mps";
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "provider-device-profile",
        goal: "Validate provider device timeout metadata.",
      });
      await writeFile(
        scaffold.descriptorPath,
        `${JSON.stringify(
          {
            name: "ambient-provider-device-profile",
            version: "0.1.0",
            skills: "./SKILL.md",
            commands: {
              model_probe: {
                command: "node",
                args: ["./scripts/run.mjs"],
                cwd: "package",
                healthCheck: ["node", "./scripts/run.mjs", "--health", "--device", "cpu"],
                timeoutProfile: "modelColdStart",
                progressPatterns: ["Loading checkpoint", "Generating"],
                devicePolicy: {
                  prefer: ["mps", "cpu"],
                  requireReasonWhenCpuForced: true,
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        scaffold.scriptPath,
        [
          "const args = process.argv.slice(2);",
          "const index = args.indexOf('--device');",
          "process.stdout.write('Loading checkpoint\\n');",
          "process.stdout.write(JSON.stringify({",
          "  argv: args,",
          "  selectedDevice: index >= 0 ? args[index + 1] : null,",
          "  availableDevices: process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES,",
          "  recommendedDevice: process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE,",
          "  expectedColdStartMs: 600000,",
          "  requiresLongRun: true",
          "}));",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, {
        packageName: "provider-device-profile",
        includeSmokeTests: false,
      });

      expect(result.succeeded).toBe(true);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        source: "healthCheck",
        commandName: "model_probe",
        timeoutProfile: "modelColdStart",
        deviceSelection: expect.objectContaining({
          recommendedDevice: "mps",
          requestedDevice: "cpu",
          selectedDevice: "mps",
          cpuOverridePrevented: true,
        }),
      });
      expect(result.commands[0]?.timeoutMs).toBeGreaterThan(120_000);
      expect(result.commands[0]?.args).toContain("mps");
      expect(result.commands[0]?.args).not.toContain("cpu");
      expect(result.commands[0]?.matchedProgressPatterns).toContain("Loading checkpoint");
      expect(result.commands[0]?.stdoutPreview).toContain('"selectedDevice":"mps"');
    } finally {
      if (previousDevices === undefined) delete process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES;
      else process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES = previousDevices;
      if (previousRecommended === undefined) delete process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE;
      else process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE = previousRecommended;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("runs bare node health checks and smoke tests when the inherited PATH omits node", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    const originalPath = process.env.PATH;
    try {
      const emptyBin = join(workspace, "empty-bin");
      await mkdir(emptyBin, { recursive: true });
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });

      process.env.PATH = emptyBin;
      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });

      expect(result.succeeded).toBe(true);
      expect(result.commands.map((command) => command.source)).toEqual(["healthCheck", "smokeTest"]);
      expect(result.commands.every((command) => command.status === "succeeded")).toBe(true);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects absolute host executables in managed package descriptors before validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "brave-search",
        goal: "Search Brave Search from Ambient",
        installerShape: "search-provider",
      });
      const descriptor = JSON.parse(await readFile(scaffold.descriptorPath, "utf8"));
      descriptor.commands.brave_search.command = process.execPath;
      descriptor.commands.brave_search.healthCheck = [process.execPath, "./scripts/run.mjs", "--health"];
      await writeFile(scaffold.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "brave-search" });

      expect(preview.valid).toBe(false);
      expect(preview.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("must not use absolute host path"),
          expect.stringContaining('bare executable such as "node"'),
        ]),
      );
      await expect(validateCapabilityBuilderPackage(workspace, { packageName: "brave-search" })).rejects.toThrow(/absolute host path/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("captures validation failures and does not mark the package validated", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await writeFile(
        scaffold.descriptorPath,
        `${JSON.stringify(
          {
            name: "ambient-piper-tts",
            version: "0.1.0",
            skills: "./SKILL.md",
            commands: {
              piper_tts: {
                command: "node",
                args: ["./scripts/run.mjs"],
                cwd: "package",
                healthCheck: ["node", "-e", "process.stderr.write('validation failed'); process.exit(8)"],
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts", includeSmokeTests: false });
      expect(result.succeeded).toBe(false);
      expect(result.validatedAt).toBeUndefined();
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        source: "healthCheck",
        status: "failed",
        exitCode: 8,
        stderrPreview: "validation failed",
      });
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest.status).toBe("draft");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails artifact package validation when smoke tests do not create declared artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        outputArtifactTypes: ["WAV"],
      });

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });

      expect(result.succeeded).toBe(false);
      expect(result.validatedAt).toBeUndefined();
      expect(result.commands.at(-1)).toMatchObject({
        source: "smokeTest",
        command: "ambient-artifact-check",
        status: "failed",
        exitCode: "artifact-missing",
      });
      expect(result.artifacts).toEqual([]);
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest.status).toBe("draft");
      await expect(readFile(result.logPath, "utf8")).resolves.toContain("declared artifact");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("counts declared artifacts that validation updates even when the file already existed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "json-export",
        goal: "Write a JSON export file",
        outputArtifactTypes: ["JSON"],
      });
      await writeFile(join(scaffold.rootPath, "smoke-output.json"), '{"stale":true}\n', "utf8");
      await writeFile(
        join(scaffold.rootPath, "tests", "smoke.test.mjs"),
        [
          "import { strict as assert } from 'node:assert';",
          "import { writeFileSync, statSync } from 'node:fs';",
          "",
          "writeFileSync('smoke-output.json', `${JSON.stringify({ ok: true, value: Date.now() })}\\n`);",
          "assert.ok(statSync('smoke-output.json').size > 0);",
          "",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "json-export" });

      expect(result.succeeded).toBe(true);
      expect(result.artifacts).toEqual([expect.objectContaining({ path: "smoke-output.json" })]);
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest.lastValidationArtifacts).toEqual([
        expect.objectContaining({ path: "smoke-output.json", sizeBytes: expect.any(Number) }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("clears validation evidence when repair invalidates the source", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "json-export",
        goal: "Write a JSON export file",
        outputArtifactTypes: ["JSON"],
      });
      await writeFile(
        join(scaffold.rootPath, "tests", "smoke.test.mjs"),
        [
          "import { strict as assert } from 'node:assert';",
          "import { writeFileSync, statSync } from 'node:fs';",
          "",
          "writeFileSync('smoke-output.json', `${JSON.stringify({ ok: true })}\\n`);",
          "assert.ok(statSync('smoke-output.json').size > 0);",
          "",
        ].join("\n"),
        "utf8",
      );
      await validateCapabilityBuilderPackage(workspace, { packageName: "json-export" });
      const validatedManifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(validatedManifest.lastValidationLogPath).toBe(
        "./.ambient/capability-builder/packages/ambient-json-export/capability-validation-log.jsonl",
      );
      expect(validatedManifest.lastValidationArtifacts).toEqual([
        expect.objectContaining({ path: "smoke-output.json", sizeBytes: expect.any(Number) }),
      ]);

      await applyCapabilityBuilderRepair(workspace, {
        packageName: "json-export",
        reason: "Refresh the package guidance after validation.",
        files: [
          {
            path: "SKILL.md",
            content: [
              "---",
              "name: ambient-json-export",
              "description: Write a JSON export file",
              "---",
              "",
              "Use this capability after it is revalidated.",
              "",
            ].join("\n"),
            rationale: "Exercise validation invalidation after source edits.",
          },
        ],
      });

      const repairedManifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      const history = await discoverCapabilityBuilderHistory(workspace, { packageName: "json-export" });
      expect(repairedManifest.status).toBe("draft");
      expect(repairedManifest.lastValidatedAt).toBeNull();
      expect(repairedManifest.lastValidationLogPath).toBeNull();
      expect(repairedManifest.lastValidationArtifacts).toEqual([]);
      expect(history.entries[0].validationLogPath).toBeUndefined();
      expect(history.entries[0].validationArtifacts).toEqual([]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("clears validation evidence when direct Builder file writes invalidate the source", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "json-export",
        goal: "Write a JSON export file",
        outputArtifactTypes: ["JSON"],
      });
      await writeFile(
        join(scaffold.rootPath, "tests", "smoke.test.mjs"),
        [
          "import { strict as assert } from 'node:assert';",
          "import { writeFileSync, statSync } from 'node:fs';",
          "",
          "writeFileSync('smoke-output.json', `${JSON.stringify({ ok: true })}\\n`);",
          "assert.ok(statSync('smoke-output.json').size > 0);",
          "",
        ].join("\n"),
        "utf8",
      );
      await validateCapabilityBuilderPackage(workspace, { packageName: "json-export" });

      await writeCapabilityBuilderFile(workspace, {
        packageName: "json-export",
        filePath: "SKILL.md",
        content: [
          "---",
          "name: ambient-json-export",
          "description: Write a JSON export file",
          "---",
          "",
          "Revalidate this edited capability before registration.",
          "",
        ].join("\n"),
        reason: "Refresh capability guidance.",
      });

      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      const history = await discoverCapabilityBuilderHistory(workspace, { packageName: "json-export" });
      expect(manifest.status).toBe("draft");
      expect(manifest.lastValidatedAt).toBeNull();
      expect(manifest.lastValidationLogPath).toBeNull();
      expect(manifest.lastValidationArtifacts).toEqual([]);
      expect(manifest.refs.lastValidated).toBeNull();
      expect(manifest.refs.lastValidatedHash).toBeNull();
      expect(history.entries[0].validationLogPath).toBeUndefined();
      expect(history.entries[0].validationArtifacts).toEqual([]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("explains stale declared artifacts and stdout-only packages when validation creates no file artifact", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "stdout-search",
        goal: "Return concise JSON search results on stdout",
        installerShape: "search-provider",
        responseFormats: ["JSON"],
        outputArtifactTypes: ["JSON"],
      });
      await writeFile(join(scaffold.rootPath, "smoke-output.json"), '{"already":"here"}\n', "utf8");

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "stdout-search" });

      expect(result.succeeded).toBe(false);
      expect(result.commands.at(-1)).toMatchObject({
        source: "smokeTest",
        command: "ambient-artifact-check",
        status: "failed",
        exitCode: "artifact-missing",
      });
      expect(result.commands.at(-1)?.error).toContain("already existed before validation: smoke-output.json");
      expect(result.commands.at(-1)?.error).toContain("stdout/API response contract for a search-provider");
      expect(result.commands.at(-1)?.error).toContain("responseFormats");
      expect(result.commands.at(-1)?.error).toContain("remove artifacts.outputTypes/outputFileArtifactTypes");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires smoke tests for artifact package validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        outputArtifactTypes: ["WAV"],
      });

      await expect(validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts", includeSmokeTests: false })).rejects.toThrow(
        "Artifact-generating capability packages must run smoke tests during validation.",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("registers a validated package into Ambient CLI package state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });

      const result = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      expect(result.installedPackage).toMatchObject({
        name: "ambient-piper-tts",
        installed: true,
      });
      expect(result.sourceRef.sourcePath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts");
      expect(result.validationEvidence).toMatchObject({
        validatedAt: expect.any(String),
        sourceGitSha: expect.stringMatching(/^[a-f0-9]{40}$/),
        sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        logPath: "./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl",
        artifacts: [],
      });
      expect(result.installedPackage.commands.map((command) => command.name)).toEqual(["piper_tts"]);
      const config = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "utf8"));
      expect(config.packages[0].source).toContain("./.ambient/cli-packages/imported/");
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        status: "registered",
        installedPackageId: result.installedPackage.id,
        installedSource: result.installedPackage.source,
        sourcePath: "./.ambient/capability-builder/packages/ambient-piper-tts",
      });
      expect(manifest.refs.installed).toMatch(/^[a-f0-9]{40}$/);
      const installedManifest = JSON.parse(await readFile(join(result.installedPackage.rootPath, "capability-build.json"), "utf8"));
      expect(installedManifest).toMatchObject({
        status: "registered",
        installedPackageId: result.installedPackage.id,
        sourcePath: "./.ambient/capability-builder/packages/ambient-piper-tts",
      });
      expect(capabilityBuilderRegisterText(result)).toContain("Validation evidence:");
      expect(capabilityBuilderRegisterText(result)).toContain("source hash:");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps validation hash and log evidence when source Git metadata is unavailable", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await rm(join(scaffold.rootPath, ".git"), { recursive: true, force: true });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });

      const result = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const history = await discoverCapabilityBuilderHistory(workspace, { packageName: "piper-tts" });

      expect(result.gitSha).toBeUndefined();
      expect(result.validationEvidence).toMatchObject({
        validatedAt: expect.any(String),
        sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        logPath: "./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl",
        artifacts: [],
      });
      expect(result.validationEvidence.sourceGitSha).toBeUndefined();
      expect(history.entries[0].validationLogPath).toBe(
        "./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl",
      );
      expect(history.entries[0].validationArtifacts).toEqual([]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("unregisters a generated installed package while preserving builder source and artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        outputArtifactTypes: ["WAV"],
      });
      await writeFile(
        join(scaffold.rootPath, "tests", "smoke.test.mjs"),
        "import { writeFileSync } from 'node:fs';\nwriteFileSync('sample.wav', 'RIFF test');\n",
        "utf8",
      );
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });

      const result = await unregisterCapabilityBuilderPackage(workspace, {
        packageName: "piper-tts",
        installedPackageId: registered.installedPackage.id,
        reason: "Hide from search while preserving source.",
      });

      expect(result.removedPackage.id).toBe(registered.installedPackage.id);
      expect(result.catalog.packages.find((pkg) => pkg.id === registered.installedPackage.id)).toBeUndefined();
      await expect(readFile(scaffold.descriptorPath, "utf8")).resolves.toContain("ambient-piper-tts");
      await expect(readFile(join(scaffold.rootPath, "sample.wav"), "utf8")).resolves.toContain("RIFF");
      await expect(readFile(join(scaffold.rootPath, "capability-validation-log.jsonl"), "utf8")).resolves.toContain(
        '"source":"healthCheck"',
      );
      await expect(readFile(join(registered.installedPackage.rootPath, "ambient-cli.json"), "utf8")).rejects.toThrow();
      const config = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "utf8"));
      expect(config.packages).toEqual([]);
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        status: "unregistered",
        installedPackageId: null,
        installedSource: null,
        removedPackageId: registered.installedPackage.id,
      });
      expect(manifest.refs.installed).toBeNull();
      expect(result.preserved).toEqual({
        builderSource: true,
        logs: true,
        artifacts: true,
        envSecrets: true,
      });
      const history = await discoverCapabilityBuilderHistory(workspace, { packageName: "piper-tts" });
      expect(history.entries[0].validationLogPath).toBe(
        "./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl",
      );
      expect(history.entries[0].validationArtifacts).toEqual([
        expect.objectContaining({ path: "sample.wav", sizeBytes: expect.any(Number) }),
      ]);
      expect(capabilityBuilderHistoryText(history)).toContain("validation artifacts: sample.wav");
      expect(capabilityBuilderUnregisterText(result)).toContain("Preserved by default");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("repairs stale installed refs when the installed generated package is already absent", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      await uninstallAmbientCliPackageSource(workspace, { packageId: registered.installedPackage.id });

      const staleHistory = await discoverCapabilityBuilderHistory(workspace, { packageName: "piper-tts" });
      expect(staleHistory.entries[0]).toMatchObject({
        status: "registered",
        installedPackageId: registered.installedPackage.id,
        installedPresent: false,
      });

      const result = await repairCapabilityBuilderRegistrationMetadata(workspace, {
        packageName: "piper-tts",
        reason: "Installed package copy disappeared during failed unregister/register recovery.",
      });

      expect(result).toMatchObject({
        packageName: "ambient-piper-tts",
        previousStatus: "registered",
        staleInstalledPackageId: registered.installedPackage.id,
        staleInstalledSource: registered.installedPackage.source,
        installedPresent: false,
        changed: true,
      });
      expect(result.refs.installed).toBeNull();
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        status: "unregistered",
        installedPackageId: null,
        installedSource: null,
        installedVersion: null,
        staleInstalledPackageId: registered.installedPackage.id,
        staleInstalledSource: registered.installedPackage.source,
      });
      expect(manifest.refs.installed).toBeNull();
      expect(manifest.refs.lastRegistrationRepair).toMatch(/^[a-f0-9]{40}$/);
      const repairedHistory = await discoverCapabilityBuilderHistory(workspace, { packageName: "piper-tts" });
      expect(repairedHistory.entries[0]).toMatchObject({
        status: "unregistered",
        installedPresent: false,
      });
      expect(repairedHistory.entries[0]).not.toHaveProperty("installedPackageId");
      expect(capabilityBuilderRegistrationRepairText(result)).toContain("registration metadata repair");

      const restored = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      expect(restored.installedPackage).toMatchObject({ name: "ambient-piper-tts", installed: true });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("refuses registration metadata repair when stable installed target metadata is missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      manifest.installedPackageId = null;
      manifest.installedSource = null;
      await writeFile(scaffold.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      await expect(
        repairCapabilityBuilderRegistrationMetadata(workspace, {
          packageName: "piper-tts",
          reason: "Attempt repair with corrupt installed ids.",
        }),
      ).rejects.toThrow("requires installedPackageId or installedSource");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("refuses registration metadata repair when installed package discovery has errors", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      await uninstallAmbientCliPackageSource(workspace, { packageId: registered.installedPackage.id });
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "{not-json", "utf8");

      await expect(
        repairCapabilityBuilderRegistrationMetadata(workspace, {
          packageName: "piper-tts",
          reason: "Attempt repair while package catalog is unreadable.",
        }),
      ).rejects.toThrow("Ambient CLI package discovery has errors");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("re-registers an unregistered generated package when preserved validation still matches", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      await unregisterCapabilityBuilderPackage(workspace, {
        packageName: "piper-tts",
        installedPackageId: registered.installedPackage.id,
      });

      const restored = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });

      expect(restored.installedPackage).toMatchObject({
        name: "ambient-piper-tts",
        installed: true,
      });
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        status: "registered",
        installedPackageId: restored.installedPackage.id,
        installedSource: restored.installedPackage.source,
      });
      expect(manifest.refs.installed).toMatch(/^[a-f0-9]{40}$/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects re-registration when unregistered source changed after validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      await unregisterCapabilityBuilderPackage(workspace, {
        packageName: "piper-tts",
        installedPackageId: registered.installedPackage.id,
      });
      await writeFile(scaffold.scriptPath, "process.stdout.write('changed after unregister\\n');\n", "utf8");

      await expect(registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" })).rejects.toThrow("changed since validation");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects registration when source changed after validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      await writeFile(scaffold.scriptPath, "process.stdout.write('changed after validation\\n');\n", "utf8");

      await expect(registerCapabilityBuilderPackage(workspace, { packageName: "piper-tts" })).rejects.toThrow("changed since validation");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
