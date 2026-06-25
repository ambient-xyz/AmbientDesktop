import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCapabilityBuilderRepair,
  capabilityBuilderApplyRepairText,
  capabilityBuilderPreviewText,
  capabilityBuilderRegisterText,
  capabilityBuilderRepairPlanText,
  capabilityBuilderValidateText,
  planCapabilityBuilderRepair,
  previewCapabilityBuilderPackage,
  registerCapabilityBuilderPackage,
  scaffoldCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
} from "./capabilityBuilder";
import { runAmbientCliPackageCommand } from "./capabilityBuilderAmbientCliFacade";

describe("Capability Builder TTS provider contracts", () => {
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
      expect(preview.risks).toEqual(
        expect.arrayContaining([expect.stringContaining("model/data assets: Piper en_US lessac medium ONNX voice")]),
      );
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
      expect(preview.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('voiceProvider.voiceDiscovery.command "missing_list_voices" does not match a descriptor command'),
          expect.stringContaining("voiceProvider.voiceDiscovery.cacheTtlSeconds must be a positive integer"),
          expect.stringContaining("voiceProvider.voiceDiscovery.requiresSecret must use env-style names"),
        ]),
      );
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
      expect(preview.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("voiceProvider.voiceCloning.inputs.audioFormats must declare at least one audio format"),
          expect.stringContaining("voiceProvider.voiceCloning.inputs.minDurationSeconds must not exceed maxDurationSeconds"),
          expect.stringContaining("voiceProvider.voiceCloning.inputs.minSamples must not exceed maxSamples"),
          expect.stringContaining("voiceProvider.voiceCloning.requiresSecret must use env-style names"),
          expect.stringContaining("voiceProvider.voiceCloning.output.creates has unsupported values"),
        ]),
      );
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
      expect(repairPlan.approvalCheckpoints).toEqual(
        expect.arrayContaining([expect.stringContaining("Ambient-managed secret flows only")]),
      );
      expect(repairPlan.validationPlan).toEqual(
        expect.arrayContaining([expect.stringContaining("do not rewrite the package to bypass the check")]),
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
