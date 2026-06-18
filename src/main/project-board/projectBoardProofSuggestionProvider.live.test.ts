import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./projectBoardAmbientFacade";
import { AmbientProjectBoardProofSuggestionProvider } from "./projectBoardProofSuggestionProvider";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";

const runLive = process.env.AMBIENT_PROJECT_BOARD_PROOF_SUGGESTION_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardProofSuggestionProvider live", () => {
  liveIt(
    "suggests proof expectations for a tiny animated hello-world card",
    async () => {
      const provider = new AmbientProjectBoardProofSuggestionProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board proof suggestion" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });
      const card: ProjectBoardCard = {
        id: "card-live-proof-suggestion",
        boardId: "board-live",
        title: "Create animated hello-world page",
        description: "Build a tiny browser page that renders Hello from Ambient with a subtle CSS animation and responsive spacing.",
        status: "draft",
        candidateStatus: "ready_to_create",
        labels: ["html", "animation", "layout"],
        blockedBy: [],
        acceptanceCriteria: ["Hello from Ambient is visible.", "A subtle animation is visible.", "The page works on desktop and mobile widths."],
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
        sourceKind: "board_synthesis",
        sourceId: "live:animated-hello",
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      };

      const result = await suggestWithProviderRetry(provider, { boardTitle: "Tiny live proof board", cards: [card] });
      const suggestion = result.suggestions[0];

      expect(suggestion.cardId).toBe(card.id);
      expect(
        suggestion.testPlan.unit.length + suggestion.testPlan.integration.length + suggestion.testPlan.visual.length + suggestion.testPlan.manual.length,
      ).toBeGreaterThan(0);
      expect([...suggestion.testPlan.visual, ...suggestion.testPlan.integration, ...suggestion.testPlan.manual].join(" ").toLowerCase()).toMatch(
        /screenshot|browser|viewport|desktop|mobile|visual|smoke|review/,
      );
      expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(10);
    },
    liveProfile.testTimeoutMs * 2,
  );
});

async function suggestWithProviderRetry(
  provider: AmbientProjectBoardProofSuggestionProvider,
  input: Parameters<AmbientProjectBoardProofSuggestionProvider["suggest"]>[0],
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await provider.suggest(input);
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isZeroOutputStreamStall(error)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isZeroOutputStreamStall(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("stream stalled") && error.message.includes("0 response characters");
}
