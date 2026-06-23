import { describe, expect, it } from "vitest";

import {
  HEAVY_RENDER_FIXTURE,
  RENDER_OPTIMIZATION_BASELINE_EXPECTATIONS,
  RENDER_OPTIMIZATION_BUDGETS,
  buildRenderOptimizationFixtureMessages,
  evaluateRenderOptimizationGate,
  fixtureStaticHotspotEstimate,
} from "./render-optimization-fixture-lib.mjs";

describe("render optimization fixture", () => {
  it("builds a deterministic heavy transcript with enough link pressure to reproduce the hotspot", () => {
    const messages = buildRenderOptimizationFixtureMessages({ threadId: "thread-a" });
    const estimate = fixtureStaticHotspotEstimate(messages);

    expect(messages).toHaveLength(HEAVY_RENDER_FIXTURE.expectedMessageCount);
    expect(estimate.assistantMessageCount).toBe(HEAVY_RENDER_FIXTURE.messagePairs);
    expect(estimate.toolMessageCount).toBe(HEAVY_RENDER_FIXTURE.messagePairs);
    expect(estimate.urlLikeTokenCount).toBeGreaterThan(RENDER_OPTIMIZATION_BASELINE_EXPECTATIONS.minInlineLinkButtons);
    expect(estimate.artifactLikeTokenCount).toBeGreaterThan(RENDER_OPTIMIZATION_BUDGETS.maxInlineLinkButtons);
  });

  it("keeps Phase 0 measurement non-blocking while supporting strict budget mode later", () => {
    const metrics = {
      messageCount: HEAVY_RENDER_FIXTURE.expectedMessageCount,
      mountedDomNodes: 12_000,
      inlineLinkButtons: 3_000,
      visibleMessageRows: 8,
      cdpLatencyP95Ms: 60,
    };

    expect(evaluateRenderOptimizationGate(metrics)).toMatchObject({ status: "passed", failures: [] });
    expect(evaluateRenderOptimizationGate(metrics, { requireBudget: true })).toMatchObject({
      status: "failed",
    });
  });
});
