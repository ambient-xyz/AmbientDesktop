import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GOOGLE_WORKSPACE_CLI_OAUTH_SCOPES,
  GoogleWorkspaceCliAdapter,
  gwsCommandForRequest,
} from "./googleWorkspaceCliAdapter";

describe("GoogleWorkspaceCliAdapter", () => {
  it("reports missing when gws is not on PATH", () => {
    const adapter = new GoogleWorkspaceCliAdapter({
      env: { PATH: "/nowhere" },
      fileExists: () => false,
      appUserDataPath: "/tmp/ambient",
    });
    expect(adapter.status()).toMatchObject({
      adapter: "gws",
      state: "missing",
      binaryPath: "",
      configDir: "/tmp/ambient/google-workspace-cli/default",
    });
  });

  it("finds gws on PATH and exposes setup commands", () => {
    const adapter = new GoogleWorkspaceCliAdapter({
      env: { PATH: "/opt/bin" },
      fileExists: (path) => path === "/opt/bin/gws",
      appUserDataPath: "/tmp/ambient",
    });
    expect(adapter.status()).toMatchObject({
      state: "available",
      binaryPath: "/opt/bin/gws",
    });
    const setupCommands = adapter.status().setupCommands.join("\n");
    expect(setupCommands).toContain("gws auth setup");
    expect(setupCommands).toContain(`--scopes '${GOOGLE_WORKSPACE_CLI_OAUTH_SCOPES.join(",")}'`);
  });

  it("prefers a managed binary before PATH when present", () => {
    const adapter = new GoogleWorkspaceCliAdapter({
      managedBinaryPath: "/opt/ambient/tools/gws",
      env: { PATH: "/opt/bin" },
      fileExists: (path) => path === "/opt/ambient/tools/gws" || path === "/opt/bin/gws",
      appUserDataPath: "/tmp/ambient",
    });
    expect(adapter.status().binaryPath).toBe("/opt/ambient/tools/gws");
  });

  it("runs gws with an account-scoped Ambient config directory", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ messages: [{ id: "m1" }] }),
      stderr: "",
      exitCode: 0,
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      appUserDataPath: "/tmp/ambient",
      env: { PATH: "/opt/bin" },
      runner,
    });

    await expect(adapter.invoke({ method: "gmail.search", accountHint: "travis@example.test", input: { query: "is:unread", max: 5 } }))
      .resolves.toEqual({ messages: [{ id: "m1" }] });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      binaryPath: "/opt/bin/gws",
      args: [
        "gmail",
        "users",
        "messages",
        "list",
        "--params",
        JSON.stringify({ userId: "me", q: "is:unread", maxResults: 5 }),
      ],
      env: expect.objectContaining({
        GOOGLE_WORKSPACE_CLI_CONFIG_DIR: "/tmp/ambient/google-workspace-cli/travis@example.test",
      }),
    }));
  });

  it("maps Ambient Google OAuth env vars to gws client env vars", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ labels: [] }),
      stderr: "",
      exitCode: 0,
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      appUserDataPath: "/tmp/ambient",
      env: {
        PATH: "/opt/bin",
        AMBIENT_GOOGLE_CLIENT_ID: "ambient-client-id",
        AMBIENT_GOOGLE_CLIENT_SECRET: "ambient-client-secret",
      },
      runner,
    });

    await adapter.invoke({ method: "gmail.listLabels", accountHint: "travis@example.test" });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({
        GOOGLE_WORKSPACE_CLI_CLIENT_ID: "ambient-client-id",
        GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: "ambient-client-secret",
      }),
    }));
  });

  it("filters unrelated host secrets from gws child process env", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ labels: [] }),
      stderr: "",
      exitCode: 0,
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      appUserDataPath: "/tmp/ambient",
      env: {
        PATH: "/opt/bin",
        AMBIENT_API_KEY: "ambient-secret",
        OPENAI_API_KEY: "provider-secret",
        RANDOM_TOKEN: "token-secret",
        AMBIENT_GOOGLE_CLIENT_SECRET: "google-oauth-secret",
      },
      runner,
    });

    await adapter.invoke({ method: "gmail.listLabels", accountHint: "travis@example.test" });
    const env = runner.mock.calls[0][0].env;
    expect(env.AMBIENT_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.RANDOM_TOKEN).toBeUndefined();
    expect(env.GOOGLE_WORKSPACE_CLI_CLIENT_SECRET).toBe("google-oauth-secret");
  });

  it("adds common Google Cloud SDK paths for packaged macOS launches", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ labels: [] }),
      stderr: "",
      exitCode: 0,
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      appUserDataPath: "/tmp/ambient",
      env: {
        HOME: "/Users/neo",
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      },
      runner,
    });

    await adapter.invoke({ method: "gmail.listLabels", accountHint: "travis@example.test" });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({
        PATH: expect.stringContaining("/Users/neo/gcloud/google-cloud-sdk/bin"),
      }),
    }));
    expect(runner.mock.calls[0][0].env.PATH).toContain("/opt/homebrew/bin");
    expect(runner.mock.calls[0][0].env.PATH).toContain("/usr/local/bin");
  });

  it("runs Drive text exports in an isolated cwd and returns exported content", async () => {
    let exportCwd = "";
    const runner = vi.fn(async (invocation) => {
      expect(invocation.cwd).toBeTruthy();
      expect(invocation.cwd).not.toBe(process.cwd());
      exportCwd = invocation.cwd!;
      await writeFile(join(exportCwd, "download.txt"), "Meeting transcript text", "utf8");
      return {
        stdout: JSON.stringify({ status: "success", saved_file: "download.txt", mimeType: "text/plain", bytes: 23 }),
        stderr: "",
        exitCode: 0,
      };
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      appUserDataPath: "/tmp/ambient",
      env: { PATH: "/opt/bin" },
      runner,
    });

    const result = await adapter.invoke<Record<string, unknown>>({
      method: "drive.readFile",
      accountHint: "travis@example.test",
      input: { fileId: "doc-1", exportMimeType: "text/plain" },
    });

    expect(result).toMatchObject({
      status: "success",
      mimeType: "text/plain",
      exportedFileName: "download.txt",
      text: "Meeting transcript text",
      content: "Meeting transcript text",
      contentText: "Meeting transcript text",
    });
    expect(result.saved_file).toBeUndefined();
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        "drive",
        "files",
        "export",
        "--params",
        JSON.stringify({ fileId: "doc-1", mimeType: "text/plain" }),
      ],
    }));
    expect(exportCwd).toBeTruthy();
    expect(existsSync(exportCwd)).toBe(false);
  });
});

