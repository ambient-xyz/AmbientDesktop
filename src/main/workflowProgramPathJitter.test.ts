import { describe, expect, it } from "vitest";
import type { WorkflowProgramIR, WorkflowProgramValue } from "../shared/workflowProgramIr";
import { firstPartyDesktopToolDescriptors } from "./desktopToolRegistry";
import { googleWorkspaceConnectorDescriptors } from "./googleWorkspaceConnectors";
import { compileWorkflowProgramIr, WorkflowProgramCompileError } from "./workflowProgramCompiler";
import type { WorkflowCompilerRecipeId } from "./workflowCompilerRecipes";

const CASES_PER_RECIPE = 125;

type WorkflowPathJitterFixture = {
  recipeId: WorkflowCompilerRecipeId;
  program: WorkflowProgramIR;
};

type WorkflowPathReferenceLocation = {
  consumerNodeId: string;
  sourceNodeId: string;
  validPath: string;
  containerPath: Array<string | number>;
};

describe("workflowProgramPathJitter", () => {
  it("keeps recipe fixtures valid before mutation", async () => {
    for (const fixture of workflowPathJitterFixtures()) {
      await expect(
        compileWorkflowProgramIr({
          toolDescriptors: firstPartyDesktopToolDescriptors(),
          connectorDescriptors: googleWorkspaceConnectorDescriptors(googleWorkspaceStates()),
          program: fixture.program,
        }),
      ).resolves.toMatchObject({
        program: expect.objectContaining({ title: fixture.program.title }),
      });
    }
  });

  it("turns 1,000 recipe path mutations into actionable unknown-path diagnostics", async () => {
    const failures: string[] = [];
    const results: Array<{ recipeId: WorkflowCompilerRecipeId; sourceNodeId: string; validPath: string; invalidPath: string }> = [];

    for (const fixture of workflowPathJitterFixtures()) {
      const references = workflowProgramPathReferences(fixture.program);
      if (!references.length) failures.push(`${fixture.recipeId}: fixture has no mutable {fromNode,path} references`);

      for (let index = 0; index < CASES_PER_RECIPE; index += 1) {
        const reference = references[index % references.length];
        const invalidPath = `invalid_${fixture.recipeId}_${index}_${reference.validPath.replace(/[^a-z0-9]+/gi, "_")}`;
        const mutated = mutateWorkflowProgramPath(fixture.program, reference, invalidPath);
        try {
          await compileWorkflowProgramIr({
            toolDescriptors: firstPartyDesktopToolDescriptors(),
            connectorDescriptors: googleWorkspaceConnectorDescriptors(googleWorkspaceStates()),
            program: mutated,
          });
          failures.push(`${fixture.recipeId} mutation ${index}: compiler accepted ${reference.sourceNodeId}.${invalidPath}`);
        } catch (error) {
          if (!(error instanceof WorkflowProgramCompileError)) {
            failures.push(`${fixture.recipeId} mutation ${index}: compiler threw non-WorkflowProgramCompileError ${String(error)}`);
            continue;
          }
          const report = error.failureReport;
          const summary = report?.diagnostics.find(
            (diagnostic) =>
              diagnostic.code === "ir.unknown_output_path" &&
              diagnostic.sourceNodeId === reference.sourceNodeId &&
              diagnostic.invalidOutputPath === invalidPath &&
              diagnostic.nodeId === reference.consumerNodeId,
          );
          if (!summary) {
            failures.push(`${fixture.recipeId} mutation ${index}: missing summary for ${reference.consumerNodeId} -> ${reference.sourceNodeId}.${invalidPath}`);
            continue;
          }
          if (!summary.validAlternatives?.trim()) failures.push(`${fixture.recipeId} mutation ${index}: missing valid alternatives`);
          if (!summary.validatorId) failures.push(`${fixture.recipeId} mutation ${index}: missing validator id`);
          results.push({ recipeId: fixture.recipeId, sourceNodeId: reference.sourceNodeId, validPath: reference.validPath, invalidPath });
        }
      }
    }

    expect(failures).toEqual([]);
    expect(results).toHaveLength(workflowPathJitterFixtures().length * CASES_PER_RECIPE);
    expect(new Set(results.map((result) => result.recipeId))).toEqual(new Set(workflowPathJitterFixtures().map((fixture) => fixture.recipeId)));
  });
});

