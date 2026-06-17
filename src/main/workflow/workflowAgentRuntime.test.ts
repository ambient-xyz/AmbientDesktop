import { describe, expect, it } from "vitest";
import {
  MemoryWorkflowCheckpointStore,
  WorkflowAgentRuntime,
  WorkflowInputPausedError,
  WorkflowManualPausedError,
  WorkflowPausedError,
  type WorkflowRuntimeEvent,
} from "./workflowAgentRuntime";

function manifest(tools: string[] = []) {
  return {
    tools,
    mutationPolicy: "read_only" as const,
  };
}

describe("WorkflowAgentRuntime", () => {
  it("runs hand-authored workflow steps with events and checkpoints", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(["echo"]),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });

    await runtime.run(
      async ({ workflow, tools }) => {
        const value = await workflow.step("echo step", async () => tools.echo({ text: "hello" }));
        await workflow.checkpoint("lastValue", value);
      },
      {
        tools: {
          echo: (input) => ({ input, ok: true }),
        },
      },
    );

    expect(checkpoints.snapshot()).toEqual({ lastValue: { input: { text: "hello" }, ok: true } });
    expect(events.map((event) => event.type)).toEqual([
      "workflow.start",
      "step.start",
      "tool.start",
      "tool.end",
      "step.end",
      "checkpoint.write",
      "workflow.succeeded",
    ]);
  });

  it("propagates graph node metadata through runtime events", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      approvalId: () => "approval-1",
      approvalDecision: () => "approved",
      eventSink: { append: (event) => void events.push(event) },
    });

    await runtime.run(async ({ workflow }) => {
      await workflow.step("classify", { nodeId: "classify" }, async () => undefined);
      await workflow.batch([1], { name: "items", nodeId: "batch", itemKey: "record-1" }, async () => undefined);
      await workflow.requireApproval({ file: "report.md" }, { nodeId: "review" });
      await workflow.stageMutation({ file: "report.md" }, async () => undefined, { nodeId: "mutation" });
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "step.start", data: { graphNodeId: "classify" } }),
        expect.objectContaining({ type: "step.end", data: { graphNodeId: "classify" } }),
        expect.objectContaining({ type: "batch.item", data: expect.objectContaining({ graphNodeId: "batch", itemKey: "record-1" }) }),
        expect.objectContaining({ type: "approval.required", data: expect.objectContaining({ graphNodeId: "review" }) }),
        expect.objectContaining({ type: "mutation.applied", data: expect.objectContaining({ graphNodeId: "mutation" }) }),
      ]),
    );
  });

  it("blocks undeclared tool calls before execution reaches the handler", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(["allowed"]),
      eventSink: { append: (event) => void events.push(event) },
    });
    let called = false;

    await expect(
      runtime.run(
        async ({ tools }) => {
          await tools.denied({});
        },
        {
          tools: {
            denied: () => {
              called = true;
            },
          },
        },
      ),
    ).rejects.toThrow("undeclared tool");

    expect(called).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["workflow.start", "workflow.failed"]);
  });

  it("runs batches with bounded concurrency and ordered results", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      eventSink: { append: (event) => void events.push(event) },
    });
    let active = 0;
    let maxActive = 0;
    let results: number[] = [];

    await runtime.run(async ({ workflow }) => {
      results = await workflow.batch([1, 2, 3, 4], { name: "double", maxConcurrency: 2 }, async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return item * 2;
      });
    });

    expect(results).toEqual([2, 4, 6, 8]);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(events.map((event) => event.type)).toContain("batch.end");
  });

  it("renders PDF document content deterministically with checkpoint resume", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    let result: unknown;

    await runtime.run(async ({ workflow }) => {
      result = await workflow.renderDocument(
        { summary: "Rendered report", findings: ["alpha", "beta"] },
        { name: "Render report", nodeId: "render-report", title: "Runtime Report", format: "pdf", path: "reports/runtime-report.pdf", checkpointKey: "runtime-report" },
      );
    });

    expect(result).toMatchObject({
      title: "Runtime Report",
      format: "pdf",
      mimeType: "application/pdf",
      artifactPath: "reports/runtime-report.pdf",
      path: "reports/runtime-report.pdf",
      truncated: false,
    });
    expect(String((result as { content: string }).content)).toMatch(/^%PDF-1\.4/);
    expect(checkpoints.snapshot()["runtime-report"]).toMatchObject({ complete: true, format: "pdf" });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["document.render.start", "document.render.end"]));

    events.length = 0;
    await runtime.run(async ({ workflow }) => {
      result = await workflow.renderDocument("ignored", { name: "Render report", nodeId: "render-report", title: "Runtime Report", format: "pdf", checkpointKey: "runtime-report" });
    });

    expect(events.map((event) => event.type)).toContain("document.render.resume");
  });

  it("preserves structured sibling evidence when rendering summary documents", async () => {
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
    });
    let result: unknown;

    await runtime.run(async ({ workflow }) => {
      result = await workflow.renderDocument(
        {
          summary: "Categorized the visible Downloads entries using metadata only.",
          categories: [{ name: "Finance", examples: ["tax-receipts-2025.pdf", "budget-summary.xlsx"] }],
          skippedMetadata: {
            skippedCount: 2,
            reasons: ["hidden path skipped", "secret-like path skipped"],
          },
        },
        { name: "Render downloads report", nodeId: "render-report", title: "Downloads Report", format: "markdown" },
      );
    });

    const content = String((result as { content: string }).content);
    expect(content).toContain("Categorized the visible Downloads entries using metadata only.");
    expect(content).toContain("Categories");
    expect(content).toContain("tax-receipts-2025.pdf");
    expect(content).toContain("Skipped Metadata");
    expect(content).toContain("hidden path skipped");
    expect(content).toContain("secret-like path skipped");
  });

  it("paginates connector pages with checkpoints, events, and resume", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    let calls = 0;
    let result: unknown;

    await runtime.run(async ({ workflow }) => {
      result = await workflow.paginateConnector(
        {
          name: "Gmail pages",
          nodeId: "gmail-pages",
          input: { q: "newer_than:14d" },
          pageSize: 2,
          pageSizeInputPath: "maxResults",
          pageTokenInputPath: "pageToken",
          itemsPath: "messages",
          nextPageTokenPath: "nextPageToken",
          dedupeKeyPath: "threadId",
          maxItems: 3,
          maxPages: 3,
          checkpointKey: "gmail-pages",
        },
        async (pageInput, pageIndex) => {
          calls += 1;
          return {
            messages:
              pageIndex === 0
                ? [
                    { id: "m1", threadId: "t1", pageInput },
                    { id: "m2", threadId: "t2" },
                  ]
                : [
                    { id: "m2-duplicate", threadId: "t2" },
                    { id: "m3", threadId: "t3", pageInput },
                  ],
            nextPageToken: pageIndex === 0 ? "page-2" : undefined,
          };
        },
      );
    });

    expect(calls).toBe(2);
    expect(result).toMatchObject({ count: 3, pageCount: 2, truncated: true, maxItems: 3, maxPages: 3, pageSize: 2 });
    expect(checkpoints.snapshot()["gmail-pages"]).toMatchObject({ complete: true, count: 3, pageCount: 2 });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["collection.paginate.start", "collection.page.start", "collection.page.end", "collection.paginate.end"]),
    );

    events.length = 0;
    await runtime.run(async ({ workflow }) => {
      result = await workflow.paginateConnector(
        {
          name: "Gmail pages",
          nodeId: "gmail-pages",
          input: {},
          maxItems: 3,
          maxPages: 3,
          itemsPath: "messages",
          nextPageTokenPath: "nextPageToken",
          checkpointKey: "gmail-pages",
        },
        async () => {
          throw new Error("completed pagination should resume without refetching");
        },
      );
    });

    expect(result).toMatchObject({ count: 3, pageCount: 2 });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "collection.paginate.resume" })]));
  });

  it("emits failed page recovery coordinates and retries from the retained page checkpoint", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    const options = {
      name: "Gmail pages",
      nodeId: "gmail-pages",
      pageSize: 1,
      pageSizeInputPath: "maxResults",
      pageTokenInputPath: "pageToken",
      itemsPath: "messages",
      nextPageTokenPath: "nextPageToken",
      maxItems: 2,
      maxPages: 3,
      checkpointKey: "gmail-pages",
    };

    await expect(
      runtime.run(async ({ workflow }) => {
        await workflow.paginateConnector(options, async (_pageInput, pageIndex) => {
          if (pageIndex === 1) throw new Error("temporary page failure");
          return { messages: [{ id: "m1" }], nextPageToken: "page-2" };
        });
      }),
    ).rejects.toThrow("temporary page failure");

    expect(checkpoints.snapshot()["gmail-pages"]).toMatchObject({ complete: false, count: 1, nextPageIndex: 1 });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "collection.page.error",
          data: expect.objectContaining({
            graphNodeId: "gmail-pages",
            itemKey: "page-2",
            targetKind: "page",
            targetIndex: 1,
            checkpointKey: "gmail-pages",
            error: "temporary page failure",
          }),
        }),
      ]),
    );

    const retryEvents: WorkflowRuntimeEvent[] = [];
    const retryRuntime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void retryEvents.push(event) },
    });
    const pageInputs: Record<string, unknown>[] = [];
    let result: unknown;

    await retryRuntime.run(async ({ workflow }) => {
      result = await workflow.paginateConnector(options, async (pageInput, pageIndex) => {
        pageInputs.push(pageInput);
        expect(pageIndex).toBe(1);
        return { messages: [{ id: "m2" }] };
      });
    });

    expect(pageInputs).toEqual([{ maxResults: 1, pageToken: "page-2" }]);
    expect(result).toMatchObject({ count: 2, pageCount: 2, truncated: true });
    expect(retryEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "collection.paginate.start", data: expect.objectContaining({ resumePage: 1 }) }),
        expect.objectContaining({ type: "collection.page.start", data: expect.objectContaining({ itemKey: "page-2", targetKind: "page" }) }),
      ]),
    );
  });

  it("paginates read-only tool query fan-out with checkpoints, events, and resume", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(["browser_search"]),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    const pageInputs: Record<string, unknown>[] = [];
    let result: unknown;

    await runtime.run(async ({ workflow }) => {
      result = await workflow.paginateTool(
        {
          name: "Search pages",
          nodeId: "search-pages",
          input: { fetchContent: false },
          pageQueries: ["alpha scottsdale sources", "beta scottsdale sources"],
          queryInputPath: "query",
          pageSize: 2,
          pageSizeInputPath: "maxResults",
          itemsPath: "",
          dedupeKeyPath: "url",
          maxItems: 3,
          maxPages: 2,
          checkpointKey: "search-pages",
        },
        async (pageInput, pageIndex) => {
          pageInputs.push(pageInput);
          return pageIndex === 0
            ? [
                { title: "Alpha 1", url: "https://example.com/a1" },
                { title: "Shared", url: "https://example.com/shared" },
              ]
            : [
                { title: "Shared duplicate", url: "https://example.com/shared" },
                { title: "Beta 2", url: "https://example.com/b2" },
              ];
        },
      );
    });

    expect(pageInputs).toEqual([
      { fetchContent: false, maxResults: 2, query: "alpha scottsdale sources" },
      { fetchContent: false, maxResults: 2, query: "beta scottsdale sources" },
    ]);
    expect(result).toMatchObject({ count: 3, pageCount: 2, truncated: true, maxItems: 3, maxPages: 2, pageSize: 2 });
    expect((result as { items: Array<{ url: string }> }).items.map((item) => item.url)).toEqual([
      "https://example.com/a1",
      "https://example.com/shared",
      "https://example.com/b2",
    ]);
    expect(checkpoints.snapshot()["search-pages"]).toMatchObject({ complete: true, count: 3, pageCount: 2 });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["collection.paginate.start", "collection.page.start", "collection.page.end", "collection.paginate.end"]),
    );

    events.length = 0;
    await runtime.run(async ({ workflow }) => {
      result = await workflow.paginateTool(
        {
          name: "Search pages",
          nodeId: "search-pages",
          input: {},
          maxItems: 3,
          maxPages: 2,
          itemsPath: "",
          checkpointKey: "search-pages",
        },
        async () => {
          throw new Error("completed tool pagination should resume without refetching");
        },
      );
    });

    expect(result).toMatchObject({ count: 3, pageCount: 2 });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "collection.paginate.resume" })]));
  });

  it("continues independent tool page queries after skip-page recovery", async () => {
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const events: WorkflowRuntimeEvent[] = [];
    const options = {
      name: "Search pages",
      nodeId: "search-pages",
      input: {},
      pageQueries: ["query one", "query two", "query three"],
      queryInputPath: "query",
      itemsPath: "",
      maxItems: 3,
      maxPages: 3,
      checkpointKey: "search-pages",
    };
    const firstRuntime = new WorkflowAgentRuntime({
      manifest: manifest(["browser_search"]),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      firstRuntime.run(async ({ workflow }) => {
        await workflow.paginateTool(options, async (_pageInput, pageIndex) => {
          if (pageIndex === 1) throw new Error("search shard failed");
          return [{ title: "one", url: "https://example.com/one" }];
        });
      }),
    ).rejects.toThrow("search shard failed");

    const recoveryEvents: WorkflowRuntimeEvent[] = [];
    const recoveryRuntime = new WorkflowAgentRuntime({
      manifest: manifest(["browser_search"]),
      checkpointStore: checkpoints,
      recovery: {
        action: "skip_item",
        sourceRunId: "run-1",
        sourceEventId: "event-1",
        targetGraphNodeId: "search-pages",
        targetItemKey: "page-2",
        targetKind: "page",
        targetIndex: 1,
        createdAt: "2026-05-16T00:00:00.000Z",
      },
      eventSink: { append: (event) => void recoveryEvents.push(event) },
    });
    const fetchedQueries: unknown[] = [];
    let result: unknown;

    await recoveryRuntime.run(async ({ workflow }) => {
      result = await workflow.paginateTool(options, async (pageInput, pageIndex) => {
        fetchedQueries.push(pageInput.query);
        expect(pageIndex).toBe(2);
        return [{ title: "three", url: "https://example.com/three" }];
      });
    });

    expect(fetchedQueries).toEqual(["query three"]);
    expect(result).toMatchObject({ count: 2, pageCount: 2, truncated: true });
    expect(recoveryEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.recovery.skipped_item",
          data: expect.objectContaining({ graphNodeId: "search-pages", itemKey: "page-2", targetKind: "page", targetIndex: 1 }),
        }),
        expect.objectContaining({
          type: "collection.page.end",
          data: expect.objectContaining({ itemKey: "page-3", targetKind: "page" }),
        }),
      ]),
    );
  });

  it("does not apply page recovery to under-specified item metadata", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      recovery: {
        action: "skip_item",
        sourceRunId: "run-1",
        sourceEventId: "event-1",
        targetGraphNodeId: "search-pages",
        targetItemKey: "page-2",
        targetKind: "page",
        targetIndex: 1,
        targetCheckpointKey: "search-pages",
        createdAt: "2026-05-16T00:00:00.000Z",
      },
      eventSink: { append: (event) => void events.push(event) },
    });
    let skipped = false;

    await runtime.run(async ({ workflow }) => {
      skipped = await workflow.skipItem({ nodeId: "search-pages", itemKey: "page-2" });
    });

    expect(skipped).toBe(false);
    expect(events.map((event) => event.type)).not.toContain("workflow.recovery.skipped_item");
  });

  it("does not skip a page from a different retained checkpoint", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(["browser_search"]),
      recovery: {
        action: "skip_item",
        sourceRunId: "run-1",
        sourceEventId: "event-1",
        targetGraphNodeId: "search-pages",
        targetItemKey: "page-2",
        targetKind: "page",
        targetIndex: 1,
        targetCheckpointKey: "search-pages",
        createdAt: "2026-05-16T00:00:00.000Z",
      },
      eventSink: { append: (event) => void events.push(event) },
    });
    const fetchedQueries: unknown[] = [];

    await runtime.run(async ({ workflow }) => {
      await workflow.paginateTool(
        {
          name: "Search pages",
          nodeId: "search-pages",
          input: {},
          pageQueries: ["query one", "query two"],
          queryInputPath: "query",
          itemsPath: "",
          maxItems: 2,
          maxPages: 2,
          checkpointKey: "other-search-pages",
        },
        async (pageInput) => {
          fetchedQueries.push(pageInput.query);
          return [{ title: String(pageInput.query), url: "https://example.com" }];
        },
      );
    });

    expect(fetchedQueries).toEqual(["query one", "query two"]);
    expect(events.map((event) => event.type)).not.toContain("workflow.recovery.skipped_item");
  });

  it("deduplicates collections with canonical URL keys, checkpoints, and resume", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    let result: unknown;

    await runtime.run(async ({ workflow }) => {
      result = await workflow.dedupeCollection(
        [
          { title: "A", url: "https://Example.com/report?utm_source=news&b=2&a=1#section" },
          { title: "Duplicate A", url: "https://example.com/report/?a=1&b=2" },
          { title: "B", url: "https://example.com/market?gclid=abc" },
          { title: "C", url: "https://example.com/market/" },
          { title: "D", url: "https://other.example/source" },
        ],
        { name: "dedupe sources", nodeId: "dedupe-sources", keyPath: "url", strategy: "url_canonical", maxItems: 2, checkpointKey: "dedupe-sources" },
      );
    });

    expect(result).toMatchObject({
      count: 2,
      sourceCount: 5,
      duplicateCount: 2,
      truncated: true,
      maxItems: 2,
      keyPath: "url",
      strategy: "url_canonical",
    });
    expect((result as { items: Array<{ title: string }> }).items.map((item) => item.title)).toEqual(["A", "B"]);
    expect(checkpoints.snapshot()["dedupe-sources"]).toMatchObject({ complete: true, count: 2, duplicateCount: 2 });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["collection.dedupe.start", "collection.dedupe.end"]));

    events.length = 0;
    await runtime.run(async ({ workflow }) => {
      result = await workflow.dedupeCollection([{ url: "https://ignored.example" }], { name: "dedupe sources", nodeId: "dedupe-sources", keyPath: "url", maxItems: 1, checkpointKey: "dedupe-sources" });
    });

    expect(result).toMatchObject({ count: 2, duplicateCount: 2 });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "collection.dedupe.resume" })]));
  });

  it("maps, chunks, model-maps, and reduces collections with bounded checkpoints", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    let modelCalls = 0;
    let reduced: unknown;

    await runtime.run(async ({ workflow }) => {
      const mapped = await workflow.mapCollection([1, 2, 3, 4, 5], { name: "double", nodeId: "map", maxItems: 4, checkpointKey: "double" }, (item) => item * 2);
      const chunked = await workflow.chunkCollection(mapped.items, { name: "pairs", nodeId: "chunk", chunkSize: 2, maxChunks: 2, checkpointKey: "pairs" });
      const categorized = await workflow.mapModel(
        chunked.chunks,
        { name: "categorize", nodeId: "model-map", maxItems: 2, maxConcurrency: 2, checkpointKey: "categorize" },
        async (chunk) => {
          modelCalls += 1;
          return { label: `chunk-${chunk.index}`, count: chunk.count };
        },
      );
      reduced = await workflow.reduceModel(
        categorized.results,
        { name: "reduce", nodeId: "reduce", maxInputItems: 2, checkpointKey: "reduce" },
        async (items, context) => ({ labels: items, context }),
      );
    });

    expect(modelCalls).toBe(2);
    expect(reduced).toMatchObject({ context: { sourceCount: 2, selectedCount: 2, truncated: false, strategy: "single_pass" } });
    expect(checkpoints.snapshot()).toMatchObject({
      double: { complete: true, count: 4, sourceCount: 5, truncated: true },
      pairs: { complete: true, count: 2, itemCount: 4, sourceCount: 4, truncated: false },
      categorize: { complete: true, count: 2, sourceCount: 2, truncated: false },
      reduce: { complete: true },
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["collection.map.start", "collection.chunk.end", "model.map.start", "model.map.end", "model.reduce.start", "model.reduce.end"]),
    );

    events.length = 0;
    await runtime.run(async ({ workflow }) => {
      await workflow.mapModel(
        [{ id: "already-done" }],
        { name: "categorize", nodeId: "model-map", maxItems: 1, checkpointKey: "categorize" },
        async () => {
          throw new Error("completed model map should resume");
        },
      );
    });

    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "model.map.resume" })]));
  });

  it("skips a failed model-map chunk with retained recovery coordinates", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      recovery: {
        action: "skip_item",
        sourceRunId: "run-1",
        sourceEventId: "event-1",
        targetGraphNodeId: "classify-chunks",
        targetItemKey: "chunk-records-2",
        targetKind: "chunk",
        targetIndex: 1,
        createdAt: "2026-05-16T00:00:00.000Z",
      },
      eventSink: { append: (event) => void events.push(event) },
    });
    const processedChunks: string[] = [];
    let mapped: unknown;

    await runtime.run(async ({ workflow }) => {
      const chunked = await workflow.chunkCollection(
        [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
        { name: "records", nodeId: "chunk-records", chunkSize: 2, maxChunks: 2 },
      );
      mapped = await workflow.mapModel(
        chunked.chunks,
        { name: "classify", nodeId: "classify-chunks", maxItems: 2, maxConcurrency: 2 },
        async (chunk) => {
          processedChunks.push(chunk.id);
          return { id: chunk.id, count: chunk.count };
        },
      );
    });

    expect(processedChunks).toEqual(["chunk-records-1"]);
    expect(mapped).toMatchObject({ count: 1, sourceCount: 2 });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.recovery.skipped_item",
          data: expect.objectContaining({ graphNodeId: "classify-chunks", itemKey: "chunk-records-2", targetKind: "chunk", targetIndex: 1 }),
        }),
      ]),
    );
  });

  it("tree-reduces model outputs with bounded fan-in checkpoints", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    const contexts: Array<Record<string, unknown>> = [];
    let reduced: unknown;

    await runtime.run(async ({ workflow }) => {
      reduced = await workflow.reduceModel(
        Array.from({ length: 20 }, (_, index) => ({ id: `summary-${index + 1}`, count: 1 })),
        { name: "tree reduce", nodeId: "tree-reduce", maxInputItems: 20, strategy: "tree", maxFanIn: 4, maxLevels: 4, checkpointKey: "tree-reduce" },
        async (items, context) => {
          contexts.push({ ...context });
          const count = items.reduce<number>((total, item) => total + Number((item as { count?: unknown }).count ?? 1), 0);
          return { count, itemCount: items.length, final: context.final, level: context.level };
        },
      );
    });

    expect(reduced).toMatchObject({ count: 20, itemCount: 2, final: true, level: 2 });
    expect(contexts).toHaveLength(8);
    expect(contexts.filter((context) => context.final === true)).toHaveLength(1);
    expect(contexts.slice(0, 5)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ strategy: "tree", level: 0, groupIndex: 0, groupCount: 5, selectedCount: 4, maxFanIn: 4, final: false }),
        expect.objectContaining({ strategy: "tree", level: 0, groupIndex: 4, groupCount: 5, selectedCount: 4, maxFanIn: 4, final: false }),
      ]),
    );
    expect(contexts).toEqual(expect.arrayContaining([expect.objectContaining({ strategy: "tree", level: 1, groupCount: 2, selectedCount: 1, final: false })]));
    expect(checkpoints.snapshot()).toMatchObject({
      "tree-reduce": { complete: true, tree: { selectedCount: 20, maxFanIn: 4, maxLevels: 4, modelCalls: 8 } },
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "model.reduce.start",
        "model.reduce.level.start",
        "model.reduce.group.start",
        "model.reduce.group.end",
        "model.reduce.level.end",
        "model.reduce.final.start",
        "model.reduce.final.end",
        "model.reduce.end",
      ]),
    );
  });

  it("pauses workflow execution when an approval has no decision yet", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      approvalId: () => "approval-1",
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      runtime.run(async ({ workflow }) => {
        await workflow.requireApproval({ file: "src/app.ts" });
      }),
    ).rejects.toBeInstanceOf(WorkflowPausedError);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approval.required",
          data: { id: "approval-1", changeSet: { file: "src/app.ts" } },
        }),
        expect.objectContaining({
          type: "workflow.paused",
          message: "approval-1",
        }),
      ]),
    );
  });

  it("continues past approved review gates during a resumed run", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      approvalId: () => "approval-1",
      approvalDecision: (approvalId) => (approvalId === "approval-1" ? "approved" : undefined),
      eventSink: { append: (event) => void events.push(event) },
    });
    let approvalStatus = "";

    await runtime.run(async ({ workflow }) => {
      const approval = await workflow.requireApproval({ file: "src/app.ts" });
      approvalStatus = approval.status;
      await workflow.emit({ type: "fixture.after_approval" });
    });

    expect(approvalStatus).toBe("approved");
    expect(events.map((event) => event.type)).toEqual([
      "workflow.start",
      "approval.required",
      "approval.approved",
      "fixture.after_approval",
      "workflow.succeeded",
    ]);
  });

  it("keeps review gate ids stable across volatile change-set content when node metadata is present", async () => {
    let generatedAt = 0;
    const changeSet = () => ({ file: "report.html", generatedAt: `run-${++generatedAt}` });
    const pausedEvents: WorkflowRuntimeEvent[] = [];
    const pausedRuntime = new WorkflowAgentRuntime({
      manifest: manifest(),
      eventSink: { append: (event) => void pausedEvents.push(event) },
    });

    await expect(
      pausedRuntime.run(async ({ workflow }) => {
        await workflow.stageMutation(changeSet(), async () => undefined, { nodeId: "write-report" });
      }),
    ).rejects.toBeInstanceOf(WorkflowPausedError);

    const approvalId = String(pausedEvents.find((event) => event.type === "approval.required")?.data?.id ?? "");
    expect(approvalId).toMatch(/^approval-1-/);

    const resumedEvents: WorkflowRuntimeEvent[] = [];
    let applied = false;
    const resumedRuntime = new WorkflowAgentRuntime({
      manifest: manifest(),
      approvalDecision: (candidate) => (candidate === approvalId ? "approved" : undefined),
      eventSink: { append: (event) => void resumedEvents.push(event) },
    });

    await resumedRuntime.run(async ({ workflow }) => {
      await workflow.stageMutation(changeSet(), async () => {
        applied = true;
      }, { nodeId: "write-report" });
    });

    expect(applied).toBe(true);
    expect(resumedEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "approval.approved", message: approvalId })]));
  });

  it("pauses workflow execution when user input is required", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      userInputId: () => "input-1",
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      runtime.run(async ({ workflow }) => {
        await workflow.askUser(
          "Which account should the workflow use?",
          {
            choices: [{ id: "primary", label: "Primary account" }],
            allowFreeform: false,
          },
          { nodeId: "input" },
        );
      }),
    ).rejects.toBeInstanceOf(WorkflowInputPausedError);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.input.required",
          message: "Which account should the workflow use?",
          data: expect.objectContaining({
            id: "input-1",
            prompt: "Which account should the workflow use?",
            graphNodeId: "input",
          }),
        }),
        expect.objectContaining({
          type: "workflow.paused",
          message: "input-1",
          data: expect.objectContaining({ reason: "Workflow is waiting for user input." }),
        }),
      ]),
    );
  });

  it("continues with a supplied user input response during a resumed run", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      userInputId: () => "input-1",
      userInputResponse: (request) =>
        request.id === "input-1"
          ? {
              requestId: request.id,
              choiceId: "primary",
              text: "Use the primary account.",
            }
          : undefined,
      eventSink: { append: (event) => void events.push(event) },
    });
    let responseText = "";

    await runtime.run(async ({ workflow }) => {
      const response = await workflow.askUser("Which account?", { choices: [{ id: "primary", label: "Primary" }] });
      responseText = response.text ?? "";
      await workflow.emit({ type: "fixture.after_input" });
    });

    expect(responseText).toBe("Use the primary account.");
    expect(events.map((event) => event.type)).toEqual([
      "workflow.start",
      "workflow.input.required",
      "workflow.input.received",
      "fixture.after_input",
      "workflow.succeeded",
    ]);
  });

  it("stages mutations until a resumed run supplies approval", async () => {
    const pausedEvents: WorkflowRuntimeEvent[] = [];
    const pausedRuntime = new WorkflowAgentRuntime({
      manifest: manifest(),
      approvalId: () => "approval-1",
      eventSink: { append: (event) => void pausedEvents.push(event) },
    });
    let applied = false;

    await expect(
      pausedRuntime.run(async ({ workflow }) => {
        await workflow.stageMutation({ file: "src/app.ts" }, async () => {
          applied = true;
        });
      }),
    ).rejects.toBeInstanceOf(WorkflowPausedError);

    expect(applied).toBe(false);
    expect(pausedEvents.map((event) => event.type)).toEqual([
      "workflow.start",
      "mutation.staged",
      "approval.required",
      "workflow.paused",
    ]);

    const resumedEvents: WorkflowRuntimeEvent[] = [];
    const resumedRuntime = new WorkflowAgentRuntime({
      manifest: manifest(),
      approvalId: () => "approval-1",
      approvalDecision: () => "approved",
      eventSink: { append: (event) => void resumedEvents.push(event) },
    });

    await resumedRuntime.run(async ({ workflow }) => {
      await workflow.stageMutation({ file: "src/app.ts" }, async () => {
        applied = true;
      });
    });

    expect(applied).toBe(true);
    expect(resumedEvents.map((event) => event.type)).toEqual([
      "workflow.start",
      "mutation.staged",
      "approval.required",
      "approval.approved",
      "mutation.applied",
      "workflow.succeeded",
    ]);
  });

  it("skips a resume point when a checkpoint already exists", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    checkpoints.set("expensive", { ok: true });
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });
    let called = false;
    let value: unknown;

    await runtime.run(async ({ workflow }) => {
      value = await workflow.resumePoint("expensive", async () => {
        called = true;
        return { ok: false };
      });
    });

    expect(value).toEqual({ ok: true });
    expect(called).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["workflow.start", "checkpoint.resume", "workflow.succeeded"]);
  });

  it("computes and checkpoints a missing resume point", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const checkpoints = new MemoryWorkflowCheckpointStore();
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      checkpointStore: checkpoints,
      eventSink: { append: (event) => void events.push(event) },
    });

    await runtime.run(async ({ workflow }) => {
      await workflow.resumePoint("expensive", async () => ({ ok: true }));
    });

    expect(checkpoints.snapshot()).toEqual({ expensive: { ok: true } });
    expect(events.map((event) => event.type)).toEqual(["workflow.start", "checkpoint.write", "workflow.succeeded"]);
  });

  it("skips a selected recovery batch item", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      recovery: {
        action: "skip_item",
        sourceRunId: "run-1",
        sourceEventId: "event-1",
        targetGraphNodeId: "classify",
        targetItemKey: "record-2",
        targetKind: "item",
        targetIndex: 1,
        createdAt: "2026-05-02T00:00:00.000Z",
      },
      eventSink: { append: (event) => void events.push(event) },
    });
    const processed: string[] = [];

    await runtime.run(async ({ workflow }) => {
      await workflow.batch(
        [{ id: "record-1" }, { id: "record-2" }, { id: "record-3" }],
        { name: "classify", nodeId: "classify" },
        async (item) => {
          processed.push(item.id);
          return item.id;
        },
      );
    });

    expect(processed).toEqual(["record-1", "record-3"]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.recovery.skipped_item",
          data: expect.objectContaining({ graphNodeId: "classify", itemKey: "record-2" }),
        }),
      ]),
    );
  });

  it("exposes recovery skip decisions to hand-authored item handlers", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      recovery: {
        action: "skip_item",
        sourceRunId: "run-1",
        sourceEventId: "event-1",
        targetGraphNodeId: "classify",
        targetItemKey: "record-2",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
      eventSink: { append: (event) => void events.push(event) },
    });
    const processed: string[] = [];

    await runtime.run(async ({ workflow }) => {
      for (const id of ["record-1", "record-2"]) {
        if (await workflow.skipItem({ nodeId: "classify", itemKey: id })) continue;
        processed.push(id);
      }
    });

    expect(processed).toEqual(["record-1"]);
    expect(events.map((event) => event.type)).toContain("workflow.recovery.skipped_item");
  });

  it("fails fast when canceled before a step starts", async () => {
    const controller = new AbortController();
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      abortSignal: controller.signal,
      eventSink: { append: (event) => void events.push(event) },
    });
    controller.abort();

    await expect(
      runtime.run(async ({ workflow }) => {
        await workflow.step("will not run", () => undefined);
      }),
    ).rejects.toThrow("canceled");
    expect(events.map((event) => event.type)).toEqual(["workflow.start", "workflow.failed"]);
  });

  it("pauses without a failure event when a manual pause is requested inside a step", async () => {
    const controller = new AbortController();
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      abortSignal: controller.signal,
      eventSink: { append: (event) => void events.push(event) },
    });
    await expect(
      runtime.run(async ({ workflow }) => {
        await workflow.step("will pause", async () => {
          controller.abort(new WorkflowManualPausedError("Pause at the next safe workflow checkpoint."));
          await workflow.checkpoint("after-pause", true);
        });
      }),
    ).rejects.toThrow("Pause at the next safe workflow checkpoint.");
    expect(events).toEqual([
      expect.objectContaining({ type: "workflow.start" }),
      expect.objectContaining({ type: "step.start", message: "will pause" }),
      expect.objectContaining({ type: "step.paused", message: "will pause" }),
      expect.objectContaining({ type: "workflow.paused", message: "Pause at the next safe workflow checkpoint." }),
    ]);
  });

  it("reclassifies generic abort errors as manual pauses when a pause reason is active", async () => {
    const controller = new AbortController();
    const events: WorkflowRuntimeEvent[] = [];
    const runtime = new WorkflowAgentRuntime({
      manifest: manifest(),
      abortSignal: controller.signal,
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      runtime.run(async ({ workflow }) => {
        await workflow.step("paused model call", () => {
          controller.abort(new WorkflowManualPausedError("Pause requested from parent workflow task row."));
          throw new Error("AbortError: request aborted");
        });
      }),
    ).rejects.toThrow("Pause requested from parent workflow task row.");
    expect(events.map((event) => event.type)).toEqual([
      "workflow.start",
      "step.start",
      "step.paused",
      "workflow.paused",
    ]);
  });
});
