import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { googleWorkspaceConnectorDescriptors } from "./workflowProgramGoogleWorkspaceFacade";
import { compileWorkflowProgramIr } from "./workflowProgramCompiler";

describe("compileWorkflowProgramIr Gmail scale contracts", () => {
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
});
