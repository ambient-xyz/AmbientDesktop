import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  bundledAmbientCliPackageRootCandidates,
  describeAmbientCliPackage,
  discoverAmbientCliEmbeddingProviders,
  discoverAmbientCliPackages,
  discoverAmbientCliSttProviders,
  discoverAmbientCliVoiceProviders,
  enabledAmbientCliSkillPaths,
  ensureFirstPartyAmbientCliPackages,
  hydrateAmbientCliPackageSummaries,
  installAmbientCliPackagePiCatalogSource,
  installAmbientCliPackageSource,
  previewAmbientCliPackagePiCatalogSource,
  previewAmbientCliPackageInstallSource,
  runAmbientCliPackageCommand,
  saveAmbientCliPackageEnvSecret,
  searchAmbientCliCapabilities,
  setAmbientCliPackageEnvBinding,
  uninstallAmbientCliPackageSource,
  writeAmbientCliSkillSummary,
} from "./ambientCliPackages";

const execFileAsync = promisify(execFile);
const itLivePiCatalog = process.env.AMBIENT_PI_CATALOG_LIVE === "1" ? it : it.skip;

describe("Ambient CLI packages", () => {
  it("includes checkout resources when main code is bundled under out/main/chunks", () => {
    const appRoot = join(tmpdir(), "ambient-dev-root");
    const candidates = bundledAmbientCliPackageRootCandidates("ambient-qwen3-asr", {
      cwd: "/",
      env: {},
      moduleFilePath: join(appRoot, "out", "main", "chunks", "index.js"),
    });

    expect(candidates).toContain(join(appRoot, "resources", "ambient-cli-packages", "ambient-qwen3-asr"));
  });

  it("installs descriptor-backed CLI packages, mounts skills, and runs registered commands", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-workspace-"));
    try {
      await seedCliFixture(workspace);
      await writeFile(
        join(workspace, "cli-fixture", "capability-build.json"),
        `${JSON.stringify(
          {
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
            refs: {
              latest: "abc123",
              installed: "def456",
              lastValidated: "abc123",
              lastValidatedHash: "hash123",
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      const installed = await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });
      expect(installed).toMatchObject({
        name: "ambient-json-cli",
        installed: true,
        commands: [expect.objectContaining({ name: "json-pick" })],
        skills: [expect.objectContaining({ name: "ambient-json-cli" })],
        generated: {
          schemaVersion: "ambient-capability-builder-v1",
          status: "registered",
          goal: "Pick JSON fields",
          sourcePath: "./.ambient/capability-builder/packages/ambient-json-cli",
          refs: {
            installed: "def456",
            lastValidatedHash: "hash123",
          },
        },
      });

      const config = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "utf8"));
      expect(config.packages[0].source).toContain(".ambient/cli-packages/imported");

      const skillPaths = await enabledAmbientCliSkillPaths(workspace);
      expect(skillPaths).toHaveLength(1);
      expect(skillPaths[0]).toContain("skills/json-cli");

      const inputPath = join(workspace, "payload.json");
      await writeFile(inputPath, `${JSON.stringify({ message: "hello from cli" })}\n`, "utf8");
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-json-cli",
        command: "json-pick",
        args: ["payload.json", "message"],
      });
      expect(result.stdout?.trim()).toBe("hello from cli");
      expect(result.timeoutProfile).toBe("quickProbe");
      expect(result.timeoutMs).toBe(120_000);
      expect(result.idleTimeoutMs).toBe(120_000);

      const executionWorkspace = await mkdtemp(join(tmpdir(), "ambient-cli-execution-workspace-"));
      await writeFile(join(executionWorkspace, "payload.json"), `${JSON.stringify({ message: "hello from execution workspace" })}\n`, "utf8");
      const executionResult = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-json-cli",
        command: "json-pick",
        args: ["payload.json", "message"],
        executionWorkspacePath: executionWorkspace,
      });
      expect(executionResult.stdout?.trim()).toBe("hello from execution workspace");
      expect(executionResult.cwd).toBe(executionWorkspace);

      const largeValue = "x".repeat(13_000);
      await writeFile(inputPath, `${JSON.stringify({ message: largeValue })}\n`, "utf8");
      const largeResult = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-json-cli",
        command: "json-pick",
        args: ["payload.json", "message"],
      });
      expect(largeResult.stdout).toHaveLength(12_000);
      expect(largeResult.stdoutOutput).toMatchObject({
        truncated: true,
        totalChars: 13_000,
        previewChars: 12_000,
      });
      expect(largeResult.stdoutOutput?.artifactPath).toMatch(/^\.ambient\/tool-outputs\//);
      expect(await readFile(join(workspace, largeResult.stdoutOutput!.artifactPath!), "utf8")).toBe(largeValue);

      const catalog = await discoverAmbientCliPackages(workspace, { includeHealth: true });
      expect(catalog.packages).toEqual([expect.objectContaining({ id: installed.id, name: "ambient-json-cli" })]);
      expect(catalog.packages[0]?.healthChecks).toEqual([
        expect.objectContaining({
          commandName: "json-pick",
          passed: true,
          stdout: "healthy",
        }),
      ]);

      const uninstalled = await uninstallAmbientCliPackageSource(workspace, { packageId: installed.id });
      expect(uninstalled.packages).toEqual([]);
      await expect(runAmbientCliPackageCommand(workspace, { packageName: "ambient-json-cli", command: "json-pick" })).rejects.toThrow(
        'Ambient CLI package "ambient-json-cli" was not found.',
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discovers Ambient-managed CLI installs across workspaces when an app install root is configured", async () => {
    const appInstallRoot = await mkdtemp(join(tmpdir(), "ambient-cli-app-installs-"));
    const workspaceA = await mkdtemp(join(tmpdir(), "ambient-cli-workspace-a-"));
    const workspaceB = await mkdtemp(join(tmpdir(), "ambient-cli-workspace-b-"));
    const previousRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    process.env.AMBIENT_MANAGED_INSTALL_ROOT = appInstallRoot;
    try {
      await seedCliFixture(workspaceA);
      const installed = await installAmbientCliPackageSource(workspaceA, { source: "./cli-fixture" });
      expect(installed.rootPath).toContain(appInstallRoot);

      const catalog = await discoverAmbientCliPackages(workspaceB);
      expect(catalog.packages.map((pkg) => pkg.name)).toContain("ambient-json-cli");
      await writeFile(join(workspaceB, "payload.json"), `${JSON.stringify({ ok: true })}\n`, "utf8");
      const result = await runAmbientCliPackageCommand(workspaceB, {
        packageName: "ambient-json-cli",
        command: "json-pick",
        args: ["payload.json", "ok"],
      });
      expect(result.stdout).toBe("true");
    } finally {
      if (previousRoot === undefined) delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      else process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousRoot;
      await rm(appInstallRoot, { recursive: true, force: true });
      await rm(workspaceA, { recursive: true, force: true });
      await rm(workspaceB, { recursive: true, force: true });
    }
  });

  it("filters ambient and provider secrets from Ambient CLI process env", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-env-"));
    try {
      const root = join(workspace, "env-fixture");
      await mkdir(join(root, "bin"), { recursive: true });
      await writeFile(
        join(root, "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-env-fixture",
            version: "0.1.0",
            description: "Fixture env CLI package.",
            commands: {
              "env-echo": {
                command: "node",
                args: ["./bin/env-echo.mjs"],
                cwd: "package",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(root, "bin", "env-echo.mjs"),
        [
          "const keys = ['SAFE_FLAG', 'AMBIENT_API_KEY', 'AMBIENT_AGENT_AMBIENT_API_KEY', 'BRAVE_API_KEY', 'PACKAGE_TOKEN', 'AMBIENT_WORKSPACE_PATH'];",
          "process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]))));",
          "",
        ].join("\n"),
        "utf8",
      );

      await installAmbientCliPackageSource(workspace, { source: "./env-fixture" });
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-env-fixture",
        command: "env-echo",
        env: {
          SAFE_FLAG: "safe",
          AMBIENT_API_KEY: "ambient-secret",
          AMBIENT_AGENT_AMBIENT_API_KEY: "agent-secret",
          BRAVE_API_KEY: "provider-secret",
          PACKAGE_TOKEN: "token-secret",
          AMBIENT_WORKSPACE_PATH: "/tmp/attacker-controlled",
        },
      });
      const output = JSON.parse(result.stdout ?? "{}");

      expect(output).toMatchObject({
        SAFE_FLAG: "safe",
        AMBIENT_API_KEY: null,
        AMBIENT_AGENT_AMBIENT_API_KEY: null,
        BRAVE_API_KEY: null,
        PACKAGE_TOKEN: null,
        AMBIENT_WORKSPACE_PATH: workspace,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects absolute host executables in Ambient CLI package descriptors", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-workspace-"));
    try {
      await seedCliFixture(workspace);
      const descriptorPath = join(workspace, "cli-fixture", "ambient-cli.json");
      const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
      descriptor.commands["json-pick"].command = process.execPath;
      descriptor.commands["json-pick"].healthCheck = [process.execPath, "./bin/json-pick.mjs", "health.json", "message"];
      await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      await expect(installAmbientCliPackageSource(workspace, { source: "./cli-fixture" })).rejects.toThrow(/absolute host path/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("runs node-backed installed packages when the inherited PATH omits node", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-runtime-path-"));
    const originalPath = process.env.PATH;
    try {
      await seedCliFixture(workspace);
      const emptyBin = join(workspace, "empty-bin");
      await mkdir(emptyBin, { recursive: true });
      const installed = await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });
      await writeFile(join(workspace, "payload.json"), `${JSON.stringify({ message: "path repaired" })}\n`, "utf8");

      process.env.PATH = emptyBin;
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-json-cli",
        command: "json-pick",
        args: ["payload.json", "message"],
      });
      const catalog = await discoverAmbientCliPackages(workspace, { includeHealth: true });

      expect(result.stdout?.trim()).toBe("path repaired");
      expect(catalog.packages).toEqual([
        expect.objectContaining({
          id: installed.id,
          healthChecks: [expect.objectContaining({ passed: true, stdout: "healthy" })],
        }),
      ]);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces timeout profiles and applies descriptor device policy during health checks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-device-profile-"));
    const previousDevices = process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES;
    const previousRecommended = process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE;
    process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES = "mps,cpu";
    process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE = "mps";
    try {
      await seedCliFixture(workspace);
      const descriptorPath = join(workspace, "cli-fixture", "ambient-cli.json");
      const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
      descriptor.commands["json-pick"].healthCheck = ["node", "./bin/device-probe.mjs", "--device", "cpu"];
      descriptor.commands["json-pick"].timeoutProfile = "modelColdStart";
      descriptor.commands["json-pick"].progressPatterns = ["Loading checkpoint"];
      descriptor.commands["json-pick"].devicePolicy = {
        prefer: ["mps", "cpu"],
        requireReasonWhenCpuForced: true,
      };
      await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      await writeFile(
        join(workspace, "cli-fixture", "bin", "device-probe.mjs"),
        [
          "const args = process.argv.slice(2);",
          "const index = args.indexOf('--device');",
          "process.stdout.write('Loading checkpoint\\n');",
          "process.stdout.write(JSON.stringify({ selectedDevice: index >= 0 ? args[index + 1] : null }));",
        ].join("\n"),
        "utf8",
      );

      await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });
      const description = await describeAmbientCliPackage(workspace, { packageName: "ambient-json-cli", command: "json-pick" });
      const catalog = await discoverAmbientCliPackages(workspace, { includeHealth: true });
      const health = catalog.packages[0]?.healthChecks?.[0];

      expect(description.commands[0]).toMatchObject({
        timeoutProfile: "modelColdStart",
        progressPatterns: ["Loading checkpoint"],
        devicePolicy: expect.objectContaining({ prefer: ["mps", "cpu"], requireReasonWhenCpuForced: true }),
      });
      expect(health).toMatchObject({
        passed: true,
        timeoutProfile: "modelColdStart",
        deviceSelection: expect.objectContaining({
          requestedDevice: "cpu",
          selectedDevice: "mps",
          cpuOverridePrevented: true,
        }),
      });
      expect(health?.timeoutMs).toBeGreaterThan(120_000);
      expect(health?.command).toContain("mps");
      expect(health?.command).not.toContain("cpu");
      expect(health?.stdout).toContain('"selectedDevice":"mps"');
    } finally {
      if (previousDevices === undefined) delete process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES;
      else process.env.AMBIENT_COMMAND_AVAILABLE_DEVICES = previousDevices;
      if (previousRecommended === undefined) delete process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE;
      else process.env.AMBIENT_COMMAND_RECOMMENDED_DEVICE = previousRecommended;
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discovers installed Ambient CLI voice provider commands", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-voice-provider-"));
    try {
      await mkdir(join(workspace, "voice-fixture"), { recursive: true });
      await writeFile(
        join(workspace, "voice-fixture", "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-piper-tts",
            version: "0.1.0",
            description: "Generate WAV voice files from text using Piper",
            skills: "./SKILL.md",
            commands: {
              piper_tts: {
                description: "Synthesize spoken assistant text to a WAV file with Piper TTS.",
                command: "node",
                args: ["./scripts/run.mjs"],
                cwd: "package",
                voiceProvider: {
                  label: "Local Piper Voice",
                  defaultFormat: "wav",
                  formats: ["wav"],
                  voices: [{ id: "default", label: "Default Piper voice" }],
                  local: true,
                  voiceDiscovery: {
                    command: "piper_tts",
                    cacheTtlSeconds: 3600,
                    requiresNetwork: false,
                    source: "local-model-directory",
                  },
                  voiceCloning: {
                    supported: true,
                    mode: "local",
                    inputs: {
                      audioFormats: ["wav", ".flac"],
                      minDurationSeconds: 30,
                      maxDurationSeconds: 600,
                      minSamples: 1,
                      transcript: "optional",
                    },
                    output: {
                      creates: ["local-model-asset", "dynamic-cache-voice"],
                      appearsInDynamicCatalog: true,
                    },
                  },
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(workspace, "voice-fixture", "SKILL.md"), "---\nname: ambient-piper-tts\n---\n");
      const installed = await installAmbientCliPackageSource(workspace, { source: "./voice-fixture" });

      const providers = await discoverAmbientCliVoiceProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageId: installed.id,
          packageName: "ambient-piper-tts",
          command: "piper_tts",
          capabilityId: `${installed.id}:tool:piper_tts`,
          providerId: `${installed.id}:tool:piper_tts`,
          label: "Local Piper Voice",
          description: "Synthesize spoken assistant text to a WAV file with Piper TTS.",
          format: "wav",
          formats: ["wav"],
          voices: [{ id: "default", label: "Default Piper voice" }],
          local: true,
          voiceDiscovery: {
            command: "piper_tts",
            cacheTtlSeconds: 3600,
            requiresNetwork: false,
            source: "local-model-directory",
          },
          voiceCloning: {
            supported: true,
            mode: "local",
            inputs: {
              audioFormats: ["wav", "flac"],
              minDurationSeconds: 30,
              maxDurationSeconds: 600,
              minSamples: 1,
              transcript: "optional",
            },
            requiresConsent: true,
            output: {
              creates: ["local-model-asset", "dynamic-cache-voice"],
              appearsInDynamicCatalog: true,
            },
          },
          installed: true,
          available: true,
        }),
      ]);

      const search = await searchAmbientCliCapabilities(workspace, { query: "Piper TTS voice", limit: 5 });
      expect(search.results[0]?.commands[0]).toMatchObject({
        name: "piper_tts",
        risk: expect.arrayContaining(["run_process", "tts_provider"]),
        voiceProvider: {
          defaultFormat: "wav",
          formats: ["wav"],
          voices: [{ id: "default", label: "Default Piper voice" }],
          voiceDiscovery: {
            command: "piper_tts",
            cacheTtlSeconds: 3600,
            requiresNetwork: false,
            source: "local-model-directory",
          },
          voiceCloning: {
            supported: true,
            mode: "local",
            inputs: {
              audioFormats: ["wav", "flac"],
              minDurationSeconds: 30,
              maxDurationSeconds: 600,
              minSamples: 1,
              transcript: "optional",
            },
            requiresConsent: true,
            output: {
              creates: ["local-model-asset", "dynamic-cache-voice"],
              appearsInDynamicCatalog: true,
            },
          },
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discovers installed Ambient CLI STT provider commands", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-stt-provider-"));
    try {
      await mkdir(join(workspace, "stt-fixture"), { recursive: true });
      await writeFile(
        join(workspace, "stt-fixture", "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-qwen3-asr",
            version: "0.1.0",
            description: "Transcribe buffered utterances with local Qwen3-ASR",
            skills: "./SKILL.md",
            commands: {
              qwen3_asr_transcribe: {
                description: "Transcribe a WAV utterance to JSON using Qwen3-ASR.",
                command: "node",
                args: ["./scripts/run.mjs"],
                cwd: "package",
                sttProvider: {
                  label: "Qwen3-ASR Local",
                  languages: ["English", "Spanish", "French"],
                  defaultLanguage: "English",
                  local: true,
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(workspace, "stt-fixture", "SKILL.md"), "---\nname: ambient-qwen3-asr\n---\n");
      const installed = await installAmbientCliPackageSource(workspace, { source: "./stt-fixture" });

      const providers = await discoverAmbientCliSttProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageId: installed.id,
          packageName: "ambient-qwen3-asr",
          command: "qwen3_asr_transcribe",
          capabilityId: `${installed.id}:tool:qwen3_asr_transcribe`,
          providerId: `${installed.id}:tool:qwen3_asr_transcribe`,
          label: "Qwen3-ASR Local",
          description: "Transcribe a WAV utterance to JSON using Qwen3-ASR.",
          languages: ["English", "Spanish", "French"],
          defaultLanguage: "English",
          local: true,
          installed: true,
          available: true,
        }),
      ]);

      const search = await searchAmbientCliCapabilities(workspace, { query: "Qwen ASR speech", limit: 5 });
      expect(search.results[0]?.commands[0]).toMatchObject({
        name: "qwen3_asr_transcribe",
        risk: expect.arrayContaining(["run_process", "stt_provider"]),
        sttProvider: {
          languages: ["English", "Spanish", "French"],
          defaultLanguage: "English",
          local: true,
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs the bundled first-party Qwen3-ASR STT provider and runs its deterministic contract path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-qwen-stt-"));
    const previousBinary = process.env.AMBIENT_QWEN3_ASR_BINARY;
    const previousFakeTranscript = process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;
    try {
      process.env.AMBIENT_QWEN3_ASR_BINARY = join(workspace, "missing-llama-mtmd-cli");
      delete process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-qwen3-asr"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-qwen3-asr",
          source: "bundled:ambient-qwen3-asr",
          status: "installed",
        }),
      ]);

      const providers = await discoverAmbientCliSttProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageName: "ambient-qwen3-asr",
          command: "qwen3_asr_transcribe",
          label: "Qwen3-ASR Local",
          defaultLanguage: "English",
          local: true,
          installed: true,
          available: false,
          availabilityReason: expect.stringContaining("STT provider validation pending"),
          diagnostics: expect.objectContaining({
            healthStatus: "passed",
            healthError: expect.stringContaining("Configured Qwen3-ASR binary does not exist"),
            missingHints: expect.arrayContaining(["Install a llama.cpp build that includes llama-mtmd-cli."]),
          }),
        }),
      ]);

      process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT = "open settings by voice";
      const audioPath = join(workspace, "utterance.wav");
      const outputJson = join(workspace, ".ambient", "stt", "thread-1", "utt-1.json");
      await writeFile(audioPath, silentWav(250));

      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-qwen3-asr",
        command: "qwen3_asr_transcribe",
        args: ["--audio", audioPath, "--language", "English", "--output-json", outputJson],
      });

      expect(JSON.parse(result.stdout ?? "{}")).toMatchObject({
        text: "open settings by voice",
        language: "English",
        providerId: "qwen3-asr-0.6b-llamacpp",
      });
      await expect(readFile(outputJson, "utf8")).resolves.toContain("open settings by voice");
    } finally {
      if (previousBinary === undefined) {
        delete process.env.AMBIENT_QWEN3_ASR_BINARY;
      } else {
        process.env.AMBIENT_QWEN3_ASR_BINARY = previousBinary;
      }
      if (previousFakeTranscript === undefined) {
        delete process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;
      } else {
        process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT = previousFakeTranscript;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs the bundled first-party faster-whisper STT provider and runs its deterministic contract path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-faster-whisper-stt-"));
    const previousFakeTranscript = process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT;
    try {
      process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT = "open settings by faster whisper";

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-faster-whisper-stt"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          source: "bundled:ambient-faster-whisper-stt",
          status: "installed",
        }),
      ]);

      const providers = await discoverAmbientCliSttProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          command: "faster_whisper_transcribe",
          label: "faster-whisper tiny.en Local",
          languages: ["English"],
          defaultLanguage: "English",
          local: true,
          installed: true,
          available: true,
          diagnostics: expect.objectContaining({
            healthStatus: "passed",
            missingHints: [],
            distribution: expect.objectContaining({
              packageType: "adapter-only",
              bundledRuntimeBinaries: false,
              bundledPythonWheels: false,
              bundledModelWeights: false,
              bundledModelAssets: false,
            }),
            installPlan: expect.objectContaining({
              resolver: "uv",
              packages: ["faster-whisper==1.1.1", "requests"],
              defaultModel: "tiny.en",
            }),
          }),
        }),
      ]);

      const audioPath = join(workspace, "utterance.wav");
      const outputJson = join(workspace, ".ambient", "stt", "thread-1", "utt-1.json");
      await writeFile(audioPath, silentWav(250));

      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-faster-whisper-stt",
        command: "faster_whisper_transcribe",
        args: ["--audio", audioPath, "--language", "English", "--output-json", outputJson],
      });

      expect(JSON.parse(result.stdout ?? "{}")).toMatchObject({
        text: "open settings by faster whisper",
        language: "English",
        providerId: "faster-whisper-tiny-en-cpu",
      });
      await expect(readFile(outputJson, "utf8")).resolves.toContain("open settings by faster whisper");
    } finally {
      if (previousFakeTranscript === undefined) {
        delete process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT;
      } else {
        process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT = previousFakeTranscript;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs bundled HyperFrames, exposes discovery/describe metadata, and returns render artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-hyperframes-"));
    const previousFakeRender = process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
    try {
      process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = "1";

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-hyperframes"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-hyperframes",
          source: "bundled:ambient-hyperframes",
          status: "installed",
        }),
      ]);

      const search = await searchAmbientCliCapabilities(workspace, { query: "deterministic title card authored motion video mp4", limit: 5 });
      expect(search.results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          packageName: "ambient-hyperframes",
          availability: "available",
          commands: expect.arrayContaining([
            expect.objectContaining({ name: "hyperframes_doctor", health: "passed" }),
            expect.objectContaining({ name: "hyperframes_render", health: "passed" }),
          ]),
          skills: [expect.objectContaining({ name: "hyperframes" })],
        }),
      ]));

      const description = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-hyperframes",
        includeSkill: true,
      });
      expect(description.package).toMatchObject({
        name: "ambient-hyperframes",
        availability: "available",
      });
      expect(description.commands.map((command) => command.name)).toEqual([
        "hyperframes_doctor",
        "hyperframes_setup_plan",
        "hyperframes_init",
        "hyperframes_inspect",
        "hyperframes_render",
      ]);
      expect(description.skills[0]?.text).toContain("Heavy setup is lazy and approval-gated");

      const init = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-hyperframes",
        command: "hyperframes_init",
        args: ["--project-dir", "scene", "--title", "Ambient title card"],
      });
      expect(JSON.parse(init.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-hyperframes",
        status: "initialized",
      });

      const inspect = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-hyperframes",
        command: "hyperframes_inspect",
        args: ["--source", "scene/comp.html", "--json"],
      });
      expect(JSON.parse(inspect.stdout ?? "{}")).toMatchObject({
        status: "passed",
        composition: { width: 1280, height: 720, duration: 3, fps: 30 },
      });

      const render = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-hyperframes",
        command: "hyperframes_render",
        args: ["--source", "scene/comp.html", "--output", ".ambient/hyperframes/renders/title-card.mp4", "--json"],
      });
      const rendered = JSON.parse(render.stdout ?? "{}");
      expect(rendered).toMatchObject({
        packageName: "ambient-hyperframes",
        status: "rendered",
        mode: "fake",
        media: { bytes: expect.any(Number) },
      });
      expect(rendered.media.bytes).toBeGreaterThan(0);
      await expect(readFile(rendered.metadataPath, "utf8")).resolves.toContain("artifactContract");
    } finally {
      if (previousFakeRender === undefined) {
        delete process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
      } else {
        process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = previousFakeRender;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("installs bundled hosted image generation and writes deterministic image artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-hosted-image-"));
    const previousFakeGeneration = process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION;
    try {
      process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION = "1";

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-imagegen"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-imagegen",
          source: "bundled:ambient-imagegen",
          status: "installed",
        }),
      ]);

      const search = await searchAmbientCliCapabilities(workspace, { query: "Google Nano Banana Pro Flux OpenAI hosted image generation", limit: 5 });
      expect(search.results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          packageName: "ambient-imagegen",
          availability: "available",
          commands: expect.arrayContaining([
            expect.objectContaining({ name: "hosted_image_doctor", health: "passed" }),
            expect.objectContaining({ name: "hosted_image_generate", health: "passed" }),
          ]),
          skills: [expect.objectContaining({ name: "ambient-imagegen" })],
        }),
      ]));

      const description = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-imagegen",
        includeSkill: true,
      });
      expect(description.package).toMatchObject({
        name: "ambient-imagegen",
        availability: "available",
      });
      expect(description.env.map((env) => env.name)).toEqual(expect.arrayContaining([
        "OPENAI_API_KEY",
        "GEMINI_API_KEY",
        "FAL_KEY",
        "REPLICATE_API_TOKEN",
        "STABILITY_API_KEY",
        "IDEOGRAM_API_KEY",
      ]));
      expect(description.skills[0]?.text).toContain("Google Nano Banana Pro");

      const doctor = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-imagegen",
        command: "hosted_image_doctor",
        args: ["--json"],
      });
      expect(JSON.parse(doctor.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-imagegen",
        ready: true,
        providers: expect.arrayContaining([
          expect.objectContaining({ id: "openai", defaultModel: "gpt-image-2" }),
          expect.objectContaining({ id: "google-nano-banana-pro", defaultModel: "gemini-3-pro-image" }),
          expect.objectContaining({ id: "flux", defaultModel: "fal-ai/flux/dev" }),
        ]),
      });

      const generated = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-imagegen",
        command: "hosted_image_generate",
        args: [
          "--provider",
          "google-nano-banana-pro",
          "--prompt",
          "Tiny test icon for Ambient hosted image generation.",
          "--size",
          "16x16",
          "--output",
          ".ambient/hosted-images/test-icon.png",
          "--json",
        ],
      });
      const payload = JSON.parse(generated.stdout ?? "{}");
      expect(payload).toMatchObject({
        packageName: "ambient-imagegen",
        status: "generated",
        fake: true,
        provider: "google-nano-banana-pro",
        model: "gemini-3-pro-image",
        image: {
          mimeType: "image/png",
          width: 16,
          height: 16,
          bytes: expect.any(Number),
        },
      });
      expect(payload.image.bytes).toBeGreaterThan(0);
      await expect(readFile(payload.outputPath)).resolves.toHaveLength(payload.image.bytes);
      await expect(readFile(payload.metadataPath, "utf8")).resolves.toContain("secretValuesIncluded");

      const reconciled = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-imagegen",
        command: "hosted_image_generate",
        args: [
          "--provider",
          "google-nano-banana-pro",
          "--prompt",
          "Tiny extension correction fixture.",
          "--size",
          "2x2",
          "--format",
          "jpeg",
          "--output",
          ".ambient/hosted-images/requested-jpeg.jpg",
          "--json",
        ],
      });
      const reconciledPayload = JSON.parse(reconciled.stdout ?? "{}");
      expect(reconciledPayload).toMatchObject({
        packageName: "ambient-imagegen",
        status: "generated",
        fake: true,
        image: {
          mimeType: "image/png",
        },
        outputPath: expect.stringMatching(/requested-jpeg\.png$/),
        metadataPath: expect.stringMatching(/requested-jpeg\.png\.json$/),
      });
      const reconciledMetadata = JSON.parse(await readFile(reconciledPayload.metadataPath, "utf8"));
      expect(reconciledMetadata.request).toMatchObject({
        format: "jpeg",
        requestedOutputPath: expect.stringMatching(/requested-jpeg\.jpg$/),
      });
      await expect(readFile(reconciledPayload.outputPath)).resolves.toHaveLength(reconciledPayload.image.bytes);
    } finally {
      if (previousFakeGeneration === undefined) {
        delete process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION;
      } else {
        process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION = previousFakeGeneration;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("installs bundled TinyStyler and runs its deterministic contract path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-tinystyler-"));
    const previousPwd = process.env.PWD;
    try {
      const shadowRoot = join(workspace, "shadow-launch-cwd");
      const shadowPackageRoot = join(shadowRoot, "resources", "ambient-cli-packages", "ambient-tinystyler");
      await mkdir(shadowPackageRoot, { recursive: true });
      await writeFile(join(shadowPackageRoot, "ambient-cli.json"), JSON.stringify({
        name: "ambient-tinystyler-shadow",
        version: "9.9.9",
        commands: {
          shadow: {
            command: "python3",
            args: ["-c", "raise SystemExit(99)"],
          },
        },
      }), "utf8");
      process.env.PWD = shadowRoot;

      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "bundled:ambient-tinystyler",
      });
      expect(preview).toMatchObject({
        source: "bundled:ambient-tinystyler",
        installable: true,
        candidate: expect.objectContaining({ name: "ambient-tinystyler" }),
      });

      const installed = await installAmbientCliPackageSource(workspace, {
        source: "bundled:ambient-tinystyler",
      });
      expect(installed).toMatchObject({
        name: "ambient-tinystyler",
        source: expect.stringMatching(/^\.\/\.ambient\/cli-packages\/imported\/ambient-tinystyler-/),
        installed: true,
      });

      const search = await searchAmbientCliCapabilities(workspace, { query: "TinyStyler writing style transfer profile examples", limit: 5 });
      const tinystylerSearch = search.results.find((result) => result.packageName === "ambient-tinystyler");
      expect(tinystylerSearch).toMatchObject({
        packageName: "ambient-tinystyler",
        availability: "available",
        commands: expect.arrayContaining([
          expect.objectContaining({ name: "tinystyler_doctor", health: "passed" }),
          expect.objectContaining({ name: "tinystyler_profile" }),
          expect.objectContaining({ name: "tinystyler_transfer" }),
        ]),
        skills: [expect.objectContaining({ name: "ambient-tinystyler" })],
      });
      expect(tinystylerSearch?.commands.find((command) => command.name === "tinystyler_profile")?.health).not.toBe("passed");
      expect(tinystylerSearch?.commands.find((command) => command.name === "tinystyler_transfer")?.health).not.toBe("passed");

      const description = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-tinystyler",
        includeSkill: true,
      });
      expect(description.package).toMatchObject({
        name: "ambient-tinystyler",
        availability: "available",
      });
      expect(description.commands.map((command) => command.name)).toEqual([
        "tinystyler_doctor",
        "tinystyler_profile",
        "tinystyler_transfer",
      ]);
      expect(description.skills[0]?.text).toContain("reusable TinyStyler style profiles");

      const doctor = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-tinystyler",
        command: "tinystyler_doctor",
        args: ["--json"],
      });
      expect(JSON.parse(doctor.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "contract_ready",
        ready: false,
        realRuntimeImplemented: true,
        transferRuntimeImplemented: true,
        revisions: {
          tinystyler: "2a879107b2ec342e57170b82cdc344d5179fa32b",
        },
      });

      const examplesPath = join(workspace, "examples.txt");
      const sourcePath = join(workspace, "source.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "support.json");
      const outputPath = join(workspace, ".ambient", "tinystyler", "outputs", "styled.txt");
      await writeFile(examplesPath, "Thanks for the careful report.\n\nI can help with that next step.\n", "utf8");
      await writeFile(sourcePath, "Please inspect the logs and suggest the next action.", "utf8");

      const profile = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-tinystyler",
        command: "tinystyler_profile",
        args: ["--examples-file", examplesPath, "--output-profile", profilePath, "--profile-name", "support-replies", "--seed", "11", "--fake", "--json"],
      });
      expect(JSON.parse(profile.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "profile_created",
        fake: true,
        profileName: "support-replies",
      });
      const savedProfile = JSON.parse(await readFile(profilePath, "utf8"));
      expect(savedProfile.embedding.values).toHaveLength(768);
      expect(savedProfile.sourceSummary.rawTextPersisted).toBe(false);
      expect(savedProfile.sourceSummary.exactSourceVerifiersPersisted).toBe(false);
      expect(savedProfile.sourceSummary).not.toHaveProperty("sourceHashes");
      expect(JSON.stringify(savedProfile)).not.toContain("careful report");

      const transfer = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-tinystyler",
        command: "tinystyler_transfer",
        args: ["--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--seed", "11", "--fake", "--json"],
      });
      expect(JSON.parse(transfer.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "transfer_created",
        fake: true,
        profileName: "support-replies",
      });
      expect(JSON.parse(transfer.stdout ?? "{}")).not.toHaveProperty("textPreview");
      await expect(readFile(outputPath, "utf8")).resolves.toContain("support-replies style transfer");
      expect(transfer.stdout).not.toContain("careful report");
      expect(transfer.stdout).not.toContain("inspect the logs");
    } finally {
      if (previousPwd === undefined) {
        delete process.env.PWD;
      } else {
        process.env.PWD = previousPwd;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("installs the bundled MiniCPM-V vision package only when explicitly requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-minicpm-v-vision-"));
    const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = "fake Ambient visual evidence";
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");
      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-minicpm-v-vision"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-minicpm-v-vision",
          source: "bundled:ambient-minicpm-v-vision",
          status: "installed",
        }),
      ]);

      const healthStateDir = join(workspace, ".ambient", "vision", "minicpm-v", "state");
      await mkdir(healthStateDir, { recursive: true });
      await writeFile(join(healthStateDir, "server-state.json"), `${JSON.stringify({
        status: "stopped",
        previousPid: 31337,
        stoppedAt: "2026-06-12T00:00:00.000Z",
      })}\n`);

      const catalog = await discoverAmbientCliPackages(workspace, { includeHealth: true });
      const minicpm = catalog.packages.find((pkg) => pkg.name === "ambient-minicpm-v-vision");
      expect(minicpm).toMatchObject({
        installed: true,
        commands: expect.arrayContaining([
          expect.objectContaining({ name: "minicpm_vision_status" }),
          expect.objectContaining({ name: "minicpm_vision_verify_runtime_manifest" }),
          expect.objectContaining({ name: "minicpm_vision_start" }),
          expect.objectContaining({ name: "minicpm_vision_stop" }),
          expect.objectContaining({ name: "minicpm_vision_analyze" }),
        ]),
      });
      expect(minicpm?.healthChecks?.every((check) => check.passed)).toBe(true);
      const statusHealth = minicpm?.healthChecks?.find((check) => check.commandName === "minicpm_vision_status");
      const statusHealthText = statusHealth?.stdoutOutput?.artifactPath
        ? await readFile(join(workspace, statusHealth.stdoutOutput.artifactPath), "utf8")
        : statusHealth?.stdout ?? "{}";
      expect(JSON.parse(statusHealthText).server).toMatchObject({
        previousPid: 31337,
        stoppedAt: "2026-06-12T00:00:00.000Z",
      });

      const imagePath = join(workspace, "screen.png");
      const outputJson = join(workspace, ".ambient", "vision", "screen-analysis.json");
      await writeFile(imagePath, tinyPng());
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-minicpm-v-vision",
        command: "minicpm_vision_analyze",
        args: ["--image", imagePath, "--output-json", outputJson],
      });

      const preview = JSON.parse(result.stdout ?? "{}");
      expect(preview).toMatchObject({
        providerId: "minicpm-v-4.5-llamacpp",
        status: "passed",
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        summary: "fake Ambient visual evidence",
        observations: [expect.objectContaining({ kind: "visual_quality", confidence: "high" })],
      });
      expect(preview.image).toMatchObject({ basename: "screen.png" });
      expect(preview.image).not.toHaveProperty("path");
      expect(preview.images).toEqual([expect.objectContaining({ basename: "screen.png" })]);
      await expect(readFile(outputJson, "utf8")).resolves.toContain("fake Ambient visual evidence");

      const referencePath = join(workspace, "reference.png");
      const comparisonJson = join(workspace, ".ambient", "vision", "screen-comparison.json");
      await writeFile(referencePath, tinyPng());
      const comparison = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-minicpm-v-vision",
        command: "minicpm_vision_analyze",
        args: ["--image", imagePath, "--image", referencePath, "--output-json", comparisonJson],
      });
      const comparisonPreview = JSON.parse(comparison.stdout ?? "{}");
      expect(comparisonPreview.images).toEqual([
        expect.objectContaining({ basename: "screen.png" }),
        expect.objectContaining({ basename: "reference.png" }),
      ]);
      await expect(readFile(comparisonJson, "utf8")).resolves.toContain("\"images\"");
    } finally {
      if (previousFakeAnalysis === undefined) {
        delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      } else {
        process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = previousFakeAnalysis;
      }
      if (previousLlamaServer === undefined) {
        delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      } else {
        process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = previousLlamaServer;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("serializes concurrent bundled MiniCPM-V installs for visual fan-out", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-concurrent-minicpm-v-vision-"));
    const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = "fake Ambient visual evidence";
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");

      const installs = await Promise.all(
        Array.from({ length: 4 }, () =>
          ensureFirstPartyAmbientCliPackages(workspace, {
            packageNames: ["ambient-minicpm-v-vision"],
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          }),
        ),
      );

      expect(installs).toHaveLength(4);
      for (const statuses of installs) {
        expect(statuses).toEqual([
          expect.objectContaining({
            packageName: "ambient-minicpm-v-vision",
            source: "bundled:ambient-minicpm-v-vision",
            status: "installed",
          }),
        ]);
      }

      const catalog = await discoverAmbientCliPackages(workspace);
      expect(catalog.packages.filter((pkg) => pkg.name === "ambient-minicpm-v-vision")).toHaveLength(1);
      const config = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "utf8"));
      expect(config.packages.filter((entry: { source?: string }) => entry.source?.includes("ambient-minicpm-v-vision"))).toHaveLength(1);
    } finally {
      if (previousFakeAnalysis === undefined) {
        delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      } else {
        process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = previousFakeAnalysis;
      }
      if (previousLlamaServer === undefined) {
        delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      } else {
        process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = previousLlamaServer;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("surfaces failed voice provider health checks as unavailable", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-voice-provider-failed-health-"));
    try {
      const source = "./.ambient/cli-packages/imported/voice-fixture";
      await mkdir(join(workspace, ".ambient", "cli-packages", "imported", "voice-fixture"), { recursive: true });
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "imported", "voice-fixture", "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-broken-tts",
            version: "0.1.0",
            description: "Broken TTS provider fixture",
            skills: "./SKILL.md",
            commands: {
              broken_tts: {
                description: "Attempt to synthesize speech with missing local assets.",
                command: "node",
                args: ["./run.mjs"],
                cwd: "package",
                healthCheck: ["node", "-e", "throw new Error('model file missing')"],
                voiceProvider: {
                  defaultFormat: "wav",
                  formats: ["wav"],
                  voices: [{ id: "default" }],
                  local: true,
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(workspace, ".ambient", "cli-packages", "imported", "voice-fixture", "SKILL.md"), "---\nname: ambient-broken-tts\n---\n");
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`);

      const providers = await discoverAmbientCliVoiceProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageName: "ambient-broken-tts",
          command: "broken_tts",
          installed: true,
          available: false,
          availabilityReason: expect.stringContaining("Voice provider health check failed:"),
          diagnostics: expect.objectContaining({
            healthStatus: "failed",
            healthCommand: ["node", "-e", "throw new Error('model file missing')"],
            healthError: expect.stringContaining("model file missing"),
            missingHints: expect.arrayContaining(["Verify model files are downloaded and descriptor paths point at the repaired model location."]),
          }),
        }),
      ]);
      expect(providers[0]?.availabilityReason).toContain("model file missing");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("parses local voice provider runtime state from health-check JSON", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-voice-provider-runtime-state-"));
    try {
      const source = "./.ambient/cli-packages/imported/voice-runtime-fixture";
      await mkdir(join(workspace, ".ambient", "cli-packages", "imported", "voice-runtime-fixture"), { recursive: true });
      const healthPayload = {
        available: false,
        reason: "Piper daemon is installed but stopped.",
        missingHints: ["Start Piper before enabling voice output."],
        runtimeState: {
          status: "stopped",
          running: false,
          trackingStatus: "managed",
          modelRuntimeId: "piper-runtime",
          modelProfileId: "piper-en-us-lessac",
          modelId: "rhasspy/piper/en_US-lessac-medium",
          endpoint: "http://127.0.0.1:59201",
          statePath: ".ambient/voice/piper/runtime-state.json",
          estimatedResidentMemoryBytes: 2147483648,
          reason: "daemon stopped",
        },
      };
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "imported", "voice-runtime-fixture", "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-piper-runtime",
            version: "0.1.0",
            description: "Piper runtime-state fixture",
            skills: "./SKILL.md",
            commands: {
              piper_tts: {
                description: "Synthesize speech through a local Piper daemon.",
                command: "node",
                args: ["./run.mjs"],
                cwd: "package",
                healthCheck: ["node", "-e", `process.stdout.write(${JSON.stringify(JSON.stringify(healthPayload))})`],
                voiceProvider: {
                  label: "Piper Runtime",
                  defaultFormat: "wav",
                  formats: ["wav"],
                  voices: [{ id: "default" }],
                  local: true,
                  runtimeLifecycle: {
                    start: { command: "piper_start", label: "Start Piper" },
                    stop: { command: "piper_stop", label: "Stop Piper" },
                    restart: { command: "piper_restart", label: "Restart Piper" },
                  },
                },
              },
              piper_start: {
                description: "Start the local Piper daemon.",
                command: "node",
                args: ["-e", "process.stdout.write('started')"],
                cwd: "package",
              },
              piper_stop: {
                description: "Stop the local Piper daemon.",
                command: "node",
                args: ["-e", "process.stdout.write('stopped')"],
                cwd: "package",
              },
              piper_restart: {
                description: "Restart the local Piper daemon.",
                command: "node",
                args: ["-e", "process.stdout.write('restarted')"],
                cwd: "package",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(workspace, ".ambient", "cli-packages", "imported", "voice-runtime-fixture", "SKILL.md"), "---\nname: ambient-piper-runtime\n---\n");
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`);

      const providers = await discoverAmbientCliVoiceProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageName: "ambient-piper-runtime",
          command: "piper_tts",
          label: "Piper Runtime",
          local: true,
          installed: true,
          available: false,
          availabilityReason: "Voice provider validation pending: Piper daemon is installed but stopped.",
          diagnostics: expect.objectContaining({
            healthStatus: "passed",
            healthError: "Piper daemon is installed but stopped.",
            missingHints: expect.arrayContaining(["Start Piper before enabling voice output."]),
            runtimeState: expect.objectContaining({
              schemaVersion: "ambient-voice-provider-runtime-state-v1",
              status: "stopped",
              running: false,
              trackingStatus: "managed",
              modelRuntimeId: "piper-runtime",
              modelProfileId: "piper-en-us-lessac",
              modelId: "rhasspy/piper/en_US-lessac-medium",
              endpoint: "http://127.0.0.1:59201",
              statePath: ".ambient/voice/piper/runtime-state.json",
              estimatedResidentMemoryBytes: 2147483648,
              reason: "daemon stopped",
              providerLifecycle: expect.objectContaining({
                schemaVersion: "ambient-local-runtime-provider-lifecycle-v1",
                providerKind: "ambient-cli",
                packageName: "ambient-piper-runtime",
                start: expect.objectContaining({
                  kind: "start",
                  command: "piper_start",
                  packageName: "ambient-piper-runtime",
                }),
                stop: expect.objectContaining({
                  kind: "stop",
                  command: "piper_stop",
                  packageName: "ambient-piper-runtime",
                }),
                restart: expect.objectContaining({
                  kind: "restart",
                  command: "piper_restart",
                  packageName: "ambient-piper-runtime",
                }),
              }),
            }),
          }),
          providerLifecycle: expect.objectContaining({
            stop: expect.objectContaining({ command: "piper_stop" }),
          }),
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reports voice provider lifecycle command references that are not declared", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-voice-provider-runtime-lifecycle-error-"));
    try {
      const source = "./.ambient/cli-packages/imported/voice-runtime-bad-lifecycle";
      const root = join(workspace, ".ambient", "cli-packages", "imported", "voice-runtime-bad-lifecycle");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-piper-runtime",
            skills: "./SKILL.md",
            commands: {
              piper_tts: {
                command: "node",
                args: ["-e", "process.stdout.write('ok')"],
                cwd: "package",
                voiceProvider: {
                  label: "Piper Runtime",
                  defaultFormat: "wav",
                  formats: ["wav"],
                  voices: [{ id: "default" }],
                  local: true,
                  runtimeLifecycle: {
                    stop: { command: "missing_stop" },
                  },
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(root, "SKILL.md"), "---\nname: ambient-piper-runtime\n---\n");
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`);

      const providers = await discoverAmbientCliVoiceProviders(workspace);
      expect(providers[0]).toMatchObject({
        available: false,
        availabilityReason: 'Command "piper_tts" voiceProvider.runtimeLifecycle.stop.command references undeclared command "missing_stop".',
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("parses local embedding provider runtime state from health-check JSON", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-embedding-provider-runtime-state-"));
    try {
      const source = "./.ambient/cli-packages/imported/embedding-runtime-fixture";
      await mkdir(join(workspace, ".ambient", "cli-packages", "imported", "embedding-runtime-fixture"), { recursive: true });
      const healthPayload = {
        available: true,
        runtimeState: {
          status: "running",
          running: true,
          trackingStatus: "managed",
          modelRuntimeId: "bge-runtime",
          modelId: "BAAI/bge-small-en-v1.5",
          pid: 7001,
          endpoint: "http://127.0.0.1:59301",
          statePath: ".ambient/embeddings/bge/runtime-state.json",
          estimatedResidentMemoryBytes: 1610612736,
          actualResidentMemoryBytes: 1342177280,
          memorySampledAt: "2026-06-05T00:00:00.000Z",
        },
      };
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "imported", "embedding-runtime-fixture", "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-bge-embeddings",
            version: "0.1.0",
            description: "BGE embedding runtime-state fixture",
            skills: "./SKILL.md",
            commands: {
              bge_embeddings: {
                description: "Embed text through a local BGE daemon.",
                command: "node",
                args: ["./run.mjs"],
                cwd: "package",
                healthCheck: ["node", "-e", `process.stdout.write(${JSON.stringify(JSON.stringify(healthPayload))})`],
                embeddingProvider: {
                  label: "BGE Embeddings",
                  modelId: "BAAI/bge-small-en-v1.5",
                  dimensions: 384,
                  local: true,
                  runtimeLifecycle: {
                    start: { command: "bge_start", label: "Start BGE" },
                    stop: { command: "bge_stop", label: "Stop BGE" },
                    restart: { command: "bge_restart", label: "Restart BGE" },
                  },
                },
              },
              bge_start: {
                description: "Start the local BGE daemon.",
                command: "node",
                args: ["-e", "process.stdout.write('started')"],
                cwd: "package",
              },
              bge_stop: {
                description: "Stop the local BGE daemon.",
                command: "node",
                args: ["-e", "process.stdout.write('stopped')"],
                cwd: "package",
              },
              bge_restart: {
                description: "Restart the local BGE daemon.",
                command: "node",
                args: ["-e", "process.stdout.write('restarted')"],
                cwd: "package",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(workspace, ".ambient", "cli-packages", "imported", "embedding-runtime-fixture", "SKILL.md"), "---\nname: ambient-bge-embeddings\n---\n");
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`);

      const providers = await discoverAmbientCliEmbeddingProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageName: "ambient-bge-embeddings",
          command: "bge_embeddings",
          label: "BGE Embeddings",
          modelId: "BAAI/bge-small-en-v1.5",
          dimensions: 384,
          local: true,
          installed: true,
          available: true,
          availabilityReason: "Installed Ambient CLI package is available; execution still requires Desktop approval.",
          diagnostics: expect.objectContaining({
            healthStatus: "passed",
            runtimeState: expect.objectContaining({
              schemaVersion: "ambient-embedding-provider-runtime-state-v1",
              status: "running",
              running: true,
              trackingStatus: "managed",
              modelRuntimeId: "bge-runtime",
              modelId: "BAAI/bge-small-en-v1.5",
              pid: 7001,
              endpoint: "http://127.0.0.1:59301",
              statePath: ".ambient/embeddings/bge/runtime-state.json",
              estimatedResidentMemoryBytes: 1610612736,
              actualResidentMemoryBytes: 1342177280,
              providerLifecycle: expect.objectContaining({
                schemaVersion: "ambient-local-runtime-provider-lifecycle-v1",
                providerKind: "ambient-cli",
                packageName: "ambient-bge-embeddings",
                stop: expect.objectContaining({
                  kind: "stop",
                  command: "bge_stop",
                  packageName: "ambient-bge-embeddings",
                }),
              }),
            }),
          }),
          providerLifecycle: expect.objectContaining({
            stop: expect.objectContaining({ command: "bge_stop" }),
          }),
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  itLivePiCatalog("installs pi-arxiv from a Pi catalog URL and runs a real arXiv lookup", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-pi-catalog-"));
    try {
      const source = "https://pi.dev/packages/pi-arxiv?name=arxiv";
      const preview = await previewAmbientCliPackagePiCatalogSource(workspace, source);
      expect(preview.installable).toBe(true);
      expect(preview.resolution).toMatchObject({
        npmPackageName: "pi-arxiv",
        repositoryUrl: "https://github.com/nicehiro/dotfiles",
        repositoryDirectory: ".pi/agent/extensions/arxiv",
        adapter: "pi-arxiv",
      });
      const installed = await installAmbientCliPackagePiCatalogSource(workspace, source);
      expect(installed).toMatchObject({
        name: "pi-arxiv",
        commands: [expect.objectContaining({ name: "arxiv_search" }), expect.objectContaining({ name: "arxiv_paper" })],
      });
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "pi-arxiv",
        command: "arxiv_paper",
        args: ["2303.04137"],
      });
      expect(result.stdout).toMatch(/\b\d{4}\.\d{4,5}(v\d+)?\b/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 180_000);

  itLivePiCatalog("installs youtube-transcript from badlogic pi-skills and runs a real transcript lookup", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-youtube-transcript-"));
    try {
      const source = "https://github.com/badlogic/pi-skills/blob/main/youtube-transcript/SKILL.md";
      const preview = await previewAmbientCliPackagePiCatalogSource(workspace, source);
      expect(preview).toMatchObject({
        installable: true,
        resolution: expect.objectContaining({
          npmPackageName: "youtube-transcript",
          repositoryUrl: "https://github.com/badlogic/pi-skills",
          repositoryDirectory: "youtube-transcript",
          adapter: "youtube-transcript",
          installDependencies: true,
        }),
      });
      const installed = await installAmbientCliPackagePiCatalogSource(workspace, source);
      expect(installed).toMatchObject({
        name: "youtube-transcript",
        commands: [expect.objectContaining({ name: "youtube_transcript" })],
        skills: [expect.objectContaining({ name: "youtube-transcript" })],
      });
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "youtube-transcript",
        command: "youtube_transcript",
        args: ["EBw7gsDPAYQ"],
      });
      expect(result.stdout).toMatch(/\[\d+:\d{2}\]\s+\S+/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 180_000);

  itLivePiCatalog("installs brave-search from badlogic pi-skills and runs a real Brave query through an Ambient-managed secret binding", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-brave-search-pi-"));
    try {
      const source = "https://github.com/badlogic/pi-skills/blob/main/brave-search/SKILL.md";
      const preview = await previewAmbientCliPackagePiCatalogSource(workspace, source);
      expect(preview).toMatchObject({
        installable: true,
        resolution: expect.objectContaining({
          npmPackageName: "brave-search",
          repositoryUrl: "https://github.com/badlogic/pi-skills",
          repositoryDirectory: "brave-search",
          adapter: "brave-search",
        }),
      });
      const installed = await installAmbientCliPackagePiCatalogSource(workspace, source);
      expect(installed).toMatchObject({
        name: "brave-search",
        commands: [expect.objectContaining({ name: "search" })],
        skills: [expect.objectContaining({ name: "brave-search" })],
      });

      const braveKey = await readTestSecret("BRAVE_API_KEY", "brave_api_key.txt");
      await writeFile(join(workspace, "brave_api_key.txt"), `${braveKey}\n`, { encoding: "utf8", mode: 0o600 });
      await expect(
        setAmbientCliPackageEnvBinding(workspace, {
          packageName: "brave-search",
          envName: "BRAVE_API_KEY",
          filePath: "./brave_api_key.txt",
        }),
      ).resolves.toMatchObject({ configured: true, source: "file" });

      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "brave-search",
        command: "search",
        args: ["Ambient Desktop install routing", "-n", "1"],
      });
      const parsed = JSON.parse(result.stdout ?? "");
      expect(parsed).toMatchObject({
        provider: "brave-search",
        host: "api.search.brave.com",
        query: "Ambient Desktop install routing",
      });
      expect(parsed.resultCount).toBeGreaterThanOrEqual(1);
      expect(result.stdout).not.toContain(braveKey);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 180_000);

  itLivePiCatalog("ensures first-party Ambient CLI packages are installed for lazy discovery", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-"));
    try {
      await expect(discoverAmbientCliPackages(workspace)).resolves.toMatchObject({ packages: [] });
      const statuses = await ensureFirstPartyAmbientCliPackages(workspace);
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "youtube-transcript",
          status: "installed",
        }),
        expect.objectContaining({
          packageName: "brave-search",
          status: "installed",
        }),
        expect.objectContaining({
          packageName: "pi-arxiv",
          status: "installed",
        }),
        expect.objectContaining({
          packageName: "ambient-qwen3-asr",
          status: "installed",
        }),
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          status: "installed",
        }),
        expect.objectContaining({
          packageName: "ambient-hyperframes",
          status: "installed",
        }),
        expect.objectContaining({
          packageName: "ambient-imagegen",
          status: "installed",
        }),
      ]);

      const youtubeSearch = await searchAmbientCliCapabilities(workspace, { query: "youtube video transcript captions", limit: 5 });
      expect(youtubeSearch.results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          packageName: "youtube-transcript",
          commands: [expect.objectContaining({ name: "youtube_transcript", health: "passed" })],
        }),
      ]));

      const braveSearch = await searchAmbientCliCapabilities(workspace, { query: "brave search web", limit: 5 });
      expect(braveSearch.results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          packageName: "brave-search",
          commands: [expect.objectContaining({ name: "search", health: "passed" })],
        }),
      ]));

      const arxivSearch = await searchAmbientCliCapabilities(workspace, { query: "arxiv paper search", limit: 5 });
      expect(arxivSearch.results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          packageName: "pi-arxiv",
          commands: expect.arrayContaining([
            expect.objectContaining({ name: "arxiv_search", health: "passed" }),
            expect.objectContaining({ name: "arxiv_paper", health: "passed" }),
          ]),
        }),
      ]));

      const repeated = await ensureFirstPartyAmbientCliPackages(workspace);
      expect(repeated).toEqual([
        expect.objectContaining({
          packageName: "youtube-transcript",
          status: "already_installed",
        }),
        expect.objectContaining({
          packageName: "brave-search",
          status: "already_installed",
        }),
        expect.objectContaining({
          packageName: "pi-arxiv",
          status: "already_installed",
        }),
        expect.objectContaining({
          packageName: "ambient-qwen3-asr",
          status: "already_installed",
        }),
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          status: "already_installed",
        }),
        expect.objectContaining({
          packageName: "ambient-hyperframes",
          status: "already_installed",
        }),
        expect.objectContaining({
          packageName: "ambient-imagegen",
          status: "already_installed",
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 180_000);

  it("searches installed Ambient CLI capabilities without reading uninstalled package sources", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-search-"));
    try {
      await seedCliFixture(workspace);
      const installed = await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });

      const result = await searchAmbientCliCapabilities(workspace, { query: "json field extract", limit: 5 });
      expect(result.catalogVersion).toMatch(/^ambient-cli-v1:/);
      expect(result.truncated).toBe(false);
      expect(result.results).toEqual([
        expect.objectContaining({
          packageId: installed.id,
          registryPluginId: `cli:${installed.id}`,
          sourceKind: "ambient-cli",
          packageName: "ambient-json-cli",
          availability: "available",
          commands: [expect.objectContaining({ capabilityId: `${installed.id}:tool:json-pick`, sourceKind: "ambient-cli", name: "json-pick", health: "passed", risk: ["run_process"] })],
          skills: [expect.objectContaining({ sourceKind: "ambient-cli", name: "ambient-json-cli", path: "skills/json-cli/SKILL.md" })],
          missingEnv: [],
        }),
      ]);
      expect(result.results[0]?.skills[0]?.capabilityId).toContain(":skill:");
      expect(result.results[0]?.whyMatched).toEqual(expect.arrayContaining(["command:json-pick", "skill:ambient-json-cli"]));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("filters Ambient CLI search by exact package and command and reports missing env", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-search-env-"));
    try {
      const root = join(workspace, "brave-search");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ name: "brave-search", version: "1.0.0", description: "Headless web search via Brave Search" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(root, "search.js"), "process.stdout.write('ok');\n", "utf8");
      await writeFile(
        join(root, "SKILL.md"),
        ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
        "utf8",
      );
      await installAmbientCliPackageSource(workspace, {
        source: "./brave-search",
        descriptor: { ...braveSearchOverlayDescriptor(), env: ["BRAVE_API_KEY"] },
      });

      const result = await searchAmbientCliCapabilities(workspace, {
        query: "web search",
        packageName: "brave-search",
        command: "search",
        kind: "command",
      });
      expect(result.results).toEqual([
        expect.objectContaining({
          packageName: "brave-search",
          commands: [expect.objectContaining({ name: "search" })],
          skills: [],
          missingEnv: ["BRAVE_API_KEY"],
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("describes installed Ambient CLI packages with structured command metadata and bounded skill text", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-describe-"));
    try {
      await seedCliFixture(workspace);
      const installed = await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });

      const withoutSkill = await describeAmbientCliPackage(workspace, { packageName: "ambient-json-cli", command: "json-pick" });
      expect(withoutSkill).toMatchObject({
        package: {
          name: "ambient-json-cli",
          availability: "available",
        },
        commands: [
          expect.objectContaining({
            capabilityId: `${installed.id}:tool:json-pick`,
            sourceKind: "ambient-cli",
            name: "json-pick",
            descriptorArgs: [expect.stringContaining("json-pick.mjs")],
            cwd: "workspace",
            health: "passed",
            risk: ["run_process"],
            invocation: {
              tool: "ambient_cli",
              packageName: "ambient-json-cli",
              command: "json-pick",
              args: [],
            },
          }),
        ],
        skills: [expect.objectContaining({ capabilityId: expect.stringContaining(`${installed.id}:skill:`), sourceKind: "ambient-cli", name: "ambient-json-cli", summaryStatus: "missing" })],
        env: [],
      });
      expect(withoutSkill.skills[0]).not.toHaveProperty("text");

      const withSkill = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-json-cli",
        includeSkill: true,
        maxSkillChars: 24,
      });
      expect(withSkill.skills[0]).toMatchObject({
        name: "ambient-json-cli",
        text: expect.stringContaining("---"),
        truncated: true,
      });
      expect(withSkill.guidance.join("\n")).toContain('ambient_cli packageName="ambient-json-cli" command="json-pick"');

      const skillText = await readFile(installed.skills[0]!.path, "utf8");
      await writeAmbientCliSkillSummary(workspace, {
        schemaVersion: "ambient-cli-skill-summary-v1",
        packageId: installed.id,
        packageName: installed.name,
        packageSource: installed.source,
        packageVersion: installed.version,
        skillPath: "skills/json-cli/SKILL.md",
        rawSkillHash: sha256(skillText),
        generatedAt: "2026-05-05T00:00:00.000Z",
        capabilityBrief: "Extract a top-level field from a JSON file.",
        whenToUse: ["Use when a workspace JSON payload needs one top-level property printed."],
        commands: { "json-pick": "Prints a top-level JSON field." },
        arguments: ["file path", "field name"],
        safety: ["Reads workspace files and runs the descriptor command through ambient_cli approval."],
        fallbacks: ["Ask the user for the JSON file path if it is ambiguous."],
      });

      const withSummary = await describeAmbientCliPackage(workspace, { packageName: "ambient-json-cli", command: "json-pick" });
      expect(withSummary.skills[0]).toMatchObject({
        name: "ambient-json-cli",
        summaryStatus: "available",
        summary: expect.objectContaining({
          capabilityBrief: "Extract a top-level field from a JSON file.",
          commands: { "json-pick": "Prints a top-level JSON field." },
        }),
      });
      expect(withSummary.skills[0]).not.toHaveProperty("text");

      const summarySkipped = await describeAmbientCliPackage(workspace, { packageName: "ambient-json-cli", includeSummary: false });
      expect(summarySkipped.skills[0]).toMatchObject({ summaryStatus: "not_requested" });
      expect(summarySkipped.skills[0]).not.toHaveProperty("summary");

      await writeFile(installed.skills[0]!.path, `${skillText}\nAdditional guidance.\n`, "utf8");
      const staleSummary = await describeAmbientCliPackage(workspace, { packageName: "ambient-json-cli" });
      expect(staleSummary.skills[0]).toMatchObject({
        summaryStatus: "stale",
        summaryError: expect.stringContaining("older SKILL.md content"),
      });
      expect(staleSummary.skills[0]).not.toHaveProperty("summary");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("generates and caches missing Ambient CLI summaries when an RLM completer is supplied", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-rlm-summary-"));
    try {
      await seedCliFixture(workspace);
      await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });
      const prompts: string[] = [];

      const generated = await describeAmbientCliPackage(
        workspace,
        { packageName: "ambient-json-cli", command: "json-pick" },
        {
          generateMissingSummaries: true,
          now: () => new Date("2026-05-05T12:00:00.000Z"),
          modelComplete: async (prompt) => {
            prompts.push(prompt);
            expect(prompt).toContain("Return ONLY a JSON object");
            expect(prompt).toContain("json-pick");
            return JSON.stringify({
              capabilityBrief: "Extract one top-level JSON field from a workspace file.",
              whenToUse: ["Use for simple JSON field extraction."],
              commands: { "json-pick": "Reads a JSON file and prints one top-level key." },
              arguments: ["workspace JSON file path", "top-level key"],
              safety: ["Runs through ambient_cli approval."],
              fallbacks: ["Ask for the file path or key if either is unclear."],
            });
          },
        },
      );

      expect(generated.skills[0]).toMatchObject({
        summaryStatus: "available",
        summary: expect.objectContaining({
          generatedAt: "2026-05-05T12:00:00.000Z",
          capabilityBrief: "Extract one top-level JSON field from a workspace file.",
        }),
      });
      expect(prompts).toHaveLength(1);

      const cached = await describeAmbientCliPackage(
        workspace,
        { packageName: "ambient-json-cli", command: "json-pick" },
        {
          generateMissingSummaries: true,
          modelComplete: async () => {
            throw new Error("cache should be used");
          },
        },
      );
      expect(cached.skills[0]).toMatchObject({
        summaryStatus: "available",
        summary: expect.objectContaining({ capabilityBrief: "Extract one top-level JSON field from a workspace file." }),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("records Ambient CLI summary generation failures with retry backoff", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-rlm-summary-fail-"));
    try {
      await seedCliFixture(workspace);
      await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });
      let calls = 0;

      const failed = await describeAmbientCliPackage(
        workspace,
        { packageName: "ambient-json-cli" },
        {
          generateMissingSummaries: true,
          now: () => new Date("2026-05-05T12:00:00.000Z"),
          modelComplete: async () => {
            calls += 1;
            throw new Error("model unavailable");
          },
        },
      );

      expect(failed.skills[0]).toMatchObject({
        summaryStatus: "failed",
        summaryError: expect.stringContaining("model unavailable"),
        summaryRetryAfter: "2026-05-05T18:00:00.000Z",
      });
      expect(calls).toBe(1);

      const backedOff = await describeAmbientCliPackage(
        workspace,
        { packageName: "ambient-json-cli" },
        {
          generateMissingSummaries: true,
          now: () => new Date("2026-05-05T13:00:00.000Z"),
          modelComplete: async () => {
            calls += 1;
            return "{}";
          },
        },
      );
      expect(backedOff.skills[0]).toMatchObject({
        summaryStatus: "failed",
        summaryRetryAfter: "2026-05-05T18:00:00.000Z",
      });
      expect(calls).toBe(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("hydrates Ambient CLI package summaries through an explicit policy helper", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-summary-policy-"));
    try {
      await seedCliFixture(workspace);
      const installed = await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });
      const disabled = await hydrateAmbientCliPackageSummaries(workspace, { packageId: installed.id }, { generateMissingSummaries: false });
      expect(disabled).toMatchObject({
        packageId: installed.id,
        attempted: false,
        reason: "Summary generation policy is disabled.",
        summaryStatuses: [expect.objectContaining({ skillName: "ambient-json-cli", status: "missing" })],
      });

      const hydrated = await hydrateAmbientCliPackageSummaries(workspace, { packageId: installed.id }, {
        generateMissingSummaries: true,
        now: () => new Date("2026-05-05T12:00:00.000Z"),
        modelComplete: async () =>
          JSON.stringify({
            capabilityBrief: "Extract one top-level JSON field from a workspace file.",
            whenToUse: ["Use for simple JSON field extraction."],
            commands: { "json-pick": "Reads a JSON file and prints one top-level key." },
            arguments: ["workspace JSON file path", "top-level key"],
            safety: ["Runs through ambient_cli approval."],
            fallbacks: ["Ask for the file path or key if either is unclear."],
          }),
      });
      expect(hydrated).toMatchObject({
        packageId: installed.id,
        attempted: true,
        availableCount: 1,
        failedCount: 0,
        summaryStatuses: [expect.objectContaining({ skillName: "ambient-json-cli", status: "available" })],
      });

      const description = await describeAmbientCliPackage(workspace, { packageId: installed.id });
      expect(description.skills[0]).toMatchObject({
        summaryStatus: "available",
        summary: expect.objectContaining({ capabilityBrief: "Extract one top-level JSON field from a workspace file." }),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("describes missing Ambient CLI env requirements without reading secret values", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-describe-env-"));
    try {
      const root = join(workspace, "brave-search");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ name: "brave-search", version: "1.0.0", description: "Headless web search via Brave Search" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(root, "search.js"), "process.stdout.write('ok');\n", "utf8");
      await writeFile(
        join(root, "SKILL.md"),
        ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
        "utf8",
      );
      await installAmbientCliPackageSource(workspace, {
        source: "./brave-search",
        descriptor: { ...braveSearchOverlayDescriptor(), env: ["BRAVE_API_KEY"] },
      });

      const description = await describeAmbientCliPackage(workspace, { packageName: "brave-search", command: "search" });
      expect(description.env).toEqual([expect.objectContaining({ name: "BRAVE_API_KEY", configured: false })]);
      expect(description.commands[0]?.risk).toEqual(["run_process", "secret_env_required"]);
      expect(description.guidance.join("\n")).toContain("ambient_cli_secret_request");
      expect(JSON.stringify(description)).not.toContain("test-brave-key");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks install when a descriptor health check fails", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-workspace-"));
    try {
      await seedCliFixture(workspace, { healthCheck: ["node", "./bin/json-pick.mjs", "missing.json", "message"] });
      await expect(installAmbientCliPackageSource(workspace, { source: "./cli-fixture" })).rejects.toThrow(
        'Ambient CLI package health check failed for "json-pick"',
      );
      await expect(readFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("mounts descriptor-backed package-root SKILL.md files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-root-skill-"));
    try {
      const root = join(workspace, "cli-fixture");
      await mkdir(join(root, "bin"), { recursive: true });
      await writeFile(
        join(root, "ambient-cli.json"),
        `${JSON.stringify(
          {
            name: "ambient-root-skill-cli",
            version: "0.1.0",
            skills: "./SKILL.md",
            commands: {
              echo: {
                command: "node",
                args: ["./bin/echo.mjs"],
                cwd: "workspace",
                healthCheck: ["node", "./bin/echo.mjs", "healthy"],
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(join(root, "bin", "echo.mjs"), "process.stdout.write(process.argv.slice(2).join(' '));\n", "utf8");
      await writeFile(
        join(root, "SKILL.md"),
        ["---", "name: ambient-root-skill-cli", "description: Root skill mounted from package root.", "---", "", "Use ambient_cli.", ""].join("\n"),
        "utf8",
      );

      const installed = await installAmbientCliPackageSource(workspace, { source: "./cli-fixture" });
      expect(installed.skills).toEqual([expect.objectContaining({ name: "ambient-root-skill-cli", path: expect.stringContaining("SKILL.md") })]);
      await expect(enabledAmbientCliSkillPaths(workspace)).resolves.toEqual([installed.rootPath]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews package-root SKILL.md packages as non-executable candidates without a command descriptor", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-bare-skill-"));
    try {
      const root = join(workspace, "brave-search");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ name: "brave-search", version: "1.0.0", description: "Headless web search via Brave Search" }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(root, "SKILL.md"),
        ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
        "utf8",
      );

      const preview = await previewAmbientCliPackageInstallSource(workspace, { source: "./brave-search" });
      expect(preview).toMatchObject({
        installable: false,
        candidate: expect.objectContaining({
          name: "brave-search",
          version: "1.0.0",
          skills: [expect.objectContaining({ name: "brave-search" })],
          commands: [],
          errors: [],
        }),
        errors: ["Ambient CLI package descriptor does not declare any commands."],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs package-root SKILL.md packages with an explicit descriptor overlay", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-overlay-"));
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
        "process.stdout.write(`query:${process.argv.slice(2).join(' ')}`);\n",
        "utf8",
      );
      await writeFile(
        join(root, "SKILL.md"),
        ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
        "utf8",
      );
      const descriptor = braveSearchOverlayDescriptor();

      const preview = await previewAmbientCliPackageInstallSource(workspace, { source: "./brave-search", descriptor });
      expect(preview).toMatchObject({
        installable: true,
        candidate: expect.objectContaining({
          name: "brave-search",
          commands: [expect.objectContaining({ name: "search" })],
          skills: [expect.objectContaining({ name: "brave-search" })],
        }),
        errors: [],
      });

      const installed = await installAmbientCliPackageSource(workspace, { source: "./brave-search", descriptor });
      expect(installed.commands).toEqual([expect.objectContaining({ name: "search" })]);
      expect(JSON.parse(await readFile(join(installed.rootPath, "ambient-cli.json"), "utf8"))).toMatchObject({ name: "brave-search" });

      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "brave-search",
        command: "search",
        args: ["ambient", "desktop"],
      });
      expect(result.stdout).toBe("query:ambient desktop");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

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
        ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
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
        ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
        "utf8",
      );
      const descriptor = { ...braveSearchOverlayDescriptor(), env: ["BRAVE_API_KEY"] };
      await installAmbientCliPackageSource(workspace, { source: "./brave-search", descriptor });

      const legacySecretPath = join(workspace, ".ambient", "cli-packages", "secrets", "brave-search", "BRAVE_API_KEY.secret");
      await mkdir(join(legacySecretPath, ".."), { recursive: true });
      await writeFile(legacySecretPath, "legacy-brave-key\n", "utf8");
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "env-bindings.json"),
        `${JSON.stringify({
          bindings: [{
            packageName: "brave-search",
            envName: "BRAVE_API_KEY",
            filePath: "./.ambient/cli-packages/secrets/brave-search/BRAVE_API_KEY.secret",
          }],
        }, null, 2)}\n`,
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
        installable: false,
        errors: [expect.stringContaining("Cannot find package 'ambient-helper'")],
      });

      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "./brave-search",
        descriptor,
        installDependencies: true,
      });
      expect(preview).toMatchObject({
        installable: true,
        dependencyInstall: expect.objectContaining({
          attempted: true,
          passed: true,
          command: ["npm", "ci", "--ignore-scripts"],
        }),
        errors: [],
      });

      const installed = await installAmbientCliPackageSource(workspace, {
        source: "./brave-search",
        descriptor,
        installDependencies: true,
      });
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "brave-search",
        command: "search",
        args: ["ambient"],
      });
      expect(result.stdout).toBe("formatted:ambient");
      expect(await readFile(join(installed.rootPath, "node_modules", "ambient-helper", "index.js"), "utf8")).toContain("formatted");
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
        ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
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

