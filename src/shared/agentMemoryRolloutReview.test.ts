import { describe, expect, it } from "vitest";
import {
  reviewAgentMemoryRolloutEvidence,
  type AgentMemoryRolloutEvidenceLane,
} from "./agentMemoryRolloutReview";

const passedLongTermLanes: AgentMemoryRolloutEvidenceLane[] = [
  {
    id: "flag_off_isolation",
    status: "passed",
    summary: "No Tencent runtime loaded and no memory tools registered while disabled.",
  },
  {
    id: "memory_on_recall_capture",
    status: "passed",
    summary: "Live Pi dogfood recalled a harmless durable fact after capture.",
  },
  {
    id: "memory_on_off_comparison",
    status: "passed",
    summary: "Memory-on improved recall with bounded context; memory-off stayed unchanged.",
  },
  {
    id: "context_accounting",
    status: "passed",
    summary: "Injected context stayed under the configured recall budget.",
  },
  {
    id: "deletion_privacy_language",
    status: "passed",
    summary: "Clear-memory, data-location, and export language were reviewed.",
  },
  {
    id: "native_preflight",
    status: "passed",
    summary: "Native dependency preflight passed on supported targets.",
  },
];

describe("reviewAgentMemoryRolloutEvidence", () => {
  it("keeps Tencent memory flagged when required live evidence is missing", () => {
    const review = reviewAgentMemoryRolloutEvidence({
      checkedAt: "2026-06-13T00:00:00.000Z",
      shortTermOffloadCandidate: true,
      lanes: [
        {
          id: "flag_off_isolation",
          status: "passed",
          summary: "Default-off path stays dormant.",
        },
        {
          id: "native_preflight",
          status: "blocked",
          summary: "Reviewed upstream core module is not configured.",
        },
      ],
    });

    expect(review.decision).toBe("keep_flagged");
    expect(review.blockers).toEqual(expect.arrayContaining([
      "Memory-on recall/capture evidence is missing.",
      "Native dependency preflight is blocked: Reviewed upstream core module is not configured.",
    ]));
    expect(review.advisories.join(" ")).toContain("Leave short-term offload hidden/off");
  });

  it("graduates only long-term memory when every required lane passes", () => {
    const review = reviewAgentMemoryRolloutEvidence({
      checkedAt: "2026-06-13T00:00:00.000Z",
      lanes: passedLongTermLanes,
    });

    expect(review.decision).toBe("graduate_long_term_only");
    expect(review.blockers).toEqual([]);
    expect(review.advisories).toEqual([
      "Short-term offload is outside the graduation candidate and should remain hidden/off.",
    ]);
  });

  it("reworks or removes the experiment when flag-off isolation fails", () => {
    const review = reviewAgentMemoryRolloutEvidence({
      checkedAt: "2026-06-13T00:00:00.000Z",
      lanes: [
        ...passedLongTermLanes.filter((lane) => lane.id !== "flag_off_isolation"),
        {
          id: "flag_off_isolation",
          status: "failed",
          summary: "Disabled sessions still registered memory tools.",
        },
      ],
    });

    expect(review.decision).toBe("rework_or_remove");
    expect(review.summary).toContain("critical memory safety or usefulness lane failed");
  });
});
