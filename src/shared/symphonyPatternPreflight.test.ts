import { describe, expect, it } from "vitest";

import {
  resolveSymphonyPatternPreflight,
  symphonyPatternClarificationMessage,
} from "./symphonyPatternPreflight";

describe("Symphony pattern preflight", () => {
  it("selects Map-Reduce for wide comparison over sources or options", () => {
    const result = resolveSymphonyPatternPreflight("Compare each of these six source packets and synthesize a cited recommendation.");

    expect(result.kind).toBe("selected");
    expect(result.kind === "selected" ? result.selected.patternId : undefined).toBe("map_reduce");
  });

  it("selects the other five planned Symphony patterns from clear user wording", () => {
    expect(selectedPattern("Debate the risks and benefits from opposing perspectives, then converge on a recommendation.")).toBe("adversarial_debate");
    expect(selectedPattern("Draft the implementation and have an independent reviewer verify tests and weak spots.")).toBe("imitate_and_verify");
    expect(selectedPattern("Fetch evidence, cite it, then synthesize a report in staged handoffs.")).toBe("pipeline");
    expect(selectedPattern("Generate several alternative implementation approaches, score them with a rubric, and choose the winner.")).toBe("ensemble");
    expect(selectedPattern("Fix the failing behavior, run checks, and keep repairing until tests pass.")).toBe("self_healing_loop");
  });

  it("asks a bounded multiple-choice question with a custom refinement action when the request is ambiguous", () => {
    const result = resolveSymphonyPatternPreflight("Help me with this.");

    expect(result.kind).toBe("clarify");
    if (result.kind !== "clarify") return;
    expect(result.candidates).toHaveLength(3);
    expect(result.customOption.label).toBe("Custom details");
    expect(symphonyPatternClarificationMessage(result)).toContain("Custom");
  });
});

function selectedPattern(goal: string) {
  const result = resolveSymphonyPatternPreflight(goal);
  return result.kind === "selected" ? result.selected.patternId : undefined;
}
