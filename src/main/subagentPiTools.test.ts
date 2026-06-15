import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  createAmbientModelRuntimeSnapshot,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../shared/subagentCapacity";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import type { ThreadSummary, ThreadWorktreeSummary } from "../shared/types";
import { createAgentRoleRegistry } from "./agentRoleRegistry";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  parentPiVisibleCallableWorkflowTools,
} from "./callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import { ProjectStore } from "./projectStore";
import {
  AMBIENT_SUBAGENT_TOOL_NAME,
  ambientSubagentActiveToolNamesForThread,
  createSubagentPiToolDefinitions,
} from "./subagentPiTools";
import { subagentStructuredResultTemplate } from "./subagentStructuredOutput";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-subagent-pi-tools-"));
  roots.push(root);
  return join(root, "workspace");
}

function executeTool(
  tool: ToolDefinition<any, any, any>,
  toolCallId: string,
  params: Record<string, unknown>,
  onUpdate?: Parameters<ToolDefinition<any, any, any>["execute"]>[3],
): Promise<AgentToolResult<any>> {
  return tool.execute(toolCallId, params, undefined, onUpdate, {} as any);
}

const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" });
const enabledFlags = resolveAmbientFeatureFlags({
  startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
  generatedAt: "2026-06-05T00:00:00.000Z",
});

describe("sub-agent Pi tool catalog gating", () => {
  it("exposes ambient_subagent only for enabled parent chat threads", () => {
    const parent = { kind: "chat" } as ThreadSummary;
    const child = { kind: "subagent_child" } as ThreadSummary;

    expect(ambientSubagentActiveToolNamesForThread(parent, disabledFlags)).toEqual([]);
    expect(ambientSubagentActiveToolNamesForThread(parent, enabledFlags)).toEqual([AMBIENT_SUBAGENT_TOOL_NAME]);
    expect(ambientSubagentActiveToolNamesForThread(child, enabledFlags)).toEqual([]);
  });

  it("describes direct parent spawn and wait semantics for explicit delegation requests", () => {
    const [tool] = createSubagentPiToolDefinitions({
      store: {} as any,
      threadId: "parent-thread",
      getFeatureFlagSnapshot: () => enabledFlags,
      getParentRun: () => undefined,
    });
    const guidance = [tool.description, tool.promptSnippet, ...(tool.promptGuidelines ?? [])].join("\n");

    expect(guidance).toContain("explicit delegation");
    expect(guidance).toContain("names ambient_subagent");
    expect(guidance).toContain("call spawn_agent before giving a final answer");
    expect(guidance).toContain("do not substitute a prose plan");
    expect(guidance).toContain("pass those literal values in the tool arguments");
    expect(guidance).toContain("Choose the workflow shape deliberately");
    expect(guidance).toContain("concrete deliverables with ordered outputs use pipeline or imitate-and-verify");
    expect(guidance).toContain("use pipeline for ordered stage handoffs");
    expect(guidance).toContain("Do not call ordinary planning, checking, or review work an adversarial debate");
    expect(guidance).toContain("menu, shopping list, timing plan");
    expect(guidance).toContain("Reviewers/critics in that flow are verification stages, not debate stances");
    expect(guidance).toContain("do not spawn competing Plan A / Plan B proposal children unless the user explicitly asks for alternatives");
    expect(guidance).toContain("Children cannot discover sibling outputs");
    expect(guidance).toContain("include all required upstream child summaries");
    expect(guidance).toContain("For adversarial debate");
    expect(guidance).toContain("at least three distinct stance/perspective children");
    expect(guidance).toContain("reducer/reviewer evaluator child");
    expect(guidance).toContain("visible evaluation rubric");
    expect(guidance).toContain("call wait_agent for that child before synthesizing the parent answer");
    expect(guidance).toContain("cancel_parent is a final stop/cancel path");
    expect(guidance).toContain("scheduled sub-agents are deferred to the automation layer");
  });
});

