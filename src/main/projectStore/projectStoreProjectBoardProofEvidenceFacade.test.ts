import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board proof evidence facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("records PM proof review decisions for completed project board runs", () => {
    const thread = store.createThread("Proof review thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Proof-gated card",
      summary: "Exercise proof review.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement proof-gated behavior." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Run integration smoke.", "Capture visual screenshot.", "Manual review the result."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Proof review board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/App.tsx"],
        screenshots: ["proof.png"],
        afterRunHook: { ok: true, durationMs: 42 },
        lastAssistantText:
          "Implemented the acceptance criteria. Unit tests passed, integration smoke passed, visual screenshot captured, and manual review confirmed the result.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      runId: run.id,
      missing: [],
      satisfied: expect.arrayContaining([
        "Acceptance criteria discussed in proof.",
        "Unit proof recorded.",
        "Integration proof recorded.",
        "Visual/browser proof recorded.",
        "Manual review proof recorded.",
      ]),
    });
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      entityId: approved.id,
      metadata: expect.objectContaining({ status: "ready_for_review", runId: run.id, reviewer: "deterministic" }),
    });
  });

  it("does not let copied task-action sample proof close a project board card", () => {
    const thread = store.createThread("Sample proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with real proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Sample-proof card",
      summary: "Exercise task action proof integrity.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement task-action proof integrity." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Sample proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/sample-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        taskToolActions: [
          {
            actionId: "proof-1",
            action: "task_report_proof",
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Verification passed.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        "Task action proof integrity issue: task_report_proof proof-1 appears to contain copied sample value(s): actionId, summary.",
        "Task action proof integrity issue: task_report_proof proof-1 has no command, changed-file, screenshot, browser-trace, visual-check, manual-check, or completed-item evidence.",
      ]),
    });
  });

  it("keeps strong close recommendations reviewable when deterministic proof issues remain", () => {
    const thread = store.createThread("Strong proof issue thread");
    const board = store.createProjectBoard({ title: "Strong proof issue board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement reviewable proof gate",
      description: "Exercise auto-close gating when the judge is strong but proof issues remain.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Create the proof-gated behavior."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Record manual PM review."] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/strong-proof-issue" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/proof-gate.ts"],
        lastAssistantText: "Implemented the acceptance criteria and recorded implementation proof.",
      },
      finish: true,
      reviewProjectBoardProof: false,
    });

    const reviewed = store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Ambient/Pi judged the card complete with strong proof.",
        satisfied: ["Implementation evidence recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-19T00:00:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "strong",
        confidence: 0.97,
        recommendedAction: "close",
      },
    });

    expect(reviewed).toMatchObject({
      status: "review",
      proofReview: {
        status: "ready_for_review",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.97,
        missing: expect.arrayContaining(["Manual proof missing: Record manual PM review."]),
      },
    });
    expect(reviewed?.proofReview?.summary).toContain("PM review is required before auto-closure");
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("needs_review");
  });

  it("does not treat .ambient board artifacts as implementation proof", () => {
    const thread = store.createThread("Board artifact proof thread");
    const board = store.createProjectBoard({ title: "Board artifact proof board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement application behavior",
      description: "Change product code, not only board metadata.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Application behavior is implemented."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/board-artifact-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [".ambient/board/cards.json"],
        lastAssistantText: "Completed the acceptance criteria by updating board metadata.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview?.missing).toContain("No changed implementation files or meaningful diff evidence recorded.");
  });

  it("treats absolute source paths inside a prepared run workspace as implementation proof", () => {
    const thread = store.createThread("Absolute task workspace proof thread");
    const board = store.createProjectBoard({ title: "Absolute task workspace proof board" });
    const draft = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Implement single-file app",
      description: "Build the app in the prepared local task workspace.",
    });
    const ready = store.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      acceptanceCriteria: ["Single-file app is implemented."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    const approved = store.approveProjectBoardCard(ready.id);
    const workspace = "/tmp/absolute-proof/.ambient-codex/orchestration/workspaces/LOCAL-1";
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: workspace });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: [
          `${workspace}/index.html`,
          `${workspace}/.ambient-codex/browser/screenshots/proof.png`,
          `${workspace}/node_modules/cache/index.js`,
        ],
        lastAssistantText: "Implemented the acceptance criteria in the app and captured browser proof.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.proofReview?.satisfied).toContain("Implementation evidence recorded.");
    expect(reviewed.proofReview?.missing).not.toContain("No changed implementation files or meaningful diff evidence recorded.");
  });

  it("can defer board proof review and apply a live Ambient/Pi PM judgment", () => {
    const thread = store.createThread("Live proof review thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip with live judgment." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Live-judged proof card",
      summary: "Exercise live proof judgment.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior for live judgment." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Live proof judgment board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/live-proof-review" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/game.ts"],
        afterRunHook: { ok: true },
        lastAssistantText: "Implemented the acceptance criteria and unit tests passed.",
      },
      finish: true,
      reviewProjectBoardProof: false,
    });

    expect(store.getProjectBoardCard(approved.id).proofReview).toBeUndefined();
    const context = store.getProjectBoardProofReviewContextForRun(run.id);
    expect(context?.deterministicReview.status).toBe("ready_for_review");

    store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "done",
        summary: "Ambient/Pi judged the card complete with strong unit and implementation proof.",
        satisfied: ["Implementation evidence recorded.", "Unit proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "zai-org/GLM-5.1-FP8",
        confidence: 0.93,
        evidenceQuality: "strong",
        recommendedAction: "close",
        deterministicStatus: context!.deterministicReview.status,
        deterministicSummary: context!.deterministicReview.summary,
        judgeDurationMs: 1234,
      },
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("done");
    expect(reviewed.proofReview).toMatchObject({
      status: "done",
      reviewer: "ambient_pi",
      model: "zai-org/GLM-5.1-FP8",
      confidence: 0.93,
      evidenceQuality: "strong",
      recommendedAction: "close",
      deterministicStatus: "ready_for_review",
    });
    expect(store.getOrchestrationTask(approved.orchestrationTaskId!).state).toBe("done");
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      title: "Card proof reviewed by Pi",
      metadata: expect.objectContaining({ reviewer: "ambient_pi", recommendedAction: "close", confidence: 0.93 }),
    });
  });

  it("creates proof follow-up cards when run proof is too weak to close a board card", () => {
    const thread = store.createThread("Weak proof thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip then review proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Weak proof card",
      summary: "Exercise weak proof handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Weak proof board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/weak-proof" });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: { lastAssistantText: "I made progress, but no proof is attached yet." },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed.status).toBe("blocked");
    expect(reviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      runId: run.id,
      missing: expect.arrayContaining([
        expect.stringContaining("Acceptance criteria"),
        expect.stringContaining("No changed implementation files"),
        expect.stringContaining("Unit proof missing"),
        expect.stringContaining("Visual proof missing"),
      ]),
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      title: "Complete proof for Weak proof card",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["proof-follow-up", "plan"]),
    });
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUps[0].id]);
  });

  it("prevents stale run follow-up cards from becoming ready after the parent is done", () => {
    const thread = store.createThread("Stale proof follow-up thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nShip then review proof." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Parent proof card",
      summary: "Exercise stale proof follow-up handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement behavior that needs proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Capture visual screenshot."],
      decisionQuestions: [],
    });

    const board = store.createProjectBoard({ title: "Stale proof follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const run = store.recordPreparedOrchestrationRun({
      taskId: approved.orchestrationTaskId!,
      workspacePath: "/tmp/stale-proof-follow-up",
    });

    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: { lastAssistantText: "I made progress, but no proof is attached yet." },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    const followUp = store.getActiveProjectBoard()!.cards.find((candidate) => candidate.sourceKind === "run_follow_up")!;
    store.updateProjectBoardCardCandidateStatus(followUp.id, "ready_to_create");
    store.resolveProjectBoardProofDecision({ cardId: reviewed.id, action: "accept_done", reason: "Parent scope is already complete." });

    store.updateProjectBoardStatus(board.id, "active");
    expect(store.createReadyProjectBoardTasks(board.id)).toEqual([]);
    expect(() => store.approveProjectBoardCard(followUp.id)).toThrow('parent card "Parent proof card" is already done');

    store.updateProjectBoardCardCandidateStatus(followUp.id, "needs_clarification");
    expect(() => store.updateProjectBoardCardCandidateStatus(followUp.id, "ready_to_create")).toThrow(
      'parent card "Parent proof card" is already done',
    );
    expect(store.getProjectBoardCard(followUp.id)).toMatchObject({ status: "draft", candidateStatus: "needs_clarification" });
  });

  it("materializes Pi-suggested proof follow-up cards without rewriting the approved parent", () => {
    const thread = store.createThread("Pi proof follow-up thread");
    const message = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "## Plan\nImplement and prove a visual polish card.",
    });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Visual proof card",
      summary: "Exercise Pi-suggested proof follow-up handling.",
      content: message.content,
      steps: [{ id: "step-1", title: "Implement responsive polish that needs screenshot proof." }],
      openQuestions: [],
      risks: [],
      verification: ["Capture desktop and mobile screenshots."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Pi proof follow-up board" });
    const card = store.promotePlannerPlanToBoard(artifact.id);
    const approved = store.approveProjectBoardCard(card.id);
    const originalDescription = approved.description;
    const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath: "/tmp/pi-proof-follow-up" });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: thread.id,
      proofOfWork: {
        changedFiles: ["src/index.html"],
        lastAssistantText: "Implemented the responsive polish, but screenshots were not captured before handoff.",
      },
    });

    store.applyProjectBoardCardProofReview({
      runId: run.id,
      review: {
        status: "needs_follow_up",
        summary: "Implementation evidence exists, but the required viewport screenshots are missing.",
        satisfied: ["Implementation evidence recorded."],
        missing: ["Collect desktop and mobile screenshot evidence for the responsive polish."],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "gmi-proof-judge-test",
        confidence: 0.88,
        evidenceQuality: "mixed",
        recommendedAction: "follow_up",
        followUpSuggestion: {
          title: "Collect responsive polish screenshot proof",
          description: "Capture the missing viewport evidence for the completed responsive polish work.",
          acceptanceCriteria: [
            "Desktop screenshot shows the responsive polish rendered without overlap.",
            "Mobile screenshot shows the compact layout rendered without overlap.",
          ],
          testPlan: {
            unit: [],
            integration: ["Run the browser smoke check before collecting screenshots."],
            visual: ["Capture 1280px desktop and 390px mobile screenshots."],
            manual: ["Inspect screenshots for layout overlap and clipped text."],
          },
          clarificationQuestions: ["Confirm whether tablet viewport proof is also required before ticketizing."],
          labels: ["visual-proof", "viewport"],
          rationale: "The parent implementation should not be rewritten; the missing evidence is additive follow-up work.",
        },
      },
    });

    const reviewed = store.getProjectBoardCard(approved.id);
    expect(reviewed).toMatchObject({
      status: "blocked",
      description: originalDescription,
      proofReview: {
        status: "needs_follow_up",
        reviewer: "ambient_pi",
        followUpSuggestion: expect.objectContaining({
          title: "Collect responsive polish screenshot proof",
          labels: ["visual-proof", "viewport"],
        }),
      },
    });
    const followUps = store.getActiveProjectBoard()!.cards.filter((candidate) => candidate.sourceKind === "run_follow_up");
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      title: "Collect responsive polish screenshot proof",
      description: "Capture the missing viewport evidence for the completed responsive polish work.",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [approved.id],
      labels: expect.arrayContaining(["proof-follow-up", "pi-suggested-follow-up", "visual-proof", "viewport"]),
      acceptanceCriteria: [
        "Desktop screenshot shows the responsive polish rendered without overlap.",
        "Mobile screenshot shows the compact layout rendered without overlap.",
      ],
      testPlan: {
        unit: [],
        integration: ["Run the browser smoke check before collecting screenshots."],
        visual: ["Capture 1280px desktop and 390px mobile screenshots."],
        manual: ["Inspect screenshots for layout overlap and clipped text."],
      },
      clarificationQuestions: ["Confirm whether tablet viewport proof is also required before ticketizing."],
    });
    expect(reviewed.proofReview?.followUpCardIds).toEqual([followUps[0].id]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "card_proof_reviewed",
      metadata: expect.objectContaining({
        followUpSuggestionUsed: true,
        followUpSuggestionTitle: "Collect responsive polish screenshot proof",
      }),
    });
    expect(
      store
        .getActiveProjectBoard()
        ?.events?.some((event) => event.kind === "run_follow_up_created" && event.metadata.piSuggestedFollowUp === true),
    ).toBe(true);
  });
});
