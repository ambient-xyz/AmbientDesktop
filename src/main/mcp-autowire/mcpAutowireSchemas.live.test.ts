import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "../aggressiveRetries";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "../liveAmbientProviderConfig";
import {
  mcpAutowireCandidatePromptSchema,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
} from "./mcpAutowireSchemas";
import { callWorkflowPiJson } from "../workflow/workflowPiTransport";

const runLive = process.env.AMBIENT_MCP_AUTOWIRE_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("MCP autowire structured candidate generation live", () => {
  liveIt(
    "asks live Ambient/Pi for a schema-locked Context7 candidate without installing anything",
    async () => {
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "live MCP autowire schema smoke" });
      const candidate = await callWorkflowPiJson<McpAutowireCandidate>({
        apiKey,
        baseUrl: liveAmbientProviderBaseUrl(),
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_MCP_AUTOWIRE_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: AMBIENT_DEFAULT_MODEL,
        }),
        schemaName: "ambient_mcp_autowire_context7_candidate",
        responseSchema: mcpAutowireCandidatePromptSchema(),
        prompt: [
          "Produce one Ambient MCP autowire candidate descriptor as JSON only.",
          "Do not install anything. Do not invent a resolved commit. If a field is unknown and optional, omit it.",
          "Target URL: https://github.com/upstash/context7",
          "Known evidence:",
          "- Context7 README documents a documentation MCP server and multiple integration modes.",
          "- Context7 server.json declares a remote MCP endpoint at https://mcp.context7.com/mcp.",
          "- Context7 server.json declares optional CONTEXT7_API_KEY for higher rate limits.",
          "Recommendation: choose remote-mcp for this smoke because the remote endpoint is explicit and no local install is required.",
          "Use evidence ids context7-readme and context7-server-json consistently in evidenceRefs.",
        ].join("\n"),
        validate: (value) => {
          const report = validateMcpAutowireCandidate(value);
          if (!report.candidate) throw new Error(report.blockers.map((issue) => issue.message).join("; "));
          if (report.blockers.length) throw new Error(`candidate had blockers: ${report.blockers.map((issue) => issue.code).join(", ")}`);
          return report.candidate;
        },
        reasoning: false,
        maxTokens: 4_096,
        retryPolicy: aggressiveAmbientRetryPolicy(),
        idleTimeoutMs: 90_000,
      });

      expect(candidate.source.url).toBe("https://github.com/upstash/context7");
      expect(candidate.recommendedLane).toBe("remote-mcp");
      expect(candidate.runtime.provider).toBe("remote-mcp");
      expect(candidate.runtime.remote?.url).toBe("https://mcp.context7.com/mcp");
      expect(candidate.secrets.map((secret) => secret.name)).toContain("CONTEXT7_API_KEY");
    },
    180_000,
  );
});
