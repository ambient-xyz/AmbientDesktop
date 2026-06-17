import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AMBIENT_LOCAL_TEXT_MODEL,
  AMBIENT_PROVIDER_LOCAL,
  createAmbientModelRuntimeSnapshot,
} from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { LocalRuntimeLeaseRecord } from "../../shared/types";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
  parentPiVisibleCallableWorkflowTools,
} from "../callable-workflow/callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "../callable-workflow/callableWorkflowExecutionPlan";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
  callableWorkflowParentBlockingAllowedUserChoices,
  callableWorkflowParentBlockingIdempotencyKey,
  resolveCallableWorkflowParentBlocking,
} from "../callable-workflow/callableWorkflowParentBlocking";
import type { CallableWorkflowCallerProvenance } from "../callable-workflow/callableWorkflowExecutionPlan";
import { recordSubagentApprovalRequestBridgeIfNeeded } from "./subagentApprovalBridge";
import { executeSubagentBarrierDecision } from "./subagentBarrierDecisionExecutor";
import {
  allowedUserChoicesForSubagentWaitBarrier,
  resolveSubagentParentPolicyForWait,
} from "./subagentParentPolicyResolution";
import {
  SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID,
  SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID,
  SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_TOOL_CALL_ID,
  SUBAGENT_DESKTOP_DOGFOOD_FIXED_NOW,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ENDPOINT,
  SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID,
  SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_SOURCE_RELATIVE_PATH,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_STATE_RELATIVE_PATH,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_TOOL_CALL_ID,
  SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_RUN_ID,
  SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_THREAD_ID,
  SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_LABEL,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_CASCADE_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_TOOL_RESULT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_TOOL_CALL_ID,
  type SubagentDesktopDogfoodSeedResult,
} from "./subagentDesktopDogfoodScenario";
import { ProjectStore } from "../projectStore";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import { buildPatternGraphSnapshot, effectiveSubagentRoleSnapshot } from "../../shared/subagentPatternGraph";

const DOGFOOD_ENABLED = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD === "1";
const dogfoodIt = DOGFOOD_ENABLED ? it : it.skip;
const HIGH_LOAD_WORKFLOW_PATTERN_IDS = [
  SYMPHONY_WORKFLOW_PATTERN_IDS[1],
  SYMPHONY_WORKFLOW_PATTERN_IDS[2],
  SYMPHONY_WORKFLOW_PATTERN_IDS[3],
  SYMPHONY_WORKFLOW_PATTERN_IDS[4],
] as const;

describe("sub-agent Desktop dogfood seed", () => {
  dogfoodIt("seeds a parent thread with visible child sub-agent state", async () => {
    const workspacePath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_WORKSPACE");
    const seedPath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED");

    await mkdir(workspacePath, { recursive: true });
    await writeFile(join(workspacePath, "README.md"), "# Sub-agent Desktop dogfood\n", "utf8");
    const seed = await seedSubagentState(workspacePath);
    await mkdir(dirname(seedPath), { recursive: true });
    await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");

    expect(seed.childRunIds).toHaveLength(2);
    expect(seed.childThreadIds).toHaveLength(2);
    expect(seed.approvalId).toBe("desktop-dogfood-approval-write");
    expect(seed.approvalRequestParentMailboxEventId).toBeTruthy();
    expect(seed.approvalWaitBarrierId).toBeTruthy();
    expect(seed.approvalChildRunId).toBe(seed.childRunIds[0]);
    expect(seed.approvalChildThreadId).toBe(seed.childThreadIds[0]);
    expect(seed.completedChildRunId).toBe(seed.childRunIds[1]);
    expect(seed.completedChildThreadId).toBe(seed.childThreadIds[1]);
    expect(seed.overflowChildRunId).toBe(SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_RUN_ID);
    expect(seed.overflowChildThreadId).toBe(SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_THREAD_ID);
    expect(seed.overflowChildLabel).toBe(SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_LABEL);
    expect(seed.cancelControlChildRunId).toBe(seed.childRunIds[0]);
    expect(seed.closeControlChildRunIds).toEqual(seed.childRunIds);
    expect(seed.localRuntimeLeaseId).toBe(SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID);
    expect(seed.localRuntimeId).toBe(SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID);
    expect(seed.localRuntimePid).toBeGreaterThan(0);
    expect(seed.parentRunId).toBeTruthy();
    expect(seed.workflowTaskId).toMatch(/^callable-workflow:/);
    expect(seed.workflowArtifactId).toBe(SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID);
    expect(seed.workflowArtifactSourceRelativePath).toBe(SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH);
    expect(seed.workflowArtifactStateRelativePath).toBe(SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH);
    expect(seed.workflowArtifactSourceContent).toBe(SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT);
    expect(seed.workflowRunId).toBeTruthy();
    expect(seed.workflowThreadId).toBeTruthy();
    expect(seed.workflowParentMailboxEventId).toBeTruthy();
    expect(seed.mutatingWorkflowTaskId).toMatch(/^callable-workflow:/);
    expect(seed.mutatingWorkflowArtifactId).toBe(SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID);
    expect(seed.mutatingWorkflowRunId).toBeTruthy();
    expect(seed.mutatingWorkflowThreadId).toBeTruthy();
    expect(seed.mutatingWorkflowChildRunId).toBe(seed.approvalChildRunId);
    expect(seed.mutatingWorkflowChildThreadId).toBe(seed.approvalChildThreadId);
    expect(seed.mutatingWorkflowStagedRelativePath).toBe(SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH);
    expect(seed.mutatingWorkflowReportRelativePath).toBe(SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH);
    expect(seed.mutatingWorkflowProgressMessage).toBe(SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE);
    expect(seed.mutatingWorkflowParentWorkspaceUnchanged).toBe(true);
    expect(seed.workflowHighLoadTaskIds).toHaveLength(4);
    expect(seed.workflowHighLoadArtifactIds).toHaveLength(4);
    expect(seed.workflowHighLoadRunIds).toHaveLength(4);
    expect(seed.workflowHighLoadThreadIds).toHaveLength(4);
    expect(seed.workflowHighLoadPatternLabels).toEqual([...SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS]);
    expect(seed.deniedScopeParentMailboxEventId).toBeTruthy();
    expect(seed.deniedScopeChildRunId).toBe(SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID);
    expect(seed.deniedScopeChildThreadId).toBe(SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID);
    expect(seed.lifecycleEdgeParentMessageId).toBeTruthy();
    expect(seed.lifecycleEdgeChildRunIds).toHaveLength(4);
    expect(seed.lifecycleEdgeChildThreadIds).toHaveLength(4);
    expect(seed.lifecycleEdgeWaitBarrierIds).toHaveLength(4);
    expect(seed.parentStopCascadeParentMessageId).toBeTruthy();
    expect(seed.parentStopCascadeParentMailboxEventId).toBeTruthy();
    expect(seed.parentStopCascadeChildRunIds).toHaveLength(3);
    expect(seed.parentStopCascadeChildThreadIds).toHaveLength(3);
    expect(seed.parentStopCascadeWaitBarrierIds).toHaveLength(1);
    expect(seed.parentStopCascadeCancelledRunIds).toEqual([seed.parentStopCascadeChildRunIds[0]]);
    expect(seed.parentStopCascadeDetachedRunIds).toEqual([seed.parentStopCascadeChildRunIds[1]]);
    expect(seed.parentStopCascadeUnchangedRunIds).toEqual([seed.parentStopCascadeChildRunIds[2]]);
    expect(seed.parentStopCascadeCancelledWaitBarrierIds).toEqual(seed.parentStopCascadeWaitBarrierIds);
    expect(seed.parentStopCascadeCancelledMailboxEventIds).toHaveLength(2);
    expect(seed.stressParentMessageIds).toHaveLength(2);
    expect(seed.stressChildRunIds).toHaveLength(6);
    expect(seed.stressChildThreadIds).toHaveLength(6);
  });
});

