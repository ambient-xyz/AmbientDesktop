import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverAmbientCliEmbeddingProviders,
  discoverAmbientCliSttProviders,
  discoverAmbientCliVoiceProviders,
  installAmbientCliPackageSource,
  searchAmbientCliCapabilities,
} from "./ambientCliPackages";

describe("Ambient CLI package provider discovery", () => {
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
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "imported", "voice-fixture", "SKILL.md"),
        "---\nname: ambient-broken-tts\n---\n",
      );
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "packages.json"),
        `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`,
      );

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
            missingHints: expect.arrayContaining([
              "Verify model files are downloaded and descriptor paths point at the repaired model location.",
            ]),
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
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "imported", "voice-runtime-fixture", "SKILL.md"),
        "---\nname: ambient-piper-runtime\n---\n",
      );
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "packages.json"),
        `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`,
      );

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
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "packages.json"),
        `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`,
      );

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
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "imported", "embedding-runtime-fixture", "SKILL.md"),
        "---\nname: ambient-bge-embeddings\n---\n",
      );
      await writeFile(
        join(workspace, ".ambient", "cli-packages", "packages.json"),
        `${JSON.stringify({ packages: [{ source }] }, null, 2)}\n`,
      );

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
});
