import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAmbientCliVoiceProviders, runAmbientCliPackageCommand, type AmbientCliRunResult } from "../ambient-cli/ambientCliPackages";
import {
  registerCapabilityBuilderPackage,
  saveCapabilityBuilderEnvSecret,
  scaffoldCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
} from "../capability-builder/capabilityBuilder";
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
import type { VoiceProviderCandidate, VoiceSettings } from "../../shared/localRuntimeTypes";

const liveCloneEnabled = process.env.AMBIENT_LIVE_VOICE_CLONE_DOGFOOD === "1";
const maybeDescribe = liveCloneEnabled ? describe : describe.skip;

async function readSecret(path: string | undefined): Promise<string> {
  if (!path || !existsSync(path)) throw new Error(`Missing live clone key file: ${path ?? "(unset)"}`);
  return (await readFile(path, "utf8")).trim();
}

maybeDescribe("voice clone cloud lifecycle live dogfood", () => {
  it("creates, checks, caches, and deletes an ElevenLabs cloned voice", async () => {
    const secret = await readSecret(process.env.ELEVENLABS_API_KEY_FILE);
    await runCloudCloneLifecycle({
      packageName: "elevenlabs-live-clone",
      provider: "ElevenLabs",
      envName: "ELEVENLABS_API_KEY",
      secret,
      outputFormat: "mp3",
      outputArtifactTypes: ["MP3"],
      expectedProviderId: "elevenlabs",
    });
  }, 240_000);

  it("creates, checks, caches, and deletes a Cartesia cloned voice", async () => {
    const secret = await readSecret(process.env.CARTESIA_API_KEY_FILE);
    await runCloudCloneLifecycle({
      packageName: "cartesia-live-clone",
      provider: "Cartesia",
      envName: "CARTESIA_API_KEY",
      secret,
      outputFormat: "wav",
      outputArtifactTypes: ["WAV"],
      expectedProviderId: "cartesia",
    });
  }, 240_000);
});

