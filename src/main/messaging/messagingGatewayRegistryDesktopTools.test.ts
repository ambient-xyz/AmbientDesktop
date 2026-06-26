import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors, messagingGatewayToolDescriptor } from "./messagingDesktopToolsTestFacade";

describe("messaging gateway registry desktop tool descriptors", () => {
  it("exposes messaging tools in the first-party desktop tool registry", () => {
    const tools = firstPartyDesktopToolDescriptors().map((tool) => tool.name);

    expect(tools).toContain("ambient_messaging_list_providers");
    expect(tools).toContain("ambient_messaging_provider_status");
    expect(tools).toContain("ambient_messaging_remote_surface_activation_plan");
    expect(tools).toContain("ambient_messaging_remote_surface_provider_support_plan");
    expect(tools).toContain("ambient_messaging_telegram_owner_loop_activation_plan");
    expect(tools).toContain("ambient_messaging_telegram_session_preview");
    expect(tools).toContain("ambient_messaging_telegram_session_apply");
    expect(tools).toContain("ambient_messaging_signal_session_preview");
    expect(tools).toContain("ambient_messaging_signal_session_apply");
    expect(tools).toContain("ambient_messaging_list_bindings");
    expect(tools).toContain("ambient_messaging_conversation_directory_preview");
    expect(tools).toContain("ambient_messaging_telegram_conversation_directory_preview");
    expect(tools).toContain("ambient_messaging_telegram_conversation_directory_apply");
    expect(tools).toContain("ambient_messaging_telegram_owner_handoff_preview");
    expect(tools).toContain("ambient_messaging_telegram_owner_handoff_apply");
    expect(tools).toContain("ambient_messaging_signal_conversation_directory_preview");
    expect(tools).toContain("ambient_messaging_signal_conversation_directory_apply");
    expect(tools).toContain("ambient_messaging_signal_unread_window_preview");
    expect(tools).toContain("ambient_messaging_signal_unread_window_apply");
    expect(tools).toContain("ambient_messaging_signal_unread_window_status");
    expect(tools).toContain("ambient_messaging_signal_real_unread_window_preview");
    expect(tools).toContain("ambient_messaging_signal_real_unread_window_apply");
    expect(tools).toContain("ambient_messaging_signal_real_polling_status");
    expect(tools).toContain("ambient_messaging_signal_real_polling_preview");
    expect(tools).toContain("ambient_messaging_signal_real_polling_apply");
    expect(tools).toContain("ambient_messaging_signal_bridge_reply_preview");
    expect(tools).toContain("ambient_messaging_signal_bridge_reply_apply");
    expect(tools).toContain("ambient_messaging_signal_relay_diagnostics");
    expect(tools).toContain("ambient_messaging_signal_binding_readiness_preview");
    expect(tools).toContain("ambient_messaging_signal_owner_handoff_preview");
    expect(tools).toContain("ambient_messaging_signal_owner_handoff_apply");
    expect(tools).toContain("ambient_messaging_signal_remote_surface_preview");
    expect(tools).toContain("ambient_messaging_signal_remote_surface_apply");
    expect(tools).toContain("ambient_messaging_headless_ux_inventory");
    expect(tools).toContain("ambient_messaging_binding_preview");
    expect(tools).toContain("ambient_messaging_binding_apply");
    expect(tools).toContain("ambient_messaging_remote_surface_binding_preview");
    expect(tools).toContain("ambient_messaging_remote_surface_event_preview");
    expect(tools).toContain("ambient_messaging_telegram_remote_surface_preview");
    expect(tools).toContain("ambient_messaging_telegram_remote_surface_apply");
    expect(tools).toContain("ambient_runtime_surface_snapshot");
    expect(tools).toContain("ambient_messaging_synthetic_route");
    expect(tools).toContain("ambient_messaging_telegram_bridge_event_route");
    expect(tools).toContain("ambient_messaging_telegram_bridge_poll_preview");
    expect(tools).toContain("ambient_messaging_telegram_bridge_poll_apply");
    expect(tools).toContain("ambient_messaging_telegram_bridge_polling_status");
    expect(tools).toContain("ambient_messaging_telegram_bridge_polling_preview");
    expect(tools).toContain("ambient_messaging_telegram_bridge_polling_apply");
    expect(tools).toContain("ambient_messaging_telegram_bridge_reply_preview");
    expect(tools).toContain("ambient_messaging_telegram_bridge_reply_apply");
    expect(tools).toContain("ambient_messaging_remote_surface_reply_preview");
    expect(tools).toContain("ambient_messaging_remote_surface_reply_apply");
    expect(tools).toContain("ambient_messaging_telegram_relay_diagnostics");
    expect(tools).toContain("ambient_messaging_remote_surface_command_preview");
    expect(tools).toContain("ambient_messaging_remote_surface_command_apply");
    expect(tools).toContain("ambient_messaging_gateway_status");
    expect(tools).toContain("ambient_messaging_gateway_lifecycle_preview");
    expect(tools).toContain("ambient_messaging_gateway_lifecycle_apply");
    expect(messagingGatewayToolDescriptor("ambient_messaging_list_providers")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-provider-read",
      runtimeSupport: ["chat", "workflow"],
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-activation-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain(
      "call that activation plan next before low-level lifecycle",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").description).toContain(
      "Telegram, Signal, or another provider",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain(
      "including requests that explicitly say Telegram, Signal",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain(
      "unsupported_provider repair/status prompts",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-provider-support-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").promptGuidelines.join("\n")).toContain(
      "unsupported_provider",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").promptGuidelines.join("\n")).toContain(
      "Signal Desktop being installed is not a Remote Ambient Surface activation route",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").description).toContain(
      "adapter requirements",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-owner-loop-activation-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan").promptGuidelines.join("\n")).toContain(
      "provider readiness, metadata-only directory, exact setup-code owner handoff",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan").promptGuidelines.join("\n")).toContain(
      "call ambient_messaging_remote_surface_activation_plan first",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_list_bindings")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-binding-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_conversation_directory_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-conversation-directory-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_conversation_directory_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-conversation-directory-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_conversation_directory_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-conversation-directory-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_handoff_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-owner-handoff-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_handoff_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-owner-handoff-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_conversation_directory_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-conversation-directory-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_conversation_directory_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-conversation-directory-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-unread-window-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-unread-window-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-unread-window-status-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_unread_window_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-real-unread-window-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_unread_window_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-real-unread-window-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-real-polling-status-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-real-polling-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-real-polling-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-bridge-reply-preview",
    });
    const signalReplyPreviewSchema = messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_preview").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(signalReplyPreviewSchema.properties).toHaveProperty("runtimeEventId");
    expect(signalReplyPreviewSchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_apply")).toMatchObject({
      sideEffects: "write-external",
      permissionScope: "messaging-signal-bridge-reply-apply",
      supportsDryRun: false,
    });
    const signalReplyApplySchema = messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_apply").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(signalReplyApplySchema.properties).toHaveProperty("runtimeEventId");
    expect(signalReplyApplySchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_relay_diagnostics")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-relay-diagnostics-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_binding_readiness_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-binding-readiness-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_owner_handoff_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-owner-handoff-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_owner_handoff_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-owner-handoff-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_remote_surface_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-remote-surface-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_remote_surface_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-signal-remote-surface-write",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_session_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-session-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_session_apply")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "messaging-telegram-session-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_session_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-session-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_session_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-signal-session-apply",
    });
    const telegramApplySchema = messagingGatewayToolDescriptor("ambient_messaging_telegram_session_apply").inputSchema as {
      properties: Record<string, unknown>;
    };
    expect(telegramApplySchema.properties).not.toHaveProperty("code");
    expect(telegramApplySchema.properties).not.toHaveProperty("password");
    expect(messagingGatewayToolDescriptor("ambient_messaging_binding_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-binding-write",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_binding_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-binding-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_event_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-event-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_remote_surface_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-remote-surface-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_remote_surface_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-telegram-remote-surface-write",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_synthetic_route")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-synthetic-route-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_event_route")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-event-route",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-poll-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-bridge-poll-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply").promptGuidelines.join("\n")).toContain(
      "Use one-shot polling",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply").promptGuidelines.join("\n")).toContain(
      "prefer the periodic polling preview/apply tools",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-polling-status",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-polling-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview").promptGuidelines.join("\n")).toContain(
      "Use periodic polling when the owner wants an ongoing Remote Ambient Surface loop",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview").promptGuidelines.join("\n")).toContain(
      "pass minReceivedAt set to the activation/command boundary",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-bridge-polling-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_apply").promptGuidelines.join("\n")).toContain(
      "Use periodic polling only for an ongoing owner Remote Ambient Surface loop",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-reply-preview",
    });
    const telegramReplyPreviewSchema = messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_preview").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(telegramReplyPreviewSchema.properties).toHaveProperty("runtimeEventId");
    expect(telegramReplyPreviewSchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_apply")).toMatchObject({
      sideEffects: "write-external",
      permissionScope: "messaging-telegram-bridge-reply-apply",
    });
    const telegramReplyApplySchema = messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_apply").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(telegramReplyApplySchema.properties).toHaveProperty("runtimeEventId");
    expect(telegramReplyApplySchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_reply_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-reply-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_reply_apply")).toMatchObject({
      sideEffects: "write-external",
      permissionScope: "messaging-remote-surface-reply-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_relay_diagnostics")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-relay-diagnostics-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_command_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-command-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_command_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-remote-surface-command-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_gateway_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-gateway-status-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_gateway_lifecycle_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-gateway-lifecycle-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_gateway_lifecycle_apply")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "messaging-gateway-lifecycle-apply",
    });
  });
});
