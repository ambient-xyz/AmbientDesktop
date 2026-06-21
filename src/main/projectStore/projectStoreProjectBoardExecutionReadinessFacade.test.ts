import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

type ProjectBoardEventForTest = {
  boardId: string;
  kind: string;
  title: string;
  summary: string;
  entityKind?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

function appendProjectBoardEventForTest(store: ProjectStore, event: ProjectBoardEventForTest): void {
  (store as unknown as { appendProjectBoardEvent: (event: ProjectBoardEventForTest) => void }).appendProjectBoardEvent(event);
}

describeNative("ProjectStore project board execution readiness facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("blocks ticketization when a ready candidate is claimed by another desktop", () => {
    const board = store.createProjectBoard({ title: "Claimed board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement claimed work",
      description: "This work should not be ticketized while another desktop owns it.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Claim gate prevents duplicate execution."],
      testPlan: { unit: ["Run claim gate test."], integration: [], visual: [], manual: [] },
    });
    appendProjectBoardEventForTest(store, {
      boardId: board.id,
      kind: "card_claimed",
      title: "Card claimed",
      summary: "Remote desktop claimed this card.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-remote",
        agentId: "remote-desktop",
        leaseUntil: "2099-05-04T12:10:00.000Z",
        artifactEventType: "card.claimed",
      },
      createdAt: "2099-05-04T12:00:00.000Z",
    });

    const claimedCard = store.getActiveProjectBoard()?.cards.find((candidate) => candidate.id === card.id);
    expect(claimedCard?.claim).toMatchObject({ status: "active", agentId: "remote-desktop", ownedByLocal: false });
    store.updateProjectBoardStatus(board.id, "active");
    expect(() => store.createReadyProjectBoardTasks(board.id)).toThrow(/claimed by remote-desktop/);
    expect(store.getProjectBoardCard(card.id).orchestrationTaskId).toBeUndefined();
  });

  it("records execution readiness blockers without spamming duplicate board history", () => {
    const board = store.createProjectBoard({ title: "Execution blocker board" });
    const workflowPath = join(workspacePath, "WORKFLOW.md");

    const first = store.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: "auto_dispatch",
      blocker: "missing_workflow",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: `Ready Local Tasks could not be prepared because ${workflowPath} is missing.`,
      workflowPath,
      error: "Workflow file not found.",
    });
    const duplicate = store.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: "auto_dispatch",
      blocker: "missing_workflow",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: `Ready Local Tasks could not be prepared because ${workflowPath} is missing.`,
      workflowPath,
      error: "Workflow file not found.",
    });
    const changed = store.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: "manual_prepare",
      blocker: "invalid_workflow",
      title: "Execution blocked: invalid WORKFLOW.md",
      summary: "Ready Local Tasks could not be prepared because WORKFLOW.md is invalid.",
      workflowPath,
      error: "Workflow validation failed.",
    });

    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    expect(changed.recorded).toBe(true);
    const events = store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "execution_readiness_blocked") ?? [];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: "Execution blocked: invalid WORKFLOW.md",
      metadata: {
        source: "manual_prepare",
        blocker: "invalid_workflow",
        workflowPath,
        error: "Workflow validation failed.",
      },
    });
    expect(events[1]).toMatchObject({
      title: "Execution blocked: missing WORKFLOW.md",
      metadata: {
        source: "auto_dispatch",
        blocker: "missing_workflow",
        workflowPath,
        error: "Workflow file not found.",
      },
    });
  });

  it("records workflow creation events without spamming duplicate board history", () => {
    const board = store.createProjectBoard({ title: "Workflow creation board" });
    const workflowPath = join(workspacePath, "WORKFLOW.md");

    const first = store.recordProjectBoardWorkflowCreated({
      boardId: board.id,
      workflowPath,
      workflowHash: "hash-1",
      source: "auto_dispatch",
      workspaceStrategy: "git-worktree",
      autoDispatch: true,
      maxConcurrentAgents: 3,
    });
    const duplicate = store.recordProjectBoardWorkflowCreated({
      boardId: board.id,
      workflowPath,
      workflowHash: "hash-1",
      source: "auto_dispatch",
      workspaceStrategy: "git-worktree",
      autoDispatch: true,
      maxConcurrentAgents: 3,
    });
    const changed = store.recordProjectBoardWorkflowCreated({
      boardId: board.id,
      workflowPath,
      workflowHash: "hash-2",
      source: "manual_prepare",
      workspaceStrategy: "directory",
      autoDispatch: false,
      maxConcurrentAgents: 1,
    });

    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    expect(changed.recorded).toBe(true);
    const events = store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "workflow_created") ?? [];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      metadata: {
        source: "manual_prepare",
        workflowPath,
        workflowHash: "hash-2",
        workspaceStrategy: "directory",
        autoDispatch: false,
        maxConcurrentAgents: 1,
      },
    });
    expect(events[1]).toMatchObject({
      metadata: {
        source: "auto_dispatch",
        workflowPath,
        workflowHash: "hash-1",
        workspaceStrategy: "git-worktree",
        autoDispatch: true,
        maxConcurrentAgents: 3,
      },
    });
  });

  it("surfaces expired remote claims without blocking ready task creation", () => {
    const board = store.createProjectBoard({ title: "Expired claim board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Reclaim expired work",
      description: "This work should explain stale ownership before this desktop claims it.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Expired claims are visible but do not block execution."],
      testPlan: { unit: ["Run expired claim gate test."], integration: [], visual: [], manual: [] },
    });
    appendProjectBoardEventForTest(store, {
      boardId: board.id,
      kind: "card_claimed",
      title: "Card claimed",
      summary: "Remote desktop claimed this card and then went stale.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-stale",
        agentId: "remote-desktop",
        leaseUntil: "2026-05-04T12:10:00.000Z",
        artifactEventType: "card.claimed",
      },
      createdAt: "2026-05-04T12:00:00.000Z",
    });
    appendProjectBoardEventForTest(store, {
      boardId: board.id,
      kind: "card_claim_expired",
      title: "Card claim expired",
      summary: "Local desktop recorded the stale lease before reclaim.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-stale",
        agentId: "local-desktop",
        expiredClaimEventId: "evt-remote-claim",
        artifactEventType: "card.claim_expired",
      },
      createdAt: "2026-05-04T12:20:00.000Z",
    });

    const expiredCard = store.getActiveProjectBoard()?.cards.find((candidate) => candidate.id === card.id);
    expect(expiredCard?.claim).toMatchObject({
      status: "expired",
      agentId: "remote-desktop",
      ownedByLocal: false,
      expirationRecorded: true,
    });
    store.updateProjectBoardStatus(board.id, "active");
    const [approved] = store.createReadyProjectBoardTasks(board.id);
    expect(approved.orchestrationTaskId).toBeTruthy();
  });

  it("treats remote-claimed ticketized board cards as claimed for scheduler dispatch", () => {
    const board = store.createProjectBoard({ title: "Execution claim board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Run claimed work",
      description: "This task is already ticketized but should not prepare while remotely claimed.",
    });
    store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Scheduler respects remote claim ownership."],
      testPlan: { unit: ["Run scheduler claim test."], integration: [], visual: [], manual: [] },
    });
    store.updateProjectBoardStatus(board.id, "active");
    const [approved] = store.createReadyProjectBoardTasks(board.id);
    appendProjectBoardEventForTest(store, {
      boardId: board.id,
      kind: "card_claimed",
      title: "Card claimed",
      summary: "Remote desktop claimed this ticketized card.",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: {
        cardId: card.id,
        runId: "run-remote",
        agentId: "remote-desktop",
        leaseUntil: "2099-05-04T12:10:00.000Z",
        artifactEventType: "card.claimed",
      },
      createdAt: "2099-05-04T12:00:00.000Z",
    });

    expect(store.getOrchestrationSchedulerRuntimeState().claimedTaskIds).toContain(approved.orchestrationTaskId);
  });
});
