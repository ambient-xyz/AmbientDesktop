import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagingGatewayRemoteSurfaceRuntimeEvent } from "../../shared/messagingGateway";
import { createEmptyMessagingBindingRegistry, createMessagingBindingStore } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import { messagingProjectionText } from "./messagingGatewayProjection";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandInput,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
} from "./messagingRemoteSurfaceCommands";
import {
  MessagingGatewayRunner,
  messagingGatewayInboundDispatchText,
  messagingGatewayLifecyclePreviewText,
  messagingGatewayRuntimeStatusText,
} from "./messagingGatewayRunner";
import {
  buildTelegramRemoteSurfaceBindingPlan,
  telegramRemoteSurfaceBindingAppliedResult,
  telegramRemoteSurfaceBindingCreateInput,
  telegramRemoteSurfaceBindingInput,
  telegramRemoteSurfaceBindingRevokeInput,
  telegramRemoteSurfaceBindingText,
} from "./messagingTelegramFacade";
import {
  applyTelegramConversationDirectory,
  buildTelegramConversationDirectoryPreview,
  telegramConversationDirectoryInput,
  telegramConversationDirectoryResultText,
} from "./messagingTelegramFacade";
import { applyTelegramOwnerHandoff, buildTelegramOwnerHandoffPreview, telegramOwnerHandoffInput } from "./messagingTelegramFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import {
  applyTelegramBridgePoll,
  buildTelegramBridgePollPlan,
  TelegramBridgePollingRunner,
  telegramBridgePollingControlInput,
  telegramBridgePollingControlPreviewText,
  telegramBridgePollingControlResultText,
  telegramBridgePollingStatusText,
  telegramBridgePollPlanText,
  telegramBridgePollResultText,
  telegramBridgePollToolInput,
} from "./messagingTelegramFacade";
import {
  applyTelegramBridgeReply,
  buildTelegramBridgeReplyPreview,
  telegramBridgeReplyInput,
  telegramBridgeReplyPreviewText,
  telegramBridgeReplyResultText,
} from "./messagingTelegramFacade";
import { runtimeEventRelayText } from "./messagingRuntimeEventRelay";
import {
  buildTelegramRelayDiagnostics,
  secondProviderRelayReadinessChecklist,
  telegramRelayDiagnosticsInput,
  telegramRelayDiagnosticsText,
} from "./messagingTelegramFacade";

import { withTelegramBridgeServer, readJson, writeJson } from "./messagingGatewayTestHttpHelpers";

