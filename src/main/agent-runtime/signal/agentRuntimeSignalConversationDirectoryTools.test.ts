import { describe, expect, it } from "vitest";

import {
  registerSignalConversationDirectoryTools,
  type SignalConversationDirectoryToolPermissionRequest,
} from "./agentRuntimeSignalConversationDirectoryTools";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";

describe("registerSignalConversationDirectoryTools", () => {
  it("registers and executes the Signal conversation directory preview and denied apply tools", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-16T00:00:05.000Z"),
      readinessProbes: {
        "signal-cli": async () => ({
          providerId: "signal-cli",
          status: "unavailable",
          configured: true,
          bridgeReachable: true,
          bridgeCapabilities: {
            profileStatus: true,
            metadataOnlyConversationDirectory: true,
            boundedUnreadWindow: false,
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
    const permissionRequests: SignalConversationDirectoryToolPermissionRequest[] = [];

    await gatewayRunner.refreshProviderReadiness("signal-cli");

    registerSignalConversationDirectoryTools({
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
      registry: providers,
      gatewayRunner,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_signal_conversation_directory_preview",
      "ambient_messaging_signal_conversation_directory_apply",
    ]);

    const directoryPreview = toolByName(registeredTools, "ambient_messaging_signal_conversation_directory_preview");
    const result = await directoryPreview.execute("signal-directory-preview", {
      providerId: " signal-cli ",
      profileId: " signal-owner ",
      purpose: "remote_ambient_surface",
      query: "ops",
      limit: 5,
    });
    expect(result.content[0].text).toContain("Signal conversation directory preview: ready");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_conversation_directory_preview",
      status: "ready",
      directoryStatus: "ready",
      providerId: "signal-cli",
      providerLabel: "Signal",
      implementationStatus: "planned",
      purpose: "remote_ambient_surface",
      purposeSupported: true,
      profileId: "signal-owner",
      query: "ops",
      limit: 5,
      canApplyNow: true,
      approvalRequired: true,
      endpointPath: "/profiles/signal-owner/conversations?metadataOnly=true&limit=5&query=ops",
      providerDirectoryTool: "ambient_messaging_signal_conversation_directory_preview",
      providerDirectoryApplyTool: "ambient_messaging_signal_conversation_directory_apply",
      readinessStatus: "unavailable",
      configured: true,
      bridgeReachable: true,
      bridgeCapabilities: {
        profileStatus: true,
        metadataOnlyConversationDirectory: true,
        boundedUnreadWindow: false,
        approvedReplySend: false,
      },
      readinessDiagnostics: [
        "Signal bridge root contract accepted.",
        "Signal bridge profile status contract accepted.",
      ],
      knownAuthProfiles: [{
        profileId: "signal-owner",
        metadataReadable: true,
        signalCliConfigDirPresent: true,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
      }],
      blockers: [],
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
        runsProviderCli: false,
        inspectsSignalDesktop: false,
        readsProviderConversationMetadata: true,
        returnsProviderMessageContent: false,
      },
      messagingConversationDirectorySetup: {
        providerLabel: "Signal",
        directoryStatus: "ready",
        canApplyNow: true,
      },
      adapterExecution: {
        kind: "messaging-conversation-directory-adapter-execution",
        providerId: "signal-cli",
        executionStatus: "preview",
        approvalRecorded: false,
        fetchedConversationCount: 0,
        returnedConversationCount: 0,
      },
    });
    expect(result.details.warnings).toEqual(expect.arrayContaining([
      "Signal Desktop being installed locally is not a supported provider runtime signal.",
    ]));

    const directoryApply = toolByName(registeredTools, "ambient_messaging_signal_conversation_directory_apply");
    const denied = await directoryApply.execute("signal-directory-apply", {
      providerId: " signal-cli ",
      profileId: " signal-owner ",
      purpose: "remote_ambient_surface",
      query: "ops",
      limit: 5,
    });
    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_signal_conversation_directory_apply",
      title: "Read Signal conversation directory metadata?",
      message: "Read up to 5 Signal conversation metadata row(s) from the reviewed local bridge for profile signal-owner.",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantTargetLabel: "signal-directory:signal-owner",
      grantTargetIdentity: "signal-cli:signal-owner:5:ops",
      allowedReason: "User approved bounded Signal conversation directory metadata read.",
      deniedReason: "User denied Signal conversation directory metadata read.",
    });
    expect(permissionRequests[0]!.detail).toContain("Signal message history is not read");
    expect(denied.content[0].text).toContain("Signal conversation directory result: denied");
    expect(denied.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_conversation_directory_apply",
      status: "denied",
      directoryStatus: "ready",
      providerId: "signal-cli",
      applyStatus: "denied",
      approvalRecorded: false,
      failureMode: "permission-denied",
      fetchedConversationCount: 0,
      returnedConversationCount: 0,
      conversations: [],
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
        runsProviderCli: false,
        inspectsSignalDesktop: false,
        readsProviderConversationMetadata: false,
        returnsProviderMessageContent: false,
      },
      messagingConversationDirectorySetup: {
        providerLabel: "Signal",
        directoryStatus: "ready",
        canApplyNow: true,
      },
      adapterExecution: {
        kind: "messaging-conversation-directory-adapter-execution",
        providerId: "signal-cli",
        executionStatus: "denied",
        approvalRecorded: false,
        fetchedConversationCount: 0,
        returnedConversationCount: 0,
        failureMode: "permission-denied",
      },
    });
  });
});

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
