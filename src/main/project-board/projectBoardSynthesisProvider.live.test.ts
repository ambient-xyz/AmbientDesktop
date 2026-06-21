import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardSynthesisProvider,
  parseProjectBoardSynthesisJson,
  type AmbientProjectBoardSynthesisProgress,
} from "./projectBoardSynthesisProvider";
import { liveAmbientDirectHelperProfile, liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "./projectBoardAmbientFacade";
import { createProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import { projectBoardPlannerWorkspaceToolExecutor } from "./projectBoardPlannerWorkspaceTools";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";
import { callWorkflowPiText } from "./projectBoardWorkflowFacade";

const runLive = process.env.AMBIENT_PROJECT_BOARD_PROVIDER_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();
const runBudgetMatrixLive = process.env.AMBIENT_PROJECT_BOARD_BUDGET_MATRIX_LIVE === "1";
const budgetMatrixIt = runBudgetMatrixLive ? it : it.skip;
const runLedgerCompactionLive = process.env.AMBIENT_PROJECT_BOARD_LEDGER_COMPACTION_LIVE === "1";
const ledgerCompactionIt = runLedgerCompactionLive ? it : it.skip;
const runObjectiveElaborationLive = process.env.AMBIENT_PROJECT_BOARD_OBJECTIVE_ELABORATION_LIVE === "1";
const objectiveElaborationIt = runObjectiveElaborationLive ? it : it.skip;
const runPmReviewVariantsLive = process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_VARIANTS_LIVE === "1";
const pmReviewVariantsIt = runPmReviewVariantsLive ? it : it.skip;

describe("AmbientProjectBoardSynthesisProvider live", () => {
  liveIt(
    "returns telemetry and a reviewable spaceship-board proposal from live Ambient/Pi",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const progress: string[] = [];
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        apiKey,
      });
      const sources: ProjectBoardSynthesisSource[] = [
        {
          kind: "functional_spec",
          title: "Spaceship game vision",
          summary:
            "Build a browser WebGL spaceship survival game with a readable nonblank scene, player movement, enemies, score, and proof that the first playable slice works.",
          path: "README.md",
          relevance: 95,
        },
        {
          kind: "architecture_artifact",
          title: "Render architecture",
          summary:
            "Use Three.js/WebGL with separated render loop, input reducer, entity update systems, collision helpers, and lightweight HUD state.",
          path: "docs/architecture.md",
          relevance: 92,
        },
        {
          kind: "implementation_plan",
          title: "Known ambiguities",
          summary:
            "Controls are unresolved between arcade movement and inertia thrust. Enemy pacing is unresolved between waves and endless spawning. Proof should include unit tests for pure state and visual/manual proof for the canvas.",
          path: "docs/gameplay-notes.md",
          relevance: 88,
        },
      ];

      const result = await provider.synthesizeWithTelemetry({
        projectName: "Live Spaceship Fixture",
        sources,
        onProgress: (event) => progress.push(event.stage),
      });

      expect(progress[0]).toBe("model_request");
      expect(progress).toContain("model_response");
      expect(progress.at(-1)).toBe("schema_validation");
      expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(500);
      expect(result.telemetry.cardCount).toBeGreaterThanOrEqual(3);
      expect(result.draft.cards.length).toBeGreaterThanOrEqual(3);
      expect(result.draft.cards.some((card) => card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length > 0)).toBe(true);
      expect(JSON.stringify(result.draft).toLowerCase()).toContain("webgl");
    },
    120_000,
  );

  liveIt(
    "creates a UX mock approval gate before live UI implementation cards",
    async () => {
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientApiKey(),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
      });
      const result = await provider.synthesizeWithTelemetry({
        projectName: "Live UX Mock Gate Fixture",
        sources: [
          {
            kind: "functional_spec",
            title: "Project board UI mock gate dogfood spec",
            summary:
              "Build a browser project-board dashboard with a kanban board, draft inbox, active card inspector, and user-facing controls. The first phase must produce a reviewable self-contained HTML mock before implementation tasks for the dashboard UI are created.",
            path: "docs/ui-mock-gate-prd.md",
            relevance: 99,
          },
          {
            kind: "implementation_plan",
            title: "UX approval workflow",
            summary:
              "Implementation should wait for a product-owner approval or revision decision on the generated HTML mock. Downstream UI implementation cards must depend on the approved mock and should not be ticketized early.",
            path: "docs/ux-approval-workflow.md",
            relevance: 96,
          },
        ],
      });

      const mockGate = result.draft.cards.find((card) => card.uiMockRole === "mock_gate" || card.sourceId === "synthesis:ux-mock-approval");
      expect(mockGate).toMatchObject({
        sourceId: "synthesis:ux-mock-approval",
        uiMockRole: "mock_gate",
      });
      expect(mockGate?.candidateStatus).toBe("ready_to_create");
      const gatedCards = result.draft.cards.filter((card) => card.uiMockRole === "gated_implementation" || card.requiresUiMockApproval);
      expect(gatedCards.length).toBeGreaterThan(0);
      expect(gatedCards.every((card) => card.blockedBy.includes("synthesis:ux-mock-approval"))).toBe(true);
      expect(gatedCards.every((card) => card.requiresUiMockApproval)).toBe(true);
      expect(result.telemetry.cardCount).toBeGreaterThanOrEqual(2);
    },
    liveProfile.testTimeoutMs,
  );

  liveIt(
    "returns source-confidence and Git-state details in a live PM Review report",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        apiKey,
      });
      const progress: AmbientProjectBoardSynthesisProgress[] = [];

      const result = await provider.reviewCharterWithTelemetry({
        projectName: "Live PM Review Fixture",
        sources: [
          {
            id: "source-prd",
            kind: "functional_spec",
            title: "PRD",
            summary: "Build a local-first kanban board with draft cards, visible review, and durable proof expectations.",
            path: "docs/PRD.md",
            authorityRole: "primary",
            classificationConfidence: 0.96,
            changeState: "unchanged",
            relevance: 98,
          },
          {
            id: "source-tests",
            kind: "test_artifact",
            title: "Test plan",
            summary: "Cover card creation, review status, persistence, and a visual smoke test for the board surface.",
            path: "docs/test-plan.md",
            authorityRole: "proof",
            classificationConfidence: 0.9,
            changeState: "unchanged",
            relevance: 90,
          },
        ],
        gitContext: {
          mode: "git_no_remote",
          isGitRepository: true,
          hasRemote: false,
          branch: "main",
          ahead: 0,
          behind: 0,
          dirtyBoardFileCount: 0,
          dirtyBoardFiles: [],
          projectionValid: true,
          projectionDifferenceCount: 0,
          message: "Local Git repository exists; remote coordination is not configured yet.",
        },
        onProgress: (event) => progress.push(event),
      });

      expect(result.draft.cards).toEqual([]);
      expect(result.reviewReport.sourceConfidence).not.toBe("unknown");
      expect(result.reviewReport.sourceConfidenceNotes.length).toBeGreaterThan(0);
      expect(result.reviewReport.gitState).toBe("git_no_remote");
      expect(result.reviewReport.gitStateNotes.join("\n").toLowerCase()).toMatch(/git|remote|repo|branch/);
      expect(progress.find((event) => event.title === "Validated charter review report")?.metadata).toMatchObject({
        sourceConfidence: result.reviewReport.sourceConfidence,
        gitState: "git_no_remote",
      });
    },
    120_000,
  );

  pmReviewVariantsIt(
    "covers live PM Review variant reports for constrained readiness, source conflicts, ignored sources, and recommendation scope",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        apiKey,
      });
      const gitContext = {
        mode: "git_ready" as const,
        isGitRepository: true,
        hasRemote: true,
        branch: "main",
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
        dirtyBoardFileCount: 0,
        dirtyBoardFiles: [],
        projectionValid: true,
        projectionDifferenceCount: 0,
        message: "Board artifacts are ready for remote Git coordination.",
      };
      const scenarios: Array<{
        name: string;
        sources: ProjectBoardSynthesisSource[];
        expectConflict?: boolean;
        expectIgnoredExcluded?: string[];
        expectConstraints?: boolean;
        expectRecommendation?: boolean;
      }> = [
        {
          name: "ready_with_constraints",
          expectConstraints: true,
          expectRecommendation: true,
          sources: [
            {
              id: "source-prd",
              kind: "functional_spec",
              title: "Calculator MVP PRD",
              summary: "Build a local-first calculator MVP with keyboard input, arithmetic history, and visual proof.",
              excerpt: "The first board should cover calculator shell, arithmetic reducer, keyboard input, visible history, and screenshot proof. Collaboration, theming, and memory functions are explicitly later scope.",
              path: "docs/calculator-prd.md",
              authorityRole: "primary",
              classificationConfidence: 0.97,
              changeState: "unchanged",
              relevance: 99,
            },
            {
              id: "source-notes",
              kind: "implementation_plan",
              title: "Changed implementation notes",
              summary: "Recent notes mention theming and memory, but say the first board should stay focused on calculator correctness.",
              excerpt: "Settings, theming, memory functions, and collaboration should be deferred until the arithmetic reducer and visual proof are complete.",
              path: "docs/implementation-notes.md",
              authorityRole: "supporting",
              classificationConfidence: 0.74,
              changeState: "changed",
              relevance: 84,
            },
          ],
        },
        {
          name: "source_conflict_needs_answer",
          expectConflict: true,
          sources: [
            {
              id: "source-prd",
              kind: "functional_spec",
              title: "Local editor PRD",
              summary: "Build a local-only macOS text editor with autosave to local files.",
              excerpt: "Cloud sync, account login, and collaboration are explicitly out of scope for the first board.",
              path: "docs/editor-prd.md",
              authorityRole: "primary",
              classificationConfidence: 0.95,
              changeState: "unchanged",
              relevance: 98,
            },
            {
              id: "source-scratch",
              kind: "implementation_plan",
              title: "Scratch collaboration note",
              summary: "A scratch note proposes shared cloud documents, login, and collaborative comments.",
              excerpt: "The editor could use cloud sync, user accounts, shared documents, and collaborative comments.",
              path: "scratch/collaboration.md",
              authorityRole: "supporting",
              classificationConfidence: 0.62,
              changeState: "new",
              relevance: 70,
            },
          ],
        },
        {
          name: "ignored_source_excluded",
          expectIgnoredExcluded: ["Ignored blockchain spike", "token-gated boards"],
          expectRecommendation: true,
          sources: [
            {
              id: "source-prd",
              kind: "functional_spec",
              title: "Kanban PRD",
              summary: "Build a small local web kanban board with drag and drop, persistence, and visual smoke proof.",
              excerpt: "Focus on board columns, card CRUD, drag/drop, local persistence, and a visual smoke test.",
              path: "docs/kanban-prd.md",
              authorityRole: "primary",
              classificationConfidence: 0.93,
              changeState: "unchanged",
              relevance: 96,
            },
            {
              id: "source-ignored",
              kind: "ignored",
              title: "Ignored blockchain spike",
              summary: "Do not use this old spike.",
              excerpt: "Use a blockchain ledger, wallet connection, and token-gated boards.",
              path: "scratch/ignored-blockchain.md",
              includeInSynthesis: false,
              authorityRole: "supporting",
              classificationConfidence: 0.2,
              changeState: "removed",
              relevance: 100,
            },
          ],
        },
        {
          name: "recommendation_scope_ready_for_activation",
          expectConstraints: true,
          expectRecommendation: true,
          sources: [
            {
              id: "source-gdd",
              kind: "functional_spec",
              title: "Asteroids GDD",
              summary: "Build a modern asteroids clone with movement, shooting, wraparound, collision, score, and visual proof.",
              excerpt: "First activation should create a playable core with movement, asteroid spawning, shooting, collision, score, and screenshot proof before polish, powerups, boss waves, or online leaderboard work.",
              path: "docs/asteroids-gdd.md",
              authorityRole: "primary",
              classificationConfidence: 0.91,
              changeState: "unchanged",
              relevance: 97,
            },
          ],
        },
      ];

      for (const scenario of scenarios) {
        const progress: AmbientProjectBoardSynthesisProgress[] = [];
        const result = await provider.reviewCharterWithTelemetry({
          projectName: `Live PM Review Variant ${scenario.name}`,
          sources: scenario.sources,
          gitContext,
          onProgress: (event) => progress.push(event),
        });
        const serialized = JSON.stringify(result.reviewReport).toLowerCase();
        const validationMetadata = progress.find((event) => event.title === "Validated charter review report")?.metadata ?? {};

        expect(result.draft.cards, scenario.name).toEqual([]);
        expect(result.telemetry.cardCount, scenario.name).toBe(0);
        expect(result.reviewReport.summary.trim().length, scenario.name).toBeGreaterThan(20);
        expect(result.reviewReport.sourceConfidence, scenario.name).not.toBe("unknown");
        expect(result.reviewReport.gitState, scenario.name).toBe("git_ready");
        expect(validationMetadata, scenario.name).toMatchObject({ cardCount: 0, gitState: "git_ready" });

        if (scenario.expectConflict) {
          expect(result.reviewReport.blockingQuestions.length + result.reviewReport.sourceConflicts.length, scenario.name).toBeGreaterThan(0);
        }
        if (scenario.expectConstraints) {
          expect(result.reviewReport.cardGenerationConstraints.length, scenario.name).toBeGreaterThan(0);
        }
        if (scenario.expectRecommendation) {
          expect(result.reviewReport.recommendedActivationScope.trim().length, scenario.name).toBeGreaterThan(20);
        }
        for (const excluded of scenario.expectIgnoredExcluded ?? []) {
          expect(serialized, scenario.name).not.toContain(excluded.toLowerCase());
        }
      }
    },
    360_000,
  );

  liveIt(
    "elaborates additive cards from the actual Last Vector spaceship game design document",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const designDocPath = "/Users/Neo/Documents/testStarshipGame/GAME_DESIGN_DOCUMENT.md";
      expect(existsSync(designDocPath)).toBe(true);
      const designDoc = readFileSync(designDocPath, "utf8");
      const progress: string[] = [];
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        apiKey,
      });
      const batches: number[] = [];

      const result = await provider.synthesizeSectionedWithTelemetry({
        projectName: "testStarshipGame",
        sectioning: { maxSectionChars: 9_000, minSectionChars: 2_000, maxSections: 4 },
        maxCardsPerSection: 4,
        sources: [
          {
            kind: "functional_spec",
            title: "THE LAST VECTOR - Game Design Document",
            summary:
              "Authoritative game design document for a browser space fantasy action RPG with PixiJS, Matter.js, Howler.js, movement, shields, weapons, enemy factions, bosses, environments, progression, and proof needs.",
            excerpt: designDoc,
            path: "GAME_DESIGN_DOCUMENT.md",
            relevance: 99,
          },
        ],
        refinement: {
          previousDraft: {
            summary: "Existing board seed.",
            goal: "Complete the MVP slice of THE LAST VECTOR.",
            currentState: "The design document exists and early shell cards may already be present.",
            targetUser: "Browser action RPG player.",
            qualityBar: "Generated cards need runnable unit, integration, visual, or manual proof expectations.",
            assumptions: ["The game design document is authoritative for this Add Cards pass."],
            questions: [],
            sourceNotes: ["GAME_DESIGN_DOCUMENT.md is the selected source scope."],
            cards: [
              {
                sourceId: "synthesis:pixijs-game-shell",
                title: "Create the PixiJS game shell",
                description: "Existing foundation card for app boot, render loop, and nonblank scene.",
                candidateStatus: "needs_clarification",
                priority: 1,
                phase: "Foundation",
                labels: ["pixijs", "foundation"],
                blockedBy: [],
                acceptanceCriteria: ["Canvas mounts and renders a visible scene."],
                testPlan: { unit: [], integration: ["Run the app."], visual: ["Capture a visible scene."], manual: [] },
                sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
              },
            ],
          },
          answers: [
            {
              question: "Add Cards source scope",
              answer:
                "Elaborate additive candidate cards only from GAME_DESIGN_DOCUMENT.md. Do not replace the existing PixiJS shell card. Decompose named systems and mechanics into self-contained cards with proof expectations.",
            },
            {
              question: "Existing board cards to avoid duplicating",
              answer: "1. Create the PixiJS game shell (needs_clarification, phase Foundation)",
            },
          ],
        },
        onProgress: (event) => progress.push(event.stage),
        onProgressiveRecords: (batch) => batches.push(batch.records.length),
      });

      const serialized = JSON.stringify(result.draft).toLowerCase();
      const proofCardCount = result.draft.cards.filter(
        (card) => card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length > 0,
      ).length;

      expect(progress[0]).toBe("model_request");
      expect(progress).toContain("model_response");
      expect(progress).toContain("schema_validation");
      expect(batches.some((count) => count > 0)).toBe(true);
      expect(result.telemetry.sectionCount).toBeGreaterThan(1);
      expect(result.telemetry.promptCharCount).toBeGreaterThan(15_000);
      expect(result.draft.cards.length).toBeGreaterThanOrEqual(5);
      expect(proofCardCount).toBe(result.draft.cards.length);
      expect(serialized).toContain("last vector");
      expect(serialized).toMatch(/pixi|matter|howler|shield|weapon|enemy|boss|mission|movement|newtonian/);
      expect(result.draft.cards.map((card) => card.title)).not.toContain("Create the PixiJS game shell");
    },
    420_000,
  );

  liveIt(
    "elaborates a newly added starship feature doc without duplicating existing board cards",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const progress: string[] = [];
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        apiKey,
      });

      const featureDoc = [
        "# Spectral Cartography Contracts",
        "",
        "Add an optional mission loop where the pilot accepts comet-lane survey contracts from a cartography board.",
        "The player fires a scan ping to reveal spectral beacon echoes, route-risk overlays, and hidden salvage pockets.",
        "Each contract grades the route by drift stability, shield exposure, and enemy patrol density.",
        "The first implementation should create the mission board data model, scan-ping state transition, HUD route-risk overlay, and proof that the loop can be tested without a full art pass.",
      ].join("\n");

      const result = await provider.synthesizeWithTelemetry({
        projectName: "testStarshipGame",
        sources: [
          {
            id: "source-spectral-cartography",
            kind: "functional_spec",
            title: "Spectral Cartography Contracts",
            summary:
              "New feature doc for comet-lane survey contracts, scan pings, spectral beacon echoes, route-risk overlays, and hidden salvage pockets.",
            excerpt: featureDoc,
            path: "docs/spectral-cartography-contracts.md",
            relevance: 99,
          },
        ],
        refinement: {
          previousDraft: {
            summary: "Existing starship board.",
            goal: "Complete the MVP slice of THE LAST VECTOR.",
            currentState: "The shell and primary movement cards already exist.",
            targetUser: "Browser action RPG player.",
            qualityBar: "Cards need concrete acceptance criteria and proof expectations.",
            assumptions: ["The selected feature doc is newly added and should be elaborated additively."],
            questions: [],
            sourceNotes: ["Existing board contains shell and controls cards."],
            cards: [
              {
                sourceId: "synthesis:pixijs-game-shell",
                title: "Create the PixiJS game shell",
                description: "Existing foundation card for app boot, render loop, and nonblank scene.",
                candidateStatus: "needs_clarification",
                priority: 1,
                phase: "Foundation",
                labels: ["pixijs", "foundation"],
                blockedBy: [],
                acceptanceCriteria: ["Canvas mounts and renders a visible scene."],
                testPlan: { unit: [], integration: ["Run the app."], visual: ["Capture a visible scene."], manual: [] },
                sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
              },
              {
                sourceId: "synthesis:sylvian-ship-controls",
                title: "Implement Sylvian ship with hybrid Newtonian controls",
                description: "Existing card for player ship movement.",
                candidateStatus: "needs_clarification",
                priority: 2,
                phase: "Core Gameplay",
                labels: ["movement"],
                blockedBy: ["synthesis:pixijs-game-shell"],
                acceptanceCriteria: ["Keyboard input applies thrust to the ship."],
                testPlan: { unit: ["Test movement reducer."], integration: [], visual: [], manual: ["Play one movement pass."] },
                sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
              },
            ],
          },
          answers: [
            {
              question: "Add Cards source scope",
              answer:
                "Elaborate only docs/spectral-cartography-contracts.md. This is a newly added feature document. Produce 2-4 additive cards for the mission board, scan ping, route-risk HUD, and proof path. Do not duplicate shell or movement cards.",
            },
            {
              question: "Existing board cards to avoid duplicating",
              answer:
                "1. Create the PixiJS game shell (needs_clarification, phase Foundation)\n2. Implement Sylvian ship with hybrid Newtonian controls (needs_clarification, phase Core Gameplay)",
            },
          ],
        },
        onProgress: (event) => progress.push(event.stage),
      });

      const titles = result.draft.cards.map((card) => card.title);
      const serialized = JSON.stringify(result.draft).toLowerCase();

      expect(progress).toContain("model_response");
      expect(progress).toContain("schema_validation");
      expect(result.telemetry.responseCharCount).toBeGreaterThan(500);
      expect(result.draft.cards.length).toBeGreaterThanOrEqual(2);
      expect(result.draft.cards.length).toBeLessThanOrEqual(5);
      expect(titles).not.toContain("Create the PixiJS game shell");
      expect(titles).not.toContain("Implement Sylvian ship with hybrid Newtonian controls");
      expect(
        result.draft.cards.every((card) => card.sourceRefs.some((ref) => /spectral|cartograph|contracts/i.test(ref))),
      ).toBe(true);
      expect(
        result.draft.cards.every(
          (card) => card.acceptanceCriteria.length > 0 && card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length > 0,
        ),
      ).toBe(true);
      expect(serialized).toMatch(/cartograph|scan ping|spectral|route-risk|beacon|contract/);
    },
    180_000,
  );

  liveIt(
    "keeps repeated starship Add Cards runs from recreating near-duplicate cartography cards",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        apiKey,
      });
      const featureDoc = [
        "# Spectral Cartography Contracts",
        "",
        "Add an optional mission loop where the pilot accepts comet-lane survey contracts from a cartography board.",
        "The player fires a scan ping to reveal spectral beacon echoes, route-risk overlays, and hidden salvage pockets.",
        "Each contract grades the route by drift stability, shield exposure, and enemy patrol density.",
        "This repeated Add Cards pass should add scan-ping, route-risk, and salvage-pocket follow-up cards without recreating the existing cartography contract board.",
      ].join("\n");

      const result = await provider.synthesizeWithTelemetry({
        projectName: "testStarshipGame",
        sources: [
          {
            id: "source-spectral-cartography",
            kind: "functional_spec",
            title: "Spectral Cartography Contracts",
            summary:
              "Feature doc for comet-lane survey contracts, scan pings, spectral beacon echoes, route-risk overlays, and hidden salvage pockets.",
            excerpt: featureDoc,
            path: "docs/spectral-cartography-contracts.md",
            relevance: 99,
          },
        ],
        refinement: {
          previousDraft: {
            summary: "Existing starship board.",
            goal: "Complete the MVP slice of THE LAST VECTOR.",
            currentState: "The cartography contract-board card already exists from a previous Add Cards run.",
            targetUser: "Browser action RPG player.",
            qualityBar: "Cards need concrete acceptance criteria and proof expectations.",
            assumptions: ["This is a repeated Add Cards pass over the same feature doc."],
            questions: [],
            sourceNotes: ["Existing board already contains the cartography mission-board card."],
            cards: [
              {
                sourceId: "synthesis:spectral-cartography-board",
                title: "Build spectral cartography contract board",
                description: "Create the mission board data model for comet-lane survey contracts.",
                candidateStatus: "needs_clarification",
                priority: 3,
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
            {
              question: "Add Cards source scope",
              answer:
                "This is a repeated additive Add Cards pass for docs/spectral-cartography-contracts.md. Do not recreate or rename the existing cartography contract-board card. Produce 2-3 self-contained follow-up cards for scan ping, route-risk HUD, and hidden salvage pockets.",
            },
            {
              question: "Existing board cards to avoid duplicating",
              answer: "1. Build spectral cartography contract board (needs_clarification, phase Spectral Cartography)",
            },
          ],
        },
      });

      const titles = result.draft.cards.map((card) => card.title.toLowerCase());
      const serialized = JSON.stringify(result.draft).toLowerCase();

      expect(result.draft.cards.length).toBeGreaterThanOrEqual(1);
      expect(titles).not.toContain("build spectral cartography contract board");
      expect(serialized).toMatch(/scan|route|risk|salvage|beacon|echo/);
      expect(
        result.draft.cards.every((card) => card.acceptanceCriteria.length > 0 && card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length > 0),
      ).toBe(true);
    },
    180_000,
  );

  liveIt(
    "uses live Pi session transport for repeated planner card batches",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const workspaceRoot = mkdtempSync(join(process.env.TMPDIR || "/tmp", "ambient-planner-batch-live-"));
      try {
        const sources: ProjectBoardSynthesisSource[] = [
          {
            id: "source-shell",
            kind: "architecture_artifact",
            title: "Tiny App Shell",
            summary: "Create a browser app shell with one visible status panel and a minimal test path.",
            path: "docs/shell.md",
            relevance: 95,
          },
          {
            id: "source-interaction",
            kind: "functional_spec",
            title: "Dismiss Interaction",
            summary: "Add a dismiss button to status banners and preserve accessibility labels plus keyboard focus behavior.",
            path: "docs/interaction.md",
            relevance: 92,
          },
        ];
        const workspace = await createProjectBoardPlannerWorkspace({
          projectPath: workspaceRoot,
          boardId: "board-live-pi-session",
          runId: "run-live-pi-session",
          projectName: "Live Planner Batch Fixture",
          operation: "board_synthesis",
          sources,
        });
        const progressTransportModes: unknown[] = [];
        const batches: number[] = [];
        const provider = new AmbientProjectBoardSynthesisProvider({
          model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
          apiKey,
          reasoning: { effort: "minimal", enabled: true, exclude: true },
        });

        const result = await provider.synthesizePlannerBatchesWithTelemetry({
          projectName: "Live Planner Batch Fixture",
          sources,
          plannerWorkspace: workspace,
          maxBatches: 2,
          maxCardsPerBatch: 2,
          onProgress: (event) => progressTransportModes.push(event.metadata.transportMode),
          onProgressiveRecords: (batch) => batches.push(batch.records.length),
        });

        const sessionDescriptor = JSON.parse(readFileSync(workspace.sessionPath, "utf8")) as Record<string, unknown>;
        const aggregateJsonl = readFileSync(workspace.aggregateJsonlPath, "utf8");
        expect(sessionDescriptor).toMatchObject({
          sessionId: workspace.sessionId,
          executionMode: "pi_session_stream",
          compatibilityFallback: "direct_chat_compat",
        });
        expect(progressTransportModes).toContain("pi_session_stream");
        expect(batches.some((count) => count > 0)).toBe(true);
        expect(result.telemetry.plannerBatchCount).toBeGreaterThanOrEqual(1);
        expect(result.draft.cards.length).toBeGreaterThanOrEqual(1);
        expect(result.progressiveRecords?.some((record) => record.type === "candidate_card")).toBe(true);
        expect(aggregateJsonl).toContain("\"candidate_card\"");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    },
    240_000,
  );

  budgetMatrixIt(
    "records a live Ambient/Pi planner budget matrix for small, medium, and large fixtures",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const model = process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8";
      const startedAt = new Date();
      const scenarios = [];

      for (const size of ["small", "medium", "large"] as const) {
        const workspaceRoot = mkdtempSync(join(process.env.TMPDIR || "/tmp", `ambient-budget-matrix-${size}-`));
        try {
          const sources = budgetMatrixSources(size);
          const workspace = await createProjectBoardPlannerWorkspace({
            projectPath: workspaceRoot,
            boardId: `board-budget-${size}`,
            runId: `run-budget-${size}`,
            projectName: `Budget Matrix ${size}`,
            operation: "board_synthesis",
            sources,
          });
          const progress: Array<{ stage: string; metadata: Record<string, unknown> }> = [];
          const provider = new AmbientProjectBoardSynthesisProvider({
            model,
            apiKey,
            reasoning: { effort: "minimal", enabled: true, exclude: true },
          });
          const result = await provider.synthesizePlannerBatchesWithTelemetry({
            projectName: `Budget Matrix ${size}`,
            sources,
            plannerWorkspace: workspace,
            maxBatches: 1,
            maxCardsPerBatch: 2,
            onProgress: (event) => progress.push({ stage: event.stage, metadata: event.metadata }),
          });
          scenarios.push({
            size,
            sourceCount: sources.length,
            promptCharCount: result.telemetry.promptCharCount,
            responseCharCount: result.telemetry.responseCharCount,
            cardCount: result.draft.cards.length,
            questionCount: result.draft.questions.length,
            plannerBatchCount: result.telemetry.plannerBatchCount,
            outputTokenBudget: result.telemetry.outputTokenBudget,
            modelBudgetProfile: result.telemetry.modelBudgetProfile,
            promptBudgetStatus: result.telemetry.promptBudgetStatus,
            promptBudgetWarningCount: result.telemetry.promptBudgetWarningCount,
            maxPromptBudgetUtilization: result.telemetry.maxPromptBudgetUtilization,
            lastPromptBudgetAssessment: result.telemetry.lastPromptBudgetAssessment,
            progressRequestBudget: progress.find((event) => event.stage === "model_request")?.metadata.promptBudgetAssessment,
            progressiveRecordCount: result.progressiveRecords?.length ?? 0,
          });
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }

      const report = {
        generatedAt: new Date().toISOString(),
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        model,
        scenarioCount: scenarios.length,
        purpose:
          "Planner-card-batch budget calibration. Each row is one live Pi planner-session batch with the same output budget and increasing source/context size.",
        scenarios,
      };
      const outputPath = resolve(
        process.env.AMBIENT_PROJECT_BOARD_BUDGET_MATRIX_OUT ||
          join(dirname(fileURLToPath(import.meta.url)), "../../test-results/project-board-budget-matrix/latest.json"),
      );
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
      console.info(`[project-board-budget-matrix] ${JSON.stringify({ outputPath, scenarioCount: scenarios.length })}`);

      expect(scenarios).toHaveLength(3);
      expect(scenarios.every((scenario) => scenario.cardCount >= 1)).toBe(true);
      expect(scenarios.every((scenario) => scenario.outputTokenBudget === 4_800)).toBe(true);
      expect(scenarios.every((scenario) => scenario.progressRequestBudget)).toBe(true);
    },
    420_000,
  );

  ledgerCompactionIt(
    "compacts a large prior-card ledger before a live Pi planner batch",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const workspaceRoot = mkdtempSync(join(process.env.TMPDIR || "/tmp", "ambient-ledger-compaction-live-"));
      try {
        const sources: ProjectBoardSynthesisSource[] = [
          {
            id: "source-kanban",
            kind: "functional_spec",
            title: "Kanban objective",
            summary:
              "Build a small browser kanban board. The next card should cover one remaining objective without recreating already-rendered setup cards.",
            path: "docs/kanban-objective.md",
            relevance: 96,
          },
        ];
        const workspace = await createProjectBoardPlannerWorkspace({
          projectPath: workspaceRoot,
          boardId: "board-live-ledger-compaction",
          runId: "run-live-ledger-compaction",
          projectName: "Live Ledger Compaction Fixture",
          operation: "board_synthesis",
          sources,
        });
        const priorCards = Array.from({ length: 1_800 }, (_, index) => ({
          type: "candidate_card" as const,
          sourceId: `synthesis:already-rendered-${index}`,
          title: `Already rendered kanban setup card ${index}`,
          description: "Existing rendered card included to force ledger compaction before the next planner request.",
          candidateStatus: "ready_to_create" as const,
          priority: 1,
          phase: "Existing",
          labels: ["kanban", "existing"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: `existing-${index}` }],
          clarificationQuestions: [],
          acceptanceCriteria: ["Existing setup card remains represented."],
          testPlan: { unit: ["Existing proof."], integration: [], visual: [], manual: [] },
        }));
        const progress: AmbientProjectBoardSynthesisProgress[] = [];
        const provider = new AmbientProjectBoardSynthesisProvider({
          model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
          apiKey,
          reasoning: { effort: "minimal", enabled: true, exclude: true },
        });

        const result = await provider.synthesizePlannerBatchesWithTelemetry({
          projectName: "Live Ledger Compaction Fixture",
          sources,
          plannerWorkspace: workspace,
          resumeFromRecords: priorCards,
          maxBatches: 1,
          maxCardsPerBatch: 2,
          onProgress: (event) => progress.push(event),
        });

        const aggregateJsonl = readFileSync(workspace.aggregateJsonlPath, "utf8");
        expect(progress.some((event) => event.title.includes("Compacting planner ledger"))).toBe(true);
        expect(result.telemetry.plannerLedgerCompactionCount).toBe(1);
        expect(result.telemetry.lastPlannerLedgerCompaction?.source).toBe("pi_rlm");
        expect(result.telemetry.lastPlannerLedgerCompaction?.cacheHit).toBe(false);
        expect(result.telemetry.lastPlannerLedgerCompaction?.renderedCardCount).toBe(1_800);
        expect(result.draft.cards.length).toBeGreaterThanOrEqual(1);
        expect(aggregateJsonl).toContain("planner_ledger_compacted");

        const cachedCompactionRecords =
          result.progressiveRecords?.filter((record) => record.type === "progress" && record.stage === "planner_ledger_compacted") ?? [];
        expect(cachedCompactionRecords.length).toBeGreaterThanOrEqual(1);
        const firstCachedCompactionRecord = cachedCompactionRecords[0];
        if (!firstCachedCompactionRecord) throw new Error("Expected a cached planner ledger compaction record.");
        const replayWorkspace = await createProjectBoardPlannerWorkspace({
          projectPath: workspaceRoot,
          boardId: "board-live-ledger-compaction",
          runId: "run-live-ledger-compaction-replay",
          projectName: "Live Ledger Compaction Fixture",
          operation: "board_synthesis",
          sources,
        });
        const replayProgress: AmbientProjectBoardSynthesisProgress[] = [];
        const replayResult = await provider.synthesizePlannerBatchesWithTelemetry({
          projectName: "Live Ledger Compaction Fixture",
          sources,
          plannerWorkspace: replayWorkspace,
          resumeFromRecords: [...priorCards, firstCachedCompactionRecord],
          maxBatches: 1,
          maxCardsPerBatch: 2,
          onProgress: (event) => replayProgress.push(event),
        });

        expect(replayProgress.some((event) => event.title.includes("Compacting planner ledger"))).toBe(false);
        expect(replayProgress.some((event) => event.title.includes("Reused cached planner ledger compaction"))).toBe(true);
        expect(replayResult.telemetry.plannerLedgerCompactionCacheHitCount).toBe(1);
        expect(replayResult.telemetry.lastPlannerLedgerCompaction?.cacheHit).toBe(true);
        expect(replayResult.draft.cards.length).toBeGreaterThanOrEqual(1);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    },
    420_000,
  );

  liveIt(
    "executes a live Pi planner source-search tool call through the workspace runtime",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const workspaceRoot = mkdtempSync(join(process.env.TMPDIR || "/tmp", "ambient-planner-tool-live-"));
      try {
        const workspace = await createProjectBoardPlannerWorkspace({
          projectPath: workspaceRoot,
          boardId: "board-live-planner-tool",
          runId: "run-live-planner-tool",
          projectName: "Live Planner Tool Fixture",
          operation: "board_synthesis",
          sources: [
            {
              id: "source-interaction",
              kind: "functional_spec",
              title: "Dismiss Interaction",
              summary: "Status banners need accessible dismiss behavior.",
              excerpt:
                "The dismiss button must preserve screen-reader labels and include a focus trap escape hatch so keyboard users are not stranded inside banner controls.",
              path: "docs/interaction.md",
              relevance: 95,
            },
          ],
        });
        const runtime = projectBoardPlannerWorkspaceToolExecutor(workspace);
        const progress: string[] = [];

        const text = await callWorkflowPiText({
          apiKey,
          model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
          prompt:
            "Call planner_source_search exactly once with query `focus trap` and sourceIds [`source-interaction`]. Then return JSON only with shape {\"usedTool\":\"planner_source_search\",\"found\":true}.",
          responseFormat: { type: "json_object" },
          sessionId: workspace.sessionId,
          tools: runtime.tools,
          initialToolChoice: { type: "function", function: { name: "planner_source_search" } },
          maxToolRounds: 1,
          executeTool: runtime.execute,
          onToolProgress: (event) => progress.push(`${event.toolName}:${event.status}`),
        });

        expect(progress).toContain("planner_source_search:done");
        expect(JSON.parse(text)).toMatchObject({ usedTool: "planner_source_search", found: true });
        expect(readFileSync(workspace.aggregateJsonlPath, "utf8")).toContain("planner_source_search");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    },
    120_000,
  );

  liveIt(
    "executes live Pi/RLM planner source QA and reuses the cached answer on retry",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const workspaceRoot = mkdtempSync(join(process.env.TMPDIR || "/tmp", "ambient-planner-qa-live-"));
      try {
        const model = process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8";
        const workspace = await createProjectBoardPlannerWorkspace({
          projectPath: workspaceRoot,
          boardId: "board-live-planner-qa",
          runId: "run-live-planner-qa",
          projectName: "Live Planner QA Fixture",
          operation: "board_synthesis",
          sources: [
            {
              id: "source-interaction",
              kind: "functional_spec",
              title: "Dismiss Interaction",
              summary: "Status banners need accessible dismiss behavior.",
              excerpt:
                "The dismiss button must preserve screen-reader labels and include a focus trap escape hatch so keyboard users are not stranded inside banner controls.",
              path: "docs/interaction.md",
              relevance: 95,
            },
          ],
        });
        let qaAnswererCalls = 0;
        const runtime = projectBoardPlannerWorkspaceToolExecutor(workspace, {
          sourceQaAnswerer: async (input) => {
            qaAnswererCalls += 1;
            const answerText = await callWorkflowPiText({
              apiKey,
              model,
              systemPrompt:
                "Answer only from the supplied evidence snippets. Return JSON only with answer, confidence, and needs_user_decision.",
              prompt: JSON.stringify({
                question: input.question,
                needsUserDecisionHint: input.needsUserDecisionHint,
                evidence: input.citedSnippets,
              }),
              responseFormat: { type: "json_object" },
              sessionId: `${workspace.sessionId}:source-qa-answerer`,
              reasoning: false,
              maxTokens: 800,
            });
            const parsed = parseProjectBoardSynthesisJson(answerText) as { answer?: string; confidence?: number; needs_user_decision?: boolean };
            return {
              answer: parsed.answer ?? "The evidence did not produce a usable answer.",
              confidence: parsed.confidence,
              needs_user_decision: parsed.needs_user_decision,
            };
          },
        });
        const progress: string[] = [];

        const text = await callWorkflowPiText({
          apiKey,
          model,
          prompt:
            "Call planner_source_qa exactly once with question `What accessibility behavior is required for the dismiss button?` and sourceIds [`source-interaction`]. Then return JSON only with shape {\"usedTool\":\"planner_source_qa\",\"answered\":true}.",
          responseFormat: { type: "json_object" },
          sessionId: workspace.sessionId,
          tools: runtime.tools,
          initialToolChoice: { type: "function", function: { name: "planner_source_qa" } },
          maxToolRounds: 1,
          executeTool: runtime.execute,
          onToolProgress: (event) => progress.push(`${event.toolName}:${event.status}`),
        });

        expect(progress).toContain("planner_source_qa:done");
        expect(JSON.parse(text)).toMatchObject({ usedTool: "planner_source_qa", answered: true });
        expect(qaAnswererCalls).toBeGreaterThanOrEqual(1);
        const replayArgs = {
          question: "What accessibility behavior is required for the dismiss button?",
          sourceIds: ["source-interaction"],
        };
        const seeded = JSON.parse(
          (
            await runtime.execute(
              { type: "toolCall", id: "tool-source-qa-seed", name: "planner_source_qa", arguments: {} },
              replayArgs,
            )
          ).text,
        ) as { answerSource: string; cacheHit: boolean };
        expect(["pi_rlm", "cache"]).toContain(seeded.answerSource);
        const callsAfterSeed = qaAnswererCalls;
        const replay = JSON.parse(
          (
            await runtime.execute(
              { type: "toolCall", id: "tool-source-qa-replay", name: "planner_source_qa", arguments: {} },
              replayArgs,
            )
          ).text,
        ) as { answerSource: string; cacheHit: boolean };
        expect(replay).toMatchObject({ answerSource: "cache", cacheHit: true });
        expect(qaAnswererCalls).toBe(callsAfterSeed);
        expect(readFileSync(workspace.aggregateJsonlPath, "utf8")).toContain("planner_source_qa");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    },
    180_000,
  );

  objectiveElaborationIt(
    "elaborates objective-driven Add Cards from a live Pi planner batch",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const workspaceRoot = mkdtempSync(join(process.env.TMPDIR || "/tmp", "ambient-objective-add-cards-live-"));
      try {
        const sources: ProjectBoardSynthesisSource[] = [
          {
            id: "source-kanban-accessibility",
            kind: "functional_spec",
            title: "Kanban accessibility follow-up notes",
            summary:
              "The browser kanban board already supports columns, persisted cards, and pointer drag. Remaining product objective: add keyboard-accessible card movement and swimlane filtering without recreating existing board setup cards.",
            path: "docs/kanban-accessibility.md",
            relevance: 98,
          },
        ];
        const workspace = await createProjectBoardPlannerWorkspace({
          projectPath: workspaceRoot,
          boardId: "board-live-objective-add-cards",
          runId: "run-live-objective-add-cards",
          projectName: "Live Objective Add Cards Fixture",
          operation: "source_elaboration",
          sources,
        });
        const provider = new AmbientProjectBoardSynthesisProvider({
          model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
          apiKey,
          reasoning: { effort: "minimal", enabled: true, exclude: true },
        });
        const result = await provider.synthesizePlannerBatchesWithTelemetry({
          projectName: "Live Objective Add Cards Fixture",
          sources,
          plannerWorkspace: workspace,
          maxBatches: 1,
          maxCardsPerBatch: 2,
          refinement: {
            previousDraft: {
              summary: "Existing browser kanban board.",
              goal: "Build a small browser kanban board.",
              currentState: "Columns, card persistence, and pointer drag already exist.",
              targetUser: "Product team member managing local tasks.",
              qualityBar: "Cards need acceptance criteria and proof expectations.",
              assumptions: [],
              questions: [],
              sourceNotes: ["Existing board setup is already represented."],
              cards: [
                {
                  sourceId: "synthesis:kanban-board-shell",
                  title: "Build the basic kanban board shell",
                  description: "Existing board shell card.",
                  candidateStatus: "ready_to_create",
                  priority: 1,
                  phase: "Foundation",
                  labels: ["kanban"],
                  blockedBy: [],
                  acceptanceCriteria: ["Columns render."],
                  testPlan: { unit: ["Column model test."], integration: [], visual: [], manual: [] },
                  sourceRefs: ["docs/kanban-accessibility.md"],
                },
              ],
            },
            answers: [
              {
                question: "Add Cards objective",
                answer:
                  "Generate net-new candidate cards for keyboard-accessible card movement and swimlane filtering. Do not replace existing board cards.",
              },
              {
                question: "Add Cards source context",
                answer:
                  "Use docs/kanban-accessibility.md as grounding evidence for this objective and avoid recreating the basic board shell.",
              },
              {
                question: "Existing board cards to avoid duplicating",
                answer: "1. Build the basic kanban board shell (ready_to_create, phase Foundation)",
              },
            ],
          },
        });

        const text = JSON.stringify(result.draft).toLowerCase();
        expect(result.draft.cards.length).toBeGreaterThanOrEqual(1);
        expect(result.draft.cards.map((card) => card.title)).not.toContain("Build the basic kanban board shell");
        expect(text).toMatch(/keyboard|swimlane|filter|accessib/);
        expect(result.telemetry.plannerBatchCount).toBeGreaterThanOrEqual(1);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    },
    180_000,
  );

  liveIt(
    "sectioned planning imports progressive records from the actual Last Vector design document",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const designDocPath = "/Users/Neo/Documents/testStarshipGame/GAME_DESIGN_DOCUMENT.md";
      expect(existsSync(designDocPath)).toBe(true);
      const designDoc = readFileSync(designDocPath, "utf8");
      const progress: string[] = [];
      const batches: number[] = [];
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        apiKey,
      });

      const result = await provider.synthesizeSectionedWithTelemetry({
        projectName: "testStarshipGame",
        sectioning: { maxSectionChars: 9_000, minSectionChars: 2_000, maxSections: 4 },
        sources: [
          {
            id: "source-last-vector-gdd",
            kind: "functional_spec",
            title: "THE LAST VECTOR - Game Design Document",
            summary:
              "Authoritative game design document for a browser space fantasy action RPG with PixiJS, Matter.js, Howler.js, movement, shields, weapons, enemy factions, bosses, environments, progression, and proof needs.",
            excerpt: designDoc,
            path: "GAME_DESIGN_DOCUMENT.md",
            relevance: 99,
          },
        ],
        onProgress: (event) => progress.push(`${event.stage}:${event.title}`),
        onProgressiveRecords: (batch) => batches.push(batch.records.length),
      });

      expect(result.telemetry.sectionCount).toBeGreaterThan(1);
      expect(batches.length).toBe(result.telemetry.sectionCount);
      expect(batches.some((count) => count > 0)).toBe(true);
      expect(progress.filter((event) => event.startsWith("schema_validation:Validated section")).length).toBe(result.telemetry.sectionCount);
      expect(result.draft.cards.length).toBeGreaterThanOrEqual(3);
      expect(result.progressiveRecords?.some((record) => record.type === "source_coverage")).toBe(true);
      expect(JSON.stringify(result.draft).toLowerCase()).toMatch(/pixi|matter|howler|shield|weapon|enemy|movement|newtonian/);
    },
    420_000,
  );

  liveIt(
    "compares sectioned planning quality with normal and capped reasoning on the actual Last Vector design document",
    async () => {
      const apiKey = readLiveAmbientApiKey();
      const designDocPath = "/Users/Neo/Documents/testStarshipGame/GAME_DESIGN_DOCUMENT.md";
      expect(existsSync(designDocPath)).toBe(true);
      const designDoc = readFileSync(designDocPath, "utf8");
      const sources: ProjectBoardSynthesisSource[] = [
        {
          id: "source-last-vector-gdd",
          kind: "functional_spec",
          title: "THE LAST VECTOR - Game Design Document",
          summary:
            "Authoritative game design document for a browser space fantasy action RPG with PixiJS, Matter.js, Howler.js, movement, shields, weapons, enemy factions, bosses, environments, progression, and proof needs.",
          excerpt: designDoc,
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 99,
        },
      ];

      const normal = await runSectionedPlanningVariant({ apiKey, sources, reasoning: undefined });
      const cappedReasoning = await runSectionedPlanningVariant({
        apiKey,
        sources,
        reasoning: { effort: "low", max_tokens: 750, exclude: true, enabled: true },
      });
      const report = {
        fixture: designDocPath,
        model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
        generatedAt: new Date().toISOString(),
        normal,
        cappedReasoning,
        judgment:
          cappedReasoning.cardCount >= 2 && cappedReasoning.proofCardCount === cappedReasoning.cardCount && cappedReasoning.domainTermCount >= 2
            ? "Capped low-effort reasoning remained grounded enough for continued dogfood as an experimental planning accelerator."
            : "Capped low-effort reasoning was too shallow or under-grounded for default use.",
      };
      const outputPath = resolve(
        process.env.AMBIENT_PROJECT_BOARD_PROVIDER_AB_OUT ||
          join(dirname(fileURLToPath(import.meta.url)), "../../test-results/project-board-live-synthesis/latest-sectioned-ab.json"),
      );
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
      console.info(
        `[project-board-live-ab] ${JSON.stringify({
          outputPath,
          normal: { cardCount: normal.cardCount, timeToFirstBatchMs: normal.timeToFirstBatchMs, durationMs: normal.durationMs, domainTermCount: normal.domainTermCount },
          cappedReasoning: {
            cardCount: cappedReasoning.cardCount,
            timeToFirstBatchMs: cappedReasoning.timeToFirstBatchMs,
            durationMs: cappedReasoning.durationMs,
            domainTermCount: cappedReasoning.domainTermCount,
          },
          judgment: report.judgment,
        })}`,
      );

      expect(normal.cardCount).toBeGreaterThanOrEqual(2);
      expect(cappedReasoning.cardCount).toBeGreaterThanOrEqual(2);
      expect(normal.batchCount).toBeGreaterThan(0);
      expect(cappedReasoning.batchCount).toBeGreaterThan(0);
      expect(normal.proofCardCount).toBe(normal.cardCount);
      expect(cappedReasoning.proofCardCount).toBe(cappedReasoning.cardCount);
      expect(normal.domainTermCount).toBeGreaterThanOrEqual(2);
      expect(cappedReasoning.domainTermCount).toBeGreaterThanOrEqual(2);
      expect(cappedReasoning.timeToFirstBatchMs).toBeGreaterThan(0);
    },
    720_000,
  );
});