async function seedSubagentState(workspacePath: string): Promise<SubagentDesktopDogfoodSeedResult> {
  const localRuntimePid = requirePositiveIntegerDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RUNTIME_PID");
  const store = new ProjectStore();
  try {
    store.openWorkspace(workspacePath);
    store.setFeatureFlagSettings({ subagents: true });

    const parent = store.createThread("Sub-agent Desktop dogfood", workspacePath);
    store.setLastActiveThreadId(parent.id);
    const parentMessage = store.addMessage({
      threadId: parent.id,
      role: "assistant",
      content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT,
    });
    const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: parentMessage.id });
    const featureFlagSnapshot = resolveAmbientFeatureFlags({
      settings: { subagents: true },
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: SUBAGENT_DESKTOP_DOGFOOD_FIXED_NOW,
    });
    const modelRuntimeSnapshot = createAmbientModelRuntimeSnapshot(parent.model, SUBAGENT_DESKTOP_DOGFOOD_FIXED_NOW);
    const review = store.createSubagentRun({
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
      title: "Review worker",
      roleId: "reviewer",
      effectiveRoleSnapshot: effectiveSubagentRoleSnapshot({
        baseRole: "reviewer",
        patternRole: "mapper",
        overlayLabels: ["slice assignment", "evidence burden", "approval checkpoint"],
        outputContract: "schema-valid mapped review evidence",
      }),
      canonicalTaskPath: "root/0:reviewer",
      featureFlagSnapshot,
      modelRuntimeSnapshot,
      dependencyMode: "required",
    });
    const summarizer = store.createSubagentRun({
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
      title: "Context summarizer",
      roleId: "summarizer",
      effectiveRoleSnapshot: effectiveSubagentRoleSnapshot({
        baseRole: "summarizer",
        patternRole: "reducer",
        overlayLabels: ["merge rules", "coverage validation", "conflict handling"],
        outputContract: "bounded reducer summary",
      }),
      canonicalTaskPath: "root/1:summarizer",
      featureFlagSnapshot,
      modelRuntimeSnapshot,
      dependencyMode: "optional_background",
    });
    store.addMessage({
      threadId: review.childThreadId,
      role: "user",
      content: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_USER_TEXT,
    });
    store.addMessage({
      threadId: review.childThreadId,
      role: "assistant",
      content: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
    });
    store.addMessage({
      threadId: review.childThreadId,
      role: "tool",
      content: [
        "Workspace Read done",
        "",
        "Input",
        "{\"path\":\"README.md\"}",
        "",
        "Result",
        SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_TOOL_RESULT_TEXT,
      ].join("\n"),
      metadata: {
        toolName: "Workspace Read",
        status: "done",
      },
    });
    store.addMessage({
      threadId: summarizer.childThreadId,
      role: "assistant",
      content: SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
    });

    store.markSubagentRunStatus(review.id, "running", { now: "2026-06-11T12:00:05.000Z" });
    store.markSubagentRunStatus(review.id, "needs_attention", { now: "2026-06-11T12:00:10.000Z" });
    store.markSubagentRunStatus(summarizer.id, "completed", {
      now: "2026-06-11T12:00:11.000Z",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: summarizer.id,
        status: "completed",
        partial: false,
        summary: "Background context summary is available.",
        childThreadId: summarizer.childThreadId,
      },
    });
    const approvalWaitBarrier = store.createSubagentWaitBarrier({
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      childRunIds: [review.id],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      timeoutMs: 30_000,
      createdAt: "2026-06-11T12:00:12.000Z",
    });
    store.recordSubagentToolScopeSnapshot(review.id, {
      scope: {
        schemaVersion: "ambient-subagent-tool-scope-v1",
        loadedCategories: ["workspace.read"],
        piVisibleCategories: ["workspace.read"],
        deniedCategories: [{ id: "connector.read", reason: "Desktop dogfood keeps connector access denied for child threads." }],
        loadedTools: [{
          source: "built_in",
          id: "file_read",
          categoryId: "workspace.read",
          piVisible: true,
          mutatesState: false,
          requiresApproval: false,
        }],
        piVisibleTools: [{
          source: "built_in",
          id: "file_read",
          categoryId: "workspace.read",
          piVisible: true,
          mutatesState: false,
          requiresApproval: false,
        }],
        deniedTools: [{
          source: "connector_app",
          id: "gmail.search",
          categoryId: "connector.read",
          reason: "Desktop dogfood keeps connector access denied for child threads.",
        }],
        approvalMode: "interactive",
        worktreeIsolated: true,
        fanoutAvailable: false,
      },
      resolverInputs: { roleId: "reviewer", requestedCategories: ["workspace.read", "connector_app"] },
      createdAt: "2026-06-11T12:00:13.000Z",
    });
    const approvalId = "desktop-dogfood-approval-write";
    const approvalBridge = recordSubagentApprovalRequestBridgeIfNeeded({
      store,
      run: review,
      waitBarrier: approvalWaitBarrier,
      createdAt: "2026-06-11T12:00:14.000Z",
      explicitIdempotencyKey: "desktop-dogfood:approval-request:workspace-write",
      approval: {
        approvalId,
        title: "Allow workspace write",
        prompt: "Review worker needs permission to edit files in its isolated worktree.",
        requestedAction: "workspace.write",
        requestedToolId: "builtin:write_file",
        requestedToolCategory: "workspace.write",
        requestedScope: "this_action",
      },
    });
    const approvalRequest = approvalBridge.parentMailboxEvent;
    if (!approvalRequest) throw new Error("Desktop dogfood seed expected a parent approval mailbox event.");
    store.appendSubagentMailboxEvent(review.id, {
      direction: "parent_to_child",
      type: "subagent.followup",
      payload: {
        messagePreview: "Parent follow-up delivered while the review worker remains live and inspectable.",
      },
      deliveryState: "delivered",
      createdAt: "2026-06-11T12:00:14.500Z",
      deliveredAt: "2026-06-11T12:00:14.750Z",
    });
    const deniedScopeParentMailboxEvent = seedDeniedScopeExplanation(store, {
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
    });
    const workflow = await seedCallableWorkflowTask(store, workspacePath, {
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
      mapperChildRunId: review.id,
      mapperChildThreadId: review.childThreadId,
      reducerChildRunId: summarizer.id,
      reducerChildThreadId: summarizer.childThreadId,
      featureFlagSnapshot,
    });
    const mutatingWorkflow = await seedMutatingWorkerWorkflowTask(store, workspacePath, {
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
      childRunId: review.id,
      childThreadId: review.childThreadId,
      childCanonicalTaskPath: review.canonicalTaskPath,
      featureFlagSnapshot,
    });
    const workflowHighLoad = await seedWorkflowHighLoadStress(store, workspacePath, {
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
      featureFlagSnapshot,
    });
    await seedLocalRuntimeOwnership(workspacePath, {
      parentThreadId: parent.id,
      childRunId: review.id,
      childThreadId: review.childThreadId,
      pid: localRuntimePid,
    });
    const lifecycleEdge = await seedLifecycleEdgeCluster(store, {
      parentThreadId: parent.id,
      featureFlagSnapshot,
      modelRuntimeSnapshot,
    });
    const parentStopCascade = seedParentStopCascadeCluster(store, {
      parentThreadId: parent.id,
      featureFlagSnapshot,
      modelRuntimeSnapshot,
    });
    const stress = seedMultiClusterStress(store, {
      parentThreadId: parent.id,
      featureFlagSnapshot,
      modelRuntimeSnapshot,
    });

    return {
      parentThreadId: parent.id,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
      childRunIds: [review.id, summarizer.id],
      childThreadIds: [review.childThreadId, summarizer.childThreadId],
      approvalRequestParentMailboxEventId: approvalRequest.id,
      approvalWaitBarrierId: approvalWaitBarrier.id,
      approvalId,
      approvalChildRunId: review.id,
      approvalChildThreadId: review.childThreadId,
      completedChildRunId: summarizer.id,
      completedChildThreadId: summarizer.childThreadId,
      overflowChildRunId: SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_RUN_ID,
      overflowChildThreadId: SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_THREAD_ID,
      overflowChildLabel: SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_LABEL,
      cancelControlChildRunId: review.id,
      closeControlChildRunIds: [review.id, summarizer.id],
      localRuntimeLeaseId: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID,
      localRuntimeId: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID,
      localRuntimePid,
      workflowTaskId: workflow.taskId,
      workflowArtifactId: workflow.artifactId,
      workflowArtifactSourceRelativePath: workflow.sourceRelativePath,
      workflowArtifactStateRelativePath: workflow.stateRelativePath,
      workflowArtifactSourceContent: workflow.sourceContent,
      workflowRunId: workflow.runId,
      workflowThreadId: workflow.threadId,
      workflowParentMailboxEventId: workflow.parentMailboxEventId,
      mutatingWorkflowTaskId: mutatingWorkflow.taskId,
      mutatingWorkflowArtifactId: mutatingWorkflow.artifactId,
      mutatingWorkflowRunId: mutatingWorkflow.runId,
      mutatingWorkflowThreadId: mutatingWorkflow.threadId,
      mutatingWorkflowChildRunId: review.id,
      mutatingWorkflowChildThreadId: review.childThreadId,
      mutatingWorkflowStagedRelativePath: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH,
      mutatingWorkflowReportRelativePath: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH,
      mutatingWorkflowProgressMessage: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE,
      mutatingWorkflowParentWorkspaceUnchanged: mutatingWorkflow.parentWorkspaceUnchanged,
      workflowHighLoadTaskIds: workflowHighLoad.taskIds,
      workflowHighLoadArtifactIds: workflowHighLoad.artifactIds,
      workflowHighLoadRunIds: workflowHighLoad.runIds,
      workflowHighLoadThreadIds: workflowHighLoad.threadIds,
      workflowHighLoadPatternLabels: workflowHighLoad.patternLabels,
      deniedScopeParentMailboxEventId: deniedScopeParentMailboxEvent.id,
      deniedScopeChildRunId: SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID,
      deniedScopeChildThreadId: SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID,
      lifecycleEdgeParentMessageId: lifecycleEdge.parentMessageId,
      lifecycleEdgeChildRunIds: lifecycleEdge.childRunIds,
      lifecycleEdgeChildThreadIds: lifecycleEdge.childThreadIds,
      lifecycleEdgeWaitBarrierIds: lifecycleEdge.waitBarrierIds,
      parentStopCascadeParentMessageId: parentStopCascade.parentMessageId,
      parentStopCascadeParentMailboxEventId: parentStopCascade.parentMailboxEventId,
      parentStopCascadeChildRunIds: parentStopCascade.childRunIds,
      parentStopCascadeChildThreadIds: parentStopCascade.childThreadIds,
      parentStopCascadeWaitBarrierIds: parentStopCascade.waitBarrierIds,
      parentStopCascadeCancelledRunIds: parentStopCascade.cancelledRunIds,
      parentStopCascadeDetachedRunIds: parentStopCascade.detachedRunIds,
      parentStopCascadeUnchangedRunIds: parentStopCascade.unchangedRunIds,
      parentStopCascadeCancelledWaitBarrierIds: parentStopCascade.cancelledWaitBarrierIds,
      parentStopCascadeCancelledMailboxEventIds: parentStopCascade.cancelledMailboxEventIds,
      stressParentMessageIds: stress.parentMessageIds,
      stressChildRunIds: stress.childRunIds,
      stressChildThreadIds: stress.childThreadIds,
    };
  } finally {
    store.close();
  }
}

