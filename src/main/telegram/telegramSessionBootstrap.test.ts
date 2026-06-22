import { describe, expect, it } from "vitest";
import type { MessagingGatewayBridgeSupervisorStatus } from "../../shared/messagingGateway";
import {
  applyTelegramSessionBootstrap,
  previewTelegramSessionBootstrap,
  telegramSessionBootstrapPreviewText,
  telegramSessionBootstrapResultText,
  telegramSessionBootstrapSetupCard,
} from "./telegramSessionBootstrap";

function stoppedSupervisorStatus(): MessagingGatewayBridgeSupervisorStatus {
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
}

describe("Telegram session bootstrap", () => {
  it("previews setup without exposing phone or secret material", () => {
    const preview = previewTelegramSessionBootstrap({
      providerId: "telegram-tdlib",
      action: "start_auth",
      profileId: "owner",
      phoneNumber: "+15551234567",
    }, {
      workspacePath: "/workspace",
      env: {
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret-hash",
      },
      supervisor: {
        status: stoppedSupervisorStatus,
        startForSetup: async () => stoppedSupervisorStatus(),
      },
    });
    const text = telegramSessionBootstrapPreviewText(preview);

    expect(preview).toMatchObject({
      providerId: "telegram-tdlib",
      action: "start_auth",
      phoneNumberPresent: true,
      apiCredentialsPresent: true,
      wouldLaunchBridgeForSetup: true,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
      missingInputs: [],
    });
    expect(text).toContain("Phone number present: yes");
    expect(text).toContain("Would read provider messages: no");
    expect(text).toContain("Would send provider messages: no");
    expect(text).not.toContain("+15551234567");
    expect(text).not.toContain("secret-hash");
  });

  it("builds safe setup cards with deterministic secure-input continuation prompts", async () => {
    const result = await applyTelegramSessionBootstrap({
      action: "start_auth",
      profileId: "owner",
      phoneNumber: "+15551234567",
    }, {
      workspacePath: "/workspace",
      env: {
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret-hash",
      },
      fetchFn: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          state: "waiting_code",
          ready: false,
          needsCode: true,
          needsPassword: false,
          phoneNumber: "+15551234567",
        }),
      }),
    });

    const card = telegramSessionBootstrapSetupCard(result);

    expect(card).toMatchObject({
      kind: "telegram-session-setup",
      providerId: "telegram-tdlib",
      profileId: "owner",
      status: "needs_code",
      primaryAction: {
        id: "submit-code",
        label: "Enter code",
      },
      safety: {
        readsProviderMessages: false,
        sendsProviderMessages: false,
        createsBinding: false,
        enablesInboundIngestion: false,
      },
    });
    expect(card.primaryAction?.prompt).toContain("ambient_messaging_telegram_session_apply");
    expect(card.primaryAction?.prompt).toContain('"action":"submit_code"');
    expect(card.primaryAction?.prompt).toContain("secure Desktop");
    expect(card.primaryAction?.prompt).toContain("Do not list Telegram chats");
    expect(JSON.stringify(card)).not.toContain("+15551234567");
    expect(JSON.stringify(card)).not.toContain("secret-hash");
  });

  it("applies start_auth through the minimal session endpoint and redacts auth output", async () => {
    const requests: Array<{ input: string; init?: RequestInit; body?: Record<string, unknown> }> = [];
    let launched = false;
    const result = await applyTelegramSessionBootstrap({
      action: "start_auth",
      profileId: "owner",
      phoneNumber: "+15551234567",
    }, {
      workspacePath: "/workspace",
      env: {
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret-hash",
      },
      now: () => new Date("2026-05-11T00:00:00.000Z"),
      supervisor: {
        status: stoppedSupervisorStatus,
        startForSetup: async () => {
          launched = true;
          return { ...stoppedSupervisorStatus(), state: "running", managed: true, pid: 12345 };
        },
      },
      fetchFn: async (input, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        requests.push({ input, init, body });
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            state: "waiting_code",
            ready: false,
            needsCode: true,
            needsPassword: false,
            phoneNumber: "+15551234567",
            profile: {
              phoneNumber: "+15551234567",
              username: "owner",
            },
          }),
        };
      },
    });
    const text = telegramSessionBootstrapResultText(result);

    expect(launched).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("http://127.0.0.1:8091/sessions");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toMatchObject({
      "x-telegram-api-id": "123",
      "x-telegram-api-hash": "secret-hash",
      "content-type": "application/json",
    });
    expect(requests[0]?.body).toMatchObject({
      profileId: "owner",
      phoneNumber: "+15551234567",
      tdlibStateDir: "/workspace/.ambient-agent-state/telegram/owner",
    });
    expect(typeof requests[0]?.body?.databaseEncryptionKey).toBe("string");
    expect(requests[0]?.body?.databaseEncryptionKey).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      authState: {
        state: "waiting_code",
        ready: false,
        needsCode: true,
        phoneNumberPresent: true,
      },
    });
    expect(text).toContain("Needs code: yes");
    expect(JSON.stringify(result)).not.toContain("+15551234567");
    expect(JSON.stringify(result)).not.toContain(requests[0]?.body?.databaseEncryptionKey as string);
    expect(text).not.toContain("+15551234567");
    expect(text).not.toContain("secret-hash");
  });

  it("blocks missing required inputs before touching the bridge", async () => {
    let launched = false;
    let fetched = false;
    const result = await applyTelegramSessionBootstrap({
      action: "start_auth",
      profileId: "owner",
    }, {
      workspacePath: "/workspace",
      env: {
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret-hash",
      },
      supervisor: {
        status: stoppedSupervisorStatus,
        startForSetup: async () => {
          launched = true;
          return stoppedSupervisorStatus();
        },
      },
      fetchFn: async () => {
        fetched = true;
        throw new Error("unexpected");
      },
    });

    expect(result.applyStatus).toBe("blocked");
    expect(result.blockedReason).toContain("phoneNumber");
    expect(launched).toBe(false);
    expect(fetched).toBe(false);
  });

  it("checks status through the profile endpoint without leaking profile phone", async () => {
    const result = await applyTelegramSessionBootstrap({
      action: "status",
      profileId: "owner",
    }, {
      workspacePath: "/workspace",
      env: {
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret-hash",
      },
      supervisor: {
        status: () => ({ ...stoppedSupervisorStatus(), state: "running", managed: true }),
        startForSetup: async () => ({ ...stoppedSupervisorStatus(), state: "running", managed: true }),
      },
      fetchFn: async (input, init) => {
        expect(input).toBe("http://127.0.0.1:8091/sessions/owner");
        expect(init?.method).toBe("GET");
        expect(init?.body).toBeUndefined();
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            state: "ready",
            ready: true,
            needsCode: false,
            needsPassword: false,
            profile: {
              displayName: "Owner Account",
              phoneNumber: "+15551234567",
            },
          }),
        };
      },
    });

    expect(result.authState).toMatchObject({
      state: "ready",
      ready: true,
      phoneNumberPresent: true,
      profile: {
        displayNamePresent: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("+15551234567");
  });

  it("submits a secure handoff login code without returning the code", async () => {
    const requests: Array<{ input: string; init?: RequestInit; body?: Record<string, unknown> }> = [];
    const result = await applyTelegramSessionBootstrap({
      action: "submit_code",
      profileId: "owner",
      code: "12345",
    }, {
      workspacePath: "/workspace",
      env: {
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret-hash",
      },
      fetchFn: async (input, init) => {
        requests.push({
          input,
          init,
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
    });

    expect(requests[0]?.input).toBe("http://127.0.0.1:8091/sessions/owner/code");
    expect(requests[0]?.body).toEqual({ profileId: "owner", code: "12345" });
    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      codePresent: true,
      authState: {
        state: "ready",
        ready: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("12345");
    expect(telegramSessionBootstrapResultText(result)).not.toContain("12345");
  });
});
