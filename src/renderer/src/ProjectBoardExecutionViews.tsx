import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  Kanban,
  MessageCircle,
  Package,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  SquarePen,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import type { AttachProjectBoardLocalTaskMode } from "../../shared/projectBoardTypes";
import type { OrchestrationTask, RepairOrchestrationWorkflowAction, ResolveOrchestrationWorkflowImpactAction, UpdateOrchestrationWorkflowRawInput, UpdateOrchestrationWorkflowSettingsInput } from "../../shared/workflowTypes";
import type { ProjectBoardCardInspectorOptions } from "./ProjectBoardActiveCardDetailViews";
import {
  projectBoardBoardDecisionImpactRail,
  projectBoardExecutionOverview,
  projectBoardExecutionReadinessRail,
  projectBoardWorkflowImpactPreview,
  type ProjectBoardTabId,
} from "./projectBoardUiModel";
import { DiffOutput, formatTaskState } from "./RightPanel";

export function ProjectBoardExecutionOverviewPanel({
  overview,
  onSelectCard,
  onSelectTab,
  onOpenSourcePicker,
  onPrepareRuns,
  onStartRun,
  runBusy,
}: {
  overview: ReturnType<typeof projectBoardExecutionOverview>;
  onSelectCard: (cardId: string | undefined, options?: ProjectBoardCardInspectorOptions) => void;
  onSelectTab: (tabId: ProjectBoardTabId) => void;
  onOpenSourcePicker: () => void;
  onPrepareRuns: () => void;
  onStartRun: (runId: string) => void;
  runBusy?: string;
}) {
  const action = overview.action;
  const busy = Boolean(action?.busyKey && runBusy === action.busyKey);
  const handleAction = () => {
    if (!action || action.disabled) return;
    if (action.action === "open_charter") onSelectTab("charter");
    else if (action.action === "open_decisions") onSelectTab("decisions");
    else if (action.action === "open_source_picker") onOpenSourcePicker();
    else if (action.action === "open_draft_inbox") onSelectTab("draft_inbox");
    else if (action.action === "open_board") onSelectTab("board");
    else if (action.action === "open_integration") onSelectTab("integration");
    else if (action.action === "prepare_run") onPrepareRuns();
    else if (action.action === "start_run" && action.runId) onStartRun(action.runId);
    else if (action.action === "inspect_card") onSelectCard(action.cardId, { tab: overview.state === "review" ? "proof" : undefined, scroll: true });
  };
  return (
    <section className={`project-board-execution-overview ${overview.state}`} aria-label="Project board execution next step">
      <div>
        <span className="project-board-kicker">Execution next step</span>
        <h4>{overview.headline}</h4>
        <p>{overview.detail}</p>
      </div>
      <div className="project-board-execution-overview-metrics" aria-label="Execution board counts">
        {overview.metrics.map((metric) => (
          <span key={metric.label}>
            <strong>{metric.value}</strong>
            {metric.label}
          </span>
        ))}
      </div>
      {action && (
        <button type="button" className="secondary-button" disabled={action.disabled} title={action.title} onClick={handleAction}>
          {action.action === "start_run" ? <Play size={14} className={busy ? "spin" : ""} /> : action.action === "prepare_run" ? <ClipboardPaste size={14} className={busy ? "spin" : ""} /> : action.action === "open_board" ? <Kanban size={14} /> : action.action === "open_integration" ? <Package size={14} /> : action.action === "open_decisions" ? <SquarePen size={14} /> : <FileText size={14} />}
          <span>{busy ? (action.busyLabel ?? action.label) : action.label}</span>
        </button>
      )}
    </section>
  );
}


