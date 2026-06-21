import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createMessagingRemoteSurfaceCommandPreviewResolver,
  messagingRemoteSurfaceCommandPreviewForParams,
} from "./agentRuntimeMessagingRemoteSurfaceCommandPreviewPlan";
import { registerMessagingRemoteSurfaceCommandPreviewTools } from "./agentRuntimeMessagingRemoteSurfaceCommandPreviewTools";
import { createMessagingBindingStore } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import type { MessagingRemoteSurfaceCommandPreview } from "../agentRuntimeMessagingFacade";
import { buildRuntimeSurfaceSnapshot } from "../../../shared/runtimeSurfaceSnapshot";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerMessagingRemoteSurfaceCommandPreviewTools", () => {
  it("registers and executes the Remote Ambient Surface command preview tool", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerMessagingRemoteSurfaceCommandPreviewTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      previewForParams: (params) => commandPreview((params as { queuedProjectionId: string }).queuedProjectionId),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_remote_surface_command_preview",
    ]);

    const tool = registeredTools[0]!;
    const ready = await tool.execute("remote-surface-command-preview-ready", {
      queuedProjectionId: "projection-ready",
    });
    expect(ready.content[0].text).toContain("Remote Ambient Surface command preview");
    expect(ready.content[0].text).toContain("Status: ready");
    expect(ready.content[0].text).toContain("Command kind: open_chat");
    expect(ready.content[0].text).toContain("Queued projection: projection-ready");
    expect(ready.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_command_preview",
      status: "ready",
      commandStatus: "ready",
      queuedProjectionId: "projection-ready",
      commandKind: "open_chat",
      canApplyNow: true,
    });

    const blocked = await tool.execute("remote-surface-command-preview-blocked", {
      queuedProjectionId: "projection-blocked",
    });
    expect(blocked.content[0].text).toContain("Status: blocked");
    expect(blocked.content[0].text).toContain("Blockers:");
    expect(blocked.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_command_preview",
      status: "blocked",
      commandStatus: "blocked",
      queuedProjectionId: "projection-blocked",
      blockers: ["Queued projection was not found in the messaging gateway runtime."],
    });
  });

  it("executes the Remote Ambient Surface command preview through the runtime helper", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-remote-command-preview-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-28T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-28T00:00:02.000Z"),
    });
    const registeredTools: RegisteredTool[] = [];
    const workspace = {
      name: "ambientCoder",
      path: "/workspace",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };
    const surface = buildRuntimeSurfaceSnapshot({
      workspace,
      threads: [{
        id: "thread-remote-triage",
        title: "Remote triage",
        updatedAt: "2026-05-28T00:00:01.000Z",
        permissionMode: "standard",
      } as any],
      workflowFolders: [],
      projects: [{
        name: "ambientCoder",
        path: "/workspace",
        updatedAt: "2026-05-28T00:00:00.000Z",
        pinned: true,
        threads: [],
      }],
    } as any);

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-user",
        ambientSurface: "chat",
        chatThreadId: "thread-remote-triage",
      });
      const dispatch = gatewayRunner.dispatchSynthetic({
        bindings: bindings.list({ includeInactive: false }),
        surface,
        event: {
          id: "event-open-chat",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          sender: { id: "owner-user" },
          text: "open chat Remote triage",
          receivedAt: "2026-05-28T00:00:02.000Z",
        },
      });

      let bindingReads = 0;
      let statusReads = 0;
      let surfaceReads = 0;
      const previewForParams = createMessagingRemoteSurfaceCommandPreviewResolver({
        bindings: {
          list: (input) => {
            bindingReads += 1;
            return bindings.list(input);
          },
        },
        gatewayRuntimeStatus: () => {
          statusReads += 1;
          return gatewayRunner.runtimeStatus();
        },
        runtimeSurfaceSnapshot: () => {
          surfaceReads += 1;
          return surface;
        },
      });

      registerMessagingRemoteSurfaceCommandPreviewTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        previewForParams,
      });

      const result = await registeredTools[0]!.execute("remote-surface-command-preview-helper", {
        queuedProjectionId: dispatch.queuedProjection.id,
      });

      expect(result.content[0].text).toContain("Remote Ambient Surface command preview");
      expect(result.content[0].text).toContain("Status: ready");
      expect(result.content[0].text).toContain("Command kind: open_chat");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_command_preview",
        status: "ready",
        commandStatus: "ready",
        queuedProjectionId: dispatch.queuedProjection.id,
        commandText: "open chat Remote triage",
        commandKind: "open_chat",
        canApplyNow: true,
        targetSurface: "chat",
        targetChat: {
          id: "thread-remote-triage",
          title: "Remote triage",
        },
      });
      expect(result.details.blockers).toEqual([]);
      expect(bindingReads).toBe(1);
      expect(statusReads).toBe(1);
      expect(surfaceReads).toBe(1);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

function commandPreview(queuedProjectionId: string): MessagingRemoteSurfaceCommandPreview {
  const blocked = queuedProjectionId === "projection-blocked";
  return {
    status: blocked ? "blocked" : "ready",
    canApplyNow: !blocked,
    queuedProjectionId,
    commandText: blocked ? "open chat Missing" : "open chat Remote triage",
    commandKind: blocked ? "unsupported" : "open_chat",
    approvalRequired: false,
    wouldPersistBinding: !blocked,
    wouldReadProviderMessages: false,
    wouldSendProviderMessages: false,
    blockers: blocked
      ? ["Queued projection was not found in the messaging gateway runtime."]
      : [],
    policyNotes: ["Command preview stays inside Ambient runtime boundaries."],
    nextSteps: blocked
      ? ["Resolve the blockers, then preview the command again."]
      : ["Ask the owner to approve the exact command before applying it."],
    textPreview: blocked ? "open chat Missing" : "open chat Remote triage",
    ...(blocked ? {} : {
      binding: {
        id: "remote-binding",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-conversation",
        purpose: "remote_ambient_surface",
        status: "active",
        ownerUserId: "owner-user",
        ambientSurface: "chat",
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:00:00.000Z",
      },
      targetChat: {
        id: "thread-remote-triage",
        title: "Remote triage",
        updatedAt: "2026-05-28T00:00:00.000Z",
        isActive: true,
      } as any,
    }),
  };
}
