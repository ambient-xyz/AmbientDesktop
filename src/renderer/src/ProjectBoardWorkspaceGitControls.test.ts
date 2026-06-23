import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardGitSyncStatus, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
} from "./projectBoardCollaborationUiModel";
import {
  projectBoardGitApplyConfirmationText,
  projectBoardGitClaimConfirmationText,
  projectBoardGitProjectionApplyInput,
} from "./ProjectBoardWorkspaceGitControls";

describe("ProjectBoardWorkspaceGitControls", () => {
  it("builds pulled projection apply input from explicit review resolutions", () => {
    const review = projectBoardProjectionReview(pulledProjectionStatus());

    expect(
      projectBoardGitProjectionApplyInput("board-1", review, {
        "update:card:card-shell": "keep_local",
        "update:runtime:run-shell": "apply_pulled",
        "ignored:manual": "manual_resolution_required",
        "ignored:empty": undefined,
      }),
    ).toEqual({
      boardId: "board-1",
      resolutions: [
        { changeId: "update:card:card-shell", entityId: "card-shell", resolution: "keep_local" },
        { changeId: "update:runtime:run-shell", entityId: "run-shell", resolution: "apply_pulled" },
      ],
    });
  });

  it("keeps the apply confirmation text aligned with projection review decisions", () => {
    const review = projectBoardProjectionReview(pulledProjectionStatus());
    const resolutions = { "update:card:card-shell": "keep_local" } as const;
    const resolutionState = projectBoardProjectionReviewResolutionState(review, resolutions);

    expect(resolutionState.canApply).toBe(true);

    const confirmationText = projectBoardGitApplyConfirmationText(projectBoard(), review, resolutionState, resolutions);

    expect(confirmationText).toContain("Apply the pulled .ambient/board projection to this local board?");
    expect(confirmationText).toContain("Conflict resolutions:");
    expect(confirmationText).toContain("- Create shell: Keep local");
    expect(confirmationText).toContain("Update Create shell");
    expect(confirmationText).toContain("Update Run artifact run-shell");
  });

  it("requires confirmations only for destructive Git claim actions", () => {
    const card = projectBoardCard({ title: "Create shell" });

    expect(projectBoardGitClaimConfirmationText(card, "force_release")).toContain("Force-release the Git claim");
    expect(projectBoardGitClaimConfirmationText(card, "resolve_conflict")).toContain("Resolve competing Git claims");
    expect(projectBoardGitClaimConfirmationText(card, "claim")).toBeUndefined();
    expect(projectBoardGitClaimConfirmationText(card, "release")).toBeUndefined();
    expect(projectBoardGitClaimConfirmationText(card, "expire")).toBeUndefined();
  });
});

function pulledProjectionStatus(overrides: Partial<ProjectBoardGitSyncStatus> = {}): ProjectBoardGitSyncStatus {
  return gitStatus({
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
          local: {
            title: "Create shell",
            status: "in_progress",
            candidateStatus: "ready_to_create",
            updatedAt: "2026-05-04T12:10:00.000Z",
          },
          pulled: {
            title: "Create shell",
            status: "ready",
            candidateStatus: "ready_to_create",
            updatedAt: "2026-05-04T12:00:00.000Z",
          },
          changedFields: ["status", "updatedAt"],
          conflict: true,
          conflictReason: "The local card is in progress.",
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
          summary: "Pulled board updates execution proof artifacts.",
          changedFields: ["proof"],
          conflict: false,
          recommendedResolution: "apply_pulled",
          applyConsequence: "Import the pulled run manifest and proof.",
          keepLocalConsequence: "Keep this desktop's execution proof view.",
          deferConsequence: "Leave pulled proof artifacts unapplied.",
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
    ...overrides,
  });
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

function projectBoard(input: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace/project",
    status: "active",
    title: "Project board",
    summary: "Board summary",
    cards: [],
    questions: [],
    proposals: [],
    sources: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardSummary;
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Card",
    description: "Card description",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "implementation",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: {
      unit: [],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceRefs: [],
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardCard;
}