describe("messaging gateway runtime lifecycle", () => {
  it("previews gateway lifecycle boundaries without starting real provider bridges", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    expect(runner.runtimeStatus()).toMatchObject({
      status: "idle",
      providerCount: 2,
      activeProviderCount: 0,
      queuedProjectionCount: 0,
    });
    expect(runner.runtimeStatus().providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "telegram-tdlib",
          state: "stopped",
          mode: "none",
        }),
        expect.objectContaining({
          providerId: "signal-cli",
          state: "stopped",
          mode: "none",
        }),
      ]),
    );

    const syntheticStart = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "synthetic",
    });
    expect(syntheticStart).toMatchObject({
      approvalRequired: false,
      canApplyNow: true,
      wouldStartRealBridge: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
    });
    expect(messagingGatewayLifecyclePreviewText(syntheticStart)).toContain("Mode: synthetic");

    const signalSyntheticStart = runner.previewLifecycle({
      action: "start",
      providerId: "signal-cli",
      mode: "synthetic",
    });
    expect(signalSyntheticStart).toMatchObject({
      approvalRequired: false,
      canApplyNow: false,
      wouldStartRealBridge: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
    });
    expect(messagingGatewayLifecyclePreviewText(signalSyntheticStart)).toContain("Provider implementation status: planned");
    expect(messagingGatewayLifecyclePreviewText(signalSyntheticStart)).toContain("metadata-only");
    const signalApply = runner.applyLifecycle({
      action: "start",
      providerId: "signal-cli",
      mode: "synthetic",
    });
    await expect(signalApply).resolves.toMatchObject({
      applyStatus: "blocked",
      applied: false,
      blockedReason: "Messaging provider lifecycle is not implemented for signal-cli.",
    });

    const realStart = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(realStart).toMatchObject({
      approvalRequired: true,
      canApplyNow: false,
      wouldStartRealBridge: true,
      wouldLaunchBridgeProcess: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
    });
    expect(messagingGatewayLifecyclePreviewText(realStart)).toContain("Real provider bridge startup must be approval-gated");
  });

  it("refreshes gateway provider readiness for status and lifecycle previews", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "not-configured",
          configured: false,
          bridgeReachable: false,
          authNeeded: true,
          apiCredentialsPresent: false,
          persistedSessionCount: 0,
          checkedAt: "2026-05-10T00:00:04.000Z",
          message: "Telegram bridge/session metadata is not configured for this workspace.",
          repairHint: "Create or bind a Telegram TDLib session before attempting real provider startup.",
          diagnostics: ["Readiness probe did not start TDLib."],
          sessions: [],
        }),
      },
    });

    const readiness = await runner.refreshProviderReadiness("telegram-tdlib");
    const status = runner.runtimeStatus();
    const preview = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });

    expect(readiness).toHaveLength(1);
    expect(status.providers[0]).toMatchObject({
      providerId: "telegram-tdlib",
      readiness: {
        status: "not-configured",
        authNeeded: true,
      },
      lastActivityAt: "2026-05-10T00:00:04.000Z",
    });
    expect(preview.readiness).toMatchObject({
      status: "not-configured",
    });
    expect(messagingGatewayRuntimeStatusText(status)).toContain("Readiness: not-configured");
    expect(messagingGatewayLifecyclePreviewText(preview)).toContain("Readiness: not-configured");
    expect(messagingGatewayLifecyclePreviewText(preview)).toContain("Create or bind a Telegram auth profile/session");
  });

  it("applies synthetic gateway lifecycle without provider side effects", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    const start = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "synthetic",
    });
    expect(start).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: false,
      runtimeStatus: {
        status: "idle",
        activeProviderCount: 1,
        syntheticActiveProviderCount: 1,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "synthetic-active",
            mode: "synthetic",
          }),
        ]),
      },
    });

    const stop = await runner.applyLifecycle({
      action: "stop",
      providerId: "telegram-tdlib",
      mode: "synthetic",
    });
    expect(stop).toMatchObject({
      applyStatus: "applied",
      applied: true,
      runtimeStatus: {
        activeProviderCount: 0,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "stopped",
            mode: "none",
          }),
        ]),
      },
    });
  });

  it("blocks real gateway lifecycle until readiness and approval boundaries are satisfied", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "degraded",
          configured: true,
          bridgeReachable: false,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:04.000Z",
          message: "Metadata and credentials exist, but bridge root is not reachable.",
          diagnostics: ["No messages read."],
          sessions: [],
        }),
      },
    });

    await runner.refreshProviderReadiness("telegram-tdlib");
    const withoutApproval = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(withoutApproval).toMatchObject({
      applyStatus: "blocked",
      applied: false,
      approvalRecorded: false,
      blockedReason: "Real provider lifecycle changes require explicit user approval before apply.",
    });

    const withApproval = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(withApproval).toMatchObject({
      applyStatus: "blocked",
      applied: false,
      approvalRecorded: true,
      blockedReason: "No reachable Telegram bridge root was found, and no bridge process supervisor is registered.",
    });
  });

  it("launches a supervised bridge process before attaching real gateway lifecycle", async () => {
    let launched = false;
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date(launched ? "2026-05-10T00:00:05.000Z" : "2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: launched ? "available" : "degraded",
          configured: true,
          bridgeReachable: launched,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: launched ? "2026-05-10T00:00:05.000Z" : "2026-05-10T00:00:04.000Z",
          message: launched ? "Bridge root reachable." : "Bridge root not reachable yet.",
          diagnostics: ["Root health only."],
          sessions: [],
          bridgeSessionCount: launched ? 0 : undefined,
        }),
      },
      bridgeSupervisors: {
        "telegram-tdlib": {
          status: () => ({
            providerId: "telegram-tdlib",
            state: launched ? "running" : "stopped",
            managed: launched,
            command: "pnpm",
            args: ["--dir", "/Users/example/ambientAgent", "telegram:bridge"],
            cwd: "/Users/example/ambientAgent",
            bridgeBaseUrl: "http://127.0.0.1:8091",
            stateRoot: "/workspace/.ambient-agent-state/telegram",
            envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
            safeRootProbeOnly: true,
            recentLogs: [],
          }),
          start: async () => {
            launched = true;
            return {
              providerId: "telegram-tdlib",
              state: "running",
              managed: true,
              command: "pnpm",
              args: ["--dir", "/Users/example/ambientAgent", "telegram:bridge"],
              cwd: "/Users/example/ambientAgent",
              bridgeBaseUrl: "http://127.0.0.1:8091",
              stateRoot: "/workspace/.ambient-agent-state/telegram",
              envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
              safeRootProbeOnly: true,
              recentLogs: [],
            };
          },
          stop: async () => {
            launched = false;
            return {
              providerId: "telegram-tdlib",
              state: "stopped",
              managed: false,
              command: "pnpm",
              args: ["--dir", "/Users/example/ambientAgent", "telegram:bridge"],
              cwd: "/Users/example/ambientAgent",
              bridgeBaseUrl: "http://127.0.0.1:8091",
              stateRoot: "/workspace/.ambient-agent-state/telegram",
              envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
              safeRootProbeOnly: true,
              recentLogs: [],
            };
          },
        },
      },
    });

    await runner.refreshProviderReadiness("telegram-tdlib");
    const preview = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(preview).toMatchObject({
      canApplyNow: true,
      wouldAttachExistingBridge: false,
      wouldLaunchBridgeProcess: true,
      wouldReadProviderMessages: false,
      bridgeSupervisor: {
        state: "stopped",
      },
    });

    const result = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      runtimeStatus: {
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "running",
            mode: "real",
            readiness: expect.objectContaining({
              bridgeReachable: true,
            }),
          }),
        ]),
      },
    });
  });

  it("attaches real gateway lifecycle to an already reachable bridge root after approval", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:04.000Z",
          message: "Telegram bridge root is reachable with a loaded bridge session.",
          diagnostics: ["Root health only; no messages read."],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });

    await runner.refreshProviderReadiness("telegram-tdlib");
    const preview = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(preview).toMatchObject({
      canApplyNow: true,
      wouldAttachExistingBridge: true,
      wouldLaunchBridgeProcess: false,
    });

    const result = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: true,
      runtimeStatus: {
        activeProviderCount: 1,
        syntheticActiveProviderCount: 0,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "running",
            mode: "real",
          }),
        ]),
      },
    });
  });

  it("queues synthetic gateway projections and reports liveness state", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
    });

    const result = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-queue-1",
        providerId: "telegram-tdlib",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const status = runner.runtimeStatus();

    expect(result.queuedProjection).toMatchObject({
      id: "projection-telegram-tdlib-event-queue-1",
      providerId: "telegram-tdlib",
      conversationId: "owner-chat",
      sourceEventId: "event-queue-1",
      bindingId: "remote-binding",
      purpose: "remote_ambient_surface",
    });
    expect(status).toMatchObject({
      status: "idle",
      activeProviderCount: 1,
      syntheticActiveProviderCount: 1,
      queuedProjectionCount: 1,
      recentEventCount: 1,
      providers: expect.arrayContaining([
        expect.objectContaining({
          providerId: "telegram-tdlib",
          state: "synthetic-active",
          mode: "synthetic",
          syntheticEventCount: 1,
          queuedProjectionCount: 1,
          lastActivityAt: "2026-05-10T00:00:03.000Z",
        }),
      ]),
    });
    expect(messagingGatewayRuntimeStatusText(status)).toContain("Queued projection previews");
    expect(messagingGatewayRuntimeStatusText(status)).toContain("registered project");
  });

  it("dispatches real Telegram bridge events only for active owner Remote Ambient Surface bindings", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    bindings.add({
      id: "revoked-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "revoked-chat",
      purpose: "remote_ambient_surface",
      status: "revoked",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for deterministic real inbound test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    await runner.refreshProviderReadiness("telegram-tdlib");
    const started = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(started.applied).toBe(true);

    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
    });
    const accepted = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-owner-chat-100",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1", label: "Owner" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    expect(accepted).toMatchObject({
      accepted: true,
      queuedProjection: {
        id: "projection-telegram-tdlib-telegram-owner-profile-owner-chat-100",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        bindingId: "remote-binding",
        purpose: "remote_ambient_surface",
      },
      runtimeStatus: {
        queuedProjectionCount: 1,
        recentEventCount: 1,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "running",
            mode: "real",
            realEventCount: 1,
            queuedProjectionCount: 1,
          }),
        ]),
      },
    });
    expect(messagingGatewayInboundDispatchText(accepted)).toContain("Accepted: yes");

    const wrongSender = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-owner-chat-101",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "intruder-1" },
        text: "status",
        receivedAt: "2026-05-10T00:00:03.000Z",
      },
    });
    expect(wrongSender).toMatchObject({
      accepted: false,
      droppedReason: "Sender does not match the Remote Ambient Surface owner binding.",
      runtimeStatus: {
        queuedProjectionCount: 1,
        recentEventCount: 1,
      },
    });
    expect(messagingGatewayInboundDispatchText(wrongSender)).toContain("Accepted: no");

    const revoked = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-revoked-chat-102",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "revoked-chat",
        sender: { id: "owner-1" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:04.000Z",
      },
    });
    expect(revoked).toMatchObject({
      accepted: false,
      droppedReason: "No active Remote Ambient Surface binding matches this Telegram event.",
      runtimeStatus: {
        queuedProjectionCount: 1,
        recentEventCount: 1,
      },
    });
  });

  it("sends approved Telegram replies only from queued Remote Ambient Surface projections", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for deterministic reply send test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    await runner.refreshProviderReadiness("telegram-tdlib");
    await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
    });
    const accepted = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-owner-chat-100",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1", label: "Owner" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    expect(accepted.accepted).toBe(true);
    const queuedProjectionId = accepted.queuedProjection!.id;
    const sentRequests: Array<{ path: string; body: unknown; apiId?: string; apiHash?: string }> = [];

    await withTelegramBridgeServer(
      async (req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "POST" && url.pathname === "/sessions/owner-profile/messages/send") {
          sentRequests.push({
            path: url.pathname,
            body: await readJson(req),
            apiId: req.headers["x-telegram-api-id"] as string | undefined,
            apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
          });
          writeJson(res, {
            message: {
              id: "200",
              date: "2026-05-10T00:00:04.000Z",
            },
          });
          return;
        }
        res.statusCode = 404;
        writeJson(res, { error: "not found" });
      },
      async (baseUrl) => {
        const replyInput = telegramBridgeReplyInput({
          queuedProjectionId,
          text: "I found the active project.",
        });
        const preview = buildTelegramBridgeReplyPreview({
          toolInput: replyInput,
          bindings: bindings.list({ includeInactive: false }),
          runtimeStatus: runner.runtimeStatus(),
        });
        expect(preview).toMatchObject({
          status: "ready",
          canApplyNow: true,
          endpointPath: "/sessions/owner-profile/messages/send",
          replyToMessageId: "100",
          safety: {
            sendsProviderMessages: true,
            readsProviderMessages: false,
            readsProviderHistory: false,
            startsBridge: false,
            exposesRuntimeStateToExternalConnector: false,
          },
        });
        expect(telegramBridgeReplyPreviewText(preview)).toContain("Approval required: yes");
        expect(telegramBridgeReplyPreviewText(preview)).toContain("Repair steps:");
        expect(telegramBridgeReplyPreviewText(preview)).toContain("- None");

        const result = await applyTelegramBridgeReply({
          preview,
          approvalRecorded: true,
          env: {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
            AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
          },
          fetchFn: fetch,
          now: () => new Date("2026-05-10T00:00:04.000Z"),
        });
        runner.recordOutboundDelivery(result.delivery);
        expect(result).toMatchObject({
          applyStatus: "sent",
          providerMessageId: "200",
          delivery: {
            status: "sent",
            providerId: "telegram-tdlib",
            authProfileId: "owner-profile",
            conversationId: "owner-chat",
            sourceProjectionId: queuedProjectionId,
            bindingId: "remote-binding",
            replyToMessageId: "100",
            providerMessageId: "200",
          },
        });
        expect(telegramBridgeReplyResultText(result)).toContain("Delivery status: sent");
      },
    );

    expect(sentRequests).toEqual([
      {
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "I found the active project.",
          replyToMessageId: "100",
        },
        apiId: "12345",
        apiHash: "test-hash",
      },
    ]);
    expect(runner.runtimeStatus()).toMatchObject({
      outboundDeliveryCount: 1,
      recentOutboundDeliveries: [
        {
          status: "sent",
          providerMessageId: "200",
          sourceProjectionId: queuedProjectionId,
        },
      ],
    });
    expect(messagingGatewayRuntimeStatusText(runner.runtimeStatus())).toContain("Recent outbound deliveries:");

    const completedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      id: "remote-surface-completed-switch",
      kind: "active_project_switch",
      status: "completed",
      title: "Switch to Remote gateway project",
      summary: "Active Ambient project switched to Remote gateway project.",
      queuedProjectionId,
      bindingId: "remote-binding",
      projectName: "Remote gateway project",
      scheduledAt: "2026-05-10T00:00:02.000Z",
      completedAt: "2026-05-10T00:00:06.000Z",
      relaySuggested: true,
    };
    const completedRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: completedRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(completedRuntimePreview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      queuedProjectionId,
      runtimeEvent: { id: completedRuntimeEvent.id, status: "completed" },
    });
    expect(completedRuntimePreview.text).toBe("Ambient switched the active project to Remote gateway project.");
    expect(runtimeEventRelayText(completedRuntimeEvent)).toBe(completedRuntimePreview.text);
    expect(telegramBridgeReplyPreviewText(completedRuntimePreview)).toContain(`Runtime event: ${completedRuntimeEvent.id}`);
    expect(telegramBridgeReplyPreviewText(completedRuntimePreview)).toContain("Runtime-event replies use Ambient-generated event text");
    expect(telegramBridgeReplyPreviewText(completedRuntimePreview)).toContain("Repair steps:");
    const relayDiagnostics = buildTelegramRelayDiagnostics({
      toolInput: telegramRelayDiagnosticsInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
      }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(relayDiagnostics).toMatchObject({
      status: "ready",
      bridgeModeLabel: "real Telegram bridge running",
      canSendOwnerRelayNow: true,
      providerLabel: "Telegram",
      selectedOwnerBindings: [{ bindingId: "remote-binding" }],
      relayableRuntimeEvents: [{ runtimeEventId: completedRuntimeEvent.id }],
      repairSteps: [
        "No repair needed; preview the selected runtime event with ambient_messaging_telegram_bridge_reply_preview using runtimeEventId.",
      ],
    });
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Remote Ambient Surface relay diagnostics");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Provider: Telegram (telegram-tdlib)");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Bridge mode: real Telegram bridge running");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain(`Event ${completedRuntimeEvent.id}`);
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Provider-specific assumptions:");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Repair steps:");

    const syntheticDiagnostics = buildTelegramRelayDiagnostics({
      toolInput: telegramRelayDiagnosticsInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
      }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        providers: runner.runtimeStatus().providers.map((provider) => ({
          ...provider,
          state: "synthetic-active" as const,
          mode: "synthetic" as const,
        })),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(syntheticDiagnostics.status).toBe("synthetic-only");
    expect(syntheticDiagnostics.canSendOwnerRelayNow).toBe(false);
    expect(syntheticDiagnostics.blockers).toContain("Telegram is in synthetic dogfood mode; no real Telegram messages can be sent.");
    expect(syntheticDiagnostics.repairSteps).toContain(
      "Synthetic dogfood routing cannot send real Telegram messages; preview and approve ambient_messaging_gateway_lifecycle_apply with providerId=telegram-tdlib and mode=real before relay smoke testing.",
    );
    const signalChecklist = secondProviderRelayReadinessChecklist("signal");
    expect(signalChecklist).toMatchObject({
      providerCandidate: "signal",
      purpose: "remote_ambient_surface",
      headlessSafeTarget: true,
      items: expect.arrayContaining([
        expect.objectContaining({ id: "relay-diagnostics", status: "ready" }),
        expect.objectContaining({ id: "reply-adapter", required: true }),
      ]),
    });
    expect(signalChecklist.providerSpecificQuestions.join("\n")).toContain("headlessly");
    const overriddenRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({
        runtimeEventId: completedRuntimeEvent.id,
        text: "Manual status text.",
      }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(overriddenRuntimePreview.text).toBe("Ambient switched the active project to Remote gateway project.");
    expect(overriddenRuntimePreview.canApplyNow).toBe(false);
    expect(overriddenRuntimePreview.blockers).toContain(
      "Runtime event relay text is generated by Ambient; omit text when using runtimeEventId.",
    );
    expect(overriddenRuntimePreview.repairSteps).toContain(
      "Omit text when using runtimeEventId. Ambient will generate the exact relay text from the runtime event.",
    );

    const failedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-failed-switch",
      status: "failed",
      summary: "Active Ambient project switch failed.",
      failedAt: "2026-05-10T00:00:07.000Z",
      error: "Project switch feature is unavailable.",
    };
    const failedRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: failedRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [failedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(failedRuntimePreview.canApplyNow).toBe(true);
    expect(failedRuntimePreview.text).toBe(
      "Ambient could not switch the active project to Remote gateway project: Project switch feature is unavailable.",
    );

    const relayedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-already-relayed",
      relayStatus: "sent",
      relayProviderId: "telegram-tdlib",
      relayDeliveryId: "outbound-telegram-tdlib-20260510T000004000Z",
      relayedAt: "2026-05-10T00:00:08.000Z",
      relaySuggested: false,
    };
    const relayedRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: relayedRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [relayedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(relayedRuntimePreview.canApplyNow).toBe(false);
    expect(relayedRuntimePreview.blockers).toContain("Remote Ambient Surface runtime event has already been relayed.");
    expect(relayedRuntimePreview.repairSteps).toContain(
      "Do not resend this runtime event; inspect Recent outbound deliveries in ambient_messaging_gateway_status and wait for a new runtime event if another owner update is needed.",
    );

    const missingRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: "remote-surface-missing" }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(missingRuntimePreview.canApplyNow).toBe(false);
    expect(missingRuntimePreview.repairSteps).toContain(
      "Call ambient_messaging_gateway_status again and use an exact current runtimeEventId from Recent Remote Ambient Surface runtime events.",
    );

    const staleRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-stale-routing",
      queuedProjectionId: "projection-gone",
    };
    const staleRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: staleRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [staleRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(staleRuntimePreview.canApplyNow).toBe(false);
    expect(staleRuntimePreview.repairSteps).toContain(
      "This runtime event does not retain source routing and its queued projection is gone; wait for a new owner command/runtime event or preview a manual reply only when a current queued projection provides exact Telegram reply routing.",
    );

    const connectorBindings = createEmptyMessagingBindingRegistry(providers);
    connectorBindings.add({
      id: "connector-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "connector-chat",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "external",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const connector = runner.dispatchSynthetic({
      bindings: connectorBindings.list(),
      surface,
      event: {
        id: "connector-event",
        providerId: "telegram-tdlib",
        conversationId: "connector-chat",
        sender: { id: "external-user" },
        text: "hello",
        receivedAt: "2026-05-10T00:00:05.000Z",
      },
    });
    const connectorPreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({
        queuedProjectionId: connector.queuedProjection.id,
        text: "External reply",
      }),
      bindings: connectorBindings.list({ includeInactive: false }),
      runtimeStatus: runner.runtimeStatus(),
    });
    expect(connectorPreview.canApplyNow).toBe(false);
    expect(connectorPreview.blockers).toContain("Outbound replies are currently enabled only for Remote Ambient Surface projections.");
    expect(connectorPreview.repairSteps).toContain(
      "Use only an active owner-scoped Telegram Remote Ambient Surface projection; Messaging Connector conversations remain firewalled from Ambient runtime relay state.",
    );

    const connectorRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-connector-blocked",
      queuedProjectionId: connector.queuedProjection.id,
      bindingId: "connector-binding",
    };
    const connectorRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: connectorRuntimeEvent.id }),
      bindings: connectorBindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [connectorRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(connectorRuntimePreview.canApplyNow).toBe(false);
    expect(connectorRuntimePreview.blockers).toContain(
      "Outbound replies are currently enabled only for Remote Ambient Surface projections.",
    );
  });

  it("polls Telegram bridge unread messages through active owner bindings with sender checks and dedupe", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    bindings.add({
      id: "revoked-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "revoked-chat",
      purpose: "remote_ambient_surface",
      status: "revoked",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-poll-"));
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for deterministic bridge poll test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [],
    });
    const requests: Array<{ path: string; apiId?: string; apiHash?: string }> = [];

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      const started = await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
      expect(started.applied).toBe(true);

      await withTelegramBridgeServer(
        (req, res) => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: `${url.pathname}${url.search}`,
            apiId: req.headers["x-telegram-api-id"] as string | undefined,
            apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
          });
          if (url.pathname === "/sessions/owner-profile/inbox/unread") {
            expect(url.searchParams.get("chatId")).toBe("owner-chat");
            expect(url.searchParams.get("limit")).toBe("5");
            writeJson(res, {
              messages: [
                {
                  id: "099",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "stale projects",
                  date: "2026-05-10T00:00:01.000Z",
                },
                {
                  id: "100",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "projects",
                  date: "2026-05-10T00:00:02.000Z",
                },
                {
                  id: "101",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "intruder",
                  date: "2026-05-10T00:00:02.500Z",
                },
                {
                  id: "102",
                  chatId: "owner-chat",
                  outgoing: true,
                  text: "outbound echo",
                  date: "2026-05-10T00:00:02.750Z",
                },
              ],
            });
            return;
          }
          if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/100/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/101/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "intruder-1",
                  displayName: "Intruder",
                },
              },
            });
            return;
          }
          res.statusCode = 404;
          writeJson(res, { error: "not found" });
        },
        async (baseUrl) => {
          const toolInput = telegramBridgePollToolInput({
            profileId: "owner-profile",
            limit: 5,
            minReceivedAt: "2026-05-10T00:00:02.000Z",
          });
          const plan = buildTelegramBridgePollPlan({
            toolInput,
            bindings: bindings.list({ includeInactive: true }),
            runtimeStatus: runner.runtimeStatus(),
            stateRoot,
          });
          expect(plan).toMatchObject({
            status: "ready",
            canApplyNow: true,
            selectedBindings: [
              {
                bindingId: "remote-binding",
                authProfileId: "owner-profile",
                conversationId: "owner-chat",
                ownerUserId: "owner-1",
              },
            ],
          });
          expect(plan.warnings).toContain("Inactive/revoked Telegram bindings are ignored by polling.");
          expect(telegramBridgePollPlanText(plan)).toContain("Sends provider messages: no");

          const first = await applyTelegramBridgePoll({
            plan,
            bindings: bindings.list({ includeInactive: false }),
            stateRoot,
            env: {
              AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
              AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
              AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
            },
            fetchFn: fetch,
            dispatch: (event) =>
              runner.dispatchInbound({
                source: "telegram-bridge",
                event,
                bindings: bindings.list({ includeInactive: false }),
                surface,
              }),
          });
          expect(first).toMatchObject({
            applyStatus: "applied",
            polled: true,
            fetchedMessageCount: 4,
            candidateMessageCount: 2,
            duplicateMessageCount: 0,
            staleMessageCount: 1,
            skippedMessageCount: 1,
            acceptedDispatchCount: 1,
            droppedDispatchCount: 1,
          });
          expect(first.bindingResults[0]?.dispatches.map((dispatch) => dispatch.accepted)).toEqual([true, false]);
          expect(telegramBridgePollResultText(first)).toContain("Accepted dispatches: 1");
          expect(telegramBridgePollResultText(first)).toContain("Stale messages before minReceivedAt: 1");
          expect(telegramBridgePollResultText(first)).toContain(
            "Queued projection: projection-telegram-tdlib-telegram-owner-profile-owner-chat-100",
          );
          expect(runner.runtimeStatus()).toMatchObject({
            queuedProjectionCount: 1,
            recentEventCount: 1,
            providers: expect.arrayContaining([
              expect.objectContaining({
                providerId: "telegram-tdlib",
                state: "running",
                mode: "real",
                realEventCount: 1,
                queuedProjectionCount: 1,
              }),
            ]),
          });

          const state = JSON.parse(readFileSync(join(stateRoot, "messaging-gateway", "telegram-poll-state.json"), "utf8"));
          expect(state.bindings["remote-binding"].seenMessageIds).toEqual(["099", "100", "101", "102"]);

          const second = await applyTelegramBridgePoll({
            plan,
            bindings: bindings.list({ includeInactive: false }),
            stateRoot,
            env: {
              AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
              AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
              AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
            },
            fetchFn: fetch,
            dispatch: (event) =>
              runner.dispatchInbound({
                source: "telegram-bridge",
                event,
                bindings: bindings.list({ includeInactive: false }),
                surface,
              }),
          });
          expect(second).toMatchObject({
            fetchedMessageCount: 4,
            candidateMessageCount: 0,
            duplicateMessageCount: 4,
            staleMessageCount: 0,
            skippedMessageCount: 0,
            acceptedDispatchCount: 0,
            droppedDispatchCount: 0,
          });
        },
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    expect(requests.map((request) => request.path)).toEqual([
      "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "/sessions/owner-profile/chats/owner-chat/messages/100/sender-profile",
      "/sessions/owner-profile/chats/owner-chat/messages/101/sender-profile",
      "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
    ]);
    expect(requests.every((request) => request.apiId === "12345" && request.apiHash === "test-hash")).toBe(true);
  });

  it("runs the Telegram owner setup loop through directory, handoff, polling, command handling, reply, and cleanup", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-owner-loop-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for end-to-end owner loop dogfood.",
          diagnostics: ["Root probe only; no provider messages read."],
          bridgeSessionCount: 1,
          bridgeBaseUrl: "http://127.0.0.1:8091",
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: join(stateRoot, "telegram", "owner-profile", "bridge-session.json"),
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      activeThreadId: "thread-1",
      threads: [
        {
          id: "thread-1",
          title: "Operational Status Check",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:02.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });
    const setupCode = "AMBIENT-HANDOFF-FULL-LOOP-123456";
    const requests: Array<{ method: string; path: string; body?: unknown; apiId?: string; apiHash?: string }> = [];
    let unreadCallCount = 0;

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      const started = await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
      expect(started).toMatchObject({
        applyStatus: "applied",
        applied: true,
      });

      await withTelegramBridgeServer(
        async (req, res) => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          const record: { method: string; path: string; body?: unknown; apiId?: string; apiHash?: string } = {
            method: req.method ?? "GET",
            path: `${url.pathname}${url.search}`,
            apiId: req.headers["x-telegram-api-id"] as string | undefined,
            apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
          };
          if (req.method === "POST") record.body = await readJson(req);
          requests.push(record);

          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats") {
            expect(url.searchParams.get("metadataOnly")).toBe("true");
            writeJson(res, {
              chats: [
                {
                  id: "owner-chat",
                  title: "Owner Remote Control",
                  type: "private",
                  unreadCount: 2,
                  folderIds: [1],
                  updatedAt: "2026-05-10T00:00:02.000Z",
                },
              ],
            });
            return;
          }
          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/inbox/unread") {
            expect(url.searchParams.get("chatId")).toBe("owner-chat");
            unreadCallCount += 1;
            writeJson(res, {
              messages:
                unreadCallCount === 1
                  ? [
                      {
                        id: "noise-before-handoff",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: "private setup noise must not leak",
                        date: "2026-05-10T00:00:02.000Z",
                      },
                      {
                        id: "handoff-setup",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:03.000Z",
                      },
                    ]
                  : [
                      {
                        id: "handoff-setup",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:03.000Z",
                      },
                      {
                        id: "status-1",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: "status",
                        date: "2026-05-10T00:00:04.000Z",
                      },
                    ],
            });
            return;
          }
          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/handoff-setup/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/status-1/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          if (req.method === "POST" && url.pathname === "/sessions/owner-profile/messages/send") {
            writeJson(res, {
              messageId: "reply-1",
              date: "2026-05-10T00:00:06.000Z",
            });
            return;
          }
          res.statusCode = 404;
          writeJson(res, { error: "not found" });
        },
        async (baseUrl) => {
          const env = {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
            AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
          };

          const directoryPreview = buildTelegramConversationDirectoryPreview({
            toolInput: telegramConversationDirectoryInput({
              profileId: "owner-profile",
              limit: 5,
            }),
            runtimeStatus: runner.runtimeStatus(),
          });
          expect(directoryPreview.canApplyNow).toBe(true);
          const directoryResult = await applyTelegramConversationDirectory({
            preview: directoryPreview,
            approvalRecorded: true,
            env,
            fetchFn: fetch,
          });
          expect(directoryResult).toMatchObject({
            applyStatus: "applied",
            failureMode: "none",
            conversations: [{ conversationId: "owner-chat", title: "Owner Remote Control" }],
          });
          expect(telegramConversationDirectoryResultText(directoryResult)).toContain("owner-chat: Owner Remote Control");

          const handoffPreview = buildTelegramOwnerHandoffPreview({
            toolInput: telegramOwnerHandoffInput({
              profileId: "owner-profile",
              conversationId: "owner-chat",
              setupCode,
              limit: 5,
            }),
            runtimeStatus: runner.runtimeStatus(),
          });
          expect(handoffPreview.canApplyNow).toBe(true);
          const handoffResult = await applyTelegramOwnerHandoff({
            preview: handoffPreview,
            setupCode,
            approvalRecorded: true,
            env,
            fetchFn: fetch,
            now: () => new Date("2026-05-10T00:00:04.000Z"),
          });
          expect(handoffResult).toMatchObject({
            applyStatus: "applied",
            handoffStatus: "matched",
            ownerUserId: "owner-1",
            sourceMessageId: "handoff-setup",
          });
          expect(JSON.stringify(handoffResult)).not.toContain("private setup noise");

          const createToolInput = telegramRemoteSurfaceBindingInput({
            action: "create",
            purpose: "remote_ambient_surface",
            profileId: "owner-profile",
            conversationId: "owner-chat",
            ownerUserId: handoffResult.ownerUserId,
            ambientSurface: "projects",
            maxDisclosureLabel: "owner-private-runtime-summary",
            ownerHandoffSourceMessageId: handoffResult.sourceMessageId,
          });
          if (createToolInput.action !== "create") throw new Error("Expected create input.");
          const runtimeProvider = runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib");
          const createPlan = buildTelegramRemoteSurfaceBindingPlan({
            toolInput: createToolInput,
            lifecycle: bindings.previewCreate(telegramRemoteSurfaceBindingCreateInput(createToolInput)),
            readiness: runtimeProvider?.readiness,
            runtimeProvider,
          });
          expect(createPlan.canApplyNow).toBe(true);
          const created = bindings.create(telegramRemoteSurfaceBindingCreateInput(createToolInput));
          const createResult = telegramRemoteSurfaceBindingAppliedResult(createPlan, created);
          expect(createResult).toMatchObject({
            applyStatus: "applied",
            persisted: true,
            lifecycle: {
              binding: {
                metadata: {
                  ownerHandoffSourceMessageId: "handoff-setup",
                },
              },
            },
          });
          expect(telegramRemoteSurfaceBindingText(createResult)).toContain("Telegram Remote Ambient Surface binding applied");

          const pollPlan = buildTelegramBridgePollPlan({
            toolInput: telegramBridgePollToolInput({
              profileId: "owner-profile",
              limit: 5,
            }),
            bindings: bindings.list({ includeInactive: true }),
            runtimeStatus: runner.runtimeStatus(),
            stateRoot,
          });
          expect(pollPlan.canApplyNow).toBe(true);
          const pollResult = await applyTelegramBridgePoll({
            plan: pollPlan,
            bindings: bindings.list({ includeInactive: false }),
            surface,
            stateRoot,
            env,
            fetchFn: fetch,
            dispatch: (event) =>
              runner.dispatchInbound({
                source: "telegram-bridge",
                event,
                bindings: bindings.list({ includeInactive: false }),
                surface,
              }),
          });
          expect(pollResult).toMatchObject({
            applyStatus: "applied",
            fetchedMessageCount: 2,
            duplicateMessageCount: 1,
            candidateMessageCount: 1,
            acceptedDispatchCount: 1,
            droppedDispatchCount: 0,
          });
          expect(telegramBridgePollResultText(pollResult)).toContain("Accepted dispatches: 1");
          const acceptedDispatch = pollResult.bindingResults[0]?.dispatches.find((dispatch) => dispatch.accepted);
          const queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
          expect(queuedProjectionId).toBeTruthy();
          expect(telegramBridgePollResultText(pollResult)).toContain(`Queued projection: ${queuedProjectionId}`);

          const commandPreview = buildMessagingRemoteSurfaceCommandPreview({
            toolInput: messagingRemoteSurfaceCommandInput({ queuedProjectionId }),
            bindings: bindings.list({ includeInactive: false }),
            runtimeStatus: runner.runtimeStatus(),
            surface,
          });
          expect(commandPreview).toMatchObject({
            status: "ready",
            commandKind: "show_status",
            approvalRequired: false,
            wouldReadProviderMessages: false,
            wouldSendProviderMessages: false,
          });
          const commandProjection = messagingRemoteSurfaceCommandResultProjection({
            preview: commandPreview,
            bindings: bindings.list({ includeInactive: false }),
            surface,
          });
          expect(commandProjection).toBeTruthy();
          const commandResult = messagingRemoteSurfaceCommandAppliedResult({
            preview: commandPreview,
            approvalRecorded: false,
            projection: commandProjection,
          });
          expect(commandResult).toMatchObject({
            applyStatus: "noop",
            commandKind: "show_status",
            projection: { purpose: "remote_ambient_surface" },
          });
          expect(messagingRemoteSurfaceCommandResultText(commandResult)).toContain("Projection:");

          const replyText = `Ambient status ready: ${commandResult.projection?.title ?? "runtime status"}.`;
          const replyPreview = buildTelegramBridgeReplyPreview({
            toolInput: telegramBridgeReplyInput({
              queuedProjectionId,
              text: replyText,
            }),
            bindings: bindings.list({ includeInactive: false }),
            runtimeStatus: runner.runtimeStatus(),
          });
          expect(replyPreview).toMatchObject({
            status: "ready",
            endpointPath: "/sessions/owner-profile/messages/send",
            replyToMessageId: "status-1",
          });
          const replyResult = await applyTelegramBridgeReply({
            preview: replyPreview,
            approvalRecorded: true,
            env,
            fetchFn: fetch,
            now: () => new Date("2026-05-10T00:00:06.000Z"),
          });
          runner.recordOutboundDelivery(replyResult.delivery);
          expect(replyResult).toMatchObject({
            applyStatus: "sent",
            providerMessageId: "reply-1",
            delivery: {
              status: "sent",
              sourceProjectionId: queuedProjectionId,
              replyToMessageId: "status-1",
            },
          });
          expect(telegramBridgeReplyResultText(replyResult)).toContain("Delivery status: sent");

          const revokeToolInput = telegramRemoteSurfaceBindingInput({
            action: "revoke",
            bindingId: created.binding.id,
            reason: "owner loop dogfood cleanup",
          });
          if (revokeToolInput.action !== "revoke") throw new Error("Expected revoke input.");
          const revokePlan = buildTelegramRemoteSurfaceBindingPlan({
            toolInput: revokeToolInput,
            lifecycle: bindings.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput)),
            readiness: runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib")?.readiness,
            runtimeProvider: runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib"),
          });
          expect(revokePlan.canApplyNow).toBe(true);
          const revoked = bindings.revoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput));
          const revokeResult = telegramRemoteSurfaceBindingAppliedResult(revokePlan, revoked);
          expect(revokeResult).toMatchObject({
            applyStatus: "applied",
            persisted: true,
            lifecycle: { binding: { status: "revoked" } },
          });
          expect(bindings.list({ includeInactive: false })).toMatchObject({
            activeBindingCount: 0,
            remoteAmbientSurfaceCount: 0,
          });
        },
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /sessions/owner-profile/chats?limit=5&metadataOnly=true",
      "GET /sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "GET /sessions/owner-profile/chats/owner-chat/messages/handoff-setup/sender-profile",
      "GET /sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "GET /sessions/owner-profile/chats/owner-chat/messages/status-1/sender-profile",
      "POST /sessions/owner-profile/messages/send",
    ]);
    expect(requests.every((request) => request.apiId === "12345" && request.apiHash === "test-hash")).toBe(true);
    const sent = requests.find((request) => request.method === "POST");
    expect(sent?.body).toEqual({
      chatId: "owner-chat",
      text: "Ambient status ready: Projects.",
      replyToMessageId: "status-1",
    });
    expect(runner.runtimeStatus()).toMatchObject({
      outboundDeliveryCount: 1,
      recentOutboundDeliveries: [{ providerMessageId: "reply-1" }],
    });
  });

  it("blocks Telegram bridge polling until the provider is running in real mode", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    const plan = buildTelegramBridgePollPlan({
      toolInput: telegramBridgePollToolInput({ profileId: "owner-profile" }),
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      stateRoot: "/workspace/.ambient",
    });
    expect(plan).toMatchObject({
      status: "blocked",
      canApplyNow: false,
      safety: {
        readsProviderUnreadMessages: false,
        sendsProviderMessages: false,
      },
    });
    expect(plan.blockers).toContain("Telegram provider is not running in real mode.");
    expect(telegramBridgePollPlanText(plan)).toContain("Can apply now: no");
  });

  it("runs approval-gated periodic Telegram polling with status counters and stop controls", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-polling-runner-"));
    let nowMs = Date.parse("2026-05-10T00:00:03.000Z");
    let scheduledIntervalMs = 0;
    let clearedTimerCount = 0;
    const pollingRunner = new TelegramBridgePollingRunner({
      now: () => new Date(nowMs),
      schedulePoll: (_callback, intervalMs) => {
        scheduledIntervalMs = intervalMs;
        return { unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
      },
      clearPoll: () => {
        clearedTimerCount += 1;
      },
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date(nowMs),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: new Date(nowMs).toISOString(),
          message: "Ready for deterministic periodic polling test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [],
    });
    let unreadCallCount = 0;

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      await withTelegramBridgeServer(
        (req, res) => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          if (url.pathname === "/sessions/owner-profile/inbox/unread") {
            unreadCallCount += 1;
            writeJson(res, {
              messages: [
                {
                  id: `stale-${unreadCallCount}`,
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "old backlog",
                  date: "2026-05-10T00:00:01.000Z",
                },
                {
                  id: String(199 + unreadCallCount),
                  chatId: "owner-chat",
                  outgoing: false,
                  text: unreadCallCount === 1 ? "projects" : "status",
                  date: new Date(nowMs).toISOString(),
                },
              ],
            });
            return;
          }
          if (url.pathname.startsWith("/sessions/owner-profile/chats/owner-chat/messages/") && url.pathname.endsWith("/sender-profile")) {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          res.statusCode = 404;
          writeJson(res, { error: "not found" });
        },
        async (baseUrl) => {
          const input = telegramBridgePollingControlInput({
            action: "start",
            profileId: "owner-profile",
            limit: 5,
            minReceivedAt: "2026-05-10T00:00:02.000Z",
            intervalMs: 5000,
          });
          const buildPlan = () =>
            buildTelegramBridgePollPlan({
              toolInput: input,
              bindings: bindings.list({ includeInactive: true }),
              runtimeStatus: gatewayRunner.runtimeStatus(),
              stateRoot,
            });
          const pollOnce = () =>
            applyTelegramBridgePoll({
              plan: buildPlan(),
              bindings: bindings.list({ includeInactive: false }),
              stateRoot,
              env: {
                AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
              },
              fetchFn: fetch,
              dispatch: (event) =>
                gatewayRunner.dispatchInbound({
                  source: "telegram-bridge",
                  event,
                  bindings: bindings.list({ includeInactive: false }),
                  surface,
                }),
            });

          const startPreview = pollingRunner.preview(input, buildPlan());
          expect(startPreview).toMatchObject({
            action: "start",
            status: "ready",
            canApplyNow: true,
            approvalRequired: true,
            minReceivedAt: "2026-05-10T00:00:02.000Z",
            safety: {
              startsTimer: true,
              sendsProviderMessages: false,
            },
          });
          expect(telegramBridgePollingControlPreviewText(startPreview)).toContain("Starts timer: yes");
          expect(telegramBridgePollingControlPreviewText(startPreview)).toContain("Freshness minReceivedAt: 2026-05-10T00:00:02.000Z");

          const startResult = await pollingRunner.apply({
            preview: startPreview,
            approvalRecorded: true,
            pollOnce,
          });
          expect(startResult).toMatchObject({
            applyStatus: "applied",
            approvalRecorded: true,
            immediatePollResult: {
              acceptedDispatchCount: 1,
              staleMessageCount: 1,
            },
            runtimeStatus: {
              state: "running",
              running: true,
              minReceivedAt: "2026-05-10T00:00:02.000Z",
              totalPollCount: 1,
              successfulPollCount: 1,
              acceptedDispatchCount: 1,
              staleMessageCount: 1,
              lastSuccessfulPollAt: "2026-05-10T00:00:03.000Z",
            },
          });
          expect(scheduledIntervalMs).toBe(5000);
          expect(telegramBridgePollingControlResultText(startResult)).toContain("Immediate poll:");

          nowMs = Date.parse("2026-05-10T00:00:08.000Z");
          const scheduled = await pollingRunner.runScheduledPoll();
          expect(scheduled).toMatchObject({
            applyStatus: "applied",
            acceptedDispatchCount: 1,
            staleMessageCount: 1,
          });
          expect(pollingRunner.status()).toMatchObject({
            state: "running",
            totalPollCount: 2,
            successfulPollCount: 2,
            acceptedDispatchCount: 2,
            staleMessageCount: 2,
            lastSuccessfulPollAt: "2026-05-10T00:00:08.000Z",
            nextPollDueAt: "2026-05-10T00:00:13.000Z",
          });
          expect(telegramBridgePollingStatusText(pollingRunner.status())).toContain("Last successful poll: 2026-05-10T00:00:08.000Z");
          expect(telegramBridgePollingStatusText(pollingRunner.status())).toContain("Stale messages before minReceivedAt: 2");

          const stopInput = telegramBridgePollingControlInput({ action: "stop" });
          const stopPreview = pollingRunner.preview(stopInput, buildPlan());
          expect(stopPreview).toMatchObject({
            action: "stop",
            status: "ready",
            approvalRequired: false,
            safety: {
              stopsTimer: true,
              readsProviderUnreadMessages: false,
            },
          });
          const stopResult = await pollingRunner.apply({
            preview: stopPreview,
            approvalRecorded: false,
            pollOnce,
          });
          expect(stopResult).toMatchObject({
            applyStatus: "applied",
            runtimeStatus: {
              state: "stopped",
              running: false,
              stoppedAt: "2026-05-10T00:00:08.000Z",
            },
          });
          expect(clearedTimerCount).toBe(1);
        },
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("keeps gateway queues purpose-isolated across simultaneous bindings", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "chat",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    bindings.add({
      id: "connector-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-external",
      conversationId: "external-chat",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "external",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "secretProject",
        path: "/secret/workspace",
        statePath: "/secret/workspace/.ambient",
        sessionPath: "/secret/workspace/.ambient/sessions",
      },
      threads: [
        {
          id: "thread-secret",
          title: "Private chat",
          workspacePath: "/secret/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          lastMessagePreview: "Private detail",
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    const connector = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "external-event",
        providerId: "telegram-tdlib",
        conversationId: "external-chat",
        sender: { id: "external-user", trustClass: "external" },
        text: "What are you working on?",
        receivedAt: "2026-05-10T00:00:01.000Z",
      },
    });
    const remote = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "owner-event",
        providerId: "telegram-tdlib",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "chats",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const connectorText = messagingProjectionText(connector.projection);

    expect(connector.queuedProjection.purpose).toBe("messaging_connector");
    expect(connector.projection.disclosure).toMatchObject({
      includesRuntimeState: false,
      includesWorkspacePath: false,
      includesPrivateChatState: false,
    });
    expect(connectorText).not.toContain("secretProject");
    expect(connectorText).not.toContain("thread-secret");
    expect(connectorText).not.toContain("Private detail");
    expect(remote.queuedProjection.purpose).toBe("remote_ambient_surface");
    expect(remote.projection.disclosure.includesRuntimeState).toBe(true);
    expect(runner.runtimeStatus().queuedProjections.map((projection) => projection.purpose)).toEqual([
      "messaging_connector",
      "remote_ambient_surface",
    ]);
  });

  it("records structured gateway error state for unknown providers", () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    expect(() =>
      runner.dispatchSynthetic({
        bindings: {
          bindings: [],
          bindingCount: 0,
          activeBindingCount: 0,
          remoteAmbientSurfaceCount: 0,
          messagingConnectorCount: 0,
          headlessSafeBindingCount: 0,
        },
        event: {
          id: "unknown-event",
          providerId: "unknown-provider",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "status",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      }),
    ).toThrow(/Ambient messaging provider not found: unknown-provider/);

    const status = runner.runtimeStatus();
    expect(status).toMatchObject({
      status: "error",
      lastError: "Ambient messaging provider not found: unknown-provider",
      providers: expect.arrayContaining([
        expect.objectContaining({
          providerId: "unknown-provider",
          state: "error",
          lastError: "Ambient messaging provider not found: unknown-provider",
        }),
      ]),
    });
    expect(messagingGatewayRuntimeStatusText(status)).toContain("Last error: Ambient messaging provider not found: unknown-provider");
  });
});