export function ProjectBoardWorkflowImpactPanel({
  preview,
  onPrepareRuns,
  onResolveWorkflowImpact,
  onRepairWorkflow,
  onUpdateWorkflowSettings,
  onUpdateWorkflowRaw,
  runBusy,
}: {
  preview: ReturnType<typeof projectBoardWorkflowImpactPreview>;
  onPrepareRuns: () => void;
  onResolveWorkflowImpact: (action: ResolveOrchestrationWorkflowImpactAction, runIds: string[]) => void;
  onRepairWorkflow: (action: RepairOrchestrationWorkflowAction) => void;
  onUpdateWorkflowSettings: (input: UpdateOrchestrationWorkflowSettingsInput) => void;
  onUpdateWorkflowRaw: (input: UpdateOrchestrationWorkflowRawInput) => void;
  runBusy?: string;
}) {
  if (!preview.visible) return null;
  const prepareAction = preview.actions.find((action) => action.action === "prepare_next" || action.action === "create_default_workflow");
  const busy = runBusy === "prepare:next";
  return (
    <section className={`project-board-workflow-impact ${preview.tone} ${preview.state}`} aria-label="Workflow impact preview">
      <GitBranch size={17} aria-hidden="true" />
      <div>
        <span className="project-board-kicker">Workflow impact</span>
        <h4>{preview.headline}</h4>
        <p>{preview.detail}</p>
        <p className="project-board-workflow-impact-meta">
          {preview.workflowHashLabel ? <span>Current hash {preview.workflowHashLabel}</span> : <span>No current workflow hash</span>}
          <span>{preview.modelCallRequired ? "Targeted Pi refresh required" : "No Pi call for preview"}</span>
          {preview.workflowPath && <code>{preview.workflowPath}</code>}
        </p>
      </div>
      <div className="project-board-execution-overview-metrics" aria-label="Workflow impact counts">
        {preview.metrics.map((metric) => (
          <span key={metric.label} title={metric.title}>
            <strong>{metric.value}</strong>
            {metric.label}
          </span>
        ))}
      </div>
      <ProjectBoardWorkflowPrimer />
      {preview.repairPreview && <ProjectBoardWorkflowRepairPreview preview={preview.repairPreview} />}
      {preview.settings && (
        <ProjectBoardWorkflowSettingsEditor
          settings={preview.settings}
          disabled={Boolean(runBusy)}
          busy={runBusy === "workflow-settings:update"}
          onUpdateWorkflowSettings={onUpdateWorkflowSettings}
        />
      )}
      {preview.rawEditor && (
        <ProjectBoardWorkflowAdvancedEditor
          raw={preview.rawEditor}
          disabled={Boolean(runBusy)}
          busy={runBusy === "workflow-raw:update"}
          onUpdateWorkflowRaw={onUpdateWorkflowRaw}
        />
      )}
      {preview.actions.length > 0 && (
        <div className="project-board-workflow-impact-actions" aria-label="Workflow impact actions">
          {preview.actions.map((action) => {
            if (action === prepareAction) {
              return (
                <button key={action.action} type="button" className="secondary-button" disabled={busy} title={action.title} onClick={onPrepareRuns}>
                  <ClipboardPaste size={14} className={busy ? "spin" : ""} />
                  <span>{busy ? "Preparing" : action.label}</span>
                </button>
              );
            }
            if (action.action === "prepare_again" || action.action === "continue_old_prep") {
              const workflowAction: ResolveOrchestrationWorkflowImpactAction = action.action === "prepare_again" ? "prepare_again" : "continue_old_prep";
              const actionBusy = runBusy === `workflow-impact:${action.action}`;
              const disabled = preview.affectedRunIds.length === 0 || Boolean(runBusy);
              return (
                <button
                  key={action.action}
                  type="button"
                  className={action.tone === "primary" ? "primary-button" : "secondary-button"}
                  disabled={disabled}
                  title={action.title}
                  onClick={() => onResolveWorkflowImpact(workflowAction, preview.affectedRunIds)}
                >
                  {action.action === "prepare_again" ? (
                    <RefreshCw size={14} className={actionBusy ? "spin" : ""} />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>{actionBusy ? "Applying" : action.label}</span>
                </button>
              );
            }
            if (action.action === "restore_generated_default" || action.action === "use_existing_anyway") {
              const repairAction: RepairOrchestrationWorkflowAction =
                action.action === "restore_generated_default" ? "restore_generated_default" : "use_existing_anyway";
              const actionBusy = runBusy === `workflow-repair:${action.action}`;
              return (
                <button
                  key={action.action}
                  type="button"
                  className={action.tone === "primary" ? "primary-button" : "secondary-button"}
                  disabled={Boolean(runBusy)}
                  title={action.title}
                  onClick={() => onRepairWorkflow(repairAction)}
                >
                  {action.action === "restore_generated_default" ? (
                    <RotateCcw size={14} className={actionBusy ? "spin" : ""} />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>{actionBusy ? "Applying" : action.label}</span>
                </button>
              );
            }
            return (
              <span key={action.action} className={`project-board-workflow-impact-action ${action.tone}`} title={action.title}>
                {action.label}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}


export function ProjectBoardWorkflowSettingsEditor({
  settings,
  disabled,
  busy,
  onUpdateWorkflowSettings,
}: {
  settings: NonNullable<ReturnType<typeof projectBoardWorkflowImpactPreview>["settings"]>;
  disabled: boolean;
  busy: boolean;
  onUpdateWorkflowSettings: (input: UpdateOrchestrationWorkflowSettingsInput) => void;
}) {
  const {
    autoDispatch,
    maxConcurrentAgents,
    maxTurns,
    workspaceStrategy,
    requireTests,
    requireDiffSummary,
    requireScreenshots,
  } = settings;
  const [draft, setDraft] = useState(settings);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baselineRef = useRef(settings);
  useEffect(() => {
    const next = {
      autoDispatch,
      maxConcurrentAgents,
      maxTurns,
      workspaceStrategy,
      requireTests,
      requireDiffSummary,
      requireScreenshots,
    };
    // Refresh only when the form has no unsaved edits; a background WORKFLOW.md
    // change must not silently discard half-entered settings.
    const pristine =
      JSON.stringify(draftRef.current) === JSON.stringify(baselineRef.current) ||
      JSON.stringify(draftRef.current) === JSON.stringify(next);
    if (pristine) {
      baselineRef.current = next;
      setDraft(next);
    }
  }, [autoDispatch, maxConcurrentAgents, maxTurns, workspaceStrategy, requireTests, requireDiffSummary, requireScreenshots]);
  const changed =
    draft.autoDispatch !== autoDispatch ||
    draft.maxConcurrentAgents !== maxConcurrentAgents ||
    draft.maxTurns !== maxTurns ||
    draft.workspaceStrategy !== workspaceStrategy ||
    draft.requireTests !== requireTests ||
    draft.requireDiffSummary !== requireDiffSummary ||
    draft.requireScreenshots !== requireScreenshots;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changed || disabled) return;
    onUpdateWorkflowSettings(draft);
  };
  return (
    <form className="project-board-workflow-settings-editor" aria-label="Guided workflow settings" onSubmit={handleSubmit}>
      <header>
        <div>
          <span className="project-board-kicker">Guided settings</span>
          <h5>WORKFLOW.md execution controls</h5>
          <p>Changes apply to future Local Task preparation only. They preserve existing cards and PM proof, and are validated, backed up, diffed, and recorded in History without calling Pi.</p>
        </div>
        <button type="submit" className="secondary-button" disabled={disabled || !changed} title="Validate and save these workflow settings.">
          <Settings size={14} className={busy ? "spin" : ""} />
          <span>{busy ? "Saving" : changed ? "Save settings" : "No changes"}</span>
        </button>
      </header>
      <div className="project-board-workflow-settings-grid">
        <label>
          <span>Auto-dispatch</span>
          <input
            type="checkbox"
            checked={draft.autoDispatch}
            disabled={disabled}
            onChange={(event) => {
              const autoDispatch = event.currentTarget.checked;
              setDraft((current) => ({ ...current, autoDispatch }));
            }}
          />
        </label>
        <label>
          <span>Concurrent agents</span>
          <input
            type="number"
            min={1}
            max={20}
            value={draft.maxConcurrentAgents}
            disabled={disabled}
            onChange={(event) => {
              const maxConcurrentAgents = Math.max(1, Number(event.currentTarget.value) || 1);
              setDraft((current) => ({ ...current, maxConcurrentAgents }));
            }}
          />
        </label>
        <label>
          <span>Max turns</span>
          <input
            type="number"
            min={1}
            max={200}
            value={draft.maxTurns}
            disabled={disabled}
            onChange={(event) => {
              const maxTurns = Math.max(1, Number(event.currentTarget.value) || 1);
              setDraft((current) => ({ ...current, maxTurns }));
            }}
          />
        </label>
        <label>
          <span>Workspace</span>
          <select
            value={draft.workspaceStrategy}
            disabled={disabled}
            onChange={(event) => {
              const workspaceStrategy = event.currentTarget.value === "directory" ? "directory" : "git-worktree";
              setDraft((current) => ({ ...current, workspaceStrategy }));
            }}
          >
            <option value="git-worktree">Git worktree</option>
            <option value="directory">Directory</option>
          </select>
        </label>
        <label>
          <span>Tests required</span>
          <input
            type="checkbox"
            checked={draft.requireTests}
            disabled={disabled}
            onChange={(event) => {
              const requireTests = event.currentTarget.checked;
              setDraft((current) => ({ ...current, requireTests }));
            }}
          />
        </label>
        <label>
          <span>Diff summary</span>
          <input
            type="checkbox"
            checked={draft.requireDiffSummary}
            disabled={disabled}
            onChange={(event) => {
              const requireDiffSummary = event.currentTarget.checked;
              setDraft((current) => ({ ...current, requireDiffSummary }));
            }}
          />
        </label>
        <label>
          <span>Screenshots</span>
          <input
            type="checkbox"
            checked={draft.requireScreenshots}
            disabled={disabled}
            onChange={(event) => {
              const requireScreenshots = event.currentTarget.checked;
              setDraft((current) => ({ ...current, requireScreenshots }));
            }}
          />
        </label>
      </div>
    </form>
  );
}


export function ProjectBoardWorkflowAdvancedEditor({
  raw,
  disabled,
  busy,
  onUpdateWorkflowRaw,
}: {
  raw: NonNullable<ReturnType<typeof projectBoardWorkflowImpactPreview>["rawEditor"]>;
  disabled: boolean;
  busy: boolean;
  onUpdateWorkflowRaw: (input: UpdateOrchestrationWorkflowRawInput) => void;
}) {
  const [draft, setDraft] = useState(raw.markdown);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baselineRef = useRef(raw.markdown);
  useEffect(() => {
    // Refresh from disk only when the editor has no unsaved typing; a background
    // WORKFLOW.md change must not silently wipe an in-progress raw edit.
    const pristine = draftRef.current === baselineRef.current || draftRef.current === raw.markdown;
    if (pristine) {
      baselineRef.current = raw.markdown;
      setDraft(raw.markdown);
    }
  }, [raw.markdown]);
  const changed = draft !== raw.markdown;
  const canSave = changed && !disabled && !raw.truncated && draft.trim().length > 0;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    onUpdateWorkflowRaw({ markdown: draft });
  };
  const disabledTitle = raw.disabledReason ?? (disabled ? "Wait for the current board action to finish before editing WORKFLOW.md." : "Change the raw workflow text before saving.");
  return (
    <details className="project-board-workflow-advanced-editor">
      <summary>
        <FileCode2 size={14} aria-hidden="true" />
        <span>Raw WORKFLOW.md editor</span>
        <small>
          {raw.lineCount} line{raw.lineCount === 1 ? "" : "s"} · validated before save · 0 model calls
        </small>
      </summary>
      <form className="project-board-workflow-raw-form" aria-label="Raw workflow editor" onSubmit={handleSubmit}>
        <header>
          <div>
            <span className="project-board-kicker">Advanced raw edit</span>
            <h5>Edit the full workflow contract</h5>
            <p>Saving parses the full Markdown, writes a backup, records a diff in History, and does not rewrite card specs or clear PM proof.</p>
          </div>
          <button type="submit" className="secondary-button" disabled={!canSave} title={canSave ? "Validate and save the raw WORKFLOW.md text." : disabledTitle}>
            <FileCode2 size={14} className={busy ? "spin" : ""} />
            <span>{busy ? "Saving" : changed ? "Save raw edit" : "No changes"}</span>
          </button>
        </header>
        {raw.truncated && raw.disabledReason && <p className="project-board-workflow-raw-warning">{raw.disabledReason}</p>}
        <textarea
          value={draft}
          spellCheck={false}
          disabled={disabled || raw.truncated}
          onChange={(event) => setDraft(event.currentTarget.value)}
          aria-label="Raw WORKFLOW.md content"
        />
      </form>
    </details>
  );
}


export function ProjectBoardWorkflowPrimer() {
  return (
    <details className="project-board-workflow-primer">
      <summary>
        <Code2 size={14} aria-hidden="true" />
        <span>WORKFLOW.md primer</span>
        <small>Execution contract · dispatch policy · proof gates</small>
      </summary>
      <div className="project-board-workflow-primer-grid" aria-label="Workflow primer">
        <article>
          <strong>Execution contract</strong>
          <p>Each prepared Local Task receives this file's prompt template plus the approved card, workspace path, proof expectations, and additive next-run feedback.</p>
        </article>
        <article>
          <strong>Dispatch policy</strong>
          <p>Auto-dispatch, concurrency, max turns, workspace strategy, and hooks are repository-owned here so runs can be reproduced and reviewed.</p>
        </article>
        <article>
          <strong>Proof gate</strong>
          <p>Tests, diff summaries, screenshots, and manual proof requirements determine what evidence the Proof tab expects before a card closes.</p>
        </article>
      </div>
    </details>
  );
}


export function ProjectBoardWorkflowRepairPreview({
  preview,
}: {
  preview: NonNullable<ReturnType<typeof projectBoardWorkflowImpactPreview>["repairPreview"]>;
}) {
  return (
    <section className="project-board-workflow-repair-preview" aria-label="Workflow repair diff preview">
      <header>
        <div>
          <span className="project-board-kicker">Repair preview</span>
          <h5>Generated default replacement</h5>
          {preview.validationMessage && <p>{preview.validationMessage}</p>}
        </div>
        <div className="project-board-workflow-repair-meta" aria-label="Workflow repair metadata">
          <span>{preview.workspaceStrategy === "git-worktree" ? "Git worktree" : "Directory"} workspace</span>
          <span>
            Current {preview.currentLineCount} line{preview.currentLineCount === 1 ? "" : "s"}
          </span>
          <span>
            Default {preview.proposedLineCount} line{preview.proposedLineCount === 1 ? "" : "s"}
          </span>
          {preview.diffTruncated && <span>Diff preview truncated</span>}
        </div>
      </header>
      <details open>
        <summary>Raw diff before restoring</summary>
        <DiffOutput diff={preview.diff} />
      </details>
      <details>
        <summary>Generated default WORKFLOW.md</summary>
        <pre>{preview.proposedText}</pre>
      </details>
      <details>
        <summary>Current invalid WORKFLOW.md{preview.currentTextTruncated ? " (truncated)" : ""}</summary>
        <pre>{preview.currentText}</pre>
      </details>
    </section>
  );
}


export function ProjectBoardBoardDecisionImpactPanel({
  rail,
  onSelectCard,
}: {
  rail: ReturnType<typeof projectBoardBoardDecisionImpactRail>;
  onSelectCard: (cardId: string | undefined) => void;
}) {
  if (!rail.visible) return null;
  return (
    <section className={`project-board-board-decision-impact ${rail.tone}`} aria-label="Board decision impact">
      <header>
        <MessageCircle size={17} aria-hidden="true" />
        <div>
          <span className="project-board-kicker">Decision impact</span>
          <h4>{rail.headline}</h4>
          <p>{rail.detail}</p>
        </div>
        <div className="project-board-execution-overview-metrics" aria-label="Board decision impact counts">
          {rail.metrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              <strong>{metric.value}</strong>
              {metric.label}
            </span>
          ))}
        </div>
      </header>
      <div className="project-board-board-decision-impact-list">
        {rail.cards.slice(0, 5).map((card) => (
          <article key={`${card.cardId}:${card.question ?? card.sourceLabel}`} className={card.state}>
            <div>
              <strong>{card.title}</strong>
              <span>
                {card.sourceLabel} · {card.status.replace(/_/g, " ")}
              </span>
            </div>
            <p>{card.question ?? card.feedback ?? "Decision-impact feedback is attached to this Local Task."}</p>
            {card.answer && <small>Answer: {card.answer}</small>}
            <button type="button" className="secondary-button" title={card.actionTitle} onClick={() => onSelectCard(card.cardId)}>
              <SquarePen size={14} />
              <span>{card.actionLabel}</span>
            </button>
          </article>
        ))}
      </div>
      {rail.cards.length > 5 && <p className="project-board-detail-note">{rail.cards.length - 5} more affected card{rail.cards.length - 5 === 1 ? "" : "s"} are hidden from this compact rail.</p>}
    </section>
  );
}


export function ProjectBoardExecutionReadinessRailPanel({
  rail,
  onSelectCard,
  onSelectTab,
  onOpenSourcePicker,
  onPrepareRuns,
  onStartRun,
  runBusy,
}: {
  rail: ReturnType<typeof projectBoardExecutionReadinessRail>;
  onSelectCard: (cardId: string, options?: ProjectBoardCardInspectorOptions) => void;
  onSelectTab: (tabId: ProjectBoardTabId) => void;
  onOpenSourcePicker: () => void;
  onPrepareRuns: () => void;
  onStartRun: (runId: string) => void;
  runBusy?: string;
}) {
  const action = rail.action;
  const busy = Boolean(action?.busyKey && runBusy === action.busyKey);
  const handleAction = () => {
    if (!action || action.disabled) return;
    if (action.action === "open_charter") onSelectTab("charter");
    else if (action.action === "open_decisions") onSelectTab("decisions");
    else if (action.action === "open_source_picker") onOpenSourcePicker();
    else if (action.action === "open_draft_inbox") onSelectTab("draft_inbox");
    else if (action.action === "open_board") onSelectTab("board");
    else if (action.action === "open_integration") onSelectTab("integration");
    else if (action.action === "prepare_run") onPrepareRuns();
    else if (action.action === "start_run" && action.runId) onStartRun(action.runId);
    else if (action.action === "inspect_card" && action.cardId) onSelectCard(action.cardId);
  };
  return (
    <section className={`project-board-readiness-rail ${rail.tone}`} aria-label="Current project board next step">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <span className="project-board-kicker">Next step</span>
        <h4>{rail.headline}</h4>
        <p>{rail.detail}</p>
        <div className="project-board-readiness-summary" aria-label="Next step summary">
          <span>
            <strong>Done</strong>
            {rail.doneSummary}
          </span>
          <span>
            <strong>Pending</strong>
            {rail.pendingSummary}
          </span>
          <span>
            <strong>Click next</strong>
            {rail.nextActionSummary}
          </span>
        </div>
        {rail.secondary && (
          <p className={`project-board-readiness-rail-secondary ${rail.secondary.tone}`}>
            <strong>{rail.secondary.headline}</strong>
            <span>{rail.secondary.detail} {rail.secondary.actionHint}</span>
          </p>
        )}
      </div>
      <div className="project-board-execution-overview-metrics" aria-label="Execution readiness counts">
        {rail.metrics.map((metric) => (
          <span key={metric.label}>
            <strong>{metric.value}</strong>
            {metric.label}
          </span>
        ))}
      </div>
      {action && (
        <button type="button" className="secondary-button" disabled={action.disabled} title={action.title} onClick={handleAction}>
          {action.action === "start_run" ? <Play size={14} className={busy ? "spin" : ""} /> : action.action === "prepare_run" ? <ClipboardPaste size={14} className={busy ? "spin" : ""} /> : action.action === "open_board" ? <Kanban size={14} /> : action.action === "open_integration" ? <Package size={14} /> : action.action === "open_decisions" ? <SquarePen size={14} /> : <FileText size={14} />}
          <span>{busy ? (action.busyLabel ?? action.label) : action.label}</span>
        </button>
      )}
    </section>
  );
}


export function ProjectBoardUnattachedTasks({
  tasks,
  busy,
  onAttachLocalTask,
}: {
  tasks: OrchestrationTask[];
  busy?: string;
  onAttachLocalTask: (taskId: string, mode: AttachProjectBoardLocalTaskMode) => void;
}) {
  return (
    <section className="project-board-unattached-tasks" aria-label="Existing Local Tasks not on this board">
      <header>
        <div>
          <span className="project-board-kicker">Existing Local Tasks</span>
          <h4>{tasks.length} unattached task{tasks.length === 1 ? "" : "s"}</h4>
        </div>
        <span className="project-board-status">Optional import</span>
      </header>
      {tasks.length > 0 ? (
        <div className="project-board-unattached-list">
          {tasks.slice(0, 8).map((task) => (
            <article className="project-board-unattached-task" key={task.id}>
              <div>
                <span className="project-board-card-meta">{task.identifier} · {formatTaskState(task.state)}</span>
                <h5>{task.title}</h5>
                <p>{task.description || "No Local Task description recorded."}</p>
              </div>
              <div className="project-board-card-actions">
                <button
                  type="button"
                  className="project-board-card-action"
                  disabled={busy === `attach:${task.id}` || busy === `evidence:${task.id}`}
                  title="Attach this existing Local Task as an executable card on this board."
                  onClick={() => onAttachLocalTask(task.id, "attach")}
                >
                  <Kanban size={14} />
                  <span>{busy === `attach:${task.id}` ? "Attaching" : "Attach"}</span>
                </button>
                <button
                  type="button"
                  className="project-board-card-action secondary"
                  disabled={busy === `attach:${task.id}` || busy === `evidence:${task.id}`}
                  title="Record this existing Local Task as already-covered board work without making it executable."
                  onClick={() => onAttachLocalTask(task.id, "evidence")}
                >
                  <CheckCircle2 size={14} />
                  <span>{busy === `evidence:${task.id}` ? "Importing" : "Mark Covered"}</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="project-board-column-empty">No unattached Local Tasks in this project.</div>
      )}
    </section>
  );
}
