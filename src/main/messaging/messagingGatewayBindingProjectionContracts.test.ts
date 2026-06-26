import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyMessagingBindingRegistry, createMessagingBindingStore, bindingLifecyclePreviewText } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import {
  buildMessagingPurposePromptContext,
  messagingProjectionText,
  projectToolStatusCard,
  routeSyntheticMessagingEvent,
} from "./messagingGatewayProjection";
import {
  buildMessagingRemoteSurfaceBindingPreview,
  buildMessagingRemoteSurfaceEventPreview,
  messagingRemoteSurfaceBindingPreviewInput,
  messagingRemoteSurfaceBindingPreviewText,
  messagingRemoteSurfaceEventPreviewInput,
  messagingRemoteSurfaceEventPreviewText,
} from "./messagingRemoteSurfaceProviderPreview";
import {
  buildTelegramRemoteSurfaceBindingPlan,
  telegramRemoteSurfaceBindingAppliedResult,
  telegramRemoteSurfaceBindingCreateInput,
  telegramRemoteSurfaceBindingInput,
  telegramRemoteSurfaceBindingRevokeInput,
  telegramRemoteSurfaceBindingText,
} from "./messagingTelegramFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway binding and projection contracts", () => {
  it("delegates provider-neutral Remote Ambient Surface previews to Telegram where safe", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-remote-surface-preview-"));
    try {
      const bindingStore = createMessagingBindingStore({ stateRoot, providers });
      const toolInput = messagingRemoteSurfaceBindingPreviewInput({
        action: "create",
        providerId: "telegram-tdlib",
        authProfileId: "owner",
        conversationId: "owner-chat",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      const preview = await buildMessagingRemoteSurfaceBindingPreview({
        toolInput,
        providers,
        bindings: bindingStore.list({ includeInactive: true }),
        telegramPlan: async (telegramInput) =>
          buildTelegramRemoteSurfaceBindingPlan({
            toolInput: telegramInput,
            lifecycle:
              telegramInput.action === "create"
                ? bindingStore.previewCreate(telegramRemoteSurfaceBindingCreateInput(telegramInput))
                : bindingStore.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(telegramInput)),
          }),
      });

      expect(preview).toMatchObject({
        providerId: "telegram-tdlib",
        typedPreviewTool: "ambient_messaging_telegram_remote_surface_preview",
        typedApplyTool: "ambient_messaging_telegram_remote_surface_apply",
        delegatedTelegramPlan: {
          action: "create",
        },
      });
      expect(preview.warnings.join("\n")).toContain("delegated to the Telegram typed");
      expect(messagingRemoteSurfaceBindingPreviewText(preview)).toContain("Delegated Telegram preview summary");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("previews Telegram inbound event routing without queueing projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const registry = createEmptyMessagingBindingRegistry(providers);
    registry.add({
      id: "binding-owner-chat",
      providerId: "telegram-tdlib",
      authProfileId: "owner",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });

    const preview = buildMessagingRemoteSurfaceEventPreview({
      toolInput: messagingRemoteSurfaceEventPreviewInput(
        {
          providerId: "telegram-tdlib",
          authProfileId: "owner",
          conversationId: "owner-chat",
          messageId: "101",
          senderId: "owner-1",
          senderLabel: "Owner",
          text: "status",
        },
        () => new Date("2026-05-10T00:00:01.000Z"),
      ),
      providers,
      bindings: registry.list({ includeInactive: false }),
      surface: buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "Dogfood",
          path: "/tmp/dogfood",
          statePath: "/tmp/dogfood/.ambient",
          sessionPath: "/tmp/dogfood/.ambient/session.json",
        },
        threads: [],
        workflowFolders: [],
      }),
    });

    expect(preview).toMatchObject({
      providerId: "telegram-tdlib",
      status: "ready",
      canRouteWithTypedTool: true,
      typedRouteTool: "ambient_messaging_telegram_bridge_event_route",
      matchedBinding: {
        id: "binding-owner-chat",
      },
      routePreview: {
        projection: {
          kind: "surface_list",
        },
      },
    });
    expect(preview.safety.queuesProjection).toBe(false);
    expect(messagingRemoteSurfaceEventPreviewText(preview)).toContain("Projection preview:");
  });

  it("requires explicit binding purpose and validates purpose-specific fields", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);

    bindings.add({
      id: "binding-1",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local",
      conversationId: "123",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:01.000Z",
    });

    const result = bindings.list();
    expect(result).toMatchObject({
      bindingCount: 1,
      activeBindingCount: 1,
      remoteAmbientSurfaceCount: 1,
      messagingConnectorCount: 0,
      headlessSafeBindingCount: 1,
    });
    expect(result.bindings[0]).toMatchObject({
      id: "binding-1",
      purpose: "remote_ambient_surface",
      headlessSafe: true,
      ownerUserId: "owner-1",
      ambientSurface: "projects",
    });

    expect(() =>
      bindings.add({
        id: "binding-2",
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local",
        conversationId: "456",
        purpose: "remote_ambient_surface",
        status: "active",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
      }),
    ).toThrow(/requires ownerUserId/);

    expect(() =>
      bindings.add({
        id: "binding-3",
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local",
        conversationId: "789",
        purpose: "messaging_connector",
        status: "active",
        externalTrustClass: "delegate",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
      }),
    ).toThrow(/requires externalTrustClass=external/);

    expect(() =>
      bindings.add({
        id: "binding-signal",
        providerId: "signal-cli",
        authProfileId: "signal-local-owner",
        conversationId: "signal-chat-1",
        purpose: "remote_ambient_surface",
        status: "active",
        ownerUserId: "owner-1",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
      }),
    ).toThrow(/requires setupTool=ambient_messaging_signal_remote_surface_apply/);
  });

  it("previews, persists, and revokes binding lifecycle records without bridge side effects", () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-bindings-"));
    try {
      const providers = createDefaultMessagingProviderRegistry();
      const store = createMessagingBindingStore({
        stateRoot,
        providers,
        now: () => new Date("2026-05-10T00:00:00.000Z"),
      });

      const createInput = {
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local-owner",
        conversationId: "telegram-chat-1",
        purpose: "remote_ambient_surface" as const,
        ownerUserId: "owner-1",
        ambientSurface: "projects" as const,
      };
      const preview = store.previewCreate(createInput);
      expect(preview).toMatchObject({
        action: "create",
        approvalRequired: true,
        wouldPersist: true,
        wouldStartBridge: false,
        wouldReadMessages: false,
        wouldSendMessages: false,
        binding: {
          providerId: "telegram-tdlib",
          purpose: "remote_ambient_surface",
          status: "active",
          headlessSafe: true,
        },
      });
      expect(bindingLifecyclePreviewText(preview)).toContain("Would start bridge: no");

      const created = store.create(createInput);
      expect(created.persisted).toBe(true);
      expect(store.list()).toMatchObject({ bindingCount: 1, activeBindingCount: 1 });
      expect(() => store.create(createInput)).toThrow(/already registered|already exists/);

      const revokePreview = store.previewRevoke({ bindingId: created.binding.id, reason: "test cleanup" });
      expect(revokePreview.binding.status).toBe("revoked");
      const revoked = store.revoke({ bindingId: created.binding.id, reason: "test cleanup" });
      expect(revoked.persisted).toBe(true);
      expect(store.list()).toMatchObject({ bindingCount: 0, activeBindingCount: 0 });
      expect(store.list({ includeInactive: true }).bindings[0]).toMatchObject({
        id: created.binding.id,
        status: "revoked",
        metadata: { revokedReason: "test cleanup" },
      });

      const reloaded = createMessagingBindingStore({ stateRoot, providers });
      expect(reloaded.list({ includeInactive: true }).bindingCount).toBe(1);
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("plans typed Telegram Remote Ambient Surface binding setup with owner, surface, and disclosure requirements", () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-remote-surface-"));
    try {
      const providers = createDefaultMessagingProviderRegistry();
      const store = createMessagingBindingStore({
        stateRoot,
        providers,
        now: () => new Date("2026-05-10T00:00:00.000Z"),
      });
      const readiness = {
        providerId: "telegram-tdlib",
        status: "degraded" as const,
        configured: true,
        bridgeReachable: false,
        authNeeded: true,
        apiCredentialsPresent: true,
        persistedSessionCount: 1,
        checkedAt: "2026-05-10T00:00:00.000Z",
        message: "Session metadata exists; bridge startup remains separate.",
        diagnostics: [],
        sessions: [
          {
            profileId: "owner",
            metadataPath: join(stateRoot, "telegram", "owner", "bridge-session.json"),
            metadataReadable: true,
            tdlibStateDirPresent: true,
            phoneNumberPresent: true,
            databaseEncryptionKeyPresent: true,
          },
        ],
      };
      const runtimeProvider = {
        providerId: "telegram-tdlib",
        label: "Telegram",
        state: "stopped" as const,
        mode: "none" as const,
        syntheticEventCount: 0,
        realEventCount: 0,
        queuedProjectionCount: 0,
        readiness,
      };

      expect(() =>
        telegramRemoteSurfaceBindingInput({
          action: "create",
          purpose: "remote_ambient_surface",
          profileId: "owner",
          conversationId: "telegram-chat-1",
          ownerUserId: "owner-1",
          ambientSurface: "projects",
        }),
      ).toThrow(/maxDisclosureLabel is required/);

      const createToolInput = telegramRemoteSurfaceBindingInput({
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "owner",
        conversationId: "telegram-chat-1",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      if (createToolInput.action !== "create") throw new Error("expected create input");
      const createPlan = buildTelegramRemoteSurfaceBindingPlan({
        toolInput: createToolInput,
        lifecycle: store.previewCreate(telegramRemoteSurfaceBindingCreateInput(createToolInput)),
        readiness,
        runtimeProvider,
      });

      expect(createPlan).toMatchObject({
        status: "ready",
        canApplyNow: true,
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          enablesInboundIngestion: false,
        },
        lifecycle: {
          binding: {
            providerId: "telegram-tdlib",
            purpose: "remote_ambient_surface",
            authProfileId: "owner",
            conversationId: "telegram-chat-1",
            ownerUserId: "owner-1",
            ambientSurface: "projects",
            externalTrustClass: "owner",
            maxDisclosureLabel: "owner-private-runtime-summary",
          },
        },
      });
      expect(telegramRemoteSurfaceBindingText(createPlan)).toContain("Would enable inbound ingestion: no");
      expect(telegramRemoteSurfaceBindingText(createPlan)).toContain("Max disclosure: owner-private-runtime-summary");

      const created = store.create(telegramRemoteSurfaceBindingCreateInput(createToolInput));
      const applied = telegramRemoteSurfaceBindingAppliedResult(createPlan, created);
      expect(applied.persisted).toBe(true);
      expect(telegramRemoteSurfaceBindingText(applied)).toContain("Telegram Remote Ambient Surface binding applied");

      const revokeToolInput = telegramRemoteSurfaceBindingInput({
        action: "revoke",
        bindingId: created.binding.id,
        reason: "typed setup test cleanup",
      });
      if (revokeToolInput.action !== "revoke") throw new Error("expected revoke input");
      const revokePlan = buildTelegramRemoteSurfaceBindingPlan({
        toolInput: revokeToolInput,
        lifecycle: store.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput)),
        readiness,
        runtimeProvider,
      });
      expect(revokePlan.status).toBe("ready");
      const revoked = store.revoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput));
      expect(revoked.binding.status).toBe("revoked");
      expect(store.list({ includeInactive: true }).bindings[0]).toMatchObject({
        id: created.binding.id,
        status: "revoked",
        metadata: { revokedReason: "typed setup test cleanup" },
      });

      const missingSessionInput = telegramRemoteSurfaceBindingInput({
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "missing-owner",
        conversationId: "telegram-chat-2",
        ownerUserId: "owner-1",
        ambientSurface: "settings",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      if (missingSessionInput.action !== "create") throw new Error("expected create input");
      const blockedPlan = buildTelegramRemoteSurfaceBindingPlan({
        toolInput: missingSessionInput,
        lifecycle: store.previewCreate(telegramRemoteSurfaceBindingCreateInput(missingSessionInput)),
        readiness,
        runtimeProvider,
      });
      expect(blockedPlan.status).toBe("blocked");
      expect(blockedPlan.blockers.join("\n")).toContain("No persisted Telegram session metadata was found");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("keeps Messaging Connector synthetic routes firewalled from runtime state", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
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

    const result = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-2",
        providerId: "telegram-tdlib",
        conversationId: "external-chat",
        sender: { id: "external-user", trustClass: "external" },
        text: "What are you working on?",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const text = messagingProjectionText(result.projection);
    const prompt = result.promptContext.systemPromptLines.join("\n");

    expect(result.projection).toMatchObject({
      kind: "connector_guardrail",
      purpose: "messaging_connector",
      disclosure: {
        includesRuntimeState: false,
        includesWorkspacePath: false,
        includesPrivateChatState: false,
      },
    });
    expect(text).not.toContain("secretProject");
    expect(text).not.toContain("/secret/workspace");
    expect(text).not.toContain("thread-secret");
    expect(text).not.toContain("Private detail");
    expect(prompt).toContain("firewalled from private Ambient runtime state");
  });

  it("builds purpose prompt context and compact tool-status projections without raw internals", () => {
    const connector = buildMessagingPurposePromptContext({
      purpose: "messaging_connector",
      explicitAttachments: ["One approved support-ticket summary"],
    });
    expect(connector.allowedContext.join("\n")).toContain("One approved support-ticket summary");
    expect(connector.forbiddenContext.join("\n")).toContain("Do not inspect or reveal Ambient projects");

    const projection = projectToolStatusCard({
      toolName: "ambient_cli",
      label: "YouTube transcript",
      status: "done",
      summary: "Transcript artifact saved.",
      preview: "First 200 characters only.",
      artifactPath: "youtube-transcript.txt",
    });
    expect(projection).toMatchObject({
      kind: "tool_status",
      disclosure: {
        includesRuntimeState: false,
        includesPrivateChatState: false,
      },
    });
    expect(messagingProjectionText(projection)).toContain("Raw tool internals are intentionally omitted");
  });
});
