import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import {
  SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
  SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
  SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
  SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
  type SymphonyChildLaunchContractBundle,
} from "../../shared/symphonyFineGrainedContracts";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import {
  buildCallableWorkflowExecutionPlan,
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  parentPiVisibleCallableWorkflowTools,
} from "./subagentCallableWorkflowFacade";
import { ProjectStore } from "./subagentProjectStoreFacade";
import { subagentStructuredResultTemplate } from "./subagentStructuredOutput";

const roots: string[] = [];

export async function cleanupTempWorkspaces() {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
}

export async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-subagent-pi-tools-"));
  roots.push(root);
  return join(root, "workspace");
}

export function executeTool(
  tool: ToolDefinition<any, any, any>,
  toolCallId: string,
  params: Record<string, unknown>,
  onUpdate?: Parameters<ToolDefinition<any, any, any>["execute"]>[3],
): Promise<AgentToolResult<any>> {
  return tool.execute(toolCallId, params, undefined, onUpdate, {} as any);
}

export const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" });
export const enabledFlags = resolveAmbientFeatureFlags({
  startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
  generatedAt: "2026-06-05T00:00:00.000Z",
});

export function structuredResult(
  roleId: "explorer" | "drafter" | "reviewer" | "summarizer" | "worker",
  summary: string,
  mutationEvidence: unknown[] = [],
) {
  const template = subagentStructuredResultTemplate({ id: roleId });
  if (roleId === "explorer") {
    return {
      ...template,
      summary,
      roleOutput: { findings: [{ summary, provenance: [] }], openQuestions: [] },
    };
  }
  if (roleId === "drafter") {
    return {
      ...template,
      summary,
      roleOutput: { draft: summary, constraintsChecked: [], rationale: [] },
    };
  }
  if (roleId === "reviewer") {
    return {
      ...template,
      summary,
      roleOutput: { verdict: "passed", findings: [] },
    };
  }
  if (roleId === "summarizer") {
    return {
      ...template,
      summary,
      roleOutput: { keyPoints: [summary], sourceRefs: [] },
    };
  }
  return {
    ...template,
    summary,
    roleOutput: {
      changes: ["src/worker.ts"],
      validation: ["pnpm test"],
      mutationEvidence,
    },
  };
}

export function enqueueSymphonyWorkflowTask(store: ProjectStore, parentThreadId: string, parentRunId: string, assistantMessageId?: string) {
  const registry = buildCallableWorkflowRegistry({
    featureFlagSnapshot: enabledFlags,
  });
  const tool = parentPiVisibleCallableWorkflowTools(registry)[0]!;
  const runPlan = buildCallableWorkflowRunPlan(tool, {
    goal: "Summarize release notes",
    blocking: true,
    metricCriteria: [{ templateId: "map_reduce-metric", value: "Every mapped item has reducer evidence." }],
  });
  return store.enqueueCallableWorkflowTask({
    executionPlan: buildCallableWorkflowExecutionPlan({
      descriptor: tool,
      runPlan,
      parent: {
        threadId: parentThreadId,
        runId: parentRunId,
        ...(assistantMessageId ? { assistantMessageId } : {}),
      },
      toolCallId: "workflow-tool-call",
      createdAt: "2026-06-06T18:00:00.000Z",
    }),
    featureFlagSnapshot: enabledFlags,
  });
}

export function symphonyLaunchContractForPiTool(input: {
  parentThreadId: string;
  parentRunId: string;
  role: string;
  inheritedAuthorityRoots?: string[];
  writableRoots?: string[];
  allowedToolIds?: string[];
  deniedToolIds?: string[];
  mutation?: "none" | "lease_required";
}): SymphonyChildLaunchContractBundle {
  const pattern = "map_reduce" as const;
  return {
    schemaVersion: SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
    patternSelection: {
      schemaVersion: SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
      selectionId: "selection-mutation-1",
      parentRunId: input.parentRunId,
      pattern,
      confidence: "high",
      childRolePlan: [
        {
          role: input.role,
          count: 1,
          purpose: "Produce an isolated mutation result for parent synthesis.",
        },
      ],
      requiredArtifacts: ["mutation-evidence"],
      reducerContract: "Parent verifies mutation evidence before synthesis.",
      failurePolicy: "allow_partial_with_user_decision",
      tokenAndTimeBudget: {
        maxChildren: 1,
        maxMinutes: 10,
      },
    },
    modePolicySnapshot: {
      schemaVersion: SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
      snapshotId: "symphony-mode-snapshot-mutation-1",
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      enabled: true,
      parentAllowedActions: [
        "detect_pattern",
        "plan",
        "spawn_child",
        "inspect_run_graph",
        "inspect_child_evidence",
        "request_decision",
        "retry_child",
        "synthesize",
      ],
      observationPolicy: "full_runtime_observability",
      directExecutionPolicy: "deny_substantive_tools",
      featureFlagSnapshot: enabledFlags,
    },
    childLaunchPolicySnapshot: {
      schemaVersion: SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
      policyId: "child-policy-mutation-1",
      childRunId: "pending-child-run",
      role: input.role,
      pattern,
      inheritedAuthorityRoots: input.inheritedAuthorityRoots ?? [],
      writableRoots: input.writableRoots ?? [],
      allowedToolIds: input.allowedToolIds ?? ["workspace.write"],
      deniedToolIds: input.deniedToolIds ?? ["browser.interactive"],
      webProviderOrder: {
        search: ["brave"],
        staticFetchExtract: [],
        dynamicHeadlessBrowser: [],
        interactiveBrowser: {
          providers: [],
          fallback: "deny",
        },
      },
      mutation: input.mutation ?? "none",
    },
  };
}

export function completedWorkerRun(
  store: ProjectStore,
  parentThreadId: string,
  parentRunId: string,
  parentMessageId: string,
  canonicalTaskPath: string,
  idSuffix: string,
  dependencyMode: "required" | "optional_background" = "required",
) {
  const run = store.createSubagentRun({
    parentThreadId,
    parentRunId,
    parentMessageId,
    title: `Worker ${idSuffix}`,
    roleId: "worker",
    canonicalTaskPath,
    featureFlagSnapshot: enabledFlags,
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL),
    dependencyMode,
  });
  return store.markSubagentRunStatus(run.id, "completed", {
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: run.id,
      status: "completed",
      partial: false,
      summary: "Changed src/worker.ts and ran tests.",
      childThreadId: run.childThreadId,
      structuredOutput: structuredResult("worker", "Changed src/worker.ts and ran tests.", [
        {
          toolCallId: `tool-call-${idSuffix}`,
          path: "src/worker.ts",
          category: "workspace.write",
        },
      ]),
    },
  });
}

export function explorerResultArtifact(runId: string, childThreadId: string, summary: string) {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status: "completed",
    partial: false,
    summary,
    childThreadId,
    structuredOutput: {
      ...subagentStructuredResultTemplate(getDefaultSubagentRoleProfile("explorer")),
      summary,
      evidence: [`${childThreadId}:result`],
      roleOutput: {
        findings: [{ summary, provenance: [`${childThreadId}:result`] }],
        openQuestions: [],
      },
    },
  };
}
