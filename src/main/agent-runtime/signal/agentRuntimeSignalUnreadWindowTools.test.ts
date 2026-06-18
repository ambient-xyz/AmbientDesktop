import { describe, expect, it } from "vitest";

import {
  registerSignalUnreadWindowTools,
  type SignalUnreadWindowToolPermissionRequest,
} from "./agentRuntimeSignalUnreadWindowTools";
import { createEmptyMessagingBindingRegistry } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerSignalUnreadWindowTools", () => {
  it("registers and executes the Signal unread-window preview tool", async () => {
    const previousFakeBridgeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
    delete process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;

    try {
      const { registeredTools } = await createSignalUnreadWindowHarness();

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_signal_unread_window_preview",
        "ambient_messaging_signal_unread_window_apply",
        "ambient_messaging_signal_unread_window_status",
        "ambient_messaging_signal_real_unread_window_preview",
        "ambient_messaging_signal_real_unread_window_apply",
      ]);

      const unreadPreview = toolByName(registeredTools, "ambient_messaging_signal_unread_window_preview");
      const result = await unreadPreview.execute("signal-unread-preview", signalUnreadWindowParams());
      expect(result.content[0].text).toContain("Signal bounded unread-window preview");
      expect(result.content[0].text).toContain("Apply tool: ambient_messaging_signal_unread_window_apply");
      expect(result.content[0].text).toContain("Returns provider message bodies to Pi: no");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_unread_window_preview",
        status: "blocked",
        unreadWindowStatus: "blocked",
        providerId: "signal-cli",
        canApplyNow: false,
        contractReady: true,
        previewOnly: true,
        approvalRequired: true,
        applyToolName: "ambient_messaging_signal_unread_window_apply",
        fakeBridgeApplyEnabled: false,
        bindingId: "signal-binding-1",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
        endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
        selectedBindings: [{
          bindingId: "signal-binding-1",
          authProfileId: "signal-owner",
          conversationId: "signal-chat-1",
          ownerUserId: "owner-1",
          ambientSurface: "chat",
          maxDisclosureLabel: "owner-private-runtime-summary",
        }],
        contract: {
          kind: "signal-bounded-unread-window-v0",
          applyToolName: "ambient_messaging_signal_unread_window_apply",
        },
        realBridgeUnreadEnabled: false,
        realBridgeUnreadReadiness: {
          status: "real-ready-for-approved-single-read",
          contractReady: true,
          singleReadReady: true,
          applyImplemented: false,
          contract: {
            kind: "signal-real-bounded-unread-window-v0",
            endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
          },
        },
        blockers: [
          "Signal bounded unread-window apply is enabled only for the reviewed fake bridge when AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY=1.",
        ],
        contractBlockers: [],
        safety: {
          readsProviderUnreadMessages: false,
          resolvesSenderProfiles: false,
          returnsProviderMessageBodiesToPi: false,
          routesRemoteAmbientSurface: false,
          writesDedupeState: false,
          startsBridge: false,
          sendsProviderMessages: false,
          mutatesBindings: false,
        },
      });

      const unreadStatus = toolByName(registeredTools, "ambient_messaging_signal_unread_window_status");
      const status = await unreadStatus.execute("signal-unread-status", signalUnreadWindowParams());
      expect(status.content[0].text).toContain("Signal unread-window status");
      expect(status.content[0].text).toContain("Real Signal unread ingestion enabled: no");
      expect(status.content[0].text).toContain("Returns provider message bodies to Pi: no");
      expect(status.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_unread_window_status",
        providerId: "signal-cli",
        status: "ready",
        stateReadable: true,
        fakeBridgeApplyEnabled: false,
        realBridgeUnreadEnabled: false,
        bridgeModeLabel: "fake Signal bridge apply path disabled; real Signal bridge unread ingestion disabled",
        selectedBindingCount: 1,
        activeSignalRemoteSurfaceBindingCount: 1,
        dedupeBindingCount: 0,
        queuedSignalProjectionCount: 0,
        bindings: [{
          bindingId: "signal-binding-1",
          bindingStatus: "active",
          profileId: "signal-owner",
          conversationId: "signal-chat-1",
          ownerUserIdPresent: true,
          ambientSurface: "chat",
          initialSeenMessageCount: 1,
          dedupeSeenMessageCount: 0,
          queuedProjectionCount: 0,
          queuedProjections: [],
        }],
        blockers: [],
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          startsBridge: false,
          sendsProviderMessages: false,
          mutatesBindings: false,
        },
      });

      const realUnreadPreview = toolByName(registeredTools, "ambient_messaging_signal_real_unread_window_preview");
      const realPreview = await realUnreadPreview.execute("signal-real-unread-preview", signalUnreadWindowParams());
      expect(realPreview.content[0].text).toContain("Signal real unread-window preview: ready");
      expect(realPreview.content[0].text).toContain("Approval required before apply: yes");
      expect(realPreview.content[0].text).toContain("Contacts bridge unread endpoint: yes");
      expect(realPreview.content[0].text).toContain("Ready for approved single read: yes");
      expect(realPreview.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_real_unread_window_preview",
        status: "ready",
        realUnreadWindowStatus: "ready",
        providerId: "signal-cli",
        canApplyNow: true,
        previewOnly: false,
        approvalRequired: true,
        applyToolName: "ambient_messaging_signal_real_unread_window_apply",
        bindingId: "signal-binding-1",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
        endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
        selectedBindings: [{
          bindingId: "signal-binding-1",
          authProfileId: "signal-owner",
          conversationId: "signal-chat-1",
          ownerUserId: "owner-1",
          ambientSurface: "chat",
          maxDisclosureLabel: "owner-private-runtime-summary",
        }],
        realBridgeUnreadEnabled: true,
        realBridgeUnreadReadiness: {
          status: "real-ready-for-approved-single-read",
          contractReady: true,
          singleReadReady: true,
          applyImplemented: true,
          contract: {
            kind: "signal-real-bounded-unread-window-v0",
            endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
          },
        },
        contractBlockers: [],
        blockers: [],
        safety: {
          requestsApproval: true,
          contactsBridgeUnreadEndpoint: true,
          readsProviderUnreadMessages: true,
          returnsProviderMessageBodiesToPi: false,
          routesRemoteAmbientSurface: true,
          writesDedupeState: true,
          startsBridge: false,
          sendsProviderMessages: false,
          mutatesBindings: false,
        },
      });
    } finally {
      restoreFakeBridgeApply(previousFakeBridgeApply);
    }
  });

  it("requests permission before applying Signal unread-window reads", async () => {
    const previousFakeBridgeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
    process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";

    try {
      const { registeredTools, permissionRequests } = await createSignalUnreadWindowHarness();
      const unreadApply = toolByName(registeredTools, "ambient_messaging_signal_unread_window_apply");
      const denied = await unreadApply.execute("signal-unread-apply", signalUnreadWindowParams());

      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_signal_unread_window_apply",
        title: "Read Signal unread window?",
        message: "Read up to 5 unread Signal message(s) from the reviewed fake bridge for binding signal-binding-1.",
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: "signal-unread-window:signal-binding-1",
        grantTargetIdentity: "signal-cli:signal-binding-1:signal-owner:signal-chat-1:5",
        allowedReason: "User approved bounded fake Signal unread-window read.",
        deniedReason: "User denied Signal unread-window read.",
      });
      expect(permissionRequests[0]!.detail).toContain("Would return provider message bodies to Pi: no");
      expect(denied.content[0].text).toContain("Apply status: denied");
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_unread_window_apply",
        status: "denied",
        unreadWindowStatus: "denied",
        previewStatus: "ready",
        providerId: "signal-cli",
        canApplyNow: true,
        contractReady: true,
        previewOnly: false,
        fakeBridgeApplyEnabled: true,
        bindingId: "signal-binding-1",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
        applyStatus: "denied",
        approvalRequested: true,
        approvalRecorded: false,
        polled: false,
        fetchedMessageCount: 0,
        candidateMessageCount: 0,
        duplicateMessageCount: 0,
        skippedMessageCount: 0,
        acceptedDispatchCount: 0,
        droppedDispatchCount: 0,
        dispatches: [],
        failureHint: "The user denied the bounded Signal unread-window read. No Signal unread messages were read.",
        safety: {
          readsProviderUnreadMessages: true,
          returnsProviderMessageBodiesToPi: false,
          routesRemoteAmbientSurface: true,
          writesDedupeState: true,
          startsBridge: false,
          sendsProviderMessages: false,
          mutatesBindings: false,
        },
      });
    } finally {
      restoreFakeBridgeApply(previousFakeBridgeApply);
    }
  });

  it("requests permission before applying real Signal unread-window reads", async () => {
    const { registeredTools, permissionRequests } = await createSignalUnreadWindowHarness();
    const realUnreadApply = toolByName(registeredTools, "ambient_messaging_signal_real_unread_window_apply");
    const denied = await realUnreadApply.execute("signal-real-unread-apply", signalUnreadWindowParams());

    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_signal_real_unread_window_apply",
      title: "Read real Signal unread window?",
      message: "Read up to 5 unread Signal message(s) from the reviewed real bridge for binding signal-binding-1.",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantTargetLabel: "signal-real-unread-window:signal-binding-1",
      grantTargetIdentity: "signal-cli:signal-binding-1:signal-owner:signal-chat-1:5",
      allowedReason: "User approved bounded real Signal unread single-read.",
      deniedReason: "User denied real Signal unread single-read.",
    });
    expect(permissionRequests[0]!.detail).toContain("Would return provider message bodies to Pi: no");
    expect(denied.content[0].text).toContain("Signal real unread-window apply: denied");
    expect(denied.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_real_unread_window_apply",
      status: "denied",
      realUnreadWindowStatus: "denied",
      previewStatus: "ready",
      providerId: "signal-cli",
      canApplyNow: true,
      previewOnly: false,
      approvalRequired: true,
      applyToolName: "ambient_messaging_signal_real_unread_window_apply",
      realBridgeUnreadEnabled: true,
      bindingId: "signal-binding-1",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      limit: 5,
      statePath: "/tmp/ambient-state/messaging-gateway/signal-unread-window-state.json",
      applyStatus: "denied",
      approvalRequested: true,
      approvalRecorded: false,
      polled: false,
      fetchedMessageCount: 0,
      candidateMessageCount: 0,
      duplicateMessageCount: 0,
      skippedMessageCount: 0,
      acceptedDispatchCount: 0,
      droppedDispatchCount: 0,
      dispatches: [],
      failureHint: "The user denied the real bounded Signal unread single-read. No Signal unread messages were read.",
      safety: {
        requestsApproval: true,
        contactsBridgeUnreadEndpoint: true,
        readsProviderUnreadMessages: true,
        returnsProviderMessageBodiesToPi: false,
        routesRemoteAmbientSurface: true,
        writesDedupeState: true,
        startsBridge: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
      },
    });
  });
});

