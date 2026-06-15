import { describe, expect, it } from "vitest";

import type {
  MessagingGatewayLifecycleApplyResult,
  MessagingGatewayLifecyclePreview,
  MessagingGatewayRuntimeStatus,
} from "../shared/messagingGateway";
import type { ThreadSummary, WorkspaceState } from "../shared/types";
import {
  registerMessagingGatewayLifecycleApplyTools,
  type MessagingGatewayLifecycleApplyInput,
  type MessagingGatewayLifecycleApplyToolPermissionRequest,
} from "./agentRuntimeMessagingGatewayLifecycleApplyTools";
import type { MessagingGatewayLifecyclePreviewInput } from "./agentRuntimeMessagingGatewayLifecyclePreviewTools";
import { createMessagingGatewayLifecycleResolvers } from "./agentRuntimeMessagingGatewayLifecycleResolvers";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerMessagingGatewayLifecycleApplyTools", () => {
  it("returns blocked without approval or apply when real lifecycle readiness is blocked", async () => {
    const registeredTools: RegisteredTool[] = [];
    const refreshCalls: string[] = [];
    const previewInputs: MessagingGatewayLifecyclePreviewInput[] = [];
    const permissionRequests: MessagingGatewayLifecycleApplyToolPermissionRequest[] = [];
    const applyInputs: MessagingGatewayLifecycleApplyInput[] = [];
    const preview = lifecyclePreview({
      mode: "real",
      approvalRequired: true,
      canApplyNow: false,
    });
    const gatewayLifecycle = createTestLifecycleResolvers({
      refreshProviderReadiness: async (providerId) => {
        refreshCalls.push(providerId);
      },
      previewLifecycle: (input) => {
        previewInputs.push(input);
        return preview;
      },
      applyLifecycle: async (input) => {
        applyInputs.push(input);
        return lifecycleApplyResult(preview);
      },
    });

    registerMessagingGatewayLifecycleApplyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      threadId: "thread-1",
      workspace: workspace(),
      getThread: thread,
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
      refreshProviderReadiness: gatewayLifecycle.refreshProviderReadiness,
      previewLifecycle: gatewayLifecycle.previewLifecycle,
      applyLifecycle: gatewayLifecycle.applyLifecycle,
    });

    const tool = registeredTools[0]!;
    expect(registeredTools.map((registeredTool) => registeredTool.name)).toEqual([
      "ambient_messaging_gateway_lifecycle_apply",
    ]);
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("blocked-real-lifecycle", {
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });

    expect(refreshCalls).toEqual(["telegram-tdlib"]);
    expect(previewInputs).toEqual([{ action: "start", providerId: "telegram-tdlib", mode: "real" }]);
    expect(permissionRequests).toEqual([]);
    expect(applyInputs).toEqual([]);
    expect(result.content[0].text).toContain("Messaging gateway lifecycle change was not applied because readiness or process-supervision blockers remain.");
    expect(result.content[0].text).toContain("Ambient messaging gateway lifecycle start preview");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_gateway_lifecycle_apply",
      status: "blocked",
      blockedReason: "Readiness or process-supervision blockers remain.",
      providerId: "telegram-tdlib",
      mode: "real",
    });
  });

  it("returns denied when approval is required and refused", async () => {
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: MessagingGatewayLifecycleApplyToolPermissionRequest[] = [];
    const applyInputs: MessagingGatewayLifecycleApplyInput[] = [];
    const preview = lifecyclePreview({
      approvalRequired: true,
      canApplyNow: true,
      readiness: {
        checkedAt: "2026-05-30T00:00:00.000Z",
        providerId: "telegram-tdlib",
        status: "available",
        configured: true,
        apiCredentialsPresent: true,
        bridgeReachable: true,
        authNeeded: false,
        persistedSessionCount: 1,
        message: "ready",
        diagnostics: [],
        sessions: [],
      },
    });
    const gatewayLifecycle = createTestLifecycleResolvers({
      previewLifecycle: () => preview,
      applyLifecycle: async (input) => {
        applyInputs.push(input);
        return lifecycleApplyResult(preview);
      },
    });

    registerMessagingGatewayLifecycleApplyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      threadId: "thread-1",
      workspace: workspace(),
      getThread: thread,
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return false;
      },
      refreshProviderReadiness: gatewayLifecycle.refreshProviderReadiness,
      previewLifecycle: gatewayLifecycle.previewLifecycle,
      applyLifecycle: gatewayLifecycle.applyLifecycle,
    });

    const result = await registeredTools[0]!.execute("denied-real-lifecycle", {
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });

    expect(applyInputs).toEqual([]);
    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/tmp/workspace" },
      toolName: "ambient_messaging_gateway_lifecycle_apply",
      title: "Start Telegram messaging gateway?",
      message: "Start Telegram gateway lifecycle in real mode.",
      risk: "plugin-tool",
      reusableScopes: ["thread", "project", "workspace"],
      grantTargetLabel: "ambient-messaging-gateway:telegram-tdlib:start:real",
      grantTargetIdentity: "telegram-tdlib:start:real:2026-05-30T00:00:00.000Z",
      allowedReason: "User approved messaging gateway lifecycle apply.",
      deniedReason: "User denied messaging gateway lifecycle apply.",
    });
    expect(permissionRequests[0]!.detail).toContain("Provider: Telegram (telegram-tdlib)");
    expect(permissionRequests[0]!.detail).toContain("Current slice does not ingest provider messages or send provider messages.");
    expect(result.content[0].text).toContain("Messaging gateway lifecycle change was not applied because approval was denied.");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_gateway_lifecycle_apply",
      status: "denied",
      providerId: "telegram-tdlib",
      mode: "real",
    });
  });

  it("applies lifecycle with approval state from the preview", async () => {
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: MessagingGatewayLifecycleApplyToolPermissionRequest[] = [];
    const applyInputs: MessagingGatewayLifecycleApplyInput[] = [];
    const preview = lifecyclePreview({
      approvalRequired: true,
      canApplyNow: true,
    });
    const applyResult = lifecycleApplyResult(preview);
    const gatewayLifecycle = createTestLifecycleResolvers({
      previewLifecycle: () => preview,
      applyLifecycle: async (input) => {
        applyInputs.push(input);
        return applyResult;
      },
    });

    registerMessagingGatewayLifecycleApplyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      threadId: "thread-1",
      workspace: workspace(),
      getThread: thread,
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
      refreshProviderReadiness: gatewayLifecycle.refreshProviderReadiness,
      previewLifecycle: gatewayLifecycle.previewLifecycle,
      applyLifecycle: gatewayLifecycle.applyLifecycle,
    });

    const result = await registeredTools[0]!.execute("apply-real-lifecycle", {
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });

    expect(permissionRequests).toHaveLength(1);
    expect(applyInputs).toEqual([{
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    }]);
    expect(result.content[0].text).toContain("Ambient messaging gateway lifecycle start apply");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_gateway_lifecycle_apply",
      status: "applied",
      applyStatus: "applied",
      applied: true,
      approvalRecorded: true,
    });
  });
});

