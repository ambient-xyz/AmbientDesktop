import { describe, expect, it } from "vitest";
import type { ProposalManifestArtifact } from "./projectStoreProjectBoardFacade";
import {
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  parseProjectBoardCardRunFeedback,
  projectBoardCardClosePolicyDescription,
  projectBoardCardTaskDescription,
  projectBoardDependencyArtifactKey,
  projectBoardDependencyArtifactPromptSection,
  projectBoardExecutionArtifactCardId,
  projectBoardExecutionArtifactHandoffFromArtifact,
  projectBoardExecutionArtifactProofFromArtifact,
  projectBoardExecutionArtifactStartedAt,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactUpdatedAt,
  projectBoardResolveInside,
  projectBoardRunStageFromArtifactProgress,
  projectBoardRunStageFromManifest,
  projectBoardRunStatusFromProposalManifest,
  renderProjectBoardCardDependencyExecutionContext,
  splitProjectBoardCardDescription,
} from "./projectBoardMappers";
import { projectBoardCard, runHandoffArtifact, runManifestArtifact, runProofArtifact } from "./projectBoardMappersTestSupport";

describe("project board task prompt mappers", () => {
  it("renders project board card close policy with bounded runtime defaults and overrides", () => {
    expect(projectBoardCardClosePolicyDescription()).toContain("after 6 focus passes or about 20m of worker runtime.");
    expect(
      projectBoardCardClosePolicyDescription({
        maxPassesPerCard: "1",
        maxRuntimeMinutesPerCard: "90",
      }),
    ).toContain("after 1 focus pass or about 1h 30m of worker runtime.");
    expect(
      projectBoardCardClosePolicyDescription({
        maxPassesPerCard: "0",
        maxRuntimeMsPerCard: 45_000,
        maxRuntimeMinutesPerCard: "90",
      }),
    ).toContain("after 6 focus passes or about 45s of worker runtime.");
    expect(projectBoardCardClosePolicyDescription({ maxRuntimeMinutesPerCard: "0.02" })).toContain("about 1s of worker runtime.");
  });

  it("formats split project board card descriptions", () => {
    expect(
      splitProjectBoardCardDescription(
        projectBoardCard({
          title: "Parent card",
          description: " Parent description. ",
        }),
        "Child scope",
      ),
    ).toBe("Parent description.\n\nSplit from: Parent card\n\nScope: Child scope");
    expect(
      splitProjectBoardCardDescription(
        projectBoardCard({
          title: "Parent card",
          description: "   ",
        }),
        "Child scope",
      ),
    ).toBe("Split from: Parent card\n\nScope: Child scope");
  });

  it("renders project board card task descriptions with execution, proof, feedback, and UX mock sections", () => {
    const description = projectBoardCardTaskDescription(
      projectBoardCard({
        description: " Build the shell. ",
        blockedBy: ["card-data-model"],
        acceptanceCriteria: ["Canvas renders."],
        testPlan: { unit: ["unit test"], integration: [], visual: ["screenshot"], manual: ["PM review"] },
        executionSessionPolicy: "fresh_context",
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
        runFeedback: [
          {
            id: "feedback-1",
            source: "decision_impact",
            feedback: "Use the approved renderer.",
            decisionQuestion: "Which renderer?",
            decisionAnswer: "React",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      { maxPassesPerCard: 2, maxRuntimeMsPerCard: 45_000 },
    );

    expect(description).toContain("Build the shell.");
    expect(description).toContain("Start from a fresh Pi context for each prepared run of this card.");
    expect(description).toContain("after 2 focus passes or about 45s of worker runtime.");
    expect(description).toContain("UX mock approval artifact requirements:");
    expect(description).toContain("Acceptance criteria:\n- Canvas renders.");
    expect(description).toContain("Dependencies / blockers:\n- card-data-model");
    expect(description).toContain("decision impact (Which renderer? -> React): Use the approved renderer.");
    expect(description).toContain("Proof expectations:");
    expect(description).toContain("- Visual: screenshot");
    expect(description).toContain("Visual proof artifact requirements:");
  });

  it("renders project board dependency execution context for available and pending blockers", () => {
    const description = renderProjectBoardCardDependencyExecutionContext({
      available: [
        {
          ref: "card-data-model",
          title: "Create shared data model",
          cardStatus: "done",
          taskIdentifier: "LOCAL-1",
          taskState: "done",
          latestRunId: "run-1",
          latestRunStatus: "completed",
          workspacePath: "/workspace/dependency",
          branchName: "ambient/LOCAL-1",
          proofSummary: "Data model complete.",
          changedFiles: ["model.mjs"],
          commands: ["node --test model.test.mjs"],
          manualChecks: ["Clean import smoke passed."],
          completed: ["model.mjs exports parseBoard."],
        },
      ],
      pending: ["card-renderer"],
    });

    expect(description).toContain("Dependency execution context:");
    expect(description).toContain(
      "LOCAL-1: Create shared data model (card done, task done, latest run completed); blocker ref: card-data-model",
    );
    expect(description).toContain("Dependency run: run-1");
    expect(description).toContain("Read-only fallback dependency workspace: /workspace/dependency");
    expect(description).toContain("Dependency branch: ambient/LOCAL-1");
    expect(description).toContain("Declared import files: model.mjs");
    expect(description).toContain("Proof commands: node --test model.test.mjs");
    expect(description).toContain("Manual checks: Clean import smoke passed.");
    expect(description).toContain("Completed items: model.mjs exports parseBoard.");
    expect(description).toContain("Proof summary: Data model complete.");
    expect(description).toContain("Still-blocking or unresolved dependencies:\n- card-renderer");
  });

  it("maps project board dependency artifact paths and keys", () => {
    expect(projectBoardResolveInside("/workspace/project", "dist/output.txt")).toBe("/workspace/project/dist/output.txt");
    expect(projectBoardResolveInside("/workspace/project", "dist/../proof/output.txt")).toBe("/workspace/project/proof/output.txt");
    expect(() => projectBoardResolveInside("/workspace/project", "")).toThrow("Deliverable path must be workspace-relative");
    expect(() => projectBoardResolveInside("/workspace/project", "/tmp/output.txt")).toThrow("Deliverable path must be workspace-relative");
    expect(() => projectBoardResolveInside("/workspace/project", "../output.txt")).toThrow("Deliverable path escapes its root");
    expect(
      projectBoardDependencyArtifactKey(
        {
          ref: "card-1",
          title: "Create dependency model",
          taskIdentifier: "Task 01",
          taskId: "task-1",
          changedFiles: [],
          commands: [],
          manualChecks: [],
          completed: [],
        },
        "run-1",
      ),
    ).toBe("Task-01-6394206e2b3b");
    expect(
      projectBoardDependencyArtifactKey(
        {
          ref: "dep/ref",
          title: "!!!",
          changedFiles: [],
          commands: [],
          manualChecks: [],
          completed: [],
        },
        "run-1",
      ),
    ).toBe("dependency-94ed32431c4c");
  });

  it("formats project board dependency artifact prompt sections", () => {
    expect(projectBoardDependencyArtifactPromptSection()).toBe("");
    expect(
      projectBoardDependencyArtifactPromptSection({
        kind: "project_board_dependency_artifact_import_result",
        version: 1,
        boardId: "board-1",
        dependentCardId: "card-dependent",
        dependentTaskId: "task-dependent",
        workspacePath: "/workspace/dependent",
        artifactRoot: "/workspace/dependent/.ambient/dependency-artifacts",
        manifestPath: "/workspace/dependent/.ambient/dependency-artifacts/manifest.json",
        importedAt: "2026-01-01T00:00:00.000Z",
        imports: [
          {
            kind: "project_board_dependency_artifact_import",
            version: 1,
            key: "LOCAL-1-abcd1234",
            boardId: "board-1",
            dependentCardId: "card-dependent",
            dependentTaskId: "task-dependent",
            dependencyRef: "card-model",
            dependencyTitle: "Create data model",
            dependencyCardId: "card-model",
            dependencyTaskId: "task-model",
            dependencyTaskIdentifier: "LOCAL-1",
            dependencyRunId: "run-model",
            sourceWorkspacePath: "/workspace/model",
            importPath: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234",
            filesRoot: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/files",
            manifestPath: "/workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/manifest.json",
            declaredMaterialFiles: [],
            materialFiles: Array.from({ length: 13 }, (_, index) => `file-${index + 1}.txt`),
            skippedFiles: Array.from({ length: 9 }, (_, index) => `missing-${index + 1}.txt`),
            excludedFiles: [],
            changedFiles: [],
            commands: Array.from({ length: 6 }, (_, index) => `command-${index + 1}`),
            manualChecks: [],
            completed: [],
            proofSummary: "Data model exported parseBoard.",
            importedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        pending: Array.from({ length: 9 }, (_, index) => `pending-${index + 1}`),
      }),
    ).toBe(
      [
        "Dependency artifact imports:",
        "- Ambient has staged available dependency artifacts into this run workspace. Prefer these imported files over copying from sibling task workspaces.",
        "- Artifact root: /workspace/dependent/.ambient/dependency-artifacts",
        "- Import manifest: /workspace/dependent/.ambient/dependency-artifacts/manifest.json",
        "Available imported dependency bundles:",
        "- LOCAL-1: Create data model; blocker ref: card-model",
        "  - Files root: /workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/files",
        "  - Bundle manifest: /workspace/dependent/.ambient/dependency-artifacts/LOCAL-1-abcd1234/manifest.json",
        "  - Imported material files: file-1.txt, file-2.txt, file-3.txt, file-4.txt, file-5.txt, file-6.txt, file-7.txt, file-8.txt, file-9.txt, file-10.txt, file-11.txt, file-12.txt",
        "  - Missing or skipped files: missing-1.txt, missing-2.txt, missing-3.txt, missing-4.txt, missing-5.txt, missing-6.txt, missing-7.txt, missing-8.txt",
        "  - Source proof commands: command-1 | command-2 | command-3 | command-4 | command-5",
        "  - Source proof summary: Data model exported parseBoard.",
        "Pending dependency artifact imports:",
        "- pending-1",
        "- pending-2",
        "- pending-3",
        "- pending-4",
        "- pending-5",
        "- pending-6",
        "- pending-7",
        "- pending-8",
      ].join("\n"),
    );
  });

  it("normalizes project board card run feedback conservatively", () => {
    expect(normalizeProjectBoardCardRunFeedbackSource("source_impact")).toBe("source_impact");
    expect(normalizeProjectBoardCardRunFeedbackSource("unsupported")).toBe("manual");

    expect(
      normalizeProjectBoardCardRunFeedback([
        {
          id: " feedback-1 ",
          feedback: "  Review the next run evidence.  ",
          source: "source_impact",
          decisionQuestion: " Which source changed? ",
          decisionAnswer: " README.md ",
          sourceImpactEventId: " event-1 ",
          sourceImpactEventIds: [" event-1 ", "event-2", "event-1", ""],
          sourceIds: [" source-1 ", "source-2", "source-1", ""],
          createdAt: " 2026-01-01T00:00:00.000Z ",
          createdBy: " ambient-desktop ",
        },
        {
          id: "feedback-1",
          feedback: "Duplicate id should be ignored.",
          source: "manual",
          createdAt: "2026-01-01T00:01:00.000Z",
        },
        {
          id: "blank",
          feedback: "   ",
          source: "manual",
          createdAt: "2026-01-01T00:02:00.000Z",
        },
        {
          id: "feedback-2",
          feedback: "Unsupported source falls back.",
          source: "unsupported",
          createdAt: "2026-01-01T00:03:00.000Z",
        },
      ] as never),
    ).toEqual([
      {
        id: "feedback-1",
        feedback: "Review the next run evidence.",
        source: "source_impact",
        decisionQuestion: "Which source changed?",
        decisionAnswer: "README.md",
        sourceImpactEventId: "event-1",
        sourceImpactEventIds: ["event-1", "event-2"],
        sourceIds: ["source-1", "source-2"],
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "ambient-desktop",
      },
      {
        id: "feedback-2",
        feedback: "Unsupported source falls back.",
        source: "manual",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:03:00.000Z",
        createdBy: undefined,
      },
    ]);

    expect(
      normalizeProjectBoardCardRunFeedback(undefined, [
        {
          id: "fallback",
          feedback: "Fallback feedback.",
          source: "manual",
          createdAt: "2026-01-01T00:04:00.000Z",
        },
      ]),
    ).toEqual([
      {
        id: "fallback",
        feedback: "Fallback feedback.",
        source: "manual",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:04:00.000Z",
        createdBy: undefined,
      },
    ]);
  });

  it("keeps the newest run feedback entries when a card exceeds the 20-entry cap", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      id: `feedback-${index + 1}`,
      feedback: `Run feedback entry ${index + 1}.`,
      source: "manual" as const,
      createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    }));

    const normalized = normalizeProjectBoardCardRunFeedback(entries as never);

    expect(normalized).toHaveLength(20);
    // Appends go to the end of the list, so the newest entry must survive the cap.
    expect(normalized[0].id).toBe("feedback-6");
    expect(normalized.at(-1)?.id).toBe("feedback-25");
  });

  it("parses project board card run feedback from JSON", () => {
    expect(
      parseProjectBoardCardRunFeedback(
        JSON.stringify([
          {
            id: "feedback-1",
            feedback: "Follow up on coverage.",
            source: "proof_review",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          { feedback: "Missing source.", createdAt: "2026-01-01T00:01:00.000Z" },
        ]),
      ),
    ).toEqual([
      {
        id: "feedback-1",
        feedback: "Follow up on coverage.",
        source: "proof_review",
        decisionQuestion: undefined,
        decisionAnswer: undefined,
        sourceImpactEventId: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: undefined,
      },
    ]);
    expect(parseProjectBoardCardRunFeedback("{}")).toEqual([]);
    expect(parseProjectBoardCardRunFeedback("not json")).toEqual([]);
    expect(parseProjectBoardCardRunFeedback(null)).toEqual([]);
  });

  it("maps imported project board execution artifact identity and timing", () => {
    const manifest = runManifestArtifact({ cardId: "card-from-manifest", status: "blocked" });
    const proof = runProofArtifact({ cardId: "card-from-proof" });
    const handoff = runHandoffArtifact({ cardId: "card-from-handoff" });

    expect(projectBoardExecutionArtifactStatus(manifest, proof, handoff)).toBe("blocked");
    expect(projectBoardExecutionArtifactStatus(undefined, proof, handoff)).toBe("completed");
    expect(projectBoardExecutionArtifactStatus(undefined, proof)).toBe("review");
    expect(projectBoardExecutionArtifactStatus()).toBe("prepared");

    expect(projectBoardExecutionArtifactCardId(manifest, proof, handoff)).toBe("card-from-manifest");
    expect(projectBoardExecutionArtifactCardId(undefined, proof, handoff)).toBe("card-from-proof");
    expect(projectBoardExecutionArtifactCardId(undefined, undefined, handoff)).toBe("card-from-handoff");
    expect(projectBoardExecutionArtifactCardId()).toBeUndefined();

    expect(projectBoardExecutionArtifactStartedAt(manifest, proof, handoff)).toBe("2026-01-01T00:00:00.000Z");
    expect(projectBoardExecutionArtifactStartedAt(undefined, proof, handoff)).toBe("2026-01-01T00:02:00.000Z");
    expect(projectBoardExecutionArtifactStartedAt(undefined, undefined, handoff)).toBe("2026-01-01T00:03:00.000Z");

    expect(projectBoardExecutionArtifactUpdatedAt(manifest, proof, handoff)).toBe("2026-01-01T00:01:00.000Z");
    expect(projectBoardExecutionArtifactUpdatedAt(undefined, proof, handoff)).toBe("2026-01-01T00:03:00.000Z");
    expect(projectBoardExecutionArtifactUpdatedAt(undefined, proof)).toBe("2026-01-01T00:02:00.000Z");
  });

  it("maps imported project board execution proof and handoff artifact payloads", () => {
    expect(projectBoardExecutionArtifactProofFromArtifact(runProofArtifact())).toEqual({
      summary: "Proof summary",
      commands: ["pnpm test"],
      changedFiles: ["src/main/example.ts"],
      screenshots: ["screenshots/proof.png"],
      browserTraces: ["traces/proof.zip"],
      visualChecks: [{ name: "canvas", status: "passed" }],
      manualChecks: ["Reviewed proof"],
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    expect(projectBoardExecutionArtifactHandoffFromArtifact(runHandoffArtifact())).toEqual({
      summary: "Handoff summary",
      completed: ["Done"],
      remaining: ["Later"],
      risks: ["Risk"],
      followUps: [{ title: "Follow up", reason: "Needs polish", blockedBy: ["card-manifest"] }],
      createdAt: "2026-01-01T00:03:00.000Z",
    });
  });

  it("maps imported project board proposal run manifest stages", () => {
    expect(projectBoardRunStageFromManifest({ status: "failed", stage: "source_scan" } as ProposalManifestArtifact)).toBe("failed");
    expect(projectBoardRunStageFromManifest({ status: "abandoned", stage: "planning" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStageFromManifest({ status: "paused", stage: "source_scan" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "source_scan" } as ProposalManifestArtifact)).toBe("source_scan");
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "source_classification" } as ProposalManifestArtifact)).toBe(
      "source_classification",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "importing" } as ProposalManifestArtifact)).toBe(
      "schema_validation",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "completed" } as ProposalManifestArtifact)).toBe(
      "proposal_created",
    );
    expect(projectBoardRunStageFromManifest({ status: "succeeded", stage: "planning" } as ProposalManifestArtifact)).toBe("model_request");
  });

  it("maps imported project board progress stages", () => {
    expect(projectBoardRunStageFromArtifactProgress(" source_scan ")).toBe("source_scan");
    expect(projectBoardRunStageFromArtifactProgress("sources_persisted")).toBe("sources_persisted");
    expect(projectBoardRunStageFromArtifactProgress("source_classification")).toBe("source_classification");
    expect(projectBoardRunStageFromArtifactProgress("deterministic_baseline")).toBe("deterministic_baseline");
    expect(projectBoardRunStageFromArtifactProgress("model_request")).toBe("model_request");
    expect(projectBoardRunStageFromArtifactProgress("model_response")).toBe("model_response");
    expect(projectBoardRunStageFromArtifactProgress("importing")).toBe("schema_validation");
    expect(projectBoardRunStageFromArtifactProgress("board_applied")).toBe("board_applied");
    expect(projectBoardRunStageFromArtifactProgress("completed")).toBe("proposal_created");
    expect(projectBoardRunStageFromArtifactProgress("planning_paused")).toBe("paused");
    expect(projectBoardRunStageFromArtifactProgress("failed")).toBe("failed");
    expect(projectBoardRunStageFromArtifactProgress("unknown-stage")).toBe("model_response");
  });

  it("maps imported project board proposal run manifest statuses", () => {
    expect(projectBoardRunStatusFromProposalManifest({ status: "abandoned" } as ProposalManifestArtifact)).toBe("abandoned");
    expect(projectBoardRunStatusFromProposalManifest({ status: "pause_requested" } as ProposalManifestArtifact)).toBe("pause_requested");
    expect(projectBoardRunStatusFromProposalManifest({ status: "paused" } as ProposalManifestArtifact)).toBe("paused");
    expect(projectBoardRunStatusFromProposalManifest({ status: "failed" } as ProposalManifestArtifact)).toBe("failed");
    expect(projectBoardRunStatusFromProposalManifest({ status: "running" } as ProposalManifestArtifact)).toBe("running");
    expect(projectBoardRunStatusFromProposalManifest({ status: "succeeded" } as ProposalManifestArtifact)).toBe("succeeded");
  });
});
