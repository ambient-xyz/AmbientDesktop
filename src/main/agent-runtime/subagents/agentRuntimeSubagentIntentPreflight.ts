import {
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../../../shared/featureFlags";
import type { ThreadSummary } from "../../../shared/types";
import {
  detectIterativeChildEvaluationPattern,
  stripProductSubagentPromptScaffolding,
} from "../agentRuntimeIterativeChildEvaluationPattern";
import { AMBIENT_SUBAGENT_TOOL_NAME } from "../../subagents/subagentPiTools";

const EXPLICIT_SUBAGENT_PATTERNS = [
  /\bambient_subagent\b/i,
  /\bsub[-\s]?agents?\b/i,
  /\bchild[-\s]?agents?\b/i,
];

export type SubagentOrchestrationPatternId =
  | "map_reduce"
  | "debate"
  | "imitate_verify"
  | "pipeline"
  | "ensemble"
  | "self_healing";

export interface DetectedSubagentOrchestrationPattern {
  id: SubagentOrchestrationPatternId;
  label: string;
  guidance: string;
}

export type ExplicitSubagentRequestPreflight =
  | {
      kind: "none";
    }
  | {
      kind: "ready";
      guidance: string;
    }
  | {
      kind: "blocked";
      reason: string;
      message: string;
    };

export interface ExplicitSubagentRequestPreflightInput {
  prompt: string;
  thread: Pick<ThreadSummary, "kind">;
  featureFlags: AmbientFeatureFlagSnapshot;
  activeToolNames: readonly string[];
}

export function hasExplicitSubagentRequest(prompt: string): boolean {
  const detectablePrompt = stripProductSubagentPromptScaffolding(prompt);
  return EXPLICIT_SUBAGENT_PATTERNS.some((pattern) => pattern.test(detectablePrompt));
}

export function detectSubagentOrchestrationPattern(prompt: string): DetectedSubagentOrchestrationPattern | undefined {
  const detectablePrompt = stripProductSubagentPromptScaffolding(prompt);
  const normalized = detectablePrompt.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(normalized);

  if (
    has(/\b(make|build|create|write)\b[\s\S]{0,160}\b(app|web\s?page|html|tool|tracker)\b/) &&
    has(/\b(keep checking|test(?:ing)?|repair|fix|ready to use|edge cases?)\b/)
  ) {
    return pattern(
      "self_healing",
      "Self-Healing Loop",
      [
        "- Spawn a required worker child only for workspace mutations or artifact writes; worker requires isolated-worktree mutation evidence.",
        "- Spawn a required reviewer/tester child to check objective edge cases or acceptance criteria after the attempt is available.",
        "- If the tester finds issues, use bounded required repair children and wait again before final synthesis.",
      ],
    );
  }

  if (
    has(/\b(announcement|draft|copy|message|email|customer|release note)\b/) &&
    (has(/\b(polish|rewrite|edit|make it sound|tone)\b/) || has(/\b(check(?:ed)? carefully|verify|facts? that must remain|forbidden claims?)\b/))
  ) {
    return pattern(
      "imitate_verify",
      "Imitate and Verify",
      [
        "- First spawn a required drafter child with roleId drafter and dependencyMode required to produce the improved copy without workspace writes.",
        "- Wait for the drafter, then pass the draft text/result to a separate required reviewer child with roleId reviewer and dependencyMode required.",
        "- Wait for the verifier before presenting the final copy and verification table; if verifier returns blocked/needs_attention/failed, ask or retry instead of completing directly.",
      ],
    );
  }

  if (
    has(/\b(compare|rank|choose|which one|evaluate)\b/) &&
    (has(/\b(options?|choices?|candidates?|trips?|files?|sources?|slices?)\b/) || bulletLikeItemCount(detectablePrompt) >= 3)
  ) {
    return pattern(
      "map_reduce",
      "Map-Reduce",
      [
        "- Spawn one required explorer child per independent option/source/slice with dependencyMode required.",
        "- Spawn a required summarizer/reducer or perform the reducer step only after required mapper children finish.",
        "- The final synthesis should preserve missing-data caveats and identify which child outputs it used.",
      ],
    );
  }

  if (
    has(/\b(turn that into|turn this into|plan|menu|shopping list|timeline|schedule|stages?|handoff)\b/) &&
    has(/\b(constraints?|shopping|timing|timeline|prep|stage|sequence|handoff)\b/)
  ) {
    return pattern(
      "pipeline",
      "Pipeline",
      [
        "- Spawn ordered required stage children only when the previous stage has produced the needed contract.",
        "- Use roleId explorer for constraint discovery, roleId drafter for non-mutating plan/menu/content stages, roleId reviewer for gates, and roleId worker only for actual workspace mutations.",
        "- Each child should name its input contract and bounded output for the next stage.",
        "- Stop or ask if a stage contract is missing or contradictory instead of silently continuing.",
      ],
    );
  }

  if (
    has(/\b(decision|wise|whether|remove|keep|trade[-\s]?off|pros? and cons?|think through)\b/) &&
    has(/\b(considering|decide|before i decide|should i|should we|would it be)\b/)
  ) {
    return pattern(
      "debate",
      "Adversarial Debate",
      [
        "- Spawn required reviewer children with distinct stances or stakeholder perspectives.",
        "- Require each child to name its strongest evidence and strongest objection to its own view.",
        "- Use a rubric or convergence/dissent summary before making the parent recommendation.",
      ],
    );
  }

  if (
    has(/\b(multiple|several|alternatives?|drafts?|proposals?|versions?)\b/) &&
    has(/\b(score|rubric|choose|pick|best|compare)\b/)
  ) {
    return pattern(
      "ensemble",
      "Ensemble",
      [
        "- Spawn independent required drafter or explorer proposal children with minimal shared framing.",
        "- Score the alternatives with an explicit rubric.",
        "- Preserve runners-up and dissenting alternatives for inspection.",
      ],
    );
  }

  return undefined;
}

export function explicitSubagentRequestPreflight(
  input: ExplicitSubagentRequestPreflightInput,
): ExplicitSubagentRequestPreflight {
  const explicit = hasExplicitSubagentRequest(input.prompt);
  const implicitPattern = explicit ? undefined : detectSubagentOrchestrationPattern(input.prompt);
  if (!explicit && !implicitPattern) return { kind: "none" };

  const hasSubagentTool = input.activeToolNames.includes(AMBIENT_SUBAGENT_TOOL_NAME);
  if (isAmbientSubagentsEnabled(input.featureFlags) && input.thread.kind !== "subagent_child" && hasSubagentTool) {
    const pattern = detectIterativeChildEvaluationPattern(input.prompt);
    return {
      kind: "ready",
      guidance: [
        explicit ? explicitSubagentRequestGuidance() : implicitSubagentPatternGuidance(implicitPattern!),
        pattern?.guidance,
      ].filter(Boolean).join("\n\n"),
    };
  }

  if (!explicit) return { kind: "none" };

  const reason = !isAmbientSubagentsEnabled(input.featureFlags)
    ? "ambient.subagents is disabled."
    : input.thread.kind === "subagent_child"
      ? "Nested sub-agent fanout is disabled for child threads."
      : "ambient_subagent is not active for this thread.";

  return {
    kind: "blocked",
    reason,
    message: [
      `Real Ambient sub-agents are unavailable for this request: ${reason}`,
      "I will not simulate sub-agents with ordinary assistant prose, shell prompts, or scratch files.",
      "Enable ambient.subagents and retry the request to use visible child-thread sub-agents.",
    ].join("\n"),
  };
}

export function applyExplicitSubagentRequestGuidance(prompt: string, guidance: string): string {
  return `${prompt}\n\n${guidance}`;
}

function explicitSubagentRequestGuidance(): string {
  return [
    "Explicit Ambient sub-agent request:",
    "- The user explicitly asked for sub-agent or child-agent delegation.",
    `- Use ${AMBIENT_SUBAGENT_TOOL_NAME} with spawn_agent for each required child before doing the delegated work.`,
    "- Do not simulate sub-agents by writing role prompts into shell commands, files, or assistant prose.",
    "- Wait for required children with wait_agent before synthesizing the parent answer.",
  ].join("\n");
}

function implicitSubagentPatternGuidance(pattern: DetectedSubagentOrchestrationPattern): string {
  return [
    `Ambient sub-agent orchestration pattern detected: ${pattern.label}.`,
    "- The user did not name sub-agents, but this request has independent branches, verification, staged handoff, alternatives, or build-test-repair structure where visible child threads improve reliability and inspectability.",
    `- Use ${AMBIENT_SUBAGENT_TOOL_NAME} with spawn_agent for the child work before doing the parent synthesis.`,
    "- For every child whose result is needed for the answer, pass dependencyMode required at spawn time; optional_background is only for work the parent can safely ignore.",
    "- Use roleId worker only when the child will mutate files or artifacts inside an isolated worktree. Use drafter for non-mutating copy/proposals/plans, explorer for research, reviewer for checks, and summarizer for reducers.",
    "- Give each child a short, descriptive task title/summary so the UI can show what the parent is waiting on.",
    "- Use wait_agent with required_all or the specific required child before synthesizing; do not synthesize from failed, stopped, needs_attention, or partial children unless the user explicitly accepts partial work.",
    "- If a required wait fails, times out, or returns a child supervisor request, ask/retry/forward the request instead of doing the child's work in the parent.",
    "- Keep child tool scopes to least privilege for the child task.",
    "- For drafting, planning, reviewing, and other non-mutating child work, omit toolScope/workspace.write and do not ask the child to write markdown files; the child transcript and structured result are retained and inspectable.",
    pattern.guidance,
  ].join("\n");
}

function pattern(
  id: SubagentOrchestrationPatternId,
  label: string,
  guidance: string[],
): DetectedSubagentOrchestrationPattern {
  return { id, label, guidance: guidance.join("\n") };
}

function bulletLikeItemCount(prompt: string): number {
  return prompt.split(/\r?\n/).filter((line) => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line)).length;
}
