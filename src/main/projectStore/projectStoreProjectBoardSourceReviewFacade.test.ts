import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board source review facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("replaces and persists project board source reviews", () => {
    const board = store.createProjectBoard({ title: "Source board" });

    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "Architecture",
        summary: "System design notes.",
        path: "architecture.md",
        relevance: 86,
      },
      {
        kind: "thread",
        title: "Discovery thread",
        summary: "Initial discussion.",
        threadId: "thread-1",
        relevance: 70,
      },
    ]);

    expect(sources.map((source) => source.title)).toEqual(["Architecture", "Discovery thread"]);
    expect(sources).toEqual([
      expect.objectContaining({
        sourceKey: "file:architecture.md",
        changeState: "new",
        classifiedBy: "fallback_heuristic",
        includeInSynthesis: true,
      }),
      expect.objectContaining({
        sourceKey: "thread:thread-1",
        changeState: "new",
        classifiedBy: "fallback_heuristic",
      }),
    ]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "sources_refreshed",
      title: "Sources refreshed",
      summary: "2 project sources scanned: 2 new.",
      metadata: {
        previousCount: 0,
        nextCount: 2,
        sourceKinds: { architecture_artifact: 1, thread: 1 },
        sourceChangeStates: { new: 2 },
        newCount: 2,
        removedCount: 0,
      },
    });
    expect(store.getActiveProjectBoard()?.sources).toEqual([
      expect.objectContaining({ kind: "architecture_artifact", path: "architecture.md" }),
      expect.objectContaining({ kind: "thread", threadId: "thread-1" }),
    ]);

    const piClassified = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: sources[0].id,
        sourceKey: sources[0].sourceKey,
        kind: "architecture_artifact",
        classificationReason: "Pi judged this architecture note as the primary technical authority.",
        classificationConfidence: 0.93,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "zai-org/GLM-5.1-FP8",
      },
    ]);

    expect(piClassified.find((source) => source.id === sources[0].id)).toMatchObject({
      kind: "architecture_artifact",
      classifiedBy: "ambient_pi",
      classificationReason: "Pi judged this architecture note as the primary technical authority.",
      classificationConfidence: 0.93,
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "source_updated",
      title: "Sources classified by Pi",
      metadata: {
        classifiedBy: "ambient_pi",
        classificationCount: 1,
        sourceIds: [sources[0].id],
        sourceKinds: { architecture_artifact: 1 },
        model: "zai-org/GLM-5.1-FP8",
      },
    });

    const updated = store.updateProjectBoardSource({ sourceId: sources[1].id, kind: "functional_spec" });

    expect(updated).toMatchObject({ id: sources[1].id, kind: "functional_spec", relevance: 70 });
    expect(updated).toMatchObject({ classifiedBy: "user", classificationConfidence: 1, authorityRole: "supporting", includeInSynthesis: true });
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "source_updated",
      title: "Source reclassified",
      metadata: { sourceId: sources[1].id, from: "thread", to: "functional_spec" },
    });

    const ignored = store.updateProjectBoardSource({ sourceId: sources[0].id, kind: "ignored" });

    expect(ignored).toMatchObject({ id: sources[0].id, kind: "ignored", relevance: 0 });
    expect(ignored).toMatchObject({ classifiedBy: "user", authorityRole: "ignored", includeInSynthesis: false });

    const refreshedWithOverrides = store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "Architecture refreshed",
        summary: "Updated system design notes.",
        path: "architecture.md",
        relevance: 91,
      },
      {
        kind: "thread",
        title: "Discovery thread refreshed",
        summary: "Updated discussion summary.",
        threadId: "thread-1",
        relevance: 72,
      },
    ]);

    expect(refreshedWithOverrides).toEqual([
      expect.objectContaining({ id: sources[1].id, kind: "functional_spec", title: "Discovery thread refreshed", relevance: 72, changeState: "changed" }),
      expect.objectContaining({ id: sources[0].id, kind: "ignored", title: "Architecture refreshed", relevance: 0, changeState: "changed" }),
    ]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "sources_refreshed",
      summary: "2 project sources scanned: 2 changed. Preserved 2 existing classifications.",
      metadata: {
        previousCount: 2,
        nextCount: 2,
        sourceKinds: { functional_spec: 1, ignored: 1 },
        sourceChangeStates: { changed: 2 },
        changedCount: 2,
        unchangedCount: 0,
        removedCount: 0,
        preservedClassificationCount: 2,
      },
    });

    store.replaceProjectBoardSources(board.id, [
      {
        kind: "implementation_plan",
        title: "Plan",
        summary: "Phased build plan.",
        path: "plan.md",
        relevance: 90,
      },
    ]);

    expect(store.getActiveProjectBoard()?.sources.map((source) => source.title)).toEqual(["Plan"]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "sources_refreshed",
      summary: "1 project source scanned: 1 new, 2 removed.",
      metadata: {
        previousCount: 2,
        nextCount: 1,
        sourceKinds: { implementation_plan: 1 },
        sourceChangeStates: { new: 1 },
        newCount: 1,
        removedCount: 2,
      },
    });
  });

  it("refreshes same-title project board sources without reusing one previous source id", () => {
    const board = store.createProjectBoard({ title: "Same title source board" });
    const first = store.replaceProjectBoardSources(board.id, [
      {
        kind: "thread",
        title: "New chat",
        summary: "Original empty starter chat.",
        threadId: "thread-1",
        relevance: 35,
      },
    ]);

    const refreshed = store.replaceProjectBoardSources(board.id, [
      {
        kind: "thread",
        title: "New chat",
        summary: "Starter chat in the current project.",
        threadId: "thread-2",
        relevance: 35,
      },
      {
        kind: "thread",
        title: "New chat",
        summary: "Another registered project starter chat.",
        threadId: "thread-3",
        relevance: 35,
      },
    ]);

    expect(refreshed).toHaveLength(2);
    expect(new Set(refreshed.map((source) => source.id)).size).toBe(2);
    expect(refreshed.map((source) => source.id)).not.toContain(first[0].id);
    expect(refreshed.map((source) => source.sourceKey).sort()).toEqual(["thread:thread-2", "thread:thread-3"]);
  });

  it("refreshes durable plan and parent chat sources without reusing one previous source id", () => {
    const board = store.createProjectBoard({ title: "Durable plan source board" });
    const [durablePlan] = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Plan: Simple Hello World Durable Plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/Hello-World-DurablePlan.html",
        threadId: "thread-1",
        artifactId: "artifact-1",
        messageId: "message-1",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
    ]);

    const refreshed = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Plan: Simple Hello World Durable Plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/Hello-World-DurablePlan.html",
        threadId: "thread-1",
        artifactId: "artifact-1",
        messageId: "message-1",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Simple Hello World planning chat",
        summary: "The source chat that produced the durable plan.",
        threadId: "thread-1",
        messageId: "message-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);

    const refreshedPlan = refreshed.find((source) => source.sourceKey === "file:.ambient/board/plans/Hello-World-DurablePlan.html")!;
    const refreshedThread = refreshed.find((source) => source.sourceKey === "thread:thread-1")!;
    expect(refreshed).toHaveLength(2);
    expect(refreshedPlan.id).toBe(durablePlan.id);
    expect(refreshedThread.id).not.toBe(durablePlan.id);
    expect(new Set(refreshed.map((source) => source.id)).size).toBe(2);
    expect(refreshedThread).toMatchObject({
      kind: "thread",
      authorityRole: "ignored",
      includeInSynthesis: false,
      changeState: "new",
    });
  });

  it("preserves durable-plan chat exclusion unless the user includes the chat", () => {
    const board = store.createProjectBoard({ title: "Durable authority board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Refined durable plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/App-DurablePlan.html",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Planning chat",
        summary: "Earlier planning conversation.",
        threadId: "thread-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);
    const chat = sources.find((source) => source.threadId === "thread-1")!;

    const piAttempt = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: chat.id,
        kind: "thread",
        classificationReason: "Pi wants to include the chat.",
        classificationConfidence: 0.99,
        authorityRole: "context",
        includeInSynthesis: true,
      },
    ]);
    expect(piAttempt.find((source) => source.id === chat.id)).toMatchObject({
      authorityRole: "ignored",
      includeInSynthesis: false,
    });

    const included = store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    expect(included).toMatchObject({
      classifiedBy: "user",
      authorityRole: "context",
      includeInSynthesis: true,
    });

    const refreshed = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Refined durable plan",
        summary: "Durable implementation plan.",
        path: ".ambient/board/plans/App-DurablePlan.html",
        relevance: 95,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Planning chat",
        summary: "Earlier planning conversation.",
        threadId: "thread-1",
        relevance: 70,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: "Durable plan selected as source of truth; chat thread ignored by default.",
      },
    ]);
    expect(refreshed.find((source) => source.id === chat.id)).toMatchObject({
      classifiedBy: "user",
      authorityRole: "context",
      includeInSynthesis: true,
    });
  });
});