async function runCloudCloneLifecycle(input: {
  packageName: string;
  provider: "ElevenLabs" | "Cartesia";
  envName: string;
  secret: string;
  outputFormat: "mp3" | "wav";
  outputArtifactTypes: string[];
  expectedProviderId: string;
}) {
  const workspace = await mkdtemp(join(tmpdir(), `ambient-${input.expectedProviderId}-clone-live-`));
  let provider: VoiceProviderCandidate | undefined;
  let createdVoiceId: string | undefined;
  try {
    await scaffoldCapabilityBuilderPackage(workspace, {
      name: input.packageName,
      goal: `Create an Ambient voice provider using ${input.provider}`,
      installerShape: "tts-provider",
      provider: input.provider,
      outputArtifactTypes: input.outputArtifactTypes,
      locality: "network",
    });
    await saveCapabilityBuilderEnvSecret(workspace, {
      packageName: input.packageName,
      envName: input.envName,
      value: input.secret,
    });
    expect((await validateCapabilityBuilderPackage(workspace, { packageName: input.packageName })).succeeded).toBe(true);
    const registered = await registerCapabilityBuilderPackage(workspace, { packageName: input.packageName });
    if (!registered.voiceProvider) throw new Error(`${input.provider} registration did not return a voice provider.`);

    provider = (await discoverAmbientCliVoiceProviders(workspace)).find((candidate) => candidate.capabilityId === registered.voiceProvider?.capabilityId);
    if (!provider) throw new Error(`${input.provider} provider was not discoverable after registration.`);
    expect(provider.voiceCloning).toMatchObject({
      supported: true,
      createCommand: provider.command,
      statusCommand: provider.command,
      deleteCommand: provider.command,
    });

    const sourcePath = join(workspace, `clone-source.${input.outputFormat}`);
    const sourceVoiceId = provider.voices[0]?.id;
    if (!sourceVoiceId) throw new Error(`${input.provider} provider did not report a default voice id.`);
    const source = await runAmbientCliPackageCommand(workspace, {
      packageId: provider.packageId,
      command: provider.command,
      args: [
        "--text",
        cloneSourceText(),
        "--output",
        sourcePath,
        "--format",
        input.outputFormat,
        "--voice",
        sourceVoiceId,
      ],
    });
    assertNoSecret(source, input.secret, `${input.provider} source synthesis`);
    expect(JSON.parse(source.stdout ?? "{}")).not.toHaveProperty("apiKey");
    expect((await stat(sourcePath)).size).toBeGreaterThan(0);

    const sourceStats = await stat(sourcePath);
    const settings: VoiceSettings = {
      enabled: true,
      mode: "assistant-final",
      autoplay: false,
      providerCapabilityId: provider.capabilityId,
      voiceId: sourceVoiceId,
      maxChars: 1500,
      longReply: "summarize",
      format: input.outputFormat,
      artifactCacheMaxMb: 30,
    };
    const cloneName = `Ambient live ${input.provider} clone ${Date.now()}`;
    const sourceFile = { path: `clone-source.${input.outputFormat}`, bytes: sourceStats.size, extension: input.outputFormat };
    const preview = buildVoiceCloneCreatePreview({
      providerCapabilityId: provider.capabilityId,
      sourceAudioFiles: [sourceFile.path],
      consentConfirmed: true,
      cloneName,
    }, settings, [provider], [sourceFile]);
    expect(preview.readyForCreateApproval).toBe(true);
    const createPlan = buildVoiceCloneCreatePlan({
      providerCapabilityId: provider.capabilityId,
      sourceAudioFiles: [sourceFile.path],
      consentConfirmed: true,
      cloneName,
      selectCreatedVoice: true,
      reason: "Opt-in live clone lifecycle dogfood with cleanup.",
    }, settings, [provider], [sourceFile]);

    const createResult = await runAmbientCliPackageCommand(workspace, {
      packageId: provider.packageId,
      command: createPlan.createCommand,
      args: ["--clone-create", "--clone-name", cloneName, "--source-audio", sourcePath, "--notes", "Ambient opt-in live clone lifecycle dogfood; safe to delete."],
    });
    assertNoSecret(createResult, input.secret, `${input.provider} clone create`);
    const created = parseVoiceCloneCreateStdout(createResult.stdout);
    createdVoiceId = created.voiceId;
    expect(created).toMatchObject({ voiceId: expect.any(String), cloned: true, providerId: input.expectedProviderId });

    await upsertVoiceDiscoveryCacheVoice(workspace, provider, {
      id: created.voiceId,
      label: created.label ?? cloneName,
      cloned: true,
      providerMetadata: { status: created.status, providerId: created.providerId },
    });
    const listed = listVoiceProviderVoices([provider], await readVoiceDiscoveryCache(workspace), {
      providerCapabilityId: provider.capabilityId,
      query: cloneName,
    });
    expect(listed.voices).toEqual([expect.objectContaining({ id: created.voiceId, source: "dynamic-cache", cloned: true })]);

    const providerWithClone = { ...provider, voices: [...provider.voices, { id: created.voiceId, label: created.label ?? cloneName, source: "dynamic-cache" as const }] };
    const statusPlan = buildVoiceCloneManagePlan({ providerCapabilityId: provider.capabilityId, voiceId: created.voiceId }, settings, [providerWithClone]);
    const statusResult = await runAmbientCliPackageCommand(workspace, {
      packageId: provider.packageId,
      command: statusPlan.statusCommand!,
      args: ["--clone-status", "--voice-id", created.voiceId],
    });
    assertNoSecret(statusResult, input.secret, `${input.provider} clone status`);
    const status = parseVoiceCloneCreateStdout(statusResult.stdout);
    expect(status.voiceId).toBe(created.voiceId);
    expect(status.providerId).toBe(input.expectedProviderId);

    const deletePlan = buildVoiceCloneManagePlan({ providerCapabilityId: provider.capabilityId, voiceId: created.voiceId }, settings, [providerWithClone]);
    const deleteResult = await runAmbientCliPackageCommand(workspace, {
      packageId: provider.packageId,
      command: deletePlan.deleteCommand!,
      args: ["--clone-delete", "--voice-id", created.voiceId],
    });
    assertNoSecret(deleteResult, input.secret, `${input.provider} clone delete`);
    const deleted = parseVoiceCloneDeleteStdout(deleteResult.stdout, created.voiceId);
    createdVoiceId = undefined;
    expect(deleted).toMatchObject({ voiceId: created.voiceId, deleted: true, providerId: input.expectedProviderId });
    await removeVoiceDiscoveryCacheVoice(workspace, provider.capabilityId, deleted.voiceId);
    const afterDelete = listVoiceProviderVoices([provider], await readVoiceDiscoveryCache(workspace), {
      providerCapabilityId: provider.capabilityId,
      query: cloneName,
    });
    expect(afterDelete.voices).toEqual([]);
  } finally {
    if (provider && createdVoiceId) {
      const cleanupResult = await runAmbientCliPackageCommand(workspace, {
        packageId: provider.packageId,
        command: provider.command,
        args: ["--clone-delete", "--voice-id", createdVoiceId],
      }).catch(() => undefined);
      if (cleanupResult) assertNoSecret(cleanupResult, input.secret, `${input.provider} clone cleanup delete`);
    }
    await rm(workspace, { recursive: true, force: true });
  }
}

function assertNoSecret(result: AmbientCliRunResult, secret: string, label: string) {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error(`${label} secret is empty.`);
  if ((result.stdout ?? "").includes(trimmed) || (result.stderr ?? "").includes(trimmed)) {
    throw new Error(`${label} leaked configured secret in command output.`);
  }
}

function cloneSourceText(): string {
  return Array.from({ length: 48 }, (_, index) =>
    `Ambient live clone consent sample sentence ${index + 1}. This generated sample is used only for automated provider lifecycle validation and should be deleted after the test.`,
  ).join(" ");
}
