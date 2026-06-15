import { describe, expect, it } from "vitest";

import type { OrchestrationTask, ProjectBoardCard, ProjectBoardExecutionArtifact, ProjectBoardSummary } from "../../shared/types";
import {
  projectBoardCardDependencyBadges,
  projectBoardCardCanEditDependencies,
  projectBoardDependencyChangeImpactPreview,
  projectBoardDependencyEditOptions,
  projectBoardDependencyHealth,
  projectBoardDependencyRows,
  projectBoardDependencySatisfied,
  projectBoardExecutionArtifactSatisfiesDependency,
  projectBoardLatestExecutionArtifactByCard,
  projectBoardPrimaryBlockingCard,
} from "./projectBoardDependencyUiModel";

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: overrides.id ?? "card-1",
    boardId: overrides.boardId ?? "board-1",
    title: overrides.title ?? "Card",
    description: overrides.description ?? "",
    status: overrides.status ?? "ready",
    candidateStatus: overrides.candidateStatus ?? "ready_to_create",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    testPlan: overrides.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: overrides.sourceKind ?? "planner_plan",
    sourceId: overrides.sourceId ?? "artifact-base",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: overrides.id ?? "task-1",
    identifier: overrides.identifier ?? "LOCAL-1",
    title: overrides.title ?? "Task",
    state: overrides.state ?? "ready",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    sourceKind: overrides.sourceKind ?? "project_board_card",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function proof(overrides: Partial<NonNullable<ProjectBoardExecutionArtifact["proof"]>> = {}): NonNullable<ProjectBoardExecutionArtifact["proof"]> {
  return {
    summary: overrides.summary ?? "Proof available.",
    commands: overrides.commands ?? [],
    changedFiles: overrides.changedFiles ?? [],
    screenshots: overrides.screenshots ?? [],
    browserTraces: overrides.browserTraces ?? [],
    visualChecks: overrides.visualChecks ?? [],
    manualChecks: overrides.manualChecks ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function handoff(
  overrides: Partial<NonNullable<ProjectBoardExecutionArtifact["handoff"]>> = {},
): NonNullable<ProjectBoardExecutionArtifact["handoff"]> {
  return {
    summary: overrides.summary ?? "Reviewable proof.",
    completed: overrides.completed ?? [],
    remaining: overrides.remaining ?? [],
    risks: overrides.risks ?? [],
    followUps: overrides.followUps ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function artifact(overrides: Partial<ProjectBoardExecutionArtifact> = {}): ProjectBoardExecutionArtifact {
  const hasProofOverride = Object.prototype.hasOwnProperty.call(overrides, "proof");

  return {
    ...overrides,
    id: overrides.id ?? "artifact-1",
    boardId: overrides.boardId ?? "board-1",
    cardId: overrides.cardId ?? "card-1",
    status: overrides.status ?? "completed",
    source: overrides.source ?? "git",
    startedAt: overrides.startedAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    proof: hasProofOverride ? overrides.proof : proof(),
  };
}

describe("projectBoardDependencyUiModel", () => {
  it("detects unresolved blockers, cycles, and deterministic dependency order", () => {
    const cards = [
      card({ id: "foundation", title: "Foundation", priority: 1, sourceId: "artifact-foundation" }),
      card({ id: "dependent", title: "Dependent", priority: 2, blockedBy: ["foundation", "missing-ref"] }),
      card({ id: "cycle-a", title: "Cycle A", priority: 3, blockedBy: ["cycle-b"] }),
      card({ id: "cycle-b", title: "Cycle B", priority: 4, blockedBy: ["cycle-a"] }),
      card({
        id: "source-ref",
        title: "Source ref",
        priority: 5,
        blockedBy: ["artifact-foundation"],
        testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      }),
    ];

    const health = projectBoardDependencyHealth(cards);

    expect(health.unresolved.map((item) => [item.card.id, item.blockerRef])).toEqual([["dependent", "missing-ref"]]);
    expect(health.cycles).toEqual([{ cardIds: ["cycle-a", "cycle-b"], titles: ["Cycle A", "Cycle B"] }]);
    expect(health.cycleRepairSuggestions[0]).toMatchObject({
      card: expect.objectContaining({ id: "cycle-b" }),
      blocker: expect.objectContaining({ id: "cycle-a" }),
      blockerRef: "cycle-a",
    });
    expect(health.criticalPath.cards.map((item) => item.id)).toEqual(["foundation", "dependent"]);
    expect(health.orderedCards.slice(0, 3).map((item) => item.id)).toEqual(["foundation", "dependent", "source-ref"]);
    expect(health.readiness.map((item) => [item.card.id, item.order, item.state])).toEqual([
      ["foundation", 1, "ready_after_proof"],
      ["dependent", 2, "blocked_issue"],
      ["source-ref", 3, "waiting_on_dependencies"],
      ["cycle-a", 4, "cycle"],
      ["cycle-b", 5, "cycle"],
    ]);
  });

  it("classifies dependency badges by current card, task, and unresolved blocker state", () => {
    const cards: ProjectBoardCard[] = [
      card({ id: "done-card", title: "Finished foundation", status: "done", orchestrationTaskId: "task-done", testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] } }),
      card({ id: "ready-card", title: "Still waiting", orchestrationTaskId: "task-ready", testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] } }),
      card({
        id: "dependent",
        title: "Dependent",
        status: "in_progress",
        blockedBy: ["done-card", "ready-card", "missing-ref", "LOCAL-7"],
        testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      }),
    ];
    const tasks = [
      task({ id: "task-done", identifier: "LOCAL-1", title: "Finished foundation", state: "done" }),
      task({ id: "task-ready", identifier: "LOCAL-2", title: "Still waiting", state: "ready" }),
      task({ id: "task-review", identifier: "LOCAL-7", title: "Review handoff", state: "review", sourceKind: "local" }),
    ];

    expect(projectBoardCardDependencyBadges(cards[2], cards, { tasks }).map((badge) => [badge.ref, badge.prefix, badge.state, badge.label])).toEqual([
      ["done-card", "Dependency ready", "satisfied", "Finished foundation"],
      ["ready-card", "Blocked by", "blocked", "Still waiting"],
      ["missing-ref", "Unresolved blocker", "unresolved", "missing-ref"],
      ["LOCAL-7", "Dependency ready", "satisfied", "LOCAL-7"],
    ]);
  });

  it("previews dependency edit impact before mutating blocker lists", () => {
    const cards = [
      card({ id: "foundation", title: "Foundation", priority: 1, testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] } }),
      card({ id: "feature", title: "Feature", priority: 2, blockedBy: ["foundation"], testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] } }),
      card({ id: "polish", title: "Polish", priority: 3, blockedBy: ["feature"], testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] } }),
    ];

    const removeImpact = projectBoardDependencyChangeImpactPreview(cards[1], cards, {
      action: "remove_blocker",
      blockerRef: "foundation",
    });
    const cycleImpact = projectBoardDependencyChangeImpactPreview(cards[0], cards, {
      action: "add_blocker",
      blockerRef: "polish",
    });

    expect(removeImpact).toMatchObject({
      visible: true,
      tone: "ready",
      modelCallRequired: false,
      existingCardsRewritten: false,
      blockerLabel: "Foundation",
      beforeState: "waiting_on_dependencies",
      afterState: "ready_now",
      readyNowDelta: 1,
      issueDelta: 0,
    });
    expect(removeImpact.affectedCards.map((item) => [item.cardId, item.beforeLabel, item.afterLabel])).toContainEqual([
      "feature",
      "Waiting on dependencies (#2)",
      "Ready now (#2)",
    ]);
    expect(cycleImpact).toMatchObject({
      visible: true,
      tone: "danger",
      issueDelta: 1,
      beforeState: "ready_now",
      afterState: "cycle",
    });
  });

  it("keeps dependency edit helpers and pulled execution proof behavior together", () => {
    const draft = card({ id: "draft", title: "Draft", status: "draft", candidateStatus: "needs_clarification", blockedBy: ["card:ready"] });
    const ready = card({ id: "ready", title: "Ready blocker", priority: 1 });
    const done = card({ id: "done", title: "Done blocker", status: "done", priority: 3 });
    const cards = [ready, draft, done, card({ id: "archived", title: "Archived blocker", status: "archived", priority: 4 })];

    expect(projectBoardCardCanEditDependencies(draft)).toBe(true);
    expect(projectBoardDependencyRows(cards).find((row) => row.card.id === "ready")?.unblocks.map((item) => item.id)).toEqual(["draft"]);
    expect(projectBoardDependencyEditOptions(draft, cards)).toEqual([
      { ref: "ready", label: "Ready blocker", disabled: true, reason: "Already a blocker" },
      { ref: "done", label: "Done blocker", disabled: false, reason: undefined },
    ]);
    expect(projectBoardPrimaryBlockingCard({ ...draft, blockedBy: ["missing-ref", "ready"] }, cards)?.id).toBe("ready");

    const latestByCard = projectBoardLatestExecutionArtifactByCard([
      artifact({ id: "old", cardId: "ready", updatedAt: "2026-01-01T00:01:00.000Z", status: "failed" }),
      artifact({ id: "new", cardId: "ready", updatedAt: "2026-01-01T00:02:00.000Z", status: "needs_review", handoff: handoff(), proof: undefined }),
    ]);
    expect(latestByCard.get("ready")?.id).toBe("new");
    expect(projectBoardExecutionArtifactSatisfiesDependency(latestByCard.get("ready"))).toBe(true);
    expect(projectBoardDependencySatisfied(ready, latestByCard)).toBe(true);
  });
});
