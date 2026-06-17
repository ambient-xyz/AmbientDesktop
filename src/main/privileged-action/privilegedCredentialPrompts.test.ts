import { describe, expect, it } from "vitest";
import { planPrivilegedAction, buildPrivilegedActionNativeRequest } from "./privilegedAction";
import { PrivilegedCredentialPromptService } from "./privilegedCredentialPrompts";

describe("PrivilegedCredentialPromptService", () => {
  it("emits an ephemeral credential request and resolves with a typed response", async () => {
    const events: unknown[] = [];
    const service = new PrivilegedCredentialPromptService(() => fakeWindow(events), 1_000);
    const nativeRequest = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        packageName: "ambient-kokoro-tts",
        reason: "Needs a protected path.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/bin/ln", args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data"] }],
      }),
      { workspacePath: "/workspace", threadId: "thread-1", requestId: "request-1", createdAt: "2026-05-10T00:00:00.000Z" },
    );

    const pending = service.request(nativeRequest);
    const requestEvent = events.find((event) => (event as any).type === "desktop:event") as any;
    const request = requestEvent.payload.request;

    expect(requestEvent.payload.type).toBe("privileged-credential-request");
    expect(request).toMatchObject({
      requestId: "request-1",
      threadId: "thread-1",
      workspacePath: "/workspace",
      purpose: "create_system_symlink",
      packageName: "ambient-kokoro-tts",
      credentialLabel: "Admin password",
    });
    expect(JSON.stringify(request)).not.toContain("{{AMBIENT_PRIVILEGED_AUTH}}");

    service.respond({ id: request.id, credential: "temporary-password" });
    await expect(pending).resolves.toEqual({ allowed: true, credential: "temporary-password" });
    expect(events.at(-1)).toMatchObject({ type: "desktop:event", payload: { type: "privileged-credential-resolved", id: request.id, workspacePath: "/workspace" } });
  });

  it("denies and clears requests on timeout", async () => {
    const events: unknown[] = [];
    const service = new PrivilegedCredentialPromptService(() => fakeWindow(events), 5);
    const nativeRequest = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        reason: "Needs package manager privilege.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/usr/bin/apt", args: ["install", "example"] }],
      }),
      { workspacePath: "/workspace", requestId: "request-2" },
    );

    await expect(service.request(nativeRequest)).resolves.toEqual({ allowed: false });
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
