export const AGENT_MEMORY_ROLLOUT_REVIEW_SCHEMA_VERSION =
  "ambient-agent-memory-rollout-review-v1" as const;

export type AgentMemoryRolloutDecision =
  | "keep_flagged"
  | "graduate_long_term_only"
  | "rework_or_remove";

export type AgentMemoryRolloutEvidenceStatus = "passed" | "failed" | "missing" | "blocked";

export type AgentMemoryRolloutLaneId =
  | "flag_off_isolation"
  | "memory_on_recall_capture"
  | "memory_on_off_comparison"
  | "context_accounting"
  | "deletion_privacy_language"
  | "native_preflight"
  | "short_term_offload";

export interface AgentMemoryRolloutEvidenceLane {
  id: AgentMemoryRolloutLaneId;
  status: AgentMemoryRolloutEvidenceStatus;
  summary: string;
  evidenceRefs?: string[];
}

export interface AgentMemoryRolloutReviewInput {
  checkedAt?: string;
  lanes: readonly AgentMemoryRolloutEvidenceLane[];
  shortTermOffloadCandidate?: boolean;
}

export interface AgentMemoryRolloutReview {
  schemaVersion: typeof AGENT_MEMORY_ROLLOUT_REVIEW_SCHEMA_VERSION;
  checkedAt: string;
  decision: AgentMemoryRolloutDecision;
  decisionLabel: string;
  summary: string;
  blockers: string[];
  advisories: string[];
  nextActions: string[];
  lanes: AgentMemoryRolloutEvidenceLane[];
}

const REQUIRED_LONG_TERM_LANES: readonly AgentMemoryRolloutLaneId[] = [
  "flag_off_isolation",
  "memory_on_recall_capture",
  "memory_on_off_comparison",
  "context_accounting",
  "deletion_privacy_language",
  "native_preflight",
];

const CRITICAL_FAILURE_LANES = new Set<AgentMemoryRolloutLaneId>([
  "flag_off_isolation",
  "memory_on_recall_capture",
  "deletion_privacy_language",
]);

const LANE_LABELS: Record<AgentMemoryRolloutLaneId, string> = {
  flag_off_isolation: "Flag-off isolation",
  memory_on_recall_capture: "Memory-on recall/capture",
  memory_on_off_comparison: "Memory-on/off dogfood comparison",
  context_accounting: "Context accounting",
  deletion_privacy_language: "Deletion and privacy language",
  native_preflight: "Native dependency preflight",
  short_term_offload: "Short-term offload",
};

export function reviewAgentMemoryRolloutEvidence(
  input: AgentMemoryRolloutReviewInput,
): AgentMemoryRolloutReview {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const lanes = normalizeRolloutLanes(input.lanes);
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const blockers: string[] = [];
  const advisories: string[] = [];

  for (const id of REQUIRED_LONG_TERM_LANES) {
    const lane = laneById.get(id);
    if (!lane) {
      blockers.push(`${LANE_LABELS[id]} evidence is missing.`);
      continue;
    }
    if (lane.status !== "passed") {
      blockers.push(`${LANE_LABELS[id]} is ${lane.status}: ${lane.summary}`);
    }
  }

  const hasCriticalFailure = lanes.some((lane) =>
    CRITICAL_FAILURE_LANES.has(lane.id) && lane.status === "failed"
  );
  const offloadLane = laneById.get("short_term_offload");
  if (offloadLane?.status === "passed") {
    advisories.push("Short-term offload has positive evidence, but should still dogfood separately after long-term memory.");
  } else if (input.shortTermOffloadCandidate || offloadLane) {
    const status = offloadLane?.status ?? "missing";
    const summary = offloadLane?.summary ?? "No short-term offload dogfood evidence has been recorded.";
    advisories.push(`Leave short-term offload hidden/off; evidence is ${status}: ${summary}`);
  } else {
    advisories.push("Short-term offload is outside the graduation candidate and should remain hidden/off.");
  }

  const decision: AgentMemoryRolloutDecision = hasCriticalFailure
    ? "rework_or_remove"
    : blockers.length === 0
      ? "graduate_long_term_only"
      : "keep_flagged";

  return {
    schemaVersion: AGENT_MEMORY_ROLLOUT_REVIEW_SCHEMA_VERSION,
    checkedAt,
    decision,
    decisionLabel: decisionLabel(decision),
    summary: decisionSummary(decision, blockers.length),
    blockers,
    advisories,
    nextActions: nextActionsForDecision(decision),
    lanes,
  };
}

export function agentMemoryRolloutLaneLabel(id: AgentMemoryRolloutLaneId): string {
  return LANE_LABELS[id];
}

function normalizeRolloutLanes(
  lanes: readonly AgentMemoryRolloutEvidenceLane[],
): AgentMemoryRolloutEvidenceLane[] {
  const seen = new Set<AgentMemoryRolloutLaneId>();
  const normalized: AgentMemoryRolloutEvidenceLane[] = [];
  for (const lane of lanes) {
    if (seen.has(lane.id)) continue;
    seen.add(lane.id);
    normalized.push({
      id: lane.id,
      status: lane.status,
      summary: lane.summary.trim() || "No summary recorded.",
      ...(lane.evidenceRefs?.length ? { evidenceRefs: [...lane.evidenceRefs] } : {}),
    });
  }
  return normalized;
}

function decisionLabel(decision: AgentMemoryRolloutDecision): string {
  switch (decision) {
    case "graduate_long_term_only":
      return "Graduate long-term only";
    case "rework_or_remove":
      return "Rework or remove";
    case "keep_flagged":
      return "Keep flagged";
  }
}

function decisionSummary(decision: AgentMemoryRolloutDecision, blockerCount: number): string {
  switch (decision) {
    case "graduate_long_term_only":
      return "Long-term memory has enough bounded evidence to graduate while short-term offload remains separate.";
    case "rework_or_remove":
      return "A critical memory safety or usefulness lane failed; do not broaden rollout without redesign.";
    case "keep_flagged":
      return `${blockerCount} long-term graduation blocker${blockerCount === 1 ? "" : "s"} remain.`;
  }
}

function nextActionsForDecision(decision: AgentMemoryRolloutDecision): string[] {
  switch (decision) {
    case "graduate_long_term_only":
      return [
        "Prepare a long-term-memory-only rollout with the kill switch still available.",
        "Keep short-term offload behind its separate default-off setting.",
      ];
    case "rework_or_remove":
      return [
        "Fix the failed critical lane before collecting more rollout evidence.",
        "Keep the default-off flag and consider removing the experiment if the failure is inherent.",
      ];
    case "keep_flagged":
      return [
        "Keep the experiment default-off and workspace-local.",
        "Collect the missing live memory-on/off comparison, native preflight, and privacy/deletion evidence.",
      ];
  }
}
