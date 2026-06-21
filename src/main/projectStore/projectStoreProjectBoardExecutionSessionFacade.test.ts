import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board execution session facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("assigns one reusable Pi execution thread to each ticketized project board card", () => {
    const board = store.createProjectBoard({ title: "Session board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Build cached card loop",
      description: "Exercise the card-owned execution session.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["The card reuses one execution thread across attempts."],
      testPlan: { unit: ["Assert canonical thread reuse."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);

    expect(task.description).toContain("Execution session policy:");
    expect(task.description).toContain("Reuse this board card's canonical Pi session across retries and focus passes.");
    expect(task.description).toContain("provider KV cache reuse stays high");
    expect(task.description).toContain("Execution close policy:");
    expect(task.description).toContain("6 focus passes");
    expect(task.description).toContain("20m of worker runtime");
    expect(task.description).toContain("Make task_heartbeat the first observable board action");
    expect(task.description).toContain("Call task_report_proof as soon as changed files");
    expect(task.description).toContain("Do not end the run with only task_show and/or task_heartbeat");

    const workspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
    const first = store.ensureProjectBoardCardExecutionThreadForTask({ taskId: task.id, workspacePath: workspace });
    const second = store.ensureProjectBoardCardExecutionThreadForTask({ taskId: task.id, workspacePath: workspace });
    const updated = store.getProjectBoardCard(approved.id);

    expect(first).toBeTruthy();
    expect(second?.id).toBe(first?.id);
    expect(first).toMatchObject({
      title: `${task.identifier}: Build cached card loop`,
      workspacePath: workspace,
    });
    expect(updated).toMatchObject({
      executionThreadId: first?.id,
      executionSessionPolicy: "reuse_card_session",
    });
    expect(store.getProjectBoardCardForOrchestrationTask(task.id)?.id).toBe(approved.id);
    const sessionEvents = store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "card_execution_session_assigned") ?? [];
    expect(sessionEvents).toHaveLength(1);

    const unrelated = store.createOrchestrationTask({ title: "Unattached task" });
    expect(store.ensureProjectBoardCardExecutionThreadForTask({ taskId: unrelated.id, workspacePath: workspace })).toBeUndefined();
  });

  it("copies terminal project-board Pi session transcripts into local project threads", () => {
    const board = store.createProjectBoard({ title: "Session copy board" });
    const card = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Copy stopped session",
      description: "Make the completed Pi transcript available as a local thread.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: card.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["The transcript can be copied after the run stops."],
      testPlan: { unit: ["Assert copied messages."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const sourceThread = store.createThread("Source Pi session", workspacePath);
    store.addMessage({ threadId: sourceThread.id, role: "user", content: "Execute this board card." });
    store.addMessage({ threadId: sourceThread.id, role: "assistant", content: "The card work is complete." });
    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
    });
    const completed = store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: sourceThread.id,
      proofOfWork: { lastAssistantText: "The card work is complete." },
      finish: true,
      reviewProjectBoardProof: false,
    });

    const copied = store.copyProjectBoardSessionToThread({ cardId: approved.id, runId: completed.id });

    expect(copied.id).not.toBe(sourceThread.id);
    expect(copied.title).toBe("Session copy: Copy stopped session");
    expect(copied.workspacePath).toBe(workspacePath);
    expect(store.listMessages(copied.id).map((message) => [message.role, message.content])).toEqual([
      ["user", "Execute this board card."],
      ["assistant", "The card work is complete."],
      ["system", expect.stringContaining("Copied from project-board card")],
    ]);
    const copyEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "card_run_handoff_created");
    expect(copyEvent).toMatchObject({
      kind: "card_run_handoff_created",
      title: "Pi session copied to local thread",
      metadata: expect.objectContaining({
        cardId: approved.id,
        runId: completed.id,
        sourceThreadId: sourceThread.id,
        copiedThreadId: copied.id,
      }),
    });

    const activeThread = store.createThread("Active Pi session", workspacePath);
    const activeRun = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", `${task.identifier}-active`),
    });
    store.updateOrchestrationRun({ id: activeRun.id, status: "running", threadId: activeThread.id, reviewProjectBoardProof: false });
    expect(() => store.copyProjectBoardSessionToThread({ cardId: approved.id, runId: activeRun.id })).toThrow(
      "Copy Session to Thread is available only after",
    );
  });
});
