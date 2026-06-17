import { describe, expect, it } from "vitest";
import { validateProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE,
  PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
  PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE,
  PROJECT_BOARD_PLANNER_SYNTHESIS_LAMBDA_RLM_RULE,
  PROJECT_BOARD_PLANNER_SYNTHESIS_PROOF_EXPECTATION_RULE,
  projectBoardPlannerCandidateCardPromptExample,
  projectBoardPlannerClarificationContractPromptRules,
  projectBoardPlannerPmReviewActivationPromptBlock,
  projectBoardPlannerPmReviewGitStatePromptLines,
  projectBoardPlannerPmReviewPromptRules,
  projectBoardPlannerPmReviewReadinessPromptLines,
  projectBoardPlannerPmReviewReportPromptExample,
  projectBoardPlannerPmReviewSourceConfidencePromptLines,
  projectBoardPlannerProofExpectationPromptRules,
  projectBoardPlannerProofScopePromptRuleLines,
  projectBoardPlannerScopeCapabilityPromptRules,
  projectBoardPlannerSynthesisCardPromptExample,
  projectBoardPlannerSynthesisClarificationPromptRules,
  projectBoardPlannerSynthesisProofExpectationPromptRules,
} from "./projectBoardPlannerPromptContracts";

describe("project board planner prompt contracts", () => {
  it("builds the shared candidate-card record example with caller-owned source refs", () => {
    const example = projectBoardPlannerCandidateCardPromptExample({
      sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-5" }],
      suggestedAnswer: "expert default when safe",
      rationale: "source-grounded rationale",
    });

    expect(validateProposalJsonlRecordArtifact(example)).toMatchObject({
      type: "candidate_card",
      sourceId: "synthesis:stable-card-id",
      sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-5" }],
      clarificationDecisions: [
        expect.objectContaining({
          suggestedAnswer: "expert default when safe",
          rationale: "source-grounded rationale",
          questionKind: "expert_default",
        }),
      ],
      testPlan: {
        unit: ["unit proof expectation"],
        integration: ["integration proof expectation"],
        visual: ["visual/browser/screenshot expectation only when this card directly changes visible UI, canvas, HUD, scene, or rendered pixels"],
        manual: ["manual proof expectation"],
      },
    });
  });

  it("keeps shared sectioned and batch planner output rules stable", () => {
    expect(projectBoardPlannerScopeCapabilityPromptRules({ optionalScopeTarget: "source_coverage or remainingCoverageSummary" })).toEqual([
      "- Classify every candidate_card against the capability contract with exactly one label: scope:required, scope:supporting, scope:optional, or scope:excluded.",
      "- Emit scope:required and scope:supporting cards only. If a useful idea is scope:optional, mention it in source_coverage or remainingCoverageSummary instead of creating a candidate_card.",
    ]);
    expect(PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE).toBe(
      "- candidateStatus must be exactly needs_clarification or ready_to_create. The schema rejects ready, ready_to_start, approved, todo, and other aliases.",
    );
    expect(
      projectBoardPlannerClarificationContractPromptRules({
        canonicalRule: "- Use clarificationDecisions as the canonical unresolved clarification shape.",
        defaultRule: "- For each unresolved clarification, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind.",
      }),
    ).toEqual([
      "- Use clarificationDecisions as the canonical unresolved clarification shape.",
      "- For each unresolved clarification, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind.",
    ]);
    expect(projectBoardPlannerProofExpectationPromptRules()).toEqual(
      expect.arrayContaining([
        "- Include unit, integration, visual, or manual proof expectations on every candidate card.",
        "- If a source mentions screenshot or visual proof but the current card does not own rendered pixels, put that proof on a downstream renderer/gameplay/HUD/proof card instead of this card.",
      ]),
    );
    expect(PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE).toContain("use extraction for card material");
    expect(PROJECT_BOARD_PLANNER_JSON_ONLY_RULE).toBe("- Return JSON only. Do not use markdown.");
  });

  it("keeps whole-board synthesis card examples and rules stable", () => {
    expect(projectBoardPlannerSynthesisCardPromptExample()).toMatchObject({
      sourceId: "synthesis:stable-id",
      title: "self-contained card title",
      description: "card scope and source basis",
      candidateStatus: "needs_clarification",
      labels: ["scope:required", "label"],
      sourceRefs: ["path-or-source-title"],
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
      clarificationDecisions: [
        expect.objectContaining({
          suggestedAnswer: "professionally defensible default answer when safe",
          rationale: "why an expert UX designer/software architect would choose this default from the source evidence",
          questionKind: "expert_default",
        }),
      ],
      clarificationSuggestions: [
        expect.objectContaining({
          question: "same text as an open clarificationDecisions question",
        }),
      ],
    });
    expect(
      projectBoardPlannerScopeCapabilityPromptRules({
        noun: "card",
        action: "Propose",
        optionalScopeTarget: "sourceNotes or questions",
      }),
    ).toEqual([
      "- Classify every card against the capability contract with exactly one label: scope:required, scope:supporting, scope:optional, or scope:excluded.",
      "- Propose scope:required and scope:supporting cards only. Put optional ideas in sourceNotes or questions instead of executable cards.",
    ]);
    expect(projectBoardPlannerSynthesisClarificationPromptRules()).toEqual([
      "- Keep candidateStatus as needs_clarification unless the card is fully specified and proof-ready.",
      "- Emit clarificationDecisions as the canonical clarification model for every card ambiguity. Use stable id and canonicalKey values so repeated planning passes update the same decision instead of creating duplicates.",
      "- Mirror each open clarificationDecisions entry into clarificationQuestions and clarificationSuggestions for compatibility only; do not create extra variants in those legacy arrays.",
      "- Every needs_clarification card must include at least one open clarificationDecisions entry with a concrete, answerable missing decision. If there is no specific question left, use ready_to_create instead.",
      "- Keep clarificationDecisions about implementation-blocking PM decisions, not generic requests for more detail.",
      "- For each open clarification decision, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind when an experienced UX designer and software architect can propose a safe default. Use questionKind expert_default for implementation/UX defaults, user_preference for product taste/scope choices, and external_constraint when outside facts or credentials are needed.",
      "- Set safeToAccept true only for expert defaults that can be accepted without inventing product intent. Do not auto-resolve user preference or external constraint questions.",
    ]);
    expect(PROJECT_BOARD_PLANNER_SYNTHESIS_PROOF_EXPECTATION_RULE).toBe("- Include proof expectations on every card.");
    expect(projectBoardPlannerSynthesisProofExpectationPromptRules()).toEqual([
      PROJECT_BOARD_PLANNER_SYNTHESIS_PROOF_EXPECTATION_RULE,
      ...projectBoardPlannerProofScopePromptRuleLines(),
    ]);
    expect(PROJECT_BOARD_PLANNER_SYNTHESIS_LAMBDA_RLM_RULE).toContain("classification for source authority");
  });

  it("keeps PM Review report examples and value rules stable", () => {
    expect(projectBoardPlannerPmReviewReportPromptExample()).toEqual({
      readiness: "ready_for_card_generation",
      summary: "brief PM review finding",
      sourceConfidence: "high",
      sourceConfidenceNotes: ["why the source set is strong, weak, stale, or incomplete"],
      gitState: "git_ready",
      gitStateNotes: ["branch, remote/upstream, ahead/behind, dirty board artifacts, or local-only coordination notes"],
      blockingQuestions: ["specific question that must be answered before activation or card generation"],
      risks: ["source-backed planning or execution risk"],
      sourceConflicts: ["conflict between kickoff, charter, or source evidence"],
      sourceAuthorityNotes: ["which source should win if sources disagree"],
      recommendedActivationScope: "what can safely be activated or planned next",
      cardGenerationConstraints: ["constraints the later board-synthesis pass must obey"],
    });
    expect(projectBoardPlannerPmReviewReadinessPromptLines()).toEqual([
      "Readiness values:",
      "- ready_for_activation: kickoff answers and source evidence look coherent enough to activate the charter.",
      "- ready_for_card_generation: the active charter can safely proceed to explicit board-synthesis/card generation.",
      "- needs_answers: the user needs to answer blocking PM questions first.",
      "- needs_source_refresh: source evidence is missing, stale, or contradictory enough that refresh/reclassification should happen first.",
      "- blocked: the charter cannot safely proceed until a serious conflict is resolved.",
    ]);
    expect(projectBoardPlannerPmReviewSourceConfidencePromptLines()).toContain(
      "- medium: sources are usable, but scope gaps, lower confidence classifications, stale files, or conflicts should constrain later cards.",
    );
    expect(projectBoardPlannerPmReviewGitStatePromptLines()).toContain(
      "- git_no_remote: workspace is a Git repository, but board artifacts do not yet have remote coordination.",
    );
    expect(projectBoardPlannerPmReviewPromptRules()).toEqual([
      "- Do not generate candidate cards.",
      "- Do not include a cards field.",
      "- Keep blockingQuestions concrete and answerable; do not ask for generic more detail.",
      "- Separate source conflicts from risks. Conflicts name contradictory evidence; risks name execution or planning hazards.",
      "- Source authority notes should cite titles/paths when possible and should mention ignored sources only when they explain why something was excluded.",
      "- Source confidence notes should cite titles/paths, classification confidence, authority roles, change states, and source coverage gaps when available.",
      "- Git state must match the provided Git coordination input exactly. If Git coordination input is missing, use unknown.",
      "- Git state notes should mention branch, remote/upstream, ahead/behind counts, dirty board artifact count, and projection validity when provided.",
      "- Recommended activation scope should state whether to activate, ask questions, refresh sources, or run full board synthesis.",
      "- Card generation constraints are instructions for the later explicit board-synthesis pass, not cards.",
      PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
    ]);
  });

  it("keeps the PM Review activation prompt block stable", () => {
    expect(projectBoardPlannerPmReviewActivationPromptBlock()).toBe("");
    const report = {
      readiness: "ready_for_card_generation",
      summary: "Generate a local-first editor board and defer collaboration.",
      sourceConfidence: "medium",
      sourceConfidenceNotes: ["PRD is primary; collaboration is explicitly deferred."],
      gitState: "git_ready",
      gitStateNotes: ["main tracks origin/main with no dirty board artifacts."],
      recommendedActivationScope: "Create local editor foundation cards only.",
      cardGenerationConstraints: ["Do not generate collaboration cards."],
      blockingQuestions: [],
      risks: ["Persistence format needs proof coverage."],
      sourceConflicts: [],
      sourceAuthorityNotes: ["PRD.md is primary."],
    };

    expect(projectBoardPlannerPmReviewActivationPromptBlock(report)).toBe(
      [
        "",
        "PM Review activation context:",
        JSON.stringify(
          {
            readiness: report.readiness,
            summary: report.summary,
            sourceConfidence: report.sourceConfidence,
            sourceConfidenceNotes: report.sourceConfidenceNotes,
            gitState: report.gitState,
            gitStateNotes: report.gitStateNotes,
            recommendedActivationScope: report.recommendedActivationScope,
            cardGenerationConstraints: report.cardGenerationConstraints,
            blockingQuestions: report.blockingQuestions,
            risks: report.risks,
            sourceConflicts: report.sourceConflicts,
            sourceAuthorityNotes: report.sourceAuthorityNotes,
          },
          null,
          2,
        ),
        "",
        "PM Review activation rules:",
        "- This board-synthesis pass was explicitly launched from the lightweight PM Review recommendation.",
        "- Treat recommendedActivationScope as the activation brief for the next generated cards.",
        "- Treat cardGenerationConstraints as hard planning constraints unless a settled user answer contradicts them.",
        "- Treat sourceConfidence and sourceConfidenceNotes as the source-quality boundary for card scope and evidence expectations.",
        "- Treat gitState and gitStateNotes as coordination context; prefer cards that preserve or improve safe local board coordination.",
        "- Carry risks, source conflicts, and source authority notes into sourceNotes and card scope when they affect execution.",
        "- If readiness is needs_answers, needs_source_refresh, or blocked and the settled answers do not resolve the blocker, ask only the remaining concrete blocking question instead of inventing scope.",
      ].join("\n"),
    );
  });
});
