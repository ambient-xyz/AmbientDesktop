import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { workflowGraphWithSourceMappings } from "./workflowProgramWorkflowCompilerFacade";
import { compileWorkflowProgramIr, createWorkflowProgramCompileCache, WorkflowProgramCompileError } from "./workflowProgramCompiler";

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

  it("deterministically compiles browser research, Ambient diagnosis, and file output without Pi-authored source", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser QA Report",
        goal: "Search for a public page, diagnose it with Ambient, and write a local report.",
        summary: "Browser evidence is gathered, summarized, and written as a markdown report.",
        successCriteria: ["Browser evidence gathered", "Ambient diagnosis produced", "Report written"],
        nodes: [
          {
            id: "search-web",
            kind: "tool.call",
            tool: "browser_search",
            args: { query: "Ambient workflow compiler QA", maxResults: 3 },
            output: { type: "browserSearchResults" },
          },
          {
            id: "diagnose",
            kind: "model.call",
            dependsOn: ["search-web"],
            task: "diagnose.browser.results",
            input: { evidence: { fromNode: "search-web" } },
            output: { schema: { summary: "string", risks: "array" } },
          },
          {
            id: "report",
            kind: "transform.template",
            dependsOn: ["diagnose"],
            template: "# QA Report\n\n{{diagnosis.summary}}",
            vars: { diagnosis: { fromNode: "diagnose" } },
          },
          {
            id: "write-report",
            kind: "tool.call",
            tool: "file_write",
            dependsOn: ["report"],
            args: { path: "reports/browser-qa.md", content: { fromNode: "report", path: "value" } },
            output: { type: "fileWriteResult" },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["write-report"],
            value: { report: { fromNode: "write-report" } },
          },
        ],
        budgets: { maxToolCalls: 3, maxModelCalls: 1, maxRunMs: 120000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses", "file_write"]));
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(result.output.source).toContain("outputContract");
    expect(result.output.source).toContain("validateModelOutput");
    expect(result.output.source).toContain("tools.browser_search");
    expect(result.output.source).toContain("workflow.resumePoint");
    expect(result.output.source).toContain("workflow.stageMutation");
    expect(result.output.source).toContain("tools.file_write");
    expect(result.output.source).toContain("workflow.output.ready");
    expect(result.loweredPlan).toMatchObject({
      schemaVersion: 1,
      operations: [
        expect.objectContaining({ nodeId: "search-web", operationKind: "runtime.tool", toolName: "browser_search" }),
        expect.objectContaining({ nodeId: "diagnose", operationKind: "runtime.model", modelTask: "diagnose.browser.results" }),
        expect.objectContaining({ nodeId: "report", operationKind: "runtime.template" }),
        expect.objectContaining({ nodeId: "write-report", operationKind: "runtime.mutation", toolName: "file_write" }),
        expect.objectContaining({ nodeId: "final-output", operationKind: "runtime.output" }),
      ],
    });
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining([
        "tool:browser_search",
        "model:diagnose.browser.results",
        "mutation:write-report",
        "tool:file_write",
        "checkpoint:final-output",
        "emit:workflow.completed",
      ]),
    );
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(expect.arrayContaining(["emit:workflow.output.ready"]));
  });

  it("compiles paginated browser_search fan-out into chunks, tree reduce, and PDF rendering", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser Source Collection Report",
        goal: "Collect 30 public search result records, synthesize them in bounded chunks, and render a PDF report.",
        summary: "browser_search is paginated via explicit query fan-out, then collection and model primitives create a bounded report.",
        successCriteria: ["30 source rows collected", "Sources chunked", "Tree reduction used", "PDF rendered"],
        nodes: [
          {
            id: "search-sources",
            kind: "tool.paginate",
            tool: "browser_search",
            input: { fetchContent: false },
            pageQueries: [
              "Scottsdale real estate market May 2026 sources",
              "Scottsdale housing inventory 2026 reports",
              "Scottsdale Arizona real estate outlook 2026",
            ],
            queryInputPath: "query",
            pageSizeInputPath: "maxResults",
            itemsPath: "",
            pageSize: 10,
            maxItems: 30,
            maxPages: 3,
            dedupeKeyPath: "url",
          },
          {
            id: "dedupe-sources",
            kind: "collection.dedupe",
            dependsOn: ["search-sources"],
            items: { fromNode: "search-sources", path: "items" },
            keyPath: "url",
            strategy: "url_canonical",
            maxItems: 30,
          },
          {
            id: "source-records",
            kind: "collection.map",
            dependsOn: ["dedupe-sources"],
            items: { fromNode: "dedupe-sources", path: "items" },
            itemName: "source",
            map: {
              title: { fromItem: "source", path: "title" },
              url: { fromItem: "source", path: "url" },
              snippet: { fromItem: "source", path: "snippet" },
            },
            maxItems: 30,
          },
          {
            id: "source-chunks",
            kind: "collection.chunk",
            dependsOn: ["source-records"],
            items: { fromNode: "source-records", path: "items" },
            chunkSize: 10,
            maxChunks: 3,
          },
          {
            id: "summarize-chunks",
            kind: "model.map",
            dependsOn: ["source-chunks"],
            items: { fromNode: "source-chunks", path: "chunks" },
            itemName: "chunk",
            task: "summarize.search.chunk",
            input: {
              chunk: { fromItem: "chunk" },
              instruction: "Summarize source credibility, market signal, and citation URLs for this chunk.",
            },
            output: { schema: { summary: "string", sourceUrls: "array", findings: "array" } },
            maxItems: 3,
            maxConcurrency: 3,
          },
          {
            id: "synthesize-report",
            kind: "model.reduce",
            dependsOn: ["summarize-chunks"],
            items: { fromNode: "summarize-chunks", path: "results" },
            task: "synthesize.scottsdale.market.sources",
            input: { instruction: "Merge chunk summaries into a concise Markdown report with source URLs." },
            output: { schema: { title: "string", markdown: "string", sourceCount: "number" } },
            maxInputItems: 3,
            strategy: "tree",
            maxFanIn: 3,
            maxLevels: 2,
          },
          {
            id: "render-report",
            kind: "document.render",
            dependsOn: ["synthesize-report"],
            input: { content: { fromNode: "synthesize-report", path: "markdown" } },
            title: { fromNode: "synthesize-report", path: "title" },
            format: "pdf",
            path: "reports/scottsdale-source-brief.pdf",
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["render-report"],
            value: {
              search: { fromNode: "search-sources" },
              report: { fromNode: "render-report" },
            },
          },
        ],
        budgets: { maxToolCalls: 3, maxModelCalls: 4, maxRunMs: 720000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses"]));
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(result.output.manifest.maxToolCalls).toBe(3);
    expect(result.output.manifest.maxModelCalls).toBe(4);
    expect(result.output.source).toContain("workflow.paginateTool");
    expect(result.output.source).toContain("tools.browser_search");
    expect(result.output.source).toContain('"itemsPath": ""');
    expect(result.output.source).toContain('"pageSizeInputPath": "maxResults"');
    expect(result.output.source).toContain("workflow.dedupeCollection");
    expect(result.output.source).toContain('"strategy": "url_canonical"');
    expect(result.output.source).toContain("workflow.chunkCollection");
    expect(result.output.source).toContain("workflow.mapModel");
    expect(result.output.source).toContain("workflow.reduceModel");
    expect(result.output.source).toContain('"strategy": "tree"');
    expect(result.output.source).toContain("workflow.renderDocument");
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "search-sources", operationKind: "runtime.tool_paginate", toolName: "browser_search" }),
        expect.objectContaining({ nodeId: "dedupe-sources", operationKind: "runtime.collection_dedupe" }),
        expect.objectContaining({
          nodeId: "synthesize-report",
          operationKind: "runtime.model_reduce",
          modelTask: "synthesize.scottsdale.market.sources",
        }),
        expect.objectContaining({ nodeId: "render-report", operationKind: "runtime.document_render" }),
      ]),
    );
    expect(result.dryRun.calls.filter((call) => call.kind === "tool" && call.name === "browser_search")).toHaveLength(3);
    expect(result.dryRun.calls.filter((call) => call.kind === "model")).toHaveLength(4);
    expect(result.dryRun.componentOutputs).toMatchObject({
      "search-sources": { count: 30, pageCount: 3, truncated: true },
      "dedupe-sources": { count: 30, sourceCount: 30, duplicateCount: 0, truncated: false },
      "source-chunks": { count: 3, itemCount: 30 },
      "render-report": { format: "pdf", artifactPath: "reports/scottsdale-source-brief.pdf" },
    });
  });

  it("compiles a 100-source Scottsdale research workflow into a staged PDF write", async () => {
    const searchAngles = [
      "Scottsdale Arizona real estate market 2026 inventory trends sources",
      "Scottsdale housing prices 2026 median sale price reports",
      "Scottsdale luxury real estate market 2026 sources",
      "Scottsdale neighborhoods real estate outlook 2026",
      "Scottsdale migration population growth housing demand 2026",
      "Scottsdale mortgage rates housing affordability Arizona 2026",
      "Scottsdale zoning development pipeline housing supply 2026",
      "Scottsdale short term rental rules real estate impact 2026",
      "Scottsdale schools taxes property values real estate 2026",
      "Scottsdale comparable Phoenix Paradise Valley Tempe real estate 2026",
    ];

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Scottsdale Real Estate Deep Research PDF",
        goal: "Collect 100 public source candidates, synthesize a cited Scottsdale real estate report, render PDF, and stage the file in Documents.",
        summary:
          "A bounded browser_search collection feeds deterministic dedupe, chunked extraction, tree synthesis, PDF rendering, and an explicit staged file write.",
        successCriteria: [
          "100 source candidates collected",
          "Sources deduplicated",
          "Chunked extraction completed",
          "PDF staged for Documents",
        ],
        nodes: [
          {
            id: "search-sources",
            kind: "tool.paginate",
            tool: "browser_search",
            input: { fetchContent: false },
            pageQueries: searchAngles,
            queryInputPath: "query",
            pageSizeInputPath: "maxResults",
            itemsPath: "",
            pageSize: 10,
            maxItems: 100,
            maxPages: 10,
            dedupeKeyPath: "url",
          },
          {
            id: "dedupe-sources",
            kind: "collection.dedupe",
            dependsOn: ["search-sources"],
            items: { fromNode: "search-sources", path: "items" },
            keyPath: "url",
            strategy: "url_canonical",
            maxItems: 100,
          },
          {
            id: "source-records",
            kind: "collection.map",
            dependsOn: ["dedupe-sources"],
            items: { fromNode: "dedupe-sources", path: "items" },
            itemName: "source",
            map: {
              title: { fromItem: "source", path: "title" },
              url: { fromItem: "source", path: "url" },
              snippet: { fromItem: "source", path: "snippet" },
              sourceDate: { fromItem: "source", path: "date" },
              sourceRank: { fromItem: "source", path: "rank" },
            },
            maxItems: 100,
          },
          {
            id: "source-chunks",
            kind: "collection.chunk",
            dependsOn: ["source-records"],
            items: { fromNode: "source-records", path: "items" },
            chunkSize: 10,
            maxChunks: 10,
          },
          {
            id: "extract-source-chunks",
            kind: "model.map",
            dependsOn: ["source-chunks"],
            items: { fromNode: "source-chunks", path: "chunks" },
            itemName: "chunk",
            task: "extract.scottsdale.real.estate.source.chunk",
            input: {
              sources: { fromItem: "chunk", path: "items" },
              instruction:
                "Extract Scottsdale real estate claims, statistics, dates, source quality, and citation URLs from this bounded source chunk.",
            },
            output: {
              schema: {
                chunkId: "string",
                findings: "array",
                citationUrls: "array",
                sourceQualityNotes: "array",
                coverageWarnings: "array",
              },
            },
            maxItems: 10,
            maxConcurrency: 4,
          },
          {
            id: "synthesize-report",
            kind: "model.reduce",
            dependsOn: ["extract-source-chunks"],
            items: { fromNode: "extract-source-chunks", path: "results" },
            task: "synthesize.scottsdale.real.estate.deep.report",
            input: {
              instruction:
                "Merge chunk findings into a Markdown Scottsdale real estate report with citations, dated evidence, confidence notes, and an executive recommendation.",
              sourceCandidateCount: { fromNode: "search-sources", path: "count" },
              uniqueSourceCount: { fromNode: "dedupe-sources", path: "count" },
            },
            output: {
              schema: {
                title: "string",
                markdown: "string",
                citationCount: "number",
                sourceCoverage: "object",
                confidence: "string",
              },
            },
            maxInputItems: 10,
            strategy: "tree",
            maxFanIn: 5,
            maxLevels: 2,
          },
          {
            id: "render-report",
            kind: "document.render",
            dependsOn: ["synthesize-report"],
            input: {
              markdown: { fromNode: "synthesize-report", path: "markdown" },
              sourceCoverage: { fromNode: "synthesize-report", path: "sourceCoverage" },
            },
            title: { fromNode: "synthesize-report", path: "title" },
            format: "pdf",
            path: "Documents/scottsdale-real-estate-research-report.pdf",
          },
          {
            id: "write-report",
            kind: "mutation.stage",
            dependsOn: ["render-report"],
            tool: "file_write",
            args: { path: { fromNode: "render-report", path: "artifactPath" }, content: { fromNode: "render-report", path: "content" } },
            changeSet: {
              path: { fromNode: "render-report", path: "artifactPath" },
              summary: "Write Scottsdale real estate research PDF to Documents.",
            },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["write-report"],
            value: {
              pdfPath: { fromNode: "write-report", path: "path" },
              report: { fromNode: "render-report" },
              sources: { fromNode: "dedupe-sources" },
            },
          },
        ],
        budgets: { maxToolCalls: 11, maxModelCalls: 13, maxRunMs: 1800000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses", "file_write"]));
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(result.output.manifest.maxToolCalls).toBe(11);
    expect(result.output.manifest.maxModelCalls).toBe(13);
    expect(result.output.source).toContain("workflow.paginateTool");
    expect(result.output.source).toContain('"maxItems": 100');
    expect(result.output.source).toContain('"maxPages": 10');
    expect(result.output.source).toContain("workflow.dedupeCollection");
    expect(result.output.source).toContain('"strategy": "url_canonical"');
    expect(result.output.source).toContain("workflow.chunkCollection");
    expect(result.output.source).toContain("workflow.mapModel");
    expect(result.output.source).toContain("workflow.reduceModel");
    expect(result.output.source).toContain('"strategy": "tree"');
    expect(result.output.source).toContain('"maxFanIn": 5');
    expect(result.output.source).toContain("workflow.renderDocument");
    expect(result.output.source).toContain('"format": "pdf"');
    expect(result.output.source).toContain("workflow.stageMutation");
    expect(result.output.source).toContain("tools.file_write");
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "search-sources", operationKind: "runtime.tool_paginate", toolName: "browser_search" }),
        expect.objectContaining({ nodeId: "dedupe-sources", operationKind: "runtime.collection_dedupe" }),
        expect.objectContaining({
          nodeId: "extract-source-chunks",
          operationKind: "runtime.model_map",
          modelTask: "extract.scottsdale.real.estate.source.chunk",
        }),
        expect.objectContaining({
          nodeId: "synthesize-report",
          operationKind: "runtime.model_reduce",
          modelTask: "synthesize.scottsdale.real.estate.deep.report",
        }),
        expect.objectContaining({ nodeId: "render-report", operationKind: "runtime.document_render" }),
        expect.objectContaining({ nodeId: "write-report", operationKind: "runtime.mutation", toolName: "file_write" }),
      ]),
    );
    expect(result.dryRun.calls.filter((call) => call.kind === "tool" && call.name === "browser_search")).toHaveLength(10);
    expect(result.dryRun.calls.filter((call) => call.kind === "model")).toHaveLength(13);
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["document:Render Report", "mutation:write-report", "tool:file_write"]),
    );
    expect(result.dryRun.componentOutputs).toMatchObject({
      "search-sources": { count: 100, pageCount: 10, truncated: true },
      "dedupe-sources": { count: 100, sourceCount: 100, duplicateCount: 0, truncated: false },
      "source-chunks": { count: 10, itemCount: 100 },
      "render-report": { format: "pdf", artifactPath: "Documents/scottsdale-real-estate-research-report.pdf" },
    });
  });

  it("compiles a current-data movie-night recommendation workflow with bounded search and preference review", async () => {
    const pageQueries = [
      "Scottsdale Arizona movie showtimes tonight May 16 2026",
      "Scottsdale currently playing movies reviews May 2026",
      "Scottsdale movie runtimes genres ratings May 2026",
      "Scottsdale movie theaters parking restaurants travel time tonight",
    ];

    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Scottsdale Movie Night Recommendation",
        goal: "Use current web evidence to recommend whether a couple should go out to see a movie tonight in Scottsdale.",
        summary:
          "Current showtimes, reviews, runtimes, genres, and venue friction feed bounded extraction, preference review, and final recommendation.",
        successCriteria: [
          "Current showtime evidence collected",
          "Movie options extracted",
          "Couple preferences reviewed",
          "Go/no-go recommendation produced",
        ],
        nodes: [
          {
            id: "collect-current-movie-sources",
            kind: "tool.paginate",
            tool: "browser_search",
            input: { fetchContent: false },
            pageQueries,
            queryInputPath: "query",
            pageSizeInputPath: "maxResults",
            itemsPath: "",
            pageSize: 10,
            maxItems: 40,
            maxPages: 4,
            dedupeKeyPath: "url",
          },
          {
            id: "dedupe-movie-sources",
            kind: "collection.dedupe",
            dependsOn: ["collect-current-movie-sources"],
            items: { fromNode: "collect-current-movie-sources", path: "items" },
            keyPath: "url",
            strategy: "url_canonical",
            maxItems: 40,
          },
          {
            id: "movie-source-records",
            kind: "collection.map",
            dependsOn: ["dedupe-movie-sources"],
            items: { fromNode: "dedupe-movie-sources", path: "items" },
            itemName: "source",
            map: {
              title: { fromItem: "source", path: "title" },
              url: { fromItem: "source", path: "url" },
              snippet: { fromItem: "source", path: "snippet" },
              sourceDate: { fromItem: "source", path: "date" },
              sourceRank: { fromItem: "source", path: "rank" },
            },
            maxItems: 40,
          },
          {
            id: "movie-source-chunks",
            kind: "collection.chunk",
            dependsOn: ["movie-source-records"],
            items: { fromNode: "movie-source-records", path: "items" },
            chunkSize: 10,
            maxChunks: 4,
          },
          {
            id: "extract-movie-options",
            kind: "model.map",
            dependsOn: ["movie-source-chunks"],
            items: { fromNode: "movie-source-chunks", path: "chunks" },
            itemName: "chunk",
            task: "extract.movie.night.current.options",
            input: {
              runDate: "2026-05-16",
              timeZone: "America/Phoenix",
              location: "Scottsdale, Arizona",
              sources: { fromItem: "chunk", path: "items" },
              instruction:
                "Extract currently playing movie options, showtimes, review/ratings signals, runtime, genre, theater/travel friction, evidence freshness, and citation URLs from this source chunk.",
            },
            output: {
              schema: {
                options: "array",
                sourceUrls: "array",
                freshnessWarnings: "array",
                travelNotes: "array",
              },
            },
            maxItems: 4,
            maxConcurrency: 4,
          },
          {
            id: "preference-review",
            kind: "review.input",
            dependsOn: ["extract-movie-options"],
            prompt: "Choose the couple's movie-night preference profile before final recommendation.",
            choices: [
              { id: "balanced", label: "Balanced date night", description: "Prioritize broad appeal, good reviews, and low friction." },
              { id: "quiet", label: "Quiet and low-friction", description: "Prioritize easy parking, comfortable timing, and low hassle." },
              {
                id: "adventurous",
                label: "Adventurous pick",
                description: "Prioritize novelty, genre interest, and memorable experience.",
              },
            ],
            allowFreeform: true,
            data: {
              runDate: "2026-05-16",
              timeZone: "America/Phoenix",
              location: "Scottsdale, Arizona",
              sourceCount: { fromNode: "dedupe-movie-sources", path: "count" },
            },
          },
          {
            id: "recommend-movie-night",
            kind: "model.reduce",
            dependsOn: ["extract-movie-options", "preference-review"],
            items: { fromNode: "extract-movie-options", path: "results" },
            task: "recommend.movie.night.current",
            input: {
              runDate: "2026-05-16",
              timeZone: "America/Phoenix",
              location: "Scottsdale, Arizona",
              preferences: { fromNode: "preference-review" },
              instruction:
                "Merge current extracted options into a go/no-go recommendation for tonight. Include top alternatives, confidence, tradeoffs, travel friction, evidence freshness, and citation URLs.",
            },
            output: {
              schema: {
                recommendation: "string",
                confidence: "string",
                topOptions: "array",
                reasons: "array",
                tradeoffs: "array",
                alternatives: "array",
                evidenceFreshness: "object",
              },
            },
            maxInputItems: 4,
            strategy: "tree",
            maxFanIn: 4,
            maxLevels: 1,
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["recommend-movie-night"],
            value: {
              recommendation: { fromNode: "recommend-movie-night" },
              preferences: { fromNode: "preference-review" },
              sources: { fromNode: "dedupe-movie-sources" },
            },
          },
        ],
        budgets: { maxToolCalls: 4, maxModelCalls: 5, maxRunMs: 900000 },
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses"]));
    expect(result.output.manifest.tools).not.toContain("file_write");
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(result.output.manifest.maxToolCalls).toBe(4);
    expect(result.output.manifest.maxModelCalls).toBe(5);
    expect(result.output.source).toContain("workflow.paginateTool");
    expect(result.output.source).toContain("tools.browser_search");
    expect(result.output.source).toContain('"itemsPath": ""');
    expect(result.output.source).toContain('"pageSizeInputPath": "maxResults"');
    expect(result.output.source).toContain('"queryInputPath": "query"');
    expect(result.output.source).toContain('"maxItems": 40');
    expect(result.output.source).toContain('"maxPages": 4');
    expect(result.output.source).toContain("workflow.dedupeCollection");
    expect(result.output.source).toContain('"strategy": "url_canonical"');
    expect(result.output.source).toContain("workflow.mapCollection");
    expect(result.output.source).toContain("workflow.chunkCollection");
    expect(result.output.source).toContain("workflow.mapModel");
    expect(result.output.source).toContain("workflow.askUser");
    expect(result.output.source).toContain("workflow.reduceModel");
    expect(result.output.source).toContain('"strategy": "tree"');
    expect(result.output.source).toContain("2026-05-16");
    expect(result.output.source).toContain("America/Phoenix");
    expect(result.loweredPlan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: "collect-current-movie-sources",
          operationKind: "runtime.tool_paginate",
          toolName: "browser_search",
        }),
        expect.objectContaining({ nodeId: "dedupe-movie-sources", operationKind: "runtime.collection_dedupe" }),
        expect.objectContaining({ nodeId: "movie-source-records", operationKind: "runtime.collection_map" }),
        expect.objectContaining({ nodeId: "movie-source-chunks", operationKind: "runtime.collection_chunk" }),
        expect.objectContaining({
          nodeId: "extract-movie-options",
          operationKind: "runtime.model_map",
          modelTask: "extract.movie.night.current.options",
        }),
        expect.objectContaining({ nodeId: "preference-review", operationKind: "runtime.review" }),
        expect.objectContaining({
          nodeId: "recommend-movie-night",
          operationKind: "runtime.model_reduce",
          modelTask: "recommend.movie.night.current",
        }),
      ]),
    );
    expect(result.dryRun.calls.filter((call) => call.kind === "tool" && call.name === "browser_search")).toHaveLength(4);
    expect(result.dryRun.calls.filter((call) => call.kind === "model")).toHaveLength(5);
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["review:preference-review", "checkpoint:final-output", "emit:workflow.completed"]),
    );
    expect(result.dryRun.componentOutputs).toMatchObject({
      "collect-current-movie-sources": { count: 40, pageCount: 4, truncated: true },
      "dedupe-movie-sources": { count: 40, sourceCount: 40, duplicateCount: 0, truncated: false },
      "movie-source-chunks": { count: 4, itemCount: 40 },
      "preference-review": { choiceId: "approve" },
    });
  });

  it("rejects multi-page tool pagination without a token contract or pageQueries", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Bad Browser Pagination",
          goal: "Try to paginate browser_search without query fan-out.",
          nodes: [
            {
              id: "search-sources",
              kind: "tool.paginate",
              tool: "browser_search",
              input: { query: "Scottsdale real estate", fetchContent: false },
              itemsPath: "",
              pageSize: 10,
              maxItems: 20,
              maxPages: 2,
              dedupeKeyPath: "url",
            },
          ],
          budgets: { maxToolCalls: 2 },
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "tool.pagination_page_queries_required", nodeId: "search-sources" })],
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

  it("compiles review.input nodes into traceable workflow.askUser review gates", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser Intervention Review",
        goal: "Open a page and pause for the user if browser intervention is needed.",
        nodes: [
          {
            id: "open-page",
            kind: "tool.call",
            tool: "browser_nav",
            args: { url: "https://example.com", waitForUserAction: false },
            output: { type: "browserPageSummary" },
          },
          {
            id: "browser-review",
            kind: "review.input",
            dependsOn: ["open-page"],
            prompt: "Complete any browser challenge, then choose how to continue.",
            choices: [
              { id: "completed", label: "Completed" },
              { id: "skip", label: "Skip this page" },
            ],
            allowFreeform: true,
            data: { browserIntervention: { fromNode: "open-page" } },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["browser-review"],
            value: { reviewChoice: { fromNode: "browser-review", path: "choiceId" } },
          },
        ],
      },
    });

    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "browser-review", type: "review_gate" })]),
    );
    expect(result.output.source).toContain("workflow.askUser");
    expect(result.output.source).toContain('{ nodeId: "browser-review" }');
    expect(result.output.source).toContain("browserIntervention");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:browser_nav", "review:browser-review"]),
    );
  });

  it("compiles browser.intervention into conditional user handoff and same-session retry code", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser Intervention",
        goal: "Read a browser source while preserving CAPTCHA/MFA user handoff behavior.",
        nodes: [
          {
            id: "browser-intervention",
            kind: "browser.intervention",
            tool: "browser_nav",
            args: { url: "https://example.com/source" },
            source: { title: "Example source", url: "https://example.com/source", snippet: "test source" },
            prompt: "Complete any browser challenge, then continue or skip this source.",
            screenshot: { enabled: true, args: {} },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["browser-intervention"],
            value: {
              skipped: { fromNode: "browser-intervention", path: "skipped" },
              textChars: { fromNode: "browser-intervention", path: "textChars" },
              screenshot: { fromNode: "browser-intervention", path: "screenshot" },
            },
          },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_nav", "browser_screenshot"]));
    expect(result.output.graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-intervention",
          type: "data_source",
          reviewPolicy: expect.stringContaining("Pause only if the browser reports"),
        }),
      ]),
    );
    expect(result.output.source).toContain("isBrowserUserAction");
    expect(result.output.source).toContain("workflow.askUser");
    expect(result.output.source).toContain("userActionId");
    expect(result.output.source).toContain("tools.browser_screenshot");
    expect(result.loweredPlan.operations.find((operation) => operation.nodeId === "browser-intervention")).toMatchObject({
      operationKind: "runtime.browser_intervention",
      toolName: "browser_nav",
    });
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:browser_nav", "tool:browser_screenshot"]),
    );
  });

  it("compiles chained browser.intervention skip guards without calling later browser reads", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Browser Intervention Skip Guard",
        goal: "Avoid later browser reads after the user skips an earlier blocked source.",
        nodes: [
          {
            id: "open-source",
            kind: "browser.intervention",
            tool: "browser_nav",
            args: { url: "https://example.com/source" },
            source: { title: "Example source", url: "https://example.com/source", interventionTitle: "Managed browser verification" },
          },
          {
            id: "read-source",
            kind: "browser.intervention",
            dependsOn: ["open-source"],
            tool: "browser_content",
            args: { url: "https://example.com/source" },
            source: {
              title: "Example source",
              url: "https://example.com/source",
              browserIntervention: { fromNode: "open-source", path: "browserIntervention" },
            },
            skipIf: { fromNode: "open-source", path: "skipped" },
            screenshot: { enabled: true, args: {} },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["read-source"], value: { source: { fromNode: "read-source" } } },
        ],
      },
    });

    expect(result.output.source).toContain('if (readPath(outputs["open-source"], "skipped"))');
    expect(result.output.source).toContain("browser-intervention-prior-skipped");
    expect(result.output.source).toContain("source?.interventionTitle");
    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_nav", "browser_content", "browser_screenshot"]));
  });

  it("rejects nonblocking browser user-action mode without a review handoff", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Missing Browser Review",
          goal: "Open a browser page without waiting for user action and continue automatically.",
          nodes: [
            {
              id: "open-page",
              kind: "tool.call",
              tool: "browser_nav",
              args: { url: "https://example.com", waitForUserAction: false },
            },
            { id: "final-output", kind: "output.final", dependsOn: ["open-page"], value: { page: { fromNode: "open-page" } } },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "browser.intervention_review_required", nodeId: "open-page" })],
    });
  });

  it("compiles browser_login as a first-class intervention without refilling credentials after handoff by default", async () => {
    const result = await compileWorkflowProgramIr({
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      program: {
        version: 1,
        title: "Managed Browser Login",
        goal: "Fill stored credentials, hand off verification to the user, and then inspect the protected page.",
        nodes: [
          { id: "open-login", kind: "tool.call", tool: "browser_nav", args: { url: "https://example.com/login" } },
          {
            id: "login",
            kind: "browser.intervention",
            tool: "browser_login",
            dependsOn: ["open-login"],
            args: { credentialId: "stored-login", expectedOrigin: "https://example.com", submit: true },
            prompt: "Complete MFA, CAPTCHA, passkey, or device confirmation in the managed browser.",
            retry: { maxAttempts: 0 },
            screenshot: { enabled: true, args: {} },
          },
          {
            id: "read-account",
            kind: "browser.intervention",
            dependsOn: ["login"],
            tool: "browser_content",
            args: { url: "https://example.com/account" },
            source: { browserIntervention: { fromNode: "login", path: "browserIntervention" } },
            skipIf: { fromNode: "login", path: "skipped" },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["read-account"], value: { page: { fromNode: "read-account" } } },
        ],
      },
    });

    expect(result.output.manifest.tools).toEqual(
      expect.arrayContaining(["browser_nav", "browser_login", "browser_content", "browser_screenshot"]),
    );
    expect(result.output.source).toContain("tools.browser_login");
    expect(result.output.source).toContain("browser-login-user-action-completed");
    expect(result.output.source).not.toContain("retry Managed Browser Login");
    expect(result.dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:browser_nav", "tool:browser_login", "tool:browser_screenshot", "tool:browser_content"]),
    );
  });

  it("requires browser user-action resumes to depend on a review gate", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Blind Browser Retry",
          goal: "Retry a browser intervention without user confirmation.",
          nodes: [
            {
              id: "open-page",
              kind: "tool.call",
              tool: "browser_nav",
              args: { url: "https://example.com" },
            },
            {
              id: "retry-page",
              kind: "tool.call",
              tool: "browser_nav",
              dependsOn: ["open-page"],
              args: { url: "https://example.com", userActionId: { fromNode: "open-page", path: "userAction.id" } },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "browser.user_action_resume_requires_review", nodeId: "retry-page" })],
    });
  });

  it("requires browser_login to hand off MFA and verification state to review.input", async () => {
    await expect(
      compileWorkflowProgramIr({
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        program: {
          version: 1,
          title: "Blind Browser Login",
          goal: "Log in without modeling the human verification handoff.",
          nodes: [
            { id: "open-login", kind: "tool.call", tool: "browser_nav", args: { url: "https://example.com/login" } },
            {
              id: "login",
              kind: "tool.call",
              tool: "browser_login",
              dependsOn: ["open-login"],
              args: { credentialId: "stored-login", expectedOrigin: "https://example.com" },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "browser.login_review_required", nodeId: "login" })],
    });
  });

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
