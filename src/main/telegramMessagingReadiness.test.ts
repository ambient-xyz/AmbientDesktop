import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeTelegramMessagingReadiness } from "./telegramMessagingReadiness";

describe("Telegram messaging readiness", () => {
  it("reports not-configured without starting sessions when no bridge or metadata exists", async () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "telegram-readiness-empty-"));
    rmSync(stateRoot, { recursive: true, force: true });
    const calledUrls: string[] = [];

    const readiness = await probeTelegramMessagingReadiness({
      stateRoot,
      baseUrl: "http://127.0.0.1:8091",
      env: {},
      now: () => new Date("2026-05-10T00:00:00.000Z"),
      fetchFn: async (url) => {
        calledUrls.push(url);
        throw new Error("ECONNREFUSED");
      },
    });

    expect(readiness).toMatchObject({
      providerId: "telegram-tdlib",
      status: "not-configured",
      configured: false,
      bridgeReachable: false,
      authNeeded: true,
      apiCredentialsPresent: false,
      persistedSessionCount: 0,
      checkedAt: "2026-05-10T00:00:00.000Z",
    });
    expect(calledUrls).toEqual(["http://127.0.0.1:8091/"]);
    expect(readiness.diagnostics.join("\n")).toContain("does not call /sessions/*");
    expect(readiness.diagnostics.join("\n")).toContain("does not read Telegram messages");
  });

  it("redacts persisted session metadata and reports bridge root health", async () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "telegram-readiness-session-"));
    const profileRoot = path.join(stateRoot, "owner");
    mkdirSync(profileRoot, { recursive: true });
    writeFileSync(path.join(profileRoot, "bridge-session.json"), JSON.stringify({
      profileId: "owner",
      phoneNumber: "+15551234567",
      tdlibStateDir: profileRoot,
      databaseEncryptionKey: "super-secret-database-key",
    }));
    const calledUrls: string[] = [];

    const readiness = await probeTelegramMessagingReadiness({
      stateRoot,
      baseUrl: "http://127.0.0.1:8091/",
      env: {
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "hash",
      },
      now: () => new Date("2026-05-10T00:00:00.000Z"),
      fetchFn: async (url) => {
        calledUrls.push(url);
        return jsonResponse({ ok: true, stateRoot, sessionCount: 1 });
      },
    });

    expect(readiness).toMatchObject({
      providerId: "telegram-tdlib",
      status: "available",
      configured: true,
      bridgeReachable: true,
      authNeeded: false,
      apiCredentialsPresent: true,
      persistedSessionCount: 1,
      bridgeSessionCount: 1,
      sessions: [
        {
          profileId: "owner",
          metadataReadable: true,
          tdlibStateDirPresent: true,
          phoneNumberPresent: true,
          databaseEncryptionKeyPresent: true,
        },
      ],
    });
    expect(calledUrls).toEqual(["http://127.0.0.1:8091/"]);
    const serialized = JSON.stringify(readiness);
    expect(serialized).not.toContain("+15551234567");
    expect(serialized).not.toContain("super-secret-database-key");

    rmSync(stateRoot, { recursive: true, force: true });
  });

  it("marks persisted sessions degraded when credentials are missing", async () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "telegram-readiness-no-creds-"));
    const profileRoot = path.join(stateRoot, "owner");
    mkdirSync(profileRoot, { recursive: true });
    writeFileSync(path.join(profileRoot, "bridge-session.json"), JSON.stringify({
      profileId: "owner",
      tdlibStateDir: profileRoot,
      databaseEncryptionKey: "super-secret-database-key",
    }));

    const readiness = await probeTelegramMessagingReadiness({
      stateRoot,
      env: {},
      now: () => new Date("2026-05-10T00:00:00.000Z"),
      fetchFn: async () => jsonResponse({ ok: true, stateRoot, sessionCount: 0 }),
    });

    expect(readiness).toMatchObject({
      status: "degraded",
      configured: true,
      bridgeReachable: true,
      authNeeded: true,
      apiCredentialsPresent: false,
      persistedSessionCount: 1,
      bridgeSessionCount: 0,
    });
    expect(readiness.repairHint).toContain("AMBIENT_AGENT_TELEGRAM_API_ID");

    rmSync(stateRoot, { recursive: true, force: true });
  });
});

function jsonResponse(body: unknown): Pick<Response, "ok" | "status" | "statusText" | "json"> {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  };
}
