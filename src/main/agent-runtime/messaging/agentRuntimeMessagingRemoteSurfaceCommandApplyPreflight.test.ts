import { describe, expect, it } from "vitest";

import {
  messagingRemoteSurfaceCommandApplyPermissionRequest,
  messagingRemoteSurfaceCommandApplyPreflight,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import { commandPreview, commandResult } from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools.testHelpers";

describe("Remote Ambient Surface command apply preflight", () => {
  it("builds Remote Ambient Surface command apply approval requests", () => {
    expect(
      messagingRemoteSurfaceCommandApplyPermissionRequest({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        preview: commandResult(),
      }),
    ).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_remote_surface_command_apply",
      title: "Apply Remote Ambient Surface command?",
      message: "Apply workflow_action from queued projection projection-ready.",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantTargetLabel: "remote-surface-command:projection-ready",
      grantTargetIdentity: "projection-ready:workflow_action:run workflow",
      allowedReason: "User approved Remote Ambient Surface command apply.",
      deniedReason: "User denied Remote Ambient Surface command apply.",
    });
  });

  it("returns a blocked apply response during preflight without requesting permission", async () => {
    const permissionRequests: unknown[] = [];
    let threadReads = 0;

    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview({
        status: "blocked",
        canApplyNow: false,
        blockers: ["Queued projection was not found in the messaging gateway runtime."],
      }),
      getThread: () => {
        threadReads += 1;
        return { id: "thread-1" };
      },
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    });

    expect(threadReads).toBe(0);
    expect(permissionRequests).toEqual([]);
    expect(preflight).toMatchObject({
      status: "blocked",
      approvalRecorded: false,
      response: {
        details: {
          status: "blocked",
          commandStatus: "blocked",
          queuedProjectionId: "projection-ready",
        },
      },
    });
  });

  it("skips permission during preflight when approval is not required", async () => {
    let threadReads = 0;
    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview({ approvalRequired: false }),
      getThread: () => {
        threadReads += 1;
        return { id: "thread-1" };
      },
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async () => {
        throw new Error("Permission should not be requested.");
      },
    });

    expect(threadReads).toBe(0);
    expect(preflight).toEqual({
      status: "ready",
      approvalRecorded: false,
    });
  });

  it("records approval during preflight when permission is allowed", async () => {
    const permissionRequests: unknown[] = [];
    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview(),
      getThread: () => ({ id: "thread-1" }),
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    });

    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_remote_surface_command_apply",
      grantTargetLabel: "remote-surface-command:projection-ready",
    });
    expect(preflight).toEqual({
      status: "ready",
      approvalRecorded: true,
    });
  });

  it("returns a denied apply response during preflight when permission is denied", async () => {
    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview(),
      getThread: () => ({ id: "thread-1" }),
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async () => false,
    });

    expect(preflight).toMatchObject({
      status: "denied",
      approvalRecorded: false,
      response: {
        details: {
          status: "denied",
          commandStatus: "ready",
          queuedProjectionId: "projection-ready",
        },
      },
    });
  });
});
