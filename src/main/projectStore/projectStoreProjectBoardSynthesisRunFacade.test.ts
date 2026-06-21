import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board synthesis run facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("records project-board synthesis run telemetry and failed diagnostics", () => {
    const board = store.createProjectBoard({ title: "Telemetry board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });

    expect(run).toMatchObject({
      boardId: board.id,
      status: "running",
      stage: "source_scan",
      model: "zai-org/GLM-5.1-FP8",
      events: [expect.objectContaining({ title: "Synthesis run started" })],
    });

    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: "Scanned 5 sources and kept 4 for synthesis.",
      metadata: { sourceCount: 5, includedSourceCount: 4, sourceCharCount: 2400 },
      sourceCount: 5,
      includedSourceCount: 4,
      sourceCharCount: 2400,
    });
    store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "model_request",
      title: "Asked Ambient/Pi",
      summary: "Sent prompt to Ambient/Pi.",
      metadata: { promptCharCount: 8300 },
      promptCharCount: 8300,
    });
    const progressed = store.recordProjectBoardSynthesisRunProgressiveRecords(run.id, [
      {
        type: "candidate_card",
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Create the project shell.",
        candidateStatus: "ready_to_create",
        labels: ["foundation"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-1" }],
        acceptanceCriteria: ["Shell exists."],
        testPlan: { unit: [], integration: ["Run the app."], visual: ["Screenshot."], manual: [] },
      },
      {
        type: "question",
        questionId: "question:shell",
        question: "Which renderer should the shell use?",
        required: true,
        createdAt: "2026-05-02T11:59:00.000Z",
      },
      {
        type: "source_coverage",
        sourceId: "source-1",
        status: "covered",
        cardIds: ["synthesis:shell"],
        updatedAt: "2026-05-02T11:59:00.000Z",
      },
    ]);
    expect(progressed).toMatchObject({
      stage: "schema_validation",
      cardCount: 1,
      questionCount: 1,
      progressiveRecordCount: 3,
      progressiveSummary: {
        candidateCardCount: 1,
        questionCount: 1,
        sourceCoverageCount: 1,
        latestCandidateCardTitle: "Create shell",
        latestQuestion: "Which renderer should the shell use?",
        renderedCardCount: 1,
        renderedCardBlockedCount: 0,
        renderedCardDuplicateCount: 0,
        renderedCardSplitLineageCount: 0,
        renderedCardLedgerChecksum: expect.stringMatching(/^rendered-card-ledger-/),
        renderedCardLedger: [
          expect.objectContaining({
            cardId: "synthesis:shell",
            title: "Create shell",
            candidateStatus: "ready_to_create",
            clarificationState: "none",
            duplicateDecision: "unique",
            restartAction: "reuse_rendered_card",
            renderFingerprint: expect.stringMatching(/^rendered-card-/),
          }),
        ],
      },
    });
    const failed = store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "failed",
      title: "Synthesis run failed",
      summary: "Ambient project-board synthesis did not return valid JSON.",
      metadata: { error: "invalid json" },
      status: "failed",
      error: "Ambient project-board synthesis did not return valid JSON.",
      completedAt: "2026-05-02T12:00:00.000Z",
    });

    expect(failed).toMatchObject({
      status: "failed",
      stage: "failed",
      sourceCount: 5,
      includedSourceCount: 4,
      sourceCharCount: 2400,
      promptCharCount: 8300,
      progressiveRecordCount: 3,
      error: "Ambient project-board synthesis did not return valid JSON.",
      completedAt: "2026-05-02T12:00:00.000Z",
    });
    expect(failed.events.map((event) => event.stage)).toEqual(["source_scan", "source_scan", "model_request", "schema_validation", "failed"]);

    const summary = store.getActiveProjectBoard()!;
    expect(summary.synthesisRuns?.[0]).toMatchObject({
      id: run.id,
      status: "failed",
      events: expect.arrayContaining([expect.objectContaining({ title: "Synthesis run failed" })]),
    });
  });

  it("persists planning snapshots and records chosen snapshot provenance during ticketization", () => {
    const board = store.createProjectBoard({ title: "Snapshot transaction board" });
    const [source] = store.replaceProjectBoardSources(board.id, [
      {
        kind: "functional_spec",
        title: "Expense summarizer CSV fixture",
        summary: "Summarize expenses by category and flag unusual rows.",
        path: "expenses.csv",
        excerpt: "date,category,amount\n2026-05-01,travel,42.00",
        relevance: 100,
      },
    ]);
    store.updateProjectBoardStatus(board.id, "active");
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "gmi-test-model" });

    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Expense summary board.",
        goal: "Create a CSV expense summarizer.",
        currentState: "The source CSV is present.",
        targetUser: "Finance operator.",
        qualityBar: "Ticketized work must include deterministic proof.",
        assumptions: [],
        questions: [],
        sourceNotes: ["expenses.csv is the primary source."],
        cards: [
          {
            sourceId: "synthesis:expense-summary",
            title: "Implement CSV expense summary",
            description: "Read expenses.csv and summarize spending by category.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["csv", "expense"],
            blockedBy: [],
            sourceRefs: [source.id],
            acceptanceCriteria: ["Summary groups rows by category."],
            testPlan: { unit: ["Run expense parser unit tests."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, snapshotRunId: run.id, snapshotKind: "incremental" },
    );
    const draftCard = synthesized.cards.find((card) => card.sourceId === "synthesis:expense-summary")!;
    const runningRun = store.getProjectBoardSynthesisRun(run.id)!;
    expect(runningRun.planningSnapshots).toHaveLength(1);
    const incrementalSnapshot = runningRun.planningSnapshots![0];
    expect(incrementalSnapshot).toMatchObject({
      kind: "incremental",
      planningStatus: "running",
      planningStage: "source_scan",
      cardCount: 1,
      readyCandidateCount: 1,
      ticketizedCount: 0,
      cardIds: [draftCard.id],
      sourceHashes: [expect.objectContaining({ sourceId: source.id, contentHash: source.contentHash })],
      cards: [expect.objectContaining({ cardId: draftCard.id, sourceId: "synthesis:expense-summary" })],
      renderFingerprint: expect.stringMatching(/^planning-snapshot-/),
    });

    const succeeded = store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: "Applied expense planning snapshot",
      summary: "The expense planning snapshot is ready for ticketization.",
      status: "succeeded",
      cardCount: 1,
      questionCount: 0,
      completedAt: "2026-05-17T12:00:00.000Z",
    });
    expect(succeeded.planningSnapshots).toHaveLength(2);
    expect(succeeded.planningSnapshots![0]).toEqual(incrementalSnapshot);
    const finalSnapshot = succeeded.planningSnapshots![1];
    expect(finalSnapshot).toMatchObject({
      kind: "final",
      planningStatus: "succeeded",
      planningStage: "board_applied",
      cardIds: [draftCard.id],
      readyCandidateCount: 1,
      ticketizedCount: 0,
      renderFingerprint: expect.stringMatching(/^planning-snapshot-/),
    });

    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ id: draftCard.id, status: "ready", orchestrationTaskId: expect.any(String) });
    const readyEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "ready_tasks_created");
    expect(readyEvent?.metadata).toMatchObject({
      planningSnapshotId: finalSnapshot.id,
      planningSnapshotRunId: run.id,
      planningSnapshotKind: "final",
      planningSnapshotFingerprint: finalSnapshot.renderFingerprint,
      planningSnapshotCardIds: [draftCard.id],
    });
  });

  it("updates project-board synthesis run progress without appending durable events", () => {
    const board = store.createProjectBoard({ title: "Progress board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });

    const progressed = store.updateProjectBoardSynthesisRunProgress(run.id, {
      stage: "source_classification",
      responseCharCount: 1400,
      promptCharCount: 9200,
    });

    expect(progressed).toMatchObject({
      stage: "source_classification",
      promptCharCount: 9200,
      responseCharCount: 1400,
      events: [expect.objectContaining({ title: "Synthesis run started" })],
    });

    const progressedAgain = store.updateProjectBoardSynthesisRunProgress(run.id, {
      stage: "model_response",
      responseCharCount: 2600,
      cardCount: 2,
      questionCount: 1,
    });

    expect(progressedAgain).toMatchObject({
      stage: "model_response",
      promptCharCount: 9200,
      responseCharCount: 2600,
      cardCount: 2,
      questionCount: 1,
    });
    expect(progressedAgain.events.map((event) => event.title)).toEqual(["Synthesis run started"]);
  });

  it("ignores stale project-board synthesis progress for missing or terminal runs", () => {
    const board = store.createProjectBoard({ title: "Stale progress board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });
    const paused = store.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "Paused from the progress panel.",
    });

    expect(store.tryUpdateProjectBoardSynthesisRunProgress("missing-run", { stage: "model_response", responseCharCount: 1200 })).toBeUndefined();

    const ignored = store.tryUpdateProjectBoardSynthesisRunProgress(run.id, {
      stage: "model_response",
      responseCharCount: 1200,
      cardCount: 99,
    });

    expect(ignored).toMatchObject({
      id: run.id,
      status: "paused",
      stage: "paused",
      responseCharCount: paused.responseCharCount,
      cardCount: paused.cardCount,
    });
    expect(store.getProjectBoardSynthesisRun(run.id)).toMatchObject({
      status: "paused",
      stage: "paused",
      responseCharCount: paused.responseCharCount,
      cardCount: paused.cardCount,
    });
    expect(() => store.updateProjectBoardSynthesisRunProgress("missing-run", { stage: "model_response" })).toThrow(
      "Project board synthesis run not found: missing-run",
    );
  });

  it("summarizes semantic-idle section records for retryable synthesis recovery", () => {
    const board = store.createProjectBoard({ title: "Semantic idle board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "zai-org/GLM-5.1-FP8" });

    const progressed = store.recordProjectBoardSynthesisRunProgressiveRecords(run.id, [
      {
        type: "progress",
        stage: "section_failed",
        title: "Stalled section 1/2",
        summary: "Movement stalled without model content or planner records.",
        createdAt: "2026-05-02T11:59:00.000Z",
        metadata: {
          sectionId: "section-movement",
          sectionStatus: "failed",
          failureKind: "semantic_idle_timeout",
          sectionHeading: "Movement",
          sectionIndex: 1,
          sectionCount: 2,
        },
      },
      {
        type: "error",
        code: "section_semantic_idle_timeout",
        message: "Movement stalled after 25ms without model content or planner records.",
        recoverable: true,
        createdAt: "2026-05-02T11:59:00.000Z",
        metadata: {
          sectionId: "section-movement",
          sourceId: "source-1",
          range: "lines:1-3",
          failureKind: "semantic_idle_timeout",
        },
      },
      {
        type: "source_coverage",
        sourceId: "source-1",
        range: "lines:1-3",
        status: "unresolved",
        cardIds: [],
        note: "Retry this section.",
        updatedAt: "2026-05-02T11:59:00.000Z",
      },
    ]);

    expect(progressed).toMatchObject({
      progressiveRecordCount: 3,
      progressiveSummary: {
        sectionFailedCount: 1,
        semanticIdleSectionCount: 1,
        latestSectionHeading: "Movement",
        latestError: "Movement stalled after 25ms without model content or planner records.",
      },
    });
  });

  it("finds running project-board synthesis runs and marks stale ones failed", () => {
    const board = store.createProjectBoard({ title: "Single-flight board" });
    const first = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.recordProjectBoardSynthesisRunEvent(first.id, {
      stage: "model_response",
      title: "Streaming from Ambient/Pi",
      summary: "The first run is still receiving streamed output.",
      responseCharCount: 512,
    });

    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toMatchObject({
      id: first.id,
      status: "running",
      stage: "model_response",
      responseCharCount: 512,
    });

    const stale = store.failStaleProjectBoardSynthesisRuns({
      boardId: board.id,
      staleBefore: "2999-01-01T00:00:00.000Z",
      reason: "No synthesis progress was recorded.",
    });

    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({
      id: first.id,
      status: "failed",
      stage: "failed",
      error: "No synthesis progress was recorded.",
      events: expect.arrayContaining([expect.objectContaining({ title: "Synthesis run marked stale" })]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();

    const second = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)?.id).toBe(second.id);
  });

  it("persists project-board synthesis pause requests and paused checkpoints", () => {
    const board = store.createProjectBoard({ title: "Pause board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });

    const requested = store.requestProjectBoardSynthesisRunPause({
      boardId: board.id,
      runId: run.id,
      reason: "User wants to inspect the first cards.",
    });

    expect(requested).toMatchObject({
      id: run.id,
      status: "pause_requested",
      events: expect.arrayContaining([
        expect.objectContaining({
          title: "Pause requested",
          metadata: expect.objectContaining({
            decision: "pause_planning",
            checkpointPolicy: "safe_planner_boundary",
          }),
        }),
      ]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toMatchObject({ id: run.id, status: "pause_requested" });

    const paused = store.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "Planning paused after planner batch 1.",
      metadata: {
        lastValidRecordId: "synthesis:shell",
        lastValidRecordType: "candidate_card",
        plannerBatchIndex: 1,
      },
    });

    expect(paused).toMatchObject({
      id: run.id,
      status: "paused",
      stage: "paused",
      completedAt: expect.any(String),
    });
    expect(paused.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Planning paused",
          metadata: expect.objectContaining({
            decision: "planning_paused",
            retryable: true,
            lastValidRecordId: "synthesis:shell",
            lastValidRecordType: "candidate_card",
            plannerBatchIndex: 1,
          }),
        }),
      ]),
    );
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();

    const abandoned = store.abandonProjectBoardSynthesisRunPause({
      boardId: board.id,
      runId: run.id,
      reason: "User wants a clean planning pass.",
    });

    expect(abandoned).toMatchObject({
      id: run.id,
      status: "abandoned",
      stage: "paused",
      events: expect.arrayContaining([
        expect.objectContaining({
          title: "Paused planning abandoned",
          metadata: expect.objectContaining({
            decision: "abandon_paused_planning",
            retryable: false,
            checkpointPolicy: "start_fresh",
          }),
        }),
      ]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();
  });

  it("marks a stalled synthesis run failed with resumable section metadata", () => {
    const board = store.createProjectBoard({ title: "Recoverable board" });
    const run = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-model" });
    store.recordProjectBoardSynthesisRunProgressiveRecords(run.id, [
      {
        type: "progress",
        stage: "section_succeeded",
        title: "Completed section 1/2",
        summary: "Foundation cards planned.",
        createdAt: "2026-05-02T12:00:00.000Z",
        metadata: {
          sectionId: "section-foundation",
          sectionStatus: "succeeded",
          sectionIndex: 1,
          sectionCount: 2,
          sectionHeading: "Foundation",
        },
      },
    ]);

    const stalled = store.markProjectBoardSynthesisRunStalled({
      boardId: board.id,
      runId: run.id,
      reason: "The visible Ambient/Pi stream stopped updating.",
    });

    expect(stalled).toMatchObject({
      id: run.id,
      status: "failed",
      stage: "failed",
      error: "The visible Ambient/Pi stream stopped updating.",
      events: expect.arrayContaining([
        expect.objectContaining({
          title: "Synthesis run marked stalled",
          metadata: expect.objectContaining({
            decision: "retry_stalled_run",
            retryable: true,
            completedSectionCount: 1,
            sectionCount: 2,
          }),
        }),
      ]),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id)).toBeUndefined();
  });

});