function workflowPathJitterFixtures(): WorkflowPathJitterFixture[] {
  return [
    {
      recipeId: "large_collection_summarization",
      program: {
        version: 1,
        title: "Large Collection Summarization Fixture",
        goal: "Collect public source rows, chunk them, and reduce to a report.",
        nodes: [
          browserSearchPages("search-pages", ["workflow compiler path contracts", "workflow IR output contracts"], 20, 2),
          {
            id: "dedupe-sources",
            kind: "collection.dedupe",
            dependsOn: ["search-pages"],
            items: { fromNode: "search-pages", path: "items" },
            keyPath: "url",
            strategy: "url_canonical",
            maxItems: 20,
          },
          sourceRecordMap("source-records", "dedupe-sources", 20),
          chunkNode("source-chunks", "source-records", 5, 4),
          modelMapNode("extract-chunks", "source-chunks", "chunks", "extract.collection.chunk"),
          modelReduceNode("reduce-report", "extract-chunks", "results", "reduce.collection.report"),
          finalOutput("final-output", "reduce-report", { report: { fromNode: "reduce-report", path: "summary" } }),
        ],
      },
    },
    {
      recipeId: "current_web_research",
      program: {
        version: 1,
        title: "Current Web Research Fixture",
        goal: "Research current public information with source citations.",
        nodes: [
          browserSearchPages("search-pages", ["current workflow compiler reports", "workflow reliability latest"], 20, 2),
          {
            id: "dedupe-sources",
            kind: "collection.dedupe",
            dependsOn: ["search-pages"],
            items: { fromNode: "search-pages", path: "items" },
            keyPath: "url",
            strategy: "url_canonical",
            maxItems: 20,
          },
          sourceRecordMap("source-records", "dedupe-sources", 20),
          chunkNode("source-chunks", "source-records", 10, 2),
          modelMapNode("extract-source-claims", "source-chunks", "chunks", "extract.current.source.claims"),
          modelReduceNode("write-current-brief", "extract-source-claims", "results", "write.current.web.brief"),
          finalOutput("final-output", "write-current-brief", { brief: { fromNode: "write-current-brief", path: "summary" } }),
        ],
      },
    },
    {
      recipeId: "movie_night_current_showtimes",
      program: {
        version: 1,
        title: "Movie Night Current Showtimes Fixture",
        goal: "Collect movie-night sources, ask for preference, and recommend an option.",
        nodes: [
          browserSearchPages("showtime-pages", ["movies tonight Phoenix", "current movie reviews"], 20, 2),
          {
            id: "dedupe-showtimes",
            kind: "collection.dedupe",
            dependsOn: ["showtime-pages"],
            items: { fromNode: "showtime-pages", path: "items" },
            keyPath: "url",
            strategy: "url_canonical",
            maxItems: 20,
          },
          sourceRecordMap("movie-source-records", "dedupe-showtimes", 20),
          chunkNode("movie-source-chunks", "movie-source-records", 10, 2),
          modelMapNode("extract-movie-options", "movie-source-chunks", "chunks", "extract.movie.options"),
          {
            id: "preference-review",
            kind: "review.input",
            dependsOn: ["extract-movie-options"],
            prompt: "Choose movie-night preference profile.",
            choices: [{ id: "balanced", label: "Balanced" }],
            data: { candidateCount: { fromNode: "extract-movie-options", path: "count" } },
          },
          {
            id: "recommend-movie",
            kind: "model.reduce",
            dependsOn: ["extract-movie-options", "preference-review"],
            items: { fromNode: "extract-movie-options", path: "results" },
            task: "recommend.movie.night",
            input: { preference: { fromNode: "preference-review", path: "choiceId" } },
            output: { schema: { summary: "string", sourceUrls: "array", confidence: "number" } },
            maxInputItems: 2,
            strategy: "tree",
            maxFanIn: 2,
          },
          finalOutput("final-output", "recommend-movie", { recommendation: { fromNode: "recommend-movie", path: "summary" } }),
        ],
      },
    },
    {
      recipeId: "metadata_first_personal_data_review",
      program: {
        version: 1,
        title: "Metadata First Personal Data Review Fixture",
        goal: "Categorize Gmail metadata before any detail reads.",
        nodes: [
          {
            id: "gmail-pages",
            kind: "connector.paginate",
            connectorId: "google.gmail",
            operation: "search",
            input: { query: "newer_than:7d", maxResults: 100 },
            maxItems: 200,
            maxPages: 2,
            pageSize: 100,
            dedupeKeyPath: "threadId",
          },
          {
            id: "gmail-metadata",
            kind: "collection.map",
            dependsOn: ["gmail-pages"],
            items: { fromNode: "gmail-pages", path: "items" },
            itemName: "message",
            maxItems: 200,
            map: {
              id: { fromItem: "message", path: "id" },
              threadId: { fromItem: "message", path: "threadId" },
              snippet: { fromItem: "message", path: "snippet" },
            },
          },
          chunkNode("gmail-metadata-chunks", "gmail-metadata", 25, 8),
          modelMapNode("categorize-gmail-chunks", "gmail-metadata-chunks", "chunks", "categorize.gmail.metadata"),
          {
            id: "detail-review",
            kind: "review.input",
            dependsOn: ["categorize-gmail-chunks"],
            prompt: "Choose whether a bounded detail-read follow-up is needed.",
            choices: [{ id: "metadata-only", label: "Metadata only" }],
            data: { categoryCount: { fromNode: "categorize-gmail-chunks", path: "count" } },
          },
          {
            id: "merge-gmail-categories",
            kind: "model.reduce",
            dependsOn: ["categorize-gmail-chunks", "detail-review"],
            items: { fromNode: "categorize-gmail-chunks", path: "results" },
            task: "merge.gmail.metadata.categories",
            input: { detailChoice: { fromNode: "detail-review", path: "choiceId" } },
            output: { schema: { summary: "string", categories: "array" } },
            maxInputItems: 8,
            strategy: "tree",
            maxFanIn: 4,
          },
          finalOutput("final-output", "merge-gmail-categories", { summary: { fromNode: "merge-gmail-categories", path: "summary" } }),
        ],
        budgets: { maxConnectorCalls: 2, maxModelCalls: 11 },
      },
    },
    {
      recipeId: "google_meeting_transcript_action_items",
      program: googleMeetingTranscriptProgram(),
    },
    {
      recipeId: "visual_batch_classification",
      program: {
        version: 1,
        title: "Visual Batch Classification Fixture",
        goal: "Classify a bounded local screenshot batch.",
        nodes: [
          { id: "list-images", kind: "tool.call", tool: "local_directory_list", args: { path: "~/Desktop", maxEntries: 20 } },
          {
            id: "visual-map",
            kind: "loop.map",
            dependsOn: ["list-images"],
            items: { fromNode: "list-images", path: "entries" },
            itemName: "image",
            maxItems: 10,
            maxConcurrency: 3,
            map: { kind: "tool.call", tool: "ambient_visual_analyze", args: { imagePath: { fromItem: "image", path: "path" }, task: "image_description" } },
          },
          {
            id: "classify-visuals",
            kind: "model.call",
            dependsOn: ["visual-map"],
            task: "classify.visual.batch",
            input: { visualEvidence: { fromNode: "visual-map", path: "items" }, skipped: { fromNode: "list-images", path: "skipped" } },
            output: { schema: { summary: "string", groups: "array" } },
          },
          finalOutput("final-output", "classify-visuals", { summary: { fromNode: "classify-visuals", path: "summary" } }),
        ],
      },
    },
    {
      recipeId: "staged_document_export",
      program: {
        version: 1,
        title: "Staged Document Export Fixture",
        goal: "Render a markdown report and stage the file write for approval.",
        nodes: [
          {
            id: "draft-report",
            kind: "model.call",
            task: "draft.report",
            input: { topic: "workflow compiler evidence" },
            output: { schema: { title: "string", markdown: "string" } },
          },
          {
            id: "render-report",
            kind: "document.render",
            dependsOn: ["draft-report"],
            input: { content: { fromNode: "draft-report", path: "markdown" } },
            title: { fromNode: "draft-report", path: "title" },
            format: "markdown",
            path: "reports/workflow-evidence.md",
          },
          {
            id: "stage-report-write",
            kind: "mutation.stage",
            tool: "file_write",
            dependsOn: ["render-report"],
            args: { path: { fromNode: "render-report", path: "artifactPath" }, content: { fromNode: "render-report", path: "content" } },
            changeSet: { path: { fromNode: "render-report", path: "artifactPath" }, summary: "Write rendered report after approval." },
          },
          finalOutput("final-output", "stage-report-write", { stagedPath: { fromNode: "stage-report-write", path: "path" } }),
        ],
        budgets: { maxModelCalls: 1, maxToolCalls: 1 },
      },
    },
    {
      recipeId: "browser_item_recovery",
      program: {
        version: 1,
        title: "Browser Item Recovery Fixture",
        goal: "Read browser sources while preserving per-item recovery metadata.",
        nodes: [
          browserSearchPages("search-pages", ["workflow browser recovery", "browser source retry recovery"], 12, 2),
          sourceRecordMap("source-records", "search-pages", 12),
          {
            id: "read-sources",
            kind: "loop.map",
            dependsOn: ["source-records"],
            items: { fromNode: "source-records", path: "items" },
            itemName: "source",
            maxItems: 6,
            maxConcurrency: 2,
            map: { kind: "tool.call", tool: "browser_content", args: { url: { fromItem: "source", path: "url" } } },
          },
          {
            id: "checkpoint-source-evidence",
            kind: "checkpoint.write",
            dependsOn: ["read-sources"],
            key: "browser-source-evidence",
            value: { sources: { fromNode: "source-records", path: "items" }, reads: { fromNode: "read-sources", path: "items" } },
          },
          modelReduceNode("summarize-recovered-sources", "read-sources", "items", "summarize.recovered.browser.sources"),
          finalOutput("final-output", "summarize-recovered-sources", { summary: { fromNode: "summarize-recovered-sources", path: "summary" } }),
        ],
      },
    },
  ];
}

