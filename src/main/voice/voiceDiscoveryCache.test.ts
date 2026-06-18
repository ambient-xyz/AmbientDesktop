import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import type { AmbientCliRunResult } from "../ambient-cli/ambientCliPackages";
import {
  listVoiceProviderVoices,
  mergeVoiceProvidersWithCachedVoices,
  readVoiceDiscoveryCache,
  removeVoiceDiscoveryCacheVoice,
  refreshVoiceProviderVoices,
  upsertVoiceDiscoveryCacheVoice,
  voiceListText,
  voiceRefreshRequiresApproval,
  voiceRefreshText,
  writeVoiceDiscoveryCacheEntry,
} from "./voiceDiscoveryCache";

describe("voice discovery cache", () => {
  it("stores dynamic voices and merges fresh cache entries into provider candidates", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-cache-"));
    try {
      await writeVoiceDiscoveryCacheEntry(workspace, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        providerLabel: "ElevenLabs",
        source: "cloud-api",
        refreshedAt: "2026-05-09T00:00:00.000Z",
        expiresAt: "2026-05-10T00:00:00.000Z",
        voiceCount: 2,
        voices: [
          { id: "rachel", label: "Rachel" },
          { id: "bella", label: "Bella", locale: "en-GB", language: "English", style: ["warm", "narration"] },
        ],
      });

      const cache = await readVoiceDiscoveryCache(workspace);
      const merged = mergeVoiceProvidersWithCachedVoices([provider()], cache, new Date("2026-05-09T12:00:00.000Z"));

      expect(merged[0].voices).toEqual([
        { id: "rachel", label: "Rachel", source: "dynamic-cache" },
        { id: "bella", label: "Bella", locale: "en-GB", language: "English", style: ["warm", "narration"], source: "dynamic-cache" },
      ]);
      expect(merged[0].voiceCatalog).toMatchObject({
        cacheStatus: "fresh",
        source: "cloud-api",
        voiceCount: 2,
        dynamicVoiceCount: 2,
        refreshedAt: "2026-05-09T00:00:00.000Z",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("marks providers with no cached voices as declared-only", () => {
    const merged = mergeVoiceProvidersWithCachedVoices([provider()], { schemaVersion: "ambient-voice-discovery-cache-v1", providers: {} });

    expect(merged[0].voices).toEqual([{ id: "rachel", label: "Rachel", source: "declared" }]);
    expect(merged[0].voiceCatalog).toEqual({
      cacheStatus: "none",
      voiceCount: 1,
      dynamicVoiceCount: 0,
    });
  });

  it("searches declared and cached voices with bounded exact ids for Pi", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-cache-"));
    try {
      await writeVoiceDiscoveryCacheEntry(workspace, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        providerLabel: "ElevenLabs",
        source: "cloud-api",
        refreshedAt: "2026-05-09T00:00:00.000Z",
        expiresAt: "2026-05-10T00:00:00.000Z",
        voiceCount: 3,
        voices: [
          { id: "rachel", label: "Rachel", style: ["clear"] },
          { id: "bella", label: "Bella", locale: "en-GB", language: "English", style: ["warm", "narration"] },
          { id: "george", label: "George", locale: "en-GB", language: "English", style: ["formal"] },
        ],
      });

      const cache = await readVoiceDiscoveryCache(workspace);
      const result = listVoiceProviderVoices([provider()], cache, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        query: "warm",
        locale: "en-GB",
        limit: 1,
      }, new Date("2026-05-09T12:00:00.000Z"));

      expect(result.cacheStatus).toBe("fresh");
      expect(result.voices).toEqual([expect.objectContaining({ id: "bella", source: "dynamic-cache" })]);
      expect(voiceListText(result)).toContain("id=bella");
      expect(voiceListText(result)).toContain("Use ambient_voice_select with an exact voiceId");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not include stale dynamic voices unless requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-cache-"));
    try {
      await writeVoiceDiscoveryCacheEntry(workspace, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        refreshedAt: "2026-05-08T00:00:00.000Z",
        expiresAt: "2026-05-08T01:00:00.000Z",
        voiceCount: 1,
        voices: [{ id: "stale", label: "Stale voice" }],
      });

      const cache = await readVoiceDiscoveryCache(workspace);
      const hidden = listVoiceProviderVoices([provider()], cache, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
      }, new Date("2026-05-09T12:00:00.000Z"));
      const included = listVoiceProviderVoices([provider()], cache, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        includeStale: true,
      }, new Date("2026-05-09T12:00:00.000Z"));

      expect(hidden.cacheStatus).toBe("stale");
      expect(hidden.voices.map((voice) => voice.id)).toEqual(["rachel"]);
      expect(included.voices.map((voice) => voice.id)).toEqual(["rachel", "stale"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("refreshes dynamic voices through the provider discovery command", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-refresh-"));
    try {
      const result = await refreshVoiceProviderVoices(
        workspace,
        [provider({
          voiceDiscovery: {
            command: "elevenlabs_tts",
            source: "cloud-api",
            requiresNetwork: true,
            requiresSecret: ["ELEVENLABS_API_KEY"],
            cacheTtlSeconds: 60,
          },
        })],
        { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" },
        async (_workspacePath, input): Promise<AmbientCliRunResult> => {
          expect(input).toMatchObject({
            packageId: "ambient-elevenlabs-tts",
            command: "elevenlabs_tts",
            args: ["--list-voices"],
          });
          return {
            packageId: "ambient-elevenlabs-tts",
            packageName: "ambient-elevenlabs-tts",
            commandName: "elevenlabs_tts",
            command: ["node", "scripts/run.mjs", "--list-voices"],
            cwd: workspace,
            durationMs: 12,
            stdout: JSON.stringify({
              voices: [
                { id: "aria", label: "Aria", locale: "en-US", style: ["warm"] },
                { id: "roger", label: "Roger", language: "English", providerMetadata: { category: "premade" } },
              ],
            }),
          };
        },
        new Date("2026-05-09T12:00:00.000Z"),
      );

      expect(result.entry).toMatchObject({
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        providerLabel: "ElevenLabs",
        source: "cloud-api",
        refreshedAt: "2026-05-09T12:00:00.000Z",
        expiresAt: "2026-05-09T12:01:00.000Z",
        voiceCount: 2,
      });
      expect(result.durationMs).toBe(12);
      expect(voiceRefreshText(result)).toContain("Ambient voice catalog refreshed");

      const cache = await readVoiceDiscoveryCache(workspace);
      const voices = listVoiceProviderVoices([provider()], cache, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        query: "warm",
      }, new Date("2026-05-09T12:00:30.000Z"));
      expect(voices.voices).toEqual([expect.objectContaining({ id: "aria", source: "dynamic-cache" })]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("upserts cloned voices into the same searchable dynamic cache", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-clone-cache-"));
    try {
      await writeVoiceDiscoveryCacheEntry(workspace, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        providerLabel: "ElevenLabs",
        source: "cloud-api",
        refreshedAt: "2026-05-09T00:00:00.000Z",
        voiceCount: 1,
        voices: [{ id: "rachel", label: "Rachel" }],
      });

      const entry = await upsertVoiceDiscoveryCacheVoice(
        workspace,
        provider(),
        { id: "clone-1", label: "Demo clone", cloned: true, providerMetadata: { status: "ready" } },
        new Date("2026-05-09T12:00:00.000Z"),
      );

      expect(entry.voices[0]).toMatchObject({ id: "clone-1", label: "Demo clone", cloned: true });
      const cache = await readVoiceDiscoveryCache(workspace);
      const listed = listVoiceProviderVoices([provider()], cache, { query: "demo" }, new Date("2026-05-09T12:00:00.000Z"));
      expect(listed.voices).toEqual([expect.objectContaining({ id: "clone-1", source: "dynamic-cache" })]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("removes cloned voices from the searchable dynamic cache", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-clone-cache-remove-"));
    try {
      await writeVoiceDiscoveryCacheEntry(workspace, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        providerLabel: "ElevenLabs",
        source: "cloud-api",
        refreshedAt: "2026-05-09T00:00:00.000Z",
        voiceCount: 2,
        voices: [{ id: "clone-1", label: "Demo clone", cloned: true }, { id: "rachel", label: "Rachel" }],
      });

      const entry = await removeVoiceDiscoveryCacheVoice(
        workspace,
        "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        "clone-1",
        new Date("2026-05-09T13:00:00.000Z"),
      );

      expect(entry?.voices.map((voice) => voice.id)).toEqual(["rachel"]);
      const cache = await readVoiceDiscoveryCache(workspace);
      const listed = listVoiceProviderVoices([provider()], cache, { query: "demo" }, new Date("2026-05-09T13:00:00.000Z"));
      expect(listed.voices).toEqual([]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects malformed discovery command output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-voice-refresh-bad-"));
    try {
      await expect(refreshVoiceProviderVoices(
        workspace,
        [provider({ voiceDiscovery: { command: "elevenlabs_tts", source: "cloud-api" } })],
        { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" },
        async (): Promise<AmbientCliRunResult> => ({
          packageId: "ambient-elevenlabs-tts",
          packageName: "ambient-elevenlabs-tts",
          commandName: "elevenlabs_tts",
          command: ["node", "scripts/run.mjs", "--list-voices"],
          cwd: workspace,
          durationMs: 1,
          stdout: JSON.stringify({ items: [] }),
        }),
      )).rejects.toThrow("voices array");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires approval for cloud or network discovery but not local discovery", () => {
    expect(voiceRefreshRequiresApproval(provider({
      voiceDiscovery: { command: "elevenlabs_tts", source: "cloud-api", requiresNetwork: true },
    }))).toBe(true);
    expect(voiceRefreshRequiresApproval(provider({
      voiceDiscovery: { command: "piper_tts", source: "local-model-directory", requiresNetwork: false },
      local: true,
    }))).toBe(false);
  });
});

function provider(input: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  const capabilityId = input.capabilityId ?? "ambient-cli:elevenlabs:tool:elevenlabs_tts";
  return {
    packageId: input.packageId ?? "ambient-elevenlabs-tts",
    packageName: input.packageName ?? "ambient-elevenlabs-tts",
    command: input.command ?? "elevenlabs_tts",
    capabilityId,
    providerId: input.providerId ?? capabilityId,
    label: input.label ?? "ElevenLabs",
    format: input.format ?? "mp3",
    formats: input.formats ?? ["mp3"],
    voices: input.voices ?? [{ id: "rachel", label: "Rachel" }],
    local: input.local ?? false,
    ...(input.voiceDiscovery ? { voiceDiscovery: input.voiceDiscovery } : {}),
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "ready",
  };
}
