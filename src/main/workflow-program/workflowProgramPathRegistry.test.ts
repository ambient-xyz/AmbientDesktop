import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktopToolRegistry";
import { fixtureWorkflowConnector } from "../workflowConnectors";
import { buildWorkflowProgramPathRegistry, lowerWorkflowProgramHandleReferences } from "./workflowProgramPathRegistry";
import type { WorkflowProgramIR, WorkflowProgramNode, WorkflowProgramValue } from "../../shared/workflowProgramIr";

describe("workflow program path registry", () => {
  it("mints stable handles from node ids and declared output contracts", () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;
    const program = registryFixtureProgram();
    const registry = buildWorkflowProgramPathRegistry({
      program,
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
    });

    expect(registry.byHandle.get("searchRecords.records")).toMatchObject({
      handle: "searchRecords.records",
      nodeId: "search-records",
      path: "records",
      primary: true,
    });
    expect(registry.byHandle.get("renderReport.artifactPath")).toMatchObject({
      nodeId: "render-report",
      path: "artifactPath",
    });
    expect(registry.byHandle.get("reviewChoice.choiceId")).toMatchObject({
      nodeId: "review-choice",
      path: "choiceId",
    });
    expect(registry.byHandle.get("search-records.records")).toMatchObject({
      nodeId: "search-records",
      path: "records",
      primary: false,
    });
  });

  it("lowers handle references to concrete IR node references before validation", () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;
    const lowered = lowerWorkflowProgramHandleReferences({
      program: registryFixtureProgram({
        finalValue: {
          records: { fromHandle: "searchRecords.records" },
          firstRecordName: { fromHandle: "searchRecords.records", path: "0.name" },
          artifactPath: { fromHandle: "renderReport.artifactPath" },
          choiceId: { fromHandle: "reviewChoice.choiceId" },
        },
      }),
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
    });

    expect(lowered.diagnostics).toEqual([]);
    expect(lowered.loweredHandleCount).toBe(4);
    expect((lowered.program.nodes.at(-1) as Extract<WorkflowProgramNode, { kind: "output.final" }>).value).toEqual({
      records: { fromNode: "search-records", path: "records" },
      firstRecordName: { fromNode: "search-records", path: "records.0.name" },
      artifactPath: { fromNode: "render-report", path: "artifactPath" },
      choiceId: { fromNode: "review-choice", path: "choiceId" },
    });
  });

  it("reports unknown handles with known alternatives instead of letting them become raw paths", () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;
    const lowered = lowerWorkflowProgramHandleReferences({
      program: registryFixtureProgram({ finalValue: { missing: { fromHandle: "search.results" } } }),
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      connectorDescriptors: [connector],
    });

    expect(lowered.diagnostics).toHaveLength(1);
    expect(lowered.diagnostics[0]).toMatchObject({
      code: "ir.unknown_handle_reference",
      path: "/nodes/3/value/missing/fromHandle",
      nodeId: "final-output",
    });
    expect(lowered.diagnostics[0]?.message).toContain("searchRecords.records");
  });

  it("resolves the same handles when producer node order changes", () => {
    const connector = fixtureWorkflowConnector([{ id: "row-1", name: "Alpha" }]).descriptor;
    const base = registryFixtureProgram({
      finalValue: {
        records: { fromHandle: "searchRecords.records" },
        artifactPath: { fromHandle: "renderReport.artifactPath" },
        choiceId: { fromHandle: "reviewChoice.choiceId" },
      },
    });
    const producers = base.nodes.slice(0, 3);
    const final = base.nodes[3]!;
    const permutations = [
      [producers[0], producers[1], producers[2], final],
      [producers[2], producers[0], producers[1], final],
      [producers[1], producers[2], producers[0], final],
    ].map((nodes) => ({ ...base, nodes: nodes as WorkflowProgramNode[] }));

    const values = permutations.map((program) => {
      const lowered = lowerWorkflowProgramHandleReferences({
        program,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
      });
      expect(lowered.diagnostics).toEqual([]);
      return (lowered.program.nodes.at(-1) as Extract<WorkflowProgramNode, { kind: "output.final" }>).value;
    });

    expect(values[1]).toEqual(values[0]);
    expect(values[2]).toEqual(values[0]);
  });
});

function registryFixtureProgram(options: { finalValue?: WorkflowProgramValue } = {}): WorkflowProgramIR {
  return {
    version: 1,
    title: "Registry fixture",
    goal: "Exercise compiler-owned handles.",
    nodes: [
      {
        id: "search-records",
        kind: "connector.call",
        connectorId: "fixture.readonly",
        operation: "listRecords",
        input: { limit: 5 },
      },
      {
        id: "render-report",
        kind: "document.render",
        input: { content: "Report" },
        title: "Report",
        format: "markdown",
      },
      {
        id: "review-choice",
        kind: "review.input",
        prompt: "Use this report?",
        choices: [{ id: "yes", label: "Yes" }],
      },
      {
        id: "final-output",
        kind: "output.final",
        value: options.finalValue ?? { ok: true },
      },
    ],
  };
}