async function runSectionedPlanningVariant(input: {
  apiKey: string;
  sources: ProjectBoardSynthesisSource[];
  reasoning?: ConstructorParameters<typeof AmbientProjectBoardSynthesisProvider>[0]["reasoning"];
}): Promise<{
  reasoning: "normal" | "capped" | "none";
  cardCount: number;
  proofCardCount: number;
  questionCount: number;
  batchCount: number;
  timeToFirstBatchMs: number;
  durationMs: number;
  promptCharCount: number;
  responseCharCount: number;
  domainTermCount: number;
  titles: string[];
}> {
  const startedAt = Date.now();
  let firstBatchAt: number | undefined;
  let batchCount = 0;
  const provider = new AmbientProjectBoardSynthesisProvider({
    model: process.env.AMBIENT_PROJECT_BOARD_MODEL || process.env.AMBIENT_LIVE_MODEL || "zai-org/GLM-5.1-FP8",
    apiKey: input.apiKey,
    reasoning: input.reasoning,
  });
  const result = await provider.synthesizeSectionedWithTelemetry({
    projectName: "testStarshipGame",
    sectioning: { maxSectionChars: 6_000, minSectionChars: 2_000, maxSections: 2 },
    maxCardsPerSection: 3,
    sources: input.sources,
    onProgressiveRecords: () => {
      batchCount += 1;
      firstBatchAt ??= Date.now();
    },
  });
  const serialized = JSON.stringify(result.draft).toLowerCase();
  const domainTerms = ["pixi", "matter", "howler", "shield", "weapon", "enemy", "boss", "movement", "newtonian"];
  return {
    reasoning: input.reasoning === false ? "none" : input.reasoning ? "capped" : "normal",
    cardCount: result.draft.cards.length,
    proofCardCount: result.draft.cards.filter(
      (card) => card.acceptanceCriteria.length > 0 && card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length > 0,
    ).length,
    questionCount: result.draft.questions.length,
    batchCount,
    timeToFirstBatchMs: firstBatchAt ? firstBatchAt - startedAt : 0,
    durationMs: Date.now() - startedAt,
    promptCharCount: result.telemetry.promptCharCount,
    responseCharCount: result.telemetry.responseCharCount,
    domainTermCount: domainTerms.filter((term) => serialized.includes(term)).length,
    titles: result.draft.cards.map((card) => card.title),
  };
}

