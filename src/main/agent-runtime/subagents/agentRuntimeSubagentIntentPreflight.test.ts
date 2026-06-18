import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../../../shared/featureFlags";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  applyExplicitSubagentRequestGuidance,
  detectSubagentOrchestrationPattern,
  explicitSubagentRequestPreflight,
  hasExplicitSubagentRequest,
} from "./agentRuntimeSubagentIntentPreflight";

describe("agentRuntimeSubagentIntentPreflight", () => {
  it("detects explicit subagent wording without matching generic agent wording", () => {
    expect(hasExplicitSubagentRequest("Use one feedback subagent and a separate judge subagent.")).toBe(true);
    expect(hasExplicitSubagentRequest("Spawn two child agents and compare their results.")).toBe(true);
    expect(hasExplicitSubagentRequest("Please use ambient_subagent for this.")).toBe(true);
    expect(hasExplicitSubagentRequest("Ask an agent to think carefully about the draft.")).toBe(false);
  });

  it("ignores product-owned child task scaffolding while preserving actual nested requests", () => {
    expect(hasExplicitSubagentRequest("Sub-agent task: What is 2+2? Reply with just the number.")).toBe(false);
    expect(hasExplicitSubagentRequest("Ambient sub-agent child run.\nSub-agent task: Summarize the essay.")).toBe(false);
    expect(hasExplicitSubagentRequest("Sub-agent task: Launch a sub-agent to judge this.")).toBe(true);
  });

  it("blocks explicit subagent requests when ambient.subagents is disabled", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Use a feedback subagent and a judge subagent.",
      thread: thread(),
      featureFlags: resolveAmbientFeatureFlags(),
      activeToolNames: [],
    });

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "ambient.subagents is disabled.",
    });
    expect(result.kind === "blocked" ? result.message : "").toContain("I will not simulate sub-agents");
  });

  it("blocks explicit subagent requests when the tool is not active despite the flag", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Use a child agent for review.",
      thread: thread(),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: [],
    });

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "ambient_subagent is not active for this thread.",
    });
  });

  it("blocks nested child fanout instead of allowing roleplay", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Launch a sub-agent to judge this.",
      thread: thread({ kind: "subagent_child" }),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: [],
    });

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "Nested sub-agent fanout is disabled for child threads.",
    });
  });

  it("does not block ordinary product-created child tasks as nested fanout", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Sub-agent task: Return ambient-subagent-structured-result-v1 JSON with roleId reviewer.",
      thread: thread({ kind: "subagent_child" }),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: [],
    });

    expect(result).toEqual({ kind: "none" });
  });

  it("does not treat product-owned child role labels as nested fanout", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Sub-agent task: You are a FEEDBACK subagent for an iterative essay improvement loop. Read the current essay and provide exactly one improvement idea.",
      thread: thread({ kind: "subagent_child" }),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: [],
    });

    expect(result).toEqual({ kind: "none" });
  });

  it("still blocks product-created child tasks that ask for real nested fanout", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Sub-agent task: You are a judge subagent. Launch a sub-agent to compare this with another essay.",
      thread: thread({ kind: "subagent_child" }),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: [],
    });

    expect(result).toMatchObject({
      kind: "blocked",
      reason: "Nested sub-agent fanout is disabled for child threads.",
    });
  });

  it("adds turn-scoped guidance when the real subagent tool is available", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Use one feedback subagent and one judge subagent.",
      thread: thread(),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: ["ambient_subagent"],
    });

    expect(result).toMatchObject({ kind: "ready" });
    const guided = applyExplicitSubagentRequestGuidance("User request", result.kind === "ready" ? result.guidance : "");
    expect(guided).toContain("Use ambient_subagent with spawn_agent");
    expect(guided).toContain("Do not simulate sub-agents");
    expect(guided).not.toContain("iterative_child_evaluation_loop");
  });

  it("adds iterative child-evaluation loop guidance for matching delegation loops", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: [
        "Improve a short essay using feedback subagents and judge subagents until score plateau.",
        "In each loop, use one feedback idea, then ask a separate judge subagent to rescore.",
        "Save a score table with version, judge score, delta, and plateau counter.",
        "Stop after two non-improvements or eight attempts.",
      ].join(" "),
      thread: thread(),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: ["ambient_subagent"],
    });

    expect(result).toMatchObject({ kind: "ready" });
    const guidance = result.kind === "ready" ? result.guidance : "";
    expect(guidance).toContain("Workflow pattern: iterative_child_evaluation_loop");
    expect(guidance).toContain("Completion requires running the loop");
    expect(guidance).toContain("spawn a feedback/proposer child");
  });

  it("detects reusable six-pattern orchestration opportunities from natural user requests", () => {
    expect(detectSubagentOrchestrationPattern([
      "I have three possible long-weekend trips and I am overwhelmed.",
      "Can you compare them for cost, travel hassle, weather risk, and how relaxing they are?",
      "- Santa Fe",
      "- San Diego",
      "- Denver",
    ].join("\n"))).toMatchObject({ id: "map_reduce" });
    expect(detectSubagentOrchestrationPattern(
      "I am considering removing a complicated feature because it slows the team down. Can you help me think through whether that is wise before I decide?",
    )).toMatchObject({ id: "debate" });
    expect(detectSubagentOrchestrationPattern(
      "Here is a rough announcement for customers. Please make it sound clear and confident, but I want it checked carefully before I use it. Facts that must remain and forbidden claims are listed.",
    )).toMatchObject({ id: "imitate_verify" });
    expect(detectSubagentOrchestrationPattern(
      "I am hosting friends and want dinner to feel thoughtful but easy. Can you turn that into a menu, shopping list, and day-of timing plan with constraints?",
    )).toMatchObject({ id: "pipeline" });
    expect(detectSubagentOrchestrationPattern([
      "I am hosting six friends this weekend and I want dinner to feel thoughtful but easy.",
      "Can you help me turn that into a menu, shopping list, and day-of timing plan?",
      "Time constraints: maximum 90 minutes active cooking on Saturday.",
      "Risk: Phoenix heat makes heavy oven use unpleasant, so oven time should be batched or limited.",
    ].join("\n"))).toMatchObject({ id: "pipeline" });
    expect(detectSubagentOrchestrationPattern(
      "Can you make me a simple habit tracker web page and keep checking it until it seems ready to use?",
    )).toMatchObject({ id: "self_healing" });
    expect(detectSubagentOrchestrationPattern(
      "Give me several alternative proposals and score them with a rubric so I can pick the best.",
    )).toMatchObject({ id: "ensemble" });
  });

  it("adds turn-scoped guidance for natural orchestration patterns when the real tool is active", () => {
    const result = explicitSubagentRequestPreflight({
      prompt: "Here is a rough announcement. Please polish it and check carefully that all required facts remain.",
      thread: thread(),
      featureFlags: resolveAmbientFeatureFlags({ startup: { enabled: ["ambient.subagents"], disabled: [] } }),
      activeToolNames: ["ambient_subagent"],
    });

    expect(result).toMatchObject({ kind: "ready" });
    const guidance = result.kind === "ready" ? result.guidance : "";
    expect(guidance).toContain("Ambient sub-agent orchestration pattern detected: Imitate and Verify.");
    expect(guidance).toContain("Use ambient_subagent with spawn_agent");
    expect(guidance).toContain("roleId drafter");
    expect(guidance).toContain("dependencyMode required");
    expect(guidance).toContain("Wait for the drafter, then pass the draft text/result");
    expect(guidance).toContain("omit toolScope/workspace.write");
  });

  it("keeps natural orchestration hints invisible when subagents are not available", () => {
    expect(explicitSubagentRequestPreflight({
      prompt: "Please compare these three options and choose the best.",
      thread: thread(),
      featureFlags: resolveAmbientFeatureFlags(),
      activeToolNames: [],
    })).toEqual({ kind: "none" });
  });
});

function thread(overrides: Partial<ThreadSummary> = {}): Pick<ThreadSummary, "kind"> {
  return {
    kind: "chat",
    ...overrides,
  } as ThreadSummary;
}
