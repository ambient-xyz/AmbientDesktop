import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowCompileProgress } from "../../shared/workflowTypes";
import { installAmbientCliPackageSource } from "./workflowCompilerAmbientCliFacade";
import { bashToolDescriptor, firstPartyDesktopToolDescriptors } from "./workflowCompilerDesktopToolFacade";
import { ProjectStore } from "./workflowCompilerProjectStoreFacade";
import {
  WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
  compileWorkflowArtifact,
  parseCompilerJson,
} from "./workflowCompilerService";
import {
  bashClassifierProgram,
  callableRecordedWorkflowInvocationContext,
  callableSymphonyWorkflowInvocationContext,
  childCallableWorkflowCallerProvenance,
  classifierProgram,
  finalOnlyProgram,
  fixturePluginRegistration,
  seedWorkflowCliFixture,
} from "./workflowCompilerServiceTestSupport";
import { fixtureWorkflowConnector } from "./workflowCompilerWorkflowFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describe("parseCompilerJson", () => {
  it("accepts plain and fenced JSON", () => {
    expect(parseCompilerJson('{"title":"Plain"}')).toEqual({ title: "Plain" });
    expect(parseCompilerJson('```json\n{"title":"Fenced"}\n```')).toEqual({ title: "Fenced" });
  });

  it("does not truncate fenced JSON when source text mentions code fences", () => {
    const parsed = parseCompilerJson('```json\n{"title":"Fenced","source":"```ts\\nexport default async function run() {}\\n```"}\n```');

    expect(parsed).toEqual({
      title: "Fenced",
      source: "```ts\nexport default async function run() {}\n```",
    });
  });

  it("falls back to the outer JSON object when a leading fence is malformed", () => {
    expect(parseCompilerJson('Compiler output:\n```json\npartial ```\n{"title":"Recovered"}')).toEqual({ title: "Recovered" });
  });
});

