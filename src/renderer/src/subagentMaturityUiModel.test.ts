import { describe, expect, it } from "vitest";
import type { SubagentMaturitySnapshot } from "../../shared/subagentMaturity";
import {
  subagentMaturityDesktopDogfoodHistoryModel,
  subagentMaturityLiveHistoryModel,
  subagentMaturityWorkflowJitterReleaseProfileModel,
} from "./subagentMaturityUiModel";

describe("sub-agent maturity UI model", () => {
  it("summarizes green required-live history for graduation diagnostics", () => {
    const model = subagentMaturityLiveHistoryModel(maturity({
      defaultCanBeEnabled: true,
      blockedGateIds: [],
      liveHistory: {
        totalRunCount: 25,
        requiredRunCount: 25,
        cleanRequiredRunCount: 25,
        failedRequiredRunCount: 0,
        advisoryRequiredRunCount: 0,
        skippedEvidenceRunCount: 0,
        livePiSmokePassed: true,
        evidenceLanes: liveEvidenceLanes(25),
        failureRate: 0,
        latestCompletedAt: "2026-06-05T00:25:00.000Z",
      },
    }));

    expect(model).toMatchObject({
      statusLabel: "25/25 clean live runs",
      tone: "success",
    });
    expect(model.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "clean-required-live",
        label: "Clean required-live runs",
        value: "25/25 clean; 25 required-live total.",
        tone: "success",
      }),
      expect.objectContaining({
        id: "failure-rate",
        value: "0/25 failed (0%; limit 5%).",
        tone: "success",
      }),
      expect.objectContaining({
        id: "live-pi-smoke",
        value: "Present in required-live history.",
        tone: "success",
      }),
      expect.objectContaining({
        id: "live-evidence-lanes",
        value: "8/8 clean lanes; missing: none.",
        tone: "success",
      }),
    ]));
    expect(model.searchText).toContain("Desktop dogfood confidence");
  });

  it("flags sparse, flaky, or skipped live history in diagnostics search text", () => {
    const model = subagentMaturityLiveHistoryModel(maturity({
      blockedGateIds: ["live_dogfood_count", "live_dogfood_failure_rate", "live_smoke"],
      liveHistory: {
        totalRunCount: 3,
        requiredRunCount: 2,
        cleanRequiredRunCount: 1,
        failedRequiredRunCount: 1,
        advisoryRequiredRunCount: 0,
        skippedEvidenceRunCount: 1,
        livePiSmokePassed: false,
        evidenceLanes: liveEvidenceLanes(2, {
          "Desktop dogfood confidence": {
            presentRunCount: 0,
            skippedRunCount: 2,
            latestStatus: "skipped",
          },
        }),
        failureRate: 0.5,
      },
    }));

    expect(model).toMatchObject({
      statusLabel: "1/25 clean live runs",
      tone: "warning",
    });
    expect(model.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "failure-rate",
        value: "1/2 failed (50%; limit 5%).",
        tone: "warning",
      }),
      expect.objectContaining({
        id: "latest-required-live",
        value: "None recorded.",
        tone: "warning",
      }),
      expect.objectContaining({
        id: "skipped-evidence",
        value: "1 skipped-evidence row; 0 advisory rows.",
        tone: "warning",
      }),
      expect.objectContaining({
        id: "live-evidence-lanes",
        value: "7/8 clean lanes; missing: Desktop dogfood confidence.",
        tone: "warning",
      }),
    ]));
    expect(model.searchText).toContain("live_dogfood_failure_rate");
    expect(model.searchText).toContain("Missing from required-live history.");
    expect(model.searchText).toContain("Desktop dogfood confidence present 0 skipped 2");
  });

  it("summarizes green Desktop dogfood history for graduation diagnostics", () => {
    const model = subagentMaturityDesktopDogfoodHistoryModel(maturity({
      defaultCanBeEnabled: true,
      blockedGateIds: [],
      desktopDogfoodHistory: {
        totalRunCount: 25,
        readyRunCount: 25,
        failedRunCount: 0,
        advisoryRunCount: 0,
        visualFailureRunCount: 0,
        maturityFailureRunCount: 0,
        highLoadReadyRunCount: 25,
        screenshotRunCount: 25,
        failureRate: 0,
        latestGeneratedAt: "2026-06-05T00:25:00.000Z",
      },
    }));

    expect(model).toMatchObject({
      statusLabel: "25/25 ready Desktop runs",
      tone: "success",
    });
    expect(model.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "ready-desktop-dogfood",
        label: "Ready Desktop dogfood runs",
        value: "25/25 ready; 25 total.",
        tone: "success",
      }),
      expect.objectContaining({
        id: "desktop-failure-rate",
        value: "0/25 failed (0%; limit 5%).",
        tone: "success",
      }),
      expect.objectContaining({
        id: "desktop-visual-failures",
        value: "0 visual-failure rows; 25 rows with screenshots.",
        tone: "success",
      }),
    ]));
  });

  it("flags sparse, flaky, or visually failing Desktop dogfood history", () => {
    const model = subagentMaturityDesktopDogfoodHistoryModel(maturity({
      blockedGateIds: ["desktop_dogfood_count", "desktop_dogfood_failure_rate"],
      desktopDogfoodHistory: {
        totalRunCount: 3,
        readyRunCount: 1,
        failedRunCount: 1,
        advisoryRunCount: 1,
        visualFailureRunCount: 1,
        maturityFailureRunCount: 1,
        highLoadReadyRunCount: 1,
        screenshotRunCount: 2,
        failureRate: 1 / 3,
      },
    }));

    expect(model).toMatchObject({
      statusLabel: "1/25 ready Desktop runs",
      tone: "warning",
    });
    expect(model.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "desktop-failure-rate",
        value: "1/3 failed (33.3%; limit 5%).",
        tone: "warning",
      }),
      expect.objectContaining({
        id: "latest-desktop-dogfood",
        value: "None recorded.",
        tone: "warning",
      }),
    ]));
    expect(model.searchText).toContain("desktop_dogfood_failure_rate");
    expect(model.searchText).toContain("visual-failure row");
  });

  it("summarizes green workflow jitter release-profile evidence", () => {
    const model = subagentMaturityWorkflowJitterReleaseProfileModel(maturity({
      defaultCanBeEnabled: true,
      blockedGateIds: [],
      workflowJitterReleaseProfile: workflowJitterReleaseProfile({
        ready: true,
        status: "passed",
        latestGeneratedAt: "2026-06-05T00:40:00.000Z",
      }),
    }));

    expect(model).toMatchObject({
      statusLabel: "workflow jitter release profile ready",
      tone: "success",
    });
    expect(model.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "workflow-jitter-ready",
        value: "Ready for graduation evidence.",
        tone: "success",
      }),
      expect.objectContaining({
        id: "workflow-jitter-live-volume",
        value: "10/10 UI dogfood runs; 120/120 live prompt variants.",
        tone: "success",
      }),
      expect.objectContaining({
        id: "workflow-jitter-live-families",
        value: "6/6 families: browser, connector, document, local, model-only, recovery; missing: none.",
        tone: "success",
      }),
    ]));
    expect(model.searchText).toContain("workflow_jitter_release_profile");
    expect(model.searchText).toContain("matrix.release-profile");
  });

  it("flags missing or non-release workflow jitter evidence", () => {
    const model = subagentMaturityWorkflowJitterReleaseProfileModel(maturity({
      blockedGateIds: ["workflow_jitter_release_profile"],
      workflowJitterReleaseProfile: workflowJitterReleaseProfile({
        ready: false,
        releaseProfile: false,
        liveSkipped: true,
        matrixProfile: "phase8-smoke",
        liveDogfoodRunCount: 4,
        livePromptVariantCount: 80,
        deterministicStressUnitCount: 500,
        liveFamilies: ["browser", "document"],
        missingLiveFamilies: ["model-only", "local", "connector", "recovery"],
        blockingIssueCount: 2,
        environmentSkippedCount: 1,
        promotionCandidateCount: 1,
        matrixReleaseProfileCheckPassed: false,
      }),
    }));

    expect(model).toMatchObject({
      statusLabel: "workflow jitter release profile blocked",
      tone: "warning",
    });
    expect(model.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "workflow-jitter-mode",
        value: "profile phase8-smoke; release profile no; live required yes; live skipped yes.",
        tone: "warning",
      }),
      expect.objectContaining({
        id: "workflow-jitter-live-volume",
        value: "4/10 UI dogfood runs; 80/120 live prompt variants.",
        tone: "warning",
      }),
      expect.objectContaining({
        id: "workflow-jitter-issues",
        value: "2 blocking; 0 advisory; 0 product/test; 0 degraded; 1 skipped; 1 promotion candidates.",
        tone: "warning",
      }),
    ]));
    expect(model.searchText).toContain("missing families model-only, local, connector, recovery");
  });
});

