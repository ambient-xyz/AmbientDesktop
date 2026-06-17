import { describe, expect, it } from "vitest";
import type { WorkflowProgramIR } from "../../shared/workflowProgramIr";
import { lowerWorkflowProgram, type WorkflowProgramLoweredOperationCacheEntry } from "./workflowProgramLowering";

function fixtureProgram(overrides: Partial<WorkflowProgramIR> = {}): WorkflowProgramIR {
  return {
    version: 1,
    title: "Lowering fixture",
    goal: "Build a stable lowered plan from a dependency graph.",
    nodes: [
      { id: "diagnose", kind: "model.call", dependsOn: ["search"], task: "diagnose.results", input: { evidence: { fromNode: "search" } }, output: { schema: { summary: "string" } } },
      { id: "final-output", kind: "output.final", dependsOn: ["diagnose"], value: { summary: { fromNode: "diagnose", path: "summary" } } },
      { id: "search", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler", maxResults: 2 } },
    ],
    ...overrides,
  };
}

describe("workflowProgramLowering", () => {
  it("produces a byte-stable topological runtime plan with operation metadata", () => {
    const left = lowerWorkflowProgram({ program: fixtureProgram() }).plan;
    const right = lowerWorkflowProgram({ program: fixtureProgram() }).plan;

    expect(left).toEqual(right);
    expect(left.operations.map((operation) => operation.nodeId)).toEqual(["search", "diagnose", "final-output"]);
    expect(left.operations).toEqual([
      expect.objectContaining({
        nodeId: "search",
        operationKind: "runtime.tool",
        toolName: "browser_search",
        codegenTemplate: "workflow.resumePoint -> workflow.step -> tools.<tool>",
      }),
      expect.objectContaining({
        nodeId: "diagnose",
        operationKind: "runtime.model",
        modelTask: "diagnose.results",
        resumeKey: "diagnose",
      }),
      expect.objectContaining({
        nodeId: "final-output",
        operationKind: "runtime.output",
        codegenTemplate: "workflow.checkpoint -> output",
      }),
    ]);
  });

  it("reuses unchanged lowered operations and invalidates dependent operations", () => {
    const loweredOperationCache = new Map<string, WorkflowProgramLoweredOperationCacheEntry>();
    const first = lowerWorkflowProgram({ program: fixtureProgram(), loweredOperationCache });
    expect(first.metrics).toMatchObject({ operationCount: 3, loweringCacheHits: 0, loweringCacheMisses: 3, loweringCacheWrites: 3 });

    const second = lowerWorkflowProgram({
      program: fixtureProgram({
        nodes: [
          { id: "diagnose", kind: "model.call", dependsOn: ["search"], task: "diagnose.updated", input: { evidence: { fromNode: "search" } }, output: { schema: { summary: "string" } } },
          { id: "final-output", kind: "output.final", dependsOn: ["diagnose"], value: { summary: { fromNode: "diagnose", path: "summary" } } },
          { id: "search", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler", maxResults: 2 } },
        ],
      }),
      loweredOperationCache,
    });

    expect(second.metrics).toMatchObject({ operationCount: 3, loweringCacheHits: 1, loweringCacheMisses: 2, loweringCacheWrites: 2 });
    expect(second.plan.operations[0]!.operationHash).toBe(first.plan.operations[0]!.operationHash);
    expect(second.plan.operations[1]!.operationHash).not.toBe(first.plan.operations[1]!.operationHash);
    expect(second.plan.operations[2]!.operationHash).not.toBe(first.plan.operations[2]!.operationHash);
  });
});
