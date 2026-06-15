import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardCardClaimSummary, ProjectBoardGitSyncStatus } from "../../shared/types";
import {
  projectBoardCardClaimActionState,
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardCardClaimLabel,
  projectBoardCardClaimTitle,
  projectBoardCollaborationExecutionNotice,
  projectBoardCollaborationReadiness,
  projectBoardHistoryCollaborationAudit,
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
} from "./projectBoardCollaborationUiModel";

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Create shell",
    description: "Create the shell.",
    status: "ready",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: ["Canvas mounts."],
    testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
    sourceKind: "board_synthesis",
    sourceId: "synthesis:shell",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function claim(overrides: Partial<ProjectBoardCardClaimSummary> = {}): ProjectBoardCardClaimSummary {
  return {
    status: "active",
    cardId: "card-1",
    runId: "run-1",
    agentId: "desktop-remote",
    eventId: "evt-claim-1",
    claimedAt: "2026-01-01T00:00:00.000Z",
    leaseUntil: "2099-01-01T00:00:00.000Z",
    ...overrides,
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

describe("projectBoardCollaborationUiModel", () => {
  it("models Git card claim labels, blockers, and actions", () => {
    const openCard = card();

    expect(projectBoardCardClaimActionState(openCard)).toMatchObject({
      action: "claim",
      disabled: true,
      title: expect.stringContaining("still loading"),
    });
    expect(projectBoardCardClaimActionState(openCard, gitStatus())).toMatchObject({
      action: "claim",
      label: "Claim Card",
      disabled: false,
      tone: "primary",
    });

    const remoteCard = card({ claim: claim({ displayName: "desktop-b" }) });
    expect(projectBoardCardClaimLabel(remoteCard)).toBe("Claimed by desktop-b");
    expect(projectBoardCardClaimBlocksLocalTicketization(remoteCard)).toBe(true);
    expect(projectBoardCardClaimActionState(remoteCard, gitStatus())).toMatchObject({
      action: "force_release",
      label: "Force Release",
      tone: "danger",
    });

    const conflictedCard = card({
      claim: claim({ runId: "run-a", agentId: "desktop-a" }),
      claimConflicts: [claim({ runId: "run-b", agentId: "desktop-b" })],
    });
    expect(projectBoardCardClaimLabel(conflictedCard)).toBe("1 claim conflict");
    expect(projectBoardCardClaimBlocksLocalTicketization(conflictedCard)).toBe(true);
    expect(projectBoardCardClaimTitle(conflictedCard)).toContain("Conflicting claim");
    expect(projectBoardCardClaimActionState(conflictedCard, gitStatus())).toMatchObject({
      action: "resolve_conflict",
      label: "Resolve Conflict",
      tone: "danger",
    });
  });

  it("models collaboration readiness and execution notices from Git projection state", () => {
    expect(projectBoardCollaborationReadiness(gitStatus())).toMatchObject({
      label: "Collaboration ready",
      canCollaborate: true,
      needsAttention: false,
      tone: "ready",
    });
    expect(projectBoardCollaborationExecutionNotice(gitStatus())).toBeUndefined();

    const invalidProjectionStatus = gitStatus({
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
    });

    expect(projectBoardCollaborationReadiness(invalidProjectionStatus)).toMatchObject({
      label: "Projection invalid",
      canCollaborate: false,
      needsAttention: true,
      tone: "danger",
    });
    expect(projectBoardCollaborationExecutionNotice(invalidProjectionStatus)).toMatchObject({
      blockerKind: "projection_invalid",
      tone: "danger",
      headline: "Pulled board projection is invalid",
    });
  });

  it("models pulled projection conflicts and explicit keep-local resolution", () => {
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
              summary: "Pulled board updates card \"Create shell\".",
              local: { title: "Create shell", status: "in_progress", candidateStatus: "ready_to_create", updatedAt: "2026-05-04T12:10:00.000Z" },
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
              changedFields: ["proof", "handoff"],
              conflict: false,
              recommendedResolution: "apply_pulled",
              applyConsequence: "Import the pulled run manifest, proof, and handoff.",
              keepLocalConsequence: "Keep this desktop's execution proof/handoff view.",
              deferConsequence: "Leave pulled proof/handoff artifacts unapplied.",
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

    expect(review).toMatchObject({
      visible: true,
      canApply: false,
      conflictCount: 1,
      headline: "Resolve pulled card conflicts before applying",
    });
    expect(review.rows).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "card", conflict: true, localStatus: "in_progress", pulledStatus: "ready" })]));
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
      applyImpact: expect.stringContaining("proof/handoff runtime artifact"),
      resolvedConflicts: [
        expect.objectContaining({
          label: "Create shell",
          resolution: "keep_local",
          exportsLocalOverlay: true,
        }),
      ],
    });
  });

  it("summarizes collaboration blockers for History audit", () => {
    expect(projectBoardHistoryCollaborationAudit(gitStatus())).toMatchObject({
      visible: false,
      headline: "No collaboration blockers in history",
      tone: "ready",
    });

    expect(
      projectBoardHistoryCollaborationAudit(
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
            activeClaimCount: 1,
            expiredClaimCount: 2,
            claimConflictCount: 0,
          },
        }),
      ),
    ).toMatchObject({
      visible: true,
      headline: "1 collaboration warning in history",
      tone: "warning",
      items: [
        expect.objectContaining({
          id: "claim-ledger",
          statusLabel: "Expired claims",
          actionLabel: "Review Claims",
        }),
      ],
    });
  });
});
