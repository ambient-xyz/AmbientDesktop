import type { ReactNode } from "react";
import { Bot, ClipboardPaste, LoaderCircle, Zap } from "lucide-react";

import type {
  WorkflowCompileProgress,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowGraphNode,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/types";
import { formatTaskState } from "./RightPanel";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import {
  WorkflowCompileAuditInlineCard,
  WorkflowProgramInspector,
} from "./AutomationsWorkflowReviewViews";
import {
  WorkflowDiscoveryActivity,
  WorkflowDiscoveryContextReview,
  WorkflowDiscoverySummary,
} from "./AutomationsWorkflowDiscoveryViews";
import { WorkflowExplorationPreflightView } from "./AutomationsWorkflowExplorationViews";
import { WorkflowPersistentStatusView } from "./AutomationsWorkflowRuntimeViews";
import { WorkflowThreadTranscript } from "./AutomationsWorkflowUtilityViews";
import {
  workflowPersistentStatusModel,
  type WorkflowPersistentStatusModel,
  type WorkflowPersistentStatusTarget,
} from "./workflowPersistentStatusUiModel";
import type { WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";
import {
  normalizeWorkflowBuildPanelId,
  workflowBuildPanelIdForArtifactPanel,
  workflowBuildPanelTabs,
  type WorkflowArtifactPanelId,
  type WorkflowBuildPanelId,
} from "./workflowArtifactPanelUiModel";
import type { WorkflowExplorationGateModel } from "./workflowExplorationGateUiModel";
import { workflowExplorationPreflightModel } from "./workflowExplorationPreflightUiModel";
import { workflowRunOutputCards } from "./workflowRunOutputUiModel";
import { workflowReviewWorkspaceModel } from "./workflowReviewUiModel";
import { workflowThreadSessionUiModel } from "./workflowThreadSessionUiModel";

export type WorkflowBuildWorkspaceViewModelInput = {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  selectedDetail?: WorkflowRunDetail;
  runs: WorkflowRunSummary[];
  versions: WorkflowVersionSummary[];
  explorationTraceCount: number;
  explorationGate: WorkflowExplorationGateModel;
  selectedWorkflowAgentThreadId?: string;
  selectedWorkflowAgentSourceNode?: WorkflowGraphNode;
  workflowBusy?: string;
  workflowCompileThreadId?: string;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryBusy?: string;
  workflowThreadSessionBusy?: string;
  workflowThreadComposerBusy?: string;
  sourceDrafts: Record<string, string>;
};

export type WorkflowBuildWorkspaceViewModel = {
  detail?: WorkflowRunDetail;
  latestRun?: WorkflowRunSummary;
  versions: WorkflowVersionSummary[];
  selectedSourceNode?: WorkflowGraphNode;
  currentVersion?: WorkflowVersionSummary;
  persistentStatus: WorkflowPersistentStatusModel;
  explorationTraceCount: number;
  explorationGate: WorkflowExplorationGateModel;
  sessionPreparing: boolean;
  sourceDraft?: string;
  outputCount: number;
};

export function workflowBuildWorkspaceViewModel(input: WorkflowBuildWorkspaceViewModelInput): WorkflowBuildWorkspaceViewModel {
  const detail =
    input.selectedDetail && (!input.artifact || input.selectedDetail.artifact.id === input.artifact.id)
      ? input.selectedDetail
      : undefined;
  const latestRun = input.artifact ? input.runs.find((run) => run.artifactId === input.artifact?.id) : undefined;
  const versions = input.versions.filter((version) => version.workflowThreadId === input.thread.id);
  const currentVersion = input.artifact ? input.versions.find((version) => version.artifactId === input.artifact?.id) : undefined;
  const selectedSourceNode =
    input.thread.id === input.selectedWorkflowAgentThreadId ? input.selectedWorkflowAgentSourceNode : undefined;

  return {
    detail,
    latestRun,
    versions,
    selectedSourceNode,
    currentVersion,
    persistentStatus: workflowPersistentStatusModel({
      thread: input.thread,
      artifact: input.artifact,
      latestRun,
      detail,
      compileActive: input.workflowBusy === "compile" && input.workflowCompileThreadId === input.thread.id,
      compileProgress: input.workflowCompileThreadId === input.thread.id ? input.workflowCompileProgress : [],
      discoveryBusy: input.workflowDiscoveryBusy,
    }),
    explorationTraceCount: input.explorationTraceCount,
    explorationGate: input.explorationGate,
    sessionPreparing:
      input.workflowThreadSessionBusy === input.thread.id ||
      (input.workflowThreadComposerBusy === input.thread.id && !input.thread.chatThreadId),
    sourceDraft: input.artifact ? input.sourceDrafts[input.artifact.id] : undefined,
    outputCount: workflowRunOutputCards(detail).length,
  };
}

export function WorkflowBuildWorkspace({
  thread,
  artifact,
  detail,
  latestRun,
  versions,
  transcriptCards,
  requestedArtifactPanel,
  selectedNodeId,
  selectedSourceNode,
  currentVersion,
  persistentStatus,
  explorationTraceCount,
  explorationGate,
  sessionPreparing,
  workflowBusy,
  sourceDraft,
  onOpenPersistentStatusTarget,
  onSetBuildPanel,
  onPrepareSession,
  onOpenTranscriptPanel,
  onResolveRevision,
  onRunExploration,
  onSkipExploration,
  onCompile,
  onSelectSourceNode,
  onSourceDraftChange,
  onSourceDraftClear,
  onSourceSave,
  renderRequestEditor,
  renderThreadComposer,
  renderRuntimeInputPanel,
  renderReviewWorkspace,
  renderExplorationPanel,
  renderRunConsolePanel,
  renderOutputsPanel,
  renderManifestPanel,
  renderPermissionsPanel,
  renderVersionHistoryPanel,
  outputCount,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  detail?: WorkflowRunDetail;
  latestRun?: WorkflowRunSummary;
  versions: WorkflowVersionSummary[];
  transcriptCards: WorkflowThreadTranscriptCard[];
  requestedArtifactPanel?: WorkflowArtifactPanelId;
  selectedNodeId?: string;
  selectedSourceNode?: WorkflowGraphNode;
  currentVersion?: WorkflowVersionSummary;
  persistentStatus: WorkflowPersistentStatusModel;
  explorationTraceCount: number;
  explorationGate: WorkflowExplorationGateModel;
  sessionPreparing: boolean;
  workflowBusy?: string;
  sourceDraft?: string;
  onOpenPersistentStatusTarget: (workflowThreadId: string | undefined, target: WorkflowPersistentStatusTarget) => void;
  onSetBuildPanel: (workflowThreadId: string | undefined, panel: WorkflowBuildPanelId) => void;
  onPrepareSession: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onOpenTranscriptPanel: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
  onResolveRevision: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
  onRunExploration: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onSkipExploration: (thread: WorkflowAgentThreadSummary) => void;
  onCompile: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onSelectSourceNode: (nodeId: string) => void;
  onSourceDraftChange: (artifactId: string, source: string) => void;
  onSourceDraftClear: (artifactId: string) => void;
  onSourceSave: (artifactId: string, source: string) => void | Promise<void>;
  renderRequestEditor: (thread: WorkflowAgentThreadSummary, ariaLabel?: string) => ReactNode;
  renderThreadComposer: (thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) => ReactNode;
  renderRuntimeInputPanel: (detail: WorkflowRunDetail | undefined) => ReactNode;
  renderReviewWorkspace: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
  renderExplorationPanel: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) => ReactNode;
  renderRunConsolePanel: (
    artifact: WorkflowArtifactSummary | undefined,
    latestRun: WorkflowRunSummary | undefined,
    detail: WorkflowRunDetail | undefined,
  ) => ReactNode;
  renderOutputsPanel: (
    artifact: WorkflowArtifactSummary | undefined,
    latestRun: WorkflowRunSummary | undefined,
    detail: WorkflowRunDetail | undefined,
  ) => ReactNode;
  renderManifestPanel: (artifact: WorkflowArtifactSummary, latestRun: WorkflowRunSummary | undefined) => ReactNode;
  renderPermissionsPanel: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
  renderVersionHistoryPanel: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
  outputCount: number;
}) {
  const answeredQuestionCount = thread.discoveryQuestions.filter((question) => question.answer).length;
  const buildTabs = workflowBuildPanelTabs({
    artifact,
    detail,
    latestRun,
    selectedNodeId,
    questionCount: thread.discoveryQuestions.length,
    answeredQuestionCount,
    explorationTraceCount,
    explorationStateLabel: explorationGate.label,
    versionCount: versions.length,
    outputCount,
  });
  const activeBuildPanel = normalizeWorkflowBuildPanelId(workflowBuildPanelIdForArtifactPanel(requestedArtifactPanel), buildTabs);
  const activePanelIsRunEvidence = requestedArtifactPanel === "run_console" || requestedArtifactPanel === "runtime_input" || requestedArtifactPanel === "outputs";
  const dataBuildPanel =
    requestedArtifactPanel === "run_console"
      ? "runs-live"
      : requestedArtifactPanel === "runtime_input"
        ? "runs-input"
        : requestedArtifactPanel === "outputs"
          ? "runs-outputs"
          : activeBuildPanel;
  return (
    <section className="automation-section automation-focus-primary workflow-build-workspace" data-mode="build">
      <WorkflowPersistentStatusView threadId={thread.id} model={persistentStatus} onOpenTarget={onOpenPersistentStatusTarget} />
      <div className="workflow-build-shell">
        <nav className="workflow-build-rail" role="tablist" aria-label="Workflow Agent Build panels">
          {buildTabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={!activePanelIsRunEvidence && activeBuildPanel === tab.id}
              className={!activePanelIsRunEvidence && activeBuildPanel === tab.id ? "active" : ""}
              key={tab.id}
              data-panel-target={tab.id}
              title={tab.detail}
              disabled={tab.disabled}
              onClick={() => onSetBuildPanel(thread.id, tab.id)}
            >
              <span>{tab.label}</span>
              {tab.badge && <small>{tab.badge}</small>}
            </button>
          ))}
        </nav>
        <div
          className="workflow-build-panel-body"
          data-workflow-build-panel={dataBuildPanel}
          data-workflow-artifact-panel={requestedArtifactPanel ?? "overview"}
        >
          {requestedArtifactPanel === "run_console" ? (
            <section id="runs-live" className="workflow-build-panel-section">
              {renderRunConsolePanel(artifact, latestRun, detail)}
            </section>
          ) : requestedArtifactPanel === "runtime_input" ? (
            <section id="runs-input" className="workflow-build-panel-section">
              {renderRuntimeInputPanel(detail) ?? (
                <div className="workflow-artifact-empty-panel">
                  <strong>No runtime input is pending</strong>
                  <p>{latestRun ? "Open the run console to inspect the latest run state." : "Run the workflow to create runtime input requests."}</p>
                </div>
              )}
            </section>
          ) : requestedArtifactPanel === "outputs" ? (
            <section id="runs-outputs" className="workflow-build-panel-section">
              {renderOutputsPanel(artifact, latestRun, detail)}
            </section>
          ) : (
            <WorkflowBuildPanelContent
              thread={thread}
              artifact={artifact}
              detail={detail}
              latestRun={latestRun}
              transcriptCards={transcriptCards}
              activeBuildPanel={activeBuildPanel}
              selectedSourceNode={selectedSourceNode}
              currentVersion={currentVersion}
              sessionPreparing={sessionPreparing}
              workflowBusy={workflowBusy}
              sourceDraft={sourceDraft}
              explorationGate={explorationGate}
              onPrepareSession={onPrepareSession}
              onOpenTranscriptPanel={onOpenTranscriptPanel}
              onResolveRevision={onResolveRevision}
              onRunExploration={onRunExploration}
              onSkipExploration={onSkipExploration}
              onCompile={onCompile}
              onSelectSourceNode={onSelectSourceNode}
              onSourceDraftChange={onSourceDraftChange}
              onSourceDraftClear={onSourceDraftClear}
              onSourceSave={onSourceSave}
              renderRequestEditor={renderRequestEditor}
              renderThreadComposer={renderThreadComposer}
              renderRuntimeInputPanel={renderRuntimeInputPanel}
              renderReviewWorkspace={renderReviewWorkspace}
              renderExplorationPanel={renderExplorationPanel}
              renderManifestPanel={renderManifestPanel}
              renderPermissionsPanel={renderPermissionsPanel}
              renderVersionHistoryPanel={renderVersionHistoryPanel}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function WorkflowBuildPanelContent({
  thread,
  artifact,
  detail,
  latestRun,
  transcriptCards,
  activeBuildPanel,
  selectedSourceNode,
  currentVersion,
  sessionPreparing,
  workflowBusy,
  sourceDraft,
  explorationGate,
  onPrepareSession,
  onOpenTranscriptPanel,
  onResolveRevision,
  onRunExploration,
  onSkipExploration,
  onCompile,
  onSelectSourceNode,
  onSourceDraftChange,
  onSourceDraftClear,
  onSourceSave,
  renderRequestEditor,
  renderThreadComposer,
  renderRuntimeInputPanel,
  renderReviewWorkspace,
  renderExplorationPanel,
  renderManifestPanel,
  renderPermissionsPanel,
  renderVersionHistoryPanel,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  detail?: WorkflowRunDetail;
  latestRun?: WorkflowRunSummary;
  transcriptCards: WorkflowThreadTranscriptCard[];
  activeBuildPanel: WorkflowBuildPanelId;
  selectedSourceNode?: WorkflowGraphNode;
  currentVersion?: WorkflowVersionSummary;
  sessionPreparing: boolean;
  workflowBusy?: string;
  sourceDraft?: string;
  explorationGate: WorkflowExplorationGateModel;
  onPrepareSession: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onOpenTranscriptPanel: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
  onResolveRevision: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
  onRunExploration: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onSkipExploration: (thread: WorkflowAgentThreadSummary) => void;
  onCompile: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onSelectSourceNode: (nodeId: string) => void;
  onSourceDraftChange: (artifactId: string, source: string) => void;
  onSourceDraftClear: (artifactId: string) => void;
  onSourceSave: (artifactId: string, source: string) => void | Promise<void>;
  renderRequestEditor: (thread: WorkflowAgentThreadSummary, ariaLabel?: string) => ReactNode;
  renderThreadComposer: (thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) => ReactNode;
  renderRuntimeInputPanel: (detail: WorkflowRunDetail | undefined) => ReactNode;
  renderReviewWorkspace: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
  renderExplorationPanel: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary) => ReactNode;
  renderManifestPanel: (artifact: WorkflowArtifactSummary, latestRun: WorkflowRunSummary | undefined) => ReactNode;
  renderPermissionsPanel: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
  renderVersionHistoryPanel: (thread: WorkflowAgentThreadSummary, artifact: WorkflowArtifactSummary) => ReactNode;
}) {
  const sessionModel = workflowThreadSessionUiModel(thread, { preparing: sessionPreparing });
  if (activeBuildPanel === "build-overview") {
    return (
      <div className="workflow-build-overview-panel">
        <section
          id="build-overview"
          className="workflow-chat-first-panel"
          data-workflow-build-panel="build-overview"
          aria-label="Workflow Chat"
        >
          <div className="workflow-chat-first-panel-header">
            <div>
              <strong>Workflow Chat</strong>
              <span>Talk to Pi, inspect workflow actions, answer runtime prompts, and request revisions without leaving this thread.</span>
            </div>
            <div className="workflow-chat-first-header-actions">
              <span
                className={`workflow-chat-session-chip ${sessionModel.state}`}
                title={sessionModel.actionTitle}
                aria-label={sessionModel.label}
              >
                {sessionModel.state === "preparing" ? <LoaderCircle size={13} className="spin" /> : <Bot size={13} />}
                {sessionModel.label}
              </span>
              <span className="workflow-chat-first-status">{formatTaskState(thread.phase)}</span>
            </div>
          </div>
          <div className="workflow-chat-first-scroll">
            <section className="task-row workflow-request-card">
              <div className="task-row-header">
                <div>
                  <small className="workflow-request-label">Workflow request</small>
                  <strong>{thread.title}</strong>
                </div>
                <span>{formatTaskState(thread.phase)}</span>
              </div>
              {renderRequestEditor(thread, "Workflow thread request")}
              <div className="plugin-badges">
                <span>{thread.projectName}</span>
                <span>{thread.traceMode === "debug" ? "Debug traces" : "Production traces"}</span>
                {thread.latestVersion && <span>Version {thread.latestVersion.version}</span>}
                {artifact && <span>{formatTaskState(artifact.status)}</span>}
              </div>
            </section>
            <section className={`workflow-chat-session-card ${sessionModel.state}`} aria-label="Workflow design Pi session">
              <div>
                <small>Design session</small>
                <strong>{sessionModel.label}</strong>
                <p>{sessionModel.detail}</p>
                <div className="plugin-badges">
                  <span>{sessionModel.badge}</span>
                  {sessionModel.shortId && <span title={thread.chatThreadId}>{sessionModel.shortId}</span>}
                  <span>Workflow design</span>
                </div>
              </div>
              {sessionModel.canPrepare && (
                <button
                  type="button"
                  className="panel-button mini"
                  title={sessionModel.actionTitle}
                  disabled={sessionPreparing}
                  onClick={() => void onPrepareSession(thread)}
                >
                  <Bot size={13} />
                  {sessionModel.actionLabel}
                </button>
              )}
            </section>
            <WorkflowCompileAuditInlineCard audit={detail?.compileAudit ?? artifact?.compileAudit} />
            <WorkflowExplorationOverviewCard
              thread={thread}
              artifact={artifact}
              gate={explorationGate}
              workflowBusy={workflowBusy}
              onOpenPanel={onOpenTranscriptPanel}
              onRunExploration={onRunExploration}
              onSkipExploration={onSkipExploration}
              onCompile={onCompile}
            />
            <WorkflowThreadTranscript
              cards={transcriptCards}
              workflowBusy={workflowBusy}
              emptyDetail="The workflow request is ready. Ask Pi for a change, explanation, validation, run, or review decision."
              onOpenPanel={(panel) => onOpenTranscriptPanel(thread.id, panel)}
              onResolveRevision={(revisionId, decision) => void onResolveRevision(revisionId, decision)}
            />
            {renderRuntimeInputPanel(detail)}
          </div>
          {renderThreadComposer(thread, detail)}
        </section>
        {artifact ? (
          <>
            {renderReviewWorkspace(thread, artifact)}
          </>
        ) : (
          <p className="panel-note">This workflow thread references an artifact that is not loaded yet. Refresh Workflow Agents to reload its review and run state.</p>
        )}
      </div>
    );
  }
  if (activeBuildPanel === "build-discovery") {
    return (
      <section id="build-discovery" className="workflow-build-panel-section">
        <WorkflowDiscoveryArtifactPanel thread={thread} artifact={artifact} latestRun={latestRun} detail={detail} />
      </section>
    );
  }
  if (activeBuildPanel === "build-exploration") {
    return (
      <section id="build-exploration" className="workflow-build-panel-section">
        {renderExplorationPanel(thread, artifact)}
      </section>
    );
  }
  if (activeBuildPanel === "build-source") {
    return (
      <section id="build-source" className="workflow-build-panel-section">
        {artifact ? (
          <WorkflowProgramInspector
            artifact={artifact}
            detail={detail}
            disabled={Boolean(workflowBusy)}
            manifestOpen={false}
            sourceOpen
            rootClassName="workflow-review-program-inspector workflow-artifact-source-panel"
            sourceSaveBusy={workflowBusy === `source:${artifact.id}`}
            persistedSourceDraft={sourceDraft}
            selectedSourceNode={selectedSourceNode}
            sourceNodes={thread.graph?.nodes}
            onSelectSourceNode={onSelectSourceNode}
            sourceVersion={currentVersion}
            onSourceDraftChange={(source) => onSourceDraftChange(artifact.id, source)}
            onSourceDraftClear={() => onSourceDraftClear(artifact.id)}
            onSourceSave={(source) => onSourceSave(artifact.id, source)}
          />
        ) : (
          <p className="panel-note">Compile or load a workflow artifact to inspect the generated program.</p>
        )}
      </section>
    );
  }
  if (activeBuildPanel === "build-manifest") {
    return (
      <section id="build-manifest" className="workflow-build-panel-section">
        {artifact ? renderManifestPanel(artifact, latestRun) : <p className="panel-note">Compile or load a workflow artifact to inspect its manifest.</p>}
      </section>
    );
  }
  if (activeBuildPanel === "build-permissions") {
    return (
      <section id="build-permissions" className="workflow-build-panel-section">
        {artifact ? renderPermissionsPanel(thread, artifact) : <p className="panel-note">Compile or load a workflow artifact to inspect permissions.</p>}
      </section>
    );
  }
  return (
    <section id="build-versions" className="workflow-build-panel-section">
      {artifact ? renderVersionHistoryPanel(thread, artifact) ?? <p className="panel-note">No workflow versions are recorded yet.</p> : <p className="panel-note">Compile or load a workflow artifact to inspect versions.</p>}
    </section>
  );
}

function WorkflowExplorationOverviewCard({
  thread,
  artifact,
  gate,
  workflowBusy,
  onOpenPanel,
  onRunExploration,
  onSkipExploration,
  onCompile,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  gate: WorkflowExplorationGateModel;
  workflowBusy?: string;
  onOpenPanel: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
  onRunExploration: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
  onSkipExploration: (thread: WorkflowAgentThreadSummary) => void;
  onCompile: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
}) {
  if (gate.state === "locked") return null;
  const explorationBusy = workflowBusy === `exploration:${thread.id}`;
  const compileBusy = workflowBusy === "compile";
  const compileEnabled = gate.canCompileFromExploration || gate.canCompileWithoutExploration;
  const preflight = workflowExplorationPreflightModel({ gate, thread, artifact });
  return (
    <section className={`workflow-exploration-overview-card ${gate.state}`}>
      <div className="task-row-header">
        <div>
          <small>Exploration</small>
          <strong>{gate.title}</strong>
          <p>{gate.detail}</p>
        </div>
        <span>{gate.label}</span>
      </div>
      <div className="plugin-badges">
        {gate.reasonLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <WorkflowExplorationPreflightView preflight={preflight} compact />
      <div className="workflow-thread-transcript-card-actions">
        <button type="button" className="panel-button mini" onClick={() => onOpenPanel(thread.id, "exploration")}>
          Open exploration
        </button>
        <button
          type="button"
          className="panel-button mini"
          disabled={!gate.canRun || Boolean(workflowBusy)}
          onClick={() => void onRunExploration(thread)}
        >
          {explorationBusy ? <LoaderCircle size={13} className="spin" /> : <Zap size={13} />}
          {gate.state === "completed" ? "Rerun" : "Run"}
        </button>
        <button type="button" className="panel-button mini" disabled={!gate.canSkip || Boolean(workflowBusy)} onClick={() => onSkipExploration(thread)}>
          Skip
        </button>
        <button
          type="button"
          className="panel-button mini primary"
          disabled={!compileEnabled || Boolean(workflowBusy)}
          onClick={() => void onCompile(thread)}
        >
          {compileBusy ? <LoaderCircle size={13} className="spin" /> : <ClipboardPaste size={13} />}
          {gate.canCompileWithoutExploration ? "Compile without trace" : "Compile from trace"}
        </button>
      </div>
    </section>
  );
}

function WorkflowDiscoveryArtifactPanel({
  thread,
  artifact,
  latestRun,
  detail,
}: {
  thread: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  detail?: WorkflowRunDetail;
}) {
  const answeredCount = thread.discoveryQuestions.filter((question) => question.answer).length;
  const hasDiscoveryActivity = thread.discoveryQuestions.some((question) => (question.activityEvents?.length ?? 0) > 0);
  const review = artifact ? workflowReviewWorkspaceModel({ thread, artifact, latestRun, detail }) : undefined;
  return (
    <div className="workflow-discovery-artifact-panel">
      <section className="workflow-manifest-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip="Discovery answers are the durable planning decisions used to compile this workflow.">
            Discovery answers
          </AutomationHeadingLabel>
          <span className="panel-note inline">
            {answeredCount}/{thread.discoveryQuestions.length} answered
          </span>
        </div>
        {thread.discoveryQuestions.length ? <WorkflowDiscoverySummary questions={thread.discoveryQuestions} /> : <p className="panel-note">This workflow was compiled directly from the request.</p>}
      </section>
      <section className="workflow-manifest-section">
        <AutomationHeadingLabel tooltip="Discovery activity shows scans, Ambient/Pi question generation, graph patches, access requests, and failures.">
          Discovery activity
        </AutomationHeadingLabel>
        {hasDiscoveryActivity ? <WorkflowDiscoveryActivity questions={thread.discoveryQuestions} /> : <p className="panel-note">No discovery activity events are retained for this thread.</p>}
      </section>
      {review ? <WorkflowDiscoveryContextReview model={review.discoveryContext} /> : null}
    </div>
  );
}
