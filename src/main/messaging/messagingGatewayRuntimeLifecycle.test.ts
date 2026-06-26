import { describe, expect, it } from "vitest";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import { messagingProjectionText } from "./messagingGatewayProjection";
import { MessagingGatewayRunner, messagingGatewayLifecyclePreviewText, messagingGatewayRuntimeStatusText } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

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