function createTestLifecycleResolvers(overrides: Partial<Parameters<typeof createMessagingGatewayLifecycleResolvers>[0]> = {}) {
  return createMessagingGatewayLifecycleResolvers({
    refreshProviderReadiness: async () => undefined,
    previewLifecycle: () => lifecyclePreview(),
    applyLifecycle: async (input) => lifecycleApplyResult(lifecyclePreview({
      approvalRequired: input.approvalRecorded,
    })),
    ...overrides,
  });
}

function lifecyclePreview(overrides: Partial<MessagingGatewayLifecyclePreview> = {}): MessagingGatewayLifecyclePreview {
  return {
    action: "start",
    providerId: "telegram-tdlib",
    label: "Telegram",
    mode: "real",
    approvalRequired: true,
    canApplyNow: true,
    wouldStartRealBridge: true,
    wouldStopRealBridge: false,
    wouldAttachExistingBridge: true,
    wouldLaunchBridgeProcess: false,
    wouldStopBridgeProcess: false,
    wouldDetachRunnerOnly: false,
    wouldReadProviderMessages: false,
    wouldSendProviderMessages: false,
    policyNotes: ["Real provider bridge startup must be approval-gated."],
    nextSteps: ["Show the user provider consequences before approval."],
    ...overrides,
  };
}

function lifecycleApplyResult(preview: MessagingGatewayLifecyclePreview): MessagingGatewayLifecycleApplyResult {
  return {
    ...preview,
    applyStatus: "applied",
    applied: true,
    approvalRecorded: preview.approvalRequired,
    runtimeStatus: runtimeStatus(),
  };
}

function runtimeStatus(): MessagingGatewayRuntimeStatus {
  return {
    status: "idle",
    providerCount: 1,
    activeProviderCount: 1,
    syntheticActiveProviderCount: 0,
    queuedProjectionCount: 0,
    recentEventCount: 0,
    outboundDeliveryCount: 0,
    providers: [],
    queuedProjections: [],
    recentOutboundDeliveries: [],
    recentEvents: [],
  };
}

function thread(threadId: string): ThreadSummary {
  return {
    id: threadId,
    title: "Thread",
    workspacePath: "/tmp/workspace",
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "test-model",
    thinkingLevel: "medium",
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}
