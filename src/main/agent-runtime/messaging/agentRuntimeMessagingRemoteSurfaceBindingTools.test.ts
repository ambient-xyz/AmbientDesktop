import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerMessagingRemoteSurfaceBindingTools } from "./agentRuntimeMessagingRemoteSurfaceBindingTools";
import { createMessagingBindingStore } from "../../messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messagingGatewayRunner";
import {
  buildTelegramRemoteSurfaceBindingPlan,
  telegramRemoteSurfaceBindingCreateInput,
  telegramRemoteSurfaceBindingRevokeInput,
  type TelegramRemoteSurfaceBindingToolInput,
} from "../../telegramRemoteSurfaceBinding";

describe("registerMessagingRemoteSurfaceBindingTools", () => {
  it("registers and executes the generic Remote Ambient Surface binding preview tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-remote-surface-binding-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-14T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-14T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-14T00:00:01.000Z",
          message: "Ready for Remote Ambient Surface binding preview parity test.",
          diagnostics: ["Synthetic readiness probe; no provider messages read."],
          bridgeSessionCount: 1,
          bridgeBaseUrl: "http://127.0.0.1:8091",
          sessions: [{
            profileId: "owner-profile",
            metadataPath: join(stateRoot, "telegram", "owner-profile", "bridge-session.json"),
            metadataReadable: true,
            tdlibStateDirPresent: true,
            phoneNumberPresent: true,
            databaseEncryptionKeyPresent: true,
          }],
        }),
      },
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    const telegramPlan = async (input: TelegramRemoteSurfaceBindingToolInput) => {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib").catch(() => undefined);
      const runtimeProvider = gatewayRunner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib");
      const readiness = runtimeProvider?.readiness;
      const lifecycle = input.action === "revoke"
        ? bindings.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(input))
        : bindings.previewCreate(telegramRemoteSurfaceBindingCreateInput(input));
      return buildTelegramRemoteSurfaceBindingPlan({
        toolInput: input,
        lifecycle,
        readiness,
        runtimeProvider,
      });
    };

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      registerMessagingRemoteSurfaceBindingTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        registry: providers,
        bindings,
        gatewayRunner,
        telegramPlan,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_remote_surface_binding_preview",
      ]);

      const previewTool = registeredTools[0]!;
      const telegramPreview = await previewTool.execute("remote-surface-binding-preview", {
        action: "create",
        providerId: " telegram-tdlib ",
        authProfileId: " owner-profile ",
        conversationId: " owner-conversation ",
        purpose: "remote_ambient_surface",
        ownerUserId: " owner-user ",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(telegramPreview.content[0].text).toContain("Remote Ambient Surface binding preview: ready");
      expect(telegramPreview.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_binding_preview",
        status: "ready",
        kind: "remote-surface-binding-preview",
        providerId: "telegram-tdlib",
        providerLabel: "Telegram",
        action: "create",
        canApplyNow: true,
        typedPreviewTool: "ambient_messaging_telegram_remote_surface_preview",
        typedApplyTool: "ambient_messaging_telegram_remote_surface_apply",
        matchedBinding: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          purpose: "remote_ambient_surface",
          status: "active",
          ownerUserId: "owner-user",
          ambientSurface: "projects",
          maxDisclosureLabel: "owner-private-runtime-summary",
        },
        delegatedTelegramPlan: {
          status: "ready",
          canApplyNow: true,
          matchedSession: {
            profileId: "owner-profile",
            metadataReadable: true,
            tdlibStateDirPresent: true,
            databaseEncryptionKeyPresent: true,
          },
        },
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          enablesInboundIngestion: false,
          mutatesBindings: false,
        },
      });
      expect(telegramPreview.details.warnings).toContain("Provider-neutral preview delegated to the Telegram typed Remote Ambient Surface planner.");

      const signalPreview = await previewTool.execute("remote-surface-binding-preview-signal", {
        action: "create",
        providerId: "signal-cli",
        authProfileId: "signal-owner",
        conversationId: "signal-chat-1",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-user",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(signalPreview.content[0].text).toContain("Remote Ambient Surface binding preview: blocked");
      expect(signalPreview.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_binding_preview",
        status: "blocked",
        providerId: "signal-cli",
        typedPreviewTool: "ambient_messaging_signal_remote_surface_preview",
        typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
        canApplyNow: false,
        safety: {
          mutatesBindings: false,
        },
      });
      expect(signalPreview.details.blockers).toEqual(expect.arrayContaining([
        "Signal Remote Ambient Surface binding creation must use the typed Signal preview/apply path after matched owner handoff metadata.",
      ]));
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
