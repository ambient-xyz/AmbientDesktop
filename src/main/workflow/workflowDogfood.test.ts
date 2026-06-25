import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowGraphDiff } from "../../shared/workflowGraphDiff";
import { compileWorkflowArtifact } from "./workflowWorkflowCompilerServiceFacade";
import { readWorkflowRunDetail, reviewWorkflowArtifact } from "./workflowDashboard";
import { googleWorkspaceConnectorDescriptors } from "./workflowGoogleWorkspaceFacade";
import { workflowPluginCapabilityGrant } from "./workflowPluginCapabilities";
import {
  buildWorkflowDebugRewriteContext,
  buildWorkflowDebugRewritePromptSection,
  createWorkflowDebugRewriteRevision,
  workflowDebugRewriteUserRequest,
} from "./workflowDebugRewrite";
import { buildWorkflowRecoveryPlan } from "./workflowRecovery";
import { runWorkflowArtifact } from "./workflowRunService";
import { workflowGraphEventCards } from "../../renderer/src/workflowAgentGraphUiModel";
import { workflowGraphRecoveryDecisionCard } from "../../renderer/src/workflowRuntimeDecisionUiModel";
import { workflowRuntimeInputCards } from "../../renderer/src/workflowRuntimeInputUiModel";
import { workflowTotalRuntimePauseModel } from "../../renderer/src/workflowRunLimitsUiModel";
import { workflowThreadComposerModel } from "../../renderer/src/workflowThreadComposerUiModel";

