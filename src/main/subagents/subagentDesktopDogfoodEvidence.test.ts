import { describe, expect, it } from "vitest";
import type { SubagentMaturityEvidence } from "../../shared/subagentMaturity";
import {
  buildSubagentDesktopDogfoodHistoryEntry,
  recordSubagentDesktopDogfoodEvidence,
  type SubagentDesktopDogfoodArtifact,
  type SubagentDesktopDogfoodEvidenceStore,
} from "./subagentDesktopDogfoodEvidence";

describe("subagentDesktopDogfoodEvidence", () => {
  it("records passed Desktop dogfood artifacts as maturity evidence with a history entry", () => {
    const { store, calls } = captureStore();

    const record = recordSubagentDesktopDogfoodEvidence(store, {
      artifact: dogfoodArtifact(),
      artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      runId: "desktop-dogfood-run-1",
      createdAt: "2026-06-05T02:00:00.000Z",
    });

    expect(record).toMatchObject({
      schemaVersion: "ambient-subagent-desktop-dogfood-evidence-v1",
      status: "passed",
      ready: true,
      issues: [],
      historyEntry: {
        schemaVersion: "ambient-subagent-desktop-dogfood-history-v1",
        runId: "desktop-dogfood-run-1",
        reportPath: "test-results/subagent-desktop-dogfood/latest.json",
        ready: true,
        scenarioCount: 23,
        requiredScenarioMissing: [],
        screenshotCount: 2,
        criticalOverlapCount: 0,
        horizontalOverflowFree: true,
        workflowHighLoadPatternCount: 6,
      },
    });
    expect(calls).toEqual([
      expect.objectContaining({
        kind: "desktop_dogfood_run",
        status: "passed",
        evidenceKey: "desktop-dogfood:desktop-dogfood-run-1",
        runId: "desktop-dogfood-run-1",
        parentRunId: "parent-run-1",
        artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
        notes: "Full Ambient Desktop dogfood passed with required scenarios, screenshots, visual assertions, maturity assertions, layout checks, and six-pattern workflow high-load proof.",
        details: expect.objectContaining({
          schemaVersion: "ambient-subagent-desktop-dogfood-evidence-v1",
          evidenceType: "desktop_dogfood_run",
          desktopDogfoodArtifact: expect.objectContaining({
            schemaVersion: "ambient-subagent-desktop-dogfood-v1",
            classification: "passed",
          }),
          desktopDogfoodHistoryEntry: expect.objectContaining({
            ready: true,
            visualAssertionSummary: {
              requiredCount: 14,
              passedCount: 14,
              failedCount: 0,
              missingCount: 0,
            },
            maturityAssertionSummary: {
              requiredCount: 16,
              passedCount: 16,
              failedCount: 0,
              missingCount: 0,
            },
          }),
          issues: [],
        }),
      }),
    ]);
  });

  it("records failed Desktop dogfood maturity evidence with actionable issues", () => {
    const { store, calls } = captureStore();
    const incomplete = dogfoodArtifact({
      classification: "failed",
      featureFlag: "ambient.other",
      scenarios: ["seeded_visible_child_cluster"],
      artifacts: {},
      checks: { layout: { horizontalOverflowFree: false, criticalOverlapCount: 2 } },
      visualAssertions: {
        parent_child_placement: { id: "parent_child_placement", status: "passed", evidence: ["cluster visible"], artifactRefs: [] },
      },
      workflowHighLoadPatternLabels: ["Map-Reduce"],
      error: "Layout regression",
    });

    const record = recordSubagentDesktopDogfoodEvidence(store, {
      artifact: incomplete,
      artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      createdAt: "2026-06-05T02:01:00.000Z",
    });

    expect(record.status).toBe("failed");
    expect(record.ready).toBe(false);
    expect(record.historyEntry).toMatchObject({
      ready: false,
      requiredScenarioMissing: [
        "approval_parent_blocking",
        "workflow_execution_parent_blocking",
        "mutating_worker_dogfood_behavior",
        "workflow_high_load_dogfood",
        "denied_scope_explanation_behavior",
        "approval_forwarding_behavior",
        "restart_rehydration_behavior",
        "workflow_rehydrated_navigation_behavior",
        "workflow_artifact_rehydration_behavior",
        "inline_child_transcript_behavior",
        "completed_child_terminal_transcript_behavior",
        "pattern_graph_completed_child_clickthrough_behavior",
        "local_runtime_ownership_ui",
        "untracked_runtime_safety_behavior",
        "lifecycle_edge_desktop_behavior",
        "lifecycle_terminal_child_transcript_behavior",
        "parent_stop_cascade_desktop_behavior",
        "parent_stop_terminal_child_transcript_behavior",
        "operator_child_controls",
        "operator_control_behavior",
        "multi_parent_cluster_stress",
        "chat_export_child_bundle",
      ],
      visualAssertionSummary: {
        requiredCount: 14,
        passedCount: 1,
        failedCount: 0,
        missingCount: 13,
      },
      maturityAssertionSummary: {
        requiredCount: 16,
        passedCount: 16,
        failedCount: 0,
        missingCount: 0,
      },
      screenshotCount: 0,
      criticalOverlapCount: 2,
      horizontalOverflowFree: false,
      workflowHighLoadPatternCount: 1,
    });
    expect(calls[0]).toMatchObject({
      kind: "desktop_dogfood_run",
      status: "failed",
      notes: expect.stringContaining("Full Ambient Desktop dogfood did not pass maturity evidence"),
      details: expect.objectContaining({
        issues: expect.arrayContaining([
          "Desktop dogfood artifact classification is failed; expected passed.",
          "Desktop dogfood artifact featureFlag is ambient.other; expected ambient.subagents.",
          "Desktop dogfood artifact has missing or failed visual assertions.",
          "Desktop dogfood artifact is missing screenshot evidence.",
          "Desktop dogfood artifact reports horizontal overflow or lacks layout checks.",
          "Desktop dogfood artifact reports 2 critical layout overlaps.",
          "Desktop dogfood artifact has 1 workflow high-load pattern labels; expected at least 6.",
          "Desktop dogfood artifact includes an error.",
        ]),
      }),
    });
  });

  it("builds history entries from artifacts without recording", () => {
    expect(buildSubagentDesktopDogfoodHistoryEntry(dogfoodArtifact(), {
      artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      runId: "desktop-dogfood-run-2",
      generatedAt: "2026-06-05T02:02:00.000Z",
    })).toMatchObject({
      runId: "desktop-dogfood-run-2",
      reportPath: "test-results/subagent-desktop-dogfood/latest.json",
      ready: true,
      generatedAt: "2026-06-05T02:02:00.000Z",
      blockingIssueCount: 0,
    });
  });
});

