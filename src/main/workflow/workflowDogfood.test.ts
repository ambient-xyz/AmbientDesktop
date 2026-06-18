import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktop-tools/desktopToolRegistry";
import { ProjectStore } from "../projectStore/projectStore";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, MiniCpmVisionSetupInput, MiniCpmVisionSetupResult } from "../../shared/localRuntimeTypes";
import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import type { CodexPluginSummary } from "../../shared/pluginTypes";
import type { WorkflowDashboard, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/workflowTypes";
import type { WorkflowGraphDiff } from "../../shared/workflowGraphDiff";
import { AgentRuntime } from "../agent-runtime/agentRuntime";
import { BrowserCredentialStore, type BrowserCredentialSafeStorage } from "../browser/browserCredentialStore";
import { BrowserService } from "../browser/browserService";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { AmbientWorkflowCompilerProvider, compileWorkflowArtifact } from "../workflow-compiler/workflowCompilerService";
import { AmbientWorkflowDiscoveryProvider } from "../workflow-discovery/workflowDiscoveryProvider";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "../ambient/liveAmbientProviderConfig";
import { startWorkflowDiscovery } from "../workflow-discovery/workflowDiscoveryService";
import { readWorkflowRunDetail, resolveWorkflowApproval, reviewWorkflowArtifact } from "./workflowDashboard";
import { GoogleWorkspaceCliAdapter } from "../google-workspace/googleWorkspaceCliAdapter";
import { resolveGoogleWorkspaceLiveDogfoodRuntime } from "../google-workspace/googleWorkspaceLiveDogfood";
import { googleWorkspaceConnectorDescriptors, googleWorkspaceConnectorRegistrations, type GoogleWorkspaceConnectorDescriptorOptions } from "../google-workspace/googleWorkspaceConnectors";
import { googleWorkspaceConnectorGrantTarget, googleWorkspaceGrantConditions } from "../../shared/googleWorkspaceGrantTargets";
import { fixtureWorkflowConnector } from "./workflowConnectors";
import { permissionGrantTargetHash } from "../permissions/permissionGrants";
import { buildPluginMcpToolRegistrations } from "../plugins/pluginMcpSupervisor";
import { workflowPluginCapabilityGrant } from "./workflowPluginCapabilities";
import { runWorkflowThreadExploration, type WorkflowExplorationAction, type WorkflowExplorationProvider } from "./workflowExplorationService";
import { workflowApprovalsFromEvents } from "./workflowApprovals";
import {
  buildWorkflowDebugRewriteContext,
  buildWorkflowDebugRewritePromptSection,
  createWorkflowDebugRewriteRevision,
  workflowDebugRewriteUserRequest,
} from "./workflowDebugRewrite";
import { buildWorkflowRecoveryPlan } from "./workflowRecovery";
import { runWorkflowArtifact } from "./workflowRunService";
import { runDueWorkflowArtifactSchedules, workflowScheduleRunStartedEventData } from "./workflowScheduleDispatch";
import { workflowGraphEventCards, workflowGraphWithRunEvents } from "../../renderer/src/workflowAgentGraphUiModel";
import { workflowGraphNodeReviewModel } from "../../renderer/src/workflowGraphNodeReviewUiModel";
import { workflowExplorationGateModel } from "../../renderer/src/workflowExplorationGateUiModel";
import { workflowExplorationTraceCards } from "../../renderer/src/workflowExplorationUiModel";
import { workflowExplorationPreflightModel } from "../../renderer/src/workflowExplorationPreflightUiModel";
import { workflowPermissionGrantRegistryModel } from "../../renderer/src/permissionGrantRegistryUiModel";
import { workflowGraphRecoveryDecisionCard } from "../../renderer/src/workflowRuntimeDecisionUiModel";
import { workflowRuntimeInputCards } from "../../renderer/src/workflowRuntimeInputUiModel";
import { workflowRunOutputCards } from "../../renderer/src/workflowRunOutputUiModel";
import { workflowReviewWorkspaceModel, workflowScheduleRunHistoryItems } from "../../renderer/src/workflowReviewUiModel";
import { workflowRemoveTotalRunLimitOverrides, workflowTotalRuntimePauseModel } from "../../renderer/src/workflowRunLimitsUiModel";
import { workflowThreadComposerModel } from "../../renderer/src/workflowThreadComposerUiModel";
import { workflowTraceRetentionReviewModel } from "../../renderer/src/workflowTraceRetentionUiModel";
import { workflowThreadTranscriptCards } from "../../renderer/src/workflowThreadTranscriptUiModel";
import type { WorkflowBrowserAdapter } from "./workflowDesktopTools";
import { invokeWorkflowNativeTool } from "./workflowNativeTools";
import { commitWorkflowVersionRepo } from "./workflowVersioning";
import { ensureFirstPartyAmbientCliPackages, searchAmbientCliCapabilities } from "../ambient-cli/ambientCliPackages";

type HarnessTraceArtifactsModule = {
  snapshotHarnessWorkspace: (workspacePath: string) => Promise<unknown>;
  writeHarnessTraceArtifacts: (input: Record<string, unknown>) => Promise<unknown>;
};

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_WORKFLOW_LIVE === "1" ? it : it.skip;
const itLivePlanEdit = process.env.AMBIENT_WORKFLOW_PLAN_EDIT_LIVE === "1" ? it : it.skip;
const itLiveGmailRun = process.env.AMBIENT_WORKFLOW_GMAIL_RUN_LIVE === "1" ? it : it.skip;
const itLiveGoogleWorkspaceRun = process.env.AMBIENT_WORKFLOW_GWS_RUN_LIVE === "1" ? it : it.skip;
const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));
const LIVE_GMAIL_RUN_TIMEOUT_MS = Math.max(
  600_000,
  Number(process.env.AMBIENT_WORKFLOW_GMAIL_RUN_TIMEOUT_MS ?? process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "900000"),
);
const LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS = boundedLiveGoogleProviderRequestTimeoutMs(LIVE_GMAIL_RUN_TIMEOUT_MS);

