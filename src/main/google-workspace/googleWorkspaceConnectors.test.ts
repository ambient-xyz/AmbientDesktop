import { describe, expect, it, vi } from "vitest";
import { createWorkflowConnectorBridge } from "./googleWorkspaceWorkflowFacade";
import { googleWorkspaceConnectorDescriptors, googleWorkspaceConnectorRegistrations } from "./googleWorkspaceConnectors";
import type { WorkflowRuntimeEvent } from "./googleWorkspaceWorkflowFacade";

describe("googleWorkspaceConnectorDescriptors", () => {
  it("declares first-party Gmail, Calendar, and Drive connectors", () => {
    const descriptors = googleWorkspaceConnectorDescriptors();
    expect(descriptors.map((descriptor) => descriptor.id)).toEqual([
      "google.gmail",
      "google.calendar",
      "google.drive",
    ]);
    expect(descriptors.flatMap((descriptor) => descriptor.operations.map((operation) => operation.name))).toContain("sendDraft");
    expect(descriptors.flatMap((descriptor) => descriptor.operations.map((operation) => operation.name))).toContain("freeBusy");
    expect(descriptors.flatMap((descriptor) => descriptor.operations.map((operation) => operation.name))).toContain("createPermission");
  });

  it("keeps write operations behind approval policy", () => {
    const writeOperations = googleWorkspaceConnectorDescriptors().flatMap((descriptor) =>
      descriptor.operations.filter((operation) => operation.sideEffects === "write_external"),
    );
    expect(writeOperations.length).toBeGreaterThan(0);
    expect(writeOperations.every((operation) => operation.mutationPolicy === "apply_after_approval")).toBe(true);
  });

  it("filters to the implemented gws read and draft surface for the CLI adapter", () => {
    const descriptors = googleWorkspaceConnectorDescriptors({ adapter: "gws" });
    const operations = descriptors.flatMap((descriptor) => descriptor.operations.map((operation) => `${descriptor.id}:${operation.name}`));
    expect(operations).toContain("google.gmail:search");
    expect(operations).toContain("google.gmail:createDraft");
    expect(operations).toContain("google.gmail:updateDraft");
    expect(operations).toContain("google.gmail:deleteDraft");
    expect(operations).toContain("google.calendar:freeBusy");
    expect(operations).toContain("google.drive:listSharedDrives");
    expect(operations).not.toContain("google.gmail:sendDraft");
    expect(operations).not.toContain("google.drive:createPermission");
    const gmailSearch = descriptors.find((descriptor) => descriptor.id === "google.gmail")!.operations.find((operation) => operation.name === "search")!;
    const calendarListEvents = descriptors.find((descriptor) => descriptor.id === "google.calendar")!.operations.find((operation) => operation.name === "listEvents")!;
    const driveSearch = descriptors.find((descriptor) => descriptor.id === "google.drive")!.operations.find((operation) => operation.name === "search")!;
    expect(gmailSearch.inputSchema).toMatchObject({
      properties: {
        query: expect.any(Object),
        maxResults: expect.any(Object),
      },
      additionalProperties: false,
    });
    expect(gmailSearch.outputSchema).toMatchObject({
      properties: {
        messages: expect.objectContaining({ type: "array" }),
        threads: expect.objectContaining({ type: "array" }),
        resultSizeEstimate: expect.objectContaining({ type: "number" }),
      },
    });
    expect(calendarListEvents.pagination).toMatchObject({
      itemsPath: "items",
      nextPageTokenPath: "nextPageToken",
      pageTokenInputPath: "pageToken",
      pageSizeInputPath: "maxResults",
      defaultPageSize: 100,
      maxPageSize: 2500,
    });
    expect(calendarListEvents.inputSchema).toMatchObject({
      required: ["timeMin", "timeMax", "timeZone"],
      properties: {
        maxResults: expect.any(Object),
        pageToken: expect.any(Object),
        timeZone: expect.any(Object),
      },
      additionalProperties: false,
    });
    expect(driveSearch.pagination).toMatchObject({
      itemsPath: "files",
      nextPageTokenPath: "nextPageToken",
      pageTokenInputPath: "pageToken",
      pageSizeInputPath: "pageSize",
      defaultPageSize: 100,
      maxPageSize: 1000,
    });
    expect(driveSearch.outputSchema).toMatchObject({
      properties: {
        files: expect.objectContaining({ type: "array" }),
        items: expect.objectContaining({ type: "array" }),
        nextPageToken: expect.any(Object),
      },
    });
  });

  it("routes connector calls through Desktop auth and the legacy stateless sidecar", async () => {
    const invoke = vi.fn().mockResolvedValue({ threads: [] });
    const registrations = googleWorkspaceConnectorRegistrations({
      auth: {
        accessTokenForApp: vi.fn().mockResolvedValue({
          account: {
            id: "google.workspace:subject-1",
            providerId: "google.workspace",
            connectorId: "google.workspace",
            accountId: "subject-1",
            label: "travis@example.test",
            email: "travis@example.test",
            grantedScopes: ["gmail.readonly"],
            status: "available",
            tokenRef: "redacted",
            connectedAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          },
          accessToken: "access-token",
          scopes: ["gmail.readonly"],
        }),
      },
      sidecar: { invoke },
    });

    await expect(
      registrations
        .find((registration) => registration.descriptor.id === "google.gmail")!
        .handlers.search({ connectorId: "google.gmail", operation: "search", accountId: "subject-1", input: { query: "from:a" } }),
    ).resolves.toEqual({ threads: [] });

    expect(invoke).toHaveBeenCalledWith({
      method: "gmail.search",
      accessToken: "access-token",
      accountHint: "travis@example.test",
      input: { query: "from:a" },
      options: { timeoutMs: 30_000 },
    });
  });

  it("normalizes Gmail search thread id aliases for workflow connector fan-out", async () => {
    const invoke = vi.fn().mockResolvedValue({ threads: [{ id: "thread-1", snippet: "hello" }], messages: [{ id: "message-1", threadId: "thread-1" }] });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      { adapter: "gws" },
    );

    await expect(
      registrations
        .find((registration) => registration.descriptor.id === "google.gmail")!
        .handlers.search({ connectorId: "google.gmail", operation: "search", accountId: "default", input: { query: "from:a" } }),
    ).resolves.toEqual({
      threads: [{ id: "thread-1", threadId: "thread-1", snippet: "hello" }],
      messages: [{ id: "message-1", threadId: "thread-1" }],
    });
  });

  it("synthesizes Gmail search thread entries from message-only wrapper results", async () => {
    const invoke = vi.fn().mockResolvedValue({ messages: [{ id: "message-1", threadId: "thread-1", snippet: "hello" }] });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      { adapter: "gws" },
    );

    await expect(
      registrations
        .find((registration) => registration.descriptor.id === "google.gmail")!
        .handlers.search({ connectorId: "google.gmail", operation: "search", accountId: "default", input: { query: "" } }),
    ).resolves.toEqual({
      messages: [{ id: "message-1", threadId: "thread-1", snippet: "hello" }],
      threads: [{ id: "thread-1", threadId: "thread-1", messageIds: ["message-1"], snippet: "hello" }],
    });
  });

  it("does not synthesize Gmail thread reads from message ids when thread ids are absent", async () => {
    const invoke = vi.fn().mockResolvedValue({ messages: [{ id: "message-1", snippet: "hello" }] });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      { adapter: "gws" },
    );

    await expect(
      registrations
        .find((registration) => registration.descriptor.id === "google.gmail")!
        .handlers.search({ connectorId: "google.gmail", operation: "search", accountId: "default", input: { query: "" } }),
    ).resolves.toEqual({
      messages: [{ id: "message-1", snippet: "hello" }],
      threads: [],
    });
  });

  it("normalizes Drive and Calendar paginated list aliases for workflow pagination", async () => {
    const invoke = vi.fn().mockImplementation(async ({ method }: { method: string }) => {
      if (method === "drive.search") return { files: [{ id: "file-1", name: "Transcript" }], nextPageToken: "drive-page-2" };
      if (method === "calendar.listEvents") return { items: [{ id: "event-1", summary: "Standup" }], nextPageToken: "calendar-page-2" };
      throw new Error(`unexpected method ${method}`);
    });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      { adapter: "gws" },
    );

    await expect(
      registrations
        .find((registration) => registration.descriptor.id === "google.drive")!
        .handlers.search({ connectorId: "google.drive", operation: "search", accountId: "default", input: { query: "mimeType='text/plain'", pageSize: 50 } }),
    ).resolves.toMatchObject({
      files: [{ id: "file-1", name: "Transcript" }],
      items: [{ id: "file-1", name: "Transcript" }],
      nextPageToken: "drive-page-2",
    });

    await expect(
      registrations
        .find((registration) => registration.descriptor.id === "google.calendar")!
        .handlers.listEvents({
          connectorId: "google.calendar",
          operation: "listEvents",
          accountId: "default",
          input: { timeMin: "2026-05-01T00:00:00-07:00", timeMax: "2026-05-15T00:00:00-07:00", timeZone: "America/Phoenix", maxResults: 50 },
        }),
    ).resolves.toMatchObject({
      items: [{ id: "event-1", summary: "Standup" }],
      events: [{ id: "event-1", summary: "Standup" }],
      nextPageToken: "calendar-page-2",
    });
  });

  it("normalizes Drive readFile results into bounded text summaries", async () => {
    const invoke = vi.fn().mockResolvedValue({
      id: "file-1",
      name: "Transcript",
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: "2026-05-15T10:00:00.000Z",
      webViewLink: "https://docs.example.test/file-1",
      description: "D".repeat(1500),
      text: "A".repeat(25_000),
      rawExport: "raw-export-should-not-leak",
    });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      { adapter: "gws" },
    );

    const result = await registrations
      .find((registration) => registration.descriptor.id === "google.drive")!
      .handlers.readFile({
        connectorId: "google.drive",
        operation: "readFile",
        accountId: "default",
        input: { fileId: "file-1", maxContentChars: 4_000 },
      });

    expect(result).toMatchObject({
      id: "file-1",
      name: "Transcript",
      text: expect.stringContaining("[truncated]"),
      content: expect.stringContaining("[truncated]"),
      contentText: expect.stringContaining("[truncated]"),
      contentChars: 25_000,
      truncated: true,
    });
    expect(JSON.stringify(result)).not.toContain("raw-export-should-not-leak");
    expect((result as { text: string }).text.length).toBeLessThanOrEqual(4_000);
    expect((result as { description: string }).description.length).toBeLessThanOrEqual(1000);
  });

  it("normalizes Gmail readThread results into bounded message summaries", async () => {
    const invoke = vi.fn().mockResolvedValue({
      id: "thread-1",
      messages: [
        {
          id: "message-1",
          threadId: "thread-1",
          snippet: "hello",
          internalDate: "1710000000000",
          labelIds: ["INBOX"],
          payload: {
            body: { data: "raw-body-should-not-leak" },
            headers: [
              { name: "From", value: "sender@example.test" },
              { name: "Subject", value: "A".repeat(700) },
              { name: "X-Unneeded", value: "drop me" },
            ],
          },
          raw: "raw-message-should-not-leak",
        },
      ],
    });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      { adapter: "gws" },
    );

    const result = await registrations
      .find((registration) => registration.descriptor.id === "google.gmail")!
      .handlers.readThread({ connectorId: "google.gmail", operation: "readThread", accountId: "default", input: { threadId: "thread-1" } });

    expect(result).toMatchObject({
      id: "thread-1",
      threadId: "thread-1",
      messages: [
        {
          id: "message-1",
          threadId: "thread-1",
          snippet: "hello",
          internalDate: "1710000000000",
          labelIds: ["INBOX"],
          headers: {
            from: "sender@example.test",
            subject: expect.stringContaining("[truncated]"),
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("raw-body-should-not-leak");
    expect(JSON.stringify(result)).not.toContain("raw-message-should-not-leak");
    expect(JSON.stringify(result)).not.toContain("X-Unneeded");
  });

  it("routes gws connector calls without Ambient-owned OAuth tokens", async () => {
    const invoke = vi.fn().mockResolvedValue({ messages: [] });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      { adapter: "gws" },
    );

    await expect(
      registrations
        .find((registration) => registration.descriptor.id === "google.gmail")!
        .handlers.search({ connectorId: "google.gmail", operation: "search", accountId: "default", input: { query: "from:a" } }),
    ).resolves.toEqual({ messages: [], threads: [] });

    expect(invoke).toHaveBeenCalledWith({
      method: "gmail.search",
      accountHint: "default",
      input: { query: "from:a" },
      options: { timeoutMs: 30_000 },
    });
  });

  it("routes approved gws Gmail draft creation with dry-run and review preview metadata", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const invoke = vi.fn().mockResolvedValue({
      dry_run: true,
      method: "POST",
      url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    });
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke } },
      {
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "travis@example.test", label: "travis@example.test" }],
          },
        },
      },
    );
    const bridge = createWorkflowConnectorBridge({
      manifest: {
        tools: [],
        mutationPolicy: "apply_after_approval",
        connectors: [
          {
            connectorId: "google.gmail",
            accountId: "travis@example.test",
            scopes: ["gmail.compose"],
            operations: ["createDraft"],
            dataRetention: "redacted_audit",
          },
        ],
      },
      registrations,
      dryRun: true,
      eventSink: { append: (event) => void events.push(event) },
      connectorApprovalDecision: (_approvalId, changeSet) => {
        expect(changeSet).toMatchObject({
          connectorId: "google.gmail",
          operation: "createDraft",
          sideEffects: "write_external",
          approvalPreview: {
            service: "gmail",
            action: "createDraft",
            accountId: "travis@example.test",
            summary: "Create a Gmail draft without sending it.",
            sendsExternalCommunication: false,
          },
        });
        expect(JSON.stringify(changeSet)).toContain("Recipients: to=1");
        expect(JSON.stringify(changeSet)).not.toContain("nobody@example.test");
        expect(JSON.stringify(changeSet)).not.toContain("Fixture subject");
        return "approved";
      },
    });

    await expect(
      bridge.call({
        connectorId: "google.gmail",
        operation: "createDraft",
        input: { to: ["nobody@example.test"], subject: "Fixture subject", textBody: "Hello." },
        idempotencyKey: "draft-fixture-1",
      }),
    ).resolves.toMatchObject({ dry_run: true, method: "POST" });

    expect(invoke).toHaveBeenCalledWith({
      method: "gmail.createDraft",
      accountHint: "travis@example.test",
      input: { to: ["nobody@example.test"], subject: "Fixture subject", textBody: "Hello." },
      options: { timeoutMs: 30_000, dryRun: true },
    });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["connector.review.approved", "connector.start", "connector.end"]));
  });

  it("carries validated gws account state into runtime descriptors", () => {
    const registrations = googleWorkspaceConnectorRegistrations(
      { sidecar: { invoke: vi.fn() } },
      {
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "travis@example.test", label: "travis@example.test" }],
          },
        },
      },
    );

    const gmail = registrations.find((registration) => registration.descriptor.id === "google.gmail")!.descriptor;
    expect(gmail.auth).toMatchObject({
      type: "oauth2",
      status: "available",
      providerId: "google.workspace.cli",
    });
    expect(gmail.accounts).toEqual([{ id: "travis@example.test", label: "travis@example.test" }]);
  });
});
