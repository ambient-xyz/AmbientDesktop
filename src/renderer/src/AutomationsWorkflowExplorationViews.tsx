import { ClipboardPaste, LoaderCircle, RotateCcw, Zap } from "lucide-react";

import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowExplorationProgress, WorkflowExplorationTraceSummary, WorkflowRevisionSummary } from "../../shared/workflowTypes";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import {
  workflowExplorationElapsedBudgetOptions,
} from "./workflowExplorationBudgetUiModel";
import type { WorkflowExplorationGateModel } from "./workflowExplorationGateUiModel";
import { workflowExplorationPreflightModel, type WorkflowExplorationPreflightModel } from "./workflowExplorationPreflightUiModel";
import { workflowExplorationProgressCard, workflowExplorationTraceCards } from "./workflowExplorationUiModel";

export function WorkflowExplorationPanel({
  thread,
  artifact,
  revision,
  traces,
  progress,
  gate,
  budgets,
  workflowBusy,
  onRunExploration,
  onSkipExploration,
  onCompile,
  onUpdateBudget,
  onResetBudget,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  revision?: WorkflowRevisionSummary;
  traces: WorkflowExplorationTraceSummary[];
  progress?: WorkflowExplorationProgress;
  gate: WorkflowExplorationGateModel;
  budgets: WorkflowExplorationBudgets;
  workflowBusy?: string;
  onRunExploration: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onSkipExploration: (thread: WorkflowAgentThreadSummary) => void;
  onCompile: (thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) => void | Promise<unknown>;
  onUpdateBudget: (workflowThreadId: string, field: keyof WorkflowExplorationBudgets, value: unknown) => void;
  onResetBudget: (workflowThreadId: string) => void;
}) {
  const cards = workflowExplorationTraceCards(traces);
  const latestCard = cards[0];
  const liveCard = workflowExplorationProgressCard(progress);
  const explorationBusy = workflowBusy === `exploration:${thread.id}`;
  const compileBusy = workflowBusy === "compile";
  const preflight = workflowExplorationPreflightModel({ gate, thread, artifact, budgets });
  const compileFromExplorationEnabled = gate.canCompileFromExploration || gate.canCompileWithoutExploration;
  const budgetLocked = explorationBusy || gate.state === "running";
  const budgetControlsDisabled = budgetLocked || Boolean(workflowBusy);
  return (
    <section className="workflow-exploration-panel" aria-label="Workflow exploration traces">
      <div className="panel-section-heading">
        <AutomationHeadingLabel tooltip="Run a bounded Pi exploration pass through Ambient Desktop tools/connectors, then review the retained trace before compiling a deterministic workflow.">
          Exploration
        </AutomationHeadingLabel>
        <div className="workflow-exploration-actions">
          <button
            type="button"
            className="panel-button mini"
            disabled={!gate.canRun || Boolean(workflowBusy)}
            title={gate.canRun ? "Run a bounded exploration pass with the current workflow chat and discovery context." : gate.detail}
            onClick={() => void onRunExploration(thread)}
          >
            {explorationBusy ? <LoaderCircle size={13} className="spin" /> : <Zap size={13} />}
            {explorationBusy || gate.state === "running" ? "Exploring" : gate.state === "completed" ? "Rerun exploration" : "Run exploration"}
          </button>
          <button
            type="button"
            className="panel-button mini"
            disabled={!gate.canSkip || Boolean(workflowBusy)}
            title={gate.canSkip ? "Skip exploration and compile from the current workflow request, discovery answers, and graph context." : gate.detail}
            onClick={() => onSkipExploration(thread)}
          >
            Skip exploration
          </button>
          <button
            type="button"
            className="panel-button mini primary"
            disabled={!compileFromExplorationEnabled || Boolean(workflowBusy)}
            title={
              gate.canCompileFromExploration
                ? "Compile using request, discovery answers, graph context, and recent exploration traces."
                : gate.canCompileWithoutExploration
                  ? "Compile directly without exploration using current workflow context."
                  : "Run or skip exploration before compiling from this panel."
            }
            onClick={() => void onCompile(thread, revision)}
          >
            {compileBusy ? <LoaderCircle size={13} className="spin" /> : <ClipboardPaste size={13} />}
            {gate.canCompileWithoutExploration ? "Compile without exploration" : "Compile from exploration"}
          </button>
        </div>
      </div>
      <div className={`workflow-exploration-gate-card ${gate.state}`}>
        <div>
          <strong>{gate.title}</strong>
          <p>{gate.detail}</p>
          <div className="plugin-badges">
            {gate.reasonLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
        <span>{gate.label}</span>
      </div>
      <WorkflowExplorationBudgetControls
        workflowThreadId={thread.id}
        budgets={budgets}
        locked={budgetLocked}
        disabled={budgetControlsDisabled}
        onUpdateBudget={onUpdateBudget}
        onResetBudget={onResetBudget}
      />
      <WorkflowExplorationPreflightView preflight={preflight} />
      {liveCard && (explorationBusy || liveCard.tone === "running" || liveCard.tone === "blocked") && (
        <div className={`workflow-exploration-live-card ${liveCard.tone}`} role="status" aria-live="polite">
          <div>
            <strong>{liveCard.title}</strong>
            <p>{liveCard.detail}</p>
          </div>
          <div className="plugin-badges">
            {liveCard.labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
            {liveCard.graphNodeId && <span>Node {liveCard.graphNodeId}</span>}
          </div>
        </div>
      )}
      {!latestCard ? (
        <p className="panel-note">
          {gate.state === "skipped"
            ? "Exploration is skipped for this pass. Compile directly, or run exploration if live evidence becomes useful."
            : "No exploration traces yet. Use this when the workflow needs live evidence before deterministic compile."}
        </p>
      ) : (
        <div className="workflow-exploration-trace-list">
          {cards.slice(0, 3).map((card) => (
            <article className="workflow-exploration-trace-card" key={card.id}>
              <div className="task-row-header">
                <div>
                  <strong>{card.title}</strong>
                  <p>{card.summary}</p>
                </div>
                <span>{card.createdLabel}</span>
              </div>
              <div className="plugin-badges">
                <span>{card.modelLabel}</span>
                <span>{card.observationLabel}</span>
                <span>{card.graphSummary}</span>
                {card.budgetLabels.map((label) => (
                  <span key={`${card.id}-${label}`}>{label}</span>
                ))}
              </div>
              <div className="workflow-exploration-trace-grid">
                <WorkflowExplorationTraceList label="Observed calls" items={card.observedCallLabels} />
                <WorkflowExplorationTraceList label="Required grants" items={card.requiredGrantLabels} />
                <WorkflowExplorationTraceList label="Data shapes" items={card.dataShapeLabels} />
                <WorkflowExplorationTraceList label="Open questions" items={card.unresolvedQuestionLabels} />
              </div>
              <details className="workflow-exploration-details">
                <summary>Deterministic source strategy</summary>
                <p>{card.deterministicSourceStrategy}</p>
                {card.successfulPatternLabels.length > 0 && <WorkflowExplorationTraceList label="Successful patterns" items={card.successfulPatternLabels} />}
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function WorkflowExplorationPreflightView({ preflight, compact = false }: { preflight: WorkflowExplorationPreflightModel; compact?: boolean }) {
  const sections = compact
    ? preflight.sections.filter((section) => section.id === "budget" || section.id === "grants" || section.id === "evidence")
    : preflight.sections;
  return (
    <div className={`workflow-exploration-preflight ${compact ? "compact" : ""}`} aria-label={preflight.title}>
      {!compact && (
        <div className="workflow-exploration-preflight-heading">
          <strong>{preflight.title}</strong>
          <span>{preflight.detail}</span>
        </div>
      )}
      <div className="workflow-exploration-preflight-grid">
        {sections.map((section) => (
          <div className="workflow-exploration-preflight-card" key={section.id}>
            <strong>{section.label}</strong>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowExplorationBudgetControls({
  workflowThreadId,
  budgets,
  locked,
  disabled,
  onUpdateBudget,
  onResetBudget,
}: {
  workflowThreadId: string;
  budgets: WorkflowExplorationBudgets;
  locked: boolean;
  disabled: boolean;
  onUpdateBudget: (workflowThreadId: string, field: keyof WorkflowExplorationBudgets, value: unknown) => void;
  onResetBudget: (workflowThreadId: string) => void;
}) {
  const stateLabel = locked ? "Locked during run" : "Editable for next run";
  const detail = locked
    ? "This exploration run is using the snapshotted budget below. Edit values after the run finishes or cancel and rerun."
    : "These operation settings apply only to the next exploration run. Runtime workflow budgets stay manifest-backed and review-gated.";
  return (
    <div className={`workflow-exploration-budget-card ${locked ? "locked" : ""}`} aria-label="Workflow exploration budget controls">
      <div className="workflow-exploration-budget-heading">
        <div>
          <strong>Next exploration budget</strong>
          <span>{detail}</span>
        </div>
        <span>{stateLabel}</span>
      </div>
      <div className="workflow-exploration-budget-grid">
        <WorkflowExplorationBudgetNumberField workflowThreadId={workflowThreadId} budgets={budgets} field="maxModelTurns" label="Pi turns" disabled={disabled} onUpdateBudget={onUpdateBudget} />
        <WorkflowExplorationBudgetNumberField workflowThreadId={workflowThreadId} budgets={budgets} field="maxToolCalls" label="Tool calls" disabled={disabled} onUpdateBudget={onUpdateBudget} />
        <WorkflowExplorationBudgetNumberField workflowThreadId={workflowThreadId} budgets={budgets} field="maxConnectorCalls" label="Connector calls" disabled={disabled} onUpdateBudget={onUpdateBudget} />
        <WorkflowExplorationBudgetNumberField workflowThreadId={workflowThreadId} budgets={budgets} field="maxAmbientCalls" label="Ambient calls" disabled={disabled} onUpdateBudget={onUpdateBudget} />
        <label className="workflow-exploration-budget-field">
          <span>Wall-clock cap</span>
          <select
            value={budgets.maxElapsedMs}
            disabled={disabled}
            onChange={(event) => onUpdateBudget(workflowThreadId, "maxElapsedMs", Number(event.target.value))}
          >
            {workflowExplorationElapsedBudgetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="workflow-exploration-budget-actions">
        <button type="button" className="panel-button mini" disabled={disabled} onClick={() => onResetBudget(workflowThreadId)}>
          <RotateCcw size={13} />
          Reset defaults
        </button>
        <span>Completed traces retain the budget they actually used.</span>
      </div>
    </div>
  );
}

function WorkflowExplorationBudgetNumberField({
  workflowThreadId,
  budgets,
  field,
  label,
  disabled,
  onUpdateBudget,
}: {
  workflowThreadId: string;
  budgets: WorkflowExplorationBudgets;
  field: keyof Omit<WorkflowExplorationBudgets, "maxElapsedMs">;
  label: string;
  disabled: boolean;
  onUpdateBudget: (workflowThreadId: string, field: keyof WorkflowExplorationBudgets, value: unknown) => void;
}) {
  return (
    <label className="workflow-exploration-budget-field">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        value={budgets[field]}
        disabled={disabled}
        onChange={(event) => onUpdateBudget(workflowThreadId, field, Number(event.target.value))}
      />
    </label>
  );
}

function WorkflowExplorationTraceList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) {
    return (
      <div className="workflow-exploration-trace-fact empty">
        <strong>{label}</strong>
        <span>None recorded</span>
      </div>
    );
  }
  return (
    <div className="workflow-exploration-trace-fact">
      <strong>{label}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
