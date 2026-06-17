import { describe, expect, it } from "vitest";

import {
  detectIterativeChildEvaluationPattern,
  stripProductSubagentPromptScaffolding,
} from "./agentRuntimeIterativeChildEvaluationPattern";

describe("agentRuntimeIterativeChildEvaluationPattern", () => {
  it("detects iterative child feedback and judge loops with measurable stop rules", () => {
    const result = detectIterativeChildEvaluationPattern(
      "Create a skill that improves a short essay using feedback subagents and judge subagents until score plateau. " +
        "In each loop, incorporate one subagent feedback idea, then ask a separate judge subagent to rescore. " +
        "Save a score table with version, feedback idea used, judge score, delta, and plateau counter. " +
        "Stop after the score fails to improve for two successive turns or after eight attempts.",
    );

    expect(result).toMatchObject({ kind: "iterative_child_evaluation_loop" });
    expect(result?.guidance).toContain("Completion requires running the loop");
    expect(result?.guidance).toContain("then exercise it on a small sample");
    expect(result?.guidance).toContain("append an iteration row");
    expect(result?.guidance).toContain("do not call the child a subagent");
    expect(result?.guidance).toContain("Children cannot discover hidden sibling transcripts");
    expect(result?.guidance).toContain("nested toolScope.childAuthority");
    expect(result?.guidance).toContain("structured summary/evidence");
    expect(result?.guidance).toContain("score table is absent");
  });

  it("does not match one-shot child reviews or generic improvement requests", () => {
    expect(detectIterativeChildEvaluationPattern("Ask a reviewer subagent to critique this essay once.")).toBeUndefined();
    expect(detectIterativeChildEvaluationPattern("Improve this essay and save the final version.")).toBeUndefined();
    expect(detectIterativeChildEvaluationPattern("Use one subagent to summarize the notes and report back.")).toBeUndefined();
  });

  it("ignores product-owned child prompt labels before matching", () => {
    expect(stripProductSubagentPromptScaffolding("Sub-agent task: What is 2+2?")).toBe("What is 2+2?");
    expect(stripProductSubagentPromptScaffolding("Ambient sub-agent child run.\nSub-agent task: Summarize this.")).toBe("\nSummarize this.");
    expect(stripProductSubagentPromptScaffolding(
      'Sub-agent task: Return ambient-subagent-structured-result-v1 JSON with roleId "reviewer".',
    )).toBe('Return  JSON with roleId "reviewer".');
    expect(stripProductSubagentPromptScaffolding(
      "Sub-agent task: You are a FEEDBACK subagent for an iterative essay improvement loop. Read this essay and provide one idea.",
    )).toBe("Read this essay and provide one idea.");
    expect(stripProductSubagentPromptScaffolding(
      "Sub-agent task: You are a judge subagent. Launch a sub-agent to compare this with another essay.",
    )).toBe("Launch a sub-agent to compare this with another essay.");
  });
});