function boundedLiveGoogleProviderRequestTimeoutMs(testTimeoutMs: number): number {
  const configured = Number(
    process.env.AMBIENT_WORKFLOW_GWS_PROVIDER_REQUEST_TIMEOUT_MS ??
      process.env.AMBIENT_WORKFLOW_GMAIL_PROVIDER_REQUEST_TIMEOUT_MS ??
      process.env.AMBIENT_WORKFLOW_LIVE_PROVIDER_REQUEST_TIMEOUT_MS ??
      "",
  );
  const requested = Number.isFinite(configured) && configured > 0 ? configured : 120_000;
  const maxAllowed = Math.max(30_000, testTimeoutMs - 60_000);
  return Math.max(15_000, Math.min(Math.floor(requested), maxAllowed));
}

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
        "      <button aria-label=\"Run report\">Run report</button>",
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
    const calendarConnectors = googleWorkspaceConnectorDescriptors(liveCalendarConnectorOptions("default")).filter((descriptor) => descriptor.id === "google.calendar");
    const driveConnectors = googleWorkspaceConnectorDescriptors(liveDriveConnectorOptions("default")).filter((descriptor) => descriptor.id === "google.drive");
    const cases = [
      { name: "local file report", program: localFileReportCompilerOutput(["notes/events.md", "notes/constraints.txt"]), tools: baseTools },
      { name: "browser research", program: browserResearchCompilerOutput("KV cache optimization techniques for long-context LLM inference"), tools: baseTools },
      { name: "browser intervention", program: browserInterventionRecoveryCompilerOutput("best live shows appropriate for children in Scottsdale Arizona in the next week"), tools: baseTools },
      { name: "managed browser intervention", program: managedBrowserInterventionCompilerOutput("https://example.test/scottsdale/family-shows"), tools: baseTools },
      { name: "external managed browser", program: externalManagedBrowserArxivCompilerOutput({ query: "Find recent papers on the placebo effect from arxiv and create summaries of them", sourceUrl: "https://arxiv.org/search/?query=placebo+effect&searchtype=all" }), tools: baseTools },
      { name: "local Downloads classification", program: localDirectoryClassificationCompilerOutput("~/Downloads"), tools: baseTools },
      { name: "local Downloads image categorization", program: localImageCategorizationCompilerOutput("~/Downloads"), tools: baseTools },
      { name: "artifact review", program: artifactReviewClassificationCompilerOutput(["classification-review/receipts.csv", "classification-review/notes.md"]), tools: baseTools },
      { name: "mutation review", program: mutationReviewCompilerOutput("reports/mutation-review-report.md"), tools: baseTools },
      { name: "retention trace", program: retentionTraceCompilerOutput("debug"), tools: baseTools },
      { name: "scheduled local timeout recovery", program: scheduledLocalFileTimeoutRecoveryCompilerOutput(["notes/events.md", "notes/constraints.txt"]), tools: baseTools },
      { name: "plugin MCP summary", program: pluginMcpSummaryCompilerOutput({} as ReturnType<typeof workflowPluginCapabilityGrant>), tools: [...baseTools, pluginToolDescriptor] },
      { name: "exploration driven", program: explorationDrivenCompilerOutput("event_sources.md"), tools: baseTools },
      { name: "calendar brief", program: calendarBriefCompilerOutput("default"), tools: baseTools, connectorDescriptors: calendarConnectors },
      { name: "drive file report", program: driveFileReportCompilerOutput("default"), tools: baseTools, connectorDescriptors: driveConnectors },
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
        call: vi.fn(async ({ task, input }: { task: string; input: unknown }) => ({
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
        directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length,
        modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
        checkpoint: state.checkpoints?.localDirectoryClassification?.value,
      });

      expect(compilerProvider.compileProgramIr).toHaveBeenCalledOnce();
      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient.responses"]));
      expect(artifact.manifest.tools).not.toContain("google_workspace_call");
      expect(run).toMatchObject({ status: "succeeded" });
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length).toBe(1);
      expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.local_downloads_classification", status: "succeeded" })]));
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
        call: vi.fn(async ({ task, input }: { task: string; input: unknown }) => ({
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
        directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length,
        visualToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze").length,
        modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
        checkpoint: state.checkpoints?.localImageCategorization?.value,
      });

      expect(compilerProvider.compileProgramIr).toHaveBeenCalledOnce();
      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient_visual_analyze", "ambient.responses"]));
      expect(artifact.manifest.tools).not.toEqual(expect.arrayContaining(["google_workspace_call", "bash", "ambient_cli"]));
      expect(source).toContain("tools.ambient_visual_analyze");
      expect(run).toMatchObject({ status: "succeeded" });
      expect(vision.analyzeMiniCpm).toHaveBeenCalledTimes(10);
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze")).toHaveLength(10);
      expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.local_downloads_image_categorization", status: "succeeded" })]));
      expect(state.checkpoints?.localImageCategorization?.value?.imageCategories?.categories).toEqual(expect.arrayContaining(["Screenshots", "Receipts"]));
    } finally {
      await rm(downloadsFixture, { recursive: true, force: true });
    }
  });

  itLive("compiles a browser QA workflow with live Ambient when explicitly enabled", async () => {
    const apiKey = liveAmbientApiKey();

    const targetUrl = `file://${join(workspacePath, "qa-fixture.html")}`;
    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: `Create a read-only browser QA workflow for ${targetUrl}. Navigate to it, read content, capture a screenshot, ask Ambient for a JSON diagnosis, and checkpoint the evidence.`,
      workspaceSummary: `Local fixture URL: ${targetUrl}`,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });

    expect(dashboard.artifacts[0]).toMatchObject({ status: "ready_for_preview" });
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain("export");
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods graph-first review and approval with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const targetUrl = `file://${join(workspacePath, "qa-fixture.html")}`;
    const beforeWorkspace = await snapshotHarnessWorkspaceIfEnabled(workspacePath);
    let review: unknown;
    try {
      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: [
          `Create a read-only browser QA workflow for ${targetUrl}.`,
          "Navigate to it, read content, capture a screenshot, ask Ambient for a structured JSON diagnosis, checkpoint the evidence, and include graph node ids for source mapping.",
        ].join(" "),
        workspaceSummary: `Graph-first review live dogfood. Local fixture URL: ${targetUrl}`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });

      review = expectGraphFirstReviewWalkthrough(store, dashboard);
      await writeGraphFirstReviewDogfoodArtifact(review);
    } finally {
      await writeWorkflowGraphReviewHarnessTrace(workspacePath, beforeWorkspace, review);
    }
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods debug versus production trace retention with live Ambient runs", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const productionThread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Production retention trace dogfood.",
      traceMode: "production",
    });
    const debugThread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Debug retention trace dogfood.",
      traceMode: "debug",
    });
    const productionDashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: productionThread.id,
      userRequest: "Create a tiny production trace workflow that calls Ambient once and checkpoints the result.",
      workspaceSummary: "Live retention dogfood production trace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => retentionTraceCompilerOutput("production")) },
    });
    const debugDashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: debugThread.id,
      userRequest: "Create a tiny debug trace workflow that calls Ambient once and checkpoints the result.",
      workspaceSummary: "Live retention dogfood debug trace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => retentionTraceCompilerOutput("debug")) },
    });
    const productionArtifact = productionDashboard.artifacts[0];
    const debugArtifact = debugDashboard.artifacts[0];
    const productionRunDashboard = await runWorkflowArtifact({
      store,
      artifactId: productionArtifact.id,
      workspacePath,
      permissionMode: "full-access",
      model,
      baseUrl: liveAmbientBaseUrl(),
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: productionThread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const debugRunDashboard = await runWorkflowArtifact({
      store,
      artifactId: debugArtifact.id,
      workspacePath,
      permissionMode: "full-access",
      model,
      baseUrl: liveAmbientBaseUrl(),
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: debugThread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const productionRun = latestRunForArtifact(productionRunDashboard, productionArtifact.id);
    const debugRun = latestRunForArtifact(debugRunDashboard, debugArtifact.id);
    const productionDetail = readWorkflowRunDetail(store, productionRun.id);
    const debugDetail = readWorkflowRunDetail(store, debugRun.id);
    const productionRetention = workflowTraceRetentionReviewModel({
      traceMode: "production",
      events: productionDetail.events,
      modelCalls: productionDetail.modelCalls,
    });
    const debugRetention = workflowTraceRetentionReviewModel({
      traceMode: "debug",
      events: debugDetail.events,
      modelCalls: debugDetail.modelCalls,
    });

    await writeRetentionTraceDogfoodArtifact({
      production: {
        run: { id: productionRun.id, status: productionRun.status },
        retention: productionRetention,
        events: productionDetail.events.length,
        modelCalls: productionDetail.modelCalls.length,
      },
      debug: {
        run: { id: debugRun.id, status: debugRun.status },
        retention: debugRetention,
        events: debugDetail.events.length,
        modelCalls: debugDetail.modelCalls.length,
      },
    });

    expect(productionRun).toMatchObject({ status: "succeeded" });
    expect(debugRun).toMatchObject({ status: "succeeded" });
    expect(productionRetention).toMatchObject({
      value: "Production trace, Essentials retained",
      tone: "ready",
      compactedPayloadCount: 0,
    });
    expect(debugRetention).toMatchObject({
      value: "Debug trace, 30-day debug cleanup",
      tone: "review",
      compactedPayloadCount: 0,
    });
    expect(productionRetention.retainedEvidenceCount).toBeGreaterThan(0);
    expect(debugRetention.retainedEvidenceCount).toBeGreaterThan(0);
    expect(productionDetail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
    expect(debugDetail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods a local-file report workflow with a live Ambient runtime call", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    await mkdir(join(workspacePath, "local-report"), { recursive: true });
    await writeFile(
      join(workspacePath, "local-report", "events.md"),
      ["# Events", "- Library story time on Tuesday", "- Park picnic on Friday", "- Museum craft table on Sunday"].join("\n"),
      "utf8",
    );
    await writeFile(
      join(workspacePath, "local-report", "notes.txt"),
      ["Constraints:", "Prefer indoor backup options.", "Keep travel under 20 minutes.", "Flag anything needing registration."].join("\n"),
      "utf8",
    );
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Read local event notes and write a concise planning report.",
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a read-only local-file workflow that reads event notes and asks Ambient to summarize them.",
      workspaceSummary: "Local-file live dogfood with two small text files in local-report/.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => localFileReportCompilerOutput(["local-report/events.md", "local-report/notes.txt"])) },
    });
    const artifact = dashboard.artifacts[0];
    const runDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      model,
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const detail = readWorkflowRunDetail(store, run.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { report?: { report?: string; files?: string[] } } }>;
    };

    await writeLocalFileRunDogfoodArtifact({
      run: { id: run.id, status: run.status },
      artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId },
      events: detail.events.length,
      fileReads: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "file_read").length,
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
      checkpoint: state.checkpoints?.localFileReport?.value,
    });

    expect(run).toMatchObject({ status: "succeeded" });
    expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "file_read").length).toBe(2);
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.local_file_report", status: "succeeded" })]));
    expect(state.checkpoints?.localFileReport?.value?.report?.report).toMatch(/story|picnic|museum|registration|travel/i);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods a local Downloads classification workflow with live Ambient compile and run", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const downloadsFixture = await createLocalDownloadsFixture();
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: `Review the local Downloads fixture at ${downloadsFixture} and classify it into up to 7 categories.`,
      traceMode: "debug",
    });
    try {
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: [
          `Please review the documents and folders in my Downloads fixture directory at ${downloadsFixture}.`,
          "Classify them into up to 7 categories.",
          "Use local_directory_list for the folder inventory, do not use Google Drive, do not use shell, and ask Ambient for a JSON classification from the directory metadata.",
        ].join(" "),
        workspaceSummary: `External local Downloads fixture directory: ${downloadsFixture}`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient.responses"]));
      expect(artifact.manifest.tools).not.toContain("google_workspace_call");
      expect(source).toContain("local_directory_list");

      const runDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        model,
        baseUrl: liveAmbientBaseUrl(),
        ambientProvider: new AmbientWorkflowRunProvider({
          model,
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          workflowThreadId: thread.id,
          idleTimeoutMs: 90_000,
          absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          enforceAbsoluteTimeout: true,
        }),
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: unknown }>;
      };

      await writeLocalDirectoryRunDogfoodArtifact({
        mode: "live-provider",
        run: { id: run.id, status: run.status },
        artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId, manifest: artifact.manifest },
        directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length,
        modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
        checkpoint: state.checkpoints?.localDirectoryClassification?.value,
      });

      expect(run).toMatchObject({ status: "succeeded" });
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length).toBeGreaterThanOrEqual(1);
      expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
    } finally {
      await rm(downloadsFixture, { recursive: true, force: true });
    }
  }, Math.max(900_000, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS));

  itLive("dogfoods a local Downloads image categorization workflow with live Ambient compile and run", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const downloadsFixture = await createLocalDownloadsImageFixture();
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: `Categorize 10 images from my Downloads image fixture at ${downloadsFixture}.`,
      traceMode: "debug",
    });
    try {
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: [
          `Please categorize 10 images from my Downloads image fixture directory at ${downloadsFixture}.`,
          "Use local_directory_list to inventory the folder.",
          "Use ambient_visual_analyze for MiniCPM-V visual evidence for exactly 10 image files.",
          "Then ask the selected Ambient Desktop model to categorize the visual evidence.",
          "Do not use Google Drive, shell, raw ambient_cli, or a generic cloud/local LLM choice.",
        ].join(" "),
        workspaceSummary: `External local Downloads image fixture directory: ${downloadsFixture}. It contains exactly 10 PNG files for live workflow compiler dogfood.`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient_visual_analyze", "ambient.responses"]));
      expect(artifact.manifest.tools).not.toEqual(expect.arrayContaining(["google_workspace_call", "bash", "ambient_cli"]));
      expect(source).toContain("ambient_visual_analyze");

      const vision = fakeMiniCpmVision();
      const runDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        model,
        baseUrl: liveAmbientBaseUrl(),
        vision,
        ambientProvider: new AmbientWorkflowRunProvider({
          model,
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          workflowThreadId: thread.id,
          idleTimeoutMs: 90_000,
          absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          enforceAbsoluteTimeout: true,
        }),
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: unknown }>;
      };

      await writeLocalImageRunDogfoodArtifact({
        mode: "live-provider",
        run: { id: run.id, status: run.status },
        artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId, manifest: artifact.manifest },
        directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length,
        visualToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze").length,
        modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
        checkpoint: state.checkpoints?.localImageCategorization?.value,
      });

      expect(run).toMatchObject({ status: "succeeded" });
      expect(vision.analyzeMiniCpm).toHaveBeenCalledTimes(10);
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze")).toHaveLength(10);
      expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
    } finally {
      await rm(downloadsFixture, { recursive: true, force: true });
    }
  }, Math.max(900_000, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS));

  itLive("dogfoods a browser-research workflow with a live Ambient runtime call", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const query = "KV cache optimization techniques for long-context LLM inference";
    const browser = fakeResearchBrowser();
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Research KV cache optimization techniques and cite browser source evidence.",
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a read-only browser research workflow that searches, opens sources, reads page content, and asks Ambient to synthesize a cited report.",
      workspaceSummary: "Browser-research live dogfood with deterministic browser fixtures and live Ambient synthesis.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => browserResearchCompilerOutput(query)) },
    });
    const artifact = dashboard.artifacts[0];
    const runDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      browser,
      model,
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const detail = readWorkflowRunDetail(store, run.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { query?: string; sources?: string[]; report?: { report?: string; sources?: string[] } } }>;
    };
    const browserToolEnds = detail.events.filter((event) => event.type === "desktop-tool.end" && event.message?.startsWith("browser_"));
    const progressEvents = detail.events.filter((event) => event.type === "ambient.call.progress");

    await writeBrowserResearchRunDogfoodArtifact({
      run: { id: run.id, status: run.status, error: run.error },
      artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId },
      eventCounts: eventCountsByType(detail.events),
      browserToolEnds: browserToolEnds.map((event) => ({ message: event.message, graphNodeId: event.graphNodeId })),
      progressEvents: progressEvents.map((event) => ({
        message: event.message,
        outputChars: event.data?.outputChars,
        thinkingChars: event.data?.thinkingChars,
        providerStage: event.data?.providerStage,
      })),
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs, model: call.model })),
      checkpoint: state.checkpoints?.browserResearchReport?.value,
    });

    expect(run).toMatchObject({ status: "succeeded" });
    expect(browser.search).toHaveBeenCalledOnce();
    expect(browser.navigate).toHaveBeenCalledTimes(2);
    expect(browser.content).toHaveBeenCalledTimes(2);
    expect(browserToolEnds).toEqual(expect.arrayContaining([expect.objectContaining({ message: "browser_search" })]));
    expect(browserToolEnds.filter((event) => event.message === "browser_nav")).toHaveLength(2);
    expect(browserToolEnds.filter((event) => event.message === "browser_content")).toHaveLength(2);
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.browser_research_report", status: "succeeded" })]));
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(state.checkpoints?.browserResearchReport?.value?.sources).toHaveLength(2);
    expect(state.checkpoints?.browserResearchReport?.value?.report?.report).toMatch(/cache|inference|attention|memory|source/i);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods artifact-backed runtime input and rendered output cards with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const fixtureDir = join(workspacePath, "classification-review");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(
      join(fixtureDir, "receipts.csv"),
      ["date,vendor,total", "2026-05-01,Stationery Co,42.19", "2026-05-03,Coffee Shop,18.75"].join("\n"),
      "utf8",
    );
    await writeFile(
      join(fixtureDir, "research-notes.md"),
      ["# Notes", "- Compare event venues by family friendliness.", "- Verify sources before final recommendations."].join("\n"),
      "utf8",
    );
    await writeFile(
      join(fixtureDir, "todo.txt"),
      ["Book library room", "Send draft agenda", "Confirm snack policy"].join("\n"),
      "utf8",
    );
    const paths = ["classification-review/receipts.csv", "classification-review/research-notes.md", "classification-review/todo.txt"];
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Classify a directory of files, ask me for qualitative feedback, then return a labeled HTML report.",
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest:
        "Create a read-only workflow that reads a few local files, asks Ambient for draft classifications, pauses with an artifact-backed preview for user feedback, then asks Ambient to produce a final labeled HTML report.",
      workspaceSummary: "Artifact-backed runtime input dogfood with three small local files in classification-review/.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => artifactReviewClassificationCompilerOutput(paths)) },
    });
    const artifact = dashboard.artifacts[0];
    const ambientProvider = new AmbientWorkflowRunProvider({
      model,
      apiKey,
      baseUrl: liveAmbientBaseUrl(),
      workflowThreadId: thread.id,
      idleTimeoutMs: 90_000,
      absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
    });
    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      model,
      ambientProvider,
    });
    const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
    const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
    const [inputCard] = workflowRuntimeInputCards(pausedDetail);
    if (!inputCard) throw new Error("Expected artifact-backed runtime input card.");
    const inputComposer = workflowThreadComposerModel({
      draft: "Keep the labels, but make receipts Finance and notes Planning in the final report.",
      detail: pausedDetail,
    });

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      userInputs: [
        {
          requestId: inputCard.requestId,
          choiceId: "revise",
          text: "Keep the labels, but make receipts Finance and notes Planning in the final report.",
        },
      ],
      model,
      ambientProvider,
    });
    const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
    const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
    const outputCards = workflowRunOutputCards(resumedDetail);
    const allModelCalls = [...pausedDetail.modelCalls, ...resumedDetail.modelCalls];
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { html?: string; markdown?: string; summary?: string; artifactPath?: string } }>;
    };

    await writeArtifactReviewRunDogfoodArtifact({
      pausedRun: { id: pausedRun.id, status: pausedRun.status },
      inputCard: {
        requestId: inputCard.requestId,
        graphNodeId: inputCard.graphNodeId,
        allowFreeform: inputCard.allowFreeform,
        contextItems: inputCard.contextItems,
      },
      inputComposer: {
        mode: inputComposer.mode,
        submitLabel: inputComposer.submitLabel,
        disabled: inputComposer.disabled,
      },
      resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
      eventCounts: eventCountsByType(resumedDetail.events),
      modelCalls: allModelCalls.map((call) => ({
        runId: call.runId,
        task: call.task,
        status: call.status,
        graphNodeId: call.graphNodeId,
        latencyMs: call.latencyMs,
      })),
      outputCards: outputCards.map((card) => ({
        kind: card.kind,
        label: card.label,
        format: card.format,
        artifactPath: card.artifactPath,
        metadata: card.metadata,
        preview: card.preview?.slice(0, 360),
      })),
      finalOutput: state.checkpoints?.final_output?.value,
    });

    expect(pausedRun).toMatchObject({ status: "needs_input" });
    expect(inputCard).toMatchObject({ graphNodeId: "review-classifications", allowFreeform: true });
    expect(inputCard.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Classification preview",
          kind: "artifact",
          format: "html",
          artifactPath: "reports/classification-preview.html",
        }),
      ]),
    );
    expect(inputComposer).toMatchObject({
      mode: "run_input",
      disabled: false,
      runtimeInputCard: expect.objectContaining({ requestId: inputCard.requestId }),
    });
    expect(resumedRun).toMatchObject({ status: "succeeded" });
    expect(resumedDetail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.input.received", graphNodeId: "review-classifications" }),
        expect.objectContaining({ type: "workflow.output.ready", graphNodeId: "output" }),
      ]),
    );
    expect(allModelCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ task: "dogfood.file_classification_draft", status: "succeeded", graphNodeId: "classify-files" }),
        expect.objectContaining({ task: "dogfood.file_classification_final", status: "succeeded", graphNodeId: "final-report" }),
      ]),
    );
    expect(outputCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: "html",
          artifactPath: "reports/classification-final.html",
          preview: expect.stringMatching(/classification|finance|planning|receipt|notes/i),
        }),
      ]),
    );
    expect(state.checkpoints?.final_output?.value?.html).toMatch(/<h1|classification/i);
    expect(state.checkpoints?.final_output?.value?.summary).toMatch(/classification|file|report/i);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods browser exploration into artifact review and final rendered output", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const query = "best movies and live shows for couples in Scottsdale Arizona this week";
    const browser = fakeScottsdaleEntertainmentBrowser();
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Scottsdale Couples Entertainment Browser Dogfood",
      initialRequest: "Find the best movies and live shows for couples playing in Scottsdale Arizona this week.",
      projectPath: workspacePath,
      traceMode: "debug",
      phase: "planned",
    });
    const recommendedGate = workflowExplorationGateModel({ chatTurnCount: 1 });
    const explorationProgress: Array<{ status: string; phase: string; message: string; graphNodeId?: string }> = [];
    const exploration = await runWorkflowThreadExploration({
      store,
      workflowThreadId: thread.id,
      workspacePath,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      permissionMode: "full-access",
      browser,
      provider: sequenceExplorationProvider([
        {
          action: "call_tool",
          toolName: "browser_search",
          input: { query, maxResults: 5, fetchContent: false },
          reason: "Probe live-search result shape before compiling a deterministic browser workflow.",
          nodeId: "explore-search",
        },
        {
          action: "call_tool",
          toolName: "browser_content",
          input: { url: "https://example.test/scottsdale/couples-movies" },
          reason: "Inspect one promising result so compile can model source cards and review artifacts.",
          nodeId: "explore-read",
        },
        {
          action: "finish",
          distillation: {
            summary:
              "Exploration found browser-search result cards and source-page text suitable for a deterministic entertainment shortlist workflow with a user review gate.",
            observedCalls: [
              {
                kind: "tool",
                name: "browser_search",
                status: "succeeded",
                inputSummary: query,
                outputSummary: "Three compact Scottsdale entertainment result cards with title, url, and snippet.",
              },
              {
                kind: "tool",
                name: "browser_content",
                status: "succeeded",
                inputSummary: "https://example.test/scottsdale/couples-movies",
                outputSummary: "Movie listings with date-night and couples-friendly evidence.",
              },
            ],
            successfulPatterns: [
              "Use browser_search for the first result set, then browser_nav/browser_content on a bounded shortlist instead of opening many windows.",
              "Checkpoint normalized source cards before asking Ambient to synthesize recommendations.",
              "Pause with an HTML shortlist artifact so the user can adjust source preference before final output.",
            ],
            dataShapes: [
              "Search result: {title,url,snippet}",
              "Source page: {url,title,text,links}",
              "Review artifact: {artifactPath,html,markdown,summary,sources[]}",
            ],
            requiredGrants: ["browser network/search access"],
            recommendedGraph: {
              summary: "Request -> browser search -> read source pages -> Ambient shortlist -> user review -> final report.",
              nodes: [
                { id: "request", type: "request", label: "Entertainment request" },
                { id: "search-sources", type: "data_source", label: "Search entertainment sources" },
                { id: "read-source-pages", type: "data_source", label: "Read top sources" },
                {
                  id: "draft-shortlist",
                  type: "model_call",
                  label: "Draft shortlist",
                  modelRole: "Create a source-backed shortlist for user review.",
                  inputSummary: "Search results and page text.",
                  outputSummary: "Draft picks plus source evidence.",
                  retryPolicy: "Retry invalid structured output.",
                },
                { id: "review-shortlist", type: "review_gate", label: "Review shortlist" },
                {
                  id: "final-recommendations",
                  type: "model_call",
                  label: "Final recommendations",
                  modelRole: "Apply feedback and produce final report.",
                  inputSummary: "Draft shortlist and user feedback.",
                  outputSummary: "Readable HTML/Markdown recommendation report.",
                  retryPolicy: "Retry invalid structured output.",
                },
                { id: "output", type: "output", label: "Rendered report" },
              ],
              edges: [
                { id: "request-search", source: "request", target: "search-sources", type: "control_flow", label: "needs current listings" },
                { id: "search-read", source: "search-sources", target: "read-source-pages", type: "data_flow", label: "top sources" },
                { id: "read-draft", source: "read-source-pages", target: "draft-shortlist", type: "data_flow", label: "source evidence" },
                { id: "draft-review", source: "draft-shortlist", target: "review-shortlist", type: "control_flow", label: "ask user" },
                { id: "review-final", source: "review-shortlist", target: "final-recommendations", type: "data_flow", label: "feedback" },
                { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow", label: "report" },
              ],
            },
            recommendedManifest: {
              tools: ["browser_search", "browser_nav", "browser_content", "ambient.responses"],
              mutationPolicy: "read_only",
              maxToolCalls: 8,
              maxModelCalls: 2,
            },
            deterministicSourceStrategy:
              "Search once, read two source pages in the same browser adapter, checkpoint normalized evidence, ask Ambient for a draft shortlist, pause for user review with an artifact preview, then ask Ambient for final rendered output.",
            unresolvedQuestions: [],
          },
        },
      ]),
      budgets: { maxModelTurns: 4, maxToolCalls: 2, maxElapsedMs: 90_000 },
      onProgress: (progress) => {
        explorationProgress.push({
          status: progress.status,
          phase: progress.phase,
          message: progress.message,
          graphNodeId: progress.graphNodeId,
        });
      },
    });
    const traceCards = workflowExplorationTraceCards(store.listWorkflowExplorationTraces(thread.id));
    const completedGate = workflowExplorationGateModel({ chatTurnCount: 1, traceCount: traceCards.length });

    let compilerPrompt = "";
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Compile the deterministic browser workflow from the retained exploration trace.",
      workspaceSummary:
        "Browser exploration dogfood. Use the observed browser_search/browser_content pattern, keep browser calls bounded, and include a runtime input review artifact before the final report.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: {
        compileProgramIr: vi.fn(async (input) => {
          compilerPrompt = input.prompt;
          return browserExplorationReviewCompilerOutput(query);
        }),
      },
    });
    const artifact = dashboard.artifacts[0];
    const graph = store.getWorkflowAgentThreadSummary(thread.id).graph ?? store.listWorkflowGraphSnapshots(thread.id)[0];
    const ambientProvider = new AmbientWorkflowRunProvider({
      model,
      apiKey,
      baseUrl: liveAmbientBaseUrl(),
      workflowThreadId: thread.id,
      idleTimeoutMs: 90_000,
      absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
    });
    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      browser,
      model,
      ambientProvider,
    });
    const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
    const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
    const [inputCard] = workflowRuntimeInputCards(pausedDetail);
    if (!inputCard) throw new Error("Expected browser shortlist runtime input card.");
    const inputComposer = workflowThreadComposerModel({
      draft: "Prioritize date-night atmosphere, include one movie and one live show, and explain why each is couples-friendly.",
      detail: pausedDetail,
    });

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      userInputs: [
        {
          requestId: inputCard.requestId,
          choiceId: "revise",
          text: "Prioritize date-night atmosphere, include one movie and one live show, and explain why each is couples-friendly.",
        },
      ],
      browser,
      model,
      ambientProvider,
    });
    const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
    const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
    const allEvents = [...pausedDetail.events, ...resumedDetail.events];
    const allModelCalls = [...pausedDetail.modelCalls, ...resumedDetail.modelCalls];
    const graphWithRunState = workflowGraphWithRunEvents(graph, allEvents);
    const graphEventCards = workflowGraphEventCards(allEvents, graph, { modelCalls: allModelCalls, checkpoints: resumedDetail.checkpoints, limit: 10 });
    const graphCoverageCards = workflowGraphEventCards(allEvents, graph, {
      modelCalls: allModelCalls,
      checkpoints: resumedDetail.checkpoints,
      limit: allEvents.length,
    });
    const outputCards = workflowRunOutputCards(resumedDetail);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { html?: string; markdown?: string; summary?: string; artifactPath?: string; picks?: unknown[]; sources?: unknown[] } }>;
    };

    await writeBrowserExplorationReviewDogfoodArtifact({
      threadId: thread.id,
      explorationTraceId: exploration.trace.id,
      recommendedGate,
      completedGate,
      traceCard: traceCards[0],
      explorationProgress,
      compilerPromptIncludesTrace: compilerPrompt.includes(exploration.trace.id),
      pausedRun: { id: pausedRun.id, status: pausedRun.status },
      inputCard: {
        requestId: inputCard.requestId,
        graphNodeId: inputCard.graphNodeId,
        contextItems: inputCard.contextItems,
      },
      inputComposer: {
        mode: inputComposer.mode,
        submitLabel: inputComposer.submitLabel,
        disabled: inputComposer.disabled,
      },
      resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
      browserCalls: {
        search: browser.search.mock.calls.length,
        navigate: browser.navigate.mock.calls.length,
        content: browser.content.mock.calls.length,
      },
      eventCounts: eventCountsByType(allEvents),
      graphStates: graphWithRunState.nodes.map((node) => ({ id: node.id, type: node.type, runState: node.runState })),
      graphEventCards: graphEventCards.map((card) => ({
        label: card.label,
        state: card.state,
        graphNodeId: card.graphNodeId,
        detail: card.detail,
        summaries: card.summaries,
      })),
      modelCalls: allModelCalls.map((call) => ({ task: call.task, status: call.status, graphNodeId: call.graphNodeId, latencyMs: call.latencyMs })),
      outputCards: outputCards.map((card) => ({
        kind: card.kind,
        label: card.label,
        format: card.format,
        artifactPath: card.artifactPath,
        preview: card.preview?.slice(0, 420),
        metadata: card.metadata,
      })),
      finalOutput: state.checkpoints?.final_output?.value,
    });

    expect(recommendedGate).toMatchObject({ state: "recommended", canRun: true, canSkip: true });
    expect(completedGate).toMatchObject({ state: "completed", canCompileFromExploration: true });
    expect(traceCards[0]).toMatchObject({
      summary: expect.stringMatching(/browser-search|search result|shortlist/i),
      deterministicSourceStrategy: expect.stringMatching(/Search once|pause|review/i),
    });
    expect(compilerPrompt).toContain(exploration.trace.id);
    expect(compilerPrompt).toContain("browser_search");
    expect(pausedRun).toMatchObject({ status: "needs_input" });
    expect(inputCard).toMatchObject({ graphNodeId: "review-shortlist", allowFreeform: true });
    expect(inputCard.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Source shortlist",
          kind: "artifact",
          format: "html",
          artifactPath: "reports/scottsdale-entertainment-shortlist.html",
        }),
      ]),
    );
    expect(inputComposer).toMatchObject({ mode: "run_input", disabled: false });
    expect(resumedRun).toMatchObject({ status: "succeeded" });
    expect(browser.search).toHaveBeenCalledTimes(2);
    expect(browser.navigate).toHaveBeenCalledTimes(2);
    expect(browser.content).toHaveBeenCalledTimes(3);
    expect(allModelCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ task: "dogfood.browser_source_shortlist", status: "succeeded", graphNodeId: "draft-shortlist" }),
        expect.objectContaining({ task: "dogfood.browser_final_recommendations", status: "succeeded", graphNodeId: "final-recommendations" }),
      ]),
    );
    expect(graphWithRunState.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "review-shortlist", runState: "completed" }),
        expect.objectContaining({ id: "final-recommendations", runState: "completed" }),
        expect.objectContaining({ id: "output", runState: "completed" }),
      ]),
    );
    expect(graphCoverageCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ graphNodeId: "review-shortlist" }),
        expect.objectContaining({ graphNodeId: "final-recommendations" }),
      ]),
    );
    expect(outputCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: "html",
          artifactPath: "reports/scottsdale-entertainment-final.html",
          preview: expect.stringMatching(/Scottsdale|movie|show|couples|date/i),
        }),
      ]),
    );
    expect(state.checkpoints?.final_output?.value?.html).toMatch(/Scottsdale|movie|show|couples|date/i);
    expect(state.checkpoints?.sourceEvidence?.value?.sources).toHaveLength(2);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods browser user intervention pause and resume with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const query = "best live shows appropriate for children in Scottsdale Arizona in the next week";
    const browser = fakeScottsdaleEntertainmentBrowserWithIntervention();
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Scottsdale Family Shows Browser Intervention Dogfood",
      initialRequest:
        "Find the best live shows appropriate for children playing in Scottsdale Arizona in the next week, and pause if browser verification blocks source access.",
      projectPath: workspacePath,
      traceMode: "debug",
      phase: "planned",
    });
    let compilerPrompt = "";
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Compile a browser workflow that pauses cleanly if a browser CAPTCHA or verification page blocks source access.",
      workspaceSummary:
        "Browser intervention dogfood. The workflow must checkpoint search results, pause with workflow.askUser when browser tools return BrowserUserActionState, then retry the same browser operation after the user completes the challenge.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: {
        compileProgramIr: vi.fn(async (input) => {
          compilerPrompt = input.prompt;
          return browserInterventionRecoveryCompilerOutput(query);
        }),
      },
    });
    const artifact = dashboard.artifacts[0];
    const graph = store.getWorkflowAgentThreadSummary(thread.id).graph ?? store.listWorkflowGraphSnapshots(thread.id)[0];
    const ambientProvider = new AmbientWorkflowRunProvider({
      model,
      apiKey,
      baseUrl: liveAmbientBaseUrl(),
      workflowThreadId: thread.id,
      idleTimeoutMs: 90_000,
      absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
    });

    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      browser,
      model,
      ambientProvider,
    });
    const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
    const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
    const [inputCard] = workflowRuntimeInputCards(pausedDetail);
    if (!inputCard) {
      throw new Error(
        `Expected browser intervention runtime input card. run=${JSON.stringify({
          status: pausedRun.status,
          error: pausedRun.error,
          events: pausedDetail.events.map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data })).slice(-12),
        })}`,
      );
    }
    const inputComposer = workflowThreadComposerModel({
      draft: "I completed the browser verification. Continue from the same page.",
      detail: pausedDetail,
    });

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      userInputs: [
        {
          requestId: inputCard.requestId,
          choiceId: "completed",
          text: "I completed the browser verification. Continue from the same page.",
        },
      ],
      browser,
      model,
      ambientProvider,
    });
    const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
    const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
    const allEvents = [...pausedDetail.events, ...resumedDetail.events];
    const allModelCalls = [...pausedDetail.modelCalls, ...resumedDetail.modelCalls];
    const graphWithRunState = workflowGraphWithRunEvents(graph, allEvents);
    const graphEventCards = workflowGraphEventCards(allEvents, graph, {
      modelCalls: allModelCalls,
      checkpoints: resumedDetail.checkpoints,
      limit: allEvents.length,
    });
    const outputCards = workflowRunOutputCards(resumedDetail);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { html?: string; sources?: unknown[]; browserIntervention?: unknown } }>;
    };

    await writeBrowserInterventionRecoveryDogfoodArtifact({
      threadId: thread.id,
      pausedRun: { id: pausedRun.id, status: pausedRun.status },
      resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
      compilerPromptIncludesBrowserInterventionRule: compilerPrompt.includes("Browser user-action rule"),
      inputCard: {
        requestId: inputCard.requestId,
        graphNodeId: inputCard.graphNodeId,
        prompt: inputCard.prompt,
        choices: inputCard.choices,
        browserIntervention: inputCard.browserIntervention,
        contextItems: inputCard.contextItems,
      },
      inputComposer: {
        mode: inputComposer.mode,
        submitLabel: inputComposer.submitLabel,
        disabled: inputComposer.disabled,
      },
      browserCalls: {
        search: browser.search.mock.calls.length,
        navigate: browser.navigate.mock.calls.map((call) => call[0]),
        content: browser.content.mock.calls.map((call) => call[0]),
      },
      eventCounts: eventCountsByType(allEvents),
      graphStates: graphWithRunState.nodes.map((node) => ({ id: node.id, type: node.type, runState: node.runState })),
      graphEventCards: graphEventCards.map((card) => ({
        label: card.label,
        state: card.state,
        graphNodeId: card.graphNodeId,
        detail: card.detail,
        summaries: card.summaries,
      })),
      modelCalls: allModelCalls.map((call) => ({ task: call.task, status: call.status, graphNodeId: call.graphNodeId, latencyMs: call.latencyMs })),
      outputCards: outputCards.map((card) => ({
        kind: card.kind,
        label: card.label,
        format: card.format,
        artifactPath: card.artifactPath,
        preview: card.preview?.slice(0, 420),
        metadata: card.metadata,
      })),
      finalOutput: state.checkpoints?.final_output?.value,
    });

    expect(compilerPrompt).toContain("Browser user-action rule");
    expect(compilerPrompt).toContain("options.data.browserIntervention");
    expect(pausedRun).toMatchObject({ status: "needs_input" });
    expect(inputCard).toMatchObject({ graphNodeId: "browser-intervention", allowFreeform: true });
    expect(inputCard.browserIntervention).toEqual(
      expect.objectContaining({
        title: "Browser challenge",
        kind: "captcha",
        provider: "recaptcha",
        toolName: "browser_nav",
        browserUserActionId: "browser-action-family-shows",
        url: "https://example.test/scottsdale/family-shows",
        message: expect.stringMatching(/managed browser/i),
        preview: expect.objectContaining({
          textExcerpt: expect.stringMatching(/captcha|managed browser/i),
          screenshotArtifactPath: ".ambient-codex/browser/screenshots/scottsdale-family-shows-verification.png",
          screenshotWidth: 1200,
          screenshotHeight: 800,
        }),
      }),
    );
    expect(inputCard.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "completed", label: "I completed it" }),
        expect.objectContaining({ id: "skip", label: "Skip this source" }),
      ]),
    );
    expect(inputCard.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scottsdale Family Shows Calendar",
          kind: "data",
          format: "json",
          value: expect.stringMatching(/family shows|example\.test/i),
        }),
      ]),
    );
    expect(inputComposer).toMatchObject({ mode: "run_input", disabled: false, submitLabel: "Continue workflow" });
    if (resumedRun.status !== "succeeded") {
      throw new Error(
        `Expected browser intervention recovery dogfood run to succeed. run=${JSON.stringify({
          resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
          eventCounts: eventCountsByType(allEvents),
          modelCalls: allModelCalls.map((call) => ({
            task: call.task,
            status: call.status,
            graphNodeId: call.graphNodeId,
            validationError: call.validationError,
            latencyMs: call.latencyMs,
          })),
        })}`,
      );
    }
    expect(resumedRun).toMatchObject({ status: "succeeded" });
    expect(browser.search).toHaveBeenCalledTimes(1);
    expect(browser.navigate.mock.calls).toEqual([
      [expect.objectContaining({ url: "https://example.test/scottsdale/family-shows", waitForUserAction: false })],
      [expect.objectContaining({ url: "https://example.test/scottsdale/family-shows", waitForUserAction: false, userActionId: "browser-action-family-shows" })],
    ]);
    expect(browser.content).toHaveBeenCalledTimes(1);
    expect(allEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.input.required", graphNodeId: "browser-intervention" }),
        expect.objectContaining({ type: "workflow.input.received", graphNodeId: "browser-intervention" }),
      ]),
    );
    expect(allModelCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ task: "dogfood.browser_intervention_family_shows", status: "succeeded", graphNodeId: "final-recommendations" }),
      ]),
    );
    expect(graphWithRunState.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "search-sources", runState: "completed" }),
        expect.objectContaining({ id: "browser-intervention", runState: "completed" }),
        expect.objectContaining({ id: "final-recommendations", runState: "completed" }),
        expect.objectContaining({ id: "output", runState: "completed" }),
      ]),
    );
    expect(graphEventCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ graphNodeId: "browser-intervention" }),
        expect.objectContaining({ graphNodeId: "final-recommendations" }),
      ]),
    );
    expect(outputCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: "html",
          artifactPath: "reports/scottsdale-family-shows.html",
          preview: expect.stringMatching(/Scottsdale|family|show|children/i),
        }),
      ]),
    );
    expect(state.checkpoints?.final_output?.value?.html).toMatch(/Scottsdale|family|show|children/i);
    expect(state.checkpoints?.sourceEvidence?.value?.sources).toHaveLength(1);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods real managed-browser intervention and reveal with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const challenge = await createManagedBrowserChallengeServer();
    const revealInputs: unknown[] = [];
    const browserService = new BrowserService(() => store.getWorkspace(), undefined, {
      revealManagedChromeWindow: async (input) => {
        revealInputs.push(input);
        return {
          cdpActivated: true,
          foregroundAttempted: true,
          foregroundSucceeded: true,
          method: "dogfood-stub",
        };
      },
    });
    const { browser, calls } = recordingWorkflowBrowser(browserService);
    try {
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Real Managed Browser Intervention Dogfood",
        initialRequest:
          "Find live shows appropriate for children in Scottsdale next week, using the managed browser and pausing if source access asks for human verification.",
        projectPath: workspacePath,
        traceMode: "debug",
        phase: "planned",
      });
      let compilerPrompt = "";
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest:
          "Compile a workflow that opens a current-looking web source in the real managed browser, pauses with a typed browser-intervention card if verification appears, then resumes in the same browser session and produces rendered output.",
        workspaceSummary:
          "Real managed-browser dogfood. The source URL is a deterministic local web page that first shows a human-verification interstitial and then unlocks into Scottsdale family-show content. Browser calls must use an isolated profile and must not create extra tabs.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: {
          compileProgramIr: vi.fn(async (input) => {
            compilerPrompt = input.prompt;
            return managedBrowserInterventionCompilerOutput(challenge.url);
          }),
        },
      });
      const artifact = dashboard.artifacts[0];
      const graph = store.getWorkflowAgentThreadSummary(thread.id).graph ?? store.listWorkflowGraphSnapshots(thread.id)[0];
      const ambientProvider = new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      });

      const pausedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        browser,
        model,
        ambientProvider,
      });
      const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
      const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
      const [inputCard] = workflowRuntimeInputCards(pausedDetail);
      if (!inputCard) {
        throw new Error(
          `Expected real managed-browser intervention card. run=${JSON.stringify({
            status: pausedRun.status,
            error: pausedRun.error,
            events: pausedDetail.events.map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data })).slice(-12),
          })}`,
        );
      }
      const revealResult = await browserService.revealActiveBrowser({
        userActionId: inputCard.browserIntervention?.browserUserActionId,
        targetId: inputCard.browserIntervention?.targetId,
      });
      await sleep(2_750);

      const resumedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        resumeFromRunId: pausedRun.id,
        userInputs: [
          {
            requestId: inputCard.requestId,
            choiceId: "completed",
            text: "I completed the browser verification in the managed browser.",
          },
        ],
        browser,
        model,
        ambientProvider,
      });
      const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
      const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
      if (resumedRun.status !== "succeeded") {
        throw new Error(
          `Expected resumed real managed-browser run to succeed. run=${JSON.stringify({
            status: resumedRun.status,
            error: resumedRun.error,
            events: resumedDetail.events.map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data })).slice(-18),
          })}`,
        );
      }
      const finalBrowserState = await browserService.getState();
      const allEvents = [...pausedDetail.events, ...resumedDetail.events];
      const allModelCalls = [...pausedDetail.modelCalls, ...resumedDetail.modelCalls];
      const graphWithRunState = workflowGraphWithRunEvents(graph, allEvents);
      const graphEventCards = workflowGraphEventCards(allEvents, graph, {
        modelCalls: allModelCalls,
        checkpoints: resumedDetail.checkpoints,
        limit: allEvents.length,
      });
      const outputCards = workflowRunOutputCards(resumedDetail);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { html?: string; sources?: unknown[] } }>;
      };

      await writeManagedBrowserInterventionDogfoodArtifact({
        threadId: thread.id,
        sourceUrl: challenge.url,
        pausedRun: { id: pausedRun.id, status: pausedRun.status, error: pausedRun.error },
        resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
        compilerPromptIncludesBrowserInterventionRule: compilerPrompt.includes("Browser user-action rule"),
        inputCard: {
          requestId: inputCard.requestId,
          graphNodeId: inputCard.graphNodeId,
          prompt: inputCard.prompt,
          choices: inputCard.choices,
          browserIntervention: inputCard.browserIntervention,
          contextItems: inputCard.contextItems,
        },
        revealResult,
        revealInputs,
        finalBrowserState: {
          running: finalBrowserState.running,
          runtime: finalBrowserState.runtime,
          profileMode: finalBrowserState.profileMode,
          userAction: finalBrowserState.userAction,
          activeTab: finalBrowserState.activeTab,
        },
        browserCalls: {
          search: calls.search,
          navigate: calls.navigate,
          content: calls.content,
          screenshot: calls.screenshot,
        },
        serverHits: challenge.hits,
        eventCounts: eventCountsByType(allEvents),
        graphStates: graphWithRunState.nodes.map((node) => ({ id: node.id, type: node.type, runState: node.runState })),
        graphEventCards: graphEventCards.map((card) => ({
          label: card.label,
          state: card.state,
          graphNodeId: card.graphNodeId,
          detail: card.detail,
          summaries: card.summaries,
        })),
        modelCalls: allModelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          graphNodeId: call.graphNodeId,
          latencyMs: call.latencyMs,
        })),
        outputCards: outputCards.map((card) => ({
          kind: card.kind,
          label: card.label,
          format: card.format,
          artifactPath: card.artifactPath,
          preview: card.preview?.slice(0, 420),
          metadata: card.metadata,
        })),
        finalOutput: state.checkpoints?.final_output?.value,
      });

      expect(compilerPrompt).toContain("Browser user-action rule");
      expect(pausedRun).toMatchObject({ status: "needs_input" });
      expect(inputCard).toMatchObject({ graphNodeId: "browser-intervention", allowFreeform: true });
      expect(inputCard.browserIntervention).toEqual(
        expect.objectContaining({
          title: "Managed browser verification",
          toolName: "browser_nav",
          runtime: "chrome",
          profileMode: "isolated",
          browserUserActionId: expect.any(String),
          targetId: expect.any(String),
          url: challenge.url,
          message: expect.stringMatching(/browser|verification|human/i),
          preview: expect.objectContaining({
            textExcerpt: expect.stringMatching(/human|verification/i),
            screenshotArtifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
            screenshotWidth: expect.any(Number),
            screenshotHeight: expect.any(Number),
          }),
        }),
      );
      expect(["captcha", "bot-check"]).toContain(inputCard.browserIntervention?.kind);
      expect(inputCard.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "completed", label: "I completed it" }),
          expect.objectContaining({ id: "skip", label: "Skip source" }),
        ]),
      );
      expect(inputCard.contextItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Family shows challenge source",
            kind: "data",
            format: "json",
            value: expect.stringMatching(/human-verification|Scottsdale|managed browser/i),
          }),
        ]),
      );
      expect(revealResult).toMatchObject({ runtime: "chrome", status: "revealed" });
      expect(revealInputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            targetId: inputCard.browserIntervention?.targetId,
            profileMode: "isolated",
          }),
        ]),
      );
      expect(resumedRun).toMatchObject({ status: "succeeded" });
      expect(finalBrowserState.userAction?.active).not.toBe(true);
      expect(calls.search).toHaveLength(0);
      expect(calls.navigate).toEqual([
        expect.objectContaining({ url: challenge.url, waitForUserAction: false, profileMode: "isolated" }),
        expect.objectContaining({
          url: challenge.url,
          waitForUserAction: false,
          profileMode: "isolated",
          userActionId: inputCard.browserIntervention?.browserUserActionId,
        }),
      ]);
      expect(calls.navigate.every((input) => !(input as { newTab?: boolean }).newTab)).toBe(true);
      expect(calls.content).toEqual([
        expect.objectContaining({ url: challenge.url, waitForUserAction: false, profileMode: "isolated" }),
      ]);
      expect(calls.screenshot).toEqual([expect.objectContaining({ profileMode: "isolated" })]);
      expect(challenge.hits.shows).toBeGreaterThanOrEqual(2);
      expect(allEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "workflow.input.required", graphNodeId: "browser-intervention" }),
          expect.objectContaining({ type: "workflow.input.received", graphNodeId: "browser-intervention" }),
          expect.objectContaining({ type: "ambient.call.progress", graphNodeId: "final-recommendations" }),
          expect.objectContaining({ type: "workflow.output.ready", graphNodeId: "output" }),
        ]),
      );
      expect(allModelCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ task: "dogfood.real_managed_browser_family_shows", status: "succeeded", graphNodeId: "final-recommendations" }),
        ]),
      );
      expect(graphWithRunState.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "browser-intervention", runState: "completed" }),
          expect.objectContaining({ id: "read-source", runState: "completed" }),
          expect.objectContaining({ id: "final-recommendations", runState: "completed" }),
          expect.objectContaining({ id: "output", runState: "completed" }),
        ]),
      );
      expect(graphEventCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ graphNodeId: "browser-intervention" }),
          expect.objectContaining({ graphNodeId: "read-source" }),
          expect.objectContaining({ graphNodeId: "final-recommendations" }),
        ]),
      );
      expect(outputCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            format: "html",
            artifactPath: "reports/managed-browser-family-shows.html",
            preview: expect.stringMatching(/Scottsdale|family|show|children/i),
          }),
        ]),
      );
      expect(state.checkpoints?.final_output?.value?.html).toMatch(/Scottsdale|family|show|children/i);
      expect(state.checkpoints?.sourceEvidence?.value?.sources).toHaveLength(1);
    } finally {
      await browserService.stop().catch(() => undefined);
      await challenge.close();
    }
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods an external-site managed-browser workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const sourceUrl =
      process.env.AMBIENT_WORKFLOW_EXTERNAL_BROWSER_URL ??
      "https://arxiv.org/search/?query=placebo+effect&searchtype=all&abstracts=show&order=-announced_date_first&size=25";
    const query = "Find recent papers on the placebo effect from arxiv and create summaries of them";
    const revealInputs: unknown[] = [];
    const browserService = new BrowserService(() => store.getWorkspace(), undefined, {
      revealManagedChromeWindow: async (input) => {
        revealInputs.push(input);
        return {
          cdpActivated: true,
          foregroundAttempted: true,
          foregroundSucceeded: true,
          method: "external-dogfood-stub",
        };
      },
    });
    const { browser, calls } = recordingWorkflowBrowser(browserService);
    try {
      const thread = store.createWorkflowAgentThreadSummary({
        title: "External Managed Browser Arxiv Dogfood",
        initialRequest: query,
        projectPath: workspacePath,
        traceMode: "debug",
        phase: "planned",
      });
      let compilerPrompt = "";
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest:
          "Compile a read-only workflow that opens an external arxiv search page in the managed browser, captures bounded page evidence and a screenshot, handles browser user-action pauses if they appear, then asks Ambient for a rendered summary report.",
        workspaceSummary:
          "External-site managed-browser dogfood. The workflow should use the real isolated managed browser, avoid opening extra tabs, keep page text bounded, and produce a readable HTML report rather than raw JSON.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: {
          compileProgramIr: vi.fn(async (input) => {
            compilerPrompt = input.prompt;
            return externalManagedBrowserArxivCompilerOutput({ query, sourceUrl });
          }),
        },
      });
      const artifact = dashboard.artifacts[0];
      const graph = store.getWorkflowAgentThreadSummary(thread.id).graph ?? store.listWorkflowGraphSnapshots(thread.id)[0];
      const ambientProvider = new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      });

      const firstDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        browser,
        model,
        ambientProvider,
      });
      const firstRun = latestRunForArtifact(firstDashboard, artifact.id);
      const firstDetail = readWorkflowRunDetail(store, firstRun.id);
      const [inputCard] = workflowRuntimeInputCards(firstDetail);
      let finalRun = firstRun;
      let finalDetail = firstDetail;
      let interventionResolution: unknown;
      if (firstRun.status === "needs_input" && inputCard?.browserIntervention) {
        const revealResult = await browserService.revealActiveBrowser({
          userActionId: inputCard.browserIntervention.browserUserActionId,
          targetId: inputCard.browserIntervention.targetId,
        });
        const resumedDashboard = await runWorkflowArtifact({
          store,
          artifactId: artifact.id,
          workspacePath,
          permissionMode: "full-access",
          resumeFromRunId: firstRun.id,
          userInputs: [
            {
              requestId: inputCard.requestId,
              choiceId: "skip",
              text: "Skip this external source after recording the browser challenge evidence for dogfood.",
            },
          ],
          browser,
          model,
          ambientProvider,
        });
        finalRun = latestRunForArtifact(resumedDashboard, artifact.id);
        finalDetail = readWorkflowRunDetail(store, finalRun.id);
        interventionResolution = {
          pausedRun: { id: firstRun.id, status: firstRun.status, error: firstRun.error },
          revealResult,
          inputCard: {
            requestId: inputCard.requestId,
            graphNodeId: inputCard.graphNodeId,
            prompt: inputCard.prompt,
            browserIntervention: inputCard.browserIntervention,
            contextItems: inputCard.contextItems,
          },
        };
      }
      if (finalRun.status !== "succeeded") {
        throw new Error(
          `Expected external managed-browser dogfood run to succeed. run=${JSON.stringify({
            firstRun: { status: firstRun.status, error: firstRun.error },
            finalRun: { status: finalRun.status, error: finalRun.error },
            events: finalDetail.events.map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data })).slice(-18),
          })}`,
        );
      }

      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { html?: string; summary?: string; sources?: unknown[]; sourceEvidence?: unknown } }>;
      };
      const allEvents = firstRun.id === finalRun.id ? finalDetail.events : [...firstDetail.events, ...finalDetail.events];
      const allModelCalls = firstRun.id === finalRun.id ? finalDetail.modelCalls : [...firstDetail.modelCalls, ...finalDetail.modelCalls];
      const graphWithRunState = workflowGraphWithRunEvents(graph, allEvents);
      const outputCards = workflowRunOutputCards(finalDetail);
      const finalBrowserState = await browserService.getState();
      const sourceEvidence = state.checkpoints?.sourceEvidence?.value as
        | {
            sources?: Array<{
              skipped?: boolean;
              textChars?: number;
              screenshot?: { artifactPath?: string; width?: number; height?: number };
              browserIntervention?: unknown;
            }>;
          }
        | undefined;
      const sourceRecord = sourceEvidence?.sources?.[0];

      await writeExternalManagedBrowserDogfoodArtifact({
        threadId: thread.id,
        sourceUrl,
        query,
        compilerPromptIncludesBrowserInterventionRule: compilerPrompt.includes("Browser user-action rule"),
        run: { id: finalRun.id, status: finalRun.status, error: finalRun.error },
        interventionResolution,
        eventCounts: eventCountsByType(allEvents),
        browserCalls: {
          search: calls.search,
          navigate: calls.navigate,
          content: calls.content,
          screenshot: calls.screenshot,
        },
        finalBrowserState: {
          running: finalBrowserState.running,
          runtime: finalBrowserState.runtime,
          profileMode: finalBrowserState.profileMode,
          userAction: finalBrowserState.userAction,
          activeTab: finalBrowserState.activeTab,
        },
        sourceEvidence: {
          skipped: sourceRecord?.skipped,
          textChars: sourceRecord?.textChars,
          screenshot: sourceRecord?.screenshot,
          browserIntervention: sourceRecord?.browserIntervention,
        },
        graphStates: graphWithRunState.nodes.map((node) => ({ id: node.id, type: node.type, runState: node.runState })),
        modelCalls: allModelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          graphNodeId: call.graphNodeId,
          latencyMs: call.latencyMs,
          outputChars: call.output === undefined ? undefined : JSON.stringify(call.output).length,
        })),
        outputCards: outputCards.map((card) => ({
          kind: card.kind,
          label: card.label,
          format: card.format,
          artifactPath: card.artifactPath,
          preview: card.preview?.slice(0, 420),
          metadata: card.metadata,
        })),
        finalOutput: state.checkpoints?.final_output?.value,
      });

      expect(compilerPrompt).toContain("Browser user-action rule");
      expect(finalRun).toMatchObject({ status: "succeeded" });
      expect(calls.search).toHaveLength(0);
      expect(calls.navigate).toEqual(expect.arrayContaining([expect.objectContaining({ url: sourceUrl, waitForUserAction: false, profileMode: "isolated" })]));
      expect(calls.navigate.every((input) => !(input as { newTab?: boolean }).newTab)).toBe(true);
      expect(calls.content.length).toBeGreaterThanOrEqual(interventionResolution ? 0 : 1);
      expect(calls.screenshot.length).toBeLessThanOrEqual(1);
      expect(finalBrowserState.profileMode).toBe("isolated");
      expect(allModelCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ task: "dogfood.external_managed_browser_arxiv", status: "succeeded", graphNodeId: "final-report" }),
        ]),
      );
      expect(allEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "ambient.call.progress", graphNodeId: "final-report" })]));
      expect(graphWithRunState.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "open-source", runState: "completed" }),
          expect.objectContaining({ id: "final-report", runState: "completed" }),
          expect.objectContaining({ id: "output", runState: "completed" }),
        ]),
      );
      expect(outputCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            format: "html",
            artifactPath: "reports/external-arxiv-placebo-summary.html",
            preview: expect.stringMatching(/arxiv|placebo|browser|source|blocked/i),
          }),
        ]),
      );
      expect(state.checkpoints?.final_output?.value?.html).toMatch(/arxiv|placebo|browser|source|blocked/i);
      if (interventionResolution) {
        expect(outputCards).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              label: "Browser challenge screenshot",
              format: "image",
              artifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
              metadata: expect.arrayContaining(["browser challenge"]),
            }),
          ]),
        );
        expect(interventionResolution).toEqual(
          expect.objectContaining({
            inputCard: expect.objectContaining({
              browserIntervention: expect.objectContaining({
                preview: expect.objectContaining({
                  textExcerpt: expect.any(String),
                  screenshotArtifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
                }),
              }),
            }),
          }),
        );
      } else {
        expect(sourceRecord?.skipped).not.toBe(true);
        expect(sourceRecord?.textChars ?? 0).toBeGreaterThan(200);
        expect(sourceRecord?.screenshot?.artifactPath).toMatch(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/);
        expect(outputCards).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              label: "Source evidence screenshot",
              format: "image",
              artifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
            }),
          ]),
        );
      }
    } finally {
      await browserService.stop().catch(() => undefined);
    }
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods staged mutation review with a live Ambient runtime call", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const outputPath = "reports/mutation-review-report.md";
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Draft a report and stage writing it to a local file for approval.",
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a workflow that asks Ambient to draft a short report, stages a workspace file write for review, and applies the write only after approval.",
      workspaceSummary: "Mutation-review live dogfood. The workspace has no reports directory yet; the workflow may write reports/mutation-review-report.md only after staged approval.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => mutationReviewCompilerOutput(outputPath)) },
    });
    const artifact = dashboard.artifacts[0];
    const ambientProvider = new AmbientWorkflowRunProvider({
      model,
      apiKey,
      baseUrl: liveAmbientBaseUrl(),
      workflowThreadId: thread.id,
      idleTimeoutMs: 90_000,
      absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
    });

    const pausedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      model,
      ambientProvider,
    });
    const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
    const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
    const pausedState = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: unknown; runId?: string }>;
    };

    expect(pausedRun).toMatchObject({ status: "paused" });
    expect(existsSync(join(workspacePath, outputPath))).toBe(false);
    expect(pausedDetail.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["ambient.call.progress", "checkpoint.write", "mutation.staged", "approval.required", "workflow.paused"]),
    );
    expect(pausedDetail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.mutation_review_draft", status: "succeeded" })]));
    expect(pausedState.checkpoints?.mutationReviewDraft).toBeTruthy();

    const approvalId = requiredWorkflowApprovalId(store, pausedRun.id);
    const approvedDetail = resolveWorkflowApproval(store, { runId: pausedRun.id, approvalId, decision: "approved" });
    expect(approvedDetail.approvals).toEqual(expect.arrayContaining([expect.objectContaining({ id: approvalId, status: "approved" })]));

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      model,
      ambientProvider,
    });
    const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
    const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
    const report = await readFile(join(workspacePath, outputPath), "utf8");
    const finalState = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { path?: string; bytes?: number; title?: string }; runId?: string }>;
    };

    await writeMutationReviewRunDogfoodArtifact({
      artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId },
      pausedRun: { id: pausedRun.id, status: pausedRun.status },
      resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
      approvalId,
      pausedEventCounts: eventCountsByType(pausedDetail.events),
      resumedEventCounts: eventCountsByType(resumedDetail.events),
      pausedModelCalls: pausedDetail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
      resumedModelCalls: resumedDetail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
      output: { path: outputPath, chars: report.length, preview: report.slice(0, 240) },
      checkpoint: finalState.checkpoints?.mutationReviewOutput?.value,
    });

    expect(resumedRun).toMatchObject({ status: "succeeded" });
    expect(resumedDetail.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["workflow.resume", "checkpoint.resume", "approval.approved", "desktop-tool.start", "desktop-tool.end", "mutation.applied", "checkpoint.write"]),
    );
    expect(resumedDetail.modelCalls).toHaveLength(0);
    expect(report).toMatch(/Workflow|mutation|approval|report/i);
    expect(finalState.checkpoints?.mutationReviewOutput?.value).toMatchObject({ path: outputPath });
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLivePlanEdit("dogfoods workflow Plan/Edit through the live Pi chat tool surface", async () => {
    const apiKey = liveAmbientApiKey();
    applyLiveAmbientProviderApiKeyEnv(apiKey);
    const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
    const fixture = await createPlanEditFixtureWorkflow(store, workspacePath);
    const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
    const chatThreadId = workflowThread.chatThreadId;
    if (!chatThreadId) throw new Error("Workflow Plan/Edit chat thread was not created.");

    const emittedEvents: DesktopEvent[] = [];
    const runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
      () =>
        ({
          webContents: {
            send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
          },
        }) as any,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during workflow Plan/Edit dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    try {
      await runtime.send({
        threadId: chatThreadId,
        workflowThreadId: fixture.threadId,
        permissionMode: "full-access",
        collaborationMode: "planner",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live Workflow Agent Plan/Edit dogfood test.",
          `Use workflowThreadId exactly ${fixture.threadId}.`,
          "Inspect the current workflow with workflow_current_context and workflow_get_artifact.",
          "Create a manifest-only revision with workflow_propose_manifest_revision that changes maxModelCalls to 3 and maxToolCalls to 8.",
          "Do not change source or graph, and do not call workflow_propose_revision.",
          "Then call workflow_validate_revision and workflow_explain_revision_diff for the created revision.",
          "After the tools finish, answer with one short sentence containing PLAN_EDIT_DOGFOOD_OK and the revision id.",
          "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
        ].join("\n"),
      });
    } finally {
      await runtime.shutdownPluginMcpServers();
    }

    const revisions = store.listWorkflowRevisions(fixture.threadId);
    const transcriptMessages = store.listMessages(chatThreadId);
    const transcript = transcriptMessages.map((message) => message.content).join("\n");
    const toolNames = transcriptMessages
      .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
      .filter((value): value is string => Boolean(value));
    const toolMessages = transcriptMessages
      .filter((message) => message.role === "tool")
      .map((message) => ({
        toolName: typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined,
        status: typeof message.metadata?.status === "string" ? message.metadata.status : undefined,
        contentPreview: message.content.slice(0, 4000),
      }));
    const streamActivities = emittedEvents.flatMap((event) =>
      event.type === "runtime-activity" && event.activity.kind === "stream" ? [event.activity] : [],
    );
    const latestRevision = revisions[0];

    await writePlanEditDogfoodArtifact({
      workflowThreadId: fixture.threadId,
      chatThreadId,
      revisionCount: revisions.length,
      latestRevision: latestRevision
        ? {
            id: latestRevision.id,
            status: latestRevision.status,
            requestedChange: latestRevision.requestedChange,
            graphDiff: latestRevision.graphDiff,
            hasSourceDiff: Boolean(latestRevision.sourceDiff),
          }
        : undefined,
      toolNames,
      toolMessages,
      streamActivities: streamActivities.map((activity) => ({
        status: activity.status,
        outputChars: activity.outputChars,
        thinkingChars: activity.thinkingChars,
        idleElapsedMs: activity.idleElapsedMs,
        idleTimeoutMs: activity.idleTimeoutMs,
      })),
      transcriptPreview: transcript.slice(0, 4000),
    });

    expect(toolNames).toEqual(expect.arrayContaining(["workflow_current_context", "workflow_get_artifact"]));
    expect(toolNames).toContain("workflow_validate_revision");
    expect(toolNames).toContain("workflow_explain_revision_diff");
    expect(toolNames).toContain("workflow_propose_manifest_revision");
    expect(streamActivities.length).toBeGreaterThan(0);
    expect(transcript).toContain("PLAN_EDIT_DOGFOOD_OK");
    expect(latestRevision).toMatchObject({
      workflowThreadId: fixture.threadId,
      status: "proposed",
    });
    expect(latestRevision?.sourceDiff).toBeUndefined();
    const graphDiff = latestRevision?.graphDiff as WorkflowGraphDiff | undefined;
    expect(graphDiff?.addedNodes).toEqual([]);
    expect(graphDiff?.removedNodes).toEqual([]);
    expect(graphDiff?.changedNodes).toEqual([]);
    expect(graphDiff?.addedEdges).toEqual([]);
    expect(graphDiff?.removedEdges).toEqual([]);
    expect(graphDiff?.changedEdges).toEqual([]);
    expect(graphDiff?.manifest.fieldChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "maxToolCalls", before: 2, after: 8 }),
        expect.objectContaining({ field: "maxModelCalls", before: 1, after: 3 }),
      ]),
    );
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLivePlanEdit("dogfoods workflow-native run settings action transcript cards with live Pi", async () => {
    const apiKey = liveAmbientApiKey();
    applyLiveAmbientProviderApiKeyEnv(apiKey);
    const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
    const fixture = await createPlanEditFixtureWorkflow(store, workspacePath);
    const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
    const chatThreadId = workflowThread.chatThreadId;
    if (!chatThreadId) throw new Error("Workflow Plan/Edit chat thread was not created.");

    const emittedEvents: DesktopEvent[] = [];
    const runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
      () =>
        ({
          webContents: {
            send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
          },
        }) as any,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during workflow run-settings dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    try {
      await runtime.send({
        threadId: chatThreadId,
        workflowThreadId: fixture.threadId,
        permissionMode: "full-access",
        collaborationMode: "planner",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live Workflow Agent run-settings action card dogfood test.",
          `Use workflowThreadId exactly ${fixture.threadId}.`,
          "Call workflow_update_run_settings exactly once with action preview_foreground, idleTimeoutMs 300000, and clearMaxRunMs true.",
          "Do not call workflow_propose_manifest_revision, workflow_propose_revision, workflow_apply_revision, workflow_run_preview, or workflow_run_version.",
          "After the tool finishes, answer with one short sentence containing RUN_SETTINGS_DOGFOOD_OK.",
          "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
        ].join("\n"),
      });
    } finally {
      await runtime.shutdownPluginMcpServers();
    }

    const transcriptMessages = store.listMessages(chatThreadId);
    const transcript = transcriptMessages.map((message) => message.content).join("\n");
    const toolNames = transcriptMessages
      .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
      .filter((value): value is string => Boolean(value));
    const cards = workflowThreadTranscriptCards({
      thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
      artifact: store.getWorkflowArtifact(fixture.artifactId),
      chatMessages: transcriptMessages,
    });
    const actionCards = cards.filter((card) => card.kind === "action");

    await writePlanEditActionDogfoodArtifact({
      workflowThreadId: fixture.threadId,
      chatThreadId,
      toolNames,
      actionCards,
      streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
      transcriptPreview: transcript.slice(0, 4000),
    });

    expect(toolNames).toContain("workflow_update_run_settings");
    expect(toolNames).not.toContain("workflow_propose_manifest_revision");
    expect(transcript).toContain("RUN_SETTINGS_DOGFOOD_OK");
    expect(actionCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action",
          tone: "warning",
          title: "Run settings previewed",
          detail: "Foreground run settings preview only. Pass the returned runLimits to a workflow run action; no workflow revision was created.",
          badges: expect.arrayContaining(["Workflow action", "Run settings", "Preview Foreground", "Idle timeout 5m", "No total cap"]),
          panelActions: [{ id: "manifest", label: "Inspect limits", panel: "manifest" }],
        }),
      ]),
    );
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLivePlanEdit("dogfoods workflow-native run preview action transcript cards with live Pi", async () => {
    const apiKey = liveAmbientApiKey();
    applyLiveAmbientProviderApiKeyEnv(apiKey);
    const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
    const fixture = await createPlanEditFixtureWorkflow(store, workspacePath);
    const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
    const chatThreadId = workflowThread.chatThreadId;
    if (!chatThreadId) throw new Error("Workflow Plan/Edit chat thread was not created.");

    const emittedEvents: DesktopEvent[] = [];
    const runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
      () =>
        ({
          webContents: {
            send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
          },
        }) as any,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during workflow run-preview dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    try {
      await runtime.send({
        threadId: chatThreadId,
        workflowThreadId: fixture.threadId,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live Workflow Agent run-preview action card dogfood test.",
          `Use workflowThreadId exactly ${fixture.threadId}.`,
          "Call workflow_run_preview exactly once with idleTimeoutMs 120000 and clearMaxRunMs true.",
          "Do not call workflow_update_run_settings, workflow_run_version, workflow_apply_revision, workflow_restore_version, or any proposal tools.",
          "After the tool finishes, answer with one short sentence containing RUN_PREVIEW_DOGFOOD_OK and the run id.",
          "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
        ].join("\n"),
      });
    } finally {
      await runtime.shutdownPluginMcpServers();
    }

    const transcriptMessages = store.listMessages(chatThreadId);
    const transcript = transcriptMessages.map((message) => message.content).join("\n");
    const toolNames = transcriptMessages
      .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
      .filter((value): value is string => Boolean(value));
    const cards = workflowThreadTranscriptCards({
      thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
      artifact: store.getWorkflowArtifact(fixture.artifactId),
      chatMessages: transcriptMessages,
    });
    const actionCards = cards.filter((card) => card.kind === "action");
    const previewActionCard = actionCards.find((card) => card.title.startsWith("Preview run"));

    await writePlanEditPreviewDogfoodArtifact({
      workflowThreadId: fixture.threadId,
      chatThreadId,
      toolNames,
      actionCards,
      previewActionCard,
      streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
      transcriptPreview: transcript.slice(0, 4000),
    });

    expect(toolNames).toContain("workflow_run_preview");
    expect(toolNames).not.toContain("workflow_update_run_settings");
    expect(transcript).toContain("RUN_PREVIEW_DOGFOOD_OK");
    expect(previewActionCard).toMatchObject({
      kind: "action",
      tone: "success",
      title: "Preview run completed",
      detail: expect.stringContaining("Dry-run preview completed with run"),
      badges: expect.arrayContaining(["Workflow action", "Run preview", "Done", "Succeeded", "1 model call", "Idle timeout 2m", "No total cap"]),
      panelActions: expect.arrayContaining([
        { id: "run_console", label: "Open run console", panel: "run_console" },
        { id: "outputs", label: "Inspect outputs", panel: "outputs" },
      ]),
    });
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLivePlanEdit("dogfoods workflow-native approved-version run action transcript cards with live Pi", async () => {
    const apiKey = liveAmbientApiKey();
    applyLiveAmbientProviderApiKeyEnv(apiKey);
    const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
    const fixture = await createPlanEditFixtureWorkflow(store, workspacePath);
    const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
    const chatThreadId = workflowThread.chatThreadId;
    if (!chatThreadId) throw new Error("Workflow approved-version chat thread was not created.");

    const emittedEvents: DesktopEvent[] = [];
    const runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
      () =>
        ({
          webContents: {
            send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
          },
        }) as any,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during workflow run-version dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    try {
      await runtime.send({
        threadId: chatThreadId,
        workflowThreadId: fixture.threadId,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live Workflow Agent approved-version run action card dogfood test.",
          `Use workflowThreadId exactly ${fixture.threadId}.`,
          `Use versionId exactly ${fixture.versionId}.`,
          "Call workflow_run_version exactly once with idleTimeoutMs 120000 and clearMaxRunMs true.",
          "Do not call workflow_run_preview, workflow_update_run_settings, workflow_apply_revision, workflow_restore_version, or any proposal tools.",
          "After the tool finishes, answer with one short sentence containing RUN_VERSION_DOGFOOD_OK and the run id.",
          "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
        ].join("\n"),
      });
    } finally {
      await runtime.shutdownPluginMcpServers();
    }

    const transcriptMessages = store.listMessages(chatThreadId);
    const transcript = transcriptMessages.map((message) => message.content).join("\n");
    const toolNames = transcriptMessages
      .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
      .filter((value): value is string => Boolean(value));
    const cards = workflowThreadTranscriptCards({
      thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
      artifact: store.getWorkflowArtifact(fixture.artifactId),
      chatMessages: transcriptMessages,
    });
    const actionCards = cards.filter((card) => card.kind === "action");
    const runActionCard = actionCards.find((card) => card.title.startsWith("Workflow run"));
    const latestRun = store.listWorkflowRuns(fixture.artifactId, 1)[0];
    if (!latestRun) throw new Error("workflow_run_version did not create a workflow run.");
    const detail = readWorkflowRunDetail(store, latestRun.id);
    const graph = store.listWorkflowGraphSnapshots(fixture.threadId)[0];
    const runtimeGraph = workflowGraphWithRunEvents(graph, detail.events);
    const graphEventCards = workflowGraphEventCards(detail.events, graph, {
      checkpoints: detail.checkpoints,
      modelCalls: detail.modelCalls,
      limit: 8,
    });
    const draftNode = runtimeGraph.nodes.find((node) => node.id === "draft-list");

    await writePlanEditRunVersionDogfoodArtifact({
      workflowThreadId: fixture.threadId,
      chatThreadId,
      versionId: fixture.versionId,
      toolNames,
      actionCards,
      runActionCard,
      run: latestRun,
      runEventTypes: detail.events.map((event) => event.type),
      graphNodeStates: runtimeGraph.nodes.map((node) => ({ id: node.id, state: node.runState })),
      graphEventCards: graphEventCards.map((card) => ({
        label: card.label,
        graphNodeId: card.graphNodeId,
        nodeLabel: card.nodeLabel,
        state: card.state,
        summaries: card.summaries,
      })),
      streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
      transcriptPreview: transcript.slice(0, 4000),
    });

    expect(toolNames).toContain("workflow_run_version");
    expect(toolNames).not.toContain("workflow_run_preview");
    expect(toolNames).not.toContain("workflow_update_run_settings");
    expect(transcript).toContain("RUN_VERSION_DOGFOOD_OK");
    expect(latestRun).toMatchObject({ artifactId: fixture.artifactId, status: "succeeded" });
    expect(detail.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "workflow.succeeded" })]));
    expect(detail.modelCalls).toHaveLength(1);
    expect(detail.checkpoints).toEqual(expect.arrayContaining([expect.objectContaining({ key: "readingList" })]));
    expect(draftNode).toMatchObject({ runState: "completed" });
    expect(graphEventCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          graphNodeId: "draft-list",
          nodeLabel: "Draft list",
        }),
      ]),
    );
    expect(runActionCard).toMatchObject({
      kind: "action",
      tone: "success",
      title: "Workflow run completed",
      detail: expect.stringContaining("Workflow execution completed with run"),
      badges: expect.arrayContaining(["Workflow action", "Run workflow", "Done", "Succeeded", "1 model call", "1 checkpoint", "Idle timeout 2m", "No total cap"]),
      panelActions: expect.arrayContaining([
        { id: "run_console", label: "Open run console", panel: "run_console" },
        { id: "outputs", label: "Inspect outputs", panel: "outputs" },
        { id: "permissions", label: "Inspect audit", panel: "permissions" },
      ]),
    });
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLivePlanEdit("dogfoods workflow-native apply and restore action transcript cards with live Pi", async () => {
    const apiKey = liveAmbientApiKey();
    applyLiveAmbientProviderApiKeyEnv(apiKey);
    const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
    const fixture = await createApplyRestoreFixtureWorkflow(store, workspacePath);
    const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
    const chatThreadId = workflowThread.chatThreadId;
    if (!chatThreadId) throw new Error("Workflow apply/restore chat thread was not created.");

    const proposal = await invokeWorkflowNativeTool(
      {
        store,
        workspacePath,
        permissionMode: "full-access",
        planEditIntentKind: "manifest_limits",
        defaultWorkflowThreadId: fixture.threadId,
      },
      {
        toolName: "workflow_propose_manifest_revision",
        arguments: {
          requestedChange: "Raise fixture model/tool budgets before immediately restoring the original approved version.",
          maxModelCalls: 2,
          maxToolCalls: 5,
        },
      },
    );
    const revisionId = (proposal.data as { revision?: { id?: string } }).revision?.id;
    if (!revisionId) throw new Error(`Manifest proposal did not return a revision id: ${proposal.text}`);

    const emittedEvents: DesktopEvent[] = [];
    const runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
      () =>
        ({
          webContents: {
            send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
          },
        }) as any,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during workflow apply/restore dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    try {
      await runtime.send({
        threadId: chatThreadId,
        workflowThreadId: fixture.threadId,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live Workflow Agent apply/restore action card dogfood test.",
          `Use workflowThreadId exactly ${fixture.threadId}.`,
          `First call workflow_apply_revision exactly once with revisionId ${revisionId}.`,
          `Then call workflow_restore_version exactly once with versionId ${fixture.versionId} and approveRestored true.`,
          "Do not call workflow_run_preview, workflow_run_version, workflow_update_run_settings, workflow_apply_revision more than once, workflow_restore_version more than once, or any proposal tools.",
          "After both tools finish, answer with one short sentence containing APPLY_RESTORE_DOGFOOD_OK and the restored version id.",
          "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
        ].join("\n"),
      });
    } finally {
      await runtime.shutdownPluginMcpServers();
    }

    const transcriptMessages = store.listMessages(chatThreadId);
    const transcript = transcriptMessages.map((message) => message.content).join("\n");
    const toolNames = transcriptMessages
      .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
      .filter((value): value is string => Boolean(value));
    const cards = workflowThreadTranscriptCards({
      thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
      artifact: store.getWorkflowArtifact(fixture.artifactId),
      chatMessages: transcriptMessages,
    });
    const actionCards = cards.filter((card) => card.kind === "action");
    const applyActionCard = actionCards.find((card) => card.title === "Workflow revision applied");
    const restoreActionCard = actionCards.find((card) => card.title === "Workflow version restored");
    const versions = store.listWorkflowVersions(fixture.threadId);
    const thread = store.getWorkflowAgentThreadSummary(fixture.threadId);
    const activeArtifact = store.getWorkflowArtifact(thread.activeArtifactId!);
    const appliedRevision = store.getWorkflowRevision(revisionId);

    await writePlanEditApplyRestoreDogfoodArtifact({
      workflowThreadId: fixture.threadId,
      chatThreadId,
      revisionId,
      originalVersionId: fixture.versionId,
      toolNames,
      actionCards,
      applyActionCard,
      restoreActionCard,
      appliedRevision,
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        createdBy: version.createdBy,
        artifactId: version.artifactId,
      })),
      activeArtifact: {
        id: activeArtifact.id,
        status: activeArtifact.status,
        manifest: activeArtifact.manifest,
      },
      streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
      transcriptPreview: transcript.slice(0, 4000),
    });

    expect(toolNames).toContain("workflow_apply_revision");
    expect(toolNames).toContain("workflow_restore_version");
    expect(toolNames).not.toContain("workflow_run_preview");
    expect(toolNames).not.toContain("workflow_run_version");
    expect(toolNames).not.toContain("workflow_update_run_settings");
    expect(transcript).toContain("APPLY_RESTORE_DOGFOOD_OK");
    expect(appliedRevision).toMatchObject({ id: revisionId, status: "applied" });
    expect(versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.versionId, version: 1, status: "approved", createdBy: "compiler" }),
        expect.objectContaining({ version: 2, status: "approved", createdBy: "workflow_revision" }),
        expect.objectContaining({ version: 3, status: "approved", createdBy: "version_revert" }),
      ]),
    );
    expect(thread.latestVersion).toMatchObject({ version: 3, status: "approved", createdBy: "version_revert" });
    expect(activeArtifact).toMatchObject({
      id: fixture.artifactId,
      status: "approved",
      manifest: expect.objectContaining({ maxModelCalls: 1, maxToolCalls: 2 }),
    });
    expect(applyActionCard).toMatchObject({
      kind: "action",
      tone: "success",
      title: "Workflow revision applied",
      badges: expect.arrayContaining(["Workflow action", "Apply revision", "Done", "Full Access audited", "Version 2"]),
      panelActions: expect.arrayContaining([
        { id: "diagram", label: "Inspect diagram", panel: "diagram" },
        { id: "versions", label: "Inspect version", panel: "versions" },
        { id: "permissions", label: "Inspect audit", panel: "permissions" },
      ]),
    });
    expect(restoreActionCard).toMatchObject({
      kind: "action",
      tone: "success",
      title: "Workflow version restored",
      badges: expect.arrayContaining(["Workflow action", "Restore version", "Done", "Target 1", "Restored 3", "Approved restored version", "Full Access audited"]),
      panelActions: expect.arrayContaining([
        { id: "versions", label: "Inspect versions", panel: "versions" },
        { id: "diagram", label: "Inspect diagram", panel: "diagram" },
        { id: "permissions", label: "Inspect audit", panel: "permissions" },
      ]),
    });
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods a workflow-safe plugin MCP tool with a live Ambient runtime call", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const pluginRoot = join(workspacePath, "plugins", "ambient-fixture");
    await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRoot, { recursive: true });
    const plugin = fixtureCodexMcpPlugin(pluginRoot);
    const registrations = await buildPluginMcpToolRegistrations([plugin], { timeoutMs: 4_000, permissionMode: "full-access" });
    const registration = registrations.find((candidate) => candidate.originalName === "ambient_fixture_workspace_summary");
    if (!registration) throw new Error("Fixture MCP registration was not built.");
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Use a trusted workflow-safe plugin MCP tool and summarize the evidence.",
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a read-only workflow that calls the trusted ambient fixture MCP plugin tool, asks Ambient to summarize the plugin result, and checkpoints the summary.",
      workspaceSummary: "Plugin MCP workflow dogfood with the trusted ambient-fixture plugin available as ambient_fixture_workspace_summary.",
      toolDescriptors: [...firstPartyDesktopToolDescriptors(), registration.descriptor],
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => pluginMcpSummaryCompilerOutput(workflowPluginCapabilityGrant(registration))) },
    });
    const artifact = dashboard.artifacts[0];
    const runDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      pluginRegistrations: [registration],
      ensurePluginTrusted: vi.fn(async () => true),
      model,
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 180_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const detail = readWorkflowRunDetail(store, run.id);
    const state = (existsSync(artifact.statePath) ? JSON.parse(await readFile(artifact.statePath, "utf8")) : { checkpoints: {} }) as {
      checkpoints?: Record<string, { value?: { summary?: { summary?: string; pluginTool?: string; evidence?: string[] }; pluginText?: string }; runId?: string }>;
    };

    await writePluginMcpRunDogfoodArtifact({
      plugin: { id: plugin.id, name: plugin.name, rootPath: plugin.rootPath },
      registration: {
        registeredName: registration.registeredName,
        originalName: registration.originalName,
        pluginName: registration.tool.pluginName,
        serverName: registration.tool.serverName,
      },
      run: { id: run.id, status: run.status, error: run.error },
      eventCounts: eventCountsByType(detail.events),
      pluginEvents: detail.events.filter((event) => event.type.startsWith("plugin-mcp") || event.message === registration.registeredName).map((event) => ({
        type: event.type,
        message: event.message,
      })),
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs, model: call.model })),
      checkpoint: state.checkpoints?.pluginMcpSummary?.value,
    });

    expect(run).toMatchObject({ status: "succeeded" });
    expect(detail.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["desktop-tool.start", "plugin-mcp.start", "plugin-mcp.end", "desktop-tool.end", "ambient.call.progress", "checkpoint.write", "workflow.succeeded"]),
    );
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.plugin_mcp_summary", status: "succeeded" })]));
    expect(state.checkpoints?.pluginMcpSummary?.value?.pluginText).toMatch(/Ambient fixture MCP summary/);
    expect(state.checkpoints?.pluginMcpSummary?.value?.summary?.summary).toMatch(/fixture|plugin|MCP|workspace/i);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods exploration trace to deterministic workflow execution", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    await writeFile(
      join(workspacePath, "event_sources.md"),
      [
        "# Event Source Notes",
        "- Local seed categories: parks, library activities, museums.",
        "- Verify dates externally before recommending a real outing.",
        "- Output should preserve source provenance.",
      ].join("\n"),
      "utf8",
    );
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Exploration to deterministic dogfood",
      initialRequest: "Explore event_sources.md, then compile a deterministic workflow that reads the file and summarizes the source strategy.",
      projectPath: workspacePath,
      traceMode: "debug",
      phase: "planned",
    });
    const exploration = await runWorkflowThreadExploration({
      store,
      workflowThreadId: thread.id,
      workspacePath,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      permissionMode: "full-access",
      provider: sequenceExplorationProvider([
        { action: "call_tool", toolName: "file_read", input: { path: "event_sources.md" }, reason: "Inspect local seed source notes before deterministic compile." },
        {
          action: "finish",
          distillation: {
            summary: "Compile a deterministic workflow that reads event_sources.md and asks Ambient to summarize the source strategy with provenance.",
            observedCalls: [{ kind: "tool", name: "file_read", status: "succeeded", inputSummary: "event_sources.md", outputSummary: "Local event source notes" }],
            successfulPatterns: ["Use file_read for local seed notes before model synthesis."],
            dataShapes: ["markdown notes with seed categories, verification warning, provenance requirement"],
            requiredGrants: ["workspace file read"],
            deterministicSourceStrategy: "Read event_sources.md, call Ambient once for a structured strategy summary, and checkpoint the result.",
            unresolvedQuestions: [],
          },
        },
      ]),
      budgets: { maxModelTurns: 3, maxToolCalls: 1, maxElapsedMs: 60_000 },
    });
    let compilerPrompt = "";
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Compile the deterministic workflow from the persisted exploration trace.",
      workspaceSummary: "Exploration-to-deterministic dogfood. Use the observed file_read pattern from the thread exploration trace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: {
        compileProgramIr: vi.fn(async (input) => {
          compilerPrompt = input.prompt;
          return explorationDrivenCompilerOutput("event_sources.md");
        }),
      },
    });
    const artifact = dashboard.artifacts[0];
    const compileContext = await readFile(join(dirname(artifact.sourcePath), "compile-context.json"), "utf8");

    expect(compilerPrompt).toContain("Workflow exploration traces:");
    expect(compilerPrompt).toContain(exploration.trace.id);
    expect(compilerPrompt).toContain("event_sources.md");
    expect(compileContext).toContain(exploration.trace.id);
    expect(store.listWorkflowExplorationTraces(thread.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: exploration.trace.id })]));

    const runDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      model,
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const detail = readWorkflowRunDetail(store, run.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { path?: string; strategy?: { summary?: string; provenance?: string[] } }; runId?: string }>;
    };

    await writeExplorationToDeterministicDogfoodArtifact({
      threadId: thread.id,
      explorationTraceId: exploration.trace.id,
      explorationObservationNames: exploration.trace.observations
        .map((observation) => (observation && typeof observation === "object" && "name" in observation ? String(observation.name) : "unknown")),
      artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId },
      run: { id: run.id, status: run.status, error: run.error },
      eventCounts: eventCountsByType(detail.events),
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs, model: call.model })),
      checkpoint: state.checkpoints?.explorationDrivenStrategy?.value,
    });

    expect(run).toMatchObject({ status: "succeeded" });
    expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "file_read")).toHaveLength(1);
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.exploration_driven_strategy", status: "succeeded" })]));
    expect(state.checkpoints?.explorationDrivenStrategy?.value?.strategy?.summary).toMatch(/source|event|provenance|verify/i);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods live capability-aware Gmail discovery into exploration preflight", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
        "google.calendar": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
        "google.drive": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    });
    const gmailDescriptor = connectorDescriptors.find((descriptor) => descriptor.id === "google.gmail");
    if (!gmailDescriptor) throw new Error("Google Workspace Gmail connector descriptor was not available.");
    const request =
      "Review my last 10 Gmail emails and produce a read-only categorization report grouped by urgency, action required, sender domain, and recurring theme.";
    const discoveryProgress: unknown[] = [];
    const discovery = await startWorkflowDiscovery(
      store,
      {
        initialRequest: request,
        projectPath: workspacePath,
      },
      {
        connectorDescriptors,
        provider: new AmbientWorkflowDiscoveryProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          model,
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          idleTimeoutMs: 120_000,
        }),
        onProgress: (progress) => discoveryProgress.push(progress),
      },
    );
    const capabilitySearch = discovery.thread.discoveryQuestions.find((question) => question.capabilitySearch)?.capabilitySearch;
    if (!capabilitySearch) throw new Error("Live discovery did not persist capability-search metadata.");
    const serializedQuestions = JSON.stringify(discovery.thread.discoveryQuestions);
    const gate = workflowExplorationGateModel({
      chatTurnCount: 1,
      capabilitySearch,
    });
    const preflight = workflowExplorationPreflightModel({
      gate,
      thread: discovery.thread,
    });
    const connectorCalls: unknown[] = [];
    const exploration = await runWorkflowThreadExploration({
      store,
      workflowThreadId: discovery.thread.id,
      workspacePath,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [gmailDescriptor],
      permissionMode: "full-access",
      provider: sequenceExplorationProvider([
        {
          action: "call_connector",
          connectorId: "google.gmail",
          operation: "search",
          accountId: "default",
          input: { query: "newer_than:30d", maxResults: 10, readThread: false },
          reason: "Verify the Gmail search shape and connector budget before deterministic compile.",
          nodeId: "gmail-search-shape",
        },
        {
          action: "finish",
          distillation: {
            summary: "Gmail connector metadata and search result shape are sufficient for deterministic compile planning.",
            observedCalls: [
              {
                kind: "connector",
                name: "google.gmail.search",
                status: "succeeded",
                inputSummary: "newer_than:30d, maxResults 10, no message bodies",
                outputSummary: "10 redacted Gmail message metadata rows and next-page cursor shape",
              },
            ],
            successfulPatterns: ["Use google.gmail.search for bounded message ids, then readThread only for selected threads when the user grants Gmail read access."],
            dataShapes: ["messages[].id, threadId, snippet, internalDate, fromDomain, labelIds; nextPageToken for pagination"],
            requiredGrants: ["Gmail read grant for message metadata and thread reads"],
            recommendedGraph: {
              summary: "Request -> Gmail search -> selected thread reads -> Ambient categorization -> rendered report.",
              nodes: [
                { id: "request", type: "request", label: "Gmail report request", description: request },
                {
                  id: "gmail-search",
                  type: "connector_call",
                  label: "Search Gmail",
                  description: "Search recent Gmail messages with a bounded maxResults limit.",
                  connectorIds: ["google.gmail"],
                },
                {
                  id: "ambient-categorize",
                  type: "model_call",
                  label: "Categorize emails",
                  description: "Categorize redacted message evidence by urgency, action, sender domain, and theme.",
                },
                { id: "output", type: "output", label: "Rendered report", description: "Return a readable categorization report." },
              ],
              edges: [
                { id: "request-search", source: "request", target: "gmail-search", type: "control_flow" },
                { id: "search-model", source: "gmail-search", target: "ambient-categorize", type: "data_flow" },
                { id: "model-output", source: "ambient-categorize", target: "output", type: "data_flow" },
              ],
            },
            recommendedManifest: {
              connectors: [
                {
                  connectorId: "google.gmail",
                  accountId: "default",
                  scopes: ["gmail.readonly"],
                  operations: ["search", "readThread"],
                  dataRetention: "redacted_audit",
                },
              ],
              maxConnectorCalls: 11,
              mutationPolicy: "read_only",
            },
            deterministicSourceStrategy:
              "Search Gmail with maxResults 10, read only the threads needed for categorization, preserve redacted snippets, and ask Ambient for the final report.",
            unresolvedQuestions: [],
          },
        },
      ]),
      connectorCaller: async (input) => {
        connectorCalls.push(input);
        if (input.connectorId !== "google.gmail" || input.operation !== "search") {
          throw new Error(`Unexpected connector exploration call: ${input.connectorId}.${input.operation}`);
        }
        return {
          messages: Array.from({ length: 10 }, (_, index) => ({
            id: `message-${index + 1}`,
            threadId: `thread-${Math.floor(index / 2) + 1}`,
            snippet: `Redacted message ${index + 1} preview`,
            fromDomain: index % 2 === 0 ? "example.com" : "ambient.test",
            labelIds: index % 3 === 0 ? ["INBOX", "IMPORTANT"] : ["INBOX"],
          })),
          nextPageToken: "cursor-redacted",
          redacted: true,
        };
      },
      budgets: { maxModelTurns: 2, maxConnectorCalls: 1, maxElapsedMs: 60_000 },
    });

    await writeCapabilityAwareDiscoveryDogfoodArtifact({
      threadId: discovery.thread.id,
      providerQuestions: discovery.thread.discoveryQuestions.map((question) => ({
        id: question.id,
        category: question.category,
        provider: question.provider,
        providerModel: question.providerModel,
        question: question.question,
        context: question.context,
        accessRequests: question.accessRequests?.map((request) => ({
          capability: request.capability,
          targetLabel: request.targetLabel,
          recommendedResponse: request.recommendedResponse,
        })),
        activityEvents: question.activityEvents?.map((event) => ({ kind: event.kind, status: event.status, label: event.label, detail: event.detail })),
      })),
      capabilitySearch,
      gate,
      preflight,
      discoveryProgressTail: discoveryProgress.slice(-8),
      explorationTraceId: exploration.trace.id,
      explorationEvents: exploration.trace.events.map((event) => ({ type: event.type, message: event.message, data: event.data })).slice(-12),
      explorationObservations: exploration.result.observations.map((observation) => ({
        action: observation.action,
        name: observation.name,
        status: observation.status,
        inputSummary: observation.inputSummary,
        outputSummary: observation.outputSummary,
      })),
      connectorCalls,
      distillation: exploration.result.distillation,
    });

    expect(capabilitySearch.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "connector",
          connectorId: "google.gmail",
          label: "Gmail",
          permissionCapability: "connector_content",
        }),
      ]),
    );
    expect(capabilitySearch.results.find((result) => result.connectorId === "google.calendar")).toBeUndefined();
    expect(capabilitySearch.results.find((result) => result.connectorId === "google.drive")).toBeUndefined();
    expect(serializedQuestions).toMatch(/gmail|email|mail|inbox/i);
    expect(serializedQuestions).not.toContain("message body fixture");
    expect(discovery.thread.discoveryQuestions[0]?.activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability_search",
          status: "completed",
          detail: expect.stringContaining("Gmail"),
        }),
      ]),
    );
    expect(discovery.thread.discoveryQuestions[0]?.accessRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "connector_content",
          targetLabel: expect.stringContaining("Gmail content"),
          recommendedResponse: "allow_once",
        }),
      ]),
    );
    expect(gate).toMatchObject({
      state: "recommended",
      detail: expect.stringContaining("Capability search found Gmail"),
      reasonLabels: expect.arrayContaining(["Connector: Gmail"]),
    });
    expect(preflight.sections.find((section) => section.id === "likely_access")?.items).toEqual(expect.arrayContaining(["Connector metadata: Gmail"]));
    expect(preflight.sections.find((section) => section.id === "grants")?.items.join("\n")).toContain("Connector read grant: Gmail content");
    expect(exploration.result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "call_connector",
          name: "google.gmail.search",
          status: "succeeded",
        }),
      ]),
    );
    expect(exploration.result.distillation.requiredGrants.join("\n")).toMatch(/Gmail read/i);
    expect(connectorCalls).toEqual([
      expect.objectContaining({
        connectorId: "google.gmail",
        operation: "search",
        accountId: "default",
      }),
    ]);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods live capability-aware Ambient CLI arxiv discovery into exploration preflight", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const installStatuses = await ensureFirstPartyAmbientCliPackages(workspacePath, { packageNames: ["pi-arxiv"] });
    expect(installStatuses).toEqual([
      expect.objectContaining({
        packageName: "pi-arxiv",
        status: expect.stringMatching(/^(installed|already_installed)$/),
      }),
    ]);
    const request = "Find recent papers on the placebo effect from arxiv and create concise summaries of them.";
    const discoveryProgress: unknown[] = [];
    const discovery = await startWorkflowDiscovery(
      store,
      {
        initialRequest: request,
        projectPath: workspacePath,
      },
      {
        provider: new AmbientWorkflowDiscoveryProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          model,
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          idleTimeoutMs: 120_000,
        }),
        onProgress: (progress) => discoveryProgress.push(progress),
      },
    );
    const capabilitySearch = discovery.thread.discoveryQuestions.find((question) => question.capabilitySearch)?.capabilitySearch;
    if (!capabilitySearch) throw new Error("Live arxiv discovery did not persist capability-search metadata.");
    const arxivCapability = capabilitySearch.results.find((result) => result.kind === "ambient_cli" && result.label === "pi-arxiv:arxiv_search");
    if (!arxivCapability?.capabilityId) throw new Error(`Live arxiv discovery did not find pi-arxiv:arxiv_search. Results: ${JSON.stringify(capabilitySearch.results)}`);
    const serializedQuestions = JSON.stringify(discovery.thread.discoveryQuestions);
    const gate = workflowExplorationGateModel({
      chatTurnCount: 1,
      capabilitySearch,
    });
    const preflight = workflowExplorationPreflightModel({
      gate,
      thread: discovery.thread,
    });
    const cliSearch = await searchAmbientCliCapabilities(workspacePath, {
      query: request,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    const ambientCliCapabilities = cliSearch.results.flatMap((result) =>
      result.commands.map((command) => ({
        capabilityId: command.capabilityId,
        registryPluginId: result.registryPluginId,
        packageId: result.packageId,
        packageName: result.packageName,
        command: command.name,
      })),
    );
    const exploration = await runWorkflowThreadExploration({
      store,
      workflowThreadId: discovery.thread.id,
      workspacePath,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      permissionMode: "full-access",
      ambientCliCapabilities,
      provider: sequenceExplorationProvider([
        {
          action: "call_tool",
          toolName: "ambient_cli",
          input: { packageName: "pi-arxiv", command: "arxiv_search", args: ["placebo effect", "--max-results", "3", "--sort-by", "submittedDate"] },
          reason: "Verify the installed arxiv search command shape and retained evidence before deterministic compile.",
          nodeId: "arxiv-search-shape",
        },
        {
          action: "finish",
          distillation: {
            summary: "Installed pi-arxiv can provide bounded arxiv search evidence for deterministic workflow compilation.",
            observedCalls: [
              {
                kind: "tool",
                name: "ambient_cli.pi-arxiv.arxiv_search",
                status: "succeeded",
                inputSummary: "placebo effect, maxResults 3",
                outputSummary: "Bounded arxiv search stdout with paper metadata.",
              },
            ],
            successfulPatterns: ["Use pi-arxiv:arxiv_search for query discovery, then pi-arxiv:arxiv_paper for selected IDs when full abstracts/details are needed."],
            dataShapes: ["stdout text includes arxiv ids, titles, authors, dates, summaries, and source URLs"],
            requiredGrants: ["Ambient CLI execution grant for pi-arxiv arxiv_search and arxiv_paper commands"],
            recommendedGraph: {
              summary: "Request -> pi-arxiv search -> paper detail selection -> Ambient summary report.",
              nodes: [
                { id: "request", type: "request", label: "Arxiv summary request", description: request },
                {
                  id: "arxiv-search",
                  type: "deterministic_step",
                  label: "Search arxiv via pi-arxiv",
                  description: "Call ambient_cli pi-arxiv:arxiv_search with a bounded query and max-results limit.",
                  toolNames: ["ambient_cli"],
                },
                {
                  id: "ambient-summarize",
                  type: "model_call",
                  label: "Summarize papers",
                  description: "Summarize retained arxiv paper evidence into concise user-facing notes.",
                },
                { id: "output", type: "output", label: "Rendered summary report", description: "Return concise summaries with source links." },
              ],
              edges: [
                { id: "request-search", source: "request", target: "arxiv-search", type: "control_flow" },
                { id: "search-model", source: "arxiv-search", target: "ambient-summarize", type: "data_flow" },
                { id: "model-output", source: "ambient-summarize", target: "output", type: "data_flow" },
              ],
            },
            recommendedManifest: {
              tools: ["ambient_cli", "ambient.responses"],
              ambientCliCapabilities,
              mutationPolicy: "read_only",
              maxToolCalls: 4,
              maxModelCalls: 1,
            },
            deterministicSourceStrategy:
              "Call ambient_cli with pi-arxiv:arxiv_search for a bounded query, optionally fetch selected papers with arxiv_paper, materialize full stdout, and ask Ambient for the final report from retained evidence only.",
            unresolvedQuestions: [],
          },
        },
      ]),
      budgets: { maxModelTurns: 2, maxToolCalls: 1, maxConnectorCalls: 0, maxAmbientCalls: 0, maxElapsedMs: 120_000 },
    });

    await writeCapabilityAwareAmbientCliDiscoveryDogfoodArtifact({
      installStatuses,
      threadId: discovery.thread.id,
      providerQuestions: discovery.thread.discoveryQuestions.map((question) => ({
        id: question.id,
        category: question.category,
        provider: question.provider,
        providerModel: question.providerModel,
        question: question.question,
        context: question.context,
        accessRequests: question.accessRequests?.map((request) => ({
          capability: request.capability,
          targetLabel: request.targetLabel,
          recommendedResponse: request.recommendedResponse,
        })),
        activityEvents: question.activityEvents?.map((event) => ({ kind: event.kind, status: event.status, label: event.label, detail: event.detail })),
      })),
      capabilitySearch,
      gate,
      preflight,
      discoveryProgressTail: discoveryProgress.slice(-8),
      ambientCliCapabilities,
      explorationTraceId: exploration.trace.id,
      explorationEvents: exploration.trace.events.map((event) => ({ type: event.type, message: event.message, data: event.data })).slice(-12),
      explorationObservations: exploration.result.observations.map((observation) => ({
        action: observation.action,
        name: observation.name,
        status: observation.status,
        inputSummary: observation.inputSummary,
        outputSummary: observation.outputSummary,
      })),
      distillation: exploration.result.distillation,
    });

    expect(arxivCapability).toMatchObject({
      kind: "ambient_cli",
      label: "pi-arxiv:arxiv_search",
      permissionCapability: "plugin_tool_execute",
      targetLabel: "Ambient CLI/pi-arxiv:arxiv_search",
    });
    expect(serializedQuestions).toMatch(/pi-arxiv|arxiv_search|Ambient CLI|arxiv/i);
    expect(discovery.thread.discoveryQuestions[0]?.activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability_search",
          status: "completed",
          detail: expect.stringContaining("pi-arxiv:arxiv_search"),
        }),
      ]),
    );
    expect(discovery.thread.discoveryQuestions[0]?.accessRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "plugin_tool_execute",
          targetLabel: "Ambient CLI/pi-arxiv:arxiv_search",
          recommendedResponse: "allow_once",
        }),
      ]),
    );
    expect(gate).toMatchObject({
      state: "recommended",
      detail: expect.stringContaining("Capability search found pi-arxiv:arxiv_search"),
      reasonLabels: expect.arrayContaining(["Ambient CLI: pi-arxiv:arxiv_search"]),
    });
    expect(preflight.sections.find((section) => section.id === "likely_access")?.items).toEqual(
      expect.arrayContaining(["Ambient CLI capability: pi-arxiv:arxiv_search"]),
    );
    expect(preflight.sections.find((section) => section.id === "grants")?.items.join("\n")).toContain(
      "Ambient CLI execution grant: Ambient CLI/pi-arxiv:arxiv_search",
    );
    expect(exploration.result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "call_tool",
          name: "ambient_cli",
          status: "succeeded",
          outputSummary: expect.stringMatching(/arxiv|placebo|paper/i),
        }),
      ]),
    );
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods Ambient CLI exploration trace into compiled arxiv workflow execution", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const installStatuses = await ensureFirstPartyAmbientCliPackages(workspacePath, { packageNames: ["pi-arxiv"] });
    const request = "Find recent papers on the placebo effect from arxiv and create concise summaries of them.";
    const cliSearch = await searchAmbientCliCapabilities(workspacePath, {
      query: request,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    const ambientCliCapabilities = cliSearch.results.flatMap((result) =>
      result.commands.map((command) => ({
        capabilityId: command.capabilityId,
        registryPluginId: result.registryPluginId,
        packageId: result.packageId,
        packageName: result.packageName,
        command: command.name,
      })),
    );
    const arxivSearchGrant = ambientCliCapabilities.find((capability) => capability.packageName === "pi-arxiv" && capability.command === "arxiv_search");
    if (!arxivSearchGrant) throw new Error(`pi-arxiv arxiv_search capability was not available: ${JSON.stringify(cliSearch)}`);
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Arxiv Ambient CLI exploration compile",
      initialRequest: request,
      projectPath: workspacePath,
      traceMode: "debug",
      phase: "planned",
    });
    const exploration = await runWorkflowThreadExploration({
      store,
      workflowThreadId: thread.id,
      workspacePath,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      permissionMode: "full-access",
      ambientCliCapabilities,
      provider: sequenceExplorationProvider([
        {
          action: "call_tool",
          toolName: "ambient_cli",
          input: { packageName: "pi-arxiv", command: "arxiv_search", args: ["placebo effect", "--max-results", "2", "--sort-by", "submittedDate"] },
          reason: "Verify the installed arxiv command and capture bounded stdout before deterministic compile.",
          nodeId: "arxiv-search-evidence",
        },
        {
          action: "finish",
          distillation: {
            summary: "The installed pi-arxiv command returned bounded paper metadata that can seed deterministic workflow generation.",
            observedCalls: [
              {
                kind: "tool",
                name: "ambient_cli.pi-arxiv.arxiv_search",
                status: "succeeded",
                inputSummary: "placebo effect, max results 2, newest first",
                outputSummary: "arxiv IDs, titles, authors, dates, summaries, and links",
              },
            ],
            successfulPatterns: ["Call pi-arxiv:arxiv_search with a bounded query before Ambient synthesis."],
            dataShapes: ["stdout text contains paper metadata and summaries suitable for a compact final Ambient call"],
            requiredGrants: ["Ambient CLI execution grant for pi-arxiv arxiv_search"],
            recommendedGraph: {
              summary: "Request -> pi-arxiv search -> Ambient summary report -> output.",
              nodes: [
                { id: "request", type: "request", label: "Arxiv summary request", description: request },
                {
                  id: "arxiv-search",
                  type: "deterministic_step",
                  label: "Search arxiv with pi-arxiv",
                  description: "Use the observed pi-arxiv arxiv_search command with a small max-results limit.",
                  toolNames: ["ambient_cli"],
                },
                {
                  id: "summarize",
                  type: "model_call",
                  label: "Summarize papers",
                  modelRole: "Summarize retained arxiv paper metadata without inventing missing details.",
                  inputSummary: "bounded pi-arxiv stdout",
                  outputSummary: "concise paper summaries with source links",
                  retryPolicy: "retry with retained CLI output",
                  toolNames: ["ambient.responses"],
                },
                { id: "output", type: "output", label: "Paper summary report" },
              ],
              edges: [
                { id: "request-search", source: "request", target: "arxiv-search", type: "control_flow" },
                { id: "search-summarize", source: "arxiv-search", target: "summarize", type: "data_flow" },
                { id: "summarize-output", source: "summarize", target: "output", type: "data_flow" },
              ],
            },
            recommendedManifest: {
              tools: ["ambient_cli", "ambient.responses"],
              ambientCliCapabilities: [arxivSearchGrant],
              mutationPolicy: "read_only",
              maxToolCalls: 2,
              maxModelCalls: 1,
            },
            deterministicSourceStrategy:
              "Wrap a tools.ambient_cli pi-arxiv arxiv_search call in workflow.step with nodeId arxiv-search, checkpoint the bounded stdout, and call Ambient once with nodeId summarize for the final report.",
            unresolvedQuestions: [],
          },
        },
      ]),
      budgets: { maxModelTurns: 2, maxToolCalls: 1, maxConnectorCalls: 0, maxAmbientCalls: 0, maxElapsedMs: 120_000 },
    });

    const compileProgress: unknown[] = [];
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Compile the deterministic workflow from the persisted arxiv Ambient CLI exploration trace.",
      workspaceSummary: "Use retained exploration trace evidence and the exact Ambient CLI grant from the trace; do not use browser search for this workflow.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
      onProgress: (progress) => compileProgress.push(progress),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const compileContext = await readFile(join(dirname(artifact.sourcePath), "compile-context.json"), "utf8");
    const compilerCall = store.listWorkflowModelCalls({ artifactId: artifact.id }).find((call) => call.task === "workflow.compiler");
    const compilerPrompt = JSON.stringify(compilerCall?.input ?? {});

    expect(artifact.manifest.tools).toContain("ambient_cli");
    expect(artifact.manifest.ambientCliCapabilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ packageName: "pi-arxiv", command: "arxiv_search" })]),
    );
    expect(source).toContain("tools.ambient_cli");
    expect(source).toContain("pi-arxiv");
    expect(source).toContain("arxiv_search");
    expect(compileContext).toContain(exploration.trace.id);
    expect(compileContext).toContain("ambientCliCapabilities");
    expect(compilerPrompt).toContain("workflow exploration trace");
    expect(compilerPrompt).toContain("pi-arxiv:arxiv_search");

    const runDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      model,
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 120_000,
        absoluteTimeoutMs: LIVE_GMAIL_RUN_TIMEOUT_MS,
      }),
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const detail = readWorkflowRunDetail(store, run.id);
    const state = (existsSync(artifact.statePath) ? JSON.parse(await readFile(artifact.statePath, "utf8")) : {}) as { checkpoints?: Record<string, unknown> };

    await writeAmbientCliExplorationCompileRunDogfoodArtifact({
      installStatuses,
      threadId: thread.id,
      explorationTraceId: exploration.trace.id,
      compileProgressTail: compileProgress.slice(-12),
      artifact: {
        id: artifact.id,
        title: artifact.title,
        manifest: artifact.manifest,
        sourcePath: artifact.sourcePath,
      },
      run: { id: run.id, status: run.status, error: run.error, reportPath: run.reportPath },
      eventCounts: eventCountsByType(detail.events),
      ambientCliEvents: detail.events
        .filter((event) => event.type.startsWith("desktop-tool") && event.message === "ambient_cli")
        .map((event) => ({ type: event.type, graphNodeId: event.graphNodeId, data: event.data })),
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs, model: call.model })),
      checkpointKeys: Object.keys(state.checkpoints ?? {}),
    });

    expect(run).toMatchObject({ status: "succeeded" });
    expect(detail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "desktop-tool.start",
          message: "ambient_cli",
          data: expect.objectContaining({
            ambientCliInput: expect.objectContaining({ packageName: "pi-arxiv", command: "arxiv_search" }),
          }),
        }),
        expect.objectContaining({
          type: "desktop-tool.end",
          message: "ambient_cli",
          data: expect.objectContaining({
            ambientCliOutput: expect.objectContaining({
              packageName: "pi-arxiv",
              commandName: "arxiv_search",
              stdout: expect.objectContaining({ preview: expect.any(String) }),
            }),
          }),
        }),
      ]),
    );
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
  }, LIVE_GMAIL_RUN_TIMEOUT_MS);

  itLive("compiles the canonical Scottsdale weekend activities workflow with live Ambient when explicitly enabled", async () => {
    const apiKey = liveAmbientApiKey();

    const repeatCount = Math.max(1, Number(process.env.AMBIENT_WORKFLOW_LIVE_REPEAT ?? "1"));
    for (let attempt = 0; attempt < repeatCount; attempt += 1) {
      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest: scottsdaleWeekendRequest(),
        workspaceSummary: `Canonical Scottsdale dogfood compile attempt ${attempt + 1} of ${repeatCount}.`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.spec.goal).toMatch(/Scottsdale|weekend|activities/i);
      expect(artifact.manifest.tools.length).toBeGreaterThan(0);
      expect(source).toContain("export");
      expect(source).toContain("workflow");
    }
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles the four-year-old Scottsdale activity workflow with live Ambient when explicitly enabled", async () => {
    const apiKey = liveAmbientApiKey();

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: scottsdaleFamilyActivitiesRequest(),
      workspaceSummary: "Live UI-reported compile failure repro: family activity workflow for next week in Scottsdale.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.spec.goal).toMatch(/Scottsdale|activities|family|child|4/i);
    expect(source).toContain("workflow");
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a Gmail last-100-emails categorization report workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest:
        "Review the last 100 emails in Gmail and write a concise report categorizing them by action required, urgency, sender/domain, and recurring themes. The workflow must be read-only, fetch enough message or thread detail to support the categorization, ask Ambient to synthesize the report, and preserve a redacted audit trail.",
      workspaceSummary: "Live Google Workspace dogfood prompt for a Gmail categorization workflow. A GWS Gmail connector account named default is available.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");
    const graphSnapshot = store.listWorkflowGraphSnapshots(artifact.workflowThreadId!)[0];

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.spec.goal).toMatch(/gmail|email|categor/i);
    expect(["read_only", "staged_until_approved"]).toContain(artifact.manifest.mutationPolicy);
    if (artifact.manifest.mutationPolicy === "staged_until_approved") {
      expect(artifact.manifest.tools).toContain("file_write");
    }
    expect(artifact.manifest.tools).toContain("ambient.responses");
    expect(gmailGrant).toMatchObject({
      connectorId: "google.gmail",
      scopes: expect.arrayContaining(["gmail.readonly"]),
      operations: expect.arrayContaining(["search", "readThread"]),
      dataRetention: "redacted_audit",
    });
    expect(artifact.manifest.maxConnectorCalls ?? 101).toBeGreaterThanOrEqual(101);
    expect(artifact.manifest.maxRunMs ?? 900_000).toBeGreaterThanOrEqual(900_000);
    expect(source).toContain("connectors.call");
    expect(source).toMatch(/connectorId:\s*['"]google\.gmail['"]/);
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
    expect(source).toMatch(/["']?maxResults["']?\s*:\s*100|["']?max["']?\s*:\s*100/);
    expect(source).toContain("ambient.call");
    expect(source).toMatch(/task:\s*['"][^'"]+['"]/);
    if (process.env.AMBIENT_WORKFLOW_LIVE_LOG_SOURCE === "1") {
      console.info(
        JSON.stringify(
          {
            title: artifact.title,
            mutationPolicy: artifact.manifest.mutationPolicy,
            maxConnectorCalls: artifact.manifest.maxConnectorCalls,
            connectors: artifact.manifest.connectors,
            graphNodes: graphSnapshot?.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
          },
          null,
          2,
        ),
      );
      console.info(`\n--- Gmail workflow source ---\n${source}`);
    }
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a document render PDF workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a workflow that drafts a concise two-section report from these fixture notes: Alpha shipped the pagination primitive, Beta added chunked model-map coverage, Gamma still needs PDF artifact output validation.",
        "The workflow must use document.render with format pdf and path reports/document-render-dogfood.pdf.",
        "After document.render, stage a file_write mutation that writes the render node's content to the render node's artifactPath.",
        "Do not use browser, shell, Google, or external connectors for this task.",
      ].join(" "),
      workspaceSummary:
        "Live document.render compiler dogfood. Selected capabilities include file_write for staged workspace output and Ambient model calls for drafting the report.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["file_write"]));
    expect(artifact.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(source).toContain("workflow.renderDocument");
    expect(source).toContain("workflow.stageMutation");
    expect(source).toContain("tools.file_write");
    expect(source).toContain('"format": "pdf"');
    expect(source).toContain("reports/document-render-dogfood.pdf");
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a Gmail 300-message pagination workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that searches exactly the most recent 300 Gmail message metadata rows and summarizes page coverage.",
        "Use the Gmail connector pagination primitive rather than an ad hoc loop: pageSize 100, maxItems 300, maxPages 3.",
        "Do not modify Gmail data and do not fetch full thread bodies unless the compiler needs a separate bounded detail step.",
      ].join(" "),
      workspaceSummary:
        "Live Gmail pagination compiler dogfood. A GWS Gmail connector account named default is available. The Gmail search operation descriptor declares messages, nextPageToken, pageToken, and maxResults pagination fields.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(["read_only", "staged_until_approved"]).toContain(artifact.manifest.mutationPolicy);
    if (artifact.manifest.mutationPolicy === "staged_until_approved") {
      expect(artifact.manifest.tools).toContain("file_write");
    }
    expect(gmailGrant).toMatchObject({
      connectorId: "google.gmail",
      scopes: expect.arrayContaining(["gmail.readonly"]),
      operations: expect.arrayContaining(["search"]),
      dataRetention: "redacted_audit",
    });
    expect(gmailGrant?.operations).not.toEqual(expect.arrayContaining(["createDraft", "updateDraft", "deleteDraft", "sendDraft"]));
    expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(3);
    expect(source).toContain("workflow.paginateConnector");
    expect(source).toContain('"maxItems": 300');
    expect(source).toContain('"maxPages": 3');
    expect(source).toContain('"pageSize": 100');
    expect(source).toContain('"itemsPath": "messages"');
    expect(source).toContain('"nextPageTokenPath": "nextPageToken"');
    expect(source).toContain('"pageTokenInputPath": "pageToken"');
    expect(source).toContain('"pageSizeInputPath": "maxResults"');
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles Google Drive and Calendar transcript pagination workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
        "google.calendar": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.drive" || descriptor.id === "google.calendar");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that finds Google meeting recording transcripts from the last two weeks and prepares an action-item extraction plan.",
        "Use connector.paginate for Google Drive search to collect transcript-like Drive files, with pageSize 50, maxItems 100, and maxPages 2.",
        "Use connector.paginate for Google Calendar listEvents over an explicit two-week RFC3339 window with timeZone America/Phoenix, pageSize 50, maxItems 100, and maxPages 2.",
        "Use only Google read operations. Do not create, update, label, move, share, or delete Google data.",
        "After paginated collection, use collection.chunk plus model.map/model.reduce or model.reduce to identify likely transcripts and action-item extraction coverage.",
      ].join(" "),
      workspaceSummary:
        "Live Google transcript pagination compiler dogfood. GWS Google Drive and Calendar connector accounts named default are available. Drive search declares files/nextPageToken/pageToken/pageSize pagination. Calendar listEvents declares items/nextPageToken/pageToken/maxResults pagination and requires explicit timeMin, timeMax, and timeZone.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const driveGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.drive");
    const calendarGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.calendar");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(driveGrant).toMatchObject({
      connectorId: "google.drive",
      scopes: expect.arrayContaining(["drive.readonly"]),
      operations: expect.arrayContaining(["search"]),
      dataRetention: "redacted_audit",
    });
    expect(calendarGrant).toMatchObject({
      connectorId: "google.calendar",
      scopes: expect.arrayContaining(["calendar.readonly"]),
      operations: expect.arrayContaining(["listEvents"]),
      dataRetention: "redacted_audit",
    });
    expect(driveGrant?.operations.join(" ")).not.toMatch(/create|update|copy|trash|permission|delete/i);
    expect(calendarGrant?.operations.join(" ")).not.toMatch(/create|update|delete/i);
    expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(4);
    expect(source).toContain("workflow.paginateConnector");
    expect(source).toMatch(/connectorId:\s*["']google\.drive["']/);
    expect(source).toMatch(/connectorId:\s*["']google\.calendar["']/);
    expect(source).toMatch(/operation:\s*["']search["']/);
    expect(source).toMatch(/operation:\s*["']listEvents["']/);
    expect(source).toContain('"itemsPath": "files"');
    expect(source).toContain('"itemsPath": "items"');
    expect(source).toContain('"pageSizeInputPath": "pageSize"');
    expect(source).toContain('"pageSizeInputPath": "maxResults"');
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles Google meeting transcript action-item extraction workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
        "google.calendar": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.drive" || descriptor.id === "google.calendar");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that pulls Google meeting recording transcripts from the last two weeks and analyzes them for action items, owners, due dates, decisions, and unresolved questions.",
        "Use the exact two-week window from 2026-05-02T00:00:00-07:00 through 2026-05-16T23:59:59-07:00 with timeZone America/Phoenix.",
        "Use connector.paginate for Google Calendar listEvents with pageSize 50, maxItems 100, maxPages 2, and read-only fields for event provenance.",
        "Use connector.paginate for Google Drive search with pageSize 50, maxItems 100, maxPages 2, looking for transcript-like Google Docs with mimeType = 'application/vnd.google-apps.document'.",
        "Use collection.map to select at most 6 candidate transcript files, then connector.map over google.drive readFile with maxItems 6, maxConcurrency 3, exportMimeType text/plain, and maxContentChars 4000.",
        "Because transcript files may be long, call long_context_process with taskType extraction over the Drive readFile results plus calendar events before the final model.call.",
        "The final model.call must consume the long_context_process response and counts only, not the raw read-transcript-files.items or calendar-event-pages.items collection.",
        "Do not create, update, label, share, move, delete, or write any Google data.",
      ].join(" "),
      workspaceSummary:
        "Live Google transcript action-item compiler dogfood. GWS Google Drive and Calendar connector accounts named default are available. Drive search and Calendar listEvents declare pagination metadata. Drive readFile exports Google Docs as text/plain. long_context_process is selected and should preprocess transcript-sized evidence before final Ambient model shaping.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const driveGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.drive");
    const calendarGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.calendar");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["long_context_process", "ambient.responses"]));
    expect(driveGrant).toMatchObject({
      connectorId: "google.drive",
      scopes: expect.arrayContaining(["drive.readonly"]),
      operations: expect.arrayContaining(["search", "readFile"]),
      dataRetention: "redacted_audit",
    });
    expect(calendarGrant).toMatchObject({
      connectorId: "google.calendar",
      scopes: expect.arrayContaining(["calendar.readonly"]),
      operations: expect.arrayContaining(["listEvents"]),
      dataRetention: "redacted_audit",
    });
    expect(driveGrant?.operations.join(" ")).not.toMatch(/create|update|copy|trash|permission|delete/i);
    expect(calendarGrant?.operations.join(" ")).not.toMatch(/create|update|delete/i);
    expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(10);
    expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(source).toContain("workflow.paginateConnector");
    expect(source).toContain("workflow.batch");
    expect(source).toContain("tools.long_context_process");
    expect(source).toContain("ambient.call");
    expect(source.indexOf("tools.long_context_process")).toBeLessThan(source.indexOf("ambient.call"));
    expect(source).toMatch(/connectorId:\s*["']google\.drive["']/);
    expect(source).toMatch(/connectorId:\s*["']google\.calendar["']/);
    expect(source).toMatch(/["']?operation["']?\s*:\s*["']search["']/);
    expect(source).toMatch(/["']?operation["']?\s*:\s*["']readFile["']/);
    expect(source).toContain('"exportMimeType": "text/plain"');
    expect(source).toContain('"maxContentChars": 4000');
    expect(source).toMatch(/["']?operation["']?\s*:\s*["']listEvents["']/);
    expect(source).toContain("2026-05-02T00:00:00-07:00");
    expect(source).toContain("America/Phoenix");
    expect(source).not.toContain('operation: "createEvent"');
    expect(source).not.toContain('operation: "updateEvent"');
    expect(source).not.toContain('operation: "deleteEvent"');
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a Gmail 300-message chunked categorization workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that categorizes the most recent 300 Gmail messages into up to 7 categories.",
        "Use connector.paginate for Gmail search with pageSize 100, maxItems 300, and maxPages 3.",
        "Use connector.map to read Gmail thread details with maxItems 300 and maxConcurrency 4.",
        "Use collection.map to keep only bounded categorization fields, collection.chunk with chunks of about 25, model.map over those chunks, and model.reduce for the final category synthesis.",
        "Do not modify Gmail data, labels, drafts, or messages.",
      ].join(" "),
      workspaceSummary:
        "Live Gmail large-collection compiler dogfood. A GWS Gmail connector account named default is available. The compiler supports connector.paginate, connector.map, collection.map, collection.chunk, model.map, and model.reduce.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(gmailGrant).toMatchObject({
      connectorId: "google.gmail",
      scopes: expect.arrayContaining(["gmail.readonly"]),
      operations: expect.arrayContaining(["search", "readThread"]),
      dataRetention: "redacted_audit",
    });
    expect(gmailGrant?.operations).not.toEqual(expect.arrayContaining(["createDraft", "updateDraft", "deleteDraft", "sendDraft"]));
    expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(303);
    expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(13);
    expect(source).toContain("workflow.paginateConnector");
    expect(source).toContain("workflow.mapCollection");
    expect(source).toContain("workflow.chunkCollection");
    expect(source).toContain("workflow.mapModel");
    expect(source).toContain("workflow.reduceModel");
    expect(source).toContain('"maxItems": 300');
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a Gmail 1000-message metadata-first categorization workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only metadata-first workflow that categorizes the most recent 1000 Gmail messages into up to 7 categories.",
        "Stay under the single-workflow static connector-call ceiling: use connector.paginate for Gmail search metadata with maxItems 1000, maxPages 10, and pageSize 100.",
        "Do not use google.gmail.readThread in this workflow; if some messages need full body detail, return a bounded follow-up detail-read candidate list in the final output.",
        "Use collection.map to keep metadata fields, collection.chunk with chunks of about 25, model.map over chunks, and tree model.reduce for the final synthesis.",
        "After metadata synthesis, include a review.input gate asking whether to plan a separate bounded full-body follow-up. This workflow must stay metadata-only.",
        "Do not modify Gmail data, labels, drafts, or messages.",
      ].join(" "),
      workspaceSummary:
        "Live Gmail 1000 metadata-first compiler dogfood. A GWS Gmail connector account named default is available. The compiler supports a hard 1000 static call ceiling; a 1000-item readThread fan-out plus search pagination is over budget, so this workflow should use search metadata only, include a review.input gate after metadata synthesis, and produce a follow-up detail-read recommendation.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(gmailGrant).toMatchObject({
      connectorId: "google.gmail",
      scopes: expect.arrayContaining(["gmail.readonly"]),
      operations: ["search"],
      dataRetention: "redacted_audit",
    });
    expect(artifact.manifest.maxConnectorCalls ?? 1001).toBeLessThanOrEqual(10);
    expect(source).toContain("workflow.paginateConnector");
    expect(source).toContain("workflow.mapCollection");
    expect(source).toContain("workflow.chunkCollection");
    expect(source).toContain("workflow.mapModel");
    expect(source).toContain("workflow.reduceModel");
    expect(source).toContain("workflow.askUser");
    expect(source).toContain('"maxItems": 1000');
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
    expect(source).not.toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a tree model-reduce workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const records = Array.from({ length: 64 }, (_, index) => ({
      id: `record-${index + 1}`,
      title: `Research note ${index + 1}`,
      summary: `Scottsdale market evidence note ${index + 1}`,
    }));
    const connectorDescriptors = [fixtureWorkflowConnector(records).descriptor];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that retrieves 64 fixture research records and synthesizes them into a final brief.",
        "Use connector.paginate on fixture.readonly listRecords with pageSize 16, maxItems 64, maxPages 4, itemsPath records, nextPageTokenPath nextCursor, pageTokenInputPath cursor, and pageSizeInputPath limit.",
        "Use collection.chunk with chunkSize 8 and maxChunks 8, then model.map over chunks.",
        "Use model.reduce with strategy:\"tree\", maxFanIn 4, maxLevels 3 for final synthesis. Do not use a single model.call for the final fan-in.",
      ].join(" "),
      workspaceSummary:
        'Live tree-reduce compiler dogfood. The fixture.readonly connector account "fixture" is available. The compiler supports connector.paginate, collection.chunk, model.map, and model.reduce with strategy:"tree", maxFanIn, and maxLevels.',
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const fixtureGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "fixture.readonly");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(fixtureGrant).toMatchObject({
      connectorId: "fixture.readonly",
      scopes: expect.arrayContaining(["fixture.records.read"]),
      operations: expect.arrayContaining(["listRecords"]),
      dataRetention: "redacted_audit",
    });
    expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(4);
    expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(11);
    expect(source).toContain("workflow.paginateConnector");
    expect(source).toContain("workflow.chunkCollection");
    expect(source).toContain("workflow.mapModel");
    expect(source).toContain("workflow.reduceModel");
    expect(source).toContain('"strategy": "tree"');
    expect(source).toContain('"maxFanIn": 4');
    expect(source).toContain('"maxLevels": 3');
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a browser_search pagination collection workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that collects exactly 30 public web search results for a Scottsdale Arizona real estate market source brief.",
        "Use tool.paginate over browser_search with exactly 3 pageQueries, pageSize 10, maxItems 30, maxPages 3, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
        "After collection, use collection.dedupe with keyPath url and strategy:\"url_canonical\", then collection.map to keep title/url/snippet, collection.chunk into 3 chunks of 10, model.map over chunks, model.reduce with strategy:\"tree\" for final synthesis, and document.render format pdf for the report artifact.",
        "Do not use connector.paginate for the browser search collection, do not write files, and do not modify external state.",
      ].join(" "),
      workspaceSummary:
        "Live browser_search pagination compiler dogfood. browser_search is selected and declares tool pagination metadata: itemsPath is the root array, query fan-out is supported through pageQueries, queryInputPath is query, pageSizeInputPath is maxResults, and maxPageSize is 10. The compiler supports tool.paginate, collection.dedupe, collection.chunk, model.map, tree model.reduce, and document.render.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses"]));
    expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(3);
    expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(4);
    expect(source).toContain("workflow.paginateTool");
    expect(source).toContain("tools.browser_search");
    expect(source).toContain('"itemsPath": ""');
    expect(source).toContain('"pageSizeInputPath": "maxResults"');
    expect(source).toContain('"queryInputPath": "query"');
    expect(source).toContain('"maxItems": 30');
    expect(source).toContain('"maxPages": 3');
    expect(source).toContain("workflow.dedupeCollection");
    expect(source).toContain('"strategy": "url_canonical"');
    expect(source).toContain("workflow.chunkCollection");
    expect(source).toContain("workflow.mapModel");
    expect(source).toContain("workflow.reduceModel");
    expect(source).toContain("workflow.renderDocument");
    expect(source).toContain('"format": "pdf"');
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a movie-night current-data recommendation workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that recommends whether a couple in Scottsdale, Arizona should go out to see a movie tonight.",
        "The run date is Saturday, May 16, 2026 and the local time zone is America/Phoenix. Do not rely on model knowledge for currently playing movies, showtimes, reviews, ratings, or venue details.",
        "Use tool.paginate over browser_search with exactly 4 pageQueries, pageSize 10, maxItems 40, maxPages 4, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
        "The four pageQueries must cover tonight's Scottsdale showtimes/currently playing movies, review/ratings signals, runtime/genre/ratings, and theater/parking/dinner/travel friction.",
        "After collection, use collection.dedupe with keyPath url and strategy:\"url_canonical\", collection.map to keep title/url/snippet/date/rank, collection.chunk into 4 chunks of 10, and model.map over chunks to extract candidate movies, showtimes, reviews, runtime, genre, travel friction, and evidence freshness.",
        "Add a review.input asking for the couple's preference profile before final recommendation, then use model.reduce with strategy:\"tree\", maxFanIn 4, maxLevels 1 to produce the go/no-go recommendation with alternatives, confidence, tradeoffs, and evidence freshness.",
        "Do not use Google write grants, file_write, connector writes, or stale model knowledge.",
      ].join(" "),
      workspaceSummary:
        "Live movie-night current-data compiler dogfood. browser_search is selected and declares tool pagination metadata: itemsPath is the root array, query fan-out is supported through pageQueries, queryInputPath is query, pageSizeInputPath is maxResults, and maxPageSize is 10. The compiler supports tool.paginate, collection.dedupe, collection.map, collection.chunk, model.map, review.input, and tree model.reduce. Use the selected Ambient Desktop model through model.map/model.reduce for synthesis; do not ask the user to choose a random cloud LLM provider.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses"]));
    expect(artifact.manifest.tools).not.toContain("file_write");
    expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(4);
    expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(5);
    expect(source).toContain("workflow.paginateTool");
    expect(source).toContain("tools.browser_search");
    expect(source).toContain('"itemsPath": ""');
    expect(source).toContain('"pageSizeInputPath": "maxResults"');
    expect(source).toContain('"queryInputPath": "query"');
    expect(source).toContain('"maxItems": 40');
    expect(source).toContain('"maxPages": 4');
    expect(source).toContain("workflow.dedupeCollection");
    expect(source).toContain('"strategy": "url_canonical"');
    expect(source).toContain("workflow.chunkCollection");
    expect(source).toContain("workflow.mapModel");
    expect(source).toContain("workflow.askUser");
    expect(source).toContain("workflow.reduceModel");
    expect(source).toContain('"strategy": "tree"');
    expect(source).toContain("2026-05-16");
    expect(source).toContain("America/Phoenix");
    expect(source).not.toContain("tools.file_write");
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a Scottsdale 100-source PDF workflow with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a workflow that performs deep research for a Scottsdale, Arizona real estate report.",
        "Collect exactly 100 public source candidates using browser_search through tool.paginate with exactly 10 pageQueries, pageSize 10, maxItems 100, maxPages 10, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
        "Search angles must cover market trends, inventory, prices, neighborhoods, migration, mortgage rates, zoning/development, short-term rental rules, schools/taxes, and comparable nearby cities.",
        "After source collection, use collection.dedupe with keyPath url and strategy:\"url_canonical\", then collection.map to keep title/url/snippet/date/rank, collection.chunk into 10 chunks of 10, model.map over chunks for claims/statistics/citations/source-quality extraction, and model.reduce with strategy:\"tree\", maxFanIn 5, maxLevels 2 for final synthesis.",
        "Render a PDF report with document.render format pdf and then stage a file_write mutation to Documents/scottsdale-real-estate-research-report.pdf.",
        "Do not modify external websites or cloud data; only stage the local PDF file write.",
      ].join(" "),
      workspaceSummary:
        "Live Scottsdale 100-source compiler dogfood. browser_search is selected and declares tool pagination metadata: itemsPath is the root array, query fan-out is supported through pageQueries, queryInputPath is query, pageSizeInputPath is maxResults, and maxPageSize is 10. file_write is available for staged workspace writes. The compiler supports tool.paginate, collection.dedupe, collection.map, collection.chunk, model.map, tree model.reduce, document.render, and mutation.stage.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses", "file_write"]));
    expect(artifact.manifest.maxToolCalls ?? 0).toBeGreaterThanOrEqual(11);
    expect(artifact.manifest.maxModelCalls ?? 0).toBeGreaterThanOrEqual(13);
    expect(source).toContain("workflow.paginateTool");
    expect(source).toContain("tools.browser_search");
    expect(source).toContain('"itemsPath": ""');
    expect(source).toContain('"pageSizeInputPath": "maxResults"');
    expect(source).toContain('"queryInputPath": "query"');
    expect(source).toContain('"maxItems": 100');
    expect(source).toContain('"maxPages": 10');
    expect(source).toContain("workflow.dedupeCollection");
    expect(source).toContain('"strategy": "url_canonical"');
    expect(source).toContain("workflow.chunkCollection");
    expect(source).toContain("workflow.mapModel");
    expect(source).toContain("workflow.reduceModel");
    expect(source).toContain('"strategy": "tree"');
    expect(source).toContain('"maxFanIn": 5');
    expect(source).toContain("workflow.renderDocument");
    expect(source).toContain('"format": "pdf"');
    expect(source).toContain("workflow.stageMutation");
    expect(source).toContain("tools.file_write");
    expect(source).toContain("Documents/scottsdale-real-estate-research-report.pdf");
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("compiles a long-field connector workflow through long_context_process with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const records = Array.from({ length: 80 }, (_, index) => ({
      id: `transcript-${index + 1}`,
      title: `Transcript ${index + 1}`,
      body: `Meeting transcript ${index + 1}. ${"Action item discussion and decision evidence. ".repeat(220)}`,
    }));
    const connectorDescriptors = [fixtureWorkflowConnector(records).descriptor];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: [
        "Create a read-only workflow that analyzes 80 long fixture meeting transcript records for action items, owners, due dates, decisions, and unresolved questions.",
        "Use connector.call on fixture.readonly listRecords with limit 80, then connector.map on fixture.readonly getRecord with maxItems 80 and maxConcurrency 4.",
        "The getRecord results contain long body fields, so use a tool.call to long_context_process with taskType extraction before the final schema-shaping model.call.",
        "Do not pass read-record-details.items or any other large raw collection directly into a single model.call. The final model.call should consume the long_context_process response plus source counts only.",
      ].join(" "),
      workspaceSummary:
        "Live long-field RLM routing compiler dogfood. The fixture.readonly connector account fixture is available and returns long transcript-like record bodies. Selected tools include long_context_process and Ambient model calls. The compiler rejects direct model.call consumption of large collection outputs when long_context_process is available.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const fixtureGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "fixture.readonly");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["long_context_process", "ambient.responses"]));
    expect(fixtureGrant).toMatchObject({
      connectorId: "fixture.readonly",
      scopes: expect.arrayContaining(["fixture.records.read"]),
      operations: expect.arrayContaining(["listRecords", "getRecord"]),
      dataRetention: "redacted_audit",
    });
    expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(81);
    expect(source).toContain("tools.long_context_process");
    expect(source).toContain("ambient.call");
    expect(source.indexOf("tools.long_context_process")).toBeLessThan(source.indexOf("ambient.call"));
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]getRecord['"]/);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLive("dogfoods Gmail workflow grant review registry with live Ambient compile", async () => {
    const apiKey = liveAmbientApiKey();
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Google account" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest:
        "Review the last 100 emails in Gmail and write a concise report categorizing them by action required, urgency, sender/domain, and recurring themes. The workflow must be read-only, reuse any approved Gmail connector grant, ask Ambient to synthesize the report, and preserve a redacted audit trail.",
      workspaceSummary: "Live grant-registry dogfood prompt. A GWS Gmail connector account named default is available and a reusable Gmail read grant may already exist.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    if (!artifact.workflowThreadId) throw new Error("Live Gmail workflow did not create a workflow thread id.");
    const thread = store.getWorkflowAgentThreadSummary(artifact.workflowThreadId);
    const auditThread = store.createThread("Gmail workflow grant review dogfood");
    const grant = store.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "workflow_thread",
      workflowThreadId: artifact.workflowThreadId,
      actionKind: "connector_content_read",
      targetKind: "tool",
      targetHash: "dogfood:gmail:read-thread",
      targetLabel: "Google Workspace gmail.users.messages.get (default)",
      conditions: {
        provider: "google.workspace.cli",
        accountHint: "default",
        methodId: "gmail.users.messages.get",
        sideEffect: "personal_content_read",
      },
      source: "workflow_review",
      reason: "Live dogfood reusable Gmail read grant.",
    });
    store.addPermissionAudit({
      threadId: auditThread.id,
      permissionMode: "workspace",
      toolName: "google_workspace_call",
      risk: "plugin-tool",
      decision: "allowed",
      detail: "Method: gmail.users.messages.get\nAccount: default\nWorkflow dogfood persistent grant reuse.",
      reason: "Approved by persistent workflow Gmail grant.",
      decisionSource: "persistent_grant",
      grantId: grant.id,
    });
    store.addPermissionAudit({
      threadId: auditThread.id,
      permissionMode: "full-access",
      toolName: "google_workspace_call",
      risk: "plugin-tool",
      decision: "allowed",
      detail: "Method: gmail.users.messages.list\nAccount: default\nWorkflow dogfood Full Access receipt.",
      reason: "Allowed automatically by Full Access mode.",
      decisionSource: "allowed_by_full_access",
    });

    const registry = workflowPermissionGrantRegistryModel({
      grants: store.listPermissionGrants(),
      auditEntries: store.listPermissionAudit(20),
      workflowThreadId: artifact.workflowThreadId,
      projectPath: thread.projectPath,
      workspacePath,
      auditThreadId: auditThread.id,
    });

    await writeGmailGrantReviewDogfoodArtifact({
      artifactId: artifact.id,
      auditThreadId: auditThread.id,
      title: artifact.title,
      status: artifact.status,
      connectorGrants: artifact.manifest.connectors,
      registrySummary: registry.summary,
      registryRows: registry.rows.map((row) => ({
        id: row.id,
        scope: row.scopeLabel,
        target: row.targetLabel,
        auditCount: row.auditCount,
        provenance: row.provenanceLabel,
      })),
      fullAccessReceipts: registry.fullAccessReceipts.map((receipt) => ({
        id: receipt.id,
        tool: receipt.toolLabel,
        risk: receipt.riskLabel,
        detail: receipt.detailLabel,
      })),
    });

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(registry.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: grant.id,
          scopeLabel: "Workflow",
          targetLabel: "Google Workspace gmail.users.messages.get (default)",
          auditCount: 1,
          provenanceLabel: `Workflow ${artifact.workflowThreadId}`,
        }),
      ]),
    );
    expect(registry.fullAccessReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolLabel: "google_workspace_call",
          detailLabel: expect.stringContaining("gmail.users.messages.list"),
        }),
      ]),
    );
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

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
    const itemFailure = retryDetail.events.find((event) => event.type === "step.error" && event.graphNodeId === "process-items" && event.itemKey === "beta")!;
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
      knownRemainingGap: "Debug rewrite is covered by separate revision flows; this dogfood focuses on executable retry_step and skip_item recovery actions.",
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
        { id: "classify", type: "deterministic_step", label: "Classify", retryPolicy: "Ask Ambient to debug when the failure is deterministic." },
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
      base: { artifactId: baseArtifact.id, versionId: baseVersion.id, runId: failedRun.id, status: failedRun.status, failedEvent: debugContext.failedEvent },
      proposed: { artifactId: proposedArtifact.id, status: proposedArtifact.status, graphNodeIds: appliedThread.graph?.nodes.map((node) => node.id) },
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

  itLive("dogfoods selected-event debug rewrite with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const artifactRoot = join(store.getWorkspace().statePath, "workflows", "live-debug-rewrite-dogfood");
    await mkdir(artifactRoot, { recursive: true });
    const baseSourcePath = join(artifactRoot, "base.ts");
    await writeFile(
      baseSourcePath,
      `
export default async function run({ workflow }) {
  await workflow.step("extract records", { nodeId: "extract" }, async () => {
    return [{ id: "rec-1", text: "Needs classification" }];
  });
  await workflow.step("classify records", { nodeId: "classify" }, async () => {
    throw new Error("classification schema mismatch");
  });
}
`,
      "utf8",
    );
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Live Debug Rewrite Dogfood",
      initialRequest: "Classify records with retained inputs and repair schema mismatches.",
      projectPath: workspacePath,
      traceMode: "debug",
    });
    const baseArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Live Debug Rewrite Dogfood",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 2, maxRunMs: 120_000 },
      spec: { goal: "Classify records with retained inputs.", summary: "The base workflow fails in the classify graph node." },
      sourcePath: baseSourcePath,
      statePath: join(artifactRoot, "base-state.json"),
    });
    const baseGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Extract records, classify them, and report schema-safe labels.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "extract", type: "deterministic_step", label: "Extract records", retryPolicy: "Retry with same retained input." },
        { id: "classify", type: "model_call", label: "Classify records", modelRole: "Return schema-safe record labels.", retryPolicy: "Retry with same retained input; ask Ambient to debug schema mismatches." },
        { id: "output", type: "output", label: "Output" },
      ],
      edges: [
        { id: "request-extract", source: "request", target: "extract", type: "control_flow" },
        { id: "extract-classify", source: "extract", target: "classify", type: "data_flow" },
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
    const run = store.startWorkflowRun({ artifactId: baseArtifact.id, status: "running" });
    store.updateWorkflowRun({ id: run.id, status: "failed", error: "classification schema mismatch", finish: true });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.error",
      message: "extract records",
      graphNodeId: "extract",
      data: { error: "older extract warning retained for selection disambiguation" },
    });
    const selectedEvent = store.appendWorkflowRunEvent({
      runId: run.id,
      type: "ambient.call.invalid",
      message: "classify.records",
      graphNodeId: "classify",
      itemKey: "rec-1",
      data: { error: "classification schema mismatch", expected: "{ id, label, confidence }" },
    });
    store.appendWorkflowRunEvent({ runId: run.id, type: "workflow.failed", message: "classification schema mismatch" });
    store.recordWorkflowModelCall({
      runId: run.id,
      task: "classify.records",
      status: "invalid",
      input: { records: [{ id: "rec-1", text: "Needs classification" }] },
      output: { label: "needs_review" },
      validationError: "Expected array of { id, label, confidence } records.",
      graphNodeId: "classify",
      itemKey: "rec-1",
      startedAt: "2026-05-05T00:00:00.000Z",
      completedAt: "2026-05-05T00:00:01.000Z",
    });

    const debugContext = buildWorkflowDebugRewriteContext(store, {
      runId: run.id,
      eventId: selectedEvent.id,
      userNotes: "Repair only the selected classify node. Keep graph node id classify for the repaired classification step.",
    });
    const requestedChange = workflowDebugRewriteUserRequest(debugContext);
    const liveProvider = new AmbientWorkflowCompilerProvider({
      apiKey,
      baseUrl: liveAmbientBaseUrl(),
      timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
    });
    const observed = { prompt: "", progressEvents: 0, outputChars: 0, thinkingChars: 0 };
    const provider = {
      compileProgramIr: async (input: Parameters<AmbientWorkflowCompilerProvider["compileProgramIr"]>[0]) => {
        observed.prompt = input.prompt;
        return liveProvider.compileProgramIr({
          ...input,
          onProgress: (progress) => {
            observed.progressEvents += 1;
            observed.outputChars = progress.outputChars;
            observed.thinkingChars = progress.thinkingChars ?? observed.thinkingChars;
            input.onProgress?.(progress);
          },
        });
      },
    };

    const proposedDashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: requestedChange,
      workspaceSummary: [
        "Live Ambient/Pi selected-event debug rewrite dogfood.",
        "The selected failure is ambient.call.invalid on graph node classify; preserve that node id if the conceptual classification step remains.",
      ].join("\n"),
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      debugRewriteContext: buildWorkflowDebugRewritePromptSection(debugContext),
      provider,
    });
    const proposedArtifact = proposedDashboard.artifacts[0];
    const proposedThread = store.getWorkflowAgentThreadSummary(thread.id);
    const proposedGraphIds = proposedThread.graph?.nodes.map((node) => node.id) ?? [];
    const proposedSource = await readFile(proposedArtifact.sourcePath, "utf8");
    const revision = createWorkflowDebugRewriteRevision(store, debugContext, { baseVersionId: baseVersion.id, requestedChange });
    const graphDiff = revision.graphDiff as WorkflowGraphDiff | undefined;

    await writeLiveDebugRewriteDogfoodArtifact({
      workflowThreadId: thread.id,
      runId: run.id,
      selectedEventId: selectedEvent.id,
      failedEvent: debugContext.failedEvent,
      proposedArtifactId: proposedArtifact.id,
      proposedGraphIds,
      revisionId: revision.id,
      sourceContainsClassify: proposedSource.includes("classify"),
      graphDiffAddedNodes: graphDiff?.addedNodes.map((node) => node.id) ?? [],
      progressEvents: observed.progressEvents,
      outputChars: observed.outputChars,
      thinkingChars: observed.thinkingChars,
    });

    expect(debugContext.failedEvent).toMatchObject({ id: selectedEvent.id, type: "ambient.call.invalid", graphNodeId: "classify" });
    expect(observed.prompt).toContain(selectedEvent.id);
    expect(observed.prompt).toContain("graph node classify");
    expect(observed.progressEvents).toBeGreaterThan(0);
    expect(proposedArtifact).toMatchObject({ status: "ready_for_preview" });
    expect(proposedGraphIds).toContain("classify");
    expect(proposedSource).toContain("classify");
    expect(revision).toMatchObject({
      status: "proposed",
      baseVersionId: baseVersion.id,
      baseArtifactId: baseArtifact.id,
      proposedGraphSnapshotId: proposedThread.activeGraphSnapshotId,
    });
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLiveGoogleWorkspaceRun("runs a Calendar upcoming-events brief workflow through the real Google wrapper", async () => {
    const apiKey = liveAmbientApiKey();
    const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("calendar");
    const connectorOptions = liveCalendarConnectorOptions(accountHint);
    const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter((descriptor) => descriptor.id === "google.calendar");
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Summarize upcoming Google Calendar events into a concise brief.",
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a read-only Google Calendar workflow that lists upcoming events, asks Ambient to summarize schedule themes, and checkpoints the brief.",
      workspaceSummary: `Live Google Workspace Calendar runtime dogfood. GWS Calendar connector account ${accountHint} is available and should be used exactly.`,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      provider: { compileProgramIr: vi.fn(async () => calendarBriefCompilerOutput(accountHint)) },
    });
    const artifact = dashboard.artifacts[0];
    const calendarGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.calendar");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(calendarGrant).toMatchObject({
      connectorId: "google.calendar",
      accountId: accountHint,
      scopes: expect.arrayContaining(["calendar.readonly"]),
      operations: expect.arrayContaining(["listEvents"]),
      dataRetention: "redacted_audit",
    });

    const runDashboard = await runWorkflowApprovingReviews({
      store,
      artifactId: artifact.id,
      workspacePath,
      adapter,
      connectorOptions,
      apiKey,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      maxApprovalRounds: 3,
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const detail = readWorkflowRunDetail(store, run.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { brief?: { summary?: string; highlights?: string[]; eventCount?: number } } }>;
    };

    const calendarRunArtifact = {
      accountHint,
      providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
      run: { id: run.id, status: run.status, error: run.error },
      eventCounts: eventCountsByType(detail.events),
      connectorMessages: detail.events.filter((event) => event.type === "connector.end").map((event) => event.message),
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs, model: call.model })),
      checkpoint: state.checkpoints?.calendarBrief?.value,
    };
    await writeCalendarRunDogfoodArtifact(calendarRunArtifact);

    if (run.status !== "succeeded") {
      throw new Error(`Expected Calendar read-only dogfood run to succeed. run=${JSON.stringify(calendarRunArtifact)}`);
    }
    expect(detail.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.calendar.listEvents" })]));
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.calendar_brief", status: "succeeded" })]));
    expect(state.checkpoints?.calendarBrief?.value?.brief?.summary).toMatch(/calendar|event|schedule|upcoming|no upcoming/i);
  }, LIVE_GMAIL_RUN_TIMEOUT_MS);

  itLiveGoogleWorkspaceRun("runs a scheduled Calendar workflow through persistent grant preflight and the real Google wrapper", async () => {
    const apiKey = liveAmbientApiKey();
    const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("calendar");
    const connectorOptions = liveCalendarConnectorOptions(accountHint);
    const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter((descriptor) => descriptor.id === "google.calendar");
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const firstDueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const secondDueAt = new Date(2026, 0, 2, 10, 0, 0, 0);
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Run a scheduled Google Calendar brief each morning.",
      projectPath: workspacePath,
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a read-only scheduled Google Calendar workflow that lists upcoming events, asks Ambient to summarize schedule themes, and checkpoints the brief.",
      workspaceSummary: `Live scheduled Google Workspace Calendar dogfood. GWS Calendar connector account ${accountHint} is available and should be used exactly.`,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      provider: { compileProgramIr: vi.fn(async () => calendarBriefCompilerOutput(accountHint)) },
    });
    const artifact = dashboard.artifacts[0];
    reviewWorkflowArtifact(store, { artifactId: artifact.id, decision: "approved" });
    const approvedVersion = store.getLatestApprovedWorkflowVersion(thread.id);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: thread.id,
        preset: "daily",
        timezone: "America/Phoenix",
      },
      createdAt,
    )[0];

    const blocked = await runDueWorkflowArtifactSchedules(store, firstDueAt, async () => {
      throw new Error("Scheduled Calendar workflow should not run before a persistent connector grant exists.");
    });
    const calendarReadTarget = googleWorkspaceConnectorGrantTarget({
      connectorId: "google.calendar",
      operation: "listEvents",
      accountId: accountHint,
    })!;
    const grant = store.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "workflow_thread",
      workflowThreadId: thread.id,
      actionKind: "connector_content_read",
      targetKind: "connector",
      targetHash: permissionGrantTargetHash("connector_content_read", "connector", calendarReadTarget.identity),
      targetLabel: calendarReadTarget.label,
      conditions: googleWorkspaceGrantConditions(calendarReadTarget, { scheduledWorkflow: true, accountId: accountHint }),
      source: "permission_prompt",
      reason: "Allow this scheduled workflow to read Google Calendar events.",
    });
    const auditThread = store.createThread("Scheduled Calendar audit receipts");
    const auditEntries: PermissionAuditEntry[] = [];
    let scheduledRunId = "";
    const started = await runDueWorkflowArtifactSchedules(
      store,
      secondDueAt,
      async (scheduleInput) => {
        const { schedule: runnerSchedule, artifact: runnerArtifact } = scheduleInput;
        expect(runnerSchedule.id).toBe(schedule.id);
        expect(runnerArtifact.id).toBe(artifact.id);
        const runDashboard = await runWorkflowApprovingReviews({
          store,
          artifactId: runnerArtifact.id,
          workspacePath,
          adapter,
          connectorOptions,
          apiKey,
          model: liveWorkflowModel(),
          baseUrl: liveAmbientBaseUrl(),
          maxApprovalRounds: 3,
        });
        const run = latestRunForArtifact(runDashboard, runnerArtifact.id);
        scheduledRunId = run.id;
        store.appendWorkflowRunEvent({
          runId: run.id,
          type: "workflow.schedule.started",
          message: runnerSchedule.id,
          data: workflowScheduleRunStartedEventData(scheduleInput),
        });
        return { runId: run.id };
      },
      { threadId: auditThread.id, onPermissionAuditCreated: (entry) => auditEntries.push(entry) },
    );
    const run = store.getWorkflowRun(scheduledRunId);
    const detail = readWorkflowRunDetail(store, scheduledRunId);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { brief?: { summary?: string; highlights?: string[]; eventCount?: number } } }>;
    };
    const scheduleRunHistory = workflowScheduleRunHistoryItems(schedule.id, store.listWorkflowRuns());

    await writeScheduledCalendarRunDogfoodArtifact({
      accountHint,
      schedule: {
        id: schedule.id,
        targetKind: schedule.targetKind,
        targetId: schedule.targetId,
        firstOutcome: blocked[0],
        secondOutcome: started[0],
        latestStored: store.listAutomationSchedules().find((candidate) => candidate.id === schedule.id),
      },
      grant: { id: grant.id, scopeKind: grant.scopeKind, targetLabel: grant.targetLabel },
      grantReuseAudit: auditEntries.map((entry) => ({ id: entry.id, toolName: entry.toolName, decisionSource: entry.decisionSource, grantId: entry.grantId, detail: entry.detail })),
      version: approvedVersion ? { id: approvedVersion.id, version: approvedVersion.version, status: approvedVersion.status } : undefined,
      run: { id: run.id, status: run.status, error: run.error, scheduledBy: run.scheduledBy },
      eventCounts: eventCountsByType(detail.events),
      scheduleStartEvents: detail.events
        .filter((event) => event.type === "workflow.schedule.started")
        .map((event) => ({ message: event.message, data: event.data })),
      scheduleRunHistory,
      connectorMessages: detail.events.filter((event) => event.type === "connector.end").map((event) => event.message),
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs, model: call.model })),
      checkpoint: state.checkpoints?.calendarBrief?.value,
    });

    expect(approvedVersion).toMatchObject({ workflowThreadId: thread.id, artifactId: artifact.id, status: "approved" });
    expect(blocked).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: thread.id,
        outcome: "skipped",
        reason: "Workflow schedule requires persistent connector grant for google.calendar.",
      }),
    ]);
    expect(started).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: thread.id,
        versionId: approvedVersion?.id,
        outcome: "started",
        runId: scheduledRunId,
      }),
    ]);
    expect(run).toMatchObject({ status: "succeeded" });
    expect(run.scheduledBy).toMatchObject({
      scheduleId: schedule.id,
      targetKind: "workflow_thread",
      targetVersionId: approvedVersion?.id,
      grantDecisionSource: "persistent_grant",
    });
    expect(scheduleRunHistory).toEqual([
      expect.objectContaining({
        id: scheduledRunId,
        statusLabel: "Run Succeeded",
        tone: "ready",
      }),
      expect.objectContaining({
        statusLabel: "Schedule skipped",
        tone: "neutral",
      }),
    ]);
    expect(auditEntries).toEqual([
      expect.objectContaining({
        toolName: "google.calendar.listEvents",
        decision: "allowed",
        decisionSource: "persistent_grant",
        grantId: grant.id,
        reason: "Scheduled workflow preflight reused a persistent connector grant.",
      }),
    ]);
    expect(detail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workflow.schedule.started",
          data: expect.objectContaining({
            scheduleId: schedule.id,
            targetKind: "workflow_thread",
            workflowThreadId: thread.id,
            targetVersionId: approvedVersion?.id,
            grantDecisionSource: "persistent_grant",
            grantIds: [grant.id],
            grantTargets: [calendarReadTarget.label],
          }),
        }),
      ]),
    );
    expect(detail.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.calendar.listEvents" })]));
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.calendar_brief", status: "succeeded" })]));
    expect(state.checkpoints?.calendarBrief?.value?.brief?.summary).toMatch(/calendar|event|schedule|upcoming|no upcoming/i);
    expect(store.listAutomationSchedules().find((candidate) => candidate.id === schedule.id)).toMatchObject({
      id: schedule.id,
      lastRunAt: secondDueAt.toISOString(),
    });
  }, LIVE_GMAIL_RUN_TIMEOUT_MS);

  itLive("dogfoods scheduled local-file timeout recovery with live Ambient", async () => {
    const apiKey = liveAmbientApiKey();
    const model = liveWorkflowModel();
    const fixtureDir = join(workspacePath, "scheduled-local-files");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(
      join(fixtureDir, "meeting-notes.md"),
      ["# Meeting notes", "- Draft the Scottsdale activities report.", "- Separate kid-friendly events from date-night options."].join("\n"),
      "utf8",
    );
    await writeFile(
      join(fixtureDir, "inbox.txt"),
      ["Budget review due Friday.", "Public pool list needs toddler-friendly labels.", "Archive completed research notes."].join("\n"),
      "utf8",
    );
    const paths = ["scheduled-local-files/meeting-notes.md", "scheduled-local-files/inbox.txt"];
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Classify local files every morning and produce a compact HTML status report.",
      projectPath: workspacePath,
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest:
        "Create a read-only scheduled local-file workflow that reads a small directory, checkpoints normalized evidence, asks Ambient to classify the files, and returns a compact HTML report.",
      workspaceSummary: "Live scheduled local-file timeout recovery dogfood with two small files in scheduled-local-files/.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model,
      provider: { compileProgramIr: vi.fn(async () => scheduledLocalFileTimeoutRecoveryCompilerOutput(paths)) },
    });
    const artifact = dashboard.artifacts[0];
    reviewWorkflowArtifact(store, { artifactId: artifact.id, decision: "approved" });
    const approvedVersion = store.getLatestApprovedWorkflowVersion(thread.id);
    const schedule = store.createAutomationSchedule(
      {
        targetKind: "workflow_thread",
        targetId: thread.id,
        preset: "daily",
        timezone: "America/Phoenix",
        runLimits: { idleTimeoutMs: 90_000, maxRunMs: null },
      },
      createdAt,
    )[0];
    const limited = store.updateAutomationScheduleOccurrenceRunLimits({
      scheduleId: schedule.id,
      occurrenceAt: schedule.nextRunAt,
      runLimits: { idleTimeoutMs: 90_000, maxRunMs: 650 },
      reason: "Dogfood a recoverable one-off scheduled timeout.",
    });
    const pendingException = limited.exceptions.find((exception) => exception.exceptionKind === "run_limits");
    if (!pendingException) throw new Error("Expected run-limit occurrence exception.");

    let pausedRunId = "";
    const started = await runDueWorkflowArtifactSchedules(
      store,
      dueAt,
      async (scheduleInput) => {
        expect(scheduleInput.runLimits).toMatchObject({ idleTimeoutMs: 90_000, maxRunMs: 650 });
        expect(scheduleInput.occurrenceExceptionId).toBe(pendingException.id);
        const pausedDashboard = await runWorkflowArtifact({
          store,
          artifactId: scheduleInput.artifact.id,
          workspacePath,
          permissionMode: "full-access",
          runtime: "automation",
          recoverableTimeouts: true,
          runLimits: scheduleInput.runLimits,
          model,
          ambientProvider: new AmbientWorkflowRunProvider({
            model,
            apiKey,
            baseUrl: liveAmbientBaseUrl(),
            workflowThreadId: thread.id,
            idleTimeoutMs: 90_000,
            absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          }),
        });
        const pausedRun = latestRunForArtifact(pausedDashboard, scheduleInput.artifact.id);
        pausedRunId = pausedRun.id;
        store.appendWorkflowRunEvent({
          runId: pausedRun.id,
          type: "workflow.schedule.started",
          message: scheduleInput.schedule.id,
          data: workflowScheduleRunStartedEventData(scheduleInput),
        });
        return { runId: pausedRun.id };
      },
      { permissionMode: "full-access" },
    );
    const pausedRun = store.getWorkflowRun(pausedRunId);
    const pausedDetail = readWorkflowRunDetail(store, pausedRunId);
    const timeoutPause = workflowTotalRuntimePauseModel(pausedDetail.run.status, pausedDetail.events);
    const removeCapComposer = workflowThreadComposerModel({ draft: "remove total runtime cap", detail: pausedDetail });

    const resumedDashboard = await runWorkflowArtifact({
      store,
      artifactId: artifact.id,
      workspacePath,
      permissionMode: "full-access",
      resumeFromRunId: pausedRun.id,
      runLimits: workflowRemoveTotalRunLimitOverrides({ idleTimeoutMs: 90_000 }),
      model,
      ambientProvider: new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
    const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
    const scheduleRunHistory = workflowScheduleRunHistoryItems(schedule.id, store.listWorkflowRuns(), 5);
    const outputCards = workflowRunOutputCards(resumedDetail);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { files?: unknown[]; report?: { summary?: string; html?: string; files?: string[] } } }>;
    };

    await writeScheduledLocalTimeoutRecoveryDogfoodArtifact({
      schedule: {
        id: schedule.id,
        targetKind: schedule.targetKind,
        targetId: schedule.targetId,
        runLimits: schedule.runLimits,
        startedOutcome: started[0],
        consumedExceptions: store.listAutomationScheduleExceptions({ scheduleId: schedule.id }).map((exception) => ({
          id: exception.id,
          kind: exception.exceptionKind,
          status: exception.status,
          runLimits: exception.runLimits,
        })),
      },
      version: approvedVersion ? { id: approvedVersion.id, version: approvedVersion.version, status: approvedVersion.status } : undefined,
      pausedRun: { id: pausedRun.id, status: pausedRun.status, error: pausedRun.error, scheduledBy: pausedRun.scheduledBy },
      timeoutPause,
      removeCapComposer: {
        mode: removeCapComposer.mode,
        runtimeAction: removeCapComposer.runtimeAction,
        disabled: removeCapComposer.disabled,
      },
      resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error, scheduledBy: resumedRun.scheduledBy },
      scheduleRunHistory,
      eventCounts: eventCountsByType(resumedDetail.events),
      modelCalls: resumedDetail.modelCalls.map((call) => ({
        task: call.task,
        status: call.status,
        latencyMs: call.latencyMs,
        graphNodeId: call.graphNodeId,
      })),
      outputCards: outputCards.map((card) => ({
        kind: card.kind,
        format: card.format,
        label: card.label,
        preview: card.preview?.slice(0, 360),
      })),
      checkpoint: state.checkpoints?.scheduledLocalReport?.value,
    });

    expect(approvedVersion).toMatchObject({ workflowThreadId: thread.id, artifactId: artifact.id, status: "approved" });
    expect(started).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        artifactId: artifact.id,
        workflowThreadId: thread.id,
        versionId: approvedVersion?.id,
        outcome: "started",
        runId: pausedRun.id,
      }),
    ]);
    expect(pausedRun).toMatchObject({
      status: "paused",
      error: "Workflow reached the total runtime limit (650ms).",
      scheduledBy: expect.objectContaining({ scheduleId: schedule.id, targetVersionId: approvedVersion?.id }),
    });
    expect(timeoutPause).toMatchObject({ totalLimitLabel: "650 ms", sourceLabel: "run override" });
    expect(removeCapComposer).toMatchObject({ mode: "run_recovery", runtimeAction: "remove_total_runtime_cap", disabled: false });
    expect(resumedRun).toMatchObject({
      status: "succeeded",
      scheduledBy: expect.objectContaining({ scheduleId: schedule.id, targetVersionId: approvedVersion?.id }),
    });
    expect(resumedDetail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "workflow.resume", message: pausedRun.id }),
        expect.objectContaining({
          type: "workflow.schedule.started",
          message: schedule.id,
          data: expect.objectContaining({ resumeSourceRunId: pausedRun.id }),
        }),
        expect.objectContaining({ type: "checkpoint.resume", message: "scheduledLocalEvidence" }),
        expect.objectContaining({ type: "ambient.call.progress", graphNodeId: "classify-files" }),
        expect.objectContaining({ type: "checkpoint.write", message: "scheduledLocalReport" }),
      ]),
    );
    expect(scheduleRunHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: resumedRun.id, statusLabel: "Run Succeeded", actionLabel: "Open run" }),
        expect.objectContaining({ id: pausedRun.id, statusLabel: "Run Paused", actionLabel: "Extend run" }),
      ]),
    );
    expect(store.listAutomationScheduleExceptions({ scheduleId: schedule.id })).toEqual([
      expect.objectContaining({ id: pendingException.id, exceptionKind: "run_limits", status: "consumed" }),
    ]);
    expect(resumedDetail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.scheduled_local_report", status: "succeeded" })]));
    expect(outputCards).toEqual(expect.arrayContaining([expect.objectContaining({ format: "html", preview: expect.stringMatching(/file|classif|report|scottsdale|pool|budget/i) })]));
    expect(state.checkpoints?.scheduledLocalReport?.value?.report?.summary).toMatch(/file|classif|report|scottsdale|pool|budget/i);
  }, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS);

  itLiveGoogleWorkspaceRun("runs a Drive file-evidence report workflow through the real Google wrapper", async () => {
    const apiKey = liveAmbientApiKey();
    const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("drive");
    const connectorOptions = liveDriveConnectorOptions(accountHint);
    const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter((descriptor) => descriptor.id === "google.drive");
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Search Google Drive files and summarize file evidence.",
      traceMode: "debug",
    });
    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a read-only Google Drive workflow that searches recent files, reads metadata for top matches, asks Ambient to summarize the file evidence, and checkpoints the report.",
      workspaceSummary: `Live Google Workspace Drive runtime dogfood. GWS Drive connector account ${accountHint} is available and should be used exactly.`,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      provider: { compileProgramIr: vi.fn(async () => driveFileReportCompilerOutput(accountHint)) },
    });
    const artifact = dashboard.artifacts[0];
    const driveGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.drive");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(artifact.manifest.mutationPolicy).toBe("read_only");
    expect(driveGrant).toMatchObject({
      connectorId: "google.drive",
      accountId: accountHint,
      scopes: expect.arrayContaining(["drive.readonly"]),
      operations: expect.arrayContaining(["search", "readFile"]),
      dataRetention: "redacted_audit",
    });

    const runDashboard = await runWorkflowApprovingReviews({
      store,
      artifactId: artifact.id,
      workspacePath,
      adapter,
      connectorOptions,
      apiKey,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      maxApprovalRounds: 5,
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const detail = readWorkflowRunDetail(store, run.id);
    const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
      checkpoints?: Record<string, { value?: { fileCount?: number; report?: { summary?: string; fileCount?: number; highlights?: string[] } } }>;
    };
    const connectorMessages = detail.events.filter((event) => event.type === "connector.end").map((event) => event.message);

    const driveRunArtifact = {
      accountHint,
      providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
      run: { id: run.id, status: run.status, error: run.error },
      eventCounts: eventCountsByType(detail.events),
      connectorMessages,
      modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs, model: call.model })),
      checkpoint: state.checkpoints?.driveFileReport?.value,
    };
    await writeDriveRunDogfoodArtifact(driveRunArtifact);

    if (run.status !== "succeeded") {
      throw new Error(`Expected Drive read-only dogfood run to succeed. run=${JSON.stringify(driveRunArtifact)}`);
    }
    expect(detail.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.drive.search" })]));
    if ((state.checkpoints?.driveFileReport?.value?.fileCount ?? 0) > 0) {
      expect(connectorMessages.filter((message) => message === "google.drive.readFile").length).toBeGreaterThan(0);
    }
    expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ task: "dogfood.drive_file_report", status: "succeeded" })]));
    expect(state.checkpoints?.driveFileReport?.value?.report?.summary).toMatch(/drive|file|metadata|evidence|no files/i);
  }, LIVE_GMAIL_RUN_TIMEOUT_MS);

  itLiveGmailRun("runs a Gmail last-100-emails categorization workflow through the real Google wrapper", async () => {
    const apiKey = liveAmbientApiKey();
    const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("gmail");
    const connectorOptions = liveGmailConnectorOptions(accountHint);
    const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter((descriptor) => descriptor.id === "google.gmail");
    const userRequest = [
      "Review the last 100 emails in Gmail and write a concise report categorizing them by action required, urgency, sender/domain, and recurring themes.",
      "The workflow must be read-only, use the available Google Gmail connector account exactly, search the last 100 messages, read enough thread detail to support the categorization, ask Ambient to synthesize a structured JSON report, preserve only redacted audit data, and allow enough connector-call and runtime budget for the loop.",
    ].join(" ");

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest,
      workspaceSummary: `Live Google Workspace runtime dogfood. GWS Gmail connector account ${accountHint} is available and should be used exactly.`,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      provider: new AmbientWorkflowCompilerProvider({
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      }),
    });
    const artifact = dashboard.artifacts[0];
    const source = await readFile(artifact.sourcePath, "utf8");
    const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

    expect(artifact).toMatchObject({ status: "ready_for_preview" });
    expect(["read_only", "staged_until_approved"]).toContain(artifact.manifest.mutationPolicy);
    if (artifact.manifest.mutationPolicy === "staged_until_approved") {
      expect(artifact.manifest.tools).toContain("file_write");
    }
    expect(gmailGrant).toMatchObject({
      connectorId: "google.gmail",
      accountId: accountHint,
      scopes: expect.arrayContaining(["gmail.readonly"]),
      operations: expect.arrayContaining(["search", "readThread"]),
      dataRetention: "redacted_audit",
    });
    expect(gmailGrant?.operations).not.toEqual(expect.arrayContaining(["createDraft", "updateDraft", "deleteDraft", "sendDraft"]));
    expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(2);
    expect(artifact.manifest.maxRunMs ?? 0).toBeGreaterThanOrEqual(300_000);
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
    expect(source).toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
    expect(source).toMatch(/["']?maxResults["']?\s*:\s*100/);
    expect(source).toMatch(/["']?accountId["']?\s*:\s*['"][^'"]+['"]/);
    expect(source).toMatch(/workflow\.(checkpoint|resumePoint)/);

    const runDashboard = await runWorkflowApprovingReviews({
      store,
      artifactId: artifact.id,
      workspacePath,
      adapter,
      connectorOptions,
      apiKey,
      model: liveWorkflowModel(),
      baseUrl: liveAmbientBaseUrl(),
      maxApprovalRounds: 5,
    });
    const run = latestRunForArtifact(runDashboard, artifact.id);
    const events = store.listWorkflowRunEvents(run.id);
    const modelCalls = store.listWorkflowModelCalls({ runId: run.id });
    const report = run.reportPath ? await readFile(run.reportPath, "utf8") : "";

    await writeLiveGmailRunDogfoodArtifact({
      accountHint,
      providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
      run: { id: run.id, status: run.status, error: run.error },
      eventCounts: eventCountsByType(events),
      connectorMessages: events.filter((event) => event.type === "connector.end").map((event) => event.message),
      ambientErrors: events
        .filter((event) => event.type === "ambient.call.error")
        .map((event) => ({ message: event.message, graphNodeId: event.graphNodeId, data: event.data })),
      modelCalls: modelCalls.map((call) => ({
        task: call.task,
        status: call.status,
        model: call.model,
        validationError: call.validationError,
        requestEstimatedTokens: call.cacheCheckpoint?.requestEstimatedTokens,
        mutableSuffixTokens: call.cacheCheckpoint?.mutableSuffixEstimatedTokens,
      })),
    });

    expect(run).toMatchObject({ status: "succeeded" });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.gmail.search" })]));
    expect(events.filter((event) => event.type === "connector.end" && event.message === "google.gmail.readThread").length).toBeGreaterThan(0);
    expect(modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
    expect(report).toContain("google.gmail.search");
    expect(report).toContain("ambient.call");
  }, LIVE_GMAIL_RUN_TIMEOUT_MS);
});

function fakeBrowser(targetUrl: string, searchResults: Array<{ title: string; url: string; snippet: string }> = []) {
  return {
    search: vi.fn(async () => searchResults),
    navigate: vi.fn(async (input: { url: string }) => ({ url: input.url, title: "Dogfood QA Fixture" })),
    content: vi.fn(async () => ({ url: targetUrl, text: "Dogfood QA Fixture\nStatus: ready", links: [] })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(dirname(targetUrl.replace("file://", "")), "qa-fixture.png") })),
    pick: vi.fn(),
  };
}

