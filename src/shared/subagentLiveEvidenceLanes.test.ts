import { describe, expect, it } from "vitest";
import {
  SUBAGENT_LIVE_EVIDENCE_DECISION_FIELDS,
  SUBAGENT_LIVE_EVIDENCE_LABELS,
  SUBAGENT_LIVE_EVIDENCE_LANES,
  validateSubagentLiveEvidenceLaneDefinitions,
} from "./subagentLiveEvidenceLanes";

describe("sub-agent live evidence lanes", () => {
  it("defines the release-gate lanes once, including child authority and Desktop dogfood confidence", () => {
    expect(validateSubagentLiveEvidenceLaneDefinitions()).toEqual([]);
    expect(SUBAGENT_LIVE_EVIDENCE_LANES).toHaveLength(10);
    expect(SUBAGENT_LIVE_EVIDENCE_DECISION_FIELDS).toEqual([
      "liveSkipped",
      "liveConfidenceSkipped",
      "liveAuthorityConfidenceSkipped",
      "liveWorkflowConfidenceSkipped",
      "liveWorkflowBroaderConfidenceSkipped",
      "liveLocalRuntimeConfidenceSkipped",
      "liveRestartRepairConfidenceSkipped",
      "liveLifecycleEdgeConfidenceSkipped",
      "liveDesktopDogfoodConfidenceSkipped",
      "desktopDogfoodSkipped",
    ]);
    expect(SUBAGENT_LIVE_EVIDENCE_LABELS).toEqual([
      "Ambient/Pi smoke",
      "Sub-agent confidence",
      "Child authority confidence",
      "Workflow/Symphony confidence",
      "Broader Workflow/Symphony confidence",
      "Local runtime confidence",
      "Restart repair confidence",
      "Lifecycle edge confidence",
      "Desktop dogfood confidence",
      "Desktop dogfood",
    ]);
  });

  it("flags duplicate fields or labels before they can skew maturity history", () => {
    expect(validateSubagentLiveEvidenceLaneDefinitions([
      { field: "liveSkipped", label: "Ambient/Pi smoke" },
      { field: "liveSkipped", label: "Ambient/Pi smoke" },
    ])).toEqual(expect.arrayContaining([
      "Live evidence lane field liveSkipped is duplicated.",
      "Live evidence lane label Ambient/Pi smoke is duplicated.",
    ]));
  });
});