describeNative("compileWorkflowArtifact", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-compile-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("persists validated compiler output as a preview artifact", async () => {
    const progress: WorkflowCompileProgress[] = [];
    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Run tests and classify failures.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [bashToolDescriptor],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => bashClassifierProgram(),
      },
      onProgress: (event) => progress.push(event),
    });

    expect(dashboard.artifacts).toHaveLength(1);
    expect(dashboard.runs).toHaveLength(1);
    expect(dashboard.runs[0].status).toBe("previewed");

    const artifact = dashboard.artifacts[0];
    expect(artifact.workflowThreadId).toBeTruthy();
    await expect(readFile(artifact.sourcePath, "utf8")).resolves.toContain("tools.bash");
    await expect(readFile(join(dirname(artifact.sourcePath), "manifest.json"), "utf8")).resolves.toContain("ambient.responses");
    await expect(readFile(join(dirname(artifact.sourcePath), "graph.json"), "utf8")).resolves.toContain("ambient-model");
    const promptAssembly = JSON.parse(await readFile(join(dirname(artifact.sourcePath), "prompt-assembly.json"), "utf8"));
    expect(promptAssembly).toMatchObject({
      schemaVersion: 1,
      stablePrefix: { moduleCount: expect.any(Number), estimatedTokens: expect.any(Number) },
      mutableSuffix: { moduleCount: expect.any(Number), estimatedTokens: expect.any(Number) },
      total: { moduleCount: expect.any(Number), estimatedTokens: expect.any(Number) },
    });
    expect(promptAssembly.modules.map((module: { id: string }) => module.id)).toEqual(
      expect.arrayContaining(["core-workflow-program-ir-semantics", "capability-selected-desktop-tools", "dynamic-user-request"]),
    );
    expect(await readFile(join(dirname(artifact.sourcePath), "compile-context.json"), "utf8")).toContain('"promptAssembly"');
    const validationReport = JSON.parse(await readFile(join(dirname(artifact.sourcePath), "validation-report.json"), "utf8"));
    expect(validationReport).toMatchObject({
      schemaVersion: 1,
      compilerMode: "program_ir",
      status: "passed",
      diagnosticSummary: { errorCount: 0 },
      evidence: {
        mutationPolicy: "read_only",
        connectorWriteOperations: [],
        dryRunCallCount: expect.any(Number),
      },
    });
    expect(validationReport.validators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "workflow.program.static", status: "passed" }),
        expect.objectContaining({ id: "workflow.output.schema", status: "passed" }),
        expect.objectContaining({ id: "workflow.program.dry_run", status: "passed" }),
      ]),
    );
    const persistedGraph = JSON.parse(await readFile(join(dirname(artifact.sourcePath), "graph.json"), "utf8"));
    expect(persistedGraph).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "ambient-model",
          x: expect.any(Number),
          y: expect.any(Number),
          width: 220,
          height: 92,
          sourceRanges: expect.arrayContaining([
            expect.objectContaining({ kind: "ambient_call", snippet: expect.stringContaining("ambient.call") }),
          ]),
        }),
      ]),
    });
    expect(
      persistedGraph.nodes.every(
        (node: { x?: number; y?: number; width?: number; height?: number }) =>
          node.x! >= 0 && node.y! >= 0 && node.width === 220 && node.height === 92,
      ),
    ).toBe(true);
    expect(store.listWorkflowGraphSnapshots(artifact.workflowThreadId!)[0]).toMatchObject({
      source: "compile",
      summary: "Runs tests and asks Ambient for structured failure categories.",
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "ambient-model",
          type: "model_call",
          width: 220,
          height: 92,
          sourceRanges: expect.arrayContaining([expect.objectContaining({ kind: "ambient_call" })]),
        }),
      ]),
    });
    expect(
      store
        .listWorkflowAgentFolders()
        .flatMap((folder) => folder.threads)
        .find((thread) => thread.id === artifact.workflowThreadId),
    ).toMatchObject({
      phase: "ready_for_review",
      activeArtifactId: artifact.id,
      activeGraphSnapshotId: expect.any(String),
      latestVersion: expect.objectContaining({
        artifactId: artifact.id,
        version: 1,
        status: "ready_for_review",
        createdBy: "compiler",
        gitCommitHash: expect.stringMatching(/^[a-f0-9]{40}$/),
      }),
    });
    expect(store.listWorkflowVersions(artifact.workflowThreadId!)[0]).toMatchObject({
      artifactId: artifact.id,
      graphSnapshotId: expect.any(String),
      repoPath: dirname(artifact.sourcePath),
    });

    const calls = store.listWorkflowModelCalls({ artifactId: artifact.id });
    expect(calls[0]).toMatchObject({
      task: "workflow.compiler",
      status: "succeeded",
      model: AMBIENT_DEFAULT_MODEL,
      cacheCheckpoint: expect.objectContaining({ stage: "compile" }),
    });
    expect(calls[0].input).toMatchObject({ promptAssembly: expect.objectContaining({ schemaVersion: 1 }) });
    expect(new Set(progress.map((event) => event.compileId)).size).toBe(1);
    expect(progress.map((event) => `${event.phase}:${event.status}`)).toEqual([
      "context:completed",
      "prompt:completed",
      "model:running",
      "model:completed",
      "validated:running",
      "validated:completed",
      "validated:completed",
      "persisted:running",
      "persisted:completed",
      "recorded:running",
      "recorded:completed",
      "completed:completed",
    ]);
    expect(progress.find((event) => event.phase === "prompt")?.metrics).toMatchObject({
      promptChars: expect.any(Number),
      promptModuleCount: expect.any(Number),
      promptStableModuleCount: expect.any(Number),
      promptMutableModuleCount: expect.any(Number),
    });
    expect(progress.find((event) => event.phase === "persisted" && event.status === "completed")?.metrics).toMatchObject({
      manifestBytes: expect.any(Number),
      specBytes: expect.any(Number),
      sourceBytes: expect.any(Number),
      previewBytes: expect.any(Number),
      loweredPlanBytes: expect.any(Number),
      validationReportBytes: expect.any(Number),
      validatorCount: expect.any(Number),
      validationDiagnosticCount: 0,
      connectorWriteOperationCount: 0,
    });
  });

  it("persists callable workflow invocation provenance through compiler artifacts and audit events", async () => {
    const progress: WorkflowCompileProgress[] = [];
    const callableWorkflowInvocation = callableRecordedWorkflowInvocationContext({
      callerProvenance: childCallableWorkflowCallerProvenance(),
    });
    let prompt = "";
    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Compile the supplied recorded workflow invocation.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      callableWorkflowInvocation,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return finalOnlyProgram("Callable Release Triage", "Compile a callable recorded workflow invocation.");
        },
      },
      onProgress: (event) => progress.push(event),
    });

    const artifact = dashboard.artifacts[0];
    const artifactRoot = dirname(artifact.sourcePath);
    const compileContext = JSON.parse(await readFile(join(artifactRoot, "compile-context.json"), "utf8"));
    expect(prompt).toContain("Callable workflow invocation context:");
    expect(prompt).toContain("Caller: subagent_child_thread thread child-thread-1, run child-run-1, message child-message-1");
    expect(prompt).toContain("Compact invocation artifact: ./workflow-invocation.json");
    expect(compileContext.callableWorkflowInvocation).toMatchObject({
      schemaVersion: WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
      taskId: "callable-task-1",
      launchId: "callable-launch-1",
      sourceKind: "recorded_workflow",
      callerProvenance: {
        kind: "subagent_child_thread",
        subagentRunId: "subagent-run-1",
        canonicalTaskPath: "parent/1",
        worktree: {
          required: true,
          isolated: true,
          worktreePath: "/tmp/ambient-child-worktree",
        },
        approval: {
          required: true,
          source: "child_bridge_policy",
          scopeHint: "this_child_thread",
        },
      },
      sourceContext: {
        kind: "recorded_workflow",
        playbookId: "release-triage",
        callableInvocation: {
          invocationArtifact: "./workflow-invocation.json",
          diagnosticsTraceArtifact: "./diagnostics/full-trace.jsonl",
        },
      },
    });
    const promptAssembly = JSON.parse(await readFile(join(artifactRoot, "prompt-assembly.json"), "utf8"));
    expect(promptAssembly.modules.map((module: { id: string }) => module.id)).toContain("dynamic-callable-workflow-invocation");
    const compileRun = dashboard.runs.find((run) => run.artifactId === artifact.id)!;
    const compileEvent = store.listWorkflowRunEvents(compileRun.id).find((event) => event.type === "workflow.compile");
    expect(compileEvent?.data).toMatchObject({
      callableWorkflowInvocation: {
        taskId: "callable-task-1",
        launchId: "callable-launch-1",
        sourceKind: "recorded_workflow",
        blocking: true,
        callerKind: "subagent_child_thread",
        callerThreadId: "child-thread-1",
        callerRunId: "child-run-1",
        callerWorktreeIsolated: true,
        callerApprovalRequired: true,
        callerApprovalSource: "child_bridge_policy",
        inputKeys: ["goal", "blocking", "input1"],
        recordedWorkflow: {
          playbookId: "release-triage",
          playbookVersion: 4,
          compactInvocationArtifact: "./workflow-invocation.json",
          diagnosticsTraceArtifact: "./diagnostics/full-trace.jsonl",
        },
      },
    });
    const modelCall = store.listWorkflowModelCalls({ artifactId: artifact.id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({
      callableWorkflowInvocation: {
        taskId: "callable-task-1",
        callerProvenance: {
          kind: "subagent_child_thread",
          worktree: {
            isolated: true,
          },
        },
        sourceContext: {
          kind: "recorded_workflow",
          playbookId: "release-triage",
        },
      },
    });
    expect(progress.find((event) => event.phase === "context")?.metrics).toMatchObject({
      callableWorkflowInvocation: true,
      callableWorkflowSourceKind: "recorded_workflow",
      callableWorkflowBlocking: true,
      callableWorkflowCallerKind: "subagent_child_thread",
      callableWorkflowCallerWorktreeIsolated: true,
    });
    expect(progress.find((event) => event.phase === "prompt")?.metrics).toMatchObject({
      callableWorkflowInvocation: true,
    });
  });

  it("persists Symphony invocation customization through compiler artifacts and audit events", async () => {
    const callableWorkflowInvocation = callableSymphonyWorkflowInvocationContext();
    let prompt = "";
    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Compile the supplied Symphony workflow invocation.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      callableWorkflowInvocation,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return finalOnlyProgram("Callable Symphony Map Reduce", "Compile a callable Symphony workflow invocation.");
        },
      },
    });

    const artifact = dashboard.artifacts[0];
    const artifactRoot = dirname(artifact.sourcePath);
    const compileContext = JSON.parse(await readFile(join(artifactRoot, "compile-context.json"), "utf8"));
    expect(prompt).toContain("Selected builder choices: pattern-scope=Files: Split across selected workspace files or search results.");
    expect(prompt).toContain("Required metric criteria: map_reduce-metric=Every mapped implementation section has cited evidence.");
    expect(prompt).toContain("Symphony launch bridge: ambient-callable-workflow-symphony-launch-bridge-v1");
    expect(prompt).toContain("Bridge children: mapper:explorer, reducer:summarizer");
    expect(prompt).toContain("Bridge wait: required_all, failure ask_user, timeout 600000ms");
    expect(prompt).toContain("Bridge compiler boundary: do not emit, repair, or ask for ambient_subagent_spawn_agent");
    expect(prompt).toContain("Ambient runtime owns child launch/wait; the compiler receives only contract/evidence.");
    expect(compileContext.callableWorkflowInvocation).toMatchObject({
      schemaVersion: WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
      taskId: "symphony-task-1",
      launchId: "symphony-launch-1",
      sourceKind: "symphony_recipe",
      sourceContext: {
        kind: "symphony_recipe",
        recipeId: "map_reduce",
        invocationCustomization: {
          stepSelections: [expect.objectContaining({ stepId: "pattern-scope", selectedChoiceId: "files" })],
          metricCriteria: [
            expect.objectContaining({
              templateId: "map_reduce-metric",
              value: "Every mapped implementation section has cited evidence.",
            }),
          ],
        },
      },
      launchBridgeContract: {
        schemaVersion: "ambient-callable-workflow-symphony-launch-bridge-v1",
        pattern: { id: "map_reduce" },
        childLaunches: [
          expect.objectContaining({ roleNodeId: "mapper", roleId: "explorer" }),
          expect.objectContaining({ roleNodeId: "reducer", roleId: "summarizer" }),
        ],
        wait: {
          mode: "required_all",
          failurePolicy: "ask_user",
          timeoutMs: 600000,
        },
      },
    });
    const compileRun = dashboard.runs.find((run) => run.artifactId === artifact.id)!;
    const compileEvent = store.listWorkflowRunEvents(compileRun.id).find((event) => event.type === "workflow.compile");
    expect(compileEvent?.data).toMatchObject({
      callableWorkflowInvocation: {
        taskId: "symphony-task-1",
        launchId: "symphony-launch-1",
        sourceKind: "symphony_recipe",
        symphonyRecipe: {
          recipeId: "map_reduce",
          stepSelectionCount: 1,
          metricCriteriaIds: ["map_reduce-metric"],
        },
        symphonyLaunchBridge: {
          schemaVersion: "ambient-callable-workflow-symphony-launch-bridge-v1",
          patternId: "map_reduce",
          childRoleNodeIds: ["mapper", "reducer"],
          waitMode: "required_all",
          waitFailurePolicy: "ask_user",
        },
      },
    });
    const modelCall = store.listWorkflowModelCalls({ artifactId: artifact.id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({
      callableWorkflowInvocation: {
        taskId: "symphony-task-1",
        launchBridgeContract: {
          schemaVersion: "ambient-callable-workflow-symphony-launch-bridge-v1",
          wait: {
            mode: "required_all",
          },
        },
        sourceContext: {
          kind: "symphony_recipe",
          invocationCustomization: {
            metricCriteria: [expect.objectContaining({ templateId: "map_reduce-metric" })],
          },
        },
      },
    });
  });

  it("records streamed Pi compiler progress with response character counts", async () => {
    const progress: WorkflowCompileProgress[] = [];
    await compileWorkflowArtifact({
      store,
      userRequest: "Run tests and classify failures.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [bashToolDescriptor],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async ({ onProgress }) => {
          onProgress?.({ outputChars: 256, thinkingChars: 1024, elapsedMs: 2200, stage: "streaming" });
          return bashClassifierProgram();
        },
      },
      onProgress: (event) => progress.push(event),
    });

    const streamedProgress = progress.find(
      (event) => event.phase === "model" && event.status === "running" && event.metrics?.rawResponseChars === 256,
    );
    expect(streamedProgress).toMatchObject({
      message: "Receiving the workflow program IR.",
      metrics: {
        rawResponseChars: 256,
        thinkingChars: 1024,
        providerElapsedMs: 2200,
        providerStage: "streaming",
      },
    });
  });

  it("feeds a selected capability subset into the compiler prompt", async () => {
    let prompt = "";
    const progress: WorkflowCompileProgress[] = [];
    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest:
        "Run a search on the venues in Scottsdale featuring upcoming celtic or folk music performances. Render a PDF report and store it in the Documents folder.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return finalOnlyProgram("Scottsdale Music Report", "Create a Scottsdale music report.");
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompt).toContain("Selected Desktop workflow capabilities:");
    expect(prompt).toContain("browser_search");
    expect(prompt).toContain("file_write");
    expect(prompt).toContain("Recipe current_web_research");
    expect(prompt).toContain("Recipe staged_document_export");
    expect(prompt).toContain("Selection confidence:");
    expect(prompt).toContain("Policy implications:");
    expect(prompt).not.toContain("Ambient CLI execution must depend on a matching ambient_cli_describe node");
    expect(prompt).not.toContain("ambient_cli_describe: Load command metadata");
    expect(prompt).not.toContain("ambient_voice_status");
    expect(prompt).not.toContain("ambient_messaging_gateway_status");
    const contextMetrics = progress.find((event) => event.phase === "context")?.metrics;
    expect(contextMetrics).toMatchObject({
      availableToolCount: firstPartyDesktopToolDescriptors().length,
      selectedToolCount: expect.any(Number),
    });
    expect(Number(contextMetrics?.selectedToolCount)).toBeLessThan(firstPartyDesktopToolDescriptors().length);
    expect(contextMetrics?.selectedRecipeIds).toContain("current_web_research");
    expect(contextMetrics?.selectedRecipeIds).toContain("staged_document_export");
    expect(contextMetrics?.rejectedRecipeIds).toContain("metadata_first_personal_data_review");
    expect(contextMetrics?.recipeSelectionConfidence).toEqual(expect.any(Number));
    expect(contextMetrics?.recipePolicyImplicationCount).toEqual(expect.any(Number));
    const artifactRoot = dirname(dashboard.artifacts[0].sourcePath);
    const compileContext = JSON.parse(await readFile(join(artifactRoot, "compile-context.json"), "utf8"));
    expect(JSON.stringify(compileContext)).toContain('"selectedRecipes"');
    expect(JSON.stringify(compileContext)).toContain('"current_web_research"');
    expect(JSON.stringify(compileContext)).toContain('"staged_document_export"');
    expect(compileContext.recipeSelection).toMatchObject({
      schemaVersion: 1,
      selected: expect.arrayContaining([
        expect.objectContaining({ id: "current_web_research", confidence: expect.any(Number) }),
        expect.objectContaining({ id: "staged_document_export", confidence: expect.any(Number) }),
      ]),
      rejected: expect.arrayContaining([
        expect.objectContaining({ id: "metadata_first_personal_data_review", missingSignals: expect.any(Array) }),
      ]),
      policyImplications: expect.arrayContaining([expect.objectContaining({ id: "recipe.staged_document_export.approval_gate" })]),
      summary: expect.objectContaining({
        selectedRecipeIds: expect.arrayContaining(["current_web_research", "staged_document_export"]),
        rejectedRecipeIds: expect.arrayContaining(["metadata_first_personal_data_review"]),
      }),
    });
    expect(store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })[0].input).toMatchObject({
      selectedRecipes: expect.arrayContaining([
        expect.objectContaining({ id: "current_web_research" }),
        expect.objectContaining({ id: "staged_document_export" }),
      ]),
      recipeSelection: expect.objectContaining({
        summary: expect.objectContaining({ selectedRecipeIds: expect.arrayContaining(["current_web_research", "staged_document_export"]) }),
      }),
    });
  });

  it("rejects model-only output when browser item recovery is selected", async () => {
    await expect(
      compileWorkflowArtifact({
        store,
        userRequest:
          "Create a read-only Workflow Agent that uses browser_nav or browser_content to read https://example.com and https://www.iana.org/help/example-domains. Do not use browser_search. Ask the user for tone and return an HTML report in final output.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => finalOnlyProgram("Model-only browser report", "Incorrectly skips browser evidence."),
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "recipe.browser_item_recovery_tool_required",
          path: "/manifest/tools",
        }),
      ],
    });
  });

  it("runs compiler capability discovery before building the final prompt", async () => {
    let discoveryPrompt = "";
    let compilePrompt = "";
    const progress: WorkflowCompileProgress[] = [];

    await compileWorkflowArtifact({
      store,
      userRequest: "Create a sourced report artifact.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        discoverCapabilities: async (input) => {
          discoveryPrompt = input.prompt;
          input.onProgress?.({ outputChars: 96, thinkingChars: 0, elapsedMs: 500, stage: "streaming" });
          return {
            queries: [
              { query: "web research", reason: "Find source material." },
              { query: "PDF report file writing", reason: "Create the final artifact." },
            ],
            requiredToolNames: ["browser_content"],
            openQuestions: [],
          };
        },
        compileProgramIr: async (input) => {
          compilePrompt = input.prompt;
          return finalOnlyProgram("Sourced Report", "Create a sourced report.");
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(discoveryPrompt).toContain("Return only JSON with: queries, requiredToolNames, requiredConnectorIds, openQuestions.");
    expect(discoveryPrompt).not.toContain("inputSchema");
    expect(compilePrompt).toContain("Selected Desktop workflow capabilities:");
    expect(compilePrompt).toContain("browser_search");
    expect(compilePrompt).toContain("browser_content");
    expect(compilePrompt).toContain("Browser recovery provenance rule");
    expect(compilePrompt).toContain("Do not create empty evidence checkpoints");
    expect(compilePrompt).toContain("active-page reads are not item-stable");
    expect(compilePrompt).toContain("file_write");
    expect(compilePrompt).not.toContain("ambient_voice_status");
    expect(progress.map((event) => `${event.phase}:${event.status}`)).toContain("context:running");
    expect(progress.find((event) => event.message === "Resolved compiler capability queries.")?.metrics).toMatchObject({
      capabilityQueryCount: 2,
      requiredToolNameCount: 1,
      requiredConnectorIdCount: 0,
    });
    expect(progress.find((event) => event.phase === "context" && event.status === "completed")?.metrics).toMatchObject({
      capabilityQueryCount: 3,
      requiredToolNameCount: 2,
      availableToolCount: firstPartyDesktopToolDescriptors().length,
    });
  });

  it("uses workflow-safe capability search to block browser fallback when search routing requires a missing provider", async () => {
    let compilePrompt = "";
    const progress: WorkflowCompileProgress[] = [];

    await compileWorkflowArtifact({
      store,
      userRequest: "Find current public webpages about compact workflow engines and summarize the useful sources.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      searchRoutingSettings: {
        webSearch: { activity: "web_search", preferredProvider: "brave-search", mode: "require", fallback: "block" },
      },
      provider: {
        discoverCapabilities: async () => ({
          queries: [{ query: "current public web research", reason: "The request needs current public webpage evidence." }],
          requiredToolNames: ["browser_search"],
          openQuestions: [],
        }),
        compileProgramIr: async (input) => {
          compilePrompt = input.prompt;
          return finalOnlyProgram("Blocked Browser Fallback", "Explain why browser fallback was not selected.");
        },
      },
      onProgress: (event) => progress.push(event),
    });

    const selectedCapabilitySection = compilePrompt.slice(
      compilePrompt.indexOf("Selected Desktop workflow capabilities:"),
      compilePrompt.indexOf("No workflow connectors were selected."),
    );
    expect(compilePrompt).toContain("Workflow compiler capability search:");
    expect(compilePrompt).toContain("Workflow compiler capability descriptions:");
    expect(compilePrompt).toContain("Browser web research blocked by search routing");
    expect(compilePrompt).toContain("Browser/network research is blocked by the configured search routing preference");
    expect(compilePrompt).toContain("This blocked result is informational; it is not a runnable browser capability");
    expect(compilePrompt).toContain('Search routing: web_search requires Ambient CLI provider "brave-search"');
    expect(compilePrompt).toContain("browser fallback blocked");
    expect(selectedCapabilitySection).not.toMatch(/^- browser_/m);
    expect(progress.find((event) => event.phase === "context" && event.status === "completed")?.metrics).toMatchObject({
      capabilitySearchCount: 1,
      capabilityDescribeCount: 1,
      blockedToolNameCount: 8,
    });
  });

  it("fails closed before compiling when provider-required browser content is unavailable", async () => {
    const progress: WorkflowCompileProgress[] = [];
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Read the provided public web page in the managed browser and summarize the relevant page content.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors().filter((descriptor) => descriptor.name !== "browser_content"),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "browser page content", reason: "The workflow needs page content from a managed browser." }],
            requiredToolNames: ["browser_content"],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow(/Browser page content \(browser_content\) is not registered/);

    expect(compileCalled).toBe(false);
    expect(progress.at(-1)).toMatchObject({
      phase: "failed",
      status: "failed",
      error: expect.stringContaining("Ambient Desktop will not substitute model.call over guessed web content"),
    });
  });

  it("fails closed when exact browser_search is requested but search routing blocks browser fallback", async () => {
    const progress: WorkflowCompileProgress[] = [];
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        userRequest:
          "Use browser_search exactly for current public web evidence about compact workflow engines, then summarize the sources.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        searchRoutingSettings: {
          webSearch: { activity: "web_search", preferredProvider: "brave-search", mode: "require", fallback: "block" },
        },
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "current public web research", reason: "The request needs current public webpage evidence." }],
            requiredToolNames: ["browser_search"],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow(/Browser search \(browser_search\) is blocked by current capability policy/);

    expect(compileCalled).toBe(false);
    expect(progress.at(-1)).toMatchObject({
      phase: "failed",
      status: "failed",
      error: expect.stringContaining("Enable the built-in browser_search browser workflow tool"),
    });
  });

  it("fails closed when explicit visual analysis is requested but the first-party visual tool is unavailable", async () => {
    const progress: WorkflowCompileProgress[] = [];
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        userRequest:
          "Analyze the screenshots in a local folder, extract visible OCR text, classify visual issues, and return a compact report. Do not use filenames or metadata as a substitute for actual visual analysis.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors().filter((descriptor) => descriptor.name !== "ambient_visual_analyze"),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "visual screenshot OCR analysis", reason: "The workflow needs actual screenshot evidence." }],
            requiredToolNames: ["ambient_visual_analyze"],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow(/Visual analysis \(ambient_visual_analyze\) is not registered/);

    expect(compileCalled).toBe(false);
    expect(progress.at(-1)).toMatchObject({
      phase: "failed",
      status: "failed",
      error: expect.stringContaining("Ambient Desktop will not substitute model.call over filenames"),
    });
  });

  it("fails closed when local_directory_list is explicitly requested but unavailable", async () => {
    const progress: WorkflowCompileProgress[] = [];
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        userRequest:
          "Use local_directory_list exactly once to categorize my Downloads directory using metadata only. Do not use workspace inventory, browser, Google Drive, or guessed filenames.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors().filter((descriptor) => descriptor.name !== "local_directory_list"),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [
              {
                query: "local_directory_list Downloads metadata inventory",
                reason: "The request names the built-in local-directory tool.",
              },
            ],
            requiredToolNames: ["local_directory_list"],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow(/Local directory inventory \(local_directory_list\) is not registered/);

    expect(compileCalled).toBe(false);
    expect(progress.at(-1)).toMatchObject({
      phase: "failed",
      status: "failed",
      error: expect.stringContaining("Ambient Desktop will not substitute workspace.inventory"),
    });
  });

  it("rejects legacy skeleton/component source-block compiler providers for new compiles", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Scottsdale music report",
      initialRequest: "Search the web for upcoming Scottsdale folk music performances and write a report.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Search the web for upcoming Scottsdale folk music performances and write a report.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "web research" }, { query: "file write report" }],
            requiredToolNames: ["browser_search", "file_write"],
            openQuestions: [],
          }),
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow("Workflow compiler requires a WorkflowProgramIR provider");

    expect(progress.some((event) => event.message === "Built the incremental compiler skeleton prompt.")).toBe(false);
    expect(store.getWorkflowAgentThreadSummary(thread.id).phase).toBe("failed");
  });

  it("persists a WorkflowProgramIR provider result through deterministic codegen and dry-run", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR compiler",
      initialRequest: "Search and write a report.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];
    let prompt = "";

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Search for workflow compiler QA evidence, summarize it with Ambient, and write a report.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return {
            version: 1,
            title: "IR QA Report",
            goal: "Search, summarize, and write a deterministic report.",
            nodes: [
              { id: "search", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler QA", maxResults: 3 } },
              {
                id: "summarize",
                kind: "model.call",
                dependsOn: ["search"],
                task: "summarize.workflow.qa",
                input: { search: { fromNode: "search" } },
                output: { schema: { summary: "string" } },
              },
              {
                id: "report",
                kind: "transform.template",
                dependsOn: ["summarize"],
                template: "# Report\n\n{{summary.summary}}",
                vars: { summary: { fromNode: "summarize" } },
              },
              {
                id: "write",
                kind: "tool.call",
                tool: "file_write",
                dependsOn: ["report"],
                args: { path: "reports/ir-qa.md", content: { fromNode: "report", path: "value" } },
              },
              { id: "final", kind: "output.final", dependsOn: ["write"], value: { path: { fromNode: "write", path: "path" } } },
            ],
          };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompt).toContain("WorkflowProgramIR");
    expect(prompt).toContain("connector.call");
    expect(prompt).toContain("review.input");
    expect(prompt).toContain("approval.required");
    expect(prompt).not.toContain("Return only JSON with: title, spec, manifest");
    expect(dashboard.artifacts).toHaveLength(1);
    expect(dashboard.artifacts[0].manifest.tools).toEqual(expect.arrayContaining(["browser_search", "ambient.responses", "file_write"]));
    const source = await readFile(dashboard.artifacts[0].sourcePath, "utf8");
    expect(source).toContain("outputContract");
    expect(source).toContain("tools.browser_search");
    expect(source).toContain("tools.file_write");
    await expect(readFile(join(dirname(dashboard.artifacts[0].sourcePath), "lowered-plan.json"), "utf8")).resolves.toContain(
      '"operationPlanHash"',
    );
    await expect(readFile(join(dirname(dashboard.artifacts[0].sourcePath), "lowered-plan.json"), "utf8")).resolves.toContain(
      '"nodeId": "write"',
    );
    expect(
      progress.find((event) => event.message === "Workflow program IR passed static validation, codegen, and dry-run.")?.metrics,
    ).toMatchObject({
      compilerMode: "program_ir",
      dryRunCallCount: expect.any(Number),
      loweredOperationCount: 5,
      loweringCacheMisses: 5,
    });
    const modelCall = store
      .listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })
      .find((call) => call.task === "workflow.compiler");
    expect(modelCall?.output).toMatchObject({
      normalizedProgram: expect.objectContaining({ version: 1 }),
      loweredPlan: expect.objectContaining({
        schemaVersion: 1,
        operations: expect.arrayContaining([expect.objectContaining({ nodeId: "write", operationKind: "runtime.mutation" })]),
      }),
    });
  });

  it("persists WorkflowProgramIR connector.call nodes with inferred connector grants", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR connector",
      initialRequest: "Read connector records.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const connector = fixtureWorkflowConnector([{ id: "record-1", name: "Alpha" }]).descriptor;
    const irrelevantConnector = {
      ...connector,
      id: "slack.workspace",
      label: "Slack Workspace",
      description: "Search and send Slack messages.",
      operations: connector.operations.map((operation) => ({
        ...operation,
        name: "searchMessages",
        label: "Search messages",
        description: "Search Slack messages in channels.",
        requiredScopes: ["slack.messages.read"],
      })),
    };
    let prompt = "";

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Read fixture connector records and summarize them.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [irrelevantConnector, connector],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return {
            version: 1,
            title: "Connector IR",
            goal: "Read fixture connector records and summarize them.",
            nodes: [
              {
                id: "read-records",
                kind: "connector.call",
                connectorId: "fixture.readonly",
                operation: "listRecords",
                accountId: "fixture",
                input: { limit: 10 },
                output: { schema: { records: "array", nextCursor: "string|null" } },
              },
              {
                id: "summarize",
                kind: "model.call",
                dependsOn: ["read-records"],
                task: "summarize.connector.records",
                input: { records: { fromNode: "read-records", path: "records" } },
                output: { schema: { summary: "string" } },
              },
              {
                id: "final",
                kind: "output.final",
                dependsOn: ["summarize"],
                value: { summary: { fromNode: "summarize", path: "summary" } },
              },
            ],
          };
        },
      },
    });

    expect(dashboard.artifacts[0].manifest.connectors).toEqual([
      {
        connectorId: "fixture.readonly",
        accountId: "fixture",
        scopes: ["fixture.records.read"],
        operations: ["listRecords"],
        dataRetention: "redacted_audit",
      },
    ]);
    expect(dashboard.artifacts[0].manifest.maxConnectorCalls).toBe(1);
    const source = await readFile(dashboard.artifacts[0].sourcePath, "utf8");
    expect(source).toContain("connectors.call");
    expect(source).toContain('"nodeId": "read-records"');
    expect(prompt).toContain("fixture.readonly");
    expect(prompt).not.toContain("slack.workspace");
    const modelCall = store
      .listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })
      .find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: ["fixture.readonly"], availableConnectorCount: 2 });
  });

  it("persists WorkflowProgramIR Ambient CLI calls with inferred manifest grants from exploration traces", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR Ambient CLI",
      initialRequest: "Use the retained arxiv CLI capability.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const grant = {
      capabilityId: "pi-arxiv:tool:arxiv_search",
      registryPluginId: "cli:pi-arxiv",
      packageId: "pi-arxiv",
      packageName: "pi-arxiv",
      command: "arxiv_search",
    };
    store.createWorkflowExplorationTrace({
      workflowThreadId: thread.id,
      explorationId: "explore-arxiv-ir",
      explorationNodeId: "agent-exploration",
      request: "Verify the arxiv Ambient CLI command shape.",
      model: AMBIENT_DEFAULT_MODEL,
      capabilityManifest: {
        version: 1,
        tools: [],
        connectors: [],
        ambientCliCapabilities: [grant],
        ambient: { enabled: true, model: AMBIENT_DEFAULT_MODEL, callShape: "structured_json" },
      },
      observations: [
        {
          action: "call_tool",
          name: "ambient_cli",
          status: "succeeded",
          inputSummary: "pi-arxiv arxiv_search",
          outputSummary: "bounded arxiv output",
        },
      ],
      distillation: {
        summary: "Use pi-arxiv arxiv_search for paper search.",
        recommendedManifest: { tools: ["ambient_cli"], ambientCliCapabilities: [grant], mutationPolicy: "read_only" },
      },
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Search arxiv for workflow compiler papers using the retained Ambient CLI command.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Arxiv CLI IR",
          goal: "Run a retained Ambient CLI arxiv search command.",
          nodes: [
            {
              id: "describe-arxiv",
              kind: "tool.call",
              tool: "ambient_cli_describe",
              args: { packageName: "pi-arxiv", command: "arxiv_search" },
            },
            {
              id: "search-arxiv",
              kind: "tool.call",
              tool: "ambient_cli",
              dependsOn: ["describe-arxiv"],
              args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler", "--max-results", "3"] },
            },
            {
              id: "final-output",
              kind: "output.final",
              dependsOn: ["search-arxiv"],
              value: { stdout: { fromNode: "search-arxiv", path: "stdout" } },
            },
          ],
        }),
      },
    });

    expect(dashboard.artifacts).toHaveLength(1);
    expect(dashboard.artifacts[0].manifest.tools).toEqual(expect.arrayContaining(["ambient_cli"]));
    expect(dashboard.artifacts[0].manifest.ambientCliCapabilities).toEqual([grant]);
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain("tools.ambient_cli");
    const modelCall = store
      .listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })
      .find((call) => call.task === "workflow.compiler");
    expect(modelCall?.output).toMatchObject({
      normalizedProgram: expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ id: "search-arxiv", tool: "ambient_cli" })]),
      }),
    });
  });

  it("persists plugin capability grants for compiled workflow plugin tools", async () => {
    const registration = fixturePluginRegistration();
    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Run the fixture plugin.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [registration.descriptor],
      pluginRegistrations: [registration],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Fixture Plugin Workflow",
          goal: "Run fixture plugin.",
          nodes: [
            { id: "run-fixture", kind: "tool.call", tool: "fixture_tool", args: {} },
            { id: "final", kind: "output.final", dependsOn: ["run-fixture"], value: { result: { fromNode: "run-fixture" } } },
          ],
        }),
      },
    });

    expect(dashboard.artifacts[0].manifest.pluginCapabilities).toEqual([
      expect.objectContaining({
        capabilityId: "plugin-1:mcp-tool:server:fixture_original",
        pluginId: "plugin-1",
        registeredName: "fixture_tool",
      }),
    ]);
  });

  it("feeds compact installed Ambient CLI capabilities into the compiler prompt", async () => {
    await seedWorkflowCliFixture(workspacePath);
    await installAmbientCliPackageSource(workspacePath, { source: "./cli-fixture" });
    let prompt = "";

    await compileWorkflowArtifact({
      store,
      userRequest: "Build a workflow that extracts a JSON field from payload files.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return finalOnlyProgram("JSON Field Workflow", "Extract JSON fields.");
        },
      },
    });

    expect(prompt).toContain("Ambient CLI workflow capabilities:");
    expect(prompt).toContain("ambient-json-cli:json-pick");
    expect(prompt).toContain(":tool:json-pick");
    expect(prompt).not.toContain("Use ambient_cli json-pick for JSON field extraction.");
  });

  it("feeds Ambient CLI grants retained in exploration traces into the compiler prompt", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Compile from arxiv exploration",
      initialRequest: "Find recent arxiv papers and summarize them.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const grant = {
      capabilityId: "pi-arxiv:tool:arxiv_search",
      registryPluginId: "cli:pi-arxiv",
      packageId: "pi-arxiv",
      packageName: "pi-arxiv",
      command: "arxiv_search",
    };
    store.createWorkflowExplorationTrace({
      workflowThreadId: thread.id,
      explorationId: "explore-arxiv",
      explorationNodeId: "agent-exploration",
      request: "Verify the arxiv Ambient CLI command shape.",
      model: AMBIENT_DEFAULT_MODEL,
      capabilityManifest: {
        version: 1,
        tools: [],
        connectors: [],
        ambientCliCapabilities: [grant],
        ambient: { enabled: true, model: AMBIENT_DEFAULT_MODEL, callShape: "structured_json" },
      },
      observations: [
        {
          action: "call_tool",
          name: "ambient_cli",
          status: "succeeded",
          inputSummary: "pi-arxiv arxiv_search placebo effect",
          outputSummary: "bounded arxiv search results",
        },
      ],
      distillation: {
        summary: "Use pi-arxiv arxiv_search before final summarization.",
        recommendedManifest: { tools: ["ambient_cli"], ambientCliCapabilities: [grant], mutationPolicy: "read_only" },
      },
    });
    let prompt = "";

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Compile the deterministic workflow from the retained exploration trace.",
      workflowThreadId: thread.id,
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return finalOnlyProgram("Arxiv Exploration Compile", "Compile from retained arxiv exploration.");
        },
      },
    });

    const artifactRoot = dirname(dashboard.artifacts[0].sourcePath);
    expect(prompt).toContain("Verify the arxiv Ambient CLI command shape.");
    expect(prompt).toContain("pi-arxiv:arxiv_search [pi-arxiv:tool:arxiv_search]");
    expect(prompt).toContain('"packageName":"pi-arxiv"');
    await expect(readFile(join(artifactRoot, "compile-context.json"), "utf8")).resolves.toContain('"ambientCliCapabilities"');
    await expect(readFile(join(artifactRoot, "compile-context.json"), "utf8")).resolves.toContain('"pi-arxiv:tool:arxiv_search"');
  });

  it("compiles with answered discovery context and persists compiler graph output", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Inbox classifier",
      initialRequest: "Classify exported inbox records.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const question = store.createWorkflowDiscoveryQuestion({
      workflowThreadId: thread.id,
      category: "model_role",
      context: "Ambient is needed for judgment.",
      question: "What should Ambient do?",
      choices: [{ id: "categorize", label: "Categorize", description: "Assign urgency labels.", recommended: true }],
      allowFreeform: true,
      graphImpact: "Adds a model-call node.",
    });
    store.answerWorkflowDiscoveryQuestion({
      questionId: question.id,
      choiceId: "categorize",
      freeform: "Use P0, P1, and FYI labels.",
    });
    const discoveryGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "discovery",
      summary: "Request to classifier to report.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        {
          id: "classify",
          type: "model_call",
          label: "Classify",
          modelRole: "categorize",
          inputSummary: "inbox records",
          outputSummary: "urgency labels",
          retryPolicy: "retry with same retained records",
        },
      ],
      edges: [{ id: "request-to-classify", source: "request", target: "classify", type: "control_flow" }],
    });
    const explorationTrace = store.createWorkflowExplorationTrace({
      workflowThreadId: thread.id,
      explorationId: "explore-inbox-1",
      explorationNodeId: "agent-exploration",
      request: "Explore how inbox records should be fetched and classified.",
      model: AMBIENT_DEFAULT_MODEL,
      capabilityManifest: {
        tools: [],
        connectors: [{ connectorId: "google.gmail", operations: ["listMessages", "getMessage"] }],
      },
      observations: [
        {
          action: "call_connector",
          name: "google.gmail.listMessages",
          status: "succeeded",
          outputSummary: "message ids and snippets",
        },
      ],
      distillation: {
        summary: "Use Gmail list then per-message reads before classification.",
        successfulPatterns: ["listMessages(limit=100), then getMessage for each id"],
        dataShapes: ["id, sender, subject, snippet, thread id"],
        requiredGrants: ["google.gmail readonly"],
        deterministicSourceStrategy: "Use a bounded connector loop and set maxConnectorCalls above the requested email count.",
        unresolvedQuestions: [],
      },
    });
    let prompt = "";

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify exported inbox records.",
      workflowThreadId: thread.id,
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return classifierProgram("Inbox Classifier", "Classify exported inbox records.");
        },
      },
    });

    const artifact = dashboard.artifacts[0];
    const artifactRoot = dirname(artifact.sourcePath);
    expect(prompt).toContain("Workflow discovery answers:");
    expect(prompt).toContain("Use P0, P1, and FYI labels.");
    expect(prompt).toContain("Workflow exploration traces:");
    expect(prompt).toContain("Explore how inbox records should be fetched and classified.");
    expect(prompt).toContain("maxConnectorCalls above the requested email count");
    expect(prompt).toContain("Request to classifier to report.");
    expect(store.listWorkflowExplorationTraces(thread.id)[0]).toMatchObject({
      id: explorationTrace.id,
      explorationId: "explore-inbox-1",
      observations: expect.arrayContaining([expect.objectContaining({ name: "google.gmail.listMessages" })]),
    });
    await expect(readFile(join(artifactRoot, "compile-context.json"), "utf8")).resolves.toContain("Use P0, P1, and FYI labels.");
    await expect(readFile(join(artifactRoot, "compile-context.json"), "utf8")).resolves.toContain("explore-inbox-1");
    await expect(readFile(join(artifactRoot, "compile-context.json"), "utf8")).resolves.toContain('"cacheCheckpoint"');
    await expect(readFile(join(artifactRoot, "graph.json"), "utf8")).resolves.toContain('"id": "classify"');
    expect(store.listWorkflowGraphSnapshots(thread.id)[0]).toMatchObject({
      source: "compile",
      nodes: expect.arrayContaining([expect.objectContaining({ id: "classify", type: "model_call" })]),
    });
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      phase: "ready_for_review",
      activeArtifactId: artifact.id,
      latestVersion: expect.objectContaining({
        artifactId: artifact.id,
        gitCommitHash: expect.stringMatching(/^[a-f0-9]{40}$/),
      }),
    });
    expect(store.listWorkflowModelCalls({ artifactId: artifact.id })[0].input).toMatchObject({
      discoveryQuestions: expect.arrayContaining([expect.objectContaining({ id: question.id })]),
      explorationTraces: expect.arrayContaining([expect.objectContaining({ id: explorationTrace.id })]),
      graphSnapshot: expect.objectContaining({ id: discoveryGraph.id }),
    });
    expect(store.listWorkflowModelCalls({ artifactId: artifact.id })[0].cacheCheckpoint).toMatchObject({
      stage: "compile",
      workflowThreadId: thread.id,
      graphSnapshotId: discoveryGraph.id,
    });
  });

  it("passes debug rewrite context into the compiler prompt and audit model-call input", async () => {
    let prompt = "";
    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Debug and rewrite the failed workflow.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      debugRewriteContext: "failed event: step.error on graph node classify; model output failed validation",
      provider: {
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return classifierProgram("Debugged Classifier", "Classify records with safer validation.");
        },
      },
    });

    expect(prompt).toContain("Workflow debug rewrite context:");
    expect(prompt).toContain("model output failed validation");
    expect(store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })[0].input).toMatchObject({
      debugRewriteContext: expect.stringContaining("step.error"),
    });
  });

  it("attaches compiled output to a draft workflow revision with graph and source diffs", async () => {
    const baseRoot = join(workspacePath, ".ambient-codex", "workflows", "base-revision");
    await mkdir(baseRoot, { recursive: true });
    const baseSourcePath = join(baseRoot, "main.ts");
    await writeFile(baseSourcePath, "export default async function run() { return 'base'; }\n", "utf8");
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Notes workflow",
      initialRequest: "Summarize notes.",
      projectPath: workspacePath,
      phase: "approved",
    });
    const baseArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Notes workflow",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Summarize notes.", summary: "Produce a notes report." },
      sourcePath: baseSourcePath,
      statePath: join(baseRoot, "state.json"),
    });
    const baseGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Base notes graph.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "output", type: "output", label: "Report" },
      ],
      edges: [{ id: "request-output", source: "request", target: "output", type: "data_flow" }],
    });
    const baseVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: baseArtifact.id,
      graphSnapshotId: baseGraph.id,
      sourcePath: baseSourcePath,
      repoPath: baseRoot,
      status: "approved",
      createdBy: "compiler",
    });
    const revision = store.createWorkflowRevision({
      workflowThreadId: thread.id,
      baseVersionId: baseVersion.id,
      baseArtifactId: baseArtifact.id,
      requestedChange: "Add an explicit review output.",
      status: "draft",
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: revision.requestedChange,
      workflowThreadId: thread.id,
      revisionId: revision.id,
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Notes workflow revised",
          goal: "Summarize notes.",
          summary: "Produce a notes report with explicit review output.",
          nodes: [{ id: "review-output", kind: "output.final", value: { literal: "proposed review output" } }],
        }),
      },
    });

    const proposedArtifact = dashboard.artifacts.find(
      (artifact) => artifact.workflowThreadId === thread.id && artifact.id !== baseArtifact.id,
    );
    const proposedRevision = store.getWorkflowRevision(revision.id);
    expect(proposedArtifact).toBeTruthy();
    expect(proposedRevision).toMatchObject({
      status: "proposed",
      proposedGraphSnapshotId: expect.any(String),
      proposedVersionId: expect.any(String),
      proposedArtifactId: proposedArtifact!.id,
      sourceDiff: expect.stringContaining("proposed review output"),
    });
    expect(proposedRevision.graphDiff).toMatchObject({
      addedNodes: [expect.objectContaining({ id: "review-output" })],
      removedNodes: [expect.objectContaining({ id: "output" })],
    });
    expect(store.listWorkflowModelCalls({ artifactId: proposedArtifact!.id })[0].cacheCheckpoint).toMatchObject({
      stage: "revision_compile",
      workflowThreadId: thread.id,
      revisionId: revision.id,
    });
    expect(store.getWorkflowAgentThreadSummary(thread.id).phase).toBe("revision");
  });

  it("emits failed progress when the compiler provider fails", async () => {
    const progress: WorkflowCompileProgress[] = [];
    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Run tests and classify failures.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: [bashToolDescriptor],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            throw new Error("compiler unavailable");
          },
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow("compiler unavailable");

    expect(progress.at(-1)).toMatchObject({
      phase: "failed",
      status: "failed",
      message: "Workflow preview compilation failed.",
      error: "compiler unavailable",
    });
  });
});