const fakeBrowserCredentialSafeStorage: BrowserCredentialSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value, "utf8"),
  decryptString: (value: Buffer) => value.toString("utf8"),
};

async function createPlanEditFixtureWorkflow(store: ProjectStore, workspacePath: string) {
  const thread = store.createWorkflowAgentThreadSummary({
    title: "Plan Edit Dogfood Workflow",
    initialRequest: "Call Ambient once to draft a concise local reading list.",
    projectPath: workspacePath,
    phase: "ready_for_review",
    traceMode: "debug",
  });
  const graph = store.createWorkflowGraphSnapshot({
    workflowThreadId: thread.id,
    source: "compile",
    summary: "request to Ambient model call to output",
    nodes: [
      { id: "request", type: "request", label: "Request", description: "User asks for a local reading list." },
      {
        id: "draft-list",
        type: "model_call",
        label: "Draft list",
        modelRole: "Draft concise reading-list recommendations.",
        inputSummary: "instruction for a concise reading-list JSON response",
        outputSummary: "JSON object with summary string",
        retryPolicy: "no retry in fixture",
      },
      { id: "output", type: "output", label: "Output", description: "Return the list to the user." },
    ],
    edges: [
      { id: "request-to-draft", source: "request", target: "draft-list", type: "data_flow", label: "prompt" },
      { id: "draft-to-output", source: "draft-list", target: "output", type: "data_flow", label: "list" },
    ],
  });
  const workflowDir = join(workspacePath, ".ambient-codex", "workflows", "plan-edit-dogfood");
  await mkdir(workflowDir, { recursive: true });
  const sourcePath = join(workflowDir, "main.ts");
  const statePath = join(workflowDir, "state.json");
  await writeFile(
    sourcePath,
    [
      "const listSchema = {",
      "  parse(value) {",
      "    if (!value || typeof value.summary !== 'string') throw new Error('Invalid list response.');",
      "    return value;",
      "  }",
      "};",
      "",
      "export default async function run({ workflow, ambient }) {",
      "  const result = await workflow.step('draft-list', { nodeId: 'draft-list' }, () => ambient.call({",
      "    task: 'dogfood.plan_edit_fixture',",
      "    input: { instruction: 'Return JSON with summary:string for a concise reading list.' },",
      "    schema: listSchema,",
      "    cacheKey: ['dogfood', 'plan-edit-fixture'],",
      "    nodeId: 'draft-list'",
      "  }));",
      "  await workflow.checkpoint('readingList', result);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  const artifact = store.createWorkflowArtifact({
    workflowThreadId: thread.id,
    title: "Plan Edit Dogfood Workflow",
    status: "approved",
    manifest: {
      tools: ["ambient.responses"],
      mutationPolicy: "read_only",
      maxToolCalls: 2,
      maxModelCalls: 1,
      maxRunMs: 120_000,
    },
    spec: {
      goal: "Call Ambient once to draft a concise local reading list.",
      summary: "Uses one Ambient model call and checkpoints the returned reading list.",
      successCriteria: ["Ambient returns structured JSON", "The workflow writes a readingList checkpoint"],
      inputs: {},
    },
    sourcePath,
    statePath,
  });
  const version = store.createWorkflowVersion({
    workflowThreadId: thread.id,
    artifactId: artifact.id,
    graphSnapshotId: graph.id,
    sourcePath,
    repoPath: workspacePath,
    gitCommitHash: "plan-edit-dogfood",
    status: "approved",
    createdBy: "compiler",
  });
  return { threadId: thread.id, graphId: graph.id, artifactId: artifact.id, versionId: version.id };
}