async function seedLifecycleEdgeCluster(
  store: ProjectStore,
  input: {
    parentThreadId: string;
    featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
    modelRuntimeSnapshot: ReturnType<typeof createAmbientModelRuntimeSnapshot>;
  },
): Promise<{
  parentMessageId: string;
  childRunIds: string[];
  childThreadIds: string[];
  waitBarrierIds: string[];
}> {
  const parentMessage = store.addMessage({
    threadId: input.parentThreadId,
    role: "assistant",
    content: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT,
  });
  const parentRun = store.startRun({ threadId: input.parentThreadId, assistantMessageId: parentMessage.id });
  const baseRunInput = {
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    parentMessageId: parentMessage.id,
    featureFlagSnapshot: input.featureFlagSnapshot,
    modelRuntimeSnapshot: input.modelRuntimeSnapshot,
    dependencyMode: "required" as const,
  };

  const timeoutRun = store.createSubagentRun({
    ...baseRunInput,
    title: "Timeout edge worker",
    roleId: "reviewer",
    canonicalTaskPath: "root/lifecycle:timeout",
  });
  const partialRun = store.createSubagentRun({
    ...baseRunInput,
    title: "Partial recovery worker",
    roleId: "summarizer",
    canonicalTaskPath: "root/lifecycle:partial",
  });
  const retryRun = store.createSubagentRun({
    ...baseRunInput,
    title: "Retry edge worker",
    roleId: "reviewer",
    canonicalTaskPath: "root/lifecycle:retry",
  });
  const detachRun = store.createSubagentRun({
    ...baseRunInput,
    title: "Detached edge worker",
    roleId: "explorer",
    canonicalTaskPath: "root/lifecycle:detached",
  });

  store.addMessage({
    threadId: timeoutRun.childThreadId,
    role: "user",
    content: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_USER_TEXT,
  });
  store.addMessage({
    threadId: timeoutRun.childThreadId,
    role: "assistant",
    content: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT,
  });
  store.addMessage({
    threadId: partialRun.childThreadId,
    role: "user",
    content: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_USER_TEXT,
  });
  store.addMessage({
    threadId: partialRun.childThreadId,
    role: "assistant",
    content: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT,
  });

  store.markSubagentRunStatus(timeoutRun.id, "running", { now: "2026-06-11T12:02:01.000Z" });
  const timedOutRun = store.markSubagentRunStatus(timeoutRun.id, "timed_out", {
    now: "2026-06-11T12:02:04.000Z",
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: timeoutRun.id,
      status: "timed_out",
      partial: false,
      summary: "Timed out before producing synthesis-safe output.",
      childThreadId: timeoutRun.childThreadId,
    },
  });
  const timeoutBarrier = store.createSubagentWaitBarrier({
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    childRunIds: [timeoutRun.id],
    dependencyMode: "required_all",
    failurePolicy: "degrade_partial",
    timeoutMs: 3_000,
    createdAt: "2026-06-11T12:02:01.000Z",
  });
  const timedOutBarrier = store.updateSubagentWaitBarrierStatus(timeoutBarrier.id, "timed_out", {
    now: "2026-06-11T12:02:04.000Z",
    resolutionArtifact: {
      schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
      childRunIds: [timeoutRun.id],
      childStatuses: [{ childRunId: timeoutRun.id, status: "timed_out" }],
      timedOut: true,
      synthesisAllowed: false,
      transitionEvidence: {
        schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
        kind: "child_runtime_timeout",
        source: "child_runtime",
        childRunId: timeoutRun.id,
        childRunIds: [timeoutRun.id],
        reason: "runtime_idle_timeout",
        timeoutKind: "idle",
      },
      resultArtifact: timedOutRun.resultArtifact ?? null,
    },
  });
  const timeoutParentResolution = resolveSubagentParentPolicyForWait({
    run: timedOutRun,
    waitBarrier: timedOutBarrier,
    waitTimedOut: true,
    synthesisAllowed: false,
    partial: false,
    validationReason: "Timed-out child produced no synthesis-safe result artifact.",
  });
  store.appendSubagentParentMailboxEvent({
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    parentMessageId: parentMessage.id,
    type: "subagent.wait_barrier_attention",
    payload: {
      schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
      idempotencyKey: "desktop-dogfood:lifecycle:timeout-attention",
      parentThreadId: input.parentThreadId,
      parentRunId: parentRun.id,
      parentMessageId: parentMessage.id,
      childRunId: timeoutRun.id,
      childThreadId: timeoutRun.childThreadId,
      canonicalTaskPath: timeoutRun.canonicalTaskPath,
      roleId: timeoutRun.roleId,
      waitBarrierId: timedOutBarrier.id,
      dependencyMode: timedOutBarrier.dependencyMode,
      barrierStatus: timedOutBarrier.status,
      failurePolicy: timedOutBarrier.failurePolicy,
      childRunIds: timedOutBarrier.childRunIds,
      childStatuses: [{ childRunId: timeoutRun.id, status: "timed_out" }],
      waitTimedOut: true,
      resultValidation: {
        valid: false,
        synthesisAllowed: false,
        partial: false,
        status: "timed_out",
        reason: "Timed-out child produced no synthesis-safe result artifact.",
      },
      parentResolution: timeoutParentResolution,
      allowedUserChoices: allowedUserChoicesForSubagentWaitBarrier(timeoutParentResolution),
      reason: timeoutParentResolution.reason,
      instruction: timeoutParentResolution.instruction,
      waitBarrier: {
        id: timedOutBarrier.id,
        dependencyMode: timedOutBarrier.dependencyMode,
        status: timedOutBarrier.status,
        failurePolicy: timedOutBarrier.failurePolicy,
        childRunIds: timedOutBarrier.childRunIds,
      },
    },
    idempotencyKey: "desktop-dogfood:lifecycle:timeout-attention",
    createdAt: "2026-06-11T12:02:05.000Z",
  });

  store.markSubagentRunStatus(partialRun.id, "running", { now: "2026-06-11T12:02:06.000Z" });
  store.markSubagentRunStatus(partialRun.id, "aborted_partial", {
    now: "2026-06-11T12:02:08.000Z",
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: partialRun.id,
      status: "aborted_partial",
      partial: true,
      summary: "Partial recovery summary retained; missing child evidence remains unavailable.",
      childThreadId: partialRun.childThreadId,
    },
  });
  const partialBarrier = store.createSubagentWaitBarrier({
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    childRunIds: [partialRun.id],
    dependencyMode: "required_all",
    failurePolicy: "degrade_partial",
    timeoutMs: 5_000,
    createdAt: "2026-06-11T12:02:06.000Z",
  });
  await executeSubagentBarrierDecision({
    store,
    barrier: partialBarrier,
    decision: "continue_with_partial",
    userDecision: "User approved a partial parent continuation from durable partial evidence.",
    partialSummary: "Use the partial recovery summary and explicitly label unavailable child work.",
    idempotencyKey: "desktop-dogfood:lifecycle:partial-decision",
    toolCallId: "desktop-dogfood-lifecycle-partial-tool-call",
    now: "2026-06-11T12:02:09.000Z",
    createRuntimeCancelEventEmitter: (run) => (event) => store.appendSubagentRunEvent(run.id, {
      type: `subagent.runtime.${event.type}`,
      preview: event,
      createdAt: event.createdAt,
    }),
  });

  store.markSubagentRunStatus(retryRun.id, "running", { now: "2026-06-11T12:02:10.000Z" });
  store.markSubagentRunStatus(retryRun.id, "failed", {
    now: "2026-06-11T12:02:11.000Z",
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: retryRun.id,
      status: "failed",
      partial: false,
      summary: "First retryable attempt failed; parent explicitly requested a retry instead of synthesizing.",
      childThreadId: retryRun.childThreadId,
    },
  });
  const retryBarrier = store.createSubagentWaitBarrier({
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    childRunIds: [retryRun.id],
    dependencyMode: "required_all",
    failurePolicy: "ask_user",
    timeoutMs: 8_000,
    createdAt: "2026-06-11T12:02:10.000Z",
  });
  store.updateSubagentWaitBarrierStatus(retryBarrier.id, "failed", {
    now: "2026-06-11T12:02:11.000Z",
    resolutionArtifact: {
      schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
      childRunIds: [retryRun.id],
      childStatuses: [{ childRunId: retryRun.id, status: "failed" }],
      timedOut: false,
      synthesisAllowed: false,
      transitionEvidence: {
        schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
        kind: "child_terminal",
        source: "wait_agent",
        childRunId: retryRun.id,
        childRunIds: [retryRun.id],
        reason: "First retryable attempt failed",
      },
    },
  });
  const retryDecision = await executeSubagentBarrierDecision({
    store,
    barrier: retryBarrier,
    runtime: {
      retryChildRun: ({ run, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent }) => {
        markMailboxDelivered("2026-06-11T12:02:12.100Z");
        emitEvent({
          type: "status",
          source: "retry_child",
          status: "running",
          message: "Retry child session accepted; parent remains blocked on this child.",
          createdAt: "2026-06-11T12:02:12.150Z",
          details: {
            mailboxEventId: mailboxEvent.id,
            lifecycleEdge: "retry_child",
          },
        });
        const retrying = store.markSubagentRunStatus(run.id, "running", {
          now: "2026-06-11T12:02:12.200Z",
        });
        const consumed = markMailboxConsumed("2026-06-11T12:02:12.250Z");
        return {
          accepted: true,
          run: retrying,
          mailboxEvent: consumed,
        };
      },
    },
    decision: "retry_child",
    userDecision: "Retry this failed child before parent synthesis; keep the parent blocked.",
    idempotencyKey: "desktop-dogfood:lifecycle:retry-decision",
    toolCallId: "desktop-dogfood-lifecycle-retry-tool-call",
    now: "2026-06-11T12:02:12.000Z",
    createRuntimeCancelEventEmitter: (run) => (event) => store.appendSubagentRunEvent(run.id, {
      type: `subagent.runtime.${event.type}`,
      preview: event,
      createdAt: event.createdAt,
    }),
    createRuntimeRetryEventEmitter: (run) => (event) => store.appendSubagentRunEvent(run.id, {
      type: `subagent.runtime.${event.type}`,
      preview: event,
      createdAt: event.createdAt,
    }),
  });

  store.markSubagentRunStatus(detachRun.id, "running", { now: "2026-06-11T12:02:13.000Z" });
  const detachBarrier = store.createSubagentWaitBarrier({
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    childRunIds: [detachRun.id],
    dependencyMode: "required_all",
    failurePolicy: "ask_user",
    timeoutMs: 8_000,
    createdAt: "2026-06-11T12:02:13.000Z",
  });
  await executeSubagentBarrierDecision({
    store,
    barrier: detachBarrier,
    decision: "detach_child",
    userDecision: "Detach the child and keep its thread inspectable outside parent synthesis.",
    idempotencyKey: "desktop-dogfood:lifecycle:detach-decision",
    toolCallId: "desktop-dogfood-lifecycle-detach-tool-call",
    now: "2026-06-11T12:02:15.000Z",
    createRuntimeCancelEventEmitter: (run) => (event) => store.appendSubagentRunEvent(run.id, {
      type: `subagent.runtime.${event.type}`,
      preview: event,
      createdAt: event.createdAt,
    }),
  });

  return {
    parentMessageId: parentMessage.id,
    childRunIds: [timeoutRun.id, partialRun.id, retryRun.id, detachRun.id],
    childThreadIds: [timeoutRun.childThreadId, partialRun.childThreadId, retryRun.childThreadId, detachRun.childThreadId],
    waitBarrierIds: [timedOutBarrier.id, partialBarrier.id, retryDecision.barrier.id, detachBarrier.id],
  };
}

