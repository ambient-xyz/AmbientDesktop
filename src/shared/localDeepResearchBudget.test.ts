import { describe, expect, it } from "vitest";

import {
  LOCAL_DEEP_RESEARCH_MAX_TOOL_CALLS,
  LOCAL_DEEP_RESEARCH_RUN_BUDGET_SCHEMA_VERSION,
  localDeepResearchToolBudgetState,
  normalizeLocalDeepResearchRunBudget,
  normalizeLocalDeepResearchRunBudgetSettings,
  resolveLocalDeepResearchRunBudget,
} from "./localDeepResearchBudget";

describe("local deep research budgets", () => {
  it("normalizes persisted defaults and resolves a per-run override", () => {
    const settings = normalizeLocalDeepResearchRunBudgetSettings({
      defaultEffort: "deep",
      onExhausted: "summarize",
    });

    expect(settings).toEqual({
      schemaVersion: LOCAL_DEEP_RESEARCH_RUN_BUDGET_SCHEMA_VERSION,
      defaultEffort: "deep",
      onExhausted: "summarize",
    });
    expect(resolveLocalDeepResearchRunBudget(settings)).toMatchObject({
      enabled: true,
      effort: "deep",
      maxToolCalls: 60,
      source: "user_default",
      onExhausted: "summarize",
    });
    expect(resolveLocalDeepResearchRunBudget(settings, { effort: "quick" })).toMatchObject({
      effort: "quick",
      maxToolCalls: 10,
      source: "run_override",
    });
  });

  it("clamps tool-input budgets and reports remaining calls deterministically", () => {
    const budget = normalizeLocalDeepResearchRunBudget({
      effort: "custom",
      maxToolCalls: 999,
      source: "tool_input",
    });

    expect(budget.maxToolCalls).toBe(LOCAL_DEEP_RESEARCH_MAX_TOOL_CALLS);
    expect(localDeepResearchToolBudgetState(budget, 2)).toMatchObject({
      maxToolCalls: LOCAL_DEEP_RESEARCH_MAX_TOOL_CALLS,
      usedToolCalls: 2,
      remainingToolCalls: LOCAL_DEEP_RESEARCH_MAX_TOOL_CALLS - 2,
      exhausted: false,
    });
    expect(localDeepResearchToolBudgetState(budget, LOCAL_DEEP_RESEARCH_MAX_TOOL_CALLS)).toMatchObject({
      remainingToolCalls: 0,
      exhausted: true,
    });
  });
});
