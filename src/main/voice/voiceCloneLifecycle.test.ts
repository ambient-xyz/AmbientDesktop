import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VoiceSettings } from "../../shared/types";
import { discoverAmbientCliVoiceProviders, runAmbientCliPackageCommand } from "../ambient-cli/ambientCliPackages";
import {
  listVoiceProviderVoices,
  readVoiceDiscoveryCache,
  removeVoiceDiscoveryCacheVoice,
  upsertVoiceDiscoveryCacheVoice,
} from "./voiceDiscoveryCache";
import {
  buildVoiceCloneCreatePlan,
  buildVoiceCloneCreatePreview,
  buildVoiceCloneManagePlan,
  parseVoiceCloneCreateStdout,
  parseVoiceCloneDeleteStdout,
} from "./voiceSettingsTools";

describe("voice clone lifecycle dogfood", () => {
  it("runs a reviewed provider clone create/status/delete lifecycle through Ambient CLI and cache", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-clone-lifecycle-"));
    try {
      await seedCloneLifecycleProvider(workspace);
      await writeFile(join(workspace, "sample.wav"), wavFixtureBuffer());

      const providers = await discoverAmbientCliVoiceProviders(workspace);
      const provider = providers.find((candidate) => candidate.packageName === "ambient-e2e-clone-provider");
      expect(provider).toMatchObject({
        label: "E2E Clone Provider",
        voiceCloning: {
          supported: true,
          createCommand: "e2e_clone_provider",
          statusCommand: "e2e_clone_provider",
          deleteCommand: "e2e_clone_provider",
        },
      });
      if (!provider) throw new Error("Missing E2E clone provider.");
      const settings: VoiceSettings = {
        enabled: true,
        mode: "assistant-final",
        autoplay: false,
        providerCapabilityId: provider.capabilityId,
        voiceId: "default",
        maxChars: 1500,
        longReply: "summarize",
        format: "wav",
        artifactCacheMaxMb: 30,
      };

      const preview = buildVoiceCloneCreatePreview(
        {
          providerCapabilityId: provider.capabilityId,
          sourceAudioFiles: ["sample.wav"],
          consentConfirmed: true,
          cloneName: "Lifecycle clone",
        },
        settings,
        providers,
        [{ path: "sample.wav", bytes: wavFixtureBuffer().byteLength, extension: "wav" }],
      );
      expect(preview.readyForCreateApproval).toBe(true);

      const createPlan = buildVoiceCloneCreatePlan(
        {
          providerCapabilityId: provider.capabilityId,
          sourceAudioFiles: ["sample.wav"],
          consentConfirmed: true,
          cloneName: "Lifecycle clone",
          selectCreatedVoice: true,
        },
        settings,
        providers,
        [{ path: "sample.wav", bytes: wavFixtureBuffer().byteLength, extension: "wav" }],
      );
      const created = parseVoiceCloneCreateStdout((await runAmbientCliPackageCommand(workspace, {
        packageId: provider.packageId,
        command: createPlan.createCommand,
        args: ["--clone-create", "--clone-name", createPlan.cloneName ?? "", "--source-audio", join(workspace, "sample.wav")],
      })).stdout);
      expect(created).toMatchObject({
        voiceId: "clone-lifecycle-clone",
        label: "Lifecycle clone",
        status: "ready",
        cloned: true,
        localArtifactPaths: [".ambient/clone-fixture/models/clone-lifecycle-clone.model"],
      });
      await expect(readFile(join(workspace, ".ambient", "clone-fixture", "models", "clone-lifecycle-clone.model"), "utf8")).resolves.toContain("Lifecycle clone");

      await upsertVoiceDiscoveryCacheVoice(workspace, provider, {
        id: created.voiceId,
        label: created.label,
        cloned: true,
        providerMetadata: { status: created.status, localArtifactPaths: created.localArtifactPaths },
      });
      const cacheAfterCreate = await readVoiceDiscoveryCache(workspace);
      const listedAfterCreate = listVoiceProviderVoices([provider], cacheAfterCreate, {
        providerCapabilityId: provider.capabilityId,
        query: "Lifecycle",
      });
      expect(listedAfterCreate.voices).toEqual([expect.objectContaining({ id: created.voiceId, source: "dynamic-cache" })]);

      const statusPlan = buildVoiceCloneManagePlan({ providerCapabilityId: provider.capabilityId, voiceId: created.voiceId }, settings, [
        { ...provider, voices: [...provider.voices, { id: created.voiceId, label: created.label, source: "dynamic-cache" }] },
      ]);
      expect(statusPlan.statusCommand).toBe("e2e_clone_provider");
      const status = parseVoiceCloneCreateStdout((await runAmbientCliPackageCommand(workspace, {
        packageId: provider.packageId,
        command: statusPlan.statusCommand!,
        args: ["--clone-status", "--voice-id", created.voiceId],
      })).stdout);
      expect(status).toMatchObject({
        voiceId: created.voiceId,
        label: "Lifecycle clone",
        status: "ready",
        cloned: true,
        localArtifactPaths: [".ambient/clone-fixture/models/clone-lifecycle-clone.model"],
      });

      const deletePlan = buildVoiceCloneManagePlan({ providerCapabilityId: provider.capabilityId, voiceId: created.voiceId }, settings, [
        { ...provider, voices: [...provider.voices, { id: created.voiceId, label: created.label, source: "dynamic-cache" }] },
      ]);
      expect(deletePlan.deleteCommand).toBe("e2e_clone_provider");
      const deleted = parseVoiceCloneDeleteStdout((await runAmbientCliPackageCommand(workspace, {
        packageId: provider.packageId,
        command: deletePlan.deleteCommand!,
        args: ["--clone-delete", "--voice-id", created.voiceId],
      })).stdout, created.voiceId);
      expect(deleted).toEqual({
        voiceId: created.voiceId,
        deleted: true,
        providerId: "e2e",
        removedArtifactPaths: [".ambient/clone-fixture/models/clone-lifecycle-clone.model"],
      });
      await removeVoiceDiscoveryCacheVoice(workspace, provider.capabilityId, deleted.voiceId);

      const cacheAfterDelete = await readVoiceDiscoveryCache(workspace);
      const listedAfterDelete = listVoiceProviderVoices([provider], cacheAfterDelete, {
        providerCapabilityId: provider.capabilityId,
        query: "Lifecycle",
      });
      expect(listedAfterDelete.voices).toEqual([]);
      await expect(readFile(join(workspace, ".ambient", "clone-fixture", "clone-lifecycle-clone.json"), "utf8")).rejects.toThrow();
      await expect(readFile(join(workspace, ".ambient", "clone-fixture", "models", "clone-lifecycle-clone.model"), "utf8")).rejects.toThrow();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function seedCloneLifecycleProvider(workspace: string) {
  const packageRoot = join(workspace, ".ambient", "cli-packages", "imported", "ambient-e2e-clone-provider");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(join(workspace, ".ambient", "cli-packages"), { recursive: true });
  await writeFile(
    join(workspace, ".ambient", "cli-packages", "packages.json"),
    JSON.stringify({ packages: [{ source: "./.ambient/cli-packages/imported/ambient-e2e-clone-provider" }] }, null, 2),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "ambient-cli.json"),
    JSON.stringify(
      {
        name: "ambient-e2e-clone-provider",
        version: "0.1.0",
        description: "E2E provider for clone lifecycle dogfood.",
        skills: "./SKILL.md",
        commands: {
          e2e_clone_provider: {
            description: "Synthesize and manage cloned voices for lifecycle dogfood.",
            command: "node",
            args: ["./run.mjs"],
            cwd: "package",
            voiceProvider: {
              label: "E2E Clone Provider",
              defaultFormat: "wav",
              formats: ["wav"],
              voices: [{ id: "default", label: "Default E2E clone fixture voice" }],
              local: true,
              voiceCloning: {
                supported: true,
                createCommand: "e2e_clone_provider",
                statusCommand: "e2e_clone_provider",
                deleteCommand: "e2e_clone_provider",
                mode: "local",
                inputs: {
                  audioFormats: ["wav"],
                  minSamples: 1,
                  maxSamples: 1,
                  transcript: "optional",
                },
                requiresConsent: true,
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
    ),
    "utf8",
  );
  await writeFile(join(packageRoot, "SKILL.md"), "---\nname: ambient-e2e-clone-provider\n---\n", "utf8");
  await writeFile(
    join(packageRoot, "run.mjs"),
    [
      "#!/usr/bin/env node",
      "import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';",
      "import { join, resolve } from 'node:path';",
      "const args = process.argv.slice(2);",
      "const root = resolve(process.cwd(), '..', '..', '..', 'clone-fixture');",
      "const modelRoot = join(root, 'models');",
      "function arg(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }",
      "function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clone'; }",
      "mkdirSync(root, { recursive: true });",
      "mkdirSync(modelRoot, { recursive: true });",
      "function modelPath(voiceId) { return join(modelRoot, `${voiceId}.model`); }",
      "function modelRef(voiceId) { return `.ambient/clone-fixture/models/${voiceId}.model`; }",
      "if (args.includes('--clone-create')) {",
      "  const name = arg('--clone-name');",
      "  const source = arg('--source-audio');",
      "  if (!name || !source || !existsSync(source)) process.exit(2);",
      "  const voiceId = `clone-${slug(name)}`;",
      "  writeFileSync(modelPath(voiceId), `local model asset for ${name}`);",
      "  writeFileSync(join(root, `${voiceId}.json`), JSON.stringify({ voiceId, label: name, status: 'ready', cloned: true, localArtifactPaths: [modelRef(voiceId)] }));",
      "  console.log(JSON.stringify({ voiceId, label: name, status: 'ready', cloned: true, providerId: 'e2e', localArtifactPaths: [modelRef(voiceId)] }));",
      "  process.exit(0);",
      "}",
      "if (args.includes('--clone-status')) {",
      "  const voiceId = arg('--voice-id');",
      "  const path = join(root, `${voiceId}.json`);",
      "  if (!voiceId || !existsSync(path)) process.exit(4);",
      "  const item = JSON.parse(readFileSync(path, 'utf8'));",
      "  console.log(JSON.stringify({ ...item, providerId: 'e2e' }));",
      "  process.exit(0);",
      "}",
      "if (args.includes('--clone-delete')) {",
      "  const voiceId = arg('--voice-id');",
      "  if (!voiceId) process.exit(2);",
      "  rmSync(join(root, `${voiceId}.json`), { force: true });",
      "  rmSync(modelPath(voiceId), { force: true });",
      "  console.log(JSON.stringify({ voiceId, deleted: true, providerId: 'e2e', removedArtifactPaths: [modelRef(voiceId)] }));",
      "  process.exit(0);",
      "}",
      "const output = arg('--output');",
      "if (!output) process.exit(2);",
      "mkdirSync(resolve(output, '..'), { recursive: true });",
      "writeFileSync(output, Buffer.from('RIFF....WAVEfmt '));",
      "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
      "",
    ].join("\n"),
    "utf8",
  );
}

function wavFixtureBuffer() {
  const sampleRate = 8000;
  const dataSize = sampleRate / 10;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(128, 44);
  return buffer;
}
