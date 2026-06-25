import { describe, expect, it } from "vitest";
import type { ProjectBoardGitSyncStatus } from "../../shared/projectBoardTypes";
import {
  projectBoardCardClaimActionState,
  projectBoardCollaborationReadiness,
  projectBoardHistoryCollaborationAudit,
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
} from "./projectBoardUiModel";

describe("projectBoardUiModel Git projection model", () => {
  it("models Git card claim actions from board sync and claim state", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Create shell",
      description: "Create the shell.",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas mounts."],
      testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:shell",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const readyStatus = {
      boardId: "board-1",
      projectRoot: "/workspace/app",
      artifactRoot: ".ambient/board",
      isGitRepository: true,
      hasRemote: true,
      ahead: 0,
      behind: 0,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      mode: "git_ready" as const,
      projection: {
        ok: true,
        valid: true,
        differenceCount: 0,
        differences: [],
        fileCount: 3,
        cardCount: 1,
        sourceCount: 1,
        eventCount: 1,
        proposalRunCount: 0,
      },
    };

    expect(projectBoardCardClaimActionState(card)).toMatchObject({
      action: "claim",
      disabled: true,
      title: expect.stringContaining("still loading"),
    });
    expect(projectBoardCardClaimActionState(card, readyStatus)).toMatchObject({
      action: "claim",
      label: "Claim Card",
      disabled: false,
      tone: "primary",
    });
    expect(
      projectBoardCardClaimActionState(card, {
        ...readyStatus,
        projection: { ...readyStatus.projection, ok: false, differenceCount: 1, differences: ["Card title differs."] },
      }),
    ).toMatchObject({
      action: "claim",
      disabled: true,
      title: expect.stringContaining("current .ambient/board projection"),
    });
    expect(projectBoardCardClaimActionState({ ...card, claim: claimSummary({ ownedByLocal: true }) }, readyStatus)).toMatchObject({
      action: "release",
      label: "Release Claim",
      disabled: false,
      tone: "secondary",
    });
    expect(projectBoardCardClaimActionState({ ...card, claim: claimSummary({ status: "expired" }) }, readyStatus)).toMatchObject({
      action: "expire",
      label: "Record Expiry",
      disabled: false,
      tone: "secondary",
    });
    expect(
      projectBoardCardClaimActionState({ ...card, claim: claimSummary({ status: "expired", expirationRecorded: true }) }, readyStatus),
    ).toMatchObject({
      action: "claim",
      label: "Reclaim Card",
      disabled: false,
      tone: "primary",
    });
    expect(projectBoardCardClaimActionState({ ...card, claim: claimSummary({ ownedByLocal: false }) }, readyStatus)).toMatchObject({
      action: "force_release",
      label: "Force Release",
      disabled: false,
      tone: "danger",
    });
    const conflictAction = projectBoardCardClaimActionState(
      { ...card, claimConflicts: [claimSummary({ ownedByLocal: false })] },
      readyStatus,
    );
    expect(conflictAction).toMatchObject({
      action: "resolve_conflict",
      label: "Resolve Conflict",
      disabled: false,
      tone: "danger",
    });
    expect(conflictAction.title).toContain("earliest still-active claim remains the owner");
  });

  it("models project board collaboration readiness from Git status", () => {
    expect(
      projectBoardCollaborationReadiness(
        gitStatus({
          isGitRepository: false,
          hasRemote: false,
          remote: undefined,
          upstream: undefined,
          mode: "local_only",
          projection: undefined,
        }),
      ),
    ).toMatchObject({
      label: "Local only",
      canCollaborate: false,
      needsAttention: true,
      tone: "warning",
      projectionSummary: "Projection not exported",
    });

    expect(projectBoardCollaborationReadiness(gitStatus())).toMatchObject({
      label: "Collaboration ready",
      headline: "Git collaboration is ready",
      canCollaborate: true,
      needsAttention: false,
      projectionSummary: "3 cards synced",
    });

    expect(
      projectBoardCollaborationReadiness(
        gitStatus({
          projection: {
            ok: false,
            valid: true,
            differenceCount: 2,
            differences: ["Card title differs.", "Event count differs."],
            fileCount: 8,
            cardCount: 3,
            sourceCount: 2,
            eventCount: 4,
            proposalRunCount: 1,
            activeClaimCount: 0,
            expiredClaimCount: 0,
            claimConflictCount: 0,
          },
        }),
      ),
    ).toMatchObject({
      label: "Board drift",
      headline: "Pulled board differs from local state",
      canCollaborate: false,
      needsAttention: true,
      projectionSummary: "2 projection differences",
    });

    expect(
      projectBoardCollaborationReadiness(
        gitStatus({
          projection: {
            ok: true,
            valid: true,
            differenceCount: 0,
            differences: [],
            fileCount: 8,
            cardCount: 3,
            sourceCount: 2,
            eventCount: 4,
            proposalRunCount: 1,
            activeClaimCount: 2,
            expiredClaimCount: 1,
            claimConflictCount: 1,
          },
        }),
      ),
    ).toMatchObject({
      label: "Claim conflicts",
      headline: "Card ownership needs attention",
      tone: "danger",
      canCollaborate: false,
      claimSummary: "1 claim conflict",
    });
  });

  it("models History collaboration audit from Git, projection, and claim blockers", () => {
    expect(projectBoardHistoryCollaborationAudit(gitStatus())).toMatchObject({
      visible: false,
      headline: "No collaboration blockers in history",
      tone: "ready",
    });

    expect(
      projectBoardHistoryCollaborationAudit(
        gitStatus({
          hasRemote: false,
          remote: undefined,
          upstream: undefined,
          mode: "git_no_remote",
        }),
      ),
    ).toMatchObject({
      visible: true,
      headline: "1 collaboration warning in history",
      tone: "warning",
      items: [
        expect.objectContaining({
          id: "collaboration-readiness",
          title: "Git exists, but collaboration is local",
          statusLabel: "Git, no remote",
          actionLabel: "Review Setup",
          tabId: "overview",
        }),
      ],
    });

    const projectionAudit = projectBoardHistoryCollaborationAudit(
      gitStatus({
        projection: {
          ok: false,
          valid: false,
          differenceCount: 1,
          differences: ["Invalid .ambient/board/board.config.json."],
          fileCount: 8,
          cardCount: 0,
          sourceCount: 0,
          eventCount: 0,
          proposalRunCount: 0,
        },
      }),
    );
    expect(projectionAudit).toMatchObject({
      visible: true,
      headline: "2 collaboration blockers in history",
      tone: "danger",
    });
    expect(projectionAudit.items.map((item) => item.id)).toEqual(["collaboration-readiness", "projection-review"]);
    expect(projectionAudit.items[1]).toMatchObject({
      title: "Pulled board cannot be applied",
      statusLabel: "Cannot apply",
      actionLabel: "Inspect Projection",
    });

    const claimAudit = projectBoardHistoryCollaborationAudit(
      gitStatus({
        projection: {
          ok: true,
          valid: true,
          differenceCount: 0,
          differences: [],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 2,
          expiredClaimCount: 0,
          claimConflictCount: 1,
        },
      }),
    );
    expect(claimAudit).toMatchObject({
      visible: true,
      headline: "1 collaboration blocker in history",
      tone: "danger",
      items: [
        expect.objectContaining({
          id: "collaboration-readiness",
          title: "Card ownership needs attention",
          statusLabel: "Claim conflicts",
          actionLabel: "Review Claims",
        }),
      ],
    });
  });

  it("models pulled projection review as card and event level changes", () => {
    expect(projectBoardProjectionReview(gitStatus())).toMatchObject({
      visible: false,
      canApply: false,
    });

    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 7,
          differences: [
            "missing card local-only.",
            "unexpected card pulled-ready.",
            "card shared-card differs.",
            "unexpected event evt-proof.",
            "run run-shell proof differs.",
            "active charter differs.",
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 0,
          expiredClaimCount: 0,
          claimConflictCount: 0,
        },
      }),
    );

    expect(review).toMatchObject({
      visible: true,
      canApply: true,
      headline: "Review pulled board changes before applying",
      overflowCount: 1,
    });
    expect(review.rows.map((row) => [row.kind, row.action, row.label])).toEqual([
      ["card", "remove", "Card local-only"],
      ["card", "add", "Card pulled-ready"],
      ["card", "update", "Card shared-card"],
      ["event", "add", "Event evt-proof"],
      ["runtime", "update", "Run run-shell proof"],
      ["charter", "update", "Active charter"],
    ]);

    expect(
      projectBoardProjectionReview(
        gitStatus({
          projection: {
            ok: false,
            valid: false,
            differenceCount: 1,
            differences: ["Unexpected token in cards/card-1.json."],
            fileCount: 8,
            cardCount: 0,
            sourceCount: 0,
            eventCount: 0,
            proposalRunCount: 0,
          },
        }),
      ),
    ).toMatchObject({
      visible: true,
      canApply: false,
      headline: "Pulled board cannot be applied",
      rows: [expect.objectContaining({ action: "invalid", tone: "danger" })],
    });
  });

  it("blocks apply when pulled projection changes conflict with local card execution state", () => {
    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 1,
          differences: ["card card-shell differs."],
          conflictCount: 1,
          changes: [
            {
              id: "update:card:card-shell",
              kind: "card",
              action: "update",
              entityId: "card-shell",
              title: "Create shell",
              summary: 'Pulled board updates card "Create shell".',
              local: {
                title: "Create shell",
                status: "in_progress",
                candidateStatus: "ready_to_create",
                updatedAt: "2026-05-04T12:10:00.000Z",
              },
              pulled: { title: "Create shell", status: "ready", candidateStatus: "ready_to_create", updatedAt: "2026-05-04T12:00:00.000Z" },
              changedFields: ["status", "updatedAt"],
              conflict: true,
              conflictReason: "The local card is in_progress; applying the pulled ready card could overwrite active local execution state.",
              recommendedResolution: "manual_resolution_required",
              applyConsequence: "Replace this desktop's card fields with the pulled artifact.",
              keepLocalConsequence: "Keep this desktop's card by exporting and committing local board state.",
              deferConsequence: "Leave this card unchanged until collaborators coordinate.",
            },
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 0,
          expiredClaimCount: 0,
          claimConflictCount: 0,
        },
      }),
    );

    expect(review).toMatchObject({
      visible: true,
      canApply: false,
      conflictCount: 1,
      headline: "Resolve pulled card conflicts before applying",
      rows: [
        expect.objectContaining({
          kind: "card",
          action: "update",
          tone: "danger",
          conflict: true,
          localStatus: "in_progress",
          pulledStatus: "ready",
          applyConsequence: expect.stringContaining("Replace"),
          keepLocalConsequence: expect.stringContaining("exporting and committing"),
          deferConsequence: expect.stringContaining("unchanged"),
        }),
      ],
    });
  });

  it("enables apply once every pulled-card conflict has an explicit resolution", () => {
    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 2,
          differences: ["card card-shell differs.", "run run-shell proof differs."],
          conflictCount: 1,
          changes: [
            {
              id: "update:card:card-shell",
              kind: "card",
              action: "update",
              entityId: "card-shell",
              title: "Create shell",
              summary: 'Pulled board updates card "Create shell".',
              local: {
                title: "Create shell",
                status: "in_progress",
                candidateStatus: "ready_to_create",
                updatedAt: "2026-05-04T12:10:00.000Z",
              },
              pulled: { title: "Create shell", status: "ready", candidateStatus: "ready_to_create", updatedAt: "2026-05-04T12:00:00.000Z" },
              changedFields: ["status", "updatedAt"],
              conflict: true,
              conflictReason: "The local card is in_progress; applying the pulled ready card could overwrite active local execution state.",
              recommendedResolution: "manual_resolution_required",
              applyConsequence: "Replace this desktop's card fields with the pulled artifact.",
              keepLocalConsequence: "Keep this desktop's card by exporting and committing local board state.",
              deferConsequence: "Leave this card unchanged until collaborators coordinate.",
            },
            {
              id: "update:runtime:run-shell",
              kind: "runtime",
              action: "update",
              entityId: "run-shell",
              title: "Run artifact run-shell",
              summary: "Pulled board updates execution proof/handoff artifacts for card card-shell.",
              pulled: { title: "Run run-shell", status: "handoff", updatedAt: "2026-05-04T12:20:00.000Z" },
              changedFields: ["proof", "handoff"],
              conflict: false,
              recommendedResolution: "apply_pulled",
              applyConsequence: "Import the pulled run manifest, proof, and handoff so PM Review can use collaborator execution evidence.",
              keepLocalConsequence:
                "Keep this desktop's execution proof/handoff view by exporting and committing local runtime artifacts instead.",
              deferConsequence: "Leave pulled proof/handoff artifacts unapplied.",
            },
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
          activeClaimCount: 0,
          expiredClaimCount: 0,
          claimConflictCount: 0,
        },
      }),
    );

    expect(projectBoardProjectionReviewResolutionState(review, {})).toMatchObject({
      conflictCount: 1,
      resolvedConflictCount: 0,
      canApply: false,
      unresolvedLabels: ["Create shell"],
    });
    expect(projectBoardProjectionReviewResolutionState(review, { "update:card:card-shell": "keep_local" })).toMatchObject({
      conflictCount: 1,
      resolvedConflictCount: 1,
      canApply: true,
      unresolvedLabels: [],
      applyTitle: expect.stringContaining("local overlays"),
      applyImpact: expect.stringContaining("proof/handoff runtime artifact"),
      resolvedConflicts: [
        expect.objectContaining({
          label: "Create shell",
          resolution: "keep_local",
          resolutionLabel: "Keep local",
          exportsLocalOverlay: true,
          consequence: expect.stringContaining("re-export this local card as an overlay"),
        }),
      ],
    });
  });

  it("keeps manual board-level projection conflicts unappliable", () => {
    const review = projectBoardProjectionReview(
      gitStatus({
        projection: {
          ok: false,
          valid: true,
          differenceCount: 1,
          differences: ["board config differs."],
          conflictCount: 1,
          changes: [
            {
              id: "update:board:board-config",
              kind: "board",
              action: "update",
              entityId: "board config",
              title: "Board settings",
              summary: "Pulled board settings refer to a different board identity.",
              changedFields: ["boardId"],
              conflict: true,
              conflictReason: "Pulled artifacts belong to board board-2, but the open local board is board-1.",
              recommendedResolution: "manual_resolution_required",
              applyConsequence: "Do not apply this projection onto the open board.",
              keepLocalConsequence: "Keep this desktop's current board settings.",
              deferConsequence: "Leave board settings unchanged.",
            },
          ],
          fileCount: 8,
          cardCount: 3,
          sourceCount: 2,
          eventCount: 4,
          proposalRunCount: 1,
        },
      }),
    );

    expect(projectBoardProjectionReviewResolutionState(review, { "update:board:board-config": "keep_local" })).toMatchObject({
      conflictCount: 1,
      resolvedConflictCount: 1,
      canApply: false,
      applyImpact: expect.stringContaining("manual board-level resolution"),
      unresolvedLabels: ["Board settings"],
    });
  });
});

