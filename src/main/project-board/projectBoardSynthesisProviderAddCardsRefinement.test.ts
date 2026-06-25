import { describe, expect, it } from "vitest";

import { AmbientProjectBoardSynthesisProvider } from "./projectBoardSynthesisProvider";

describe("AmbientProjectBoardSynthesisProvider Add Cards refinement", () => {
  it("filters exact duplicate cards during additive Add Cards refinement", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "Shell exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:pixijs-game-shell",
                        title: "Create the PixiJS game shell",
                        description: "Duplicate shell card.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["pixijs"],
                        blockedBy: [],
                        acceptanceCriteria: ["Canvas exists."],
                        testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
                        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
                      },
                      {
                        sourceId: "synthesis:shield-loop",
                        title: "Implement shield loop",
                        description: "New shield gameplay card.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["shield"],
                        blockedBy: ["synthesis:pixijs-game-shell"],
                        acceptanceCriteria: ["Shield absorbs damage."],
                        testPlan: { unit: ["Test shield state."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Last Vector",
      sources: [{ kind: "functional_spec", title: "GDD", summary: "Game design.", path: "GAME_DESIGN_DOCUMENT.md", relevance: 99 }],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Build shell.",
          currentState: "Shell card exists.",
          targetUser: "Player.",
          qualityBar: "Proof.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:pixijs-game-shell",
              title: "Create the PixiJS game shell",
              description: "Existing card.",
              candidateStatus: "needs_clarification",
              priority: 1,
              phase: "Foundation",
              labels: ["pixijs"],
              blockedBy: [],
              acceptanceCriteria: ["Canvas exists."],
              testPlan: { unit: [], integration: [], visual: [], manual: [] },
              sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
            },
          ],
        },
        answers: [
          {
            question: "Add Cards source scope",
            answer: "This is an additive Add Cards operation. Do not replace or duplicate existing cards.",
          },
        ],
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement shield loop"]);
    expect(result.telemetry.cardCount).toBe(1);
    expect(result.progressiveRecords?.filter((record) => record.type === "candidate_card").map((record) => record.title)).toEqual([
      "Implement shield loop",
    ]);
    expect(result.draft.sourceNotes.at(-1)).toContain("Filtered 1 duplicate candidate");
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(true);
  });

  it("treats duplicate-only additive Add Cards output as a no-op instead of a failed synthesis", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the existing board.",
                    currentState: "Implementation card already exists.",
                    targetUser: "Project contributor.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:local-random-picker",
                        title: "Implement Local Random Option Picker",
                        description: "Duplicate of the existing implementation card.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Implementation",
                        labels: ["implementation", "scope:required"],
                        blockedBy: [],
                        acceptanceCriteria: ["Picker displays one random option."],
                        testPlan: { unit: [], integration: ["Open the picker locally."], visual: [], manual: [] },
                        sourceRefs: ["Local-Random-Option-Picker-DurablePlan.html"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Local Random Option Picker",
      sources: [
        {
          kind: "plan_artifact",
          title: "Local Random Option Picker Durable Plan",
          summary: "Simple local picker.",
          path: ".ambient/board/plans/Local-Random-Option-Picker-DurablePlan.html",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Build the picker.",
          currentState: "Implementation card already exists.",
          targetUser: "Local utility user.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:local-random-picker",
              title: "Implement Local Random Option Picker",
              description: "Existing implementation card.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Implementation",
              labels: ["implementation", "scope:required"],
              blockedBy: [],
              acceptanceCriteria: ["Picker displays one random option."],
              testPlan: { unit: [], integration: ["Open the picker locally."], visual: [], manual: [] },
              sourceRefs: ["Local-Random-Option-Picker-DurablePlan.html"],
            },
          ],
        },
        answers: [
          { question: "Add Cards source scope", answer: "Add Cards from the selected source. Do not replace or duplicate existing cards." },
        ],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards).toEqual([]);
    expect(result.telemetry.cardCount).toBe(0);
    expect(result.draft.sourceNotes.at(-1)).toContain("No net-new cards remain");
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(true);
  });

  it("filters near-duplicate additive cards by source basis and intent", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "A cartography card exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:cartography-contract-board",
                        title: "Implement the cartography contracts mission board",
                        description: "Near duplicate of the existing spectral cartography board.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "contracts", "mission-board"],
                        blockedBy: [],
                        acceptanceCriteria: ["Survey contracts are listed."],
                        testPlan: { unit: ["Test contract model."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                      {
                        sourceId: "synthesis:route-risk-overlay",
                        title: "Add route-risk HUD overlay",
                        description: "New route-risk visualization for active survey contracts.",
                        candidateStatus: "needs_clarification",
                        priority: 3,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "hud", "route-risk"],
                        blockedBy: ["synthesis:spectral-cartography-board"],
                        acceptanceCriteria: ["Risk bands are visible in the HUD."],
                        testPlan: { unit: [], integration: ["Run HUD state test."], visual: ["Capture overlay."], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Last Vector",
      sources: [
        {
          kind: "functional_spec",
          title: "Spectral Cartography Contracts",
          summary: "Survey contract board, scan ping, and route-risk overlay.",
          path: "docs/spectral-cartography-contracts.md",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Expand the game.",
          currentState: "A cartography card exists.",
          targetUser: "Player.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:spectral-cartography-board",
              title: "Build spectral cartography contract board",
              description: "Create the mission board data model for comet-lane survey contracts.",
              candidateStatus: "needs_clarification",
              priority: 2,
              phase: "Spectral Cartography",
              labels: ["cartography", "contracts", "mission-board"],
              blockedBy: [],
              acceptanceCriteria: ["Survey contracts are listed."],
              testPlan: { unit: ["Test contract model."], integration: [], visual: [], manual: [] },
              sourceRefs: ["docs/spectral-cartography-contracts.md"],
            },
          ],
        },
        answers: [
          { question: "Add Cards source scope", answer: "Add Cards from the selected source. Do not replace or duplicate existing cards." },
        ],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual(["Add route-risk HUD overlay"]);
    expect(result.progressiveRecords?.filter((record) => record.type === "candidate_card").map((record) => record.title)).toEqual([
      "Add route-risk HUD overlay",
    ]);
    expect(result.draft.sourceNotes.at(-1)).toContain("Filtered 1 duplicate candidate");
    const warning = result.progressiveRecords?.find(
      (record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered",
    );
    expect(warning).toMatchObject({
      type: "warning",
      metadata: {
        duplicateCount: 1,
        duplicateCandidates: [
          expect.objectContaining({
            title: "Implement the cartography contracts mission board",
            matchedTitle: "Build spectral cartography contract board",
            reason: "intent_source_basis",
          }),
        ],
      },
    });
  });

  it("keeps same-source additive cards when their intent is distinct", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "No cartography cards exist.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:cartography-contract-board",
                        title: "Build cartography contract board",
                        description: "Mission board data model for comet-lane contracts.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "contracts"],
                        blockedBy: [],
                        acceptanceCriteria: ["Contracts are listed."],
                        testPlan: { unit: ["Test contracts."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                      {
                        sourceId: "synthesis:scan-ping-state",
                        title: "Implement scan-ping state transition",
                        description: "Reveal spectral beacon echoes and hidden salvage pockets when the player fires a scan ping.",
                        candidateStatus: "needs_clarification",
                        priority: 3,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "scan-ping", "beacons"],
                        blockedBy: ["synthesis:cartography-contract-board"],
                        acceptanceCriteria: ["Scan ping reveals beacons."],
                        testPlan: { unit: ["Test ping reducer."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Last Vector",
      sources: [
        {
          kind: "functional_spec",
          title: "Spectral Cartography Contracts",
          summary: "Survey contract board, scan ping, and route-risk overlay.",
          path: "docs/spectral-cartography-contracts.md",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Expand the game.",
          currentState: "No cartography cards exist.",
          targetUser: "Player.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [],
        },
        answers: [
          { question: "Add Cards source scope", answer: "Add Cards from the selected source without replacing existing board content." },
        ],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual([
      "Build cartography contract board",
      "Implement scan-ping state transition",
    ]);
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(false);
  });
});
