import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktopToolRegistry";
import { googleWorkspaceConnectorDescriptors } from "../google-workspace/googleWorkspaceConnectors";
import { compileWorkflowProgramIr } from "../workflow-program/workflowProgramCompiler";
import { lowerWorkflowPlanDslToProgramIr, parseWorkflowPlanDsl, workflowPlanDslPromptSchemaExample, type WorkflowPlanDsl } from "./workflowPlanDsl";

describe("Workflow Plan DSL", () => {
  it("parses a high-level plan and rejects raw WorkflowProgramIR leakage", () => {
    const parsed = parseWorkflowPlanDsl({
      plan: {
        ...workflowPlanDslPromptSchemaExample(),
        stages: [{ id: "raw-node", kind: "model.call", intent: "This is accidentally raw IR.", tool: "browser_search" }],
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "plan_dsl.schema_invalid" }),
      ]),
    );

    const fromHandleLeak = parseWorkflowPlanDsl({
      version: 1,
      title: "Leak",
      goal: "Reject raw handles.",
      stages: [{ id: "collect", kind: "model_interaction", intent: "Summarize.", inputs: { source: { fromHandle: "search.items" } } }],
    });
    expect(fromHandleLeak.success).toBe(false);
    expect(fromHandleLeak.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "plan_dsl.raw_ir_leak" })]));
  });

  it("normalizes known Gmail connector hints without allowing arbitrary raw IR leakage", () => {
    const gmail = parseWorkflowPlanDsl({
      version: 1,
      title: "Gmail categorization",
      goal: "Read Gmail messages and categorize them.",
      stages: [
        {
          id: "gmail",
          kind: "gmail_readonly_categorization",
          intent: "Use the Gmail connector read-only.",
          inputs: { connectorId: "google.gmail", operation: "readThread", maxMessages: 300 },
        },
      ],
    });
    expect(gmail.success).toBe(true);
    if (!gmail.success) return;
    expect(gmail.plan.stages[0]?.inputs).toMatchObject({ operation: "readThread", maxMessages: 300 });
    expect(gmail.plan.stages[0]?.inputs).not.toHaveProperty("connectorId");

    const wrongConnector = parseWorkflowPlanDsl({
      version: 1,
      title: "Wrong connector",
      goal: "Read Gmail messages and categorize them.",
      stages: [{ id: "gmail", kind: "gmail_readonly_categorization", intent: "Use Gmail.", inputs: { connectorId: "google.drive" } }],
    });
    expect(wrongConnector.success).toBe(false);
    expect(wrongConnector.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "plan_dsl.raw_ir_leak" })]));
  });

  it("normalizes live Plan DSL transformation-stage aliases without weakening raw IR rejection", () => {
    const parsed = parseWorkflowPlanDsl({
      version: 1,
      title: "Gmail categorization",
      goal: "Read Gmail messages and categorize them.",
      stages: [
        {
          id: "gmail",
          kind: "gmail_readonly",
          intent: "Use Gmail read-only.",
          inputs: { connectorId: "google.gmail", maxMessages: 300 },
        },
        {
          id: "categorize",
          kind: "chunked_categorization",
          intent: "Compact records, chunk them, categorize each chunk, and reduce final categories.",
        },
        {
          id: "report",
          kind: "report_generation",
          intent: "Return the final categorized report.",
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.plan.stages.map((stage) => stage.kind)).toEqual(["gmail_readonly_categorization", "model_interaction", "model_interaction"]);
    expect(parsed.plan.stages[0]?.inputs).not.toHaveProperty("connectorId");

    const rawIr = parseWorkflowPlanDsl({
      version: 1,
      title: "Raw node",
      goal: "Still reject raw IR.",
      stages: [{ id: "raw", kind: "model.call", intent: "Raw IR must not become a model interaction." }],
    });
    expect(rawIr.success).toBe(false);
  });

  it("normalizes natural mutation policy aliases without weakening the Plan DSL contract", () => {
    const parsed = parseWorkflowPlanDsl({
      version: 1,
      title: "Staged report",
      goal: "Research sources and stage a write for approval.",
      stages: [{ id: "research", kind: "current_web_research", intent: "Collect evidence.", inputs: { pageQueries: ["example domains"] } }],
      riskPolicy: { mutation: "staged_local_file_write_requires_approval", requiresApproval: true },
      outputContract: { format: "markdown_file", fields: ["markdown"] },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.plan.riskPolicy?.mutation).toBe("stage_writes");
    expect(parsed.plan.outputContract?.format).toBe("markdown");
  });

  it("normalizes report-style output format aliases from live Plan DSL responses", () => {
    const parsed = parseWorkflowPlanDsl({
      version: 1,
      title: "Gmail report",
      goal: "Summarize Gmail metadata.",
      stages: [{ id: "metadata-gmail", kind: "gmail_metadata_only", intent: "Use Gmail search metadata only." }],
      outputContract: { format: "summary_dashboard", fields: ["summary", "categories"] },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.plan.outputContract?.format).toBe("text");
    expect(parsed.plan.stages[0]?.kind).toBe("gmail_metadata_review");
  });

  it("lowers model_interaction into deterministic review, model, and final output nodes", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Vocabulary card",
      goal: "Ask for one vocabulary guess, then return a study card.",
      stages: [{ id: "study-card", kind: "model_interaction", intent: "Ask the learner and synthesize the final card." }],
      questions: [{ id: "guess", prompt: "Guess the meaning.", choices: [{ id: "guess-a", label: "Guess A" }], allowFreeform: true }],
      outputContract: { format: "html", fields: ["html", "definition", "exampleSentences"] },
      budgetPolicy: { maxModelCalls: 1, maxRunMs: 300000 },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({ plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.selectedKernel).toBe("model_interaction");
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toEqual([
      "ask-user:review.input",
      "synthesize:model.call",
      "final-output:output.final",
    ]);
    expect(lowered.program.nodes[1]).toMatchObject({
      input: {
        userChoice: { fromHandle: "askUser.choiceId" },
        userText: { fromHandle: "askUser.text" },
      },
    });

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors() });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.source).toContain("workflow.askUser");
    expect(compiled.output.source).toContain("ambient.call");
    expect(compiled.output.source).not.toContain("fromHandle");
  });

  it("lowers browser_fixed_sources without model-authored raw dataflow paths", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Source report",
      goal: "Read two exact public URLs and synthesize an HTML report.",
      stages: [
        {
          id: "read-sources",
          kind: "browser_fixed_sources",
          intent: "Read exactly the provided URLs with browser recovery.",
          inputs: { urls: ["https://example.com", "https://www.iana.org/help/example-domains"], maxSources: 2 },
        },
      ],
      questions: [{ id: "tone", prompt: "Choose report tone.", choices: [{ id: "concise", label: "Concise" }] }],
      outputContract: { format: "html", fields: ["html", "summary", "sourceCount"] },
      budgetPolicy: { maxToolCalls: 2, maxModelCalls: 1 },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({ plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.program.nodes.map((node) => node.kind)).toEqual([
      "browser.intervention",
      "browser.intervention",
      "checkpoint.write",
      "review.input",
      "model.call",
      "output.final",
    ]);
    expect(JSON.stringify(lowered.program)).toContain('"fromHandle":"readSource1.text"');
    expect(JSON.stringify(lowered.program)).not.toContain('"fromNode"');

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors() });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest.tools).toContain("browser_nav");
    expect(compiled.output.source).toContain("tools.browser_nav");
  });

  it("lowers current_web_research into bounded search, transform, render, and staged write", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Current source report",
      goal: "Build a current public source report and stage the markdown file.",
      stages: [
        {
          id: "current-web",
          kind: "current_web_research",
          intent: "Use current source evidence before synthesis.",
          inputs: {
            pageSize: 3,
            maxItems: 6,
            maxPages: 2,
            chunkSize: 3,
            outputPath: "Documents/example-domain-current-web-report.md",
            stageWrite: true,
            runDate: "2026-05-18",
            timeZone: "America/Phoenix",
          },
        },
      ],
      riskPolicy: { mutation: "stage_writes", requiresApproval: true },
      outputContract: { format: "file", fields: ["markdown", "citationUrls", "sourceCandidateCount", "uniqueSourceCount"] },
      budgetPolicy: { maxToolCalls: 3, maxModelCalls: 3, maxRunMs: 300000 },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({ plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toEqual([
      "search-sources:tool.paginate",
      "dedupe-sources:collection.dedupe",
      "trim-sources:collection.map",
      "chunk-sources:collection.chunk",
      "extract-source-findings:model.map",
      "synthesize-report:model.reduce",
      "render-report:document.render",
      "stage-write:mutation.stage",
      "final-output:output.final",
    ]);

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors() });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "file_write"]));
    expect(compiled.output.source).toContain("workflow.paginateTool");
    expect(compiled.output.source).toContain("workflow.stageMutation");
  });

  it("recovers explicit staged export slots from the user request when Pi omits them from the plan", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Current source report",
      goal: "Build a current public source report.",
      stages: [
        {
          id: "current-web",
          kind: "current_web_research",
          intent: "Use current source evidence before synthesis.",
          inputs: {
            pageQueries: ["IANA example domains", "reserved test domains"],
            pageSize: 3,
            maxItems: 6,
            maxPages: 2,
          },
        },
      ],
      riskPolicy: { mutation: "read_only" },
      outputContract: { format: "markdown", fields: ["markdown", "sourceCandidateCount"] },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({
      plan,
      userRequest:
        "The two pageQueries must cover IANA example domains and reserved test domains documentation. Render a Markdown report with path Documents/example-domain-current-web-report.md, then stage a file_write mutation for approval.",
    });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toContain("stage-write:mutation.stage");

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors() });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(compiled.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "file_write"]));
    expect(compiled.output.source).toContain("Documents/example-domain-current-web-report.md");
  });

  it("lowers explicit local file classification into bounded reads, review, and final synthesis", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Local notes classifier",
      goal: "Classify three known workspace-local notes and return labeled HTML.",
      stages: [
        {
          id: "classify-notes",
          kind: "local_file_classification",
          intent: "Read the exact local notes, draft categories, ask for feedback, then finalize the HTML.",
          inputs: { paths: ["dogfood-notes/admin.md", "dogfood-notes/family-events.md", "dogfood-notes/learning.md"], maxFiles: 3 },
        },
      ],
      outputContract: { format: "html", fields: ["html", "summary", "categories", "fileCount"] },
      budgetPolicy: { maxToolCalls: 3, maxModelCalls: 2 },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({ plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.selectedKernel).toBe("local_file_classification");
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toEqual([
      "read-file-1:tool.call",
      "read-file-2:tool.call",
      "read-file-3:tool.call",
      "file-evidence:checkpoint.write",
      "draft-classifications:model.call",
      "review-classifications:review.input",
      "final-report:model.call",
      "generated-html:checkpoint.write",
      "final-output:output.final",
    ]);
    expect(JSON.stringify(lowered.program)).toContain('"fromHandle":"readFile1.content"');
    expect(JSON.stringify(lowered.program)).not.toContain('"fromNode"');

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors() });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest.tools).toEqual(expect.arrayContaining(["file_read"]));
    expect(compiled.output.manifest.mutationPolicy).toBe("read_only");
    expect(compiled.output.source).toContain("tools.file_read");
    expect(compiled.output.source).toContain("workflow.askUser");
    expect(compiled.output.source).toContain("workflow.output.ready");
    expect(compiled.output.source).not.toContain("tools.browser_");
    expect(compiled.output.source).not.toContain("tools.file_write");
  });

  it("recovers explicit local file paths from the user request when Pi omits path slots", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Local notes classifier",
      goal: "Classify known local files.",
      stages: [{ id: "classify-notes", kind: "local_file_classification", intent: "Classify the provided workspace notes." }],
      outputContract: { format: "html", fields: ["html", "categories"] },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({
      plan,
      userRequest:
        "Use file_read to read dogfood-notes/admin.md, dogfood-notes/family-events.md, and dogfood-notes/learning.md. Do not use browser or writes.",
    });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    const readPaths = lowered.program.nodes
      .filter((node) => node.kind === "tool.call" && node.tool === "file_read")
      .map((node) => (node.kind === "tool.call" && node.args && typeof node.args === "object" && !Array.isArray(node.args) ? (node.args as { path?: unknown }).path : undefined));
    expect(readPaths).toEqual(["dogfood-notes/admin.md", "dogfood-notes/family-events.md", "dogfood-notes/learning.md"]);
  });

  it("lowers metadata-only local directory classification with skipped metadata coverage", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Downloads metadata classifier",
      goal: "Categorize a local Downloads fixture with metadata only.",
      stages: [
        {
          id: "classify-downloads",
          kind: "local_file_classification",
          intent: "Use local_directory_list once and classify visible entries without reading file contents.",
          inputs: { directory: "/tmp/workflow-dogfood/Downloads", metadataOnly: true, maxEntries: 40, maxDepth: 2 },
        },
      ],
      outputContract: { format: "html", fields: ["html", "summary", "categories", "totalKnownEntries"] },
      budgetPolicy: { maxToolCalls: 1, maxModelCalls: 1 },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({ plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toEqual([
      "list-directory:tool.call",
      "directory-inventory:checkpoint.write",
      "classify-directory:model.call",
      "directory-report:checkpoint.write",
      "final-output:output.final",
    ]);
    expect(JSON.stringify(lowered.program)).toContain('"fromHandle":"listDirectory.skipped"');
    expect(JSON.stringify(lowered.program)).toContain('"skippedMetadata"');

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors() });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list"]));
    expect(compiled.output.manifest.mutationPolicy).toBe("read_only");
    expect(compiled.output.source).toContain("tools.local_directory_list");
    expect(compiled.output.source).toContain("maxEntries");
    expect(compiled.output.source).toContain("maxDepth");
    expect(compiled.output.source).toContain("skippedMetadata");
    expect(compiled.output.source).toContain("readPath(outputs[");
    expect(compiled.output.source).not.toContain("tools.local_file_read");
    expect(compiled.output.source).not.toContain("tools.file_read");
    expect(compiled.output.source).not.toContain("tools.file_write");
  });

  it("lowers visual batch classification into directory list, deterministic filter, bounded visual analysis, and synthesis", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Downloads image classifier",
      goal: "Categorize exactly 10 visible PNG images from the seeded Downloads fixture.",
      stages: [
        {
          id: "classify-images",
          kind: "visual_batch_classification",
          intent: "List the folder once, select visible PNG files, analyze selected images visually, and synthesize categories.",
          inputs: { directory: "/tmp/workflow-dogfood/Downloads", maxEntries: 40, maxDepth: 1, maxImages: 10, imageExtensions: [".png"], namePrefixes: ["image-"] },
        },
      ],
      outputContract: { format: "html", fields: ["html", "summary", "categories", "assignments", "imageCount", "coverage"] },
      budgetPolicy: { maxToolCalls: 11, maxModelCalls: 1 },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({ plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.selectedKernel).toBe("visual_batch_classification");
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toEqual([
      "list-directory:tool.call",
      "select-images:collection.filter",
      "selected-image-evidence:checkpoint.write",
      "analyze-images:loop.map",
      "visual-evidence:checkpoint.write",
      "synthesize-visual-categories:model.call",
      "visual-category-report:checkpoint.write",
      "final-output:output.final",
    ]);
    expect(lowered.program.nodes[1]).toMatchObject({
      kind: "collection.filter",
      maxItems: 10,
      includeExtensions: [".png"],
      includeNamePrefixes: ["image-"],
      excludeNamePrefixes: ["."],
      excludeNameIncludes: ["credential", "secret"],
      requireFile: true,
    });

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors() });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient_visual_analyze"]));
    expect(compiled.output.manifest.maxToolCalls).toBe(11);
    expect(compiled.output.manifest.mutationPolicy).toBe("read_only");
    expect(compiled.output.source).toContain("tools.local_directory_list");
    expect(compiled.output.source).toContain("tools.ambient_visual_analyze");
    expect(compiled.output.source).toContain("image_description");
    expect(compiled.output.source).toContain("allowExternalMediaPaths");
    expect(compiled.output.source).toContain("readPath(outputs[");
    expect(compiled.output.source).toContain("collection.filter node select-images");
    expect(compiled.output.source).not.toContain("tools.local_file_read");
    expect(compiled.output.source).not.toContain("tools.file_read");
    expect(compiled.output.source).not.toContain("tools.file_write");
    expect(compiled.output.source).not.toContain("tools.browser_");
  });

  it("lowers bounded Gmail read-only categorization into connector pagination, detail fan-out, chunking, and reduce", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Gmail categorization",
      goal: "Categorize the latest 300 Gmail messages into up to 7 useful read-only buckets.",
      stages: [
        {
          id: "categorize-gmail",
          kind: "gmail_readonly_categorization",
          intent: "Use Gmail search, bounded readThread metadata, compact thread records, and chunked synthesis.",
          inputs: { accountId: "default", maxMessages: 300, pageSize: 100, maxPages: 3, maxConcurrency: 4, maxCategories: 7 },
        },
      ],
      outputContract: { format: "html", fields: ["html", "summary", "categories", "coverage", "examples", "messageCount", "threadCount", "readOnlyStatement"] },
      budgetPolicy: { maxConnectorCalls: 303, maxModelCalls: 14 },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({ plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.selectedKernel).toBe("gmail_readonly_categorization");
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toEqual([
      "gmail-pages:connector.paginate",
      "read-threads:connector.map",
      "thread-records:collection.map",
      "gmail-coverage:checkpoint.write",
      "thread-chunks:collection.chunk",
      "categorize-chunks:model.map",
      "reduce-categories:model.reduce",
      "gmail-categorization-report:checkpoint.write",
      "final-output:output.final",
    ]);
    expect(lowered.program.nodes[0]).toMatchObject({
      kind: "connector.paginate",
      connectorId: "google.gmail",
      operation: "search",
      input: { query: "", maxResults: 100 },
      pageSize: 100,
      maxItems: 300,
      maxPages: 3,
      dedupeKeyPath: "threadId",
    });
    expect(lowered.program.nodes[1]).toMatchObject({
      kind: "connector.map",
      connectorId: "google.gmail",
      operation: "readThread",
      maxItems: 300,
      maxConcurrency: 4,
    });

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors(), connectorDescriptors });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest).toMatchObject({
      mutationPolicy: "read_only",
      maxConnectorCalls: 303,
      connectors: [expect.objectContaining({ connectorId: "google.gmail", accountId: "default", scopes: ["gmail.readonly"], operations: ["search", "readThread"] })],
    });
    expect(compiled.output.source).toContain("workflow.paginateConnector");
    expect(compiled.output.source).toContain('connectorId: "google.gmail"');
    expect(compiled.output.source).toContain('operation: "search"');
    expect(compiled.output.source).toContain('"maxItems": 300');
    expect(compiled.output.source).toContain('"maxPages": 3');
    expect(compiled.output.source).toContain('"pageSize": 100');
    expect(compiled.output.source).toContain('"dedupeKeyPath": "threadId"');
    expect(compiled.output.source).toContain('operation: "readThread"');
    expect(compiled.output.source).toContain('"maxConcurrency": 4');
    expect(compiled.output.source).toContain("workflow.mapCollection");
    expect(compiled.output.source).toContain("workflow.chunkCollection");
    expect(compiled.output.source).toContain("workflow.mapModel");
    expect(compiled.output.source).toContain("workflow.reduceModel");
    expect(compiled.output.source).not.toContain("tools.file_read");
    expect(compiled.output.source).not.toContain("tools.file_write");
    expect(compiled.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.search")).toHaveLength(3);
    expect(compiled.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.readThread")).toHaveLength(300);
  });

  it("lowers small Gmail metadata-only review without thread detail reads", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");
    const parsed = parseWorkflowPlanDsl({
      version: 1,
      title: "Gmail metadata",
      goal: "Inspect the latest 20 Gmail messages using metadata only and summarize visible themes.",
      stages: [
        {
          id: "metadata-gmail",
          kind: "gmail_metadata_only",
          intent: "Use Gmail search metadata only.",
          inputs: { accountId: "default", maxMessages: 20, pageSize: 20, maxPages: 1, maxCategories: 7 },
        },
      ],
      outputContract: { format: "html", fields: ["html", "summary", "categories", "coverage", "examples", "messageCount", "threadCount", "readOnlyStatement"] },
      budgetPolicy: { maxConnectorCalls: 1, maxModelCalls: 1 },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const lowered = lowerWorkflowPlanDslToProgramIr({ plan: parsed.plan });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.selectedKernel).toBe("gmail_metadata_review");
    expect(lowered.program.nodes.map((node) => `${node.id}:${node.kind}`)).toEqual([
      "gmail-pages:connector.paginate",
      "gmail-metadata:collection.map",
      "gmail-metadata-coverage:checkpoint.write",
      "summarize-metadata:model.call",
      "metadata-report:checkpoint.write",
      "final-output:output.final",
    ]);

    const compiled = await compileWorkflowProgramIr({ program: lowered.program, toolDescriptors: firstPartyDesktopToolDescriptors(), connectorDescriptors });
    expect(compiled.validationReport.status).toBe("passed");
    expect(compiled.output.manifest).toMatchObject({
      mutationPolicy: "read_only",
      maxConnectorCalls: 1,
      connectors: [expect.objectContaining({ connectorId: "google.gmail", accountId: "default", scopes: ["gmail.readonly"], operations: ["search"] })],
    });
    expect(compiled.output.source).toContain("workflow.paginateConnector");
    expect(compiled.output.source).toContain('"maxItems": 20');
    expect(compiled.output.source).toContain('"maxPages": 1');
    expect(compiled.output.source).toContain('"dedupeKeyPath": "threadId"');
    expect(compiled.output.source).toContain("workflow.mapCollection");
    expect(compiled.output.source).toContain("ambient.call");
    expect(compiled.output.source).not.toContain('operation: "readThread"');
    expect(compiled.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.search")).toHaveLength(1);
    expect(compiled.dryRun.calls.filter((call) => call.kind === "connector" && call.name === "google.gmail.readThread")).toHaveLength(0);
  });

  it("recovers local directory bounds from metadata-only user wording", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Downloads metadata classifier",
      goal: "Categorize a local folder using metadata only.",
      stages: [{ id: "classify-downloads", kind: "metadata_first_review", intent: "Use metadata only." }],
      outputContract: { format: "markdown", fields: ["markdown", "summary"] },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({
      plan,
      userRequest:
        "Use local_directory_list exactly once for the folder inventory with maxEntries no more than 40 and maxDepth no more than 2. Categorize the seeded Downloads fixture directory at /tmp/workflow-dogfood/Downloads. Do not read file contents.",
    });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.selectedKernel).toBe("metadata_first_review");
    expect(lowered.program.nodes[0]).toMatchObject({
      kind: "tool.call",
      tool: "local_directory_list",
      args: { path: "/tmp/workflow-dogfood/Downloads", maxEntries: 40, maxDepth: 2 },
    });
  });

  it("recovers visual batch slots from user wording when Pi omits them from stage inputs", async () => {
    const plan: WorkflowPlanDsl = {
      version: 1,
      title: "Downloads image classifier",
      goal: "Categorize local images using visual observations.",
      stages: [{ id: "classify-images", kind: "visual_batch_classification", intent: "Use visual analysis only." }],
      outputContract: { format: "markdown", fields: ["markdown", "summary", "imageCount"] },
    };

    const lowered = lowerWorkflowPlanDslToProgramIr({
      plan,
      userRequest:
        "Categorize exactly 10 visible PNG images from the seeded Downloads fixture directory at /tmp/workflow-dogfood/Downloads. Use local_directory_list with maxEntries no more than 40 and maxDepth no more than 1. Select files whose names start with image-.",
    });

    expect(lowered.success).toBe(true);
    if (!lowered.success) return;
    expect(lowered.program.nodes[0]).toMatchObject({
      kind: "tool.call",
      tool: "local_directory_list",
      args: { path: "/tmp/workflow-dogfood/Downloads", maxEntries: 40, maxDepth: 1 },
    });
    expect(lowered.program.nodes[1]).toMatchObject({
      kind: "collection.filter",
      maxItems: 10,
      includeExtensions: [".png"],
      includeNamePrefixes: ["image-"],
    });
  });
});
