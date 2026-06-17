import { describe, expect, it } from "vitest";

import { registerTelegramRelayDiagnosticsTools } from "./agentRuntimeTelegramRelayDiagnosticsTools";
import { createMessagingRelayDiagnosticsResolvers } from "../agentRuntimeRelayDiagnosticsResolvers";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramRelayDiagnosticsTools", () => {
  it("registers and executes the Telegram relay diagnostics tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const refreshCalls: string[] = [];
    const bindingListInputs: unknown[] = [];
    const relayDiagnostics = createMessagingRelayDiagnosticsResolvers({
      bindings: {
        list: (input) => {
          bindingListInputs.push(input);
          return {
            bindings: [],
            bindingCount: 0,
            activeBindingCount: 0,
            remoteAmbientSurfaceCount: 0,
            messagingConnectorCount: 0,
            headlessSafeBindingCount: 0,
          };
        },
      },
      gatewayRunner: {
        refreshProviderReadiness: async (providerId) => {
          refreshCalls.push(providerId);
        },
      },
      runtimeStatus: () => ({
        status: "idle",
        providerCount: 0,
        activeProviderCount: 0,
        syntheticActiveProviderCount: 0,
        queuedProjectionCount: 0,
        recentEventCount: 0,
        outboundDeliveryCount: 0,
        providers: [],
        queuedProjections: [],
        recentOutboundDeliveries: [],
        recentEvents: [],
      }),
    });

    registerTelegramRelayDiagnosticsTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, relayDiagnostics.telegram);

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_telegram_relay_diagnostics",
    ]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("telegram-relay-diagnostics", {
      profileId: " owner-profile ",
      conversationId: " owner-chat ",
    });

    expect(refreshCalls).toEqual(["telegram-tdlib"]);
    expect(bindingListInputs).toEqual([{ includeInactive: false }]);
    expect(result.content[0].text).toContain("Remote Ambient Surface relay diagnostics");
    expect(result.content[0].text).toContain("Provider: Telegram (telegram-tdlib)");
    expect(result.content[0].text).toContain("Status: blocked");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_telegram_relay_diagnostics",
      providerId: "telegram-tdlib",
      providerLabel: "Telegram",
      status: "blocked",
      blockers: [
        "Telegram provider runtime is not registered in the messaging gateway.",
        "Telegram readiness has not been refreshed.",
        "No active Telegram Remote Ambient Surface owner binding matches the requested profile/conversation.",
      ],
      safety: {
        readsProviderMessages: false,
        sendsProviderMessages: false,
        startsBridge: false,
        readsProviderHistory: false,
        mutatesBindings: false,
      },
    });
  });
});
