import { describe, expect, it, vi } from "vitest";

import {
  googleWorkspaceJsonObjectInput,
  googleWorkspaceJsonValueInput,
  registerGoogleWorkspaceSetupTools,
} from "./agentRuntimeGoogleWorkspaceSetupTools";

describe("agentRuntimeGoogleWorkspaceSetupTools", () => {
  it("registers no tools when Google Workspace support is unavailable", () => {
    const registeredTools: any[] = [];

    registerGoogleWorkspaceSetupTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      googleWorkspace: undefined,
    });

    expect(registeredTools).toEqual([]);
  });

  it("registers Google Workspace setup tools and reports status", async () => {
    const registeredTools: any[] = [];
    const integration = integrationFixture();
    const googleWorkspace = googleWorkspaceFixture({ readIntegration: vi.fn(() => integration) });

    registerGoogleWorkspaceSetupTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      googleWorkspace,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "google_workspace_status",
      "google_workspace_install_gws",
      "google_workspace_start_login",
      "google_workspace_import_oauth_client",
      "google_workspace_validate_account",
      "google_workspace_cancel_setup",
      "google_workspace_search_methods",
      "google_workspace_call",
      "google_workspace_materialize_file",
    ]);

    const result = await registeredTools[0].execute("status", {});

    expect(result.content[0].text).toContain("Google Workspace setup status");
    expect(result.content[0].text).toContain("handle work: work@example.com");
    expect(result.details).toEqual(expect.objectContaining({
      runtime: "google-workspace-setup",
      toolName: "google_workspace_status",
      action: "status",
      integration: expect.objectContaining({
        enabled: true,
        authMode: "gws",
        availableActions: expect.arrayContaining([
          "google_workspace_status",
          "google_workspace_start_login",
          "google_workspace_call",
        ]),
        accounts: [expect.objectContaining({
          accountId: "work",
          email: "work@example.com",
          services: ["Gmail", "Calendar"],
        })],
      }),
    }));
  });

  it("runs setup action tools with the same updates and service inputs as the inline runtime", async () => {
    const registeredTools: any[] = [];
    const integration = integrationFixture();
    const installState = { status: "completed", version: "1.2.3", platform: "darwin", arch: "arm64", binaryPath: "/gws" };
    const loginSetup = { status: "running", command: "login", accountHint: "work", authUrl: "https://accounts.example/auth", openedAuthUrl: true };
    const importedSetup = { status: "completed", command: "setup", accountHint: "work", oauthClientConfigured: true };
    const validation = validationFixture();
    const canceledSetup = { status: "canceled", command: "login", accountHint: "work" };
    const googleWorkspace = googleWorkspaceFixture({
      readIntegration: vi.fn(() => integration),
      installCli: vi.fn(async () => installState),
      startSetup: vi.fn(() => loginSetup),
      importOAuthClient: vi.fn(async () => importedSetup),
      validate: vi.fn(async () => validation),
      cancelSetup: vi.fn(() => canceledSetup),
    });
    const onUpdate = vi.fn();

    registerGoogleWorkspaceSetupTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      googleWorkspace,
    });

    const byName = toolsByName(registeredTools);

    const installResult = await byName.google_workspace_install_gws.execute("install", {}, undefined, onUpdate);
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Installing the managed Google Workspace CLI binary." }],
      details: { runtime: "google-workspace-setup", toolName: "google_workspace_install_gws", status: "running" },
    });
    expect(googleWorkspace.installCli).toHaveBeenCalledOnce();
    expect(installResult.details.install).toEqual(expect.objectContaining({ status: "completed", binaryPath: "/gws" }));

    await byName.google_workspace_start_login.execute("login", { accountHint: "work" }, undefined, onUpdate);
    expect(googleWorkspace.startSetup).toHaveBeenCalledWith({ accountHint: "work", command: "login", openAuthUrl: true });

    await byName.google_workspace_import_oauth_client.execute("import", { path: "client_secret.json", accountHint: "work" }, undefined, onUpdate);
    expect(googleWorkspace.importOAuthClient).toHaveBeenCalledWith({ accountHint: "work", sourcePath: "/workspace/client_secret.json" });
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Importing Google Workspace OAuth client config from client_secret.json." }],
      details: { runtime: "google-workspace-setup", toolName: "google_workspace_import_oauth_client", status: "running" },
    });

    const validateResult = await byName.google_workspace_validate_account.execute("validate", { accountHint: "work" }, undefined, onUpdate);
    expect(googleWorkspace.validate).toHaveBeenCalledWith({ accountHint: "work" });
    expect(validateResult.content[0].text).toContain("Google Workspace validation");

    const cancelResult = await byName.google_workspace_cancel_setup.execute("cancel", {});
    expect(googleWorkspace.cancelSetup).toHaveBeenCalledOnce();
    expect(cancelResult.details.setup).toEqual(expect.objectContaining({ status: "canceled", accountHint: "work" }));
  });

  it("calls Google Workspace methods with parsed inputs, longform previews, and materialized model text", async () => {
    const registeredTools: any[] = [];
    const callResult = googleWorkspaceCallResultFixture();
    const googleWorkspace = googleWorkspaceFixture({
      call: vi.fn(async () => callResult),
    });
    const toolLongformInputPreview = {
      kind: "longform-input",
      title: "Request body",
      runningTitle: "Calling Google Workspace",
      summary: "calendar.events.list",
      items: [],
    };
    const buildToolLongformInputPreview = vi.fn(() => toolLongformInputPreview as any);
    const materializeTextOutput = vi.fn(async (_workspacePath, input: any) => ({
      text: input.text,
      truncated: false,
      totalChars: input.text.length,
      previewChars: input.text.length,
      redacted: false,
      redactionCount: 0,
    }));
    const onUpdate = vi.fn();

    registerGoogleWorkspaceSetupTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      googleWorkspace,
      buildToolLongformInputPreview,
      materializeTextOutput,
    });

    const result = await toolsByName(registeredTools).google_workspace_call.execute("call", {
      accountHint: "work",
      methodId: "calendar.events.list",
      params: "{\"calendarId\":\"primary\"}",
      body: "{\"q\":\"planning\"}",
      gmailDraft: {
        to: ["team@example.com"],
        subject: "Plan",
        textBody: "hello",
      },
      dryRun: true,
      idempotencyKey: "idem-1",
    }, undefined, onUpdate);

    expect(buildToolLongformInputPreview).toHaveBeenCalledWith("google_workspace_call", expect.objectContaining({
      accountHint: "work",
      methodId: "calendar.events.list",
      params: { calendarId: "primary" },
      body: { q: "planning" },
      gmailDraft: expect.objectContaining({ to: ["team@example.com"], subject: "Plan" }),
      dryRun: true,
      idempotencyKey: "idem-1",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Calling Google Workspace method calendar.events.list." }],
      details: {
        runtime: "google-workspace-setup",
        toolName: "google_workspace_call",
        status: "running",
        toolLongformInputPreview,
      },
    });
    expect(googleWorkspace.call).toHaveBeenCalledWith(expect.objectContaining({
      accountHint: "work",
      methodId: "calendar.events.list",
      params: { calendarId: "primary" },
      body: { q: "planning" },
      workspacePath: "/workspace",
    }));
    expect(materializeTextOutput).toHaveBeenCalledWith("/workspace", expect.objectContaining({
      label: "google-workspace-call",
      maxPreviewChars: 12_000,
      extension: "txt",
    }));
    expect(result.content[0].text).toContain("Google Workspace method call");
    expect(result.details).toEqual(expect.objectContaining({
      runtime: "google-workspace-setup",
      toolName: "google_workspace_call",
      action: "call",
      displayText: expect.stringContaining("Calendar events (1)"),
      call: expect.objectContaining({
        accountHint: "work",
        dryRun: true,
        resultSummary: expect.stringContaining("Standup"),
      }),
      toolLongformInputPreview,
    }));
  });

  it("keeps OAuth client imports inside the workspace for relative paths", async () => {
    const registeredTools: any[] = [];
    const googleWorkspace = googleWorkspaceFixture();

    registerGoogleWorkspaceSetupTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      googleWorkspace,
    });

    await expect(
      toolsByName(registeredTools).google_workspace_import_oauth_client.execute("import", { path: "../client_secret.json" }),
    ).rejects.toThrow("google_workspace_import_oauth_client path must stay inside the workspace when it is workspace-relative.");
    expect(googleWorkspace.importOAuthClient).not.toHaveBeenCalled();
  });

  it("exports Google Workspace JSON parsers for runtime permission previews", () => {
    expect(googleWorkspaceJsonObjectInput("{\"a\":1}")).toEqual({ a: 1 });
    expect(googleWorkspaceJsonValueInput("[1,2]")).toEqual([1, 2]);
    expect(googleWorkspaceJsonValueInput("not json")).toBe("not json");
    expect(googleWorkspaceJsonObjectInput(undefined)).toBeUndefined();
  });
});

