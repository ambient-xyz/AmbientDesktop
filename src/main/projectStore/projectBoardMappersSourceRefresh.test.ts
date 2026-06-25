import { describe, expect, it } from "vitest";

import { DURABLE_PLAN_SOURCE_AUTHORITY_REASON, GENERATED_REPORT_SOURCE_AUTHORITY_REASON } from "./projectStoreProjectBoardFacade";
import {
  mapProjectBoardSourceRow,
  normalizeProjectBoardSourceInputs,
  normalizeProjectBoardSynthesisRunEvent,
  normalizeProjectBoardSynthesisRunProgressiveRecord,
  projectBoardEventKindFromArtifact,
  projectBoardEventMetadataFromArtifact,
  projectBoardEventSummaryFromArtifact,
  projectBoardEventTitleFromArtifact,
  projectBoardSourceClassificationUpdates,
  projectBoardSourceKindCounts,
  projectBoardSourceRefreshEventMetadata,
  projectBoardSourceRefreshSources,
  projectBoardSourceRefreshStats,
  projectBoardSourceRefreshStoreRow,
  projectBoardSourceRefreshSummary,
  projectBoardSourceShouldPreservePreviousClassification,
  projectBoardSourceUserClassificationUpdate,
  sourceRefArtifactStrings,
} from "./projectBoardMappers";
import { boardEventArtifact, projectBoardSource } from "./projectBoardMappersTestSupport";

