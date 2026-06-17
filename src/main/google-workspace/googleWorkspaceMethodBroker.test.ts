import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GoogleWorkspaceCliAdapter } from "./googleWorkspaceCliAdapter";
import {
  describeGoogleWorkspaceMethod,
  GOOGLE_WORKSPACE_METHOD_CATALOG,
  GoogleWorkspaceMethodBroker,
  classifyGoogleWorkspaceMethodSideEffect,
  googleWorkspaceMethodApprovalDetail,
  googleWorkspaceMethodGrantIdentity,
  searchGoogleWorkspaceMethods,
} from "./googleWorkspaceMethodBroker";

describe("Google Workspace method broker", () => {
  it("searches the generated Google Workspace method catalog", () => {
    const result = searchGoogleWorkspaceMethods({ query: "send draft gmail", limit: 5 });

    expect(result.catalogVersion).toContain("gws");
    expect(GOOGLE_WORKSPACE_METHOD_CATALOG.length).toBeGreaterThan(400);
    expect(result.methods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gmail.users.drafts.send",
          service: "gmail",
          sideEffect: "external_communication",
        }),
      ]),
    );
  });

  it("finds non-seeded methods with schema-derived params and request bodies", () => {
    const result = searchGoogleWorkspaceMethods({ query: "chat create message", service: "chat", httpMethod: "POST", limit: 3 });

    expect(result.methods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "chat.spaces.messages.create",
          sideEffect: "external_communication",
          parameters: expect.arrayContaining([
            expect.objectContaining({ name: "parent", location: "path", required: true }),
          ]),
          requestBody: expect.objectContaining({
            schemaRef: "Message",
            fields: expect.arrayContaining([expect.objectContaining({ name: "text" })]),
          }),
        }),
      ]),
    );
  });

  it("keeps Gmail draft mutations separate from real send methods", () => {
    expect(
      GOOGLE_WORKSPACE_METHOD_CATALOG.filter((method) => method.id.startsWith("gmail.users.drafts.")).map((method) => ({
        id: method.id,
        sideEffect: method.sideEffect,
      })),
    ).toEqual(
      expect.arrayContaining([
        { id: "gmail.users.drafts.create", sideEffect: "draft_write" },
        { id: "gmail.users.drafts.update", sideEffect: "draft_write" },
        { id: "gmail.users.drafts.delete", sideEffect: "draft_write" },
        { id: "gmail.users.drafts.get", sideEffect: "personal_content_read" },
        { id: "gmail.users.drafts.list", sideEffect: "personal_content_read" },
        { id: "gmail.users.drafts.send", sideEffect: "external_communication" },
      ]),
    );
    expect(GOOGLE_WORKSPACE_METHOD_CATALOG.find((method) => method.id === "gmail.users.messages.send")?.sideEffect).toBe("external_communication");
    expect(GOOGLE_WORKSPACE_METHOD_CATALOG.find((method) => method.id === "gmail.users.messages.import")?.sideEffect).toBe("data_mutation");
    expect(GOOGLE_WORKSPACE_METHOD_CATALOG.find((method) => method.id === "gmail.users.messages.insert")?.sideEffect).toBe("data_mutation");
  });

  it("does not classify draft docs that mention sending as external communication", () => {
    const draftDescription = "Creates a draft with the DRAFT label. For more information, see Create and send draft emails.";
    expect(
      classifyGoogleWorkspaceMethodSideEffect({
        methodId: "gmail.users.drafts.create",
        httpMethod: "POST",
        path: "gmail/v1/users/{userId}/drafts",
        description: draftDescription,
      }),
    ).toBe("draft_write");
    expect(
      classifyGoogleWorkspaceMethodSideEffect({
        methodId: "gmail.users.drafts.send",
        httpMethod: "POST",
        path: "gmail/v1/users/{userId}/drafts/send",
        description: "Sends the specified existing draft.",
      }),
    ).toBe("external_communication");
    expect(
      classifyGoogleWorkspaceMethodSideEffect({
        methodId: "gmail.users.messages.send",
        httpMethod: "POST",
        path: "gmail/v1/users/{userId}/messages/send",
        description: "Sends the specified message.",
      }),
    ).toBe("external_communication");
  });

  it("describes arbitrary methods from local gws schema metadata", async () => {
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({
          description: "Create a Google Chat message.",
          httpMethod: "POST",
          path: "v1/{parent=spaces/*}/messages",
          parameters: {
            parent: { location: "path", required: true, type: "string", description: "Space name." },
          },
          requestBody: {
            schemaRef: "Message",
            schema: {
              description: "A Google Chat message.",
              properties: {
                text: { type: "string", description: "Message text." },
              },
            },
          },
          scopes: ["https://www.googleapis.com/auth/chat.messages.create"],
        }),
        stderr: "",
        exitCode: 0,
      }),
    });

    await expect(describeGoogleWorkspaceMethod(adapter, "chat.spaces.messages.create")).resolves.toMatchObject({
      id: "chat.spaces.messages.create",
      service: "chat",
      httpMethod: "POST",
      sideEffect: "external_communication",
      dryRunSupported: true,
      parameters: [expect.objectContaining({ name: "parent", required: true })],
      requestBody: expect.objectContaining({ schemaRef: "Message" }),
    });
  });

  it("inlines text exports from gws saved files and cleans local paths from results", async () => {
    const runner = vi.fn(async (invocation) => {
      if (invocation.args[0] === "schema") {
        return {
          stdout: JSON.stringify({
            description: "Exports a Google Workspace document.",
            httpMethod: "GET",
            path: "files/{fileId}/export",
            parameters: {
              fileId: { location: "path", required: true, type: "string" },
              mimeType: { location: "query", required: true, type: "string" },
            },
            scopes: ["https://www.googleapis.com/auth/drive.readonly"],
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      if (!invocation.cwd) throw new Error("Expected export call to run in an isolated cwd.");
      await writeFile(join(invocation.cwd, "download.txt"), "Exported poem text", "utf8");
      return {
        stdout: JSON.stringify({ bytes: 18, mimeType: "text/plain", saved_file: "download.txt", status: "success" }),
        stderr: "",
        exitCode: 0,
      };
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner,
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    const result = await broker.call({
      accountHint: "travis@example.test",
      methodId: "drive.files.export",
      params: { fileId: "file-1", mimeType: "text/plain" },
    });

    expect(result.result).toEqual({
      bytes: 18,
      mimeType: "text/plain",
      exportedFileName: "download.txt",
      status: "success",
      text: "Exported poem text",
    });
    expect(JSON.stringify(result.result)).not.toContain("saved_file");
  });

  it("adds a Drive export fallback hint when native Docs API is disabled", async () => {
    const runner = vi.fn(async (invocation) => {
      if (invocation.args[0] === "schema") {
        return {
          stdout: JSON.stringify({
            description: "Gets the latest version of the specified document.",
            httpMethod: "GET",
            path: "v1/documents/{documentId}",
            parameters: {
              documentId: { location: "path", required: true, type: "string" },
            },
            scopes: ["https://www.googleapis.com/auth/documents.readonly"],
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      return {
        stdout: "",
        stderr: JSON.stringify({
          error: {
            code: 403,
            message: "Google Docs API has not been used in project 123 before or it is disabled.",
            status: "PERMISSION_DENIED",
            details: [{ reason: "SERVICE_DISABLED" }],
          },
        }),
        exitCode: 3,
      };
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner,
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    await expect(broker.call({ methodId: "docs.documents.get", params: { documentId: "doc-1" } })).rejects.toThrow(
      /Google Docs API is not available[\s\S]*drive\.files\.export[\s\S]*mimeType/,
    );
    await expect(broker.call({ methodId: "docs.documents.get", params: { documentId: "doc-1" } })).rejects.toThrow(
      "Do not keep retrying docs.documents.get",
    );
  });

  it("resolves omitted calls through the account registry before invoking gws", async () => {
    const configDirs: string[] = [];
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      appUserDataPath: "/tmp/ambient",
      runner: vi.fn(async (invocation) => {
        configDirs.push(invocation.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ?? "");
        if (invocation.args[0] === "schema") {
          return {
            stdout: JSON.stringify({
              description: "Lists events on the specified calendar.",
              httpMethod: "GET",
              path: "calendar/v3/calendars/{calendarId}/events",
              parameters: {
                calendarId: { location: "path", required: true, type: "string" },
              },
              scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        return { stdout: JSON.stringify({ items: [] }), stderr: "", exitCode: 0 };
      }),
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter, {
      resolveAccountHint: (accountHint) => accountHint ?? "work",
    });

    const result = await broker.call({
      methodId: "calendar.events.list",
      params: { calendarId: "primary" },
    });

    expect(result.accountHint).toBe("work");
    expect(configDirs).toContain("/tmp/ambient/google-workspace-cli/work");
  });

  it("converts binary exports into managed file handles and materializes them on request", async () => {
    const runner = vi.fn(async (invocation) => {
      if (invocation.args[0] === "schema") {
        return {
          stdout: JSON.stringify({
            description: "Exports a Google Workspace document.",
            httpMethod: "GET",
            path: "files/{fileId}/export",
            parameters: {
              fileId: { location: "path", required: true, type: "string" },
              mimeType: { location: "query", required: true, type: "string" },
            },
            scopes: ["https://www.googleapis.com/auth/drive.readonly"],
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      if (!invocation.cwd) throw new Error("Expected export call to run in an isolated cwd.");
      await writeFile(join(invocation.cwd, "download.pdf"), Buffer.from([0x25, 0x50, 0x44, 0x46]));
      return {
        stdout: JSON.stringify({ bytes: 4, mimeType: "application/pdf", saved_file: "download.pdf", status: "success" }),
        stderr: "",
        exitCode: 0,
      };
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner,
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    const result = await broker.call({
      accountHint: "travis@example.test",
      methodId: "drive.files.export",
      params: { fileId: "file-1", mimeType: "application/pdf" },
    });
    const value = result.result as {
      file?: { handle?: string; kind?: string; fileName?: string; bytes?: number; materializeWith?: string; availableToModel?: boolean };
    };

    expect(JSON.stringify(result.result)).not.toContain("saved_file");
    expect(value.file).toMatchObject({
      kind: "google_workspace_managed_file",
      fileName: "download.pdf",
      bytes: 4,
      materializeWith: "google_workspace_materialize_file",
      availableToModel: false,
    });
    expect(JSON.stringify(result.result)).not.toContain(invocationCwd(runner));

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-gws-materialize-test-"));
    const materialized = await broker.materializeFile({
      handle: value.file!.handle!,
      workspacePath,
      path: "exports/poem.pdf",
    });

    expect(materialized).toEqual({
      handle: value.file!.handle,
      path: "exports/poem.pdf",
      bytes: 4,
      fileName: "download.pdf",
      mimeType: "application/pdf",
      overwritten: false,
    });
    await expect(readFile(join(workspacePath, "exports/poem.pdf"))).resolves.toEqual(Buffer.from([0x25, 0x50, 0x44, 0x46]));
    await expect(
      broker.materializeFile({ handle: value.file!.handle!, workspacePath, path: "exports/poem.pdf" }),
    ).rejects.toThrow("already exists");
  });

  it("converts Gmail attachment payloads into managed file handles without exposing base64 content", async () => {
    const attachment = Buffer.from("fixture attachment bytes", "utf8");
    const attachmentData = attachment.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const runner = vi.fn(async (invocation) => {
      if (invocation.args[0] === "schema") {
        return {
          stdout: JSON.stringify({
            description: "Gets the specified message attachment.",
            httpMethod: "GET",
            path: "gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}",
            parameters: {
              userId: { location: "path", required: true, type: "string", default: "me" },
              messageId: { location: "path", required: true, type: "string" },
              id: { location: "path", required: true, type: "string" },
            },
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      return {
        stdout: JSON.stringify({ data: attachmentData, size: attachment.length }),
        stderr: "",
        exitCode: 0,
      };
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner,
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    const result = await broker.call({
      accountHint: "travis@example.test",
      methodId: "gmail.users.messages.attachments.get",
      params: { userId: "me", messageId: "message-1", id: "attachment/1" },
    });
    const value = result.result as {
      data?: string;
      size?: number;
      file?: { handle?: string; kind?: string; fileName?: string; mimeType?: string; bytes?: number; materializeWith?: string; availableToModel?: boolean };
    };

    expect(JSON.stringify(result.result)).not.toContain(attachmentData);
    expect(value.data).toBeUndefined();
    expect(value.size).toBe(attachment.length);
    expect(value.file).toMatchObject({
      kind: "google_workspace_managed_file",
      fileName: "gmail-attachment-attachment_1.bin",
      mimeType: "application/octet-stream",
      bytes: attachment.length,
      materializeWith: "google_workspace_materialize_file",
      availableToModel: false,
    });

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-gws-attachment-materialize-test-"));
    const materialized = await broker.materializeFile({
      handle: value.file!.handle!,
      workspacePath,
      path: "attachments/gmail-attachment.bin",
    });

    expect(materialized).toEqual({
      handle: value.file!.handle,
      path: "attachments/gmail-attachment.bin",
      bytes: attachment.length,
      fileName: "gmail-attachment-attachment_1.bin",
      mimeType: "application/octet-stream",
      overwritten: false,
    });
    await expect(readFile(join(workspacePath, "attachments/gmail-attachment.bin"))).resolves.toEqual(attachment);
  });

  it("uploads Drive file content from workspace-relative paths and returns an explicit write result", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-gws-upload-test-"));
    await mkdir(join(workspacePath, "uploads"), { recursive: true });
    await writeFile(join(workspacePath, "uploads", "upload.txt"), "uploaded from workspace", "utf8");
    const runner = vi.fn(async (invocation) => {
      if (invocation.args[0] === "schema") {
        return {
          stdout: JSON.stringify({
            description: "Creates a file.",
            httpMethod: "POST",
            path: "files",
            parameters: {
              fields: { location: "query", required: false, type: "string" },
            },
            requestBody: {
              schemaRef: "File",
              schema: {
                properties: {
                  name: { type: "string" },
                  mimeType: { type: "string" },
                },
              },
            },
            scopes: ["https://www.googleapis.com/auth/drive.file"],
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      return {
        stdout: JSON.stringify({ id: "drive-file-1", name: "upload.txt", mimeType: "text/plain" }),
        stderr: "",
        exitCode: 0,
      };
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner,
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    const result = await broker.call({
      accountHint: "travis@example.test",
      methodId: "drive.files.create",
      params: { fields: "id,name,mimeType" },
      body: { name: "upload.txt", mimeType: "text/plain" },
      upload: { path: "uploads/upload.txt", mimeType: "text/plain" },
      workspacePath,
    });
    const value = result.result as {
      kind?: string;
      operation?: string;
      upload?: { path?: string; fileName?: string; bytes?: number; mimeType?: string };
      response?: Record<string, unknown>;
    };
    const uploadInvocation = runner.mock.calls.find((call) => call[0]?.args?.includes("--upload"))?.[0];
    const callArgs = uploadInvocation?.args ?? [];

    expect(callArgs).toContain("--upload");
    expect(callArgs[callArgs.indexOf("--upload") + 1]).toBe("uploads/upload.txt");
    expect(callArgs).toContain("--upload-content-type");
    expect(uploadInvocation?.cwd).toBe(workspacePath);
    expect(JSON.stringify(result.result)).not.toContain(workspacePath);
    expect(value).toMatchObject({
      kind: "google_workspace_drive_file_content_write",
      operation: "create",
      upload: {
        path: "uploads/upload.txt",
        fileName: "upload.txt",
        bytes: 23,
        mimeType: "text/plain",
      },
      response: { id: "drive-file-1", name: "upload.txt", mimeType: "text/plain" },
    });
  });

  it("labels Drive file content updates explicitly", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-gws-update-test-"));
    await writeFile(join(workspacePath, "replacement.txt"), "replacement content", "utf8");
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner: vi.fn(async (invocation) => ({
        stdout: invocation.args[0] === "schema"
          ? JSON.stringify({
              description: "Updates a file's metadata, content, or both.",
              httpMethod: "PATCH",
              path: "files/{fileId}",
              parameters: { fileId: { location: "path", required: true, type: "string" } },
              scopes: ["https://www.googleapis.com/auth/drive.file"],
            })
          : JSON.stringify({ id: "drive-file-1", name: "replacement.txt" }),
        stderr: "",
        exitCode: 0,
      })),
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    const result = await broker.call({
      methodId: "drive.files.update",
      params: { fileId: "drive-file-1" },
      upload: { path: "replacement.txt" },
      workspacePath,
    });

    expect(result.result).toMatchObject({
      kind: "google_workspace_drive_file_content_write",
      operation: "update",
      upload: {
        path: "replacement.txt",
        fileName: "replacement.txt",
        bytes: 19,
      },
      response: { id: "drive-file-1", name: "replacement.txt" },
    });
  });

  it("creates Gmail draft raw MIME with workspace-relative attachments", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-gws-gmail-draft-test-"));
    await mkdir(join(workspacePath, "attachments"), { recursive: true });
    await writeFile(join(workspacePath, "attachments", "notes.txt"), "attachment fixture", "utf8");
    const runner = vi.fn(async (invocation) => {
      if (invocation.args[0] === "schema") {
        return {
          stdout: JSON.stringify({
            description: "Creates a Gmail draft.",
            httpMethod: "POST",
            path: "gmail/v1/users/{userId}/drafts",
            parameters: {
              userId: { location: "path", required: true, type: "string", default: "me" },
            },
            requestBody: {
              schemaRef: "Draft",
              schema: { properties: { message: { type: "Message" } } },
            },
            scopes: ["https://www.googleapis.com/auth/gmail.compose"],
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      return {
        stdout: JSON.stringify({ id: "draft-1", message: { id: "message-1" } }),
        stderr: "",
        exitCode: 0,
      };
    });
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner,
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    const result = await broker.call({
      accountHint: "travis@example.test",
      methodId: "gmail.users.drafts.create",
      params: { userId: "me" },
      body: {},
      gmailDraft: {
        to: ["nobody@example.test"],
        subject: "Attachment fixture",
        textBody: "See attached.",
        attachments: [{ path: "attachments/notes.txt", mimeType: "text/plain" }],
      },
      workspacePath,
    });
    const callArgs = runner.mock.calls.find((call) => call[0]?.args?.includes("--json"))?.[0].args ?? [];
    const raw = JSON.parse(callArgs[callArgs.indexOf("--json") + 1]).message.raw as string;
    const mime = decodeBase64UrlText(raw);

    expect(callArgs).not.toContain("--upload");
    expect(mime).toContain("Content-Type: multipart/mixed");
    expect(mime).toContain("To: nobody@example.test");
    expect(mime).toContain("Subject: Attachment fixture");
    expect(mime).toContain('filename="notes.txt"');
    expect(mime).toContain(Buffer.from("attachment fixture", "utf8").toString("base64"));
    expect(JSON.stringify(result.result)).not.toContain(raw);
    expect(JSON.stringify(result.result)).not.toContain(workspacePath);
    expect(result.result).toMatchObject({
      kind: "google_workspace_gmail_draft_write",
      operation: "create",
      subject: "Attachment fixture",
      attachments: [
        {
          path: "attachments/notes.txt",
          fileName: "notes.txt",
          bytes: 18,
          mimeType: "text/plain",
        },
      ],
      response: { id: "draft-1", message: { id: "message-1" } },
    });
  });

  it("rejects Gmail draft attachments outside the current workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-gws-gmail-draft-path-test-"));
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner: vi.fn(async (invocation) => ({
        stdout: invocation.args[0] === "schema"
          ? JSON.stringify({ description: "Creates a Gmail draft.", httpMethod: "POST", path: "gmail/v1/users/{userId}/drafts", scopes: ["https://www.googleapis.com/auth/gmail.compose"] })
          : JSON.stringify({ id: "should-not-run" }),
        stderr: "",
        exitCode: 0,
      })),
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    await expect(
      broker.call({
        methodId: "gmail.users.drafts.create",
        gmailDraft: {
          subject: "Bad attachment",
          attachments: [{ path: "../outside.txt" }],
        },
        workspacePath,
      }),
    ).rejects.toThrow("outside the current workspace");
  });

  it("rejects Drive uploads outside the current workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-gws-upload-path-test-"));
    const adapter = new GoogleWorkspaceCliAdapter({
      binaryPath: "/opt/bin/gws",
      fileExists: () => true,
      runner: vi.fn(async (invocation) => ({
        stdout: invocation.args[0] === "schema"
          ? JSON.stringify({ description: "Creates a file.", httpMethod: "POST", path: "files", scopes: ["https://www.googleapis.com/auth/drive.file"] })
          : JSON.stringify({ id: "should-not-run" }),
        stderr: "",
        exitCode: 0,
      })),
    });
    const broker = new GoogleWorkspaceMethodBroker(adapter);

    await expect(
      broker.call({
        methodId: "drive.files.create",
        upload: { path: "../outside.txt" },
        workspacePath,
      }),
    ).rejects.toThrow("outside the current workspace");
  });

  it("summarizes approval detail without raw body content", () => {
    const method = searchGoogleWorkspaceMethods({ query: "create draft" }).methods[0]!;
    const detail = googleWorkspaceMethodApprovalDetail(method, {
      accountHint: "travis@example.test",
      methodId: method.id,
      params: { userId: "me" },
      body: { message: { raw: "very-secret-body" } },
      dryRun: true,
    });

    expect(detail).toContain("Account: travis@example.test");
    expect(detail).toContain("Method: gmail.users.drafts.create");
    expect(detail).toContain("Dry run requested: yes");
    expect(detail).toContain("Idempotency key: none");
    expect(detail).toContain("Required params: userId:path:string");
    expect(detail).toContain("Request body schema: Draft");
    expect(detail).toContain("Body: {message}");
    expect(detail).not.toContain("very-secret-body");
    expect(googleWorkspaceMethodGrantIdentity(method, { accountHint: "travis@example.test", methodId: method.id })).toContain(method.id);
  });

  it("summarizes upload detail without exposing local absolute paths", () => {
    const method = GOOGLE_WORKSPACE_METHOD_CATALOG.find((candidate) => candidate.id === "drive.files.create")!;
    const detail = googleWorkspaceMethodApprovalDetail(method, {
      accountHint: "travis@example.test",
      methodId: method.id,
      params: { fields: "id,name" },
      body: { name: "upload.txt", description: "visible metadata" },
      upload: { path: "uploads/upload.txt", mimeType: "text/plain" },
    });

    expect(detail).toContain("Upload: workspace path uploads/upload.txt; mimeType text/plain");
    expect(detail).not.toContain("/Users/");
  });

  it("summarizes Gmail draft attachments without raw body or absolute paths", () => {
    const method = GOOGLE_WORKSPACE_METHOD_CATALOG.find((candidate) => candidate.id === "gmail.users.drafts.create")!;
    const detail = googleWorkspaceMethodApprovalDetail(method, {
      accountHint: "travis@example.test",
      methodId: method.id,
      params: { userId: "me" },
      gmailDraft: {
        to: "nobody@example.test",
        subject: "Attachment fixture",
        textBody: "secret draft body",
        attachments: [{ path: "attachments/notes.txt", mimeType: "text/plain" }],
      },
    });

    expect(detail).toContain("Gmail draft: subject Attachment fixture; to yes; attachments 1; attachment paths attachments/notes.txt");
    expect(detail).not.toContain("secret draft body");
    expect(detail).not.toContain("/Users/");
  });

  it("includes caller idempotency keys in approval details without changing grant identity", () => {
    const method = searchGoogleWorkspaceMethods({ query: "calendar create event", service: "calendar", httpMethod: "POST" }).methods[0]!;
    const detail = googleWorkspaceMethodApprovalDetail(method, {
      accountHint: "travis@example.test",
      methodId: method.id,
      params: { calendarId: "primary" },
      body: { summary: "Ambient test event" },
      idempotencyKey: "ambient-write-dogfood-123",
    });

    expect(detail).toContain("Idempotency key: ambient-write-dogfood-123");
    expect(googleWorkspaceMethodGrantIdentity(method, { accountHint: "travis@example.test", methodId: method.id, idempotencyKey: "one" })).toBe(
      googleWorkspaceMethodGrantIdentity(method, { accountHint: "travis@example.test", methodId: method.id, idempotencyKey: "two" }),
    );
  });
});

function invocationCwd(runner: ReturnType<typeof vi.fn>): string {
  return runner.mock.calls.find((call) => call[0]?.cwd)?.[0].cwd ?? "";
}

function decodeBase64UrlText(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}
