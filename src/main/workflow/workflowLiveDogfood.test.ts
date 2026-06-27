import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import type { WorkflowDashboard } from "../../shared/workflowTypes";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { BrowserCredentialStore, BrowserService } from "./workflowDogfoodBrowserFixtures";
import { AmbientWorkflowCompilerProvider, compileWorkflowArtifact } from "./workflowWorkflowCompilerServiceFacade";
import { AmbientWorkflowDiscoveryProvider, startWorkflowDiscovery } from "./workflowWorkflowDiscoveryFacade";
import { readWorkflowRunDetail, resolveWorkflowApproval, reviewWorkflowArtifact } from "./workflowDashboard";
import { googleWorkspaceConnectorDescriptors } from "./workflowGoogleWorkspaceFacade";
import { buildPluginMcpToolRegistrations } from "./workflowPluginsFacade";
import { workflowPluginCapabilityGrant } from "./workflowPluginCapabilities";
import { runWorkflowThreadExploration } from "./workflowExplorationService";
import { runWorkflowArtifact } from "./workflowRunService";
import { workflowExplorationGateModel, workflowExplorationPreflightModel, workflowExplorationTraceCards, workflowGraphEventCards, workflowGraphNodeReviewModel, workflowGraphWithRunEvents, workflowReviewWorkspaceModel, workflowRunOutputCards, workflowRuntimeInputCards, workflowThreadComposerModel, workflowThreadTranscriptCards, workflowTraceRetentionReviewModel } from "../../renderer/src/workflowTestUiModelContract";
import { ensureFirstPartyAmbientCliPackages, searchAmbientCliCapabilities } from "./workflowAmbientCliFacade";
import { registerWorkflowLivePlanEditDogfoodTests } from "./workflowLivePlanEditDogfoodCases";
import { registerWorkflowLiveRuntimeDogfoodTests } from "./workflowLiveRuntimeDogfoodCases";
import { registerWorkflowLiveBrowserExplorationDogfoodTests } from "./workflowLiveBrowserExplorationDogfoodCases";
import { registerWorkflowLiveManagedBrowserDogfoodTests } from "./workflowLiveManagedBrowserDogfoodCases";
import {
  liveAmbientApiKey,
  liveAmbientBaseUrl,
  liveWorkflowModel,
  latestRunForArtifact,
  eventCountsByType,
  requiredWorkflowApprovalId,
  fixtureCodexMcpPlugin,
  sequenceExplorationProvider,
  writeGraphFirstReviewDogfoodArtifact,
  snapshotHarnessWorkspaceIfEnabled,
  writeWorkflowGraphReviewHarnessTrace,
  writeArtifactReviewRunDogfoodArtifact,
  writeMutationReviewRunDogfoodArtifact,
  writePluginMcpRunDogfoodArtifact,
  writeExplorationToDeterministicDogfoodArtifact,
  writeCapabilityAwareDiscoveryDogfoodArtifact,
  writeCapabilityAwareAmbientCliDiscoveryDogfoodArtifact,
  writeAmbientCliExplorationCompileRunDogfoodArtifact,
  artifactReviewClassificationCompilerOutput,
  mutationReviewCompilerOutput,
  pluginMcpSummaryCompilerOutput,
  explorationDrivenCompilerOutput,
} from "./workflowDogfoodFixtures";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_WORKFLOW_LIVE === "1" ? it : it.skip;
const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));
const LIVE_GMAIL_RUN_TIMEOUT_MS = Math.max(
  600_000,
  Number(process.env.AMBIENT_WORKFLOW_GMAIL_RUN_TIMEOUT_MS ?? process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "900000"),
);

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
  expect(nodeReview.actions).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "open_source", targetSection: "source", tone: "ready" })]),
  );

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

