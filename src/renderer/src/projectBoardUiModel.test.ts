import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardEvent } from "../../shared/projectBoardTypes";
import {
  defaultProjectBoardTab,
  projectBoardColumns,
  projectBoardDependencyRows,
  projectBoardEventGroups,
  projectBoardEventKindLabel,
  projectBoardEventSummary,
  projectBoardHistoryImpactAudit,
  projectBoardPhaseGroups,
  projectBoardCardVisualTone,
  projectBoardProofCoverageForBoard,
  projectBoardResetImpact,
  projectBoardTabs,
  projectBoardTestSummary,
} from "./projectBoardUiModel";
import { claimSummary, project } from "./projectBoardUiModelTestHelpers";

describe("projectBoardUiModel", () => {
  it("groups board cards into draft, ready, progress, and review columns", () => {
    const base = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const columns = projectBoardColumns([
      { ...base, id: "card-1", title: "Draft", status: "draft" },
      { ...base, id: "card-blocked", title: "Blocked", status: "blocked" },
      { ...base, id: "card-2", title: "Ready", status: "ready" },
      { ...base, id: "card-3", title: "Running", status: "in_progress" },
      { ...base, id: "card-4", title: "Review", status: "review" },
      { ...base, id: "card-5", title: "Done", status: "done" },
    ]);

    expect(columns.map((column) => [column.id, column.cards.map((card) => card.title)])).toEqual([
      ["blocked", ["Blocked"]],
      ["ready", ["Ready"]],
      ["in_progress", ["Running"]],
      ["review", ["Review"]],
      ["done", ["Done"]],
    ]);
    expect(columns.map((column) => column.tooltip)).toEqual([
      expect.stringContaining("blocking"),
      expect.stringContaining("eligible"),
      expect.stringContaining("in progress"),
      expect.stringContaining("PM review"),
      expect.stringContaining("complete"),
    ]);
  });

  it("orders board lane cards by critical path before creation time", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const columns = projectBoardColumns([
      { ...base, id: "dependent", title: "Dependent", blockedBy: ["foundation"], createdAt: "2026-01-01T00:01:00.000Z" },
      { ...base, id: "unrelated", title: "Earlier unrelated", createdAt: "2026-01-01T00:00:30.000Z" },
      { ...base, id: "foundation", title: "Foundation", createdAt: "2026-01-01T00:02:00.000Z" },
    ]);

    expect(columns.find((column) => column.id === "ready")?.cards.map((card) => card.id)).toEqual(["foundation", "dependent", "unrelated"]);
  });

  it("uses explicit proof recheck affected-card ids in the History impact audit", () => {
    const baseCard = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Do the work."],
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const proofRecheckEvent: ProjectBoardEvent = {
      id: "event-proof-recheck",
      boardId: "board-1",
      kind: "card_updated",
      title: "Proof coverage rechecked",
      summary: "3 proof-eligible cards rechecked; 1 missing proof; 2 proof items. 0 model calls. 1 affected card since last recheck.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        proofImpact: {
          schemaVersion: 1,
          appliedAction: "recompute_proof_coverage",
          eligibleCardIds: ["changed-card", "unchanged-card", "legacy-card"],
          missingProofCardIds: ["changed-card"],
          affectedCardIds: ["changed-card"],
          staleSinceLastRecheck: true,
          driftReasons: ["1 missing-proof card added."],
          addedMissingProofCardIds: ["changed-card"],
          proofKindChangedCardIds: ["changed-card"],
          proofItemCountChangedCardIds: ["changed-card"],
          policyAffectedCardIds: ["changed-card"],
          eligibleCardCount: 3,
          missingProofCount: 1,
          modelCallRequired: false,
          existingCardsRewritten: false,
        },
      },
      createdAt: "2026-01-01T00:20:00.000Z",
    };
    const baselineEvent: ProjectBoardEvent = {
      ...proofRecheckEvent,
      id: "event-proof-baseline",
      summary: "3 proof-eligible cards rechecked; 1 missing proof; 2 proof items. 0 model calls. First recorded proof baseline.",
      metadata: {
        proofImpact: {
          ...(proofRecheckEvent.metadata.proofImpact as Record<string, unknown>),
          affectedCardIds: [],
          staleSinceLastRecheck: false,
          driftReasons: ["No proof coverage baseline has been recorded yet."],
        },
      },
      createdAt: "2026-01-01T00:19:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "",
        cards: [
          {
            ...baseCard,
            id: "changed-card",
            title: "Changed proof card",
            status: "draft" as const,
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
          {
            ...baseCard,
            id: "unchanged-card",
            title: "Unchanged proof card",
            status: "draft" as const,
            testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          },
          {
            ...baseCard,
            id: "legacy-card",
            title: "Legacy proof card",
            status: "draft" as const,
            testPlan: { unit: [], integration: ["Browser proof."], visual: [], manual: [] },
          },
        ],
        sources: [],
        questions: [],
        proposals: [],
        events: [baselineEvent, proofRecheckEvent],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const audit = projectBoardHistoryImpactAudit(board);

    expect(audit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event:proof:event-proof-recheck",
          title: "Proof coverage rechecked",
          affectedCardIds: ["changed-card"],
          notes: ["1 missing-proof card added."],
          metrics: expect.arrayContaining([
            expect.objectContaining({ label: "Cards", value: 1 }),
            expect.objectContaining({ label: "Drift", value: "yes" }),
            expect.objectContaining({ label: "New gaps", value: 1 }),
            expect.objectContaining({ label: "Proof shape", value: 1 }),
          ]),
        }),
        expect.objectContaining({
          id: "event:proof:event-proof-baseline",
          affectedCardIds: [],
          notes: ["No proof coverage baseline has been recorded yet."],
          metrics: expect.arrayContaining([
            expect.objectContaining({ label: "Cards", value: 0 }),
            expect.objectContaining({ label: "Drift", value: "no" }),
          ]),
        }),
      ]),
    );
  });

  it("summarizes reset impact without implying project files are deleted", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            id: "draft-card",
            boardId: "board-1",
            title: "Draft",
            description: "",
            status: "draft" as const,
            candidateStatus: "needs_clarification" as const,
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
            sourceKind: "manual" as const,
            sourceId: "manual",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "linked-card",
            boardId: "board-1",
            title: "Linked",
            description: "",
            status: "in_progress" as const,
            candidateStatus: "ready_to_create" as const,
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: ["Unit"], integration: [], visual: [], manual: [] },
            sourceKind: "planner_plan" as const,
            sourceId: "plan",
            orchestrationTaskId: "task-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "markdown" as const,
            sourceKey: "README.md",
            contentHash: "hash",
            title: "README",
            summary: "Summary",
            byteSize: 10,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        questions: [
          {
            id: "question-1",
            boardId: "board-1",
            question: "Goal?",
            required: true,
            answer: "Ship",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        proposals: [
          {
            id: "proposal-1",
            boardId: "board-1",
            status: "pending" as const,
            summary: "Summary",
            goal: "Ship",
            currentState: "Draft",
            targetUser: "User",
            qualityBar: "Proof",
            assumptions: [],
            questions: [],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        synthesisRuns: [
          {
            id: "run-1",
            boardId: "board-1",
            status: "failed" as const,
            stage: "model_request" as const,
            sourceCount: 1,
            includedSourceCount: 1,
            sourceCharCount: 10,
            warningCount: 0,
            events: [],
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        executionArtifacts: [
          {
            id: "artifact-1",
            boardId: "board-1",
            cardId: "linked-card",
            status: "running" as const,
            source: "local_export" as const,
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        events: [
          {
            id: "event-1",
            boardId: "board-1",
            kind: "board_created" as const,
            title: "Created",
            summary: "Created",
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        claims: { active: [claimSummary({ ownedByLocal: true })], expired: [], conflicts: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const impact = projectBoardResetImpact(board);

    expect(impact.summary).toContain("2 board cards");
    expect(impact.deleted.map((metric) => [metric.label, metric.value])).toEqual([
      ["Cards", 2],
      ["Sources", 1],
      ["Questions", 1],
      ["PM proposals", 1],
      ["Progress runs", 1],
      ["Proof/handoff artifacts", 1],
      ["History events", 1],
      ["Active claims", 1],
    ]);
    expect(impact.deleted[0].detail).toContain("1 draft candidate");
    expect(impact.preserved).toEqual([
      "Project files and Git working tree.",
      "Chat threads and planning artifacts outside this board.",
      "1 existing Local Task; they will no longer be attached to this board.",
    ]);
  });

  it("models board tabs, dependency rows, phase groups, and proof summary", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      {
        ...base,
        id: "card-1",
        title: "Foundation",
        phase: "Phase 1",
        priority: 1,
        orchestrationTaskId: "task-1",
        testPlan: { ...base.testPlan, unit: ["unit"] },
      },
      { ...base, id: "card-2", title: "Dependent", phase: "Phase 2", priority: 2, orchestrationTaskId: "task-2", blockedBy: ["card-1"] },
      { ...base, id: "card-3", title: "Candidate", status: "draft" as const, phase: "Phase 2" },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards,
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "markdown",
            title: "README",
            summary: "Project notes",
            path: "README.md",
            relevance: 0.8,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        questions: [],
        proposals: [],
        events: [
          {
            id: "event-1",
            boardId: "board-1",
            kind: "plan_promoted",
            title: "Plan added to board",
            summary: "Project plan entered the draft inbox.",
            entityKind: "project_board_card",
            entityId: "card-3",
            metadata: { artifactId: "artifact-1" },
            createdAt: "2026-01-01T00:05:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardTabs(board).map((tab) => [tab.id, tab.count])).toEqual([
      ["overview", 3],
      ["charter", 1],
      ["decisions", 0],
      ["draft_inbox", 1],
      ["map", 2],
      ["board", 2],
      ["proof", 2],
      ["integration", 0],
      ["history", 1],
    ]);
    board.proposals = [
      {
        id: "proposal-1",
        boardId: "board-1",
        status: "pending",
        summary: "Pi proposal",
        goal: "Goal",
        currentState: "State",
        targetUser: "User",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: ["Which control model should ship first?"],
        answers: [],
        sourceNotes: [],
        cards: [],
        createdAt: "2026-01-01T00:06:00.000Z",
        updatedAt: "2026-01-01T00:06:00.000Z",
      },
    ];
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(1);
    expect(defaultProjectBoardTab(board)).toBe("decisions");
    expect(projectBoardEventKindLabel(board.events![0].kind)).toBe("Plan");
    expect(projectBoardEventKindLabel("synthesis_proposal_created")).toBe("Proposal");
    expect(projectBoardEventKindLabel("synthesis_proposal_answered")).toBe("Proposal");
    expect(projectBoardEventKindLabel("synthesis_proposal_card_reviewed")).toBe("Proposal");
    expect(projectBoardEventKindLabel("board_revision_started")).toBe("Revision");
    expect(projectBoardEventKindLabel("manual_card_created")).toBe("Manual");
    expect(projectBoardEventKindLabel("source_updated")).toBe("Source");
    expect(projectBoardEventKindLabel("ready_tasks_created")).toBe("Ticket");
    expect(projectBoardEventKindLabel("card_proof_reviewed")).toBe("Proof");
    expect(projectBoardEventKindLabel("card_proof_review_ignored")).toBe("Proof");
    expect(projectBoardEventKindLabel("card_execution_session_assigned")).toBe("Session");
    expect(projectBoardEventKindLabel("card_run_completed")).toBe("Run");
    expect(projectBoardEventKindLabel("card_run_handoff_created")).toBe("Handoff");
    expect(projectBoardEventKindLabel("card_claimed")).toBe("Claim");
    expect(projectBoardEventKindLabel("execution_readiness_blocked")).toBe("Execution");
    expect(projectBoardEventKindLabel("workflow_created")).toBe("Workflow");
    expect(projectBoardEventKindLabel("workflow_raw_updated")).toBe("Workflow");
    expect(projectBoardEventKindLabel("deliverable_integration_resolved")).toBe("Integration");
    expect(projectBoardEventSummary(board.events)).toBe("1 plan event");
    board.status = "draft";
    board.proposals = [];
    expect(defaultProjectBoardTab(board)).toBe("charter");
    board.status = "active";
    board.cards = [{ ...base, id: "card-draft-only", title: "Candidate only", status: "draft" as const, phase: "Phase 1" }];
    expect(defaultProjectBoardTab(board)).toBe("draft_inbox");
    board.cards = cards;
    expect(projectBoardEventGroups(board.events)).toHaveLength(1);
    expect(
      projectBoardDependencyRows(cards)
        .find((row) => row.card.id === "card-1")
        ?.unblocks.map((card) => card.id),
    ).toEqual(["card-2"]);
    expect(
      projectBoardPhaseGroups(cards, new Set(["card-1"])).map((group) => [
        group.phase,
        group.cards.length,
        group.blockedCount,
        group.readyCount,
        group.reviewCount,
        group.criticalPathCount,
        group.tone,
      ]),
    ).toEqual([
      ["Phase 1", 1, 0, 1, 0, 1, "critical"],
      ["Phase 2", 2, 1, 1, 0, 0, "blocked"],
    ]);
    expect(
      projectBoardPhaseGroups([{ ...base, id: "card-review", title: "Review", status: "review" as const, phase: "Phase 3" }])[0]?.tone,
    ).toBe("review");
    expect(
      projectBoardCardVisualTone({
        ...base,
        id: "tone-blocked",
        title: "Blocked",
        status: "draft" as const,
        candidateStatus: "needs_clarification",
      }),
    ).toBe("blocked");
    expect(
      projectBoardCardVisualTone(
        { ...base, id: "tone-ready", title: "Ready", status: "ready" as const, candidateStatus: "ready_to_create" },
        "ready_now",
      ),
    ).toBe("ready");
    expect(projectBoardCardVisualTone({ ...base, id: "tone-running", title: "Running", status: "in_progress" as const }, "running")).toBe(
      "running",
    );
    expect(projectBoardTestSummary(cards)).toMatchObject({
      unit: 1,
      integration: 0,
      visual: 0,
      manual: 0,
      missing: [expect.objectContaining({ id: "card-2" }), expect.objectContaining({ id: "card-3" })],
    });
    expect(projectBoardProofCoverageForBoard(board)).toMatchObject({
      unit: [expect.objectContaining({ id: "card-1" })],
      integrationOrBrowser: [],
      manual: [],
      missing: [expect.objectContaining({ id: "card-2" }), expect.objectContaining({ id: "card-3" })],
      strict: false,
      relaxedWarning: true,
    });
  });
});
