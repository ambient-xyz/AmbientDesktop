import { describe, expect, it } from "vitest";

import {
  registerSignalRealPollingTools,
  type SignalRealPollingToolPermissionRequest,
} from "./agentRuntimeSignalRealPollingTools";
import { createEmptyMessagingBindingRegistry } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import { SignalRealPollingRunner } from "./signalRealPolling";

describe("registerSignalRealPollingTools", () => {
  it("registers and executes the Signal real polling status tool", async () => {
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
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const permissionRequests: SignalRealPollingToolPermissionRequest[] = [];

    await gatewayRunner.refreshProviderReadiness("signal-cli");

    registerSignalRealPollingTools({
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
      signalRealPollingRunner: new SignalRealPollingRunner(),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_signal_real_polling_status",
      "ambient_messaging_signal_real_polling_preview",
      "ambient_messaging_signal_real_polling_apply",
    ]);

    const result = await registeredTools[0]!.execute("signal-real-polling-status", {
      providerId: " signal-cli ",
      limit: 5,
      intervalMs: 45_000,
    });
    expect(result.content[0].text).toContain("Signal real polling runner status");
    expect(result.content[0].text).toContain("Background loop implemented: yes");
    expect(result.content[0].text).toContain("Real single-read ready bindings: 1");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_real_polling_status",
      status: "stopped",
      signalRealPolling: {
        providerId: "signal-cli",
        runnerState: "stopped",
        running: false,
        backgroundLoopImplemented: true,
        timersActive: false,
        selectedBindingCount: 1,
        realSingleReadReadyBindingCount: 1,
        limit: 10,
        intervalMs: 60_000,
        totalPollCount: 0,
        successfulPollCount: 0,
        failedPollCount: 0,
        fetchedMessageCount: 0,
        candidateMessageCount: 0,
        acceptedDispatchCount: 0,
        droppedDispatchCount: 0,
        duplicateMessageCount: 0,
        skippedMessageCount: 0,
        selectedBindings: [{
          bindingId: "signal-binding-1",
          profileId: "signal-owner",
          conversationId: "signal-chat-1",
          ownerUserId: "owner-1",
          ambientSurface: "chat",
          maxDisclosureLabel: "owner-private-runtime-summary",
          realSingleReadReady: true,
          blockers: [],
        }],
        warnings: ["Signal real polling is stopped. Start requires explicit approval for one exact active owner binding."],
      },
    });

    const preview = await toolByName(registeredTools, "ambient_messaging_signal_real_polling_preview").execute("signal-real-polling-preview", {
      action: "start",
      providerId: " signal-cli ",
      bindingId: " signal-binding-1 ",
      profileId: " signal-owner ",
      conversationId: " signal-chat-1 ",
      limit: 5,
      intervalMs: 45_000,
    });
    expect(preview.content[0].text).toContain("Signal real polling start preview");
    expect(preview.content[0].text).toContain("Starts timer: yes");
    expect(preview.content[0].text).toContain("Reads provider unread messages: yes");
    expect(preview.content[0].text).toContain("Signal real unread-window preview: ready");
    expect(preview.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_real_polling_preview",
      status: "ready",
      signalRealPollingStatus: "ready",
      providerId: "signal-cli",
      runnerState: "stopped",
      running: false,
      backgroundLoopImplemented: true,
      timersActive: false,
      bindingId: "signal-binding-1",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      selectedBindingCount: 1,
      realSingleReadReadyBindingCount: 1,
      limit: 5,
      intervalMs: 45_000,
      action: "start",
      canApplyNow: true,
      previewOnly: true,
      approvalRequired: true,
      applyToolName: "ambient_messaging_signal_real_polling_apply",
      blockers: [],
      safety: {
        requestsApproval: true,
        startsTimer: true,
        stopsTimer: false,
        contactsBridgeUnreadEndpoint: true,
        readsProviderUnreadMessages: true,
        routesRemoteAmbientSurface: true,
        writesDedupeState: true,
        sendsProviderMessages: false,
        mutatesBindings: false,
        usesReviewedSingleReadCore: true,
      },
      singleReadPreview: {
        status: "ready",
        canApplyNow: true,
        applyToolName: "ambient_messaging_signal_real_unread_window_apply",
        realBridgeUnreadEnabled: true,
      },
    });

    const denied = await toolByName(registeredTools, "ambient_messaging_signal_real_polling_apply").execute("signal-real-polling-apply", {
      action: "start",
      providerId: " signal-cli ",
      bindingId: " signal-binding-1 ",
      profileId: " signal-owner ",
      conversationId: " signal-chat-1 ",
      limit: 5,
      intervalMs: 45_000,
    });
    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_signal_real_polling_apply",
      title: "Start Signal real polling?",
      message: "Start Signal polling every 45000ms for binding signal-binding-1.",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantTargetLabel: "signal-real-polling:signal-binding-1",
      grantTargetIdentity: "signal-cli:signal-binding-1:signal-owner:signal-chat-1:45000:5",
      allowedReason: "User approved Signal real polling.",
      deniedReason: "User denied Signal real polling.",
    });
    expect(permissionRequests[0]!.detail).toContain("Would perform one immediate poll: yes");
    expect(denied.content[0].text).toContain("Signal real polling start apply");
    expect(denied.content[0].text).toContain("Apply status: denied");
    expect(denied.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_real_polling_apply",
      status: "denied",
      signalRealPollingStatus: "denied",
      previewStatus: "ready",
      providerId: "signal-cli",
      runnerState: "stopped",
      running: false,
      backgroundLoopImplemented: true,
      timersActive: false,
      action: "start",
      canApplyNow: true,
      approvalRequired: true,
      applyStatus: "denied",
      approvalRecorded: false,
      startedTimer: false,
      stoppedTimer: false,
      immediatePollAttempted: false,
      bindingId: "signal-binding-1",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      limit: 10,
      intervalMs: 60_000,
    });
  });
});

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
