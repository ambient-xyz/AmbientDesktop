import { describe, expect, it } from "vitest";
import { buildProjectBoardRenderedCardLedger } from "./projectBoardRenderedCardLedger";

describe("project board rendered card ledger", () => {
  it("summarizes restart actions, clarification state, source refs, and fingerprints", () => {
    const ledger = buildProjectBoardRenderedCardLedger([
      {
        type: "candidate_card",
        sourceId: "synthesis:movement",
        title: "Implement movement",
        candidateStatus: "needs_clarification",
        blockedBy: ["synthesis:input"],
        sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-8", note: "Movement rules", contentHash: "hash-gdd-v1" }],
        clarificationQuestions: ["Should thrust be inertial?"],
      },
      {
        type: "candidate_card",
        sourceId: "synthesis:audio",
        title: "Add audio",
        candidateStatus: "ready_to_create",
        sourceRefs: ["source-audio"],
        clarificationQuestions: ["Which synth style?"],
        clarificationAnswers: [{ question: "Which synth style?", answer: "Retro pulses", answeredAt: "2026-05-04T12:00:00.000Z" }],
      },
    ]);

    expect(ledger).toMatchObject({
      schemaVersion: 1,
      cardCount: 2,
      blockedCardCount: 1,
      duplicateCardCount: 0,
      checksum: expect.stringMatching(/^rendered-card-ledger-/),
      entries: [
        {
          schemaVersion: 1,
          cardId: "synthesis:movement",
          title: "Implement movement",
          candidateStatus: "needs_clarification",
          blockedBy: ["synthesis:input"],
          sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-8", note: "Movement rules", contentHash: "hash-gdd-v1", label: "source-gdd:lines:1-8" }],
          sourceRefIds: ["source-gdd"],
          sourceSnapshots: [{ sourceId: "source-gdd", label: "source-gdd:lines:1-8", contentHash: "hash-gdd-v1", state: "unknown" }],
          clarificationQuestionCount: 1,
          pendingClarificationCount: 1,
          clarificationState: "pending",
          duplicateDecision: "unique",
          invalidationState: "valid",
          invalidationReasons: [],
          restartAction: "wait_for_clarification",
          renderFingerprint: expect.stringMatching(/^rendered-card-/),
        },
        {
          cardId: "synthesis:audio",
          clarificationState: "resolved",
          pendingClarificationCount: 0,
          restartAction: "reuse_rendered_card",
        },
      ],
    });
  });

  it("records duplicate and split lineage decisions for restart", () => {
    const ledger = buildProjectBoardRenderedCardLedger([
      {
        type: "candidate_card",
        sourceId: "synthesis:boss",
        title: "Implement boss",
        candidateStatus: "ready_to_create",
      },
      {
        type: "candidate_card",
        sourceId: "synthesis:boss",
        title: "Implement boss",
        candidateStatus: "duplicate",
      },
      {
        type: "candidate_card",
        sourceId: "synthesis:boss#split:2",
        title: "Implement boss attack patterns",
        candidateStatus: "ready_to_create",
      },
    ]);

    expect(ledger).toMatchObject({
      cardCount: 2,
      duplicateCardCount: 1,
      splitLineageCount: 1,
      entries: [
        {
          cardId: "synthesis:boss",
          duplicateDecision: "duplicate",
          restartAction: "skip_duplicate",
        },
        {
          cardId: "synthesis:boss#split:2",
          duplicateDecision: "unique",
          restartAction: "reuse_rendered_card",
          splitLineage: {
            parentCardId: "synthesis:boss",
            childIndex: 2,
            source: "candidate_split",
          },
        },
      ],
    });
  });

  it("invalidates rendered cards when source hashes, fingerprints, schema, or user edits drift", () => {
    const records = [
      {
        type: "candidate_card",
        sourceId: "synthesis:movement",
        title: "Implement movement",
        candidateStatus: "ready_to_create",
        sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-8", contentHash: "hash-gdd-v1" }],
      },
      {
        type: "candidate_card",
        sourceId: "synthesis:audio",
        title: "Add audio",
        candidateStatus: "ready_to_create",
        userTouchedFields: ["description"],
        userTouchedAt: "2026-05-04T12:00:00.000Z",
      },
    ];

    const stable = buildProjectBoardRenderedCardLedger(records, {
      sources: [{ id: "source-gdd", contentHash: "hash-gdd-v1" }],
    });
    const expectedFingerprint = stable.entries.find((entry) => entry.cardId === "synthesis:movement")?.renderFingerprint;
    expect(expectedFingerprint).toBeTruthy();

    const drifted = buildProjectBoardRenderedCardLedger(records, {
      sources: [{ id: "source-gdd", contentHash: "hash-gdd-v2" }],
      expectedSchemaVersion: 0,
      expectedRenderFingerprintsByCardId: { "synthesis:movement": "rendered-card-stale" },
      userTouchedCardIds: ["synthesis:audio"],
    });

    expect(drifted).toMatchObject({
      invalidatedCardCount: 2,
      entries: [
        {
          cardId: "synthesis:movement",
          sourceSnapshots: [
            {
              sourceId: "source-gdd",
              contentHash: "hash-gdd-v1",
              currentContentHash: "hash-gdd-v2",
              state: "changed",
            },
          ],
          invalidationState: "invalidated",
          invalidationReasons: ["card_schema_version_changed", "render_fingerprint_changed", "source_checksum_changed"],
          restartAction: "regenerate_card",
        },
        {
          cardId: "synthesis:audio",
          userTouchedFields: ["description"],
          userTouchedAt: "2026-05-04T12:00:00.000Z",
          invalidationState: "invalidated",
          invalidationReasons: ["card_schema_version_changed", "user_touched"],
          restartAction: "regenerate_card",
        },
      ],
    });
  });
});
