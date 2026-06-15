import { describe, expect, it } from "vitest";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import { buildPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import { subagentPatternGraphRendererModel } from "./subagentPatternGraphUiModel";

describe("subagent pattern graph renderer UI model", () => {
  it("positions all six known Symphony pattern layouts", () => {
    for (const patternId of SYMPHONY_WORKFLOW_PATTERN_IDS) {
      const model = subagentPatternGraphRendererModel(buildPatternGraphSnapshot({
        patternId,
        parentThreadId: "parent-thread",
        parentMessageId: "message-1",
        updatedAt: "2026-06-13T00:00:00.000Z",
      }));

      expect(model).toMatchObject({
        schemaVersion: "ambient-subagent-pattern-graph-renderer-v1",
        patternId,
        layout: patternId,
        viewBox: "0 0 720 260",
      });
      expect(model.ariaLabel).toContain("child thread pattern graph");
      expect(model.nodes.length).toBeGreaterThanOrEqual(2);
      expect(model.edges.length).toBeGreaterThanOrEqual(1);
      for (const node of model.nodes) {
        expect(node.width).toBeGreaterThan(80);
        expect(node.height).toBeGreaterThan(40);
        expect(node.centerX).toBeGreaterThanOrEqual(0);
        expect(node.centerX).toBeLessThanOrEqual(720);
        expect(node.centerY).toBeGreaterThanOrEqual(0);
        expect(node.centerY).toBeLessThanOrEqual(260);
      }
    }
  });

  it("surfaces blocking, approval, overflow, and click-through metadata", () => {
    const model = subagentPatternGraphRendererModel(buildPatternGraphSnapshot({
      patternId: "map_reduce",
      parentThreadId: "parent-thread",
      parentMessageId: "message-1",
      updatedAt: "2026-06-13T00:00:00.000Z",
      maxVisibleChildrenPerRole: 1,
      childBindings: [
        {
          roleNodeId: "mapper",
          childRunId: "run-1",
          childThreadId: "thread-1",
          label: "Mapper 1",
          status: "running",
          blockingParent: true,
        },
        {
          roleNodeId: "mapper",
          childRunId: "run-2",
          childThreadId: "thread-2",
          label: "Mapper 2",
          status: "running",
          blockingParent: true,
        },
        {
          roleNodeId: "reducer",
          childRunId: "run-3",
          childThreadId: "thread-3",
          label: "Reducer",
          status: "needs_attention",
          approvalState: "pending",
          blockingParent: true,
        },
      ],
    }));

    expect(model.summary).toContain("grouped");
    expect(model.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Mapper 1",
        childThreadId: "thread-1",
        canOpen: true,
        blockingParent: true,
        tone: "active",
      }),
      expect.objectContaining({
        label: "+1 Mapper",
        overflowLabel: "1 grouped",
        canExpandOverflow: true,
        canOpen: false,
        overflowChildren: [
          expect.objectContaining({
            childRunId: "run-2",
            childThreadId: "thread-2",
            label: "Mapper 2",
            statusLabel: "Running",
            tone: "active",
            canOpen: true,
          }),
        ],
      }),
      expect.objectContaining({
        label: "Reducer",
        approvalLabel: "Approval needed",
        badges: expect.arrayContaining([
          expect.objectContaining({ key: "blocking", label: "Blocking" }),
          expect.objectContaining({ key: "approval", label: "Approval needed" }),
        ]),
        tone: "warning",
      }),
    ]));
    expect(model.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "mapper:run-1",
        to: "reducer:run-3",
        statusLabel: "Approval Needed",
        blockingParent: true,
        tone: "warning",
      }),
    ]));
  });
});