function captureStore(): {
  store: SubagentDesktopDogfoodEvidenceStore;
  calls: Array<Parameters<SubagentDesktopDogfoodEvidenceStore["recordSubagentMaturityEvidence"]>[0]>;
} {
  const calls: Array<Parameters<SubagentDesktopDogfoodEvidenceStore["recordSubagentMaturityEvidence"]>[0]> = [];
  return {
    calls,
    store: {
      recordSubagentMaturityEvidence(input): SubagentMaturityEvidence {
        calls.push(input);
        return {
          schemaVersion: "ambient-subagent-maturity-evidence-v1",
          id: `${input.kind}:${input.evidenceKey ?? calls.length}`,
          kind: input.kind,
          status: input.status,
          evidenceKey: input.evidenceKey,
          runId: input.runId,
          parentRunId: input.parentRunId,
          artifactPath: input.artifactPath,
          notes: input.notes,
          details: input.details,
          createdAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
          updatedAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
        };
      },
    },
  };
}

function dogfoodArtifact(overrides: Partial<SubagentDesktopDogfoodArtifact> = {}): SubagentDesktopDogfoodArtifact {
  const base: SubagentDesktopDogfoodArtifact = {
    schemaVersion: "ambient-subagent-desktop-dogfood-v1",
    status: "passed",
    classification: "passed",
    generatedAt: "2026-06-05T02:00:00.000Z",
    provider: "gmi-cloud",
    featureFlag: "ambient.subagents",
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    childRunIds: ["child-run-1"],
    childThreadIds: ["child-thread-1"],
    scenarios: [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "workflow_execution_parent_blocking",
      "mutating_worker_dogfood_behavior",
      "workflow_high_load_dogfood",
      "denied_scope_explanation_behavior",
      "approval_forwarding_behavior",
      "restart_rehydration_behavior",
      "workflow_rehydrated_navigation_behavior",
      "workflow_artifact_rehydration_behavior",
      "inline_child_transcript_behavior",
      "completed_child_terminal_transcript_behavior",
      "pattern_graph_completed_child_clickthrough_behavior",
      "local_runtime_ownership_ui",
      "untracked_runtime_safety_behavior",
      "lifecycle_edge_desktop_behavior",
      "lifecycle_terminal_child_transcript_behavior",
      "parent_stop_cascade_desktop_behavior",
      "parent_stop_terminal_child_transcript_behavior",
      "operator_child_controls",
      "operator_control_behavior",
      "multi_parent_cluster_stress",
      "chat_export_child_bundle",
    ],
    artifacts: {
      collapsedDesktopScreenshot: "collapsed-desktop.png",
      expandedDesktopScreenshot: "expanded-desktop.png",
    },
    checks: {
      collapsed: {
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      },
      expanded: {
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      },
    },
    visualAssertions: Object.fromEntries([
      "parent_child_placement",
      "default_collapsed_state",
      "inline_child_mini_thread_chrome",
      "blocking_attention_indicators",
      "approval_runtime_ownership_labels",
      "denied_scope_explanations",
      "layout_safety",
      "mutating_worker_evidence",
      "workflow_high_load",
      "pattern_graph_runtime",
      "workflow_artifact_rehydration",
      "workflow_task_continuity",
      "lifecycle_edge_visibility",
      "parent_stop_cascade_visibility",
    ].map((id) => [id, { id, status: "passed", evidence: [`${id} passed`], artifactRefs: ["expanded-desktop.png"] }])),
    maturityAssertions: Object.fromEntries([
      "desktop_child_visibility",
      "desktop_approval_forwarding",
      "desktop_denied_scope_explanations",
      "desktop_workflow_execution",
      "desktop_mutating_worker_dogfood",
      "desktop_workflow_high_load",
      "desktop_pattern_graph_runtime",
      "desktop_workflow_artifact_rehydration",
      "desktop_restart_rehydration",
      "desktop_workflow_rehydrated_navigation",
      "desktop_local_runtime_ownership",
      "desktop_operator_controls",
      "desktop_visual_layout_safety",
      "desktop_multi_cluster_stress",
      "desktop_lifecycle_edges",
      "desktop_chat_export_child_bundle",
    ].map((id) => [id, { id, status: "passed", capabilities: [id], evidence: [`${id} passed`], artifactRefs: ["expanded-desktop.png"] }])),
    workflowHighLoadPatternLabels: [
      "Symphony Map-Reduce",
      "Symphony Adversarial Debate",
      "Symphony Imitate and Verify",
      "Symphony Pipeline",
      "Symphony Ensemble",
      "Symphony Self-Healing Loop",
    ],
  };
  return {
    ...base,
    ...overrides,
  };
}
