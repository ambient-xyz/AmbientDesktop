import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { MessagingGatewayBridgeSupervisorStatus } from "../shared/messagingGateway";
import type { ThreadSummary, WorkspaceState } from "../shared/types";
import { registerTelegramSessionTools } from "./agentRuntimeTelegramSessionTools";

describe("registerTelegramSessionTools", () => {
  it("registers preview/apply tools and routes login codes through secure input", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-telegram-session-tools-"));
    const fetchRequests: Array<{ input: string; body?: Record<string, unknown> }> = [];
    const refreshProviderReadiness = vi.fn(async () => []);
    const startForSetup = vi.fn(async () => runningSupervisorStatus(workspacePath));
    const secureInputRequester = vi.fn(async (request) => {
      expect(request).toMatchObject({
        threadId: "thread-telegram",
        workspacePath,
        inputKind: "telegram_login_code",
        inputMode: "text",
        providerId: "telegram-tdlib",
        profileId: "owner",
      });
      expect(JSON.stringify(request)).not.toContain("86420");
      return { allowed: true, value: "86420" };
    });
    const resolveFirstPartyPluginPermission = vi.fn(async (request) => {
      expect(request.thread.id).toBe("thread-telegram");
      expect(request.toolName).toBe("ambient_messaging_telegram_session_apply");
      expect(request.detail).toContain("Secure input required: code");
      expect(request.detail).not.toContain("86420");
      return true;
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    try {
      registerTelegramSessionTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        threadId: "thread-telegram",
        workspace: { path: workspacePath, statePath: join(workspacePath, ".ambient") } as WorkspaceState,
        getThread: () => ({ id: "thread-telegram", permissionMode: "workspace" }) as ThreadSummary,
        resolveFirstPartyPluginPermission,
        gatewayRunner: { refreshProviderReadiness },
        telegramBridgeSupervisor: {
          status: () => runningSupervisorStatus(workspacePath),
          startForSetup,
        },
        secureInputs: {
          request: secureInputRequester,
        },
        bootstrapOptions: {
          env: {
            AMBIENT_AGENT_TELEGRAM_API_ID: "123",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-value",
          },
          now: () => new Date("2026-05-11T00:00:00.000Z"),
          fetchFn: async (input, init) => {
            fetchRequests.push({
              input,
              body: typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined,
            });
            return {
              ok: true,
              status: 200,
              statusText: "OK",
              json: async () => ({
                state: "ready",
                ready: true,
                needsCode: false,
                needsPassword: false,
              }),
            };
          },
        },
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_session_preview",
        "ambient_messaging_telegram_session_apply",
      ]);

      const preview = await toolByName(registeredTools, "ambient_messaging_telegram_session_preview").execute("preview", {
        action: "start_auth",
        providerId: "telegram-tdlib",
        profileId: "owner",
        phoneNumber: "+15551234567",
      });
      expect(preview.content[0].text).toContain("Telegram session bootstrap preview");
      expect(preview.content[0].text).toContain("Phone number present: yes");
      expect(preview.content[0].text).not.toContain("+15551234567");
      expect(JSON.stringify(preview.details)).not.toContain("hash-value");

      const result = await toolByName(registeredTools, "ambient_messaging_telegram_session_apply").execute("apply", {
        action: "submit_code",
        providerId: "telegram-tdlib",
        profileId: "owner",
      });

      expect(resolveFirstPartyPluginPermission).toHaveBeenCalledTimes(1);
      expect(secureInputRequester).toHaveBeenCalledTimes(1);
      expect(startForSetup).toHaveBeenCalledWith({ apiCredentialsPresent: true });
      expect(refreshProviderReadiness).toHaveBeenCalledWith("telegram-tdlib");
      expect(fetchRequests.find((request) => request.input.endsWith("/sessions/owner/code"))?.body).toEqual({
        profileId: "owner",
        code: "86420",
      });
      expect(result.content[0].text).toContain("Apply status: applied");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_session_apply",
        status: "applied",
        telegramSessionSetup: {
          kind: "telegram-session-setup",
          providerId: "telegram-tdlib",
          profileId: "owner",
          status: "ready",
          safety: {
            readsProviderMessages: false,
            sendsProviderMessages: false,
            createsBinding: false,
            enablesInboundIngestion: false,
          },
        },
      });
      expect(JSON.stringify(result)).not.toContain("86420");
      expect(JSON.stringify(result)).not.toContain("hash-value");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function runningSupervisorStatus(workspacePath: string): MessagingGatewayBridgeSupervisorStatus {
  return {
    providerId: "telegram-tdlib",
    state: "running",
    managed: true,
    pid: 12345,
    command: "pnpm",
    args: ["--dir", "/Users/example/ambientAgent", "telegram:bridge"],
    cwd: "/Users/example/ambientAgent",
    bridgeBaseUrl: "http://127.0.0.1:8091",
    stateRoot: `${workspacePath}/.ambient-agent-state/telegram`,
    envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
    safeRootProbeOnly: true,
    recentLogs: [],
  };
}

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
