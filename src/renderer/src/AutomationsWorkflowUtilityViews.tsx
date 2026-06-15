import { AlertCircle, Bot, Brain, CalendarClock, CalendarPlus, Check, CheckCircle2, FileImage, ListFilter, LoaderCircle, Maximize2, MessageCircle, Square, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useState } from "react";

import type { AutomationThreadSummary, WorkflowAgentThreadSummary, WorkspaceFileContent } from "../../shared/types";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { formatPanelFileSize, formatTaskState, formatTimelineTime, InfoTooltip } from "./RightPanel";
import { artifactMediaKindFromPath } from "./toolMessageUiModel";
import type { WorkflowArtifactPanelId } from "./workflowArtifactPanelUiModel";
import type { WorkflowRecorderStartActionState, WorkflowRecorderSurfaceModel } from "./workflowRecorderUiModel";
import type { WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";

export type AutomationThreadStatusGroups = {
  running: AutomationThreadSummary[];
  review: AutomationThreadSummary[];
  failed: AutomationThreadSummary[];
  completed: AutomationThreadSummary[];
};

export type AutomationThreadStatusSection = {
  id: string;
  label: string;
  tooltip: string;
  threads: AutomationThreadSummary[];
  emptyText: string;
};

export type AutomationThreadCardGridProps = {
  threads: AutomationThreadSummary[];
  emptyText: string;
  routeDetailForThread?: (thread: AutomationThreadSummary) => string | undefined;
  onOpenThread: (thread: AutomationThreadSummary) => void;
};

export type AutomationThreadStatusGridProps = {
  sections: AutomationThreadStatusSection[];
  routeDetailForThread?: (thread: AutomationThreadSummary) => string | undefined;
  onOpenThread: (thread: AutomationThreadSummary) => void;
  className?: string;
  sectionClassName?: string;
};

export type AutomationHomeStatusGridProps = {
  groups: AutomationThreadStatusGroups;
  reviewTooltip: string;
  routeDetailForThread?: (thread: AutomationThreadSummary) => string | undefined;
  onOpenThread: (thread: AutomationThreadSummary) => void;
};

export type AutomationHomeShortcutPane = "local_tasks" | "workflow_agent" | "workflow_lab" | "schedules" | "runs_reviews";

export type AutomationHomePaneProps = {
  homeExplainer: string[];
  legacyCompilerEnabled: boolean;
  newWorkflowLabel: string;
  threadGroups: AutomationThreadStatusGroups;
  reviewTooltip: string;
  playbookLibrary?: ReactNode;
  routeDetailForThread?: (thread: AutomationThreadSummary) => string | undefined;
  onOpenThread: (thread: AutomationThreadSummary) => void;
  onSelectPane: (pane: AutomationHomeShortcutPane) => void;
};

export type AutomationRunsReviewsPaneProps = {
  threadGroups: AutomationThreadStatusGroups;
  reviewTooltip: string;
  localTaskRuns: ReactNode;
  workflowRuns: ReactNode;
  workflowConsole: ReactNode;
  routeDetailForThread?: (thread: AutomationThreadSummary) => string | undefined;
  onOpenThread: (thread: AutomationThreadSummary) => void;
};

export type AutomationFolderPaneProps = {
  folderName: string;
  legacyCompilerEnabled: boolean;
  localTasksTooltip: string;
  threads: AutomationThreadSummary[];
  taskBoard: ReactNode;
  routeDetailForThread?: (thread: AutomationThreadSummary) => string | undefined;
  onOpenThread: (thread: AutomationThreadSummary) => void;
};

export type WorkflowRecorderStartPaneProps = {
  recorder: WorkflowRecorderSurfaceModel["startPane"];
  workflowAgentTooltip: string;
  workflowRequest: string;
  workflowError?: string;
  recorderStartBusy: boolean;
  recorderStartAction: WorkflowRecorderStartActionState;
  projectField: ReactNode;
  requestTextareaRef?: RefObject<HTMLTextAreaElement | null>;
  onWorkflowRequestChange: (value: string) => void;
  onStartRecording: () => void | Promise<void>;
};

export type WorkflowLegacyHiddenPaneProps = {
  thread: WorkflowAgentThreadSummary;
  hidden: WorkflowRecorderSurfaceModel["legacyHidden"];
  primaryCreateLabel: string;
  workflowAgentTooltip: string;
};

export type WorkflowAgentCompilerStartPaneProps = {
  workflowRequest: string;
  workflowError?: string;
  workflowBusy?: string;
  workflowAgentTooltip: string;
  startDiscoveryBusy: boolean;
  discoveryDisabled: boolean;
  compileAction: {
    label: string;
    disabled: boolean;
    title?: string;
  };
  revisionSourceTitle?: string;
  projectField: ReactNode;
  compileActivity: ReactNode;
  requestTextareaRef?: RefObject<HTMLTextAreaElement | null>;
  onWorkflowRequestChange: (value: string) => void;
  onRefreshDashboard: () => void | Promise<void>;
  onCreateSample: () => void | Promise<void>;
  onStartDiscovery: () => void | Promise<void>;
  onCompile: () => void | Promise<void>;
  onClearRevision: () => void;
};

export function WorkflowThreadTranscript({
  cards,
  workflowBusy,
  emptyDetail,
  onOpenPanel,
  onResolveRevision,
}: {
  cards: WorkflowThreadTranscriptCard[];
  workflowBusy?: string;
  emptyDetail?: string;
  onOpenPanel?: (panel: WorkflowArtifactPanelId) => void;
  onResolveRevision?: (revisionId: string, decision: "applied" | "rejected") => void;
}) {
  return (
    <section className="workflow-thread-transcript" aria-label="Workflow thread transcript">
      <div className="workflow-thread-transcript-header">
        <MessageCircle size={15} />
        <div>
          <strong>Workflow Chat</strong>
          <span>Conversation, workflow actions, run status, review state, and events stay together here.</span>
        </div>
      </div>
      <div className="workflow-thread-transcript-cards">
        {cards.length === 0 && (
          <article className="workflow-thread-transcript-card empty neutral">
            <div className="workflow-thread-transcript-card-header">
              <strong>No workflow chat yet</strong>
            </div>
            <p>{emptyDetail ?? "Ask Pi to explain, revise, validate, or run this workflow."}</p>
          </article>
        )}
        {cards.map((card) => (
          <article className={`workflow-thread-transcript-card ${card.kind} ${card.tone}`} key={card.id}>
            <div className="workflow-thread-transcript-card-header">
              <strong>{card.title}</strong>
              {card.timestamp && <small>{formatTimelineTime(card.timestamp)}</small>}
            </div>
            <p>{card.detail}</p>
            {card.badges.length > 0 && (
              <div className="plugin-badges">
                {card.badges.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
            )}
            {card.detailItems?.length ? (
              <div className="workflow-thread-transcript-detail-list" aria-label="Workflow chat detail">
                {card.detailItems.map((item, index) => (
                  <span key={`${card.id}-detail-${index}`}>{item}</span>
                ))}
              </div>
            ) : null}
            {card.sourcePreviewLines?.length ? (
              <div className="workflow-thread-transcript-source-preview" aria-label="Workflow chat source diff preview">
                {card.sourcePreviewLines.map((line, index) => (
                  <code className={line.kind} key={`${card.id}-source-${index}`}>
                    {line.text}
                  </code>
                ))}
              </div>
            ) : null}
            {(card.panelActions?.length || (card.revisionId && (card.revisionCanApply || card.revisionCanReject))) && (
              <div className="workflow-thread-transcript-card-actions">
                {card.panelActions?.map((action) => (
                  <button
                    type="button"
                    className="panel-button mini"
                    key={action.id}
                    data-panel-action-target={action.panel}
                    title={`Open ${action.label.toLowerCase()}`}
                    onClick={() => onOpenPanel?.(action.panel)}
                  >
                    {action.label}
                  </button>
                ))}
                {card.revisionCanApply && (
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={Boolean(workflowBusy)}
                    onClick={() => onResolveRevision?.(card.revisionId!, "applied")}
                  >
                    {workflowBusy === `revision:${card.revisionId}:applied` ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}
                    Apply revision
                  </button>
                )}
                {card.revisionCanReject && (
                  <button
                    type="button"
                    className="panel-button mini danger"
                    disabled={Boolean(workflowBusy)}
                    onClick={() => onResolveRevision?.(card.revisionId!, "rejected")}
                  >
                    {workflowBusy === `revision:${card.revisionId}:rejected` ? <LoaderCircle size={13} className="spin" /> : <X size={13} />}
                    Reject proposal
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function AutomationExplainer({ paragraphs }: { paragraphs: string[] }) {
  return (
    <section className="automation-explainer">
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}

export function AutomationHomePane({
  homeExplainer,
  legacyCompilerEnabled,
  newWorkflowLabel,
  threadGroups,
  reviewTooltip,
  playbookLibrary,
  routeDetailForThread,
  onOpenThread,
  onSelectPane,
}: AutomationHomePaneProps) {
  return (
    <div className="automation-pane-shell">
      <AutomationExplainer paragraphs={homeExplainer} />
      <div className="automation-shortcut-grid">
        <button type="button" className="automation-shortcut" onClick={() => onSelectPane("local_tasks")}>
          <CalendarClock size={17} />
          <strong>New Local Task</strong>
          <span>Queue project work for the coding agent.</span>
        </button>
        <button type="button" className="automation-shortcut" onClick={() => onSelectPane("workflow_agent")}>
          {legacyCompilerEnabled ? <Bot size={17} /> : <MessageCircle size={17} />}
          <strong>{newWorkflowLabel}</strong>
          <span>{legacyCompilerEnabled ? "Start discovery for a new Workflow Agent thread." : "Start a normal Ambient chat wrapper that records successful workflow examples."}</span>
        </button>
        <button type="button" className="automation-shortcut" onClick={() => onSelectPane("workflow_lab")}>
          <Brain size={17} />
          <strong>Workflow Lab</strong>
          <span>Workshop saved playbooks with bounded variants, gates, and relative scoring.</span>
        </button>
        <button type="button" className="automation-shortcut" onClick={() => onSelectPane("schedules")}>
          <CalendarPlus size={17} />
          <strong>Schedule Work</strong>
          <span>Review manual, auto-dispatch, and cron intent.</span>
        </button>
        <button type="button" className="automation-shortcut" onClick={() => onSelectPane("runs_reviews")}>
          <ListFilter size={17} />
          <strong>Runs And Reviews</strong>
          <span>Inspect audits, failures, and approvals.</span>
        </button>
      </div>
      {playbookLibrary}
      <AutomationHomeStatusGrid
        groups={threadGroups}
        reviewTooltip={reviewTooltip}
        routeDetailForThread={routeDetailForThread}
        onOpenThread={onOpenThread}
      />
    </div>
  );
}

export function AutomationRunsReviewsPane({
  threadGroups,
  reviewTooltip,
  localTaskRuns,
  workflowRuns,
  workflowConsole,
  routeDetailForThread,
  onOpenThread,
}: AutomationRunsReviewsPaneProps) {
  return (
    <div className="automation-pane-shell">
      <AutomationExplainer
        paragraphs={[
          "Runs show what actually happened. Local Task runs open normal Ambient run chats with prepared workspaces and proof of work, while Workflow Agent runs expose structured events, approvals, checkpoints, connector calls, source versions, and audit reports.",
          "Use this pane to continue paused workflow runs, inspect failures, open run chats, reveal workspaces, and resolve pending review items.",
        ]}
      />
      <div className="automation-workspace-grid">
        <section className="automation-section">
          <AutomationHeadingLabel tooltip="Automation threads currently running.">Running Now</AutomationHeadingLabel>
          <AutomationThreadCardGrid
            threads={threadGroups.running}
            emptyText="No active automation runs."
            routeDetailForThread={routeDetailForThread}
            onOpenThread={onOpenThread}
          />
        </section>
        <section className="automation-section">
          <AutomationHeadingLabel tooltip={reviewTooltip}>Needs Review</AutomationHeadingLabel>
          <AutomationThreadCardGrid
            threads={threadGroups.review}
            emptyText="No pending review items."
            routeDetailForThread={routeDetailForThread}
            onOpenThread={onOpenThread}
          />
        </section>
        <section className="automation-section">
          <AutomationHeadingLabel tooltip="Recent local task runs with run chats and workspaces.">Local Task Runs</AutomationHeadingLabel>
          {localTaskRuns}
        </section>
        <section className="automation-section">
          <AutomationHeadingLabel tooltip="Recent Workflow Agent runs with audit reports.">Workflow Runs</AutomationHeadingLabel>
          {workflowRuns}
        </section>
        <section className="automation-section automation-focus-wide">
          <AutomationHeadingLabel tooltip="Automation threads whose latest work failed.">Failed</AutomationHeadingLabel>
          <AutomationThreadCardGrid
            threads={threadGroups.failed}
            emptyText="No recent failures."
            routeDetailForThread={routeDetailForThread}
            onOpenThread={onOpenThread}
          />
        </section>
      </div>
      {workflowConsole}
    </div>
  );
}

export function WorkflowRecorderStartPane({
  recorder,
  workflowAgentTooltip,
  workflowRequest,
  workflowError,
  recorderStartBusy,
  recorderStartAction,
  projectField,
  requestTextareaRef,
  onWorkflowRequestChange,
  onStartRecording,
}: WorkflowRecorderStartPaneProps) {
  return (
    <div className="automation-pane-shell">
      <AutomationExplainer paragraphs={[recorder.detail, "Phase 1 now creates a recorder-marked normal chat thread; Pi session, streaming, tools, and permissions remain on the existing chat path."]} />
      <section className="automation-section automation-focus-primary">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip={workflowAgentTooltip}>{recorder.title}</AutomationHeadingLabel>
          <div className="plugin-badges">
            <span>Recorder default</span>
            <span>Legacy compiler hidden</span>
          </div>
        </div>
        <div className="workflow-exploration-live-card running" role="status" aria-live="polite">
          <div>
            <strong>{recorder.bannerTitle}</strong>
            <p>{recorder.bannerDetail}</p>
          </div>
          <button type="button" className="panel-button mini" disabled title="Recorder stop action is enabled after Phase 1 starts a recording session.">
            <Square size={13} />
            {recorder.stopButtonLabel}
          </button>
        </div>
        <div className="automation-controls-grid">
          {projectField}
          <label className="automation-field wide">
            <span>
              <strong>{recorder.requestLabel}</strong>
              <InfoTooltip text={recorder.requestTooltip} className="heading-info-tooltip" />
            </span>
            <textarea
              ref={requestTextareaRef}
              className="panel-textarea"
              value={workflowRequest}
              onChange={(event) => onWorkflowRequestChange(event.target.value)}
              placeholder={recorder.requestPlaceholder}
              rows={4}
            />
          </label>
        </div>
        <div className="task-heading-actions">
          <button
            type="button"
            className="panel-button icon-panel-button workflow-recorder-start-button"
            disabled={recorderStartAction.disabled}
            title={recorderStartAction.title}
            onClick={() => void onStartRecording()}
          >
            {recorderStartBusy ? <LoaderCircle size={14} className="spin" /> : <MessageCircle size={14} />}
            {recorder.disabledStartLabel}
          </button>
          <span className="automation-trigger-preview">Creates a normal chat, marks it recording, and sends the goal to Workflow Chat.</span>
        </div>
        <div className="automation-shortcut-grid">
          {recorder.cards.map((card) => (
            <article className={`automation-shortcut ${card.tone}`} key={card.title}>
              {card.tone === "success" ? <CheckCircle2 size={17} /> : card.tone === "warning" ? <AlertCircle size={17} /> : <MessageCircle size={17} />}
              <strong>{card.title}</strong>
              <span>{card.detail}</span>
            </article>
          ))}
        </div>
        {workflowError && <p className="panel-status error">{workflowError}</p>}
      </section>
    </div>
  );
}

export function WorkflowLegacyHiddenPane({
  thread,
  hidden,
  primaryCreateLabel,
  workflowAgentTooltip,
}: WorkflowLegacyHiddenPaneProps) {
  return (
    <div className="automation-pane-shell">
      <section className="automation-section automation-focus-primary">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip={workflowAgentTooltip}>{hidden.title}</AutomationHeadingLabel>
          <div className="plugin-badges">
            <span>{thread.status}</span>
            {thread.phase && <span>{thread.phase}</span>}
            <span>{thread.projectName}</span>
          </div>
        </div>
        <div className="workflow-exploration-live-card blocked">
          <div>
            <strong>{thread.title || "Workflow thread"}</strong>
            <p>{hidden.detail}</p>
          </div>
          <span>{primaryCreateLabel}</span>
        </div>
        <div className="grid two">
          <section className="automation-status-section">
            <AutomationHeadingLabel tooltip="The legacy compiler can still be inspected in developer mode.">How to inspect legacy artifacts</AutomationHeadingLabel>
            <p className="panel-note">{hidden.enableInstruction}</p>
          </section>
          <section className="automation-status-section">
            <AutomationHeadingLabel tooltip="The recorder path captures successful normal chat behavior before creating a reusable playbook.">Recommended path</AutomationHeadingLabel>
            <p className="panel-note">Start a new Workflow Recording and run this task through normal Ambient chat. Stop the recording to save successful tool examples and failed approaches as a searchable playbook.</p>
          </section>
        </div>
      </section>
    </div>
  );
}

export function AutomationFolderPane({
  folderName,
  legacyCompilerEnabled,
  localTasksTooltip,
  threads,
  taskBoard,
  routeDetailForThread,
  onOpenThread,
}: AutomationFolderPaneProps) {
  return (
    <div className="automation-pane-shell">
      <AutomationExplainer
        paragraphs={[
          `${folderName} groups workflow and local-task threads without changing their project, run history, source program, or audit trail.`,
          legacyCompilerEnabled
            ? "Selecting a Workflow Agent thread opens its thread view. Creation controls stay in the New Workflow and Local Tasks panes so folders remain organization surfaces."
            : "Selecting a legacy workflow thread shows the hidden-legacy notice. Creation controls stay in the New Workflow Recording and Local Tasks panes so folders remain organization surfaces.",
        ]}
      />
      <AutomationThreadCardGrid
        threads={threads}
        emptyText="No automations in this folder."
        routeDetailForThread={routeDetailForThread}
        onOpenThread={onOpenThread}
      />
      <div className="automation-workspace-grid">
        <section className="automation-section">
          <AutomationHeadingLabel tooltip={localTasksTooltip}>Local Tasks</AutomationHeadingLabel>
          {taskBoard}
        </section>
      </div>
    </div>
  );
}

export function WorkflowAgentCompilerStartPane({
  workflowRequest,
  workflowError,
  workflowBusy,
  workflowAgentTooltip,
  startDiscoveryBusy,
  discoveryDisabled,
  compileAction,
  revisionSourceTitle,
  projectField,
  compileActivity,
  requestTextareaRef,
  onWorkflowRequestChange,
  onRefreshDashboard,
  onCreateSample,
  onStartDiscovery,
  onCompile,
  onClearRevision,
}: WorkflowAgentCompilerStartPaneProps) {
  return (
    <div className="automation-pane-shell">
      <AutomationExplainer
        paragraphs={[
          "Create a Workflow Agent thread by describing the repeatable process and answering locked discovery questions. The thread will own the plan, diagram, generated program, versions, runs, and audits.",
          "Skipping discovery is available as an advanced shortcut, but the recommended path is to let discovery collect scope, data-source, LLM-role, side-effect, review, and error-handling decisions before compilation.",
        ]}
      />
      <section className="automation-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip={workflowAgentTooltip}>New Workflow</AutomationHeadingLabel>
          <div className="task-heading-actions">
            <button type="button" className="panel-button mini" title="Reload workflow artifacts, runs, and audit details." disabled={Boolean(workflowBusy)} onClick={() => void onRefreshDashboard()}>
              Refresh
            </button>
            <button type="button" className="panel-button mini" title="Create a sample workflow artifact for previewing the Workflow Agent surface." disabled={Boolean(workflowBusy)} onClick={() => void onCreateSample()}>
              {workflowBusy === "sample" ? "Creating" : "Create sample"}
            </button>
          </div>
        </div>
        <div className="automation-controls-grid">
          {projectField}
          <label className="automation-field wide">
            <span>
              <strong>Request</strong>
              <InfoTooltip text="Describe the repeatable process that should become a Workflow Agent thread." className="heading-info-tooltip" />
            </span>
            <textarea
              ref={requestTextareaRef}
              className="panel-textarea"
              value={workflowRequest}
              onChange={(event) => onWorkflowRequestChange(event.target.value)}
              placeholder="Workflow request"
              rows={4}
            />
          </label>
        </div>
        <div className="task-heading-actions">
          <button
            type="button"
            className="panel-button icon-panel-button"
            title="Start locked Workflow Discovery questions before compiling this workflow."
            disabled={discoveryDisabled}
            onClick={() => void onStartDiscovery()}
          >
            {startDiscoveryBusy && <LoaderCircle size={14} className="spin" />}
            Start discovery
          </button>
          <button
            type="button"
            className="panel-button icon-panel-button"
            title={compileAction.title}
            disabled={compileAction.disabled}
            onClick={() => void onCompile()}
          >
            {workflowBusy === "compile" && <LoaderCircle size={14} className="spin" />}
            {compileAction.label}
          </button>
          {revisionSourceTitle && (
            <button type="button" className="panel-button mini" disabled={workflowBusy === "compile"} onClick={onClearRevision}>
              Clear revision
            </button>
          )}
        </div>
        {revisionSourceTitle && (
          <div className="workflow-revision-source">
            <span>
              Revision draft from <strong>{revisionSourceTitle}</strong>
            </span>
          </div>
        )}
        {compileActivity}
        {workflowError && <p className="panel-status error">{workflowError}</p>}
      </section>
    </div>
  );
}

export function automationThreadStatusGroups(threads: AutomationThreadSummary[]): AutomationThreadStatusGroups {
  return {
    running: threads.filter((thread) => automationIndicatorKind(thread.status) === "running"),
    review: threads.filter((thread) => thread.needsReview || ["paused", "needs_input", "ready_for_preview", "review"].includes(thread.status)),
    failed: threads.filter((thread) => automationIndicatorKind(thread.status) === "error"),
    completed: threads.filter((thread) => ["done", "succeeded", "approved"].includes(thread.status)),
  };
}

export function AutomationThreadCardGrid({
  threads,
  emptyText,
  routeDetailForThread,
  onOpenThread,
}: AutomationThreadCardGridProps) {
  if (!threads.length) return <p className="panel-note">{emptyText}</p>;
  return (
    <div className="automation-thread-grid">
      {threads.slice(0, 12).map((thread) => (
        <button
          key={thread.id}
          type="button"
          className="automation-thread-card"
          title={routeDetailForThread?.(thread)}
          onClick={() => onOpenThread(thread)}
        >
          <span>{thread.kind === "workflow_artifact" ? <Bot size={15} /> : <CalendarClock size={15} />}</span>
          <strong>{thread.title}</strong>
          <small>{formatTaskState(thread.status)} · {thread.projectName}</small>
        </button>
      ))}
    </div>
  );
}

export function AutomationThreadStatusGrid({
  sections,
  routeDetailForThread,
  onOpenThread,
  className = "automation-status-grid",
  sectionClassName = "automation-status-section",
}: AutomationThreadStatusGridProps) {
  return (
    <div className={className}>
      {sections.map((section) => (
        <section className={sectionClassName} key={section.id}>
          <AutomationHeadingLabel tooltip={section.tooltip}>{section.label}</AutomationHeadingLabel>
          <AutomationThreadCardGrid
            threads={section.threads}
            emptyText={section.emptyText}
            routeDetailForThread={routeDetailForThread}
            onOpenThread={onOpenThread}
          />
        </section>
      ))}
    </div>
  );
}

export function AutomationHomeStatusGrid({
  groups,
  reviewTooltip,
  routeDetailForThread,
  onOpenThread,
}: AutomationHomeStatusGridProps) {
  return (
    <AutomationThreadStatusGrid
      sections={[
        {
          id: "running",
          label: "Running Now",
          tooltip: "Automation work currently preparing, running, or claimed.",
          threads: groups.running,
          emptyText: "No automation runs are active.",
        },
        {
          id: "review",
          label: "Needs Review",
          tooltip: reviewTooltip,
          threads: groups.review,
          emptyText: "No automations need review.",
        },
        {
          id: "failed",
          label: "Recently Failed",
          tooltip: "Automation threads whose latest task or run failed.",
          threads: groups.failed,
          emptyText: "No recent failures.",
        },
        {
          id: "completed",
          label: "Recently Completed",
          tooltip: "Automation threads with completed or approved latest work.",
          threads: groups.completed,
          emptyText: "No recent completions.",
        },
      ]}
      routeDetailForThread={routeDetailForThread}
      onOpenThread={onOpenThread}
    />
  );
}

export function WorkflowRuntimeBrowserScreenshotPreview({
  artifactPath,
  onPreviewPath,
  onOpenMediaModal,
}: {
  artifactPath: string;
  onPreviewPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const [file, setFile] = useState<WorkspaceFileContent | undefined>();
  const [error, setError] = useState<string | undefined>();
  const mediaKind = artifactMediaKindFromPath(artifactPath);
  const openPreview = () => {
    if (mediaKind === "image") onOpenMediaModal(artifactPath, "image");
    else onPreviewPath(artifactPath);
  };

  useEffect(() => {
    let cancelled = false;
    setFile(undefined);
    setError(undefined);
    window.ambientDesktop
      .readWorkspaceFile(artifactPath)
      .then((nextFile) => {
        if (cancelled) return;
        setFile(nextFile);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [artifactPath]);

  if (error) {
    return (
      <div className="workflow-runtime-browser-screenshot unavailable">
        <FileImage size={13} />
        <span>Screenshot preview unavailable.</span>
        <code title={artifactPath}>{artifactPath}</code>
        <button type="button" className="artifact-link compact" onClick={openPreview} title={`Open ${artifactPath}`}>
          Open artifact
        </button>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="workflow-runtime-browser-screenshot loading">
        <FileImage size={13} />
        <span>Loading screenshot preview...</span>
      </div>
    );
  }

  if (mediaKind === "image" && file.kind === "image" && file.dataUrl) {
    return (
      <figure className="workflow-runtime-browser-screenshot">
        <button type="button" className="workflow-runtime-browser-screenshot-image" onClick={openPreview} title={`Open full-size screenshot ${artifactPath}`}>
          <img src={file.dataUrl} alt={file.name} />
        </button>
        <figcaption>
          <FileImage size={13} />
          <span>{file.name}</span>
          <small>{[formatPanelFileSize(file.size), file.mimeType].filter(Boolean).join(" · ")}</small>
          <button type="button" className="artifact-link compact" onClick={openPreview} title={`Open full-size screenshot ${artifactPath}`}>
            <Maximize2 size={12} />
            Open full size
          </button>
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="workflow-runtime-browser-screenshot unavailable">
      <FileImage size={13} />
      <span>Screenshot artifact captured.</span>
      <code title={artifactPath}>{artifactPath}</code>
      <button type="button" className="artifact-link compact" onClick={openPreview} title={`Open ${artifactPath}`}>
        Open artifact
      </button>
    </div>
  );
}

export type ThreadIndicatorKind = "running" | "awaiting" | "error" | "idle";

export function automationIndicatorKind(status: string): ThreadIndicatorKind {
  if (["running", "preparing", "claimed", "created"].includes(status)) return "running";
  if (["failed", "error", "canceled", "stalled", "stale", "rejected"].includes(status)) return "error";
  if (["pending", "paused", "prepared", "ready_for_preview"].includes(status)) return "awaiting";
  return "idle";
}
