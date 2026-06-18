import type { WorkflowRecoveryAction } from "../../shared/workflowTypes";
import type { WorkflowGraphEventCard } from "./workflowAgentGraphUiModel";
import type { WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import type { WorkflowTotalRuntimePauseModel } from "./workflowRunLimitsUiModel";

export type WorkflowRuntimeDecisionKind = "runtime_input" | "timeout_recovery" | "graph_recovery";
export type WorkflowRuntimeDecisionTone = "input" | "warning" | "danger" | "neutral";
export type WorkflowRuntimeDecisionActionId = `choice:${string}` | "extend_total_runtime" | "remove_total_runtime_cap" | WorkflowRecoveryAction | "debug_rewrite";
export type WorkflowRuntimeDecisionActionTone = "primary" | "default" | "danger";

export interface WorkflowRuntimeDecisionAction {
  id: WorkflowRuntimeDecisionActionId;
  label: string;
  description?: string;
  tone: WorkflowRuntimeDecisionActionTone;
  choiceId?: string;
}

export interface WorkflowRuntimeDecisionFreeform {
  id: string;
  placeholder: string;
  submitLabel: string;
}

export interface WorkflowRuntimeDecisionCard {
  id: string;
  kind: WorkflowRuntimeDecisionKind;
  tone: WorkflowRuntimeDecisionTone;
  title: string;
  description?: string;
  statusLabel: string;
  badges: string[];
  actions: WorkflowRuntimeDecisionAction[];
  freeform?: WorkflowRuntimeDecisionFreeform;
  emptyState?: string;
}

export function workflowRuntimeInputDecisionCard(card: WorkflowRuntimeInputCard): WorkflowRuntimeDecisionCard {
  if (card.browserIntervention) {
    const intervention = card.browserIntervention;
    return {
      id: card.id,
      kind: "runtime_input",
      tone: "warning",
      title: "Browser needs user action",
      description:
        intervention.message ??
        "Review the browser warning in the managed browser. If it is real, complete it and continue from the same page; if it is wrong, choose a skip or correction option.",
      statusLabel: intervention.status ?? "Needs input",
      badges: [
        intervention.kind ? `Browser ${intervention.kind}` : "Browser intervention",
        intervention.provider,
        intervention.toolName,
        intervention.profileMode ? `Profile ${intervention.profileMode}` : undefined,
        card.graphNodeId ? `Node ${card.graphNodeId}` : undefined,
        `Request ${card.requestId}`,
      ].filter((value): value is string => Boolean(value)),
      actions: card.choices.map((choice) => ({
        id: `choice:${choice.id}`,
        choiceId: choice.id,
        label: choice.label,
        description: choice.description,
        tone: browserChoiceTone(choice.id, choice.label),
      })),
      freeform: card.allowFreeform
        ? {
            id: `freeform:${card.requestId}`,
            placeholder: "Add a note after reviewing the browser warning, or choose an option above.",
            submitLabel: "Continue workflow",
          }
        : undefined,
      emptyState:
        !card.allowFreeform && card.choices.length === 0
          ? "This browser intervention did not provide choices or allow a freeform answer."
          : undefined,
    };
  }

  return {
    id: card.id,
    kind: "runtime_input",
    tone: "input",
    title: card.prompt,
    description: "Answer this paused runtime request to resume the workflow with the same run settings.",
    statusLabel: "Needs input",
    badges: [
      card.graphNodeId ? `Node ${card.graphNodeId}` : undefined,
      card.itemKey ? `Item ${card.itemKey}` : undefined,
      `Request ${card.requestId}`,
    ].filter((value): value is string => Boolean(value)),
    actions: card.choices.map((choice) => ({
      id: `choice:${choice.id}`,
      choiceId: choice.id,
      label: choice.label,
      description: choice.description,
      tone: "primary",
    })),
    freeform: card.allowFreeform
      ? {
          id: `freeform:${card.requestId}`,
          placeholder: "Type an answer for this workflow run.",
          submitLabel: "Continue workflow",
        }
      : undefined,
    emptyState:
      !card.allowFreeform && card.choices.length === 0
        ? "This input request did not provide choices or allow a freeform answer."
        : undefined,
  };
}

function browserChoiceTone(choiceId: string, label: string): WorkflowRuntimeDecisionActionTone {
  const normalized = `${choiceId} ${label}`.toLowerCase();
  if (/\b(skip|cancel|stop|abort)\b/.test(normalized)) return "danger";
  if (/\b(done|complete|completed|continue|retry|resume)\b/.test(normalized)) return "primary";
  return "default";
}

export function workflowTotalRuntimePauseDecisionCard(pause: WorkflowTotalRuntimePauseModel): WorkflowRuntimeDecisionCard {
  return {
    id: `workflow-timeout:${pause.eventId}`,
    kind: "timeout_recovery",
    tone: "warning",
    title: "Total runtime limit reached",
    description: pause.message,
    statusLabel: "Paused",
    badges: [pause.sourceLabel, `Total cap ${pause.totalLimitLabel}`, `Idle timeout ${pause.idleTimeoutLabel}`],
    actions: [
      {
        id: "extend_total_runtime",
        label: "Extend 10 min",
        description: "Resume this run with a fresh ten-minute total runtime cap.",
        tone: "primary",
      },
      {
        id: "remove_total_runtime_cap",
        label: "Remove cap and resume",
        description: "Resume this run with only the stream-idle timeout active.",
        tone: "default",
      },
    ],
  };
}

export function workflowGraphRecoveryDecisionCard(card: WorkflowGraphEventCard): WorkflowRuntimeDecisionCard | undefined {
  const actions: WorkflowRuntimeDecisionAction[] = [];
  const seen = new Set<string>();

  for (const eligibility of [card.retry, card.resume, card.skipItem]) {
    if (!eligibility?.eligible) continue;
    if (eligibility.action === "none" || eligibility.action === "debug_rewrite") continue;
    if (seen.has(eligibility.action)) continue;
    seen.add(eligibility.action);
    actions.push({
      id: eligibility.action,
      label: eligibility.label,
      description: eligibility.reasons[0],
      tone: eligibility.action === "skip_item" && card.targetKind !== "page" ? "danger" : "default",
    });
  }

  if (card.state === "failed") {
    actions.push({
      id: "debug_rewrite",
      label: "Ask Ambient to debug",
      description: "Create a revision proposal from the failed event, retained inputs, graph node, and source context.",
      tone: actions.length > 0 ? "default" : "primary",
    });
  }

  const blockedReason = card.retry && !card.retry.eligible ? card.retry.reasons[0] : undefined;
  if (actions.length === 0 && !blockedReason && !card.recoveryContext) return undefined;

  return {
    id: `workflow-recovery:${card.id}`,
    kind: "graph_recovery",
    tone: card.state === "failed" ? "danger" : "neutral",
    title: card.state === "failed" ? "Recovery choices" : "Recovery status",
    description: card.recoveryContext ?? blockedReason,
    statusLabel: card.state === "failed" ? "Failed step" : "Recovery",
    badges: [card.nodeLabel, card.itemLabel, card.timingLabel].filter((value): value is string => Boolean(value)),
    actions,
    emptyState: actions.length === 0 ? blockedReason : undefined,
  };
}

export function workflowDecisionRecoveryAction(actionId: WorkflowRuntimeDecisionActionId): WorkflowRecoveryAction | undefined {
  return actionId === "retry_step" || actionId === "resume_checkpoint" || actionId === "skip_item" ? actionId : undefined;
}