function liveEvidenceLanes(
  presentRunCount: number,
  overrides: Record<string, Partial<{
    presentRunCount: number;
    skippedRunCount: number;
    latestStatus: "present" | "skipped";
  }>> = {},
) {
  return [
    "Ambient/Pi smoke",
    "Sub-agent confidence",
    "Workflow/Symphony confidence",
    "Local runtime confidence",
    "Restart repair confidence",
    "Lifecycle edge confidence",
    "Desktop dogfood confidence",
    "Desktop dogfood",
  ].map((label) => ({
    label,
    presentRunCount,
    skippedRunCount: 0,
    latestStatus: "present" as const,
    ...overrides[label],
  }));
}

function maturity(overrides: Partial<SubagentMaturitySnapshot> = {}): SubagentMaturitySnapshot {
  const blockedGateIds = overrides.blockedGateIds ?? ["live_dogfood_count"];
  return {
    schemaVersion: "ambient-subagent-maturity-v1",
    createdAt: "2026-06-05T00:00:00.000Z",
    status: blockedGateIds.length ? "blocked" : "ready_to_graduate",
    defaultCanBeEnabled: false,
    summary: "Sub-agent default enablement is blocked by 1 maturity gate.",
    criteria: {
      minLiveDogfoodRuns: 25,
      maxLiveDogfoodFailureRate: 0.05,
      minDesktopDogfoodRuns: 25,
      maxDesktopDogfoodFailureRate: 0.05,
      maxFailedSpawnRate: 0.05,
    },
    liveHistory: {
      totalRunCount: 0,
      requiredRunCount: 0,
      cleanRequiredRunCount: 0,
      failedRequiredRunCount: 0,
      advisoryRequiredRunCount: 0,
      skippedEvidenceRunCount: 0,
      livePiSmokePassed: false,
    },
    desktopDogfoodHistory: {
      totalRunCount: 0,
      readyRunCount: 0,
      failedRunCount: 0,
      advisoryRunCount: 0,
      visualFailureRunCount: 0,
      maturityFailureRunCount: 0,
      highLoadReadyRunCount: 0,
      screenshotRunCount: 0,
    },
    workflowJitterReleaseProfile: workflowJitterReleaseProfile(),
    blockedGateIds,
    warningGateIds: [],
    gates: [
      {
        id: "live_dogfood_count",
        status: blockedGateIds.includes("live_dogfood_count") ? "blocked" : "passed",
        label: "Live dogfood volume",
        required: "25 clean required-live dogfood runs.",
        actual: "0 clean recorded.",
      },
      {
        id: "live_dogfood_failure_rate",
        status: blockedGateIds.includes("live_dogfood_failure_rate") ? "blocked" : "passed",
        label: "Live dogfood failure rate",
        required: "Required-live dogfood run failures at or below 5%.",
        actual: "No required-live release-gate history supplied.",
      },
      {
        id: "live_smoke",
        status: blockedGateIds.includes("live_smoke") ? "blocked" : "passed",
        label: "Live Pi smoke",
        required: "At least one live Ambient/Pi child session smoke passes behind the flag.",
        actual: "Missing or failed.",
      },
    ],
    ...overrides,
  };
}

function workflowJitterReleaseProfile(
  overrides: Partial<SubagentMaturitySnapshot["workflowJitterReleaseProfile"]> = {},
): SubagentMaturitySnapshot["workflowJitterReleaseProfile"] {
  return {
    ready: true,
    status: "passed",
    schemaVersion: 1,
    releaseProfile: true,
    liveRequired: true,
    liveSkipped: false,
    matrixProfile: "release",
    deterministicStressUnitCount: 1000,
    livePromptVariantCount: 120,
    liveDogfoodRunCount: 10,
    liveFamilies: ["browser", "connector", "document", "local", "model-only", "recovery"],
    missingLiveFamilies: [],
    productOrTestFailureCount: 0,
    providerDegradedCount: 0,
    environmentSkippedCount: 0,
    promotionCandidateCount: 0,
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
    matrixReleaseProfileCheckPassed: true,
    latestGeneratedAt: "2026-06-05T00:40:00.000Z",
    reportPath: "test-results/workflow-jitter-release-gate/latest.json",
    matrixReportPath: "test-results/workflow-jitter-matrix/latest.json",
    ...overrides,
  };
}
