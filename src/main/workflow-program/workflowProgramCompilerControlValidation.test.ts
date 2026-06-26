import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { compileWorkflowProgramIr, WorkflowProgramCompileError } from "./workflowProgramCompiler";

function generatedWorkflowRun(source: string): (input: unknown) => Promise<Record<string, unknown>> {
  const factory = new Function(source.replace(/^export default /, "return "));
  return factory() as (input: unknown) => Promise<Record<string, unknown>>;
}

describe("compileWorkflowProgramIr control and validation contracts", () => {
  it("compiles approval.required nodes into workflow.requireApproval gates", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Approval Gate",
        goal: "Summarize evidence and require approval before returning the approved proposal.",
        nodes: [
          { id: "read-evidence", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
          {
            id: "draft-summary",
            kind: "model.call",
            dependsOn: ["read-evidence"],
            task: "draft.summary",
            input: { notes: { fromNode: "read-evidence", path: "content" } },
            output: { schema: { summary: "string" } },
          },
          {
            id: "approve-summary",
            kind: "approval.required",
            dependsOn: ["draft-summary"],
            changeSet: { summary: { fromNode: "draft-summary", path: "summary" }, action: "approve summary" },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["approve-summary"],
            value: { approvalStatus: { fromNode: "approve-summary", path: "status" } },
          },
        ],
      },
    });

    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "approve-summary", type: "review_gate" })]),
    );
    expect(result.output.source).toContain("workflow.requireApproval");
    expect(result.output.source).toContain('{ nodeId: "approve-summary" }');
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:file_read", "model:draft.summary", "approval:approve-summary"]),
    );
  });

  it("compiles deterministic branch.if, loop.map, and error.handle nodes", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Control Flow IR",
        goal: "Select a branch, map evidence items, and provide a fallback wrapper.",
        nodes: [
          {
            id: "choose-status",
            kind: "branch.if",
            condition: true,
            then: "ready",
            else: "blocked",
          },
          {
            id: "map-evidence",
            kind: "loop.map",
            items: [{ title: "Alpha" }, { title: "Beta" }],
            itemName: "item",
            map: { template: "Evidence: {{item.title}}", vars: { item: { fromItem: "item" } } },
            maxItems: 5,
          },
          {
            id: "safe-status",
            kind: "error.handle",
            dependsOn: ["choose-status"],
            try: { fromNode: "choose-status", path: "value" },
            fallback: "fallback status",
          },
          {
            id: "safe-evidence",
            kind: "error.handle",
            dependsOn: ["map-evidence"],
            try: { fromNode: "map-evidence" },
            fallback: { items: [], count: 0, truncated: false },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["safe-evidence", "safe-status"],
            value: {
              status: { fromNode: "safe-status", path: "value" },
              evidence: { fromNode: "safe-evidence", path: "items" },
            },
          },
        ],
      },
    });

    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "choose-status", type: "deterministic_step" }),
        expect.objectContaining({ id: "map-evidence", type: "deterministic_step" }),
        expect.objectContaining({ id: "safe-status", type: "error_handler" }),
        expect.objectContaining({ id: "safe-evidence", type: "error_handler" }),
      ]),
    );
    expect(result.output.source).toContain('condition ? "then" : "else"');
    expect(result.output.source).toContain(".map((map_evidence_item");
    expect(result.output.source).toContain("renderTemplate");
    expect(result.output.source).not.toContain("process.");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.nodeId ?? call.name}`)).toEqual(
      expect.arrayContaining([
        "step:choose-status",
        "step:map-evidence",
        "step:safe-status",
        "step:safe-evidence",
        "checkpoint:final-output",
      ]),
    );
    expect(result.dryRun.componentOutputs).toMatchObject({
      "choose-status": { branch: "then", value: "ready" },
      "map-evidence": { items: ["Evidence: Alpha", "Evidence: Beta"], count: 2, truncated: false },
      "safe-status": { ok: true, value: "ready" },
      "safe-evidence": { ok: true, items: ["Evidence: Alpha", "Evidence: Beta"], count: 2 },
      "final-output": { status: "ready", evidence: ["Evidence: Alpha", "Evidence: Beta"] },
    });
  });

  it("compiles loop.map tool fan-out for bounded MiniCPM image analysis", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Downloads Image Fanout",
        goal: "Analyze ten local Downloads images with the first-party visual tool.",
        nodes: [
          {
            id: "list-images",
            kind: "tool.call",
            tool: "local_directory_list",
            args: { path: "~/Downloads", maxEntries: 200, maxDepth: 1 },
          },
          {
            id: "analyze-images",
            kind: "loop.map",
            dependsOn: ["list-images"],
            items: { fromNode: "list-images", path: "entries" },
            itemName: "item",
            maxItems: 10,
            maxConcurrency: 4,
            map: {
              kind: "tool.call",
              tool: "ambient_visual_analyze",
              args: {
                image: {
                  path: { fromItem: "item", path: "absolutePath" },
                  source: "external_file",
                  absolute: true,
                  label: { fromItem: "item", path: "name" },
                },
                task: "image_description",
                allowExternalMediaPaths: true,
              },
              output: { type: "visualAnalysisResult" },
            },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["analyze-images"],
            value: { visualEvidence: { fromNode: "analyze-images", path: "items" } },
          },
        ],
        budgets: { maxToolCalls: 11, maxRunMs: 1_500_000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient_visual_analyze"]));
    expect(result.output.manifest.maxToolCalls).toBe(11);
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "analyze-images", type: "data_source", toolNames: ["ambient_visual_analyze"] }),
      ]),
    );
    expect(result.output.source).toContain("workflow.batch");
    expect(result.output.source).toContain("tools.ambient_visual_analyze");
    expect(result.output.source).toContain("maxConcurrency: 4");
    expect(result.output.source).not.toContain("return { item: analyze_images_item, error:");
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "analyze-images",
          retryPolicy: expect.stringContaining("retry or skip failed items"),
        }),
      ]),
    );
    expect(result.dryRun.calls.filter((call) => call.kind === "tool" && call.name === "ambient_visual_analyze")).toHaveLength(10);
    expect(result.dryRun.componentOutputs).toMatchObject({
      "analyze-images": { count: 10, sourceCount: 10, truncated: false },
    });
  });

  it("executes collection.filter as a deterministic bounded file-selection step", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Filtered Image Selection",
        goal: "Select visible PNG image fixtures before visual analysis.",
        nodes: [
          {
            id: "source-images",
            kind: "checkpoint.write",
            key: "source-images",
            value: {
              entries: [
                { name: "image-01.png", path: "image-01.png", absolutePath: "/tmp/image-01.png", extension: ".png", type: "file" },
                {
                  name: ".hidden-camera-roll.png",
                  path: ".hidden-camera-roll.png",
                  absolutePath: "/tmp/.hidden-camera-roll.png",
                  extension: ".png",
                  type: "file",
                },
                {
                  name: "credentials-photo.png",
                  path: "credentials-photo.png",
                  absolutePath: "/tmp/credentials-photo.png",
                  extension: ".png",
                  type: "file",
                },
                { name: "image-02.jpg", path: "image-02.jpg", absolutePath: "/tmp/image-02.jpg", extension: ".jpg", type: "file" },
                { name: "image-03.png", path: "image-03.png", absolutePath: "/tmp/image-03.png", extension: ".png", type: "directory" },
                { name: "image-04.png", path: "image-04.png", absolutePath: "/tmp/image-04.png", extension: ".png", type: "file" },
              ],
            },
          },
          {
            id: "select-images",
            kind: "collection.filter",
            dependsOn: ["source-images"],
            items: { fromNode: "source-images", path: "entries" },
            maxItems: 2,
            includeExtensions: [".png"],
            includeNamePrefixes: ["image-"],
            excludeNamePrefixes: ["."],
            excludeNameIncludes: ["credential"],
            requireFile: true,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["select-images"],
            value: {
              selected: { fromNode: "select-images", path: "items" },
              matchedCount: { fromNode: "select-images", path: "matchedCount" },
            },
          },
        ],
      },
    });

    expect(result.validationReport.status).toBe("passed");
    expect(result.output.source).toContain("collection.filter node select-images");
    expect(result.output.source).toContain("matchedCount");
    const run = generatedWorkflowRun(result.output.source);
    const outputs = await run({
      workflow: {
        resumePoint: async (_key: string, fn: () => Promise<unknown>) => fn(),
        step: async (_label: string, metadataOrFn: unknown, maybeFn?: () => Promise<unknown>) =>
          typeof metadataOrFn === "function" ? metadataOrFn() : maybeFn?.(),
        checkpoint: async (_key: string, value: unknown) => value,
        emit: async () => undefined,
      },
      tools: {},
      ambient: {},
      connectors: {},
    });

    expect(outputs["select-images"]).toMatchObject({ count: 2, matchedCount: 2, sourceCount: 6, truncated: false });
    expect((outputs["final-output"] as { selected: Array<{ name: string }> }).selected.map((item) => item.name)).toEqual([
      "image-01.png",
      "image-04.png",
    ]);
  });

  it("rejects loop item references outside loop.map.map scope", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Item Scope",
          goal: "Reference a loop item outside its map scope.",
          nodes: [
            {
              id: "bad-branch",
              kind: "branch.if",
              condition: { fromItem: "item", path: "ready" },
              then: "ready",
              else: "blocked",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.local_item_reference_out_of_scope", nodeId: "bad-branch" })],
      failureReport: expect.objectContaining({ phase: "static_validation" }),
    });
  });

  it("infers minimum static call budgets when the IR omits them", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Budget Inference",
        goal: "Read a file, classify it, and stage a report.",
        nodes: [
          { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
          {
            id: "classify",
            kind: "model.call",
            dependsOn: ["read-source"],
            task: "classify.notes",
            input: { content: { fromNode: "read-source", path: "content" } },
            output: { schema: { summary: "string" } },
          },
          {
            id: "write-report",
            kind: "mutation.stage",
            tool: "file_write",
            dependsOn: ["classify"],
            args: { path: "reports/notes.md", content: { fromNode: "classify", path: "summary" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["write-report"],
            value: { path: { fromNode: "write-report", path: "path" } },
          },
        ],
      },
    });

    expect(result.output.manifest).toMatchObject({
      maxToolCalls: 2,
      maxModelCalls: 1,
    });
  });

  it("rejects static call budgets that cannot cover the IR", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Budget",
          goal: "Declare too few tool calls.",
          nodes: [
            { id: "read-a", kind: "tool.call", tool: "file_read", args: { path: "a.md" } },
            { id: "read-b", kind: "tool.call", tool: "file_read", args: { path: "b.md" } },
            {
              id: "final-output",
              kind: "output.final",
              dependsOn: ["read-a", "read-b"],
              value: { a: { fromNode: "read-a", path: "content" }, b: { fromNode: "read-b", path: "content" } },
            },
          ],
          budgets: { maxToolCalls: 1 },
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "budget.max_tool_calls_too_low" })],
    });
  });

  it("attaches phase-aware failure reports to compiler diagnostics", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Tool",
          goal: "Reference a tool that is not available.",
          nodes: [{ id: "search", kind: "tool.call", tool: "browserSearch", args: { query: "workflow compiler" } }],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.unavailable_tool", nodeId: "search" })],
      failureReport: expect.objectContaining({
        phase: "static_validation",
        firstDiagnosticCode: "ir.unavailable_tool",
        firstDiagnosticNodeId: "search",
        diagnosticCount: 1,
        totalMs: expect.any(Number),
        parseAndNormalizeMs: expect.any(Number),
        staticValidationMs: expect.any(Number),
      }),
    });
  });

  it("compiles file_read through .content-aware dataflow and bash classification", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Local Test Summary",
        goal: "Read package metadata, run tests, and classify the result.",
        nodes: [
          { id: "read-package", kind: "tool.call", tool: "file_read", args: { path: "package.json" } },
          { id: "run-tests", kind: "tool.call", tool: "bash", args: { command: "pnpm test" } },
          {
            id: "classify",
            kind: "model.call",
            dependsOn: ["read-package", "run-tests"],
            task: "classify.test.result",
            input: {
              packageJson: { fromNode: "read-package", path: "content" },
              testResult: { fromNode: "run-tests" },
            },
            output: { schema: { label: "string", summary: "string" } },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["classify"], value: { classification: { fromNode: "classify" } } },
        ],
        budgets: { maxRunMs: 120000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["file_read", "bash", "ambient.responses"]));
    expect(result.output.source).toContain('readPath(outputs["read-package"], "content")');
    expect(result.dryRun.calls.map((call) => call.name)).toEqual(expect.arrayContaining(["file_read", "bash", "classify.test.result"]));
  });

  it("rejects unavailable tools before code generation", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Tool",
          goal: "Use a tool that does not exist.",
          nodes: [{ id: "bad-tool", kind: "tool.call", tool: "tools.browser", args: {} }],
        },
      }),
    ).rejects.toBeInstanceOf(WorkflowProgramCompileError);
  });

  it("rejects missing output references with path-level diagnostics", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Reference",
          goal: "Reference an output that does not exist.",
          nodes: [{ id: "final-output", kind: "output.final", value: { missing: { fromNode: "not-real" } } }],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.missing_value_source", nodeId: "final-output" })],
    });
  });

  it("rejects references to unknown output paths before code generation", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Path",
          goal: "Use a file read path that does not exist.",
          nodes: [
            { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
            {
              id: "final-output",
              kind: "output.final",
              dependsOn: ["read-source"],
              value: { text: { fromNode: "read-source", path: "contents" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.unknown_output_path", nodeId: "final-output" })],
    });
  });

  it("summarizes invalid output path failures with producer node and valid alternatives", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Path Evidence",
          goal: "Expose actionable invalid-path failure evidence.",
          nodes: [
            { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
            {
              id: "final-output",
              kind: "output.final",
              dependsOn: ["read-source"],
              value: { text: { fromNode: "read-source", path: "contents" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      failureReport: expect.objectContaining({
        phase: "static_validation",
        firstDiagnosticCode: "ir.unknown_output_path",
        firstDiagnosticNodeId: "final-output",
        firstDiagnosticSourceNodeId: "read-source",
        firstDiagnosticInvalidOutputPath: "contents",
        firstDiagnosticValidAlternatives: "path, content, truncated, kind",
        firstDiagnosticProducerOutputContract: "read-source (file_read result): path, content, truncated, kind",
        diagnostics: [
          expect.objectContaining({
            code: "ir.unknown_output_path",
            nodeId: "final-output",
            sourceNodeId: "read-source",
            invalidOutputPath: "contents",
            validAlternatives: "path, content, truncated, kind",
            producerOutputContract: "read-source (file_read result): path, content, truncated, kind",
            validatorId: "workflow.program.static",
          }),
        ],
      }),
    });
  });

  it("rejects ambiguous collection.map literal strings when an item field reference is required", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Ambiguous Map",
          goal: "Map source records before detail reads.",
          nodes: [
            { id: "list-records", kind: "tool.call", tool: "browser_search", args: { query: "example", maxResults: 2 } },
            {
              id: "records",
              kind: "collection.map",
              items: { fromNode: "list-records", path: "results" },
              itemName: "record",
              map: { id: "id", title: "title" },
              maxItems: 2,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "ir.collection_map_literal_string_ambiguous", nodeId: "records" }),
      ]),
    });
  });

  it("rejects redundant approval gates after staged mutations", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Redundant Stage Approval",
          goal: "Stage a report write and avoid double approval.",
          nodes: [
            {
              id: "stage-write",
              kind: "mutation.stage",
              tool: "file_write",
              args: { path: "reports/example.md", content: "# Example" },
              changeSet: { path: "reports/example.md", summary: "Write report." },
            },
            {
              id: "approve-write",
              kind: "approval.required",
              dependsOn: ["stage-write"],
              changeSet: { fromNode: "stage-write", path: "path" },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.redundant_stage_approval", nodeId: "approve-write" })],
    });
  });

  it("normalizes raw workspace file writes into staged mutations before code generation", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Raw File Write",
        goal: "Write a workspace report without staging.",
        nodes: [
          {
            id: "write-report",
            kind: "tool.call",
            tool: "file_write",
            args: { path: "reports/raw.md", content: "# Raw write" },
          },
        ],
      },
    });

    expect(result.program.nodes[0]).toMatchObject({
      id: "write-report",
      kind: "mutation.stage",
      tool: "file_write",
    });
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["mutation:write-report", "tool:file_write"]),
    );
  });

  it("rejects object output references when a tool argument requires a primitive path", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Primitive Reference",
          goal: "Write the entire file_read object instead of its content.",
          nodes: [
            { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
            {
              id: "write-report",
              kind: "tool.call",
              tool: "file_write",
              dependsOn: ["read-source"],
              args: { path: "reports/notes.md", content: { fromNode: "read-source" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.reference_path_required", nodeId: "write-report" })],
    });
  });

  it("dry-run rejects resolved tool arguments that violate descriptor input schemas", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Tool Args",
          goal: "Write non-string content.",
          nodes: [
            {
              id: "write-report",
              kind: "tool.call",
              tool: "file_write",
              args: { path: "reports/bad.md", content: { literal: { nested: true } } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "tool.args_schema_invalid", nodeId: "write-report" })],
    });
  });

  it("produces stable generated source for the same IR", async () => {
    const program = {
      version: 1,
      title: "Stable",
      goal: "Create stable generated source.",
      nodes: [
        { id: "one", kind: "transform.template", template: "one" },
        { id: "two", kind: "output.final", dependsOn: ["one"], value: { fromNode: "one", path: "value" } },
      ],
    };
    const left = await compileWorkflowProgramIr({ toolDescriptors: firstPartyDesktopToolDescriptors(), program });
    const right = await compileWorkflowProgramIr({ toolDescriptors: firstPartyDesktopToolDescriptors(), program });

    expect(left.output.source).toBe(right.output.source);
    expect(left.output.graph).toEqual(right.output.graph);
    expect(JSON.stringify(left.loweredPlan, null, 2)).toBe(JSON.stringify(right.loweredPlan, null, 2));
  });

  it("normalizes common planner aliases before strict IR validation", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        name: "Alias Plan",
        objective: "Use planner aliases.",
        nodes: [
          { nodeId: "search", type: "tool_call", toolName: "browser_search", input: { query: "alias", maxResults: 1 } },
          {
            nodeId: "reason",
            type: "ambient_call",
            dependencies: ["search"],
            label: "Reason",
            input: { results: { fromNode: "search" } },
            outputSchema: { summary: "string" },
          },
          { nodeId: "done", type: "output", dependencies: ["reason"], output: { fromNode: "reason" } },
        ],
      },
    });

    expect(result.program).toMatchObject({
      version: 1,
      title: "Alias Plan",
      goal: "Use planner aliases.",
    });
    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses"]));
  });
});
