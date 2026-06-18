import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "./workflowAmbientFacade";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "./workflowAmbientFacade";
import { repairJsonWithPi } from "./jsonRepairTool";

const runLive = process.env.AMBIENT_JSON_REPAIR_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("ambient_json_repair live", () => {
  liveIt(
    "repairs invalid JSON through the live Ambient-compatible provider",
    async () => {
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "live Ambient/Pi JSON repair smoke" });
      const result = await repairJsonWithPi(
        {
          schemaName: "ambient_json_repair_live_probe",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["city", "count"],
            properties: {
              city: { const: "Scottsdale" },
              count: { const: 3 },
            },
          },
          invalidJsonText: "{ city: \"Scottsdale\", count: \"3\", extra: true",
          validationErrors: [
            "JSON parse error: missing closing brace",
            "count must be the number 3, not a string",
            "extra must be removed because additionalProperties is false",
          ],
          repairInstruction: "The source city is already Scottsdale. Convert the quoted count to the number required by the schema and remove extra.",
          preserveSemantics: true,
        },
        {
          apiKey,
          baseUrl: liveAmbientProviderBaseUrl(),
          model: liveAmbientProviderModel({
            preferredModelEnvNames: ["AMBIENT_PROJECT_BOARD_MODEL", "AMBIENT_LIVE_MODEL"],
            fallbackModel: AMBIENT_DEFAULT_MODEL,
          }),
          maxTokens: 512,
          retryPolicy: aggressiveAmbientRetryPolicy(),
        },
      );

      expect(result).toMatchObject({
        repaired: true,
        value: {
          city: "Scottsdale",
          count: 3,
        },
        validation: { valid: true },
      });
    },
    120_000,
  );
});