function seedParentStopCascadeCluster(
  store: ProjectStore,
  input: {
    parentThreadId: string;
    featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
    modelRuntimeSnapshot: ReturnType<typeof createAmbientModelRuntimeSnapshot>;
  },
): {
  parentMessageId: string;
  parentMailboxEventId: string;
  childRunIds: string[];
  childThreadIds: string[];
  waitBarrierIds: string[];
  cancelledRunIds: string[];
  detachedRunIds: string[];
  unchangedRunIds: string[];
  cancelledWaitBarrierIds: string[];
  cancelledMailboxEventIds: string[];
} {
  const parentMessage = store.addMessage({
    threadId: input.parentThreadId,
    role: "assistant",
    content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_CASCADE_PARENT_ASSISTANT_TEXT,
  });
  const parentRun = store.startRun({ threadId: input.parentThreadId, assistantMessageId: parentMessage.id });
  const baseRunInput = {
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    parentMessageId: parentMessage.id,
    featureFlagSnapshot: input.featureFlagSnapshot,
    modelRuntimeSnapshot: input.modelRuntimeSnapshot,
  };

  const requiredRun = store.createSubagentRun({
    ...baseRunInput,
    title: "Parent-stop required worker",
    roleId: "reviewer",
    canonicalTaskPath: "root/parent-stop:required",
    dependencyMode: "required",
  });
  const backgroundRun = store.createSubagentRun({
    ...baseRunInput,
    title: "Parent-stop background worker",
    roleId: "explorer",
    canonicalTaskPath: "root/parent-stop:background",
    dependencyMode: "optional_background",
  });
  const completedRun = store.createSubagentRun({
    ...baseRunInput,
    title: "Parent-stop completed worker",
    roleId: "summarizer",
    canonicalTaskPath: "root/parent-stop:completed",
    dependencyMode: "required",
  });

  store.addMessage({
    threadId: requiredRun.childThreadId,
    role: "user",
    content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_USER_TEXT,
  });
  store.addMessage({
    threadId: requiredRun.childThreadId,
    role: "assistant",
    content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_ASSISTANT_TEXT,
  });
  store.addMessage({
    threadId: backgroundRun.childThreadId,
    role: "user",
    content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_USER_TEXT,
  });
  store.addMessage({
    threadId: backgroundRun.childThreadId,
    role: "assistant",
    content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_ASSISTANT_TEXT,
  });
  store.addMessage({
    threadId: completedRun.childThreadId,
    role: "user",
    content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_USER_TEXT,
  });
  store.addMessage({
    threadId: completedRun.childThreadId,
    role: "assistant",
    content: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_ASSISTANT_TEXT,
  });

  store.markSubagentRunStatus(requiredRun.id, "running", { now: "2026-06-11T12:03:01.000Z" });
  store.markSubagentRunStatus(backgroundRun.id, "running", { now: "2026-06-11T12:03:02.000Z" });
  store.markSubagentRunStatus(completedRun.id, "completed", {
    now: "2026-06-11T12:03:03.000Z",
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: completedRun.id,
      status: "completed",
      partial: false,
      summary: "Completed before the parent stop; left unchanged by the cascade.",
      childThreadId: completedRun.childThreadId,
    },
  });

  const waitBarrier = store.createSubagentWaitBarrier({
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    childRunIds: [requiredRun.id, completedRun.id],
    dependencyMode: "required_all",
    failurePolicy: "ask_user",
    timeoutMs: 9_000,
    createdAt: "2026-06-11T12:03:04.000Z",
  });
  store.appendSubagentMailboxEvent(requiredRun.id, {
    direction: "parent_to_child",
    type: "subagent.task",
    payload: { task: "Continue reading while the parent is still active." },
    createdAt: "2026-06-11T12:03:05.000Z",
  });
  store.appendSubagentMailboxEvent(requiredRun.id, {
    direction: "parent_to_child",
    type: "subagent.followup",
    payload: { message: "Report back before parent synthesis." },
    deliveryState: "delivered",
    createdAt: "2026-06-11T12:03:06.000Z",
    deliveredAt: "2026-06-11T12:03:06.500Z",
  });
  store.appendSubagentMailboxEvent(backgroundRun.id, {
    direction: "parent_to_child",
    type: "subagent.task",
    payload: { task: "Optional background work may detach if the parent stops." },
    createdAt: "2026-06-11T12:03:07.000Z",
  });

  const cascade = store.cascadeSubagentParentRunStopped({
    parentThreadId: input.parentThreadId,
    parentRunId: parentRun.id,
    reason: "User stopped the parent turn while child work was still active.",
    featureFlagSnapshot: input.featureFlagSnapshot,
    now: "2026-06-11T12:03:08.000Z",
  });
  if (!cascade.parentMailboxEventId) {
    throw new Error("Desktop dogfood parent-stop cascade expected a parent mailbox event.");
  }

  return {
    parentMessageId: parentMessage.id,
    parentMailboxEventId: cascade.parentMailboxEventId,
    childRunIds: [requiredRun.id, backgroundRun.id, completedRun.id],
    childThreadIds: [requiredRun.childThreadId, backgroundRun.childThreadId, completedRun.childThreadId],
    waitBarrierIds: [waitBarrier.id],
    cancelledRunIds: cascade.cancelledRunIds,
    detachedRunIds: cascade.detachedRunIds,
    unchangedRunIds: cascade.unchangedRunIds,
    cancelledWaitBarrierIds: cascade.cancelledWaitBarrierIds,
    cancelledMailboxEventIds: cascade.cancelledMailboxEventIds,
  };
}

