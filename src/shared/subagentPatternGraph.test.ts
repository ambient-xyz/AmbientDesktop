import { describe, expect, it } from "vitest";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "./symphonyWorkflowRecipes";
import {
  buildDefaultSymphonyPatternRoleGraph,
  buildPatternGraphSnapshot,
  effectiveSubagentRoleSnapshot,
  isSubagentEffectiveRoleSnapshot,
  SUBAGENT_EFFECTIVE_ROLE_SNAPSHOT_SCHEMA_VERSION,
  SUBAGENT_PATTERN_GRAPH_SNAPSHOT_SCHEMA_VERSION,
  SUBAGENT_PATTERN_ROLE_GRAPH_SCHEMA_VERSION,
  type SubagentPatternGraphChildBinding,
  validatePatternGraphSnapshot,
} from "./subagentPatternGraph";

describe("subagent pattern graph contract", () => {
  it("compiles all six Symphony patterns into role graphs with non-widening overlays", () => {
    for (const patternId of SYMPHONY_WORKFLOW_PATTERN_IDS) {
      const graph = buildDefaultSymphonyPatternRoleGraph(patternId);

      expect(graph.schemaVersion).toBe(SUBAGENT_PATTERN_ROLE_GRAPH_SCHEMA_VERSION);
      expect(graph.patternId).toBe(patternId);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);
      for (const node of graph.nodes) {
        expect(node.baseRole).toMatch(/^(explorer|drafter|reviewer|summarizer|worker)$/);
        expect(node.patternRole).toMatch(/^[a-z_]+$/);
        expect(node.roleOverlayIds.length).toBeGreaterThan(0);
        expect(node.overlayLabels.length).toBe(node.roleOverlayIds.length);
      }
    }

    expect(buildDefaultSymphonyPatternRoleGraph("map_reduce").nodes.map((node) => `${node.baseRole}+${node.patternRole}`)).toEqual([
      "explorer+mapper",
      "summarizer+reducer",
      "reviewer+validator",
    ]);
    expect(buildDefaultSymphonyPatternRoleGraph("self_healing_loop").nodes.map((node) => node.patternRole)).toEqual([
      "repair_worker",
      "verifier",
      "repair_worker",
      "checkpoint_recorder",
    ]);
  });

  it("creates effective role snapshots that cannot widen base role authority", () => {
    const snapshot = effectiveSubagentRoleSnapshot({
      baseRole: "explorer",
      patternRole: "mapper",
      overlayLabels: ["slice assignment", "extraction schema"],
      outputContract: "schema-valid mapped slice",
    });

    expect(snapshot).toMatchObject({
      schemaVersion: SUBAGENT_EFFECTIVE_ROLE_SNAPSHOT_SCHEMA_VERSION,
      baseRole: "explorer",
      patternRole: "mapper",
      displayLabel: "Explorer + Mapper",
      nonWidening: true,
      outputContract: "schema-valid mapped slice",
    });
    expect(snapshot.roleOverlayIds).toEqual(["mapper.slice-assignment", "mapper.extraction-schema"]);
    expect(snapshot.overlays).toEqual([
      expect.objectContaining({ narrowsAuthority: true, widensAuthority: false }),
      expect.objectContaining({ narrowsAuthority: true, widensAuthority: false }),
    ]);
    expect(isSubagentEffectiveRoleSnapshot(snapshot, "explorer")).toBe(true);
    expect(isSubagentEffectiveRoleSnapshot(snapshot, "reviewer")).toBe(false);
    expect(isSubagentEffectiveRoleSnapshot({
      ...snapshot,
      nonWidening: false,
    }, "explorer")).toBe(false);
    expect(isSubagentEffectiveRoleSnapshot({
      ...snapshot,
      overlays: [{ ...snapshot.overlays[0]!, widensAuthority: true }],
    }, "explorer")).toBe(false);
  });

  it("builds runtime-owned pattern graph snapshots with grouped fanout overflow", () => {
    const snapshot = buildPatternGraphSnapshot({
      patternId: "map_reduce",
      parentThreadId: "parent-thread",
      parentMessageId: "message-1",
      workflowTaskId: "workflow-task-1",
      workflowRunId: "workflow-run-1",
      updatedAt: "2026-06-13T00:00:00.000Z",
      maxVisibleChildrenPerRole: 2,
      childBindings: [
        child("mapper", 1, "running"),
        child("mapper", 2, "completed"),
        child("mapper", 3, "running"),
        child("reducer", 1, "needs_attention", "pending"),
      ],
    });

    expect(snapshot).toMatchObject({
      schemaVersion: SUBAGENT_PATTERN_GRAPH_SNAPSHOT_SCHEMA_VERSION,
      version: 1,
      patternId: "map_reduce",
      layout: "map_reduce",
      parentThreadId: "parent-thread",
      parentMessageId: "message-1",
      workflowTaskId: "workflow-task-1",
      workflowRunId: "workflow-run-1",
    });
    expect(snapshot.nodes.map((node) => [node.id, node.status, node.approvalState, node.overflowCount])).toEqual([
      ["mapper:child-run-1", "running", "none", undefined],
      ["mapper:child-run-2", "completed", "none", undefined],
      ["mapper:overflow", "running", "none", 1],
      ["reducer:child-run-1", "blocked", "pending", undefined],
      ["validator", "queued", "none", undefined],
    ]);
    expect(snapshot.nodes.find((node) => node.id === "mapper:overflow")).toMatchObject({
      statusLabel: "1 running",
      blockingParent: true,
      overflowChildren: [{
        childRunId: "child-run-3",
        childThreadId: "child-thread-3",
        label: "mapper 3",
        status: "running",
        statusLabel: "Running",
        blockingParent: true,
        approvalState: "none",
      }],
    });
    expect(snapshot.edges.some((edge) => edge.from === "mapper:overflow" && edge.to === "reducer:child-run-1")).toBe(true);
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "mapper:child-run-1",
        to: "reducer:child-run-1",
        status: "approval_needed",
        statusLabel: "Approval Needed",
        blockingParent: true,
      }),
      expect.objectContaining({
        from: "reducer:child-run-1",
        to: "validator",
        status: "approval_needed",
        statusLabel: "Approval Needed",
        blockingParent: false,
      }),
    ]));
    expect(validatePatternGraphSnapshot(snapshot)).toEqual([]);
  });

  it("reports malformed snapshots before renderer or export use", () => {
    const snapshot = buildPatternGraphSnapshot({
      patternId: "imitate_and_verify",
      parentThreadId: "parent-thread",
      updatedAt: "2026-06-13T00:00:00.000Z",
    });
    const broken = {
      ...snapshot,
      parentThreadId: "",
      edges: [{ ...snapshot.edges[0]!, from: "missing-node" }],
    };

    expect(validatePatternGraphSnapshot(broken)).toEqual([
      "Pattern graph snapshot is missing parentThreadId.",
      expect.stringContaining("references missing from node missing-node"),
    ]);
  });
});

function child(
  roleNodeId: string,
  index: number,
  status: NonNullable<SubagentPatternGraphChildBinding["status"]>,
  approvalState: "none" | "pending" = "none",
): SubagentPatternGraphChildBinding {
  return {
    roleNodeId,
    childRunId: `child-run-${index}`,
    childThreadId: `child-thread-${index}`,
    label: `${roleNodeId} ${index}`,
    status,
    approvalState,
    blockingParent: true,
  };
}
