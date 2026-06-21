import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore permission and prepared-run facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("persists permission grants and audit grant references", () => {
    const thread = store.createThread("Permission grants");
    const grant = store.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "project",
      projectPath: workspacePath,
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetHash: "hash-npm-test",
      targetLabel: "npm test",
      conditions: { cwd: workspacePath },
      source: "permission_prompt",
      reason: "Allowed from permission prompt: Allow command?",
    });

    expect(store.listPermissionGrants()).toEqual([
      expect.objectContaining({
        id: grant.id,
        scopeKind: "project",
        projectPath: workspacePath,
        conditions: { cwd: workspacePath },
      }),
    ]);

    const audit = store.addPermissionAudit({
      threadId: thread.id,
      permissionMode: "workspace",
      toolName: "bash",
      risk: "workspace-command",
      decision: "allowed",
      detail: "npm test",
      reason: "Approved by Ambient permission grant policy.",
      decisionSource: "persistent_grant",
      grantId: grant.id,
    });

    expect(store.listPermissionAudit()).toEqual([
      expect.objectContaining({
        id: audit.id,
        decisionSource: "persistent_grant",
        grantId: grant.id,
      }),
    ]);

    const revoked = store.revokePermissionGrant(grant.id);
    expect(revoked.revokedAt).toBeTruthy();
    expect(store.listPermissionGrants()).toEqual([]);
    expect(store.listPermissionGrants({ includeRevoked: true })[0]).toMatchObject({ id: grant.id, revokedAt: revoked.revokedAt });
  });

  it("persists plugin trust independently from plugin enablement", () => {
    const pluginId = ".agents/plugins/marketplace.json:ambient-fixture";

    expect(store.isPluginEnabled(pluginId)).toBe(true);
    expect(store.isPluginTrusted(pluginId)).toBe(false);

    store.setPluginTrusted(pluginId, true, "fingerprint-a");
    store.setPluginEnabled(pluginId, false);

    expect(store.isPluginEnabled(pluginId)).toBe(false);
    expect(store.isPluginTrusted(pluginId)).toBe(true);
    expect(store.isPluginTrusted(pluginId, "fingerprint-a")).toBe(true);
    expect(store.isPluginTrusted(pluginId, "fingerprint-b")).toBe(false);

    store.setPluginTrusted(pluginId, false);
    expect(store.isPluginTrusted(pluginId)).toBe(false);

    const piPackageId = "ambient-workspace:/workspace/plugins/pi-fixture/package.json:./plugins/pi-fixture";
    expect(store.isPiPackageEnabled(piPackageId)).toBe(false);
    store.setPiPackageEnabled(piPackageId, true);
    expect(store.isPiPackageEnabled(piPackageId)).toBe(true);
    store.setPiPackageEnabled(piPackageId, false);
    expect(store.isPiPackageEnabled(piPackageId)).toBe(false);
    store.setPiPackageEnabled(piPackageId, true);
    store.clearPiPackageEnabled(piPackageId);
    expect(store.isPiPackageEnabled(piPackageId)).toBe(false);
  });

  it("records prepared workspace metadata on tasks", () => {
    const task = store.createOrchestrationTask({ title: "Prepare me" });

    const updated = store.setOrchestrationTaskWorkspace({
      id: task.id,
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      branchName: "ambient/LOCAL-1",
    });

    expect(updated).toMatchObject({
      id: task.id,
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      branchName: "ambient/LOCAL-1",
    });
  });

  it("records prepared runs and derives scheduler claims from persisted run state", () => {
    const task = store.createOrchestrationTask({ title: "Claim me" });

    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      proofOfWork: { kind: "preparation" },
    });

    expect(run).toMatchObject({
      taskId: task.id,
      attemptNumber: 0,
      status: "prepared",
      workspacePath: "/tmp/ambient-workspaces/LOCAL-1",
      proofOfWork: { kind: "preparation" },
    });
    expect(store.getOrchestrationSchedulerRuntimeState()).toEqual({
      claimedTaskIds: [task.id],
      runningTaskIds: [],
      retryQueuedTaskIds: [],
    });
  });

  it("clears stale prepared workflow-impact runs so they can be prepared again", () => {
    const board = store.createProjectBoard({ title: "Workflow impact board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Render hello workflow" });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Render the hello workflow state."],
      testPlan: { unit: ["Assert workflow impact state."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1"),
      proofOfWork: {
        kind: "preparation",
        workflowPath: join(workspacePath, "WORKFLOW.md"),
        workflowHash: "old-workflow-hash",
      },
    });

    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).toContain(approved.orchestrationTaskId);

    const result = store.resolveProjectBoardWorkflowImpact({
      boardId: board.id,
      action: "prepare_again",
      runIds: [run.id],
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      workflowHash: "new-workflow-hash",
      createdAt: "2026-05-15T12:00:00.000Z",
    });

    expect(result).toEqual({ clearedRunIds: [run.id], skippedRuns: [] });
    expect(store.getOrchestrationRun(run.id)).toMatchObject({
      status: "canceled",
      error: "Cleared so this Local Task can be prepared again under the current WORKFLOW.md.",
      proofOfWork: expect.objectContaining({
        workflowImpact: expect.objectContaining({
          action: "prepare_again",
          previousStatus: "prepared",
          workflowHash: "new-workflow-hash",
        }),
      }),
    });
    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).not.toContain(approved.orchestrationTaskId);
    const event = store.getActiveProjectBoard()!.events!.at(-1);
    expect(event).toMatchObject({
      kind: "workflow_impact_resolved",
      title: "Workflow impact prepare-again selected",
      metadata: expect.objectContaining({
        action: "prepare_again",
        clearedRunIds: [run.id],
        affectedCardIds: [approved.id],
        modelCallRequired: false,
      }),
    });
  });

  it("records workflow-impact keep decisions without clearing prepared runs", () => {
    const board = store.createProjectBoard({ title: "Workflow keep board" });
    const card = store.createProjectBoardManualCard({ boardId: board.id, title: "Keep old prep" });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Keep the current prepared workspace."],
      testPlan: { unit: ["Assert keep decision."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1"),
      proofOfWork: { kind: "preparation", workflowHash: "old-workflow-hash" },
    });

    const result = store.resolveProjectBoardWorkflowImpact({
      boardId: board.id,
      action: "continue_old_prep",
      runIds: [run.id],
      workflowHash: "new-workflow-hash",
      createdAt: "2026-05-15T12:30:00.000Z",
    });

    expect(result).toEqual({ clearedRunIds: [], skippedRuns: [] });
    expect(store.getOrchestrationRun(run.id).status).toBe("prepared");
    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).toContain(approved.orchestrationTaskId);
    expect(store.getActiveProjectBoard()!.events!.at(-1)).toMatchObject({
      kind: "workflow_impact_resolved",
      title: "Workflow impact old preparation kept",
      metadata: expect.objectContaining({
        action: "continue_old_prep",
        affectedRunIds: [run.id],
        modelCallRequired: false,
      }),
    });
  });

  it("updates orchestration run lifecycle metadata", () => {
    const task = store.createOrchestrationTask({ title: "Run me" });
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: "/tmp/work" });

    const running = store.updateOrchestrationRun({ id: run.id, status: "running", threadId: "thread-1" });
    const completed = store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: "thread-1",
      piSessionFile: "/tmp/session.jsonl",
      proofOfWork: { changedFiles: [] },
      finish: true,
    });

    expect(running).toMatchObject({ status: "running", threadId: "thread-1" });
    expect(completed).toMatchObject({
      status: "completed",
      threadId: "thread-1",
      piSessionFile: "/tmp/session.jsonl",
      proofOfWork: { changedFiles: [] },
    });
    expect(completed.finishedAt).toBeTruthy();
  });

  it("marks persisted active orchestration runs as resumable after desktop restart", () => {
    const task = store.createOrchestrationTask({ title: "Recover me" });
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: "/tmp/work" });
    store.updateOrchestrationRun({ id: run.id, status: "running", threadId: "thread-1" });

    expect(store.stallActiveOrchestrationRuns()).toBe(1);

    expect(store.getOrchestrationRun(run.id)).toMatchObject({
      status: "stalled",
      error: "Ambient Desktop restarted before this Local Task run finished.",
      proofOfWork: expect.objectContaining({
        resumeAvailable: true,
        recovery: expect.objectContaining({
          type: "desktop-restart",
          resumeAvailable: true,
          reason: "Ambient Desktop restarted before this Local Task run finished.",
        }),
      }),
    });
    expect(store.getOrchestrationTask(task.id).state).toBe("needs_info");
  });
});
