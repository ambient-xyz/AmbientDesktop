/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { MediaPlaybackSettings, SttSettings } from "../../shared/localRuntimeTypes";
import type { PermissionPromptResponseMode, PermissionRequest } from "../../shared/permissionTypes";

import { restoreProcessEnv, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

interface PluginMessagingSettingsCommandApplyDogfoodDeps {
  AgentRuntime: new (...args: any[]) => any;
  BrowserCredentialStore: new (...args: any[]) => any;
  BrowserService: new (...args: any[]) => any;
  getStore: () => any;
  getWorkspacePath: () => string;
  safeStorage: any;
  setRuntime: (runtime: any) => void;
}

export function registerPluginMessagingSettingsCommandApplyDogfoodCases(deps: PluginMessagingSettingsCommandApplyDogfoodDeps): void {
  const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as any, {
    get(_target, property) {
      const current = deps.getStore();
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as any;
  let runtime: any;
  const createRuntime = (...args: any[]) => {
    const value = new deps.AgentRuntime(...args);
    runtime = value;
    deps.setRuntime(value);
    return value;
  };

  itLive(
    "updates speech input policy through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface speech settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "speech-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "speech-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "speech-dogfood-owner",
            phoneNumber: "+15550000001",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-speech-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      let sttSettings: SttSettings = {
        enabled: true,
        providerCapabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
        spokenLanguage: "English",
        mode: "push-to-talk",
        autoSendAfterTranscription: true,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
        bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
      };
      const thread = store.createThread("Remote Ambient Surface speech settings dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface speech settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          stt: {
            readSettings: () => sttSettings,
            updateSettings: (input: any) => {
              sttSettings = input;
              return sttSettings;
            },
            listProviders: () => [
              {
                capabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
                providerId: "qwen3-asr",
                packageId: "qwen3-asr",
                packageName: "qwen3-asr",
                command: "qwen3_asr_transcribe",
                label: "Qwen3 ASR",
                installed: true,
                available: true,
                availabilityReason: "dogfood fixture provider",
                languages: ["English", "Spanish"],
                defaultLanguage: "English",
              },
            ],
          },
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface speech settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId speech-dogfood-owner, conversationId speech-settings-conversation, ownerUserId owner-speech-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId speech-dogfood-owner, conversationId speech-settings-conversation, messageId speech-dogfood-message-1, senderId owner-speech-dogfood, senderLabel Owner, and text set speech language Spanish.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient STT policy after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_STT_SETTINGS_OK and include the phrases set speech language Spanish, stt policy apply, spokenLanguage=Spanish, Remote Ambient Surface command apply, and Settings projection.",
          ],
          expected: "MESSAGING_GATEWAY_STT_SETTINGS_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("set speech language Spanish");
      expect(transcript).toContain("stt policy apply");
      expect(transcript).toContain("spokenLanguage=Spanish");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(sttSettings.spokenLanguage).toBe("Spanish");
    },
    300_000,
  );

  itLive(
    "updates generated media playback through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface media settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "media-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "media-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "media-dogfood-owner",
            phoneNumber: "+15550000002",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-media-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      let mediaSettings: MediaPlaybackSettings = { generatedMediaAutoplay: false };
      const thread = store.createThread("Remote Ambient Surface media settings dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface media settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          media: {
            readSettings: () => mediaSettings,
            updateSettings: (input: any) => {
              mediaSettings = input;
              return mediaSettings;
            },
          },
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface generated media settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId media-dogfood-owner, conversationId media-settings-conversation, ownerUserId owner-media-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId media-dogfood-owner, conversationId media-settings-conversation, messageId media-dogfood-message-1, senderId owner-media-dogfood, senderLabel Owner, and text set generated media autoplay on.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient generated media playback setting after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_MEDIA_SETTINGS_OK and include the phrases set generated media autoplay on, media playback apply, generatedMediaAutoplay=true, Remote Ambient Surface command apply, and Settings projection.",
          ],
          expected: "MESSAGING_GATEWAY_MEDIA_SETTINGS_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("set generated media autoplay on");
      expect(transcript).toContain("media playback apply");
      expect(transcript).toContain("generatedMediaAutoplay=true");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(mediaSettings.generatedMediaAutoplay).toBe(true);
    },
    300_000,
  );

  itLive(
    "updates Planner finalization through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface Planner settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "planner-settings-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "planner-settings-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "planner-settings-dogfood-owner",
            phoneNumber: "+15550000006",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-planner-settings-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      let plannerSettings = { autoFinalize: true };
      const thread = store.createThread("Remote Ambient Surface Planner settings dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface Planner settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          planner: {
            readSettings: () => plannerSettings,
            updateSettings: (input: any) => {
              plannerSettings = input;
              return plannerSettings;
            },
          },
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface Planner finalization settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId planner-settings-dogfood-owner, conversationId planner-settings-conversation, ownerUserId owner-planner-settings-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId planner-settings-dogfood-owner, conversationId planner-settings-conversation, messageId planner-settings-dogfood-message-1, senderId owner-planner-settings-dogfood, senderLabel Owner, and text set planner autoFinalize off.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient Planner finalization setting after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PLANNER_SETTINGS_OK and include the phrases set planner autoFinalize off, planner finalization apply, autoFinalize=false, Remote Ambient Surface command apply, and Settings projection.",
          ],
          expected: "MESSAGING_GATEWAY_PLANNER_SETTINGS_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("set planner autoFinalize off");
      expect(transcript).toContain("planner finalization apply");
      expect(transcript).toContain("autoFinalize=false");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(plannerSettings.autoFinalize).toBe(false);
    },
    300_000,
  );

  itLive(
    "updates selected chat thread settings through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface thread settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "thread-settings-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "thread-settings-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "thread-settings-dogfood-owner",
            phoneNumber: "+15550000003",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-thread-settings-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const thread = store.createThread("Remote Ambient Surface thread settings dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface thread settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface selected chat thread settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId thread-settings-dogfood-owner, conversationId thread-settings-conversation, ownerUserId owner-thread-settings-dogfood, ambientSurface chat, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId thread-settings-dogfood-owner, conversationId thread-settings-conversation, messageId thread-settings-dogfood-message-1, senderId owner-thread-settings-dogfood, senderLabel Owner, and text set chat mode planner.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the selected Ambient chat thread mode after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_THREAD_SETTINGS_OK and include the phrases set chat mode planner, thread settings apply, collaborationMode=planner, Remote Ambient Surface command apply, and Chat projection.",
          ],
          expected: "MESSAGING_GATEWAY_THREAD_SETTINGS_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("set chat mode planner");
      expect(transcript).toContain("thread settings apply");
      expect(transcript).toContain("collaborationMode=planner");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(store.getThread(thread.id).collaborationMode).toBe("planner");
    },
    300_000,
  );

  itLive(
    "responds to pending permission prompts through Remote Ambient Surface approval commands",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface approval dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "approval-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "approval-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "approval-dogfood-owner",
            phoneNumber: "+15550000004",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-approval-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const thread = store.createThread("Remote Ambient Surface approval dogfood");
      const pendingApproval: PermissionRequest = {
        id: "permission-approval-dogfood",
        threadId: thread.id,
        toolName: "ambient_messaging_telegram_bridge_reply_apply",
        title: "Send Telegram reply?",
        message: "Send one owner-scoped reply through Telegram.",
        detail: "Reply preview: Remote approval dogfood status.",
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "tool",
        grantTargetLabel: "telegram reply dogfood",
        grantTargetHash: "telegram-reply-dogfood",
      };
      let approvalResponse: { id: string; response: PermissionPromptResponseMode } | undefined;
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (request.toolName === "ambient_messaging_telegram_remote_surface_apply") {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface approval dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
          listPending: () => (approvalResponse ? [] : [pendingApproval]),
          respond: (id: string, response: PermissionPromptResponseMode) => {
            approvalResponse = { id, response };
          },
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface pending approval dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId approval-dogfood-owner, conversationId approval-settings-conversation, ownerUserId owner-approval-dogfood, ambientSurface notifications, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId approval-dogfood-owner, conversationId approval-settings-conversation, messageId approval-dogfood-message-1, senderId owner-approval-dogfood, senderLabel Owner, and text approve request 1 always thread.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should resolve the pending Ambient permission prompt without asking for another approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_APPROVAL_RESPONSE_OK and include the phrases approve request 1 always thread, approval response apply, pendingApprovals=0, Responded to approval, and Remote Ambient Surface command apply.",
          ],
          expected: "MESSAGING_GATEWAY_APPROVAL_RESPONSE_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("approve request 1 always thread");
      expect(transcript).toContain("approval response apply");
      expect(transcript).toContain("Responded to approval");
      expect(approvalResponse).toEqual({
        id: "permission-approval-dogfood",
        response: "always_thread",
      });
    },
    300_000,
  );

  itLive(
    "revokes persistent permission grants through Remote Ambient Surface commands",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface grant revocation dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "grant-revoke-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "grant-revoke-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "grant-revoke-owner",
            phoneNumber: "+15550000005",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-grant-revoke-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const thread = store.createThread("Remote permission grant revoke dogfood");
      const grant = store.createPermissionGrant({
        permissionModeAtCreation: "workspace",
        scopeKind: "thread",
        threadId: thread.id,
        actionKind: "plugin_tool_execute",
        targetKind: "tool",
        targetHash: "remote-grant-dogfood",
        targetLabel: "Remote dogfood grant",
        source: "permission_prompt",
        reason: "Dogfood grant for Remote Ambient Surface revocation.",
      });
      store.addPermissionAudit({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "ambient_messaging_telegram_bridge_reply_apply",
        risk: "plugin-tool",
        decision: "allowed",
        reason: "Matched dogfood persistent grant.",
        decisionSource: "persistent_grant",
        grantId: grant.id,
      });

      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (request.toolName === "ambient_messaging_telegram_remote_surface_apply") {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface grant revoke dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
          listPending: () => [],
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface permission grant revocation dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId grant-revoke-owner, conversationId grant-revoke-conversation, ownerUserId owner-grant-revoke, ambientSurface notifications, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId grant-revoke-owner, conversationId grant-revoke-conversation, messageId grant-revoke-message-1, senderId owner-grant-revoke, senderLabel Owner, and text revoke grant 1.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should revoke the active Ambient permission grant without asking for another approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, approval response, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_GRANT_REVOKE_OK and include the phrases revoke grant 1, grant revoke apply, activeGrants=0, Revoked permission grant, and Remote Ambient Surface command apply.",
          ],
          expected: "MESSAGING_GATEWAY_GRANT_REVOKE_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("revoke grant 1");
      expect(transcript).toContain("grant revoke apply");
      expect(transcript).toContain("Revoked permission grant");
      expect(store.listPermissionGrants()).toEqual([]);
      expect(store.getPermissionGrant(grant.id).revokedAt).toEqual(expect.any(String));
    },
    300_000,
  );
}
