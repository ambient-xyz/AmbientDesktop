import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "./mcpAutowireAmbientFacade";
import { planMcpAutowire } from "./mcpAutowirePlanner";

const runLive = process.env.AMBIENT_MCP_AUTOWIRE_PLAN_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("MCP autowire planner live", () => {
  liveIt(
    "lets live Ambient/Pi inspect Context7 repo evidence and produce a schema-valid candidate or explicit blockers",
    async () => {
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "live MCP autowire planner smoke" });
      const result = await planMcpAutowire({
        targetUrl: "https://github.com/upstash/context7",
        instructions: [
          "Use the Ambient MCP autowire schema.",
          "Use URL evidence where available.",
          "Prefer remote-mcp if the repository declares an explicit hosted MCP endpoint.",
          "Do not invent resolved commits or runtime validation.",
        ].join(" "),
        allowedDiscovery: { urlFetch: true, githubRaw: true, search: true, maxFetches: 5, maxSearches: 2, maxBytesPerFetch: 18_000 },
      }, {
        apiKey,
        baseUrl: liveAmbientProviderBaseUrl(),
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_MCP_AUTOWIRE_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: AMBIENT_DEFAULT_MODEL,
        }),
        idleTimeoutMs: 120_000,
        maxTokens: 6_000,
      });

      expect(result.targetUrl).toBe("https://github.com/upstash/context7");
      expect(result.discovery.fetches.some((fetch) => fetch.status === "fetched")).toBe(true);
      expect(result.candidate).toBeDefined();
      const candidate = result.candidate!;
      const blockerCodes = result.validation.blockers.map((issue) => issue.code);
      expect(candidate.source.url).toBe("https://github.com/upstash/context7");
      expect(["remote-mcp", "standard-mcp", "exploratory"]).toContain(candidate.recommendedLane);
      if (result.validation.blockers.length === 0) {
        expect(result.validation.readyForUserReview).toBe(true);
      } else {
        expect(result.validation.readyForUserReview).toBe(false);
        expect(result.validation.blockers.every((issue) => issue.code && issue.message)).toBe(true);
      }
      if (candidate.recommendedLane === "remote-mcp") {
        if (candidate.runtime.provider === "remote-mcp") {
          expect(candidate.runtime.remote?.url).toMatch(/^https:\/\//);
        } else {
          expect(blockerCodes).toContain("lane.provider_mismatch");
        }
      } else if (candidate.recommendedLane === "standard-mcp") {
        if (candidate.runtime.provider === "toolhive") {
          expect(["registry", "server-json", "npm", "pypi", "oci", "mcpb"]).toContain(candidate.runtime.sourceKind);
        } else {
          expect(blockerCodes).toContain("lane.provider_mismatch");
        }
      } else {
        expect(blockerCodes).toContain("lane.exploratory_not_installable");
      }
    },
    240_000,
  );
});
