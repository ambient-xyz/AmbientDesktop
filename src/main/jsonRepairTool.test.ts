import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import {
  JSON_REPAIR_TOOL_MAX_INVALID_JSON_CHARS,
  jsonRepairToolResultText,
  parseJsonRepairToolInput,
  repairJsonWithPi,
  stableJson,
  validateJsonAgainstSchemaStrict,
  type JsonRepairToolInput,
} from "./jsonRepairTool";
import type { WorkflowPiTextCallInput } from "./workflowPiTransport";

const repairSchema = {
  type: "object",
  additionalProperties: false,
  required: ["city", "count"],
  properties: {
    city: { const: "Scottsdale" },
    count: { type: "number" },
  },
};

function input(overrides: Partial<JsonRepairToolInput> = {}): JsonRepairToolInput {
  return {
    schemaName: "json_repair_test",
    schema: repairSchema,
    invalidJsonText: "{ city: Scottsdale, count: \"3\", extra: true",
    validationErrors: ["JSON parse error near end of input", "count must be a number", "extra is not allowed"],
    preserveSemantics: true,
    ...overrides,
  };
}

describe("ambient_json_repair", () => {
  it("asks Pi for a schema-constrained repair and returns hashes with the repaired value", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const result = await repairJsonWithPi(input(), {
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      textCall: async (call) => {
        calls.push(call);
        return JSON.stringify({ repaired: true, value: { city: "Scottsdale", count: 3 } });
      },
    });

    expect(result).toMatchObject({
      repaired: true,
      schemaName: "json_repair_test",
      value: { city: "Scottsdale", count: 3 },
      validation: { valid: true },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].reasoning).toBe(false);
    expect(calls[0].responseFormat).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "json_repair_test_repair_result",
        strict: true,
      },
    });
    expect(jsonRepairToolResultText(result)).toContain("\"count\": 3");
  });

  it("retries when Pi returns JSON that would require validator coercion", async () => {
    const prompts: string[] = [];
    let attempts = 0;
    const result = await repairJsonWithPi(input(), {
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      textCall: async (call) => {
        attempts += 1;
        prompts.push(call.prompt);
        return attempts === 1
          ? JSON.stringify({ repaired: true, value: { city: "Scottsdale", count: "3" } })
          : JSON.stringify({ repaired: true, value: { city: "Scottsdale", count: 3 } });
      },
    });

    expect(result.repaired).toBe(true);
    expect(attempts).toBe(2);
    expect(prompts[1]).toContain("Previous response failed deterministic JSON validation");
  });

  it("returns a typed failure when Pi says required information is missing", async () => {
    const result = await repairJsonWithPi(input(), {
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      textCall: async () => JSON.stringify({ repaired: false, missingInformation: ["count cannot be inferred"] }),
    });

    expect(result).toMatchObject({
      repaired: false,
      missingInformation: ["count cannot be inferred"],
      validation: {
        valid: false,
        errors: [expect.stringContaining("cannot be repaired")],
      },
    });
    expect(jsonRepairToolResultText(result)).not.toContain(input().invalidJsonText);
  });

  it("rejects secret-like inputs before calling Pi", async () => {
    let called = false;
    const result = await repairJsonWithPi(input({ invalidJsonText: "{\"apiKey\":\"sk-abcdefghijklmnop123456\"}" }), {
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      textCall: async () => {
        called = true;
        return "{}";
      },
    });

    expect(called).toBe(false);
    expect(result).toMatchObject({
      repaired: false,
      validation: {
        valid: false,
        errors: [expect.stringContaining("secret-like material")],
      },
    });
  });

  it("rejects oversized invalid JSON before calling Pi", async () => {
    let called = false;
    const result = await repairJsonWithPi(input({ invalidJsonText: "x".repeat(JSON_REPAIR_TOOL_MAX_INVALID_JSON_CHARS + 1) }), {
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      textCall: async () => {
        called = true;
        return "{}";
      },
    });

    expect(called).toBe(false);
    expect(result).toMatchObject({
      repaired: false,
      validation: {
        valid: false,
        errors: [expect.stringContaining("invalidJsonText is too large")],
      },
    });
  });

  it("validates tool input shape and schema values without coercing repaired JSON", () => {
    expect(parseJsonRepairToolInput({
      schemaName: "shape",
      schema: repairSchema,
      invalidJsonText: "{\"city\":\"Scottsdale\"",
      validationErrors: ["parse error"],
    })).toMatchObject({ preserveSemantics: true });

    expect(() => validateJsonAgainstSchemaStrict(repairSchema, { city: "Scottsdale", count: "3" })).toThrow(/type coercion/);
    expect(stableJson({ b: 1, a: { d: 4, c: 3 } })).toBe("{\"a\":{\"c\":3,\"d\":4},\"b\":1}");
  });
});