async function createApplyRestoreFixtureWorkflow(store: ProjectStore, workspacePath: string) {
  const thread = store.createWorkflowAgentThreadSummary({
    title: "Apply Restore Dogfood Workflow",
    initialRequest: "Call Ambient once to draft a concise local reading list, then keep the workflow versioned.",
    projectPath: workspacePath,
    phase: "approved",
    traceMode: "debug",
  });
  store.ensureWorkflowAgentChatThread(thread.id);
  const workflowDir = join(workspacePath, ".ambient-codex", "workflows", "apply-restore-dogfood");
  await mkdir(workflowDir, { recursive: true });
  const sourcePath = join(workflowDir, "main.ts");
  const statePath = join(workflowDir, "state.json");
  const manifest = {
    tools: ["ambient.responses"],
    mutationPolicy: "read_only" as const,
    maxToolCalls: 2,
    maxModelCalls: 1,
    maxRunMs: 120_000,
  };
  const spec = {
    goal: "Call Ambient once to draft a concise local reading list.",
    summary: "Uses one Ambient model call and checkpoints the returned reading list.",
    successCriteria: ["Ambient returns structured JSON", "The workflow writes a readingList checkpoint"],
    inputs: {},
  };
  const graph = {
    summary: "request to Ambient model call to output",
    nodes: [
      { id: "request", type: "request" as const, label: "Request", description: "User asks for a local reading list." },
      {
        id: "draft-list",
        type: "model_call" as const,
        label: "Draft list",
        modelRole: "Draft concise reading-list recommendations.",
        inputSummary: "instruction for a concise reading-list JSON response",
        outputSummary: "JSON object with summary string",
        retryPolicy: "no retry in fixture",
      },
      { id: "output", type: "output" as const, label: "Output", description: "Return the list to the user." },
    ],
    edges: [
      { id: "request-to-draft", source: "request", target: "draft-list", type: "data_flow" as const, label: "prompt" },
      { id: "draft-to-output", source: "draft-list", target: "output", type: "data_flow" as const, label: "list" },
    ],
  };
  const source = [
    "const listSchema = {",
    "  parse(value) {",
    "    if (!value || typeof value.summary !== 'string') throw new Error('Invalid list response.');",
    "    return value;",
    "  }",
    "};",
    "",
    "export default async function run({ workflow, ambient }) {",
    "  const result = await workflow.step('draft-list', { nodeId: 'draft-list' }, () => ambient.call({",
    "    task: 'dogfood.apply_restore_fixture',",
    "    input: { instruction: 'Return JSON with summary:string for a concise reading list.' },",
    "    schema: listSchema,",
    "    cacheKey: ['dogfood', 'apply-restore-fixture'],",
    "    nodeId: 'draft-list'",
    "  }));",
    "  await workflow.checkpoint('readingList', result);",
    "}",
    "",
  ].join("\n");

  await writeFile(join(workflowDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(workflowDir, "spec.json"), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  await writeFile(join(workflowDir, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  await writeFile(sourcePath, source, "utf8");
  await writeFile(join(workflowDir, "preview.md"), "# Apply Restore Dogfood Workflow\n", "utf8");
  await writeFile(join(workflowDir, "compile-context.json"), `${JSON.stringify({ fixture: "apply-restore" }, null, 2)}\n`, "utf8");
  const commit = await commitWorkflowVersionRepo({ repoPath: workflowDir, message: "Create apply restore dogfood workflow" });
  const graphSnapshot = store.createWorkflowGraphSnapshot({
    workflowThreadId: thread.id,
    source: "compile",
    summary: graph.summary,
    nodes: graph.nodes,
    edges: graph.edges,
    artifactPath: join(workflowDir, "graph.json"),
  });
  const artifact = store.createWorkflowArtifact({
    workflowThreadId: thread.id,
    title: "Apply Restore Dogfood Workflow",
    status: "approved",
    manifest,
    spec,
    sourcePath,
    statePath,
  });
  const version = store.createWorkflowVersion({
    workflowThreadId: thread.id,
    artifactId: artifact.id,
    graphSnapshotId: graphSnapshot.id,
    sourcePath,
    repoPath: workflowDir,
    gitCommitHash: commit.commitHash,
    status: "approved",
    createdBy: "compiler",
  });
  return { threadId: thread.id, graphId: graphSnapshot.id, artifactId: artifact.id, versionId: version.id, workflowDir };
}

function fakeResearchBrowser() {
  const results = [
    {
      title: "PagedAttention and vLLM",
      url: "https://example.test/research/pagedattention",
      snippet: "PagedAttention stores KV cache in non-contiguous blocks so serving can reduce memory waste and support more concurrent requests.",
    },
    {
      title: "StreamingLLM attention sinks",
      url: "https://example.test/research/streamingllm",
      snippet: "StreamingLLM keeps attention sink tokens and recent tokens so long-context generation can continue with a bounded KV cache.",
    },
  ];
  const pages = new Map(
    results.map((result) => [
      result.url,
      [
        result.title,
        result.snippet,
        "Source evidence: KV cache pressure is a primary serving bottleneck for long-context inference.",
        "Operational implication: deterministic workflows should cite which source supported each optimization claim.",
      ].join("\n"),
    ]),
  );
  return {
    search: vi.fn(async () => results),
    navigate: vi.fn(async (input: { url: string }) => ({ url: input.url, title: results.find((result) => result.url === input.url)?.title ?? "Research source" })),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Research source",
      text: pages.get(input.url ?? "") ?? "No page content available.",
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(tmpdir(), "research-source.png"), bytes: 0 })),
    pick: vi.fn(),
  };
}

function fakeScottsdaleEntertainmentBrowser() {
  const results = [
    {
      title: "Scottsdale Couples Movie Listings",
      url: "https://example.test/scottsdale/couples-movies",
      snippet:
        "This week: romantic drama at Harkins Camelview, late comedy at RoadHouse Cinemas, and a quiet weekday matinee option for date-night planning.",
    },
    {
      title: "Scottsdale Live Shows Calendar",
      url: "https://example.test/scottsdale/live-shows",
      snippet:
        "This week: acoustic jazz at Scottsdale Center for the Performing Arts, an intimate magic show, and a dinner-friendly lounge set.",
    },
    {
      title: "Old Town Scottsdale Date Night Guide",
      url: "https://example.test/scottsdale/date-night",
      snippet: "Neighborhood guide with walkable dinner, movie, and live-entertainment pairings near Old Town Scottsdale.",
    },
  ];
  const pages = new Map([
    [
      "https://example.test/scottsdale/couples-movies",
      [
        "Scottsdale Couples Movie Listings",
        "Current week highlights:",
        "- Harkins Camelview: Moonlit Letters, a romantic drama with reserved seating and post-film dining nearby.",
        "- RoadHouse Cinemas Scottsdale: Late Laughs, an easy comedy pick with in-theater dinner service.",
        "- Matinee option: quiet weekday screening for couples who prefer lower crowds.",
        "Evidence note: movie times should be verified before booking.",
      ].join("\n"),
    ],
    [
      "https://example.test/scottsdale/live-shows",
      [
        "Scottsdale Live Shows Calendar",
        "Current week highlights:",
        "- Scottsdale Center for the Performing Arts: Desert Jazz Duo, a seated acoustic show with date-night atmosphere.",
        "- Old Town Lounge: Sunset Standards, a low-volume lounge set suitable for conversation.",
        "- Intimate Magic Room: close-up show near restaurants; ticket availability changes quickly.",
        "Evidence note: live show dates and tickets should be verified before attending.",
      ].join("\n"),
    ],
    [
      "https://example.test/scottsdale/date-night",
      [
        "Old Town Scottsdale Date Night Guide",
        "Pair a movie or acoustic show with walkable dinner options.",
        "Prefer venues where conversation is possible and parking is straightforward.",
      ].join("\n"),
    ],
  ]);
  return {
    search: vi.fn(async () => results),
    navigate: vi.fn(async (input: { url: string }) => ({ url: input.url, title: results.find((result) => result.url === input.url)?.title ?? "Scottsdale source" })),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Scottsdale source",
      text: pages.get(input.url ?? "") ?? "No Scottsdale source content available.",
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(tmpdir(), "scottsdale-entertainment-source.png"), bytes: 0 })),
    pick: vi.fn(),
  };
}