function claimSummary(
  overrides: {
    status?: "active" | "expired" | "conflict";
    ownedByLocal?: boolean;
    expirationRecorded?: boolean;
  } = {},
) {
  return {
    status: overrides.status ?? ("active" as const),
    cardId: "card-1",
    runId: "run-1",
    agentId: overrides.ownedByLocal ? "desktop-local" : "desktop-remote",
    eventId: "evt-claim-1",
    claimedAt: "2026-01-01T00:00:00.000Z",
    leaseUntil: overrides.status === "expired" ? "2026-01-01T00:15:00.000Z" : "2099-01-01T00:00:00.000Z",
    expirationRecorded: overrides.expirationRecorded,
    ownedByLocal: overrides.ownedByLocal,
  };
}

function gitStatus(overrides: Partial<ProjectBoardGitSyncStatus> = {}): ProjectBoardGitSyncStatus {
  return {
    boardId: "board-1",
    projectRoot: "/workspace/app",
    artifactRoot: "/workspace/app/.ambient/board",
    isGitRepository: true,
    repoRoot: "/workspace/app",
    branch: "main",
    remote: "origin",
    hasRemote: true,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    dirtyBoardFileCount: 0,
    dirtyBoardFiles: [],
    mode: "git_ready",
    projection: {
      ok: true,
      valid: true,
      differenceCount: 0,
      differences: [],
      fileCount: 8,
      cardCount: 3,
      sourceCount: 2,
      eventCount: 4,
      proposalRunCount: 1,
      activeClaimCount: 0,
      expiredClaimCount: 0,
      claimConflictCount: 0,
    },
    ...overrides,
  };
}
