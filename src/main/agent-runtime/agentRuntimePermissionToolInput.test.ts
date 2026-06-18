import { describe, expect, it, vi } from "vitest";

import type { BrowserCapabilityState, BrowserCredentialSummary } from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { permissionToolInput } from "./agentRuntimePermissionToolInput";

describe("permissionToolInput", () => {
  const workspace = {
    path: "/workspace",
  } as WorkspaceState;

  it("adds local deep research readiness for install-like setup actions", async () => {
    const readLocalDeepResearchReadiness = vi.fn().mockResolvedValue({
      contract: {
        status: "needs-install",
        installerShape: { kind: "test-installer" },
      },
    });

    const result = await permissionToolInput(
      "ambient_local_deep_research_setup",
      { action: "install", q8Override: true, keep: "value" },
      workspace,
      dependencies({ readLocalDeepResearchReadiness }),
    );

    expect(readLocalDeepResearchReadiness).toHaveBeenCalledWith(workspace, { q8Override: true });
    expect(result).toEqual({
      action: "install",
      q8Override: true,
      keep: "value",
      setupStatus: "needs-install",
      installerShape: { kind: "test-installer" },
    });
  });

  it("normalizes Google Workspace permission input and includes method descriptions", async () => {
    const describeMethod = vi.fn().mockResolvedValue({ id: "drive.files.list", mutating: false });

    const result = await permissionToolInput(
      "google_workspace_call",
      {
        methodId: "drive.files.list",
        params: "{\"pageSize\":10}",
        body: "[1,2]",
      },
      workspace,
      dependencies({ googleWorkspace: { describeMethod } }),
    );

    expect(describeMethod).toHaveBeenCalledWith({ methodId: "drive.files.list" });
    expect(result).toEqual({
      methodId: "drive.files.list",
      params: { pageSize: 10 },
      body: [1, 2],
      method: { id: "drive.files.list", mutating: false },
    });
  });

  it("adds resolved Google Workspace account hints for permission grants", async () => {
    const describeMethod = vi.fn().mockResolvedValue({ id: "calendar.events.list", mutating: false });
    const resolveAccountHint = vi.fn(() => "travis@example.test");

    const result = await permissionToolInput(
      "google_workspace_call",
      {
        accountHint: "default",
        methodId: "calendar.events.list",
      },
      workspace,
      dependencies({ googleWorkspace: { describeMethod, resolveAccountHint } }),
    );

    expect(resolveAccountHint).toHaveBeenCalledWith("default");
    expect(result).toMatchObject({
      accountHint: "default",
      resolvedAccountHint: "travis@example.test",
      method: { id: "calendar.events.list" },
    });
  });

  it("records Google Workspace method description failures in permission input", async () => {
    const result = await permissionToolInput(
      "google_workspace_call",
      { methodId: "drive.files.get" },
      workspace,
      dependencies({
        googleWorkspace: {
          describeMethod: () => Promise.reject(new Error("catalog unavailable")),
        },
      }),
    );

    expect(result).toEqual({
      methodId: "drive.files.get",
      method: { error: "catalog unavailable" },
    });
  });

  it("adds browser credential labels and active browser context for browser login prompts", async () => {
    const credential = browserCredential({
      id: "cred-1",
      label: "Example",
      origin: "https://example.test",
      username: "user@example.test",
    });

    const result = await permissionToolInput(
      "browser_login",
      { credentialId: "cred-1" },
      workspace,
      dependencies({
        browserCredentials: { get: (id) => id === "cred-1" ? credential : undefined },
        readBrowserState: () => browserState({
          profileMode: "copied",
          activeTab: { url: "https://example.test/login" },
        }),
      }),
    );

    expect(result).toEqual({
      credentialId: "cred-1",
      credentialLabel: "Example",
      username: "user@example.test",
      expectedOrigin: "https://example.test",
      currentUrl: "https://example.test/login",
      profileMode: "copied",
    });
  });

  it("leaves unrelated tool inputs untouched", async () => {
    const input = { value: 1 };

    await expect(permissionToolInput("other_tool", input, workspace, dependencies())).resolves.toBe(input);
  });
});

function dependencies(overrides: Partial<Parameters<typeof permissionToolInput>[3]> = {}): Parameters<typeof permissionToolInput>[3] {
  return {
    readLocalDeepResearchReadiness: () => ({ contract: { status: "ready", installerShape: {} } }),
    browserCredentials: { get: () => undefined },
    readBrowserState: () => undefined,
    ...overrides,
  };
}

function browserCredential(overrides: Pick<BrowserCredentialSummary, "id" | "label" | "origin" | "username">): BrowserCredentialSummary {
  return {
    ...overrides,
    scope: "workspace",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
  };
}

function browserState(overrides: Partial<BrowserCapabilityState>): BrowserCapabilityState {
  return {
    running: true,
    profileMode: "isolated",
    runtime: "chrome",
    internalAvailable: false,
    copiedProfileAvailable: true,
    chromeAvailable: true,
    browserLoginBrokerAvailable: true,
    ...overrides,
  };
}
