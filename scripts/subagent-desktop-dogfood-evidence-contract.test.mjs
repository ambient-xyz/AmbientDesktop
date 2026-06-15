import { describe, expect, it } from "vitest";
import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
  REQUIRED_DESKTOP_MATURITY_ASSERTIONS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";

describe("sub-agent Desktop dogfood evidence contract", () => {
  it("keeps full-app scenario coverage in one shared release-gate contract", () => {
    expect(REQUIRED_DESKTOP_DOGFOOD_SCENARIOS).toEqual([
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
    ]);
  });

  it("requires visual assertions for workflow, runtime, lifecycle, and layout proof", () => {
    expect(REQUIRED_DESKTOP_VISUAL_ASSERTIONS).toEqual([
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
    ]);
  });

  it("keeps release-gate maturity capabilities aligned with Desktop evidence rows", () => {
    expect(REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS).toEqual([
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
    ]);
    expect(REQUIRED_DESKTOP_MATURITY_ASSERTIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "desktop_child_visibility",
        capabilities: expect.arrayContaining(["inline_child_mini_thread_chrome", "inline_child_live_transcript_primary"]),
      }),
      expect.objectContaining({
        id: "desktop_workflow_high_load",
        capabilities: expect.arrayContaining(["workflow_high_load_dogfood", "symphony_six_patterns"]),
      }),
      expect.objectContaining({
        id: "desktop_pattern_graph_runtime",
        capabilities: expect.arrayContaining(["pattern_graph_snapshot_persistence", "child_thread_click_through"]),
      }),
      expect.objectContaining({
        id: "desktop_local_runtime_ownership",
        capabilities: expect.arrayContaining(["local_runtime_lease_ownership", "lease_stop_blocker", "untracked_runtime_safety"]),
      }),
      expect.objectContaining({
        id: "desktop_lifecycle_edges",
        capabilities: expect.arrayContaining(["lifecycle_terminal_child_transcript_behavior", "timeout_edge", "partial_result_edge", "retry_edge", "detach_edge", "parent_stop_cascade", "parent_stop_terminal_child_transcript_behavior"]),
      }),
      expect.objectContaining({
        id: "desktop_chat_export_child_bundle",
        capabilities: expect.arrayContaining([
          "child_transcript_export",
          "child_full_transcript_export",
          "policy_provenance_export",
          "pattern_graph_export_links",
          "parent_mailbox_approval_export",
          "child_pi_session_status_export",
          "wait_barrier_export",
          "result_artifact_export",
          "lifecycle_edge_child_export",
          "parent_stop_child_export",
        ]),
      }),
    ]));
  });
});
