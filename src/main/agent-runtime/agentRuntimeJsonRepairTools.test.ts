import { describe, expect, it, vi } from "vitest";

import { registerJsonRepairTool } from "./agentRuntimeJsonRepairTools";
import type { JsonRepairToolInput, JsonRepairToolOptions, JsonRepairToolResult } from "./agentRuntimeWorkflowFacade";

describe("agentRuntimeJsonRepairTools", () => {
  it("registers ambient_json_repair and forwards model, retry, signal, and progress details", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const signal = new AbortController().signal;
    const repairJson = vi.fn(async (_input: JsonRepairToolInput, options: JsonRepairToolOptions): Promise<JsonRepairToolResult> => {
      options.onProgress?.({ stage: "waiting", outputChars: 0, thinkingChars: 0, elapsedMs: 1 });
      options.onProgress?.({ stage: "waiting", outputChars: 1, thinkingChars: 0, elapsedMs: 2 });
      options.onProgress?.({ stage: "streaming", outputChars: 24, thinkingChars: 3, elapsedMs: 10 });
      return {
        repaired: true as const,
        schemaName: "demo_schema",
        value: { count: 3 },
        inputHash: "input-hash",
        schemaHash: "schema-hash",
        repairedHash: "repaired-hash",
        validation: { valid: true as const },
      };
    });

    registerJsonRepairTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      model: { id: "gmi-test-model", baseUrl: "https://gmi.example.test/v1" },
      apiKey: "redacted-test-key",
      getModelRuntimeSettings: () => ({ aggressiveRetries: true }),
      repairJson,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_json_repair"]);

    const updates: any[] = [];
    const result = await registeredTools[0].execute(
      "json-repair",
      validJsonRepairParams(),
      signal,
      (update: any) => updates.push(update),
    );

    expect(repairJson).toHaveBeenCalledWith(expect.objectContaining({
      schemaName: "demo_schema",
      invalidJsonText: "{\"count\":\"3\"",
      validationErrors: ["count must be a number"],
      preserveSemantics: true,
    }), expect.objectContaining({
      apiKey: "redacted-test-key",
      baseUrl: "https://gmi.example.test/v1",
      model: "gmi-test-model",
      signal,
      retryPolicy: expect.objectContaining({
        enabled: true,
        maxRetries: expect.any(Number),
      }),
      onProgress: expect.any(Function),
    }));
    expect(updates.map((update) => update.details.status)).toEqual(["running", "waiting", "streaming"]);
    expect(result.content[0].text).toContain("JSON repair succeeded for demo_schema.");
    expect(result.content[0].text).toContain("\"count\": 3");
    expect(result.details).toMatchObject({
      runtime: "ambient-json-repair",
      toolName: "ambient_json_repair",
      status: "repaired",
      schemaName: "demo_schema",
      inputHash: "input-hash",
      schemaHash: "schema-hash",
      repairedHash: "repaired-hash",
      validation: { valid: true },
    });
  });

  it("omits retry policy when aggressive retries are disabled and preserves failure details", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const repairJson = vi.fn(async (_input: JsonRepairToolInput, _options: JsonRepairToolOptions): Promise<JsonRepairToolResult> => ({
      repaired: false as const,
      schemaName: "demo_schema",
      inputHash: "input-hash",
      schemaHash: "schema-hash",
      validation: {
        valid: false as const,
        errors: ["missing required count"],
      },
      missingInformation: ["count"],
    }));

    registerJsonRepairTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      model: { id: "plain-model" },
      getModelRuntimeSettings: () => ({ aggressiveRetries: false }),
      repairJson,
    });

    const result = await registeredTools[0].execute("json-repair", validJsonRepairParams());

    expect(repairJson.mock.calls[0][1]).toMatchObject({
      model: "plain-model",
      retryPolicy: undefined,
    });
    expect(result.content[0].text).toContain("JSON repair failed for demo_schema.");
    expect(result.details).toMatchObject({
      runtime: "ambient-json-repair",
      toolName: "ambient_json_repair",
      status: "failed",
      missingInformation: ["count"],
      validation: {
        valid: false,
        errors: ["missing required count"],
      },
    });
  });
});

function validJsonRepairParams() {
  return {
    schemaName: "demo_schema",
    schema: {
      type: "object",
      properties: {
        count: { type: "number" },
      },
      required: ["count"],
      additionalProperties: false,
    },
    invalidJsonText: "{\"count\":\"3\"",
    validationErrors: ["count must be a number"],
  };
}