function seedMultiClusterStress(
  store: ProjectStore,
  input: {
    parentThreadId: string;
    featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
    modelRuntimeSnapshot: ReturnType<typeof createAmbientModelRuntimeSnapshot>;
  },
): {
  parentMessageIds: string[];
  childRunIds: string[];
  childThreadIds: string[];
} {
  const parentMessageIds: string[] = [];
  const childRunIds: string[] = [];
  const childThreadIds: string[] = [];
  const childStates = ["running", "completed", "needs_attention"] as const;
  const roleIds = ["explorer", "summarizer", "reviewer"] as const;

  for (let parentIndex = 0; parentIndex < 2; parentIndex += 1) {
    const parentMessage = store.addMessage({
      threadId: input.parentThreadId,
      role: "assistant",
      content: `${SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX} ${parentIndex + 1}: three child threads remain inspectable while collapsed.`,
    });
    const parentRun = store.startRun({ threadId: input.parentThreadId, assistantMessageId: parentMessage.id });
    parentMessageIds.push(parentMessage.id);

    for (let childIndex = 0; childIndex < childStates.length; childIndex += 1) {
      const state = childStates[childIndex];
      const title = `Stress worker ${parentIndex + 1}.${childIndex + 1}`;
      const run = store.createSubagentRun({
        parentThreadId: input.parentThreadId,
        parentRunId: parentRun.id,
        parentMessageId: parentMessage.id,
        title,
        roleId: roleIds[childIndex],
        canonicalTaskPath: `root/stress-${parentIndex + 1}:${childIndex + 1}`,
        featureFlagSnapshot: input.featureFlagSnapshot,
        modelRuntimeSnapshot: input.modelRuntimeSnapshot,
        dependencyMode: childIndex === 0 ? "required" : "optional_background",
      });
      childRunIds.push(run.id);
      childThreadIds.push(run.childThreadId);
      store.markSubagentRunStatus(run.id, state, {
        now: `2026-06-11T12:01:${String((parentIndex * 10) + childIndex).padStart(2, "0")}.000Z`,
        ...(state === "completed"
          ? {
              resultArtifact: {
                schemaVersion: "ambient-subagent-result-artifact-v1",
                runId: run.id,
                status: "completed",
                partial: false,
                summary: `${title} completed during Desktop stress dogfood.`,
                childThreadId: run.childThreadId,
              },
            }
          : {}),
      });
    }
  }

  return { parentMessageIds, childRunIds, childThreadIds };
}

