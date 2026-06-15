import { describe, expect, it } from "vitest";
import {
  SUBAGENT_LIVE_EVIDENCE_DECISIONS,
  SUBAGENT_LIVE_EVIDENCE_LABELS,
  validateSubagentLiveEvidenceLaneDefinitions,
} from "./subagent-live-evidence-lanes.mjs";

describe("sub-agent live evidence lane script contract", () => {
  it("exposes the same release-gate decision order used by live history rows", () => {
    expect(validateSubagentLiveEvidenceLaneDefinitions()).toEqual([]);
    expect(SUBAGENT_LIVE_EVIDENCE_DECISIONS).toEqual([
      ["liveSkipped", "Ambient/Pi smoke"],
      ["liveConfidenceSkipped", "Sub-agent confidence"],
      ["liveAuthorityConfidenceSkipped", "Child authority confidence"],
      ["liveWorkflowConfidenceSkipped", "Workflow/Symphony confidence"],
      ["liveWorkflowBroaderConfidenceSkipped", "Broader Workflow/Symphony confidence"],
      ["liveLocalRuntimeConfidenceSkipped", "Local runtime confidence"],
      ["liveRestartRepairConfidenceSkipped", "Restart repair confidence"],
      ["liveLifecycleEdgeConfidenceSkipped", "Lifecycle edge confidence"],
      ["liveDesktopDogfoodConfidenceSkipped", "Desktop dogfood confidence"],
      ["desktopDogfoodSkipped", "Desktop dogfood"],
    ]);
    expect(SUBAGENT_LIVE_EVIDENCE_LABELS).toEqual(expect.arrayContaining([
      "Child authority confidence",
      "Desktop dogfood confidence",
    ]));
  });
});