import {
  fakeBrowser,
  liveCalendarConnectorOptions,
  liveDriveConnectorOptions,
  latestRunForArtifact,
  eventCountsByType,
  writeLocalDirectoryRunDogfoodArtifact,
  writeLocalImageRunDogfoodArtifact,
  writeRecoveryActionsDogfoodArtifact,
  writeRuntimeComposerDogfoodArtifact,
  writeDebugRewriteDogfoodArtifact,
  scottsdaleWeekendRequest,
  createLocalDownloadsFixture,
  createLocalDownloadsImageFixture,
  fakeMiniCpmVision,
  localDirectoryClassificationCompilerOutput,
  localImageCategorizationCompilerOutput,
  localFileReportCompilerOutput,
  scheduledLocalFileTimeoutRecoveryCompilerOutput,
  browserResearchCompilerOutput,
  browserInterventionRecoveryCompilerOutput,
  managedBrowserInterventionCompilerOutput,
  externalManagedBrowserArxivCompilerOutput,
  artifactReviewClassificationCompilerOutput,
  mutationReviewCompilerOutput,
  pluginMcpSummaryCompilerOutput,
  explorationDrivenCompilerOutput,
  debugRewriteCompilerOutput,
  calendarBriefCompilerOutput,
  driveFileReportCompilerOutput,
  retentionTraceCompilerOutput,
  browserQaCompilerOutput,
  scottsdaleActivitiesCompilerOutput,
} from "./workflowDogfoodFixtures";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("Workflow Agent dogfood", () => {
  let workspacePath = "";

  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-dogfood-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    await writeFile(
      join(workspacePath, "qa-fixture.html"),
      [
        "<!doctype html>",
        "<html>",
        "  <head><title>Dogfood QA Fixture</title></head>",
        "  <body>",
        "    <main>",
        "      <h1>Dogfood QA Fixture</h1>",
        '      <button aria-label="Run report">Run report</button>',
        "      <p>Status: ready</p>",
        "    </main>",
        "  </body>",
        "</html>",
      ].join("\n"),
      "utf8",
    );
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("compiles and runs a browser QA workflow from a fixed prompt", async () => {
    const targetUrl = `file://${join(workspacePath, "qa-fixture.html")}`;
    const compilerProvider = {
      compileProgramIr: vi.fn(async ({ prompt }: { prompt: string }) => {
        expect(prompt).toContain("browser QA");
        expect(prompt).toContain("browser_nav");
        expect(prompt).toContain("ambient.call");
        return browserQaCompilerOutput(targetUrl);
      }),
    };

    const preview = await compileWorkflowArtifact({
      store,
      userRequest: `Run browser QA for ${targetUrl}, capture visual evidence, and ask Ambient for a structured diagnosis.`,
      workspaceSummary: `Fixture page: ${targetUrl}`,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: compilerProvider,
    });
    const artifact = preview.artifacts[0];
    const browser = fakeBrowser(targetUrl);
    const ambientProvider = {
      call: vi.fn(async ({ task, input }: { task: string; input: unknown }) => ({
        summary: `${task}: fixture looks ready`,
        issues: [],
        evidence: input,
      })),
    };

    const dryRun = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      mode: "dry_run",
      browser,
      ambientProvider,
    });
    const execute = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      browser,
      ambientProvider,
    });
    const executeRun = execute.runs[0];
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: unknown; runId?: string }>;
    };
    const report = await readFile(executeRun.reportPath!, "utf8");

    expect(compilerProvider.compileProgramIr).toHaveBeenCalledOnce();
    expect(dryRun.runs[0]).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(executeRun).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(ambientProvider.call).toHaveBeenCalledWith(expect.objectContaining({ task: "dogfood.browser_qa" }));
    expect(state.checkpoints?.browserQa).toMatchObject({ runId: executeRun.id });
    expect(report).toContain("dogfood.browser_qa");
    expect(report).toContain("browser_screenshot");
    await expect(readFile(join(dirname(artifact.sourcePath), "preview.md"), "utf8")).resolves.toContain("local HTML page");
  });

  it("compiles and runs the canonical Scottsdale weekend activities workflow from a fixed prompt", async () => {
    const compilerProvider = {
      compileProgramIr: vi.fn(async ({ prompt }: { prompt: string }) => {
        expect(prompt).toContain("Scottsdale Arizona");
        expect(prompt).toContain("browser_search");
        expect(prompt).toContain("ambient.call");
        return scottsdaleActivitiesCompilerOutput();
      }),
    };

    const preview = await compileWorkflowArtifact({
      store,
      userRequest: scottsdaleWeekendRequest(),
      workspaceSummary: "Canonical live-dogfood prompt for repeatable local validation.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: compilerProvider,
    });
    const artifact = preview.artifacts[0];
    const browser = fakeBrowser("about:blank", [
      {
        title: "Scottsdale ArtWalk",
        url: "https://example.test/artwalk",
        snippet: "Thursday evening gallery walk in Old Town Scottsdale.",
      },
      {
        title: "McDowell Sonoran Preserve hike",
        url: "https://example.test/preserve",
        snippet: "Guided morning hike with desert views.",
      },
    ]);
    const ambientProvider = {
      call: vi.fn(async ({ task, input }: { task: string; input: unknown }) => ({
        summary: `${task}: two suitable weekend options found`,
        picks: ["Scottsdale ArtWalk", "McDowell Sonoran Preserve hike"],
        evidence: input,
      })),
    };

    const execute = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      browser,
      ambientProvider,
    });
    const executeRun = execute.runs[0];
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: unknown; runId?: string }>;
    };
    const report = await readFile(executeRun.reportPath!, "utf8");

    expect(executeRun).toMatchObject({ artifactId: artifact.id, status: "succeeded" });
    expect(browser.search).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("Scottsdale") }));
    expect(ambientProvider.call).toHaveBeenCalledWith(expect.objectContaining({ task: "dogfood.scottsdale_weekend" }));
    expect(store.listWorkflowModelCalls({ runId: executeRun.id })[0]).toMatchObject({
      task: "dogfood.scottsdale_weekend",
      status: "succeeded",
    });
    expect(state.checkpoints?.scottsdaleWeekend).toMatchObject({ runId: executeRun.id });
    expect(report).toContain("dogfood.scottsdale_weekend");
    await expect(readFile(join(dirname(artifact.sourcePath), "preview.md"), "utf8")).resolves.toContain("Scottsdale");
  });

  it("compiles migrated dogfood fixtures through WorkflowProgramIR instead of fixed source artifacts", async () => {
    const pluginToolDescriptor = {
      name: "ambient_fixture_workspace_summary",
      label: "Ambient fixture workspace summary",
      description: "Summarize fixture workspace state through a trusted plugin MCP tool.",
      promptSnippet: "Use ambient_fixture_workspace_summary for trusted fixture workspace summaries.",
      promptGuidelines: [],
      inputSchema: {
        type: "object",
        properties: { includeFiles: { type: "boolean" } },
        additionalProperties: false,
      },
      source: "plugin-mcp" as const,
      sideEffects: "plugin-defined" as const,
      permissionScope: "plugin_tool_execute",
      supportsDryRun: true,
      supportsUndo: false,
      idempotency: "not-supported" as const,
      defaultTimeoutMs: 4_000,
    };
    const baseTools = firstPartyDesktopToolDescriptors();
    const calendarConnectors = googleWorkspaceConnectorDescriptors(liveCalendarConnectorOptions("default")).filter(
      (descriptor) => descriptor.id === "google.calendar",
    );
    const driveConnectors = googleWorkspaceConnectorDescriptors(liveDriveConnectorOptions("default")).filter(
      (descriptor) => descriptor.id === "google.drive",
    );
    const cases = [
      { name: "local file report", program: localFileReportCompilerOutput(["notes/events.md", "notes/constraints.txt"]), tools: baseTools },
      {
        name: "browser research",
        program: browserResearchCompilerOutput("KV cache optimization techniques for long-context LLM inference"),
        tools: baseTools,
      },
      {
        name: "browser intervention",
        program: browserInterventionRecoveryCompilerOutput(
          "best live shows appropriate for children in Scottsdale Arizona in the next week",
        ),
        tools: baseTools,
      },
      {
        name: "managed browser intervention",
        program: managedBrowserInterventionCompilerOutput("https://example.test/scottsdale/family-shows"),
        tools: baseTools,
      },
      {
        name: "external managed browser",
        program: externalManagedBrowserArxivCompilerOutput({
          query: "Find recent papers on the placebo effect from arxiv and create summaries of them",
          sourceUrl: "https://arxiv.org/search/?query=placebo+effect&searchtype=all",
        }),
        tools: baseTools,
      },
      { name: "local Downloads classification", program: localDirectoryClassificationCompilerOutput("~/Downloads"), tools: baseTools },
      { name: "local Downloads image categorization", program: localImageCategorizationCompilerOutput("~/Downloads"), tools: baseTools },
      {
        name: "artifact review",
        program: artifactReviewClassificationCompilerOutput(["classification-review/receipts.csv", "classification-review/notes.md"]),
        tools: baseTools,
      },
      { name: "mutation review", program: mutationReviewCompilerOutput("reports/mutation-review-report.md"), tools: baseTools },
      { name: "retention trace", program: retentionTraceCompilerOutput("debug"), tools: baseTools },
      {
        name: "scheduled local timeout recovery",
        program: scheduledLocalFileTimeoutRecoveryCompilerOutput(["notes/events.md", "notes/constraints.txt"]),
        tools: baseTools,
      },
      {
        name: "plugin MCP summary",
        program: pluginMcpSummaryCompilerOutput({} as ReturnType<typeof workflowPluginCapabilityGrant>),
        tools: [...baseTools, pluginToolDescriptor],
      },
      { name: "exploration driven", program: explorationDrivenCompilerOutput("event_sources.md"), tools: baseTools },
      {
        name: "calendar brief",
        program: calendarBriefCompilerOutput("default"),
        tools: baseTools,
        connectorDescriptors: calendarConnectors,
      },
      {
        name: "drive file report",
        program: driveFileReportCompilerOutput("default"),
        tools: baseTools,
        connectorDescriptors: driveConnectors,
      },
    ];

    for (const testCase of cases) {
      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: `Compile ${testCase.name} through WorkflowProgramIR.`,
        workspaceSummary: `Native migration smoke for ${testCase.name}.`,
        toolDescriptors: testCase.tools,
        connectorDescriptors: testCase.connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: { compileProgramIr: vi.fn(async () => testCase.program) },
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const loweredPlan = await readFile(join(dirname(artifact.sourcePath), "lowered-plan.json"), "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(source).toContain("const outputs = {};");
      expect(source).toContain("workflow.output.ready");
      expect(loweredPlan).toContain('"schemaVersion": 1');
    }
  });

  it("compiles and runs a local directory classification workflow from a fixed prompt", async () => {
    const downloadsFixture = await createLocalDownloadsFixture();
    try {
      const compilerProvider = {
        compileProgramIr: vi.fn(async ({ prompt }: { prompt: string }) => {
          expect(prompt).toContain("Downloads fixture");
          expect(prompt).toContain("local_directory_list");
          expect(prompt).not.toContain("google_workspace_call");
          return localDirectoryClassificationCompilerOutput(downloadsFixture);
        }),
      };
      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: `Please review the documents and folders in my Downloads fixture directory at ${downloadsFixture} and classify them into up to 7 categories. Use local filesystem tools, not Google Drive or shell.`,
        workspaceSummary: `External local Downloads fixture directory: ${downloadsFixture}`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: compilerProvider,
      });
      const artifact = dashboard.artifacts[0];
      const ambientProvider = {
        call: vi.fn(async ({ task }: { task: string; input: unknown }) => ({
          summary: `${task}: classified local Downloads fixture entries`,
          categories: ["Documents", "Finance", "Media", "Projects"],
        })),
      };
      const runDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        ambientProvider,
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const canonicalDownloadsFixture = await realpath(downloadsFixture);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { directory?: string; classification?: { categories?: string[]; summary?: string } } }>;
      };

      await writeLocalDirectoryRunDogfoodArtifact({
        mode: "fixed-provider",
        run: { id: run.id, status: run.status },
        artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId, manifest: artifact.manifest },
        directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list")
          .length,
        modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
        checkpoint: state.checkpoints?.localDirectoryClassification?.value,
      });

      expect(compilerProvider.compileProgramIr).toHaveBeenCalledOnce();
      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient.responses"]));
      expect(artifact.manifest.tools).not.toContain("google_workspace_call");
      expect(run).toMatchObject({ status: "succeeded" });
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length).toBe(1);
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.local_downloads_classification", status: "succeeded" })]),
      );
      expect(state.checkpoints?.localDirectoryClassification?.value?.directory).toBe(canonicalDownloadsFixture);
      expect(state.checkpoints?.localDirectoryClassification?.value?.classification?.categories).toEqual(
        expect.arrayContaining(["Documents", "Finance", "Media", "Projects"]),
      );
    } finally {
      await rm(downloadsFixture, { recursive: true, force: true });
    }
  });

  it("compiles and runs a local Downloads image categorization workflow with MiniCPM visual analysis", async () => {
    const downloadsFixture = await createLocalDownloadsImageFixture();
    try {
      const compilerProvider = {
        compileProgramIr: vi.fn(async ({ prompt }: { prompt: string }) => {
          expect(prompt).toContain("Downloads image fixture");
          expect(prompt).toContain("local_directory_list");
          expect(prompt).toContain("ambient_visual_analyze");
          expect(prompt).not.toContain("google_workspace_call");
          return localImageCategorizationCompilerOutput(downloadsFixture);
        }),
      };
      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          `Please categorize 10 images from my Downloads image fixture directory at ${downloadsFixture}.`,
          "Use local_directory_list for the folder inventory and ambient_visual_analyze for MiniCPM-V image evidence.",
          "Do not use Google Drive, shell, or raw ambient_cli commands.",
        ].join(" "),
        workspaceSummary: `External local Downloads image fixture directory: ${downloadsFixture}`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: compilerProvider,
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const ambientProvider = {
        call: vi.fn(async ({ task }: { task: string; input: unknown }) => ({
          summary: `${task}: categorized fixture images`,
          categories: ["Screenshots", "Receipts", "Travel", "Diagrams"],
          assignments: [{ image: "01-ui-screenshot.png", category: "Screenshots", evidence: "fixture MiniCPM observation" }],
          uncertaintyNotes: [],
        })),
      };
      const vision = fakeMiniCpmVision();
      const runDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        ambientProvider,
        vision,
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { imageCategories?: { categories?: string[] } } }>;
      };

      await writeLocalImageRunDogfoodArtifact({
        mode: "fixed-provider",
        run: { id: run.id, status: run.status },
        artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId, manifest: artifact.manifest },
        directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list")
          .length,
        visualToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze")
          .length,
        modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
        checkpoint: state.checkpoints?.localImageCategorization?.value,
      });

      expect(compilerProvider.compileProgramIr).toHaveBeenCalledOnce();
      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.tools).toEqual(
        expect.arrayContaining(["local_directory_list", "ambient_visual_analyze", "ambient.responses"]),
      );
      expect(artifact.manifest.tools).not.toEqual(expect.arrayContaining(["google_workspace_call", "bash", "ambient_cli"]));
      expect(source).toContain("tools.ambient_visual_analyze");
      expect(run).toMatchObject({ status: "succeeded" });
      expect(vision.analyzeMiniCpm).toHaveBeenCalledTimes(10);
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze")).toHaveLength(
        10,
      );
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.local_downloads_image_categorization", status: "succeeded" })]),
      );
      expect(state.checkpoints?.localImageCategorization?.value?.imageCategories?.categories).toEqual(
        expect.arrayContaining(["Screenshots", "Receipts"]),
      );
    } finally {
      await rm(downloadsFixture, { recursive: true, force: true });
    }
  });

  it("dogfoods runtime input and total-runtime recovery through the workflow-thread composer", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "runtime-composer-dogfood");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  const format = await workflow.askUser(
    "Which report format should this workflow use?",
    { choices: [{ id: "markdown", label: "Markdown" }], allowFreeform: true },
    { nodeId: "choose-format" }
  );
  await workflow.checkpoint("format", format);
  await workflow.emit({ type: "workflow.status_update", message: "Report format captured.", data: { graphNodeId: "choose-format" } });
}
`,
      "utf8",
    );
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Runtime Composer Dogfood",
      initialRequest: "Exercise runtime input and timeout recovery through the workflow-thread composer.",
      projectPath: workspacePath,
      traceMode: "debug",
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Runtime Composer Dogfood",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only", maxRunMs: 120_000 },
      spec: { goal: "Exercise runtime input and timeout recovery through the workflow-thread composer." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Runtime composer graph.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "choose-format", type: "deterministic_step", label: "Choose format" },
        { id: "output", type: "output", label: "Output" },
      ],
      edges: [
        { id: "request-format", source: "request", target: "choose-format", type: "control_flow" },
        { id: "format-output", source: "choose-format", target: "output", type: "data_flow" },
      ],
    });

    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
    const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
    const [inputCard] = workflowRuntimeInputCards(pausedDetail);
    if (!inputCard) throw new Error("Expected runtime input card");
    const inputComposer = workflowThreadComposerModel({ draft: "Use Markdown with section headings", detail: pausedDetail });

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      userInputs: [{ requestId: inputCard.requestId, text: "Use Markdown with section headings" }],
    });
    const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
    const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { requestId?: string; text?: string } }>;
    };

    const timeoutRun = store.startWorkflowRun({ artifactId: artifact.id, status: "paused" });
    store.appendWorkflowRunEvent({
      runId: timeoutRun.id,
      type: "workflow.timeout",
      message: "The workflow reached its optional total runtime limit while progress was still being made.",
      graphNodeId: "choose-format",
      data: {
        reason: "total_runtime_limit",
        recoverable: true,
        idleTimeoutMs: 120_000,
        maxRunMs: 120_000,
        totalRuntimeLimitSource: "override",
      },
    });
    const timeoutDetail = readWorkflowRunDetail(store, timeoutRun.id);
    const totalRuntimePause = workflowTotalRuntimePauseModel(timeoutDetail.run.status, timeoutDetail.events);
    const extendComposer = workflowThreadComposerModel({ draft: "extend 10 min", detail: timeoutDetail });
    const removeCapComposer = workflowThreadComposerModel({ draft: "remove total runtime cap", detail: timeoutDetail });

    await writeRuntimeComposerDogfoodArtifact({
      artifactId: artifact.id,
      workflowThreadId: thread.id,
      graphNodeIds: graph.nodes.map((node) => node.id),
      pausedRun: { id: pausedRun.id, status: pausedRun.status },
      inputCard: {
        requestId: inputCard.requestId,
        graphNodeId: inputCard.graphNodeId,
        allowFreeform: inputCard.allowFreeform,
      },
      inputComposer: {
        mode: inputComposer.mode,
        submitLabel: inputComposer.submitLabel,
        disabled: inputComposer.disabled,
      },
      resumedRun: { id: resumedRun.id, status: resumedRun.status },
      resumedEventCounts: eventCountsByType(resumedDetail.events),
      checkpoint: state.checkpoints?.format?.value,
      totalRuntimePause,
      extendComposer: {
        mode: extendComposer.mode,
        runtimeAction: extendComposer.runtimeAction,
        disabled: extendComposer.disabled,
      },
      removeCapComposer: {
        mode: removeCapComposer.mode,
        runtimeAction: removeCapComposer.runtimeAction,
        disabled: removeCapComposer.disabled,
      },
    });

    expect(pausedRun).toMatchObject({ status: "needs_input" });
    expect(inputCard).toMatchObject({ graphNodeId: "choose-format", allowFreeform: true });
    expect(inputComposer).toMatchObject({
      mode: "run_input",
      disabled: false,
      runtimeInputCard: expect.objectContaining({ requestId: inputCard.requestId }),
    });
    expect(resumedRun).toMatchObject({ status: "succeeded" });
    expect(resumedDetail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.input.required", graphNodeId: "choose-format" }),
        expect.objectContaining({ type: "workflow.input.received", graphNodeId: "choose-format" }),
        expect.objectContaining({ type: "checkpoint.write" }),
        expect.objectContaining({ type: "workflow.status_update", graphNodeId: "choose-format" }),
      ]),
    );
    expect(state.checkpoints?.format?.value).toMatchObject({
      requestId: inputCard.requestId,
      text: "Use Markdown with section headings",
    });
    expect(totalRuntimePause).toMatchObject({ eventId: expect.any(String), totalLimitLabel: "2 min" });
    expect(extendComposer).toMatchObject({ mode: "run_recovery", runtimeAction: "extend_total_runtime", disabled: false });
    expect(removeCapComposer).toMatchObject({ mode: "run_recovery", runtimeAction: "remove_total_runtime_cap", disabled: false });
  });

  it("dogfoods retry and skip workflow recovery actions from graph cards", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "recovery-actions-dogfood");
    await mkdir(artifactRoot, { recursive: true });
    const sourcePath = join(artifactRoot, "main.ts");
    await writeFile(
      sourcePath,
      `
