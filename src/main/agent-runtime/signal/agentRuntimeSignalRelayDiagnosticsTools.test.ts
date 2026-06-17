import { describe, expect, it } from "vitest";

import { registerSignalRelayDiagnosticsTools } from "./agentRuntimeSignalRelayDiagnosticsTools";
import { createMessagingRelayDiagnosticsResolvers } from "../agentRuntimeRelayDiagnosticsResolvers";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerSignalRelayDiagnosticsTools", () => {
  it("registers and executes the Signal relay diagnostics tool after best-effort readiness refresh", async () => {
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
          throw new Error("Signal bridge unavailable during diagnostics refresh.");
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

    registerSignalRelayDiagnosticsTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, relayDiagnostics.signal);

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_signal_relay_diagnostics",
    ]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("signal-relay-diagnostics", {
      authProfileId: " owner-profile ",
      conversationId: " owner-chat ",
    });

    expect(refreshCalls).toEqual(["signal-cli"]);
    expect(bindingListInputs).toEqual([{ includeInactive: false }]);
    expect(result.content[0].text).toContain("Remote Ambient Surface relay diagnostics");
    expect(result.content[0].text).toContain("Provider: Signal (signal-cli)");
    expect(result.content[0].text).toContain("Status: blocked");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_relay_diagnostics",
      providerId: "signal-cli",
      providerLabel: "Signal",
      status: "blocked",
      blockers: [
        "Signal provider runtime is not registered in the messaging gateway.",
        "Signal readiness has not been refreshed.",
        "No active Signal Remote Ambient Surface owner binding matches the requested profile/conversation.",
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
