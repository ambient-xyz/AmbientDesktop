import { existsSync } from "node:fs";
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
  saveCapabilityBuilderEnvSecret,
  scaffoldCapabilityBuilderPackage,
  unregisterCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
  writeCapabilityBuilderFile,
} from "./capabilityBuilder";
import { runAmbientCliPackageCommand } from "../ambient-cli/ambientCliPackages";
import { MANAGED_INSTALL_ROOT_ENV } from "../setup/managedInstallPaths";

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
      await expect(writeCapabilityBuilderFile(workspace, {
        sourcePath: scaffold.sourceRef.sourcePath,
        filePath: "capability-build.json",
        content: "{}",
        reason: "overwrite metadata",
      })).rejects.toThrow(/metadata or logs/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("scaffolds an explicit Piper voice provider with normalized Ambient voice metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-voice-provider",
        goal: "Create a local voice provider using Piper",
        kind: "tts-provider",
        provider: "Piper",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      expect(descriptor).toMatchObject({
        name: "ambient-piper-voice-provider",
        commands: {
          piper_voice_provider: {
            voiceProvider: {
              defaultFormat: "wav",
              formats: ["wav"],
              voices: [{ id: "default", label: "Default Piper voice" }],
              local: true,
            },
          },
        },
        networkHosts: ["huggingface.co", "pypi.org", "files.pythonhosted.org"],
        modelAssets: [
          expect.objectContaining({ cachePath: "models/en_US-lessac-medium.onnx" }),
          expect.objectContaining({ cachePath: "models/en_US-lessac-medium.onnx.json" }),
        ],
      });
      const script = await readFile(result.scriptPath, "utf8");
      expect(script).toContain("uvx");
      expect(script).toContain("checkAssets();");
      expect(script).toContain("Missing Piper model assets");
      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "piper-voice-provider" });
      expect(preview.valid).toBe(true);
      expect(preview.risks).toEqual(expect.arrayContaining([expect.stringContaining("model/data assets: Piper en_US lessac medium ONNX voice")]));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("scaffolds an explicit Kokoro ONNX voice provider with model assets and validation boundaries", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "kokoro-onnx-voice-provider",
        goal: "Create a local voice provider using Kokoro ONNX",
        kind: "tts-provider",
        provider: "Kokoro ONNX",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      expect(result.files).toEqual(["ambient-cli.json", "SKILL.md", "scripts/run.mjs", "scripts/synthesize.py", "tests/smoke.test.mjs"]);
      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      expect(descriptor).toMatchObject({
        name: "ambient-kokoro-onnx-voice-provider",
        commands: {
          kokoro_onnx_voice_provider: {
            voiceProvider: {
              label: "Kokoro ONNX Voice Provider",
              defaultFormat: "wav",
              formats: ["wav"],
              voices: [{ id: "af_sarah", label: "af_sarah" }],
              local: true,
            },
          },
        },
        networkHosts: ["github.com", "objects.githubusercontent.com", "pypi.org", "files.pythonhosted.org"],
        modelAssets: [
          expect.objectContaining({ cachePath: "models/kokoro-v1.0.int8.onnx", expectedSizeBytes: 92361271 }),
          expect.objectContaining({ cachePath: "models/voices-v1.0.bin", expectedSizeBytes: 28214398 }),
        ],
      });
      await expect(readFile(result.skillPath, "utf8")).resolves.toContain("uv run --with kokoro-onnx --with soundfile");
      const script = await readFile(result.scriptPath, "utf8");
      expect(script).toContain("kokoro-v1.0.int8.onnx");
      expect(script).toContain("Missing Kokoro ONNX model assets");
      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "kokoro-onnx-voice-provider" });
      expect(preview.valid).toBe(true);
      expect(preview.risks).toEqual(expect.arrayContaining([expect.stringContaining("model/data assets: Kokoro ONNX v1.0 int8 model")]));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("scaffolds an unknown cloud TTS provider as a real Ambient voice provider shape", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "acme-cloud-tts",
        goal: "Create an Ambient voice provider using Acme Cloud TTS",
        installerShape: "tts-provider",
        kind: "artifact generator",
        provider: "Acme Cloud",
        outputArtifactTypes: ["MP3"],
        locality: "network",
        envNames: ["ACME_CLOUD_TTS_API_KEY"],
        networkHosts: ["api.acme-tts.example"],
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      expect(descriptor).toMatchObject({
        name: "ambient-acme-cloud-tts",
        commands: {
          acme_cloud_tts: {
            voiceProvider: {
              label: "Acme Cloud Voice Provider",
              defaultFormat: "mp3",
              formats: ["mp3"],
              voices: [{ id: "default", label: "Default voice" }],
              local: false,
            },
          },
        },
        env: [{ name: "ACME_CLOUD_TTS_API_KEY", required: true }],
        networkHosts: ["api.acme-tts.example"],
        artifacts: { outputTypes: ["MP3"] },
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        installerShape: "tts-provider",
        kind: "artifact generator",
      });
      const script = await readFile(result.scriptPath, "utf8");
      expect(script).toContain("--format <wav|mp3|ogg>");
      expect(script).toContain("JSON.stringify");
      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "acme-cloud-tts" });
      expect(preview.valid).toBe(true);
      expect(preview.errors).toEqual([]);
      expect(preview.descriptor).toMatchObject({
        voiceProviderCommandNames: ["acme_cloud_tts"],
        envNames: ["ACME_CLOUD_TTS_API_KEY"],
        networkHosts: ["api.acme-tts.example"],
        artifactOutputTypes: ["MP3"],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("scaffolds ElevenLabs as an implemented cloud voice provider template", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "elevenlabs-voice-provider",
        goal: "Create an Ambient voice provider using ElevenLabs",
        installerShape: "tts-provider",
        provider: "ElevenLabs",
        outputArtifactTypes: ["MP3"],
        locality: "network",
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      expect(descriptor).toMatchObject({
        name: "ambient-elevenlabs-voice-provider",
        commands: {
          elevenlabs_voice_provider: {
            voiceProvider: {
              label: "ElevenLabs Voice Provider",
              defaultFormat: "mp3",
              formats: ["mp3"],
              voices: [{ id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" }],
              local: false,
              voiceDiscovery: {
                command: "elevenlabs_voice_provider",
                cacheTtlSeconds: 86400,
                requiresNetwork: true,
                requiresSecret: ["ELEVENLABS_API_KEY"],
                source: "cloud-api",
              },
              voiceCloning: {
                supported: true,
                mode: "cloud",
                inputs: {
                  audioFormats: ["mp3", "wav", "m4a", "webm"],
                  minDurationSeconds: 30,
                  maxDurationSeconds: 1800,
                  minSamples: 1,
                  transcript: "optional",
                },
                requiresConsent: true,
                requiresSecret: ["ELEVENLABS_API_KEY"],
                networkHosts: ["api.elevenlabs.io"],
                output: {
                  creates: ["provider-voice-id", "dynamic-cache-voice"],
                  appearsInDynamicCatalog: true,
                },
              },
            },
          },
        },
        env: [{ name: "ELEVENLABS_API_KEY", required: true }],
        networkHosts: ["api.elevenlabs.io"],
        artifacts: { outputTypes: ["MP3"] },
      });
      const script = await readFile(result.scriptPath, "utf8");
      expect(script).toContain("api.elevenlabs.io/v1/text-to-speech");
      expect(script).toContain("--list-voices");
      expect(script).toContain("api.elevenlabs.io/v1/voices");
      expect(script).toContain("ELEVENLABS_API_KEY");
      expect(script).toContain("mp3_44100_128");
      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "elevenlabs-voice-provider" });
      expect(preview.valid).toBe(true);
      expect(preview.descriptor?.voiceProviderCommandNames).toEqual(["elevenlabs_voice_provider"]);
      expect(preview.descriptor?.voiceDiscoveryCommandNames).toEqual(["elevenlabs_voice_provider"]);
      expect(preview.descriptor?.voiceCloningCommandNames).toEqual(["elevenlabs_voice_provider"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("scaffolds Cartesia as an implemented cloud voice provider template", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "cartesia-voice-provider",
        goal: "Create an Ambient voice provider using Cartesia",
        installerShape: "tts-provider",
        provider: "Cartesia",
        outputArtifactTypes: ["WAV"],
        locality: "network",
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      expect(descriptor).toMatchObject({
        name: "ambient-cartesia-voice-provider",
        commands: {
          cartesia_voice_provider: {
            voiceProvider: {
              label: "Cartesia Voice Provider",
              defaultFormat: "wav",
              formats: ["wav"],
              local: false,
              voiceDiscovery: {
                command: "cartesia_voice_provider",
                cacheTtlSeconds: 86400,
                requiresNetwork: true,
                requiresSecret: ["CARTESIA_API_KEY"],
                source: "cloud-api",
              },
              voiceCloning: {
                supported: true,
                mode: "cloud",
                requiresConsent: true,
                requiresSecret: ["CARTESIA_API_KEY"],
                networkHosts: ["api.cartesia.ai"],
                output: {
                  creates: ["provider-voice-id", "dynamic-cache-voice"],
                  appearsInDynamicCatalog: true,
                },
              },
            },
          },
        },
        env: [{ name: "CARTESIA_API_KEY", required: true }],
        networkHosts: ["api.cartesia.ai"],
        artifacts: { outputTypes: ["WAV"] },
      });
      const script = await readFile(result.scriptPath, "utf8");
      expect(script).toContain("api.cartesia.ai/tts/bytes");
      expect(script).toContain("--list-voices");
      expect(script).toContain("api.cartesia.ai/voices");
      expect(script).toContain("CARTESIA_API_KEY");
      expect(script).toContain("Cartesia-Version");
      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "cartesia-voice-provider" });
      expect(preview.valid).toBe(true);
      expect(preview.descriptor?.voiceProviderCommandNames).toEqual(["cartesia_voice_provider"]);
      expect(preview.descriptor?.voiceDiscoveryCommandNames).toEqual(["cartesia_voice_provider"]);
      expect(preview.descriptor?.voiceCloningCommandNames).toEqual(["cartesia_voice_provider"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("validates dynamic voice discovery descriptor metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "broken-dynamic-voice-provider",
        goal: "Create an Ambient voice provider with invalid dynamic voice discovery metadata",
        installerShape: "tts-provider",
        provider: "Broken Cloud",
        outputArtifactTypes: ["MP3"],
        locality: "network",
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.commands.broken_dynamic_voice_provider.voiceProvider.voiceDiscovery = {
        command: "missing_list_voices",
        cacheTtlSeconds: 0,
        requiresNetwork: true,
        requiresSecret: ["not-env-style"],
        source: "cloud-api",
      };
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "broken-dynamic-voice-provider" });
      expect(preview.valid).toBe(false);
      expect(preview.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('voiceProvider.voiceDiscovery.command "missing_list_voices" does not match a descriptor command'),
        expect.stringContaining("voiceProvider.voiceDiscovery.cacheTtlSeconds must be a positive integer"),
        expect.stringContaining("voiceProvider.voiceDiscovery.requiresSecret must use env-style names"),
      ]));
      expect(preview.descriptor?.voiceDiscoveryCommandNames).toEqual(["broken_dynamic_voice_provider"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("validates voice cloning descriptor metadata without requiring clone workflows", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "broken-cloning-voice-provider",
        goal: "Create an Ambient voice provider with invalid voice cloning metadata",
        installerShape: "tts-provider",
        provider: "Broken Clone",
        outputArtifactTypes: ["MP3"],
        locality: "network",
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.commands.broken_cloning_voice_provider.voiceProvider.voiceCloning = {
        supported: true,
        mode: "cloud",
        inputs: {
          audioFormats: [],
          minDurationSeconds: 90,
          maxDurationSeconds: 30,
          minSamples: 3,
          maxSamples: 1,
        },
        requiresSecret: ["not-env-style"],
        output: { creates: ["unsupported-output"] },
      };
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "broken-cloning-voice-provider" });
      expect(preview.valid).toBe(false);
      expect(preview.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("voiceProvider.voiceCloning.inputs.audioFormats must declare at least one audio format"),
        expect.stringContaining("voiceProvider.voiceCloning.inputs.minDurationSeconds must not exceed maxDurationSeconds"),
        expect.stringContaining("voiceProvider.voiceCloning.inputs.minSamples must not exceed maxSamples"),
        expect.stringContaining("voiceProvider.voiceCloning.requiresSecret must use env-style names"),
        expect.stringContaining("voiceProvider.voiceCloning.output.creates has unsupported values"),
      ]));
      expect(preview.descriptor?.voiceCloningCommandNames).toEqual(["broken_cloning_voice_provider"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("warns when a TTS-like artifact package is not shaped as an Ambient voice provider", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "elevenlabs-tts",
        goal: "Text-to-speech capability using ElevenLabs that saves an MP3 file",
        kind: "artifact generator",
        provider: "ElevenLabs",
        outputArtifactTypes: ["MP3"],
        locality: "network",
      });

      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.env = [{ name: "ELEVENLABS_API_KEY", required: true }];
      descriptor.networkHosts = ["api.elevenlabs.io"];
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      const manifestPath = join(result.rootPath, "capability-build.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      delete manifest.installerShape;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "elevenlabs-tts" });

      expect(preview.valid).toBe(true);
      expect(preview.descriptor?.voiceProviderCommandNames).toEqual([]);
      expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringContaining("not shaped as an Ambient tts-provider")]));
      expect(capabilityBuilderPreviewText(preview)).toContain("will not be selectable for chat voicing");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("repairs a custom TTS artifact generator into a registerable Ambient voice provider", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "custom-tts-artifact",
        goal: "Generate WAV text-to-speech audio files from text",
        kind: "artifact generator",
        provider: "Custom TTS",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      const manifestPath = join(scaffold.rootPath, "capability-build.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      delete manifest.installerShape;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const beforeRepair = await previewCapabilityBuilderPackage(workspace, { packageName: "custom-tts-artifact" });
      const repairPlan = await planCapabilityBuilderRepair(workspace, {
        packageName: "custom-tts-artifact",
        requestedRepair: "Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
      });
      const repairText = capabilityBuilderRepairPlanText(repairPlan);

      expect(beforeRepair.warnings).toEqual(expect.arrayContaining([expect.stringContaining("not shaped as an Ambient tts-provider")]));
      expect(repairText).toContain("Convert the package into the Ambient tts-provider installer shape");
      expect(repairText).toContain("Confirm preview reports installerShape tts-provider");
      expect(repairText).toContain("providerContract command");

      const descriptor = {
        name: "ambient-custom-tts-artifact",
        version: "0.1.0",
        description: "Generate WAV text-to-speech audio files from text",
        skills: "./SKILL.md",
        commands: {
          custom_tts_artifact: {
            description: "Synthesize assistant voice audio with a custom local TTS provider.",
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
            healthCheck: ["node", "./scripts/run.mjs", "--health"],
            voiceProvider: {
              label: "Custom TTS Voice Provider",
              defaultFormat: "wav",
              formats: ["wav"],
              voices: [{ id: "default", label: "Default custom voice" }],
              local: true,
            },
          },
        },
        artifacts: {
          outputTypes: ["WAV"],
          policy: "write audio to the requested output path and return concise JSON metadata",
        },
      };
      const script = [
        "#!/usr/bin/env node",
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, resolve } from 'node:path';",
        "",
        "const args = process.argv.slice(2);",
        "function arg(name) {",
        "  const index = args.indexOf(name);",
        "  return index >= 0 ? args[index + 1] : undefined;",
        "}",
        "function wavBytes(text) {",
        "  return Buffer.from(`RIFF custom wav ${text}`);",
        "}",
        "if (args.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "const text = arg('--text');",
        "const output = arg('--output');",
        "const format = arg('--format') || 'wav';",
        "const voice = arg('--voice') || 'default';",
        "if (!text) { process.stderr.write('Missing --text for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
        "if (!output) { process.stderr.write('Missing --output for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
        "if (format !== 'wav') { process.stderr.write(`Unsupported --format: ${format}\\n`); process.exit(2); }",
        "const audioPath = resolve(output);",
        "mkdirSync(dirname(audioPath), { recursive: true });",
        "writeFileSync(audioPath, wavBytes(text));",
        "process.stdout.write(JSON.stringify({ audioPath, mimeType: 'audio/wav', durationMs: 100, providerId: 'custom-tts', voiceId: voice }) + '\\n');",
        "",
      ].join("\n");
      const smoke = [
        "import { strict as assert } from 'node:assert';",
        "import { spawnSync } from 'node:child_process';",
        "import { existsSync, statSync } from 'node:fs';",
        "",
        "const output = 'smoke-custom.wav';",
        "const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'smoke', '--output', output, '--format', 'wav'], { encoding: 'utf8' });",
        "assert.equal(result.status, 0, result.stderr);",
        "assert.match(result.stdout, /audioPath/);",
        "assert.equal(existsSync(output), true);",
        "assert.ok(statSync(output).size > 0);",
        "",
      ].join("\n");

      const applied = await applyCapabilityBuilderRepair(workspace, {
        packageName: "custom-tts-artifact",
        reason: "Convert custom TTS artifact generator into an Ambient chat voice provider.",
        files: [
          {
            path: "ambient-cli.json",
            content: `${JSON.stringify(descriptor, null, 2)}\n`,
            rationale: "Declare the Ambient tts-provider command contract and voiceProvider metadata.",
          },
          {
            path: "SKILL.md",
            content: [
              "---",
              "name: ambient-custom-tts-artifact",
              "description: Generate WAV text-to-speech audio files from text",
              "---",
              "",
              "Use this Ambient voice provider when the user wants Ambient to speak assistant replies through the custom local TTS provider.",
              "The `custom_tts_artifact` command accepts `--text`, `--output`, `--format wav`, and optional `--voice`, writes audio to the exact requested path, and returns concise JSON metadata.",
              "",
            ].join("\n"),
            rationale: "Align Pi-facing guidance with the provider contract.",
          },
          {
            path: "scripts/run.mjs",
            content: script,
            rationale: "Implement the normalized provider synthesis contract.",
          },
          {
            path: "tests/smoke.test.mjs",
            content: smoke,
            rationale: "Exercise the primary synthesis command and verify a WAV artifact is created.",
          },
        ],
      });
      const repairedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const afterRepair = await previewCapabilityBuilderPackage(workspace, { packageName: "custom-tts-artifact" });
      const validation = await validateCapabilityBuilderPackage(workspace, { packageName: "custom-tts-artifact" });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "custom-tts-artifact" });
      const runtimeOutput = join(workspace, "custom-tts-runtime.wav");
      const run = await runAmbientCliPackageCommand(workspace, {
        packageId: registered.installedPackage.id,
        command: registered.voiceProvider!.command,
        args: ["--text", "Ambient custom repair.", "--output", runtimeOutput, "--format", "wav", "--voice", "default"],
      });

      expect(applied.repairGitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(repairedManifest.installerShape).toBe("tts-provider");
      expect(repairedManifest.refs.lastRepair).toMatch(/^[a-f0-9]{40}$/);
      expect(afterRepair.descriptor?.voiceProviderCommandNames).toEqual(["custom_tts_artifact"]);
      expect(afterRepair.warnings).not.toEqual(expect.arrayContaining([expect.stringContaining("not shaped as an Ambient tts-provider")]));
      expect(validation.succeeded).toBe(true);
      expect(validation.commands.map((command) => command.source)).toEqual(["healthCheck", "smokeTest", "providerContract"]);
      expect(registered.voiceProvider).toMatchObject({
        label: "Custom TTS Voice Provider",
        command: "custom_tts_artifact",
        available: true,
        formats: ["wav"],
        voices: [{ id: "default", label: "Default custom voice" }],
      });
      expect(run.stdout).toContain("audioPath");
      expect((await stat(runtimeOutput)).size).toBeGreaterThan(0);
      expect(capabilityBuilderApplyRepairText(applied)).toContain("Run ambient_capability_builder_validate");
      expect(capabilityBuilderValidateText(validation)).toContain("providerContract (custom_tts_artifact)");
      expect(capabilityBuilderRegisterText(registered)).toContain("Registered voice provider:");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails Piper voice provider validation clearly when model assets are missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "piper-voice-provider",
        goal: "Create a local voice provider using Piper",
        kind: "tts-provider",
        provider: "Piper",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "piper-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.validatedAt).toBeUndefined();
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        source: "healthCheck",
        status: "failed",
        exitCode: 3,
      });
      expect(result.commands[0].stderrPreview).toContain("Missing Piper model assets");
      expect(result.commands[0].stderrPreview).toContain("descriptor modelAssets");
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest.status).toBe("draft");
      await expect(readFile(result.logPath, "utf8")).resolves.toContain("Missing Piper model assets");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails Kokoro ONNX voice provider validation clearly when model assets are missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "kokoro-onnx-voice-provider",
        goal: "Create a local voice provider using Kokoro ONNX",
        kind: "tts-provider",
        provider: "Kokoro ONNX",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "kokoro-onnx-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.validatedAt).toBeUndefined();
      expect(result.commands[0]).toMatchObject({
        source: "healthCheck",
        status: "failed",
        exitCode: 3,
      });
      expect(result.commands[0].stderrPreview).toContain("Missing Kokoro ONNX model assets");
      expect(result.commands[0].stderrPreview).toContain("descriptor modelAssets");
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest.status).toBe("draft");
      await expect(readFile(result.logPath, "utf8")).resolves.toContain("Missing Kokoro ONNX model assets");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("classifies missing cloud provider env as a secret-binding blocker during validation and repair planning", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const missingEnvName = "AMBIENT_TEST_MISSING_CLOUD_TTS_KEY";
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "cartesia-voice-provider",
        goal: "Create a cloud voice provider using Cartesia",
        kind: "tts-provider",
        provider: "Cartesia",
        outputArtifactTypes: ["WAV"],
        locality: "network",
      });
      const descriptor = JSON.parse(await readFile(scaffold.descriptorPath, "utf8"));
      descriptor.commands = {
        cartesia_voice_provider: {
          description: "Synthesize tiny voice clips through a cloud TTS API.",
          command: "node",
          args: ["./scripts/run.mjs"],
          cwd: "package",
          healthCheck: ["node", "./scripts/run.mjs", "--health"],
          voiceProvider: {
            label: "Cartesia Voice",
            formats: ["wav"],
            defaultFormat: "wav",
            voices: [{ id: "test", label: "Test voice" }],
            local: false,
          },
        },
      };
      descriptor.env = [{ name: missingEnvName, required: true, description: "Test cloud TTS API key" }];
      descriptor.networkHosts = ["api.cartesia.ai"];
      await writeFile(scaffold.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      await writeFile(
        scaffold.scriptPath,
        [
          "if (process.argv.includes('--health')) {",
          `  if (!process.env.${missingEnvName}) {`,
          `    console.error('Missing required env ${missingEnvName}; use Ambient-managed secret binding.');`,
          "    process.exit(7);",
          "  }",
          "  console.log('ok');",
          "}",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "cartesia-voice-provider" });
      const text = capabilityBuilderValidateText(result);
      const repairPlan = await planCapabilityBuilderRepair(workspace, {
        packageName: "cartesia-voice-provider",
        requestedRepair: "Retry after the cloud provider validation failed because the API key is missing.",
      });

      expect(result.succeeded).toBe(false);
      expect(result.envRequirements).toEqual([expect.objectContaining({ name: missingEnvName, required: true })]);
      expect(result.networkHosts).toEqual(["api.cartesia.ai"]);
      expect(text).toContain(`Missing secret/env blocker: validation output references missing required env ${missingEnvName}`);
      expect(text).toContain("ambient_capability_builder_secret_request");
      expect(text).not.toContain("test-secret-value");
      expect(repairPlan.approvalCheckpoints).toEqual(expect.arrayContaining([expect.stringContaining("Ambient-managed secret flows only")]));
      expect(repairPlan.validationPlan).toEqual(expect.arrayContaining([expect.stringContaining("do not rewrite the package to bypass the check")]));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("gives Pi general installer recovery guidance during repair planning", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "local-native-provider",
        goal: "Wrap a local native model runtime that needs model and library paths",
        installerShape: "custom-cli",
        provider: "Local Native Runtime",
        locality: "local",
        modelAssets: ["model.onnx", "runtime data directory"],
      });
      const packageJson = {
        name: "local-native-provider",
        version: "0.1.0",
        dependencies: { "native-runtime": "1.0.0" },
      };
      await writeFile(join(scaffold.rootPath, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
      await writeFile(
        join(scaffold.rootPath, "capability-validation-log.jsonl"),
        [
          JSON.stringify({
            source: "smokeTest",
            status: "failed",
            command: "node",
            exitCode: 1,
            stderrPreview: "native runtime could not load data path password=hunter2 /Library/Application Support/Native/data",
          }),
          JSON.stringify({
            source: "smokeTest",
            status: "failed",
            error: "compiled-in path missing token=abcdef",
          }),
        ].join("\n"),
        "utf8",
      );

      const repairPlan = await planCapabilityBuilderRepair(workspace, {
        packageName: "local-native-provider",
        requestedRepair: "Validation fails because the native library looks for model data at a compiled-in system path.",
      });
      const text = capabilityBuilderRepairPlanText(repairPlan);

      expect(repairPlan.installerRecoveryGuidance).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Classify the failure before repair"),
          expect.stringContaining("hardcoded or compiled-in path"),
          expect.stringContaining("ambient_privileged_action_request"),
        ]),
      );
      expect(repairPlan.installerRecoveryTemplates.map((template) => template.id)).toEqual([
        "python-native-data-path",
        "node-native-module",
        "local-model-assets",
        "system-binary-wrapper",
        "stdout-vs-file-artifact-contract",
      ]);
      expect(repairPlan.installerRecoveryTemplates.find((template) => template.id === "python-native-data-path")?.steps).toEqual(
        expect.arrayContaining([expect.stringContaining("ambient_privileged_action_request")]),
      );
      expect(repairPlan.approvalCheckpoints).toEqual(
        expect.arrayContaining([
          expect.stringContaining("ambient_privileged_action_request"),
          expect.stringContaining("stop and reclassify"),
        ]),
      );
      expect(repairPlan.diagnosticEvidence).toMatchObject({
        logFiles: ["capability-validation-log.jsonl"],
        recommendedReads: ["./capability-validation-log.jsonl"],
        recentLogEntries: [
          {
            path: "capability-validation-log.jsonl",
            lineCount: 2,
            entries: [
              expect.stringContaining("source=smokeTest"),
              expect.stringContaining("compiled-in path missing token=[REDACTED]"),
            ],
          },
        ],
      });
      expect(JSON.stringify(repairPlan.diagnosticEvidence)).not.toContain("hunter2");
      expect(JSON.stringify(repairPlan.diagnosticEvidence)).not.toContain("abcdef");
      expect(repairPlan.recommendedSteps).toEqual(expect.arrayContaining([expect.stringContaining("file_read")]));
      expect(text).toContain("Installer recovery guidance:");
      expect(text).toContain("Installer recovery templates:");
      expect(text).toContain("Diagnostic evidence:");
      expect(text).toContain("./capability-validation-log.jsonl");
      expect(text).toContain("password=[REDACTED]");
      expect(text).toContain("python-native-data-path: Python native library/data path");
      expect(text).toContain("do not ask the user to copy commands into Terminal");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("injects Builder-scoped saved secrets during validation without exposing the value", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const envName = "AMBIENT_TEST_BUILDER_SECRET";
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "cloud-secret-provider",
        goal: "Validate a draft cloud provider with a Builder-scoped secret",
        kind: "custom-cli",
        provider: "Cloud Test",
        locality: "network",
      });
      const descriptor = JSON.parse(await readFile(scaffold.descriptorPath, "utf8"));
      descriptor.env = [{ name: envName, required: true, description: "Cloud test secret" }];
      descriptor.networkHosts = ["api.example.test"];
      descriptor.commands.cloud_secret_provider.healthCheck = ["node", "./scripts/run.mjs", "--health", "--echo-secret"];
      await writeFile(scaffold.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      await writeFile(
        scaffold.scriptPath,
        [
          "if (process.argv.includes('--health')) {",
          `  if (process.env.${envName} === 'builder-secret-value' && process.argv.includes('--echo-secret')) { console.log('ok secret=' + process.env.${envName}); console.log('Bearer ' + process.env.${envName}); process.exit(0); }`,
          `  if (process.env.${envName} === 'builder-secret-value') { process.stdout.write('ok\\n'); process.exit(0); }`,
          `  console.error('Missing required env ${envName}');`,
          "  process.exit(7);",
          "}",
        ].join("\n"),
        "utf8",
      );

      const missing = await validateCapabilityBuilderPackage(workspace, { packageName: "cloud-secret-provider" });
      expect(missing.succeeded).toBe(false);

      const saved = await saveCapabilityBuilderEnvSecret(workspace, {
        packageName: "cloud-secret-provider",
        envName,
        value: "builder-secret-value",
      });
      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "cloud-secret-provider" });
      const text = capabilityBuilderValidateText(result);

      expect(saved).toMatchObject({
        packageName: "ambient-cloud-secret-provider",
        envName,
        source: "managed-secret",
        secretRef: expect.stringMatching(/^ambient-secret-ref:v1:[a-f0-9]{64}$/),
        configured: true,
      });
      expect(saved.filePath).toBeUndefined();
      expect(existsSync(join(workspace, ".ambient", "capability-builder", "secrets"))).toBe(false);
      expect(result.succeeded).toBe(true);
      expect(JSON.stringify(result.commands)).toContain("[REDACTED]");
      expect(JSON.stringify(result.commands)).not.toContain("builder-secret-value");
      expect(text).not.toContain("builder-secret-value");
      await expect(readFile(result.logPath, "utf8")).resolves.not.toContain("builder-secret-value");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("validates tts-provider packages through the normalized provider synthesis contract", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "fixture-voice-provider",
        goal: "Create a fixture voice provider",
        installerShape: "tts-provider",
        provider: "Fixture",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }",
          "const output = arg('--output');",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav', durationMs: 250, providerId: 'fixture', voiceId: arg('--voice') || 'default' }));",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "fixture-voice-provider" });
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));

      expect(result.succeeded).toBe(true);
      expect(result.commands.map((command) => command.source)).toEqual(["healthCheck", "smokeTest", "providerContract"]);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        commandName: "fixture_voice_provider",
        status: "succeeded",
      });
      expect(result.artifacts).toEqual([
        expect.objectContaining({ path: expect.stringMatching(/^validation-artifacts\/ambient-voice-test-.+\.wav$/), sizeBytes: expect.any(Number) }),
      ]);
      expect(capabilityBuilderValidateText(result)).toContain("providerContract (fixture_voice_provider)");
      expect(manifest).toMatchObject({
        status: "validated",
        refs: {
          voiceProviderContractValidatedAt: expect.any(String),
          voiceProviderContractValidatedHash: expect.any(String),
        },
      });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "fixture-voice-provider" });
      expect(registered).toMatchObject({
        installedPackage: expect.objectContaining({ name: "ambient-fixture-voice-provider" }),
        voiceProvider: expect.objectContaining({
          label: "Fixture Voice Provider",
          command: "fixture_voice_provider",
          available: true,
          healthStatus: "passed",
          formats: ["wav"],
          voices: [{ id: "default", label: "Default voice" }],
        }),
      });
      expect(capabilityBuilderRegisterText(registered)).toContain("Registered voice provider:");
      expect(capabilityBuilderRegisterText(registered)).toContain("capability id:");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails tts-provider validation when provider stdout is not JSON metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "bad-json-voice-provider",
        goal: "Create a bad stdout voice provider",
        installerShape: "tts-provider",
        provider: "Bad JSON",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log('not json');",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "bad-json-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        status: "failed",
        exitCode: "provider-contract-invalid",
      });
      expect(result.commands.at(-1)?.error).toContain("stdout must be concise JSON metadata");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails tts-provider validation when the provider writes a different output path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "wrong-path-voice-provider",
        goal: "Create a wrong path voice provider",
        installerShape: "tts-provider",
        provider: "Wrong Path",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname, join } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "const wrong = join(dirname(output), 'wrong.wav');",
          "mkdirSync(dirname(wrong), { recursive: true });",
          "writeFileSync(wrong, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: wrong, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "wrong-path-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        status: "failed",
        exitCode: "provider-contract-invalid",
      });
      expect(result.commands.at(-1)?.error).toContain("exact requested --output path");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails tts-provider validation when the provider creates an empty audio file", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "empty-audio-voice-provider",
        goal: "Create an empty audio voice provider",
        installerShape: "tts-provider",
        provider: "Empty Audio",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { closeSync, mkdirSync, openSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "closeSync(openSync(output, 'w'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "empty-audio-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        status: "failed",
        exitCode: "provider-contract-invalid",
      });
      expect(result.commands.at(-1)?.error).toContain("zero-byte audio file");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks tts-provider registration when validation lacks the provider-contract marker", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "legacy-validated-voice-provider",
        goal: "Create a legacy validated voice provider",
        installerShape: "tts-provider",
        provider: "Legacy",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );
      await validateCapabilityBuilderPackage(workspace, { packageName: "legacy-validated-voice-provider" });
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      delete manifest.refs.voiceProviderContractValidatedAt;
      delete manifest.refs.voiceProviderContractValidatedHash;
      await writeFile(scaffold.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      await expect(registerCapabilityBuilderPackage(workspace, { packageName: "legacy-validated-voice-provider" })).rejects.toThrow(
        "TTS provider packages must pass provider-contract synthesis validation before registration.",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("copies Builder-scoped env bindings before installed tts-provider discovery", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const envName = "AMBIENT_TEST_UNAVAILABLE_PROVIDER_KEY";
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "unavailable-voice-provider",
        goal: "Create an unavailable voice provider",
        installerShape: "tts-provider",
        provider: "Unavailable",
        outputArtifactTypes: ["WAV"],
        locality: "network",
        envNames: [envName],
        networkHosts: ["api.example.test"],
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          `if (!process.env.${envName}) { console.error('provider runtime missing env ${envName} after install'); process.exit(9); }`,
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );
      await saveCapabilityBuilderEnvSecret(workspace, {
        packageName: "unavailable-voice-provider",
        envName,
        value: "builder-only-secret",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "unavailable-voice-provider" });

      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "unavailable-voice-provider" });
      const installedBindings = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "env-bindings.json"), "utf8"));

      expect(registered.voiceProvider).toMatchObject({
        label: "Unavailable Voice Provider",
        available: true,
        healthStatus: "passed",
      });
      expect(installedBindings.bindings).toEqual([
        expect.objectContaining({
          packageName: "ambient-unavailable-voice-provider",
          envName,
          secretRef: expect.stringMatching(/^ambient-secret-ref:v1:[a-f0-9]{64}$/),
        }),
      ]);
      expect(installedBindings.bindings[0]).not.toHaveProperty("filePath");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews model asset metadata and download review risks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "zaya-config-reader",
        goal: "Read a small model config asset from Hugging Face.",
        locality: "network",
      });
      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.networkHosts = ["huggingface.co"];
      descriptor.modelAssets = [
        {
          name: "ZAYA1-8B config",
          url: "https://huggingface.co/Zyphra/ZAYA1-8B/resolve/main/config.json",
          expectedSizeBytes: 8192,
          license: "Zyphra model repository terms",
          cachePath: "models/zaya-config.json",
        },
      ];
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "zaya-config-reader" });
      expect(preview.valid).toBe(true);
      expect(preview.descriptor?.modelAssets).toEqual([
        expect.objectContaining({
          name: "ZAYA1-8B config",
          url: "https://huggingface.co/Zyphra/ZAYA1-8B/resolve/main/config.json",
          expectedSizeBytes: 8192,
          license: "Zyphra model repository terms",
          cachePath: "models/zaya-config.json",
        }),
      ]);
      expect(preview.risks).toEqual(expect.arrayContaining([expect.stringContaining("model/data assets: ZAYA1-8B config")]));
      expect(capabilityBuilderPreviewText(preview)).toContain("model assets: ZAYA1-8B config");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects unsafe model asset metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "unsafe-model",
        goal: "Download a model unsafely.",
      });
      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.modelAssets = [{ name: "bad", url: "file:///tmp/model.bin", sha256: "nope", cachePath: "../model.bin" }];
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "unsafe-model" });
      expect(preview.valid).toBe(false);
      expect(preview.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("url must be http(s)"),
          expect.stringContaining("sha256 must be a 64-character hex digest"),
          expect.stringContaining("cachePath must be package-relative"),
        ]),
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
      await expect(scaffoldCapabilityBuilderPackage(workspace, { name: "../../evil", goal: "Again" })).rejects.toThrow(
        "already exists",
      );
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
        expect.arrayContaining([
          expect.stringContaining("unsupported cwd"),
          expect.stringContaining("skills path escapes"),
        ]),
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
      await writeFile(join(scaffold.rootPath, "capability-validation-log.jsonl"), "{\"status\":\"succeeded\"}\n", "utf8");
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
        expect.arrayContaining([
          "Descriptor name is required.",
          "Descriptor must declare at least one command.",
          "SKILL.md is missing.",
        ]),
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
      await writeFile(join(brokenRoot, "ambient-cli.json"), `${JSON.stringify({ version: "0.1.0", commands: {}, artifacts: { outputTypes: ["WAV"] } }, null, 2)}\n`, "utf8");
      await writeFile(join(brokenRoot, "capability-validation-log.jsonl"), "{\"status\":\"failed\"}\n", "utf8");

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
        expect.arrayContaining([
          "Descriptor name is required.",
          "Descriptor must declare at least one command.",
          "SKILL.md is missing.",
        ]),
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
            content: "---\nname: ambient-broken-tts\ndescription: Generate tiny WAV files from text.\n---\n\nUse `broken_tts` through `ambient_cli`.\n",
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
      await expect(readFile(result.logPath, "utf8")).resolves.toContain("\"stdoutLength\":4100");
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
      expect(capabilityBuilderInstallDepsText(deps)).toContain("Log: ./.ambient/capability-builder/packages/ambient-piper-tts/capability-deps-log.jsonl");
      expect(capabilityBuilderInstallDepsOutputPreview(deps)?.items[0].artifactPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts/capability-deps-log.jsonl");

      const validation = await validateCapabilityBuilderPackage(workspace, { packageName: "piper-tts" });
      expect(validation.logPath).toBe(join(expectedRoot, "capability-validation-log.jsonl"));
      expect(validation.relativeLogPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl");
      expect(capabilityBuilderValidateText(validation)).toContain("Log: ./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl");
      await expect(readFile(validation.logPath, "utf8")).resolves.toContain("\"source\":\"healthCheck\"");
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
      { command: "uv", args: ["pip", "install", "--python", ".venv/bin/python", "scrapling"], rationale: "Install Python dependencies into .venv." },
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
      expect(result.validatedAt).toBeTruthy();
      await expect(readFile(result.logPath, "utf8")).resolves.toContain("\"source\":\"healthCheck\"");
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      expect(manifest).toMatchObject({ status: "validated", lastValidatedAt: result.validatedAt });
      expect(manifest.refs.lastValidated).toMatch(/^[a-f0-9]{40}$/);
      expect(manifest.lastValidationLogPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl");
      expect(manifest.lastValidationArtifacts).toEqual([]);
      expect(capabilityBuilderValidateText(result)).toContain("Status: succeeded");
      expect(capabilityBuilderValidateText(result)).toContain("Total duration:");
    } finally {
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
      expect(preview.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("must not use absolute host path"),
        expect.stringContaining("bare executable such as \"node\""),
      ]));
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
      await writeFile(join(scaffold.rootPath, "smoke-output.json"), "{\"stale\":true}\n", "utf8");
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
      expect(validatedManifest.lastValidationLogPath).toBe("./.ambient/capability-builder/packages/ambient-json-export/capability-validation-log.jsonl");
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
      await writeFile(join(scaffold.rootPath, "smoke-output.json"), "{\"already\":\"here\"}\n", "utf8");

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
      expect(history.entries[0].validationLogPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl");
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
      await expect(readFile(join(scaffold.rootPath, "capability-validation-log.jsonl"), "utf8")).resolves.toContain("\"source\":\"healthCheck\"");
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
      expect(history.entries[0].validationLogPath).toBe("./.ambient/capability-builder/packages/ambient-piper-tts/capability-validation-log.jsonl");
      expect(history.entries[0].validationArtifacts).toEqual([
        expect.objectContaining({ path: "sample.wav", sizeBytes: expect.any(Number) }),
      ]);
      expect(capabilityBuilderHistoryText(history)).toContain("validation artifacts: sample.wav");
      expect(capabilityBuilderUnregisterText(result)).toContain("Preserved by default");
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
