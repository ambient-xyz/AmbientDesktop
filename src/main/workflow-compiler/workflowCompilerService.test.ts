import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowCompileProgress } from "../../shared/workflowTypes";
import { installAmbientCliPackageSource } from "../ambient-cli/ambientCliPackages";
import { bashToolDescriptor, firstPartyDesktopToolDescriptors, pluginMcpToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import { aggressiveAmbientRetryPolicy } from "../ambient/aggressiveRetries";
import { ProjectStore } from "../projectStore/projectStore";
import { readWorkflowRunDetail } from "../workflow/workflowDashboard";
import {
  AmbientWorkflowCompilerProvider,
  WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
  buildWorkflowPlanDslPromptParts,
  buildWorkflowProgramIrPromptParts,
  compileWorkflowArtifact,
  parseCompilerJson,
  type WorkflowCompilerCallableInvocationContext,
} from "./workflowCompilerService";
import { WorkflowProgramIrRepairRejectedError } from "./workflowCompilerIrRepair";
import { WorkflowProgramCompileError } from "../workflow-program/workflowProgramCompiler";
import { fixtureWorkflowConnector, workspaceInventoryConnectorDescriptor } from "../workflow/workflowConnectors";
import { googleWorkspaceConnectorDescriptors } from "../google-workspace/googleWorkspaceConnectors";
import type { WorkflowPiTextCallInput } from "../workflow/workflowPiTransport";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

function fixturePluginRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "fixture_tool",
    label: "Fixture tool",
    description: "Fixture plugin tool.",
    promptSnippet: "fixture_tool: Fixture plugin tool.",
    promptGuidelines: [],
    parameters: { type: "object", properties: {}, additionalProperties: false },
  });
  return {
    registeredName: "fixture_tool",
    originalName: "fixture_original",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-fingerprint",
      serverName: "server",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      name: "fixture_original",
    },
  };
}

describe("parseCompilerJson", () => {
  it("accepts plain and fenced JSON", () => {
    expect(parseCompilerJson('{"title":"Plain"}')).toEqual({ title: "Plain" });
    expect(parseCompilerJson('```json\n{"title":"Fenced"}\n```')).toEqual({ title: "Fenced" });
  });

  it("does not truncate fenced JSON when source text mentions code fences", () => {
    const parsed = parseCompilerJson(
      '```json\n{"title":"Fenced","source":"```ts\\nexport default async function run() {}\\n```"}\n```',
    );

    expect(parsed).toEqual({
      title: "Fenced",
      source: "```ts\nexport default async function run() {}\n```",
    });
  });

  it("falls back to the outer JSON object when a leading fence is malformed", () => {
    expect(parseCompilerJson('Compiler output:\n```json\npartial ```\n{"title":"Recovered"}')).toEqual({ title: "Recovered" });
  });
});