async function seedMutatingWorkerWorkflowTask(
  store: ProjectStore,
  workspacePath: string,
  input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId: string;
    childRunId: string;
    childThreadId: string;
    childCanonicalTaskPath: string;
    featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
  },
): Promise<{
  taskId: string;
  artifactId: string;
  runId: string;
  threadId: string;
  parentWorkspaceUnchanged: boolean;
}> {
  const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: input.featureFlagSnapshot });
  const descriptor = parentPiVisibleCallableWorkflowTools(registry)
    .find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[5]));
  if (!descriptor) throw new Error("Missing Symphony Self-Healing Loop callable workflow descriptor for Desktop dogfood.");

  const childWorktreePath = join(workspacePath, ".ambient-codex", "worktrees", "desktop-dogfood-review-worker");
  const parentStagedPath = join(workspacePath, SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH);
  const childStagedPath = join(childWorktreePath, SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH);
  const reportPath = join(childWorktreePath, SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH);
  const sourcePath = join(childWorktreePath, SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_SOURCE_RELATIVE_PATH);
  const statePath = join(childWorktreePath, SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_STATE_RELATIVE_PATH);
  await mkdir(dirname(parentStagedPath), { recursive: true });
  await mkdir(dirname(childStagedPath), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(parentStagedPath, "parent workspace original\n", "utf8");
  await writeFile(childStagedPath, "child worktree staged change\n", "utf8");
  await writeFile(
    reportPath,
    [
      "# Desktop dogfood mutating worker",
      "",
      `- staged: ${SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH}`,
      "- approval: child_bridge_policy / this_child_thread",
      "- worktree: active isolated child worktree",
      "- parent workspace unchanged: true",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(sourcePath, "export const workflow = 'desktop dogfood mutating worker';\n", "utf8");
  await writeFile(statePath, `${JSON.stringify({ status: "succeeded", mutation: "staged" }, null, 2)}\n`, "utf8");
  store.setThreadWorktree({
    threadId: input.childThreadId,
    projectRoot: workspacePath,
    worktreePath: childWorktreePath,
    branchName: "ambient/desktop-dogfood-mutating-worker",
    baseRef: "desktop-dogfood-base",
    upstream: "origin/main",
    status: "active",
    createdAt: "2026-06-11T12:00:24.000Z",
    updatedAt: "2026-06-11T12:00:24.000Z",
  });

  const childMessage = store.addMessage({
    threadId: input.childThreadId,
    role: "assistant",
    content: "Review worker launched a child-scoped mutating workflow in its isolated worktree.",
  });
  const childThreadRun = store.startRun({
    threadId: input.childThreadId,
    assistantMessageId: childMessage.id,
  });
  const executionPlan = buildCallableWorkflowExecutionPlan({
    descriptor,
    runPlan: buildCallableWorkflowRunPlan(descriptor, {
      goal: "Stage a safe child-originated mutation proof for Desktop dogfood.",
      blocking: false,
      metricCriteria: [
        {
          templateId: "self_healing_loop-metric",
          value: "The staged file appears only in the isolated child worktree and the parent workspace sentinel is unchanged.",
        },
      ],
    }),
    parent: {
      threadId: input.parentThreadId,
      runId: input.parentRunId,
      assistantMessageId: input.parentMessageId,
    },
    toolCallId: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_TOOL_CALL_ID,
    callerProvenance: {
      kind: "subagent_child_thread",
      threadId: input.childThreadId,
      runId: childThreadRun.id,
      messageId: childMessage.id,
      subagentRunId: input.childRunId,
      canonicalTaskPath: input.childCanonicalTaskPath,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      approval: {
        required: true,
        source: "child_bridge_policy",
        failureHandling: "forward approval to parent",
        scopeHint: "this_child_thread",
      },
      worktree: {
        required: true,
        isolated: true,
        status: "active",
        workspacePath,
        worktreePath: childWorktreePath,
        branchName: "ambient/desktop-dogfood-mutating-worker",
      },
      nestedFanout: {
        required: true,
        source: "child_bridge_policy",
      },
    } satisfies CallableWorkflowCallerProvenance,
    createdAt: "2026-06-11T12:00:25.000Z",
  });
  const queued = store.enqueueCallableWorkflowTask({
    executionPlan,
    featureFlagSnapshot: input.featureFlagSnapshot,
    createdAt: "2026-06-11T12:00:25.000Z",
  });
  store.beginCallableWorkflowTaskCompilerHandoff(queued.id, {
    createdAt: "2026-06-11T12:00:26.000Z",
  });
  const artifact = store.createWorkflowArtifact({
    id: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID,
    title: "Desktop Dogfood Mutating Worker",
    status: "ready_for_preview",
    manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
    spec: {
      goal: "Stage a safe child-originated mutation proof for Desktop dogfood.",
      summary: "Mutating child workflow artifact seeded for full Desktop dogfood.",
    },
    sourcePath,
    statePath,
  });
  store.linkCallableWorkflowTaskArtifact({
    id: queued.id,
    workflowArtifactId: artifact.id,
    createdAt: "2026-06-11T12:00:27.000Z",
  });
  const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
  store.markCallableWorkflowTaskRunStarted({
    id: queued.id,
    workflowRunId: run.id,
    createdAt: "2026-06-11T12:00:28.000Z",
  });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "step.start",
    message: "Prepare isolated child mutation",
    graphNodeId: "stage-mutation",
    createdAt: "2026-06-11T12:00:29.000Z",
  });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "step.end",
    message: "Child worktree staged file and retained report",
    graphNodeId: "stage-mutation",
    data: { usage: { costMicros: 7 } },
    createdAt: "2026-06-11T12:00:30.000Z",
  });
  store.recordWorkflowModelCall({
    runId: run.id,
    task: "desktop-dogfood.mutating-worker",
    status: "succeeded",
    input: { goal: "Stage child worktree mutation proof." },
    output: { summary: "Staged child worktree mutation without changing parent workspace." },
    startedAt: "2026-06-11T12:00:30.000Z",
    completedAt: "2026-06-11T12:00:31.000Z",
  });
  const finishedRun = store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
  store.markCallableWorkflowTaskRunFinished({
    id: queued.id,
    workflowRunId: finishedRun.id,
    runStatus: finishedRun.status,
    createdAt: "2026-06-11T12:00:32.000Z",
  });
  store.appendWorkflowRunEvent({
    runId: finishedRun.id,
    type: "mutation.stage",
    message: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE,
    graphNodeId: "stage-mutation",
    data: {
      stagedRelativePath: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH,
      reportRelativePath: SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH,
      parentWorkspaceUnchanged: true,
      previewTruncated: true,
    },
    createdAt: "2026-06-11T12:00:33.000Z",
  });

  const parentWorkspaceUnchanged = await readFile(parentStagedPath, "utf8") === "parent workspace original\n";
  return {
    taskId: queued.id,
    artifactId: artifact.id,
    runId: finishedRun.id,
    threadId: artifact.workflowThreadId ?? "",
    parentWorkspaceUnchanged,
  };
}

