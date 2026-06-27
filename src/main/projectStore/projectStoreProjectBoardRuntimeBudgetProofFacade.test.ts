import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board runtime budget proof facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("does not close a project board card when the worker stopped at the runtime budget", () => {
    const thread = store.createThread("Runtime budget proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with bounded execution." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Runtime-budget card",
      summary: "Exercise bounded worker closure.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement runtime-budget proof handling." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Runtime budget board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: "/tmp/runtime-budget-proof-review",
    });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/runtimeBudget.ts"],
        afterRunHook: { ok: true, durationMs: 15 },
        lastAssistantText:
          "Implemented the acceptance criteria and unit tests passed, but the worker reached the configured runtime budget.",
        remaining: [
          "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
          "Review partial workspace changes and retry the card with a smaller scope.",
        ],
        nextSteps: ["Review partial workspace changes and retry the card with a smaller scope."],
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 90_000,
          elapsedMs: 95_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
    });
    expect(reviewed.splitOutcome).toMatchObject({
      status: "proposed",
      source: "runtime_budget",
      sourceRunId: run.id,
      reason: "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      completedCriteria: expect.arrayContaining([
        "Implementation evidence recorded.",
        "Acceptance criteria discussed in proof.",
        "Unit proof recorded.",
      ]),
      remainingCriteria: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
    });
    expect(
      reviewed.splitOutcome?.remainingCriteria.filter((item) =>
        /review partial workspace changes and retry the card with a smaller scope/i.test(item),
      ),
    ).toHaveLength(1);
    expect(reviewed.splitOutcome?.childCardIds).toHaveLength(1);
    const followUp = store.getProjectBoardCard(reviewed.splitOutcome!.childCardIds[0]);
    expect(followUp).toMatchObject({
      title: "Continue Runtime-budget card",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [],
      labels: expect.arrayContaining(["proof-follow-up", "runtime-split-follow-up", "derived-from-parent"]),
      acceptanceCriteria: expect.arrayContaining([
        "Runtime budget exceeded after 90s: Review partial workspace changes and retry the card with a smaller scope.",
      ]),
      clarificationQuestions: expect.arrayContaining([
        'Confirm this runtime-budget follow-up accurately captures the remaining scope for "Runtime-budget card" before ticketizing it.',
      ]),
    });
    expect(
      followUp.acceptanceCriteria.filter((item) => /review partial workspace changes and retry the card with a smaller scope/i.test(item)),
    ).toHaveLength(1);
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUp.id]);
    expect(store.getActiveProjectBoard()?.events?.find((event) => event.kind === "card_split")).toMatchObject({
      title: "Runtime-budget split proposed",
      entityId: approved.id,
      metadata: expect.objectContaining({ runId: run.id, childCardIds: [followUp.id] }),
    });
  });

  it("resolves runtime split decisions without losing parent audit state", () => {
    const thread = store.createThread("Runtime split decision thread");
    const board = store.createProjectBoard({ title: "Runtime split decisions" });
    const createSplitCase = (title: string) => {
      const draft = store.createProjectBoardManualCard({
        boardId: board.id,
        title,
        description: `${title} should be finished in a bounded worker pass.`,
      });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: ["Create the working shell.", "Finish the remaining interaction polish."],
        testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      });
      const approved = store.approveProjectBoardCard(ready.id);
      const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
      const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: `/tmp/${task.identifier}` });
      store.updateOrchestrationRun({
        id: run.id,
        status: "completed",
        threadId: thread.id,
        proofOfWork: {
          changedFiles: ["src/shell.ts"],
          afterRunHook: { ok: true, durationMs: 10 },
          lastAssistantText:
            "Created the working shell, added unit proof, and then hit the configured runtime budget before finishing the remaining interaction polish.",
          projectBoardRuntimeBudget: {
            exceeded: true,
            maxRuntimeMs: 60_000,
            elapsedMs: 65_000,
            recommendedNextAction: "Split the remaining interaction polish into a follow-up.",
          },
        },
        finish: true,
      });
      const reviewed = store.getProjectBoardCard(approved.id);
      const child = store.getProjectBoardCard(reviewed.splitOutcome!.childCardIds[0]);
      return { reviewed, child, task };
    };

    const approvedSplit = createSplitCase("Approve split parent");
    const splitApproved = store.resolveProjectBoardSplitDecision({ cardId: approvedSplit.reviewed.id, action: "approve_split" });
    expect(splitApproved.splitOutcome).toMatchObject({ status: "approved" });
    expect(store.getProjectBoardCard(approvedSplit.child.id).candidateStatus).toBe("needs_clarification");

    const retrySplit = createSplitCase("Retry split parent");
    const retried = store.resolveProjectBoardSplitDecision({ cardId: retrySplit.reviewed.id, action: "retry_original" });
    expect(retried).toMatchObject({ status: "ready", proofReview: undefined, splitOutcome: { status: "rejected" } });
    expect(store.getProjectBoardCard(retrySplit.child.id).candidateStatus).toBe("rejected");
    expect(store.getOrchestrationTask(retrySplit.task.id).state).toBe("ready");

    const mergedSplit = createSplitCase("Merge split parent");
    const merged = store.resolveProjectBoardSplitDecision({ cardId: mergedSplit.reviewed.id, action: "merge_followups" });
    expect(merged).toMatchObject({ status: "ready", proofReview: undefined, splitOutcome: { status: "rejected" } });
    expect(merged.labels).toContain("merged-follow-up");
    expect(store.getProjectBoardCard(mergedSplit.child.id).candidateStatus).toBe("rejected");

    const replacedSplit = createSplitCase("Replace split parent");
    const replaced = store.resolveProjectBoardSplitDecision({ cardId: replacedSplit.reviewed.id, action: "mark_replaced" });
    expect(replaced).toMatchObject({ status: "done", proofReview: { status: "done" }, splitOutcome: { status: "replaced" } });
    expect(store.getOrchestrationTask(replacedSplit.task.id).state).toBe("done");

    const doneViaSplit = createSplitCase("Done via split parent");
    expect(() => store.resolveProjectBoardSplitDecision({ cardId: doneViaSplit.reviewed.id, action: "accept_done_via_split" })).toThrow(
      "Finish or mark represented split follow-up cards",
    );
    store.updateProjectBoardCard({ cardId: doneViaSplit.child.id, candidateStatus: "evidence" });
    const closed = store.resolveProjectBoardSplitDecision({ cardId: doneViaSplit.reviewed.id, action: "accept_done_via_split" });
    expect(closed).toMatchObject({ status: "done", proofReview: { status: "done" }, splitOutcome: { status: "done_via_split" } });
    expect(store.getOrchestrationTask(doneViaSplit.task.id).state).toBe("done");
  });

  it("recommends retry instead of split when the runtime budget ends without meaningful progress", () => {
    const thread = store.createThread("Retry runtime budget proof thread");
    const board = store.createProjectBoard({ title: "Retry runtime budget board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime retry card",
      description: "Exercise no-progress runtime-budget handling.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Implement the bounded task."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/runtime-budget-retry" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        lastAssistantText: "I started investigating but did not modify implementation files before the runtime budget stopped the run.",
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 30_000,
          elapsedMs: 31_000,
          recommendedNextAction: "Retry with a smaller scope.",
        },
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "retry_recommended",
      recommendedAction: "retry",
      missing: expect.arrayContaining(["Runtime budget exceeded after 30s: Retry with a smaller scope."]),
    });
    expect(reviewed.splitOutcome).toBeUndefined();
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("does not split a runtime budget card from Pi satisfied text without observable implementation progress", () => {
    const thread = store.createThread("Pi false-positive runtime budget thread");
    const board = store.createProjectBoard({ title: "Pi false-positive runtime budget board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime false-positive card",
      description: "Exercise strict runtime-budget split gating.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create a real implementation file."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: "/tmp/runtime-budget-false-positive",
    });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [{ path: ".ambient/board/cards.json", status: "modified" }],
        taskToolActions: [
          {
            actionId: "unique-heartbeat-id",
            action: "task_heartbeat",
            cardId: approved.id,
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Describe actual progress from this run.",
            completed: ["Name a concrete item actually completed."],
            remaining: ["Name concrete remaining work, or leave this array empty."],
          },
        ],
        lastAssistantText: "Run stopped.",
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 45_000,
          elapsedMs: 46_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "needs_follow_up",
        summary: "Pi inferred progress, but no implementation files changed.",
        satisfied: ["Agent correctly identified the required files and prepared content."],
        missing: ["Runtime budget exceeded after 45s."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-09T12:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "weak",
        recommendedAction: "follow_up",
      },
    });

    expect(reviewed?.status).toBe("blocked");
    expect(reviewed?.splitOutcome).toBeUndefined();
    expect(reviewed?.proofReview).toMatchObject({
      status: "retry_recommended",
      reviewer: "ambient_pi",
      recommendedAction: "retry",
      followUpCardIds: [],
    });
    expect(store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up")).toHaveLength(0);
  });

  it("splits runtime budget cards when proof exists but durable completion was not recorded", () => {
    const thread = store.createThread("Runtime budget completion race thread");
    const board = store.createProjectBoard({ title: "Runtime budget completion race board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Runtime completion race card",
      description: "Exercise timeout after proof but before durable completion.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create a runtime checkpoint."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: "/tmp/runtime-budget-completion-race",
    });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
        taskToolActions: [
          {
            actionId: "proof-runtime-race",
            action: "task_report_proof",
            cardId: approved.id,
            createdAt: "2026-05-09T12:00:00.000Z",
            summary: "Checkpoint file and unit test were created before timeout.",
            commands: ["pnpm test test/runtime-split-progress.test.ts"],
            changedFiles: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 90_000,
          elapsedMs: 91_000,
          recommendedNextAction: "Review partial workspace changes and retry the card with a smaller scope.",
        },
      },
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Pi considered all proof complete.",
        satisfied: ["Created the runtime checkpoint.", "Unit proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-09T12:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "strong",
        recommendedAction: "close",
      },
    });

    expect(reviewed?.status).toBe("blocked");
    expect(reviewed?.proofReview).toMatchObject({
      status: "needs_follow_up",
      reviewer: "ambient_pi",
      recommendedAction: "follow_up",
      evidenceQuality: "mixed",
      missing: expect.arrayContaining(["Durable task_complete action was not recorded before the runtime budget stopped the run."]),
    });
    expect(reviewed?.splitOutcome).toMatchObject({
      status: "proposed",
      source: "runtime_budget",
      childCardIds: expect.any(Array),
    });
    expect(reviewed?.splitOutcome?.childCardIds).toHaveLength(1);
  });
});
