import { describe, expect, it } from "vitest";

import { registerSignalBridgeReplyTools } from "./agentRuntimeSignalBridgeReplyTools";
import {
  createSignalBridgeReplyResolvers,
  signalBridgeReplyApprovalRequest,
} from "./agentRuntimeSignalBridgeReplyPlan";
import { createEmptyMessagingBindingRegistry } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";

describe("registerSignalBridgeReplyTools", () => {
  it("registers and executes the Signal bridge reply tools", async () => {
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
            approvedReplySend: true,
          },
          authNeeded: false,
          apiCredentialsPresent: false,
          persistedSessionCount: 1,
          checkedAt: "2026-05-16T00:00:01.000Z",
          message: "Signal bridge contract readiness is present.",
          diagnostics: [
            "Signal bridge root contract accepted.",
            "Signal bridge approved reply send contract accepted.",
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
    const approvalRequests: unknown[] = [];
    const thread = { id: "thread-1", title: "Thread 1" } as any;
    const workspace = { name: "AmbientDesktop", path: "/workspace", statePath: "/workspace/.ambient" } as any;

    await gatewayRunner.refreshProviderReadiness("signal-cli");

    let readinessRefreshCount = 0;
    let runtimeStatusReadCount = 0;
    let descriptorReadCount = 0;
    const signalBridgeReply = createSignalBridgeReplyResolvers({
      bindings,
      refreshProviderReadiness: (providerId) => {
        readinessRefreshCount += 1;
        return gatewayRunner.refreshProviderReadiness(providerId);
      },
      gatewayRuntimeStatus: () => {
        runtimeStatusReadCount += 1;
        return gatewayRunner.runtimeStatus();
      },
      signalDescriptor: () => {
        descriptorReadCount += 1;
        return providers.get("signal-cli")?.descriptor;
      },
      requestApproval: async (preview) => {
        approvalRequests.push(signalBridgeReplyApprovalRequest({ preview, thread, workspace }));
        return false;
      },
      now: () => new Date("2026-05-16T00:00:10.000Z"),
    });

    registerSignalBridgeReplyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      previewForParams: signalBridgeReply.previewForParams,
      applyForParams: signalBridgeReply.applyForParams,
      gatewayRuntimeStatus: () => gatewayRunner.runtimeStatus(),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_signal_bridge_reply_preview",
      "ambient_messaging_signal_bridge_reply_apply",
    ]);

    const result = await registeredTools[0]!.execute("signal-bridge-reply-preview", {
      providerId: " signal-cli ",
      bindingId: " signal-binding-1 ",
      profileId: " signal-owner ",
      conversationId: " signal-chat-1 ",
      replyToMessageId: " message-1 ",
      text: " status update ",
    });
    expect(result.content[0].text).toContain("Signal bridge reply preview");
    expect(result.content[0].text).toContain("Sends provider messages: yes");
    expect(result.content[0].text).toContain("Bridge approvedReplySend capability: yes");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_bridge_reply_preview",
      status: "ready",
      replyStatus: "ready",
      providerId: "signal-cli",
      canApplyNow: true,
      previewOnly: true,
      approvalRequired: true,
      futureApprovalRequired: false,
      applyToolName: "ambient_messaging_signal_bridge_reply_apply",
      bindingId: "signal-binding-1",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "owner-1",
      replyToMessageId: "message-1",
      endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/send",
      text: "status update",
      textLength: 13,
      safety: {
        requestsApproval: true,
        sendsProviderMessages: true,
        readsProviderMessages: false,
        usesReviewedBridgeSendContract: true,
      },
    });
    expect(result.details.blockers).toEqual([]);
    expect(result.details.repairSteps).toEqual([]);

    const denied = await toolByName(registeredTools, "ambient_messaging_signal_bridge_reply_apply").execute("signal-bridge-reply-apply", {
      providerId: " signal-cli ",
      bindingId: " signal-binding-1 ",
      profileId: " signal-owner ",
      conversationId: " signal-chat-1 ",
      replyToMessageId: " message-1 ",
      text: " status update ",
    });
    expect(denied.content[0].text).toContain("Signal bridge reply preview");
    expect(denied.content[0].text).toContain("Apply status: denied");
    expect(denied.content[0].text).toContain("Sent: no");
    expect(approvalRequests).toEqual([expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_messaging_signal_bridge_reply_apply",
      title: "Send Signal reply?",
      message: "Send one Signal reply through the reviewed bridge for binding signal-binding-1.",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantTargetLabel: "signal-bridge-reply:signal-binding-1",
      grantTargetIdentity: "signal-cli:signal-binding-1:signal-owner:signal-chat-1:message-1:13:status update",
      allowedReason: "User approved Signal bridge reply send.",
      deniedReason: "User denied Signal bridge reply send.",
    })]);
    expect(readinessRefreshCount).toBe(2);
    expect(runtimeStatusReadCount).toBe(2);
    expect(descriptorReadCount).toBe(2);
    expect(denied.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_bridge_reply_apply",
      status: "denied",
      replyStatus: "ready",
      providerId: "signal-cli",
      applyStatus: "denied",
      approvalRequested: true,
      approvalRecorded: false,
      sent: false,
      canApplyNow: true,
      bindingId: "signal-binding-1",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "owner-1",
      replyToMessageId: "message-1",
      text: "status update",
      delivery: {
        status: "denied",
        sentAt: "2026-05-16T00:00:10.000Z",
        error: "User denied Signal reply send.",
      },
      gatewayRuntimeStatus: {
        status: "idle",
        providerCount: 2,
        queuedProjectionCount: 0,
        outboundDeliveryCount: 0,
      },
    });
  });
});

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
