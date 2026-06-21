import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime Signal messaging gateway setup", () => {
  it("surfaces Signal local preflight readiness through gateway status without enabling Signal actions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-signal-readiness-"));
    const signalProfileRoot = join(workspacePath, ".ambient-agent-state", "signal", "owner");
    const store = new ProjectStore();
    const originalEnv = {
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      signalCliPath: process.env.AMBIENT_SIGNAL_CLI_PATH,
      signalCliConfigDir: process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR,
    };
    try {
      await mkdir(signalProfileRoot, { recursive: true });
      await writeFile(join(signalProfileRoot, "bridge-session.json"), JSON.stringify({
        profileId: "owner",
        signalCliConfigDir: signalProfileRoot,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
        phoneNumber: "+15551234567",
      }));
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      process.env.AMBIENT_SIGNAL_CLI_PATH = join(workspacePath, "missing-signal-cli");
      process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = signalProfileRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("signal readiness").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async () => ({ allowed: true, mode: "allow_once" }),
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;
      const lifecycleApply = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_lifecycle_apply")!;
      const conversationDirectory = registeredTools.find((tool) => tool.name === "ambient_messaging_conversation_directory_preview")!;
      const signalDirectoryPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_conversation_directory_preview")!;
      const signalDirectoryApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_conversation_directory_apply")!;
      const signalUnreadPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_unread_window_preview")!;
      const signalUnreadStatus = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_unread_window_status")!;
      const signalRealUnreadPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_unread_window_preview")!;
      const signalRealUnreadApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_unread_window_apply")!;
      const signalRealPollingStatus = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_polling_status")!;
      const signalRealPollingPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_polling_preview")!;
      const signalRealPollingApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_polling_apply")!;
      const signalBridgeReplyPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_bridge_reply_preview")!;
      const signalBridgeReplyApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_bridge_reply_apply")!;
      const signalBindingReadinessPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_binding_readiness_preview")!;
      const signalOwnerHandoffPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_owner_handoff_preview")!;
      const signalOwnerHandoffApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_owner_handoff_apply")!;
      const signalRemoteSurfacePreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_remote_surface_preview")!;
      const signalRemoteSurfaceApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_remote_surface_apply")!;
      const bindingPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_binding_preview")!;
      const eventPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_event_preview")!;

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Signal (signal-cli)");
      expect(gatewayStatus.content[0].text).toContain("Signal real polling runner status");
      expect(gatewayStatus.content[0].text).toContain("Signal outbound reply contract status");
      expect(gatewayStatus.content[0].text).toContain("Readiness: unavailable");
      expect(gatewayStatus.content[0].text).toContain("Signal readiness performs redacted local preflight");
      expect(gatewayStatus.content[0].text).toContain("Signal typed Remote Ambient Surface binding metadata may be persisted");
      expect(gatewayStatus.details.providers.find((provider: any) => provider.providerId === "signal-cli")).toMatchObject({
        state: "stopped",
        mode: "none",
        readiness: {
          status: "unavailable",
          configured: true,
          bridgeReachable: false,
          apiCredentialsPresent: false,
          persistedSessionCount: 1,
        },
      });
      expect(JSON.stringify(gatewayStatus.details.providers.find((provider: any) => provider.providerId === "signal-cli"))).not.toContain("+15551234567");

      const signalLifecycle = await lifecycleApply.execute("signal-start", {
        action: "start",
        providerId: "signal-cli",
        mode: "synthetic",
      });
      expect(signalLifecycle.details).toMatchObject({
        status: "blocked",
        providerId: "signal-cli",
        applied: false,
        applyStatus: "blocked",
        blockedReason: "Messaging provider lifecycle is not implemented for signal-cli.",
      });

      const signalDirectory = await conversationDirectory.execute("signal-directory", {
        providerId: "signal-cli",
        purpose: "remote_ambient_surface",
      });
      expect(signalDirectory.content[0].text).toContain("Ambient messaging conversation directory preview: blocked");
      expect(signalDirectory.content[0].text).toContain("Provider directory tool: ambient_messaging_signal_conversation_directory_preview");
      expect(signalDirectory.content[0].text).toContain("Directory mode: planned");
      expect(signalDirectory.details).toMatchObject({
        status: "blocked",
        providers: [{
          providerId: "signal-cli",
          canListProviderConversationsNow: false,
          knownConversations: [],
        }],
      });

      const signalTypedPreview = await signalDirectoryPreview.execute("signal-directory-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        purpose: "remote_ambient_surface",
        query: "owner",
        limit: 5,
      });
      expect(signalTypedPreview.content[0].text).toContain("Signal conversation directory preview: blocked");
      expect(signalTypedPreview.content[0].text).toContain("Runs provider CLI: no");
      expect(signalTypedPreview.content[0].text).toContain("Signal session metadata contract: signal-local-bridge-session-metadata");
      expect(signalTypedPreview.content[0].text).toContain("Signal readiness performs redacted local preflight");
      expect(signalTypedPreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        profileId: "owner",
        providerDirectoryApplyTool: "ambient_messaging_signal_conversation_directory_apply",
        safety: {
          readsProviderMessages: false,
          runsProviderCli: false,
          inspectsSignalDesktop: false,
        },
        adapterExecution: {
          kind: "messaging-conversation-directory-adapter-execution",
          executionStatus: "preview",
          adapterStatus: "available",
          adapterKind: "live-metadata-only-adapter",
          requiresApprovalForApply: true,
          approvalRecorded: false,
          failureMode: "bridge-unreachable",
        },
      });

      const signalTypedApply = await signalDirectoryApply.execute("signal-directory-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        purpose: "remote_ambient_surface",
        query: "owner",
        limit: 5,
      });
      expect(signalTypedApply.content[0].text).toContain("Signal conversation directory result: blocked");
      expect(signalTypedApply.content[0].text).toContain("Returned conversations: 0");
      expect(signalTypedApply.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        failureMode: "bridge-unreachable",
        conversations: [],
        adapterExecution: {
          kind: "messaging-conversation-directory-adapter-execution",
          executionStatus: "blocked",
          adapterStatus: "available",
          adapterKind: "live-metadata-only-adapter",
          requiresApprovalForApply: true,
          approvalRecorded: false,
          failureMode: "bridge-unreachable",
        },
      });

      const signalUnread = await signalUnreadPreview.execute("signal-unread-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalUnread.content[0].text).toContain("Signal bounded unread-window preview");
      expect(signalUnread.content[0].text).toContain("Apply tool: ambient_messaging_signal_unread_window_apply");
      expect(signalUnread.content[0].text).toContain("Returns provider message bodies to Pi: no");
      expect(signalUnread.details).toMatchObject({
        status: "blocked",
        previewOnly: true,
        canApplyNow: false,
        applyToolName: "ambient_messaging_signal_unread_window_apply",
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          sendsProviderMessages: false,
        },
      });

      const signalUnreadDiagnostics = await signalUnreadStatus.execute("signal-unread-status", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
      });
      expect(signalUnreadDiagnostics.content[0].text).toContain("Signal unread-window status");
      expect(signalUnreadDiagnostics.content[0].text).toContain("Real Signal unread ingestion enabled: no");
      expect(signalUnreadDiagnostics.content[0].text).toContain("Returns provider message bodies to Pi: no");
      expect(signalUnreadDiagnostics.details).toMatchObject({
        status: "blocked",
        fakeBridgeApplyEnabled: false,
        realBridgeUnreadEnabled: false,
        selectedBindingCount: 0,
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          sendsProviderMessages: false,
        },
      });

      const signalRealUnread = await signalRealUnreadPreview.execute("signal-real-unread-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalRealUnread.content[0].text).toContain("Signal real unread-window preview: blocked");
      expect(signalRealUnread.content[0].text).toContain("Approval required before apply: yes");
      expect(signalRealUnread.content[0].text).toContain("Contacts bridge unread endpoint: no");
      expect(signalRealUnread.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        approvalRequired: true,
        applyToolName: "ambient_messaging_signal_real_unread_window_apply",
        safety: {
          requestsApproval: false,
          contactsBridgeUnreadEndpoint: false,
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          sendsProviderMessages: false,
        },
      });

      const signalRealUnreadBlocked = await signalRealUnreadApply.execute("signal-real-unread-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalRealUnreadBlocked.content[0].text).toContain("Signal real unread-window apply");
      expect(signalRealUnreadBlocked.content[0].text).toContain("Approval requested: no");
      expect(signalRealUnreadBlocked.content[0].text).toContain("Polled: no");
      expect(signalRealUnreadBlocked.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        approvalRequested: false,
        approvalRecorded: false,
        polled: false,
        fetchedMessageCount: 0,
        safety: {
          requestsApproval: false,
          contactsBridgeUnreadEndpoint: false,
          readsProviderUnreadMessages: false,
          sendsProviderMessages: false,
        },
      });

      const signalPollingStatus = await signalRealPollingStatus.execute("signal-real-polling-status", {});
      expect(signalPollingStatus.content[0].text).toContain("Signal real polling runner status");
      expect(signalPollingStatus.content[0].text).toContain("Background loop implemented: yes");
      expect(signalPollingStatus.content[0].text).toContain("Running: no");
      expect(signalPollingStatus.details.signalRealPolling).toMatchObject({
        runnerState: "stopped",
        running: false,
        backgroundLoopImplemented: true,
      });

      const signalPollingPreview = await signalRealPollingPreview.execute("signal-real-polling-preview", {
        action: "start",
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalPollingPreview.content[0].text).toContain("Signal real polling start preview");
      expect(signalPollingPreview.content[0].text).toContain("Background loop implemented: yes");
      expect(signalPollingPreview.content[0].text).toContain("Reads provider unread messages: no");
      expect(signalPollingPreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        approvalRequired: false,
        safety: {
          startsTimer: false,
          readsProviderUnreadMessages: false,
          sendsProviderMessages: false,
        },
      });

      const signalPollingBlocked = await signalRealPollingApply.execute("signal-real-polling-apply", {
        action: "start",
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalPollingBlocked.content[0].text).toContain("Signal real polling start apply");
      expect(signalPollingBlocked.content[0].text).toContain("Apply status: blocked");
      expect(signalPollingBlocked.content[0].text).toContain("Immediate poll attempted: no");
      expect(signalPollingBlocked.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        immediatePollAttempted: false,
      });

      const signalReplyPreview = await signalBridgeReplyPreview.execute("signal-bridge-reply-preview", {
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        replyToMessageId: "message-1",
        text: "status update",
      });
      expect(signalReplyPreview.content[0].text).toContain("Signal bridge reply preview");
      expect(signalReplyPreview.content[0].text).toContain("Sends provider messages: no");
      expect(signalReplyPreview.content[0].text).toContain("Bridge approvedReplySend capability: no");
      expect(signalReplyPreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        approvalRequired: true,
        futureApprovalRequired: true,
        safety: {
          requestsApproval: false,
          sendsProviderMessages: false,
          readsProviderMessages: false,
          usesReviewedBridgeSendContract: false,
        },
      });

      const signalReplyBlocked = await signalBridgeReplyApply.execute("signal-bridge-reply-apply", {
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        replyToMessageId: "message-1",
        text: "status update",
      });
      expect(signalReplyBlocked.content[0].text).toContain("Apply result:");
      expect(signalReplyBlocked.content[0].text).toContain("Apply status: blocked");
      expect(signalReplyBlocked.content[0].text).toContain("Approval requested: no");
      expect(signalReplyBlocked.content[0].text).toContain("Sent: no");
      expect(signalReplyBlocked.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        approvalRequested: false,
        approvalRecorded: false,
        sent: false,
        safety: {
          requestsApproval: false,
          sendsProviderMessages: false,
        },
      });

      const signalBindingReadiness = await signalBindingReadinessPreview.execute("signal-binding-readiness-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: 5,
      });
      expect(signalBindingReadiness.content[0].text).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
      expect(signalBindingReadiness.content[0].text).toContain("Generic binding apply allowed: no");
      expect(signalBindingReadiness.content[0].text).toContain("Telegram owner handoff allowed: no");
      expect(signalBindingReadiness.content[0].text).toContain("Owner authentication: missing");
      expect(signalBindingReadiness.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
        genericBindingApplyAllowed: false,
        telegramOwnerHandoffAllowed: false,
        safety: {
          mutatesBindings: false,
          readsProviderMessages: false,
          usesTelegramOwnerHandoff: false,
        },
      });

      const signalOwnerHandoff = await signalOwnerHandoffPreview.execute("signal-owner-handoff-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        setupCode: "ambient-signal-setup-code-12345",
        limit: 5,
      });
      expect(signalOwnerHandoff.content[0].text).toContain("Signal owner handoff preview: blocked");
      expect(signalOwnerHandoff.content[0].text).toContain("Typed apply tool: ambient_messaging_signal_owner_handoff_apply");
      expect(signalOwnerHandoff.content[0].text).toContain("Binding apply tool: none");
      expect(signalOwnerHandoff.content[0].text).toContain("Reads Signal unread messages now: no");
      expect(signalOwnerHandoff.content[0].text).toContain("Uses Telegram owner handoff: no");
      expect(signalOwnerHandoff.content[0].text).not.toContain("ambient-signal-setup-code-12345");
      expect(signalOwnerHandoff.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        typedApplyTool: "ambient_messaging_signal_owner_handoff_apply",
        bindingApplyTool: "none",
        setupCodePreview: "31 chars",
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageContent: false,
          createsBinding: false,
          usesTelegramOwnerHandoff: false,
        },
      });

      const signalOwnerApply = await signalOwnerHandoffApply.execute("signal-owner-handoff-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        setupCode: "ambient-signal-setup-code-12345",
        limit: 5,
      });
      expect(signalOwnerApply.content[0].text).toContain("Signal owner handoff apply: blocked");
      expect(signalOwnerApply.content[0].text).toContain("Handoff status: not-attempted");
      expect(signalOwnerApply.content[0].text).toContain("Can feed binding apply: no");
      expect(signalOwnerApply.content[0].text).toContain("Reads Signal unread messages: no");
      expect(signalOwnerApply.content[0].text).not.toContain("ambient-signal-setup-code-12345");
      expect(signalOwnerApply.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        handoffStatus: "not-attempted",
        approvalRequested: false,
        approvalRecorded: false,
        canFeedBindingApply: false,
        bindingApplyInputReady: false,
        failureMode: "fake-bridge-apply-disabled",
        fetchedMessageCount: 0,
        matchedSenderCount: 0,
        initialSeenMessageIds: [],
        safety: {
          readsProviderUnreadMessages: false,
          returnsMatchedSenderId: false,
          returnsProviderMessageContent: false,
          createsBinding: false,
          usesTelegramOwnerHandoff: false,
        },
      });
      expect("ownerUserId" in signalOwnerApply.details).toBe(false);

      const signalRemotePreview = await signalRemoteSurfacePreview.execute("signal-remote-surface-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ownerHandoffSourceMessageId: "signal-owner-setup-message",
        initialSeenMessageIds: ["signal-owner-setup-message", "signal-owner-other-message"],
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: 5,
      });
      expect(signalRemotePreview.content[0].text).toContain("Signal Remote Ambient Surface binding preview blocked");
      expect(signalRemotePreview.content[0].text).toContain("Generic binding apply allowed: no");
      expect(signalRemotePreview.content[0].text).toContain("Uses Telegram owner handoff: no");
      expect(signalRemotePreview.content[0].text).toContain("Persists binding: no");
      expect(signalRemotePreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
        genericBindingApplyAllowed: false,
        telegramOwnerHandoffAllowed: false,
        ownerHandoffSourceMessageId: "signal-owner-setup-message",
        initialSeenMessageIds: ["signal-owner-setup-message", "signal-owner-other-message"],
        safety: {
          mutatesBindings: false,
          persistsBinding: false,
          usesGenericBindingApply: false,
          usesTelegramOwnerHandoff: false,
        },
      });

      const signalRemoteApply = await signalRemoteSurfaceApply.execute("signal-remote-surface-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ownerHandoffSourceMessageId: "signal-owner-setup-message",
        initialSeenMessageIds: ["signal-owner-setup-message", "signal-owner-other-message"],
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: 5,
      });
      expect(signalRemoteApply.content[0].text).toContain("Signal Remote Ambient Surface binding blocked");
      expect(signalRemoteApply.content[0].text).toContain("Can feed future binding lifecycle: yes");
      expect(signalRemoteApply.content[0].text).toContain("Persisted: no");
      expect(signalRemoteApply.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        approvalRequested: false,
        approvalRecorded: false,
        persisted: false,
        canFeedFutureBindingLifecycle: true,
        bindingApplyInputReady: false,
        failureMode: "readiness-blocked",
      });

      const signalBindingPreview = await bindingPreview.execute("signal-binding-preview", {
        action: "create",
        providerId: "signal-cli",
        authProfileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(signalBindingPreview.content[0].text).toContain("Remote Ambient Surface binding preview: blocked");
      expect(signalBindingPreview.content[0].text).toContain("Typed preview tool: ambient_messaging_signal_remote_surface_preview");
      expect(signalBindingPreview.content[0].text).toContain("Typed apply tool: ambient_messaging_signal_remote_surface_apply");
      expect(signalBindingPreview.content[0].text).toContain("Provider implementation is planned");
      expect(signalBindingPreview.details).toMatchObject({
        status: "blocked",
        providerId: "signal-cli",
        canApplyNow: false,
        bindingLifecycleEnabled: true,
        purposeSupported: true,
      });

      const signalEventPreview = await eventPreview.execute("signal-event-preview", {
        providerId: "signal-cli",
        authProfileId: "owner",
        conversationId: "signal-owner-chat",
        senderId: "owner-signal",
        text: "status",
      });
      expect(signalEventPreview.content[0].text).toContain("Remote Ambient Surface inbound event preview: blocked");
      expect(signalEventPreview.content[0].text).toContain("Typed route tool: none");
      expect(signalEventPreview.content[0].text).toContain("Provider inbound ingestion is disabled");
      expect(signalEventPreview.details).toMatchObject({
        status: "blocked",
        providerId: "signal-cli",
        canRouteWithTypedTool: false,
        inboundIngestionEnabled: false,
        purposeSupported: true,
      });
    } finally {
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
      else process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.apiId === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.apiId;
      if (originalEnv.apiHash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.apiHash;
      if (originalEnv.signalCliPath === undefined) delete process.env.AMBIENT_SIGNAL_CLI_PATH;
      else process.env.AMBIENT_SIGNAL_CLI_PATH = originalEnv.signalCliPath;
      if (originalEnv.signalCliConfigDir === undefined) delete process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR;
      else process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = originalEnv.signalCliConfigDir;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("applies Signal setup metadata without enabling Signal runtime actions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-signal-session-"));
    const signalConfigDir = join(workspacePath, "signal-cli-config");
    const store = new ProjectStore();
    try {
      await mkdir(signalConfigDir, { recursive: true });
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("signal session setup").id, { permissionMode: "workspace" });
      const permissionRequester = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const preview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_session_preview")!;
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_session_apply")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const previewResult = await preview.execute("signal-session-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        signalCliConfigDir: signalConfigDir,
      });
      expect(previewResult.content[0].text).toContain("Signal session setup preview");
      expect(previewResult.content[0].text).toContain("Runs signal-cli: no");
      expect(previewResult.content[0].text).toContain("Reads Signal messages: no");
      expect(previewResult.details).toMatchObject({
        providerId: "signal-cli",
        profileId: "owner",
        canApplyNow: true,
        wouldRunProviderCli: false,
        wouldInspectSignalDesktop: false,
      });

      const applyResult = await apply.execute("signal-session-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        signalCliConfigDir: signalConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
      });
      expect(permissionRequester).toHaveBeenCalledTimes(1);
      expect(applyResult.content[0].text).toContain("Signal session setup apply");
      expect(applyResult.content[0].text).toContain("Apply status: applied");
      expect(applyResult.content[0].text).toContain("Bridge session readable: no");
      expect(applyResult.details).toMatchObject({
        providerId: "signal-cli",
        profileId: "owner",
        applyStatus: "applied",
        applied: true,
        bridgeSessionReadable: false,
      });
      const metadata = JSON.parse(await readFile(join(workspacePath, ".ambient-agent-state", "signal", "owner", "bridge-session.json"), "utf8"));
      expect(metadata).toMatchObject({
        profileId: "owner",
        signalCliConfigDir: signalConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: false,
      });
      expect(JSON.stringify(applyResult)).not.toContain("phoneNumber");
      expect(JSON.stringify(applyResult)).not.toContain("sessionKeys");

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Signal (signal-cli)");
      expect(gatewayStatus.content[0].text).toContain("Persisted sessions: 1");
      expect(gatewayStatus.content[0].text).toContain("Signal session metadata exists, but it is not yet sufficient");
      expect(gatewayStatus.details.providers.find((provider: any) => provider.providerId === "signal-cli")).toMatchObject({
        readiness: {
          status: "unavailable",
          configured: false,
          persistedSessionCount: 1,
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
