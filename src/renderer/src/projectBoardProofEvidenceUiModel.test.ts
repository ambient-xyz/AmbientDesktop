import { describe, expect, it } from "vitest";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import {
  projectBoardProofEvidenceModel,
  projectBoardProofInspectionNavigationModel,
  projectBoardRunHasReviewableEvidence,
  projectBoardRunNeedsIntervention,
  projectBoardTaskActionEvidenceFromProof,
} from "./projectBoardProofEvidenceUiModel";

function testCard(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-proof",
    boardId: "board-1",
    title: "Build proof surface",
    description: "Needs implementation, tests, and visual proof.",
    status: "review",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: ["The proof surface renders."],
    testPlan: { unit: ["Run unit tests."], integration: [], visual: ["Capture desktop screenshot."], manual: [] },
    sourceKind: "planner_plan",
    sourceId: "artifact-proof",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:07:00.000Z",
    ...overrides,
  };
}

describe("projectBoardProofEvidenceUiModel", () => {
  it("models changed files, proof artifacts, PM review, and packet inspection", () => {
    const card = testCard({
      proofReview: {
        status: "ready_for_review",
        summary: "Implementation and visual proof are present.",
        satisfied: ["Tests passed.", "Desktop screenshot captured."],
        missing: [],
        followUpCardIds: [],
        runId: "run-proof",
        reviewedAt: "2026-01-01T00:08:00.000Z",
        reviewer: "ambient_pi",
        evidenceQuality: "strong",
        confidence: 0.92,
        recommendedAction: "close",
      },
    });
    const run: OrchestrationRun = {
      id: "run-proof",
      taskId: "task-proof",
      attemptNumber: 0,
      status: "completed",
      workspacePath: "/tmp/project",
      startedAt: "2026-01-01T00:01:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        elapsedMs: 2410,
        changedFiles: ["src/App.tsx", "src/App.test.ts", "node_modules/.vite/cache.js"],
        screenshots: [{ path: "/tmp/project/proof/desktop.png", width: 1280, height: 720 }],
        commands: [{ command: "pnpm vitest src/App.test.ts", output: "passed" }],
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n+render proof surface",
        lastAssistantText: "Implemented and verified the proof surface.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.summary).toContain("2 meaningful changed files");
    expect(evidence.fileGroups.map((group) => [group.label, group.files.map((file) => file.path)])).toEqual([
      ["Implementation", ["src/App.tsx"]],
      ["Tests", ["src/App.test.ts"]],
      ["Dependencies", ["node_modules/.vite/cache.js"]],
    ]);
    expect(evidence.artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "command"]);
    expect(evidence.artifacts[0]).toMatchObject({
      label: "Screenshot 1",
      previewSrc: "file:///tmp/project/proof/desktop.png",
      viewportLabel: "Desktop viewport 1280x720",
    });
    expect(evidence.review).toMatchObject({
      reviewer: "Ambient/Pi PM judge",
      confidence: "92%",
      recommendedAction: "close",
    });
    expect(evidence.inspection).toMatchObject({
      headline: "Proof packet is ready to inspect",
      qualityLabel: "Strong evidence",
      qualityTone: "success",
      issueCount: 0,
      issueTarget: "inspection-checklist",
      diffLabel: "Diff attached",
    });
  });

  it("builds stable accessible jump targets for inspection sections", () => {
    const navigation = projectBoardProofInspectionNavigationModel(
      {
        headline: "1 visual evidence gap",
        detail: "1 meaningful file",
        qualityLabel: "Weak evidence",
        qualityTone: "danger",
        issueCount: 1,
        issueTarget: "visual-evidence",
        diffLabel: "Diff attached",
        checklist: [
          { label: "Visual evidence", detail: "Mobile proof missing.", tone: "danger", target: "visual-evidence" },
          { label: "PM judge", detail: "Needs follow-up.", tone: "warning", target: "pm-judge" },
        ],
        visualEvidence: [],
        failedAssertions: [],
      },
      "run with spaces",
      "card #42",
    );

    expect(navigation).toMatchObject({
      anchorPrefix: "proof-card-42-run-with-spaces",
      issueTargetId: "proof-card-42-run-with-spaces-visual-evidence",
      visualEvidenceId: "proof-card-42-run-with-spaces-visual-evidence",
      issueJumpAriaLabel: "Jump to 1 visual evidence gap.",
    });
    expect(navigation.checklist.map((item) => [item.label, item.targetId, item.ariaLabel])).toEqual([
      ["Visual evidence", "proof-card-42-run-with-spaces-visual-evidence", "Jump to supporting proof evidence for Visual evidence."],
      ["PM judge", "proof-card-42-run-with-spaces-pm-judge", "Jump to supporting proof evidence for PM judge."],
    ]);
  });

  it("surfaces structured task actions and reviewable failed-run evidence", () => {
    const proof = {
      taskToolActions: [
        {
          actionId: "proof-1",
          action: "task_report_proof",
          createdAt: "2026-01-01T00:04:00.000Z",
          summary: "Tests and screenshot are attached.",
          changedFiles: ["src/proof.ts"],
        },
        {
          actionId: "block-1",
          action: "task_block",
          createdAt: "2026-01-01T00:05:00.000Z",
          reason: "Credential is missing.",
        },
      ],
    };
    const run: OrchestrationRun = {
      id: "run-needs-review",
      taskId: "task-needs-review",
      attemptNumber: 1,
      status: "failed",
      workspacePath: "/tmp/project",
      startedAt: "2026-01-01T00:01:00.000Z",
      proofOfWork: proof,
    };

    expect(projectBoardTaskActionEvidenceFromProof(proof).map((action) => [action.label, action.tone])).toEqual([
      ["Proof reported", "success"],
      ["Task blocked", "danger"],
    ]);
    expect(projectBoardRunNeedsIntervention(run)).toBe(true);
    expect(projectBoardRunHasReviewableEvidence(run)).toBe(true);
  });
});