function googleMeetingTranscriptProgram(): WorkflowProgramIR {
  return {
    version: 1,
    title: "Google Meeting Transcript Action Items Fixture",
    goal: "Find bounded Google meeting transcripts and extract action items.",
    nodes: [
      {
        id: "calendar-event-pages",
        kind: "connector.paginate",
        connectorId: "google.calendar",
        operation: "listEvents",
        input: {
          calendarId: "primary",
          timeMin: "2026-05-02T00:00:00-07:00",
          timeMax: "2026-05-16T23:59:59-07:00",
          timeZone: "America/Phoenix",
          maxResults: 50,
          singleEvents: true,
          orderBy: "startTime",
        },
        pageSize: 50,
        maxItems: 100,
        maxPages: 2,
        dedupeKeyPath: "id",
      },
      {
        id: "drive-transcript-pages",
        kind: "connector.paginate",
        connectorId: "google.drive",
        operation: "search",
        input: {
          query: "mimeType = 'application/vnd.google-apps.document' and trashed = false and name contains 'transcript'",
          pageSize: 50,
          fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
        },
        pageSize: 50,
        maxItems: 100,
        maxPages: 2,
        dedupeKeyPath: "id",
      },
      {
        id: "candidate-transcripts",
        kind: "collection.map",
        dependsOn: ["drive-transcript-pages"],
        items: { fromNode: "drive-transcript-pages", path: "items" },
        itemName: "file",
        maxItems: 6,
        map: {
          id: { fromItem: "file", path: "id" },
          name: { fromItem: "file", path: "name" },
          mimeType: { fromItem: "file", path: "mimeType" },
          modifiedTime: { fromItem: "file", path: "modifiedTime" },
          webViewLink: { fromItem: "file", path: "webViewLink" },
        },
      },
      {
        id: "read-transcript-files",
        kind: "connector.map",
        dependsOn: ["candidate-transcripts"],
        connectorId: "google.drive",
        operation: "readFile",
        items: { fromNode: "candidate-transcripts", path: "items" },
        itemName: "file",
        input: { fileId: { fromItem: "file", path: "id" }, exportMimeType: "text/plain", maxContentChars: 4000 },
        maxItems: 6,
        maxConcurrency: 3,
      },
      {
        id: "extract-action-evidence",
        kind: "tool.call",
        tool: "long_context_process",
        dependsOn: ["read-transcript-files", "calendar-event-pages"],
        args: {
          taskType: "extraction",
          instruction: "Extract action items, owners, due dates, decisions, unresolved questions, and source provenance.",
          text: { transcriptFiles: { fromNode: "read-transcript-files", path: "items" }, calendarEvents: { fromNode: "calendar-event-pages", path: "items" } },
          maxModelCalls: 8,
          maxOutputChars: 8000,
        },
        output: { schema: { response: "string", inputLength: "number", chunkCount: "number", modelCalls: "number", truncated: "boolean" } },
      },
      {
        id: "shape-action-report",
        kind: "model.call",
        dependsOn: ["extract-action-evidence"],
        task: "shape.google.meeting.transcript.action.report",
        input: {
          extraction: { fromNode: "extract-action-evidence", path: "response" },
          transcriptFileCount: { fromNode: "read-transcript-files", path: "count" },
          calendarEventCount: { fromNode: "calendar-event-pages", path: "count" },
        },
        output: { schema: { summary: "string", actionItems: "array", decisions: "array", unresolvedQuestions: "array" } },
      },
      finalOutput("final-output", "shape-action-report", { summary: { fromNode: "shape-action-report", path: "summary" } }),
    ],
    budgets: { maxConnectorCalls: 10, maxToolCalls: 1, maxModelCalls: 1 },
  };
}

