import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMessagingBindingStore } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandBindingUpdate,
  messagingRemoteSurfaceCommandPreviewText,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
} from "./messagingRemoteSurfaceCommands";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway remote surface settings commands", () => {
  it("previews approval-gated settings commands and returns settings projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-settings-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      activeThreadId: "thread-remote",
      threads: [
        {
          id: "thread-remote",
          title: "Remote thread settings target",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastReadAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-5.1-FP8",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
      settings: {
        voice: {
          enabled: true,
          mode: "assistant-final",
          autoplay: true,
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          voiceId: "en_US-lessac-medium",
          maxChars: 1500,
          longReply: "summarize",
          format: "wav",
          artifactCacheMaxMb: 250,
        },
        search: {
          webSearch: {
            activity: "web_search",
            preferredProvider: "brave-search",
            mode: "prefer",
            fallback: "allow",
            updatedAt: "2026-05-10T00:00:01.000Z",
          },
        },
        stt: {
          enabled: true,
          providerCapabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
          spokenLanguage: "English",
          mode: "push-to-talk",
          autoSendAfterTranscription: true,
          silenceFinalizeSeconds: 0.8,
          noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
          bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
        },
        media: { generatedMediaAutoplay: false },
        planner: { autoFinalize: true },
      },
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-voice",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set voice mode off",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "voice",
          operation: "voice_policy",
          field: "mode",
          value: "off",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Setting update: voice.mode=off");

      const update = messagingRemoteSurfaceCommandBindingUpdate(preview);
      const updatedBinding = bindings.updateRemoteSurfaceScope(update!);
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: true,
        updatedBinding,
        updatedSetting: {
          settingKey: "voice",
          operation: "voice_policy",
          changed: true,
          text: "Ambient voice policy updated",
        },
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        projection: {
          title: "Settings",
          summary: "Headless-readable settings summary.",
        },
      });
      expect(result.projection?.actions.map((action) => action.command)).toEqual(
        expect.arrayContaining([
          "set voice mode off",
          "set voice autoplay on",
          "set chat mode agent",
          "set chat thinking medium",
          "set planner autoFinalize off",
          "set speech language English",
          "set speech silence 0.8",
          "set generated media autoplay on",
          "clear search preference",
        ]),
      );
      expect(result.projection?.actions.map((action) => action.command)).not.toContain("edit setting voice.output");
      expect(result.projection?.bodyLines.join("\n")).toContain("voice.output: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.mode: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.thinking: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.planner: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("search.preference: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("speech.provider: configured; status=partial");
      expect(result.projection?.bodyLines.join("\n")).toContain("speech.language: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("media.generated: configured; status=ready");
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Updated setting: voice; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("mode=assistant-final");
      expect(bindings.list().bindings[0]).toMatchObject({
        ambientSurface: "settings",
      });

      const speechDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-speech",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set speech language Spanish",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const speechPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: speechDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(speechPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "stt",
          operation: "stt_policy",
          field: "spokenLanguage",
          value: "Spanish",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(speechPreview)).toContain("Setting update: stt.spokenLanguage=Spanish");

      const speechResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: speechPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(speechPreview)!),
        updatedSetting: {
          settingKey: "stt",
          operation: "stt_policy",
          changed: true,
          text: "Ambient STT policy updated\nSpoken language: English -> Spanish",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: speechPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(speechResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "stt", operation: "stt_policy", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(speechResult)).toContain("Updated setting: stt; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(speechResult)).toContain("Spoken language: English -> Spanish");

      const mediaDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-media",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set generated media autoplay on",
          receivedAt: "2026-05-10T00:00:05.000Z",
        },
      });
      const mediaPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: mediaDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(mediaPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "media",
          operation: "media_playback",
          field: "generatedMediaAutoplay",
          value: true,
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(mediaPreview)).toContain("Setting update: media.generatedMediaAutoplay=true");

      const mediaResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: mediaPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(mediaPreview)!),
        updatedSetting: {
          settingKey: "media",
          operation: "media_playback",
          changed: true,
          text: "Ambient generated media playback updated\nGenerated media autoplay: false -> true",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: mediaPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(mediaResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "media", operation: "media_playback", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(mediaResult)).toContain("Updated setting: media; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(mediaResult)).toContain("Generated media autoplay: false -> true");

      const plannerDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-planner",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set planner autoFinalize off",
          receivedAt: "2026-05-10T00:00:05.500Z",
        },
      });
      const plannerPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: plannerDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(plannerPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "planner",
          operation: "planner_finalization",
          field: "autoFinalize",
          value: false,
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(plannerPreview)).toContain("Setting update: planner.autoFinalize=false");

      const plannerResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: plannerPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(plannerPreview)!),
        updatedSetting: {
          settingKey: "planner",
          operation: "planner_finalization",
          changed: true,
          text: "Ambient Planner finalization updated\nAuto-finalize: true -> false",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: plannerPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(plannerResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "planner", operation: "planner_finalization", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(plannerResult)).toContain("Updated setting: planner; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(plannerResult)).toContain("Auto-finalize: true -> false");

      const threadDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-thread",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set chat thinking low",
          receivedAt: "2026-05-10T00:00:06.000Z",
        },
      });
      const threadPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: threadDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(threadPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "chat",
        targetChat: { id: "thread-remote", title: "Remote thread settings target" },
        targetSettingUpdate: {
          settingKey: "thread",
          operation: "thread_settings",
          threadId: "thread-remote",
          field: "thinkingLevel",
          value: "low",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(threadPreview)).toContain(
        "Setting update: thread.thinkingLevel=low (Remote thread settings target)",
      );

      const threadResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: threadPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(threadPreview)!),
        updatedSetting: {
          settingKey: "thread",
          operation: "thread_settings",
          changed: true,
          text: "Ambient chat thread settings updated\nThread: Remote thread settings target (thread-remote)\nThinking level: medium -> low",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: threadPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(threadResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "thread", operation: "thread_settings", changed: true },
        projection: { title: "Remote thread settings target" },
      });
      expect(threadResult.updatedBinding).toMatchObject({
        ambientSurface: "chat",
        chatThreadId: "thread-remote",
      });
      expect(messagingRemoteSurfaceCommandResultText(threadResult)).toContain("Updated setting: thread; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(threadResult)).toContain("Thinking level: medium -> low");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
