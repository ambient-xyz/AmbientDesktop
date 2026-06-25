import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { compileWorkflowProgramIr } from "./workflowProgramCompiler";

describe("compileWorkflowProgramIr Google Workspace policy", () => {
  it("allows read-only Google Workspace status, method search, method call, and local materialization", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Google Drive Read Report",
        goal: "Read Google Drive metadata and save a local review copy.",
        nodes: [
          { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
          {
            id: "search-methods",
            kind: "tool.call",
            tool: "google_workspace_search_methods",
            dependsOn: ["google-status"],
            args: { service: "drive", query: "list Drive files", sideEffect: "metadata_read" },
          },
          {
            id: "list-files",
            kind: "tool.call",
            tool: "google_workspace_call",
            dependsOn: ["search-methods"],
            args: { accountHint: "user@example.com", methodId: "drive.files.list", params: { pageSize: 10 } },
          },
          {
            id: "materialize-file",
            kind: "tool.call",
            tool: "google_workspace_materialize_file",
            dependsOn: ["list-files"],
            args: { fileHandle: { fromNode: "list-files", path: "fileHandle" }, path: "Google Workspace Downloads/drive-list.json" },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["materialize-file"],
            value: { localCopy: { fromNode: "materialize-file", path: "path" } },
          },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(
      expect.arrayContaining([
        "google_workspace_status",
        "google_workspace_search_methods",
        "google_workspace_call",
        "google_workspace_materialize_file",
      ]),
    );
    expect(result.output.manifest.googleWorkspaceMethods).toEqual([
      expect.objectContaining({
        methodId: "drive.files.list",
        accountHint: "user@example.com",
        accountProvenance: "literal",
        service: "drive",
        resource: "files",
        method: "list",
        httpMethod: "GET",
        sideEffect: "personal_content_read",
        dataRetention: "run_artifact",
        dryRunSupported: false,
        catalogVersion: expect.any(String),
        scopes: expect.arrayContaining(["https://www.googleapis.com/auth/drive.readonly"]),
      }),
    ]);
    expect(result.dryRun.calls.map((call) => call.name)).toEqual(
      expect.arrayContaining([
        "google_workspace_status",
        "google_workspace_search_methods",
        "google_workspace_call",
        "google_workspace_materialize_file",
      ]),
    );
  });

  it("allows read-only Calendar calls only with account, explicit date range, and timezone", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Calendar Agenda",
        goal: "Read a bounded Google Calendar agenda.",
        nodes: [
          { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
          {
            id: "search-methods",
            kind: "tool.call",
            tool: "google_workspace_search_methods",
            dependsOn: ["google-status"],
            args: { service: "calendar", query: "list events", sideEffect: "personal_content_read", httpMethod: "GET" },
          },
          {
            id: "list-events",
            kind: "tool.call",
            tool: "google_workspace_call",
            dependsOn: ["search-methods"],
            args: {
              accountHint: { fromNode: "google-status", path: "accounts.0.accountHint" },
              methodId: "calendar.events.list",
              params: {
                calendarId: "primary",
                timeMin: "2026-05-15T00:00:00-07:00",
                timeMax: "2026-05-16T00:00:00-07:00",
                timeZone: "America/Phoenix",
              },
            },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["list-events"],
            value: { events: { fromNode: "list-events", path: "events" } },
          },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(
      expect.arrayContaining(["google_workspace_status", "google_workspace_search_methods", "google_workspace_call"]),
    );
    expect(result.output.manifest.googleWorkspaceMethods).toEqual([
      expect.objectContaining({
        methodId: "calendar.events.list",
        accountProvenance: "google_workspace_status",
        service: "calendar",
        resource: "events",
        method: "list",
        sideEffect: "personal_content_read",
        dataRetention: "run_artifact",
        requiresTimeRange: true,
        scopes: expect.arrayContaining(["https://www.googleapis.com/auth/calendar.readonly"]),
      }),
    ]);
    expect(result.dryRun.calls.map((call) => call.name)).toEqual(expect.arrayContaining(["google_workspace_call"]));
  });

  it("rejects Google Workspace write methods in read-only compiler policy", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Google Write",
          goal: "Try to create a Drive file.",
          nodes: [
            {
              id: "create-drive-file",
              kind: "tool.call",
              tool: "google_workspace_call",
              args: { accountHint: "user@example.com", methodId: "drive.files.create", body: { name: "bad.txt" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "google.write_method_rejected", nodeId: "create-drive-file" })],
    });
  });

  it("rejects Google Workspace calls without account provenance", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Missing Google Account",
          goal: "Try to call Google without an account handle.",
          nodes: [
            {
              id: "list-files",
              kind: "tool.call",
              tool: "google_workspace_call",
              args: { methodId: "drive.files.list", params: { pageSize: 10 } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "google.account_hint_required", nodeId: "list-files" })],
    });
  });

  it("rejects read-only Google Workspace calls with write payload fields", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Google Payload",
          goal: "Try to put a write payload on a read-only Google method.",
          nodes: [
            {
              id: "list-files",
              kind: "tool.call",
              tool: "google_workspace_call",
              args: { accountHint: "user@example.com", methodId: "drive.files.list", body: { pageSize: 10 } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "google.read_only_payload_rejected", nodeId: "list-files" })],
    });
  });

  it("rejects Calendar agenda calls without an explicit timezone-aware range", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Calendar Agenda",
          goal: "Try to read Calendar without bounded time policy.",
          nodes: [
            {
              id: "list-events",
              kind: "tool.call",
              tool: "google_workspace_call",
              args: { accountHint: "user@example.com", methodId: "calendar.events.list", params: { calendarId: "primary" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "google.calendar_time_range_required", nodeId: "list-events" })],
    });
  });

  it("rejects Google Workspace methods that cannot be resolved to catalog metadata", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Unknown Google Method",
          goal: "Try to call a Google method that the compiler cannot grant precisely.",
          nodes: [
            {
              id: "unknown-google-method",
              kind: "tool.call",
              tool: "google_workspace_call",
              args: { accountHint: "user@example.com", methodId: "drive.files.notARealRead", params: { pageSize: 10 } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "google.method_metadata_required", nodeId: "unknown-google-method" })],
    });
  });
});
