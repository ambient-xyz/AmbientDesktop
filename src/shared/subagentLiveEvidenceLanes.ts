import laneData from "./subagentLiveEvidenceLanes.json";

export const SUBAGENT_LIVE_EVIDENCE_LANES_SCHEMA_VERSION = "ambient-subagent-live-evidence-lanes-v1" as const;

export interface SubagentLiveEvidenceLaneDefinition {
  field: string;
  label: string;
}

const parsedLaneData = laneData as {
  schemaVersion?: string;
  lanes?: SubagentLiveEvidenceLaneDefinition[];
};

export const SUBAGENT_LIVE_EVIDENCE_LANES: readonly SubagentLiveEvidenceLaneDefinition[] =
  Object.freeze((parsedLaneData.lanes ?? []).map((lane) => Object.freeze({
    field: lane.field,
    label: lane.label,
  })));

export const SUBAGENT_LIVE_EVIDENCE_LABELS: readonly string[] =
  Object.freeze(SUBAGENT_LIVE_EVIDENCE_LANES.map((lane) => lane.label));

export const SUBAGENT_LIVE_EVIDENCE_DECISION_FIELDS: readonly string[] =
  Object.freeze(SUBAGENT_LIVE_EVIDENCE_LANES.map((lane) => lane.field));

export function validateSubagentLiveEvidenceLaneDefinitions(
  lanes: readonly SubagentLiveEvidenceLaneDefinition[] = SUBAGENT_LIVE_EVIDENCE_LANES,
): string[] {
  const issues: string[] = [];
  if (parsedLaneData.schemaVersion !== SUBAGENT_LIVE_EVIDENCE_LANES_SCHEMA_VERSION) {
    issues.push(`Live evidence lane schema is ${parsedLaneData.schemaVersion ?? "missing"}.`);
  }
  if (!lanes.length) issues.push("At least one live evidence lane is required.");
  const fieldCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  for (const lane of lanes) {
    if (!lane.field) issues.push("Live evidence lane field is missing.");
    if (!lane.label) issues.push("Live evidence lane label is missing.");
    fieldCounts.set(lane.field, (fieldCounts.get(lane.field) ?? 0) + 1);
    labelCounts.set(lane.label, (labelCounts.get(lane.label) ?? 0) + 1);
  }
  for (const [field, count] of fieldCounts) {
    if (field && count > 1) issues.push(`Live evidence lane field ${field} is duplicated.`);
  }
  for (const [label, count] of labelCounts) {
    if (label && count > 1) issues.push(`Live evidence lane label ${label} is duplicated.`);
  }
  return issues;
}
