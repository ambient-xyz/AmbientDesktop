import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "../liveAmbientProviderConfig";
import { AmbientProjectBoardKickoffDefaultProvider } from "./projectBoardKickoffDefaultProvider";
import type { ProjectBoardQuestion, ProjectBoardSource } from "../../shared/types";

const runLive = process.env.AMBIENT_PROJECT_BOARD_KICKOFF_DEFAULTS_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardKickoffDefaultProvider live", () => {
  liveIt(
    "suggests editable kickoff defaults from a tiny source scan",
    async () => {
      const provider = new AmbientProjectBoardKickoffDefaultProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board kickoff defaults" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });

      const result = await provider.suggest({
        boardTitle: "Tiny live kickoff defaults board",
        boardSummary: "Create a tiny browser game from a durable source.",
        questions: questionFixtures(),
        sources: sourceFixtures(),
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].questionId).toBe("question-goal");
      expect(result.suggestions[0].suggestedAnswer.length).toBeGreaterThan(20);
      expect(result.suggestions[0].rationale.length).toBeGreaterThan(10);
      expect(["high", "medium", "low"]).toContain(result.suggestions[0].confidence);
      expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(20);
    },
    liveProfile.testTimeoutMs,
  );
});

function questionFixtures(): ProjectBoardQuestion[] {
  const timestamp = "2026-05-18T00:00:00.000Z";
  return [
    {
      id: "question-goal",
      boardId: "board-live",
      question: "What is the primary outcome this project board should optimize for?",
      required: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "question-source-authority",
      boardId: "board-live",
      question: "Which sources should be treated as authoritative if threads and docs disagree?",
      required: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function sourceFixtures(): ProjectBoardSource[] {
  const timestamp = "2026-05-18T00:00:00.000Z";
  return [
    {
      id: "source-live-plan",
      boardId: "board-live",
      kind: "plan_artifact",
      sourceKey: "file:.ambient/board/plans/tiny-asteroids.html",
      contentHash: "hash-live-plan",
      changeState: "new",
      title: "Tiny Asteroids Durable Plan",
      summary: "Build a tiny browser Asteroids game with a canvas loop, keyboard controls, collision checks, and screenshot proof.",
      excerpt: "The durable plan is authoritative. Keep scope to a playable single-screen browser game and require visible canvas proof plus unit checks for collision logic.",
      path: ".ambient/board/plans/tiny-asteroids.html",
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 99,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "source-live-thread",
      boardId: "board-live",
      kind: "thread",
      sourceKey: "thread:tiny-brainstorm",
      title: "Brainstorm thread",
      summary: "Optional thread with particle polish ideas that should not override the durable plan.",
      threadId: "tiny-brainstorm",
      authorityRole: "ignored",
      includeInSynthesis: false,
      relevance: 35,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}
