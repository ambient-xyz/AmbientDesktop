import { describe, expect, it } from "vitest";
import { parseWorkflowProgramIr } from "./workflowProgramIr";

describe("workflowProgramIr", () => {
  it("unwraps provider envelopes, normalizes common aliases, and stages default mutation tools", () => {
    const parsed = parseWorkflowProgramIr({
      program: {
        name: "Aliased workflow",
        objective: "Normalize Pi-friendly aliases into compiler IR.",
        nodes: [
          {
            nodeId: "write-report",
            type: "tool",
            toolName: "file_write",
            input: { path: "reports/out.md", content: "done" },
          },
          {
            id: "final-output",
            type: "final",
            dependencies: ["write-report", "write-report"],
            output: { report: { fromNode: "write-report" } },
          },
        ],
        edges: [{ from: "write-report", to: "final-output" }],
      },
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program).toMatchObject({
      version: 1,
      title: "Aliased workflow",
      goal: "Normalize Pi-friendly aliases into compiler IR.",
      edges: [{ id: "write-report-to-final-output", source: "write-report", target: "final-output", type: "data_flow" }],
      successCriteria: [],
      openQuestions: [],
    });
    expect(parsed.program.nodes).toEqual([
      expect.objectContaining({
        id: "write-report",
        kind: "mutation.stage",
        tool: "file_write",
        args: { path: "reports/out.md", content: "done" },
        changeSet: { tool: "file_write", args: { path: "reports/out.md", content: "done" } },
        dependsOn: [],
      }),
      expect.objectContaining({
        id: "final-output",
        kind: "output.final",
        dependsOn: ["write-report"],
        value: { report: { fromNode: "write-report" } },
      }),
    ]);
  });

  it("normalizes connector-map item aliases and Google local materialization handle aliases", () => {
    const parsed = parseWorkflowProgramIr({
      title: "Connector aliases",
      goal: "Normalize connector and Google materialization aliases.",
      nodes: [
        {
          id: "read-files",
          type: "connector.each",
          connector: "google.drive",
          operationName: "files.get",
          collection: [{ id: "file-1" }],
          as: "file",
          input: { fileId: { fromItem: "file", path: "id" } },
        },
        {
          id: "materialize",
          type: "tool.call",
          tool: "google_workspace_materialize_file",
          input: { fileHandle: "handle-1", path: "downloads/file.txt" },
        },
        { id: "final-output", type: "output.final", dependencies: ["read-files", "materialize"], value: { ok: true } },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program.nodes[0]).toMatchObject({
      id: "read-files",
      kind: "connector.map",
      connectorId: "google.drive",
      operation: "files.get",
      itemName: "file",
      items: [{ id: "file-1" }],
    });
    expect(parsed.program.nodes[1]).toMatchObject({
      id: "materialize",
      kind: "mutation.stage",
      tool: "google_workspace_materialize_file",
      args: { handle: "handle-1", path: "downloads/file.txt" },
    });
  });

  it("normalizes document render aliases with default markdown format", () => {
    const parsed = parseWorkflowProgramIr({
      title: "Document alias",
      goal: "Render a report document from prior content.",
      nodes: [
        {
          id: "render-report",
          type: "render.document",
          content: { summary: "done" },
          name: "Rendered Report",
          outputPath: "reports/rendered-report.md",
        },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program.nodes[0]).toMatchObject({
      id: "render-report",
      kind: "document.render",
      input: { summary: "done" },
      title: "Rendered Report",
      format: "markdown",
      path: "reports/rendered-report.md",
    });
  });

  it("normalizes collection dedupe aliases with canonical URL defaults", () => {
    const parsed = parseWorkflowProgramIr({
      title: "Dedupe aliases",
      goal: "Dedupe source records before synthesis.",
      nodes: [
        {
          id: "unique-sources",
          type: "collection.unique",
          collection: { fromNode: "search", path: "items" },
          dedupeKeyPath: "url",
          limit: 100,
        },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program.nodes[0]).toMatchObject({
      id: "unique-sources",
      kind: "collection.dedupe",
      items: { fromNode: "search", path: "items" },
      keyPath: "url",
      strategy: "url_canonical",
      maxItems: 100,
    });
  });

  it("normalizes collection filter aliases and bounded file-selection rules", () => {
    const parsed = parseWorkflowProgramIr({
      title: "Filter images",
      goal: "Select visible PNG images before visual analysis.",
      nodes: [
        {
          id: "select-images",
          type: "collection.select",
          collection: { fromNode: "list-images", path: "entries" },
          limit: 10,
          extensions: "png",
          includeNamePrefix: "image-",
          excludeNamePrefixes: ["."],
          excludeNameIncludes: ["credential", "secret"],
          requireFile: true,
        },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program.nodes[0]).toMatchObject({
      id: "select-images",
      kind: "collection.filter",
      items: { fromNode: "list-images", path: "entries" },
      maxItems: 10,
      includeExtensions: ["png"],
      includeNamePrefixes: ["image-"],
      excludeNamePrefixes: ["."],
      excludeNameIncludes: ["credential", "secret"],
      requireFile: true,
    });
  });

  it("compacts overlong model task labels while preserving the original task in the node description", () => {
    const longTask = [
      "Analyze every chunk of current web source evidence for example domains, reserved test domains, source freshness, source quality, citation URLs, run date, timezone, and report-writing implications",
      "before returning the final schema shaped claim packet for downstream synthesis and document rendering.",
    ].join(" ");
    const parsed = parseWorkflowProgramIr({
      title: "Long task labels",
      goal: "Normalize provider task prose into bounded model role labels.",
      nodes: [
        {
          id: "extract-claims",
          kind: "model.map",
          task: longTask,
          items: [{ fromNode: "chunks", path: "chunks" }],
          maxItems: 2,
          output: { schema: { claims: "array" } },
        },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program.nodes[0]).toMatchObject({
      id: "extract-claims",
      kind: "model.map",
      description: expect.stringContaining("Original model task: Analyze every chunk"),
    });
    expect((parsed.program.nodes[0] as { task: string }).task.length).toBeLessThanOrEqual(240);
    expect((parsed.program.nodes[0] as { task: string }).task.endsWith("...")).toBe(true);
  });

  it("normalizes provider-shaped review choices into schema-safe strings", () => {
    const parsed = parseWorkflowProgramIr({
      title: "Review choice normalization",
      goal: "Normalize generated choice objects.",
      nodes: [
        {
          id: "ask-tone",
          kind: "review.input",
          prompt: "Pick a report tone.",
          choices: [
            { id: { literal: "concise technical" }, label: { literal: "Concise technical" }, description: { literal: "short" } },
            { value: { path: "friendly" }, text: { label: "Friendly summary" } },
            "Executive",
          ],
        },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program.nodes[0]).toMatchObject({
      id: "ask-tone",
      kind: "review.input",
      choices: [
        { id: "concise-technical", label: "Concise technical" },
        { id: "friendly", label: "Friendly summary" },
        { id: "Executive", label: "Executive" },
      ],
    });
  });

  it("normalizes provider-shaped JSON Schema model outputs into field contracts", () => {
    const parsed = parseWorkflowProgramIr({
      title: "Provider schema normalization",
      goal: "Normalize generated JSON Schema output contracts.",
      nodes: [
        {
          id: "extract-options",
          kind: "model.map",
          task: "extract.movie.options",
          items: { fromNode: "chunks", path: "chunks" },
          maxItems: 4,
          output: {
            schema: {
              type: "object",
              required: ["options", "coverage"],
              properties: {
                options: { type: "array", items: { type: "object" } },
                coverage: { type: ["object", "null"] },
                optionalNote: { type: "string" },
              },
            },
          },
        },
        {
          id: "recommend",
          kind: "model.reduce",
          task: "recommend.movie",
          items: { fromNode: "extract-options", path: "results" },
          maxInputItems: 4,
          output: {
            type: "object",
            properties: {
              recommendation: { type: "string" },
              confidence: { type: "string" },
            },
          },
        },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error("expected parser success");
    expect(parsed.program.nodes[0]).toMatchObject({
      id: "extract-options",
      kind: "model.map",
      output: {
        schema: {
          options: { type: "array", items: { type: "object" } },
          coverage: { type: "object" },
        },
      },
    });
    expect(parsed.program.nodes[0]).not.toMatchObject({
      output: { schema: { type: "object" } },
    });
    expect(parsed.program.nodes[1]).toMatchObject({
      id: "recommend",
      kind: "model.reduce",
      output: {
        schema: {
          recommendation: { type: "string" },
          confidence: { type: "string" },
        },
      },
    });
  });

  it("returns structured schema diagnostics for invalid IR", () => {
    const parsed = parseWorkflowProgramIr({
      title: "Invalid workflow",
      goal: "Exercise parser diagnostics.",
      nodes: [{ id: "bad id", type: "tool", tool: "browser_search", input: { query: "x" } }],
    });

    expect(parsed).toMatchObject({
      success: false,
      diagnostics: [expect.objectContaining({ code: "ir.schema_invalid", severity: "error", path: "/nodes/0/id" })],
    });
  });
});
