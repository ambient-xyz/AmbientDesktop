import type { WorkflowAgentThreadSummary, WorkflowRunDetail } from "../../shared/types";
import { workflowGraphEventCards, type WorkflowGraphEventCard } from "./workflowAgentGraphUiModel";
import {
  workflowGraphRecoveryDecisionCard,
  workflowRuntimeInputDecisionCard,
  type WorkflowRuntimeDecisionActionId,
  type WorkflowRuntimeDecisionCard,
} from "./workflowRuntimeDecisionUiModel";
import { workflowRuntimeInputCards, type WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import { workflowTotalRuntimePauseModel } from "./workflowRunLimitsUiModel";

export type WorkflowThreadComposerMode = "plan_edit" | "run_input" | "run_recovery" | "graph_recovery";
export type WorkflowThreadComposerRuntimeAction = "extend_total_runtime" | "remove_total_runtime_cap";

export interface WorkflowThreadComposerModel {
  mode: WorkflowThreadComposerMode;
  title: string;
  detail: string;
  placeholder: string;
  submitLabel: string;
  busyLabel: string;
  ariaLabel: string;
  disabled: boolean;
  runtimeInputCard?: WorkflowRuntimeInputCard;
  runtimeInputFreeform: boolean;
  runtimeInputNotice?: string;
  modeNotice?: string;
  runtimeAction?: WorkflowThreadComposerRuntimeAction;
  recoveryAction?: WorkflowRuntimeDecisionActionId;
}

export function workflowThreadComposerRecoveryCard(thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail): WorkflowGraphEventCard | undefined {
  if (!detail || !thread.graph) return undefined;
  const cards = workflowGraphEventCards(detail.events, thread.graph, {
    checkpoints: detail.checkpoints,
    modelCalls: detail.modelCalls,
    limit: 8,
  });
  return cards.find((card) => (workflowGraphRecoveryDecisionCard(card)?.actions.length ?? 0) > 0);
}

export function workflowThreadComposerModel(input: {
  draft: string;
  workflowBusy?: string;
  workflowDiscoveryBusy?: string;
  composerBusy?: boolean;
  detail?: WorkflowRunDetail;
  recoveryDecision?: WorkflowRuntimeDecisionCard;
}): WorkflowThreadComposerModel {
  const draft = input.draft.trim();
  const runtimeInputCard = workflowRuntimeInputCards(input.detail)[0];
  if (runtimeInputCard) {
    const decision = workflowRuntimeInputDecisionCard(runtimeInputCard);
    const busy = input.composerBusy || input.workflowBusy === `resume:${input.detail?.run.id}`;
    const runtimeInputFreeform = Boolean(decision.freeform);
    const browserIntervention = runtimeInputCard.browserIntervention;
    return {
      mode: "run_input",
      title: browserIntervention ? "Browser Input" : "Run Input",
      detail: browserIntervention
        ? "Open the managed browser, review the warning, then choose an option above or add a short note here."
        : runtimeInputFreeform
          ? "Answer the paused workflow request here to resume this run with the same settings."
          : "Choose one of the workflow input options above to resume this run.",
      placeholder: decision.freeform?.placeholder ?? "Choose an option above to resume this workflow.",
      submitLabel: runtimeInputFreeform ? decision.freeform?.submitLabel ?? "Resume workflow" : "Choose option above",
      busyLabel: "Resuming workflow",
      ariaLabel: "Workflow Run Input composer",
      disabled: Boolean(busy || !runtimeInputFreeform || !draft),
      runtimeInputCard,
      runtimeInputFreeform,
      runtimeInputNotice: browserIntervention
        ? "Browser warnings can use the buttons above; optional notes use this composer."
        : runtimeInputFreeform
          ? "Freeform answers use this composer."
          : "This request only accepts the listed options.",
      modeNotice: browserIntervention
        ? "Browser warning waiting for user action."
        : runtimeInputFreeform
          ? "Freeform answers use this composer."
          : "This request only accepts the listed options.",
    };
  }

  const totalRuntimePause = input.detail ? workflowTotalRuntimePauseModel(input.detail.run.status, input.detail.events) : undefined;
  if (totalRuntimePause) {
    const runtimeAction = workflowThreadComposerRuntimeActionForDraft(draft);
    const busy = input.composerBusy || input.workflowBusy === `resume:${input.detail?.run.id}`;
    return {
      mode: "run_recovery",
      title: "Run Recovery",
      detail: "Resume this paused workflow by extending or removing the optional total runtime cap.",
      placeholder: 'Type "extend 10 min" or "remove cap".',
      submitLabel: runtimeAction === "remove_total_runtime_cap" ? "Remove cap and resume" : runtimeAction === "extend_total_runtime" ? "Extend and resume" : "Choose recovery",
      busyLabel: "Resuming workflow",
      ariaLabel: "Workflow Run Recovery composer",
      disabled: Boolean(busy || !runtimeAction),
      runtimeInputFreeform: false,
      modeNotice: `Total runtime cap reached: ${totalRuntimePause.totalLimitLabel}.`,
      runtimeAction,
    };
  }

  if (input.recoveryDecision && input.recoveryDecision.actions.length > 0) {
    const recoveryAction = workflowThreadComposerRecoveryActionForDraft(draft, input.recoveryDecision);
    const selectedAction = input.recoveryDecision.actions.find((action) => action.id === recoveryAction);
    const busy = input.composerBusy || Boolean(input.workflowBusy);
    return {
      mode: "graph_recovery",
      title: "Graph Recovery",
      detail: "Recover or debug the latest actionable workflow graph failure.",
      placeholder: `Type ${input.recoveryDecision.actions.map((action) => `"${action.label}"`).join(", ")}.`,
      submitLabel: selectedAction?.label ?? "Choose recovery",
      busyLabel: selectedAction?.label ?? "Recovering workflow",
      ariaLabel: "Workflow Graph Recovery composer",
      disabled: Boolean(busy || !recoveryAction),
      runtimeInputFreeform: false,
      modeNotice: input.recoveryDecision.description ?? input.recoveryDecision.statusLabel,
      recoveryAction,
    };
  }

  const busy = input.composerBusy || Boolean(input.workflowBusy) || Boolean(input.workflowDiscoveryBusy);
  return {
    mode: "plan_edit",
    title: "Workflow Chat",
    detail: "Ask Pi to inspect, explain, revise, validate, or run this workflow from the same thread.",
    placeholder: "Ask for a workflow change or ask about the current script, graph, run, or version history.",
    submitLabel: "Send to Pi",
    busyLabel: "Drafting proposal",
    ariaLabel: "Workflow Chat composer",
    disabled: Boolean(busy || !draft),
    runtimeInputFreeform: false,
  };
}

export function workflowThreadComposerRuntimeActionForDraft(draft: string): WorkflowThreadComposerRuntimeAction | undefined {
  const normalized = draft.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/\b(remove|clear|disable|uncap|no)\b/.test(normalized) && /\b(cap|limit|runtime|total)\b/.test(normalized)) return "remove_total_runtime_cap";
  if (/\b(extend|continue|resume|add|more)\b/.test(normalized) && /\b(10|ten|minute|min|runtime|time)\b/.test(normalized)) return "extend_total_runtime";
  return undefined;
}

export function workflowThreadComposerRecoveryActionForDraft(
  draft: string,
  decision: Pick<WorkflowRuntimeDecisionCard, "actions">,
): WorkflowRuntimeDecisionActionId | undefined {
  const normalized = draft.trim().toLowerCase();
  if (!normalized) return undefined;
  const available = new Set(decision.actions.map((action) => action.id));
  if (/\b(debug|rewrite|fix|diagnose|repair)\b/.test(normalized) && available.has("debug_rewrite")) return "debug_rewrite";
  if (/\b(skip|ignore)\b/.test(normalized) && available.has("skip_item")) return "skip_item";
  if (/\b(resume|checkpoint|continue)\b/.test(normalized) && available.has("resume_checkpoint")) return "resume_checkpoint";
  if (/\b(retry|again|rerun|try)\b/.test(normalized) && available.has("retry_step")) return "retry_step";
  return undefined;
}
