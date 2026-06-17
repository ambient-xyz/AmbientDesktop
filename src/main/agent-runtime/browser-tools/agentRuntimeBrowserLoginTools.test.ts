import { describe, expect, it, vi } from "vitest";

import type {
  BrowserLoginCredential,
  BrowserLoginResult,
  BrowserUserActionState,
} from "../../../shared/types";
import {
  browserLoginAuditDetail,
  browserLoginText,
  registerBrowserLoginTool,
  type BrowserLoginToolRegistrationOptions,
} from "./agentRuntimeBrowserLoginTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserLoginTools", () => {
  it("registers browser_login and fills a stored credential", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const credential = browserCredential();
    const loginResult = browserLoginResult();
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const resolveBrowserCredential = vi.fn(() => credential);
    const markBrowserCredentialUsed = vi.fn();
    const browserLogin = vi.fn(async () => loginResult);
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserLoginAudit = vi.fn();

    registerBrowserLoginTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      resolveBrowserCredential,
      markBrowserCredentialUsed,
      browserLogin,
      emitBrowserState,
      recordBrowserLoginAudit,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_login"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const input = {
      credentialId: "credential-1",
      expectedOrigin: "example.test/login",
      usernameSelector: "#email",
      passwordSelector: "#password",
      submitSelector: "#submit",
      submit: false,
      profileMode: "isolated",
    };
    const result = await registeredTools[0]!.execute("login", input, undefined, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(input, "thread-1", expect.any(Function));
    expect(resolveBrowserCredential).toHaveBeenCalledWith("credential-1");
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Filling stored credential \"Example\" for https://example.test." }],
      details: {
        runtime: "ambient-browser",
        toolName: "browser_login",
        status: "running",
      },
    });
    expect(browserLogin).toHaveBeenCalledWith({
      credential,
      credentialId: "credential-1",
      expectedOrigin: "https://example.test",
      usernameSelector: "#email",
      passwordSelector: "#password",
      submitSelector: "#submit",
      submit: false,
      profileMode: "isolated",
    });
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(markBrowserCredentialUsed).toHaveBeenCalledWith("credential-1");
    expect(recordBrowserLoginAudit).toHaveBeenCalledWith({
      detail: browserLoginAuditDetail(loginResult),
    });
    expect(result.content[0].text).toBe(browserLoginText(loginResult));
    expect(result.details).toMatchObject({
      toolName: "browser_login",
      profileMode: "isolated",
      credentialId: "credential-1",
      credentialLabel: "Example",
      username: "demo@example.test",
      submitted: false,
    });
  });

  it("defaults submit to true and drops blank optional selectors", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserLogin = vi.fn(async () => browserLoginResult());

    registerBrowserLoginTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ browserLogin }));

    await registeredTools[0]!.execute("login", {
      credentialId: "credential-1",
      expectedOrigin: "https://example.test",
      usernameSelector: " ",
      passwordSelector: "",
      submitSelector: null,
    });

    expect(browserLogin).toHaveBeenCalledWith(expect.objectContaining({
      usernameSelector: undefined,
      passwordSelector: undefined,
      submitSelector: undefined,
      submit: true,
    }));
  });

  it("returns browser user-action results without marking credentials used", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();
    const markBrowserCredentialUsed = vi.fn();
    const recordBrowserLoginAudit = vi.fn();

    registerBrowserLoginTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserLogin: async () => action,
      markBrowserCredentialUsed,
      recordBrowserLoginAudit,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("login", {
      credentialId: "credential-1",
      expectedOrigin: "https://example.test",
    });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_login",
      profileMode: "isolated",
      userAction: action,
    });
    expect(markBrowserCredentialUsed).not.toHaveBeenCalled();
    expect(recordBrowserLoginAudit).not.toHaveBeenCalled();
  });

  it("propagates login errors like the inline runtime path", async () => {
    const registeredTools: RegisteredTool[] = [];
    const markBrowserCredentialUsed = vi.fn();

    registerBrowserLoginTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserLogin: async () => {
        throw new Error("Login failed");
      },
      markBrowserCredentialUsed,
    }));

    await expect(registeredTools[0]!.execute("login", {
      credentialId: "credential-1",
      expectedOrigin: "https://example.test",
    })).rejects.toThrow("Login failed");
    expect(markBrowserCredentialUsed).not.toHaveBeenCalled();
  });

  it("requires credential id and expected origin before preparing a browser profile", async () => {
    const registeredTools: RegisteredTool[] = [];
    const prepareBrowserToolProfile = vi.fn();

    registerBrowserLoginTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ prepareBrowserToolProfile }));

    await expect(registeredTools[0]!.execute("login", {
      credentialId: " ",
      expectedOrigin: "https://example.test",
    })).rejects.toThrow("credentialId is required.");
    await expect(registeredTools[0]!.execute("login", {
      credentialId: "credential-1",
      expectedOrigin: "ftp://example.test",
    })).rejects.toThrow("Browser credential origin must use http or https.");
    expect(prepareBrowserToolProfile).not.toHaveBeenCalled();
  });

  it("formats login text and audit details like the inline helpers", () => {
    const result = browserLoginResult({
      submitted: true,
      userActionRequired: true,
      message: "Additional verification required.",
    });

    expect(browserLoginText(result)).toBe([
      "Stored browser credential \"Example\" was filled for https://example.test.",
      "Username: demo@example.test",
      "Title: Login",
      "URL: https://example.test/login",
      "Submitted: yes",
      "User action appears required before login can continue.",
      "Additional verification required.",
    ].join("\n"));
    expect(browserLoginAuditDetail(result)).toBe([
      "Credential: Example (credential-1)",
      "Origin: https://example.test",
      "Username: demo@example.test",
      "URL: https://example.test/login",
      "Submitted: yes",
      "User action required: yes",
    ].join("\n"));
  });
});

function options(
  overrides: Partial<BrowserLoginToolRegistrationOptions> = {},
): BrowserLoginToolRegistrationOptions {
  return {
    threadId: "thread-1",
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    resolveBrowserCredential: () => browserCredential(),
    markBrowserCredentialUsed: () => undefined,
    browserLogin: async () => browserLoginResult(),
    emitBrowserState: async () => undefined,
    recordBrowserLoginAudit: () => undefined,
    formatBrowserUserAction: () => "Browser needs action.",
    ...overrides,
  };
}

function browserCredential(overrides: Partial<BrowserLoginCredential> = {}): BrowserLoginCredential {
  return {
    id: "credential-1",
    label: "Example",
    origin: "https://example.test",
    username: "demo@example.test",
    password: "dummy-password",
    ...overrides,
  };
}

function browserLoginResult(overrides: Partial<BrowserLoginResult> = {}): BrowserLoginResult {
  return {
    status: "filled",
    credentialId: "credential-1",
    credentialLabel: "Example",
    origin: "https://example.test",
    username: "demo@example.test",
    title: "Login",
    url: "https://example.test/login",
    submitted: false,
    userActionRequired: false,
    message: "Stored credential filled.",
    ...overrides,
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_login",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the CAPTCHA.",
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:00.000Z",
    canAutoResume: false,
  };
}
