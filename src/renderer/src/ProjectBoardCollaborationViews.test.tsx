import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectBoardGitSyncStatus } from "../../shared/projectBoardTypes";
import {
  ProjectBoardCollaborationReadinessPanel,
  ProjectBoardGitSyncControls,
  ProjectBoardProjectionReviewPanel,
  projectBoardProjectionResolutionLabel,
  projectBoardProjectionReviewActionLabel,
  projectBoardProjectionReviewKindLabel,
} from "./ProjectBoardCollaborationViews";
import {
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
} from "./projectBoardCollaborationUiModel";

describe("ProjectBoardCollaborationViews", () => {
  it("renders Git sync controls through explicit status and action props", () => {
    const status = gitStatus({
      dirtyBoardFileCount: 2,
      dirtyBoardFiles: [".ambient/board/cards/card-1.json", ".ambient/board/index.json"],
    });
    const review = projectBoardProjectionReview(status);
    const projectionResolutionState = projectBoardProjectionReviewResolutionState(review, {});

    const markup = renderToStaticMarkup(
      <ProjectBoardGitSyncControls
        status={status}
        projectionResolutionState={projectionResolutionState}
        onAction={vi.fn()}
      />,
    );

    expect(markup).toContain("Project board Git sync");
    expect(markup).toContain("2 board changes");
    expect(markup).toContain("Export Board");
    expect(markup).toContain("Commit Board");
    expect(markup).toContain("Push Board");
    expect(markup).toContain("Pull Board");
    expect(markup).toContain("Apply Pulled Board");
  });

  it("renders collaboration readiness from the collaboration UI model", () => {
    const markup = renderToStaticMarkup(<ProjectBoardCollaborationReadinessPanel status={gitStatus()} />);

    expect(markup).toContain("Project board collaboration readiness");
    expect(markup).toContain("Collaboration ready");
    expect(markup).toContain("Git collaboration is ready");
    expect(markup).toContain("This board has a Git remote, a valid projection, and no detected board drift or claim conflicts.");
    expect(markup).toContain("3 cards synced");
  });

  it("renders pulled projection conflicts and selected resolutions", () => {
    const status = gitStatus({
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
      },
    });

    const markup = renderToStaticMarkup(
      <ProjectBoardProjectionReviewPanel
        status={status}
        resolutions={{ "update:card:card-shell": "keep_local" }}
        onResolve={() => undefined}
      />,
    );

    expect(markup).toContain("Pulled board projection review");
    expect(markup).toContain("Pull review");
    expect(markup).toContain("Resolve pulled card conflicts before applying");
    expect(markup).toContain("Decision: Keep local");
    expect(markup).toContain("Update Create shell");
    expect(markup).toContain("Proof");
  });

  it("keeps projection label helpers compatible from the collaboration view owner", () => {
    expect(projectBoardProjectionResolutionLabel("apply_pulled")).toBe("Apply pulled");
    expect(projectBoardProjectionReviewActionLabel("invalid")).toBe("Invalid");
    expect(projectBoardProjectionReviewKindLabel("runtime")).toBe("Proof");
  });
});

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
    message: "Board Git artifacts are clean.",
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