async function createSignalUnreadWindowHarness(): Promise<{
  registeredTools: RegisteredTool[];
  permissionRequests: SignalUnreadWindowToolPermissionRequest[];
}> {
  const providers = createDefaultMessagingProviderRegistry();
  const bindings = createEmptyMessagingBindingRegistry(providers);
  bindings.add({
    id: "signal-binding-1",
    providerId: "signal-cli",
    authProfileId: "signal-owner",
    conversationId: "signal-chat-1",
    purpose: "remote_ambient_surface",
    status: "active",
    ownerUserId: "owner-1",
    ambientSurface: "chat",
    maxDisclosureLabel: "owner-private-runtime-summary",
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:01.000Z",
    metadata: {
      setupTool: "ambient_messaging_signal_remote_surface_apply",
      setupShape: "signal-owner-remote-ambient-surface",
      ownerHandoffSourceMessageId: "handoff-message-1",
      initialSeenMessageIds: ["handoff-message-1"],
    },
  });
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
          approvedReplySend: false,
        },
        authNeeded: false,
        apiCredentialsPresent: false,
        persistedSessionCount: 1,
        checkedAt: "2026-05-16T00:00:01.000Z",
        message: "Signal bridge contract readiness is present.",
        diagnostics: [
          "Signal bridge root contract accepted.",
          "Signal bridge profile status contract accepted.",
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
  const registeredTools: RegisteredTool[] = [];
  const permissionRequests: SignalUnreadWindowToolPermissionRequest[] = [];

  await gatewayRunner.refreshProviderReadiness("signal-cli");

  registerSignalUnreadWindowTools({
    registerTool: (tool: any) => registeredTools.push(tool),
  }, {
    threadId: "thread-1",
    workspace: {
      name: "AmbientDesktop",
      path: "/workspace",
      statePath: "/tmp/ambient-state",
      sessionPath: "/tmp/ambient-state/sessions",
    } as any,
    getThread: (threadId) => ({ id: threadId, title: "Thread 1" }) as any,
    resolveFirstPartyPluginPermission: async (request) => {
      permissionRequests.push(request);
      return false;
    },
    runtimeSurfaceSnapshot: () => undefined,
    bindings,
    gatewayRunner,
  });

  return { registeredTools, permissionRequests };
}

function signalUnreadWindowParams() {
  return {
    providerId: " signal-cli ",
    bindingId: " signal-binding-1 ",
    profileId: " signal-owner ",
    conversationId: " signal-chat-1 ",
    limit: 5,
  };
}

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}

function restoreFakeBridgeApply(previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
  } else {
    process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = previousValue;
  }
}
