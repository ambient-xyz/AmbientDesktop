import { describe, expect, it } from "vitest";
import type { WorkflowProgramIR } from "../../shared/workflowProgramIr";
import type { WorkflowManifest } from "../../shared/workflowTypes";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import type { WorkflowCompilerOutput } from "./workflowProgramWorkflowCompilerFacade";
import { generateWorkflowProgramSource } from "./workflowProgramCodegen";
import { dryRunWorkflowProgramOutput, WorkflowProgramDryRunError } from "./workflowProgramDryRun";
import { lowerWorkflowProgram, type WorkflowProgramLoweredOperationPlan } from "./workflowProgramLowering";

const toolDescriptors = firstPartyDesktopToolDescriptors();

function outputWithSource(source: string, manifest: Partial<WorkflowManifest> = {}): WorkflowCompilerOutput {
  return {
    title: "Dry-run fixture",
    spec: { goal: "Exercise dry-run behavior." },
    manifest: {
      tools: [],
      mutationPolicy: "read_only",
      ...manifest,
    },
    source,
    previewSummary: "Dry-run fixture",
    dryRunStrategy: "test",
    openQuestions: [],
  };
}

function emptyLoweredPlan(): WorkflowProgramLoweredOperationPlan {
  return {
    schemaVersion: 1,
    title: "Dry-run fixture",
    goal: "Exercise dry-run behavior.",
    programHash: "test-program",
    operationPlanHash: "test-plan",
    operations: [],
  };
}

describe("workflowProgramDryRun", () => {
  it("runs generated source with mocked workflow, tool, and Ambient calls", async () => {
    const program: WorkflowProgramIR = {
      version: 1,
      title: "Dry-run generated source",
      goal: "Read a file, summarize it, and emit output.",
      nodes: [
        { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
        {
          id: "summarize",
          kind: "model.call",
          dependsOn: ["read-source"],
          task: "summarize.file",
          input: { content: { fromNode: "read-source", path: "content" } },
          output: {
            schema: {
              summary: "string",
              diagnosis: "string",
              highlights: "array",
              shortlist: { type: "array", items: { type: "object" } },
            },
          },
        },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["summarize"],
          value: {
            summary: { fromNode: "summarize", path: "summary" },
            diagnosis: { fromNode: "summarize", path: "diagnosis" },
            shortlist: { fromNode: "summarize", path: "shortlist" },
          },
        },
      ],
    };
    const loweredPlan = lowerWorkflowProgram({ program }).plan;
    const source = generateWorkflowProgramSource({ nodes: loweredPlan.operations.map((operation) => operation.node), toolDescriptors, connectorDescriptors: [] });

    const dryRun = await dryRunWorkflowProgramOutput(outputWithSource(source, { tools: ["file_read", "ambient.responses"] }), loweredPlan, toolDescriptors, []);

    expect(dryRun.calls.map((call) => `${call.kind}:${call.name}`)).toEqual(
      expect.arrayContaining(["tool:file_read", "model:summarize.file", "checkpoint:final-output", "emit:workflow.output.ready", "emit:workflow.completed"]),
    );
    expect(dryRun.componentOutputs).toMatchObject({
      "final-output": { summary: "mock summary for summarize.file", diagnosis: "mock diagnosis for summarize.file", shortlist: [] },
    });
  });

  it("returns structured diagnostics for invalid mocked tool inputs", async () => {
    const source = "export default async function run({ tools }) { await tools.file_read({}); return {}; }";

    await expect(dryRunWorkflowProgramOutput(outputWithSource(source, { tools: ["file_read"] }), emptyLoweredPlan(), toolDescriptors, [])).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ severity: "error", path: "/nodes/unknown/args/path" })],
    });
  });

  it("shadows raw process and global code-generation APIs inside the dry-run factory", async () => {
    const source = "export default async function run() { return process.env.HOME; }";

    await expect(dryRunWorkflowProgramOutput(outputWithSource(source), emptyLoweredPlan(), toolDescriptors, [])).rejects.toBeInstanceOf(WorkflowProgramDryRunError);
  });
});
