import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { googleWorkspaceConnectorDescriptors } from "./workflowProgramGoogleWorkspaceFacade";
import { fixtureWorkflowConnector } from "./workflowProgramWorkflowFacade";
import { compileWorkflowProgramIr } from "./workflowProgramCompiler";

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
});