function seedDeniedScopeExplanation(
  store: ProjectStore,
  input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId: string;
  },
) {
  return store.appendSubagentParentMailboxEvent({
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    parentMessageId: input.parentMessageId,
    type: "subagent.spawn_failed",
    payload: {
      schemaVersion: "ambient-subagent-spawn-failure-v1",
      phase: "phase-2-pi-tool-surface",
      failureStage: "tool_scope",
      approvalMode: "non_interactive",
      approvalUnavailable: true,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      parentMessageId: input.parentMessageId,
      childRunId: SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID,
      childThreadId: SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID,
      canonicalTaskPath: "root/2:connector-denied",
      toolCallId: SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_TOOL_CALL_ID,
      idempotencyKey: "desktop-dogfood:denied-scope:gmail-search",
      taskPreview: "Try to use Gmail search from a child thread without a connector bridge.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      status: "failed",
      reason: "Requested sub-agent tool scope was denied.",
      toolScopeSnapshot: {
        schemaVersion: "ambient-subagent-tool-scope-v1",
        approvalMode: "non_interactive",
        loadedCategories: ["workspace.read"],
        piVisibleCategories: ["workspace.read"],
        deniedCategories: [
          {
            id: "connector.read",
            reason: "Desktop dogfood keeps connector access denied for child threads.",
          },
        ],
        loadedTools: [
          {
            source: "built_in",
            id: "file_read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          },
        ],
        piVisibleTools: [
          {
            source: "built_in",
            id: "file_read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          },
        ],
        deniedTools: [
          {
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: "Desktop dogfood keeps connector access denied for child threads.",
          },
        ],
      },
    },
    idempotencyKey: "desktop-dogfood:denied-scope:gmail-search",
    createdAt: "2026-06-11T12:00:23.000Z",
  });
}

async function seedCallableWorkflowTask(
  store: ProjectStore,
  workspacePath: string,
  input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId: string;
    mapperChildRunId: string;
    mapperChildThreadId: string;
    reducerChildRunId: string;
    reducerChildThreadId: string;
    featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
  },
): Promise<{
  taskId: string;
  artifactId: string;
  sourceRelativePath: string;
  stateRelativePath: string;
  sourceContent: string;
  runId: string;
  threadId: string;
  parentMailboxEventId: string;
}> {
  const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: input.featureFlagSnapshot });
  const descriptor = parentPiVisibleCallableWorkflowTools(registry)
    .find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
  if (!descriptor) throw new Error("Missing Symphony Map-Reduce callable workflow descriptor for Desktop dogfood.");

  const executionPlan = buildCallableWorkflowExecutionPlan({
    descriptor,
    runPlan: buildCallableWorkflowRunPlan(descriptor, {
      goal: "Summarize Desktop dogfood workflow evidence and preserve parent-blocking status.",
      blocking: true,
      metricCriteria: [
        {
          templateId: "map_reduce-metric",
          value: "Every mapped Desktop evidence item has reducer evidence before parent synthesis.",
        },
      ],
    }),
    parent: {
      threadId: input.parentThreadId,
      runId: input.parentRunId,
      assistantMessageId: input.parentMessageId,
    },
    toolCallId: SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_TOOL_CALL_ID,
    createdAt: "2026-06-11T12:00:15.000Z",
  });
  const queued = store.enqueueCallableWorkflowTask({
    executionPlan,
    featureFlagSnapshot: input.featureFlagSnapshot,
    patternGraphSnapshot: buildPatternGraphSnapshot({
      patternId: SYMPHONY_WORKFLOW_PATTERN_IDS[0],
      parentThreadId: input.parentThreadId,
      parentMessageId: input.parentMessageId,
      workflowTaskId: executionPlan.launchId,
      updatedAt: "2026-06-11T12:00:15.000Z",
      maxVisibleChildrenPerRole: 1,
      childBindings: [
        {
          roleNodeId: "mapper",
          childRunId: input.mapperChildRunId,
          childThreadId: input.mapperChildThreadId,
          label: "Review worker",
          status: "needs_attention",
          approvalState: "pending",
          blockingParent: true,
          summary: "Waiting for parent-scoped approval before continuing.",
        },
        {
          roleNodeId: "mapper",
          childRunId: SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_RUN_ID,
          childThreadId: SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_THREAD_ID,
          label: SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_LABEL,
          status: "completed",
          approvalState: "none",
          blockingParent: false,
          summary: "Grouped mapper evidence remains available through the overflow expander.",
        },
        {
          roleNodeId: "reducer",
          childRunId: input.reducerChildRunId,
          childThreadId: input.reducerChildThreadId,
          label: "Context summarizer",
          status: "completed",
          approvalState: "none",
          blockingParent: false,
          summary: "Background context summary is available.",
        },
      ],
    }),
    createdAt: "2026-06-11T12:00:15.000Z",
  });
  store.beginCallableWorkflowTaskCompilerHandoff(queued.id, {
    createdAt: "2026-06-11T12:00:16.000Z",
  });

  const workflowDir = join(workspacePath, ".ambient-codex", "workflows", "desktop-dogfood-map-reduce");
  await mkdir(workflowDir, { recursive: true });
  const sourcePath = join(workspacePath, SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH);
  const statePath = join(workspacePath, SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH);
  await writeFile(sourcePath, SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT, "utf8");
  await writeFile(statePath, `${JSON.stringify({ status: "running", evidence: "desktop-dogfood" }, null, 2)}\n`, "utf8");

  const artifact = store.createWorkflowArtifact({
    id: SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID,
    title: "Desktop Dogfood Symphony Map-Reduce",
    status: "ready_for_preview",
    manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
    spec: {
      goal: "Summarize Desktop dogfood workflow evidence and preserve parent-blocking status.",
      summary: "Callable workflow artifact seeded for full Desktop dogfood.",
    },
    sourcePath,
    statePath,
  });
  store.linkCallableWorkflowTaskArtifact({
    id: queued.id,
    workflowArtifactId: artifact.id,
    createdAt: "2026-06-11T12:00:17.000Z",
  });
  const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
  store.markCallableWorkflowTaskRunStarted({
    id: queued.id,
    workflowRunId: run.id,
    createdAt: "2026-06-11T12:00:18.000Z",
  });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "step.start",
    message: "Map Desktop dogfood evidence",
    graphNodeId: "map-evidence",
    createdAt: "2026-06-11T12:00:19.000Z",
  });
  store.appendWorkflowRunEvent({
    runId: run.id,
    type: "step.end",
    message: "Reducer waiting on workflow evidence",
    graphNodeId: "map-evidence",
    data: { usage: { costMicros: 19 } },
    createdAt: "2026-06-11T12:00:20.000Z",
  });
  store.recordWorkflowModelCall({
    runId: run.id,
    task: "desktop-dogfood.workflow-evidence",
    status: "succeeded",
    input: { goal: "Summarize Desktop dogfood workflow evidence." },
    output: { summary: "Mapped Desktop workflow evidence; reducer is waiting." },
    cacheCheckpoint: {
      id: "desktop-dogfood-workflow-cache",
      stage: "runtime_call",
      workflowThreadId: artifact.workflowThreadId ?? "desktop-dogfood-workflow-thread",
      stablePrefixHash: "desktop-dogfood-stable-prefix",
      stablePrefixChars: 240,
      stablePrefixEstimatedTokens: 60,
      mutableSuffixHash: "desktop-dogfood-mutable-suffix",
      mutableSuffixChars: 144,
      mutableSuffixEstimatedTokens: 36,
      requestHash: "desktop-dogfood-request",
      requestEstimatedTokens: 96,
      boundaryLabel: "Desktop dogfood workflow runtime boundary",
      createdAt: "2026-06-11T12:00:21.000Z",
    },
    startedAt: "2026-06-11T12:00:20.000Z",
    completedAt: "2026-06-11T12:00:21.000Z",
  });

  const runningTask = store.getCallableWorkflowTask(queued.id);
  const block = resolveCallableWorkflowParentBlocking({ tasks: [runningTask] });
  if (!block) throw new Error("Expected running blocking workflow task to block parent finalization.");
  const mailboxEvent = store.appendSubagentParentMailboxEvent({
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    parentMessageId: input.parentMessageId,
    type: CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
    payload: {
      ...block,
      allowedUserChoices: callableWorkflowParentBlockingAllowedUserChoices(block),
    },
    idempotencyKey: callableWorkflowParentBlockingIdempotencyKey({
      parentRunId: input.parentRunId,
      block,
    }),
    createdAt: "2026-06-11T12:00:22.000Z",
  });

  return {
    taskId: runningTask.id,
    artifactId: artifact.id,
    sourceRelativePath: SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH,
    stateRelativePath: SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH,
    sourceContent: SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT,
    runId: run.id,
    threadId: artifact.workflowThreadId ?? "",
    parentMailboxEventId: mailboxEvent.id,
  };
}