function fakeScottsdaleEntertainmentBrowserWithIntervention() {
  const result = {
    title: "Scottsdale Family Shows Calendar",
    url: "https://example.test/scottsdale/family-shows",
    snippet:
      "Next week: puppet theater, family-friendly magic matinee, and an outdoor kids concert. The source requires browser verification before content loads.",
  };
  const userAction = {
    id: "browser-action-family-shows",
    active: true,
    status: "waiting",
    kind: "captcha",
    provider: "recaptcha",
    toolName: "browser_nav",
    runtime: "chrome",
    profileMode: "copied",
    url: result.url,
    title: "Scottsdale Family Shows - Verify",
    origin: "https://example.test",
    pageExcerpt: "Scottsdale Family Shows Calendar. Complete the CAPTCHA in the managed browser before the source content loads.",
    screenshot: {
      path: join(tmpdir(), "scottsdale-family-shows-verification.png"),
      artifactPath: ".ambient-codex/browser/screenshots/scottsdale-family-shows-verification.png",
      mimeType: "image/png",
      bytes: 14321,
      width: 1200,
      height: 800,
      title: "Scottsdale Family Shows - Verify",
      url: result.url,
    },
    message: "Complete the CAPTCHA in the managed browser, then return to Ambient and continue.",
    startedAt: "2026-05-12T00:00:00.000Z",
    lastCheckedAt: "2026-05-12T00:00:00.000Z",
    canAutoResume: true,
  };
  return {
    search: vi.fn(async () => [result]),
    navigate: vi.fn(async (input: { url: string; userActionId?: string }) => {
      if (input.url === result.url && input.userActionId !== userAction.id) return userAction;
      return { url: input.url, title: result.title };
    }),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: result.title,
      text: [
        "Scottsdale Family Shows Calendar",
        "Next-week child-friendly highlights:",
        "- Puppet Adventures: a 45-minute puppet theater show recommended for ages 3-7.",
        "- Magic Matinee: family-friendly close-up magic with early afternoon seating.",
        "- Kids Concert in the Park: outdoor sing-along with shaded seating and food trucks.",
        "Evidence note: dates and tickets should be verified before attending.",
      ].join("\n"),
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => userAction.screenshot),
    pick: vi.fn(),
  };
}

