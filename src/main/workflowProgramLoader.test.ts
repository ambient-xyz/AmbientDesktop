import { describe, expect, it } from "vitest";
import type { WorkflowProgramContext, WorkflowRuntimeEvent } from "./workflowAgentRuntime";
import { loadWorkflowProgramFromSource } from "./workflowProgramLoader";

function fixtureProgramContext(events: WorkflowRuntimeEvent[] = []): WorkflowProgramContext {
  return {
    workflow: {
      emit: async (event) => void events.push(event),
      step: (async (_name: string, metadataOrFn: unknown, maybeFn?: unknown) => {
        const fn = typeof metadataOrFn === "function" ? metadataOrFn : maybeFn;
        if (typeof fn !== "function") throw new Error("missing step callback");
        await Promise.resolve();
        return fn();
      }) as WorkflowProgramContext["workflow"]["step"],
      batch: async (items, _options, fn) => Promise.all(items.map(fn)),
      paginateConnector: async (options, fetchPage) => {
        const page = await fetchPage(options.input ?? {}, 0);
        return { items: [], pages: [page], count: 0, pageCount: 1, truncated: false, maxItems: options.maxItems, maxPages: options.maxPages };
      },
      paginateTool: async (options, fetchPage) => {
        const page = await fetchPage(options.input ?? {}, 0);
        return { items: [], pages: [page], count: 0, pageCount: 1, truncated: false, maxItems: options.maxItems, maxPages: options.maxPages };
      },
      mapCollection: async (items, options, mapItem) => {
        const mapped = await Promise.all(items.slice(0, options.maxItems).map(mapItem));
        return { items: mapped, count: mapped.length, sourceCount: items.length, truncated: items.length > options.maxItems, maxItems: options.maxItems };
      },
      dedupeCollection: async (items, options) => {
        const seen = new Set<string>();
        const deduped = [];
        for (const item of items) {
          const key = String(options.keyPath && item && typeof item === "object" ? (item as Record<string, unknown>)[options.keyPath] : item);
          if (seen.has(key)) continue;
          seen.add(key);
          if (deduped.length < options.maxItems) deduped.push(item);
        }
        return { items: deduped, count: deduped.length, sourceCount: items.length, duplicateCount: items.length - seen.size, truncated: seen.size > options.maxItems, maxItems: options.maxItems, ...(options.keyPath ? { keyPath: options.keyPath } : {}), strategy: options.strategy ?? "url_canonical" };
      },
      chunkCollection: async (items, options) => {
        const maxItems = options.chunkSize * options.maxChunks;
        const selected = items.slice(0, maxItems);
        const chunks = [];
        for (let start = 0; start < selected.length && chunks.length < options.maxChunks; start += options.chunkSize) {
          const chunkItems = selected.slice(start, start + options.chunkSize);
          chunks.push({ id: `chunk-${chunks.length + 1}`, index: chunks.length, start, end: start + chunkItems.length, count: chunkItems.length, items: chunkItems });
        }
        return { chunks, count: chunks.length, itemCount: selected.length, sourceCount: items.length, truncated: items.length > maxItems, chunkSize: options.chunkSize, maxChunks: options.maxChunks };
      },
      renderDocument: async (input, options) => {
        const title = typeof options.title === "string" ? options.title : options.name ?? "Workflow Report";
        const format = options.format ?? "markdown";
        const content = format === "pdf" ? `%PDF-1.4\n% ${title}\n` : String(input ?? "");
        return { title, format, mimeType: format === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8", artifactPath: options.path ?? "reports/workflow-report.md", path: options.path ?? "reports/workflow-report.md", content, bytes: content.length, sourceChars: content.length, truncated: false };
      },
      mapModel: async (items, options, mapItem) => {
        const mapped = await Promise.all(items.slice(0, options.maxItems).map(async (item, index) => ({ item, result: await mapItem(item, index), index })));
        return {
          items: mapped,
          results: mapped.map((item) => item.result),
          count: mapped.length,
          sourceCount: items.length,
          truncated: items.length > options.maxItems,
          maxItems: options.maxItems,
          maxConcurrency: options.maxConcurrency ?? 1,
        };
      },
      reduceModel: async (items, options, reduceItems) => {
        const selected = items.slice(0, options.maxInputItems);
        return reduceItems(selected, { sourceCount: items.length, selectedCount: selected.length, truncated: items.length > options.maxInputItems, strategy: options.strategy ?? "single_pass" });
      },
      checkpoint: async () => undefined,
      resumePoint: async (_key, fn) => fn(),
      askUser: async (prompt) => ({ requestId: "input", text: prompt }),
      requireApproval: async () => ({ id: "approval", changeSet: {}, status: "pending" as const }),
      stageMutation: async (_changeSet, apply) => apply(),
      skipItem: async () => false,
    },
    tools: {},
    ambient: {},
    connectors: {},
  };
}

describe("loadWorkflowProgramFromSource", () => {
  it("loads default exported workflow programs in a narrow VM context", async () => {
    const program = loadWorkflowProgramFromSource(`
      export default async function run({ workflow }) {
        await workflow.emit({ type: "fixture", message: "loaded" });
      }
    `);
    const events: WorkflowRuntimeEvent[] = [];

    await program(fixtureProgramContext(events));

    expect(events).toEqual([{ type: "fixture", message: "loaded" }]);
  });

  it("loads named exported run functions", async () => {
    const program = loadWorkflowProgramFromSource("export async function run({ workflow }) { await workflow.checkpoint('ok', true); }");
    let checkpoint: unknown;

    await program({
      ...fixtureProgramContext(),
      workflow: {
        ...fixtureProgramContext().workflow,
        checkpoint: async (_key, value) => {
          checkpoint = value;
        },
      },
    });

    expect(checkpoint).toBe(true);
  });

  it("settles exported async runs that complete entirely inside the VM", async () => {
    const program = loadWorkflowProgramFromSource("export async function run() { return { ok: true }; }");

    await expect(program(fixtureProgramContext())).resolves.toBeUndefined();
  });

  it("settles async workflow callbacks that complete entirely inside the VM", async () => {
    const program = loadWorkflowProgramFromSource(`
      export async function run({ workflow }) {
        const result = await workflow.step("pure async", { nodeId: "pure" }, async () => {
          return { ok: true, value: ["a", "b"] };
        });
        await workflow.emit({ type: "pure.result", data: result });
      }
    `);
    const events: WorkflowRuntimeEvent[] = [];

    await program(fixtureProgramContext(events));

    expect(events.at(-1)).toEqual({ type: "pure.result", data: { ok: true, value: ["a", "b"] } });
  });

  it("exposes deterministic collection dedupe through the sandbox bridge", async () => {
    const program = loadWorkflowProgramFromSource(`
      export async function run({ workflow }) {
        const result = await workflow.dedupeCollection(
          [{ url: "https://example.test/a" }, { url: "https://example.test/a" }, { url: "https://example.test/b" }],
          { name: "dedupe", nodeId: "dedupe", keyPath: "url", maxItems: 5 }
        );
        await workflow.emit({ type: "dedupe.result", data: result });
      }
    `);
    const events: WorkflowRuntimeEvent[] = [];

    await program(fixtureProgramContext(events));

    expect(events.at(-1)).toMatchObject({ type: "dedupe.result", data: { count: 2, sourceCount: 3, duplicateCount: 1 } });
  });

  it("does not expose host Function constructors through SDK bindings", async () => {
    const program = loadWorkflowProgramFromSource(`
export default async function run({ workflow, tools, ambient, connectors }) {
  await workflow.emit({
    type: "ctor.probe",
    data: {
      workflowCtor: typeof workflow["constr" + "uctor"],
      emitCtor: typeof workflow.emit["constr" + "uctor"],
      toolCtor: typeof tools.echo["constr" + "uctor"],
      ambientCtor: typeof ambient.call["constr" + "uctor"],
      connectorCtor: typeof connectors.call["constr" + "uctor"],
    }
  });
}
`);
    const events: WorkflowRuntimeEvent[] = [];

    await program({
      ...fixtureProgramContext(events),
      tools: { echo: async () => "ok" },
      ambient: { call: async () => "ok" },
      connectors: { call: async () => "ok" },
    });

    expect(events).toEqual([
      {
        type: "ctor.probe",
        data: {
          workflowCtor: "undefined",
          emitCtor: "undefined",
          toolCtor: "undefined",
          ambientCtor: "undefined",
          connectorCtor: "undefined",
        },
      },
    ]);
  });

  it("rejects imports and missing run exports", () => {
    expect(() => loadWorkflowProgramFromSource('import fs from "node:fs"; export async function run() {}')).toThrow(
      "forbidden Node module load",
    );
    expect(() => loadWorkflowProgramFromSource("const value = 1;")).toThrow("export a run function");
  });

  it("allows generated workflow literals to mention import or export words", async () => {
    const program = loadWorkflowProgramFromSource(`
      export async function run({ workflow }) {
        await workflow.emit({ type: "note", message: "export as a Markdown file without import modules" });
      }
    `);
    const events: WorkflowRuntimeEvent[] = [];
    await program(fixtureProgramContext(events));
    expect(events).toEqual([expect.objectContaining({ type: "note" })]);
  });

  it("rejects generated source that reaches for globals or reflection before execution", () => {
    expect(() => loadWorkflowProgramFromSource("export async function run() { return globalThis.process; }")).toThrow(
      "global object access",
    );
    expect(() =>
      loadWorkflowProgramFromSource("export async function run({ workflow }) { return workflow.emit.constructor; }"),
    ).toThrow("constructor reflection");
  });

  it("terminates synchronous CPU loops when invoking the exported run function", async () => {
    const program = loadWorkflowProgramFromSource("export function run() { const keepGoing = 1; while (keepGoing) {} }", {
      syncTimeoutMs: 25,
    });

    await expect(program(fixtureProgramContext())).rejects.toThrow(
      "Workflow program exceeded synchronous execution limit (25 ms) while starting workflow run.",
    );
  });

  it("terminates synchronous CPU loops inside workflow callbacks", async () => {
    const program = loadWorkflowProgramFromSource(
      `
      export async function run({ workflow }) {
        await workflow.step("busy", () => {
          const keepGoing = 1;
          while (keepGoing) {}
        });
      }
      `,
      { syncTimeoutMs: 25 },
    );

    await expect(program(fixtureProgramContext())).rejects.toThrow(
      'Workflow program exceeded synchronous execution limit (25 ms) while running workflow step callback "busy".',
    );
  });

  it("terminates CPU loops after awaited workflow host calls", async () => {
    const program = loadWorkflowProgramFromSource(
      `
      export async function run({ workflow }) {
        await workflow.emit({ type: "before-loop" });
        const keepGoing = 1;
        while (keepGoing) {}
      }
      `,
      { syncTimeoutMs: 25 },
    );

    await expect(program(fixtureProgramContext())).rejects.toThrow(
      "Workflow program exceeded synchronous execution limit (25 ms) while resuming workflow after host call.",
    );
  });

  it("terminates CPU loops after awaited host calls inside workflow callbacks", async () => {
    const program = loadWorkflowProgramFromSource(
      `
      export async function run({ workflow }) {
        await workflow.step("async busy", async () => {
          await workflow.emit({ type: "before-callback-loop" });
          const keepGoing = 1;
          while (keepGoing) {}
        });
      }
      `,
      { syncTimeoutMs: 25 },
    );

    await expect(program(fixtureProgramContext())).rejects.toThrow(
      "Workflow program exceeded synchronous execution limit (25 ms) while resuming workflow after host call.",
    );
  });

  it("does not inspect generated thenable getters on the host event loop", async () => {
    const program = loadWorkflowProgramFromSource(
      `
      export function run() {
        return {
          get then() {
            const keepGoing = 1;
            while (keepGoing) {}
          }
        };
      }
      `,
      { syncTimeoutMs: 25 },
    );

    await expect(program(fixtureProgramContext())).resolves.toBeUndefined();
  });
});