describe("ambient_subagent Pi tool", () => {
  it("refuses stale execution when ambient.subagents is disabled", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => disabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-disabled", {
        action: "spawn_agent",
        task: "Inspect the current code.",
      })).rejects.toThrow(/disabled/);
    } finally {
      store.close();
    }
  });

  it("refuses stale ambient_subagent execution from child threads", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const parentAssistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: parentAssistant.id });
      const childRun = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: parentAssistant.id,
        title: "Child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      const childAssistant = store.addMessage({ threadId: childRun.childThreadId, role: "assistant", content: "" });
      const childParentRun = store.startRun({ threadId: childRun.childThreadId, assistantMessageId: childAssistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: childRun.childThreadId,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: childParentRun.id, assistantMessageId: childAssistant.id }),
      });

      await expect(executeTool(tool, "nested-spawn", {
        action: "spawn_agent",
        task: "Try to spawn a nested child.",
      })).rejects.toThrow(/Nested sub-agent fanout is disabled/);
    } finally {
      store.close();
    }
  });

  it("rejects scheduled spawn requests before creating a live child thread", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-scheduled", {
        action: "spawn_agent",
        task: "Check this project each morning and report stale TODOs.",
        roleId: "explorer",
        scheduledAt: "2026-06-06T09:00:00-07:00",
        recurrence: "daily",
        idempotencyKey: "spawn:scheduled-todos",
      })).rejects.toThrow(/Scheduled sub-agent runs are deferred to Ambient automations/);

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.spawn_failed",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-failure-v1",
            failureStage: "scheduling_policy",
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            parentMessageId: assistant.id,
            toolCallId: "spawn-scheduled",
            idempotencyKey: "spawn:scheduled-todos",
            roleId: "explorer",
            schedulingPolicy: "live_parent_only",
            scheduledSpawnFields: ["scheduledAt", "recurrence"],
            reason: expect.stringContaining("cannot inherit live parent context"),
            automationGuidance: expect.stringContaining("automation layer"),
          }),
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("reserves child threads, queues mailbox work, and makes close/cancel idempotent", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-1", {
        action: "spawn_agent",
        task: "Inspect the persistence code and report risks.",
        roleId: "explorer",
        dependencyMode: "required",
        effectiveRole: {
          patternRole: "mapper",
          overlayLabels: ["Read-only file extraction", "Risk evidence schema"],
          outputContract: "Return risk bullets with file references.",
        },
        idempotencyKey: "spawn:persistence-risk",
      });
      const runId = (spawned.details as any).run.id as string;
      const run = store.getSubagentRun(runId);
      expect(run).toMatchObject({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        dependencyMode: "required",
        status: "reserved",
        effectiveRoleSnapshot: {
          schemaVersion: "ambient-subagent-effective-role-v1",
          baseRole: "explorer",
          patternRole: "mapper",
          displayLabel: "Explorer + Mapper",
          roleOverlayIds: ["mapper.read-only-file-extraction", "mapper.risk-evidence-schema"],
          nonWidening: true,
          outputContract: "Return risk bullets with file references.",
        },
        capacityLeaseSnapshot: expect.objectContaining({
          status: "reserved",
          canonicalTaskPath: "root/0:explorer",
          blockingReasons: [],
        }),
      });
      expect(store.getThread(run.childThreadId)).toMatchObject({
        kind: "subagent_child",
        parentThreadId: parent.id,
        subagentRunId: run.id,
        collapsedByDefault: true,
      });
      expect(store.listSubagentMailboxEvents(run.id)).toHaveLength(1);
      const toolScopeSnapshots = store.listSubagentToolScopeSnapshots(run.id);
      expect(toolScopeSnapshots).toHaveLength(1);
      expect(toolScopeSnapshots[0]).toMatchObject({
        runId: run.id,
        sequence: 1,
        scope: {
          loadedCategories: ["workspace.read", "artifact.read", "browser.read", "long-context.read", "connector.read"],
          piVisibleCategories: ["workspace.read", "artifact.read", "browser.read", "long-context.read", "connector.read"],
          deniedCategories: [],
          fanoutAvailable: false,
        },
        resolverInputs: {
          roleId: "explorer",
          requestedCategories: null,
          parentThread: {
            id: parent.id,
            permissionMode: "workspace",
          },
        },
      });
      expect((spawned.details as any).toolScopeSnapshot).toMatchObject({
        runId: run.id,
        sequence: 1,
        loadedCategories: ["workspace.read", "artifact.read", "browser.read", "long-context.read", "connector.read"],
        piVisibleCategories: ["workspace.read", "artifact.read", "browser.read", "long-context.read", "connector.read"],
      });
      expect((spawned.details as any).run.effectiveRole).toMatchObject({
        baseRole: "explorer",
        patternRole: "mapper",
        displayLabel: "Explorer + Mapper",
        roleOverlayIds: ["mapper.read-only-file-extraction", "mapper.risk-evidence-schema"],
        overlayLabels: ["Read-only file extraction", "Risk evidence schema"],
        nonWidening: true,
        outputContract: "Return risk bullets with file references.",
      });
      expect((spawned.details as any).capacityLease).toMatchObject({
        status: "reserved",
        provider: {
          projectedOpenRunCount: 1,
          allowed: true,
        },
        blockingReasons: [],
      });
      const waitBarriers = store.listSubagentWaitBarriersForParentRun(parentRun.id);
      expect(waitBarriers).toHaveLength(1);
      expect(waitBarriers[0]).toMatchObject({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [run.id],
        dependencyMode: "required_all",
        status: "waiting_on_children",
      });
      expect((spawned.details as any).waitBarrier).toMatchObject({
        id: waitBarriers[0].id,
        status: "waiting_on_children",
      });
      expect((spawned.details as any).turnBudgetPolicy).toMatchObject({
        schemaVersion: "ambient-subagent-turn-budget-policy-v1",
        roleId: "explorer",
        maxTurns: 8,
        wrapUpAtTurn: 7,
        graceTurns: 1,
        terminalStatusOnExhaustion: "aborted_partial",
        partialAllowed: true,
      });

      const replay = await executeTool(tool, "spawn-1-retry", {
        action: "spawn_agent",
        task: "Inspect the persistence code and report risks.",
        roleId: "explorer",
        dependencyMode: "required",
        effectiveRole: {
          patternRole: "mapper",
          overlayLabels: ["Read-only file extraction", "Risk evidence schema"],
          outputContract: "Return risk bullets with file references.",
        },
        idempotencyKey: "spawn:persistence-risk",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect((replay.details as any).run.id).toBe(run.id);
      expect((replay.details as any).run.effectiveRole).toMatchObject({
        patternRole: "mapper",
        displayLabel: "Explorer + Mapper",
      });
      expect((replay.details as any).turnBudgetPolicy).toMatchObject({
        roleId: "explorer",
        maxTurns: 8,
        wrapUpAtTurn: 7,
      });
      expect(store.listSubagentRunsForParentThread(parent.id)).toHaveLength(1);

      const followup = await executeTool(tool, "follow-1", {
        action: "followup_agent",
        childRunId: run.id,
        message: "Also check restart recovery implications.",
        idempotencyKey: "follow:restart",
      });
      expect((followup.details as any).status).toBe("queued");
      expect(store.listSubagentMailboxEvents(run.id)).toHaveLength(2);

      const cancelled = await executeTool(tool, "cancel-1", {
        action: "cancel_agent",
        childRunId: run.id,
        reason: "Parent no longer needs this branch.",
        idempotencyKey: "cancel:branch",
      });
      expect((cancelled.details as any).run.status).toBe("cancelled");
      expect((cancelled.details as any).cancelledMailboxEvents).toEqual([
        expect.objectContaining({
          type: "subagent.task",
          direction: "parent_to_child",
          deliveryState: "cancelled",
        }),
        expect.objectContaining({
          type: "subagent.followup",
          direction: "parent_to_child",
          deliveryState: "cancelled",
        }),
      ]);
      expect((cancelled.details as any).waitBarriers).toEqual([
        expect.objectContaining({
          id: waitBarriers[0].id,
          childRunIds: [run.id],
          status: "cancelled",
        }),
      ]);
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          id: waitBarriers[0].id,
          status: "cancelled",
          resolutionArtifact: expect.objectContaining({
            synthesisAllowed: false,
            childStatuses: [{ childRunId: run.id, status: "cancelled" }],
          }),
        }),
      ]);
      expect(store.getThread(run.childThreadId).childStatus).toBe("cancelled");
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([
        expect.objectContaining({ type: "subagent.task", deliveryState: "cancelled" }),
        expect.objectContaining({ type: "subagent.followup", deliveryState: "cancelled" }),
      ]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            parentMessageId: assistant.id,
            childRunId: run.id,
            childThreadId: run.childThreadId,
            previousStatus: "reserved",
            status: "cancelled",
            source: "parent_cancel_request",
            toolCallId: "cancel-1",
            waitBarrierIds: [waitBarriers[0].id],
            resultArtifact: expect.objectContaining({
              status: "cancelled",
              partial: false,
            }),
          }),
        }),
      ]));

      const cancelReplay = await executeTool(tool, "cancel-1-retry", {
        action: "cancel_agent",
        childRunId: run.id,
        reason: "Parent no longer needs this branch.",
        idempotencyKey: "cancel:branch",
      });
      expect((cancelReplay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.lifecycle_interrupted")).toHaveLength(1);
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([
        expect.objectContaining({ type: "subagent.task", deliveryState: "cancelled" }),
        expect.objectContaining({ type: "subagent.followup", deliveryState: "cancelled" }),
      ]);

      const closed = await executeTool(tool, "close-1", {
        action: "close_agent",
        childRunId: run.id,
        reason: "Release capacity after cancellation.",
        idempotencyKey: "close:branch",
      });
      expect((closed.details as any).status).toBe("closed");
      expect(store.getSubagentRun(run.id).closedAt).toBeTruthy();
      expect(store.getSubagentRun(run.id).capacityLeaseSnapshot.status).toBe("released");
      expect(store.getThread(run.childThreadId).kind).toBe("subagent_child");

      const closeReplay = await executeTool(tool, "close-1-retry", {
        action: "close_agent",
        childRunId: run.id,
        reason: "Release capacity after cancellation.",
        idempotencyKey: "close:branch",
      });
      expect((closeReplay.details as any).status).toBe("idempotent_replay");
    } finally {
      store.close();
    }
  });

  it("binds spawned children to callable workflow pattern graph nodes", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const workflowTask = enqueueSymphonyWorkflowTask(store, parent.id, parentRun.id, assistant.id);
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-graph-mapper", {
        action: "spawn_agent",
        task: "Map the first source slice and return extracted evidence.",
        roleId: "explorer",
        dependencyMode: "required",
        effectiveRole: {
          patternRole: "mapper",
          overlayLabels: ["Source slice"],
          outputContract: "Return extracted evidence.",
        },
        patternGraphBinding: {
          workflowTaskId: workflowTask.id,
          roleNodeId: "mapper",
          label: "Mapper child",
          blockingParent: true,
        },
        idempotencyKey: "spawn:graph-mapper",
      });

      const runId = (spawned.details as any).run.id as string;
      const run = store.getSubagentRun(runId);
      const updatedTask = store.getCallableWorkflowTask(workflowTask.id);
      expect((spawned.details as any).patternGraphBinding).toMatchObject({
        workflowTaskId: workflowTask.id,
        roleNodeId: "mapper",
        childRunId: run.id,
        childThreadId: run.childThreadId,
        patternId: "map_reduce",
      });
      expect(updatedTask.patternGraphSnapshot?.nodes).toContainEqual(expect.objectContaining({
        id: `mapper:${run.id}`,
        label: "Mapper child",
        childRunId: run.id,
        childThreadId: run.childThreadId,
        status: "queued",
        blockingParent: true,
      }));
      expect(updatedTask.patternGraphSnapshot?.edges.some((edge) => edge.from === `mapper:${run.id}` || edge.to === `mapper:${run.id}`)).toBe(true);

      const replay = await executeTool(tool, "spawn-graph-mapper-replay", {
        action: "spawn_agent",
        task: "Map the first source slice and return extracted evidence.",
        roleId: "explorer",
        dependencyMode: "required",
        patternGraphBinding: {
          workflowTaskId: workflowTask.id,
          roleNodeId: "mapper",
        },
        idempotencyKey: "spawn:graph-mapper",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.getCallableWorkflowTask(workflowTask.id).patternGraphSnapshot?.nodes.filter((node) => node.childRunId === run.id)).toHaveLength(1);

      await expect(executeTool(tool, "spawn-graph-missing-node", {
        action: "spawn_agent",
        task: "Try to bind to an invalid graph node.",
        roleId: "explorer",
        patternGraphBinding: {
          workflowTaskId: workflowTask.id,
          roleNodeId: "not-a-node",
        },
        idempotencyKey: "spawn:graph-missing-node",
      })).rejects.toThrow(/Pattern graph role node not-a-node does not exist/);
      expect(store.listSubagentRunsForParentThread(parent.id).map((candidate) => candidate.id)).toEqual([run.id]);
    } finally {
      store.close();
    }
  });

  it("refuses to close actively executing children before releasing capacity", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      for (const status of ["reserved", "starting", "running", "waiting"] as const) {
        const run = store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Active ${status}`,
          roleId: "explorer",
          canonicalTaskPath: `root/${status}:explorer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-05T00:00:00.000Z"),
          dependencyMode: "required",
        });
        if (status !== "reserved") {
          store.markSubagentRunStatus(run.id, status, {
            now: "2026-06-05T00:00:10.000Z",
          });
        }

        await expect(executeTool(tool, `close-active-${status}`, {
          action: "close_agent",
          childRunId: run.id,
          reason: "Release capacity too early.",
          idempotencyKey: `close:active:${status}`,
        })).rejects.toThrow(`Cannot close active sub-agent ${run.id} (${status})`);

        const current = store.getSubagentRun(run.id);
        expect(current.closedAt).toBeUndefined();
        expect(current.capacityLeaseSnapshot.status).toBe("reserved");
        expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).not.toContain("subagent.close_requested");
        expect(store.getThread(run.childThreadId).kind).toBe("subagent_child");
      }
    } finally {
      store.close();
    }
  });

  it("closes needs-attention children as abandoned work without deleting history", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Needs attention",
        roleId: "explorer",
        canonicalTaskPath: "root/needs-attention:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.addMessage({
        threadId: run.childThreadId,
        role: "assistant",
        content: "I need parent input before completing.",
      });
      store.markSubagentRunStatus(run.id, "needs_attention", {
        now: "2026-06-05T00:00:10.000Z",
      });

      const closed = await executeTool(tool, "close-needs-attention", {
        action: "close_agent",
        childRunId: run.id,
        reason: "Parent abandoned this branch.",
        idempotencyKey: "close:needs-attention",
      });

      expect((closed.details as any).status).toBe("closed");
      expect(store.getSubagentRun(run.id)).toMatchObject({
        status: "needs_attention",
        closedAt: expect.any(String),
        capacityLeaseSnapshot: expect.objectContaining({
          status: "released",
          releaseReason: expect.stringContaining("close_agent"),
        }),
      });
      expect(store.listMessages(run.childThreadId).map((message) => message.content)).toEqual([
        "I need parent input before completing.",
        expect.stringContaining("Capacity is released; transcript and artifacts are retained."),
      ]);
    } finally {
      store.close();
    }
  });

  it("hands followup tasks to an attached runtime without triggering send-only mailbox messages", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtimeUpdates: unknown[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const followupChildRun = vi.fn(({ run, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent }) => {
        markMailboxDelivered("2026-06-05T00:00:10.000Z");
        emitEvent({
          type: "status",
          source: "followup_agent",
          status: run.status,
          message: `Follow-up delivered through ${mailboxEvent.id}.`,
        });
        const consumed = markMailboxConsumed("2026-06-05T00:00:11.000Z");
        return {
          accepted: true,
          run: store.getSubagentRun(run.id),
          mailboxEvent: consumed,
          message: "Runtime accepted follow-up while the child was idle.",
        };
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "needs_attention") }),
          followupChildRun,
        },
      });

      const spawned = await executeTool(tool, "spawn-followup-runtime", {
        action: "spawn_agent",
        task: "Ask for parent steering before continuing.",
        idempotencyKey: "spawn:followup-runtime",
      });
      const runId = (spawned.details as any).run.id as string;

      const sent = await executeTool(tool, "send-only", {
        action: "send_agent",
        childRunId: runId,
        message: "Context note only; do not start a child turn.",
        idempotencyKey: "send:context-only",
      });
      expect((sent.details as any).status).toBe("queued");
      expect(followupChildRun).not.toHaveBeenCalled();
      expect((sent.details as any).mailboxEvent).toMatchObject({
        type: "subagent.message",
        deliveryState: "queued",
      });

      const followed = await executeTool(tool, "follow-idle", {
        action: "followup_agent",
        childRunId: runId,
        message: "Proceed with the fixture named restart-smoke.",
        idempotencyKey: "follow:restart-smoke",
      }, (update) => runtimeUpdates.push(update));
      expect(followupChildRun).toHaveBeenCalledTimes(1);
      expect(followupChildRun).toHaveBeenCalledWith(expect.objectContaining({
        run: expect.objectContaining({ id: runId }),
        message: "Proceed with the fixture named restart-smoke.",
        mailboxEvent: expect.objectContaining({
          type: "subagent.followup",
          deliveryState: "queued",
        }),
        idempotencyKey: "follow:restart-smoke",
      }));
      expect((followed.details as any)).toMatchObject({
        status: "queued",
        runtimeFollowup: {
          accepted: true,
          message: "Runtime accepted follow-up while the child was idle.",
          mailboxEvent: {
            type: "subagent.followup",
            deliveryState: "consumed",
            deliveredAt: "2026-06-05T00:00:10.000Z",
          },
        },
        mailboxEvent: {
          type: "subagent.followup",
          deliveryState: "consumed",
          deliveredAt: "2026-06-05T00:00:10.000Z",
        },
      });
      expect(store.listSubagentMailboxEvents(runId).map((event) => ({
        type: event.type,
        deliveryState: event.deliveryState,
        deliveredAt: event.deliveredAt,
      }))).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.task", deliveryState: "queued", deliveredAt: undefined }),
        expect.objectContaining({ type: "subagent.message", deliveryState: "queued", deliveredAt: undefined }),
        expect.objectContaining({ type: "subagent.followup", deliveryState: "consumed", deliveredAt: "2026-06-05T00:00:10.000Z" }),
      ]));
      expect(store.listSubagentRunEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_event",
          preview: expect.objectContaining({
            source: "followup_agent",
            type: "status",
            message: expect.stringContaining("Follow-up delivered through"),
          }),
        }),
      ]));
      expect(runtimeUpdates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            action: "followup_agent",
            type: "subagent.runtime_event",
            event: expect.objectContaining({
              source: "followup_agent",
              type: "status",
            }),
          }),
        }),
      ]));
    } finally {
      store.close();
    }
  });

  it("resolves launch roles through an injected role registry", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const roleRegistry = createAgentRoleRegistry([{
      ...explorer,
      label: "Code Scout",
      nicknameCandidates: ["Scout Prime"],
    }]);
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        roleRegistry,
      });

      expect(((tool.parameters as any).properties.roleId.enum)).toEqual(["explorer"]);
      const spawned = await executeTool(tool, "spawn-registry", {
        action: "spawn_agent",
        task: "Inspect role registry wiring.",
        roleId: "explorer",
        idempotencyKey: "spawn:role-registry",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);

      expect(run.roleProfileSnapshot).toMatchObject({
        id: "explorer",
        label: "Code Scout",
        nicknameCandidates: ["Scout Prime"],
      });
      expect((spawned.details as any).run).toMatchObject({
        roleLabel: "Code Scout",
        roleProfileSnapshotSource: "resolved",
      });
    } finally {
      store.close();
    }
  });

  it("fails a visible child run before runtime start when capacity is blocked", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = {
      startChildRun: vi.fn(),
    };
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        resolveCapacityLease: (input) => resolveSubagentCapacityLease({
          ...input,
          localMemory: {
            outcome: "refuse",
            allowed: false,
            reason: "Projected local-model resident memory exceeds the configured ceiling.",
            requestedEstimatedResidentMemoryBytes: 12,
            activeEstimatedResidentMemoryBytes: 8,
            projectedEstimatedResidentMemoryBytes: 20,
            maxResidentMemoryBytes: 16,
            exceededByBytes: 4,
            unloadCandidateIds: [],
          },
        }),
        runtime,
      });

      const spawned = await executeTool(tool, "spawn-capacity-blocked", {
        action: "spawn_agent",
        task: "Summarize this transcript with a local model.",
        roleId: "summarizer",
        dependencyMode: "required",
        idempotencyKey: "spawn:capacity-blocked",
      });
      const runId = (spawned.details as any).run.id as string;
      const run = store.getSubagentRun(runId);

      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(run).toMatchObject({
        status: "failed",
        capacityLeaseSnapshot: expect.objectContaining({
          status: "blocked",
          blockingReasons: ["Projected local-model resident memory exceeds the configured ceiling."],
        }),
        resultArtifact: expect.objectContaining({
          schemaVersion: "ambient-subagent-result-artifact-v1",
          status: "failed",
          partial: false,
        }),
      });
      expect(store.getThread(run.childThreadId)).toMatchObject({
        kind: "subagent_child",
        childStatus: "failed",
        collapsedByDefault: true,
      });
      expect(store.listSubagentMailboxEvents(run.id)).toHaveLength(0);
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toEqual([]);
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual([
        "subagent.reserved",
        "subagent.lifecycle_started",
        "subagent.spawn_requested",
        "subagent.spawn_rejected",
        "subagent.status_changed",
        "subagent.lifecycle_stopped",
      ]);
      expect((spawned.details as any)).toMatchObject({
        status: "failed",
        orchestrationStarted: false,
        capacityLease: {
          status: "blocked",
          localMemory: {
            outcome: "refuse",
            allowed: false,
          },
        },
      });
    } finally {
      store.close();
    }
  });

  it("records a visible failed worker child when isolated worktrees are unavailable", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = { startChildRun: vi.fn() };
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime,
      });

      const spawned = await executeTool(tool, "worker-spawn", {
        action: "spawn_agent",
        task: "Edit the implementation.",
        roleId: "worker",
        idempotencyKey: "spawn:worker-no-worktree",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);

      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(run).toMatchObject({
        status: "failed",
        roleId: "worker",
        resultArtifact: expect.objectContaining({
          schemaVersion: "ambient-subagent-result-artifact-v1",
          status: "failed",
          partial: false,
          summary: expect.stringContaining("workspace.write"),
        }),
      });
      expect(store.getThread(run.childThreadId)).toMatchObject({
        kind: "subagent_child",
        childStatus: "failed",
        collapsedByDefault: true,
      });
      expect(store.listSubagentMailboxEvents(run.id)).toHaveLength(0);
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual([
        "subagent.reserved",
        "subagent.lifecycle_started",
        "subagent.worktree_unavailable",
        "subagent.spawn_requested",
        "subagent.spawn_rejected",
        "subagent.status_changed",
        "subagent.lifecycle_stopped",
      ]);
      expect(store.listSubagentToolScopeSnapshots(run.id)[0].scope).toMatchObject({
        deniedCategories: expect.arrayContaining([
          expect.objectContaining({
            id: "workspace.write",
            reason: "Mutating child requires an approved isolated worktree.",
          }),
        ]),
        worktreeIsolated: false,
      });
      expect((spawned.details as any)).toMatchObject({
        status: "failed",
        orchestrationStarted: false,
        run: {
          status: "failed",
          roleId: "worker",
        },
      });
    } finally {
      store.close();
    }
  });

  it("starts worker children only after an active isolated child worktree is recorded", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = {
      startChildRun: vi.fn(({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "running") })),
    };
    const prepareChildWorktree = vi.fn(({ run }): ThreadWorktreeSummary => {
      const now = "2026-06-05T00:00:00.000Z";
      const worktree: ThreadWorktreeSummary = {
        threadId: run.childThreadId,
        projectRoot: workspacePath,
        worktreePath: join(workspacePath, ".ambient-codex", "worktrees", run.childThreadId),
        branchName: `ambient/worker-${run.childThreadId.slice(0, 8)}`,
        baseRef: "abc1234",
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      store.setThreadWorktree(worktree);
      store.updateThreadWorkspacePath(run.childThreadId, worktree.worktreePath);
      return worktree;
    });
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        prepareChildWorktree,
        runtime,
      });

      const spawned = await executeTool(tool, "worker-spawn-active-worktree", {
        action: "spawn_agent",
        task: "Implement the scoped fix.",
        roleId: "worker",
        idempotencyKey: "spawn:worker-active-worktree",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);
      const childThread = store.getThread(run.childThreadId);
      const [snapshot] = store.listSubagentToolScopeSnapshots(run.id);

      expect(prepareChildWorktree).toHaveBeenCalledWith(expect.objectContaining({
        parentThread: expect.objectContaining({ id: parent.id }),
        run: expect.objectContaining({ id: run.id, childThreadId: run.childThreadId }),
        role: expect.objectContaining({ id: "worker", mutationPolicy: "requires_isolated_worktree" }),
        task: "Implement the scoped fix.",
        idempotencyKey: "spawn:worker-active-worktree",
      }));
      expect(runtime.startChildRun).toHaveBeenCalledWith(expect.objectContaining({
        run: expect.objectContaining({ id: run.id }),
        childWorktree: expect.objectContaining({
          threadId: run.childThreadId,
          status: "active",
          worktreePath: childThread.workspacePath,
        }),
        toolScope: expect.objectContaining({
          worktreeIsolated: true,
          loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
          piVisibleCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        }),
      }));
      expect(run.status).toBe("running");
      expect(childThread).toMatchObject({
        kind: "subagent_child",
        workspacePath: expect.stringContaining(`.ambient-codex/worktrees/${run.childThreadId}`),
        gitWorktree: expect.objectContaining({
          status: "active",
          worktreePath: expect.stringContaining(`.ambient-codex/worktrees/${run.childThreadId}`),
        }),
      });
      expect(snapshot.scope).toMatchObject({
        worktreeIsolated: true,
        deniedCategories: [],
      });
      expect(snapshot.resolverInputs).toMatchObject({
        workspacePolicy: {
          approvalMode: "interactive",
          worktreeIsolated: true,
        },
        childWorktree: {
          threadId: run.childThreadId,
          status: "active",
          worktreePath: childThread.workspacePath,
        },
      });
      expect(store.listSubagentMailboxEvents(run.id)).toHaveLength(1);
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.reserved",
        "subagent.worktree_prepared",
        "subagent.spawn_requested",
        "subagent.status_changed",
      ]));
      expect((spawned.details as any)).toMatchObject({
        status: "running",
        orchestrationStarted: true,
        childWorktree: {
          threadId: run.childThreadId,
          status: "active",
          worktreePath: childThread.workspacePath,
        },
        toolScopeSnapshot: {
          worktreeIsolated: true,
          loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        },
      });
    } finally {
      store.close();
    }
  });

  it("rejects active worker worktrees that are not persisted on the child thread", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = { startChildRun: vi.fn() };
    const prepareChildWorktree = vi.fn(({ run }): ThreadWorktreeSummary => {
      const now = "2026-06-05T00:00:00.000Z";
      return {
        threadId: run.childThreadId,
        projectRoot: workspacePath,
        worktreePath: join(workspacePath, ".ambient-codex", "worktrees", run.childThreadId),
        branchName: `ambient/worker-${run.childThreadId.slice(0, 8)}`,
        baseRef: "abc1234",
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
    });
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        prepareChildWorktree,
        runtime,
      });

      const spawned = await executeTool(tool, "worker-spawn-unpersisted-worktree", {
        action: "spawn_agent",
        task: "Implement the scoped fix.",
        roleId: "worker",
        idempotencyKey: "spawn:worker-unpersisted-worktree",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);
      const childThread = store.getThread(run.childThreadId);
      const worktreeEvent = store.listSubagentRunEvents(run.id).find((event) => event.type === "subagent.worktree_unavailable");

      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(run.status).toBe("failed");
      expect(childThread).toMatchObject({
        kind: "subagent_child",
        workspacePath,
        gitWorktree: undefined,
      });
      expect(worktreeEvent?.preview).toMatchObject({
        reason: "Prepared active worktree must be persisted on the child thread before mutating tools are enabled.",
        childThread: {
          id: run.childThreadId,
          workspacePath,
          gitWorktree: null,
        },
      });
      expect(store.listSubagentToolScopeSnapshots(run.id)[0].scope).toMatchObject({
        worktreeIsolated: false,
        deniedCategories: expect.arrayContaining([
          expect.objectContaining({
            id: "workspace.write",
            reason: "Mutating child requires an approved isolated worktree.",
          }),
        ]),
      });
      expect((spawned.details as any)).toMatchObject({
        status: "failed",
        orchestrationStarted: false,
        childWorktree: null,
      });
    } finally {
      store.close();
    }
  });

  it("records non-interactive approval mode in launch tool-scope snapshots", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-noninteractive", {
        action: "spawn_agent",
        task: "Read a single file without asking for approval.",
        roleId: "explorer",
        toolScope: {
          requestedCategories: ["workspace.read"],
          approvalMode: "non_interactive",
        },
        idempotencyKey: "spawn:noninteractive",
      });
      const runId = (spawned.details as any).run.id as string;
      const [snapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshot.scope).toMatchObject({
        approvalMode: "non_interactive",
        loadedCategories: ["workspace.read"],
        piVisibleCategories: ["workspace.read"],
      });
      expect(snapshot.resolverInputs).toMatchObject({
        requestedApprovalMode: "non_interactive",
        workspacePolicy: {
          approvalMode: "non_interactive",
        },
      });
      expect((spawned.details as any).toolScopeSnapshot).toMatchObject({
        approvalMode: "non_interactive",
      });
    } finally {
      store.close();
    }
  });

  it("reports non-interactive approval-unavailable launch denials to the parent mailbox", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = { startChildRun: vi.fn() };
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const roleRegistry = createAgentRoleRegistry([{
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "connector.read"],
    }]);
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        roleRegistry,
        runtime,
      });

      const spawned = await executeTool(tool, "spawn-noninteractive-approval", {
        action: "spawn_agent",
        task: "Search Gmail without asking the user for approval.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read", piVisible: true }],
          approvalMode: "non_interactive",
        },
        idempotencyKey: "spawn:noninteractive-approval-unavailable",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);
      const [snapshot] = store.listSubagentToolScopeSnapshots(run.id);

      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: expect.objectContaining({
          status: "failed",
          partial: false,
          summary: expect.stringContaining("Capability requires interactive approval"),
        }),
      });
      expect(snapshot.scope).toMatchObject({
        approvalMode: "non_interactive",
        loadedTools: [],
        piVisibleTools: [],
        deniedTools: [
          {
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: "Capability requires interactive approval, but this launch is non-interactive.",
          },
        ],
      });
      expect(store.listSubagentRunEvents(run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.spawn_rejected",
          preview: expect.objectContaining({
            failureStage: "tool_scope",
            approvalUnavailable: true,
          }),
        }),
      ]));
      const [failure] = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
      expect(failure).toMatchObject({
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        idempotencyKey: "spawn:noninteractive-approval-unavailable",
        parentMessageId: assistant.id,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          approvalMode: "non_interactive",
          approvalUnavailable: true,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          toolCallId: "spawn-noninteractive-approval",
          requestedRoleId: "explorer",
          roleId: "explorer",
          reason: expect.stringContaining("Capability requires interactive approval"),
          toolScopeSnapshot: expect.objectContaining({
            approvalMode: "non_interactive",
            deniedTools: [
              expect.objectContaining({
                source: "connector_app",
                id: "gmail.search",
                categoryId: "connector.read",
              }),
            ],
          }),
          resultArtifact: expect.objectContaining({
            status: "failed",
            partial: false,
          }),
        }),
      });
      expect((spawned.details as any).spawnFailureParentMailbox).toMatchObject({
        id: failure.id,
        type: "subagent.spawn_failed",
        parentMessageId: assistant.id,
      });

      const replay = await executeTool(tool, "spawn-noninteractive-approval-retry", {
        action: "spawn_agent",
        task: "Search Gmail without asking the user for approval.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read", piVisible: true }],
          approvalMode: "non_interactive",
        },
        idempotencyKey: "spawn:noninteractive-approval-unavailable",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records visible failed children for Pi-visible connector tools without child-safe bridges", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = { startChildRun: vi.fn() };
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const roleRegistry = createAgentRoleRegistry([{
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "connector.read"],
    }]);
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        roleRegistry,
        runtime,
      });

      const spawned = await executeTool(tool, "spawn-connector-no-child-bridge", {
        action: "spawn_agent",
        task: "Search Gmail from a child session.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read" }],
        },
        idempotencyKey: "spawn:connector-no-child-bridge",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);
      const [snapshot] = store.listSubagentToolScopeSnapshots(run.id);

      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: expect.objectContaining({
          status: "failed",
          partial: false,
          summary: expect.stringContaining("child-safe bridge"),
        }),
      });
      expect(snapshot.scope).toMatchObject({
        approvalMode: "interactive",
        loadedTools: [],
        piVisibleTools: [],
        deniedTools: [
          {
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: expect.stringContaining("child-safe bridge"),
          },
        ],
      });
      const [failure] = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
      expect(failure).toMatchObject({
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        idempotencyKey: "spawn:connector-no-child-bridge",
        parentMessageId: assistant.id,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          approvalUnavailable: false,
          reason: expect.stringContaining("child-safe bridge"),
          toolScopeSnapshot: expect.objectContaining({
            deniedTools: [
              expect.objectContaining({
                source: "connector_app",
                id: "gmail.search",
                categoryId: "connector.read",
              }),
            ],
          }),
        }),
      });

      const replay = await executeTool(tool, "spawn-connector-no-child-bridge-retry", {
        action: "spawn_agent",
        task: "Search Gmail from a child session.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read" }],
        },
        idempotencyKey: "spawn:connector-no-child-bridge",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records exact source-level tool scope requests in launch snapshots", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-source-tools", {
        action: "spawn_agent",
        task: "Inspect one file using a surfaced extension tool and a skill.",
        roleId: "explorer",
        toolScope: {
          surfacedExtensionTools: [{ id: "pi-subagents.search", categoryId: "workspace.read" }],
          skills: [{ id: "openai-docs" }],
        },
        idempotencyKey: "spawn:source-tools",
      });
      const runId = (spawned.details as any).run.id as string;
      const [snapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshot.scope.loadedCategories).toEqual(["workspace.read"]);
      expect(snapshot.scope.loadedTools.map((item) => `${item.source}:${item.id}`)).toEqual([
        "extension_tool:pi-subagents.search",
        "skill:openai-docs",
      ]);
      expect(snapshot.scope.piVisibleTools.map((item) => `${item.source}:${item.id}`)).toEqual([
        "extension_tool:pi-subagents.search",
      ]);
      expect(snapshot.resolverInputs).toMatchObject({
        requestedSources: [
          { source: "extension_tool", id: "pi-subagents.search", categoryId: "workspace.read" },
          { source: "skill", id: "openai-docs" },
        ],
      });
      expect((spawned.details as any).toolScopeSnapshot).toMatchObject({
        loadedTools: expect.arrayContaining([
          expect.objectContaining({ source: "extension_tool", id: "pi-subagents.search" }),
          expect.objectContaining({ source: "skill", id: "openai-docs" }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  it("accepts surfaced extension tools registered in the launch catalog", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        availableExtensionToolNames: ["pi-subagents.search"],
      });

      const spawned = await executeTool(tool, "spawn-available-extension-tool", {
        action: "spawn_agent",
        task: "Inspect one file using the exact registered plugin MCP tool.",
        roleId: "explorer",
        toolScope: {
          surfacedExtensionTools: [{ id: "pi-subagents.search", categoryId: "workspace.read" }],
        },
        idempotencyKey: "spawn:available-extension-tool",
      });
      const runId = (spawned.details as any).run.id as string;
      const [snapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshot.scope.piVisibleTools).toEqual([
        expect.objectContaining({
          source: "extension_tool",
          id: "pi-subagents.search",
          categoryId: "workspace.read",
          piVisible: true,
        }),
      ]);
      expect(snapshot.resolverInputs).toMatchObject({
        availableExtensionToolNames: ["pi-subagents.search"],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("rejects unavailable surfaced extension tools before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        availableExtensionToolNames: ["pi-subagents.search"],
      });

      await expect(executeTool(tool, "spawn-missing-extension-tool", {
        action: "spawn_agent",
        task: "Inspect one file using a misspelled plugin MCP tool.",
        roleId: "explorer",
        toolScope: {
          surfacedExtensionTools: [{ id: "pi-subagents.serach", categoryId: "workspace.read" }],
        },
        idempotencyKey: "spawn:missing-extension-tool",
      })).rejects.toThrow(/Requested sub-agent extension tools are unavailable/);
      await expect(executeTool(tool, "spawn-missing-extension-tool-retry", {
        action: "spawn_agent",
        task: "Inspect one file using a misspelled plugin MCP tool.",
        roleId: "explorer",
        toolScope: {
          surfacedExtensionTools: [{ id: "pi-subagents.serach", categoryId: "workspace.read" }],
        },
        idempotencyKey: "spawn:missing-extension-tool",
      })).rejects.toThrow(/Requested sub-agent extension tools are unavailable/);

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.spawn_failed",
          deliveryState: "queued",
          idempotencyKey: "spawn:missing-extension-tool",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-failure-v1",
            failureStage: "tool_scope",
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            parentMessageId: assistant.id,
            toolCallId: "spawn-missing-extension-tool",
            requestedRoleId: "explorer",
            roleId: "explorer",
            reason: expect.stringContaining("pi-subagents.serach"),
            unavailableExtensionTools: [
              { id: "pi-subagents.serach", categoryId: "workspace.read" },
            ],
          }),
        }),
      ]);
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        spawnAttempts: 1,
        failedSpawns: 1,
      });
    } finally {
      store.close();
    }
  });

  it("rejects secret-shaped source-level tool ids before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-secret-source-id", {
        action: "spawn_agent",
        task: "Inspect one file using a direct MCP tool.",
        roleId: "explorer",
        toolScope: {
          directMcpTools: [{ id: "server/sk-proj-abcdefghijklmnopqrstuvwxyz123456", categoryId: "mcp.direct" }],
        },
        idempotencyKey: "spawn:secret-source-id",
      })).rejects.toThrow("Sub-agent tool source request id appears to contain secret-like material.");

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("rejects broad connector and direct MCP source ids before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-broad-connector-source-id", {
        action: "spawn_agent",
        task: "Inspect Gmail with a connector tool.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail", categoryId: "connector.read" }],
        },
        idempotencyKey: "spawn:broad-connector-source-id",
      })).rejects.toThrow("Connector tool source ids must use exact connector.operation ids.");

      await expect(executeTool(tool, "spawn-broad-mcp-source-id", {
        action: "spawn_agent",
        task: "Inspect a file with direct MCP.",
        roleId: "explorer",
        toolScope: {
          directMcpTools: [{ id: "filesystem", categoryId: "mcp.direct" }],
        },
        idempotencyKey: "spawn:broad-mcp-source-id",
      })).rejects.toThrow("Direct MCP tool source ids must use exact server/tool operation ids.");

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("rejects unknown exact built-in child tools before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-unknown-built-in-child-tool", {
        action: "spawn_agent",
        task: "Inspect one file with a misspelled built-in tool.",
        roleId: "explorer",
        toolScope: {
          builtInTools: [{ id: "reed", categoryId: "workspace.read" }],
        },
        idempotencyKey: "spawn:unknown-built-in-child-tool",
      })).rejects.toThrow("Unknown or unsupported built-in child tool");

      await expect(executeTool(tool, "spawn-unactivatable-test-run-tool", {
        action: "spawn_agent",
        task: "Run a test with a shell-shaped built-in tool from the test category.",
        roleId: "reviewer",
        toolScope: {
          builtInTools: [{ id: "bash", categoryId: "test.run" }],
        },
        idempotencyKey: "spawn:unactivatable-test-run-tool",
      })).rejects.toThrow("No exact built-in child tools are currently activatable for test.run");

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("records a visible failed child when non-callable sources request Pi visibility", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-noncallable-visible-source", {
        action: "spawn_agent",
        task: "Inspect one file using a prompt skill.",
        roleId: "explorer",
        toolScope: {
          skills: [{ id: "openai-docs", piVisible: true }],
        },
        idempotencyKey: "spawn:noncallable-visible-source",
      });

      const run = store.getSubagentRun((spawned.details as any).run.id);
      const [snapshot] = store.listSubagentToolScopeSnapshots(run.id);

      expect(run.status).toBe("failed");
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([]);
      expect(snapshot.scope).toMatchObject({
        loadedTools: [],
        piVisibleTools: [],
        deniedTools: [
          {
            source: "skill",
            id: "openai-docs",
            reason: "Tool source loads context or capability metadata but is not a Pi-callable tool; surface exact callable tools separately.",
          },
        ],
      });
      expect((spawned.details as any)).toMatchObject({
        status: "failed",
        orchestrationStarted: false,
        toolScopeSnapshot: {
          deniedTools: [
            expect.objectContaining({
              source: "skill",
              id: "openai-docs",
            }),
          ],
        },
      });
      expect(store.listMessages(run.childThreadId).map((message) => message.content).join("\n")).toContain(
        "surface exact callable tools separately",
      );
    } finally {
      store.close();
    }
  });

  it("rejects mistyped tool-scope categories instead of falling back to defaults", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-typo", {
        action: "spawn_agent",
        task: "Inspect one file.",
        roleId: "explorer",
        toolScope: {
          requestedCategories: ["workspace.red"],
        },
      })).rejects.toThrow(/Unknown sub-agent tool category/);
    } finally {
      store.close();
    }
  });

  it("keeps the local text placeholder unavailable without a runtime resolver", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-local-placeholder", {
        action: "spawn_agent",
        task: "Summarize this text locally.",
        roleId: "summarizer",
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        toolScope: { requestedCategories: ["artifact.read"] },
      })).rejects.toThrow(/Local text runtime is not configured/);
    } finally {
      store.close();
    }
  });

  it("records pre-run spawn failures for ineligible caller model overrides", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "spawn-bad-model", {
        action: "spawn_agent",
        task: "Inspect using the requested custom model.",
        roleId: "explorer",
        modelId: "custom/unregistered-model",
        idempotencyKey: "spawn:bad-model",
      })).rejects.toThrow(/not eligible for sub-agent runs/);
      await expect(executeTool(tool, "spawn-bad-model-retry", {
        action: "spawn_agent",
        task: "Inspect using the requested custom model.",
        roleId: "explorer",
        modelId: "custom/unregistered-model",
        idempotencyKey: "spawn:bad-model",
      })).rejects.toThrow(/not eligible for sub-agent runs/);

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.spawn_failed",
          deliveryState: "queued",
          idempotencyKey: "spawn:bad-model",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-failure-v1",
            failureStage: "model_scope",
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            parentMessageId: assistant.id,
            toolCallId: "spawn-bad-model",
            requestedRoleId: "explorer",
            roleId: "explorer",
            reason: expect.stringContaining("custom/unregistered-model"),
            modelScope: expect.objectContaining({
              source: "caller_override",
              requestedModelId: "custom/unregistered-model",
              selectedModelId: "custom/unregistered-model",
              profile: expect.objectContaining({
                profileId: "unknown:custom/unregistered-model",
                providerId: "unknown",
                available: false,
                selectableAsSubagent: false,
                supportsStreaming: false,
                unavailableReason: "Model is not registered in this Ambient Desktop build.",
              }),
              blockingReasons: expect.arrayContaining([
                "Model is not registered in this Ambient Desktop build.",
              ]),
              candidateDiagnostics: [
                expect.objectContaining({
                  source: "caller_override",
                  modelId: "custom/unregistered-model",
                  profileId: "unknown:custom/unregistered-model",
                  providerId: "unknown",
                  selected: true,
                  eligible: false,
                  capabilityDiagnostics: expect.arrayContaining([
                    expect.objectContaining({ capability: "availability", status: "fail" }),
                    expect.objectContaining({ capability: "subagent_eligibility", status: "fail" }),
                    expect.objectContaining({ capability: "streaming", status: "fail" }),
                    expect.objectContaining({
                      capability: "context_window",
                      status: "fail",
                      actual: "unknown",
                    }),
                    expect.objectContaining({
                      capability: "output_budget",
                      status: "fail",
                      actual: "unknown",
                    }),
                    expect.objectContaining({
                      capability: "tool_use",
                      status: "fail",
                      actual: "toolUse=none",
                    }),
                    expect.objectContaining({
                      capability: "structured_output",
                      status: "pass",
                      actual: "ambient_validated_text",
                    }),
                  ]),
                }),
              ],
            }),
          }),
        }),
      ]);
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        spawnAttempts: 1,
        failedSpawns: 1,
      });
    } finally {
      store.close();
    }
  });

  it("records pre-run spawn failures for local runtime launch preflight denials", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const configuredLocalProfile: AmbientModelRuntimeProfile = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
      selectableAsSubagent: true,
      available: true,
      unavailableReason: undefined,
      providerQuirks: ["Resolved from an active local runtime descriptor."],
    };
    const runtime = {
      preflightChildLaunch: vi.fn(() => ({
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1" as const,
        runtime: "local_text",
        allowed: false,
        blockers: ["Local text runtime launch descriptor requires a non-empty command before scheduler launch."],
        warnings: ["Local text runtime launch descriptor has no healthUrl; scheduler readiness will rely on process liveness only."],
        details: {
          launchReadiness: {
            schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
            ready: false,
            blockers: ["Local text runtime launch descriptor requires a non-empty command before scheduler launch."],
            warnings: [],
            descriptor: {
              runtimeId: "local-text-runtime",
              providerId: "local",
              modelId: AMBIENT_LOCAL_TEXT_MODEL,
              profileId: configuredLocalProfile.profileId,
              command: "",
              args: ["--api-key", "secret-looking-value"],
              cwd: workspacePath,
              stateRootPath: join(workspacePath, ".ambient/local-model-runtime"),
              healthUrl: "file:///tmp/health",
              startupTimeoutMs: 0,
            },
          },
        },
      })),
      startChildRun: vi.fn(),
    };
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        resolveModelRuntimeProfile: (modelId) => {
          if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return configuredLocalProfile;
          return resolveAmbientModelRuntimeProfile(modelId);
        },
        runtime,
      });

      await expect(executeTool(tool, "spawn-local-runtime-denied", {
        action: "spawn_agent",
        task: "Summarize this text locally.",
        roleId: "summarizer",
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        toolScope: { requestedCategories: ["artifact.read"] },
        idempotencyKey: "spawn:local-runtime-denied",
      })).rejects.toThrow(/runtime launch preflight failed/);

      expect(runtime.preflightChildLaunch).toHaveBeenCalledWith(expect.objectContaining({
        parentThread: expect.objectContaining({ id: parent.id }),
        model: expect.objectContaining({
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          locality: "local",
        }),
        canonicalTaskPath: "root/0:summarizer",
        idempotencyKey: "spawn:local-runtime-denied",
      }));
      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      const [failure] = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
      expect(failure).toMatchObject({
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        idempotencyKey: "spawn:local-runtime-denied",
        parentMessageId: assistant.id,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "runtime_launch_preflight",
          reason: expect.stringContaining("Local text runtime launch descriptor requires a non-empty command"),
          runtimeLaunchPreflight: expect.objectContaining({
            schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
            runtime: "local_text",
            allowed: false,
            details: {
              launchReadiness: expect.objectContaining({
                schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
                ready: false,
                descriptor: expect.objectContaining({
                  runtimeId: "local-text-runtime",
                  argCount: 2,
                  command: "",
                  healthUrl: "file:///tmp/health",
                }),
              }),
            },
          }),
        }),
      });
      const payload = failure?.payload as any;
      expect(payload.runtimeLaunchPreflight.details.launchReadiness.descriptor.args).toBeUndefined();
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        spawnAttempts: 1,
        failedSpawns: 1,
      });
    } finally {
      store.close();
    }
  });

  it("records pre-run spawn failures for local runtime capacity preflight denials", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const configuredLocalProfile: AmbientModelRuntimeProfile = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
      selectableAsSubagent: true,
      available: true,
      unavailableReason: undefined,
      providerQuirks: ["Resolved from an active local runtime descriptor."],
    };
    const localRuntimeReservation = {
      schemaVersion: "ambient-subagent-local-runtime-reservation-v1",
      status: "requested",
      runtimeId: "local-text-runtime",
      requestedLaunchId: "spawn:local-capacity-denied:root/0:summarizer",
      capabilityKind: "local-text",
      providerId: "local",
      modelId: AMBIENT_LOCAL_TEXT_MODEL,
      modelProfileId: configuredLocalProfile.profileId,
      parentThreadId: "pending-parent-thread",
      ownerThreadId: "pending-parent-thread",
      canonicalTaskPath: "root/0:summarizer",
      idempotencyKey: "spawn:local-capacity-denied",
      estimatedResidentMemoryBytes: 8,
      memoryEstimateSource: "launch_descriptor",
    } as const;
    const runtime = {
      preflightChildLaunch: vi.fn(() => ({
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1" as const,
        runtime: "local_text",
        allowed: true,
        blockers: [],
        warnings: [],
        capacity: {
          localMemory: {
            outcome: "refuse" as const,
            allowed: false,
            reason: "Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch.",
            requestedEstimatedResidentMemoryBytes: 8,
            activeEstimatedResidentMemoryBytes: 12,
            projectedEstimatedResidentMemoryBytes: 20,
            maxResidentMemoryBytes: 16,
            exceededByBytes: 4,
            localRuntimeReservation,
            unloadCandidateIds: [],
          },
        },
        details: {
          resourcePolicy: {
            outcome: "refuse",
            reason: "Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch.",
          },
        },
      })),
      startChildRun: vi.fn(),
    };
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        resolveModelRuntimeProfile: (modelId) => {
          if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return configuredLocalProfile;
          return resolveAmbientModelRuntimeProfile(modelId);
        },
        runtime,
      });

      await expect(executeTool(tool, "spawn-local-capacity-denied", {
        action: "spawn_agent",
        task: "Summarize this text locally.",
        roleId: "summarizer",
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        toolScope: { requestedCategories: ["artifact.read"] },
        idempotencyKey: "spawn:local-capacity-denied",
      })).rejects.toThrow(/capacity preflight failed/);

      expect(runtime.preflightChildLaunch).toHaveBeenCalledWith(expect.objectContaining({
        model: expect.objectContaining({
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          locality: "local",
        }),
        canonicalTaskPath: "root/0:summarizer",
        idempotencyKey: "spawn:local-capacity-denied",
      }));
      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      const [failure] = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
      expect(failure).toMatchObject({
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        idempotencyKey: "spawn:local-capacity-denied",
        parentMessageId: assistant.id,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "capacity",
          reason: expect.stringContaining("Projected local-model resident memory exceeds"),
          runtimeLaunchPreflight: expect.objectContaining({
            schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
            runtime: "local_text",
            allowed: true,
            capacity: {
              localMemory: expect.objectContaining({
                outcome: "refuse",
                allowed: false,
                localRuntimeReservation: expect.objectContaining({
                  schemaVersion: "ambient-subagent-local-runtime-reservation-v1",
                  runtimeId: "local-text-runtime",
                  requestedLaunchId: "spawn:local-capacity-denied:root/0:summarizer",
                  canonicalTaskPath: "root/0:summarizer",
                  idempotencyKey: "spawn:local-capacity-denied",
                  modelProfileId: configuredLocalProfile.profileId,
                  memoryEstimateSource: "launch_descriptor",
                }),
              }),
            },
          }),
          capacityLease: expect.objectContaining({
            schemaVersion: "ambient-subagent-capacity-lease-v1",
            status: "blocked",
            localMemory: expect.objectContaining({
              outcome: "refuse",
              allowed: false,
            }),
          }),
        }),
      });
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        spawnAttempts: 1,
        failedSpawns: 1,
      });
    } finally {
      store.close();
    }
  });

  it("records runtime-resolved model profiles for configured local sub-agent launches", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const configuredLocalProfile: AmbientModelRuntimeProfile = {
        ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
        profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
        selectableAsSubagent: true,
        available: true,
        unavailableReason: undefined,
        providerQuirks: ["Resolved from an active local runtime descriptor."],
      };
      const runtimeSnapshots: unknown[] = [];
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        resolveModelRuntimeProfile: (modelId) => {
          if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return configuredLocalProfile;
          return resolveAmbientModelRuntimeProfile(modelId);
        },
        runtime: {
          startChildRun: ({ run }) => {
            runtimeSnapshots.push(run.modelRuntimeSnapshot);
            return { started: true, run: store.markSubagentRunStatus(run.id, "running") };
          },
        },
      });

      const spawned = await executeTool(tool, "spawn-configured-local", {
        action: "spawn_agent",
        task: "Summarize this text locally.",
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        toolScope: { requestedCategories: ["artifact.read"] },
        idempotencyKey: "spawn:configured-local",
      });
      const runId = (spawned.details as any).run.id as string;
      const run = store.getSubagentRun(runId);

      expect(runtimeSnapshots).toEqual([expect.objectContaining({
        requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
        profile: expect.objectContaining({
          profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          available: true,
          selectableAsSubagent: true,
          locality: "local",
          toolUse: "none",
        }),
      })]);
      expect(run.modelRuntimeSnapshot).toMatchObject({
        requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
        profile: {
          profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
          available: true,
          locality: "local",
        },
      });
      expect(resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL).available).toBe(false);
      expect(store.listSubagentToolScopeSnapshots(runId)[0].scope).toMatchObject({
        loadedCategories: ["artifact.read"],
        piVisibleCategories: ["artifact.read"],
        deniedCategories: [],
      });
      expect((spawned.details as any).modelScope).toMatchObject({
        source: "caller_override",
        selectedModelId: AMBIENT_LOCAL_TEXT_MODEL,
        profile: {
          profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
          locality: "local",
        },
        candidateDiagnostics: [
          expect.objectContaining({
            source: "caller_override",
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
            selected: true,
            eligible: true,
          }),
        ],
      });
    } finally {
      store.close();
    }
  });

  it("falls back to the role default when the parent model is not sub-agent eligible", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent", workspacePath, { model: "custom/unregistered-model" });
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-parent-model-fallback", {
        action: "spawn_agent",
        task: "Inspect without inheriting the unknown parent model.",
        idempotencyKey: "spawn:parent-model-fallback",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);

      expect(parent.model).toBe("custom/unregistered-model");
      expect(run.modelRuntimeSnapshot).toMatchObject({
        requestedModelId: AMBIENT_DEFAULT_MODEL,
        profile: {
          modelId: AMBIENT_DEFAULT_MODEL,
          selectableAsSubagent: true,
        },
      });
      expect((spawned.details as any).modelScope).toMatchObject({
        source: "role_default",
        parentModelId: "custom/unregistered-model",
        selectedModelId: AMBIENT_DEFAULT_MODEL,
        warnings: [expect.stringContaining("not eligible")],
        candidateDiagnostics: [
          expect.objectContaining({
            source: "parent_fallback",
            modelId: "custom/unregistered-model",
            profileId: "unknown:custom/unregistered-model",
            selected: false,
            eligible: false,
          }),
          expect.objectContaining({
            source: "role_default",
            modelId: AMBIENT_DEFAULT_MODEL,
            selected: true,
            eligible: true,
          }),
        ],
      });
      expect(store.listSubagentRunEvents(run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.spawn_requested",
          preview: expect.objectContaining({
            modelScope: expect.objectContaining({
              source: "role_default",
              parentModelId: "custom/unregistered-model",
            }),
          }),
        }),
      ]));
    } finally {
      store.close();
    }
  });

  it("hands spawned runs to runtime start and wait hooks", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const startedRunIds: string[] = [];
      const runtimeToolScopeSnapshotSequences: number[] = [];
      const runtimeUpdates: unknown[] = [];
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run, toolScopeSnapshot, emitEvent }) => {
            startedRunIds.push(run.id);
            runtimeToolScopeSnapshotSequences.push(toolScopeSnapshot.sequence);
            emitEvent({
              type: "started",
              source: "child_runtime",
              status: "running",
              message: "Runtime accepted child execution.",
            });
            return { started: true, run: store.markSubagentRunStatus(run.id, "running") };
          },
          waitForChildRun: ({ run, emitEvent }) => {
            emitEvent({
              type: "assistant_delta",
              textPreview: "Working note from child runtime.",
            });
            const completed = store.markSubagentRunStatus(run.id, "completed", {
              resultArtifact: {
                schemaVersion: "ambient-subagent-result-artifact-v1",
                runId: run.id,
                status: "completed",
                partial: false,
                summary: "done",
                childThreadId: run.childThreadId,
                structuredOutput: structuredResult("explorer", "done"),
              },
            });
            emitEvent({
              type: "completed",
              status: "completed",
              message: "Child runtime completed with a result artifact.",
            });
            return {
              timedOut: false,
              run: completed,
            };
          },
        },
      });

      const spawned = await executeTool(tool, "spawn-runtime", {
        action: "spawn_agent",
        task: "Check a small thing.",
        idempotencyKey: "spawn:runtime",
      }, (update) => runtimeUpdates.push(update));
      const runId = (spawned.details as any).run.id as string;
      expect(startedRunIds).toEqual([runId]);
      expect(runtimeToolScopeSnapshotSequences).toEqual([1]);
      expect((spawned.details as any).orchestrationStarted).toBe(true);
      expect(store.getSubagentRun(runId).status).toBe("running");
      expect(runtimeUpdates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            type: "subagent.runtime_event",
            event: expect.objectContaining({
              type: "started",
              runId,
              status: "running",
            }),
          }),
        }),
      ]));

      const waited = await executeTool(tool, "wait-runtime", {
        action: "wait_agent",
        childRunId: runId,
        idempotencyKey: "wait:runtime-completed",
        wait: { timeoutMs: 1 },
      }, (update) => runtimeUpdates.push(update));
      expect((waited.details as any).status).toBe("completed");
      expect((waited.details as any).waitSatisfied).toBe(true);
      expect((waited.details as any).synthesisAllowed).toBe(true);
      expect((waited.details as any).mailboxEventCount).toBe(2);
      expect((waited.details as any).waitCompletionMailbox).toMatchObject({
        runId,
        direction: "child_to_parent",
        type: "subagent.wait_completed",
        deliveryState: "delivered",
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [runId],
        dependencyMode: "optional_background",
        status: "satisfied",
      });
      expect((waited.details as any).groupedCompletionNotification).toMatchObject({
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        type: "subagent.grouped_completion",
        deliveryState: "queued",
        notificationCount: 1,
        childRunIds: [runId],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.grouped_completion",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            parentMessageId: assistant.id,
            notificationCount: 1,
            childRuns: [expect.objectContaining({ runId, status: "completed", summary: "done" })],
          }),
        }),
      ]);
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toHaveLength(1);
      expect(store.getSubagentRun(runId).resultArtifact).toMatchObject({ summary: "done" });
      expect((waited.details as any).structuredOutputValidation).toMatchObject({
        valid: true,
        synthesisAllowed: true,
      });
      expect(store.listSubagentMailboxEvents(runId).map((event) => event.type)).toEqual([
        "subagent.task",
        "subagent.wait_completed",
      ]);
      const waitReplay = await executeTool(tool, "wait-runtime-replay", {
        action: "wait_agent",
        childRunId: runId,
        idempotencyKey: "wait:runtime-completed",
        wait: { timeoutMs: 1 },
      });
      expect((waitReplay.details as any).waitCompletionMailbox.id).toBe((waited.details as any).waitCompletionMailbox.id);
      expect(store.listSubagentMailboxEvents(runId).filter((event) => event.type === "subagent.wait_completed")).toHaveLength(1);
      const runtimeEvents = store.listSubagentRunEvents(runId)
        .filter((event) => event.type === "subagent.runtime_event")
        .map((event) => event.preview as any);
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "started",
          source: "child_runtime",
          runId,
          parentRunId: parentRun.id,
          childThreadId: store.getSubagentRun(runId).childThreadId,
          status: "running",
        }),
        expect.objectContaining({
          type: "assistant_delta",
          source: "wait_agent",
          textPreview: "Working note from child runtime.",
        }),
        expect.objectContaining({
          type: "completed",
          source: "wait_agent",
          status: "completed",
        }),
      ]);
      expect(runtimeUpdates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            type: "subagent.runtime_event",
            event: expect.objectContaining({
              type: "completed",
              runId,
              status: "completed",
            }),
          }),
        }),
      ]));
    } finally {
      store.close();
    }
  });

  it("surfaces turn-budget wrap-up state in status_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 7; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "started",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const status = await executeTool(tool, "status-turn-budget", {
        action: "status_agent",
        childRunId: run.id,
      });

      expect(status.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("turnBudgetAction: steer_wrap_up"),
      });
      expect((status.details as any).turnBudgetState).toMatchObject({
        state: "wrap_up_due",
        startedTurnCount: 7,
        observedTurnCount: 7,
        shouldSteerWrapUp: true,
        exhausted: false,
        reason: "wrap_up_turn_reached",
        policy: {
          maxTurns: 8,
          wrapUpAtTurn: 7,
          terminalStatusOnExhaustion: "aborted_partial",
        },
      });
    } finally {
      store.close();
    }
  });

  it("surfaces turn-budget wrap-up steering evidence in wait_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 7; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "started",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const waited = await executeTool(tool, "wait-turn-budget-wrap-up", {
        action: "wait_agent",
        childRunId: run.id,
        wait: { timeoutMs: 1 },
      });

      expect(waited.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("a wrap-up follow-up is queued for the child"),
      });
      expect((waited.details as any).turnBudgetWrapUpSteering).toMatchObject({
        schemaVersion: "ambient-subagent-turn-budget-wrap-up-recorder-v1",
        replay: false,
        mailboxEvent: {
          runId: run.id,
          direction: "parent_to_child",
          type: "subagent.followup",
          deliveryState: "queued",
        },
        runEvent: {
          runId: run.id,
          type: "subagent.followup_agent.queued",
        },
      });
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([
        expect.objectContaining({
          type: "subagent.followup",
          payload: expect.objectContaining({
            steeringReason: "turn_budget_wrap_up",
            turnBudgetState: expect.objectContaining({ state: "wrap_up_due" }),
          }),
        }),
      ]);

      const replay = await executeTool(tool, "wait-turn-budget-wrap-up-replay", {
        action: "wait_agent",
        childRunId: run.id,
        wait: { timeoutMs: 1 },
      });

      expect((replay.details as any).turnBudgetWrapUpSteering).toMatchObject({
        replay: true,
        mailboxEvent: { id: (waited.details as any).turnBudgetWrapUpSteering.mailboxEvent.id },
      });
      expect(store.listSubagentMailboxEvents(run.id).filter((event) => event.type === "subagent.followup")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("surfaces turn-budget exhaustion settlement evidence in wait_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 8; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "completed",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const waited = await executeTool(tool, "wait-turn-budget-exhaustion", {
        action: "wait_agent",
        childRunId: run.id,
        wait: { timeoutMs: 1 },
      });

      expect(waited.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("settled as aborted_partial"),
      });
      expect((waited.details as any).status).toBe("aborted_partial");
      expect((waited.details as any).turnBudgetState).toMatchObject({
        state: "exhausted",
        completedTurnCount: 8,
        exhausted: true,
        reason: "max_turns_exceeded",
      });
      expect((waited.details as any).turnBudgetExhaustionSettlement).toMatchObject({
        schemaVersion: "ambient-subagent-turn-budget-exhaustion-recorder-v1",
        replay: false,
        status: "aborted_partial",
        partial: true,
        artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
        mailboxEvent: {
          runId: run.id,
          direction: "child_to_parent",
          type: "subagent.result",
          deliveryState: "delivered",
        },
        parentMailboxEvent: {
          type: "subagent.lifecycle_interrupted",
        },
        runEvent: {
          runId: run.id,
          type: "subagent.turn_budget_exhausted",
          artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
        },
      });
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect(store.getSubagentRun(run.id)).toMatchObject({
        status: "aborted_partial",
        resultArtifact: expect.objectContaining({
          status: "aborted_partial",
          partial: true,
          artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
        }),
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            source: "max_turns_exceeded",
            childRunId: run.id,
            status: "aborted_partial",
          }),
        }),
      ]));
    } finally {
      store.close();
    }
  });

  it("surfaces turn-budget wrap-up runtime delivery evidence in wait_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtimeUpdates: unknown[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 7; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "started",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const followupChildRun = vi.fn(({ run: childRun, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent }) => {
        markMailboxDelivered("2026-06-07T00:01:10.000Z");
        emitEvent({
          type: "status",
          source: "followup_agent",
          status: childRun.status,
          message: `Delivered wrap-up through ${mailboxEvent.id}.`,
        });
        const consumed = markMailboxConsumed("2026-06-07T00:01:11.000Z");
        return {
          accepted: true,
          run: store.getSubagentRun(childRun.id),
          mailboxEvent: consumed,
          message: "Runtime accepted automatic wrap-up follow-up.",
        };
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          followupChildRun,
        },
      });

      const waited = await executeTool(tool, "wait-turn-budget-wrap-up-delivery", {
        action: "wait_agent",
        childRunId: run.id,
        wait: { timeoutMs: 1 },
      }, (update) => runtimeUpdates.push(update));

      expect(followupChildRun).toHaveBeenCalledTimes(1);
      expect(waited.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("the wrap-up follow-up was delivered to the child runtime"),
      });
      expect((waited.details as any).turnBudgetWrapUpSteering).toMatchObject({
        mailboxEvent: {
          type: "subagent.followup",
          deliveryState: "consumed",
          deliveredAt: "2026-06-07T00:01:10.000Z",
        },
      });
      expect((waited.details as any).turnBudgetWrapUpDelivery).toMatchObject({
        accepted: true,
        message: "Runtime accepted automatic wrap-up follow-up.",
        run: { id: run.id },
        mailboxEvent: {
          type: "subagent.followup",
          deliveryState: "consumed",
          deliveredAt: "2026-06-07T00:01:10.000Z",
        },
      });
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([
        expect.objectContaining({
          type: "subagent.followup",
          deliveryState: "consumed",
          deliveredAt: "2026-06-07T00:01:10.000Z",
        }),
      ]);
      expect(runtimeUpdates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            type: "subagent.runtime_event",
            event: expect.objectContaining({
              type: "status",
              source: "followup_agent",
              message: expect.stringContaining("Delivered wrap-up through"),
            }),
          }),
        }),
      ]));
    } finally {
      store.close();
    }
  });

  it("persists runtime events when Pi update callbacks are no longer active", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run, emitEvent }) => {
            emitEvent({
              type: "started",
              source: "child_runtime",
              status: "running",
              message: "Runtime accepted child execution.",
            });
            return { started: true, run: store.markSubagentRunStatus(run.id, "running") };
          },
        },
      });

      const spawned = await executeTool(tool, "spawn-stale-update", {
        action: "spawn_agent",
        task: "Start a child whose update listener has gone stale.",
        idempotencyKey: "spawn:stale-update",
      }, (update) => {
        if ((update.details as any)?.type === "subagent.runtime_event") {
          return Promise.reject(new Error("Agent listener invoked outside active run"));
        }
      });
      const runId = (spawned.details as any).run.id as string;
      await Promise.resolve();

      expect(store.listSubagentRunEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_event",
          preview: expect.objectContaining({
            type: "started",
            status: "running",
          }),
        }),
      ]));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Agent listener invoked outside active run"));
    } finally {
      warn.mockRestore();
      store.close();
    }
  });

  it("keeps failed child waits out of parent synthesis", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "running") }),
          waitForChildRun: ({ run }) => ({
            timedOut: false,
            run: store.markSubagentRunStatus(run.id, "failed", {
              resultArtifact: {
                schemaVersion: "ambient-subagent-result-artifact-v1",
                runId: run.id,
                status: "failed",
                partial: false,
                summary: "child failed",
                childThreadId: run.childThreadId,
              },
            }),
          }),
        },
      });

      const spawned = await executeTool(tool, "spawn-failing-runtime", {
        action: "spawn_agent",
        task: "Check a failing branch.",
        dependencyMode: "required",
        idempotencyKey: "spawn:failing-runtime",
      });
      const runId = (spawned.details as any).run.id as string;

      const waited = await executeTool(tool, "wait-failing-runtime", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any).status).toBe("failed");
      expect((waited.details as any).waitSatisfied).toBe(true);
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).parentResolution).toMatchObject({
        schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: true,
        failurePolicy: "degrade_partial",
        barrierStatus: "failed",
      });
      expect((waited.content[0] as any).text).toContain("parentAction: ask_user");
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [runId],
        dependencyMode: "required_all",
        status: "failed",
      });
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("surfaces child approval-response delivery evidence from wait_agent", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const resolveChildApprovalResponse = vi.fn(({ run, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent }) => {
        markMailboxDelivered("2026-06-06T00:01:00.000Z");
        emitEvent({
          type: "status",
          source: "approval_response",
          status: "running",
          message: `Delivered approval response ${mailboxEvent.id}.`,
        });
        const consumed = markMailboxConsumed("2026-06-06T00:01:01.000Z");
        const running = store.markSubagentRunStatus(run.id, "running");
        return {
          run: running,
          accepted: true,
          mailboxEvent: consumed,
          message: "Runtime resumed child approval waiter.",
        };
      });
      const waitForChildRun = vi.fn(({ run }) => ({ run, timedOut: false }));
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "needs_attention") }),
          waitForChildRun,
          resolveChildApprovalResponse,
        },
      });

      const spawned = await executeTool(tool, "spawn-approval-response", {
        action: "spawn_agent",
        task: "Attempt a write that needs parent approval.",
        idempotencyKey: "spawn:approval-response",
      });
      const runId = (spawned.details as any).run.id as string;
      store.appendSubagentMailboxEvent(runId, {
        direction: "parent_to_child",
        type: "subagent.approval_response",
        payload: {
          schemaVersion: "ambient-subagent-approval-bridge-v1",
          idempotencyKey: "approval-response:key",
          childRunId: runId,
          childThreadId: store.getSubagentRun(runId).childThreadId,
          approvalId: "approval-child-write",
          decision: "approved",
          effectiveScope: "this_child_thread",
          resumeParentBlocking: true,
        },
      });

      const waited = await executeTool(tool, "wait-approval-response", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect(resolveChildApprovalResponse).toHaveBeenCalledTimes(1);
      expect(waitForChildRun).toHaveBeenCalledWith(expect.objectContaining({
        run: expect.objectContaining({ id: runId, status: "running" }),
      }));
      expect((waited.details as any)).toMatchObject({
        status: "running",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice: "Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result.",
        approvalResponseDeliveries: [
          {
            accepted: true,
            message: "Runtime resumed child approval waiter.",
            mailboxEvent: {
              type: "subagent.approval_response",
              deliveryState: "consumed",
              deliveredAt: "2026-06-06T00:01:00.000Z",
            },
          },
        ],
      });
      expect((waited.details as any).approvalResponsePendingEvents).toBeUndefined();
      expect(store.listSubagentMailboxEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.approval_response",
          deliveryState: "consumed",
          deliveredAt: "2026-06-06T00:01:00.000Z",
        }),
      ]));
    } finally {
      store.close();
    }
  });

  it("keeps required_all barriers blocked until every child has a synthesis-safe result", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const completed = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Completed child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const pending = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Pending child",
        roleId: "explorer",
        canonicalTaskPath: "root/1:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(completed.id, "completed", {
        resultArtifact: explorerResultArtifact(completed.id, completed.childThreadId, "Completed child result."),
      });
      store.markSubagentRunStatus(pending.id, "running");
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [completed.id, pending.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const firstWait = await executeTool(tool, "wait-required-all-one-complete", {
        action: "wait_agent",
        childRunId: completed.id,
      });

      expect((firstWait.details as any).synthesisAllowed).toBe(false);
      expect((firstWait.details as any).waitSatisfied).toBe(false);
      expect((firstWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "required_all",
        status: "waiting_on_children",
      });
      expect((firstWait.details as any).waitBarrierEvaluation).toMatchObject({
        schemaVersion: "ambient-subagent-wait-barrier-evaluation-v1",
        dependencyMode: "required_all",
        requiredSynthesisCount: 2,
        validSynthesisCount: 1,
        synthesisAllowed: false,
        activeChildRunIds: [pending.id],
      });
      expect((firstWait.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "wait_for_child",
        canSynthesize: false,
        reason: expect.stringContaining("required_all barrier is still waiting"),
      });
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "waiting_on_children",
      });

      store.markSubagentRunStatus(pending.id, "completed", {
        resultArtifact: explorerResultArtifact(pending.id, pending.childThreadId, "Pending child finished."),
      });
      const secondWait = await executeTool(tool, "wait-required-all-complete", {
        action: "wait_agent",
        childRunId: pending.id,
      });

      expect((secondWait.details as any).synthesisAllowed).toBe(true);
      expect((secondWait.details as any).waitSatisfied).toBe(true);
      expect((secondWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "required_all",
        status: "satisfied",
      });
      expect((secondWait.details as any).waitBarrierEvaluation).toMatchObject({
        requiredSynthesisCount: 2,
        validSynthesisCount: 2,
        synthesisAllowed: true,
        partial: false,
      });
      expect((secondWait.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "synthesize",
        canSynthesize: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: true,
        waitBarrierEvaluation: expect.objectContaining({
          requiredSynthesisCount: 2,
          validSynthesisCount: 2,
        }),
      });
    } finally {
      store.close();
    }
  });

  it("allows required_any barriers from one validated child while preserving unsafe sibling provenance", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const winner = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Winner child",
        roleId: "explorer",
        canonicalTaskPath: "root/winner:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const failed = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Failed child",
        roleId: "explorer",
        canonicalTaskPath: "root/failed:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(winner.id, "completed", {
        resultArtifact: explorerResultArtifact(winner.id, winner.childThreadId, "Winner child result."),
      });
      store.markSubagentRunStatus(failed.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: failed.id,
          status: "failed",
          partial: false,
          summary: "Sibling failed.",
          childThreadId: failed.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [winner.id, failed.id],
        dependencyMode: "required_any",
        failurePolicy: "ask_user",
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const waited = await executeTool(tool, "wait-required-any-winner", {
        action: "wait_agent",
        childRunId: winner.id,
      });

      expect((waited.details as any).synthesisAllowed).toBe(true);
      expect((waited.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "required_any",
        status: "satisfied",
      });
      expect((waited.details as any).waitBarrierEvaluation).toMatchObject({
        dependencyMode: "required_any",
        requiredSynthesisCount: 1,
        validSynthesisCount: 1,
        terminalUnsafeChildRunIds: [failed.id],
        synthesisAllowed: true,
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "synthesize",
        canSynthesize: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
        childStatuses: [
          { childRunId: winner.id, status: "completed" },
          { childRunId: failed.id, status: "failed" },
        ],
        synthesisAllowed: true,
        waitBarrierEvaluation: expect.objectContaining({
          terminalUnsafeChildRunIds: [failed.id],
        }),
      });
    } finally {
      store.close();
    }
  });

  it("uses persisted quorum thresholds instead of implicit majority defaults", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const childRuns = ["one", "two", "three", "four"].map((label, index) =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Quorum child ${label}`,
          roleId: "explorer",
          canonicalTaskPath: `root/${index}:explorer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        })
      );
      store.markSubagentRunStatus(childRuns[0].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[0].id, childRuns[0].childThreadId, "First valid child."),
      });
      store.markSubagentRunStatus(childRuns[1].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[1].id, childRuns[1].childThreadId, "Second valid child."),
      });
      store.markSubagentRunStatus(childRuns[2].id, "running");
      store.markSubagentRunStatus(childRuns[3].id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: childRuns[3].id,
          status: "failed",
          partial: false,
          summary: "Fourth child failed.",
          childThreadId: childRuns[3].childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "quorum",
        failurePolicy: "ask_user",
        quorumThreshold: 3,
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const firstWait = await executeTool(tool, "wait-quorum-two-of-three", {
        action: "wait_agent",
        childRunId: childRuns[0].id,
      });

      expect((firstWait.details as any).synthesisAllowed).toBe(false);
      expect((firstWait.details as any).waitSatisfied).toBe(false);
      expect((firstWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "quorum",
        quorumThreshold: 3,
        status: "waiting_on_children",
      });
      expect((firstWait.details as any).waitBarrierEvaluation).toMatchObject({
        dependencyMode: "quorum",
        quorumThreshold: 3,
        requiredSynthesisCount: 3,
        validSynthesisCount: 2,
        synthesisAllowed: false,
        activeChildRunIds: [childRuns[2].id],
        terminalUnsafeChildRunIds: [childRuns[3].id],
      });

      store.markSubagentRunStatus(childRuns[2].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[2].id, childRuns[2].childThreadId, "Third valid child."),
      });
      const secondWait = await executeTool(tool, "wait-quorum-three-of-three", {
        action: "wait_agent",
        childRunId: childRuns[2].id,
      });

      expect((secondWait.details as any).synthesisAllowed).toBe(true);
      expect((secondWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "quorum",
        quorumThreshold: 3,
        status: "satisfied",
      });
      expect((secondWait.details as any).waitBarrierEvaluation).toMatchObject({
        quorumThreshold: 3,
        requiredSynthesisCount: 3,
        validSynthesisCount: 3,
        terminalUnsafeChildRunIds: [childRuns[3].id],
        synthesisAllowed: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: true,
        waitBarrierEvaluation: expect.objectContaining({
          quorumThreshold: 3,
          requiredSynthesisCount: 3,
          validSynthesisCount: 3,
        }),
      });
    } finally {
      store.close();
    }
  });

  it("creates Pi-reachable aggregate wait barriers with explicit quorum thresholds", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const childRuns = ["first", "second", "third"].map((label, index) =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Aggregate ${label}`,
          roleId: "explorer",
          canonicalTaskPath: `root/${index}:explorer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        })
      );
      store.markSubagentRunStatus(childRuns[0].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[0].id, childRuns[0].childThreadId, "First quorum result."),
      });
      store.markSubagentRunStatus(childRuns[1].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[1].id, childRuns[1].childThreadId, "Second quorum result."),
      });
      store.markSubagentRunStatus(childRuns[2].id, "running");
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "wait-quorum-missing-threshold", {
        action: "wait_agent",
        childRunIds: childRuns.map((run) => run.id),
        waitBarrierMode: "quorum",
      })).rejects.toThrow(/explicit integer quorumThreshold/);

      const waited = await executeTool(tool, "wait-quorum-from-pi", {
        action: "wait_agent",
        childRunIds: childRuns.map((run) => run.id),
        childRunId: childRuns[0].id,
        waitBarrierMode: "quorum",
        quorumThreshold: 2,
        failurePolicy: "ask_user",
      });

      const [barrier] = store.listSubagentWaitBarriersForParentRun(parentRun.id);
      expect(barrier).toMatchObject({
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "quorum",
        quorumThreshold: 2,
        failurePolicy: "ask_user",
        status: "satisfied",
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "quorum",
        quorumThreshold: 2,
        status: "satisfied",
      });
      expect((waited.details as any).waitChildRuns).toHaveLength(3);
      expect((waited.details as any).waitBarrierEvaluation).toMatchObject({
        dependencyMode: "quorum",
        quorumThreshold: 2,
        requiredSynthesisCount: 2,
        validSynthesisCount: 2,
        activeChildRunIds: [childRuns[2].id],
        synthesisAllowed: true,
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "synthesize",
        canSynthesize: true,
      });

      const replay = await executeTool(tool, "wait-quorum-from-pi-replay", {
        action: "wait_agent",
        childRunIds: childRuns.map((run) => run.id),
        waitBarrierMode: "quorum",
        quorumThreshold: 2,
        failurePolicy: "ask_user",
      });

      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toHaveLength(1);
      expect((replay.details as any).waitBarrier).toMatchObject({ id: barrier.id, status: "satisfied" });
    } finally {
      store.close();
    }
  });

  it("maps required wait-barrier failure policies to deterministic parent resolutions", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });
      const cases = [
        { failurePolicy: "fail_parent", action: "fail_parent", requiresUserInput: false, requiresExplicitPartial: false },
        { failurePolicy: "retry_child", action: "retry_child", requiresUserInput: false, requiresExplicitPartial: false },
        { failurePolicy: "ask_user", action: "ask_user", requiresUserInput: true, requiresExplicitPartial: false },
        { failurePolicy: "degrade_partial", action: "ask_user", requiresUserInput: true, requiresExplicitPartial: true },
      ] as const;

      for (const policyCase of cases) {
        const child = store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Child ${policyCase.failurePolicy}`,
          roleId: "reviewer",
          canonicalTaskPath: `root/${policyCase.failurePolicy}:reviewer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        });
        store.markSubagentRunStatus(child.id, "failed", {
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: child.id,
            status: "failed",
            partial: false,
            summary: "child failed",
            childThreadId: child.childThreadId,
          },
        });
        store.createSubagentWaitBarrier({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childRunIds: [child.id],
          dependencyMode: "required_all",
          failurePolicy: policyCase.failurePolicy,
        });

        const waited = await executeTool(tool, `wait-${policyCase.failurePolicy}`, {
          action: "wait_agent",
          childRunId: child.id,
          wait: { timeoutMs: 1 },
        });

        expect((waited.details as any).parentResolution).toMatchObject({
          schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
          status: "blocked",
          action: policyCase.action,
          canSynthesize: false,
          requiresUserInput: policyCase.requiresUserInput,
          requiresExplicitPartial: policyCase.requiresExplicitPartial,
          failurePolicy: policyCase.failurePolicy,
          barrierStatus: "failed",
          childRunId: child.id,
          childStatus: "failed",
        });
        expect((waited.content[0] as any).text).toContain(`parentAction: ${policyCase.action}`);
        expect((waited.content[0] as any).text).toContain("canSynthesize: false");
        expect((waited.details as any).waitBarrierAttentionParentMailbox).toMatchObject({
          type: "subagent.wait_barrier_attention",
          parentMessageId: assistant.id,
          childRunIds: [child.id],
        });
      }
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_attention")).toHaveLength(cases.length);
    } finally {
      store.close();
    }
  });

  it("records timed-out required wait barriers in the parent mailbox idempotently", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Slow child",
        roleId: "reviewer",
        canonicalTaskPath: "root/slow:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "running");
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "degrade_partial",
        timeoutMs: 1,
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          waitForChildRun: ({ run }) => ({ timedOut: true, run }),
        },
      });

      const waited = await executeTool(tool, "wait-slow-child", {
        action: "wait_agent",
        childRunId: child.id,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any).waitTimedOut).toBe(true);
      expect((waited.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        status: "timed_out",
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "wait_for_child",
        canSynthesize: false,
        requiresUserInput: false,
        requiresExplicitPartial: false,
        barrierStatus: "timed_out",
      });
      expect((waited.details as any).waitBarrierAttentionParentMailbox).toMatchObject({
        type: "subagent.wait_barrier_attention",
        parentMessageId: assistant.id,
        childRunIds: [child.id],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.wait_barrier_attention",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            waitTimedOut: true,
            barrierStatus: "timed_out",
            failurePolicy: "degrade_partial",
            allowedUserChoices: expect.arrayContaining([
              expect.objectContaining({ id: "wait_again" }),
              expect.objectContaining({ id: "send_child_steering" }),
              expect.objectContaining({ id: "cancel_parent" }),
            ]),
          }),
        }),
      ]);

      const replay = await executeTool(tool, "wait-slow-child-replay", {
        action: "wait_agent",
        childRunId: child.id,
        wait: { timeoutMs: 1 },
      });
      expect((replay.details as any).waitBarrierAttentionParentMailbox).toMatchObject({
        type: "subagent.wait_barrier_attention",
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_attention")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records user-approved partial barrier decisions before allowing parent partial synthesis", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Failed child",
        roleId: "reviewer",
        canonicalTaskPath: "root/failed:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "failed",
          partial: false,
          summary: "child failed",
          childThreadId: child.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "degrade_partial",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "failed" }],
          synthesisAllowed: false,
        },
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const resolved = await executeTool(tool, "resolve-partial", {
        action: "resolve_barrier",
        waitBarrierId: barrier.id,
        decision: "continue_with_partial",
        userDecision: "User approved continuing without the failed reviewer.",
        partialSummary: "Reviewer branch failed; parent may answer using only verified parent context.",
        idempotencyKey: "barrier:partial",
      });

      expect((resolved.details as any).status).toBe("satisfied");
      expect((resolved.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "continue_with_explicit_partial",
        canSynthesize: true,
        requiresExplicitPartial: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "satisfied",
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: true,
          explicitPartial: true,
          userDecision: expect.objectContaining({
            schemaVersion: "ambient-subagent-user-decision-v1",
            decision: "continue_with_partial",
            userDecision: "User approved continuing without the failed reviewer.",
          }),
        }),
      });
      expect(store.listSubagentRunEvents(child.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.barrier_decision",
          preview: expect.objectContaining({
            waitBarrierId: barrier.id,
            decision: "continue_with_partial",
            idempotencyKey: "barrier:partial",
          }),
        }),
      ]));
      expect(store.listMessages(child.childThreadId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Parent recorded a wait-barrier decision: continue_with_partial."),
        }),
      ]));
      expect((resolved.details as any).parentMailboxEvent).toMatchObject({
        type: "subagent.wait_barrier_decision",
        parentMessageId: assistant.id,
        childRunIds: [child.id],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.wait_barrier_decision",
          parentMessageId: assistant.id,
          idempotencyKey: "barrier:partial",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
            decision: "continue_with_partial",
            partialSummaryPreview: "Reviewer branch failed; parent may answer using only verified parent context.",
          }),
        }),
      ]);

      const waited = await executeTool(tool, "wait-after-partial", {
        action: "wait_agent",
        childRunId: child.id,
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "continue_with_explicit_partial",
        canSynthesize: true,
        requiresExplicitPartial: true,
      });
      expect((waited.content[0] as any).text).toContain("parentAction: continue_with_explicit_partial");

      const replay = await executeTool(tool, "resolve-partial-replay", {
        action: "resolve_barrier",
        waitBarrierId: barrier.id,
        decision: "continue_with_partial",
        userDecision: "User approved continuing without the failed reviewer.",
        partialSummary: "Reviewer branch failed; parent may answer using only verified parent context.",
        idempotencyKey: "barrier:partial",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentRunEvents(child.id).filter((event) => event.type === "subagent.barrier_decision")).toHaveLength(1);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_decision")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records retry and fail barrier decisions without satisfying the barrier", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });
      const cases = [
        { decision: "retry_child", status: "waiting_on_children", action: "retry_child" },
        { decision: "fail_parent", status: "failed", action: "fail_parent" },
      ] as const;

      for (const policyCase of cases) {
        const child = store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Child ${policyCase.decision}`,
          roleId: "reviewer",
          canonicalTaskPath: `root/${policyCase.decision}:reviewer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        });
        store.markSubagentRunStatus(child.id, "failed", {
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: child.id,
            status: "failed",
            partial: false,
            summary: "child failed",
            childThreadId: child.childThreadId,
          },
        });
        const barrier = store.createSubagentWaitBarrier({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childRunIds: [child.id],
          dependencyMode: "required_all",
          failurePolicy: policyCase.decision === "retry_child" ? "retry_child" : "fail_parent",
        });
        store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
          resolutionArtifact: {
            schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
            childRunIds: [child.id],
            childStatuses: [{ childRunId: child.id, status: "failed" }],
            synthesisAllowed: false,
          },
        });

        const resolved = await executeTool(tool, `resolve-${policyCase.decision}`, {
          action: "resolve_barrier",
          waitBarrierId: barrier.id,
          decision: policyCase.decision,
          idempotencyKey: `barrier:${policyCase.decision}`,
        });

        expect((resolved.details as any).waitBarrier).toMatchObject({
          id: barrier.id,
          status: policyCase.status,
        });
        expect((resolved.details as any).parentResolution).toMatchObject({
          status: "blocked",
          action: policyCase.action,
          canSynthesize: false,
        });
        expect((resolved.details as any).parentMailboxEvent).toMatchObject({
          type: "subagent.wait_barrier_decision",
          parentMessageId: assistant.id,
          childRunIds: [child.id],
        });
        expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
          synthesisAllowed: false,
          explicitPartial: false,
          userDecision: expect.objectContaining({
            decision: policyCase.decision,
          }),
        });
      }
    } finally {
      store.close();
    }
  });

  it("rejects cancel_parent barrier decisions whose stated intent is retrying replacement work", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Failed judge",
        roleId: "reviewer",
        canonicalTaskPath: "root/judge:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "failed",
          partial: false,
          summary: "judge failed",
          childThreadId: child.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "failed" }],
          synthesisAllowed: false,
        },
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(executeTool(tool, "resolve-bad-cancel", {
        action: "resolve_barrier",
        waitBarrierId: barrier.id,
        decision: "cancel_parent",
        userDecision: "Cancelling this child to retry with a different role configuration.",
      })).rejects.toThrow("cancel_parent is only for actually stopping the parent run");

      expect(store.getSubagentWaitBarrier(barrier.id).status).toBe("failed");
      expect(store.getSubagentRun(child.id).status).toBe("failed");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_decision")).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("records detach and parent-cancel barrier decisions with child state changes", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const runtimeCancel = vi.fn((input: any) => ({
        cancelled: true,
        run: store.markSubagentRunStatus(input.run.id, "cancelled", {
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: input.run.id,
            status: "cancelled",
            partial: false,
            summary: input.reason,
            childThreadId: input.run.childThreadId,
          },
        }),
      }));
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          cancelChildRun: runtimeCancel,
        },
      });

      const detachedChild = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Detached child",
        roleId: "reviewer",
        canonicalTaskPath: "root/detach:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(detachedChild.id, "running");
      const detachedMailbox = store.appendSubagentMailboxEvent(detachedChild.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Keep working if detached." },
      });
      const detachBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [detachedChild.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      store.updateSubagentWaitBarrierStatus(detachBarrier.id, "timed_out", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [detachedChild.id],
          childStatuses: [{ childRunId: detachedChild.id, status: "running" }],
          timedOut: true,
          synthesisAllowed: false,
        },
      });

      const detached = await executeTool(tool, "resolve-detach", {
        action: "resolve_barrier",
        waitBarrierId: detachBarrier.id,
        decision: "detach_child",
        userDecision: "User wants this child to continue separately.",
        idempotencyKey: "barrier:detach",
      });

      expect((detached.details as any).waitBarrier).toMatchObject({
        id: detachBarrier.id,
        status: "failed",
      });
      expect((detached.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "detach_child",
        canSynthesize: false,
      });
      expect(store.getSubagentRun(detachedChild.id)).toMatchObject({
        status: "detached",
        resultArtifact: expect.objectContaining({
          status: "detached",
          summary: expect.stringContaining("User detached this required child"),
        }),
      });
      expect(store.listSubagentMailboxEvents(detachedChild.id)).toEqual([
        expect.objectContaining({
          id: detachedMailbox.id,
          type: "subagent.followup",
          deliveryState: "queued",
        }),
      ]);
      expect(store.getSubagentWaitBarrier(detachBarrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: false,
        detachedRunIds: [detachedChild.id],
        userDecision: expect.objectContaining({ decision: "detach_child" }),
      });

      const cancelledChild = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Cancelled child",
        roleId: "reviewer",
        canonicalTaskPath: "root/cancel-parent:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(cancelledChild.id, "running");
      const cancelledMailbox = store.appendSubagentMailboxEvent(cancelledChild.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "This will be cancelled." },
      });
      const cancelBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [cancelledChild.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      store.updateSubagentWaitBarrierStatus(cancelBarrier.id, "timed_out", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [cancelledChild.id],
          childStatuses: [{ childRunId: cancelledChild.id, status: "running" }],
          timedOut: true,
          synthesisAllowed: false,
        },
      });

      const cancelled = await executeTool(tool, "resolve-cancel-parent", {
        action: "resolve_barrier",
        waitBarrierId: cancelBarrier.id,
        decision: "cancel_parent",
        userDecision: "User chose to cancel the parent run instead of waiting.",
        idempotencyKey: "barrier:cancel-parent",
      });

      expect(runtimeCancel).toHaveBeenCalledTimes(1);
      expect(runtimeCancel).toHaveBeenCalledWith(expect.objectContaining({
        run: expect.objectContaining({ id: cancelledChild.id }),
        reason: expect.stringContaining("User cancelled the parent path"),
        idempotencyKey: expect.stringContaining("subagent:cancel:"),
      }));
      expect((cancelled.details as any).waitBarrier).toMatchObject({
        id: cancelBarrier.id,
        status: "cancelled",
      });
      expect((cancelled.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "cancel_parent",
        canSynthesize: false,
      });
      expect(store.getSubagentRun(cancelledChild.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: expect.objectContaining({
          status: "cancelled",
          summary: expect.stringContaining("User cancelled the parent path"),
        }),
      });
      expect(store.listSubagentMailboxEvents(cancelledChild.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: cancelledMailbox.id,
          type: "subagent.followup",
          deliveryState: "cancelled",
        }),
        expect.objectContaining({
          type: "subagent.cancelled",
          direction: "child_to_parent",
          deliveryState: "delivered",
        }),
      ]));
      expect(store.getSubagentWaitBarrier(cancelBarrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: false,
        parentCancellationRequested: true,
        cancelledRunIds: [cancelledChild.id],
        cancelledMailboxEventIds: [cancelledMailbox.id],
        userDecision: expect.objectContaining({ decision: "cancel_parent" }),
      });
      const barrierDecisionEvents = store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_decision");
      expect(barrierDecisionEvents).toHaveLength(2);
      expect(barrierDecisionEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          parentMessageId: assistant.id,
          idempotencyKey: "barrier:detach",
          payload: expect.objectContaining({
            decision: "detach_child",
            detachedRunIds: [detachedChild.id],
          }),
        }),
        expect.objectContaining({
          parentMessageId: assistant.id,
          idempotencyKey: "barrier:cancel-parent",
          payload: expect.objectContaining({
            decision: "cancel_parent",
            parentCancellationRequested: true,
            cancelledRunIds: [cancelledChild.id],
            cancelledMailboxEventIds: [cancelledMailbox.id],
          }),
        }),
      ]));

      const replay = await executeTool(tool, "resolve-cancel-parent-replay", {
        action: "resolve_barrier",
        waitBarrierId: cancelBarrier.id,
        decision: "cancel_parent",
        userDecision: "User chose to cancel the parent run instead of waiting.",
        idempotencyKey: "barrier:cancel-parent",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_decision")).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("does not allow synthesis for completed children without a valid result artifact", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "running") }),
          waitForChildRun: ({ run }) => ({
            timedOut: false,
            run: store.markSubagentRunStatus(run.id, "completed"),
          }),
        },
      });

      const spawned = await executeTool(tool, "spawn-missing-artifact", {
        action: "spawn_agent",
        task: "Complete without an artifact.",
        dependencyMode: "required",
        idempotencyKey: "spawn:missing-artifact",
      });
      const runId = (spawned.details as any).run.id as string;

      const waited = await executeTool(tool, "wait-missing-artifact", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any).status).toBe("completed");
      expect((waited.details as any).waitSatisfied).toBe(true);
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).resultValidation).toMatchObject({
        valid: false,
        synthesisAllowed: false,
        reason: "Missing sub-agent result artifact.",
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [runId],
        dependencyMode: "required_all",
        status: "failed",
      });
    } finally {
      store.close();
    }
  });

  it("routes child supervisor requests to parent user steering without synthesis", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer needs steering",
        roleId: "explorer",
        canonicalTaskPath: "root/needs-attention:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const structuredOutput = {
        ...structuredResult("explorer", "Need the parent to choose an approved fixture."),
        status: "needs_attention",
        evidence: [],
        risks: ["Cannot proceed safely until the parent/user chooses the fixture."],
        nextActions: ["Ask the user which fixture to inspect, then send that decision to the child."],
        roleOutput: { findings: [], openQuestions: ["Which fixture should be inspected?"] },
      };
      const waitingChild = store.markSubagentRunStatus(child.id, "needs_attention");
      store.appendSubagentMailboxEvent(child.id, {
        direction: "child_to_parent",
        type: "subagent.needs_attention",
        payload: {
          status: "needs_attention",
          summary: structuredOutput.summary,
          childThreadId: waitingChild.childThreadId,
          structuredOutput,
        },
      });

      const waited = await executeTool(tool, "wait-needs-attention", {
        action: "wait_agent",
        childRunId: child.id,
      });

      expect((waited.details as any).status).toBe("needs_attention");
      expect((waited.details as any).waitSatisfied).toBe(false);
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: false,
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [child.id],
        dependencyMode: "required_all",
        status: "waiting_on_children",
      });
      expect((waited.details as any).resultValidation).toMatchObject({
        valid: false,
        synthesisAllowed: false,
        reason: "Missing sub-agent result artifact.",
      });
      expect((waited.content[0] as any).text).toContain("parentAction: ask_user");
      expect((waited.content[0] as any).text).toContain("send_agent or followup_agent");
      expect((waited.details as any).waitCompletionMailbox).toMatchObject({
        runId: child.id,
        direction: "child_to_parent",
        type: "subagent.wait_completed",
      });
      expect((waited.details as any).waitBarrierAttentionParentMailbox).toMatchObject({
        type: "subagent.wait_barrier_attention",
        parentMessageId: assistant.id,
        childRunIds: [child.id],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.wait_barrier_attention",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            barrierStatus: "waiting_on_children",
            parentResolution: expect.objectContaining({ action: "ask_user" }),
            allowedUserChoices: expect.arrayContaining([
              expect.objectContaining({ id: "send_child_steering" }),
              expect.objectContaining({ id: "retry_child" }),
              expect.objectContaining({ id: "cancel_parent" }),
            ]),
          }),
        }),
      ]);
      expect(store.listSubagentMailboxEvents(child.id)).toEqual([
        expect.objectContaining({
          type: "subagent.needs_attention",
          payload: expect.objectContaining({
            status: "needs_attention",
            summary: structuredOutput.summary,
          }),
        }),
        expect.objectContaining({
          type: "subagent.wait_completed",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-completion-v1",
            status: "needs_attention",
            synthesisAllowed: false,
          }),
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("exposes child supervisor request records from wait_agent as compact Pi-visible handles", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({
            started: true,
            run: store.markSubagentRunStatus(run.id, "running"),
          }),
          waitForChildRun: ({ run }) => {
            const needsAttention = store.markSubagentRunStatus(run.id, "needs_attention");
            return {
              run: needsAttention,
              timedOut: false,
              supervisorRequests: [{
                kind: "need_decision",
                title: "Choose source strategy",
                message: "The child can continue with docs only or inspect source before summarizing.",
                requestedChoices: [
                  { id: "docs-only", label: "Docs only" },
                  { id: "inspect-source", label: "Inspect source" },
                ],
                createdAt: "2026-06-06T00:02:00.000Z",
              }],
            };
          },
        },
      });

      const spawned = await executeTool(tool, "spawn-supervisor-request", {
        action: "spawn_agent",
        task: "Compare source strategies before summarizing.",
        dependencyMode: "required",
        idempotencyKey: "spawn:supervisor-request",
      });
      const runId = (spawned.details as any).run.id as string;
      const waited = await executeTool(tool, "wait-supervisor-request", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any)).toMatchObject({
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice: "Child requested supervisor attention; parent mailbox records the request and the parent remains blocked until the child is synthesis-safe.",
        supervisorRequestRecords: [
          {
            schemaVersion: "ambient-subagent-supervisor-request-v1",
            replay: false,
            kind: "need_decision",
            title: "Choose source strategy",
            parentRequiresAttention: true,
            childMailboxEvent: {
              runId,
              direction: "child_to_parent",
              type: "subagent.supervisor_request",
              deliveryState: "delivered",
            },
            parentMailboxEvent: {
              parentRunId: parentRun.id,
              parentMessageId: assistant.id,
              type: "subagent.child_supervisor_request",
              deliveryState: "queued",
              childRunIds: [runId],
            },
            runEvent: {
              type: "subagent.supervisor_request",
              preview: expect.objectContaining({
                kind: "need_decision",
                completionStatus: "not_complete",
              }),
            },
          },
        ],
      });
      expect((waited.details as any).supervisorRequestRecords[0].childMailboxEvent).not.toHaveProperty("payload");
      expect((waited.details as any).supervisorRequestRecords[0].parentMailboxEvent).not.toHaveProperty("payload");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.child_supervisor_request",
          deliveryState: "queued",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            childRunId: runId,
            kind: "need_decision",
            parentRequiresAttention: true,
            marksChildComplete: false,
          }),
        }),
      ]));

      const supervisorRequestParentMailboxEventId =
        (waited.details as any).supervisorRequestRecords[0].parentMailboxEvent.id as string;
      const followed = await executeTool(tool, "follow-supervisor-request", {
        action: "followup_agent",
        childRunId: runId,
        message: "Use docs only for the first pass.",
        supervisorRequestParentMailboxEventId,
        supervisorChoiceId: "docs-only",
        idempotencyKey: "follow:docs-only-supervisor-request",
      });

      expect((followed.details as any)).toMatchObject({
        status: "queued",
        supervisorChoiceId: "docs-only",
        supervisorRequestAcknowledgement: {
          id: supervisorRequestParentMailboxEventId,
          type: "subagent.child_supervisor_request",
          deliveryState: "consumed",
          childRunIds: [runId],
        },
        mailboxEvent: {
          type: "subagent.followup",
          deliveryState: "queued",
        },
      });
      expect(store.getSubagentParentMailboxEvent(supervisorRequestParentMailboxEventId)).toMatchObject({
        type: "subagent.child_supervisor_request",
        deliveryState: "consumed",
        deliveredAt: expect.any(String),
      });
      expect(store.listSubagentMailboxEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.followup",
          payload: expect.objectContaining({
            supervisorRequestParentMailboxEventId,
            supervisorChoiceId: "docs-only",
          }),
        }),
      ]));
    } finally {
      store.close();
    }
  });

  it("blocks synthesis when a structured-output role completes with prose-only output", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "running") }),
          waitForChildRun: ({ run }) => ({
            timedOut: false,
            run: store.markSubagentRunStatus(run.id, "completed", {
              resultArtifact: {
                schemaVersion: "ambient-subagent-result-artifact-v1",
                runId: run.id,
                status: "completed",
                partial: false,
                summary: "prose-only child result",
                childThreadId: run.childThreadId,
              },
            }),
          }),
        },
      });

      const spawned = await executeTool(tool, "spawn-prose-only", {
        action: "spawn_agent",
        task: "Complete without the structured result envelope.",
        dependencyMode: "required",
        idempotencyKey: "spawn:prose-only",
      });
      const runId = (spawned.details as any).run.id as string;

      const waited = await executeTool(tool, "wait-prose-only", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any).status).toBe("completed");
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).resultValidation).toMatchObject({
        valid: false,
        synthesisAllowed: false,
        reason: "Structured sub-agent result JSON is missing or not an object.",
        structuredOutputValidation: {
          valid: false,
          synthesisAllowed: false,
        },
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [runId],
        dependencyMode: "required_all",
        status: "failed",
      });
      expect(store.getSubagentWaitBarrier((waited.details as any).waitBarrier.id)).toMatchObject({
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: false,
        }),
      });
    } finally {
      store.close();
    }
  });

  it("requires Ambient-side mutation evidence before synthesizing completed implementation roles", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });
      const missingAmbientEvidence = completedWorkerRun(store, parent.id, parentRun.id, assistant.id, "root/worker-missing", "worker-missing");
      const withAmbientEvidence = completedWorkerRun(store, parent.id, parentRun.id, assistant.id, "root/worker-evidence", "worker-evidence");
      const optionalMissingAmbientEvidence = completedWorkerRun(
        store,
        parent.id,
        parentRun.id,
        assistant.id,
        "root/worker-optional-missing",
        "worker-optional-missing",
        "optional_background",
      );
      store.appendSubagentRunEvent(withAmbientEvidence.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "tool_result",
          source: "child_runtime",
          runId: withAmbientEvidence.id,
          parentThreadId: withAmbientEvidence.parentThreadId,
          parentRunId: withAmbientEvidence.parentRunId,
          childThreadId: withAmbientEvidence.childThreadId,
          canonicalTaskPath: withAmbientEvidence.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:00.000Z",
          toolName: "write",
          details: {
            toolCallId: "tool-call-worker-evidence",
            category: "workspace.write",
            path: "src/worker.ts",
            worktreeIsolated: true,
            worktreePath: `${workspacePath}/.ambient-codex/worktrees/${withAmbientEvidence.childThreadId}`,
            approvalId: "approval-worker-evidence",
            approvalSource: "permission_grant",
          },
        },
      });

      const blocked = await executeTool(tool, "wait-worker-missing", {
        action: "wait_agent",
        childRunId: missingAmbientEvidence.id,
      });
      expect((blocked.details as any).synthesisAllowed).toBe(false);
      expect((blocked.details as any).resultValidation).toMatchObject({
        valid: false,
        reason: "Implementation roles require Ambient-recorded mutation evidence before completed synthesis.",
        completionGuardValidation: {
          valid: false,
          required: true,
          structuredEvidenceCount: 1,
          ambientEvidenceCount: 0,
        },
      });
      expect((blocked.details as any).waitBarrier).toMatchObject({
        status: "failed",
      });

      const optionalBlocked = await executeTool(tool, "wait-worker-optional-missing", {
        action: "wait_agent",
        childRunId: optionalMissingAmbientEvidence.id,
      });
      expect((optionalBlocked.details as any).synthesisAllowed).toBe(false);
      expect((optionalBlocked.details as any).groupedCompletionNotification).toBeUndefined();
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.grouped_completion")).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_attention")).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            barrierStatus: "failed",
            parentResolution: expect.objectContaining({ action: "ask_user" }),
          }),
        }),
      ]);

      const allowed = await executeTool(tool, "wait-worker-evidence", {
        action: "wait_agent",
        childRunId: withAmbientEvidence.id,
      });
      expect((allowed.details as any).synthesisAllowed).toBe(true);
      expect((allowed.details as any).resultValidation).toMatchObject({
        valid: true,
        completionGuardValidation: {
          valid: true,
          required: true,
          structuredEvidenceCount: 1,
          ambientEvidenceCount: 1,
          isolatedWorktreeEvidenceCount: 1,
          approvalEvidenceCount: 1,
        },
      });
      expect((allowed.details as any).waitBarrier).toMatchObject({
        status: "satisfied",
      });
    } finally {
      store.close();
    }
  });
});

function structuredResult(
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

function enqueueSymphonyWorkflowTask(
  store: ProjectStore,
  parentThreadId: string,
  parentRunId: string,
  assistantMessageId?: string,
) {
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

function completedWorkerRun(
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
      structuredOutput: structuredResult("worker", "Changed src/worker.ts and ran tests.", [{
        toolCallId: `tool-call-${idSuffix}`,
        path: "src/worker.ts",
        category: "workspace.write",
      }]),
    },
  });
}

function explorerResultArtifact(runId: string, childThreadId: string, summary: string) {
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
