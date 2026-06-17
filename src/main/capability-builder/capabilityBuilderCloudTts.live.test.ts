import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAmbientCliVoiceProviders, runAmbientCliPackageCommand } from "../ambient-cli/ambientCliPackages";
import {
  registerCapabilityBuilderPackage,
  saveCapabilityBuilderEnvSecret,
  scaffoldCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
} from "./capabilityBuilder";
import { listVoiceProviderVoices, readVoiceDiscoveryCache, refreshVoiceProviderVoices } from "../voice/voiceDiscoveryCache";

const liveEnabled = process.env.AMBIENT_LIVE_TTS_DOGFOOD === "1";
const maybeDescribe = liveEnabled ? describe : describe.skip;

async function readSecret(path: string | undefined): Promise<string> {
  if (!path || !existsSync(path)) throw new Error(`Missing live TTS key file: ${path ?? "(unset)"}`);
  return (await readFile(path, "utf8")).trim();
}

maybeDescribe("Capability Builder cloud TTS live dogfood", () => {
  it("validates, registers, discovers, and runs ElevenLabs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-elevenlabs-live-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "elevenlabs-live-voice",
        goal: "Create an Ambient voice provider using ElevenLabs",
        installerShape: "tts-provider",
        provider: "ElevenLabs",
        outputArtifactTypes: ["MP3"],
        locality: "network",
      });
      await saveCapabilityBuilderEnvSecret(workspace, {
        packageName: "elevenlabs-live-voice",
        envName: "ELEVENLABS_API_KEY",
        value: await readSecret(process.env.ELEVENLABS_API_KEY_FILE),
      });
      const validated = await validateCapabilityBuilderPackage(workspace, { packageName: "elevenlabs-live-voice" });
      expect(validated.succeeded).toBe(true);
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "elevenlabs-live-voice" });
      expect(registered.voiceProvider).toMatchObject({ available: true, format: "mp3" });
      const registeredVoiceProvider = registered.voiceProvider;
      if (!registeredVoiceProvider) throw new Error("ElevenLabs registration did not return a voice provider.");
      expect(registered.voiceProvider?.voiceDiscovery).toMatchObject({
        command: registeredVoiceProvider.command,
        requiresNetwork: true,
        requiresSecret: ["ELEVENLABS_API_KEY"],
        source: "cloud-api",
      });
      const providers = await discoverAmbientCliVoiceProviders(workspace);
      expect(providers.some((provider) => provider.capabilityId === registered.voiceProvider?.capabilityId && provider.available)).toBe(true);
      const voiceListResult = await runAmbientCliPackageCommand(workspace, {
        packageId: registered.installedPackage.id,
        command: registeredVoiceProvider.command,
        args: ["--list-voices"],
      });
      const voiceList = JSON.parse(voiceListResult.stdout || "{}");
      expect(Array.isArray(voiceList.voices)).toBe(true);
      expect(voiceList.voices.length).toBeGreaterThan(0);
      expect(voiceList.voices[0]).toHaveProperty("id");
      expect(voiceList.voices[0]).not.toHaveProperty("apiKey");
      const refreshResult = await refreshVoiceProviderVoices(workspace, providers, {
        providerCapabilityId: registeredVoiceProvider.capabilityId,
      }, runAmbientCliPackageCommand);
      expect(refreshResult.entry.voiceCount).toBeGreaterThan(0);
      const cachedVoices = listVoiceProviderVoices(providers, await readVoiceDiscoveryCache(workspace), {
        providerCapabilityId: registeredVoiceProvider.capabilityId,
        limit: 3,
      });
      expect(cachedVoices.cacheStatus).toBe("fresh");
      expect(cachedVoices.voices.some((voice) => voice.source === "dynamic-cache")).toBe(true);
      const output = join(workspace, "elevenlabs-live.mp3");
      const voiceId = registeredVoiceProvider.voices[0]?.id;
      if (!voiceId) throw new Error("ElevenLabs provider did not report a default voice id.");
      const result = await runAmbientCliPackageCommand(workspace, {
        packageId: registered.installedPackage.id,
        command: registeredVoiceProvider.command,
        args: ["--text", "Ambient ElevenLabs live dogfood.", "--output", output, "--format", "mp3", "--voice", voiceId!],
      });
      if (!result.stdout) throw new Error(`ElevenLabs command produced no stdout. stderr: ${result.stderr ?? ""}`);
      const metadata = JSON.parse(result.stdout);
      expect(metadata).toMatchObject({ mimeType: "audio/mpeg", providerId: "elevenlabs" });
      expect(String(metadata.audioPath)).toMatch(/elevenlabs-live\.mp3$/);
      expect(metadata).not.toHaveProperty("apiKey");
      expect((await stat(output)).size).toBeGreaterThan(0);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  it("validates, registers, discovers, and runs Cartesia", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cartesia-live-"));
    try {
      await scaffoldCapabilityBuilderPackage(workspace, {
        name: "cartesia-live-voice",
        goal: "Create an Ambient voice provider using Cartesia",
        installerShape: "tts-provider",
        provider: "Cartesia",
        outputArtifactTypes: ["WAV"],
        locality: "network",
      });
      await saveCapabilityBuilderEnvSecret(workspace, {
        packageName: "cartesia-live-voice",
        envName: "CARTESIA_API_KEY",
        value: await readSecret(process.env.CARTESIA_API_KEY_FILE),
      });
      const validated = await validateCapabilityBuilderPackage(workspace, { packageName: "cartesia-live-voice" });
      expect(validated.succeeded).toBe(true);
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "cartesia-live-voice" });
      expect(registered.voiceProvider).toMatchObject({ available: true, format: "wav" });
      const registeredVoiceProvider = registered.voiceProvider;
      if (!registeredVoiceProvider) throw new Error("Cartesia registration did not return a voice provider.");
      expect(registered.voiceProvider?.voiceDiscovery).toMatchObject({
        command: registeredVoiceProvider.command,
        requiresNetwork: true,
        requiresSecret: ["CARTESIA_API_KEY"],
        source: "cloud-api",
      });
      const providers = await discoverAmbientCliVoiceProviders(workspace);
      expect(providers.some((provider) => provider.capabilityId === registered.voiceProvider?.capabilityId && provider.available)).toBe(true);
      const voiceListResult = await runAmbientCliPackageCommand(workspace, {
        packageId: registered.installedPackage.id,
        command: registeredVoiceProvider.command,
        args: ["--list-voices"],
      });
      const voiceList = JSON.parse(voiceListResult.stdout || "{}");
      expect(Array.isArray(voiceList.voices)).toBe(true);
      expect(voiceList.voices.length).toBeGreaterThan(0);
      expect(voiceList.voices[0]).toHaveProperty("id");
      expect(voiceList.voices[0]).not.toHaveProperty("apiKey");
      const refreshResult = await refreshVoiceProviderVoices(workspace, providers, {
        providerCapabilityId: registeredVoiceProvider.capabilityId,
      }, runAmbientCliPackageCommand);
      expect(refreshResult.entry.voiceCount).toBeGreaterThan(0);
      const cachedVoices = listVoiceProviderVoices(providers, await readVoiceDiscoveryCache(workspace), {
        providerCapabilityId: registeredVoiceProvider.capabilityId,
        limit: 3,
      });
      expect(cachedVoices.cacheStatus).toBe("fresh");
      expect(cachedVoices.voices.some((voice) => voice.source === "dynamic-cache")).toBe(true);
      const output = join(workspace, "cartesia-live.wav");
      const voiceId = registeredVoiceProvider.voices[0]?.id;
      if (!voiceId) throw new Error("Cartesia provider did not report a default voice id.");
      const result = await runAmbientCliPackageCommand(workspace, {
        packageId: registered.installedPackage.id,
        command: registeredVoiceProvider.command,
        args: ["--text", "Ambient Cartesia live dogfood.", "--output", output, "--format", "wav", "--voice", voiceId!],
      });
      if (!result.stdout) throw new Error(`Cartesia command produced no stdout. stderr: ${result.stderr ?? ""}`);
      const metadata = JSON.parse(result.stdout);
      expect(metadata).toMatchObject({ mimeType: "audio/wav", providerId: "cartesia" });
      expect(String(metadata.audioPath)).toMatch(/cartesia-live\.wav$/);
      expect(metadata).not.toHaveProperty("apiKey");
      expect((await stat(output)).size).toBeGreaterThan(0);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
