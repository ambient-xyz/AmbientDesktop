import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { googleWorkspaceConnectorDescriptors } from "./workflowProgramGoogleWorkspaceFacade";
import { fixtureWorkflowConnector } from "./workflowProgramWorkflowFacade";
import { compileWorkflowProgramIr } from "./workflowProgramCompiler";

function generatedWorkflowRun(source: string): (input: unknown) => Promise<Record<string, unknown>> {
  const factory = new Function(source.replace(/^export default /, "return "));
  return factory() as (input: unknown) => Promise<Record<string, unknown>>;
}

describe("compileWorkflowProgramIr connector map contracts", () => {
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