export default async function run({ workflow }) {
  const retryGate = await workflow.resumePoint("retryGate", async () => {
    return workflow.step("retry gate", { nodeId: "retry-gate" }, async () => {
      if (!workflow.recovery || workflow.recovery.action !== "retry_step") {
        throw new Error("intentional retry dogfood failure");
      }
      await workflow.emit({ type: "dogfood.retry.completed", message: workflow.recovery.action, data: { graphNodeId: "retry-gate" } });
      return { status: "retried" };
    });
  });

  const results = [];
  for (const item of [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }]) {
    if (await workflow.skipItem({ nodeId: "process-items", itemKey: item.id })) {
      results.push({ id: item.id, status: "skipped" });
      continue;
    }
    await workflow.step("process " + item.id, { nodeId: "process-items", itemKey: item.id }, async () => {
      if (item.id === "beta") {
        throw new Error("intentional skip dogfood failure");
      }
      results.push({ id: item.id, status: "ok" });
    });
  }

  await workflow.checkpoint("recoveryResults", { retryGate, results });
}
`,
      "utf8",
    );
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Recovery Actions Dogfood",
      initialRequest: "Exercise retry and skip recovery from graph cards.",
      projectPath: workspacePath,
      traceMode: "debug",
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Recovery Actions Dogfood",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only", maxRunMs: 120_000 },
      spec: { goal: "Exercise retry-step and skip-item recovery actions from graph cards." },
      sourcePath,
      statePath: join(artifactRoot, "state.json"),
    });
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Recovery graph with retry and skip paths.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "retry-gate", type: "deterministic_step", label: "Retry gate", retryPolicy: "Retry with same retained input." },
        {
          id: "process-items",
          type: "deterministic_step",
          label: "Process items",
          description: "Process retained items. Skip failed items and continue when an item-level failure is acceptable.",
          retryPolicy: "Retry with same retained input; skip failed items and continue.",
        },
        { id: "output", type: "output", label: "Recovered output" },
      ],
      edges: [
        { id: "request-retry", source: "request", target: "retry-gate", type: "control_flow" },
        { id: "retry-process", source: "retry-gate", target: "process-items", type: "control_flow" },
        { id: "process-output", source: "process-items", target: "output", type: "data_flow" },
      ],
    });

    const firstDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const firstRun = latestRunForArtifact(firstDashboard, artifact.id);
    const firstDetail = readWorkflowRunDetail(store, firstRun.id);
    const firstFailure = firstDetail.events.find((event) => event.type === "step.error" && event.graphNodeId === "retry-gate")!;
    const [retryCard] = workflowGraphEventCards([firstFailure], graph, { checkpoints: firstDetail.checkpoints });
    const retryDecision = workflowGraphRecoveryDecisionCard(retryCard)!;
    const retryComposer = workflowThreadComposerModel({ draft: "retry this step", recoveryDecision: retryDecision });
    const retryPlan = buildWorkflowRecoveryPlan(store, {
      runId: retryCard.runId,
      eventId: retryCard.id,
      action: "retry_step",
      graphNodeId: retryCard.graphNodeId,
    });

    const retryDashboard = await runWorkflowArtifact({
      store,
      artifactId: retryPlan.artifactId,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: retryPlan.resumeFromRunId,
      recovery: retryPlan.recovery,
    });
    const retryRun = latestRunForArtifact(retryDashboard, artifact.id);
    const retryDetail = readWorkflowRunDetail(store, retryRun.id);
    const itemFailure = retryDetail.events.find(
      (event) => event.type === "step.error" && event.graphNodeId === "process-items" && event.itemKey === "beta",
    )!;
    const [skipCard] = workflowGraphEventCards([itemFailure], graph, { checkpoints: retryDetail.checkpoints });
    const skipDecision = workflowGraphRecoveryDecisionCard(skipCard)!;
    const skipComposer = workflowThreadComposerModel({ draft: "skip this item", recoveryDecision: skipDecision });
    const skipPlan = buildWorkflowRecoveryPlan(store, {
      runId: skipCard.runId,
      eventId: skipCard.id,
      action: "skip_item",
      graphNodeId: skipCard.graphNodeId,
      itemKey: skipCard.itemKey,
    });

    const skipDashboard = await runWorkflowArtifact({
      store,
      artifactId: skipPlan.artifactId,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: skipPlan.resumeFromRunId,
      recovery: skipPlan.recovery,
    });
    const skipRun = latestRunForArtifact(skipDashboard, artifact.id);
    const skipDetail = readWorkflowRunDetail(store, skipRun.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { results?: Array<{ id: string; status: string }> } }>;
    };

    await writeRecoveryActionsDogfoodArtifact({
      artifactId: artifact.id,
      workflowThreadId: thread.id,
      graphNodeIds: graph.nodes.map((node) => node.id),
      runs: [
        { id: firstRun.id, status: firstRun.status, error: firstRun.error },
        { id: retryRun.id, status: retryRun.status, error: retryRun.error },
        { id: skipRun.id, status: skipRun.status, error: skipRun.error },
      ],
      retryCard: {
        label: retryCard.retry?.label,
        action: retryCard.retry?.action,
        eligible: retryCard.retry?.eligible,
        recoveryContext: retryCard.recoveryContext,
      },
      retryComposer: {
        mode: retryComposer.mode,
        recoveryAction: retryComposer.recoveryAction,
        disabled: retryComposer.disabled,
      },
      skipCard: {
        label: skipCard.skipItem?.label,
        action: skipCard.skipItem?.action,
        eligible: skipCard.skipItem?.eligible,
        recoveryContext: skipCard.recoveryContext,
        itemKey: skipCard.itemKey,
      },
      skipComposer: {
        mode: skipComposer.mode,
        recoveryAction: skipComposer.recoveryAction,
        disabled: skipComposer.disabled,
      },
      finalEventCounts: eventCountsByType(skipDetail.events),
      checkpoint: state.checkpoints?.recoveryResults?.value,
      knownRemainingGap:
        "Debug rewrite is covered by separate revision flows; this dogfood focuses on executable retry_step and skip_item recovery actions.",
    });

    expect(firstRun).toMatchObject({ status: "failed" });
    expect(retryCard).toMatchObject({
      graphNodeId: "retry-gate",
      retry: expect.objectContaining({ eligible: true, action: "retry_step", label: "Retry step" }),
    });
    expect(retryDecision.actions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "retry_step" })]));
    expect(retryComposer).toMatchObject({ mode: "graph_recovery", recoveryAction: "retry_step", disabled: false });
    expect(retryPlan.recovery).toMatchObject({ action: "retry_step", targetGraphNodeId: "retry-gate" });
    expect(retryRun).toMatchObject({ status: "failed" });
    expect(retryDetail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.recovery.start", graphNodeId: "retry-gate" }),
        expect.objectContaining({ type: "dogfood.retry.completed", graphNodeId: "retry-gate" }),
        expect.objectContaining({ type: "step.error", graphNodeId: "process-items", itemKey: "beta" }),
        expect.objectContaining({ type: "workflow.recovery.failed", graphNodeId: "retry-gate" }),
      ]),
    );
    expect(skipCard).toMatchObject({
      graphNodeId: "process-items",
      itemKey: "beta",
      skipItem: expect.objectContaining({ eligible: true, action: "skip_item", label: "Skip item" }),
      recoveryContext: "Skip targets retained item beta.",
    });
    expect(skipDecision.actions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "skip_item" })]));
    expect(skipComposer).toMatchObject({ mode: "graph_recovery", recoveryAction: "skip_item", disabled: false });
    expect(skipPlan.recovery).toMatchObject({ action: "skip_item", targetGraphNodeId: "process-items", targetItemKey: "beta" });
    expect(skipRun).toMatchObject({ status: "succeeded" });
    expect(skipDetail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.recovery.start", graphNodeId: "process-items" }),
        expect.objectContaining({ type: "checkpoint.resume", message: "retryGate" }),
        expect.objectContaining({ type: "workflow.recovery.skipped_item", graphNodeId: "process-items", itemKey: "beta" }),
        expect.objectContaining({ type: "workflow.recovery.completed", graphNodeId: "process-items" }),
      ]),
    );
    expect(state.checkpoints?.recoveryResults?.value?.results).toEqual([
      { id: "alpha", status: "ok" },
      { id: "beta", status: "skipped" },
      { id: "gamma", status: "ok" },
    ]);
  });

  it("dogfoods debug rewrite revision from a failed graph event", async () => {
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "debug-rewrite-actions-dogfood");
    await mkdir(artifactRoot, { recursive: true });
    const baseSourcePath = join(artifactRoot, "base.ts");
    await writeFile(
      baseSourcePath,
      `
