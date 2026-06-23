import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LocalDeepResearchRunBudget } from "../../shared/localRuntimeTypes";
import { AppComposerLocalDeepResearchControl } from "./AppComposerLocalDeepResearchControl";

describe("AppComposerLocalDeepResearchControl", () => {
  it("renders nothing while Local Deep Research is unavailable", () => {
    expect(renderControl({ ready: false })).toBe("");
  });

  it("renders a disabled planner-mode toggle without using native title tooltips", () => {
    const markup = renderControl({ collaborationMode: "planner" });

    expect(markup).toContain("local-deep-research-composer-button");
    expect(markup).toContain("Switch to Agent mode before running Local Deep Research.");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("disabled=\"\"");
    expect(markup).not.toContain("title=");
  });

  it("renders the armed effort chip with the current budget summary", () => {
    const markup = renderControl({
      modeArmed: true,
      runBudget: runBudget({ effort: "balanced", maxToolCalls: 25 }),
    });

    expect(markup).toContain("local-deep-research-composer-button active");
    expect(markup).toContain("local-deep-research-effort-picker");
    expect(markup).toContain("Local Deep Research effort: 25 tool calls.");
    expect(markup).toContain("Effort: Balanced");
    expect(markup).toContain('aria-expanded="false"');
  });

  it("disables both mode and effort controls while a Local Deep Research run is active", () => {
    const markup = renderControl({
      modeArmed: true,
      runActive: true,
    });

    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain("Disable Local Deep Research");
  });
});

function renderControl(overrides: Partial<Parameters<typeof AppComposerLocalDeepResearchControl>[0]> = {}): string {
  return renderToStaticMarkup(
    <AppComposerLocalDeepResearchControl
      ready={true}
      runActive={false}
      modeArmed={false}
      collaborationMode="agent"
      runBudget={runBudget()}
      onToggleMode={vi.fn()}
      onSelectEffort={vi.fn()}
      onCustomMaxToolCallsChange={vi.fn()}
      {...overrides}
    />,
  );
}

function runBudget(overrides: Partial<LocalDeepResearchRunBudget> = {}): LocalDeepResearchRunBudget {
  return {
    schemaVersion: "ambient-local-deep-research-run-budget-v1",
    enabled: true,
    effort: "quick",
    maxToolCalls: 10,
    source: "user_default",
    onExhausted: "ask_to_continue",
    ...overrides,
  };
}
