import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import {
  liveAmbientProviderBaseUrl,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import {
  evaluateMcpAutowireRuntimeGate,
  evaluateMcpAutowireDogfoodFixtures,
  runMcpAutowireEvaluationMatrix,
  writeMcpAutowireDogfoodFixtureReport,
  writeMcpAutowireEvaluationReport,
  writeMcpAutowireRuntimeGateReport,
} from "./mcpAutowireEvaluation";

const runLive = process.env.AMBIENT_MCP_AUTOWIRE_EVAL_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("MCP autowire evaluation live", () => {
  liveIt(
    "records repeated live Ambient/Pi autowire plan and review evidence",
    async () => {
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "live MCP autowire evaluation matrix" });
      const targetIds = targetIdsFromEnv(process.env.AMBIENT_MCP_AUTOWIRE_EVAL_TARGETS);
      const report = await runMcpAutowireEvaluationMatrix({
        apiKey,
        baseUrl: liveAmbientProviderBaseUrl(),
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_MCP_AUTOWIRE_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: AMBIENT_DEFAULT_MODEL,
        }),
        providerLabel: liveAmbientProviderLabel(),
        targetIds,
        idleTimeoutMs: 120_000,
        maxTokens: 6_000,
      });
      const outputDir = process.env.AMBIENT_MCP_AUTOWIRE_EVAL_OUTPUT_DIR || join(process.cwd(), "test-results", "mcp-autowire-evaluation");
      await writeMcpAutowireEvaluationReport(report, outputDir);
      const dogfoodReport = evaluateMcpAutowireDogfoodFixtures(report);
      await writeMcpAutowireDogfoodFixtureReport(dogfoodReport, outputDir);
      const runtimeGateReport = evaluateMcpAutowireRuntimeGate(report);
      await writeMcpAutowireRuntimeGateReport(runtimeGateReport, outputDir);

      expect(report.targets).toBeGreaterThan(0);
      expect(report.results.every((result) => result.target.targetUrl.startsWith("https://github.com/"))).toBe(true);
      if (process.env.AMBIENT_MCP_AUTOWIRE_EVAL_REQUIRE_LIVE === "1") {
        expect(report.results.filter((result) => result.status === "planner-error")).toEqual([]);
        expect(dogfoodReport.results.filter((result) => result.status === "failed")).toEqual([]);
      }
    },
    liveTimeoutMs(),
  );
});

function targetIdsFromEnv(value: string | undefined): string[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "all") return undefined;
  return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function liveTimeoutMs(): number {
  const value = Number(process.env.AMBIENT_MCP_AUTOWIRE_EVAL_TEST_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 20 * 60_000;
}