describe("gwsCommandForRequest", () => {
  it("maps Drive search to the raw Workspace CLI discovery command", () => {
    expect(gwsCommandForRequest({ method: "drive.search", input: { query: "mimeType='application/pdf'", max: 3 } })).toEqual({
      args: [
        "drive",
        "files",
        "list",
        "--params",
        JSON.stringify({
          q: "mimeType='application/pdf'",
          pageSize: 3,
          fields: "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size)",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        }),
      ],
    });
  });

  it("maps Drive readFile exports to the raw Workspace CLI export command", () => {
    expect(gwsCommandForRequest({ method: "drive.readFile", input: { fileId: "doc-1", exportMimeType: "text/plain", maxContentChars: 4000 } })).toEqual({
      args: [
        "drive",
        "files",
        "export",
        "--params",
        JSON.stringify({ fileId: "doc-1", mimeType: "text/plain" }),
      ],
      isolatedDownloadCwd: true,
      downloadMimeType: "text/plain",
    });
  });

  it("maps Drive readFile metadata reads to the raw Workspace CLI get command", () => {
    expect(gwsCommandForRequest({ method: "drive.readFile", input: { fileId: "file-1", fields: "id,name,mimeType" } })).toEqual({
      args: [
        "drive",
        "files",
        "get",
        "--params",
        JSON.stringify({ fileId: "file-1", fields: "id,name,mimeType", supportsAllDrives: true }),
      ],
    });
  });

  it("maps Calendar event pagination fields to the raw Workspace CLI discovery command", () => {
    expect(
      gwsCommandForRequest({
        method: "calendar.listEvents",
        input: {
          calendarId: "primary",
          timeMin: "2026-05-01T00:00:00-07:00",
          timeMax: "2026-05-15T00:00:00-07:00",
          timeZone: "America/Phoenix",
          maxResults: 100,
          pageToken: "next-page",
          fields: "nextPageToken,items(id,summary,start,end)",
        },
      }),
    ).toEqual({
      args: [
        "calendar",
        "events",
        "list",
        "--params",
        JSON.stringify({
          calendarId: "primary",
          timeMin: "2026-05-01T00:00:00-07:00",
          timeMax: "2026-05-15T00:00:00-07:00",
          timeZone: "America/Phoenix",
          maxResults: 100,
          singleEvents: true,
          orderBy: "startTime",
          pageToken: "next-page",
          fields: "nextPageToken,items(id,summary,start,end)",
        }),
      ],
    });
  });

  it("maps account identity probes", () => {
    expect(gwsCommandForRequest({ method: "gmail.getProfile" })).toEqual({
      args: ["gmail", "users", "getProfile", "--params", JSON.stringify({ userId: "me" })],
    });
    expect(gwsCommandForRequest({ method: "drive.about" })).toEqual({
      args: [
        "drive",
        "about",
        "get",
        "--params",
        JSON.stringify({ fields: "user(emailAddress,displayName,permissionId),storageQuota" }),
      ],
    });
  });

  it("maps dynamic Workspace schema and call requests", () => {
    expect(gwsCommandForRequest({ method: "workspace.schema", input: { methodId: "drive.files.list" } })).toEqual({
      args: ["schema", "drive.files.list"],
    });

    expect(gwsCommandForRequest({
      method: "workspace.call",
      input: {
        methodId: "drive.files.list",
        params: { pageSize: 3, fields: "files(id,name)" },
      },
    })).toEqual({
      args: [
        "drive",
        "files",
        "list",
        "--params",
        JSON.stringify({ pageSize: 3, fields: "files(id,name)" }),
      ],
    });

    expect(gwsCommandForRequest({
      method: "workspace.call",
      input: {
        methodId: "calendar.events.insert",
        params: { calendarId: "primary" },
        body: { summary: "Hold" },
      },
      options: { dryRun: true },
    })).toEqual({
      args: [
        "calendar",
        "events",
        "insert",
        "--dry-run",
        "--params",
        JSON.stringify({ calendarId: "primary" }),
        "--json",
        JSON.stringify({ summary: "Hold" }),
      ],
    });
  });

  it("maps dynamic Drive uploads to gws media upload flags", () => {
    expect(gwsCommandForRequest({
      method: "workspace.call",
      input: {
        methodId: "drive.files.create",
        params: { fields: "id,name,mimeType" },
        body: { name: "upload.txt", mimeType: "text/plain" },
        upload: { path: "/tmp/ambient-upload/upload.txt", mimeType: "text/plain" },
      },
    })).toEqual({
      args: [
        "drive",
        "files",
        "create",
        "--params",
        JSON.stringify({ fields: "id,name,mimeType" }),
        "--json",
        JSON.stringify({ name: "upload.txt", mimeType: "text/plain" }),
        "--upload",
        "/tmp/ambient-upload/upload.txt",
        "--upload-content-type",
        "text/plain",
      ],
    });
  });

  it("maps Gmail draft mutations to explicit dry-run-capable Workspace CLI commands", () => {
    const create = gwsCommandForRequest({
      method: "gmail.createDraft",
      input: { to: ["nobody@example.test"], subject: "Fixture", textBody: "Hello." },
      options: { dryRun: true },
    });
    expect(create.args.slice(0, 6)).toEqual(["gmail", "users", "drafts", "create", "--dry-run", "--params"]);
    expect(JSON.parse(create.args[6])).toEqual({ userId: "me" });
    expect(JSON.parse(create.args[8])).toMatchObject({ message: { raw: expect.any(String) } });

    expect(gwsCommandForRequest({
      method: "gmail.updateDraft",
      input: { draftId: "draft-1", raw: "UmF3IG1lc3NhZ2U" },
    })).toEqual({
      args: [
        "gmail",
        "users",
        "drafts",
        "update",
        "--params",
        JSON.stringify({ userId: "me", id: "draft-1" }),
        "--json",
        JSON.stringify({ message: { raw: "UmF3IG1lc3NhZ2U" } }),
      ],
    });

    expect(gwsCommandForRequest({
      method: "gmail.deleteDraft",
      input: { id: "draft-1" },
      options: { dryRun: true },
    })).toEqual({
      args: [
        "gmail",
        "users",
        "drafts",
        "delete",
        "--dry-run",
        "--params",
        JSON.stringify({ userId: "me", id: "draft-1" }),
      ],
    });
  });

  it("refuses unsupported mutating methods until they have explicit mappings", () => {
    expect(() => gwsCommandForRequest({ method: "gmail.sendDraft", input: { draftId: "d1" } })).toThrow(
      "Google Workspace CLI adapter does not yet support gmail.sendDraft.",
    );
  });
});
