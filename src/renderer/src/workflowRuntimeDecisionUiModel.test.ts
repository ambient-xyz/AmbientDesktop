import { describe, expect, it } from "vitest";
import type { WorkflowGraphEventCard } from "./workflowAgentGraphUiModel";
import { workflowRuntimeInputDecisionCard, workflowTotalRuntimePauseDecisionCard, workflowGraphRecoveryDecisionCard, workflowDecisionRecoveryAction } from "./workflowRuntimeDecisionUiModel";
import type { WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";

describe("workflowRuntimeDecisionUiModel", () => {
  it("turns runtime input requests into shared decision cards", () => {
    const card: WorkflowRuntimeInputCard = {
      id: "workflow-input:input-1",
      eventId: "event-1",
      seq: 1,
      runId: "run-1",
      requestId: "input-1",
      prompt: "Which account should the workflow use?",
      choices: [{ id: "primary", label: "Primary account", description: "Use the default account." }],
      allowFreeform: true,
      graphNodeId: "choose-account",
      itemKey: "account-lookup",
      contextItems: [],
    };

    expect(workflowRuntimeInputDecisionCard(card)).toEqual({
      id: "workflow-input:input-1",
      kind: "runtime_input",
      tone: "input",
      title: "Which account should the workflow use?",
      description: "Answer this paused runtime request to resume the workflow with the same run settings.",
      statusLabel: "Needs input",
      badges: ["Node choose-account", "Item account-lookup", "Request input-1"],
      actions: [
        {
          id: "choice:primary",
          choiceId: "primary",
          label: "Primary account",
          description: "Use the default account.",
          tone: "primary",
        },
      ],
      freeform: {
        id: "freeform:input-1",
        placeholder: "Type an answer for this workflow run.",
        submitLabel: "Continue workflow",
      },
      emptyState: undefined,
    });
  });

  it("models browser intervention requests as focused warning decisions", () => {
    const card: WorkflowRuntimeInputCard = {
      id: "workflow-input:browser-input-1",
      eventId: "event-1",
      seq: 1,
      runId: "run-1",
      requestId: "browser-input-1",
      prompt: "Browser needs user action before reading this source.",
      choices: [
        { id: "completed", label: "I completed it", description: "Retry the same browser operation." },
        { id: "skip", label: "Skip this source", description: "Continue without this source." },
      ],
      allowFreeform: true,
      graphNodeId: "browser-intervention",
      browserIntervention: {
        title: "Browser challenge",
        kind: "captcha",
        provider: "recaptcha",
        status: "waiting",
        toolName: "browser_nav",
        browserUserActionId: "browser-action-family-shows",
        message: "Complete the verification page in managed Chrome.",
      },
      contextItems: [],
    };

    expect(workflowRuntimeInputDecisionCard(card)).toEqual({
      id: "workflow-input:browser-input-1",
      kind: "runtime_input",
      tone: "warning",
      title: "Browser needs user action",
      description: "Complete the verification page in managed Chrome.",
      statusLabel: "waiting",
      badges: ["Browser captcha", "recaptcha", "browser_nav", "Node browser-intervention", "Request browser-input-1"],
      actions: [
        expect.objectContaining({ id: "choice:completed", choiceId: "completed", label: "I completed it", tone: "primary" }),
        expect.objectContaining({ id: "choice:skip", choiceId: "skip", label: "Skip this source", tone: "danger" }),
      ],
      freeform: {
        id: "freeform:browser-input-1",
        placeholder: "Add a note after reviewing the browser warning, or choose an option above.",
        submitLabel: "Continue workflow",
      },
      emptyState: undefined,
    });
  });

  it("models total-runtime pause recovery as decision actions", () => {
    expect(
      workflowTotalRuntimePauseDecisionCard({
        eventId: "event-1",
        message: "Workflow reached the total runtime limit.",
        idleTimeoutLabel: "2 min",
        totalLimitLabel: "10 min",
        sourceLabel: "run override",
      }),
    ).toEqual({
      id: "workflow-timeout:event-1",
      kind: "timeout_recovery",
      tone: "warning",
      title: "Total runtime limit reached",
      description: "Workflow reached the total runtime limit.",
      statusLabel: "Paused",
      badges: ["run override", "Total cap 10 min", "Idle timeout 2 min"],
      actions: [
        expect.objectContaining({ id: "extend_total_runtime", label: "Extend 10 min", tone: "primary" }),
        expect.objectContaining({ id: "remove_total_runtime_cap", label: "Remove cap and resume", tone: "default" }),
      ],
    });
  });

  it("models graph recovery choices without duplicating actions", () => {
    const card: WorkflowGraphEventCard = {
      id: "event-1",
      runId: "run-1",
      artifactId: "artifact-1",
      graphNodeId: "model",
      itemKey: "record-1",
      nodeLabel: "Summarize",
      itemLabel: "Item record-1",
      timingLabel: "12 s",
      label: "ambient.call.invalid",
      detail: "Schema failed",
      state: "failed",
      summaries: [],
      recoveryContext: "Retry uses retained input for item record-1.",
      retry: {
        eligible: true,
        action: "retry_step",
        label: "Retry failed item",
        reasons: ["Retry can reuse retained input."],
        sameInputRequired: true,
      },
      resume: {
        eligible: true,
        action: "resume_checkpoint",
        label: "Resume from checkpoint",
        reasons: ["Checkpoint is available."],
        sameInputRequired: false,
      },
      skipItem: {
        eligible: true,
        action: "skip_item",
        label: "Skip item",
        reasons: ["Skipping is allowed by policy."],
        sameInputRequired: false,
      },
    };

    expect(workflowGraphRecoveryDecisionCard(card)).toEqual(
      expect.objectContaining({
        id: "workflow-recovery:event-1",
        kind: "graph_recovery",
        tone: "danger",
        title: "Recovery choices",
        statusLabel: "Failed step",
        badges: ["Summarize", "Item record-1", "12 s"],
        actions: [
          expect.objectContaining({ id: "retry_step", label: "Retry failed item" }),
          expect.objectContaining({ id: "resume_checkpoint", label: "Resume from checkpoint" }),
          expect.objectContaining({ id: "skip_item", label: "Skip item", tone: "danger" }),
          expect.objectContaining({ id: "debug_rewrite", label: "Ask Ambient to debug" }),
        ],
      }),
    );
  });

  it("maps shared recovery action ids back to executable recovery actions", () => {
    expect(workflowDecisionRecoveryAction("retry_step")).toBe("retry_step");
    expect(workflowDecisionRecoveryAction("resume_checkpoint")).toBe("resume_checkpoint");
    expect(workflowDecisionRecoveryAction("skip_item")).toBe("skip_item");
    expect(workflowDecisionRecoveryAction("debug_rewrite")).toBeUndefined();
    expect(workflowDecisionRecoveryAction("extend_total_runtime")).toBeUndefined();
  });

  it("treats page continuation as a non-destructive skip recovery action", () => {
    const card: WorkflowGraphEventCard = {
      id: "event-page",
      runId: "run-1",
      artifactId: "artifact-1",
      graphNodeId: "search",
      itemKey: "page-2",
      targetKind: "page",
      nodeLabel: "Search",
      itemLabel: "Page 2",
      label: "collection.page.error",
      detail: "Search shard failed",
      state: "failed",
      summaries: [],
      skipItem: {
        eligible: true,
        action: "skip_item",
        label: "Continue without failed page",
        reasons: ["Continue with retained partial results."],
        sameInputRequired: false,
      },
    };

    expect(workflowGraphRecoveryDecisionCard(card)?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "skip_item", label: "Continue without failed page", tone: "default" })]),
    );
  });
});
