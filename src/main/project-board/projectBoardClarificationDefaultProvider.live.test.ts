import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./projectBoardAmbientFacade";
import {
  AmbientProjectBoardClarificationDefaultProvider,
  projectBoardClarificationDefaultSuggestionTargets,
} from "./projectBoardClarificationDefaultProvider";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";

const runLive = process.env.AMBIENT_PROJECT_BOARD_CLARIFICATION_DEFAULTS_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardClarificationDefaultProvider live", () => {
  liveIt(
    "suggests expert defaults for a tiny animated hello-world decision",
    async () => {
      const provider = new AmbientProjectBoardClarificationDefaultProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board clarification defaults" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });
      const card: ProjectBoardCard = {
        id: "card-live-clarification-default",
        boardId: "board-live",
        title: "Create animated hello-world page",
        description: "Build a tiny browser page that renders Hello from Ambient with one simple CSS animation.",
        status: "draft",
        candidateStatus: "needs_clarification",
        labels: ["html", "animation"],
        blockedBy: [],
        acceptanceCriteria: ["Hello from Ambient is visible.", "The animation is simple and easy to verify."],
        testPlan: { unit: ["Check the HTML contains the greeting."], integration: [], visual: ["Capture a screenshot."], manual: [] },
        clarificationQuestions: ["Should the hello-world animation use a subtle pulse or confetti burst?"],
        sourceKind: "board_synthesis",
        sourceId: "live:animated-hello",
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      };
      const targets = projectBoardClarificationDefaultSuggestionTargets([card]);

      const result = await suggestWithProviderRetry(provider, { boardTitle: "Tiny live defaults board", targets });
      const suggestion = result.suggestions[0];

      expect(suggestion.cardId).toBe(card.id);
      expect(suggestion.decisionId).toBe(targets[0].decisionId);
      expect(suggestion.suggestedAnswer.length).toBeGreaterThan(10);
      expect(suggestion.rationale.length).toBeGreaterThan(10);
      expect(["high", "medium", "low"]).toContain(suggestion.confidence);
      expect(["expert_default", "user_preference", "external_constraint"]).toContain(suggestion.questionKind);
      if (suggestion.safeToAccept) expect(suggestion.questionKind).toBe("expert_default");
      expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(10);
    },
    liveProfile.testTimeoutMs * 2,
  );
});

async function suggestWithProviderRetry(
  provider: AmbientProjectBoardClarificationDefaultProvider,
  input: Parameters<AmbientProjectBoardClarificationDefaultProvider["suggest"]>[0],
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await provider.suggest(input);
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isRetryableLiveGmiStreamError(error)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isRetryableLiveGmiStreamError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    (error.message.includes("stream stalled") && error.message.includes("0 response characters")) ||
    error.message.includes("stream ended before completion")
  );
}
