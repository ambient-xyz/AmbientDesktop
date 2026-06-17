import { describe, expect, it } from "vitest";
import { stringifyWorkflowRunLimitOverrides } from "./workflowRunLimitOverrides";

describe("workflowRunLimitOverrides", () => {
  it("omits empty or invalid workflow run limit overrides", () => {
    expect(stringifyWorkflowRunLimitOverrides(undefined)).toBeNull();
    expect(stringifyWorkflowRunLimitOverrides({ idleTimeoutMs: -1, maxRunMs: Number.NaN })).toBeNull();
  });

  it("serializes normalized workflow run limit overrides", () => {
    expect(JSON.parse(stringifyWorkflowRunLimitOverrides({ idleTimeoutMs: 120_000.8, maxRunMs: null })!)).toEqual({
      idleTimeoutMs: 120_000,
      maxRunMs: null,
    });
    expect(JSON.parse(stringifyWorkflowRunLimitOverrides({ idleTimeoutMs: 0, maxRunMs: 600_000.2 })!)).toEqual({
      maxRunMs: 600_000,
    });
  });
});
