import { describe, expect, it } from "vitest";

import { registerTelegramBridgePollingStatusTools } from "./agentRuntimeTelegramBridgePollingStatusTools";
import { TelegramBridgePollingRunner } from "./telegramBridgePolling";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgePollingStatusTools", () => {
  it("registers and executes the Telegram bridge polling status tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const telegramBridgePollingRunner = new TelegramBridgePollingRunner({
      now: () => new Date("2026-05-22T00:00:00.000Z"),
    });

    registerTelegramBridgePollingStatusTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      telegramBridgePollingRunner,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_telegram_bridge_polling_status",
    ]);

    const result = await registeredTools[0]!.execute("telegram-bridge-polling-status", {});
    expect(result.content[0].text).toContain("Telegram bridge polling runner status");
    expect(result.content[0].text).toContain("State: stopped");
    expect(result.content[0].text).toContain("Running: no");
    expect(result.content[0].text).toContain("Polling never sends Telegram messages.");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_telegram_bridge_polling_status",
      status: "complete",
      telegramBridgePolling: {
        providerId: "telegram-tdlib",
        state: "stopped",
        running: false,
        limit: 10,
        intervalMs: 30000,
        selectedBindingCount: 0,
        totalPollCount: 0,
        successfulPollCount: 0,
        failedPollCount: 0,
      },
    });
  });
});
