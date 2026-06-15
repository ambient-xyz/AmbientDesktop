import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import { AmbientProjectBoardCharterSummaryProvider } from "./projectBoardCharterSummaryProvider";
import type { ProjectBoardCharter, ProjectBoardCharterProjectSummary, ProjectBoardSource } from "../shared/types";

const runLive = process.env.AMBIENT_PROJECT_BOARD_CHARTER_SUMMARY_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardCharterSummaryProvider live", () => {
  liveIt(
    "generates a compact charter project summary from source scan context",
    async () => {
      const provider = new AmbientProjectBoardCharterSummaryProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board charter summary" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });

      const result = await provider.summarize({
        projectName: "Ambient Recoverability Work",
        charter: charterFixture(),
        sources: sourceFixtures(),
        fallbackSummary: fallbackSummaryFixture(),
        generatedAt: "2026-05-11T12:00:00.000Z",
      });

      expect(result.summary.generator).toBe("ambient_rlm");
      expect(result.summary.summary.length).toBeGreaterThan(60);
      expect(result.summary.majorSystems.length).toBeGreaterThan(0);
      expect(result.summary.sourceCoverage.length).toBeGreaterThan(0);
      expect(result.summary.sourceChecksumSet).toEqual(["hash-plan", "hash-v3"]);
      expect(result.summary.charterAnswerChecksum).toBe("charter-checksum");
      expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(100);
    },
    liveProfile.testTimeoutMs,
  );
});

function charterFixture(): ProjectBoardCharter {
  return {
    id: "charter-live",
    boardId: "board-live",
    version: 1,
    status: "active",
    goal: "Upgrade Ambient project-board planning and synthesis so long Pi runs are restartable, grounded, and visible.",
    currentState: "The project already has progressive board records, source classification, planner workspaces, and PM Review proposals.",
    targetUser: "Developers using Ambient Desktop to turn large source sets into implementation boards.",
    nonGoals: ["Do not build a second hidden planner architecture."],
    qualityBar: "Use structured contracts, preserve source provenance, and validate with live Ambient/Pi behavior.",
    testPolicy: { default: "deterministic tests plus live Ambient/Pi smoke" },
    decisionPolicy: { defaultPolicy: "Return unresolved decisions rather than inventing user preferences." },
    dependencyPolicy: { default: "Make dependencies and blockers explicit." },
    budgetPolicy: { default: "Prefer small recoverable batches over giant model outputs." },
    sourcePolicy: { policy: "Use the active charter and recent source scan as the grounding boundary." },
    markdown: "# Charter\n\nMake planning and board synthesis recoverable.",
    projectSummary: fallbackSummaryFixture(),
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
  };
}

function fallbackSummaryFixture(): ProjectBoardCharterProjectSummary {
  return {
    summary:
      "Ambient needs durable project-board planning context that gives planner and card sessions the shape of the project without replaying every source.",
    majorSystems: ["Planner workspace", "Board artifact projection", "PM Review", "Charter project summary"],
    sourceCoverage: ["recoverabilityWork.html defines the target implementation plan."],
    risks: ["Long model outputs may hit output limits or context drift."],
    dependencyHints: ["Charter summaries should refresh after source classification and before synthesis prompts."],
    unresolvedDecisions: [],
    citations: ["recoverabilityWork.html"],
    coverageGaps: ["Tool-enabled Pi planner sessions are planned but not complete."],
    sourceChecksumSet: ["hash-plan", "hash-v3"],
    charterAnswerChecksum: "charter-checksum",
    generatedAt: "2026-05-11T00:00:00.000Z",
    generator: "fallback_heuristic",
  };
}

function sourceFixtures(): ProjectBoardSource[] {
  return [
    {
      id: "source-plan",
      boardId: "board-live",
      kind: "implementation_plan",
      sourceKey: "file:recoverabilityWork.html",
      contentHash: "hash-plan",
      changeState: "new",
      title: "recoverabilityWork.html",
      summary:
        "Plan document describing Pi-only planner sessions, card-level checkpoints, RLM summaries, objective-driven Add Cards, Git adoption, and output-cap recovery.",
      excerpt:
        "Phase 3 adds an RLM-generated project summary to the active charter. Every planner/card session should have access to the active charter and project summary. The summary refreshes when source checksums or authoritative charter answers change.",
      path: "recoverabilityWork.html",
      classificationReason: "Implementation plan.",
      classifiedBy: "fallback_heuristic",
      classificationConfidence: 0.8,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 96,
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    },
    {
      id: "source-v3",
      boardId: "board-live",
      kind: "implementation_plan",
      sourceKey: "file:kanbanImplementationPhasesV3.md",
      contentHash: "hash-v3",
      changeState: "unchanged",
      title: "kanbanImplementationPhasesV3.md",
      summary:
        "V3 implementation notes establishing that progressive records, recovery markers, source coverage, and card sessions already exist.",
      excerpt:
        "The remaining work is hardening around planner-session synthesis, durable ledgers, visible progress, artifact adoption, and live Pi validation.",
      path: "kanbanImplementationPhasesV3.md",
      classificationReason: "Implementation plan.",
      classifiedBy: "ambient_pi",
      classificationConfidence: 0.91,
      authorityRole: "supporting",
      includeInSynthesis: true,
      relevance: 88,
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    },
  ];
}
