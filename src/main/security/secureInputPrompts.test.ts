import { afterEach, describe, expect, it, vi } from "vitest";
import { SecureInputPromptService } from "./secureInputPrompts";

describe("SecureInputPromptService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits an ephemeral secure input request and resolves with the supplied value", async () => {
    const events: unknown[] = [];
    const service = new SecureInputPromptService(() => fakeWindow(events), 1_000);

    const pending = service.request({
      threadId: "thread-1",
      workspacePath: "/workspace",
      requestId: "telegram-code-1",
      title: "Enter Telegram login code",
      message: "Telegram sent a login code. Enter it in Ambient.",
      detail: "Provider: telegram-tdlib\nProfile: owner",
      inputLabel: "Telegram code",
      inputKind: "telegram_login_code",
      inputMode: "text",
      providerId: "telegram-tdlib",
      profileId: "owner",
    });
    const requestEvent = events.find((event) => (event as any).type === "desktop:event") as any;
    const request = requestEvent.payload.request;

    expect(requestEvent.payload.type).toBe("secure-input-request");
    expect(request).toMatchObject({
      requestId: "telegram-code-1",
      threadId: "thread-1",
      workspacePath: "/workspace",
      inputLabel: "Telegram code",
      inputKind: "telegram_login_code",
      inputMode: "text",
      providerId: "telegram-tdlib",
      profileId: "owner",
    });
    expect(JSON.stringify(request)).not.toContain("12345");

    service.respond({ id: request.id, value: "12345" });
    await expect(pending).resolves.toEqual({ allowed: true, value: "12345" });
    expect(events.at(-1)).toMatchObject({ type: "desktop:event", payload: { type: "secure-input-resolved", id: request.id, workspacePath: "/workspace" } });
  });

  it("denies and clears requests on timeout", async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const service = new SecureInputPromptService(() => fakeWindow(events), 25);

    const pending = service.request({
      title: "Enter Telegram password",
      message: "Telegram requested your two-factor password.",
      detail: "Provider: telegram-tdlib\nProfile: owner",
      inputLabel: "Two-factor password",
      inputKind: "telegram_password",
      inputMode: "password",
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toEqual({ allowed: false });
    expect((events.at(-1) as any).payload.type).toBe("secure-input-resolved");
  });
});

function fakeWindow(events: unknown[]) {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => events.push({ type: channel, payload }),
    },
  } as any;
}
