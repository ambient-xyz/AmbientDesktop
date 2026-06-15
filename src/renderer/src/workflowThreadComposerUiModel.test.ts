import { describe, expect, it } from "vitest";
import type { WorkflowRunDetail } from "../../shared/types";
import { workflowThreadComposerModel, workflowThreadComposerRecoveryActionForDraft, workflowThreadComposerRuntimeActionForDraft } from "./workflowThreadComposerUiModel";

describe("workflowThreadComposerUiModel", () => {
  it("defaults to Workflow Chat mode when no runtime input is pending", () => {
    expect(workflowThreadComposerModel({ draft: "increase timeout" })).toMatchObject({
      mode: "plan_edit",
      title: "Workflow Chat",
      submitLabel: "Send to Pi",
      disabled: false,
      runtimeInputFreeform: false,
    });
  });

  it("switches to Run Input mode for pending freeform workflow input", () => {
    const detail = workflowRunDetailWithInput({ allowFreeform: true });

    expect(workflowThreadComposerModel({ draft: "Use Markdown", detail })).toMatchObject({
      mode: "run_input",
      title: "Run Input",
      submitLabel: "Continue workflow",
      placeholder: "Type an answer for this workflow run.",
      disabled: false,
      runtimeInputFreeform: true,
      runtimeInputCard: expect.objectContaining({ requestId: "input-1" }),
    });
  });

  it("disables composer submission when the pending workflow input only accepts choices", () => {
    const detail = workflowRunDetailWithInput({ allowFreeform: false });

    expect(workflowThreadComposerModel({ draft: "manual answer", detail })).toMatchObject({
      mode: "run_input",
      submitLabel: "Choose option above",
      disabled: true,
      runtimeInputFreeform: false,
      runtimeInputNotice: "This request only accepts the listed options.",
    });
  });

  it("uses browser-specific copy when the paused input is a browser intervention", () => {
    const detail = workflowRunDetailWithInput({ allowFreeform: true });
    detail.events[0].graphNodeId = "browser-intervention";
    detail.events[0].data = {
      id: "input-1",
      prompt: "Browser needs user action before reading this page.",
      choices: [{ id: "completed", label: "I completed it" }],
      allowFreeform: true,
      data: {
        browserIntervention: {
          title: "Browser challenge",
          kind: "captcha",
          status: "waiting",
          browserUserActionId: "browser-action-1",
          message: "Complete the verification page.",
        },
      },
    };

    expect(workflowThreadComposerModel({ draft: "completed", detail })).toMatchObject({
      mode: "run_input",
      title: "Browser Input",
      detail: "Open the managed browser, review the warning, then choose an option above or add a short note here.",
      modeNotice: "Browser warning waiting for user action.",
      runtimeInputFreeform: true,
      runtimeInputCard: expect.objectContaining({
        browserIntervention: expect.objectContaining({ browserUserActionId: "browser-action-1" }),
      }),
    });
  });

  it("switches to Run Recovery mode for paused total-runtime limits", () => {
    const detail = workflowRunDetailWithTotalRuntimePause();

    expect(workflowThreadComposerModel({ draft: "remove cap", detail })).toMatchObject({
      mode: "run_recovery",
      title: "Run Recovery",
      submitLabel: "Remove cap and resume",
      disabled: false,
      runtimeAction: "remove_total_runtime_cap",
      modeNotice: "Total runtime cap reached: 2 min.",
    });
    expect(workflowThreadComposerModel({ draft: "extend 10 min", detail })).toMatchObject({
      mode: "run_recovery",
      submitLabel: "Extend and resume",
      runtimeAction: "extend_total_runtime",
    });
    expect(workflowThreadComposerModel({ draft: "what happened?", detail })).toMatchObject({
      mode: "run_recovery",
      disabled: true,
      runtimeAction: undefined,
    });
  });

  it("parses total-runtime recovery commands conservatively", () => {
    expect(workflowThreadComposerRuntimeActionForDraft("remove the total runtime cap")).toBe("remove_total_runtime_cap");
    expect(workflowThreadComposerRuntimeActionForDraft("please extend 10 min")).toBe("extend_total_runtime");
    expect(workflowThreadComposerRuntimeActionForDraft("summarize the failure")).toBeUndefined();
  });

  it("switches to Graph Recovery mode for actionable failed nodes", () => {
    const recoveryDecision = {
      id: "workflow-recovery:event-1",
      kind: "graph_recovery" as const,
      tone: "danger" as const,
      title: "Recovery choices",
      description: "Failed at node classify.",
      statusLabel: "Failed step",
      badges: ["Classify"],
      actions: [
        { id: "retry_step" as const, label: "Retry step", tone: "default" as const },
        { id: "debug_rewrite" as const, label: "Ask Ambient to debug", tone: "primary" as const },
      ],
    };

    expect(workflowThreadComposerModel({ draft: "retry this step", recoveryDecision })).toMatchObject({
      mode: "graph_recovery",
      title: "Graph Recovery",
      submitLabel: "Retry step",
      disabled: false,
      recoveryAction: "retry_step",
    });
    expect(workflowThreadComposerModel({ draft: "ask ambient to debug", recoveryDecision })).toMatchObject({
      mode: "graph_recovery",
      submitLabel: "Ask Ambient to debug",
      recoveryAction: "debug_rewrite",
    });
  });

  it("parses graph recovery commands only when the action is available", () => {
    const decision = { actions: [{ id: "debug_rewrite" as const, label: "Ask Ambient to debug", tone: "primary" as const }] };

    expect(workflowThreadComposerRecoveryActionForDraft("debug this", decision)).toBe("debug_rewrite");
    expect(workflowThreadComposerRecoveryActionForDraft("retry this", decision)).toBeUndefined();
  });
});

function workflowRunDetailWithInput(input: { allowFreeform: boolean }): WorkflowRunDetail {
  return {
    run: {
      id: "run-1",
      artifactId: "artifact-1",
      status: "needs_input",
      startedAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:10.000Z",
    },
    artifact: {
      id: "artifact-1",
      workflowThreadId: "thread-1",
      title: "Workflow",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Ask for input." },
      sourcePath: "/tmp/workflow/main.ts",
      statePath: "/tmp/workflow/state.json",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
    events: [
      {
        id: "event-1",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 1,
        type: "workflow.input.required",
        message: "What format should the report use?",
        data: {
          id: "input-1",
          prompt: "What format should the report use?",
          choices: [{ id: "md", label: "Markdown" }],
          allowFreeform: input.allowFreeform,
          placeholder: "Enter response",
          submitLabel: "Send answer",
        },
        createdAt: "2026-05-10T00:00:00.000Z",
      },
    ],
    checkpoints: [],
    modelCalls: [],
    approvals: [],
    auditReport: "",
  };
}

function workflowRunDetailWithTotalRuntimePause(): WorkflowRunDetail {
  const detail = workflowRunDetailWithInput({ allowFreeform: false });
  return {
    ...detail,
    run: { ...detail.run, status: "paused" },
    events: [
      {
        id: "event-timeout",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 1,
        type: "workflow.timeout",
        message: "The workflow reached its optional total runtime limit.",
        data: {
          reason: "total_runtime_limit",
          recoverable: true,
          idleTimeoutMs: 120_000,
          maxRunMs: 120_000,
          totalRuntimeLimitSource: "override",
        },
        createdAt: "2026-05-10T00:00:00.000Z",
      },
    ],
  };
}
