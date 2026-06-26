import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { workflowGraphWithSourceMappings } from "./workflowProgramWorkflowCompilerFacade";
import { compileWorkflowProgramIr, createWorkflowProgramCompileCache } from "./workflowProgramCompiler";

function generatedWorkflowRun(source: string): (input: unknown) => Promise<Record<string, unknown>> {
  const factory = new Function(source.replace(/^export default /, "return "));
  return factory() as (input: unknown) => Promise<Record<string, unknown>>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("compileWorkflowProgramIr", () => {
  it("lowers compiler-owned handles before static validation and code generation", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Handle registry report",
        goal: "Build a tiny report from registry handles.",
        summary: "Checkpointed fixture rows are mapped and rendered through compiler-owned handles.",
        nodes: [
          {
            id: "source",
            kind: "checkpoint.write",
            key: "fixtureRows",
            value: {
              items: [
                { title: "Alpha", status: "ready" },
                { title: "Beta", status: "blocked" },
              ],
            },
          },
          {
            id: "row-summary",
            kind: "collection.map",
            items: { fromHandle: "source.items" },
            itemName: "row",
            map: {
              title: { fromItem: "row", path: "title" },
              status: { fromItem: "row", path: "status" },
            },
            maxItems: 10,
          },
          {
            id: "render-report",
            kind: "document.render",
            input: { content: { fromHandle: "rowSummary.items" } },
            title: "Handle registry report",
            format: "markdown",
            path: "reports/handle-registry.md",
          },
          {
            id: "final-output",
            kind: "output.final",
            value: { artifactPath: { fromHandle: "renderReport.artifactPath" } },
          },
        ],
      },
    });

    expect(result.program.nodes[1]).toMatchObject({
      id: "row-summary",
      dependsOn: ["source"],
      items: { fromNode: "source", path: "items" },
    });
    expect(result.program.nodes[2]).toMatchObject({
      id: "render-report",
      dependsOn: ["row-summary"],
      input: { content: { fromNode: "row-summary", path: "items" } },
    });
    expect(result.program.nodes[3]).toMatchObject({
      id: "final-output",
      dependsOn: ["render-report"],
      value: { artifactPath: { fromNode: "render-report", path: "artifactPath" } },
    });
    expect(result.output.source).not.toContain("fromHandle");
    expect(result.validationReport.status).toBe("passed");
  });

  it("fails closed when a compiler-owned handle cannot be resolved", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad handle",
          goal: "Reject a bad handle.",
          nodes: [
            {
              id: "source",
              kind: "checkpoint.write",
              key: "fixtureRows",
              value: { items: [{ title: "Alpha" }] },
            },
            {
              id: "final-output",
              kind: "output.final",
              value: { missing: { fromHandle: "source.results" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "ir.unknown_handle_reference",
          nodeId: "final-output",
        }),
      ],
    });
  });

  it("compiles deterministic document.render PDF artifacts followed by staged file_write", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "PDF Report Render",
        goal: "Render a deterministic PDF report and stage writing it to the workspace.",
        nodes: [
          {
            id: "draft-report",
            kind: "model.call",
            task: "draft.report",
            input: { instruction: "Return reportTitle:string and markdown:string for a short compiler report." },
            output: { schema: { reportTitle: "string", markdown: "string" } },
          },
          {
            id: "render-pdf",
            kind: "document.render",
            dependsOn: ["draft-report"],
            input: { markdown: { fromNode: "draft-report", path: "markdown" } },
            title: { fromNode: "draft-report", path: "reportTitle" },
            format: "pdf",
            path: "reports/compiler-report.pdf",
          },
          {
            id: "write-pdf",
            kind: "mutation.stage",
            dependsOn: ["render-pdf"],
            tool: "file_write",
            args: { path: { fromNode: "render-pdf", path: "artifactPath" }, content: { fromNode: "render-pdf", path: "content" } },
            changeSet: { path: { fromNode: "render-pdf", path: "artifactPath" }, summary: "Write deterministic rendered PDF report." },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["write-pdf"],
            value: { pdf: { fromNode: "write-pdf" }, render: { fromNode: "render-pdf" } },
          },
        ],
        budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 120000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["ambient.responses", "file_write"]));
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(result.output.source).toContain("workflow.renderDocument");
    expect(result.output.source).toContain('"format": "pdf"');
    expect(result.output.source).toContain("workflow.stageMutation");
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "render-pdf", operationKind: "runtime.document_render", resumeKey: "render-pdf" }),
        expect.objectContaining({ nodeId: "write-pdf", operationKind: "runtime.mutation", toolName: "file_write" }),
      ]),
    );
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["model:draft.report", "document:Render Pdf", "mutation:write-pdf", "tool:file_write"]),
    );
  });

  it("normalizes common planner wrappers and step aliases before schema validation", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        data: {
          workflowPlan: {
            workflowProgramIR: {
              title: "Wrapped Planner Output",
              objective: "Compile a planner response that used workflowSteps instead of nodes.",
              workflowSteps: [
                {
                  id: "diagnose",
                  type: "model",
                  task: "diagnose.fixture",
                  input: { subject: "wrapped planner output" },
                  outputSchema: { diagnosis: "string" },
                },
                {
                  id: "final",
                  type: "output",
                  dependsOn: ["diagnose"],
                  value: { diagnosis: { fromNode: "diagnose", path: "diagnosis" } },
                },
              ],
            },
          },
        },
      },
    });

    expect(result.program).toMatchObject({
      title: "Wrapped Planner Output",
      nodes: [
        expect.objectContaining({ id: "diagnose", kind: "model.call" }),
        expect.objectContaining({ id: "final", kind: "output.final" }),
      ],
    });
    expect(result.output.source).toContain("diagnose.fixture");
  });

  it("generated model-call schemas reject token-artifact field names", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Strict Model Output",
        goal: "Reject malformed model output keys.",
        nodes: [
          {
            id: "brief",
            kind: "model.call",
            task: "calendar.brief",
            input: { instruction: "Return summary:string, eventCount:number, highlights:string[]." },
            output: { schema: { summary: "string", eventCount: "number", highlights: "array" } },
          },
        ],
      },
    });
    const run = generatedWorkflowRun(result.output.source);
    const workflow = {
      resumePoint: async (_key: string, fn: () => Promise<unknown>) => fn(),
      step: async (_label: string, metadataOrFn: unknown, maybeFn?: () => Promise<unknown>) =>
        typeof metadataOrFn === "function" ? metadataOrFn() : maybeFn?.(),
      batch: async () => [],
      checkpoint: async (_key: string, value: unknown) => value,
      askUser: async () => ({}),
      requireApproval: async () => ({}),
      stageMutation: async (_changeSet: unknown, fn: () => Promise<unknown>) => fn(),
      emit: async () => undefined,
    };

    await expect(
      run({
        workflow,
        tools: {},
        connectors: {},
        ambient: {
          call: async (spec: { schema: { parse: (value: unknown) => unknown } }) =>
            spec.schema.parse({ " summary ": "Tokenized key", " event Count ": 1, " high lights ": [] }),
        },
      }),
    ).rejects.toThrow("model output missing required field summary");
  });

  it("compiles checkpoint.write as deterministic output value and optional recoverable resume boundary", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Recoverable Checkpoint",
        goal: "Persist evidence and keep using the checkpoint value downstream.",
        nodes: [
          { id: "build-report", kind: "transform.template", template: "summary: {{topic}}", vars: { topic: "compiler checkpoints" } },
          {
            id: "save-evidence",
            kind: "checkpoint.write",
            dependsOn: ["build-report"],
            key: "scheduledLocalEvidence",
            resumeKey: "scheduledLocalEvidence",
            value: { report: { fromNode: "build-report", path: "value" }, count: 1 },
          },
          {
            id: "save-summary",
            kind: "checkpoint.write",
            dependsOn: ["save-evidence"],
            key: "checkpointSummary",
            value: { summary: { fromNode: "save-evidence", path: "report" } },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["save-summary"], value: { checkpoint: { fromNode: "save-summary" } } },
        ],
      },
    });

    expect(result.output.source).toContain('outputs["save-evidence"] = await workflow.resumePoint("scheduledLocalEvidence"');
    expect(result.output.source).toContain("const save_evidence_value =");
    expect(result.output.source).toContain('await workflow.checkpoint("checkpointSummary", save_summary_value);');
    expect(result.output.source).toContain('outputs["save-summary"] = save_summary_value;');
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "save-evidence", operationKind: "runtime.checkpoint", resumeKey: "scheduledLocalEvidence" }),
        expect.objectContaining({ nodeId: "save-summary", operationKind: "runtime.checkpoint" }),
      ]),
    );
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["step:scheduledLocalEvidence", "checkpoint:checkpointSummary"]),
    );
    expect(result.dryRun.componentOutputs).toMatchObject({
      "save-evidence": { report: "summary: compiler checkpoints", count: 1 },
      "save-summary": { summary: "summary: compiler checkpoints" },
      "final-output": { checkpoint: { summary: "summary: compiler checkpoints" } },
    });
  });

  it("renders transform.template each blocks with item fields", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Template Each",
        goal: "Render repeated records into HTML.",
        nodes: [
          {
            id: "render",
            kind: "transform.template",
            template: "<ul>{{#each classifications}}<li>{{path}}: {{category}} {{@index}}</li>{{/each}}</ul>",
            vars: {
              classifications: [
                { path: "dogfood-notes/admin.md", category: "Administration" },
                { path: "dogfood-notes/learning.md", category: "Education" },
              ],
            },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["render"], value: { html: { fromNode: "render", path: "value" } } },
        ],
      },
    });

    const html = "<ul><li>dogfood-notes/admin.md: Administration 0</li><li>dogfood-notes/learning.md: Education 1</li></ul>";
    expect(result.dryRun.componentOutputs).toMatchObject({
      render: { value: html },
      "final-output": { html },
    });
  });

  it("reuses node-level validation cache across repair-like recompiles and revalidates downstream nodes", async () => {
    const cache = createWorkflowProgramCompileCache();
    const invalidProgram = {
      version: 1,
      title: "Incremental IR Validation",
      goal: "Validate independent branches incrementally.",
      nodes: [
        { id: "search-a", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler A", maxResults: 2 } },
        { id: "search-b", kind: "tool.call", tool: "browserSearch", args: { query: "workflow compiler B", maxResults: 2 } },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["search-a", "search-b"],
          value: { a: { fromNode: "search-a" }, b: { fromNode: "search-b" } },
        },
      ],
    };

    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: invalidProgram,
        incrementalCache: cache,
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ir.unavailable_tool", nodeId: "search-b" })],
    });
    expect(cache.nodeValidations.size).toBe(3);

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        ...invalidProgram,
        nodes: [invalidProgram.nodes[0], { ...invalidProgram.nodes[1], tool: "browser_search" }, invalidProgram.nodes[2]],
      },
      incrementalCache: cache,
    });

    expect(result.metrics.incrementalValidation).toMatchObject({
      nodeCount: 3,
      dependencyLevelCount: 2,
      maxDependencyLevelWidth: 2,
      validationConcurrency: 4,
      validationCacheHits: 1,
      validationCacheMisses: 2,
    });
  });

  it("reuses lowered operations across repair-like recompiles and invalidates dependent operations", async () => {
    const cache = createWorkflowProgramCompileCache();
    const program = {
      version: 1,
      title: "Lowering Cache",
      goal: "Lower independent branches incrementally.",
      nodes: [
        { id: "search-a", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler A", maxResults: 2 } },
        { id: "search-b", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler B", maxResults: 2 } },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["search-a", "search-b"],
          value: { a: { fromNode: "search-a" }, b: { fromNode: "search-b" } },
        },
      ],
    };

    const first = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program,
      incrementalCache: cache,
    });
    expect(first.metrics.lowering).toMatchObject({
      operationCount: 3,
      loweringCacheHits: 0,
      loweringCacheMisses: 3,
      loweringCacheWrites: 3,
    });
    expect(cache.loweredOperations.size).toBe(3);

    const second = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        ...program,
        nodes: [program.nodes[0], { ...program.nodes[1], args: { query: "workflow compiler B updated", maxResults: 2 } }, program.nodes[2]],
      },
      incrementalCache: cache,
    });

    expect(second.metrics.lowering).toMatchObject({
      operationCount: 3,
      loweringCacheHits: 1,
      loweringCacheMisses: 2,
      loweringCacheWrites: 2,
    });
    expect(second.loweredPlan.operations.map((operation) => operation.nodeId)).toEqual(["search-a", "search-b", "final-output"]);
    expect(second.loweredPlan.operations[0].operationHash).toBe(first.loweredPlan.operations[0].operationHash);
    expect(second.loweredPlan.operations[1].operationHash).not.toBe(first.loweredPlan.operations[1].operationHash);
    expect(second.loweredPlan.operations[2].operationHash).not.toBe(first.loweredPlan.operations[2].operationHash);
  });

  it("runs independent safe DAG branches through bounded parallel source groups", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Parallel Reads",
        goal: "Read independent files in parallel and combine them.",
        nodes: [
          { id: "read-a", kind: "tool.call", tool: "file_read", args: { path: "a.md" } },
          { id: "read-b", kind: "tool.call", tool: "file_read", args: { path: "b.md" } },
          { id: "read-c", kind: "tool.call", tool: "file_read", args: { path: "c.md" } },
          { id: "read-d", kind: "tool.call", tool: "file_read", args: { path: "d.md" } },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["read-a", "read-b", "read-c", "read-d"],
            value: {
              a: { fromNode: "read-a", path: "content" },
              b: { fromNode: "read-b", path: "content" },
              c: { fromNode: "read-c", path: "content" },
              d: { fromNode: "read-d", path: "content" },
            },
          },
        ],
      },
    });
    expect(result.output.source).toContain("await Promise.all");

    const run = generatedWorkflowRun(result.output.source);
    const starts: number[] = [];
    const delayMs = 80;
    const startedAt = Date.now();
    const outputs = await run({
      workflow: {
        step: async (_name: string, optionsOrFn: unknown, maybeFn?: () => unknown) => {
          const fn = typeof optionsOrFn === "function" ? (optionsOrFn as () => unknown) : maybeFn;
          return await fn?.();
        },
        resumePoint: async (_name: string, fn: () => unknown) => await fn(),
        checkpoint: async (_name: string, value: unknown) => value,
        emit: async (event: unknown) => event,
      },
      tools: {
        file_read: async (args: { path: string }) => {
          starts.push(Date.now());
          await delay(delayMs);
          return { path: args.path, content: `content:${args.path}`, truncated: false, kind: "file" };
        },
      },
      ambient: {},
      connectors: {},
    });
    const elapsedMs = Date.now() - startedAt;
    const startSpreadMs = Math.max(...starts) - Math.min(...starts);

    expect(starts).toHaveLength(4);
    expect(startSpreadMs).toBeLessThan(delayMs);
    expect(elapsedMs).toBeLessThan(delayMs * 3);
    expect(outputs["final-output"]).toEqual({
      a: "content:a.md",
      b: "content:b.md",
      c: "content:c.md",
      d: "content:d.md",
    });
  });

  it("annotates every generated IR graph node with source mapping metadata", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Mapped Source",
        goal: "Read a file, render a deterministic summary, and emit final output.",
        nodes: [
          { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
          {
            id: "render-summary",
            kind: "transform.template",
            dependsOn: ["read-source"],
            template: "Summary: {{source.content}}",
            vars: { source: { fromNode: "read-source" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["render-summary"],
            value: { summary: { fromNode: "render-summary", path: "value" } },
          },
        ],
      },
    });

    const annotated = workflowGraphWithSourceMappings(result.output.source, result.output.graph!);
    const sourceRangesById = new Map(annotated.nodes.map((node) => [node.id, node.sourceRanges ?? []]));

    expect(annotated.nodes.filter((node) => node.type !== "request").every((node) => (node.sourceRanges ?? []).length > 0)).toBe(true);
    expect(sourceRangesById.get("read-source")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "workflow_step", snippet: expect.stringContaining('nodeId: "read-source"') }),
        expect.objectContaining({ kind: "output_assignment", snippet: expect.stringContaining('outputs["read-source"]') }),
      ]),
    );
    expect(sourceRangesById.get("render-summary")).toEqual([
      expect.objectContaining({ kind: "output_assignment", snippet: expect.stringContaining('outputs["render-summary"]') }),
    ]);
    expect(sourceRangesById.get("final-output")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "output_assignment", snippet: expect.stringContaining('outputs["final-output"]') }),
        expect.objectContaining({ kind: "workflow_checkpoint", snippet: expect.stringContaining('workflow.checkpoint("final-output"') }),
        expect.objectContaining({ kind: "workflow_emit", snippet: expect.stringContaining('graphNodeId: "final-output"') }),
      ]),
    );
  });

  it("compiles explicit mutation.stage nodes with staged mutation policy and source mappings", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Staged Report",
        goal: "Stage a workspace report write.",
        nodes: [
          {
            id: "write-report",
            kind: "mutation.stage",
            tool: "file_write",
            args: { path: "reports/staged.md", content: "ready" },
            changeSet: { path: "reports/staged.md", summary: "Write staged report." },
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

    expect(result.program.nodes[0]).toMatchObject({ kind: "mutation.stage", tool: "file_write" });
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(result.output.graph?.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "write-report", type: "mutation" })]));
    expect(result.output.source).toContain("workflow.stageMutation(write_report_changeSet");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["mutation:write-report", "tool:file_write"]),
    );
  });
});
