import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "../liveAmbientProviderConfig";
import { AmbientProjectBoardDecisionDraftRefreshProvider } from "./projectBoardDecisionDraftRefreshProvider";
import type { ProjectBoardCard } from "../../shared/types";

const runLive = process.env.AMBIENT_PROJECT_BOARD_DECISION_REFRESH_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardDecisionDraftRefreshProvider live", () => {
  liveIt(
    "refreshes a tiny animated hello-world draft after a PM decision",
    async () => {
      const provider = new AmbientProjectBoardDecisionDraftRefreshProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board decision draft refresh" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });
      const card: ProjectBoardCard = {
        id: "card-live-decision-refresh",
        boardId: "board-live",
        title: "Create animated hello-world page",
        description: "Build a tiny browser page that renders Hello from Ambient.",
        status: "draft",
        candidateStatus: "needs_clarification",
        labels: ["html", "animation"],
        blockedBy: [],
        acceptanceCriteria: ["Hello from Ambient is visible."],
        testPlan: { unit: [], integration: ["Run a browser smoke check."], visual: [], manual: [] },
        clarificationQuestions: ["Should the animation be pulse, confetti, or marquee?"],
        sourceKind: "board_synthesis",
        sourceId: "live:animated-hello",
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      };

      const result = await refreshWithProviderRetry(provider, {
        boardTitle: "Tiny live decision refresh board",
        question: "Should the animation be pulse, confetti, or marquee?",
        answer: "Use a subtle pulse animation.",
        cards: [card],
      });
      const suggestion = result.suggestions[0];

      expect(suggestion.cardId).toBe(card.id);
      expect(suggestion.description?.toLowerCase()).toContain("pulse");
      expect(suggestion.clarificationQuestions ?? []).toEqual([]);
      expect(
        [
          ...(suggestion.acceptanceCriteria ?? []),
          ...(suggestion.testPlan?.integration ?? []),
          ...(suggestion.testPlan?.visual ?? []),
          suggestion.description ?? "",
        ]
          .join(" ")
          .toLowerCase(),
      ).toMatch(/pulse|animation|browser|screenshot|visual/);
      expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(10);
    },
    liveProfile.testTimeoutMs * 2,
  );
});

async function refreshWithProviderRetry(
  provider: AmbientProjectBoardDecisionDraftRefreshProvider,
  input: Parameters<AmbientProjectBoardDecisionDraftRefreshProvider["refresh"]>[0],
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await provider.refresh(input);
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
