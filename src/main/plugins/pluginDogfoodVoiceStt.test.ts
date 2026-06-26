import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { setupQwen3AsrProvider } from "../stt/sttProviderInstaller";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import { ensureFirstPartyAmbientCliPackages } from "./pluginsAmbientCliFacade";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { deterministicWavFixtureVoiceRunner, writeVoiceDiscoveryCacheEntry } from "./pluginsVoiceDogfoodFacade";
import type { SttSettings, VoiceProviderCandidate, VoiceSettings } from "../../shared/localRuntimeTypes";
import type { PermissionPromptResolution } from "../../shared/permissionTypes";
import { isolatePluginDiscoveryEnv, restoreOptionalEnv, seedFixtureMarketplace, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

const execFileAsync = promisify(execFile);

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-dogfood-voice-stt-electron`,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataPath,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}));

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;

describeNative("Plugin voice and STT dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-voice-stt-dogfood-")));
    restoreEnv = isolatePluginDiscoveryEnv(workspacePath);
    await seedFixtureMarketplace(workspacePath);
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    restoreEnv?.();
    await rm(workspacePath, { recursive: true, force: true });
  });
  itLive(
    "switches Ambient voice provider and voice through chat settings tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live voice settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const permissionResolutions: PermissionPromptResolution[] = [];
      const voiceSettingsAudit: Array<{ toolName?: string; threadId?: string; source?: string; input: VoiceSettings }> = [];
      let voiceSettings: VoiceSettings = {
        enabled: true,
        mode: "assistant-final",
        autoplay: true,
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        voiceId: "rachel",
        maxChars: 1500,
        longReply: "summarize",
        format: "mp3",
        artifactCacheMaxMb: 30,
      };
      const voiceProviders: VoiceProviderCandidate[] = [
        {
          packageId: "ambient-elevenlabs-tts",
          packageName: "ambient-elevenlabs-tts",
          command: "elevenlabs_tts",
          capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          providerId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          label: "ElevenLabs",
          format: "mp3",
          formats: ["mp3"],
          voices: [{ id: "rachel", label: "Rachel" }],
          local: false,
          voiceDiscovery: {
            command: "elevenlabs_tts",
            cacheTtlSeconds: 86400,
            requiresNetwork: true,
            requiresSecret: ["ELEVENLABS_API_KEY"],
            source: "cloud-api",
          },
          installed: true,
          available: true,
          availabilityReason: "ready",
        },
        {
          packageId: "ambient-piper-tts",
          packageName: "ambient-piper-tts",
          command: "piper_tts",
          capabilityId: "ambient-cli:piper:tool:piper_tts",
          providerId: "ambient-cli:piper:tool:piper_tts",
          label: "Piper TTS",
          format: "wav",
          formats: ["wav"],
          voices: [
            { id: "en_US-lessac-medium", label: "Lessac" },
            { id: "en_US-amy-medium", label: "Amy" },
          ],
          local: true,
          installed: true,
          available: true,
          availabilityReason: "ready",
        },
      ];
      const thread = store.createThread("Voice settings tool dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (!["ambient_voice_select", "ambient_voice_policy_update", "ambient_voice_test"].includes(request.toolName)) {
              throw new Error(`Unexpected permission prompt during voice settings dogfood: ${request.title}`);
            }
            const resolution: PermissionPromptResolution = { allowed: true, mode: "allow_once" };
            permissionResolutions.push(resolution);
            return resolution;
          },
          denyThread: () => undefined,
        },
        {
          voice: {
            readSettings: () => voiceSettings,
            updateSettings: async (input, audit) => {
              voiceSettingsAudit.push({ input, source: audit?.source, toolName: audit?.toolName, threadId: audit?.threadId });
              voiceSettings = { ...input };
              return voiceSettings;
            },
            listProviders: () => voiceProviders,
            testRunner: deterministicWavFixtureVoiceRunner(),
            createMediaUrl: ({ relativePath }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
          },
        },
      );

      let transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Please switch Ambient's chat voice provider to Piper TTS.",
          "Use the normal product path for changing voice settings.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After the switch completes, answer with exactly VOICE_PROVIDER_SWITCH_OK and include the selected provider capability id.",
        ],
        expected: "VOICE_PROVIDER_SWITCH_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_select completed");
      expect(transcript).toContain("ambient-cli:piper:tool:piper_tts");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(voiceSettings).toMatchObject({
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "en_US-lessac-medium",
        format: "wav",
      });
      expect(voiceSettingsAudit.at(-1)).toMatchObject({
        source: "chat-tool",
        toolName: "ambient_voice_select",
        threadId: thread.id,
      });

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now switch the selected Piper voice to Amy.",
          "Use the normal product path for changing voice settings.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After the switch completes, answer with exactly VOICE_VOICE_SWITCH_OK and include the selected voice id.",
        ],
        expected: "VOICE_VOICE_SWITCH_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_select completed");
      expect(transcript).toContain("en_US-amy-medium");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(voiceSettings).toMatchObject({
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "en_US-amy-medium",
        format: "wav",
      });
      expect(voiceSettingsAudit.at(-1)).toMatchObject({
        source: "chat-tool",
        toolName: "ambient_voice_select",
        threadId: thread.id,
      });

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now turn Ambient chat voice off, disable voice autoplay, and skip voicing long replies.",
          "Use the normal product path for changing voice policy.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, register, or provider selection tools.",
          "After the policy change completes, answer with exactly VOICE_POLICY_UPDATE_OK and include the new enabled, autoplay, and longReply values.",
        ],
        expected: "VOICE_POLICY_UPDATE_OK",
      });

      const policyTranscript = transcript.slice(transcript.indexOf("Now turn Ambient chat voice off"));
      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_policy_update completed");
      expect(policyTranscript).not.toContain("ambient_voice_select completed");
      expect(policyTranscript).not.toContain("ambient_cli completed");
      expect(voiceSettings).toMatchObject({
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "en_US-amy-medium",
        enabled: false,
        autoplay: false,
        longReply: "skip",
        format: "wav",
      });
      expect(voiceSettingsAudit.at(-1)).toMatchObject({
        source: "chat-tool",
        toolName: "ambient_voice_policy_update",
        threadId: thread.id,
      });

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now test the selected voice provider with a tiny phrase.",
          "Use the normal product path for testing the selected chat voice provider.",
          "Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After the test completes, answer with exactly VOICE_PROVIDER_TEST_OK and include the generated audio path.",
        ],
        expected: "VOICE_PROVIDER_TEST_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_test completed");
      expect(transcript).toContain(".ambient/voice/");
      expect(transcript).toContain(".wav");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(permissionResolutions).toHaveLength(4);
      expect(voiceSettingsAudit).toHaveLength(3);

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now set the selected Piper voice to Amy again.",
          "Use the normal product path for changing voice settings.",
          "If it is already Amy, report that it is already configured. Do not ask for approval for a no-op.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After checking, answer with exactly VOICE_NOOP_OK.",
        ],
        expected: "VOICE_NOOP_OK",
      });

      const noopTranscript = transcript.slice(transcript.indexOf("Now set the selected Piper voice to Amy again"));
      expect(noopTranscript).toContain("already configured");
      expect(noopTranscript).not.toContain("ambient_cli completed");
      expect(permissionResolutions).toHaveLength(4);
      expect(voiceSettingsAudit).toHaveLength(3);
    },
    240_000,
  );

  itLive(
    "lists cached dynamic voice catalog entries through chat settings tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live voice list dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      let voiceSettings: VoiceSettings = {
        enabled: true,
        mode: "assistant-final",
        autoplay: true,
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        voiceId: "rachel",
        maxChars: 1500,
        longReply: "summarize",
        format: "mp3",
        artifactCacheMaxMb: 30,
      };
      const voiceProviders: VoiceProviderCandidate[] = [
        {
          packageId: "ambient-elevenlabs-tts",
          packageName: "ambient-elevenlabs-tts",
          command: "elevenlabs_tts",
          capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          providerId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          label: "ElevenLabs",
          format: "mp3",
          formats: ["mp3"],
          voices: [{ id: "rachel", label: "Rachel" }],
          local: false,
          voiceDiscovery: {
            command: "elevenlabs_tts",
            cacheTtlSeconds: 86400,
            requiresNetwork: true,
            requiresSecret: ["ELEVENLABS_API_KEY"],
            source: "cloud-api",
          },
          installed: true,
          available: true,
          availabilityReason: "ready",
        },
      ];
      await writeVoiceDiscoveryCacheEntry(workspacePath, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        providerLabel: "ElevenLabs",
        source: "cloud-api",
        refreshedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        voiceCount: 3,
        voices: [
          { id: "rachel", label: "Rachel", style: ["clear"] },
          {
            id: "british-warm-narrator",
            label: "British Warm Narrator",
            locale: "en-GB",
            language: "English",
            style: ["warm", "narration"],
          },
          { id: "us-bright-host", label: "US Bright Host", locale: "en-US", language: "English", style: ["bright"] },
        ],
      });

      const thread = store.createThread("Voice list tool dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during voice list dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          voice: {
            readSettings: () => voiceSettings,
            updateSettings: async (input) => {
              voiceSettings = { ...input };
              return voiceSettings;
            },
            listProviders: () => voiceProviders,
            testRunner: deterministicWavFixtureVoiceRunner(),
            createMediaUrl: ({ relativePath }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
          },
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "First call ambient_voice_status.",
          "Then call ambient_voice_list_voices with providerCapabilityId exactly ambient-cli:elevenlabs:tool:elevenlabs_tts, query exactly warm, locale exactly en-GB, and limit 5.",
          "Do not use shell, browser, ambient_cli, install, repair, validate, register, provider test, provider selection, or policy tools.",
          "After checking, answer with exactly VOICE_LIST_OK and include the exact matching voice id.",
        ],
        expected: "VOICE_LIST_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_list_voices completed");
      expect(transcript).toContain("british-warm-narrator");
      expect(transcript).not.toContain("ambient_cli completed");
    },
    180_000,
  );

  itLive(
    "surfaces Qwen ASR needs-runtime metadata through live Ambient STT status",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Qwen ASR STT status dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousBinary = process.env.AMBIENT_QWEN3_ASR_BINARY;
      const previousModel = process.env.AMBIENT_QWEN3_ASR_MODEL;
      const missingRuntimePath = join(workspacePath, "missing-llama-mtmd-cli");
      const sttSettings: SttSettings = {
        enabled: false,
        spokenLanguage: "English",
        mode: "push-to-talk",
        autoSendAfterTranscription: false,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: { enabled: true, rmsThresholdDbfs: -50 },
        bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
      };

      try {
        process.env.AMBIENT_QWEN3_ASR_BINARY = missingRuntimePath;
        process.env.AMBIENT_QWEN3_ASR_MODEL = "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0";
        const setup = await setupQwen3AsrProvider(
          workspacePath,
          { provider: "qwen3-asr", action: "install" },
          {
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
            disableRuntimeAutoDetect: true,
            disableRuntimeInstall: true,
            now: () => new Date("2026-05-11T00:00:00.000Z"),
          },
        );
        expect(setup.status).toBe("needs-runtime");
        expect(setup.validation).toMatchObject({
          status: "needs-runtime",
          assetManifest: expect.objectContaining({
            model: expect.objectContaining({
              id: "qwen3-asr-0.6b-q8_0",
              revision: "928ab958557df9aa2ef1c93e0e83c7ad0933fae2",
            }),
            runtime: expect.objectContaining({ directDownloadsEnabled: false }),
          }),
        });

        const thread = store.createThread("Qwen ASR STT status dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async (request) => {
              throw new Error(`Unexpected permission prompt during Qwen ASR STT status dogfood: ${request.title}`);
            },
            denyThread: () => undefined,
          },
          {
            stt: {
              readSettings: () => sttSettings,
            },
          },
        );

        await runtime.send({
          threadId: thread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop Qwen ASR STT status dogfood test.",
            "Call ambient_stt_status once to inspect installed STT providers and runtime readiness.",
            "Do not call ambient_stt_select, ambient_stt_policy_update, ambient_stt_test, ambient_cli, shell, browser, install, repair, or provider setup tools.",
            "After the status tool result is available, answer with exactly QWEN_ASR_STATUS_NEEDS_RUNTIME_OK and mention whether Qwen3-ASR is available.",
          ].join("\n"),
        });

        const transcript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        const audit = store.listPermissionAudit(20);
        expect(transcript).toContain("QWEN_ASR_STATUS_NEEDS_RUNTIME_OK");
        expect(transcript).toContain("ambient_stt_status completed");
        expect(transcript).toContain("Qwen3-ASR Local");
        expect(transcript).toContain("available=false");
        expect(transcript).toContain("validation=needs-runtime");
        expect(transcript).toContain("assets=qwen3-asr-0.6b-q8_0@928ab958");
        expect(transcript).toContain("Providers: 0/1 available");
        expect(transcript).not.toContain("ambient_stt_select completed");
        expect(transcript).not.toContain("ambient_stt_test completed");
        expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
      } finally {
        restoreOptionalEnv("AMBIENT_QWEN3_ASR_BINARY", previousBinary);
        restoreOptionalEnv("AMBIENT_QWEN3_ASR_MODEL", previousModel);
      }
    },
    240_000,
  );

  itLive(
    "selects and tests bundled faster-whisper STT through live Ambient tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live faster-whisper STT tool dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await execFileAsync(
        process.execPath,
        [
          "scripts/stt-spike/prepare-corpus.mjs",
          "--manifest",
          "scripts/stt-spike/corpus.public-smoke.manifest.json",
          "--out",
          join(workspacePath, ".ambient", "stt-spike", "corpus", "public-smoke"),
        ],
        { cwd: process.cwd(), timeout: 120_000, maxBuffer: 1024 * 1024 * 8 },
      );
      const audioPath = ".ambient/stt-spike/corpus/public-smoke/normalized/hf-asr-dummy-1-en.wav";
      const installStatuses = await ensureFirstPartyAmbientCliPackages(workspacePath, {
        packageNames: ["ambient-faster-whisper-stt"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(installStatuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          status: "installed",
        }),
      ]);

      let sttSettings: SttSettings = {
        enabled: false,
        spokenLanguage: "English",
        mode: "push-to-talk",
        autoSendAfterTranscription: true,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: { enabled: false, rmsThresholdDbfs: -55 },
        bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
      };
      const permissionResolutions: PermissionPromptResolution[] = [];
      const thread = store.createThread("faster-whisper STT product path dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (!["ambient_stt_select", "ambient_stt_test"].includes(request.toolName)) {
              throw new Error(`Unexpected permission prompt during faster-whisper STT dogfood: ${request.title}`);
            }
            const resolution: PermissionPromptResolution = { allowed: true, mode: "allow_once" };
            permissionResolutions.push(resolution);
            return resolution;
          },
          denyThread: () => undefined,
        },
        {
          stt: {
            readSettings: () => sttSettings,
            updateSettings: async (input) => {
              sttSettings = { ...input };
              return sttSettings;
            },
          },
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop faster-whisper STT product-path dogfood test.",
          "Use only the Ambient STT tools for this check.",
          "First call ambient_stt_status.",
          "Then call ambient_stt_select for the installed faster-whisper tiny.en Local provider, spokenLanguage English, enabled true.",
          `Then call ambient_stt_test with audioPath exactly ${audioPath} and spokenLanguage English.`,
          "Do not call ambient_stt_policy_update, ambient_cli, shell, browser, install, repair, provider setup, or Settings tools.",
          "After all three required STT tools complete, answer with exactly FASTER_WHISPER_STT_PRODUCT_PATH_OK and include the status phrases packageType=adapter-only and modelAssets=not-bundled plus the transcript phrase He hoped there would be stew.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("FASTER_WHISPER_STT_PRODUCT_PATH_OK");
      expect(transcript).toContain("ambient_stt_status completed");
      expect(transcript).toContain("ambient_stt_select completed");
      expect(transcript).toContain("ambient_stt_test completed");
      expect(transcript).toContain("faster-whisper tiny.en Local");
      expect(transcript).toContain("packageType=adapter-only");
      expect(transcript).toContain("modelAssets=not-bundled");
      expect(transcript).toContain("He hoped there would be stew");
      expect(transcript).not.toContain("ambient_stt_policy_update completed");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(sttSettings.enabled).toBe(true);
      expect(sttSettings.providerCapabilityId).toContain("ambient-faster-whisper-stt");
      expect(permissionResolutions).toHaveLength(2);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_stt_select", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_stt_test", decision: "allowed" }),
        ]),
      );
    },
    360_000,
  );
});
