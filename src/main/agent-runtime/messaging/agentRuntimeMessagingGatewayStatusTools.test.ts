import { describe, expect, it } from "vitest";

import {
  createMessagingGatewayStatusResolvers,
  registerMessagingGatewayStatusTools,
} from "./agentRuntimeMessagingGatewayStatusTools";
import { createDefaultMessagingProviderRegistry } from "../../messagingGatewayRegistry";
import { SignalRealPollingRunner } from "../../signalRealPolling";
import { TelegramBridgePollingRunner } from "../../telegramBridgePolling";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerMessagingGatewayStatusTools", () => {
  it("registers and executes the messaging gateway status tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const refreshCalls: string[] = [];
    const bindingListInputs: unknown[] = [];
    const providers = createDefaultMessagingProviderRegistry();
    const telegramBridgePollingRunner = new TelegramBridgePollingRunner({
      now: () => new Date("2026-05-30T00:00:00.000Z"),
    });
    const signalRealPollingRunner = new SignalRealPollingRunner({
      now: () => new Date("2026-05-30T00:00:00.000Z"),
    });
    const bindingList = {
      bindings: [],
      bindingCount: 0,
      activeBindingCount: 0,
      remoteAmbientSurfaceCount: 0,
      messagingConnectorCount: 0,
      headlessSafeBindingCount: 0,
    };
    const runtimeStatus = {
      status: "idle" as const,
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
    };
    const gatewayStatus = createMessagingGatewayStatusResolvers({
      bindings: {
        list: (input) => {
          bindingListInputs.push(input);
          return bindingList;
        },
      },
      gatewayRunner: {
        refreshProviderReadiness: async () => {
          refreshCalls.push("all");
        },
      },
      runtimeStatus: () => runtimeStatus,
      telegramBridgePollingRunner,
      signalRealPollingRunner,
      signalProviderDescriptor: () => providers.get("signal-cli")?.descriptor,
    });

    registerMessagingGatewayStatusTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, gatewayStatus);

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_gateway_status",
    ]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("gateway-status", {});

    expect(refreshCalls).toEqual(["all"]);
    expect(bindingListInputs).toEqual([
      { includeInactive: false },
      { includeInactive: false },
    ]);
    expect(result.content[0].text).toContain("Ambient messaging gateway runtime");
    expect(result.content[0].text).toContain("Telegram bridge polling runner status");
    expect(result.content[0].text).toContain("Signal real polling runner status");
    expect(result.content[0].text).toContain("Signal outbound reply contract status");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_gateway_status",
      status: "complete",
      gatewayState: "idle",
      providerCount: 0,
      telegramBridgePolling: {
        providerId: "telegram-tdlib",
        state: "stopped",
        running: false,
      },
      signalRealPolling: {
        providerId: "signal-cli",
        runnerState: "stopped",
        running: false,
      },
      signalBridgeReply: {
        providerId: "signal-cli",
        status: "blocked",
      },
    });
  });
});
