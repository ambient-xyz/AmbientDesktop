import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  registerSignalOwnerHandoffTools,
  type SignalOwnerHandoffToolPermissionRequest,
} from "./agentRuntimeSignalOwnerHandoffTools";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";

describe("registerSignalOwnerHandoffTools", () => {
  it("registers and executes the Signal owner handoff preview and apply tools", async () => {
    const previousFakeApply = process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY;
    delete process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY;

    try {
      const providers = createDefaultMessagingProviderRegistry();
      const bindings = createEmptyMessagingBindingRegistry(providers);
      const gatewayRunner = new MessagingGatewayRunner({
        providers,
        now: () => new Date("2026-05-16T00:00:05.000Z"),
        readinessProbes: {
          "signal-cli": async () => ({
            providerId: "signal-cli",
            status: "available",
            configured: true,
            bridgeReachable: true,
            bridgeCapabilities: {
              profileStatus: true,
              metadataOnlyConversationDirectory: true,
              boundedUnreadWindow: true,
              approvedReplySend: true,
            },
            authNeeded: false,
            apiCredentialsPresent: false,
            persistedSessionCount: 1,
            checkedAt: "2026-05-16T00:00:01.000Z",
            message: "Signal bridge contract readiness is present.",
            diagnostics: [
              "Signal bridge root contract accepted.",
              "Signal bridge bounded unread contract accepted.",
            ],
            bridgeBaseUrl: "http://127.0.0.1:19092",
            sessions: [{
              profileId: "signal-owner",
              metadataPath: "/tmp/signal-owner/bridge-session.json",
              metadataReadable: true,
              tdlibStateDirPresent: false,
              phoneNumberPresent: false,
              databaseEncryptionKeyPresent: false,
              signalCliConfigDirPresent: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }],
          }),
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const permissionRequests: SignalOwnerHandoffToolPermissionRequest[] = [];

      await gatewayRunner.refreshProviderReadiness("signal-cli");

      registerSignalOwnerHandoffTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        threadId: "thread-1",
        workspace: {
          name: "ambientCoder",
          path: "/workspace",
          statePath: "/tmp/ambient-state",
          sessionPath: "/tmp/ambient-state/sessions",
        } as any,
        getThread: (threadId) => ({ id: threadId, title: "Thread 1" }) as any,
        resolveFirstPartyPluginPermission: async (request) => {
          permissionRequests.push(request);
          return false;
        },
        bindings,
        gatewayRunner,
        signalDescriptor: () => providers.get("signal-cli")?.descriptor,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_signal_owner_handoff_preview",
        "ambient_messaging_signal_owner_handoff_apply",
      ]);

      const setupCode = "ambient-signal-setup-code-12345";
      const preview = await toolByName(registeredTools, "ambient_messaging_signal_owner_handoff_preview").execute("signal-owner-handoff-preview", {
        providerId: " signal-cli ",
        profileId: " signal-owner ",
        conversationId: " signal-chat-1 ",
        setupCode,
        limit: 5,
      });
      expect(preview.content[0].text).toContain("Signal owner handoff preview: blocked");
      expect(preview.content[0].text).toContain("Typed apply tool: ambient_messaging_signal_owner_handoff_apply");
      expect(preview.content[0].text).toContain("Binding apply tool: none");
      expect(preview.content[0].text).toContain("Reads Signal unread messages now: no");
      expect(preview.content[0].text).toContain("Uses Telegram owner handoff: no");
      expect(preview.content[0].text).not.toContain(setupCode);
      expect(preview.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_owner_handoff_preview",
        status: "blocked",
        ownerHandoffStatus: "blocked",
        providerId: "signal-cli",
        providerLabel: "Signal",
        canApplyNow: false,
        previewOnly: true,
        approvalRequired: true,
        approvalRequiredForFutureApply: true,
        typedPreviewTool: "ambient_messaging_signal_owner_handoff_preview",
        typedApplyTool: "ambient_messaging_signal_owner_handoff_apply",
        bindingApplyTool: "none",
        fakeBridgeApplyEnabled: false,
        providerImplementationStatus: "planned",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        setupCodeLength: setupCode.length,
        setupCodePreview: "31 chars",
        limit: 5,
        endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
        readinessStatus: "available",
        configured: true,
        bridgeReachable: true,
        gates: {
          profileSelected: true,
          conversationSelected: true,
          setupCodeReady: true,
          bridgeReadableProfile: true,
          boundedUnreadWindowAvailable: true,
          fakeBridgeApplyEnabled: false,
          ownerHandoffApplyAvailable: false,
          bindingApplyAvailable: false,
          senderProfileResolutionAvailable: false,
        },
        safety: {
          readsProviderUnreadMessages: false,
          filtersExactSetupCode: false,
          returnsMatchedSenderId: false,
          returnsProviderMessageContent: false,
          writesInitialDedupeState: false,
          createsBinding: false,
          usesTelegramOwnerHandoff: false,
        },
      });
      expect(preview.details.blockers.join("\n")).toContain("AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY=1");
      expect(preview.details.policyNotes.join("\n")).toContain("compare message text to the one-time setup code internally");

      const blocked = await toolByName(registeredTools, "ambient_messaging_signal_owner_handoff_apply").execute("signal-owner-handoff-apply", {
        providerId: " signal-cli ",
        profileId: " signal-owner ",
        conversationId: " signal-chat-1 ",
        setupCode,
        limit: 5,
      });
      expect(blocked.content[0].text).toContain("Signal owner handoff apply: blocked");
      expect(blocked.content[0].text).toContain("Approval requested: no");
      expect(blocked.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_owner_handoff_apply",
        status: "blocked",
        ownerHandoffStatus: "not-attempted",
        previewStatus: "blocked",
        applyStatus: "blocked",
        approvalRequested: false,
        approvalRecorded: false,
        handoffStatus: "not-attempted",
        failureMode: "fake-bridge-apply-disabled",
        fetchedMessageCount: 0,
        candidateMessageCount: 0,
        matchedMessageCount: 0,
        matchedSenderCount: 0,
        initialSeenMessageIds: [],
        canFeedBindingApply: false,
        bindingApplyInputReady: false,
      });
      expect(permissionRequests).toEqual([]);

      process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY = "1";
      const setupCodeHash = createHash("sha256").update(setupCode).digest("hex").slice(0, 16);
      const denied = await toolByName(registeredTools, "ambient_messaging_signal_owner_handoff_apply").execute("signal-owner-handoff-apply", {
        providerId: " signal-cli ",
        profileId: " signal-owner ",
        conversationId: " signal-chat-1 ",
        setupCode,
        limit: 5,
      });
      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_signal_owner_handoff_apply",
        title: "Read Signal owner handoff code?",
        message: "Read up to 5 unread Signal message(s) from the reviewed fake bridge for conversation signal-chat-1 to find the setup-code sender.",
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: "signal-owner-handoff:signal-owner:signal-chat-1",
        grantTargetIdentity: `signal-cli:signal-owner:signal-chat-1:5:${setupCodeHash}`,
        allowedReason: "User approved bounded fake Signal owner handoff.",
        deniedReason: "User denied Signal owner handoff.",
      });
      expect(permissionRequests[0]!.detail).toContain("Would read Signal unread messages: yes");
      expect(permissionRequests[0]!.detail).not.toContain(setupCode);
      expect(denied.content[0].text).toContain("Signal owner handoff apply: denied");
      expect(denied.content[0].text).toContain("Approval requested: yes");
      expect(denied.content[0].text).not.toContain(setupCode);
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_owner_handoff_apply",
        status: "denied",
        ownerHandoffStatus: "not-attempted",
        previewStatus: "ready",
        applyStatus: "denied",
        approvalRequested: true,
        approvalRecorded: false,
        handoffStatus: "not-attempted",
        failureMode: "permission-denied",
        canApplyNow: true,
        fakeBridgeApplyEnabled: true,
        previewOnly: false,
        fetchedMessageCount: 0,
        candidateMessageCount: 0,
        matchedMessageCount: 0,
        matchedSenderCount: 0,
        initialSeenMessageIds: [],
        canFeedBindingApply: false,
        bindingApplyInputReady: false,
        safety: {
          readsProviderUnreadMessages: false,
          filtersExactSetupCode: false,
          returnsMatchedSenderId: false,
          returnsProviderMessageContent: false,
          writesInitialDedupeState: false,
          createsBinding: false,
          usesTelegramOwnerHandoff: false,
        },
      });
    } finally {
      if (previousFakeApply === undefined) {
        delete process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY;
      } else {
        process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY = previousFakeApply;
      }
    }
  });
});

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