export default async function run({ workflow }) {
  await workflow.step("classify unsafe", { nodeId: "classify" }, async () => {
    throw new Error("schema mismatch");
  });
}
`,
      "utf8",
    );
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Debug Rewrite Dogfood",
      initialRequest: "Repair a workflow after a graph-mapped failure.",
      projectPath: workspacePath,
      traceMode: "debug",
    });
    const baseArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Debug Rewrite Dogfood",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only", maxRunMs: 120_000 },
      spec: { goal: "Repair a workflow after a graph-mapped failure.", summary: "The initial workflow fails during classification." },
      sourcePath: baseSourcePath,
      statePath: join(artifactRoot, "base-state.json"),
    });
    const baseGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Unsafe classifier graph.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        {
          id: "classify",
          type: "deterministic_step",
          label: "Classify",
          retryPolicy: "Ask Ambient to debug when the failure is deterministic.",
        },
        { id: "output", type: "output", label: "Output" },
      ],
      edges: [
        { id: "request-classify", source: "request", target: "classify", type: "control_flow" },
        { id: "classify-output", source: "classify", target: "output", type: "data_flow" },
      ],
    });
    const baseVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: baseArtifact.id,
      graphSnapshotId: baseGraph.id,
      sourcePath: baseArtifact.sourcePath,
      repoPath: artifactRoot,
      status: "approved",
      createdBy: "compiler",
    });

    const failedDashboard = await runWorkflowArtifact({
      store,
      artifactId: baseArtifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const failedRun = latestRunForArtifact(failedDashboard, baseArtifact.id);
    const debugContext = buildWorkflowDebugRewriteContext(store, {
      runId: failedRun.id,
      userNotes: "Repair the deterministic schema mismatch and preserve the classify graph node id.",
    });
    const requestedChange = workflowDebugRewriteUserRequest(debugContext);
    const compilerProvider = {
      compileProgramIr: vi.fn(async ({ prompt }: { prompt: string }) => {
        expect(prompt).toContain("debug rewrite request");
        expect(prompt).toContain("step.error");
        expect(prompt).toContain("classify");
        expect(prompt).toContain("schema mismatch");
        return debugRewriteCompilerOutput();
      }),
    };

    const proposedDashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: requestedChange,
      workspaceSummary: "Native debug rewrite dogfood. The failed graph node should be repaired without changing the workflow goal.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      debugRewriteContext: buildWorkflowDebugRewritePromptSection(debugContext),
      provider: compilerProvider,
    });
    const proposedArtifact = proposedDashboard.artifacts[0];
    const revision = createWorkflowDebugRewriteRevision(store, debugContext, { baseVersionId: baseVersion.id, requestedChange });
    reviewWorkflowArtifact(store, { artifactId: proposedArtifact.id, decision: "approved" });
    const appliedRevision = store.resolveWorkflowRevision({ id: revision.id, decision: "applied" });
    const appliedThread = store.getWorkflowAgentThreadSummary(thread.id);
    const repairedDashboard = await runWorkflowArtifact({
      store,
      artifactId: proposedArtifact.id,
      workspacePath,
      permissionMode: "full-access",
    });
    const repairedRun = latestRunForArtifact(repairedDashboard, proposedArtifact.id);
    const repairedDetail = readWorkflowRunDetail(store, repairedRun.id);
    const state = JSON.parse(await readFile(proposedArtifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: unknown }>;
    };
    const appliedGraphDiff = appliedRevision.graphDiff as WorkflowGraphDiff | undefined;

    await writeDebugRewriteDogfoodArtifact({
      workflowThreadId: thread.id,
      base: {
        artifactId: baseArtifact.id,
        versionId: baseVersion.id,
        runId: failedRun.id,
        status: failedRun.status,
        failedEvent: debugContext.failedEvent,
      },
      proposed: {
        artifactId: proposedArtifact.id,
        status: proposedArtifact.status,
        graphNodeIds: appliedThread.graph?.nodes.map((node) => node.id),
      },
      revision: {
        id: appliedRevision.id,
        status: appliedRevision.status,
        sourceDiffContainsRepair: appliedRevision.sourceDiff?.includes("classify safely") ?? false,
        addedNodes: appliedGraphDiff?.addedNodes.map((node) => node.id) ?? [],
      },
      repairedRun: { id: repairedRun.id, status: repairedRun.status, error: repairedRun.error },
      eventCounts: eventCountsByType(repairedDetail.events),
      checkpoint: state.checkpoints?.classification?.value,
    });

    expect(failedRun).toMatchObject({ status: "failed", error: "schema mismatch" });
    expect(debugContext.failedEvent).toMatchObject({ type: "step.error", graphNodeId: "classify" });
    expect(compilerProvider.compileProgramIr).toHaveBeenCalledOnce();
    expect(proposedArtifact).toMatchObject({ status: "ready_for_preview" });
    expect(revision).toMatchObject({
      status: "proposed",
      baseVersionId: baseVersion.id,
      baseArtifactId: baseArtifact.id,
      sourceDiff: expect.stringContaining("classify safely"),
    });
    expect(appliedRevision).toMatchObject({ id: revision.id, status: "applied" });
    expect(appliedThread.activeArtifactId).toBe(proposedArtifact.id);
    expect(repairedRun).toMatchObject({ status: "succeeded" });
    expect(repairedDetail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "step.start", graphNodeId: "classify" }),
        expect.objectContaining({ type: "checkpoint.write", message: "classification" }),
        expect.objectContaining({ type: "workflow.succeeded" }),
      ]),
    );
    expect(state.checkpoints?.classification?.value).toEqual({ label: "fixed", recovered: true });
  });
});