function recordingWorkflowBrowser(browserService: BrowserService): { browser: WorkflowBrowserAdapter; calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {
    search: [],
    navigate: [],
    content: [],
    evaluate: [],
    screenshot: [],
    pick: [],
  };
  return {
    calls,
    browser: {
      search: async (input) => {
        calls.search.push(input);
        return browserService.search(input);
      },
      navigate: async (input) => {
        calls.navigate.push(input);
        return browserService.navigate(input);
      },
      content: async (input) => {
        calls.content.push(input);
        return browserService.content(input);
      },
      evaluate: async (input) => {
        calls.evaluate.push(input);
        return browserService.evaluate(input);
      },
      screenshot: async (input) => {
        calls.screenshot.push(input);
        return browserService.screenshot(input);
      },
      pick: async (input) => {
        calls.pick.push(input);
        return browserService.pick(input);
      },
    },
  };
}

async function createManagedBrowserChallengeServer(): Promise<{
  url: string;
  hits: { shows: number };
  close: () => Promise<void>;
}> {
  const hits = { shows: 0 };
  const server: Server = createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "/";
    if (path !== "/shows") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    hits.shows += 1;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Verify you are human</title>
    <script>
      function whenBodyReady(fn) {
        if (document.body) {
          fn();
          return;
        }
        window.addEventListener("DOMContentLoaded", fn, { once: true });
      }
      function renderReady() {
        document.title = "Scottsdale Managed Browser Shows Ready";
        document.body.innerHTML = [
          "<main>",
          "<h1>Scottsdale family-friendly live shows next week</h1>",
          "<p>This page is the unlocked managed-browser dogfood source.</p>",
          "<article><h2>Puppet Adventures</h2><p>Recommended ages 3-7. A 45-minute puppet theater matinee with reserved seating.</p></article>",
          "<article><h2>Magic Matinee</h2><p>Family-friendly close-up magic in early afternoon time slots.</p></article>",
          "<article><h2>Kids Concert in the Park</h2><p>Outdoor sing-along with shaded seating and food trucks.</p></article>",
          "<p>Evidence note: dates and tickets should be verified before attending.</p>",
          "</main>"
        ].join("");
      }
      if (window.localStorage.getItem("ambientDogfoodHuman") === "1") {
        whenBodyReady(renderReady);
      } else {
        window.addEventListener("DOMContentLoaded", function () {
          setTimeout(function () {
            window.localStorage.setItem("ambientDogfoodHuman", "1");
            renderReady();
          }, 2200);
        });
      }
    </script>
  </head>
  <body>
    <main>
      <h1>Verify you are human</h1>
      <p>Complete the CAPTCHA-style human verification in the managed browser to continue.</p>
      <p>This is a deterministic human-verification interstitial for Ambient workflow dogfooding.</p>
    </main>
  </body>
</html>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/shows`,
    hits,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function liveAmbientApiKey(): string {
  return readLiveAmbientProviderApiKey({ purpose: "live Workflow Agent dogfood" });
}

function liveAmbientBaseUrl(): string | undefined {
  return liveAmbientProviderBaseUrl();
}

function liveWorkflowModel(preferredModelEnvNames: string[] = ["AMBIENT_WORKFLOW_MODEL", "AMBIENT_LIVE_MODEL"]): string {
  return liveAmbientProviderModel({ preferredModelEnvNames, fallbackModel: AMBIENT_DEFAULT_MODEL });
}

function liveGmailConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.gmail": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

function liveCalendarConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.calendar": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

function liveDriveConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.drive": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

async function runWorkflowApprovingReviews(input: {
  store: ProjectStore;
  artifactId: string;
  workspacePath: string;
  adapter: GoogleWorkspaceCliAdapter;
  connectorOptions: GoogleWorkspaceConnectorDescriptorOptions;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxApprovalRounds: number;
}): Promise<WorkflowDashboard> {
  const connectorRegistrations = googleWorkspaceConnectorRegistrations({ sidecar: input.adapter }, input.connectorOptions);
  let dashboard = await runWorkflowArtifact({
    store: input.store,
    artifactId: input.artifactId,
    workspacePath: input.workspacePath,
    permissionMode: "full-access",
    connectorRegistrations,
    connectorApprovalDecision: () => "approved",
    model: input.model,
    baseUrl: input.baseUrl,
    ambientProvider: new AmbientWorkflowRunProvider({
      model: input.model,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      workflowThreadId: input.store.getWorkflowArtifact(input.artifactId).workflowThreadId,
      idleTimeoutMs: 90_000,
      absoluteTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
      enforceAbsoluteTimeout: true,
    }),
  });
  for (let round = 0; round < input.maxApprovalRounds; round += 1) {
    const run = latestRunForArtifact(dashboard, input.artifactId);
    if (run.status !== "paused") return dashboard;
    const approved = approvePendingWorkflowReviews(input.store, run.id);
    if (approved === 0) throw new Error(`Workflow paused without pending approvals: ${run.id}`);
    dashboard = await runWorkflowArtifact({
      store: input.store,
      artifactId: input.artifactId,
      workspacePath: input.workspacePath,
      permissionMode: "full-access",
      connectorRegistrations,
      connectorApprovalDecision: () => "approved",
      model: input.model,
      baseUrl: input.baseUrl,
      resumeFromRunId: run.id,
      ambientProvider: new AmbientWorkflowRunProvider({
        model: input.model,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        workflowThreadId: input.store.getWorkflowArtifact(input.artifactId).workflowThreadId,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
        enforceAbsoluteTimeout: true,
      }),
    });
  }
  return dashboard;
}

function approvePendingWorkflowReviews(store: ProjectStore, runId: string): number {
  const events = store.listWorkflowRunEvents(runId);
  const requiredById = new Map(
    events
      .filter((event) => event.type === "approval.required" || event.type === "connector.review.required")
      .map((event) => [typeof event.data?.id === "string" ? event.data.id : "", event]),
  );
  const approvals = workflowApprovalsFromEvents(events).filter((approval) => approval.status === "pending");
  for (const approval of approvals) {
    const required = requiredById.get(approval.id);
    const type = required?.type === "approval.required" ? "approval.approved" : "connector.review.approved";
    store.appendWorkflowRunEvent({
      runId,
      type,
      message: approval.id,
      data: { id: approval.id, changeSet: approval.changeSet, source: "live-dogfood" },
    });
  }
  return approvals.length;
}

function latestRunForArtifact(dashboard: WorkflowDashboard, artifactId: string): WorkflowRunSummary {
  const run = dashboard.runs.find((candidate) => candidate.artifactId === artifactId);
  if (!run) throw new Error(`No workflow run found for artifact ${artifactId}.`);
  return run;
}

function expectGraphFirstReviewWalkthrough(store: ProjectStore, dashboard: WorkflowDashboard): Record<string, unknown> {
  const artifact = dashboard.artifacts[0];
  expect(artifact).toMatchObject({ status: "ready_for_preview" });
  expect(artifact.workflowThreadId).toBeTruthy();

  const thread = store.getWorkflowAgentThreadSummary(artifact.workflowThreadId!);
  const latestRun = store.listWorkflowRuns(artifact.id, 1)[0];
  const detail = latestRun ? readWorkflowRunDetail(store, latestRun.id) : undefined;
  const review = workflowReviewWorkspaceModel({ thread, artifact, latestRun, detail });
  const graph = thread.graph ?? store.listWorkflowGraphSnapshots(artifact.workflowThreadId!)[0];
  const executableNodes = graph.nodes.filter((node) => !["request", "output", "error_handler"].includes(node.type));
  const mappedExecutableNodes = executableNodes.filter((node) => node.sourceRanges?.length);
  const selectedNode =
    mappedExecutableNodes.find((node) => node.type === "model_call") ??
    mappedExecutableNodes.find((node) => node.type === "connector_call") ??
    mappedExecutableNodes[0];

  expect(review.noticeTone).toBe("review");
  expect(review.sections).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "diagram", tone: "ready" }),
      expect.objectContaining({ id: "source", tone: "ready" }),
    ]),
  );
  expect(graph.nodes.length).toBeGreaterThan(1);
  expect(mappedExecutableNodes.length).toBeGreaterThan(0);
  expect(selectedNode).toBeTruthy();

  const nodeReview = workflowGraphNodeReviewModel({
    node: selectedNode!,
    manifest: artifact.manifest,
    traceMode: thread.traceMode,
    events: detail?.events,
    modelCalls: detail?.modelCalls,
    checkpoints: detail?.checkpoints,
  });
  expect(nodeReview.facts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Program mapping", tone: "ready" })]));
  expect(nodeReview.sourceMappings.length).toBeGreaterThan(0);
  expect(nodeReview.actions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "open_source", targetSection: "source", tone: "ready" })]));

  const approvedDashboard = reviewWorkflowArtifact(store, { artifactId: artifact.id, decision: "approved" });
  const approvedArtifact = approvedDashboard.artifacts.find((candidate) => candidate.id === artifact.id);
  if (!approvedArtifact) throw new Error(`Approved artifact missing from dashboard: ${artifact.id}`);
  const approvedThread = store.getWorkflowAgentThreadSummary(artifact.workflowThreadId!);
  const approvedReview = workflowReviewWorkspaceModel({
    thread: approvedThread,
    artifact: approvedArtifact,
    latestRun,
    detail: detail ? { ...detail, artifact: approvedArtifact } : undefined,
  });
  expect(approvedArtifact.status).toBe("approved");
  expect(approvedReview.noticeTone).toBe("ready");

  return {
    artifactId: artifact.id,
    title: artifact.title,
    selectedNode: { id: selectedNode!.id, type: selectedNode!.type, label: selectedNode!.label },
    graphNodes: graph.nodes.length,
    mappedExecutableNodes: mappedExecutableNodes.length,
    sourceMappings: nodeReview.sourceMappings.map((mapping) => mapping.label),
    actions: nodeReview.actions.map((action) => action.id),
    approvedNotice: approvedReview.noticeTitle,
  };
}

function eventCountsByType(events: WorkflowRunEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

function requiredWorkflowApprovalId(store: ProjectStore, runId: string): string {
  const id = store
    .listWorkflowRunEvents(runId)
    .find((event) => event.type === "approval.required" || event.type === "connector.review.required")?.data?.id;
  if (typeof id !== "string") throw new Error(`Missing workflow approval event for run ${runId}.`);
  return id;
}

function fixtureCodexMcpPlugin(rootPath: string): CodexPluginSummary {
  return {
    id: "marketplace:ambient-fixture",
    name: "ambient-fixture",
    version: "0.1.0",
    description: "Fixture plugin used by Workflow Agent MCP dogfood.",
    marketplaceName: "Ambient Fixture",
    marketplacePath: join(dirname(rootPath), ".agents", "plugins", "marketplace.json"),
    rootPath,
    sourceKind: "workspace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: [],
    skills: [],
    mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    enabled: true,
    trusted: true,
    errors: [],
  };
}

function sequenceExplorationProvider(actions: WorkflowExplorationAction[]): WorkflowExplorationProvider {
  let index = 0;
  return {
    next: async () => {
      const action = actions[index];
      index += 1;
      if (!action) throw new Error("No more exploration actions.");
      return action;
    },
  };
}

async function writeLiveGmailRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-gmail-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeGmailGrantReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-gmail-grant-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeGraphFirstReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-graph-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function snapshotHarnessWorkspaceIfEnabled(workspacePath: string): Promise<unknown | undefined> {
  if (!process.env.AMBIENT_HARNESS_TRACE_DIR) return undefined;
  const { snapshotHarnessWorkspace } = await importHarnessTraceArtifacts();
  return snapshotHarnessWorkspace(workspacePath);
}

async function writeWorkflowGraphReviewHarnessTrace(workspacePath: string, beforeWorkspace: unknown | undefined, review: unknown): Promise<void> {
  if (!process.env.AMBIENT_HARNESS_TRACE_DIR || !beforeWorkspace) return;
  const { writeHarnessTraceArtifacts } = await importHarnessTraceArtifacts();
  await writeHarnessTraceArtifacts({
    workspace: workspacePath,
    beforeWorkspace,
    summary: {
      status: review ? "passed" : "failed",
      task: "workflow-graph-review",
      review,
    },
  });
}

async function importHarnessTraceArtifacts(): Promise<HarnessTraceArtifactsModule> {
  return import(pathToFileURL(join(process.cwd(), "scripts", "harness-trace-artifacts.mjs")).href) as Promise<HarnessTraceArtifactsModule>;
}

async function writeRetentionTraceDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-retention-trace-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeLocalFileRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-file-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeLocalDirectoryRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-directory-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeLocalImageRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-image-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBrowserResearchRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-research-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBrowserExplorationReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-exploration-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBrowserInterventionRecoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-intervention-recovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeManagedBrowserInterventionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-managed-browser-intervention-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeExternalManagedBrowserDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-external-managed-browser-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeArtifactReviewRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-artifact-review-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeMutationReviewRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-mutation-review-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePlanEditDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePlanEditActionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-action-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePlanEditPreviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-preview-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePlanEditRunVersionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-run-version-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePlanEditApplyRestoreDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-apply-restore-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePluginMcpRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plugin-mcp-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeExplorationToDeterministicDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-exploration-deterministic-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCapabilityAwareDiscoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-capability-aware-discovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCapabilityAwareAmbientCliDiscoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-capability-aware-ambient-cli-discovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeAmbientCliExplorationCompileRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-ambient-cli-exploration-compile-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeRecoveryActionsDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-recovery-actions-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeRuntimeComposerDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-runtime-composer-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeDebugRewriteDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-debug-rewrite-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeLiveDebugRewriteDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-live-debug-rewrite-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCalendarRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-calendar-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeScheduledCalendarRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-scheduled-calendar-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeScheduledLocalTimeoutRecoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-scheduled-local-timeout-recovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeDriveRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-drive-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function scottsdaleWeekendRequest(): string {
  return [
    "Find weekend activities in Scottsdale Arizona.",
    "Build a read-only, repeatable workflow that searches for current weekend activities, collects candidate events or places, asks Ambient to rank a concise shortlist, and checkpoints the evidence.",
    "The workflow should be safe to run repeatedly and should leave an audit trail with search inputs, result summaries, and the ranked plan.",
  ].join(" ");
}

function scottsdaleFamilyActivitiesRequest(): string {
  return [
    "Research activities suitable for a 4 year old girl that are occurring in the next week in Scottsdale Arizona.",
    "Build a read-only, repeatable workflow that identifies current family-friendly activities, records source evidence, asks Ambient to rank or summarize options, and clearly notes when real-time web or event-listing data is unavailable.",
    "The workflow should be safe to rerun and should retain enough trace data to debug provider/compiler behavior.",
  ].join(" ");
}

function dogfoodNodeId(prefix: string, value: string, index: number): string {
  const normalized = value
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96)
    .replace(/[-_.:]+$/, "");
  return `${prefix}-${index + 1}${normalized ? `-${normalized}` : ""}`;
}

async function createLocalDownloadsFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-downloads-fixture-"));
  await mkdir(join(root, "Invoices"), { recursive: true });
  await mkdir(join(root, "Irish music sets"), { recursive: true });
  await mkdir(join(root, "Project exports"), { recursive: true });
  await writeFile(join(root, "Resume draft.pdf"), "fixture pdf placeholder\n", "utf8");
  await writeFile(join(root, "Invoices", "2026-05 vendor receipt.txt"), "Vendor receipt for office supplies.\n", "utf8");
  await writeFile(join(root, "Irish music sets", "scottsdale-celtic-lineup.md"), "# Upcoming folk and Celtic shows\n", "utf8");
  await writeFile(join(root, "Project exports", "workflow-compiler-notes.txt"), "Workflow compiler investigation notes.\n", "utf8");
  await writeFile(join(root, ".hidden-local-token.txt"), "hidden fixture file should not be listed by default.\n", "utf8");
  await writeFile(join(root, "secret-api-key.txt"), "secret-like fixture should be skipped by local directory policy.\n", "utf8");
  return root;
}

async function createLocalDownloadsImageFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-downloads-image-fixture-"));
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  const names = [
    "01-ui-screenshot.png",
    "02-receipt-photo.png",
    "03-travel-snapshot.png",
    "04-whiteboard-diagram.png",
    "05-product-label.png",
    "06-map-crop.png",
    "07-event-poster.png",
    "08-form-scan.png",
    "09-chart-export.png",
    "10-reference-design.png",
  ];
  for (const name of names) await writeFile(join(root, name), png);
  return root;
}

function fakeMiniCpmVision() {
  return {
    setupMiniCpm: vi.fn(async (_workspacePath: string, input: MiniCpmVisionSetupInput): Promise<MiniCpmVisionSetupResult> => ({
      provider: "minicpm-v",
      action: input.action ?? "validate",
      status: "ready",
      packageName: "ambient-minicpm-v-vision",
      installStatuses: [],
      runtimeCandidates: [],
      validation: {
        schemaVersion: "ambient-minicpm-v-provider-validation-v1",
        provider: "minicpm-v",
        packageName: "ambient-minicpm-v-vision",
        status: "passed",
        updatedAt: new Date("2026-05-16T00:00:00.000Z").toISOString(),
        platform: "fixture",
        arch: "fixture",
        lane: "fixture",
        missingHints: [],
      },
      diagnostics: [],
      nextSteps: [],
    })),
    analyzeMiniCpm: vi.fn(async (_workspacePath: string, input: MiniCpmVisionAnalyzeInput): Promise<MiniCpmVisionAnalysisResult> => {
      const imagePath = input.image?.path ?? input.imagePath ?? "unknown-image.png";
      const basename = imagePath.split(/[\\/]/).pop() ?? imagePath;
      return {
        provider: "minicpm-v",
        status: "passed",
        packageName: "ambient-minicpm-v-vision",
        task: input.task ?? "image_description",
        prompt: input.prompt ?? "fixture prompt",
        model: "fixture-minicpm",
        durationMs: 1,
        summary: `MiniCPM fixture analysis for ${basename}`,
        observations: [
          {
            kind: "uncertainty",
            description: `Fixture visual observation for ${basename}`,
            confidence: "low",
            evidence: imagePath,
          },
        ],
        limitations: ["Fixture MiniCPM runner did not inspect pixels."],
        image: {
          path: imagePath,
          basename,
          bytes: 67,
          sha256: "b".repeat(64),
          source: input.image?.source ?? "external_file",
          label: input.image?.label,
          copiedFromExternalPath: Boolean(input.allowExternalMediaPaths || input.allowExternalImagePaths),
        },
        artifacts: { jsonPath: input.outputJsonPath ?? `workflow-vision/${basename}.json` },
        installStatuses: [],
        commands: [],
        validation: { valid: true, errors: [] },
        redaction: {
          returnedImagePathIsWorkspaceRelative: false,
          stdoutDoesNotContainAbsoluteImagePath: true,
          artifactPathIsWorkspaceRelative: true,
        },
      };
    }),
  };
}

function localDirectoryClassificationCompilerOutput(directoryPath: string) {
  return {
    version: 1,
    title: "Local Downloads Classification Dogfood",
    goal: "Review a user-approved local Downloads-style directory and classify visible entries into a concise set of categories.",
    summary: "Lists bounded local directory metadata, asks Ambient to classify the entries, and checkpoints the classification with directory provenance.",
    successCriteria: [
      "The workflow uses local_directory_list instead of Google Drive or shell",
      "Hidden and secret-like paths are not required for classification",
      "Ambient returns up to seven categories with evidence from visible directory metadata",
    ],
    inputs: { directoryPath },
    nodes: [
      {
        id: "list-local-downloads",
        kind: "tool.call" as const,
        label: "List local Downloads fixture",
        tool: "local_directory_list",
        args: { path: directoryPath, maxEntries: 200, maxDepth: 2, includeHidden: false },
        output: { type: "localDirectoryListResult" },
      },
      {
        id: "classify-local-downloads",
        kind: "model.call" as const,
        dependsOn: ["list-local-downloads"],
        task: "dogfood.local_downloads_classification",
        input: {
          instruction:
            "Return JSON with summary:string and categories:array. Use at most seven categories. Base the categories only on visible directory metadata, and mention skipped hidden or secret-like paths only as safety exclusions.",
          directory: { fromNode: "list-local-downloads", path: "rootPath" },
          entries: { fromNode: "list-local-downloads", path: "entries" },
          skipped: { fromNode: "list-local-downloads", path: "skipped" },
          truncated: { fromNode: "list-local-downloads", path: "truncated" },
        },
        output: { schema: { summary: "string", categories: "array" } },
      },
      {
        id: "local-directory-classification-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["classify-local-downloads"],
        key: "localDirectoryClassification",
        value: {
          directory: { fromNode: "list-local-downloads", path: "rootPath" },
          entries: { fromNode: "list-local-downloads", path: "entries" },
          skipped: { fromNode: "list-local-downloads", path: "skipped" },
          classification: { fromNode: "classify-local-downloads" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-directory-classification-checkpoint"],
        value: { localDirectoryClassification: { fromNode: "local-directory-classification-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

function localImageCategorizationCompilerOutput(directoryPath: string) {
  const imageAnalysisNodes = Array.from({ length: 10 }, (_, index) => {
    const imageNumber = index + 1;
    return {
      id: `analyze-downloads-image-${imageNumber}`,
      kind: "tool.call" as const,
      label: `Analyze Downloads image ${imageNumber}`,
      tool: "ambient_visual_analyze",
      dependsOn: ["list-downloads-images"],
      args: {
        image: {
          path: { fromNode: "list-downloads-images", path: `entries.${index}.absolutePath` },
          label: { fromNode: "list-downloads-images", path: `entries.${index}.name` },
          source: "external_file",
        },
        task: "image_description",
        prompt: "Describe visible subject matter and safe categorization cues for this image. Do not infer hidden content.",
        outputJsonPath: `workflow-vision/downloads-image-${imageNumber}.json`,
        allowExternalMediaPaths: true,
      },
      output: { type: "minicpmVisualAnalysis" },
    };
  });
  return {
    version: 1,
    title: "Local Downloads Image Categorization Dogfood",
    goal: "Categorize exactly 10 images from a user-approved local Downloads-style directory using MiniCPM-V visual evidence.",
    summary: "Lists bounded local image metadata, analyzes 10 image files with MiniCPM-V, asks Ambient to categorize the visual evidence, and checkpoints the result.",
    successCriteria: [
      "The workflow uses local_directory_list for the local folder inventory",
      "The workflow uses ambient_visual_analyze for MiniCPM-V visual evidence",
      "The workflow does not route local images through Google Drive, shell, raw ambient_cli, or a generic external LLM provider",
    ],
    inputs: { directoryPath },
    nodes: [
      {
        id: "list-downloads-images",
        kind: "tool.call" as const,
        label: "List local Downloads image fixture",
        tool: "local_directory_list",
        args: { path: directoryPath, maxEntries: 300, maxDepth: 1, includeHidden: false },
        output: { type: "localDirectoryListResult" },
      },
      ...imageAnalysisNodes,
      {
        id: "categorize-downloads-images",
        kind: "model.call" as const,
        dependsOn: imageAnalysisNodes.map((node) => node.id),
        task: "dogfood.local_downloads_image_categorization",
        input: {
          instruction:
            "Categorize exactly 10 local Downloads images from MiniCPM-V visual observations. Return summary:string, categories:array, assignments:array, and uncertaintyNotes:array.",
          directory: { fromNode: "list-downloads-images", path: "rootPath" },
          entries: { fromNode: "list-downloads-images", path: "entries" },
          visualEvidence: imageAnalysisNodes.map((node) => ({ fromNode: node.id })),
        },
        output: { schema: { summary: "string", categories: "array", assignments: "array", uncertaintyNotes: "array" } },
      },
      {
        id: "local-image-categorization-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["categorize-downloads-images"],
        key: "localImageCategorization",
        value: {
          directory: { fromNode: "list-downloads-images", path: "rootPath" },
          images: { fromNode: "list-downloads-images", path: "entries" },
          visualEvidence: imageAnalysisNodes.map((node) => ({ fromNode: node.id })),
          imageCategories: { fromNode: "categorize-downloads-images" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-image-categorization-checkpoint"],
        value: { localImageCategorization: { fromNode: "local-image-categorization-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 11, maxModelCalls: 1, maxRunMs: 900_000 },
    openQuestions: [],
  };
}

function localFileReportCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
    output: { type: "fileReadResult" },
  }));
  return {
    version: 1,
    title: "Local File Report Dogfood",
    goal: "Read local workspace notes and synthesize a concise planning report.",
    summary: "Reads local text files, asks Ambient to summarize the evidence, and checkpoints the report.",
    successCriteria: ["All files are read through file_read", "Ambient produces a report", "The report is checkpointed with file provenance"],
    inputs: { paths },
    nodes: [
      ...readNodes,
      {
        id: "local-file-report",
        kind: "model.call" as const,
        dependsOn: readNodes.map((node) => node.id),
        task: "dogfood.local_file_report",
        input: {
          instruction:
            "Return JSON with report:string and files:string[]. Summarize the planning implications, mention registration/travel constraints when present, and cite the file paths.",
          files: readNodes.map((node, index) => ({
            path: paths[index],
            content: { fromNode: node.id, path: "content" },
            truncated: { fromNode: node.id, path: "truncated" },
          })),
        },
        output: { schema: { report: "string", files: "array" } },
      },
      {
        id: "local-file-report-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["local-file-report"],
        key: "localFileReport",
        value: { files: paths, report: { fromNode: "local-file-report" } },
      },
      { id: "final_output", kind: "output.final" as const, dependsOn: ["local-file-report-checkpoint"], value: { localFileReport: { fromNode: "local-file-report-checkpoint" } } },
    ],
    budgets: { maxToolCalls: paths.length, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

function scheduledLocalFileTimeoutRecoveryCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-scheduled-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
    output: { type: "fileReadResult" },
  }));
  return {
    version: 1,
    title: "Scheduled Local File Timeout Recovery Dogfood",
    goal: "Read a local directory on a schedule, recover from a one-off timeout, and produce a compact HTML classification report.",
    summary:
      "Checkpoints normalized local-file evidence before a bounded preparation step and live Ambient classification, so a scheduled timeout can resume without rereading the files.",
    successCriteria: [
      "Local evidence is checkpointed before the recoverable timeout",
      "A resumed run keeps the schedule linkage",
      "Ambient produces a compact HTML report",
    ],
    inputs: { paths },
    nodes: [
      ...readNodes,
      {
        id: "scheduled-local-evidence",
        kind: "checkpoint.write" as const,
        label: "Checkpoint local evidence",
        dependsOn: readNodes.map((node) => node.id),
        key: "scheduledLocalEvidence",
        resumeKey: "scheduledLocalEvidence",
        value: {
          files: readNodes.map((node, index) => ({
            path: paths[index],
            content: { fromNode: node.id, path: "content" },
            truncated: { fromNode: node.id, path: "truncated" },
            kind: { fromNode: node.id, path: "kind" },
          })),
        },
      },
      {
        id: "scheduled-timeout-probe",
        kind: "tool.call" as const,
        label: "wait for scheduled watchdog",
        dependsOn: ["scheduled-local-evidence"],
        tool: "bash",
        args: { command: "sleep 2" },
        resumeKey: "scheduledTimeoutProbe",
        output: { type: "bashResult" },
      },
      {
        id: "classify-files",
        kind: "model.call" as const,
        label: "Classify files",
        dependsOn: ["scheduled-timeout-probe", "scheduled-local-evidence"],
        task: "dogfood.scheduled_local_report",
        input: {
          instruction:
            "Return JSON with summary:string, html:string, files:string[]. Classify each file by likely workflow category, mention concrete evidence from the content, and keep html compact.",
          files: { fromNode: "scheduled-local-evidence", path: "files" },
        },
        output: { schema: { summary: "string", html: "string", files: "array" } },
      },
      {
        id: "scheduled-local-report",
        kind: "checkpoint.write" as const,
        label: "Checkpoint report",
        dependsOn: ["classify-files"],
        key: "scheduledLocalReport",
        value: { files: paths, report: { fromNode: "classify-files" } },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Scheduled local report ready.",
        dependsOn: ["scheduled-local-report"],
        value: {
          format: "html",
          summary: { fromNode: "classify-files", path: "summary" },
          html: { fromNode: "classify-files", path: "html" },
          artifactPath: "reports/scheduled-local-report.html",
        },
      },
    ],
    budgets: { maxToolCalls: paths.length + 1, maxModelCalls: 1, maxRunMs: 180_000 },
    previewSummary: "Schedule local-file classification, recover from timeout, and render an HTML report.",
    dryRunStrategy: "Dry run reads the same local files and records checkpoint/output structure without external mutations.",
    openQuestions: [],
  };
}

function browserResearchCompilerOutput(query: string) {
  const urls = ["https://example.test/research/pagedattention", "https://example.test/research/streamingllm"];
  return {
    version: 1,
    title: "Browser Research Dogfood",
    goal: "Research KV cache optimization techniques using browser source evidence and synthesize a cited report.",
    summary: "Searches browser sources, opens two deterministic source URLs, reads page content, asks Ambient to synthesize a compact cited report, and checkpoints the result.",
    successCriteria: [
      "Browser search returns source candidates",
      "Two sources are opened and read through browser tools",
      "Ambient produces a cited report",
      "The checkpoint includes source URLs and report output",
    ],
    inputs: { query },
    nodes: [
      {
        id: "search-browser-research-sources",
        kind: "tool.call" as const,
        label: "search browser research sources",
        tool: "browser_search",
        args: { query, maxResults: 5, fetchContent: false },
      },
      ...urls.flatMap((url, index) => [
        {
          id: `open-source-${index + 1}`,
          kind: "tool.call" as const,
          label: `open source ${index + 1}`,
          tool: "browser_nav",
          dependsOn: ["search-browser-research-sources"],
          args: { url },
        },
        {
          id: `read-source-${index + 1}`,
          kind: "tool.call" as const,
          label: `read source ${index + 1}`,
          tool: "browser_content",
          dependsOn: [`open-source-${index + 1}`],
          args: { url },
        },
      ]),
      {
        id: "browser-research-report",
        kind: "model.call" as const,
        dependsOn: ["search-browser-research-sources", "read-source-1", "read-source-2"],
        task: "dogfood.browser_research_report",
        input: {
          instruction:
            "Return JSON with report:string and sources:string[]. Summarize the techniques, mention tradeoffs, and cite the provided source URLs. Do not invent additional sources.",
          query,
          searchResults: { fromNode: "search-browser-research-sources" },
          pages: urls.map((url, index) => ({
            url,
            page: { fromNode: `open-source-${index + 1}` },
            content: { fromNode: `read-source-${index + 1}`, path: "text" },
          })),
        },
        output: { schema: { report: "string", sources: "array" } },
      },
      {
        id: "browser-research-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["browser-research-report"],
        key: "browserResearchReport",
        value: { query, sources: urls, report: { fromNode: "browser-research-report" } },
      },
      { id: "final_output", kind: "output.final" as const, dependsOn: ["browser-research-checkpoint"], value: { browserResearchReport: { fromNode: "browser-research-checkpoint" } } },
    ],
    budgets: { maxToolCalls: 8, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

function browserExplorationReviewCompilerOutput(query: string) {
  return {
    title: "Scottsdale Couples Entertainment Browser Review",
    spec: {
      goal: "Find current Scottsdale couples entertainment sources, pause for user feedback, and produce a final rendered report.",
      summary:
        "Uses the exploration-observed browser search/content pattern, checkpoints normalized source evidence, asks Ambient for a source-backed shortlist, pauses with an HTML review artifact, then produces final recommendations from user feedback.",
      successCriteria: [
        "Compiler prompt includes retained exploration trace evidence",
        "Browser calls are bounded to one search and two source pages during the deterministic run",
        "The source shortlist review gate includes an HTML artifact and source context",
        "Final output renders as HTML/Markdown cards rather than raw JSON",
      ],
      inputs: { query, shortlistArtifactPath: "reports/scottsdale-entertainment-shortlist.html", finalArtifactPath: "reports/scottsdale-entertainment-final.html" },
    },
    manifest: {
      tools: ["browser_search", "browser_nav", "browser_content", "ambient.responses"],
      mutationPolicy: "read_only",
      maxToolCalls: 5,
      maxModelCalls: 2,
      maxRunMs: 360_000,
    },
    graph: {
      summary: "Request -> browser search -> read source pages -> Ambient shortlist -> user review -> final report.",
      nodes: [
        {
          id: "request",
          type: "request",
          label: "Entertainment request",
          description: "User asks for current couples-friendly movies and live shows in Scottsdale.",
        },
        {
          id: "search-sources",
          type: "data_source",
          label: "Search entertainment sources",
          description: "Run one bounded browser search for current Scottsdale entertainment evidence.",
          toolNames: ["browser_search"],
        },
        {
          id: "read-source-pages",
          type: "data_source",
          label: "Read top sources",
          description: "Open and read two selected source pages in the same managed browser adapter.",
          toolNames: ["browser_nav", "browser_content"],
        },
        {
          id: "draft-shortlist",
          type: "model_call",
          label: "Draft source shortlist",
          modelRole: "Turn browser evidence into a concise, source-backed shortlist for user review.",
          inputSummary: "Search result cards plus bounded page text from two Scottsdale entertainment sources.",
          outputSummary: "Draft picks, sources, HTML preview, markdown preview, and summary.",
          retryPolicy: "Retry once when structured output validation fails.",
          retentionPolicy: "Debug trace retains source evidence and model output for dogfood inspection.",
          toolNames: ["ambient.responses"],
        },
        {
          id: "review-shortlist",
          type: "review_gate",
          label: "Review shortlist",
          description: "Pause with an artifact-backed shortlist and collect qualitative user feedback.",
          reviewPolicy: "Resume from the same source evidence and draft shortlist with user feedback applied.",
        },
        {
          id: "final-recommendations",
          type: "model_call",
          label: "Final recommendations",
          modelRole: "Apply user feedback and produce a readable final entertainment report.",
          inputSummary: "Draft shortlist, browser provenance, and runtime user feedback.",
          outputSummary: "Final HTML/Markdown recommendations with source notes.",
          retryPolicy: "Retry once when structured output validation fails.",
          retentionPolicy: "Debug trace retains final model output for dogfood inspection.",
          toolNames: ["ambient.responses"],
        },
        { id: "output", type: "output", label: "Rendered report", description: "Checkpoint and emit the final rendered recommendation artifact." },
      ],
      edges: [
        { id: "request-search", source: "request", target: "search-sources", type: "control_flow", label: "needs current listings" },
        { id: "search-read", source: "search-sources", target: "read-source-pages", type: "data_flow", label: "top sources" },
        { id: "read-draft", source: "read-source-pages", target: "draft-shortlist", type: "data_flow", label: "source evidence" },
        { id: "draft-review", source: "draft-shortlist", target: "review-shortlist", type: "control_flow", label: "ask user" },
        { id: "review-final", source: "review-shortlist", target: "final-recommendations", type: "data_flow", label: "feedback" },
        { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow", label: "report" },
      ],
    },
    source: `
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizePick(item, index) {
  return {
    title: typeof item?.title === "string" ? item.title : "Pick " + (index + 1),
    kind: typeof item?.kind === "string" ? item.kind : "entertainment",
    venue: typeof item?.venue === "string" ? item.venue : "Scottsdale",
    timing: typeof item?.timing === "string" ? item.timing : "This week",
    whyCouplesFriendly: typeof item?.whyCouplesFriendly === "string" ? item.whyCouplesFriendly : "Good date-night fit.",
    sourceUrl: typeof item?.sourceUrl === "string" ? item.sourceUrl : ""
  };
}

function renderHtml(picks, heading, summary) {
  return [
    "<!doctype html>",
    "<html><body>",
    "<h1>" + escapeHtml(heading) + "</h1>",
    "<p>" + escapeHtml(summary) + "</p>",
    "<section>",
    ...picks.map((pick) => [
      "<article>",
      "<h2>" + escapeHtml(pick.title) + "</h2>",
      "<p><strong>Type:</strong> " + escapeHtml(pick.kind) + " · <strong>Venue:</strong> " + escapeHtml(pick.venue) + " · <strong>Timing:</strong> " + escapeHtml(pick.timing) + "</p>",
      "<p>" + escapeHtml(pick.whyCouplesFriendly) + "</p>",
      pick.sourceUrl ? "<p><small>Source: " + escapeHtml(pick.sourceUrl) + "</small></p>" : "",
      "</article>"
    ].join("\\n")),
    "</section>",
    "</body></html>"
  ].join("\\n");
}

function renderMarkdown(picks, heading, summary) {
  return [
    "# " + heading,
    "",
    summary,
    "",
    ...picks.map((pick) => "- " + pick.title + " (" + pick.kind + ", " + pick.venue + "): " + pick.whyCouplesFriendly + (pick.sourceUrl ? " Source: " + pick.sourceUrl : ""))
  ].join("\\n");
}

const shortlistSchema = {
  parse(value) {
    if (!value || !Array.isArray(value.picks)) {
      throw new Error("Browser source shortlist must include picks[].");
    }
    const picks = value.picks.map(normalizePick);
    const summary = typeof value.summary === "string" ? value.summary : "Draft Scottsdale entertainment shortlist is ready for review.";
    return {
      summary,
      picks,
      sources: Array.isArray(value.sources) ? value.sources : [],
      html: typeof value.html === "string" ? value.html : renderHtml(picks, "Scottsdale couples entertainment shortlist", summary),
      markdown: typeof value.markdown === "string" ? value.markdown : renderMarkdown(picks, "Scottsdale couples entertainment shortlist", summary)
    };
  }
};

const finalSchema = {
  parse(value) {
    if (!value || !Array.isArray(value.picks)) {
      throw new Error("Final browser recommendations must include picks[].");
    }
    const picks = value.picks.map(normalizePick);
    const summary = typeof value.summary === "string" ? value.summary : "Final Scottsdale couples entertainment recommendations.";
    return {
      summary,
      picks,
      sources: Array.isArray(value.sources) ? value.sources : [],
      artifactPath: "reports/scottsdale-entertainment-final.html",
      html: typeof value.html === "string" ? value.html : renderHtml(picks, "Best Scottsdale movies and live shows for couples this week", summary),
      markdown: typeof value.markdown === "string" ? value.markdown : renderMarkdown(picks, "Best Scottsdale movies and live shows for couples this week", summary)
    };
  }
};

export default async function run({ workflow, tools, ambient }) {
  const query = ${JSON.stringify(query)};
  const sourceEvidence = await workflow.resumePoint("sourceEvidence", async () => {
    const results = await workflow.step("search current entertainment sources", { nodeId: "search-sources" }, () =>
      tools.browser_search({ query, maxResults: 5, fetchContent: false })
    );
    const selected = Array.isArray(results) ? results.slice(0, 2) : [];
    const sources = [];
    for (const result of selected) {
      await workflow.step("open " + result.url, { nodeId: "read-source-pages" }, () => tools.browser_nav({ url: result.url }));
      const page = await workflow.step("read " + result.url, { nodeId: "read-source-pages" }, () => tools.browser_content({ url: result.url }));
      sources.push({
        title: String(result.title ?? page.title ?? "Source"),
        url: String(result.url ?? page.url ?? ""),
        snippet: String(result.snippet ?? "").slice(0, 600),
        text: String(page.text ?? "").slice(0, 4000),
        textTruncated: Boolean(page.textTruncated)
      });
    }
    return { query, results: selected, sources };
  });

  const draft = await workflow.resumePoint("draftShortlist", async () => {
    const shortlist = await ambient.call({
      task: "dogfood.browser_source_shortlist",
      nodeId: "draft-shortlist",
      input: {
        instruction: "Return JSON with summary:string, picks:[{title,kind,venue,timing,whyCouplesFriendly,sourceUrl}], sources:string[], html:string, and markdown:string. Use only provided browser evidence. Include at least one movie and one live show when source evidence supports it. Keep the HTML concise and readable.",
        query,
        sources: sourceEvidence.sources
      },
      schema: shortlistSchema,
      cacheKey: ["dogfood", "browser_source_shortlist", query]
    });
    return shortlist;
  });

  const answer = await workflow.askUser(
    "Review the Scottsdale entertainment shortlist. What should change before final recommendations?",
    {
      choices: [
        { id: "approve", label: "Looks right", description: "Use the source-backed shortlist as-is." },
        { id: "revise", label: "Use my feedback", description: "Apply the freeform feedback in the final report." }
      ],
      allowFreeform: true,
      data: {
        report: {
          title: "Source shortlist",
          artifactPath: "reports/scottsdale-entertainment-shortlist.html",
          html: draft.html,
          markdown: draft.markdown
        },
        sources: sourceEvidence.sources.map((source) => ({ title: source.title, url: source.url, snippet: source.snippet })),
        summary: draft.summary
      }
    },
    { nodeId: "review-shortlist" }
  );

  const final = await ambient.call({
    task: "dogfood.browser_final_recommendations",
    nodeId: "final-recommendations",
    input: {
      instruction: "Return JSON with summary:string, picks:[{title,kind,venue,timing,whyCouplesFriendly,sourceUrl}], sources:string[], html:string, and markdown:string. Apply user feedback. The report must be readable HTML and should mention that listings/times should be verified before booking.",
      query,
      sourceEvidence,
      draft,
      userFeedback: { choiceId: answer.choiceId, text: answer.text }
    },
    schema: finalSchema,
    cacheKey: ["dogfood", "browser_final_recommendations", query, answer.choiceId ?? "", answer.text ?? ""]
  });

  await workflow.checkpoint("final_output", final);
  await workflow.emit({
    type: "workflow.output.ready",
    message: "Scottsdale couples entertainment recommendations are ready.",
    graphNodeId: "output",
    data: { artifactPath: final.artifactPath, html: final.html, markdown: final.markdown, summary: final.summary, picks: final.picks, sources: final.sources }
  });
}
`,
    previewSummary: "Compile from browser exploration into a bounded browser workflow with a reviewable shortlist artifact.",
    dryRunStrategy: "Dry run repeats the bounded browser search/read shape and pauses with the same source shortlist review artifact.",
    openQuestions: [],
  };
}

function browserInterventionRecoveryCompilerOutput(query: string) {
  return {
    version: 1,
    title: "Scottsdale Family Shows Browser Intervention Recovery",
    goal: "Find child-friendly Scottsdale live shows, pause if browser verification blocks the source page, then resume into a rendered report.",
    summary:
      "Searches current Scottsdale family-show sources, checkpoints search evidence, uses a first-class browser.intervention node for user-action handoff and same-session retry, then asks Ambient to produce a readable report.",
    successCriteria: [
      "Search results are checkpointed before any browser intervention pause",
      "Browser user-action state becomes a runtime input card with bounded context",
      "Resume retries the same browser operation with the preserved userActionId instead of repeating search",
      "Final output is a rendered HTML/Markdown card rather than raw JSON",
    ],
    inputs: { query, finalArtifactPath: "reports/scottsdale-family-shows.html" },
    nodes: [
      {
        id: "search-sources",
        kind: "tool.call" as const,
        label: "Search current sources",
        tool: "browser_search",
        args: { query, maxResults: 4, fetchContent: false },
        output: { type: "browserSearchResults" },
      },
      {
        id: "browser-intervention",
        kind: "browser.intervention" as const,
        label: "Browser intervention",
        dependsOn: ["search-sources"],
        tool: "browser_nav" as const,
        args: { url: { fromNode: "search-sources", path: "0.url" } },
        source: {
          title: { fromNode: "search-sources", path: "0.title" },
          url: { fromNode: "search-sources", path: "0.url" },
          snippet: { fromNode: "search-sources", path: "0.snippet" },
        },
        prompt: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
        choices: [
          { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
          { id: "skip", label: "Skip this source", description: "Continue without this source if browser verification cannot be completed." },
        ],
        allowFreeform: true,
        output: { type: "browserInterventionEvidence" },
      },
      {
        id: "read-source-pages",
        kind: "browser.intervention" as const,
        label: "Read source page",
        dependsOn: ["browser-intervention"],
        tool: "browser_content" as const,
        args: { url: { fromNode: "search-sources", path: "0.url" } },
        source: {
          title: { fromNode: "search-sources", path: "0.title" },
          url: { fromNode: "search-sources", path: "0.url" },
          snippet: { fromNode: "search-sources", path: "0.snippet" },
        },
        prompt: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
        choices: [
          { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
          { id: "skip", label: "Skip this source", description: "Continue without this source if browser verification cannot be completed." },
        ],
        allowFreeform: true,
        output: { type: "browserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source-pages"],
        key: "sourceEvidence",
        value: {
          query,
          results: { fromNode: "search-sources" },
          sources: [{ fromNode: "read-source-pages" }],
        },
      },
      {
        id: "final-recommendations",
        kind: "model.call" as const,
        label: "Final family-show report",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.browser_intervention_family_shows",
        input: {
          instruction:
            "Return JSON with summary:string, picks:[{title,venue,timing,ageFit,why,sourceUrl}], sources:string[], artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. Use only the provided browser evidence. Mention that dates/tickets should be verified before attending.",
          query,
          artifactPath: "reports/scottsdale-family-shows.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: { schema: { summary: "string", picks: "array", sources: "array", artifactPath: "string", html: "string", markdown: "string" } },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-recommendations"],
        key: "final_output",
        value: {
          artifactPath: "reports/scottsdale-family-shows.html",
          html: { fromNode: "final-recommendations", path: "html" },
          markdown: { fromNode: "final-recommendations", path: "markdown" },
          summary: { fromNode: "final-recommendations", path: "summary" },
          picks: { fromNode: "final-recommendations", path: "picks" },
          sources: { fromNode: "final-recommendations", path: "sources" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Scottsdale family-friendly live shows report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      { id: "request-search", source: "request", target: "search-sources", type: "control_flow" as const, label: "needs current listings" },
      { id: "search-open", source: "search-sources", target: "browser-intervention", type: "data_flow" as const, label: "top source" },
      { id: "open-read", source: "browser-intervention", target: "read-source-pages", type: "data_flow" as const, label: "verified page" },
      { id: "read-final", source: "read-source-pages", target: "final-recommendations", type: "data_flow" as const, label: "source evidence" },
      { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 7, maxModelCalls: 1, maxRunMs: 360_000 },
    openQuestions: [],
  };
}

function managedBrowserInterventionCompilerOutput(sourceUrl: string) {
  const choices = [
    { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
    { id: "skip", label: "Skip source", description: "Continue without this source if verification cannot be completed." },
  ];
  return {
    version: 1,
    title: "Real Managed Browser Family Shows Dogfood",
    goal: "Use the real managed browser to read a web source for child-friendly Scottsdale shows, pause on human verification, then resume into a rendered report.",
    summary:
      "Opens a deterministic web source in an isolated managed-browser profile through first-class browser.intervention nodes, reuses the preserved userActionId after user confirmation, captures source content and one screenshot, and asks Ambient to produce a readable report.",
    successCriteria: [
      "The workflow pauses with typed browser-intervention metadata when the real browser detects human verification",
      "The browser reveal action receives the preserved targetId and isolated profile context",
      "Resume retries the same browser operation with the preserved userActionId without opening extra tabs",
      "Graph events cover the intervention, content read, model call, and output nodes",
      "Final output renders as HTML instead of truncated JSON",
    ],
    inputs: { sourceUrl, finalArtifactPath: "reports/managed-browser-family-shows.html" },
    nodes: [
      {
        id: "browser-intervention",
        kind: "browser.intervention" as const,
        label: "Open managed source",
        tool: "browser_nav" as const,
        args: { url: sourceUrl },
        source: {
          title: "Family shows challenge source",
          url: sourceUrl,
          snippet: "Deterministic managed-browser source with a human-verification interstitial followed by Scottsdale family-show listings.",
          interventionTitle: "Managed browser verification",
        },
        prompt: "Browser needs user action before reading Family shows challenge source.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "fail" as const },
        output: { type: "managedBrowserOpenEvidence" },
      },
      {
        id: "read-source",
        kind: "browser.intervention" as const,
        label: "Read verified source",
        dependsOn: ["browser-intervention"],
        tool: "browser_content" as const,
        args: { url: sourceUrl },
        source: {
          title: "Family shows challenge source",
          url: sourceUrl,
          snippet: "Verified Scottsdale family-show listings.",
          interventionTitle: "Managed browser verification",
          browserIntervention: { fromNode: "browser-intervention", path: "browserIntervention" },
        },
        skipIf: { fromNode: "browser-intervention", path: "skipped" },
        prompt: "Browser needs user action before reading Family shows challenge source.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "fail" as const },
        screenshot: { enabled: true, args: {} },
        output: { type: "managedBrowserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source"],
        key: "sourceEvidence",
        value: {
          query: "live shows appropriate for children in Scottsdale next week",
          sourceUrl,
          sources: [{ fromNode: "read-source" }],
        },
      },
      {
        id: "final-recommendations",
        kind: "model.call" as const,
        label: "Final family-show report",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.real_managed_browser_family_shows",
        input: {
          instruction:
            "Return JSON with summary:string, picks:[{title,venue,timing,ageFit,why,sourceUrl}], sources:string[], artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. Use only the verified browser source evidence. Mention that dates/tickets should be verified before attending.",
          artifactPath: "reports/managed-browser-family-shows.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: { schema: { summary: "string", picks: "array", sources: "array", artifactPath: "string", html: "string", markdown: "string" } },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-recommendations"],
        key: "final_output",
        value: {
          artifactPath: "reports/managed-browser-family-shows.html",
          html: { fromNode: "final-recommendations", path: "html" },
          markdown: { fromNode: "final-recommendations", path: "markdown" },
          summary: { fromNode: "final-recommendations", path: "summary" },
          picks: { fromNode: "final-recommendations", path: "picks" },
          sources: { fromNode: "final-recommendations", path: "sources" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Managed-browser family-friendly live shows report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      { id: "request-open", source: "request", target: "browser-intervention", type: "control_flow" as const, label: "needs source evidence" },
      { id: "open-read", source: "browser-intervention", target: "read-source", type: "data_flow" as const, label: "verified page" },
      { id: "read-final", source: "read-source", target: "final-recommendations", type: "data_flow" as const, label: "source evidence" },
      { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 5, maxModelCalls: 1, maxRunMs: 360_000 },
    openQuestions: [],
  };
}

function externalManagedBrowserArxivCompilerOutput(input: { query: string; sourceUrl: string }) {
  const { query, sourceUrl } = input;
  const choices = [
    { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
    { id: "skip", label: "Skip source", description: "Continue with a clear note that the external source was blocked." },
  ];
  return {
    version: 1,
    title: "External Managed Browser Arxiv Summary",
    goal: "Use the isolated managed browser to inspect a real external arxiv search page and summarize placebo-effect papers from bounded page evidence.",
    summary:
      "Opens an external arxiv search URL through browser.intervention, records browser-intervention evidence if blocked, skips later browser reads when the user skips the source, otherwise captures bounded source text and one screenshot, then asks Ambient for a readable HTML/Markdown report.",
    successCriteria: [
      "The workflow uses the real managed browser against an external site without opening extra tabs",
      "Browser user-action pauses preserve preview evidence and can be skipped or retried",
      "Page text passed to Ambient is bounded and does not flood the event stream",
      "The final output renders as HTML instead of raw JSON",
    ],
    inputs: { query, sourceUrl, finalArtifactPath: "reports/external-arxiv-placebo-summary.html" },
    nodes: [
      {
        id: "open-source",
        kind: "browser.intervention" as const,
        label: "Open external arxiv page",
        tool: "browser_nav" as const,
        args: { url: sourceUrl },
        source: {
          title: "Arxiv placebo-effect search",
          url: sourceUrl,
          snippet: "External arxiv search page for placebo-effect papers.",
          interventionTitle: "External browser source needs attention",
        },
        prompt: "Browser needs user action before reading Arxiv placebo-effect search.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "return_skipped" as const },
        output: { type: "externalBrowserOpenEvidence" },
      },
      {
        id: "read-source",
        kind: "browser.intervention" as const,
        label: "Read source evidence",
        dependsOn: ["open-source"],
        tool: "browser_content" as const,
        args: { url: sourceUrl },
        source: {
          title: "Arxiv placebo-effect search",
          url: sourceUrl,
          snippet: "External arxiv search page for placebo-effect papers.",
          interventionTitle: "External browser source needs attention",
          browserIntervention: { fromNode: "open-source", path: "browserIntervention" },
        },
        skipIf: { fromNode: "open-source", path: "skipped" },
        prompt: "Browser needs user action before reading Arxiv placebo-effect search.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "return_skipped" as const },
        screenshot: { enabled: true, args: {} },
        output: { type: "externalBrowserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source"],
        key: "sourceEvidence",
        value: {
          query,
          sourceUrl,
          sources: [{ fromNode: "read-source" }],
        },
      },
      {
        id: "final-report",
        kind: "model.call" as const,
        label: "Summarize papers",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.external_managed_browser_arxiv",
        input: {
          instruction:
            "Use only the bounded managed-browser evidence to summarize recent arxiv search results about the placebo effect. Return JSON with summary:string, papers:[{title,summary,sourceUrl}], sourceEvidence:object, artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. If the source was blocked or skipped, clearly explain that and include the browser evidence status instead of inventing paper details.",
          query,
          artifactPath: "reports/external-arxiv-placebo-summary.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: { schema: { summary: "string", papers: "array", sourceEvidence: "object", artifactPath: "string", html: "string", markdown: "string" } },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-report"],
        key: "final_output",
        value: {
          artifactPath: "reports/external-arxiv-placebo-summary.html",
          html: { fromNode: "final-report", path: "html" },
          markdown: { fromNode: "final-report", path: "markdown" },
          summary: { fromNode: "final-report", path: "summary" },
          papers: { fromNode: "final-report", path: "papers" },
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "External arxiv managed-browser report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      { id: "request-open", source: "request", target: "open-source", type: "control_flow" as const, label: "needs live evidence" },
      { id: "open-read", source: "open-source", target: "read-source", type: "data_flow" as const, label: "page opened or skipped" },
      { id: "read-final", source: "read-source", target: "final-report", type: "data_flow" as const, label: "bounded evidence" },
      { id: "final-output", source: "final-report", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 5, maxModelCalls: 1, maxRunMs: 420_000 },
    openQuestions: [],
  };
}

function artifactReviewClassificationCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-classification-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
  }));
  return {
    version: 1,
    title: "Artifact Review Classification Dogfood",
    goal: "Classify local files, pause for qualitative artifact feedback, then produce a final labeled HTML report.",
    summary:
      "Reads a small directory through file_read, uses Ambient to draft file classifications, pauses with a bounded HTML preview attached to workflow.askUser, then uses the feedback to produce the final report.",
    successCriteria: [
      "Local files are read through file_read without mutations",
      "Draft classifications are checkpointed before the runtime-input pause",
      "The runtime input card includes a review artifact path and bounded HTML preview",
      "Resuming with feedback produces readable final output cards instead of raw JSON-only output",
    ],
    inputs: { paths, previewArtifactPath: "reports/classification-preview.html", finalArtifactPath: "reports/classification-final.html" },
    nodes: [
      ...readNodes,
      {
        id: "classify-files",
        kind: "model.call" as const,
        dependsOn: readNodes.map((node) => node.id),
        task: "dogfood.file_classification_draft",
        input: {
          instruction:
            "Return JSON with summary:string, items:[{path,label,confidence,reason}], html:string, and markdown:string. Classify each file into practical user-facing categories. Include receipts as Finance when appropriate and notes/todos as Planning when appropriate. Keep reasons concise.",
          files: readNodes.map((node, index) => ({
            path: paths[index],
            kind: { fromNode: node.id, path: "kind" },
            truncated: { fromNode: node.id, path: "truncated" },
            content: { fromNode: node.id, path: "content" },
          })),
        },
        output: { schema: { summary: "string", items: "array", html: "string", markdown: "string" } },
      },
      {
        id: "classification-draft-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["classify-files"],
        key: "classificationDraft",
        value: { files: paths, draft: { fromNode: "classify-files" } },
      },
      {
        id: "review-classifications",
        kind: "review.input" as const,
        dependsOn: ["classification-draft-checkpoint"],
        prompt: "Review the classification preview. What should change before creating the final report?",
        choices: [
          { id: "approve", label: "Looks right", description: "Use the draft classifications without further changes." },
          { id: "revise", label: "Use my feedback", description: "Apply the freeform feedback in the final report." },
        ],
        allowFreeform: true,
        data: {
          report: {
            title: "Classification preview",
            artifactPath: "reports/classification-preview.html",
            html: { fromNode: "classify-files", path: "html" },
            markdown: { fromNode: "classify-files", path: "markdown" },
          },
          summary: { fromNode: "classify-files", path: "summary" },
        },
      },
      {
        id: "final-report",
        kind: "model.call" as const,
        dependsOn: ["review-classifications"],
        task: "dogfood.file_classification_final",
        input: {
          instruction:
            "Return JSON with summary:string, items:[{path,label,confidence,reason}], html:string, markdown:string, and artifactPath:string. Apply the user's feedback when it is provided. The HTML should be a readable report, not raw JSON.",
          files: paths,
          draft: { fromNode: "classify-files" },
          userFeedback: { choiceId: { fromNode: "review-classifications", path: "choiceId" }, text: { fromNode: "review-classifications", path: "text" } },
          artifactPath: "reports/classification-final.html",
        },
        output: { schema: { summary: "string", items: "array", html: "string", markdown: "string", artifactPath: "string" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["final-report"],
        label: "Classification report ready.",
        value: {
          artifactPath: "reports/classification-final.html",
          html: { fromNode: "final-report", path: "html" },
          markdown: { fromNode: "final-report", path: "markdown" },
          summary: { fromNode: "final-report", path: "summary" },
          items: { fromNode: "final-report", path: "items" },
        },
      },
    ],
    budgets: { maxToolCalls: paths.length, maxModelCalls: 2, maxRunMs: 300_000 },
    openQuestions: [],
  };
}

function mutationReviewCompilerOutput(outputPath: string) {
  return {
    version: 1,
    title: "Mutation Review Dogfood",
    goal: "Draft a report and stage writing it to a workspace file for approval.",
    summary: "Uses Ambient to draft report content, checkpoints the draft, stages a local file write, applies it only after approval, and checkpoints the write result.",
    successCriteria: [
      "Ambient draft is generated and checkpointed before the review pause",
      "The file write is staged and not applied before approval",
      "Resume after approval writes the file",
      "The final checkpoint records the output path and bytes",
    ],
    inputs: { outputPath },
    nodes: [
      {
        id: "draft-report",
        kind: "model.call" as const,
        task: "dogfood.mutation_review_draft",
        input: {
          instruction:
            "Return JSON with title:string, summary:string, and content:string. The content must be markdown for a short report explaining that this workflow staged a write, paused for approval, and then wrote the approved file.",
        },
        output: { schema: { title: "string", summary: "string", content: "string" } },
      },
      {
        id: "mutation-review-draft-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["draft-report"],
        key: "mutationReviewDraft",
        value: { fromNode: "draft-report" },
      },
      {
        id: "write-report",
        kind: "mutation.stage" as const,
        dependsOn: ["mutation-review-draft-checkpoint"],
        tool: "file_write",
        args: { path: outputPath, content: { fromNode: "draft-report", path: "content" } },
        changeSet: {
          kind: "file_write",
          path: outputPath,
          title: { fromNode: "draft-report", path: "title" },
          summary: { fromNode: "draft-report", path: "summary" },
          preview: { fromNode: "draft-report", path: "content" },
        },
      },
      {
        id: "mutation-review-output-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["write-report", "draft-report"],
        key: "mutationReviewOutput",
        value: { path: { fromNode: "write-report", path: "path" }, bytes: { fromNode: "write-report", path: "bytes" }, title: { fromNode: "draft-report", path: "title" } },
      },
      { id: "final_output", kind: "output.final" as const, dependsOn: ["mutation-review-output-checkpoint"], value: { mutationReviewOutput: { fromNode: "mutation-review-output-checkpoint" } } },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

function pluginMcpSummaryCompilerOutput(pluginCapability: ReturnType<typeof workflowPluginCapabilityGrant>) {
  void pluginCapability;
  return {
    version: 1,
    title: "Plugin MCP Summary Dogfood",
    goal: "Call a trusted workflow-safe plugin MCP tool and summarize its evidence.",
    summary: "Invokes the ambient fixture MCP plugin, asks Ambient to summarize the tool result, and checkpoints the summary.",
    successCriteria: [
      "The plugin MCP tool is declared in the manifest",
      "The plugin tool call is routed through workflow plugin supervision",
      "Ambient summarizes the plugin result",
      "The checkpoint records plugin evidence and model output",
    ],
    inputs: { pluginTool: "ambient_fixture_workspace_summary" },
    nodes: [
      {
        id: "plugin-evidence",
        kind: "tool.call" as const,
        label: "Call fixture MCP plugin",
        tool: "ambient_fixture_workspace_summary",
        args: { includeFiles: true },
      },
      {
        id: "plugin-summary",
        kind: "model.call" as const,
        dependsOn: ["plugin-evidence"],
        task: "dogfood.plugin_mcp_summary",
        input: {
          instruction:
            "Return JSON with summary:string, pluginTool:string, and evidence:string[]. Summarize this workflow-safe plugin MCP result and mention whether workspace files were included.",
          pluginTool: "ambient_fixture_workspace_summary",
          pluginResult: { fromNode: "plugin-evidence" },
        },
        output: { schema: { summary: "string", pluginTool: "string", evidence: "array" } },
      },
      {
        id: "plugin-summary-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["plugin-evidence", "plugin-summary"],
        key: "pluginMcpSummary",
        value: { pluginTool: "ambient_fixture_workspace_summary", pluginText: { fromNode: "plugin-evidence" }, summary: { fromNode: "plugin-summary" } },
      },
      { id: "final_output", kind: "output.final" as const, dependsOn: ["plugin-summary-checkpoint"], value: { pluginMcpSummary: { fromNode: "plugin-summary-checkpoint" } } },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

function explorationDrivenCompilerOutput(path: string) {
  return {
    version: 1,
    title: "Exploration Driven Strategy Dogfood",
    goal: "Compile a deterministic workflow from an exploration trace that observed local file reads.",
    summary: "Reads the explored local seed file, asks Ambient to summarize the deterministic source strategy, and checkpoints the result.",
    successCriteria: [
      "Compile prompt includes the persisted exploration trace",
      "The generated workflow repeats the observed file_read pattern deterministically",
      "Ambient summarizes the strategy from the file evidence",
      "The checkpoint preserves source provenance",
    ],
    inputs: { path },
    nodes: [
      { id: "read-seed-file", kind: "tool.call" as const, label: "Read explored seed file", tool: "file_read", args: { path } },
      {
        id: "summarize-strategy",
        kind: "model.call" as const,
        dependsOn: ["read-seed-file"],
        task: "dogfood.exploration_driven_strategy",
        input: {
          instruction:
            "Return JSON with summary:string and provenance:string[]. Summarize how this deterministic workflow should use the explored local file as seed evidence, and mention that current dates still require verification.",
          file: { path, content: { fromNode: "read-seed-file", path: "content" }, truncated: { fromNode: "read-seed-file", path: "truncated" } },
        },
        output: { schema: { summary: "string", provenance: "array" } },
      },
      {
        id: "exploration-strategy-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["summarize-strategy"],
        key: "explorationDrivenStrategy",
        value: { path, strategy: { fromNode: "summarize-strategy" } },
      },
      { id: "final_output", kind: "output.final" as const, dependsOn: ["exploration-strategy-checkpoint"], value: { explorationDrivenStrategy: { fromNode: "exploration-strategy-checkpoint" } } },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

function debugRewriteCompilerOutput() {
  return {
    version: 1,
    title: "Debug Rewrite Dogfood Repaired",
    goal: "Repair a workflow after a graph-mapped failure.",
    summary: "Replaces the unsafe classifier with a deterministic repaired classifier while preserving the classify graph node.",
    successCriteria: ["The classify node runs without throwing", "The repaired workflow checkpoints classification output"],
    nodes: [
      {
        id: "classify",
        kind: "branch.if",
        label: "classify safely",
        condition: true,
        then: { literal: { label: "fixed", recovered: true } },
        else: { literal: { label: "unreachable", recovered: false } },
      },
      {
        id: "classification-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["classify"],
        key: "classification",
        value: { fromNode: "classify", path: "value" },
      },
      { id: "output", kind: "output.final", dependsOn: ["classification-checkpoint"], value: { classification: { fromNode: "classification-checkpoint" } } },
    ],
    budgets: { maxRunMs: 120_000 },
    openQuestions: [],
  };
}

function calendarBriefCompilerOutput(accountHint: string) {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const timeZone = "America/Phoenix";
  return {
    version: 1,
    title: "Calendar Brief Dogfood",
    goal: "Summarize upcoming Google Calendar events into a concise schedule brief.",
    summary: "Lists upcoming primary-calendar events through the Google Calendar connector, asks Ambient to summarize the schedule, and checkpoints the brief.",
    successCriteria: [
      "Calendar events are listed through google.calendar.listEvents",
      "Ambient produces a brief from the returned event metadata",
      "The checkpoint records the event count and brief",
    ],
    inputs: { accountHint, windowDays: 14, timeZone },
    nodes: [
      {
        id: "list-calendar-events",
        kind: "connector.call" as const,
        connectorId: "google.calendar",
        operation: "listEvents",
        accountId: accountHint,
        input: { calendarId: "primary", timeMin, timeMax, timeZone, maxResults: 10, singleEvents: true, orderBy: "startTime" },
        output: { schema: { items: "array", events: "array" } },
      },
      {
        id: "calendar-brief",
        kind: "model.call" as const,
        dependsOn: ["list-calendar-events"],
        task: "dogfood.calendar_brief",
        input: {
          instruction:
            "Return JSON with summary:string, eventCount:number, and highlights:string[]. Use only the provided calendar metadata. If there are no events, say there are no upcoming events in the checked range.",
          timeRange: { timeMin, timeMax, timeZone },
          events: { fromNode: "list-calendar-events" },
        },
        output: { schema: { summary: "string", eventCount: "number", highlights: "array" } },
      },
      {
        id: "calendar-brief-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["list-calendar-events", "calendar-brief"],
        key: "calendarBrief",
        value: { accountId: accountHint, timeMin, timeMax, timeZone, events: { fromNode: "list-calendar-events" }, brief: { fromNode: "calendar-brief" } },
      },
      { id: "final_output", kind: "output.final" as const, dependsOn: ["calendar-brief-checkpoint"], value: { calendarBrief: { fromNode: "calendar-brief-checkpoint" } } },
    ],
    budgets: { maxConnectorCalls: 1, maxModelCalls: 1, maxRunMs: 600_000 },
    openQuestions: [],
  };
}

function driveFileReportCompilerOutput(accountHint: string) {
  return {
    version: 1,
    title: "Drive File Evidence Dogfood",
    goal: "Search Google Drive files and summarize file evidence from safe metadata.",
    summary: "Searches Drive files, reads metadata for top matches with bounded connector fan-out, asks Ambient to summarize the file evidence, and checkpoints the report.",
    successCriteria: [
      "Drive search runs through google.drive.search",
      "Top file metadata is read through google.drive.readFile when matches exist",
      "Ambient produces a report from the returned file evidence",
      "The checkpoint records file count and report output",
    ],
    inputs: { accountHint, maxFiles: 5 },
    nodes: [
      {
        id: "search-drive-files",
        kind: "connector.call" as const,
        label: "Search Drive files",
        connectorId: "google.drive",
        operation: "search",
        accountId: accountHint,
        input: {
          query: "trashed = false",
          pageSize: 5,
          fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
        },
        output: { schema: { files: "array", items: "array", nextPageToken: "string|null" } },
      },
      {
        id: "drive-files",
        kind: "error.handle" as const,
        label: "Normalize Drive search files",
        dependsOn: ["search-drive-files"],
        try: { fromNode: "search-drive-files", path: "files" },
        fallback: { fromNode: "search-drive-files", path: "items" },
        errorMessage: "Drive search returned no files array; falling back to items.",
      },
      {
        id: "read-drive-file-details",
        kind: "connector.map" as const,
        label: "Read Drive file details",
        dependsOn: ["drive-files"],
        connectorId: "google.drive",
        operation: "readFile",
        accountId: accountHint,
        items: { fromNode: "drive-files", path: "value" },
        itemName: "file",
        input: {
          fileId: { fromItem: "file", path: "id" },
          fields: "id,name,mimeType,modifiedTime,size,webViewLink",
        },
        maxItems: 2,
        maxConcurrency: 4,
        output: { schema: { items: "array", count: "number", sourceCount: "number", truncated: "boolean" } },
      },
      {
        id: "drive-file-report",
        kind: "model.call" as const,
        label: "Summarize Drive file evidence",
        dependsOn: ["read-drive-file-details"],
        task: "dogfood.drive_file_report",
        input: {
          instruction:
            "Return JSON with summary:string, fileCount:number, and highlights:string[]. Use only the provided Drive file metadata. If no files are returned, say no files were found in the checked Drive search.",
          fileCount: { fromNode: "read-drive-file-details", path: "sourceCount" },
          files: { fromNode: "read-drive-file-details", path: "items" },
        },
        output: { schema: { summary: "string", fileCount: "number", highlights: "array" } },
      },
      {
        id: "drive-file-report-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["drive-file-report", "read-drive-file-details"],
        key: "driveFileReport",
        value: {
          accountId: accountHint,
          fileCount: { fromNode: "read-drive-file-details", path: "sourceCount" },
          inspectedCount: { fromNode: "read-drive-file-details", path: "count" },
          report: { fromNode: "drive-file-report" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["drive-file-report-checkpoint"],
        value: { driveFileReport: { fromNode: "drive-file-report-checkpoint" } },
      },
    ],
    budgets: { maxConnectorCalls: 3, maxModelCalls: 1, maxRunMs: 600_000 },
    previewSummary: "Read-only Google Drive file evidence workflow.",
    dryRunStrategy: "Dry run records connector intent and report shape without writing Drive data.",
    openQuestions: [],
  };
}

function retentionTraceCompilerOutput(mode: "production" | "debug") {
  return {
    version: 1,
    title: `${mode === "debug" ? "Debug" : "Production"} Retention Trace Dogfood`,
    goal: `Run a tiny ${mode} trace workflow and verify retention review labels from live Ambient evidence.`,
    summary: `Calls Ambient once and checkpoints the result for ${mode} trace review.`,
    successCriteria: ["Ambient call succeeds", "Model call is retained in run detail", "Retention review model reports the expected trace mode"],
    inputs: { mode },
    nodes: [
      {
        id: "retention-trace",
        kind: "model.call" as const,
        task: `dogfood.retention_trace.${mode}`,
        input: {
          mode,
          instruction: "Return a JSON object with a single summary string confirming this live retention trace call completed.",
        },
        output: { schema: { summary: "string" } },
      },
      {
        id: "retention-trace-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["retention-trace"],
        key: "retentionTrace",
        value: { mode, result: { fromNode: "retention-trace" } },
      },
      { id: "final_output", kind: "output.final" as const, dependsOn: ["retention-trace-checkpoint"], value: { retentionTrace: { fromNode: "retention-trace-checkpoint" } } },
    ],
    budgets: { maxToolCalls: 2, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

function browserQaCompilerOutput(targetUrl: string) {
  return {
    version: 1,
    title: "Browser QA Dogfood",
    goal: "Run deterministic browser QA against a local fixture and store evidence.",
    summary: "Navigates to a local HTML page, captures content and screenshot evidence, asks Ambient for diagnosis, and checkpoints the result.",
    successCriteria: ["Page content is collected", "Screenshot evidence is recorded", "Ambient diagnosis is checkpointed"],
    nodes: [
      { id: "open-local-fixture", kind: "tool.call", label: "open local fixture", tool: "browser_nav", args: { url: targetUrl } },
      { id: "collect-page-content", kind: "tool.call", label: "collect page content", tool: "browser_content", dependsOn: ["open-local-fixture"], args: {} },
      { id: "capture-visual-evidence", kind: "tool.call", label: "capture visual evidence", tool: "browser_screenshot", dependsOn: ["collect-page-content"], args: {} },
      {
        id: "diagnosis",
        kind: "model.call",
        dependsOn: ["open-local-fixture", "collect-page-content", "capture-visual-evidence"],
        task: "dogfood.browser_qa",
        input: {
          page: { fromNode: "open-local-fixture" },
          content: { fromNode: "collect-page-content" },
          screenshot: { fromNode: "capture-visual-evidence" },
        },
        output: { schema: { summary: "string", issues: "array", evidence: "object" } },
      },
      {
        id: "browser-qa-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["diagnosis", "capture-visual-evidence"],
        key: "browserQa",
        value: { targetUrl, diagnosis: { fromNode: "diagnosis" }, screenshot: { fromNode: "capture-visual-evidence" } },
      },
      { id: "output", kind: "output.final", dependsOn: ["browser-qa-checkpoint"], value: { browserQa: { fromNode: "browser-qa-checkpoint" } } },
    ],
    budgets: { maxToolCalls: 6, maxModelCalls: 1, maxRunMs: 10_000 },
    openQuestions: [],
  };
}

function scottsdaleActivitiesCompilerOutput() {
  return {
    version: 1,
    title: "Scottsdale Weekend Activities",
    goal: "Find weekend activities in Scottsdale Arizona and produce an auditable shortlist.",
    summary: "Searches for Scottsdale weekend activities, ranks likely options with Ambient, and checkpoints the result.",
    successCriteria: ["Search results are collected", "Ambient ranking is recorded", "A weekend shortlist is checkpointed"],
    nodes: [
      {
        id: "search-scottsdale-weekend-activities",
        kind: "tool.call",
        label: "search Scottsdale weekend activities",
        tool: "browser_search",
        args: { query: "weekend activities Scottsdale Arizona", maxResults: 8 },
      },
      {
        id: "shortlist",
        kind: "model.call",
        dependsOn: ["search-scottsdale-weekend-activities"],
        task: "dogfood.scottsdale_weekend",
        input: { query: "weekend activities Scottsdale Arizona", results: { fromNode: "search-scottsdale-weekend-activities" } },
        output: { schema: { summary: "string", picks: "array", evidence: "object" } },
      },
      {
        id: "scottsdale-weekend-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["search-scottsdale-weekend-activities", "shortlist"],
        key: "scottsdaleWeekend",
        value: {
          query: "weekend activities Scottsdale Arizona",
          results: { fromNode: "search-scottsdale-weekend-activities" },
          shortlist: { fromNode: "shortlist" },
        },
      },
      { id: "output", kind: "output.final", dependsOn: ["scottsdale-weekend-checkpoint"], value: { scottsdaleWeekend: { fromNode: "scottsdale-weekend-checkpoint" } } },
    ],
    budgets: { maxToolCalls: 4, maxModelCalls: 1, maxRunMs: 10_000 },
    openQuestions: ["Should the workflow prefer family-friendly, nightlife, outdoors, or budget activities?"],
  };
}
