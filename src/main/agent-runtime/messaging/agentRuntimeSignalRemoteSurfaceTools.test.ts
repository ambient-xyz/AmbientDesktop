import { describe, expect, it } from "vitest";

import {
  createSignalRemoteSurfacePlanResolvers,
  registerSignalRemoteSurfaceTools,
  type SignalRemoteSurfaceToolPermissionRequest,
} from "./agentRuntimeSignalRemoteSurfaceTools";
import { createEmptyMessagingBindingRegistry } from "../../messaging/messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";

describe("registerSignalRemoteSurfaceTools", () => {
  it("registers and executes the Signal remote surface preview tool", async () => {
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
    const permissionRequests: SignalRemoteSurfaceToolPermissionRequest[] = [];

    await gatewayRunner.refreshProviderReadiness("signal-cli");
    const signalRemoteSurface = createSignalRemoteSurfacePlanResolvers({
      bindings,
      gatewayRunner,
      signalDescriptor: () => providers.get("signal-cli")?.descriptor,
      now: () => new Date("2026-05-16T00:00:10.000Z"),
    });

    registerSignalRemoteSurfaceTools({
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
      bindings: {
        create: () => {
          throw new Error("create should not be called when permission is denied.");
        },
        revoke: () => {
          throw new Error("revoke should not be called when permission is denied.");
        },
      },
      createPlanForParams: signalRemoteSurface.createPlanForParams,
      revokePlanForParams: signalRemoteSurface.revokePlanForParams,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_signal_remote_surface_preview",
      "ambient_messaging_signal_remote_surface_apply",
    ]);

    const createParams = {
      providerId: " signal-cli ",
      profileId: " signal-owner ",
      conversationId: " signal-chat-1 ",
      ownerUserId: " signal-owner-sender ",
      ownerHandoffSourceMessageId: " seen-1 ",
      initialSeenMessageIds: [" seen-1 ", " seen-2 "],
      ambientSurface: "projects",
      maxDisclosureLabel: " owner-private-runtime-summary ",
      limit: 5,
    };
    const result = await toolByName(registeredTools, "ambient_messaging_signal_remote_surface_preview").execute("signal-remote-surface-preview", createParams);
    expect(result.content[0].text).toContain("Signal Remote Ambient Surface binding preview ready");
    expect(result.content[0].text).toContain("Generic binding apply allowed: no");
    expect(result.content[0].text).toContain("Owner handoff source message: seen-1");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_remote_surface_preview",
      status: "ready",
      bindingSetupStatus: "ready",
      providerId: "signal-cli",
      providerLabel: "Signal",
      action: "create",
      canApplyNow: true,
      previewOnly: false,
      typedPreviewTool: "ambient_messaging_signal_remote_surface_preview",
      typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
      genericBindingApplyAllowed: false,
      telegramOwnerHandoffAllowed: false,
      providerImplementationStatus: "planned",
      purposeSupported: true,
      bindingLifecycleEnabled: true,
      runtimeLifecycleEnabled: false,
      inboundIngestionEnabled: false,
      outboundReplyEnabled: true,
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "signal-owner-sender",
      ownerHandoffSourceMessageId: "seen-1",
      initialSeenMessageIds: ["seen-1", "seen-2"],
      initialSeenMessageCount: 2,
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      limit: 5,
      futureUnreadEndpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      readinessStatus: "available",
      configured: true,
      bridgeReachable: true,
      futureBinding: {
        providerId: "signal-cli",
        authProfileId: "signal-owner",
        conversationId: "signal-chat-1",
        purpose: "remote_ambient_surface",
        status: "active",
        ownerUserId: "signal-owner-sender",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        createdAt: "2026-05-16T00:00:10.000Z",
        updatedAt: "2026-05-16T00:00:10.000Z",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "seen-1",
          initialSeenMessageIds: ["seen-1", "seen-2"],
        },
      },
      gates: {
        ownerHandoffMetadataAccepted: true,
        profileSelected: true,
        conversationSelected: true,
        bridgeReadableProfile: true,
        metadataOnlyDirectoryReady: true,
        boundedUnreadContractAvailable: true,
        bindingLifecycleAvailable: true,
        runtimeLifecycleAvailable: false,
        inboundIngestionAvailable: false,
        outboundReplyAvailable: true,
      },
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsUnreadWindow: false,
        sendsProviderMessages: false,
        mutatesBindings: true,
        persistsBinding: true,
        usesTelegramOwnerHandoff: false,
        usesGenericBindingApply: false,
      },
    });
    expect(result.details.blockers).toEqual([]);
    expect(result.details.existingBindings).toEqual([]);

    const denied = await toolByName(registeredTools, "ambient_messaging_signal_remote_surface_apply").execute("signal-remote-surface-apply", createParams);
    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_signal_remote_surface_apply",
      title: "Create Signal Remote Ambient Surface binding?",
      message: "Create a Signal Remote Ambient Surface binding for signal-chat-1.",
      risk: "plugin-tool",
      reusableScopes: ["thread", "project", "workspace"],
      grantTargetLabel: "ambient-messaging-signal-remote-surface:signal-owner:signal-chat-1",
      grantTargetIdentity: `signal-cli:signal-owner:signal-chat-1:${denied.details.futureBinding.id}`,
      allowedReason: "User approved Signal Remote Ambient Surface binding metadata persistence.",
      deniedReason: "User denied Signal Remote Ambient Surface binding metadata persistence.",
    });
    expect(permissionRequests[0]!.detail).toContain("This persists binding metadata only.");
    expect(denied.content[0].text).toContain("Signal Remote Ambient Surface binding denied");
    expect(denied.content[0].text).toContain("Approval requested: yes");
    expect(denied.content[0].text).toContain("Persisted: no");
    expect(denied.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_remote_surface_apply",
      status: "denied",
      bindingSetupStatus: "ready",
      providerId: "signal-cli",
      action: "create",
      canApplyNow: true,
      previewOnly: false,
      applyStatus: "denied",
      approvalRequested: true,
      approvalRecorded: false,
      persisted: false,
      canFeedFutureBindingLifecycle: false,
      bindingApplyInputReady: true,
      failureMode: "approval-denied",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "signal-owner-sender",
      ownerHandoffSourceMessageId: "seen-1",
      initialSeenMessageIds: ["seen-1", "seen-2"],
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsUnreadWindow: false,
        sendsProviderMessages: false,
        mutatesBindings: true,
        persistsBinding: true,
        usesTelegramOwnerHandoff: false,
        usesGenericBindingApply: false,
      },
    });
    expect(bindings.list({ includeInactive: true }).bindings).toEqual([]);
  });
});

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
