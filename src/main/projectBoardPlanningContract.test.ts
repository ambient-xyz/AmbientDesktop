import { describe, expect, it } from "vitest";
import {
  buildProjectBoardPlanningContract,
  getProjectBoardPlanningProfile,
  projectBoardPlanningProfileNames,
  projectBoardPlanningReasoningForOperation,
} from "./projectBoardPlanningContract";

describe("project board planning contract", () => {
  it("defines serious board planning profiles", () => {
    expect(projectBoardPlanningProfileNames()).toEqual([
      "strict-pm",
      "startup-mvp",
      "implementation-first",
      "research-heavy",
      "quality-gate",
      "maintenance-refactor",
      "gameplay-design",
    ]);
    expect(getProjectBoardPlanningProfile("gameplay-design")).toMatchObject({
      cardGranularity: expect.stringMatching(/mechanics|engine|controls/i),
      proofStrictness: expect.stringMatching(/gameplay|canvas|screenshots/i),
      proofScopeWarningPolicy: "advisory",
      executionBias: expect.stringMatching(/playable slice/i),
    });
    expect(getProjectBoardPlanningProfile("strict-pm").proofScopeWarningPolicy).toBe("acknowledgement_required");
    expect(getProjectBoardPlanningProfile("quality-gate").proofScopeWarningPolicy).toBe("acknowledgement_required");
  });

  it("builds a stable prompt header with charter, profile, operation, and Lambda RLM guidance", () => {
    const contract = buildProjectBoardPlanningContract({
      operation: "section_elaboration",
      projectName: "Starfall Courier",
      profileName: "gameplay-design",
      charter: {
        goal: "Build a playable starship MVP.",
        sourceAuthority: "The GDD wins over thread speculation.",
        decisionPolicy: "Ask before changing core gameplay feel.",
        proofPolicy: "Require browser/canvas proof and deterministic mechanic checks.",
        projectSummary: {
          summary: "Starship game with rendering, controls, combat, HUD, and proof work.",
          majorSystems: ["Rendering", "Controls", "Combat"],
          sourceCoverage: ["docs/gdd.md - functional_spec - primary authority"],
          risks: ["Control feel is undecided."],
          dependencyHints: ["Renderer before HUD."],
          unresolvedDecisions: ["Choose arcade or inertia controls."],
          citations: ["docs/gdd.md"],
          coverageGaps: ["No audio source."],
          sourceChecksumSet: ["source-gdd:aaaaaaaa"],
          charterAnswerChecksum: "bbbbbbbb",
          generatedAt: "2026-05-04T12:00:00.000Z",
          generator: "fallback_heuristic",
        },
      },
    });

    expect(contract.systemPrompt).toContain("project-board planning contract");
    expect(contract.stablePromptHeader).toContain("Project: Starfall Courier");
    expect(contract.stablePromptHeader).toContain("Project charter:");
    expect(contract.stablePromptHeader).toContain("Build a playable starship MVP.");
    expect(contract.stablePromptHeader).toContain("Project summary authority: derived context");
    expect(contract.stablePromptHeader).toContain("Starship game with rendering");
    expect(contract.stablePromptHeader).toContain("Major systems: Rendering; Controls; Combat");
    expect(contract.stablePromptHeader).toContain("Unresolved decisions: Choose arcade or inertia controls.");
    expect(contract.stablePromptHeader).toContain("Name: gameplay-design");
    expect(contract.stablePromptHeader).toContain("Proof-scope warning policy: advisory warning before ticketization");
    expect(contract.stablePromptHeader).toContain("Proof ownership rules:");
    expect(contract.stablePromptHeader).toContain("Pure module cards such as input adapters");
    expect(contract.stablePromptHeader).toContain("downstream renderer/gameplay/HUD/proof card");
    expect(contract.stablePromptHeader).toContain("Operation overlay: Section Elaboration");
    expect(contract.stablePromptHeader).toContain("Lambda RLM capability guidance:");
    expect(contract.stablePromptHeader).toContain("Lambda RLM extraction");
    expect(contract.stablePromptHeader.indexOf("Project charter:")).toBeLessThan(
      contract.stablePromptHeader.indexOf("Operation overlay: Section Elaboration"),
    );
  });

  it("maps operations to explicit reasoning policies", () => {
    expect(projectBoardPlanningReasoningForOperation("source_classification")).toMatchObject({
      effort: "minimal",
      enabled: true,
      exclude: true,
    });
    expect(projectBoardPlanningReasoningForOperation("charter_summary")).toMatchObject({
      effort: "low",
      enabled: true,
      exclude: true,
    });
    expect(projectBoardPlanningReasoningForOperation("board_synthesis")).toBeUndefined();
    expect(projectBoardPlanningReasoningForOperation("proof_judgment")).toMatchObject({
      effort: "medium",
      enabled: true,
      exclude: true,
    });
  });
});
