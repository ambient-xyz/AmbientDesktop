import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./projectBoardAmbientFacade";
import { AmbientProjectBoardSourceDraftRefreshProvider } from "./projectBoardSourceDraftRefreshProvider";
import type { ProjectBoardCard, ProjectBoardSource } from "../../shared/projectBoardTypes";

const runLive = process.env.AMBIENT_PROJECT_BOARD_SOURCE_REFRESH_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardSourceDraftRefreshProvider live", () => {
  liveIt(
    "refreshes a tiny animated hello-world draft after a source inclusion change",
    async () => {
      const provider = new AmbientProjectBoardSourceDraftRefreshProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board source draft refresh" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });
      const durableSource: ProjectBoardSource = {
        id: "source-live-durable",
        boardId: "board-live",
        kind: "plan_artifact",
        title: "Tiny live durable plan",
        summary: "Primary plan says to create a tiny Hello from Ambient page with a visible animation.",
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
        path: ".ambient/board/plans/Tiny-Live-DurablePlan.html",
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      };
      const chatSource: ProjectBoardSource = {
        id: "source-live-chat",
        boardId: "board-live",
        kind: "thread",
        title: "Tiny animation chat",
        summary: "The newly included chat says the animation should be a calm pulse and should avoid confetti.",
        relevance: 75,
        authorityRole: "context",
        includeInSynthesis: true,
        threadId: "thread-live-animation-chat",
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      };
      const card: ProjectBoardCard = {
        id: "card-live-source-refresh",
        boardId: "board-live",
        title: "Create animated hello-world page",
        description: "Build a tiny browser page that renders Hello from Ambient.",
        status: "draft",
        candidateStatus: "ready_to_create",
        labels: ["html", "animation"],
        blockedBy: [],
        acceptanceCriteria: ["Hello from Ambient is visible."],
        testPlan: { unit: [], integration: ["Run a browser smoke check."], visual: [], manual: [] },
        sourceKind: "board_synthesis",
        sourceId: "live:animated-hello",
        sourceRefs: [durableSource.id, chatSource.id],
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      };

      const result = await refreshWithProviderRetry(provider, {
        boardTitle: "Tiny live source refresh board",
        sources: [durableSource, chatSource],
        sourceChangeSummary: "Tiny animation chat changed from ignored to included context; durable plan remains primary.",
        cards: [card],
      });
      const suggestion = result.suggestions[0];

      expect(suggestion.cardId).toBe(card.id);
      expect(suggestion.description?.toLowerCase()).toMatch(/pulse|source impact|animation|chat/);
      expect(
        [
          ...(suggestion.acceptanceCriteria ?? []),
          ...(suggestion.testPlan?.integration ?? []),
          ...(suggestion.testPlan?.visual ?? []),
          suggestion.description ?? "",
        ]
          .join(" ")
          .toLowerCase(),
      ).toMatch(/pulse|animation|browser|screenshot|visual|source/);
      expect(result.telemetry.promptCharCount).toBeGreaterThan(100);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(10);
    },
    liveProfile.testTimeoutMs * 2,
  );
});

async function refreshWithProviderRetry(
  provider: AmbientProjectBoardSourceDraftRefreshProvider,
  input: Parameters<AmbientProjectBoardSourceDraftRefreshProvider["refresh"]>[0],
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await provider.refresh(input);
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isLikelyTransientStreamFailure(error)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isLikelyTransientStreamFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    (error.message.includes("stream stalled") && error.message.includes("0 response characters")) ||
    error.message.includes("stream_closed_before_done")
  );
}
