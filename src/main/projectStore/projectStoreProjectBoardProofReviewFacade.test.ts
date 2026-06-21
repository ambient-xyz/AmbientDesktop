import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board proof review facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("resolves project board proof decisions into card and task states", () => {
    const board = store.createProjectBoard({ title: "Proof decision board" });
    const createReviewedCard = (title: string) => {
      const draft = store.createProjectBoardManualCard({ boardId: board.id, title, description: `${title} description.` });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: [`${title} acceptance criterion.`],
        testPlan: { unit: [`${title} unit proof.`], integration: [], visual: [], manual: [] },
      });
      const approved = store.approveProjectBoardCard(ready.id);
      const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
      const run = store.recordPreparedOrchestrationRun({
        taskId: task.id,
        workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
      });
      store.updateOrchestrationRun({
        id: run.id,
        status: "completed",
        finish: true,
        reviewProjectBoardProof: false,
        proofOfWork: { kind: "agent-run", changedFiles: ["src/App.tsx"], lastAssistantStatus: "completed" },
      });
      const reviewed = store.applyProjectBoardCardProofReview({
        runId: run.id,
        review: {
          status: "ready_for_review",
          summary: `${title} has proof ready for PM review.`,
          satisfied: [`${title} proof collected.`],
          missing: [],
          followUpCardIds: [],
          runId: run.id,
          reviewedAt: "2026-01-01T00:00:00.000Z",
          reviewer: "deterministic",
          recommendedAction: "close",
          evidenceQuality: "strong",
          confidence: 0.9,
        },
      })!;
      return { card: reviewed, task, run };
    };

    const draftPending = store.createProjectBoardManualCard({ boardId: board.id, title: "Pending proof card", description: "Not finished yet." });
    const readyPending = store.updateProjectBoardCard({
      cardId: draftPending.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Pending proof card acceptance criterion."],
      testPlan: { unit: ["Pending proof card unit proof."], integration: [], visual: [], manual: [] },
    });
    const pending = store.approveProjectBoardCard(readyPending.id);
    const pendingTask = store.getOrchestrationTask(pending.orchestrationTaskId!);
    expect(() => store.resolveProjectBoardProofDecision({ cardId: pending.id, action: "retry", reason: "Too early." })).toThrow(
      "Run the card until a proof packet or PM proof review is ready before resolving proof.",
    );
    const pendingRun = store.recordPreparedOrchestrationRun({
      taskId: pendingTask.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", `${pendingTask.identifier}-active`),
    });
    store.updateOrchestrationRun({
      id: pendingRun.id,
      status: "running",
      reviewProjectBoardProof: false,
      proofOfWork: { kind: "agent-run", lastAssistantText: "Still running." },
    });
    expect(() => store.resolveProjectBoardProofDecision({ cardId: pending.id, action: "mark_blocked", reason: "Still running." })).toThrow(
      "Wait for the active card run to finish before resolving proof.",
    );

    const retryCase = createReviewedCard("Retry card");
    const retried = store.resolveProjectBoardProofDecision({
      cardId: retryCase.card.id,
      action: "retry",
      reason: "Add mobile screenshot proof before closing.",
    });
    expect(retried).toMatchObject({ status: "ready", proofReview: undefined });
    expect(retried.runFeedback).toEqual([
      expect.objectContaining({
        source: "proof_review",
        decisionQuestion: "Why was this proof sent back for revision?",
        decisionAnswer: "Add mobile screenshot proof before closing.",
        feedback: expect.stringContaining("Add mobile screenshot proof before closing."),
      }),
    ]);
    expect(store.getOrchestrationTask(retryCase.task.id).state).toBe("ready");
    expect(store.getOrchestrationTask(retryCase.task.id).description).toContain("Next-run feedback / additive PM instructions:");
    expect(store.getOrchestrationTask(retryCase.task.id).description).toContain("Add mobile screenshot proof before closing.");

    const doneCase = createReviewedCard("Done card");
    const done = store.resolveProjectBoardProofDecision({ cardId: doneCase.card.id, action: "accept_done", reason: "Proof is sufficient." });
    expect(done).toMatchObject({ status: "done", proofReview: { status: "done", recommendedAction: "close" } });
    expect(done.proofReview?.summary).toContain("Accepted as done");
    expect(store.getOrchestrationTask(doneCase.task.id).state).toBe("done");
    expect(() => store.resolveProjectBoardProofDecision({ cardId: done.id, action: "retry", reason: "I clicked the wrong control." })).toThrow(
      "Done project board cards cannot be sent back to Ready.",
    );
    expect(store.getProjectBoardCard(done.id).status).toBe("done");
    store.updateOrchestrationRun({
      id: doneCase.run.id,
      status: "stalled",
      finish: true,
      error: "Late stall after PM acceptance.",
      proofOfWork: { kind: "agent-run", error: "late stall" },
    });
    store.updateOrchestrationTask({ id: doneCase.task.id, state: "terminal_blocker" });
    expect(store.getOrchestrationRun(doneCase.run.id).status).toBe("completed");
    expect(store.getOrchestrationTask(doneCase.task.id).state).toBe("done");
    expect(store.getProjectBoardCard(done.id)).toMatchObject({
      status: "done",
      proofReview: { status: "done", recommendedAction: "close" },
    });

    const blockedCase = createReviewedCard("Blocked card");
    const blocked = store.resolveProjectBoardProofDecision({ cardId: blockedCase.card.id, action: "mark_blocked", reason: "Missing API key." });
    expect(blocked).toMatchObject({ status: "blocked", proofReview: { status: "terminally_blocked", recommendedAction: "block" } });
    expect(blocked.proofReview?.missing).toContain("Missing API key.");
    expect(store.getOrchestrationTask(blockedCase.task.id).state).toBe("terminal_blocker");

    const events = store
      .getActiveProjectBoard()
      ?.events?.filter((event) => event.kind === "card_updated" && typeof event.metadata.action === "string")
      ?? [];
    const actions = events.map((event) => event.metadata.action);
    expect(actions).toEqual(["mark_blocked", "accept_done", "retry"]);
    expect(events.find((event) => event.metadata.action === "retry")?.metadata.runFeedback).toMatchObject({
      source: "proof_review",
      decisionQuestion: "Why was this proof sent back for revision?",
      modelCallRequired: false,
    });
  });

  it("ignores stale proof judgments after a card is sent back or a newer run exists", () => {
    const board = store.createProjectBoard({ title: "Stale proof review board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Stale proof card", description: "Proof can be superseded." });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Implement the feature."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: ["Manual proof captured."] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const firstRun = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: join(workspacePath, "proof-run-1") });

    store.updateOrchestrationRun({
      id: firstRun.id,
      status: "completed",
      proofOfWork: {
        changedFiles: ["src/feature.ts"],
        taskToolActions: [
          {
            actionId: "proof-run-1",
            runId: firstRun.id,
            taskId: task.id,
            cardId: approved.id,
            action: "task_complete",
            createdAt: "2026-05-18T12:00:00.000Z",
            summary: "Feature implemented and proof passed.",
            completed: ["Implemented feature."],
            remaining: [],
            risks: [],
            commands: ["pnpm test"],
            changedFiles: ["src/feature.ts"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Manual proof captured."],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.proofReview?.runId).toBe(firstRun.id);
    store.resolveProjectBoardProofDecision({ cardId: reviewed.id, action: "retry", reason: "Collect stronger proof." });
    const secondRun = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: join(workspacePath, "proof-run-2") });
    const stale = store.applyProjectBoardCardProofReview({
      runId: firstRun.id,
      requireCurrentReview: true,
      review: {
        status: "done",
        summary: "Late proof judge tried to close the old run.",
        satisfied: ["Old proof."],
        missing: [],
        followUpCardIds: [],
        runId: firstRun.id,
        reviewedAt: "2026-05-18T12:05:00.000Z",
        reviewer: "ambient_pi",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.9,
      },
    });

    expect(secondRun.id).not.toBe(firstRun.id);
    expect(stale).toMatchObject({ status: "ready", proofReview: undefined });
    expect(store.getOrchestrationTask(task.id).state).toBe("ready");
    const ignoredEvent = (store.getActiveProjectBoard()!.events ?? []).find((event) => event.kind === "card_proof_review_ignored");
    expect(ignoredEvent).toMatchObject({
      title: "Stale proof review ignored",
      metadata: expect.objectContaining({ runId: firstRun.id, staleReason: "newer_run_started" }),
    });
  });

  it("clears stale proof review state when a linked project board run starts", () => {
    const board = store.createProjectBoard({ title: "Proof restart board" });
    const draft = store.createProjectBoardManualCard({ boardId: board.id, title: "Restartable card", description: "Run can be retried." });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Retry produces fresh proof."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const task = store.getOrchestrationTask(approved.orchestrationTaskId!);
    const run = store.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier),
    });
    store.updateOrchestrationRun({
      id: run.id,
      status: "stalled",
      finish: true,
      reviewProjectBoardProof: false,
      error: "No Ambient/Pi activity for 300000ms.",
      proofOfWork: { kind: "agent-run", error: "No Ambient/Pi activity for 300000ms." },
    });
    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "terminally_blocked",
        summary: "Ambient/Pi proof judgment was unavailable.",
        satisfied: [],
        missing: ["No Ambient/Pi activity for 300000ms."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewer: "deterministic",
        recommendedAction: "block",
        evidenceQuality: "weak",
        confidence: 0.2,
      },
    })!;
    expect(reviewed).toMatchObject({
      status: "blocked",
      proofReview: { status: "terminally_blocked", recommendedAction: "block" },
    });

    store.updateOrchestrationRun({ id: run.id, status: "running", error: null, reviewProjectBoardProof: false });
    store.updateOrchestrationTask({ id: task.id, state: "in_progress" });
    const started = store.beginProjectBoardCardRun({ runId: run.id });

    expect(started).toMatchObject({ status: "in_progress", proofReview: undefined });
    expect(store.getOrchestrationTask(task.id).state).toBe("in_progress");
  });
});