function browserSearchPages(id: string, pageQueries: string[], maxItems: number, maxPages: number): WorkflowProgramIR["nodes"][number] {
  return {
    id,
    kind: "tool.paginate",
    tool: "browser_search",
    input: { maxResults: 10 },
    pageQueries,
    queryInputPath: "query",
    pageSizeInputPath: "maxResults",
    itemsPath: "",
    pageSize: 10,
    maxItems,
    maxPages,
    dedupeKeyPath: "url",
  };
}

function sourceRecordMap(id: string, fromNode: string, maxItems: number): WorkflowProgramIR["nodes"][number] {
  return {
    id,
    kind: "collection.map",
    dependsOn: [fromNode],
    items: { fromNode, path: "items" },
    itemName: "source",
    maxItems,
    map: {
      title: { fromItem: "source", path: "title" },
      url: { fromItem: "source", path: "url" },
      snippet: { fromItem: "source", path: "snippet" },
    },
  };
}

function chunkNode(id: string, fromNode: string, chunkSize: number, maxChunks: number): WorkflowProgramIR["nodes"][number] {
  return {
    id,
    kind: "collection.chunk",
    dependsOn: [fromNode],
    items: { fromNode, path: "items" },
    chunkSize,
    maxChunks,
  };
}

function modelMapNode(id: string, fromNode: string, path: string, task: string): WorkflowProgramIR["nodes"][number] {
  return {
    id,
    kind: "model.map",
    dependsOn: [fromNode],
    items: { fromNode, path },
    itemName: "item",
    task,
    input: { item: { fromItem: "item" } },
    output: { schema: { summary: "string", sourceUrls: "array", confidence: "number" } },
    maxItems: 8,
    maxConcurrency: 2,
  };
}

