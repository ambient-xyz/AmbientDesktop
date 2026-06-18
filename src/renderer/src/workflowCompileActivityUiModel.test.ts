import { describe, expect, it } from "vitest";
import type { WorkflowCompileProgress } from "../../shared/workflowTypes";
import { workflowCompileActivityModel, workflowCompileProgressDetail } from "./workflowCompileActivityUiModel";

describe("workflowCompileActivityUiModel", () => {
  it("surfaces streaming compiler counters and idle watchdog progress", () => {
    const model = workflowCompileActivityModel({
      active: true,
      nowMs: Date.parse("2026-05-09T12:00:05.000Z"),
      progress: [
        progress({
          phase: "prompt",
          status: "completed",
          message: "Built the compiler prompt.",
          current: 2,
          metrics: { promptChars: 25_618, stablePrefixTokens: 4_166, mutableSuffixTokens: 2_222 },
        }),
        progress({
          phase: "model",
          status: "running",
          message: "Receiving the Pi compiler response.",
          current: 3,
          createdAt: "2026-05-09T12:00:00.000Z",
          metrics: {
            rawResponseChars: 3_025,
            thinkingChars: 2_643,
            providerElapsedMs: 41_000,
            idleTimeoutMs: 120_000,
            timeoutMode: "idle_watchdog",
          },
        }),
      ],
    });

    expect(model).toMatchObject({
      title: "Compiling preview",
      tone: "active",
      percent: 43,
      subtitle: "Receiving the Pi compiler response. Last stream update 5s ago; idle timeout is 2m.",
    });
    expect(model?.metrics).toEqual(
      expect.arrayContaining([
        { label: "Response", value: "3,025 chars" },
        { label: "Thinking", value: "2,643 chars" },
        { label: "Elapsed", value: "41s" },
        { label: "No stream update", value: "5s / 2m" },
        { label: "Timeout mode", value: "idle watchdog" },
        { label: "Stable prefix", value: "4,166 tokens" },
      ]),
    );
  });

  it("marks only the newest running compiler step active", () => {
    const model = workflowCompileActivityModel({
      active: true,
      nowMs: Date.parse("2026-05-09T12:00:03.000Z"),
      progress: [
        progress({ phase: "model", status: "running", message: "Receiving the Pi compiler response.", current: 3 }),
        progress({ phase: "model", status: "completed", message: "Received the Pi compiler response.", current: 3 }),
        progress({ phase: "validated", status: "running", message: "Validating manifest.", current: 4 }),
      ],
    });

    expect(model?.steps.map((step) => [step.message, step.state])).toEqual([
      ["Receiving the Pi compiler response.", "done"],
      ["Received the Pi compiler response.", "done"],
      ["Validating manifest.", "active"],
    ]);
  });

  it("surfaces WorkflowProgramIR repair metrics", () => {
    const model = workflowCompileActivityModel({
      active: true,
      progress: [
        progress({
          phase: "validated",
          status: "completed",
          message: "Workflow program IR passed static validation, codegen, and dry-run.",
          current: 4,
          metrics: { repairAttemptCount: 1, patchOperationCount: 2, dryRunCallCount: 5 },
        }),
      ],
    });

    expect(model?.metrics).toEqual(
      expect.arrayContaining([
        { label: "Dry-run calls", value: "5" },
        { label: "IR repairs", value: "1" },
        { label: "Patch ops", value: "2" },
      ]),
    );
  });

  it("shows failed compiler output without leaving earlier steps active", () => {
    const model = workflowCompileActivityModel({
      active: false,
      nowMs: Date.parse("2026-05-09T12:00:03.000Z"),
      progress: [
        progress({ phase: "model", status: "running", message: "Receiving the Pi compiler response.", current: 3 }),
        progress({
          phase: "failed",
          status: "failed",
          message: "Workflow preview compilation failed.",
          current: 3,
          error: "Compiler output source maps to unknown graph node id: format",
        }),
      ],
    });

    expect(model).toMatchObject({
      title: "Compile failed",
      tone: "failed",
      percent: 100,
      subtitle: "Compiler output source maps to unknown graph node id: format",
    });
    expect(model?.steps.map((step) => step.state)).toEqual(["done", "failed"]);
  });

  it("prioritizes WorkflowProgramIR failure phase, diagnostic, node, and timings", () => {
    const model = workflowCompileActivityModel({
      active: false,
      nowMs: Date.parse("2026-05-09T12:00:03.000Z"),
      progress: [
        progress({
          phase: "validated",
          status: "failed",
          message: "Workflow program IR failed static validation.",
          current: 4,
          error: "ir.unavailable_tool: Node search references unavailable tool browserSearch.",
          metrics: {
            compilerMode: "program_ir",
            compilerFailurePhase: "static_validation",
            failureDiagnosticCode: "ir.unavailable_tool",
            failureNodeId: "search",
            compilerDiagnosticCount: 1,
            repairAttemptCount: 2,
            compilerTotalMs: 1234,
            staticValidationMs: 34,
            codegenMs: 0,
            outputValidationMs: 0,
            dryRunMs: 0,
          },
        }),
        progress({
          phase: "failed",
          status: "failed",
          message: "Workflow preview compilation failed.",
          current: 4,
          error: "ir.unavailable_tool: Node search references unavailable tool browserSearch.",
        }),
      ],
    });

    expect(model).toMatchObject({
      title: "Compile failed",
      tone: "failed",
      subtitle: "Workflow compile failed during static validation · ir.unavailable_tool · node search.",
    });
    expect(model?.metrics.slice(0, 5)).toEqual([
      { label: "Failed phase", value: "static validation" },
      { label: "Diagnostic", value: "ir.unavailable_tool" },
      { label: "Node", value: "search" },
      { label: "Compiler total", value: "1.2s" },
      { label: "Static validation", value: "34 ms" },
    ]);
    expect(model?.metrics).toEqual(expect.arrayContaining([{ label: "IR repairs", value: "2" }]));
  });

  it("surfaces invalid path evidence and the persisted failure artifact", () => {
    const model = workflowCompileActivityModel({
      active: false,
      progress: [
        progress({
          phase: "validated",
          status: "failed",
          message: "Workflow program IR failed static validation.",
          current: 4,
          error: "ir.unknown_output_path: read-source.contents is not valid.",
          metrics: {
            compilerMode: "program_ir",
            compilerFailurePhase: "static_validation",
            failureDiagnosticCode: "ir.unknown_output_path",
            failureNodeId: "final-output",
            failureSourceNodeId: "read-source",
            failureInvalidOutputPath: "contents",
            failureValidAlternatives: "path, content, truncated, kind",
            failureProducerOutputContract: "read-source (file_read result): path, content, truncated, kind",
            failureArtifactPath: "/tmp/state/workflow-compile-failures/thread/failure.json",
          },
        }),
      ],
    });

    expect(model).toMatchObject({
      title: "Compile failed",
      tone: "failed",
      subtitle: "Workflow compile failed during static validation · ir.unknown_output_path · node final-output · read-source.contents.",
    });
    expect(model?.metrics).toEqual(
      expect.arrayContaining([
        { label: "Failed phase", value: "static validation" },
        { label: "Diagnostic", value: "ir.unknown_output_path" },
        { label: "Node", value: "final-output" },
        { label: "Source node", value: "read-source" },
        { label: "Invalid path", value: "contents" },
        { label: "Valid alternatives", value: "path, content, truncated, kind" },
        { label: "Producer output", value: "read-source (file_read result): path, content, truncated, kind" },
        { label: "Failure artifact", value: "/tmp/state/workflow-compile-failures/thread/failure.json" },
      ]),
    );
    expect(model?.failureReportText).toContain("Producer output contract: read-source (file_read result): path, content, truncated, kind");
  });

  it("turns retained repair diagnostics into actionable compile failure controls", () => {
    const model = workflowCompileActivityModel({
      active: false,
      progress: [
        progress({
          phase: "validated",
          status: "running",
          message: "WorkflowProgramIR repair response failed deterministic validation; failing closed.",
          current: 4,
          error: "WorkflowProgramIR repair path has invalid array index: /nodes/-",
          metrics: {
            compilerMode: "program_ir",
            repairFailureClass: "invalid_array_index",
            repairRetryable: false,
            repairAlternatives: 'Use add with "/-" only when appending to an array.',
          },
        }),
        progress({
          phase: "validated",
          status: "failed",
          message: "WorkflowProgramIR repair failed deterministic validation; retained diagnostics.",
          current: 4,
          error: "WorkflowProgramIR repair path has invalid array index: /nodes/-",
          metrics: {
            compilerMode: "program_ir",
            compilerFailurePhase: "static_validation",
            failureDiagnosticCode: "ir.unknown_output_path",
            failureDiagnosticPath: "/nodes/1/value/labels/path",
            repairFailureClass: "invalid_array_index",
            repairRetryable: false,
            repairAlternatives: 'Use add with "/-" only when appending to an array.',
            failureArtifactPath: "/tmp/state/workflow-compile-failures/thread/failure.json",
          },
        }),
      ],
    });

    expect(model).toMatchObject({
      title: "Compile failed",
      tone: "failed",
      subtitle: "Workflow repair failed deterministically: invalid array index. Diagnostics were retained.",
      failureArtifactPath: "/tmp/state/workflow-compile-failures/thread/failure.json",
    });
    expect(model?.metrics).toEqual(
      expect.arrayContaining([
        { label: "Repair failure", value: "invalid array index" },
        { label: "Repair retryable", value: "false" },
        { label: "Repair alternatives", value: 'Use add with "/-" only when appending to an array.' },
      ]),
    );
    expect(model?.actions).toEqual([
      expect.objectContaining({ id: "retry_same_context", label: "Retry same context", disabled: true }),
      expect.objectContaining({ id: "open_diagnostics", label: "Open diagnostics", disabled: false }),
      expect.objectContaining({ id: "edit_request", label: "Edit request" }),
      expect.objectContaining({ id: "report_unsupported", label: "Copy report" }),
    ]);
    expect(model?.failureReportText).toContain("Repair failure class: invalid array index");
    expect(model?.failureReportText).toContain("Failure artifact: /tmp/state/workflow-compile-failures/thread/failure.json");
  });

  it("formats compile detail lines with stable labels", () => {
    expect(
      workflowCompileProgressDetail(
        progress({
          phase: "model",
          status: "running",
          message: "Receiving the Pi compiler response.",
          current: 3,
          detail: "zai-org/GLM-5.1-FP8",
          metrics: { rawResponseChars: 1084, thinkingChars: 2643, idleTimeoutMs: 60_000, timeoutMode: "idle_watchdog" },
        }),
      ),
    ).toBe("zai-org/GLM-5.1-FP8 · response: 1,084 chars · thinking: 2,643 chars · idle timeout: 1m · timeout mode: idle watchdog");
  });
});

function progress(input: Partial<WorkflowCompileProgress> & Pick<WorkflowCompileProgress, "phase" | "status" | "message" | "current">): WorkflowCompileProgress {
  return {
    compileId: input.compileId ?? "compile",
    phase: input.phase,
    status: input.status,
    message: input.message,
    current: input.current,
    total: input.total ?? 7,
    createdAt: input.createdAt ?? "2026-05-09T12:00:00.000Z",
    detail: input.detail,
    error: input.error,
    metrics: input.metrics,
  };
}
