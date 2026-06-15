import { describe, expect, it } from "vitest";

import {
  messagingGatewayLifecyclePreviewInput,
  registerMessagingGatewayLifecyclePreviewTools,
  type MessagingGatewayLifecyclePreviewInput,
} from "./agentRuntimeMessagingGatewayLifecyclePreviewTools";
import { createMessagingGatewayLifecycleResolvers } from "./agentRuntimeMessagingGatewayLifecycleResolvers";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerMessagingGatewayLifecyclePreviewTools", () => {
  it("registers and executes the messaging gateway lifecycle preview tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const refreshCalls: string[] = [];
    const previewInputs: MessagingGatewayLifecyclePreviewInput[] = [];
    const preview = {
      action: "start" as const,
      providerId: "telegram-tdlib",
      label: "Telegram",
      mode: "real" as const,
      approvalRequired: true,
      canApplyNow: true,
      wouldStartRealBridge: true,
      wouldStopRealBridge: false,
      wouldAttachExistingBridge: true,
      wouldLaunchBridgeProcess: false,
      wouldStopBridgeProcess: false,
      wouldDetachRunnerOnly: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
      policyNotes: ["Real provider bridge startup must be approval-gated."],
      nextSteps: ["Show the user provider consequences before approval."],
    };
    const gatewayLifecycle = createMessagingGatewayLifecycleResolvers({
      refreshProviderReadiness: async (providerId) => {
        refreshCalls.push(providerId);
      },
      previewLifecycle: (input) => {
        previewInputs.push(input);
        return preview;
      },
      applyLifecycle: async () => {
        throw new Error("lifecycle preview should not apply gateway lifecycle changes");
      },
    });

    registerMessagingGatewayLifecyclePreviewTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      refreshProviderReadiness: gatewayLifecycle.refreshProviderReadiness,
      previewLifecycle: gatewayLifecycle.previewLifecycle,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_gateway_lifecycle_preview",
    ]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("gateway-lifecycle-preview", {
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });

    expect(refreshCalls).toEqual(["telegram-tdlib"]);
    expect(previewInputs).toEqual([{
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    }]);
    expect(result.content[0].text).toContain("Ambient messaging gateway lifecycle start preview");
    expect(result.content[0].text).toContain("Provider: Telegram (telegram-tdlib)");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_gateway_lifecycle_preview",
      status: "complete",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRequired: true,
      wouldStartRealBridge: true,
    });
  });

  it("parses lifecycle preview input with current AgentRuntime semantics", () => {
    expect(messagingGatewayLifecyclePreviewInput({
      action: "stop",
      providerId: " signal-cli ",
    })).toEqual({
      action: "stop",
      providerId: " signal-cli ",
    });

    expect(() => messagingGatewayLifecyclePreviewInput({
      action: "restart",
      providerId: "signal-cli",
    })).toThrow("action must be start or stop.");
    expect(() => messagingGatewayLifecyclePreviewInput({
      action: "start",
    })).toThrow("providerId is required.");
    expect(() => messagingGatewayLifecyclePreviewInput({
      action: "start",
      providerId: "signal-cli",
      mode: "dry-run",
    })).toThrow("mode must be synthetic or real.");
  });
});