function toolsByName(registeredTools: any[]): Record<string, any> {
  return Object.fromEntries(registeredTools.map((tool) => [tool.name, tool]));
}

function googleWorkspaceFixture(overrides: Record<string, unknown> = {}): any {
  return {
    readIntegration: vi.fn(() => integrationFixture()),
    installCli: vi.fn(async () => ({ status: "completed", version: "1.2.3", platform: "darwin", arch: "arm64" })),
    startSetup: vi.fn(() => ({ status: "running", command: "login" })),
    importOAuthClient: vi.fn(async () => ({ status: "completed", command: "setup" })),
    cancelSetup: vi.fn(() => ({ status: "canceled", command: "login" })),
    validate: vi.fn(async () => validationFixture()),
    searchMethods: vi.fn(async () => ({ methods: [methodFixture()], truncated: false, catalogVersion: "test" })),
    describeMethod: vi.fn(async () => methodFixture()),
    call: vi.fn(async () => googleWorkspaceCallResultFixture()),
    materializeFile: vi.fn(async () => ({
      handle: "file-1",
      path: "/workspace/out.txt",
      fileName: "out.txt",
      bytes: 12,
      overwritten: false,
    })),
    ...overrides,
  };
}

function integrationFixture(): any {
  const account = {
    accountId: "work",
    label: "Work",
    email: "work@example.com",
    status: "available",
    lastValidatedAt: "2026-06-10T00:00:00.000Z",
  };
  return {
    enabled: true,
    authMode: "gws",
    connectors: [
      {
        connectorId: "google.gmail",
        status: "available",
        accounts: [account],
      },
      {
        connectorId: "google.calendar",
        status: "available",
        accounts: [account],
      },
    ],
    install: {
      status: "completed",
      version: "1.2.3",
      platform: "darwin",
      arch: "arm64",
      binaryPath: "/gws",
    },
    setup: {
      status: "running",
      command: "login",
      accountHint: "work",
      authUrl: "https://accounts.example/auth",
      openedAuthUrl: true,
    },
    sidecar: {
      adapter: "gws",
      state: "available",
      binaryPath: "/gws",
      pending: 0,
      setupCommands: ["login"],
    },
  };
}

function validationFixture(): any {
  return {
    account: {
      accountId: "work",
      label: "Work",
      email: "work@example.com",
      status: "available",
      lastValidatedAt: "2026-06-10T00:00:00.000Z",
    },
    checks: [
      {
        service: "identity",
        label: "Identity",
        ok: true,
      },
    ],
    identity: {
      email: "work@example.com",
      displayName: "Work User",
      source: "gmail.profile",
    },
  };
}

function methodFixture(): any {
  return {
    id: "calendar.events.list",
    service: "calendar",
    resource: "events",
    method: "list",
    label: "List events",
    description: "List calendar events.",
    httpMethod: "GET",
    path: "/calendar/v3/calendars/{calendarId}/events",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    sideEffect: "personal_content_read",
    dryRunSupported: false,
    parameters: [
      {
        name: "calendarId",
        location: "path",
        required: true,
      },
    ],
  };
}

function googleWorkspaceCallResultFixture(): any {
  return {
    accountHint: "work",
    method: methodFixture(),
    dryRun: true,
    result: {
      items: [
        {
          summary: "Standup",
          start: { dateTime: "2026-06-10T09:00:00-07:00" },
          end: { dateTime: "2026-06-10T09:30:00-07:00" },
        },
      ],
    },
  };
}