describe("project board source refresh mappers", () => {
  it("normalizes source reference artifact strings from paths, source ids, and ranges", () => {
    const refs = Array.from({ length: 24 }, (_, index) => ({
      sourceId: `source-${index}`,
      path: index % 2 === 0 ? ` docs/source-${index}.md ` : "",
      range: index === 0 ? "L1-L4" : "",
    }));
    expect(sourceRefArtifactStrings([{ sourceId: "source-1" }, { path: " docs/plan.md ", range: "L8" }, { path: "   " }, ...refs])).toEqual(
      [
        "source-1",
        "docs/plan.md#L8",
        "docs/source-0.md#L1-L4",
        "docs/source-2.md",
        "source-3",
        "docs/source-4.md",
        "source-5",
        "docs/source-6.md",
        "source-7",
        "docs/source-8.md",
        "source-9",
        "docs/source-10.md",
        "source-11",
        "docs/source-12.md",
        "source-13",
        "docs/source-14.md",
        "source-15",
        "docs/source-16.md",
        "source-17",
        "docs/source-18.md",
      ],
    );
  });

  it("normalizes project board synthesis run progressive records conservatively", () => {
    expect(
      normalizeProjectBoardSynthesisRunProgressiveRecord({
        type: " candidate_card ",
        title: "Create shell",
        sourceId: "synthesis:shell",
      }),
    ).toEqual([{ type: "candidate_card", title: "Create shell", sourceId: "synthesis:shell" }]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord({ type: "   " })).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord({ title: "Missing type" })).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord([])).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunProgressiveRecord(null)).toEqual([]);
  });

  it("normalizes project board synthesis run events conservatively", () => {
    const fallbackCreatedAt = "2026-01-01T00:00:00.000Z";
    expect(
      normalizeProjectBoardSynthesisRunEvent(
        {
          stage: "schema_validation",
          title: "Validated schema",
          summary: "Validated progressive records.",
          metadata: { recordCount: 3 },
          createdAt: "2026-01-01T00:01:00.000Z",
        },
        fallbackCreatedAt,
      ),
    ).toEqual([
      {
        stage: "schema_validation",
        title: "Validated schema",
        summary: "Validated progressive records.",
        metadata: { recordCount: 3 },
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    expect(
      normalizeProjectBoardSynthesisRunEvent(
        {
          stage: "failed",
          title: "Failed",
          metadata: ["not", "an", "object"],
        } as never,
        fallbackCreatedAt,
      ),
    ).toEqual([
      {
        stage: "failed",
        title: "Failed",
        summary: "",
        metadata: {},
        createdAt: fallbackCreatedAt,
      },
    ]);
    expect(normalizeProjectBoardSynthesisRunEvent({ stage: "unsupported", title: "Invalid stage" }, fallbackCreatedAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunEvent({ stage: "failed" }, fallbackCreatedAt)).toEqual([]);
    expect(normalizeProjectBoardSynthesisRunEvent(null, fallbackCreatedAt)).toEqual([]);
  });

  it("maps imported project board event artifact kinds", () => {
    expect(projectBoardEventKindFromArtifact(boardEventArtifact({ type: "run.started", payload: { currentKind: "card_claimed" } }))).toBe(
      "card_claimed",
    );
    expect(projectBoardEventKindFromArtifact(boardEventArtifact({ type: "run.completed", payload: { currentKind: "not-valid" } }))).toBe(
      "card_run_completed",
    );
    expect(projectBoardEventKindFromArtifact(boardEventArtifact({ type: "board.reset" }))).toBe("card_updated");
  });

  it("maps imported project board event artifact titles", () => {
    const longTitle = ` ${"A".repeat(220)} `;
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "run.started", payload: { title: longTitle } }))).toHaveLength(
      180,
    );
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "run.prepared" }))).toBe("Run prepared");
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "card.heartbeat" }))).toBe("Card claim heartbeat");
    expect(projectBoardEventTitleFromArtifact(boardEventArtifact({ type: "board.reset" }))).toBe("board.reset");
  });

  it("maps imported project board event artifact summaries", () => {
    expect(
      projectBoardEventSummaryFromArtifact(
        boardEventArtifact({
          type: "run.failed",
          entityId: "run-1",
          payload: { cardId: "card-1", normalizedStatus: "runtime_budget" },
        }),
      ),
    ).toBe("Imported runtime budget run run-1 for card-1.");
    expect(
      projectBoardEventSummaryFromArtifact(
        boardEventArtifact({
          type: "card.claimed",
          entityId: "card-1",
          actor: { kind: "pi-worker", agentId: "agent-1" },
          payload: { leaseUntil: "2026-01-01T00:10:00.000Z" },
        }),
      ),
    ).toBe("Card claim recorded for card-1 by agent-1 until 2026-01-01T00:10:00.000Z.");
    expect(projectBoardEventSummaryFromArtifact(boardEventArtifact({ type: "card.heartbeat", entityId: "card-1" }))).toBe(
      "Claim heartbeat recorded for card-1.",
    );
    expect(projectBoardEventSummaryFromArtifact(boardEventArtifact({ type: "board.reset", payload: { summary: "Reset summary" } }))).toBe(
      "Reset summary",
    );
  });

  it("maps imported project board event artifact metadata", () => {
    expect(
      projectBoardEventMetadataFromArtifact(boardEventArtifact({ type: "board.synthesized", payload: { metadata: { runId: "run-1" } } })),
    ).toEqual({
      runId: "run-1",
    });
    expect(
      projectBoardEventMetadataFromArtifact(
        boardEventArtifact({
          type: "run.progress",
          actor: { kind: "pi-worker", agentId: "agent-1" },
          payload: { metadata: ["not", "an", "object"], runId: "run-1" },
        }),
      ),
    ).toMatchObject({
      artifactEventType: "run.progress",
      artifactPayload: { metadata: ["not", "an", "object"], runId: "run-1" },
      artifactActor: { kind: "pi-worker", agentId: "agent-1" },
    });
  });

  it("maps applicable project board source classification updates", () => {
    const longReason = ` ${"Reason ".repeat(100)} `;
    const updates = projectBoardSourceClassificationUpdates(
      [
        projectBoardSource({ id: "source-by-key", sourceKey: "source:key", relevance: 72 }),
        projectBoardSource({ id: "source-by-id", sourceKey: "source:id", relevance: 42 }),
        projectBoardSource({ id: "user-source", sourceKey: "source:user", classifiedBy: "user" }),
        projectBoardSource({
          id: "locked-source",
          sourceKey: "source:locked",
          authorityRole: "ignored",
          includeInSynthesis: false,
          classificationReason: GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
        }),
      ],
      [
        {
          sourceKey: "source:key",
          kind: "ignored",
          classificationReason: "   ",
          classificationConfidence: 2,
          authorityRole: "primary",
          includeInSynthesis: true,
          model: "model-a",
        },
        {
          sourceId: "source-by-id",
          kind: "markdown",
          classificationReason: longReason,
          classificationConfidence: -1,
          authorityRole: "ignored",
          includeInSynthesis: true,
        },
        {
          sourceId: "user-source",
          kind: "markdown",
          classificationReason: "Skipped user source.",
          classificationConfidence: 0.8,
          authorityRole: "context",
          includeInSynthesis: true,
        },
        {
          sourceId: "locked-source",
          kind: "markdown",
          classificationReason: "Skipped locked source.",
          classificationConfidence: 0.8,
          authorityRole: "context",
          includeInSynthesis: true,
        },
        {
          sourceId: "missing-source",
          kind: "markdown",
          classificationReason: "Skipped missing source.",
          classificationConfidence: 0.8,
          authorityRole: "context",
          includeInSynthesis: true,
        },
      ],
    );

    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      source: { id: "source-by-key" },
      kind: "ignored",
      relevance: 0,
      confidence: 1,
      authorityRole: "ignored",
      includeInSynthesis: false,
      reason: "Ambient/Pi selected ignored for this project source.",
      model: "model-a",
    });
    expect(updates[1]).toMatchObject({
      source: { id: "source-by-id" },
      kind: "markdown",
      relevance: 42,
      confidence: 0,
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
    expect(updates[1].reason).toHaveLength(500);
    expect(updates[1].reason.startsWith("Reason ")).toBe(true);
  });

  it("detects when previous project board source classifications should be preserved", () => {
    const fallbackSource = projectBoardSource({ classifiedBy: "fallback_heuristic" });
    const userSource = projectBoardSource({ classifiedBy: "user", kind: "thread" });
    const lockedSource = projectBoardSource({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classificationReason: GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
    });
    const nextDurableExcludedSource = projectBoardSource({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classificationReason: DURABLE_PLAN_SOURCE_AUTHORITY_REASON,
    });

    expect(projectBoardSourceShouldPreservePreviousClassification(userSource, "changed")).toBe(true);
    expect(projectBoardSourceShouldPreservePreviousClassification(fallbackSource, "unchanged")).toBe(true);
    expect(projectBoardSourceShouldPreservePreviousClassification(fallbackSource, "changed")).toBe(false);
    expect(projectBoardSourceShouldPreservePreviousClassification(undefined, "unchanged")).toBe(false);
    expect(projectBoardSourceShouldPreservePreviousClassification(lockedSource, "unchanged")).toBe(false);
    expect(projectBoardSourceShouldPreservePreviousClassification(fallbackSource, "unchanged", nextDurableExcludedSource)).toBe(false);
  });

  it("maps user project board source classification updates", () => {
    expect(
      projectBoardSourceUserClassificationUpdate({
        previousKind: "markdown",
        previousRelevance: 64,
        kind: "thread",
      }),
    ).toEqual({
      kind: "thread",
      relevance: 64,
      classifiedBy: "user",
      classificationConfidence: 1,
      classificationReason: "User reclassified source from markdown to thread.",
      authorityRole: "context",
      includeInSynthesis: true,
    });
    expect(
      projectBoardSourceUserClassificationUpdate({
        previousKind: "thread",
        previousRelevance: 42,
        kind: "markdown",
        includeInSynthesis: false,
      }),
    ).toEqual({
      kind: "markdown",
      relevance: 42,
      classifiedBy: "user",
      classificationConfidence: 1,
      classificationReason: "User excluded markdown source from project-board synthesis.",
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
    expect(
      projectBoardSourceUserClassificationUpdate({
        previousKind: "thread",
        previousRelevance: 88,
        kind: "ignored",
        includeInSynthesis: true,
      }),
    ).toEqual({
      kind: "ignored",
      relevance: 0,
      classifiedBy: "user",
      classificationConfidence: 1,
      classificationReason: "User included ignored source for project-board synthesis.",
      authorityRole: "ignored",
      includeInSynthesis: false,
    });
  });

  it("normalizes project board source inputs before persistence", () => {
    const normalized = normalizeProjectBoardSourceInputs([
      {
        kind: "markdown",
        title: "  Source title  ",
        summary: "  Summary  ",
        excerpt: "  Excerpt  ",
        path: " ./docs/Plan.md ",
        relevance: 101.7,
      },
      {
        kind: "markdown",
        title: "   ",
        summary: "Dropped",
        relevance: 50,
      },
      {
        kind: "thread",
        title: "Thread",
        summary: "",
        excerpt: "x".repeat(20_050),
        threadId: "thread-1",
        relevance: -10,
        classificationReason: "User choice",
        classifiedBy: "user",
        classificationConfidence: 0.4,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      title: "Source title",
      summary: "Summary",
      excerpt: "Excerpt",
      path: " ./docs/Plan.md ",
      relevance: 100,
      sourceKey: "file:docs/Plan.md",
      classifiedBy: "fallback_heuristic",
      classificationConfidence: 0.95,
      authorityRole: "context",
      includeInSynthesis: true,
      classificationReason: "Fallback path/content classifier selected markdown: Summary",
    });
    expect(normalized[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized[1]).toMatchObject({
      title: "Thread",
      relevance: 0,
      sourceKey: "thread:thread-1",
      classificationReason: "User choice",
      classifiedBy: "user",
      classificationConfidence: 0.4,
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(normalized[1].excerpt).toHaveLength(20_000);
  });

  it("merges normalized project board source inputs with previous refresh state", () => {
    const previousUserSource = projectBoardSource({
      id: "previous-user",
      kind: "thread",
      sourceKey: "file:docs/spec.md",
      contentHash: "old-hash",
      classifiedBy: "user",
      classificationReason: "User kept this as thread context.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 90,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const previousFallbackSource = projectBoardSource({
      id: "previous-fallback",
      kind: "markdown",
      sourceKey: "file:docs/other.md",
      contentHash: "same-hash",
      classifiedBy: "fallback_heuristic",
      classificationReason: "Previous fallback classification.",
      classificationConfidence: 0.7,
      authorityRole: "supporting",
      includeInSynthesis: true,
      relevance: 40,
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const createdIds = ["new-source-1", "new-source-2"];
    const sources = normalizeProjectBoardSourceInputs([
      {
        kind: "markdown",
        title: "Spec",
        summary: "Updated spec",
        path: "docs/spec.md",
        contentHash: "new-hash",
        relevance: 60,
      },
      {
        kind: "ignored",
        title: "Other",
        summary: "Same other source",
        path: "docs/other.md",
        contentHash: "same-hash",
        relevance: 55,
      },
      {
        kind: "markdown",
        title: "Other duplicate",
        summary: "Duplicate canonical key should not reuse claimed previous source",
        path: "docs/other.md",
        relevance: 70,
      },
    ]);

    const refreshed = projectBoardSourceRefreshSources({
      previousSources: [previousUserSource, previousFallbackSource],
      sources,
      now: "2026-01-03T00:00:00.000Z",
      createId: () => createdIds.shift() ?? "unexpected-id",
    });

    expect(refreshed[0]).toMatchObject({
      id: "previous-user",
      kind: "thread",
      relevance: 60,
      changeState: "changed",
      classifiedBy: "user",
      classificationReason: "User kept this as thread context.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      preservedClassification: true,
    });
    expect(refreshed[1]).toMatchObject({
      id: "previous-fallback",
      kind: "markdown",
      relevance: 55,
      changeState: "unchanged",
      classifiedBy: "fallback_heuristic",
      classificationReason: "Previous fallback classification.",
      classificationConfidence: 0.7,
      authorityRole: "supporting",
      includeInSynthesis: true,
      createdAt: "2026-01-02T00:00:00.000Z",
      preservedClassification: true,
    });
    expect(refreshed[2]).toMatchObject({
      id: "new-source-1",
      kind: "markdown",
      relevance: 70,
      changeState: "new",
      createdAt: "2026-01-03T00:00:00.000Z",
      preservedClassification: false,
    });
  });

  it("maps project board source refresh records to store rows", () => {
    const refreshed = projectBoardSourceRefreshSources({
      previousSources: [],
      sources: normalizeProjectBoardSourceInputs([
        {
          kind: "ignored",
          title: "Generated report",
          summary: "Generated synthesis output",
          excerpt: "   ",
          path: ".ambient/board/reports/report.md",
          relevance: 88,
          classificationReason: "Generated report should stay out of synthesis.",
          byteSize: 1200,
          mtime: "2026-01-03T00:00:00.000Z",
        },
      ]),
      now: "2026-01-03T00:00:00.000Z",
      createId: () => "source-new",
    });
    expect(refreshed).toHaveLength(1);
    const source = refreshed[0]!;

    const row = projectBoardSourceRefreshStoreRow({
      source,
      boardId: "board-1",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });

    expect(row).toMatchObject({
      id: "source-new",
      board_id: "board-1",
      source_kind: "ignored",
      source_key: "file:.ambient/board/reports/report.md",
      change_state: "new",
      title: "Generated report",
      summary: "Generated synthesis output",
      excerpt: null,
      path: ".ambient/board/reports/report.md",
      thread_id: null,
      artifact_id: null,
      message_id: null,
      byte_size: 1200,
      mtime: "2026-01-03T00:00:00.000Z",
      classification_reason: "Generated report should stay out of synthesis.",
      classified_by: "fallback_heuristic",
      authority_role: "ignored",
      include_in_synthesis: 0,
      relevance: 0,
      created_at: "2026-01-03T00:00:00.000Z",
      updated_at: "2026-01-04T00:00:00.000Z",
    });
    expect(row.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mapProjectBoardSourceRow(row)).toMatchObject({
      id: "source-new",
      boardId: "board-1",
      kind: "ignored",
      excerpt: undefined,
      includeInSynthesis: false,
      relevance: 0,
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
  });

  it("counts project board source kinds", () => {
    expect(
      projectBoardSourceKindCounts([
        projectBoardSource({ kind: "markdown" }),
        projectBoardSource({ kind: "thread" }),
        projectBoardSource({ kind: "markdown" }),
      ]),
    ).toEqual({ markdown: 2, thread: 1 });
    expect(projectBoardSourceKindCounts([])).toEqual({});
  });

  it("maps project board source refresh stats", () => {
    expect(
      projectBoardSourceRefreshStats({
        previousSources: [
          projectBoardSource({ sourceKey: "file:kept.md", path: "kept.md" }),
          projectBoardSource({ sourceKey: "file:removed.md", path: "removed.md" }),
          projectBoardSource({ id: "fallback", sourceKey: undefined, path: "fallback.md" }),
        ],
        nextSources: [
          { sourceKey: "file:kept.md", kind: "markdown", changeState: "unchanged", preservedClassification: true },
          { sourceKey: "file:new.md", kind: "thread", changeState: "new" },
          { sourceKey: "file:changed.md", kind: "markdown", changeState: "changed", preservedClassification: true },
        ],
      }),
    ).toEqual({
      sourceKinds: { markdown: 2, thread: 1 },
      sourceChangeStates: { unchanged: 1, new: 1, changed: 1 },
      preservedClassificationCount: 2,
      removedSourceKeys: ["file:removed.md", "file:fallback.md"],
      newCount: 1,
      changedCount: 1,
      unchangedCount: 1,
      removedCount: 2,
    });
  });

  it("maps project board source refresh event metadata", () => {
    const previousSources = Array.from({ length: 22 }, (_, index) =>
      projectBoardSource({ id: `removed-${index}`, sourceKey: `file:removed-${index}.md` }),
    );
    const nextSources = [
      { sourceKey: "file:new.md", kind: "markdown" as const, changeState: "new" as const },
      { sourceKey: "file:changed.md", kind: "thread" as const, changeState: "changed" as const, preservedClassification: true },
    ];
    const stats = projectBoardSourceRefreshStats({ previousSources, nextSources });

    expect(projectBoardSourceRefreshEventMetadata({ previousSources, nextSources, stats })).toEqual({
      previousCount: 22,
      nextCount: 2,
      sourceKinds: { markdown: 1, thread: 1 },
      sourceChangeStates: { new: 1, changed: 1 },
      newCount: 1,
      changedCount: 1,
      unchangedCount: 0,
      removedCount: 22,
      removedSourceKeys: Array.from({ length: 20 }, (_, index) => `file:removed-${index}.md`),
      preservedClassificationCount: 1,
    });
  });

  it("summarizes project board source refresh counts", () => {
    expect(
      projectBoardSourceRefreshSummary({
        nextCount: 5,
        newCount: 2,
        changedCount: 1,
        unchangedCount: 2,
        removedCount: 1,
        preservedClassificationCount: 3,
      }),
    ).toBe("5 project sources scanned: 2 new, 1 changed, 2 unchanged, 1 removed. Preserved 3 existing classifications.");
    expect(
      projectBoardSourceRefreshSummary({
        nextCount: 1,
        newCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        removedCount: 0,
        preservedClassificationCount: 0,
      }),
    ).toBe("1 project source scanned: no source changes.");
  });
});
