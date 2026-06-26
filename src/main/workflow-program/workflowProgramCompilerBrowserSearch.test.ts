import { describe, expect, it } from "vitest";

import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { compileWorkflowProgramIr } from "./workflowProgramCompiler";

describe("compileWorkflowProgramIr browser search plans", () => {
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
});
