import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors, type DesktopToolDescriptor } from "../desktopToolRegistry";
import { validateWorkflowProgramStatic, type WorkflowProgramNodeValidationCacheEntry } from "./workflowProgramTypecheck";
import type { WorkflowConnectorDescriptor } from "../workflowConnectors";
import type { WorkflowProgramIR } from "../../shared/workflowProgramIr";

function validate(program: WorkflowProgramIR, cache?: Map<string, WorkflowProgramNodeValidationCacheEntry>) {
  return validateWithDescriptors(program, {
    toolDescriptors: firstPartyDesktopToolDescriptors(),
    connectorDescriptors: [],
    cache,
  });
}

function validateWithDescriptors(
  program: WorkflowProgramIR,
  input: {
    toolDescriptors: DesktopToolDescriptor[];
    connectorDescriptors: WorkflowConnectorDescriptor[];
    cache?: Map<string, WorkflowProgramNodeValidationCacheEntry>;
  },
) {
  return validateWorkflowProgramStatic({
    program,
    toolDescriptors: input.toolDescriptors,
    connectorDescriptors: input.connectorDescriptors,
    ambientCliCapabilities: [],
    validateGoogleReadOnly: true,
    nodeValidationCache: input.cache,
  });
}

describe("workflowProgramTypecheck", () => {
  it("rejects unlowered handle references at the static validation boundary", async () => {
    const result = await validate({
      version: 1,
      title: "Unlowered handle",
      goal: "Ensure only the compiler registry can turn handles into paths.",
      nodes: [
        { id: "source", kind: "checkpoint.write", key: "rows", value: { items: [{ title: "Alpha" }] } },
        {
          id: "final-output",
          kind: "output.final",
          value: { rows: { fromHandle: "source.items" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.unlowered_handle_reference",
        nodeId: "final-output",
        path: "/nodes/1/value/rows/fromHandle",
      }),
    ]);
  });

  it("rejects references to unknown output paths using structured diagnostics", async () => {
    const result = await validate({
      version: 1,
      title: "Bad output path",
      goal: "Read a file and accidentally reference a non-existent output field.",
      nodes: [
        { id: "read-file", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
        {
          id: "read-page",
          kind: "tool.call",
          tool: "browser_content",
          dependsOn: ["read-file"],
          args: { url: { fromNode: "read-file", path: "missing" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.unknown_output_path",
        message: expect.stringContaining("Known valid first-segment paths: path, content, truncated, kind."),
        nodeId: "read-page",
        path: "/nodes/1/args/url/path",
      }),
    ]);
  });

  it("rejects paginated browser_search result aliases and points to valid collection paths", async () => {
    const result = await validate({
      version: 1,
      title: "Bad paginated search path",
      goal: "Collect browser search results and accidentally reference the raw tool-call alias.",
      nodes: [
        {
          id: "search-web",
          kind: "tool.paginate",
          tool: "browser_search",
          input: { maxResults: 3 },
          pageQueries: ["workflow compiler repair"],
          queryInputPath: "query",
          pageSizeInputPath: "maxResults",
          itemsPath: "",
          maxItems: 3,
          maxPages: 1,
        },
        {
          id: "summarize-results",
          kind: "model.reduce",
          dependsOn: ["search-web"],
          items: { fromNode: "search-web", path: "results" },
          task: "summarize.search.results",
          output: { schema: { summary: "string" } },
          maxInputItems: 3,
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.unknown_output_path",
        message: expect.stringContaining("Known valid first-segment paths: items, pages, count"),
        nodeId: "summarize-results",
        path: "/nodes/1/items/path",
      }),
    ]);
  });

  it("rejects review.input choice aliases and advertises choiceId", async () => {
    const result = await validate({
      version: 1,
      title: "Review output alias",
      goal: "Ask for a decision and accidentally reference an alias.",
      nodes: [
        { id: "decision", kind: "review.input", prompt: "Approve?", choices: [{ id: "yes", label: "Yes" }] },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["decision"],
          value: { decision: { fromNode: "decision", path: "choice" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.unknown_output_path",
        message: expect.stringContaining("choiceId"),
        nodeId: "final-output",
        path: "/nodes/1/value/decision/path",
      }),
    ]);
  });

  it("rejects browser intervention skip guards that trigger on successful content", async () => {
    const result = await validate({
      version: 1,
      title: "Bad browser skip guard",
      goal: "Open a page, then read content only when the first read failed.",
      nodes: [
        {
          id: "open-page",
          kind: "browser.intervention",
          tool: "browser_nav",
          args: { url: "https://example.com" },
        },
        {
          id: "read-page",
          kind: "browser.intervention",
          dependsOn: ["open-page"],
          tool: "browser_content",
          args: { url: "https://example.com" },
          skipIf: { fromNode: "open-page", path: "text" },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "browser.intervention_skipif_requires_skipped_flag",
        nodeId: "read-page",
        path: "/nodes/1/skipIf/path",
      }),
    ]);
  });

  it("allows browser intervention skip guards that reference the skipped flag", async () => {
    const result = await validate({
      version: 1,
      title: "Browser skip guard",
      goal: "Avoid a follow-up content read only if the navigation source was skipped.",
      nodes: [
        {
          id: "open-page",
          kind: "browser.intervention",
          tool: "browser_nav",
          args: { url: "https://example.com" },
        },
        {
          id: "read-page",
          kind: "browser.intervention",
          dependsOn: ["open-page"],
          tool: "browser_content",
          args: { url: "https://example.com" },
          skipIf: { fromNode: "open-page", path: "skipped" },
        },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["read-page"],
          value: { result: { fromNode: "read-page", path: "text" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
  });

  it("allows collection nodes to consume direct passthrough fields from error handlers", async () => {
    const result = await validateWithDescriptors(
      {
        version: 1,
        title: "Safe connector passthrough",
        goal: "Search Gmail with a fallback envelope and keep mapping the successful items directly.",
        nodes: [
          {
            id: "gmail-search",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "", maxResults: 20 },
            maxItems: 20,
            maxPages: 1,
            pageSize: 20,
            dedupeKeyPath: "threadId",
          },
          {
            id: "safe-search",
            kind: "error.handle",
            dependsOn: ["gmail-search"],
            try: { fromNode: "gmail-search" },
            fallback: { items: [], count: 0, truncated: false },
          },
          {
            id: "trim-metadata",
            kind: "collection.map",
            dependsOn: ["safe-search"],
            items: { fromNode: "safe-search", path: "items" },
            itemName: "item",
            map: { id: { fromItem: "item", path: "id" }, threadId: { fromItem: "item", path: "threadId" } },
            maxItems: 20,
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["trim-metadata"],
            task: "summarize.gmail.metadata",
            input: { metadata: { fromNode: "trim-metadata", path: "items" } },
            output: { schema: { summary: "string" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { result: { fromNode: "summarize" } },
          },
        ],
      },
      {
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [fixtureConnectorDescriptor()],
      },
    );

    expect(result.diagnostics).toEqual([]);
  });

  it("rejects collection inputs that omit concrete output paths or wrap references in arrays", async () => {
    const result = await validate({
      version: 1,
      title: "Bad collection references",
      goal: "Analyze local images with two common bad collection reference shapes.",
      nodes: [
        { id: "list-images", kind: "tool.call", tool: "local_directory_list", args: { path: "~/Desktop", maxEntries: 5 } },
        {
          id: "missing-path",
          kind: "loop.map",
          dependsOn: ["list-images"],
          items: { fromNode: "list-images" },
          itemName: "item",
          map: { kind: "tool.call", tool: "ambient_visual_analyze", args: { task: "image_description" } },
        },
        {
          id: "array-wrapped",
          kind: "loop.map",
          dependsOn: ["list-images"],
          items: [{ fromNode: "list-images", path: "entries" }],
          itemName: "item",
          map: { kind: "tool.call", tool: "ambient_visual_analyze", args: { task: "image_description" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ir.array_reference_path_required",
          message: expect.stringContaining("Known output paths on list-images"),
          nodeId: "missing-path",
          path: "/nodes/1/items",
        }),
        expect.objectContaining({
          code: "ir.array_reference_wrapped",
          nodeId: "array-wrapped",
          path: "/nodes/2/items",
        }),
      ]),
    );
  });

  it("rejects loop.map literal items that do not contain referenced item paths", async () => {
    const result = await validate({
      version: 1,
      title: "Literal item path validation",
      goal: "Catch URL fan-out items before runtime browser calls receive an empty URL.",
      nodes: [
        {
          id: "read-sources",
          kind: "loop.map",
          items: { literal: ["https://example.com"] },
          itemName: "source",
          map: { kind: "tool.call", tool: "browser_nav", args: { url: { fromItem: "source", path: "url" } } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.loop_map_literal_item_path_missing",
        nodeId: "read-sources",
        path: "/nodes/0/map/args/url/path",
      }),
    ]);
  });

  it("requires primitive tool arguments to reference concrete object output paths", async () => {
    const result = await validate({
      version: 1,
      title: "Primitive reference",
      goal: "Pass a file-read object where a URL string is required.",
      nodes: [
        { id: "read-file", kind: "tool.call", tool: "file_read", args: { path: "url.txt" } },
        {
          id: "read-page",
          kind: "tool.call",
          tool: "browser_nav",
          dependsOn: ["read-file"],
          args: { url: { fromNode: "read-file" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.reference_path_required",
        nodeId: "read-page",
        path: "/nodes/1/args/url",
      }),
    ]);
  });

  it("reuses cached node diagnostics and invalidates changed downstream references", async () => {
    const cache = new Map<string, WorkflowProgramNodeValidationCacheEntry>();
    const baseProgram: WorkflowProgramIR = {
      version: 1,
      title: "Typecheck cache",
      goal: "Validate independent source branches with a final output.",
      nodes: [
        { id: "search-a", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler A", maxResults: 2 } },
        { id: "search-b", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler B", maxResults: 2 } },
        { id: "final-output", kind: "output.final", dependsOn: ["search-a", "search-b"], value: { a: { fromNode: "search-a" }, b: { fromNode: "search-b" } } },
      ],
    };

    const first = await validate(baseProgram, cache);
    expect(first.diagnostics).toEqual([]);
    expect(first.metrics).toMatchObject({ validationCacheHits: 0, validationCacheMisses: 3, validationCacheWrites: 3 });
    expect(cache.size).toBe(3);

    const second = await validate(baseProgram, cache);
    expect(second.diagnostics).toEqual([]);
    expect(second.metrics).toMatchObject({ validationCacheHits: 3, validationCacheMisses: 0, validationCacheWrites: 0 });

    const changed = await validate(
      {
        ...baseProgram,
        nodes: [
          baseProgram.nodes[0]!,
          { id: "search-b", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler B updated", maxResults: 2 } },
          baseProgram.nodes[2]!,
        ],
      },
      cache,
    );
    expect(changed.diagnostics).toEqual([]);
    expect(changed.metrics).toMatchObject({ validationCacheHits: 1, validationCacheMisses: 2, validationCacheWrites: 2 });
  });

  it("validates references against descriptor-backed tool output schemas", async () => {
    const result = await validateWithDescriptors(
      {
        version: 1,
        title: "Descriptor output path",
        goal: "Use a custom tool result with descriptor-backed fields.",
        nodes: [
          { id: "catalog", kind: "tool.call", tool: "fixture_catalog", args: {} },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["catalog"],
            value: { records: { fromNode: "catalog", path: "madeUp" } },
          },
        ],
      },
      {
        toolDescriptors: [fixtureToolDescriptor("fixture_catalog", { records: "array", nextCursor: "string" })],
        connectorDescriptors: [],
      },
    );

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.unknown_output_path",
        message: expect.stringContaining("Known valid first-segment paths: records, nextCursor."),
        nodeId: "final-output",
        path: "/nodes/1/value/records/path",
      }),
    ]);
  });

  it("invalidates cached diagnostics when tool output schemas change", async () => {
    const cache = new Map<string, WorkflowProgramNodeValidationCacheEntry>();
    const program: WorkflowProgramIR = {
      version: 1,
      title: "Descriptor cache invalidation",
      goal: "Prove output schema changes invalidate reference-path diagnostics.",
      nodes: [
        { id: "catalog", kind: "tool.call", tool: "fixture_catalog", args: {} },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["catalog"],
          value: { records: { fromNode: "catalog", path: "records" } },
        },
      ],
    };

    const withoutRecords = await validateWithDescriptors(program, {
      toolDescriptors: [fixtureToolDescriptor("fixture_catalog")],
      connectorDescriptors: [],
      cache,
    });
    expect(withoutRecords.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.unknown_output_path",
        nodeId: "final-output",
      }),
    ]);

    const withRecords = await validateWithDescriptors(program, {
      toolDescriptors: [fixtureToolDescriptor("fixture_catalog", { records: "array" })],
      connectorDescriptors: [],
      cache,
    });
    expect(withRecords.diagnostics).toEqual([]);
    expect(withRecords.metrics.validationCacheHits).toBe(0);
    expect(withRecords.metrics.validationCacheMisses).toBe(2);
  });

  it("allows long_context_process over checkpoint-backed source evidence", async () => {
    const result = await validate({
      version: 1,
      title: "Long context source evidence",
      goal: "Read a source file, preprocess the long text, and return the bounded response.",
      nodes: [
        { id: "read-file", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
        {
          id: "summarize-long-file",
          kind: "tool.call",
          tool: "long_context_process",
          dependsOn: ["read-file"],
          args: {
            taskType: "summarization",
            instruction: "Summarize the source while preserving provenance.",
            text: { fromNode: "read-file", path: "content" },
            maxModelCalls: 2,
          },
        },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["summarize-long-file"],
          value: { summary: { fromNode: "summarize-long-file", path: "response" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
  });

  it("rejects long_context_process over uncheckpointed source intermediates", async () => {
    const result = await validate({
      version: 1,
      title: "Uncheckpointed Long Context Intermediate",
      goal: "Catch source evidence compressed through an uncheckpointed template before long-context processing.",
      nodes: [
        { id: "read-file", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
        {
          id: "format-source",
          kind: "transform.template",
          dependsOn: ["read-file"],
          template: "Source:\n{{text}}",
          vars: { text: { fromNode: "read-file", path: "content" } },
        },
        {
          id: "summarize-long-file",
          kind: "tool.call",
          tool: "long_context_process",
          dependsOn: ["format-source"],
          args: {
            taskType: "summarization",
            instruction: "Summarize the formatted source.",
            text: { fromNode: "format-source", path: "value" },
            maxModelCalls: 2,
          },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "audit.long_context_source_not_checkpointed",
        nodeId: "summarize-long-file",
        path: "/nodes/2/args/text",
      }),
    ]);
  });

  it("allows local_directory_list entries when skipped and coverage metadata travel with them", async () => {
    const result = await validate({
      version: 1,
      title: "Local directory inventory with coverage",
      goal: "Categorize a local folder from metadata while preserving skipped coverage.",
      nodes: [
        {
          id: "list-downloads",
          kind: "tool.call",
          tool: "local_directory_list",
          args: { path: "~/Downloads", maxEntries: 40, maxDepth: 1 },
        },
        {
          id: "checkpoint-inventory",
          kind: "checkpoint.write",
          dependsOn: ["list-downloads"],
          key: "normalized_directory_inventory",
          value: {
            entries: { fromNode: "list-downloads", path: "entries" },
            skippedMetadata: { fromNode: "list-downloads", path: "skipped" },
            truncated: { fromNode: "list-downloads", path: "truncated" },
            totalKnownEntries: { fromNode: "list-downloads", path: "totalKnownEntries" },
          },
        },
        {
          id: "classify-directory",
          kind: "model.call",
          dependsOn: ["checkpoint-inventory"],
          task: "classify.local.directory",
          input: {
            entries: { fromNode: "list-downloads", path: "entries" },
            skippedMetadata: { fromNode: "list-downloads", path: "skipped" },
            truncated: { fromNode: "list-downloads", path: "truncated" },
            totalKnownEntries: { fromNode: "list-downloads", path: "totalKnownEntries" },
          },
          output: { schema: { categories: "array" } },
        },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["classify-directory"],
          value: {
            categories: { fromNode: "classify-directory", path: "categories" },
            skippedMetadata: { fromNode: "list-downloads", path: "skipped" },
            totalKnownEntries: { fromNode: "list-downloads", path: "totalKnownEntries" },
          },
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
  });

  it("rejects local_directory_list entries in synthesis without skipped coverage metadata", async () => {
    const result = await validate({
      version: 1,
      title: "Local directory inventory missing coverage",
      goal: "Catch directory reports that hide skipped filesystem coverage.",
      nodes: [
        {
          id: "list-downloads",
          kind: "tool.call",
          tool: "local_directory_list",
          args: { path: "~/Downloads", maxEntries: 40, maxDepth: 1 },
        },
        {
          id: "classify-directory",
          kind: "model.call",
          dependsOn: ["list-downloads"],
          task: "classify.local.directory",
          input: { entries: { fromNode: "list-downloads", path: "entries" } },
          output: { schema: { categories: "array" } },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "audit.local_directory_skipped_metadata_required",
        nodeId: "classify-directory",
        path: "/nodes/1/input/entries",
      }),
    ]);
  });

  it("rejects aliasing a whole local_directory_list result as entries", async () => {
    const result = await validate({
      version: 1,
      title: "Local directory whole-result alias",
      goal: "Catch repair patches that avoid explicit entries/skipped coverage paths.",
      nodes: [
        {
          id: "list-downloads",
          kind: "tool.call",
          tool: "local_directory_list",
          args: { path: "~/Downloads", maxEntries: 40, maxDepth: 1 },
        },
        {
          id: "checkpoint-inventory",
          kind: "checkpoint.write",
          dependsOn: ["list-downloads"],
          key: "normalized_directory_inventory",
          value: {
            entries: { fromNode: "list-downloads" },
            skippedMetadata: { fromNode: "list-downloads", path: "skipped" },
            totalKnownEntries: { fromNode: "list-downloads", path: "totalKnownEntries" },
          },
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "audit.local_directory_entries_path_required",
        nodeId: "checkpoint-inventory",
        path: "/nodes/1/value/entries",
      }),
    ]);
  });

  it("rejects connector collection outputs that never reach synthesis or final output", async () => {
    const result = await validateWithDescriptors(
      {
        version: 1,
        title: "Dropped connector evidence",
        goal: "Catch workflows that collect connector pages but synthesize from static instructions.",
        nodes: [
          {
            id: "gmail-search",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "", maxResults: 20 },
            maxItems: 20,
            maxPages: 1,
            pageSize: 20,
            dedupeKeyPath: "threadId",
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["gmail-search"],
            task: "summarize.gmail.metadata",
            input: { instruction: "Summarize the Gmail metadata." },
            output: { schema: { summary: "string" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { result: { fromNode: "summarize" } },
          },
        ],
      },
      {
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [fixtureConnectorDescriptor()],
      },
    );

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "audit.connector_collection_evidence_unconsumed",
        nodeId: "gmail-search",
        path: "/nodes/0",
      }),
    ]);
  });

  it("allows connector collection outputs that flow through mapped metadata into a model", async () => {
    const result = await validateWithDescriptors(
      {
        version: 1,
        title: "Connector evidence retained",
        goal: "Use Gmail metadata in synthesis.",
        nodes: [
          {
            id: "gmail-search",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "", maxResults: 20 },
            maxItems: 20,
            maxPages: 1,
            pageSize: 20,
            dedupeKeyPath: "threadId",
          },
          {
            id: "trim-metadata",
            kind: "collection.map",
            dependsOn: ["gmail-search"],
            items: { fromNode: "gmail-search", path: "items" },
            itemName: "item",
            map: { id: { fromItem: "item", path: "id" }, threadId: { fromItem: "item", path: "threadId" } },
            maxItems: 20,
          },
          {
            id: "summarize",
            kind: "model.call",
            dependsOn: ["trim-metadata"],
            task: "summarize.gmail.metadata",
            input: { metadata: { fromNode: "trim-metadata", path: "items" } },
            output: { schema: { summary: "string" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["summarize"],
            value: { result: { fromNode: "summarize" } },
          },
        ],
      },
      {
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [fixtureConnectorDescriptor()],
      },
    );

    expect(result.diagnostics).toEqual([]);
  });
});

function fixtureToolDescriptor(name: string, outputSchema?: unknown): DesktopToolDescriptor {
  return {
    name,
    label: name,
    description: "Fixture tool",
    promptSnippet: "Use fixture tool.",
    promptGuidelines: [],
    inputSchema: { type: "object", properties: {} },
    outputSchema,
    source: "first-party",
    sideEffects: "none",
    permissionScope: "fixture",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 1000,
  };
}

function fixtureConnectorDescriptor(): WorkflowConnectorDescriptor {
  return {
    id: "google.gmail",
    label: "Gmail",
    description: "Fixture Gmail connector",
    auth: { type: "oauth2", status: "available" },
    accounts: [{ id: "default", label: "Default Gmail" }],
    scopes: [{ id: "gmail.readonly", label: "Gmail read", description: "Read Gmail", personalData: true }],
    operations: [
      {
        name: "search",
        label: "Search mail",
        description: "Search Gmail metadata",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { messages: "array", nextPageToken: "string" },
        requiredScopes: ["gmail.readonly"],
        sideEffects: "read_personal_data",
        supportsDryRun: true,
        idempotencyKey: "not-supported",
        mutationPolicy: "unsupported",
        pagination: {
          itemsPath: "messages",
          nextPageTokenPath: "nextPageToken",
          pageTokenInputPath: "pageToken",
          pageSizeInputPath: "maxResults",
          defaultPageSize: 20,
          maxPageSize: 100,
        },
        defaultTimeoutMs: 1000,
      },
    ],
    rateLimit: { requestsPerMinute: 60, burst: 10 },
    sync: { cursorKind: "opaque", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: ["Fixture connector minimizes data."],
  };
}
