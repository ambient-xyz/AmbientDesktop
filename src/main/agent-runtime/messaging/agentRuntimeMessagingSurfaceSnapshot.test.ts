import { describe, expect, it } from "vitest";

import { createAgentRuntimeMessagingSurfaceSnapshot } from "./agentRuntimeMessagingSurfaceSnapshot";

describe("createAgentRuntimeMessagingSurfaceSnapshot", () => {
  it("builds the runtime surface snapshot from injected AgentRuntime sources", () => {
    let auditLimit: number | undefined;
    let voiceSettingsRead = false;
    const snapshot = createAgentRuntimeMessagingSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/tmp/ambient-state",
        sessionPath: "/tmp/ambient-state/sessions",
      },
      activeThreadId: "thread-1",
      gatewayStatus: () => ({ remoteSurfaceRelaySummaries: [{ providerId: "telegram-tdlib" } as any] }),
      listThreads: () => [
        {
          id: "thread-1",
          title: "Thread 1",
          updatedAt: "2026-05-17T00:00:00.000Z",
          permissionMode: "standard",
          collaborationMode: "agent",
          thinkingLevel: "medium",
          model: "ambient",
        } as any,
        {
          id: "thread-2",
          title: "Thread 2",
          updatedAt: "2026-05-16T00:00:00.000Z",
          permissionMode: "standard",
          collaborationMode: "planner",
          thinkingLevel: "low",
          model: "ambient",
        } as any,
      ],
      listWorkflowAgentFolders: () => [],
      readVoiceSettings: () => {
        voiceSettingsRead = true;
        return undefined;
      },
      listPermissionRequests: () => [{
        id: "approval-1",
        threadId: "thread-1",
        toolName: "ambient_messaging_remote_surface_command_apply",
        title: "Approve command?",
        message: "Approve command.",
        risk: "plugin-tool",
      } as any],
      listPermissionGrants: () => [],
      listPermissionAudit: (limit) => {
        auditLimit = limit;
        return [];
      },
      workflowRecoveryEvents: () => [],
      listProjects: () => [
        {
          id: "/workspace",
          name: "AmbientDesktop",
          path: "/workspace",
          statePath: "/tmp/ambient-state",
          sessionPath: "/tmp/ambient-state/sessions",
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
          pinned: true,
          threads: [],
        },
        {
          id: "/workspace-side",
          name: "sideProject",
          path: "/workspace-side",
          statePath: "/tmp/ambient-state-side",
          sessionPath: "/tmp/ambient-state-side/sessions",
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z",
          threads: [],
        },
      ],
    })(1);

    expect(voiceSettingsRead).toBe(true);
    expect(auditLimit).toBe(10);
    expect(snapshot).toMatchObject({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
      },
      activeChatId: "thread-1",
      projects: [{
        name: "AmbientDesktop",
        path: "/workspace",
        active: true,
      }],
      chats: [{
        id: "thread-1",
        title: "Thread 1",
        active: true,
      }],
      pendingApprovals: [{
        id: "approval-1",
        threadId: "thread-1",
        toolName: "ambient_messaging_remote_surface_command_apply",
      }],
      relaySummaries: [{ providerId: "telegram-tdlib" }],
      limits: {
        projectCount: 2,
        returnedProjectCount: 1,
        chatCount: 2,
        returnedChatCount: 1,
        pendingApprovalCount: 1,
        returnedPendingApprovalCount: 1,
        relaySummaryCount: 1,
        returnedRelaySummaryCount: 1,
      },
    });
  });
});