function modelReduceNode(id: string, fromNode: string, path: string, task: string): WorkflowProgramIR["nodes"][number] {
  return {
    id,
    kind: "model.reduce",
    dependsOn: [fromNode],
    items: { fromNode, path },
    task,
    input: { sourceCount: { fromNode, path: "count" } },
    output: { schema: { summary: "string", sourceUrls: "array", confidence: "number" } },
    maxInputItems: 8,
    strategy: "tree",
    maxFanIn: 4,
  };
}

function finalOutput(id: string, dependsOn: string, value: WorkflowProgramValue): WorkflowProgramIR["nodes"][number] {
  return {
    id,
    kind: "output.final",
    dependsOn: [dependsOn],
    value,
  };
}

function googleWorkspaceStates() {
  return {
    adapter: "gws" as const,
    states: {
      "google.gmail": { status: "available" as const, accounts: [{ id: "default", label: "Default Gmail" }] },
      "google.drive": { status: "available" as const, accounts: [{ id: "default", label: "Default Drive" }] },
      "google.calendar": { status: "available" as const, accounts: [{ id: "default", label: "Default Calendar" }] },
    },
  };
}

function workflowProgramPathReferences(program: WorkflowProgramIR): WorkflowPathReferenceLocation[] {
  const nodeIds = new Set(program.nodes.map((node) => node.id));
  const references: WorkflowPathReferenceLocation[] = [];
  for (let nodeIndex = 0; nodeIndex < program.nodes.length; nodeIndex += 1) {
    const node = program.nodes[nodeIndex];
    visitValue(node, ["nodes", nodeIndex], (value, containerPath) => {
      if (!isProgramReference(value) || !value.path || !nodeIds.has(value.fromNode)) return;
      references.push({
        consumerNodeId: node.id,
        sourceNodeId: value.fromNode,
        validPath: value.path,
        containerPath,
      });
    });
  }
  return references;
}

function mutateWorkflowProgramPath(program: WorkflowProgramIR, reference: WorkflowPathReferenceLocation, invalidPath: string): WorkflowProgramIR {
  const cloned = structuredClone(program);
  const target = valueAtPath(cloned, reference.containerPath);
  if (!isProgramReference(target)) throw new Error(`Mutation target is not a program reference at ${reference.containerPath.join("/")}`);
  target.path = invalidPath;
  return cloned;
}

function visitValue(value: unknown, path: Array<string | number>, onValue: (value: unknown, path: Array<string | number>) => void): void {
  onValue(value, path);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitValue(item, [...path, index], onValue));
    return;
  }
  for (const [key, item] of Object.entries(value)) visitValue(item, [...path, key], onValue);
}

function valueAtPath(root: unknown, path: Array<string | number>): unknown {
  let current = root;
  for (const part of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

function isProgramReference(value: unknown): value is { fromNode: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromNode?: unknown }).fromNode === "string");
}
