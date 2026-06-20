import {
  getSymphonyWorkflowRecipePreset,
  SYMPHONY_WORKFLOW_PATTERN_IDS,
  type SymphonyWorkflowPatternId,
} from "./symphonyWorkflowRecipes";

export const SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION = "ambient-symphony-pattern-preflight-v1" as const;

export interface SymphonyPatternPreflightCandidate {
  patternId: SymphonyWorkflowPatternId;
  label: string;
  confidence: number;
  rationale: string;
  rolePlan: string[];
  expectedChildren: string;
}

export type SymphonyPatternPreflightResult =
  | {
    schemaVersion: typeof SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION;
    kind: "selected";
    selected: SymphonyPatternPreflightCandidate;
    candidates: SymphonyPatternPreflightCandidate[];
  }
  | {
    schemaVersion: typeof SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION;
    kind: "clarify";
    question: string;
    candidates: SymphonyPatternPreflightCandidate[];
    customOption: {
      id: "custom";
      label: string;
      description: string;
    };
    missingInputs: string[];
  };

const PATTERN_SIGNALS: Record<SymphonyWorkflowPatternId, { rationale: string; expectedChildren: string; patterns: RegExp[] }> = {
  map_reduce: {
    rationale: "The request asks Symphony to split comparable inputs, inspect them independently, and reduce the findings.",
    expectedChildren: "One explorer child per file, source, option, record set, or slice, plus a reducer/summarizer.",
    patterns: [
      /\b(compare|summari[sz]e|extract|audit|analy[sz]e|review)\b[\s\S]{0,90}\b(files?|sources?|documents?|records?|rows?|chunks?|options?|cities|vendors|products|articles|links)\b/i,
      /\b(across|each|every|per)\b[\s\S]{0,80}\b(file|source|document|record|row|chunk|option)\b/i,
      /\b(cited|coverage|schema|table)\b[\s\S]{0,80}\b(summary|synthesis|answer|recommendation)\b/i,
    ],
  },
  adversarial_debate: {
    rationale: "The request asks for opposed perspectives, tradeoff pressure, or convergence after critique.",
    expectedChildren: "Two or more stance children plus a convergence summarizer that preserves dissent.",
    patterns: [
      /\b(debate|argue|adversarial|opposing|dissent|steelman|red team|counterargument)\b/i,
      /\b(risks?|benefits?|pros?|cons?|tradeoffs?)\b[\s\S]{0,90}\b(converge|decide|recommend|best)\b/i,
    ],
  },
  imitate_and_verify: {
    rationale: "The request separates production from independent verification.",
    expectedChildren: "A drafter/worker child and an independent verifier/reviewer child.",
    patterns: [
      /\b(draft|write|produce|implement|create)\b[\s\S]{0,100}\b(verify|review|check|test|validate|critique)\b/i,
      /\b(independent|separate)\b[\s\S]{0,80}\b(verifier|reviewer|check)\b/i,
    ],
  },
  pipeline: {
    rationale: "The request is naturally staged, where one output becomes the next stage's input.",
    expectedChildren: "Ordered stage children with explicit handoff contracts and stage validation.",
    patterns: [
      /\b(pipeline|stages?|step by step|handoff|then)\b[\s\S]{0,100}\b(fetch|extract|transform|cite|synthesi[sz]e|review|apply|verify)\b/i,
      /\b(fetch|collect)\b[\s\S]{0,60}\b(cite|extract)\b[\s\S]{0,60}\b(synthesi[sz]e|report)\b/i,
    ],
  },
  ensemble: {
    rationale: "The request asks for independent alternatives that should be scored or compared.",
    expectedChildren: "Several proposal children plus a rubric-based selector/summarizer.",
    patterns: [
      /\b(multiple|several|different|alternative|competing)\b[\s\S]{0,80}\b(drafts?|plans?|approaches|proposals|options)\b/i,
      /\b(generate|come up with|brainstorm)\b[\s\S]{0,80}\b(options|alternatives|drafts|approaches)\b/i,
      /\b(score|rank|rubric|winner|best)\b[\s\S]{0,80}\b(options|alternatives|drafts|approaches)\b/i,
    ],
  },
  self_healing_loop: {
    rationale: "The request asks for attempts to be measured and repaired until objective checks pass.",
    expectedChildren: "A worker child, a verifier child, and bounded repair iterations against objective checks.",
    patterns: [
      /\b(fix|repair|debug|self[-\s]?heal|iterate|keep trying)\b[\s\S]{0,100}\b(tests?|checks?|until|passes?|working|green)\b/i,
      /\b(run|measure|test)\b[\s\S]{0,80}\b(fix|repair|iterate|retry)\b/i,
    ],
  },
};

export function resolveSymphonyPatternPreflight(goal: string): SymphonyPatternPreflightResult {
  const normalized = goal.trim();
  const candidates = rankedPatternCandidates(normalized);
  const [first, second] = candidates;
  if (normalized.length >= 12 && first && first.confidence >= 0.4 && first.confidence - (second?.confidence ?? 0) >= 0.16) {
    return {
      schemaVersion: SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION,
      kind: "selected",
      selected: first,
      candidates: candidates.slice(0, 3),
    };
  }
  return {
    schemaVersion: SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION,
    kind: "clarify",
    question: "Which Symphony pattern should coordinate this request?",
    candidates: candidates.slice(0, 3),
    customOption: {
      id: "custom",
      label: "Custom details",
      description: "Add custom orchestration details to the request, then send again.",
    },
    missingInputs: [
      normalized ? "Select a pattern before launch." : "Describe the workflow goal.",
      "Confirm the metric or rubric that makes the pattern objectively checkable.",
    ],
  };
}

export function symphonyPatternClarificationMessage(result: Extract<SymphonyPatternPreflightResult, { kind: "clarify" }>): string {
  const choices = result.candidates
    .map((candidate) => `${candidate.label} - ${candidate.rationale}`)
    .join(" ");
  return `${result.question} Choose one of the highlighted Symphony pattern buttons: ${choices} Need a custom shape? Use Custom details to refine the request before launching.`;
}

function rankedPatternCandidates(goal: string): SymphonyPatternPreflightCandidate[] {
  return SYMPHONY_WORKFLOW_PATTERN_IDS
    .map((patternId) => candidateForPattern(patternId, goal))
    .sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label));
}

function candidateForPattern(patternId: SymphonyWorkflowPatternId, goal: string): SymphonyPatternPreflightCandidate {
  const preset = getSymphonyWorkflowRecipePreset(patternId);
  const signal = PATTERN_SIGNALS[patternId];
  const matchCount = signal.patterns.reduce((count, pattern) => count + (pattern.test(goal) ? 1 : 0), 0);
  const directNameBoost = goal.toLowerCase().includes(preset.label.toLowerCase()) ? 1 : 0;
  const confidence = Math.min(0.95, 0.2 + (matchCount * 0.24) + (directNameBoost * 0.4));
  return {
    patternId,
    label: preset.label,
    confidence: Number(confidence.toFixed(2)),
    rationale: matchCount || directNameBoost ? signal.rationale : `Possible ${preset.label} fit, but the request does not provide strong pattern signals yet.`,
    rolePlan: preset.defaultRoles.map((role) => role.replaceAll("_", " ")),
    expectedChildren: signal.expectedChildren,
  };
}