describeNative("Workflow Agent live dogfood", () => {
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

  itLive(
    "compiles a browser QA workflow with live Ambient when explicitly enabled",
    async () => {
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
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods graph-first review and approval with live Ambient",
    async () => {
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
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  registerWorkflowLiveRuntimeDogfoodTests({
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    workflowTraceRetentionReviewModel,
  });

  itLive(
    "dogfoods artifact-backed runtime input and rendered output cards with live Ambient",
    async () => {
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
      await writeFile(join(fixtureDir, "todo.txt"), ["Book library room", "Send draft agenda", "Confirm snack policy"].join("\n"), "utf8");
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
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  registerWorkflowLiveBrowserExplorationDogfoodTests({
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    workflowExplorationGateModel,
    workflowExplorationTraceCards,
    workflowGraphEventCards,
    workflowGraphWithRunEvents,
    workflowRuntimeInputCards,
    workflowRunOutputCards,
    workflowThreadComposerModel,
  });

  registerWorkflowLiveManagedBrowserDogfoodTests({
    BrowserService,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    workflowGraphEventCards,
    workflowGraphWithRunEvents,
    workflowRuntimeInputCards,
    workflowRunOutputCards,
  });

  itLive(
    "dogfoods staged mutation review with a live Ambient runtime call",
    async () => {
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
        userRequest:
          "Create a workflow that asks Ambient to draft a short report, stages a workspace file write for review, and applies the write only after approval.",
        workspaceSummary:
          "Mutation-review live dogfood. The workspace has no reports directory yet; the workflow may write reports/mutation-review-report.md only after staged approval.",
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
      expect(pausedDetail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.mutation_review_draft", status: "succeeded" })]),
      );
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
        expect.arrayContaining([
          "workflow.resume",
          "checkpoint.resume",
          "approval.approved",
          "desktop-tool.start",
          "desktop-tool.end",
          "mutation.applied",
          "checkpoint.write",
        ]),
      );
      expect(resumedDetail.modelCalls).toHaveLength(0);
      expect(report).toMatch(/Workflow|mutation|approval|report/i);
      expect(finalState.checkpoints?.mutationReviewOutput?.value).toMatchObject({ path: outputPath });
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  registerWorkflowLivePlanEditDogfoodTests({
    BrowserCredentialStore,
    BrowserService,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    workflowGraphEventCards,
    workflowGraphWithRunEvents,
    workflowThreadTranscriptCards,
  });

  itLive(
    "dogfoods a workflow-safe plugin MCP tool with a live Ambient runtime call",
    async () => {
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
        userRequest:
          "Create a read-only workflow that calls the trusted ambient fixture MCP plugin tool, asks Ambient to summarize the plugin result, and checkpoints the summary.",
        workspaceSummary:
          "Plugin MCP workflow dogfood with the trusted ambient-fixture plugin available as ambient_fixture_workspace_summary.",
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
        checkpoints?: Record<
          string,
          { value?: { summary?: { summary?: string; pluginTool?: string; evidence?: string[] }; pluginText?: string }; runId?: string }
        >;
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
        pluginEvents: detail.events
          .filter((event) => event.type.startsWith("plugin-mcp") || event.message === registration.registeredName)
          .map((event) => ({
            type: event.type,
            message: event.message,
          })),
        modelCalls: detail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          model: call.model,
        })),
        checkpoint: state.checkpoints?.pluginMcpSummary?.value,
      });

      expect(run).toMatchObject({ status: "succeeded" });
      expect(detail.events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "desktop-tool.start",
          "plugin-mcp.start",
          "plugin-mcp.end",
          "desktop-tool.end",
          "ambient.call.progress",
          "checkpoint.write",
          "workflow.succeeded",
        ]),
      );
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.plugin_mcp_summary", status: "succeeded" })]),
      );
      expect(state.checkpoints?.pluginMcpSummary?.value?.pluginText).toMatch(/Ambient fixture MCP summary/);
      expect(state.checkpoints?.pluginMcpSummary?.value?.summary?.summary).toMatch(/fixture|plugin|MCP|workspace/i);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods exploration trace to deterministic workflow execution",
    async () => {
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
        initialRequest:
          "Explore event_sources.md, then compile a deterministic workflow that reads the file and summarizes the source strategy.",
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
          {
            action: "call_tool",
            toolName: "file_read",
            input: { path: "event_sources.md" },
            reason: "Inspect local seed source notes before deterministic compile.",
          },
          {
            action: "finish",
            distillation: {
              summary:
                "Compile a deterministic workflow that reads event_sources.md and asks Ambient to summarize the source strategy with provenance.",
              observedCalls: [
                {
                  kind: "tool",
                  name: "file_read",
                  status: "succeeded",
                  inputSummary: "event_sources.md",
                  outputSummary: "Local event source notes",
                },
              ],
              successfulPatterns: ["Use file_read for local seed notes before model synthesis."],
              dataShapes: ["markdown notes with seed categories, verification warning, provenance requirement"],
              requiredGrants: ["workspace file read"],
              deterministicSourceStrategy:
                "Read event_sources.md, call Ambient once for a structured strategy summary, and checkpoint the result.",
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
      expect(store.listWorkflowExplorationTraces(thread.id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: exploration.trace.id })]),
      );

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
        explorationObservationNames: exploration.trace.observations.map((observation) =>
          observation && typeof observation === "object" && "name" in observation ? String(observation.name) : "unknown",
        ),
        artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId },
        run: { id: run.id, status: run.status, error: run.error },
        eventCounts: eventCountsByType(detail.events),
        modelCalls: detail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          model: call.model,
        })),
        checkpoint: state.checkpoints?.explorationDrivenStrategy?.value,
      });

      expect(run).toMatchObject({ status: "succeeded" });
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "file_read")).toHaveLength(1);
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.exploration_driven_strategy", status: "succeeded" })]),
      );
      expect(state.checkpoints?.explorationDrivenStrategy?.value?.strategy?.summary).toMatch(/source|event|provenance|verify/i);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods live capability-aware Gmail discovery into exploration preflight",
    async () => {
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
              successfulPatterns: [
                "Use google.gmail.search for bounded message ids, then readThread only for selected threads when the user grants Gmail read access.",
              ],
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
          activityEvents: question.activityEvents?.map((event) => ({
            kind: event.kind,
            status: event.status,
            label: event.label,
            detail: event.detail,
          })),
        })),
        capabilitySearch,
        gate,
        preflight,
        discoveryProgressTail: discoveryProgress.slice(-8),
        explorationTraceId: exploration.trace.id,
        explorationEvents: exploration.trace.events
          .map((event) => ({ type: event.type, message: event.message, data: event.data }))
          .slice(-12),
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
      expect(preflight.sections.find((section) => section.id === "likely_access")?.items).toEqual(
        expect.arrayContaining(["Connector metadata: Gmail"]),
      );
      expect(preflight.sections.find((section) => section.id === "grants")?.items.join("\n")).toContain(
        "Connector read grant: Gmail content",
      );
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
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods live capability-aware Ambient CLI arxiv discovery into exploration preflight",
    async () => {
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
      const arxivCapability = capabilitySearch.results.find(
        (result) => result.kind === "ambient_cli" && result.label === "pi-arxiv:arxiv_search",
      );
      if (!arxivCapability?.capabilityId)
        throw new Error(`Live arxiv discovery did not find pi-arxiv:arxiv_search. Results: ${JSON.stringify(capabilitySearch.results)}`);
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
            input: {
              packageName: "pi-arxiv",
              command: "arxiv_search",
              args: ["placebo effect", "--max-results", "3", "--sort-by", "submittedDate"],
            },
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
              successfulPatterns: [
                "Use pi-arxiv:arxiv_search for query discovery, then pi-arxiv:arxiv_paper for selected IDs when full abstracts/details are needed.",
              ],
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
                  {
                    id: "output",
                    type: "output",
                    label: "Rendered summary report",
                    description: "Return concise summaries with source links.",
                  },
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
          activityEvents: question.activityEvents?.map((event) => ({
            kind: event.kind,
            status: event.status,
            label: event.label,
            detail: event.detail,
          })),
        })),
        capabilitySearch,
        gate,
        preflight,
        discoveryProgressTail: discoveryProgress.slice(-8),
        ambientCliCapabilities,
        explorationTraceId: exploration.trace.id,
        explorationEvents: exploration.trace.events
          .map((event) => ({ type: event.type, message: event.message, data: event.data }))
          .slice(-12),
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
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods Ambient CLI exploration trace into compiled arxiv workflow execution",
    async () => {
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
      const arxivSearchGrant = ambientCliCapabilities.find(
        (capability) => capability.packageName === "pi-arxiv" && capability.command === "arxiv_search",
      );
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
            input: {
              packageName: "pi-arxiv",
              command: "arxiv_search",
              args: ["placebo effect", "--max-results", "2", "--sort-by", "submittedDate"],
            },
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
        workspaceSummary:
          "Use retained exploration trace evidence and the exact Ambient CLI grant from the trace; do not use browser search for this workflow.",
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
      const state = (existsSync(artifact.statePath) ? JSON.parse(await readFile(artifact.statePath, "utf8")) : {}) as {
        checkpoints?: Record<string, unknown>;
      };

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
        modelCalls: detail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          model: call.model,
        })),
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
    },
    LIVE_GMAIL_RUN_TIMEOUT_MS,
  );
});