async function seedWorkflowCliFixture(workspace: string): Promise<void> {
  const root = join(workspace, "cli-fixture");
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "skills", "json-cli"), { recursive: true });
  await writeFile(
    join(root, "ambient-cli.json"),
    `${JSON.stringify(
      {
        name: "ambient-json-cli",
        version: "0.1.0",
        description: "Fixture JSON CLI package.",
        skills: "./skills",
        commands: {
          "json-pick": {
            command: "node",
            args: ["./bin/json-pick.mjs"],
            cwd: "workspace",
            description: "Print a top-level JSON field.",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(root, "bin", "json-pick.mjs"), "process.stdout.write('ok');\n", "utf8");
  await writeFile(
    join(root, "skills", "json-cli", "SKILL.md"),
    ["---", "name: ambient-json-cli", "description: Use ambient_cli json-pick for JSON field extraction.", "---", "", "Raw skill instructions.", ""].join("\n"),
    "utf8",
  );
}

function finalOnlyProgram(title: string, goal = "Compile a deterministic no-op workflow."): unknown {
  return {
    version: 1,
    title,
    goal,
    nodes: [{ id: "final", kind: "output.final", value: { literal: { ok: true } } }],
  };
}

function bashClassifierProgram(): unknown {
  return {
    version: 1,
    title: "Test Failure Classifier",
    goal: "Run local tests and classify failures.",
    summary: "Runs tests and asks Ambient for structured failure categories.",
    successCriteria: ["Tests executed", "Report generated"],
    nodes: [
      { id: "test", kind: "tool.call", tool: "bash", args: { command: "pnpm test" } },
      {
        id: "ambient-model",
        kind: "model.call",
        dependsOn: ["test"],
        task: "classify.tests",
        input: { result: { fromNode: "test" } },
        output: { schema: { summary: "string" } },
      },
      { id: "final", kind: "output.final", dependsOn: ["ambient-model"], value: { result: { fromNode: "ambient-model" } } },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1 },
  };
}

function classifierProgram(title: string, goal = "Classify records."): unknown {
  return {
    version: 1,
    title,
    goal,
    summary: goal,
    nodes: [
      {
        id: "classify",
        kind: "model.call",
        task: "classify.records",
        input: { records: [] },
        output: { schema: { labels: "array" } },
      },
      { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
    ],
    budgets: { maxModelCalls: 1 },
  };
}

function callableRecordedWorkflowInvocationContext(input: {
  callerProvenance?: WorkflowCompilerCallableInvocationContext["callerProvenance"];
} = {}): WorkflowCompilerCallableInvocationContext {
  return {
    schemaVersion: WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
    taskId: "callable-task-1",
    launchId: "callable-launch-1",
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    parentMessageId: "parent-message-1",
    toolName: "ambient_workflow_recorded_release_triage_v4",
    toolId: "recorded:release-triage:v4",
    sourceKind: "recorded_workflow",
    blocking: true,
    ...(input.callerProvenance ? { callerProvenance: input.callerProvenance } : {}),
    input: {
      goal: "Triage the supplied release notes.",
      blocking: true,
      input1: "docs/release-notes.md",
    },
    launchCard: {
      schemaVersion: "ambient-callable-workflow-launch-card-v1",
      title: "Workflow Release Triage",
      sourceKind: "recorded_workflow",
      riskLevel: "medium",
      estimatedAgents: 1,
      maxFanout: 1,
      maxDepth: 1,
      estimatedTokenBudget: 60_000,
      tokenBudgetEstimated: true,
      estimatedLocalMemoryBytes: 2 * 1024 * 1024 * 1024,
      localMemoryEstimated: true,
      costEstimateLabel: "Estimated token use is bounded by workflow policy.",
      toolMutationScope: "Read-only unless the compiled workflow asks for explicit mutation approval.",
      checkpointResume: "Compile to a persisted workflow artifact before running.",
      approvalFailureHandling: "Approval failures keep the workflow visible and resumable.",
      defaultCollapsed: true,
      blocking: true,
      smallSliceRecommended: true,
      requireConfirmation: true,
      requirementIds: ["recorded_playbook_confirmed", "input_schema_confirmed", "trace_diagnostics_artifact"],
      metricTemplateIds: ["recorded-validation-1"],
      policyWarnings: [],
    },
    sourceContext: {
      kind: "recorded_workflow",
      title: "Release Triage",
      summary: "Reusable release-risk triage from a confirmed recorded workflow.",
      playbookId: "release-triage",
      playbookVersion: 4,
      playbookSource: "user_edit",
      intent: "Triage release notes against regression risk.",
      inputs: ["Release notes", "Known failing checks"],
      successfulExamples: [],
      doNot: [],
      validation: ["Every failing check has a triage status."],
      outputShape: ["Risk-ranked release triage with citations."],
      markdownPreview: "# Release Triage\n",
      recorderCompactInvocationByDefault: true,
      fullTraceArtifact: true,
      callableInvocation: {
        schemaVersion: "ambient-workflow-recording-callable-invocation-v1",
        mode: "compact_callable_invocation",
        source: "workflow_recorder",
        defaultInvocation: "compact",
        invocationArtifact: "./workflow-invocation.json",
        diagnosticsTraceArtifact: "./diagnostics/full-trace.jsonl",
        inputKeys: ["goal", "blocking", "input_1"],
        inputSchemaHintKeys: ["goal", "blocking", "input_1"],
      },
    },
  };
}

function childCallableWorkflowCallerProvenance(): NonNullable<WorkflowCompilerCallableInvocationContext["callerProvenance"]> {
  return {
    kind: "subagent_child_thread",
    threadId: "child-thread-1",
    runId: "child-run-1",
    messageId: "child-message-1",
    subagentRunId: "subagent-run-1",
    canonicalTaskPath: "parent/1",
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    approval: {
      required: true,
      source: "child_bridge_policy",
      failureHandling: "Forward approval to the parent and keep the child blocked.",
      scopeHint: "this_child_thread",
    },
    worktree: {
      required: true,
      isolated: true,
      status: "active",
      workspacePath: "/tmp/ambient-child-worktree",
      worktreePath: "/tmp/ambient-child-worktree",
      branchName: "ambient/child-workflow",
    },
    nestedFanout: {
      required: true,
      source: "child_bridge_policy",
    },
  };
}

function callableSymphonyWorkflowInvocationContext(): WorkflowCompilerCallableInvocationContext {
  return {
    schemaVersion: WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
    taskId: "symphony-task-1",
    launchId: "symphony-launch-1",
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    parentMessageId: "parent-message-1",
    toolName: "ambient_workflow_symphony_map_reduce",
    toolId: "symphony:map_reduce",
    sourceKind: "symphony_recipe",
    blocking: true,
    input: {
      goal: "Audit implementation evidence.",
      blocking: true,
      builderSelections: [
        {
          stepId: "pattern-scope",
          selectedChoiceId: "files",
          resolvedText: "Files: Split across selected workspace files or search results.",
        },
      ],
      metricCriteria: [
        {
          templateId: "map_reduce-metric",
          value: "Every mapped implementation section has cited evidence.",
        },
      ],
    },
    launchCard: {
      schemaVersion: "ambient-callable-workflow-launch-card-v1",
      title: "Symphony Map-Reduce",
      sourceKind: "symphony_recipe",
      riskLevel: "high",
      estimatedAgents: 12,
      maxFanout: 12,
      maxDepth: 2,
      estimatedTokenBudget: 180_000,
      tokenBudgetEstimated: true,
      estimatedLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
      localMemoryEstimated: true,
      costEstimateLabel: "Estimated token use is bounded by workflow policy.",
      toolMutationScope: "Read-only unless the compiled workflow asks for explicit mutation approval.",
      checkpointResume: "Compile to a persisted workflow artifact before running.",
      approvalFailureHandling: "Approval failures keep the workflow visible and resumable.",
      defaultCollapsed: true,
      blocking: true,
      smallSliceRecommended: true,
      requireConfirmation: true,
      requirementIds: ["estimated_agents", "token_cost_budget", "tool_mutation_scope", "checkpoint_resume", "approval_failure_handling"],
      metricTemplateIds: ["map_reduce-metric"],
      policyWarnings: ["Parent final synthesis is blocked until this workflow reaches a synthesis-safe terminal state."],
    },
    sourceContext: {
      kind: "symphony_recipe",
      title: "Symphony Map-Reduce",
      summary: "Fan out over files, sources, or slices, then reduce schema-valid child results into one cited answer.",
      recipeId: "map_reduce",
      recipeSchemaVersion: "ambient-symphony-workflow-recipe-v1",
      defaultRoles: ["explorer", "summarizer"],
      builderSteps: [
        {
          id: "pattern-scope",
          question: "What collection should Symphony split across child threads?",
          impact: "Defines child thread fanout, role assignment, and result aggregation.",
          choices: ["Files: Split across selected workspace files or search results."],
        },
      ],
      metricTemplates: [
        {
          id: "map_reduce-metric",
          kind: "objective_metric",
          label: "Reducer success metric",
          prompt: "What objective extraction schema, count, or validation check proves the reducer has enough coverage?",
        },
      ],
      invocationCustomization: {
        schemaVersion: "ambient-callable-workflow-symphony-invocation-v1",
        stepSelections: [
          {
            stepId: "pattern-scope",
            question: "What collection should Symphony split across child threads?",
            selectedChoiceId: "files",
            selectedChoiceLabel: "Files",
            selectedChoiceDescription: "Split across selected workspace files or search results.",
            resolvedText: "Files: Split across selected workspace files or search results.",
          },
        ],
        metricCriteria: [
          {
            templateId: "map_reduce-metric",
            kind: "objective_metric",
            label: "Reducer success metric",
            prompt: "What objective extraction schema, count, or validation check proves the reducer has enough coverage?",
            value: "Every mapped implementation section has cited evidence.",
          },
        ],
      },
      hardLimits: {
        maxFanout: 12,
        maxDepth: 2,
        maxTokenBudget: 180_000,
        maxLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
        allowSmallSliceRun: true,
      },
      recorderPolicy: {
        compactInvocationByDefault: true,
        fullTraceArtifact: true,
      },
    },
  };
}

describe("AmbientWorkflowCompilerProvider", () => {
  it("keeps in-app HTML and report outputs separate from staged file-write exports in the Plan DSL prompt", () => {
    const planPrompt = buildWorkflowPlanDslPromptParts({
      userRequest: "Create a simple HTML study card and return it in the workflow output.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });

    expect(planPrompt.stablePrefix).toContain("Output and mutation semantics:");
    expect(planPrompt.stablePrefix).toContain("For a simple in-app HTML page, report, card, preview, or final answer, use model_interaction");
    expect(planPrompt.stablePrefix).toContain("Use staged_document_export only when the user explicitly asks to save, write, export to a local path");
    expect(planPrompt.stablePrefix).toContain("Do not infer a local file write merely from words like artifact, report, HTML, card, preview, or output.");
  });

  it("adds callable workflow invocation provenance to compiler prompt mutable context", () => {
    const callableWorkflowInvocation = callableRecordedWorkflowInvocationContext({
      callerProvenance: childCallableWorkflowCallerProvenance(),
    });
    const programPrompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Compile the supplied recorded workflow invocation.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
      callableWorkflowInvocation,
    });
    const planPrompt = buildWorkflowPlanDslPromptParts({
      userRequest: "Compile the supplied recorded workflow invocation.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
      callableWorkflowInvocation,
    });

    expect(programPrompt.stablePrefix).not.toContain("Callable workflow invocation context:");
    expect(programPrompt.mutableSuffix).toContain("Callable workflow invocation context:");
    expect(programPrompt.mutableSuffix).toContain("Task: callable-task-1 / launch callable-launch-1");
    expect(programPrompt.mutableSuffix).toContain("Caller: subagent_child_thread thread child-thread-1, run child-run-1, message child-message-1");
    expect(programPrompt.mutableSuffix).toContain("Child bridge: sub-agent run subagent-run-1, task path parent/1");
    expect(programPrompt.mutableSuffix).toContain("Worktree isolation: required, isolated, path /tmp/ambient-child-worktree");
    expect(programPrompt.mutableSuffix).toContain("Approval provenance: required via child_bridge_policy, scope this_child_thread");
    expect(programPrompt.mutableSuffix).toContain("Recorded playbook: release-triage v4");
    expect(programPrompt.mutableSuffix).toContain("Compact invocation artifact: ./workflow-invocation.json");
    expect(programPrompt.mutableSuffix).toContain("Diagnostics trace artifact: ./diagnostics/full-trace.jsonl");
    expect(programPrompt.mutableSuffix).toContain('"goal": "Triage the supplied release notes."');
    expect(programPrompt.promptAssembly.modules.map((module) => module.id)).toContain("dynamic-callable-workflow-invocation");
    expect(planPrompt.mutableSuffix).toContain("Callable workflow invocation context:");
    expect(planPrompt.promptAssembly.modules.map((module) => module.id)).toContain("dynamic-callable-workflow-invocation");
  });

  it("adds Symphony invocation choices and criteria to compiler prompt mutable context", () => {
    const callableWorkflowInvocation = callableSymphonyWorkflowInvocationContext();
    const programPrompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Compile the supplied Symphony workflow invocation.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
      callableWorkflowInvocation,
    });

    expect(programPrompt.mutableSuffix).toContain("Callable workflow invocation context:");
    expect(programPrompt.mutableSuffix).toContain("Symphony recipe: map_reduce");
    expect(programPrompt.mutableSuffix).toContain("Symphony invocation customization: ambient-callable-workflow-symphony-invocation-v1");
    expect(programPrompt.mutableSuffix).toContain("Selected builder choices: pattern-scope=Files: Split across selected workspace files or search results.");
    expect(programPrompt.mutableSuffix).toContain("Required metric criteria: map_reduce-metric=Every mapped implementation section has cited evidence.");
  });

  it("instructs local directory workflows to preserve skipped metadata through final artifacts", () => {
    const localDirectoryTool = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "local_directory_list");
    expect(localDirectoryTool).toBeTruthy();

    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Categorize my Downloads folder using metadata only.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [localDirectoryTool!],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Capability guidance local-directory-skipped-metadata");
    expect(fullPrompt).toContain("Local-directory workflow guidance");
    expect(fullPrompt).toContain('{"fromHandle":"listNode.skipped"}');
    expect(fullPrompt).toContain("checkpoint.write");
    expect(fullPrompt).toContain("model.call input");
    expect(fullPrompt).toContain("document.render input");
    expect(fullPrompt).toContain("output.final");
    expect(fullPrompt).toContain("never read or expose skipped file contents");
  });

  it("instructs large Gmail metadata-first workflows to gate full-body detail reads", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Categorize 1,000 Gmail messages, but ask before reading full bodies.",
      workspaceSummary: "Test workspace with Gmail available.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Recipe metadata_first_personal_data_review");
    expect(fullPrompt).toContain("connector.paginate with google.gmail search");
    expect(fullPrompt).toContain("metadata-only");
    expect(fullPrompt).toContain("review.input");
    expect(fullPrompt).toContain("google.gmail readThread or readAttachment");
    expect(fullPrompt).toContain("never include Gmail draft/send/delete/update operations");
  });

  it("instructs bounded Gmail detail workflows to read threads before synthesis", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest:
        "Review the last 100 emails in Gmail, fetch enough message or thread detail, and report action required, urgency, sender/domain, and recurring themes.",
      workspaceSummary: "Test workspace with Gmail available.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((connector) => connector.id === "google.gmail"),
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Gmail detail rule");
    expect(fullPrompt).toContain("do not synthesize from search snippets alone");
    expect(fullPrompt).toContain("connector.map google.gmail readThread");
    expect(fullPrompt).not.toContain("Recipe metadata_first_personal_data_review");
  });

  it("instructs current-data workflows to preserve location in final output", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Recommend whether to go to a movie tonight in Scottsdale.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Recipe current_web_research");
    expect(fullPrompt).not.toContain("Current-data rule");
    expect(fullPrompt).toContain("location when location-specific");
    expect(fullPrompt).toContain("Do not rely on model knowledge for current facts");
  });

  it("publishes stable output reference paths for review gates and rendered documents", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Build a PDF report and ask before writing it.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Known reference path contract");
    expect(fullPrompt).toContain("review.input outputs requestId, choiceId, text, and prompt");
    expect(fullPrompt).toContain("use choiceId, never choice or selectedChoice");
    expect(fullPrompt).toContain("document.render outputs artifactPath, path, content, bytes, and mimeType");
    expect(fullPrompt).toContain("mutation.stage/file_write outputs path and bytes");
  });

  it("teaches WorkflowProgramIR planning to prefer registry handles over raw paths", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Ask for one decision, synthesize a short report, and stage a rendered file.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain('use {"fromHandle":"producerAlias.outputField"}');
    expect(fullPrompt).toContain("askUser.choiceId");
    expect(fullPrompt).toContain("renderReport.artifactPath");
    expect(fullPrompt).toContain('"fromHandle": "askUser.choiceId"');
    expect(fullPrompt).toContain('"fromHandle": "synthesize.summary"');
    expect(fullPrompt).not.toContain('Reference prior outputs with {"fromNode":"node-id","path":"optional.field.path"}');
  });

  it("uses a no-reasoning JSON-only Pi call for compiler capability discovery", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        input.onProgress?.({
          outputChars: 64,
          thinkingChars: 0,
          elapsedMs: 250,
          idleElapsedMs: 0,
          idleTimeoutMs: input.idleTimeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "streaming",
        });
        return '{"queries":[{"query":"web research"}],"requiredToolNames":["browser_content"],"openQuestions":[]}';
      },
    });
    const progress: string[] = [];

    await expect(
      provider.discoverCapabilities({
        prompt: "discover",
        model: AMBIENT_DEFAULT_MODEL,
        onProgress: (event) => progress.push(event.stage),
      }),
    ).resolves.toEqual({
      queries: [{ query: "web research" }],
      requiredToolNames: ["browser_content"],
      requiredConnectorIds: [],
      openQuestions: [],
    });
    expect(calls[0]).toMatchObject({
      prompt: "discover",
      maxTokens: 1_200,
      reasoning: false,
      responseFormat: {
        type: "json_schema",
        json_schema: expect.objectContaining({
          name: "workflow_compiler_capability_discovery",
          strict: true,
        }),
      },
      idleTimeoutMs: 60_000,
      absoluteTimeoutMs: 120_000,
    });
    expect(progress).toContain("streaming");
  });

  it("uses a no-source JSON-only Pi call for WorkflowProgramIR planning", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return '{"version":1,"title":"IR","goal":"Compile IR.","nodes":[{"id":"final","kind":"output.final","value":{"literal":"ok"}}]}';
      },
    });
    const cacheCheckpoint = {
      id: "cache",
      stage: "compile" as const,
      workflowThreadId: "thread-1",
      stablePrefixHash: "stable",
      stablePrefixChars: 1,
      stablePrefixEstimatedTokens: 1,
      mutableSuffixHash: "mutable",
      mutableSuffixChars: 1,
      mutableSuffixEstimatedTokens: 1,
      requestHash: "request",
      requestEstimatedTokens: 1,
      boundaryLabel: "boundary",
      createdAt: "2026-05-15T00:00:00.000Z",
    };

    await provider.compileProgramIr?.({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, cacheCheckpoint });

    expect(calls[0]).toMatchObject({
      prompt: "program-ir",
      sessionId: "thread-1",
      responseFormat: { type: "json_object" },
      reasoning: false,
      maxTokens: 6_000,
    });
    expect(calls[0].systemPrompt).toContain("WorkflowProgramIR");
    expect(calls[0].systemPrompt).toContain("Do not generate source code");
  });

  it("uses a typed-operation no-source Pi call for WorkflowProgramIR repair", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return '{"repairOperations":[{"kind":"replace_with_alternative","path":"/nodes/0/tool","value":"browser_search"}]}';
      },
    });
    const cacheCheckpoint = {
      id: "cache",
      stage: "compile" as const,
      workflowThreadId: "thread-1",
      stablePrefixHash: "stable",
      stablePrefixChars: 1,
      stablePrefixEstimatedTokens: 1,
      mutableSuffixHash: "mutable",
      mutableSuffixChars: 1,
      mutableSuffixEstimatedTokens: 1,
      requestHash: "request",
      requestEstimatedTokens: 1,
      boundaryLabel: "boundary",
      createdAt: "2026-05-15T00:00:00.000Z",
    };

    await expect(provider.repairProgramIr?.({ prompt: "repair-ir", model: AMBIENT_DEFAULT_MODEL, cacheCheckpoint, attempt: 1 })).resolves.toEqual({
      repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/0/tool", value: "browser_search" }],
    });

    expect(calls[0]).toMatchObject({
      prompt: "repair-ir",
      sessionId: "thread-1",
      responseFormat: { type: "json_object" },
      reasoning: false,
      maxTokens: 2_000,
    });
    expect(calls[0].systemPrompt).toContain("WorkflowProgramIR repairer");
    expect(calls[0].systemPrompt).toContain("\"repairOperations\"");
    expect(calls[0].systemPrompt).toContain("typed repair operations");
    expect(calls[0].systemPrompt).toContain("Do not generate source code");
  });

  it("uses Pi transport with the workflow compiler idle watchdog", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        input.onProgress?.({
          outputChars: 17,
          thinkingChars: 3,
          elapsedMs: 500,
          idleElapsedMs: 0,
          idleTimeoutMs: input.idleTimeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "streaming",
        });
        return '{"title":"Compiled"}';
      },
    });
    const progress: string[] = [];

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => progress.push(event.timeoutMode ?? "") })).resolves.toEqual({
      title: "Compiled",
    });
    expect(calls[0]).toMatchObject({
      idleTimeoutMs: 120_000,
      reasoning: false,
      responseFormat: { type: "json_object" },
      sessionId: undefined,
    });
    expect(calls[0].timeoutMs).toBe(480_000);
    expect(progress).toContain("idle_watchdog");
  });

  it("retries an empty Pi compiler response with the same compiler contract", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return calls.length === 1 ? "" : '{"title":"Compiled after retry"}';
      },
    });
    const stages: string[] = [];

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => stages.push(event.stage) })).resolves.toEqual({
      title: "Compiled after retry",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].prompt).toBe("program-ir");
    expect(calls[1].prompt).toContain("Workflow compiler retry instruction:");
    expect(calls[1].prompt).toContain("Ambient workflow compiler returned an empty response.");
    expect(calls[1].prompt).toContain("Do not generate TypeScript or JavaScript.");
    expect(calls.map((call) => call.reasoning)).toEqual([false, false]);
    expect(stages).toContain("retrying");
  });

  it("retries transient Pi compiler provider failures before surfacing them", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        if (calls.length === 1) throw new Error("429 Upstream request failed after 378ms");
        return '{"title":"Compiled after provider retry"}';
      },
    });
    const stages: string[] = [];

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => stages.push(event.stage) })).resolves.toEqual({
      title: "Compiled after provider retry",
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toBe("program-ir");
    expect(calls.map((call) => call.reasoning)).toEqual([false, false]);
    expect(stages).toContain("retrying");
  });

  it("passes aggressive retry policy to compiler Pi calls", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      textCall: async (input) => {
        calls.push(input);
        return '{"title":"Compiled with aggressive policy"}';
      },
    });

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL })).resolves.toEqual({
      title: "Compiled with aggressive policy",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].retryPolicy).toMatchObject({ enabled: true, maxRetries: 10, providerMaxRetryDelayMs: 5_000 });
    expect(calls[0].retryPolicy?.backoffMs).toEqual([1_000, 2_000, 3_000, 4_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000]);
  });

  it("retries compiler calls without thinking when Pi emits only thinking and no JSON output", async () => {
    const previousThinkingChars = process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS;
    process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS = "10";
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        if (calls.length === 1) {
          input.onProgress?.({
            outputChars: 0,
            thinkingChars: 10,
            elapsedMs: 1_000,
            idleElapsedMs: 0,
            idleTimeoutMs: input.idleTimeoutMs,
            timeoutMode: "idle_watchdog",
            stage: "thinking",
          });
          if (input.signal?.aborted) throw input.signal.reason ?? new Error("aborted");
        }
        return '{"title":"Compiled without thinking"}';
      },
    });
    const stages: string[] = [];

    try {
      await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => stages.push(event.stage) })).resolves.toEqual({
        title: "Compiled without thinking",
      });
    } finally {
      if (previousThinkingChars === undefined) delete process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS;
      else process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS = previousThinkingChars;
    }

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.reasoning)).toEqual([false, false]);
    expect(calls[1].prompt).toContain("thinking without emitting workflow JSON output");
    expect(stages).toEqual(expect.arrayContaining(["thinking", "retrying"]));
  });

  it("surfaces the validation error when Pi compiler retry still returns invalid JSON", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return calls.length === 1 ? "" : "{";
      },
    });

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL })).rejects.toThrow("Ambient workflow compiler did not return valid JSON");
    expect(calls).toHaveLength(2);
  });

  it("forwards compiler output progress character counts", async () => {
    const progress: number[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        input.onProgress?.({ outputChars: 9, thinkingChars: 0, elapsedMs: 100, idleTimeoutMs: input.idleTimeoutMs, timeoutMode: "idle_watchdog", stage: "streaming" });
        input.onProgress?.({ outputChars: 20, thinkingChars: 0, elapsedMs: 200, idleTimeoutMs: input.idleTimeoutMs, timeoutMode: "idle_watchdog", stage: "streaming" });
        return '{"title":"Streamed"}';
      },
    });

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => progress.push(event.outputChars) })).resolves.toEqual({
      title: "Streamed",
    });
    expect(progress).toEqual([9, 20]);
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
          sourceRanges: expect.arrayContaining([expect.objectContaining({ kind: "ambient_call", snippet: expect.stringContaining("ambient.call") })]),
        }),
      ]),
    });
    expect(persistedGraph.nodes.every((node: { x?: number; y?: number; width?: number; height?: number }) => node.x! >= 0 && node.y! >= 0 && node.width === 220 && node.height === 92)).toBe(true);
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
    expect(store.listWorkflowAgentFolders().flatMap((folder) => folder.threads).find((thread) => thread.id === artifact.workflowThreadId)).toMatchObject({
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
    expect(compileContext.callableWorkflowInvocation).toMatchObject({
      schemaVersion: WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
      taskId: "symphony-task-1",
      launchId: "symphony-launch-1",
      sourceKind: "symphony_recipe",
      sourceContext: {
        kind: "symphony_recipe",
        recipeId: "map_reduce",
        invocationCustomization: {
          stepSelections: [
            expect.objectContaining({ stepId: "pattern-scope", selectedChoiceId: "files" }),
          ],
          metricCriteria: [
            expect.objectContaining({
              templateId: "map_reduce-metric",
              value: "Every mapped implementation section has cited evidence.",
            }),
          ],
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
      },
    });
    const modelCall = store.listWorkflowModelCalls({ artifactId: artifact.id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({
      callableWorkflowInvocation: {
        taskId: "symphony-task-1",
        sourceContext: {
          kind: "symphony_recipe",
          invocationCustomization: {
            metricCriteria: [
              expect.objectContaining({ templateId: "map_reduce-metric" }),
            ],
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

    const streamedProgress = progress.find((event) => event.phase === "model" && event.status === "running" && event.metrics?.rawResponseChars === 256);
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
      rejected: expect.arrayContaining([expect.objectContaining({ id: "metadata_first_personal_data_review", missingSignals: expect.any(Array) })]),
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
        userRequest: "Use browser_search exactly for current public web evidence about compact workflow engines, then summarize the sources.",
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
            queries: [{ query: "local_directory_list Downloads metadata inventory", reason: "The request names the built-in local-directory tool." }],
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
    await expect(readFile(join(dirname(dashboard.artifacts[0].sourcePath), "lowered-plan.json"), "utf8")).resolves.toContain('"operationPlanHash"');
    await expect(readFile(join(dirname(dashboard.artifacts[0].sourcePath), "lowered-plan.json"), "utf8")).resolves.toContain('"nodeId": "write"');
    expect(progress.find((event) => event.message === "Workflow program IR passed static validation, codegen, and dry-run.")?.metrics).toMatchObject({
      compilerMode: "program_ir",
      dryRunCallCount: expect.any(Number),
      loweredOperationCount: 5,
      loweringCacheMisses: 5,
    });
    const modelCall = store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id }).find((call) => call.task === "workflow.compiler");
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
              { id: "final", kind: "output.final", dependsOn: ["summarize"], value: { summary: { fromNode: "summarize", path: "summary" } } },
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
    const modelCall = store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: ["fixture.readonly"], availableConnectorCount: 2 });
  });

  it("fails explicit Gmail workflow requests before compiling against an unrelated connector", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable Gmail",
      initialRequest: "Read the latest 300 Gmail messages and categorize them.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Read the latest 300 Gmail messages and categorize them into up to 7 read-only buckets.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: Gmail \(google\.gmail\).*workspace\.inventory/);
    expect(compileCalled).toBe(false);
  });

  it("fails explicit Slack workflow requests before compiling against unrelated connectors", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable Slack",
      initialRequest: "Search Slack channel messages and summarize blockers.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Search Slack channel messages from this week and summarize blockers by owner.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: Slack \(slack\.workspace\).*workspace\.inventory/);
    expect(compileCalled).toBe(false);
  });

  it("fails explicit GitHub workflow requests before compiling against unrelated connectors", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable GitHub",
      initialRequest: "Triage GitHub pull requests.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Review GitHub pull requests assigned to me and summarize merge blockers.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: GitHub \(github\.repository\).*workspace\.inventory/);
    expect(compileCalled).toBe(false);
  });

  it("fails known connector intents across auth and account availability jitter", async () => {
    const baseDescriptor = fixtureWorkflowConnector().descriptor;
    const cases = [
      {
        title: "Gmail auth unavailable",
        connectorId: "google.gmail",
        label: "Gmail",
        providerId: "google.workspace",
        userRequest: "Review Gmail messages from this week and group them by action required.",
        authStatus: "not_configured" as const,
        accounts: [{ id: "primary", label: "Primary Gmail" }],
        expected: /Gmail \(google\.gmail\) is not_configured/,
      },
      {
        title: "Slack missing account",
        connectorId: "slack.workspace",
        label: "Slack",
        providerId: "slack",
        userRequest: "Summarize Slack messages from the launch channel.",
        authStatus: "available" as const,
        accounts: [],
        expected: /Slack \(slack\.workspace\) has no connected account/,
      },
      {
        title: "GitHub expired auth",
        connectorId: "github.repository",
        label: "GitHub",
        providerId: "github",
        userRequest: "Review GitHub issues assigned to me and summarize stale blockers.",
        authStatus: "expired" as const,
        accounts: [{ id: "primary", label: "Primary GitHub" }],
        expected: /GitHub \(github\.repository\) is expired/,
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const thread = store.createWorkflowAgentThreadSummary({
        title: testCase.title,
        initialRequest: testCase.userRequest,
        projectPath: workspacePath,
        phase: "planned",
      });
      const descriptor = {
        ...baseDescriptor,
        id: testCase.connectorId,
        label: testCase.label,
        description: `${testCase.label} connector descriptor with jittered auth/account state.`,
        auth: { type: "oauth2" as const, providerId: testCase.providerId, status: testCase.authStatus },
        accounts: testCase.accounts,
      };
      const connectorDescriptors =
        index % 2 === 0 ? [workspaceInventoryConnectorDescriptor(), descriptor] : [descriptor, workspaceInventoryConnectorDescriptor()];
      let compileCalled = false;

      await expect(
        compileWorkflowArtifact({
          store,
          workflowThreadId: thread.id,
          userRequest: testCase.userRequest,
          workspaceSummary: "Temp workspace",
          toolDescriptors: index === 1 ? [] : firstPartyDesktopToolDescriptors(),
          connectorDescriptors,
          stateRoot: store.getWorkspace().statePath,
          model: AMBIENT_DEFAULT_MODEL,
          provider: {
            compileProgramIr: async () => {
              compileCalled = true;
              return finalOnlyProgram("Should not compile");
            },
          },
        }),
      ).rejects.toThrow(testCase.expected);
      expect(compileCalled).toBe(false);
    }
  });

  it("fails provider-required connector ids before compiling when the connector is unavailable", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable provider-required calendar",
      initialRequest: "Create an agenda digest from upcoming events.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Create an agenda digest from upcoming events.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "calendar event read", reason: "Agenda source." }],
            requiredConnectorIds: ["google.calendar"],
            requiredToolNames: [],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: Google Calendar \(google\.calendar\) is not registered/);
    expect(compileCalled).toBe(false);
  });

  it("honors explicit connector exclusions over provider-required connector ids", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Excluded provider connector",
      initialRequest: "Build a model-only summary without Gmail.",
      projectPath: workspacePath,
      phase: "planned",
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Create a model-only summary. Do not use Gmail or Google Workspace connectors.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        discoverCapabilities: async () => ({
          queries: [{ query: "model summary", reason: "No external source required." }],
          requiredConnectorIds: ["google.gmail"],
          requiredToolNames: [],
          openQuestions: [],
        }),
        compileProgramIr: async () => finalOnlyProgram("Model-only excluded connector summary"),
      },
    });

    expect(dashboard.artifacts[0].title).toBe("Model-only excluded connector summary");
    const modelCall = store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: [] });
  });

  it("honors forbidden-source connector exclusions over provider-required connector ids", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Forbidden provider connector",
      initialRequest: "Build a local file report without Google Workspace.",
      projectPath: workspacePath,
      phase: "planned",
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: [
        "Create a Workflow Agent that uses Ambient Desktop's local/workspace file_read workflow tool directly to read dogfood-notes/admin.md.",
        "The only permitted read tool is file_read. Forbidden external sources: Google Drive, Google Workspace, google.drive, connector content, connector account data, cloud accounts, and external accounts.",
      ].join(" "),
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => tool.name === "file_read"),
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        discoverCapabilities: async () => ({
          queries: [{ query: "Google Drive read", reason: "Provider incorrectly treated forbidden source text as a source requirement." }],
          requiredConnectorIds: ["google.drive"],
          requiredToolNames: ["file_read"],
          openQuestions: [],
        }),
        compileProgramIr: async () => finalOnlyProgram("Forbidden connector exclusion summary"),
      },
    });

    expect(dashboard.artifacts[0].title).toBe("Forbidden connector exclusion summary");
    const modelCall = store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: [] });
  });

  it("fails when too many provider-required connectors exceed the selected connector budget", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Required connector budget",
      initialRequest: "Create a cross-app project digest.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const baseDescriptor = fixtureWorkflowConnector().descriptor;
    const connector = (id: string, label: string) => ({
      ...baseDescriptor,
      id,
      label,
      description: `${label} read connector.`,
      auth: { type: "oauth2" as const, providerId: id.split(".")[0] ?? id, status: "available" as const },
      accounts: [{ id: "primary", label: `Primary ${label}` }],
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Create a cross-app project digest from the required connected apps.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [
          connector("google.gmail", "Gmail"),
          connector("google.calendar", "Google Calendar"),
          connector("google.drive", "Google Drive"),
          connector("slack.workspace", "Slack"),
          connector("github.repository", "GitHub"),
        ],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          discoverCapabilities: async () => ({
            queries: [{ query: "cross app project digest", reason: "User asked for connected apps." }],
            requiredConnectorIds: ["google.gmail", "google.calendar", "google.drive", "slack.workspace", "github.repository"],
            requiredToolNames: [],
            openQuestions: [],
          }),
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: GitHub \(github\.repository\) was not selected for this compile/);
    expect(compileCalled).toBe(false);
  });

  it("does not require a connector that the workflow request explicitly excludes", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Connector exclusions",
      initialRequest: "Build a model-only report without personal connectors.",
      projectPath: workspacePath,
      phase: "planned",
    });

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest:
        "Create a model-only summary card. Do not use Gmail, Slack, GitHub, Google Calendar, Google Drive, browser tools, local files, or external connectors.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      connectorDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => finalOnlyProgram("Model-only connector exclusion summary"),
      },
    });

    expect(dashboard.artifacts[0].title).toBe("Model-only connector exclusion summary");
    const modelCall = store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.input).toMatchObject({ selectedConnectorIds: [] });
  });

  it("fails Google meeting transcript requests before compiling against unrelated connectors", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Unavailable Google transcripts",
      initialRequest: "Pull Google meeting transcripts from the last two weeks and extract action items.",
      projectPath: workspacePath,
      phase: "planned",
    });
    let compileCalled = false;

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Pull Google meeting transcripts from the last two weeks and extract action items with owners and due dates.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => {
            compileCalled = true;
            return finalOnlyProgram("Should not compile");
          },
        },
      }),
    ).rejects.toThrow(/Workflow connector is not available: .*Google Calendar \(google\.calendar\).*Google Drive \(google\.drive\).*workspace\.inventory/);
    expect(compileCalled).toBe(false);
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
      observations: [{ action: "call_tool", name: "ambient_cli", status: "succeeded", inputSummary: "pi-arxiv arxiv_search", outputSummary: "bounded arxiv output" }],
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
            { id: "final-output", kind: "output.final", dependsOn: ["search-arxiv"], value: { stdout: { fromNode: "search-arxiv", path: "stdout" } } },
          ],
        }),
      },
    });

    expect(dashboard.artifacts).toHaveLength(1);
    expect(dashboard.artifacts[0].manifest.tools).toEqual(expect.arrayContaining(["ambient_cli"]));
    expect(dashboard.artifacts[0].manifest.ambientCliCapabilities).toEqual([grant]);
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain("tools.ambient_cli");
    const modelCall = store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.output).toMatchObject({
      normalizedProgram: expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ id: "search-arxiv", tool: "ambient_cli" })]),
      }),
    });
  });

  it("repairs invalid WorkflowProgramIR with typed operations instead of regenerating source", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR repair",
      initialRequest: "Search and write a report.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];
    const repairPrompts: string[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Search for workflow compiler QA evidence and write a report.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Repairable IR QA Report",
          goal: "Search and write a deterministic report.",
          nodes: [
            { id: "search", kind: "tool.call", tool: "browserSearch", args: { query: "workflow compiler QA", maxResults: 3 } },
            {
              id: "write",
              kind: "tool.call",
              tool: "file_write",
              dependsOn: ["search"],
              args: { path: "reports/ir-repair.md", content: { fromNode: "search" } },
            },
            { id: "final", kind: "output.final", dependsOn: ["write"], value: { path: { fromNode: "write", path: "path" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          repairPrompts.push(input.prompt);
          if (input.attempt === 2) {
            return {
              repairOperations: [
                {
                  kind: "replace_with_alternative",
                  path: "/nodes/1/args/content",
                  value: { template: "{{results}}", vars: { results: { fromNode: "search", path: "results" } } },
                },
              ],
            };
          }
          return { repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/0/tool", value: "browser_search" }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(repairPrompts).toHaveLength(2);
    expect(repairPrompts[0]).toContain("\"repairOperations\"");
    expect(repairPrompts[0]).toContain("ir.unavailable_tool");
    expect(repairPrompts[0]).toContain("browserSearch");
    expect(repairPrompts[1]).toContain("ir.reference_path_required");
    expect(repairPrompts[1]).toContain("/nodes/1/args/content");
    expect(progress.map((event) => event.message)).toEqual(expect.arrayContaining([
      "Repairing workflow program IR with typed repair operations.",
      "Applied workflow program IR repair operations.",
      "Workflow program IR passed static validation, codegen, and dry-run.",
    ]));
    expect(progress.find((event) => event.message === "Workflow program IR passed static validation, codegen, and dry-run.")?.metrics).toMatchObject({
      repairAttemptCount: 2,
      patchOperationCount: 2,
      incrementalValidationCacheHits: 1,
      incrementalValidationCacheMisses: 2,
      incrementalValidationLevelCount: expect.any(Number),
      loweringCacheHits: 0,
      loweringCacheMisses: 3,
    });
    expect(dashboard.artifacts[0].manifest.tools).toEqual(expect.arrayContaining(["browser_search", "file_write"]));
    const modelCall = store.listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id }).find((call) => call.task === "workflow.compiler");
    expect(modelCall?.output).toMatchObject({
      normalizedProgram: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "search", tool: "browser_search" }),
          expect.objectContaining({ id: "write", args: expect.objectContaining({ content: expect.objectContaining({ template: "{{results}}" }) }) }),
        ]),
      }),
      repairHistory: [
        expect.objectContaining({ attempt: 1, patch: [{ op: "replace", path: "/nodes/0/tool", value: "browser_search" }] }),
        expect.objectContaining({ attempt: 2 }),
      ],
    });
    const artifactRoot = dirname(dashboard.artifacts[0].sourcePath);
    const repairHistory = JSON.parse(await readFile(join(artifactRoot, "repair-history.json"), "utf8"));
    expect(repairHistory).toMatchObject({
      schemaVersion: 1,
      repairAttemptCount: 2,
      patchOperationCount: 2,
      attempts: [
        {
          attempt: 1,
          diagnosticCount: 2,
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "ir.unavailable_tool", nodeId: "search" }),
            expect.objectContaining({ code: "ir.reference_path_required", nodeId: "write" }),
          ]),
          patchOperationCount: 1,
          patch: [{ op: "replace", path: "/nodes/0/tool", value: "browser_search" }],
          rawPatch: { repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/0/tool", value: "browser_search" }] },
        },
        {
          attempt: 2,
          diagnostics: expect.arrayContaining([expect.objectContaining({ code: "ir.reference_path_required", nodeId: "write" })]),
          patchOperationCount: 1,
        },
      ],
    });
    const compileRun = dashboard.runs.find((run) => run.artifactId === dashboard.artifacts[0].id)!;
    const compileEvent = store.listWorkflowRunEvents(compileRun.id).find((event) => event.type === "workflow.compile");
    expect(compileEvent?.data).toMatchObject({
      repairHistoryPath: join(artifactRoot, "repair-history.json"),
      validationReportPath: join(artifactRoot, "validation-report.json"),
      repairAttemptCount: 2,
      patchOperationCount: 2,
    });
    const detail = readWorkflowRunDetail(store, compileRun.id);
    expect(detail?.sourceProvenance?.repairHistoryPath).toBe(join(artifactRoot, "repair-history.json"));
    expect(detail?.sourceProvenance?.validationReportPath).toBe(join(artifactRoot, "validation-report.json"));
  });

  it("emits phase-aware failed progress when WorkflowProgramIR cannot be repaired", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR failure",
      initialRequest: "Search with an unavailable tool.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Search for workflow compiler QA evidence.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => ({
            version: 1,
            title: "Invalid IR",
            goal: "Reference an unavailable browser alias.",
            nodes: [{ id: "search", kind: "tool.call", tool: "browserSearch", args: { query: "workflow compiler QA" } }],
          }),
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow("ir.unavailable_tool");

    const failedValidation = progress.find((event) => event.message === "Workflow program IR failed static validation.");
    expect(failedValidation).toMatchObject({
      phase: "validated",
      status: "failed",
      metrics: {
        compilerMode: "program_ir",
        compilerFailurePhase: "static_validation",
        failureDiagnosticCode: "ir.unavailable_tool",
        failureNodeId: "search",
        compilerDiagnosticCount: 1,
        repairAttemptCount: 0,
        compilerTotalMs: expect.any(Number),
        staticValidationMs: expect.any(Number),
      },
    });
    expect(progress.at(-1)).toMatchObject({ phase: "failed", status: "failed" });
    expect(store.getWorkflowAgentThreadSummary(thread.id).phase).toBe("failed");
  });

  it("validates WorkflowProgramIR tools against the full registry, not just the prompt subset", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR registry fallback",
      initialRequest: "Search for workflow compiler QA evidence.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const toolDescriptors = firstPartyDesktopToolDescriptors().filter((tool) => tool.name === "browser_search" || tool.name === "file_write");
    const progress: WorkflowCompileProgress[] = [];
    let prompt = "";

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Search for workflow compiler QA evidence.",
      workspaceSummary: "Temp workspace",
      toolDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        discoverCapabilities: async () => ({
          queries: [{ query: "web search" }],
          requiredToolNames: ["browser_search"],
          openQuestions: [],
        }),
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return {
            version: 1,
            title: "IR Registry Fallback",
            goal: "Search and persist a local QA note.",
            nodes: [
              { id: "search", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler QA", maxResults: 2 } },
              {
                id: "write",
                kind: "tool.call",
                tool: "file_write",
                dependsOn: ["search"],
                args: { path: "reports/ir-registry-fallback.md", content: { template: "{{results}}", vars: { results: { fromNode: "search" } } } },
              },
              { id: "final", kind: "output.final", dependsOn: ["write"], value: { path: { fromNode: "write", path: "path" } } },
            ],
          };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    const selectedCapabilitySection = prompt.slice(
      prompt.indexOf("Selected Desktop workflow capabilities:"),
      prompt.indexOf("No workflow connectors were selected."),
    );
    expect(prompt).toContain("browser_search");
    expect(selectedCapabilitySection).toContain("browser_search");
    expect(selectedCapabilitySection).not.toContain("file_write");
    expect(prompt).not.toContain("Ambient CLI workflow capabilities:");
    expect(prompt).not.toContain("Ambient CLI execution must depend on a matching ambient_cli_describe node");
    expect(progress.find((event) => event.phase === "context" && event.status === "completed")?.metrics).toMatchObject({
      selectedToolCount: 1,
    });
    expect(dashboard.artifacts[0].manifest.tools).toEqual(expect.arrayContaining(["browser_search", "file_write"]));
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain("tools.file_write");
  });

  it("reports IR dependency-level validation concurrency for independent branches", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Parallel compile",
      initialRequest: "Compile independent branches and combine them.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];
    const branches = ["branch-1", "branch-2", "branch-3", "branch-4", "branch-5"];

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Compile independent branch components and then combine them.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Parallel Branch Workflow",
          goal: "Render independent branch values and combine their outputs.",
          summary: "Five independent branches feed one final combiner.",
          nodes: [
            ...branches.map((id) => ({
              id,
              kind: "transform.template",
              template: id,
            })),
            {
              id: "combine",
              kind: "output.final",
              dependsOn: branches,
              value: Object.fromEntries(branches.map((id) => [id, { fromNode: id, path: "value" }])),
            },
          ],
        }),
      },
      onProgress: (event) => progress.push(event),
    });

    expect(dashboard.artifacts).toHaveLength(1);
    expect(dashboard.artifacts[0].manifest.tools).toEqual([]);
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain('outputs["combine"]');
    expect(progress.find((event) => event.message === "Workflow program IR passed static validation, codegen, and dry-run.")?.metrics).toMatchObject({
      compilerMode: "program_ir",
      incrementalValidationConcurrency: 4,
      incrementalValidationLevelCount: 2,
      incrementalValidationMaxLevelWidth: 5,
      loweredOperationCount: 6,
    });
  });

  it("does not retry invalid Pi-authored source because legacy source repair is disabled", async () => {
    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Write a report file.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {},
      }),
    ).rejects.toThrow("Workflow compiler requires a WorkflowProgramIR provider");
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

  it("repairs invalid model IR with typed operations instead of source validation retry", async () => {
    const prompts: string[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema", value: { labels: "array" } }] };
        },
      },
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("\"repairOperations\"");
    expect(prompts[0]).toContain("Do not generate source code");
    expect(prompts[0]).toContain("ir.unknown_output_path");
    expect(dashboard.artifacts[0]).toMatchObject({
      title: "Invalid Classifier",
      status: "ready_for_preview",
    });
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain("outputContract");
  });

  it("persists WorkflowProgramIR compile-failure evidence under stateRoot", async () => {
    const progress: WorkflowCompileProgress[] = [];
    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Read a file and return its content.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => ({
            version: 1,
            title: "Invalid File Read",
            goal: "Return a file read result.",
            nodes: [
              { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
              { id: "final-output", kind: "output.final", dependsOn: ["read-source"], value: { text: { fromNode: "read-source", path: "contents" } } },
            ],
          }),
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toBeInstanceOf(WorkflowProgramCompileError);

    const failed = progress.find((event) => event.status === "failed" && typeof event.metrics?.failureArtifactPath === "string");
    const failureArtifactPath = failed?.metrics?.failureArtifactPath;
    expect(failureArtifactPath).toEqual(expect.stringContaining(join(store.getWorkspace().statePath, "workflow-compile-failures")));

    const artifact = JSON.parse(await readFile(String(failureArtifactPath), "utf8"));
    expect(artifact).toMatchObject({
      attempt: 0,
      context: expect.objectContaining({
        selectedToolNames: expect.arrayContaining(["file_read"]),
      }),
      failureReport: expect.objectContaining({
        firstDiagnosticCode: "ir.unknown_output_path",
        firstDiagnosticSourceNodeId: "read-source",
        firstDiagnosticInvalidOutputPath: "contents",
        firstDiagnosticValidAlternatives: "path, content, truncated, kind",
        firstDiagnosticProducerOutputContract: "read-source (file_read result): path, content, truncated, kind",
        diagnostics: [
          expect.objectContaining({
            producerOutputContract: "read-source (file_read result): path, content, truncated, kind",
          }),
        ],
      }),
      repairHistory: [],
    });
  });

  it("retries malformed WorkflowProgramIR repair responses with patch-shape feedback", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return prompts.length === 1
            ? { version: 1, title: "Still not a patch", nodes: [] }
            : { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema", value: { labels: "array" } }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("repair response validation error");
    expect(prompts[1]).toContain('"repairOperations"');
    expect(progress.map((event) => event.message)).toContain("WorkflowProgramIR repair response failed deterministic validation; retrying.");
    expect(dashboard.artifacts[0]).toMatchObject({ status: "ready_for_preview" });
  });

  it("retries oversized WorkflowProgramIR repair responses with operation-limit feedback", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return prompts.length === 1
            ? {
                repairOperations: Array.from({ length: 21 }, () => ({
                  kind: "add_semantic_slot",
                  path: "/nodes/0/output/schema",
                  value: { labels: "array" },
                })),
              }
            : { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema", value: { labels: "array" } }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("maximum is 20");
    expect(prompts[1]).toContain("Return at most 20 repair operations");
    expect(progress.find((event) => event.message === "WorkflowProgramIR repair response failed deterministic validation; retrying.")?.metrics).toMatchObject({
      repairFailureClass: "too_many_operations",
      repairRetryable: true,
    });
    expect(dashboard.artifacts[0]).toMatchObject({ status: "ready_for_preview" });
  });

  it("deterministically converts missing output schema repair paths instead of re-prompting Pi", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema/labels", value: "array" }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(1);
    expect(progress.map((event) => event.message)).not.toContain("WorkflowProgramIR repair response failed deterministic validation; retrying.");
    expect(dashboard.artifacts[0]).toMatchObject({ status: "ready_for_preview" });
  });

  it("fails closed on impossible WorkflowProgramIR repair paths and persists rejected patch diagnostics", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Classify records.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: [],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => ({
            version: 1,
            title: "Invalid Classifier",
            goal: "Classify records.",
            nodes: [
              {
                id: "classify",
                kind: "model.call",
                task: "classify.records",
                input: { records: [] },
                output: {},
              },
              { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
            ],
          }),
          repairProgramIr: async (input) => {
            prompts.push(input.prompt);
            return { repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/-", value: { id: "unused", kind: "output.final", value: {} } }] };
          },
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toBeInstanceOf(WorkflowProgramIrRepairRejectedError);

    const retryEvents = progress.filter((event) => event.message === "WorkflowProgramIR repair response failed deterministic validation; retrying.");
    const failClosedEvent = progress.find((event) => event.message === "WorkflowProgramIR repair response failed deterministic validation; failing closed.");
    const failedEvent = progress.find((event) => event.message === "WorkflowProgramIR repair failed deterministic validation; retained diagnostics.");
    expect(prompts).toHaveLength(1);
    expect(retryEvents).toHaveLength(0);
    expect(failClosedEvent?.metrics).toMatchObject({ repairFailureClass: "invalid_array_index", repairRetryable: false });
    expect(failedEvent?.metrics).toMatchObject({ repairFailureClass: "invalid_array_index", repairRetryable: false });

    const failureArtifactPath = String(failedEvent?.metrics?.failureArtifactPath);
    expect(failureArtifactPath).toEqual(expect.stringContaining(join(store.getWorkspace().statePath, "workflow-compile-failures")));
    const artifact = JSON.parse(await readFile(failureArtifactPath, "utf8"));
    expect(artifact.context.repairFailure).toMatchObject({
      failureClass: "invalid_array_index",
      retryable: false,
      rawPatch: { repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/-", value: { id: "unused", kind: "output.final", value: {} } }] },
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

    const proposedArtifact = dashboard.artifacts.find((artifact) => artifact.workflowThreadId === thread.id && artifact.id !== baseArtifact.id);
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
