import { describe, expect, it, vi } from "vitest";

import {
  createAmbientCliPackageSummaryModelComplete,
  hydrateFirstPartyAmbientCliPackageSummaries,
} from "./agentRuntimeAmbientCliPackageSummaryHydration";

describe("hydrateFirstPartyAmbientCliPackageSummaries", () => {
  it("skips hydration when Ambient CLI RLM summaries are disabled", async () => {
    const hydrateSummaries = vi.fn();

    const result = await hydrateFirstPartyAmbientCliPackageSummaries({
      workspace: { path: "/workspace" },
      model: model(),
      packageId: "pkg-1",
      env: { AMBIENT_CLI_RLM_SUMMARIES: "0" },
      hydrateSummaries,
    });

    expect(result).toBeUndefined();
    expect(hydrateSummaries).not.toHaveBeenCalled();
  });

  it("hydrates with generation enabled but without a model completer when no API key is configured", async () => {
    const hydration = hydrationResult();
    const hydrateSummaries = vi.fn(async (_workspacePath: string, _selector: any, _options: any) => hydration);

    const result = await hydrateFirstPartyAmbientCliPackageSummaries({
      workspace: { path: "/workspace" },
      model: model(),
      packageId: "pkg-1",
      env: { AMBIENT_CLI_RLM_SUMMARIES: "1" },
      hydrateSummaries,
    });

    expect(result).toBe(hydration);
    expect(hydrateSummaries).toHaveBeenCalledWith("/workspace", { packageId: "pkg-1" }, {
      generateMissingSummaries: true,
    });
  });

  it("passes the configured API key and timeout to the model completer", async () => {
    const hydration = hydrationResult();
    const hydrateSummaries = vi.fn(async (_workspacePath: string, _selector: any, _options: any) => hydration);
    const completeText = vi.fn(async () => "summary");
    const signal = new AbortController().signal;
    const runtimeModel = model();

    const result = await hydrateFirstPartyAmbientCliPackageSummaries({
      workspace: { path: "/workspace" },
      model: runtimeModel,
      apiKey: "api-key",
      packageId: "pkg-1",
      env: {
        AMBIENT_CLI_RLM_SUMMARIES: "1",
        AMBIENT_CLI_RLM_SUMMARY_TIMEOUT_MS: "2500",
      },
      hydrateSummaries,
      completeText,
    });

    const options = hydrateSummaries.mock.calls[0][2];
    expect(result).toBe(hydration);
    expect(options).toMatchObject({ generateMissingSummaries: true });
    await options.modelComplete?.("summarize", signal);
    expect(completeText).toHaveBeenCalledWith(runtimeModel, "summarize", {
      apiKey: "api-key",
      signal,
      timeoutMs: 2500,
    });
  });
});

describe("createAmbientCliPackageSummaryModelComplete", () => {
  it("omits the model completer when no API key is configured", () => {
    const completeText = vi.fn();

    const modelComplete = createAmbientCliPackageSummaryModelComplete({
      model: model(),
      completeText,
    });

    expect(modelComplete).toBeUndefined();
    expect(completeText).not.toHaveBeenCalled();
  });

  it("uses the default summary timeout when no override is configured", async () => {
    const completeText = vi.fn(async () => "summary");
    const runtimeModel = model();

    const modelComplete = createAmbientCliPackageSummaryModelComplete({
      model: runtimeModel,
      apiKey: "api-key",
      env: {},
      completeText,
    });

    expect(modelComplete).toBeDefined();
    await modelComplete!("summarize");
    expect(completeText).toHaveBeenCalledWith(runtimeModel, "summarize", {
      apiKey: "api-key",
      signal: undefined,
      timeoutMs: 120_000,
    });
  });
});

function model(): any {
  return { id: "model", baseUrl: "https://example.invalid" };
}

function hydrationResult(): any {
  return {
    packageId: "pkg-1",
    packageName: "package",
    attempted: true,
    summaryStatuses: [],
    availableCount: 0,
    failedCount: 0,
  };
}
