import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMessagingBindingStore } from "./messagingBindings";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  buildMessagingRemoteSurfaceActivationPlan,
  buildMessagingRemoteSurfaceProviderSupportPlan,
  messagingRemoteSurfaceActivationCard,
  messagingRemoteSurfaceActivationInput,
  messagingRemoteSurfaceActivationPlanText,
  messagingRemoteSurfaceProviderSupportPlanInput,
  messagingRemoteSurfaceProviderSupportPlanText,
} from "./messagingRemoteSurfaceActivationPlan";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import {
  buildTelegramOwnerLoopActivationPlan,
  TelegramBridgePollingRunner,
  telegramOwnerLoopActivationCard,
  telegramOwnerLoopActivationInput,
  telegramOwnerLoopActivationPlanText,
} from "./messagingTelegramFacade";

describe("messaging gateway registry owner-loop activation planning", () => {
  it("builds the Telegram owner-loop activation plan from readiness, bindings, and polling state", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-activation-plan-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for activation plan dogfood.",
          diagnostics: ["Root probe only; no provider messages read."],
          bridgeSessionCount: 1,
          bridgeBaseUrl: "http://127.0.0.1:8091",
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: join(stateRoot, "telegram", "owner-profile", "bridge-session.json"),
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
        }),
      },
    });

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      const remoteShortcutNeedsProvider = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({ requestText: "set up remote control" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(remoteShortcutNeedsProvider).toMatchObject({
        status: "needs_provider_choice",
        recommendedNextTool: "ambient_messaging_remote_surface_activation_plan",
        lowLevelToolPolicy: {
          activationPlanRequiredBeforeLowLevel: true,
          allowedFirstTools: expect.arrayContaining([
            "ambient_messaging_remote_surface_activation_plan",
            "ambient_messaging_telegram_owner_loop_activation_plan",
          ]),
        },
      });
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcutNeedsProvider)).toContain(
        "Choose a reviewed Remote Ambient Surface provider",
      );

      const remoteShortcut = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({
          requestText: "set up Telegram remote control",
          setupCode: "AMBIENT-OWNER-LOOP-SETUP",
        }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(remoteShortcut).toMatchObject({
        status: "route_ready",
        selectedProviderId: "telegram-tdlib",
        recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
        delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
        activationPlanFirstTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      });
      expect(remoteShortcut.repairPrompts.join("\n")).toContain("Owner conversation");
      expect(remoteShortcut.repairPrompts.join("\n")).toContain("Freshness anchor");
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcut)).toContain(
        "Activation plan first tool: ambient_messaging_telegram_owner_loop_activation_plan",
      );
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcut)).toContain(
        "Blocked until activation plan: ambient_messaging_gateway_lifecycle_preview",
      );
      const remoteShortcutCard = messagingRemoteSurfaceActivationCard(remoteShortcut);
      expect(remoteShortcutCard).toMatchObject({
        kind: "messaging-remote-surface-activation",
        intent: "remote_ambient_surface",
        providerId: "telegram-tdlib",
        providerLabel: "Telegram",
        status: "route_ready",
        currentPhase: {
          id: "metadata-directory",
          status: "ready",
          nextTool: "ambient_messaging_telegram_conversation_directory_preview",
        },
        recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
        delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
        previewSendSafety: {
          providerSendRequiresSeparateApproval: true,
          providerSendReady: false,
        },
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
        },
      });
      expect(remoteShortcutCard.phaseChips.map((phase) => phase.id)).toEqual(
        expect.arrayContaining([
          "product-provider-route",
          "metadata-directory",
          "owner-handoff",
          "owner-binding",
          "periodic-polling",
          "command-and-relay-preview",
        ]),
      );
      expect(remoteShortcutCard.blockedUntilActivationPlan).toContain("ambient_messaging_gateway_lifecycle_preview");

      const unsupportedRemoteShortcut = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({ provider: "Signal" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(unsupportedRemoteShortcut).toMatchObject({
        status: "unsupported_provider",
      });
      expect(unsupportedRemoteShortcut.selectedProviderId).toBeUndefined();
      expect(unsupportedRemoteShortcut.repairPrompts.join("\n")).toContain("No reviewed Remote Ambient Surface activation shortcut exists");
      expect(messagingRemoteSurfaceActivationCard(unsupportedRemoteShortcut)).toMatchObject({
        status: "unsupported_provider",
        requestedProvider: "Signal",
        currentPhase: {
          id: "product-provider-route",
          status: "blocked",
        },
        previewSendSafety: {
          providerSendRequiresSeparateApproval: true,
          providerSendReady: false,
        },
      });
      const unsupportedRemoteShortcutFromRequest = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({ requestText: "set up Signal remote control for Ambient Desktop" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(unsupportedRemoteShortcutFromRequest).toMatchObject({
        status: "unsupported_provider",
        requestedProvider: "Signal",
      });
      expect(messagingRemoteSurfaceActivationPlanText(unsupportedRemoteShortcutFromRequest)).toContain(
        "No reviewed Remote Ambient Surface activation shortcut exists for Signal",
      );
      expect(messagingRemoteSurfaceActivationCard(unsupportedRemoteShortcutFromRequest)).toMatchObject({
        status: "unsupported_provider",
        requestedProvider: "Signal",
        repairPrompts: expect.arrayContaining([expect.stringContaining("falling back to external Messaging Connector tools")]),
      });

      const signalProviderSupportPlan = buildMessagingRemoteSurfaceProviderSupportPlan(
        messagingRemoteSurfaceProviderSupportPlanInput({
          provider: "Signal",
          ambientSurface: "projects",
          blockerContext: "No reviewed Remote Ambient Surface activation shortcut exists for Signal.",
        }),
      );
      expect(signalProviderSupportPlan).toMatchObject({
        status: "planning_ready",
        intent: "remote_ambient_surface_provider_support",
        requestedProvider: "Signal",
        selectedProviderId: "signal-cli",
        ambientSurface: "projects",
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          installsDependencies: false,
          scaffoldsProviderSupport: false,
        },
      });
      expect(signalProviderSupportPlan.adapterRequirements.join("\n")).toContain(
        "Signal Desktop being installed is not an activation route",
      );
      expect(signalProviderSupportPlan.ownerAuthConstraints.join("\n")).toContain("owner-authenticated chat-to-self control");
      expect(signalProviderSupportPlan.headlessSupportRequirements.join("\n")).toContain("headless Ambient process");
      expect(signalProviderSupportPlan.approvalGates.join("\n")).toContain("Dependency installation");
      expect(signalProviderSupportPlan.validationTargets.join("\n")).toContain("does not start bridges");
      expect(signalProviderSupportPlan.blockedActions.join("\n")).toContain("Generic Messaging Connector setup");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain(
        "Remote Ambient Surface provider support plan",
      );
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Status: planning_ready");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Installs dependencies: no");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Scaffolds provider support: no");

      const telegramProviderSupportPlan = buildMessagingRemoteSurfaceProviderSupportPlan(
        messagingRemoteSurfaceProviderSupportPlanInput({
          requestText: "plan Telegram provider support",
        }),
      );
      expect(telegramProviderSupportPlan).toMatchObject({
        status: "already_supported",
        selectedProviderId: "telegram-tdlib",
        recommendedNextTool: "ambient_messaging_remote_surface_activation_plan",
      });

      const setupPlan = buildTelegramOwnerLoopActivationPlan({
        toolInput: telegramOwnerLoopActivationInput({ setupCode: "AMBIENT-OWNER-LOOP-SETUP" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        pollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(setupPlan).toMatchObject({
        status: "needs_setup",
        selectedProfileId: "owner-profile",
        recommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
        safety: {
          readsProviderMessages: false,
          mutatesBindings: false,
          startsPolling: false,
          sendsProviderMessages: false,
        },
      });
      expect(telegramOwnerLoopActivationPlanText(setupPlan)).toContain("metadata-directory");
      expect(telegramOwnerLoopActivationPlanText(setupPlan)).toContain(
        "ambient_messaging_telegram_owner_handoff_preview -> ambient_messaging_telegram_owner_handoff_apply",
      );
      expect(telegramOwnerLoopActivationPlanText(setupPlan)).toContain("minReceivedAt from the activation/command boundary");
      expect(telegramOwnerLoopActivationCard(setupPlan)).toMatchObject({
        status: "needs_setup",
        providerId: "telegram-tdlib",
        providerLabel: "Telegram",
        currentPhase: {
          id: "metadata-directory",
          status: "ready",
          nextTool: "ambient_messaging_telegram_conversation_directory_preview",
        },
        recommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
      });

      const created = bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        externalTrustClass: "owner",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_telegram_remote_surface_apply",
          setupShape: "telegram-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "handoff-1",
        },
      });
      const pollingPlan = buildTelegramOwnerLoopActivationPlan({
        toolInput: telegramOwnerLoopActivationInput({
          bindingId: created.binding.id,
          minReceivedAt: "2026-05-10T00:00:06.000Z",
        }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        pollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(pollingPlan).toMatchObject({
        status: "ready_to_start_polling",
        selectedBinding: {
          bindingId: created.binding.id,
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
        },
        recommendedNextTool: "ambient_messaging_telegram_bridge_polling_preview",
      });
      expect(telegramOwnerLoopActivationPlanText(pollingPlan)).toContain(
        "ambient_messaging_telegram_bridge_polling_preview -> ambient_messaging_telegram_bridge_polling_apply",
      );
      expect(telegramOwnerLoopActivationPlanText(pollingPlan)).toContain("Requested minReceivedAt=2026-05-10T00:00:06.000Z");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