async function seedCliFixture(workspace: string, options: { healthCheck?: string[] } = {}): Promise<void> {
  const root = join(workspace, "cli-fixture");
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "skills", "json-cli"), { recursive: true });
  await writeFile(
    join(root, "ambient-cli.json"),
    `${JSON.stringify(
      {
        name: "ambient-json-cli",
        version: "0.1.0",
        description: "Fixture JSON CLI package.",
        skills: "./skills",
        commands: {
          "json-pick": {
            command: "node",
            args: ["./bin/json-pick.mjs"],
            cwd: "workspace",
            description: "Print a top-level JSON field.",
            healthCheck: options.healthCheck ?? ["node", "./bin/json-pick.mjs", "health.json", "message"],
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "bin", "json-pick.mjs"),
    [
      "import { readFileSync } from 'node:fs';",
      "const [file, key] = process.argv.slice(2);",
      "const value = JSON.parse(readFileSync(file, 'utf8'))[key];",
      "process.stdout.write(String(value));",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "health.json"), `${JSON.stringify({ message: "healthy" })}\n`, "utf8");
  await writeFile(
    join(root, "skills", "json-cli", "SKILL.md"),
    ["---", "name: ambient-json-cli", "description: Use ambient_cli json-pick for JSON field extraction.", "---", "", "Use ambient_cli.", ""].join("\n"),
    "utf8",
  );
}

function braveSearchOverlayDescriptor(): Record<string, unknown> {
  return {
    name: "brave-search",
    version: "1.0.0",
    description: "Reviewed Brave Search CLI package.",
    skills: "./SKILL.md",
    commands: {
      search: {
        command: "node",
        args: ["./search.js"],
        cwd: "package",
        description: "Run Brave Search.",
        healthCheck: ["node", "--check", "./search.js"],
      },
    },
  };
}

async function seedCliPackageWithLocalDependency(root: string): Promise<void> {
  await mkdir(join(root, "deps", "ambient-helper"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "brave-search",
        version: "1.0.0",
        type: "module",
        description: "Headless web search via Brave Search",
        dependencies: { "ambient-helper": "file:./deps/ambient-helper" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(root, "deps", "ambient-helper", "package.json"), `${JSON.stringify({ name: "ambient-helper", version: "1.0.0", type: "module" }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "deps", "ambient-helper", "index.js"), "export function format(value) { return `formatted:${value}`; }\n", "utf8");
  await writeFile(join(root, "search.js"), "import { format } from 'ambient-helper';\nprocess.stdout.write(format(process.argv[2] ?? ''));\n", "utf8");
  await writeFile(
    join(root, "SKILL.md"),
    ["---", "name: brave-search", "description: Web search and content extraction via Brave Search API.", "---", "", "# Brave Search", ""].join("\n"),
    "utf8",
  );
  await execFileAsync("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, env: { ...process.env } });
}

async function readTestSecret(envName: string, fileName: string): Promise<string> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const fileFromEnv = process.env[`${envName}_FILE`]?.trim();
  if (fileFromEnv) {
    const value = (await readFile(fileFromEnv, "utf8")).trim();
    if (value) return value;
  }
  for (const candidate of [
    join(process.cwd(), fileName),
    join(dirname(process.cwd()), fileName),
    join(dirname(process.cwd()), "ambientCoder", fileName),
  ]) {
    if (!existsSync(candidate)) continue;
    const value = (await readFile(candidate, "utf8")).trim();
    if (value) return value;
  }
  throw new Error(`Set ${envName}, ${envName}_FILE, or provide ignored ${fileName} for this live Ambient CLI smoke.`);
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function silentWav(durationMs: number): Buffer {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataBytes = sampleCount * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

function tinyPng(): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax8pWQAAAAASUVORK5CYII=", "base64");
}
