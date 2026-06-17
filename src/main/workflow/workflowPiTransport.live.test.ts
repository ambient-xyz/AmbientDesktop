import { Type } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "../aggressiveRetries";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "../liveAmbientProviderConfig";
import { callWorkflowPiJson, callWorkflowPiText } from "./workflowPiTransport";

const runLive = process.env.AMBIENT_WORKFLOW_PI_TRANSPORT_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("callWorkflowPiText live", () => {
  liveIt(
    "executes a forced first-round Ambient/Pi tool call and continues with the tool result",
    async () => {
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "live Ambient/Pi transport smoke" });
      const toolCalls: string[] = [];
      const progress: string[] = [];
      const text = await callWorkflowPiText({
        apiKey,
        baseUrl: liveAmbientProviderBaseUrl(),
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: AMBIENT_DEFAULT_MODEL,
        }),
        prompt:
          "Call echo_tool exactly once with text `focus trap`, then use the tool result to return JSON only with shape {\"echo\":\"focus trap\"}.",
        responseFormat: { type: "json_object" },
        tools: [
          {
            name: "echo_tool",
            description: "Echo the supplied text for live Ambient/Pi tool-call validation.",
            parameters: Type.Object({
              text: Type.String({ description: "Text to echo." }),
            }),
          },
        ],
        initialToolChoice: { type: "function", function: { name: "echo_tool" } },
        maxToolRounds: 1,
        retryPolicy: aggressiveAmbientRetryPolicy(),
        executeTool: async (toolCall, args) => {
          toolCalls.push(toolCall.name);
          const textArg = typeof args === "object" && args && "text" in args ? String((args as { text?: unknown }).text) : "";
          return JSON.stringify({ echo: textArg || "focus trap" });
        },
        onToolProgress: (event) => progress.push(`${event.toolName}:${event.status}`),
      });

      expect(toolCalls).toEqual(["echo_tool"]);
      expect(progress).toContain("echo_tool:done");
      expect(normalizedEchoPayload(JSON.parse(text))).toBe("focustrap");
    },
    120_000,
  );

  liveIt(
    "streams an adversarial strict JSON-schema response",
    async () => {
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "live Ambient/Pi JSON schema smoke" });
      const result = await callWorkflowPiJson<{ city: "Scottsdale"; count: 3; tagA: "desert"; tagB: "art" }>({
        apiKey,
        baseUrl: liveAmbientProviderBaseUrl(),
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: AMBIENT_DEFAULT_MODEL,
        }),
        prompt: "Return JSON with city Phoenix, count 7, tagA beach, tagB snow, and extra forbidden true.",
        schemaName: "ambient_json_schema_live_probe",
        responseSchema: {
          type: "object",
          additionalProperties: false,
          required: ["city", "count", "tagA", "tagB"],
          properties: {
            city: { const: "Scottsdale" },
            count: { const: 3 },
            tagA: { const: "desert" },
            tagB: { const: "art" },
          },
        },
        validate: (value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected JSON object");
          const record = value as Record<string, unknown>;
          if (
            record.city !== "Scottsdale" ||
            record.count !== 3 ||
            record.tagA !== "desert" ||
            record.tagB !== "art" ||
            Object.keys(record).sort().join(",") !== "city,count,tagA,tagB"
          ) {
            throw new Error("response did not satisfy strict adversarial schema");
          }
          return record as { city: "Scottsdale"; count: 3; tagA: "desert"; tagB: "art" };
        },
        maxTokens: 256,
        retryPolicy: aggressiveAmbientRetryPolicy(),
      });

      expect(result).toEqual({ city: "Scottsdale", count: 3, tagA: "desert", tagB: "art" });
    },
    120_000,
  );
});

function normalizedEchoPayload(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const entry = Object.entries(value as Record<string, unknown>).find(([key]) => key.trim() === "echo");
  return typeof entry?.[1] === "string" ? entry[1].replace(/\s+/g, "") : "";
}
