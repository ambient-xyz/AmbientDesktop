import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { googleWorkspaceConnectorDescriptors } from "./workflowProgramGoogleWorkspaceFacade";
import { fixtureWorkflowConnector } from "./workflowProgramWorkflowFacade";
import { compileWorkflowProgramIr } from "./workflowProgramCompiler";

function generatedWorkflowRun(source: string): (input: unknown) => Promise<Record<string, unknown>> {
  const factory = new Function(source.replace(/^export default /, "return "));
  return factory() as (input: unknown) => Promise<Record<string, unknown>>;
}

describe("compileWorkflowProgramIr connector contracts", () => {
  it("compiles connector.call nodes with inferred grants, graph mappings, budgets, and dry-run validation", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "Connector Records",
        goal: "Read fixture connector records and summarize them.",
        nodes: [
          {
            id: "read-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            accountId: "fixture",
            input: { limit: 10 },
            output: { schema: { records: "array", nextCursor: "string|null" } },
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["read-records"],
            task: "summarize.connector.records",
            input: { records: { fromNode: "read-records", path: "records" } },
            output: { schema: { summary: "string" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { summary: { fromNode: "summarize", path: "summary" } },
          },
        ],
      },
    });

    expect(result.output.manifest).toMatchObject({
      connectors: [
        {
          connectorId: "fixture.readonly",
          accountId: "fixture",
          scopes: ["fixture.records.read"],
          operations: ["listRecords"],
          dataRetention: "redacted_audit",
        },
      ],
      maxConnectorCalls: 1,
      maxModelCalls: 1,
      mutationPolicy: "read_only",
    });
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "read-records", type: "connector_call", connectorIds: ["fixture.readonly"] })]),
    );
    expect(result.output.source).toContain("connectors.call");
    expect(result.output.source).toContain('"nodeId": "read-records"');
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["connector:fixture.readonly.listRecords", "model:summarize.connector.records"]),
    );
  });

  it("defaults connector calls to the sole available connector account", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "Connector Default Account",
        goal: "Read fixture records without making Pi restate the only available account.",
        nodes: [
          {
            id: "read-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            input: { limit: 1 },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["read-records"],
            value: { records: { fromNode: "read-records", path: "records" } },
          },
        ],
      },
    });

    expect(result.program.nodes[0]).toMatchObject({ kind: "connector.call", accountId: "fixture" });
    expect(result.output.manifest.connectors?.[0]).toMatchObject({ connectorId: "fixture.readonly", accountId: "fixture" });
    expect(result.output.source).toContain('"accountId": "fixture"');
  });

  it("compiles Gmail connector.paginate with bounded page budgets and dry-run page aggregation", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      program: {
        version: 1,
        title: "Gmail Pagination",
        goal: "Read the most recent 300 Gmail message ids through bounded pagination.",
        nodes: [
          {
            id: "gmail-pages",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "", maxResults: 100 },
            maxItems: 300,
            maxPages: 3,
            pageSize: 100,
            dedupeKeyPath: "threadId",
            output: { schema: { items: "array", pages: "array", count: "number", pageCount: "number", truncated: "boolean" } },
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["gmail-pages"],
            task: "summarize.gmail.page.coverage",
            input: { messageCount: { fromNode: "gmail-pages", path: "count" }, pages: { fromNode: "gmail-pages", path: "pageCount" } },
            output: { schema: { summary: "string", messageCount: "number" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { summary: { fromNode: "summarize", path: "summary" } },
          },
        ],
      },
    });

    expect(result.program.nodes[0]).toMatchObject({ kind: "connector.paginate", accountId: "default" });
    expect(result.output.manifest).toMatchObject({
      connectors: [
        expect.objectContaining({ connectorId: "google.gmail", accountId: "default", scopes: ["gmail.readonly"], operations: ["search"] }),
      ],
      maxConnectorCalls: 3,
      maxModelCalls: 1,
      mutationPolicy: "read_only",
    });
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "gmail-pages", operationKind: "runtime.connector_paginate", connectorOperation: "search" }),
      ]),
    );
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "gmail-pages", type: "connector_call", connectorIds: ["google.gmail"] })]),
    );
    expect(result.output.source).toContain("workflow.paginateConnector");
    expect(result.output.source).toContain('"maxItems": 300');
    expect(result.output.source).toContain('"maxPages": 3');
    expect(result.output.source).toContain('"pageSizeInputPath": "maxResults"');
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.search")).toHaveLength(3);
    expect(result.dryRun.componentOutputs).toMatchObject({
      "gmail-pages": { count: 300, pageCount: 3, truncated: true, maxItems: 300, maxPages: 3 },
    });
  });

  it("normalizes loose connector pagination aliases without changing the requested connector", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Gmail" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      program: {
        version: 1,
        title: "Loose Gmail Pagination",
        goal: "Read recent Gmail messages with a loose connector paginate shape.",
        nodes: [
          {
            id: "gmail-pages",
            kind: "pagination",
            connector: "google.gmail",
            operationName: "search",
            args: { query: "", maxResults: 100 },
            limit: 300,
            pageCount: 3,
            dedupeKeyPath: "threadId",
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["gmail-pages"],
            value: { count: { fromNode: "gmail-pages", path: "count" } },
          },
        ],
      },
    });

    expect(result.program.nodes[0]).toMatchObject({
      kind: "connector.paginate",
      connectorId: "google.gmail",
      operation: "search",
      maxItems: 300,
      maxPages: 3,
      itemsPath: "messages",
      pageSizeInputPath: "maxResults",
    });
    expect(result.output.source).toContain('connectorId: "google.gmail"');
    expect(result.output.source).not.toContain('connectorId: "workspace.inventory"');
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.search")).toHaveLength(3);
  });

  it("compiles Drive and Calendar connector.paginate with descriptor-inferred page contracts", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
        "google.calendar": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.drive" || descriptor.id === "google.calendar");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      program: {
        version: 1,
        title: "Google Transcript Discovery Pagination",
        goal: "Find Drive transcript files and Calendar meetings over a bounded two-week window.",
        nodes: [
          {
            id: "drive-transcript-pages",
            kind: "connector.paginate",
            connectorId: "google.drive",
            operation: "search",
            input: {
              query: "mimeType='application/vnd.google-apps.document' and trashed = false",
              pageSize: 40,
              fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
            },
            maxItems: 120,
            maxPages: 3,
            pageSize: 40,
            dedupeKeyPath: "id",
            output: { schema: { items: "array", pages: "array", count: "number", pageCount: "number", truncated: "boolean" } },
          },
          {
            id: "calendar-event-pages",
            kind: "connector.paginate",
            connectorId: "google.calendar",
            operation: "listEvents",
            input: {
              calendarId: "primary",
              timeMin: "2026-05-01T00:00:00-07:00",
              timeMax: "2026-05-15T00:00:00-07:00",
              timeZone: "America/Phoenix",
              maxResults: 30,
              singleEvents: true,
              orderBy: "startTime",
              fields: "nextPageToken,items(id,summary,start,end,attachments,conferenceData)",
            },
            maxItems: 60,
            maxPages: 2,
            pageSize: 30,
            dedupeKeyPath: "id",
            output: { schema: { items: "array", pages: "array", count: "number", pageCount: "number", truncated: "boolean" } },
          },
          {
            id: "meeting-transcript-index",
            kind: "model.reduce",
            dependsOn: ["drive-transcript-pages", "calendar-event-pages"],
            items: { fromNode: "drive-transcript-pages", path: "items" },
            task: "index.google.meeting.transcript.candidates",
            input: {
              driveFiles: { fromNode: "drive-transcript-pages", path: "items" },
              calendarEvents: { fromNode: "calendar-event-pages", path: "items" },
              instruction: "Identify likely meeting transcript files and their matching calendar events.",
            },
            output: { schema: { candidates: "array", summary: "string" } },
            maxInputItems: 120,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["meeting-transcript-index"],
            value: { index: { fromNode: "meeting-transcript-index" } },
          },
        ],
      },
    });

    expect(result.program.nodes[0]).toMatchObject({
      kind: "connector.paginate",
      itemsPath: "files",
      nextPageTokenPath: "nextPageToken",
      pageTokenInputPath: "pageToken",
      pageSizeInputPath: "pageSize",
      accountId: "default",
    });
    expect(result.program.nodes[1]).toMatchObject({
      kind: "connector.paginate",
      itemsPath: "items",
      nextPageTokenPath: "nextPageToken",
      pageTokenInputPath: "pageToken",
      pageSizeInputPath: "maxResults",
      accountId: "default",
    });
    expect(result.output.manifest.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ connectorId: "google.drive", accountId: "default", scopes: ["drive.readonly"], operations: ["search"] }),
        expect.objectContaining({
          connectorId: "google.calendar",
          accountId: "default",
          scopes: ["calendar.readonly"],
          operations: ["listEvents"],
        }),
      ]),
    );
    expect(result.output.manifest.maxConnectorCalls).toBe(5);
    expect(result.output.manifest.maxModelCalls).toBe(1);
    expect(result.output.source).toContain('"itemsPath": "files"');
    expect(result.output.source).toContain('"pageSizeInputPath": "pageSize"');
    expect(result.output.source).toContain('"pageSizeInputPath": "maxResults"');
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.drive.search")).toHaveLength(3);
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.calendar.listEvents")).toHaveLength(2);
    expect(result.dryRun.componentOutputs).toMatchObject({
      "drive-transcript-pages": { count: 120, pageCount: 3, truncated: true },
      "calendar-event-pages": { count: 60, pageCount: 2, truncated: true },
      "meeting-transcript-index": { candidates: [], summary: "mock summary for index.google.meeting.transcript.candidates" },
    });
  });

  it("compiles Google meeting transcript action-item extraction through Drive reads and long_context_process", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
        "google.calendar": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.drive" || descriptor.id === "google.calendar");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      program: {
        version: 1,
        title: "Google Meeting Transcript Action Items",
        goal: "Read two weeks of Google meeting transcript files and extract action items, owners, due dates, decisions, and unresolved questions.",
        summary:
          "Calendar and Drive are paginated, likely transcript files are read with bounded fan-out, long transcript evidence is routed through RLM, and Ambient shapes the final action-item report.",
        successCriteria: [
          "Calendar events collected",
          "Transcript-like Drive files read",
          "Long transcript evidence preprocessed",
          "Action-item report produced",
        ],
        nodes: [
          {
            id: "calendar-event-pages",
            kind: "connector.paginate",
            connectorId: "google.calendar",
            operation: "listEvents",
            input: {
              calendarId: "primary",
              timeMin: "2026-05-02T00:00:00-07:00",
              timeMax: "2026-05-16T23:59:59-07:00",
              timeZone: "America/Phoenix",
              maxResults: 50,
              singleEvents: true,
              orderBy: "startTime",
              fields: "nextPageToken,items(id,summary,start,end,attendees,attachments,conferenceData,description)",
            },
            maxItems: 100,
            maxPages: 2,
            pageSize: 50,
            dedupeKeyPath: "id",
          },
          {
            id: "drive-transcript-pages",
            kind: "connector.paginate",
            connectorId: "google.drive",
            operation: "search",
            input: {
              query:
                "mimeType = 'application/vnd.google-apps.document' and trashed = false and (name contains 'transcript' or name contains 'meeting notes' or name contains 'recording transcript')",
              pageSize: 50,
              fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,description)",
              includeItemsFromAllDrives: true,
              supportsAllDrives: true,
            },
            maxItems: 100,
            maxPages: 2,
            pageSize: 50,
            dedupeKeyPath: "id",
          },
          {
            id: "candidate-transcript-files",
            kind: "collection.map",
            dependsOn: ["drive-transcript-pages"],
            items: { fromNode: "drive-transcript-pages", path: "items" },
            itemName: "file",
            map: {
              id: { fromItem: "file", path: "id" },
              name: { fromItem: "file", path: "name" },
              mimeType: { fromItem: "file", path: "mimeType" },
              modifiedTime: { fromItem: "file", path: "modifiedTime" },
              webViewLink: { fromItem: "file", path: "webViewLink" },
            },
            maxItems: 6,
          },
          {
            id: "read-transcript-files",
            kind: "connector.map",
            dependsOn: ["candidate-transcript-files"],
            connectorId: "google.drive",
            operation: "readFile",
            accountId: "default",
            items: { fromNode: "candidate-transcript-files", path: "items" },
            itemName: "file",
            input: {
              fileId: { fromItem: "file", path: "id" },
              exportMimeType: "text/plain",
              maxContentChars: 4000,
            },
            maxItems: 6,
            maxConcurrency: 3,
          },
          {
            id: "extract-action-evidence",
            kind: "tool.call",
            tool: "long_context_process",
            dependsOn: ["read-transcript-files", "calendar-event-pages"],
            args: {
              taskType: "extraction",
              instruction:
                "Extract action items, owners, due dates, decisions, unresolved questions, skipped/missing transcripts, and evidence snippets from Google meeting transcript files. Preserve file and event provenance.",
              text: {
                transcriptFiles: { fromNode: "read-transcript-files", path: "items" },
                calendarEvents: { fromNode: "calendar-event-pages", path: "items" },
              },
              contextWindowChars: 24_000,
              maxModelCalls: 8,
              maxOutputChars: 8_000,
            },
            output: {
              schema: { response: "string", inputLength: "number", chunkCount: "number", modelCalls: "number", truncated: "boolean" },
            },
          },
          {
            id: "shape-action-report",
            kind: "model.call",
            dependsOn: ["extract-action-evidence"],
            task: "shape.google.meeting.transcript.action.report",
            input: {
              extraction: { fromNode: "extract-action-evidence", path: "response" },
              transcriptFileCount: { fromNode: "read-transcript-files", path: "count" },
              calendarEventCount: { fromNode: "calendar-event-pages", path: "count" },
              driveCandidateCount: { fromNode: "drive-transcript-pages", path: "count" },
            },
            output: {
              schema: {
                summary: "string",
                actionItems: "array",
                decisions: "array",
                unresolvedQuestions: "array",
                skippedMeetings: "array",
                coverage: "object",
              },
            },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["shape-action-report"],
            value: {
              report: { fromNode: "shape-action-report" },
              extractionCoverage: { fromNode: "extract-action-evidence" },
            },
          },
        ],
        budgets: { maxConnectorCalls: 10, maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 1800000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["long_context_process", "ambient.responses"]));
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(result.output.manifest.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectorId: "google.drive",
          accountId: "default",
          scopes: ["drive.readonly"],
          operations: expect.arrayContaining(["search", "readFile"]),
          dataRetention: "redacted_audit",
        }),
        expect.objectContaining({
          connectorId: "google.calendar",
          accountId: "default",
          scopes: ["calendar.readonly"],
          operations: ["listEvents"],
          dataRetention: "redacted_audit",
        }),
      ]),
    );
    expect(result.output.manifest.maxConnectorCalls).toBe(10);
    expect(result.output.manifest.maxToolCalls).toBe(1);
    expect(result.output.manifest.maxModelCalls).toBe(1);
    expect(result.output.source).toContain("workflow.paginateConnector");
    expect(result.output.source).toContain("workflow.batch");
    expect(result.output.source).toContain("tools.long_context_process");
    expect(result.output.source).toContain("ambient.call");
    expect(result.output.source.indexOf("tools.long_context_process")).toBeLessThan(result.output.source.indexOf("ambient.call"));
    expect(result.output.source).toMatch(/connectorId:\s*["']google\.drive["']/);
    expect(result.output.source).toMatch(/connectorId:\s*["']google\.calendar["']/);
    expect(result.output.source).toMatch(/["']?operation["']?\s*:\s*["']readFile["']/);
    expect(result.output.source).toContain('"exportMimeType": "text/plain"');
    expect(result.output.source).toContain('"maxContentChars": 4000');
    expect(result.output.source).toMatch(/["']?operation["']?\s*:\s*["']listEvents["']/);
    expect(result.output.source).toContain('"timeMin": "2026-05-02T00:00:00-07:00"');
    expect(result.output.source).toContain('"timeZone": "America/Phoenix"');
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.drive.search")).toHaveLength(2);
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.calendar.listEvents")).toHaveLength(2);
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.drive.readFile")).toHaveLength(6);
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:long_context_process", "model:shape.google.meeting.transcript.action.report"]),
    );
    expect(result.dryRun.componentOutputs).toMatchObject({
      "calendar-event-pages": { count: 100, pageCount: 2, truncated: true },
      "drive-transcript-pages": { count: 100, pageCount: 2, truncated: true },
      "candidate-transcript-files": { count: 6, sourceCount: 100, truncated: true },
      "read-transcript-files": { count: 6, sourceCount: 6, truncated: false },
      "extract-action-evidence": { taskType: "extraction", truncated: false },
      "shape-action-report": { actionItems: [], decisions: [], unresolvedQuestions: [], skippedMeetings: [], coverage: {} },
    });
  });

  it("compiles large Gmail categorization as paginated connector fan-out, chunks, model-map, and reduce", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      program: {
        version: 1,
        title: "Chunked Gmail Categorization",
        goal: "Read and categorize 300 Gmail threads without sending the whole mailbox to one model call.",
        nodes: [
          {
            id: "gmail-pages",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "newer_than:30d", maxResults: 100 },
            maxItems: 300,
            maxPages: 3,
            pageSize: 100,
            dedupeKeyPath: "threadId",
          },
          {
            id: "read-threads",
            kind: "connector.map",
            dependsOn: ["gmail-pages"],
            connectorId: "google.gmail",
            operation: "readThread",
            items: { fromNode: "gmail-pages", path: "items" },
            itemName: "message",
            input: { threadId: { fromItem: "message", path: "threadId" }, format: "metadata" },
            maxItems: 300,
            maxConcurrency: 4,
          },
          {
            id: "thread-records",
            kind: "collection.map",
            dependsOn: ["read-threads"],
            items: { fromNode: "read-threads", path: "items" },
            itemName: "thread",
            map: {
              threadId: { fromItem: "thread", path: "result.threadId" },
              snippet: { fromItem: "thread", path: "result.snippet" },
              messages: { fromItem: "thread", path: "result.messages" },
            },
            maxItems: 300,
          },
          {
            id: "thread-chunks",
            kind: "collection.chunk",
            dependsOn: ["thread-records"],
            items: { fromNode: "thread-records", path: "items" },
            chunkSize: 25,
            maxChunks: 12,
          },
          {
            id: "categorize-chunks",
            kind: "model.map",
            dependsOn: ["thread-chunks"],
            items: { fromNode: "thread-chunks", path: "chunks" },
            itemName: "chunk",
            task: "categorize.gmail.chunk",
            input: {
              chunkId: { fromItem: "chunk", path: "id" },
              count: { fromItem: "chunk", path: "count" },
              threads: { fromItem: "chunk", path: "items" },
              instruction: "Return category candidates and evidence for this chunk only.",
            },
            output: { schema: { categories: "array", notes: "string" } },
            maxItems: 12,
            maxConcurrency: 4,
          },
          {
            id: "reduce-categories",
            kind: "model.reduce",
            dependsOn: ["categorize-chunks"],
            items: { fromNode: "categorize-chunks", path: "results" },
            task: "synthesize.gmail.categories",
            input: { maxCategories: 7, instruction: "Merge chunk category candidates into up to seven categories." },
            output: { schema: { categories: "array", summary: "string" } },
            maxInputItems: 12,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["reduce-categories"],
            value: {
              categories: { fromNode: "reduce-categories", path: "categories" },
              summary: { fromNode: "reduce-categories", path: "summary" },
            },
          },
        ],
      },
    });

    expect(result.output.manifest).toMatchObject({
      connectors: [
        expect.objectContaining({
          connectorId: "google.gmail",
          accountId: "default",
          scopes: ["gmail.readonly"],
          operations: ["search", "readThread"],
        }),
      ],
      maxConnectorCalls: 303,
      maxModelCalls: 13,
      mutationPolicy: "read_only",
    });
    expect(result.validationReport).toMatchObject({
      schemaVersion: 1,
      compilerMode: "program_ir",
      status: "passed",
      diagnosticSummary: { diagnosticCount: 0, errorCount: 0, warningCount: 0 },
      evidence: {
        mutationPolicy: "read_only",
        maxConnectorCalls: 303,
        connectorWriteOperations: [],
        connectorOperations: expect.arrayContaining([
          expect.objectContaining({
            connectorId: "google.gmail",
            operation: "search",
            sideEffects: "read_personal_data",
            nodeId: "gmail-pages",
          }),
          expect.objectContaining({
            connectorId: "google.gmail",
            operation: "readThread",
            sideEffects: "read_personal_data",
            nodeId: "read-threads",
          }),
        ]),
      },
    });
    expect(result.validationReport.validators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "workflow.program.static", status: "passed" }),
        expect.objectContaining({ id: "workflow.program.static_budget", status: "passed" }),
        expect.objectContaining({ id: "workflow.connector.operation_policy", status: "passed" }),
        expect.objectContaining({ id: "workflow.output.schema", status: "passed" }),
        expect.objectContaining({ id: "workflow.program.dry_run", status: "passed" }),
      ]),
    );
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "gmail-pages", operationKind: "runtime.connector_paginate" }),
        expect.objectContaining({ nodeId: "thread-records", operationKind: "runtime.collection_map" }),
        expect.objectContaining({ nodeId: "thread-chunks", operationKind: "runtime.collection_chunk" }),
        expect.objectContaining({ nodeId: "categorize-chunks", operationKind: "runtime.model_map", modelTask: "categorize.gmail.chunk" }),
        expect.objectContaining({
          nodeId: "reduce-categories",
          operationKind: "runtime.model_reduce",
          modelTask: "synthesize.gmail.categories",
        }),
      ]),
    );
    expect(result.output.source).toContain("workflow.paginateConnector");
    expect(result.output.source).toContain("workflow.mapCollection");
    expect(result.output.source).toContain("workflow.chunkCollection");
    expect(result.output.source).toContain("workflow.mapModel");
    expect(result.output.source).toContain("workflow.reduceModel");
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "thread-chunks", type: "deterministic_step" }),
        expect.objectContaining({ id: "categorize-chunks", type: "model_call", toolNames: ["ambient.responses"] }),
        expect.objectContaining({ id: "reduce-categories", type: "model_call", toolNames: ["ambient.responses"] }),
      ]),
    );
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.search")).toHaveLength(3);
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.readThread")).toHaveLength(300);
    expect(result.dryRun.calls.filter((call) => call.kind === "model")).toHaveLength(13);
    expect(result.dryRun.componentOutputs).toMatchObject({
      "gmail-pages": { count: 300, pageCount: 3, truncated: true },
      "read-threads": { count: 300, sourceCount: 300, truncated: false },
      "thread-records": { count: 300, sourceCount: 300, truncated: false },
      "thread-chunks": { count: 12, itemCount: 300, sourceCount: 300, truncated: false },
      "categorize-chunks": { count: 12, sourceCount: 12, truncated: false },
      "reduce-categories": { categories: [], summary: "mock summary for synthesize.gmail.categories" },
    });
  });

  it("rejects Google connector write operations in the read-only compiler path with validator repair metadata", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        program: {
          version: 1,
          title: "Unsafe Gmail Draft",
          goal: "Try to create a Gmail draft in a read-only compile path.",
          nodes: [
            {
              id: "draft",
              kind: "connector.call",
              connectorId: "google.gmail",
              operation: "createDraft",
              accountId: "default",
              input: { to: "test@example.com", subject: "Draft", textBody: "Hello" },
            },
            { id: "final", kind: "output.final", dependsOn: ["draft"], value: { ok: true } },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "connector.read_only_write_operation_rejected",
          nodeId: "draft",
          validatorId: "workflow.connector.operation_policy",
          repairHint: expect.stringContaining("read-only workflow"),
        }),
      ],
    });
  });

  it("rejects a single-run Gmail 1000 thread-detail fan-out above the static connector-call ceiling", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        program: {
          version: 1,
          title: "Oversized Gmail Detail Categorization",
          goal: "Reject a single workflow that tries to read full thread detail for 1,000 Gmail messages.",
          nodes: [
            {
              id: "gmail-pages",
              kind: "connector.paginate",
              connectorId: "google.gmail",
              operation: "search",
              input: { query: "", maxResults: 100 },
              maxItems: 1000,
              maxPages: 10,
              pageSize: 100,
              dedupeKeyPath: "threadId",
            },
            {
              id: "read-threads",
              kind: "connector.map",
              dependsOn: ["gmail-pages"],
              connectorId: "google.gmail",
              operation: "readThread",
              items: { fromNode: "gmail-pages", path: "items" },
              itemName: "message",
              input: { threadId: { fromItem: "message", path: "threadId" }, format: "metadata" },
              maxItems: 1000,
              maxConcurrency: 4,
            },
            {
              id: "final-output",
              kind: "output.final",
              dependsOn: ["read-threads"],
              value: { threads: { fromNode: "read-threads", path: "items" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "budget.max_connector_calls_ceiling_exceeded",
          nodeId: "read-threads",
          path: "/budgets/maxConnectorCalls",
          message: expect.stringContaining("1010 static connector calls"),
        }),
      ],
      failureReport: expect.objectContaining({ phase: "static_validation" }),
    });
  });

  it("compiles Gmail 1000 metadata categorization as a tierable bounded plan under the connector ceiling", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      program: {
        version: 1,
        title: "Gmail 1000 Metadata Categorization",
        goal: "Categorize 1,000 Gmail messages using paginated metadata first, without reading every full thread in the same workflow.",
        nodes: [
          {
            id: "gmail-pages",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "", maxResults: 100 },
            maxItems: 1000,
            maxPages: 10,
            pageSize: 100,
            dedupeKeyPath: "threadId",
          },
          {
            id: "message-records",
            kind: "collection.map",
            dependsOn: ["gmail-pages"],
            items: { fromNode: "gmail-pages", path: "items" },
            itemName: "message",
            map: {
              id: { fromItem: "message", path: "id" },
              threadId: { fromItem: "message", path: "threadId" },
              snippet: { fromItem: "message", path: "snippet" },
              internalDate: { fromItem: "message", path: "internalDate" },
              labelIds: { fromItem: "message", path: "labelIds" },
            },
            maxItems: 1000,
          },
          {
            id: "message-chunks",
            kind: "collection.chunk",
            dependsOn: ["message-records"],
            items: { fromNode: "message-records", path: "items" },
            chunkSize: 25,
            maxChunks: 40,
          },
          {
            id: "categorize-chunks",
            kind: "model.map",
            dependsOn: ["message-chunks"],
            items: { fromNode: "message-chunks", path: "chunks" },
            itemName: "chunk",
            task: "categorize.gmail.metadata.chunk",
            input: {
              chunkId: { fromItem: "chunk", path: "id" },
              messages: { fromItem: "chunk", path: "items" },
              instruction: "Categorize this metadata-only Gmail chunk and flag threads that need follow-up detail reads.",
            },
            output: { schema: { categories: "array", detailCandidates: "array", coverage: "object" } },
            maxItems: 40,
            maxConcurrency: 4,
          },
          {
            id: "reduce-categories",
            kind: "model.reduce",
            dependsOn: ["categorize-chunks"],
            items: { fromNode: "categorize-chunks", path: "results" },
            task: "synthesize.gmail.metadata.categories",
            input: {
              maxCategories: 7,
              instruction:
                "Merge chunk-level categories and identify a bounded follow-up detail-read batch only where metadata is insufficient.",
            },
            output: { schema: { categories: "array", detailReadFollowup: "array", summary: "string" } },
            strategy: "tree",
            maxInputItems: 40,
            maxFanIn: 8,
            maxLevels: 2,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["reduce-categories"],
            value: {
              categories: { fromNode: "reduce-categories", path: "categories" },
              followup: { fromNode: "reduce-categories", path: "detailReadFollowup" },
            },
          },
        ],
      },
    });

    expect(result.output.manifest).toMatchObject({
      connectors: [expect.objectContaining({ connectorId: "google.gmail", scopes: ["gmail.readonly"], operations: ["search"] })],
      maxConnectorCalls: 10,
      maxModelCalls: 46,
      mutationPolicy: "read_only",
    });
    expect(result.output.manifest.connectors?.[0]?.operations).not.toEqual(expect.arrayContaining(["readThread"]));
    expect(result.output.source).toContain("workflow.paginateConnector");
    expect(result.output.source).toContain("workflow.chunkCollection");
    expect(result.output.source).toContain("workflow.mapModel");
    expect(result.output.source).toContain("workflow.reduceModel");
    expect(result.output.source).not.toContain('"operation": "readThread"');
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.search")).toHaveLength(10);
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.readThread")).toHaveLength(0);
    expect(result.dryRun.calls.filter((call) => call.kind === "model")).toHaveLength(46);
    expect(result.dryRun.componentOutputs).toMatchObject({
      "gmail-pages": { count: 1000, pageCount: 10, truncated: true, maxItems: 1000, maxPages: 10 },
      "message-records": { count: 1000, sourceCount: 1000, truncated: false },
      "message-chunks": { count: 40, itemCount: 1000, sourceCount: 1000, truncated: false },
      "categorize-chunks": { count: 40, sourceCount: 40, truncated: false },
      "reduce-categories": { categories: [], summary: "mock summary for synthesize.gmail.metadata.categories" },
    });
  });

  it("compiles Gmail 1000 metadata categorization with a review gate before any body reads", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      program: {
        version: 1,
        title: "Gmail 1000 Metadata Detail Gate",
        goal: "Categorize 1,000 Gmail messages using metadata first and ask before any full-body detail reads.",
        nodes: [
          {
            id: "gmail-pages",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "", maxResults: 100 },
            maxItems: 1000,
            maxPages: 10,
            pageSize: 100,
            dedupeKeyPath: "threadId",
          },
          {
            id: "metadata-records",
            kind: "collection.map",
            dependsOn: ["gmail-pages"],
            items: { fromNode: "gmail-pages", path: "items" },
            itemName: "message",
            map: {
              id: { fromItem: "message", path: "id" },
              threadId: { fromItem: "message", path: "threadId" },
              snippet: { fromItem: "message", path: "snippet" },
              internalDate: { fromItem: "message", path: "internalDate" },
              labelIds: { fromItem: "message", path: "labelIds" },
            },
            maxItems: 1000,
          },
          {
            id: "metadata-chunks",
            kind: "collection.chunk",
            dependsOn: ["metadata-records"],
            items: { fromNode: "metadata-records", path: "items" },
            chunkSize: 25,
            maxChunks: 40,
          },
          {
            id: "categorize-metadata-chunks",
            kind: "model.map",
            dependsOn: ["metadata-chunks"],
            items: { fromNode: "metadata-chunks", path: "chunks" },
            itemName: "chunk",
            task: "categorize.gmail.metadata.chunk",
            input: {
              messages: { fromItem: "chunk", path: "items" },
              instruction: "Categorize metadata-only Gmail records and flag low-confidence threads for a future detail-read approval.",
            },
            output: { schema: { categories: "array", detailReadCandidates: "array", coverage: "object" } },
            maxItems: 40,
            maxConcurrency: 4,
          },
          {
            id: "reduce-metadata-categories",
            kind: "model.reduce",
            dependsOn: ["categorize-metadata-chunks"],
            items: { fromNode: "categorize-metadata-chunks", path: "results" },
            task: "synthesize.gmail.metadata.categories",
            input: {
              maxCategories: 7,
              instruction:
                "Merge metadata-only categories and return a bounded future detail-read candidate list without reading bodies in this workflow.",
            },
            output: { schema: { categories: "array", detailReadCandidates: "array", summary: "string", coverage: "object" } },
            strategy: "tree",
            maxInputItems: 40,
            maxFanIn: 8,
            maxLevels: 2,
          },
          {
            id: "detail-read-review",
            kind: "review.input",
            dependsOn: ["reduce-metadata-categories"],
            prompt: "Review the metadata-only result and decide whether to plan a separate bounded full-body detail-read follow-up.",
            choices: [
              { id: "metadata_only", label: "Keep metadata-only" },
              { id: "plan_followup", label: "Plan bounded follow-up" },
            ],
            allowFreeform: true,
            data: {
              categories: { fromNode: "reduce-metadata-categories", path: "categories" },
              detailReadCandidates: { fromNode: "reduce-metadata-categories", path: "detailReadCandidates" },
              coverage: { fromNode: "reduce-metadata-categories", path: "coverage" },
            },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["reduce-metadata-categories", "detail-read-review"],
            value: {
              metadataOnlyReport: { fromNode: "reduce-metadata-categories" },
              reviewDecision: { fromNode: "detail-read-review" },
              sourceCoverage: { fromNode: "gmail-pages" },
            },
          },
        ],
      },
    });

    expect(result.output.manifest).toMatchObject({
      connectors: [expect.objectContaining({ connectorId: "google.gmail", scopes: ["gmail.readonly"], operations: ["search"] })],
      maxConnectorCalls: 10,
      mutationPolicy: "read_only",
    });
    expect(result.output.manifest.connectors?.[0]?.operations).not.toEqual(expect.arrayContaining(["readThread", "readAttachment"]));
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "detail-read-review", type: "review_gate" })]),
    );
    expect(result.output.source).toContain("workflow.paginateConnector");
    expect(result.output.source).toContain("workflow.chunkCollection");
    expect(result.output.source).toContain("workflow.mapModel");
    expect(result.output.source).toContain("workflow.reduceModel");
    expect(result.output.source).toContain("workflow.askUser");
    expect(result.output.source).toContain('"strategy": "tree"');
    expect(result.output.source).not.toContain('"operation": "readThread"');
    expect(result.output.source).not.toContain('"operation": "readAttachment"');
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.search")).toHaveLength(10);
    expect(result.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.readThread")).toHaveLength(0);
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(expect.arrayContaining(["review:detail-read-review"]));
  });

  it("compiles tree model.reduce as deterministic bounded fan-in", async () => {
    const sourceSummaries = Array.from({ length: 64 }, (_, index) => ({
      id: `source-${index + 1}`,
      title: `Source ${index + 1}`,
      summary: `Evidence summary ${index + 1}`,
    }));
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Tree Research Synthesis",
        goal: "Synthesize many source summaries without one oversized final model call.",
        nodes: [
          {
            id: "synthesize-sources",
            kind: "model.reduce",
            items: sourceSummaries,
            task: "synthesize.research.sources",
            input: { instruction: "Merge source summaries into consolidated findings while preserving coverage metadata." },
            output: { schema: { summary: "string", themes: "array", sourceCount: "number" } },
            strategy: "tree",
            maxInputItems: 64,
            maxFanIn: 8,
            maxLevels: 3,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["synthesize-sources"],
            value: { synthesis: { fromNode: "synthesize-sources" } },
          },
        ],
        budgets: { maxModelCalls: 9 },
      },
    });

    expect(result.output.manifest.maxModelCalls).toBe(9);
    expect(result.output.source).toContain('"strategy": "tree"');
    expect(result.output.source).toContain('"maxFanIn": 8');
    expect(result.output.source).toContain('"maxLevels": 3');
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "synthesize-sources",
          type: "model_call",
          retryPolicy: "tree reduce max 64 inputs, fan-in 8, levels 3",
        }),
      ]),
    );
    expect(result.dryRun.calls.filter((call) => call.kind === "model" && call.name === "synthesize.research.sources")).toHaveLength(9);
    expect(result.dryRun.componentOutputs).toMatchObject({
      "synthesize-sources": { summary: "mock summary for synthesize.research.sources", themes: [], sourceCount: 0 },
    });
  });

  it("rejects tree model.reduce when bounded levels cannot converge", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Invalid Tree Reduce",
          goal: "Reject impossible reduce tree settings.",
          nodes: [
            {
              id: "reduce",
              kind: "model.reduce",
              items: Array.from({ length: 32 }, (_, index) => ({ id: `item-${index + 1}` })),
              task: "reduce.too.shallow",
              output: { schema: { summary: "string" } },
              strategy: "tree",
              maxInputItems: 32,
              maxFanIn: 2,
              maxLevels: 1,
            },
            { id: "final-output", kind: "output.final", dependsOn: ["reduce"], value: { result: { fromNode: "reduce" } } },
          ],
          budgets: { maxModelCalls: 17 },
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "model.reduce_tree_depth_too_low", nodeId: "reduce" })]),
    });
  });

  it("compiles bounded connector.map fan-out through workflow.batch with item-scoped inputs", async () => {
    const connector = fixtureWorkflowConnector([
      { id: "row-1", name: "Alpha" },
      { id: "row-2", name: "Beta" },
    ]).descriptor;
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "Connector Fan-out",
        goal: "List records, read bounded details in parallel, and summarize the result.",
        nodes: [
          {
            id: "list-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            accountId: "fixture",
            input: { limit: 2 },
            output: { schema: { records: "array" } },
          },
          {
            id: "read-record-details",
            kind: "connector.map",
            dependsOn: ["list-records"],
            connectorId: "fixture.readonly",
            operation: "getRecord",
            accountId: "fixture",
            items: [
              { id: "row-1", name: "Alpha" },
              { id: "row-2", name: "Beta" },
            ],
            itemName: "record",
            input: { id: { fromItem: "record", path: "id" } },
            maxItems: 2,
            maxConcurrency: 4,
            output: { schema: { items: "array", count: "number", sourceCount: "number", truncated: "boolean" } },
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["read-record-details"],
            task: "summarize.connector.details",
            input: {
              details: { fromNode: "read-record-details", path: "items" },
              fileCount: { fromNode: "read-record-details", path: "sourceCount" },
            },
            output: { schema: { summary: "string" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { summary: { fromNode: "summarize", path: "summary" } },
          },
        ],
        budgets: { maxConnectorCalls: 3, maxModelCalls: 1 },
      },
    });

    expect(result.output.manifest).toMatchObject({
      connectors: [
        expect.objectContaining({
          connectorId: "fixture.readonly",
          accountId: "fixture",
          scopes: ["fixture.records.read"],
          operations: expect.arrayContaining(["listRecords", "getRecord"]),
        }),
      ],
      maxConnectorCalls: 3,
      maxModelCalls: 1,
    });
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: "read-record-details",
          operationKind: "runtime.connector_map",
          connectorOperation: "getRecord",
          resumeKey: "read-record-details",
        }),
      ]),
    );
    expect(result.output.source).toContain("workflow.batch");
    expect(result.output.source).toContain("maxConcurrency: 4");
    expect(result.output.source).toContain('readPath(read_record_details_record, "id")');
    expect(result.output.source).not.toContain("return { item: read_record_details_record, error:");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining([
        "connector:fixture.readonly.listRecords",
        "step:Read Record Details",
        "connector:fixture.readonly.getRecord",
        "model:summarize.connector.details",
      ]),
    );
    expect(result.dryRun.componentOutputs).toMatchObject({
      "read-record-details": { count: 2, sourceCount: 2, truncated: false },
    });
  });

  it("rejects direct large connector-map evidence in model.call when long_context_process is available", async () => {
    const connector = fixtureWorkflowConnector(
      Array.from({ length: 80 }, (_, index) => ({ id: `row-${index + 1}`, body: "x".repeat(4_000) })),
    ).descriptor;
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
        program: {
          version: 1,
          title: "Unsafe Large Direct Model Input",
          goal: "Reject large connector evidence routed directly into one model call.",
          nodes: [
            {
              id: "list-records",
              kind: "connector.call",
              connectorId: "fixture.readonly",
              operation: "listRecords",
              accountId: "fixture",
              input: { limit: 80 },
              output: { schema: { records: "array" } },
            },
            {
              id: "read-record-details",
              kind: "connector.map",
              dependsOn: ["list-records"],
              connectorId: "fixture.readonly",
              operation: "getRecord",
              accountId: "fixture",
              items: { fromNode: "list-records", path: "records" },
              itemName: "record",
              input: { id: { fromItem: "record", path: "id" } },
              maxItems: 80,
              maxConcurrency: 4,
            },
            {
              id: "summarize",
              kind: "model.call",
              dependsOn: ["read-record-details"],
              task: "summarize.large.connector.evidence",
              input: { details: { fromNode: "read-record-details", path: "items" } },
              output: { schema: { summary: "string" } },
            },
            {
              id: "final-output",
              kind: "output.final",
              dependsOn: ["summarize"],
              value: { summary: { fromNode: "summarize", path: "summary" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "model.long_context_preprocessor_required",
          nodeId: "summarize",
          path: "/nodes/2/input/details",
          message: expect.stringContaining("long_context_process"),
        }),
      ],
      failureReport: expect.objectContaining({ phase: "static_validation" }),
    });
  });

  it("compacts large connector-map evidence at the model-call boundary while preserving full runtime outputs when long_context_process is unavailable", async () => {
    const records: Array<Record<string, unknown>> = Array.from({ length: 80 }, (_, index) => ({
      id: `row-${index + 1}`,
      title: `Message ${index + 1}`,
      content: `body-${index + 1} ${"x".repeat(2_000)}`,
      raw: { payload: "y".repeat(4_000) },
    }));
    const connector = fixtureWorkflowConnector(records).descriptor;
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => tool.name !== "long_context_process"),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "Large Connector Evidence",
        goal: "Read many connector records while bounding the Ambient model input.",
        nodes: [
          {
            id: "list-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            accountId: "fixture",
            input: { limit: 80 },
            output: { schema: { records: "array" } },
          },
          {
            id: "read-record-details",
            kind: "connector.map",
            dependsOn: ["list-records"],
            connectorId: "fixture.readonly",
            operation: "getRecord",
            accountId: "fixture",
            items: { fromNode: "list-records", path: "records" },
            itemName: "record",
            input: { id: { fromItem: "record", path: "id" } },
            maxItems: 80,
            maxConcurrency: 4,
            output: { schema: { items: "array", count: "number", sourceCount: "number", truncated: "boolean" } },
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["read-record-details"],
            task: "summarize.large.connector.evidence",
            input: {
              details: { fromNode: "read-record-details", path: "items" },
              sourceCount: { fromNode: "read-record-details", path: "sourceCount" },
              truncated: { fromNode: "read-record-details", path: "truncated" },
            },
            output: { schema: { summary: "string" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { summary: { fromNode: "summarize", path: "summary" } },
          },
        ],
        budgets: { maxConnectorCalls: 81, maxModelCalls: 1 },
      },
    });
    expect(result.output.source).toContain("compactAmbientInputObject");

    const run = generatedWorkflowRun(result.output.source);
    let capturedInput: Record<string, unknown> | undefined;
    const outputs = await run({
      workflow: {
        resumePoint: async (_name: string, fn: () => unknown) => await fn(),
        step: async (_name: string, optionsOrFn: unknown, maybeFn?: () => unknown) => {
          const fn = typeof optionsOrFn === "function" ? (optionsOrFn as () => unknown) : maybeFn;
          return await fn?.();
        },
        batch: async (items: unknown[], _options: unknown, mapper: (item: unknown, index: number) => unknown) =>
          await Promise.all(items.map((item, index) => mapper(item, index))),
        checkpoint: async (_name: string, value: unknown) => value,
        emit: async (event: unknown) => event,
      },
      tools: {},
      connectors: {
        call: async (call: { operation: string; input?: { id?: string } }) => {
          if (call.operation === "listRecords") return { records };
          if (call.operation === "getRecord") return { record: records.find((record) => record.id === call.input?.id) ?? null };
          throw new Error(`Unexpected connector operation ${call.operation}`);
        },
      },
      ambient: {
        call: async (spec: { input: Record<string, unknown>; schema: { parse: (value: unknown) => unknown } }) => {
          capturedInput = spec.input;
          return spec.schema.parse({ summary: "bounded" });
        },
      },
    });

    const details = capturedInput?.details as Array<{ result?: { record?: { content?: string; raw?: unknown } } }>;
    const fullDetails = outputs["read-record-details"] as { items: Array<{ result: { record: { content: string; raw?: unknown } } }> };
    expect(JSON.stringify(capturedInput).length).toBeLessThan(60_000);
    expect(capturedInput?._ambientInputCompacted).toMatchObject({ maxJsonChars: 60_000 });
    expect(details).toHaveLength(80);
    expect(details[0]?.result?.record?.content?.length ?? 0).toBeLessThan(700);
    expect(details[0]?.result?.record?.raw).toBeUndefined();
    expect(fullDetails.items[0]?.result.record.content.length).toBeGreaterThan(2_000);
    expect(fullDetails.items[0]?.result.record.raw).toBeDefined();
  });

  it("compiles long_context_process as explicit RLM preprocessing before final model shaping", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", title: "Long evidence", body: "x".repeat(20_000) }]).descriptor;
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "RLM Preprocessed Report",
        goal: "Use long-context preprocessing before final schema-bound model synthesis.",
        nodes: [
          {
            id: "list-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            accountId: "fixture",
            input: { limit: 1 },
            output: { schema: { records: "array" } },
          },
          {
            id: "long-context-summary",
            kind: "tool.call",
            tool: "long_context_process",
            dependsOn: ["list-records"],
            args: {
              taskType: "summarization",
              instruction: "Summarize the long connector evidence with source counts and unresolved questions.",
              text: { fromNode: "list-records" },
              maxModelCalls: 8,
              maxOutputChars: 12_000,
            },
            output: { schema: { response: "string", inputLength: "number", modelCalls: "number" } },
          },
          {
            id: "final-report",
            kind: "model.call",
            dependsOn: ["long-context-summary"],
            task: "shape.long.context.report",
            input: {
              rlmSummary: { fromNode: "long-context-summary", path: "response" },
              sourceCount: { fromNode: "list-records", path: "records.length" },
            },
            output: { schema: { summary: "string", risks: "array" } },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["final-report"], value: { report: { fromNode: "final-report" } } },
        ],
        budgets: { maxToolCalls: 1, maxConnectorCalls: 1, maxModelCalls: 1 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["long_context_process", "ambient.responses"]));
    expect(result.output.source).toContain("tools.long_context_process");
    expect(result.output.source).toContain("ambient.call");
    expect(result.output.source.indexOf("tools.long_context_process")).toBeLessThan(result.output.source.indexOf("ambient.call"));
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["connector:fixture.readonly.listRecords", "tool:long_context_process", "model:shape.long.context.report"]),
    );
  });

  it("infers connector-call manifest budgets from bounded connector.map fan-out", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "Connector Fan-out Budget",
        goal: "Manifest the worst-case connector calls used by a bounded map.",
        budgets: { maxRunMs: 1000 },
        nodes: [
          {
            id: "list-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            input: { limit: 2 },
          },
          {
            id: "read-record-details",
            kind: "connector.map",
            dependsOn: ["list-records"],
            connectorId: "fixture.readonly",
            operation: "getRecord",
            items: { fromNode: "list-records", path: "records" },
            itemName: "record",
            input: { id: { fromItem: "record", path: "id" } },
            maxItems: 2,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["read-record-details"],
            value: { details: { fromNode: "read-record-details", path: "items" } },
          },
        ],
      },
    });

    expect(result.output.manifest.maxConnectorCalls).toBe(3);
    expect(result.output.manifest.maxRunMs).toBe(10_000);
  });

  it("rejects connector.map whole-item references when primitive connector fields need a concrete path", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
        program: {
          version: 1,
          title: "Bad Connector Fan-out",
          goal: "Read bounded details with an invalid whole-item primitive input.",
          nodes: [
            {
              id: "read-record-details",
              kind: "connector.map",
              connectorId: "fixture.readonly",
              operation: "getRecord",
              items: [{ id: "row-1", name: "Alpha" }],
              itemName: "record",
              input: { id: { fromItem: "record" } },
              maxItems: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.item_reference_path_required", nodeId: "read-record-details" })],
      message: expect.stringContaining("/nodes/0/input/id"),
    });
  });

  it("rejects connector.map collection references that omit the array output path", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
        program: {
          version: 1,
          title: "Bad Connector Collection",
          goal: "Map over an object instead of its records array.",
          nodes: [
            {
              id: "list-records",
              kind: "connector.call",
              connectorId: "fixture.readonly",
              operation: "listRecords",
              input: { limit: 1 },
              output: { schema: { records: "array" } },
            },
            {
              id: "read-record-details",
              kind: "connector.map",
              dependsOn: ["list-records"],
              connectorId: "fixture.readonly",
              operation: "getRecord",
              items: { fromNode: "list-records" },
              itemName: "record",
              input: { id: { fromItem: "record", path: "id" } },
              maxItems: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "ir.array_reference_path_required",
          nodeId: "read-record-details",
          repairHint: expect.stringContaining('{"fromNode":"list-node","path":"records"}'),
        }),
      ],
      message: expect.stringContaining("/nodes/1/items"),
    });
  });

  it("rejects connector.map collection references that wrap an array ref inside a literal array", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
        program: {
          version: 1,
          title: "Wrapped Connector Collection",
          goal: "Map over an incorrectly wrapped records array reference.",
          nodes: [
            {
              id: "list-records",
              kind: "connector.call",
              connectorId: "fixture.readonly",
              operation: "listRecords",
              input: { limit: 1 },
              output: { schema: { records: "array" } },
            },
            {
              id: "read-record-details",
              kind: "connector.map",
              dependsOn: ["list-records"],
              connectorId: "fixture.readonly",
              operation: "getRecord",
              items: [{ fromNode: "list-records", path: "records" }],
              itemName: "record",
              input: { id: { fromItem: "record", path: "id" } },
              maxItems: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "ir.array_reference_wrapped",
          nodeId: "read-record-details",
          repairHint: expect.stringContaining("one-element array wrapper"),
        }),
      ],
      message: expect.stringContaining("/nodes/1/items"),
    });
  });

  it("rejects connector output schema overrides that invent unavailable result keys", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
        program: {
          version: 1,
          title: "Bad Connector Output Shape",
          goal: "Invent a connector output key that the descriptor does not expose.",
          nodes: [
            {
              id: "list-records",
              kind: "connector.call",
              connectorId: "fixture.readonly",
              operation: "listRecords",
              input: { limit: 1 },
              output: { schema: { items: "array", count: "number" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "connector.output_schema_unknown_property", nodeId: "list-records" }),
      ]),
      message: expect.stringContaining("/nodes/0/output/schema/items"),
    });
  });

  it("uses connector descriptor output keys when Pi-authored overrides omit known fields", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "Descriptor Output Contract",
        goal: "Read a connector cursor even when the generated override narrows the local schema.",
        nodes: [
          {
            id: "list-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            input: { limit: 1 },
            output: { schema: { records: "array" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["list-records"],
            value: {
              records: { fromNode: "list-records", path: "records" },
              cursor: { fromNode: "list-records", path: "nextCursor" },
            },
          },
        ],
      },
    });

    expect(result.output.source).toContain('readPath(outputs["list-records"], "nextCursor")');
    expect(result.dryRun.componentOutputs).toMatchObject({ "final-output": { records: [], cursor: null } });
  });

  it("dry-runs connector.map over descriptor-declared outputs when overrides are emptied", async () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
      program: {
        version: 1,
        title: "Descriptor Map Output",
        goal: "Map over a descriptor-declared connector array after repair removed the local output override.",
        nodes: [
          {
            id: "list-records",
            kind: "connector.call",
            connectorId: "fixture.readonly",
            operation: "listRecords",
            input: { limit: 1 },
            output: { schema: {} },
          },
          {
            id: "read-record-details",
            kind: "connector.map",
            dependsOn: ["list-records"],
            connectorId: "fixture.readonly",
            operation: "getRecord",
            items: { fromNode: "list-records", path: "records" },
            itemName: "record",
            input: { id: { fromItem: "record", path: "id" } },
            maxItems: 1,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["read-record-details"],
            value: { details: { fromNode: "read-record-details", path: "items" } },
          },
        ],
      },
    });

    expect(result.dryRun.componentOutputs).toMatchObject({
      "read-record-details": { count: 0, sourceCount: 0, truncated: false },
    });
  });

  it("dry-runs Gmail thread fan-out over descriptor-declared search threads", async () => {
    const [connector] = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: { "google.gmail": { status: "available", accounts: [{ id: "default", label: "Default Gmail" }] } },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector!],
      program: {
        version: 1,
        title: "Gmail Descriptor Map Output",
        goal: "Read Gmail search threads after repair removed the local output override.",
        nodes: [
          {
            id: "search-emails",
            kind: "connector.call",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "", maxResults: 100 },
            output: { schema: {} },
          },
          {
            id: "read-threads",
            kind: "connector.map",
            connectorId: "google.gmail",
            operation: "readThread",
            items: { fromNode: "search-emails", path: "threads" },
            itemName: "item",
            input: { threadId: { fromItem: "item", path: "id" }, format: "metadata" },
            maxItems: 100,
            maxConcurrency: 4,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["read-threads"],
            value: { threads: { fromNode: "read-threads", path: "items" } },
          },
        ],
      },
    });

    expect(result.dryRun.componentOutputs).toMatchObject({
      "read-threads": { count: 1, sourceCount: 1, truncated: false },
    });
  });

  it("rejects unavailable connector operations and insufficient connector budgets before code generation", async () => {
    const connector = fixtureWorkflowConnector().descriptor;
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
        program: {
          version: 1,
          title: "Bad Connector Operation",
          goal: "Try to call an unavailable connector operation.",
          nodes: [
            {
              id: "read-records",
              kind: "connector.call",
              connectorId: "fixture.readonly",
              operation: "deleteRecords",
              input: {},
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "connector.operation_unavailable", nodeId: "read-records" })],
    });

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
        program: {
          version: 1,
          title: "Bad Connector Budget",
          goal: "Declare too few connector calls.",
          nodes: [
            { id: "read-records", kind: "connector.call", connectorId: "fixture.readonly", operation: "listRecords", input: {} },
            { id: "final-output", kind: "output.final", dependsOn: ["read-records"], value: { records: { fromNode: "read-records" } } },
          ],
          budgets: { maxConnectorCalls: 0 },
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "budget.max_connector_calls_too_low" })],
    });
  });
});
