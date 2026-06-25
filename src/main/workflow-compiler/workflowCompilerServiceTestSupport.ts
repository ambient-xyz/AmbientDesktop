import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pluginMcpToolDescriptor } from "./workflowCompilerDesktopToolFacade";
import type { PluginMcpToolRegistration } from "./workflowCompilerPluginsFacade";
import {
  WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
  type WorkflowCompilerCallableInvocationContext,
} from "./workflowCompilerService";

export function fixturePluginRegistration(): PluginMcpToolRegistration {
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

export async function seedWorkflowCliFixture(workspace: string): Promise<void> {
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
    [
      "---",
      "name: ambient-json-cli",
      "description: Use ambient_cli json-pick for JSON field extraction.",
      "---",
      "",
      "Raw skill instructions.",
      "",
    ].join("\n"),
    "utf8",
  );
}

export function finalOnlyProgram(title: string, goal = "Compile a deterministic no-op workflow."): unknown {
  return {
    version: 1,
    title,
    goal,
    nodes: [{ id: "final", kind: "output.final", value: { literal: { ok: true } } }],
  };
}

export function bashClassifierProgram(): unknown {
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

export function classifierProgram(title: string, goal = "Classify records."): unknown {
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

export function callableRecordedWorkflowInvocationContext(
  input: {
    callerProvenance?: WorkflowCompilerCallableInvocationContext["callerProvenance"];
  } = {},
): WorkflowCompilerCallableInvocationContext {
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
    launchBridgeContract: {
      schemaVersion: "ambient-callable-workflow-symphony-launch-bridge-v1",
      workflowTaskId: "symphony-task-1",
      launchId: "symphony-launch-1",
      parentThreadId: "parent-thread-1",
      parentRunId: "parent-run-1",
      parentMessageId: "parent-message-1",
      expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
      expectedWorkflowToolId: "symphony:map_reduce",
      sourceKind: "symphony_recipe",
      pattern: {
        id: "map_reduce",
        label: "Map-Reduce",
        blocking: true,
      },
      childLaunches: [
        {
          roleNodeId: "mapper",
          label: "Mapper",
          title: "Mapper sub-agent",
          task: "Map implementation evidence into schema-valid findings.",
          roleId: "explorer",
          dependencyMode: "required",
          forkMode: "recent_turns",
          promptMode: "append",
          effectiveRole: {
            schemaVersion: "ambient-subagent-effective-role-v1",
            baseRole: "explorer",
            patternRole: "mapper",
            displayLabel: "Explorer + Mapper",
            roleOverlayIds: ["mapper.slice-assignment"],
            overlays: [
              {
                id: "mapper.slice-assignment",
                label: "slice assignment",
                narrowsAuthority: true,
                widensAuthority: false,
                adds: ["slice assignment"],
              },
            ],
            nonWidening: true,
            outputContract: "Return mapped evidence with citations and blockers.",
          },
          patternRole: "mapper",
          patternGraphBinding: {
            workflowTaskId: "symphony-task-1",
            roleNodeId: "mapper",
            label: "Mapper",
            approvalState: "none",
            blockingParent: true,
          },
          toolScope: {
            mode: "role_defaults",
            rationale: "Use the selected role's least-privilege defaults.",
          },
          idempotencyKey: "callable-workflow:symphony-task-1:symphony-child:mapper",
        },
        {
          roleNodeId: "reducer",
          label: "Reducer",
          title: "Reducer sub-agent",
          task: "Reduce mapped evidence into a synthesis-safe answer.",
          roleId: "summarizer",
          dependencyMode: "required",
          forkMode: "no_history",
          promptMode: "fresh",
          effectiveRole: {
            schemaVersion: "ambient-subagent-effective-role-v1",
            baseRole: "summarizer",
            patternRole: "reducer",
            displayLabel: "Summarizer + Reducer",
            roleOverlayIds: ["reducer.merge-rules"],
            overlays: [
              {
                id: "reducer.merge-rules",
                label: "merge rules",
                narrowsAuthority: true,
                widensAuthority: false,
                adds: ["merge rules"],
              },
            ],
            nonWidening: true,
            outputContract: "Return reduced findings and coverage validation.",
          },
          patternRole: "reducer",
          patternGraphBinding: {
            workflowTaskId: "symphony-task-1",
            roleNodeId: "reducer",
            label: "Reducer",
            approvalState: "none",
            blockingParent: true,
          },
          toolScope: {
            mode: "role_defaults",
            rationale: "Use the selected role's least-privilege defaults.",
          },
          idempotencyKey: "callable-workflow:symphony-task-1:symphony-child:reducer",
        },
      ],
      wait: {
        mode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 600000,
        blocking: true,
        childRoleNodeIds: ["mapper", "reducer"],
      },
      expectedEvidence: ["Every required child launch has a childRunId bound to this workflow task's pattern graph."],
    },
  };
}

export function childCallableWorkflowCallerProvenance(): NonNullable<WorkflowCompilerCallableInvocationContext["callerProvenance"]> {
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

export function callableSymphonyWorkflowInvocationContext(): WorkflowCompilerCallableInvocationContext {
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
