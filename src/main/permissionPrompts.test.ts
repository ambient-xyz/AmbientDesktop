import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionPromptService } from "./permissionPrompts";

function fakeWindow(events: unknown[]) {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (_channel: string, event: unknown) => events.push(event),
    },
  } as any;
}

describe("PermissionPromptService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with an explicit user response", async () => {
    const events: any[] = [];
    const service = new PermissionPromptService(() => fakeWindow(events), 1000);

    const decision = service.request({
      threadId: "thread-1",
      toolName: "bash",
      title: "Allow command?",
      message: "Review command",
      detail: "rm -rf dist",
      risk: "destructive-command",
    });

    const request = events[0].request;
    service.respond(request.id, "always_thread");

    await expect(decision).resolves.toEqual({ allowed: true, mode: "always_thread" });
    expect(events.map((event) => event.type)).toEqual(["permission-request", "permission-resolved"]);
  });

  it("scopes request and resolution events to the request workspace", async () => {
    const events: any[] = [];
    const service = new PermissionPromptService(() => fakeWindow(events), 1000);

    const decision = service.request({
      threadId: "thread-1",
      toolName: "write",
      title: "Allow write?",
      message: "Review path",
      detail: "output.txt",
      risk: "plugin-tool",
      workspacePath: "/workspace-a",
    });

    const request = events[0].request;
    service.respond(request.id, "allow_once");

    await expect(decision).resolves.toEqual({ allowed: true, mode: "allow_once" });
    expect(events).toEqual([
      expect.objectContaining({ type: "permission-request", workspacePath: "/workspace-a" }),
      expect.objectContaining({ type: "permission-resolved", id: request.id, workspacePath: "/workspace-a" }),
    ]);
  });

  it("lists pending requests for renderer-independent approval surfaces", async () => {
    const events: any[] = [];
    const service = new PermissionPromptService(() => fakeWindow(events), 1000);
    const createdRequests: any[] = [];

    const decision = service.request({
      threadId: "thread-1",
      toolName: "ambient_messaging_telegram_bridge_reply_apply",
      title: "Send Telegram reply?",
      message: "Review outbound reply.",
      detail: "Reply preview",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
    }, {
      onRequest: (request) => createdRequests.push(request),
    });

    expect(createdRequests).toEqual([
      expect.objectContaining({
        id: events[0].request.id,
        title: "Send Telegram reply?",
      }),
    ]);
    expect(service.listPending()).toEqual([
      expect.objectContaining({
        id: events[0].request.id,
        title: "Send Telegram reply?",
        reusableScopes: ["thread"],
      }),
    ]);

    service.respond(events[0].request.id, "allow_once");
    await expect(decision).resolves.toEqual({ allowed: true, mode: "allow_once" });
    expect(service.listPending()).toEqual([]);
  });

  it("denies when the prompt times out", async () => {
    vi.useFakeTimers();
    const events: any[] = [];
    const service = new PermissionPromptService(() => fakeWindow(events), 25);

    const decision = service.request({
      threadId: "thread-1",
      toolName: "read",
      title: "Allow read?",
      message: "Review path",
      detail: "/tmp/outside.txt",
      risk: "outside-workspace",
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(decision).resolves.toEqual({ allowed: false, mode: "deny" });
    expect(events.map((event) => event.type)).toEqual(["permission-request", "permission-resolved"]);
  });
});
