import { describe, expect, it } from "vitest";
import {
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import { AmbientProjectBoardProofJudgeProvider } from "./projectBoardProofJudgeProvider";
import type { OrchestrationRun, ProjectBoardCard, ProjectBoardCardProofReview } from "../shared/types";

const runLive = process.env.AMBIENT_PROJECT_BOARD_PROOF_JUDGE_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describe("AmbientProjectBoardProofJudgeProvider live", () => {
  liveIt(
    "returns a structured PM proof judgment for a spaceship card run",
    async () => {
      const provider = new AmbientProjectBoardProofJudgeProvider({
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: "zai-org/GLM-5.1-FP8",
        }),
        apiKey: readLiveAmbientProviderApiKey({ purpose: "live project-board proof judge" }),
        baseUrl: liveAmbientProviderBaseUrl(),
        retryPolicy: liveProfile.retryPolicy,
        preStreamResponseTimeoutMs: liveProfile.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: liveProfile.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: liveProfile.streamContentIdleTimeoutMs,
      });
      const card: ProjectBoardCard = {
        id: "card-live",
        boardId: "board-live",
        title: "Create the WebGL game shell",
        description: "Build the initial browser WebGL spaceship shell with a nonblank scene, ship placeholder, HUD placeholder, and stable render loop.",
        status: "in_progress",
        candidateStatus: "ready_to_create",
        labels: ["webgl", "foundation"],
        blockedBy: [],
        acceptanceCriteria: [
          "A browser canvas renders a nonblank scene.",
          "The game loop updates without throwing.",
          "A ship placeholder and HUD placeholder are visible.",
        ],
        testPlan: {
          unit: ["Run unit tests for pure state helpers."],
          integration: ["Run a build or smoke command."],
          visual: ["Capture a browser/canvas screenshot or equivalent visual proof."],
          manual: [],
        },
        sourceKind: "board_synthesis",
        sourceId: "live:shell",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:00:00.000Z",
      };
      const run: OrchestrationRun = {
        id: "run-live",
        taskId: "task-live",
        attemptNumber: 1,
        status: "completed",
        workspacePath: "/tmp/spaceship-worktree",
        startedAt: "2026-05-03T00:00:00.000Z",
        proofOfWork: {
          changedFiles: ["src/App.tsx", "src/game/state.ts", "src/game/state.test.ts"],
          gitStatus: [" M src/App.tsx", "?? src/game/state.ts", "?? src/game/state.test.ts"],
          afterRunHook: { ok: true, command: "pnpm test", output: "state tests passed" },
          screenshots: ["test-results/spaceship-shell.png"],
          lastAssistantText:
            "Implemented the acceptance criteria. The canvas is nonblank, the ship placeholder and HUD render, unit tests passed, and a browser screenshot was captured.",
        },
      };
      const deterministicReview: ProjectBoardCardProofReview = {
        status: "ready_for_review",
        summary: "The proof packet satisfies deterministic requirements.",
        satisfied: ["Implementation evidence recorded.", "Unit proof recorded.", "Visual/browser proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: run.id,
        reviewedAt: "2026-05-03T00:00:01.000Z",
        reviewer: "deterministic",
      };

      const result = await provider.judge({ card, run, deterministicReview });

      expect(["done", "ready_for_review", "needs_follow_up", "retry_recommended", "terminally_blocked"]).toContain(result.judgment.status);
      expect(["close", "retry", "follow_up", "ask_user", "block"]).toContain(result.judgment.recommendedAction);
      expect(result.judgment.summary.length).toBeGreaterThan(20);
      expect(result.judgment.satisfied.length).toBeGreaterThan(0);
      if (!["done", "ready_for_review"].includes(result.judgment.status)) {
        expect(result.judgment.missing.length).toBeGreaterThan(0);
      }
      expect(result.judgment.confidence).toBeGreaterThanOrEqual(0);
      expect(result.judgment.confidence).toBeLessThanOrEqual(1);
      expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
      expect(result.telemetry.responseCharCount).toBeGreaterThan(100);
    },
    liveProfile.testTimeoutMs,
  );
});
