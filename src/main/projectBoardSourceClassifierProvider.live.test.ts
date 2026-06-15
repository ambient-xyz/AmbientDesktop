import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import { AmbientProjectBoardSourceClassifierProvider } from "./projectBoardSourceClassifierProvider";
import type { ProjectBoardSource } from "../shared/types";

const runLive = process.env.AMBIENT_PROJECT_BOARD_SOURCE_CLASSIFIER_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardSourceClassifierProvider live", () => {
  liveIt(
    "classifies a game design document as an authoritative product source",
    async () => {
      const provider = new AmbientProjectBoardSourceClassifierProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board source classifier" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });
      const sources: ProjectBoardSource[] = [
        {
          id: "source-gdd",
          boardId: "board-live",
          kind: "markdown",
          sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
          contentHash: "hash-gdd",
          changeState: "new",
          title: "THE LAST VECTOR - Game Design Document",
          summary:
            "A detailed browser spaceship game design document describing PixiJS rendering, Matter.js physics, hybrid Newtonian movement, shield mechanics, enemies, bosses, missions, audio, visual style, and proof expectations.",
          excerpt:
            "The game uses TypeScript, PixiJS, Matter.js, and Howler.js. The player pilots the Sylvian ship through hostile asteroid lanes with compensation jets, dodge bursts, shield timing, cargo missions, drone enemies, boss encounters, starfield visuals, and clean automated tests for deterministic game logic.",
          path: "GAME_DESIGN_DOCUMENT.md",
          classificationReason: "Fallback path/content classifier selected markdown.",
          classifiedBy: "fallback_heuristic",
          classificationConfidence: 0.7,
          authorityRole: "supporting",
          includeInSynthesis: true,
          relevance: 82,
          createdAt: "2026-05-04T00:00:00.000Z",
          updatedAt: "2026-05-04T00:00:00.000Z",
        },
        {
          id: "source-thread",
          boardId: "board-live",
          kind: "thread",
          sourceKey: "thread:planning",
          contentHash: "hash-thread",
          changeState: "new",
          title: "Initial planning thread",
          summary: "A conversational thread where the user asks Ambient to turn the GDD into a board.",
          threadId: "planning",
          classificationReason: "Fallback path/content classifier selected thread.",
          classifiedBy: "fallback_heuristic",
          classificationConfidence: 0.7,
          authorityRole: "context",
          includeInSynthesis: true,
          relevance: 70,
          createdAt: "2026-05-04T00:00:00.000Z",
          updatedAt: "2026-05-04T00:00:00.000Z",
        },
      ];

      const result = await provider.classifyBatched({ projectName: "The Last Vector", sources, maxSourcesPerBatch: 1 });

      const gdd = result.classifications.find((classification) => classification.sourceId === "source-gdd");
      if (gdd) {
        expect(gdd.effectiveKind).toBe("functional_spec");
        expect(gdd.authorityRole).toBe("primary");
        expect(gdd.includeInSynthesis).toBe(true);
        expect(gdd.classificationConfidence).toBeGreaterThan(0.5);
      } else {
        expect(result.fallbackSourceIds).toContain("source-gdd");
      }
      expect(result.classifications.length + result.fallbackSourceIds.length).toBe(sources.length);
      expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(100);
      expect(result.telemetry.batchCount).toBe(2);
    },
    liveProfile.testTimeoutMs,
  );
});