function budgetMatrixSources(size: "small" | "medium" | "large"): ProjectBoardSynthesisSource[] {
  const sourceCount = size === "small" ? 2 : size === "medium" ? 6 : 12;
  const detailRepeats = size === "small" ? 1 : size === "medium" ? 3 : 7;
  return Array.from({ length: sourceCount }, (_, index) => {
    const topic = [
      "project shell",
      "state model",
      "drag interaction",
      "keyboard accessibility",
      "persistence layer",
      "visual regression proof",
      "offline recovery",
      "board filters",
      "search indexing",
      "error toasts",
      "import export",
      "handoff notes",
    ][index];
    return {
      id: `source-${size}-${index + 1}`,
      kind: index % 3 === 0 ? "functional_spec" : index % 3 === 1 ? "architecture_artifact" : "implementation_plan",
      title: `Budget ${size} ${topic}`,
      summary: `Plan the ${topic} slice for a browser kanban board with durable proof expectations and restartable implementation cards.`,
      excerpt: Array.from({ length: detailRepeats }, (_, repeatIndex) =>
        [
          `Detail ${repeatIndex + 1}: ${topic} requires a self-contained card with observable acceptance criteria.`,
          "The implementation should preserve keyboard usability, visual smoke coverage, unit-testable state transitions, and clear dependency ordering.",
          "If the current batch cannot responsibly plan this source, the planner should mark coverage partial and continue in a later small card batch.",
        ].join(" "),
      ).join("\n"),
      path: `docs/budget-${size}-${index + 1}.md`,
      relevance: 95 - index,
    } satisfies ProjectBoardSynthesisSource;
  });
}

function readLiveAmbientApiKey(): string {
  return readLiveAmbientProviderApiKey({ purpose: "live project board synthesis" });
}