async function seedWorkflowHighLoadStress(
  store: ProjectStore,
  workspacePath: string,
  input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId: string;
    featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
  },
): Promise<{
  taskIds: string[];
  artifactIds: string[];
  runIds: string[];
  threadIds: string[];
  patternLabels: string[];
}> {
  const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: input.featureFlagSnapshot });
  const tools = parentPiVisibleCallableWorkflowTools(registry);
  const taskIds: string[] = [];
  const artifactIds: string[] = [];
  const runIds: string[] = [];
  const threadIds: string[] = [];

  for (const [index, patternId] of HIGH_LOAD_WORKFLOW_PATTERN_IDS.entries()) {
    const descriptor = tools.find((tool) => tool.name === callableWorkflowToolName(patternId));
    if (!descriptor) throw new Error(`Missing Symphony ${patternId} callable workflow descriptor for Desktop high-load dogfood.`);
    if (descriptor.sourceContext.kind !== "symphony_recipe") {
      throw new Error(`Desktop high-load dogfood expected Symphony source context for ${descriptor.name}.`);
    }
    const createdAt = dogfoodTimestamp(24 + index * 5);
    const executionPlan = buildCallableWorkflowExecutionPlan({
      descriptor,
      runPlan: buildCallableWorkflowRunPlan(descriptor, {
        goal: `Exercise ${descriptor.label} as part of Desktop high-load workflow dogfood.`,
        blocking: false,
        metricCriteria: descriptor.sourceContext.metricTemplates.map((template) => ({
          templateId: template.id,
          value: `${descriptor.label} remains visible, attributed, and layout-safe in the high-load workflow cluster.`,
        })),
      }),
      parent: {
        threadId: input.parentThreadId,
        runId: input.parentRunId,
        assistantMessageId: input.parentMessageId,
      },
      toolCallId: `desktop-dogfood-workflow-high-load-${patternId}-tool-call`,
      createdAt,
    });
    const queued = store.enqueueCallableWorkflowTask({
      executionPlan,
      featureFlagSnapshot: input.featureFlagSnapshot,
      createdAt,
    });
    store.beginCallableWorkflowTaskCompilerHandoff(queued.id, {
      createdAt: dogfoodTimestamp(25 + index * 5),
    });

    const workflowRelativeDir = `.ambient-codex/workflows/desktop-dogfood-high-load-${patternId}`;
    const workflowDir = join(workspacePath, workflowRelativeDir);
    await mkdir(workflowDir, { recursive: true });
    const sourcePath = join(workflowDir, "main.ts");
    const statePath = join(workflowDir, "state.json");
    await writeFile(sourcePath, `export const workflow = 'desktop dogfood high load ${patternId}';\n`, "utf8");
    await writeFile(statePath, `${JSON.stringify({ status: "succeeded", patternId }, null, 2)}\n`, "utf8");

    const artifact = store.createWorkflowArtifact({
      id: `desktop-dogfood-high-load-${patternId}-artifact`,
      title: `Desktop Dogfood ${descriptor.label}`,
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: {
        goal: `Exercise ${descriptor.label} as part of Desktop high-load workflow dogfood.`,
        summary: "High-load callable workflow artifact seeded for full Desktop dogfood.",
      },
      sourcePath,
      statePath,
    });
    store.linkCallableWorkflowTaskArtifact({
      id: queued.id,
      workflowArtifactId: artifact.id,
      createdAt: dogfoodTimestamp(26 + index * 5),
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    store.markCallableWorkflowTaskRunStarted({
      id: queued.id,
      workflowRunId: run.id,
      createdAt: dogfoodTimestamp(27 + index * 5),
    });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.start",
      message: `${descriptor.label} high-load workflow started`,
      graphNodeId: `high-load-${patternId}`,
      createdAt: dogfoodTimestamp(28 + index * 5),
    });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.end",
      message: `${descriptor.label} high-load workflow completed`,
      graphNodeId: `high-load-${patternId}`,
      data: { usage: { costMicros: 5 + index } },
      createdAt: dogfoodTimestamp(29 + index * 5),
    });
    store.recordWorkflowModelCall({
      runId: run.id,
      task: `desktop-dogfood.high-load.${patternId}`,
      status: "succeeded",
      input: { goal: `High-load ${descriptor.label}` },
      output: { summary: `${descriptor.label} remained visible in the high-load workflow cluster.` },
      startedAt: dogfoodTimestamp(29 + index * 5),
      completedAt: dogfoodTimestamp(30 + index * 5),
    });
    const finishedRun = store.updateWorkflowRun({
      id: run.id,
      status: "succeeded",
      finish: true,
    });
    const finishedTask = store.markCallableWorkflowTaskRunFinished({
      id: queued.id,
      workflowRunId: finishedRun.id,
      runStatus: "succeeded",
      createdAt: dogfoodTimestamp(31 + index * 5),
    });

    taskIds.push(finishedTask.id);
    artifactIds.push(artifact.id);
    runIds.push(finishedRun.id);
    threadIds.push(artifact.workflowThreadId ?? "");
  }

  return {
    taskIds,
    artifactIds,
    runIds,
    threadIds,
    patternLabels: [...SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS],
  };
}

function dogfoodTimestamp(secondsAfterFixedNow: number): string {
  return new Date(Date.parse(SUBAGENT_DESKTOP_DOGFOOD_FIXED_NOW) + secondsAfterFixedNow * 1000).toISOString();
}

const gib = 1024 ** 3;
const localRuntimeProfileId = `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}`;

async function seedLocalRuntimeOwnership(
  workspacePath: string,
  input: {
    parentThreadId: string;
    childRunId: string;
    childThreadId: string;
    pid: number;
  },
) {
  const localRuntimeAcquiredAt = new Date().toISOString();
  const stateDir = join(workspacePath, ".ambient/local-model-runtime", SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID);
  await mkdir(stateDir, { recursive: true });
  const runtimeState = {
    schemaVersion: "ambient-local-model-runtime-state-v1",
    runtimeId: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID,
    providerId: AMBIENT_PROVIDER_LOCAL,
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    profileId: localRuntimeProfileId,
    pid: input.pid,
    status: "running",
    command: ["dogfood-local-runtime-placeholder", "--port", "43123"],
    cwd: workspacePath,
    stateDir,
    stdoutPath: join(stateDir, "runtime.stdout.log"),
    stderrPath: join(stateDir, "runtime.stderr.log"),
    startedAt: localRuntimeAcquiredAt,
    lastUsedAt: localRuntimeAcquiredAt,
    idleTimeoutMs: 300_000,
    healthUrl: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ENDPOINT,
    parentThreadId: input.parentThreadId,
    subagentThreadId: input.childThreadId,
    subagentRunId: input.childRunId,
    ownerDisplayName: "Review worker",
    estimatedResidentMemoryBytes: 6 * gib,
    actualResidentMemoryBytes: 5 * gib,
    memorySampledAt: localRuntimeAcquiredAt,
  };
  const lease: LocalRuntimeLeaseRecord = {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID,
    parentThreadId: input.parentThreadId,
    subagentThreadId: input.childThreadId,
    subagentRunId: input.childRunId,
    ownerDisplayName: "Review worker",
    modelRuntimeId: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID,
    modelProfileId: localRuntimeProfileId,
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    providerId: AMBIENT_PROVIDER_LOCAL,
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * gib,
    actualResidentMemoryBytes: 5 * gib,
    pid: input.pid,
    endpoint: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ENDPOINT,
    acquiredAt: localRuntimeAcquiredAt,
    lastHeartbeatAt: localRuntimeAcquiredAt,
    status: "running",
  };
  await writeFile(join(stateDir, "runtime-state.json"), `${JSON.stringify(runtimeState, null, 2)}\n`, "utf8");
  await writeFile(join(stateDir, "runtime-leases.json"), `${JSON.stringify({
    schemaVersion: "ambient-local-runtime-lease-journal-v1",
    runtimeId: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID,
    updatedAt: localRuntimeAcquiredAt,
    leases: [lease],
  }, null, 2)}\n`, "utf8");
}

function requireDogfoodEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for sub-agent Desktop dogfood seeding.`);
  return value;
}

function requirePositiveIntegerDogfoodEnv(name: string): number {
  const value = Number(requireDogfoodEnv(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer for sub-agent Desktop dogfood seeding.`);
  }
  return value;
}
