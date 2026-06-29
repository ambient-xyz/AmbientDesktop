import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  appearanceBackgroundColor,
  normalizeThinkingDisplaySettings,
  normalizePlannerSettings,
  normalizeLocalDeepResearchAppSettings,
  normalizeSearchRoutingSettings,
  normalizeSttSettings,
  normalizeVoiceSettings,
  normalizeThemePreference,
  readMediaPlaybackSettings,
  readPlannerSettings,
  readLocalDeepResearchSettings,
  readSearchRoutingSettings,
  readSttSettings,
  readThemePreference,
  readThinkingDisplaySettings,
  readVoiceSettings,
  resolveAppearance,
  writeMediaPlaybackSettings,
  writeLocalDeepResearchSettings,
  writePlannerSettings,
  writeSearchRoutingSettings,
  writeSttSettings,
  writeThemePreference,
  writeThinkingDisplaySettings,
  writeVoiceSettings,
} from "./appAppearanceDefaultPreferences";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("app appearance preferences", () => {
  it("normalizes invalid theme preferences to system", () => {
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("system")).toBe("system");
    expect(normalizeThemePreference("sepia")).toBe("system");
    expect(normalizeThemePreference(undefined)).toBe("system");
  });

  it("resolves system, light, and dark themes", () => {
    expect(resolveAppearance("system", true)).toEqual({ themePreference: "system", resolvedTheme: "dark" });
    expect(resolveAppearance("system", false)).toEqual({ themePreference: "system", resolvedTheme: "light" });
    expect(resolveAppearance("dark", false)).toEqual({ themePreference: "dark", resolvedTheme: "dark" });
    expect(resolveAppearance("light", true)).toEqual({ themePreference: "light", resolvedTheme: "light" });
  });

  it("returns a startup-safe window background color", () => {
    expect(appearanceBackgroundColor("light")).toBe("#ffffff");
    expect(appearanceBackgroundColor("dark")).toBe("#0f1418");
  });

  it("reads and writes the persisted theme preference", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-appearance-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    expect(await readThemePreference(preferencesPath)).toBe("system");
    await writeThemePreference(preferencesPath, "dark");

    expect(await readThemePreference(preferencesPath)).toBe("dark");
    await expect(readFile(preferencesPath, "utf8")).resolves.toContain('"themePreference": "dark"');
  });

  it("reads and writes media playback preferences without dropping theme preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-media-preferences-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    await writeThemePreference(preferencesPath, "dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: false });

    await writeMediaPlaybackSettings(preferencesPath, { generatedMediaAutoplay: true });
    expect(await readThemePreference(preferencesPath)).toBe("dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: true });
  });

  it("normalizes invalid thinking display settings to transient", () => {
    expect(normalizeThinkingDisplaySettings({ mode: "off" })).toEqual({ mode: "off", hideRunStatusCardAfterFirstMessage: true });
    expect(normalizeThinkingDisplaySettings({ mode: "transient", hideRunStatusCardAfterFirstMessage: false })).toEqual({
      mode: "transient",
      hideRunStatusCardAfterFirstMessage: false,
    });
    expect(normalizeThinkingDisplaySettings({ mode: "transient", showRunStatusCard: true })).toEqual({
      mode: "transient",
      hideRunStatusCardAfterFirstMessage: false,
    });
    expect(normalizeThinkingDisplaySettings({ mode: "transient", showRunStatusCard: false })).toEqual({
      mode: "transient",
      hideRunStatusCardAfterFirstMessage: true,
    });
    expect(normalizeThinkingDisplaySettings({ mode: "full" })).toEqual({ mode: "full", hideRunStatusCardAfterFirstMessage: true });
    expect(normalizeThinkingDisplaySettings({ mode: "verbose", hideRunStatusCardAfterFirstMessage: "yes" })).toEqual({
      mode: "transient",
      hideRunStatusCardAfterFirstMessage: true,
    });
    expect(normalizeThinkingDisplaySettings(undefined)).toEqual({ mode: "transient", hideRunStatusCardAfterFirstMessage: true });
  });

  it("reads and writes thinking display preferences without dropping other preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-thinking-display-preferences-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    await writeThemePreference(preferencesPath, "dark");
    await writeMediaPlaybackSettings(preferencesPath, { generatedMediaAutoplay: true });
    await writePlannerSettings(preferencesPath, { autoFinalize: false });
    await writeVoiceSettings(preferencesPath, {
      enabled: true,
      mode: "assistant-final",
      autoplay: true,
      providerCapabilityId: "voice:fixture",
      voiceId: "default",
      maxChars: 1800,
      longReply: "ask",
      format: "wav",
      artifactCacheMaxMb: 42,
    });
    await writeSttSettings(preferencesPath, {
      enabled: true,
      providerCapabilityId: "ambient-cli:qwen:tool:qwen3_asr_transcribe",
      spokenLanguage: "Spanish",
      microphone: { deviceId: "airpods-pro-microphone", label: "AirPods Pro Microphone" },
      mode: "push-to-talk",
      autoSendAfterTranscription: false,
      silenceFinalizeSeconds: 1.2,
      noSpeechGate: { enabled: true, rmsThresholdDbfs: -52 },
      bargeIn: { stopTtsOnSpeech: false, queueWhileAgentRuns: true },
    });

    expect(await readThinkingDisplaySettings(preferencesPath)).toEqual({ mode: "transient", hideRunStatusCardAfterFirstMessage: true });

    await writeThinkingDisplaySettings(preferencesPath, { mode: "full", hideRunStatusCardAfterFirstMessage: false });

    expect(await readThemePreference(preferencesPath)).toBe("dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: true });
    expect(await readPlannerSettings(preferencesPath)).toEqual({ autoFinalize: false });
    expect(await readVoiceSettings(preferencesPath)).toMatchObject({ providerCapabilityId: "voice:fixture" });
    expect(await readSttSettings(preferencesPath)).toMatchObject({
      providerCapabilityId: "ambient-cli:qwen:tool:qwen3_asr_transcribe",
      spokenLanguage: "Spanish",
    });
    expect(await readThinkingDisplaySettings(preferencesPath)).toEqual({ mode: "full", hideRunStatusCardAfterFirstMessage: false });
  });

  it("reads and writes search routing preferences without dropping appearance or media preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-search-preferences-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    await writeThemePreference(preferencesPath, "dark");
    await writeMediaPlaybackSettings(preferencesPath, { generatedMediaAutoplay: true });
    expect(await readSearchRoutingSettings(preferencesPath)).toMatchObject({
      webResearch: {
        schemaVersion: "ambient-web-research-provider-stack-v1",
        preferences: {
          search: ["exa-mcp-default", "ambient-browser"],
          fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
        },
      },
    });

    await writeSearchRoutingSettings(preferencesPath, {
      webSearch: {
        activity: "web_search",
        preferredProvider: "ambient-brave-search",
        mode: "require",
        fallback: "block",
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
    });

    expect(await readThemePreference(preferencesPath)).toBe("dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: true });
    expect(await readSearchRoutingSettings(preferencesPath)).toMatchObject({
      webResearch: {
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "ambient-brave-search",
            kind: "ambient-cli",
            roles: ["search"],
          }),
        ]),
        preferences: {
          search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
        },
        fallbackPolicy: { allowBrowserFallback: false },
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
    });
    expect((await readSearchRoutingSettings(preferencesPath)).webSearch).toBeUndefined();
  });

  it("reads and writes Local Deep Research provider preferences without dropping other preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-local-deep-research-preferences-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    await writeThemePreference(preferencesPath, "dark");
    await writeMediaPlaybackSettings(preferencesPath, { generatedMediaAutoplay: true });
    expect(await readLocalDeepResearchSettings(preferencesPath)).toMatchObject({
      providerStack: {
        schemaVersion: "ambient-local-deep-research-provider-stack-v1",
        preferences: {
          research: ["local.deep-research.literesearcher"],
        },
      },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        memoryLimitBehavior: "warn",
      },
    });

    await writeLocalDeepResearchSettings(preferencesPath, normalizeLocalDeepResearchAppSettings({
      providerStack: {
        providers: [
          {
            providerId: "local.deep-research.fixture",
            label: "Fixture Research",
            kind: "test-adapter",
            roles: ["research"],
            status: "enabled",
          },
        ],
        preferences: {
          research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
      },
      localModelResources: {
        maxResidentMemoryBytes: 12 * 1024 ** 3,
        memoryLimitBehavior: "unload-idle",
      },
    }));

    expect(await readThemePreference(preferencesPath)).toBe("dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: true });
    expect(await readLocalDeepResearchSettings(preferencesPath)).toMatchObject({
      providerStack: {
        providers: expect.arrayContaining([
          expect.objectContaining({ providerId: "local.deep-research.fixture", kind: "test-adapter" }),
        ]),
        preferences: {
          research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
      },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 12 * 1024 ** 3,
        memoryLimitBehavior: "unload-idle",
      },
    });
  });

  it("reads and writes planner preferences without dropping appearance or media preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-planner-preferences-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    await writeThemePreference(preferencesPath, "dark");
    await writeMediaPlaybackSettings(preferencesPath, { generatedMediaAutoplay: true });
    expect(await readPlannerSettings(preferencesPath)).toEqual({ autoFinalize: true });

    await writePlannerSettings(preferencesPath, { autoFinalize: false });

    expect(await readThemePreference(preferencesPath)).toBe("dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: true });
    expect(await readPlannerSettings(preferencesPath)).toEqual({ autoFinalize: false });
  });

  it("reads and writes voice preferences without dropping appearance or media preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-voice-preferences-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    await writeThemePreference(preferencesPath, "dark");
    await writeMediaPlaybackSettings(preferencesPath, { generatedMediaAutoplay: true });
    expect(await readVoiceSettings(preferencesPath)).toEqual({
      enabled: false,
      mode: "assistant-final",
      autoplay: false,
      maxChars: 1500,
      longReply: "summarize",
      format: "mp3",
      artifactCacheMaxMb: 30,
    });

    await writeVoiceSettings(preferencesPath, {
      enabled: true,
      mode: "assistant-final",
      autoplay: true,
      providerCapabilityId: "voice:fixture",
      voiceId: "default",
      preferredVoicesByProvider: { "voice:fixture": "default" },
      maxChars: 1800,
      longReply: "ask",
      format: "wav",
      artifactCacheMaxMb: 42,
    });

    expect(await readThemePreference(preferencesPath)).toBe("dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: true });
    expect(await readVoiceSettings(preferencesPath)).toMatchObject({
      enabled: true,
      autoplay: true,
      providerCapabilityId: "voice:fixture",
      voiceId: "default",
      preferredVoicesByProvider: { "voice:fixture": "default" },
      maxChars: 1800,
      longReply: "ask",
      format: "wav",
      artifactCacheMaxMb: 42,
    });
  });

  it("reads and writes STT preferences without dropping appearance, media, or voice preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-stt-preferences-"));
    tempDirs.push(dir);
    const preferencesPath = join(dir, "preferences.json");

    await writeThemePreference(preferencesPath, "dark");
    await writeMediaPlaybackSettings(preferencesPath, { generatedMediaAutoplay: true });
    await writeVoiceSettings(preferencesPath, {
      enabled: true,
      mode: "assistant-final",
      autoplay: true,
      providerCapabilityId: "voice:fixture",
      voiceId: "default",
      maxChars: 1800,
      longReply: "ask",
      format: "wav",
      artifactCacheMaxMb: 42,
    });

    expect(await readSttSettings(preferencesPath)).toEqual({
      enabled: false,
      spokenLanguage: "English",
      microphone: {},
      mode: "push-to-talk",
      autoSendAfterTranscription: true,
      silenceFinalizeSeconds: 0.8,
      noSpeechGate: {
        enabled: true,
        rmsThresholdDbfs: -55,
      },
      bargeIn: {
        stopTtsOnSpeech: true,
        queueWhileAgentRuns: true,
      },
    });

    await writeSttSettings(preferencesPath, {
      enabled: true,
      providerCapabilityId: "ambient-cli:qwen:tool:qwen3_asr_transcribe",
      spokenLanguage: "Spanish",
      pushToTalkShortcut: "Space",
      microphone: {
        deviceId: "airpods-pro-microphone",
        label: "AirPods Pro Microphone",
      },
      mode: "push-to-talk",
      autoSendAfterTranscription: false,
      silenceFinalizeSeconds: 1.2,
      noSpeechGate: {
        enabled: true,
        rmsThresholdDbfs: -52,
      },
      bargeIn: {
        stopTtsOnSpeech: false,
        queueWhileAgentRuns: true,
      },
    });

    expect(await readThemePreference(preferencesPath)).toBe("dark");
    expect(await readMediaPlaybackSettings(preferencesPath)).toEqual({ generatedMediaAutoplay: true });
    expect(await readVoiceSettings(preferencesPath)).toMatchObject({ providerCapabilityId: "voice:fixture" });
    expect(await readSttSettings(preferencesPath)).toMatchObject({
      enabled: true,
      providerCapabilityId: "ambient-cli:qwen:tool:qwen3_asr_transcribe",
      spokenLanguage: "Spanish",
      pushToTalkShortcut: "Space",
      microphone: {
        deviceId: "airpods-pro-microphone",
        label: "AirPods Pro Microphone",
      },
      autoSendAfterTranscription: false,
      silenceFinalizeSeconds: 1.2,
      noSpeechGate: {
        enabled: true,
        rmsThresholdDbfs: -52,
      },
      bargeIn: {
        stopTtsOnSpeech: false,
        queueWhileAgentRuns: true,
      },
    });
  });

  it("normalizes invalid voice settings to safe defaults", () => {
    expect(
      normalizeVoiceSettings({
        enabled: true,
        mode: "loud",
        autoplay: true,
        providerCapabilityId: "  voice:ok  ",
        voiceId: "",
        preferredVoicesByProvider: {
          " voice:ok ": " default ",
          "": "ignored",
          "voice:bad": "",
          "voice:not-string": 3,
        },
        maxChars: 100_000,
        longReply: "ramble",
        format: "flac",
        artifactCacheMaxMb: 5000,
      }),
    ).toEqual({
      enabled: true,
      mode: "assistant-final",
      autoplay: true,
      providerCapabilityId: "voice:ok",
      preferredVoicesByProvider: { "voice:ok": "default" },
      maxChars: 20_000,
      longReply: "summarize",
      format: "mp3",
      artifactCacheMaxMb: 1024,
    });
  });

  it("normalizes invalid search routing settings to safe defaults", () => {
    expect(normalizeSearchRoutingSettings({ webSearch: { preferredProvider: "  brave-search  ", mode: "loud", fallback: "maybe" } })).toEqual({
      webResearch: expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "brave-search",
            kind: "ambient-cli",
            roles: ["search"],
          }),
        ]),
        preferences: expect.objectContaining({
          search: ["brave-search", "exa-mcp-default", "ambient-browser"],
        }),
        fallbackPolicy: { allowBrowserFallback: true },
      }),
    });
    expect(normalizeSearchRoutingSettings({ webSearch: { preferredProvider: "" } })).toMatchObject({
      webResearch: {
        preferences: {
          search: ["exa-mcp-default", "ambient-browser"],
        },
      },
    });
  });

  it("normalizes invalid planner settings to safe defaults", () => {
    expect(normalizePlannerSettings({ autoFinalize: false })).toEqual({ autoFinalize: false });
    expect(normalizePlannerSettings({ autoFinalize: "no" })).toEqual({ autoFinalize: true });
    expect(normalizePlannerSettings(undefined)).toEqual({ autoFinalize: true });
  });

  it("normalizes invalid STT settings to safe defaults and clamps timing thresholds", () => {
    expect(
      normalizeSttSettings({
        enabled: true,
        providerCapabilityId: "  ambient-cli:qwen:tool:qwen3_asr_transcribe  ",
        spokenLanguage: "",
        pushToTalkShortcut: "  CmdOrCtrl+Shift+Space  ",
        microphone: {
          deviceId: "  built-in-mic  ",
          label: "  Built-in Microphone  ",
        },
        mode: "live-captions",
        autoSendAfterTranscription: false,
        silenceFinalizeSeconds: 99,
        noSpeechGate: {
          enabled: false,
          rmsThresholdDbfs: -200,
        },
        bargeIn: {
          stopTtsOnSpeech: false,
          queueWhileAgentRuns: "yes",
        },
      }),
    ).toEqual({
      enabled: true,
      providerCapabilityId: "ambient-cli:qwen:tool:qwen3_asr_transcribe",
      spokenLanguage: "English",
      pushToTalkShortcut: "CmdOrCtrl+Shift+Space",
      microphone: {
        deviceId: "built-in-mic",
        label: "Built-in Microphone",
      },
      mode: "push-to-talk",
      autoSendAfterTranscription: false,
      silenceFinalizeSeconds: 2.5,
      noSpeechGate: {
        enabled: false,
        rmsThresholdDbfs: -90,
      },
      bargeIn: {
        stopTtsOnSpeech: false,
        queueWhileAgentRuns: true,
      },
    });
  });
});
