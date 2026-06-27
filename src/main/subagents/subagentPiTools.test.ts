import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  createAmbientModelRuntimeSnapshot,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import { createAgentRoleRegistry } from "./subagentAgentFacade";
import { ProjectStore } from "./subagentProjectStoreFacade";
import {
  AMBIENT_SUBAGENT_TOOL_NAME,
  ambientSubagentActiveToolNamesForThread,
  ambientSubagentRegisteredToolNamesForThread,
  createSubagentPiToolDefinitions,
} from "./subagentPiTools";
import {
  cleanupTempWorkspaces,
  disabledFlags,
  enabledFlags,
  enqueueSymphonyWorkflowTask,
  executeTool,
  structuredResult,
  symphonyLaunchContractForPiTool,
  tempWorkspace,
} from "./subagentPiToolsTestSupport";

afterEach(cleanupTempWorkspaces);

describe("sub-agent Pi tool catalog gating", () => {
  it("registers ambient_subagent only for enabled parent chat threads but keeps it out of default active tools", () => {
    const parent = { kind: "chat" } as ThreadSummary;
    const child = { kind: "subagent_child" } as ThreadSummary;

    expect(ambientSubagentActiveToolNamesForThread(parent, disabledFlags)).toEqual([]);
    expect(ambientSubagentActiveToolNamesForThread(parent, enabledFlags)).toEqual([]);
    expect(ambientSubagentRegisteredToolNamesForThread(parent, enabledFlags)).toEqual([AMBIENT_SUBAGENT_TOOL_NAME]);
    expect(ambientSubagentActiveToolNamesForThread(child, enabledFlags)).toEqual([]);
    expect(ambientSubagentRegisteredToolNamesForThread(child, enabledFlags)).toEqual([]);
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

  it("hides Symphony launch contract fields unless a stored-contract resolver is present", () => {
    const [tool] = createSubagentPiToolDefinitions({
      store: {} as never,
      threadId: "parent-thread",
      getFeatureFlagSnapshot: () => enabledFlags,
      getParentRun: () => ({ id: "parent-run" }),
    });
    const parameters = tool.parameters as any;

    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.properties.symphonyMode).toBeUndefined();
    expect(parameters.properties.symphonyContractId).toBeUndefined();
    expect(parameters.properties.symphony).toBeUndefined();
  });

  it("declares stored Symphony contract id fields in the strict spawn tool schema when a resolver exists", () => {
    const [tool] = createSubagentPiToolDefinitions({
      store: {} as never,
      threadId: "parent-thread",
      getFeatureFlagSnapshot: () => enabledFlags,
      getParentRun: () => ({ id: "parent-run" }),
      resolveSymphonyLaunchContract: () => undefined,
    });
    const parameters = tool.parameters as any;

    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.properties.symphonyMode).toMatchObject({
      type: "boolean",
    });
    expect(parameters.properties.symphonyContractId).toMatchObject({
      type: "string",
    });
    expect(parameters.properties.symphony).toBeUndefined();
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

      await expect(
        executeTool(tool, "spawn-disabled", {
          action: "spawn_agent",
          task: "Inspect the current code.",
        }),
      ).rejects.toThrow(/disabled/);
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

      await expect(
        executeTool(tool, "nested-spawn", {
          action: "spawn_agent",
          task: "Try to spawn a nested child.",
        }),
      ).rejects.toThrow(/Nested sub-agent fanout is disabled/);
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

      await expect(
        executeTool(tool, "spawn-scheduled", {
          action: "spawn_agent",
          task: "Check this project each morning and report stale TODOs.",
          roleId: "explorer",
          scheduledAt: "2026-06-06T09:00:00-07:00",
          recurrence: "daily",
          idempotencyKey: "spawn:scheduled-todos",
        }),
      ).rejects.toThrow(/Scheduled sub-agent runs are deferred to Ambient automations/);

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
          loadedCategories: ["workspace.read", "artifact.read", "long-context.read", "connector.read"],
          piVisibleCategories: ["workspace.read", "artifact.read", "long-context.read", "connector.read"],
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
        loadedCategories: ["workspace.read", "artifact.read", "long-context.read", "connector.read"],
        piVisibleCategories: ["workspace.read", "artifact.read", "long-context.read", "connector.read"],
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
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(
        expect.arrayContaining([
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
        ]),
      );

      const cancelReplay = await executeTool(tool, "cancel-1-retry", {
        action: "cancel_agent",
        childRunId: run.id,
        reason: "Parent no longer needs this branch.",
        idempotencyKey: "cancel:branch",
      });
      expect((cancelReplay.details as any).status).toBe("idempotent_replay");
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.lifecycle_interrupted"),
      ).toHaveLength(1);
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
      expect(updatedTask.patternGraphSnapshot?.nodes).toContainEqual(
        expect.objectContaining({
          id: `mapper:${run.id}`,
          label: "Mapper child",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          status: "queued",
          blockingParent: true,
        }),
      );
      expect(
        updatedTask.patternGraphSnapshot?.edges.some((edge) => edge.from === `mapper:${run.id}` || edge.to === `mapper:${run.id}`),
      ).toBe(true);

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
      expect(
        store.getCallableWorkflowTask(workflowTask.id).patternGraphSnapshot?.nodes.filter((node) => node.childRunId === run.id),
      ).toHaveLength(1);

      await expect(
        executeTool(tool, "spawn-graph-missing-node", {
          action: "spawn_agent",
          task: "Try to bind to an invalid graph node.",
          roleId: "explorer",
          patternGraphBinding: {
            workflowTaskId: workflowTask.id,
            roleNodeId: "not-a-node",
          },
          idempotencyKey: "spawn:graph-missing-node",
        }),
      ).rejects.toThrow(/Pattern graph role node not-a-node does not exist/);
      expect(store.listSubagentRunsForParentThread(parent.id).map((candidate) => candidate.id)).toEqual([run.id]);
    } finally {
      store.close();
    }
  });

  it("acquires a scratch mutation workspace lease before launching stored Symphony mutation children", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const writeRoot = join(workspacePath, "generated");
      let runtimeRunId: string | undefined;
      let runtimeWorkspacePath: string | undefined;
      const startChildRun = vi.fn(({ run }) => {
        runtimeRunId = run.id;
        runtimeWorkspacePath = store.getThread(run.childThreadId).workspacePath;
        return { started: true, run: store.markSubagentRunStatus(run.id, "running") };
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        resolveSymphonyLaunchContract: (contractId) => {
          if (contractId !== "contract-mutation-1") return undefined;
          return symphonyLaunchContractForPiTool({
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            role: "worker",
            inheritedAuthorityRoots: [workspacePath],
            writableRoots: [writeRoot],
            mutation: "lease_required",
          });
        },
        runtime: {
          startChildRun,
        },
      });

      const spawned = await executeTool(tool, "spawn-symphony-scratch-lease", {
        action: "spawn_agent",
        task: "Create a generated summary file without changing anything else.",
        roleId: "worker",
        dependencyMode: "required",
        symphonyMode: true,
        symphonyContractId: "contract-mutation-1",
        toolScope: {
          requestedCategories: ["workspace.write"],
          childAuthority: {
            taskIntent: "mutation",
            rationale: "Write only the requested generated summary in the isolated child workspace.",
            readRoots: [workspacePath],
            writeRoots: [writeRoot],
            mutation: "allow_isolated_worktree",
            network: "deny",
            nestedFanout: "deny",
          },
        },
        idempotencyKey: "spawn:symphony-scratch-lease",
      });

      const run = store.getSubagentRun((spawned.details as any).run.id);
      const lease = run.symphonyMutationWorkspaceLease;
      if (!lease) throw new Error("Expected Symphony mutation workspace lease to be acquired before launch.");
      expect(startChildRun).toHaveBeenCalledTimes(1);
      expect(lease).toMatchObject({
        kind: "scratch_overlay",
        status: "active",
        sourceRoots: [workspacePath],
        readOnlyBaseRoots: [workspacePath],
        declaredWritableRoots: [writeRoot],
      });
      expect(lease.rootPath).not.toBe(workspacePath);
      expect(lease.writableRoots).toEqual([join(lease.rootPath, "generated")]);
      expect(store.getThread(run.childThreadId).workspacePath).toBe(lease.rootPath);
      expect(runtimeRunId).toBe(run.id);
      expect(runtimeWorkspacePath).toBe(lease.rootPath);
      const [toolScopeSnapshot] = store.listSubagentToolScopeSnapshots(run.id);
      expect(toolScopeSnapshot.resolverInputs).toMatchObject({
        workspacePolicy: {
          worktreeIsolated: true,
          mutationWorkspaceLeaseId: lease.leaseId,
          mutationWorkspaceLeaseKind: "scratch_overlay",
        },
        childAuthorityProfile: {
          resourceScopes: {
            filesystem: {
              writeRoots: [join(lease.rootPath, "generated")],
            },
          },
        },
      });
      expect(spawned.details as any).toMatchObject({
        status: "running",
        orchestrationStarted: true,
        run: {
          id: run.id,
          mutationWorkspaceLease: {
            leaseId: lease.leaseId,
            kind: "scratch_overlay",
            status: "active",
            declaredWritableRoots: [writeRoot],
            writableRoots: [join(lease.rootPath, "generated")],
          },
        },
        toolScopeSnapshot: {
          displayMetadata: {
            worktreeIsolated: true,
            childAuthorityProfile: {
              filesystem: {
                writeRoots: [join(lease.rootPath, "generated")],
              },
            },
          },
        },
      });
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

        await expect(
          executeTool(tool, `close-active-${status}`, {
            action: "close_agent",
            childRunId: run.id,
            reason: "Release capacity too early.",
            idempotencyKey: `close:active:${status}`,
          }),
        ).rejects.toThrow(`Cannot close active sub-agent ${run.id} (${status})`);

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

      const followed = await executeTool(
        tool,
        "follow-idle",
        {
          action: "followup_agent",
          childRunId: runId,
          message: "Proceed with the fixture named restart-smoke.",
          idempotencyKey: "follow:restart-smoke",
        },
        (update) => runtimeUpdates.push(update),
      );
      expect(followupChildRun).toHaveBeenCalledTimes(1);
      expect(followupChildRun).toHaveBeenCalledWith(
        expect.objectContaining({
          run: expect.objectContaining({ id: runId }),
          message: "Proceed with the fixture named restart-smoke.",
          mailboxEvent: expect.objectContaining({
            type: "subagent.followup",
            deliveryState: "queued",
          }),
          idempotencyKey: "follow:restart-smoke",
        }),
      );
      expect(followed.details as any).toMatchObject({
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
      expect(
        store.listSubagentMailboxEvents(runId).map((event) => ({
          type: event.type,
          deliveryState: event.deliveryState,
          deliveredAt: event.deliveredAt,
        })),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "subagent.task", deliveryState: "queued", deliveredAt: undefined }),
          expect.objectContaining({ type: "subagent.message", deliveryState: "queued", deliveredAt: undefined }),
          expect.objectContaining({ type: "subagent.followup", deliveryState: "consumed", deliveredAt: "2026-06-05T00:00:10.000Z" }),
        ]),
      );
      expect(store.listSubagentRunEvents(runId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.runtime_event",
            preview: expect.objectContaining({
              source: "followup_agent",
              type: "status",
              message: expect.stringContaining("Follow-up delivered through"),
            }),
          }),
        ]),
      );
      expect(runtimeUpdates).toEqual(
        expect.arrayContaining([
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
        ]),
      );
    } finally {
      store.close();
    }
  });

  it("resolves launch roles through an injected role registry", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const roleRegistry = createAgentRoleRegistry([
      {
        ...explorer,
        label: "Code Scout",
        nicknameCandidates: ["Scout Prime"],
      },
    ]);
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

      expect((tool.parameters as any).properties.roleId.enum).toEqual(["explorer"]);
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
        resolveCapacityLease: (input) =>
          resolveSubagentCapacityLease({
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
      expect(spawned.details as any).toMatchObject({
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
      expect(spawned.details as any).toMatchObject({
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

      expect(prepareChildWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          parentThread: expect.objectContaining({ id: parent.id }),
          run: expect.objectContaining({ id: run.id, childThreadId: run.childThreadId }),
          role: expect.objectContaining({ id: "worker", mutationPolicy: "requires_isolated_worktree" }),
          task: "Implement the scoped fix.",
          idempotencyKey: "spawn:worker-active-worktree",
        }),
      );
      expect(runtime.startChildRun).toHaveBeenCalledWith(
        expect.objectContaining({
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
        }),
      );
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
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual(
        expect.arrayContaining(["subagent.reserved", "subagent.worktree_prepared", "subagent.spawn_requested", "subagent.status_changed"]),
      );
      expect(spawned.details as any).toMatchObject({
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
      expect(spawned.details as any).toMatchObject({
        status: "failed",
        orchestrationStarted: false,
        childWorktree: null,
      });
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

      await expect(
        executeTool(tool, "spawn-local-placeholder", {
          action: "spawn_agent",
          task: "Summarize this text locally.",
          roleId: "summarizer",
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          toolScope: { requestedCategories: ["artifact.read"] },
        }),
      ).rejects.toThrow(/Local text runtime is not configured/);
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

      await expect(
        executeTool(tool, "spawn-bad-model", {
          action: "spawn_agent",
          task: "Inspect using the requested custom model.",
          roleId: "explorer",
          modelId: "custom/unregistered-model",
          idempotencyKey: "spawn:bad-model",
        }),
      ).rejects.toThrow(/not eligible for sub-agent runs/);
      await expect(
        executeTool(tool, "spawn-bad-model-retry", {
          action: "spawn_agent",
          task: "Inspect using the requested custom model.",
          roleId: "explorer",
          modelId: "custom/unregistered-model",
          idempotencyKey: "spawn:bad-model",
        }),
      ).rejects.toThrow(/not eligible for sub-agent runs/);

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
              blockingReasons: expect.arrayContaining(["Model is not registered in this Ambient Desktop build."]),
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

      await expect(
        executeTool(tool, "spawn-local-runtime-denied", {
          action: "spawn_agent",
          task: "Summarize this text locally.",
          roleId: "summarizer",
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          toolScope: { requestedCategories: ["artifact.read"] },
          idempotencyKey: "spawn:local-runtime-denied",
        }),
      ).rejects.toThrow(/runtime launch preflight failed/);

      expect(runtime.preflightChildLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          parentThread: expect.objectContaining({ id: parent.id }),
          model: expect.objectContaining({
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            locality: "local",
          }),
          canonicalTaskPath: "root/0:summarizer",
          idempotencyKey: "spawn:local-runtime-denied",
        }),
      );
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

      await expect(
        executeTool(tool, "spawn-local-capacity-denied", {
          action: "spawn_agent",
          task: "Summarize this text locally.",
          roleId: "summarizer",
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          toolScope: { requestedCategories: ["artifact.read"] },
          idempotencyKey: "spawn:local-capacity-denied",
        }),
      ).rejects.toThrow(/capacity preflight failed/);

      expect(runtime.preflightChildLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            locality: "local",
          }),
          canonicalTaskPath: "root/0:summarizer",
          idempotencyKey: "spawn:local-capacity-denied",
        }),
      );
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

      expect(runtimeSnapshots).toEqual([
        expect.objectContaining({
          requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
          profile: expect.objectContaining({
            profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            available: true,
            selectableAsSubagent: true,
            locality: "local",
            toolUse: "none",
          }),
        }),
      ]);
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
      expect(store.listSubagentRunEvents(run.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.spawn_requested",
            preview: expect.objectContaining({
              modelScope: expect.objectContaining({
                source: "role_default",
                parentModelId: "custom/unregistered-model",
              }),
            }),
          }),
        ]),
      );
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
      const runtimeWaitTimeouts: number[] = [];
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
          waitForChildRun: ({ run, timeoutMs, emitEvent }) => {
            runtimeWaitTimeouts.push(timeoutMs);
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

      const spawned = await executeTool(
        tool,
        "spawn-runtime",
        {
          action: "spawn_agent",
          task: "Check a small thing.",
          idempotencyKey: "spawn:runtime",
        },
        (update) => runtimeUpdates.push(update),
      );
      const runId = (spawned.details as any).run.id as string;
      expect(startedRunIds).toEqual([runId]);
      expect(runtimeToolScopeSnapshotSequences).toEqual([1]);
      expect((spawned.details as any).orchestrationStarted).toBe(true);
      expect(store.getSubagentRun(runId).status).toBe("running");
      expect(runtimeUpdates).toEqual(
        expect.arrayContaining([
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
        ]),
      );

      const waited = await executeTool(
        tool,
        "wait-runtime",
        {
          action: "wait_agent",
          childRunId: runId,
          idempotencyKey: "wait:runtime-completed",
          wait: { timeoutMs: 1 },
        },
        (update) => runtimeUpdates.push(update),
      );
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
      expect(runtimeWaitTimeouts).toEqual([1]);
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
      expect(store.listSubagentMailboxEvents(runId).map((event) => event.type)).toEqual(["subagent.task", "subagent.wait_completed"]);
      const waitReplay = await executeTool(tool, "wait-runtime-replay", {
        action: "wait_agent",
        childRunId: runId,
        idempotencyKey: "wait:runtime-completed",
        wait: { timeoutMs: 1 },
      });
      expect((waitReplay.details as any).waitCompletionMailbox.id).toBe((waited.details as any).waitCompletionMailbox.id);
      expect(store.listSubagentMailboxEvents(runId).filter((event) => event.type === "subagent.wait_completed")).toHaveLength(1);
      const runtimeEvents = store
        .listSubagentRunEvents(runId)
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
      expect(runtimeUpdates).toEqual(
        expect.arrayContaining([
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
        ]),
      );
    } finally {
      store.close();
    }
  });
});
