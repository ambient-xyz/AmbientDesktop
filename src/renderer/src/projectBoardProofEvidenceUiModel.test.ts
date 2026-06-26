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

  it("classifies proof artifacts for PM evidence inspection", () => {
    const card = {
      id: "evidence-card",
      boardId: "board-1",
      title: "Evidence card",
      description: "Needs inspectable evidence.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Render the game shell."],
      testPlan: { unit: ["Run state tests."], integration: ["Run smoke build."], visual: ["Capture a screenshot."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-evidence",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "Proof is strong enough to close.",
        satisfied: ["Unit proof recorded.", "Visual/browser proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: "run-evidence",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        reviewer: "ambient_pi" as const,
        model: "ambient-pi",
        confidence: 0.88,
        evidenceQuality: "strong" as const,
        recommendedAction: "close" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-evidence",
      taskId: "task-evidence",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        messageCount: 8,
        lastAssistantStatus: "done",
        changedFiles: [
          { path: "src/App.tsx", status: " M", category: "modified" },
          { path: "src/game/state.test.ts", status: "A ", category: "added" },
          { path: "test-results/spaceship-shell.png", status: "??", category: "untracked" },
          { path: "node_modules/.vite/vitest/results.json", status: " M", category: "modified" },
        ],
        gitStatus: [" M src/App.tsx", "A  src/game/state.test.ts"],
        screenshots: [{ path: "/tmp/project/test-results/spaceship-shell.png", width: 1280, height: 720 }],
        visualChecks: [
          { path: "test-results/spaceship-shell.png", result: "nonblank_image_detected", width: 1280, height: 720, nonBlackPixels: 1234 },
        ],
        browserTraces: ["test-results/trace.zip"],
        testOutput: "pnpm test passed",
        afterRunHook: { ok: true, command: "pnpm test", output: "tests passed", durationMs: 420 },
        focusLoop: { action: "finish", reason: "proof_satisfied", passNumber: 2 },
        lastAssistantText: "Implemented the shell and captured a nonblank screenshot.",
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n+render shell",
        diffTruncated: true,
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.summary).toContain("3 meaningful changed files");
    expect(evidence.metrics.map((metric) => metric.label)).toEqual(
      expect.arrayContaining(["Messages", "Assistant", "Files", "Visual", "Checks", "Trace", "Focus", "Diff"]),
    );
    expect(evidence.fileGroups.map((group) => [group.label, group.files.map((file) => file.path)])).toEqual([
      ["Implementation", ["src/App.tsx"]],
      ["Tests", ["src/game/state.test.ts"]],
      ["Visual", ["test-results/spaceship-shell.png"]],
      ["Dependencies", ["node_modules/.vite/vitest/results.json"]],
    ]);
    expect(evidence.files.find((file) => file.path.includes("node_modules"))?.meaningful).toBe(false);
    expect(evidence.artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "log", "browser_trace", "command"]);
    expect(evidence.artifacts[0]).toMatchObject({
      label: "Screenshot 1",
      dimensionsLabel: "1280x720",
      viewportLabel: "Desktop viewport 1280x720",
      visualRole: "desktop",
    });
    expect(evidence.artifacts[0]?.previewSrc).toBe("file:///tmp/project/test-results/spaceship-shell.png");
    expect(evidence.artifacts[1]).toMatchObject({
      kind: "log",
      label: "Nonblank Image Detected",
      detail: expect.stringContaining("1234 nonblack pixels"),
    });
    expect(evidence.hook).toMatchObject({ label: "afterRun passed", tone: "success" });
    expect(evidence.artifacts[3]).toMatchObject({ kind: "command", detail: "pnpm test passed" });
    expect(evidence.focus).toMatchObject({ label: "Focus loop Finish", detail: expect.stringContaining("proof_satisfied") });
    expect(evidence.review).toMatchObject({
      reviewer: "Ambient/Pi PM judge",
      confidence: "88%",
      evidenceQuality: "Strong",
      recommendedAction: "close",
    });
    expect(evidence.inspection).toMatchObject({
      headline: "Proof packet needs PM attention",
      qualityLabel: "Strong evidence · Needs review",
      qualityTone: "warning",
      issueCount: 0,
      issueTarget: "inspection-checklist",
      workspaceLabel: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      diffLabel: "Diff attached, truncated",
      failedAssertions: [],
    });
    expect(evidence.inspection.checklist.map((item) => [item.label, item.tone])).toEqual(
      expect.arrayContaining([
        ["Implementation evidence", "success"],
        ["Command / test evidence", "success"],
        ["Visual evidence", "success"],
        ["PM judge", "success"],
      ]),
    );
    expect(evidence.inspection.checklist.map((item) => [item.label, item.target])).toEqual(
      expect.arrayContaining([
        ["Command / test evidence", "command-evidence"],
        ["Visual evidence", "visual-evidence"],
        ["PM judge", "pm-judge"],
      ]),
    );
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Visual proof", "Screenshot attached", "success"],
      ["Desktop visual check", "Additional visual check", "success"],
      ["Browser trace", "Additional trace", "success"],
    ]);
    expect(evidence.inspection.visualEvidence[0]).toMatchObject({
      role: "desktop",
      viewportLabel: "Desktop viewport 1280x720",
      dimensionsLabel: "1280x720",
      comparisonLabel: "Desktop viewport screenshot is available for PM review.",
    });
  });

  it("classifies absolute files inside the run workspace by their relative source path", () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-absolute";
    const run = {
      id: "run-absolute-files",
      taskId: "task-absolute-files",
      attemptNumber: 1,
      status: "completed",
      workspacePath,
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: [
          `${workspacePath}/index.html`,
          `file://${workspacePath}/src/app.js`,
          `${workspacePath}/.ambient-codex/browser/screenshots/title.png`,
          `${workspacePath}/node_modules/cache/index.js`,
        ],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run);

    expect(evidence.summary).toContain("2 meaningful changed files");
    expect(evidence.fileGroups.map((group) => [group.label, group.files.map((file) => file.path)])).toEqual([
      ["Implementation", [`${workspacePath}/index.html`, `file://${workspacePath}/src/app.js`]],
      ["Generated/cache", [`${workspacePath}/.ambient-codex/browser/screenshots/title.png`]],
      ["Dependencies", [`${workspacePath}/node_modules/cache/index.js`]],
    ]);
  });

  it("identifies missing visual proof and failed assertions in proof packet inspection", () => {
    const card = {
      id: "weak-visual-card",
      boardId: "board-1",
      title: "Weak visual card",
      description: "Needs mobile and desktop proof.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Responsive layout is visible."],
      testPlan: { unit: ["Run layout tests."], integration: [], visual: ["Capture mobile and desktop screenshots."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-weak-visual",
      proofReview: {
        status: "needs_follow_up" as const,
        summary: "Desktop proof exists, but mobile proof and tests failed.",
        satisfied: ["Desktop screenshot recorded."],
        missing: ["Mobile screenshot proof missing.", "Command/test proof failed."],
        followUpCardIds: [],
        runId: "run-weak-visual",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        evidenceQuality: "weak" as const,
        recommendedAction: "follow_up" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-weak-visual",
      taskId: "task-weak-visual",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-2",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/responsive.css"],
        screenshots: [{ path: "proof/desktop-layout.png", absolutePath: "data:image/png;base64,AAAA", width: 1280, height: 720 }],
        commands: [{ command: "pnpm test", result: "failed", output: "layout.spec.ts failed at mobile breakpoint" }],
        diff: "diff --git a/src/responsive.css b/src/responsive.css\n+@media (max-width: 400px){}",
        lastAssistantText: "Desktop screenshot captured. Mobile screenshot was not captured because the viewport setup failed.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.qualityLabel).toBe("Weak evidence · 4 review issues");
    expect(evidence.inspection.qualityTone).toBe("danger");
    expect(evidence.inspection.issueCount).toBe(4);
    expect(evidence.inspection.issueTarget).toBe("proof-issues");
    expect(evidence.inspection.headline).toContain("review issues");
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Mobile screenshot", "Missing evidence", "danger"],
      ["Desktop screenshot", "Screenshot attached", "success"],
    ]);
    expect(evidence.inspection.visualEvidence[0]).toMatchObject({
      role: "mobile",
      viewportLabel: "Mobile viewport",
      comparisonLabel: "Expected evidence is missing",
    });
    expect(evidence.inspection.visualEvidence[1]).toMatchObject({
      role: "desktop",
      viewportLabel: "Desktop viewport 1280x720",
      dimensionsLabel: "1280x720",
      thumbnailSrc: "data:image/png;base64,AAAA",
    });
    expect(evidence.inspection.checklist.find((item) => item.label === "Visual evidence")?.target).toBe("visual-evidence");
    expect(evidence.inspection.checklist.find((item) => item.label === "Command / test evidence")?.target).toBe("command-evidence");
    expect(evidence.inspection.failedAssertions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Command 1"),
        "Mobile screenshot proof missing.",
        "Command/test proof failed.",
        expect.stringContaining("Mobile screenshot was not captured"),
      ]),
    );
    expect(evidence.inspection.transcriptExcerpt).toContain("Mobile screenshot was not captured");
  });

  it("keeps strong PM evidence distinct from review issues in proof packet inspection", () => {
    const card = {
      id: "strong-with-issues-card",
      boardId: "board-1",
      title: "Strong evidence with issues",
      description: "The judge thinks proof is strong, but deterministic review still found issues.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Tests are passing."],
      testPlan: { unit: ["Run tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-strong-with-issues",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "The implementation is likely complete.",
        satisfied: ["Core tests were reported."],
        missing: ["Command/test proof failed."],
        followUpCardIds: [],
        runId: "run-strong-with-issues",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        evidenceQuality: "strong" as const,
        confidence: 0.97,
        recommendedAction: "close" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-strong-with-issues",
      taskId: "task-strong-with-issues",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/engine.ts"],
        commands: [{ command: "pnpm test", exitCode: 1, output: "engine.test.ts failed" }],
        lastAssistantText: "Tests reported one failure.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.qualityTone).toBe("danger");
    expect(evidence.inspection.qualityLabel).toBe("Strong evidence · 2 review issues");
    expect(evidence.review).toMatchObject({ evidenceQuality: "Strong", confidence: "97%" });
    expect(evidence.inspection.headline).toBe("2 review issues need attention");
    expect(evidence.inspection.checklist.find((item) => item.label === "Command / test evidence")?.target).toBe("command-evidence");
    expect(evidence.inspection.checklist.find((item) => item.label === "PM judge")?.target).toBe("pm-judge");
  });

  it("exposes accessible proof inspection jump targets for the renderer", () => {
    const inspection = {
      headline: "2 review issues need attention",
      detail: "1 meaningful file · strong evidence · 2 review issues",
      qualityLabel: "Strong evidence · 2 review issues",
      qualityTone: "danger" as const,
      issueCount: 2,
      issueTarget: "proof-issues" as const,
      workspaceLabel: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3",
      diffLabel: "Diff attached",
      checklist: [
        {
          label: "Command / test evidence",
          detail: "1 command record attached.",
          tone: "danger" as const,
          target: "command-evidence" as const,
        },
        { label: "Visual evidence", detail: "No visual proof expected for this card.", tone: "neutral" as const },
        { label: "PM judge", detail: "ready_for_review · close · Strong · 97%", tone: "success" as const, target: "pm-judge" as const },
      ],
      visualEvidence: [],
      failedAssertions: ["Command 1 failed.", "Command/test proof failed."],
    };

    const navigation = projectBoardProofInspectionNavigationModel(inspection, "run strong/issues", "card #1");

    expect(navigation).toMatchObject({
      anchorPrefix: "proof-card-1-run-strong-issues",
      inspectionId: "proof-card-1-run-strong-issues-inspection",
      issueTargetId: "proof-card-1-run-strong-issues-proof-issues",
      proofIssuesId: "proof-card-1-run-strong-issues-proof-issues",
      commandEvidenceId: "proof-card-1-run-strong-issues-command-evidence",
      pmJudgeId: "proof-card-1-run-strong-issues-pm-judge",
      issueJumpAriaLabel: "Jump to 2 review issues need attention.",
    });
    expect(navigation.checklist).toEqual([
      {
        label: "Command / test evidence",
        checkId: "proof-card-1-run-strong-issues-check-command-test-evidence",
        target: "command-evidence",
        targetId: "proof-card-1-run-strong-issues-command-evidence",
        ariaLabel: "Jump to supporting proof evidence for Command / test evidence.",
      },
      {
        label: "Visual evidence",
        checkId: "proof-card-1-run-strong-issues-check-visual-evidence",
        target: undefined,
        targetId: undefined,
        ariaLabel: undefined,
      },
      {
        label: "PM judge",
        checkId: "proof-card-1-run-strong-issues-check-pm-judge",
        target: "pm-judge",
        targetId: "proof-card-1-run-strong-issues-pm-judge",
        ariaLabel: "Jump to supporting proof evidence for PM judge.",
      },
    ]);
  });

  it("routes visual-only proof gaps to the visual evidence target", () => {
    const card = {
      id: "visual-gap-card",
      boardId: "board-1",
      title: "Visual gap card",
      description: "Needs mobile and desktop proof, but only desktop exists.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Responsive layout is visible."],
      testPlan: { unit: [], integration: [], visual: ["Capture mobile and desktop screenshots."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-visual-gap",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-visual-gap",
      taskId: "task-visual-gap",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-4",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/responsive.css"],
        screenshots: [{ path: "proof/desktop-layout.png", absolutePath: "data:image/png;base64,AAAA", width: 1280, height: 720 }],
        diff: "diff --git a/src/responsive.css b/src/responsive.css\n+@media (max-width: 400px){}",
        lastAssistantText: "Desktop screenshot captured.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.issueCount).toBe(1);
    expect(evidence.inspection.issueTarget).toBe("visual-evidence");
    expect(evidence.inspection.headline).toBe("1 visual evidence gap");
    expect(evidence.inspection.failedAssertions).toEqual([]);
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Mobile screenshot", "Missing evidence", "danger"],
      ["Desktop screenshot", "Screenshot attached", "success"],
    ]);
    expect(evidence.inspection.checklist.find((item) => item.label === "Visual evidence")?.target).toBe("visual-evidence");
  });

  it("resolves relative proof screenshot previews against the run workspace", () => {
    const run: OrchestrationRun = {
      id: "run-relative-proof",
      taskId: "task-relative-proof",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        screenshots: [{ path: ".ambient-codex/browser/screenshots/browser-proof.png", width: 1440, height: 900 }],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run);

    expect(evidence.artifacts[0]).toMatchObject({
      kind: "screenshot",
      path: ".ambient-codex/browser/screenshots/browser-proof.png",
      previewSrc:
        "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/browser-proof.png",
    });
    expect(evidence.inspection.visualEvidence[0]?.thumbnailSrc).toBe(
      "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/browser-proof.png",
    );
  });

  it("uses screenshot sequences for animation proof and previews visual check images", () => {
    const card = {
      id: "animated-proof-card",
      boardId: "board-1",
      title: "Animated proof card",
      description: "Needs motion proof.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas transitions between visible states."],
      testPlan: {
        unit: [],
        integration: [],
        visual: ["Capture animation in browser showing title, paused, and gravity storm states."],
        manual: [],
      },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-animation",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run: OrchestrationRun = {
      id: "run-animation-proof",
      taskId: "task-animation-proof",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        screenshots: [
          { path: ".ambient-codex/browser/screenshots/title.png", width: 1280, height: 720, summary: "TITLE state" },
          { path: ".ambient-codex/browser/screenshots/paused.png", width: 1280, height: 720, summary: "PAUSED state" },
          { path: ".ambient-codex/browser/screenshots/gravity-storm.png", width: 1280, height: 720, summary: "GRAVITY STORM state" },
        ],
        visualChecks: [
          {
            path: ".ambient-codex/browser/screenshots/title.png",
            result: "nonblank_image_detected",
            width: 1280,
            height: 720,
            summary: "Browser evidence title state.",
          },
        ],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);
    const [animationProof, browserProof] = evidence.inspection.visualEvidence;

    expect(animationProof).toMatchObject({
      label: "Animation visual proof",
      statusLabel: "3 motion frames attached",
      role: "animation",
      tone: "success",
      thumbnailSrc: "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/title.png",
      comparisonLabel: "Motion proof includes 3 captured states for PM review.",
    });
    expect(animationProof?.frames?.map((frame) => frame.path)).toEqual([
      ".ambient-codex/browser/screenshots/title.png",
      ".ambient-codex/browser/screenshots/paused.png",
      ".ambient-codex/browser/screenshots/gravity-storm.png",
    ]);
    expect(browserProof).toMatchObject({
      label: "Browser visual proof",
      statusLabel: "Visual check attached",
      role: "browser",
      tone: "success",
      thumbnailSrc: "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/title.png",
    });
  });
});
