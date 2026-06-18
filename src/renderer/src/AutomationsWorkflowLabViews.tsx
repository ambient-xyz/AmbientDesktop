import { Brain, CheckCircle2, LoaderCircle, Square, Zap } from "lucide-react";

import type { WorkflowLabRun, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { formatTaskState, InfoTooltip, type ApiKeyStatus } from "./RightPanel";

export type WorkflowLabBusy = "create" | "run" | "adopt";

export function workflowLabPanelModel(playbook: WorkflowRecordingLibraryEntry, candidateRun: WorkflowLabRun | undefined, busy?: WorkflowLabBusy) {
  const run = candidateRun?.workflowId === playbook.id ? candidateRun : undefined;
  const bestVariant = run?.variants.find((variant) => variant.id === run.bestVariantId);
  const evaluatedVariants = run?.variants.filter((variant) => typeof variant.score === "number") ?? [];
  const latestVariants = run?.variants.slice(-5).reverse() ?? [];
  const canRun = Boolean(run && run.status !== "running" && run.status !== "completed" && !busy);
  const canAdopt = Boolean(bestVariant && run && run.baseVersion === playbook.version && !busy);
  const statusBadge = run ? `${run.status}${run.variants.length ? ` · ${run.variants.length}/${run.attemptBudget}` : ""}` : "not started";
  const active = Boolean(busy === "create" || busy === "run" || run?.status === "running");
  const progressVariantCount = run?.variants.length ?? 0;
  const progressEvaluatedCount = evaluatedVariants.length;
  const progressMax = Math.max(1, run?.attemptBudget ?? 1);
  const progressPercent = busy === "create"
    ? 8
    : Math.min(100, Math.max(active ? 12 : 0, Math.round((progressVariantCount / progressMax) * 100)));
  return {
    run,
    bestVariant,
    evaluatedVariants,
    latestVariants,
    canRun,
    canAdopt,
    statusBadge,
    active,
    progress: {
      title: busy === "create" ? "Creating Workflow Lab run" : "Running Workflow Lab variants",
      detail: busy === "create"
        ? "Preparing evaluation cases and a fresh run artifact."
        : progressVariantCount
          ? `${progressEvaluatedCount}/${progressMax} variants evaluated. Ambient/Pi judging continues until the plateau gate or attempt budget stops the run.`
          : "Generating candidate hypotheses and judging the first bounded case.",
      percent: progressPercent,
    },
  };
}

export function WorkflowLabPanel({
  playbook,
  run: candidateRun,
  busy,
  goal,
  status,
  onGoalChange,
  onCreateRun,
  onStartRun,
  onStopRun,
  onAdoptBest,
}: {
  playbook: WorkflowRecordingLibraryEntry;
  run?: WorkflowLabRun;
  busy?: WorkflowLabBusy;
  goal: string;
  status?: ApiKeyStatus;
  onGoalChange: (goal: string) => void;
  onCreateRun: (playbook: WorkflowRecordingLibraryEntry) => void;
  onStartRun: () => void;
  onStopRun: () => void;
  onAdoptBest: () => void;
}) {
  const model = workflowLabPanelModel(playbook, candidateRun, busy);
  const { run, bestVariant, evaluatedVariants, latestVariants } = model;
  return (
    <section className="automation-section workflow-lab-panel">
      <div className="panel-section-heading">
        <AutomationHeadingLabel tooltip="Workshop this saved workflow with bounded candidate variants, deterministic gates, and Ambient/Pi judging.">Workflow Lab</AutomationHeadingLabel>
        <div className="plugin-badges">
          <span>{model.statusBadge}</span>
          {bestVariant && <span>best {bestVariant.score ?? 0}/100</span>}
          {run?.heldOutEnabled && <span>held-out gate</span>}
        </div>
      </div>
      <div className="workflow-lab-controls">
        <label className="automation-field wide">
          <span>
            <strong>Workshop goal</strong>
            <InfoTooltip text="The local lab run optimizes this workflow playbook against the stated goal." className="heading-info-tooltip" />
          </span>
          <textarea
            className="panel-textarea"
            rows={3}
            value={goal}
            onChange={(event) => onGoalChange(event.target.value)}
            placeholder={`Improve reliability for ${playbook.title}.`}
          />
        </label>
        <div className="workflow-lab-action-row">
          <button
            type="button"
            className="panel-button mini"
            disabled={Boolean(busy)}
            title="Create a fresh Workflow Lab run and immediately run variants."
            onClick={() => onCreateRun(playbook)}
          >
            {busy === "create" || busy === "run" ? <LoaderCircle size={13} className="spin" /> : <Brain size={13} />}
            {busy === "create" ? "Creating run" : busy === "run" ? "Running variants" : run ? "New run" : "Run lab"}
          </button>
          <button
            type="button"
            className="panel-button mini"
            disabled={!model.canRun}
            title={!run ? "Run a new Workflow Lab first." : run.status === "completed" ? "Create a new run to continue experimenting." : "Run this existing draft without creating a fresh run."}
            onClick={onStartRun}
          >
            {busy === "run" ? <LoaderCircle size={13} className="spin" /> : <Zap size={13} />}
            Run variants
          </button>
          <button
            type="button"
            className="panel-button mini"
            disabled={run?.status !== "running"}
            title="Stop this Workflow Lab run after the current bounded step."
            onClick={onStopRun}
          >
            <Square size={13} />
            Stop
          </button>
          <button
            type="button"
            className="panel-button mini primary"
            disabled={!model.canAdopt}
            title={bestVariant && run?.baseVersion !== playbook.version ? "The playbook changed after this run. Start a new run before adopting." : "Adopt the accepted best candidate as a new playbook version."}
            onClick={onAdoptBest}
          >
            {busy === "adopt" ? <LoaderCircle size={13} className="spin" /> : <CheckCircle2 size={13} />}
            Adopt best
          </button>
        </div>
      </div>
      {status && <p className={`panel-status ${status.kind}`}>{status.message}</p>}
      {model.active && (
        <div className="workflow-lab-progress-card" role="status" aria-live="polite">
          <div>
            <LoaderCircle size={15} className="spin" />
            <strong>{model.progress.title}</strong>
            <span>{model.progress.detail}</span>
          </div>
          <div className="workflow-lab-progress-track" aria-hidden="true">
            <span style={{ width: `${model.progress.percent}%` }} />
          </div>
        </div>
      )}
      {run && (
        <>
          <div className="workflow-lab-score-strip" aria-label="Workflow Lab score graph">
            {evaluatedVariants.length ? (
              evaluatedVariants.map((variant) => (
                <div className={variant.id === run.bestVariantId ? "best" : ""} key={variant.id}>
                  <span style={{ height: `${Math.max(4, variant.score ?? 0)}%` }} />
                  <small>#{variant.attempt}</small>
                </div>
              ))
            ) : (
              <p className="panel-note">No evaluated variants yet.</p>
            )}
          </div>
          <div className="grid two">
            <section className="automation-status-section">
              <AutomationHeadingLabel tooltip="The highest accepted candidate and its judge rationale.">Current Best</AutomationHeadingLabel>
              {bestVariant ? (
                <div className="workflow-lab-best-card">
                  <strong>{bestVariant.score ?? 0}/100</strong>
                  <span>{bestVariant.patch.summary}</span>
                  {bestVariant.rationale && <p>{bestVariant.rationale}</p>}
                  <div className="plugin-badges">
                    {bestVariant.patch.changedFields.map((field) => <span key={field}>{field}</span>)}
                  </div>
                </div>
              ) : (
                <p className="panel-note">No accepted candidate yet.</p>
              )}
            </section>
            <section className="automation-status-section">
              <AutomationHeadingLabel tooltip="Recent hypotheses, gate status, and relative score.">Recent Variants</AutomationHeadingLabel>
              <div className="workflow-lab-variant-list">
                {latestVariants.length ? latestVariants.map((variant) => (
                  <div className={variant.status} key={variant.id}>
                    <strong>#{variant.attempt} · {formatTaskState(variant.status)}</strong>
                    <span>{typeof variant.score === "number" ? `${variant.score}/100` : "pending"}</span>
                    <p>{variant.hypothesis}</p>
                  </div>
                )) : <p className="panel-note">Create and run variants to populate the lab record.</p>}
              </div>
            </section>
          </div>
          <section className="automation-status-section">
            <AutomationHeadingLabel tooltip="Compact local audit entries written with the lab run artifact.">Audit Trail</AutomationHeadingLabel>
            <ul className="workflow-recorder-playbook-list workflow-lab-audit-list">
              {run.audit.slice(-6).map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
