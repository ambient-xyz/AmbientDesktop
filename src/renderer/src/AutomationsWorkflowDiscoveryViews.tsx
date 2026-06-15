import { Bot, Check, CheckCircle2, ClipboardPaste, Clock, LoaderCircle, MessageCircle, RefreshCw, Shield, X } from "lucide-react";
import type { CSSProperties, ReactNode, RefObject } from "react";

import type {
  PermissionPromptResponseMode,
  WorkflowCompileProgress,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDiscoveryAccessRequest,
  WorkflowDiscoveryProgress,
  WorkflowRevisionSummary,
} from "../../shared/types";
import { workflowDiscoveryAnswerText } from "../../shared/workflowDiscovery";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { formatDelay } from "./AutomationsRunHistory";
import { formatDurationMs, formatTaskState } from "./RightPanel";
import { WorkflowPersistentStatusView } from "./AutomationsWorkflowRuntimeViews";
import { WorkflowCompileActivity } from "./AutomationsWorkflowReviewViews";
import type { WorkflowDiscoveryContextReviewModel } from "./workflowReviewUiModel";
import { workflowPersistentStatusModel, type WorkflowPersistentStatusModel, type WorkflowPersistentStatusTarget } from "./workflowPersistentStatusUiModel";
import { workflowRevisionCards } from "./workflowRevisionUiModel";

export type WorkflowDiscoveryQuestion = WorkflowAgentThreadSummary["discoveryQuestions"][number];

export interface WorkflowDiscoveryThreadWorkspaceViewModel {
  questions: WorkflowDiscoveryQuestion[];
  persistentStatus: WorkflowPersistentStatusModel;
  scopedDiscoveryProgress?: WorkflowDiscoveryProgress;
}

export interface WorkflowDiscoveryThreadWorkspaceViewModelInput {
  thread: WorkflowAgentThreadSummary;
  revision?: WorkflowRevisionSummary;
  artifact?: WorkflowArtifactSummary;
  workflowBusy?: string;
  workflowCompileThreadId?: string;
  workflowCompileProgress: WorkflowCompileProgress[];
  workflowDiscoveryBusy?: string;
  workflowDiscoveryProgress?: WorkflowDiscoveryProgress;
}

export function workflowDiscoveryThreadWorkspaceViewModel({
  thread,
  revision,
  artifact,
  workflowBusy,
  workflowCompileThreadId,
  workflowCompileProgress,
  workflowDiscoveryBusy,
  workflowDiscoveryProgress,
}: WorkflowDiscoveryThreadWorkspaceViewModelInput): WorkflowDiscoveryThreadWorkspaceViewModel {
  const questions = workflowDiscoveryThreadQuestions(thread, revision);
  return {
    questions,
    persistentStatus: workflowPersistentStatusModel({
      thread: { ...thread, discoveryQuestions: questions },
      artifact,
      compileActive: workflowBusy === "compile" && workflowCompileThreadId === thread.id,
      compileProgress: workflowCompileThreadId === thread.id ? workflowCompileProgress : [],
      discoveryBusy: workflowDiscoveryBusy,
    }),
    scopedDiscoveryProgress:
      workflowDiscoveryProgress?.workflowThreadId === thread.id && (!revision || workflowDiscoveryProgress.revisionId === revision.id)
        ? workflowDiscoveryProgress
        : undefined,
  };
}

export function workflowDiscoveryThreadQuestions(
  thread: Pick<WorkflowAgentThreadSummary, "discoveryQuestions">,
  revision?: Pick<WorkflowRevisionSummary, "id">,
): WorkflowDiscoveryQuestion[] {
  return revision
    ? thread.discoveryQuestions.filter((question) => question.revisionId === revision.id)
    : thread.discoveryQuestions.filter((question) => !question.revisionId);
}

export function formatWorkflowTimeoutMode(value: string): string {
  if (value === "idle_watchdog") return "idle watchdog";
  if (value === "elapsed_hard_limit") return "elapsed hard limit";
  return value.replace(/_/g, " ");
}

export function workflowDiscoveryProgressDetail(progress?: WorkflowDiscoveryProgress): string | undefined {
  if (!progress) return undefined;
  const details = [
    progress.provider ? `${progress.provider}${progress.providerModel ? `/${progress.providerModel}` : ""}` : undefined,
    progress.detail,
    progress.metrics?.providerStage !== undefined ? `stage: ${String(progress.metrics.providerStage)}` : undefined,
    progress.metrics?.thinkingChars !== undefined ? `thinking: ${Number(progress.metrics.thinkingChars).toLocaleString()} chars` : undefined,
    progress.metrics?.responseChars !== undefined ? `response: ${Number(progress.metrics.responseChars).toLocaleString()} chars` : undefined,
    progress.metrics?.providerElapsedMs !== undefined ? `elapsed: ${formatDurationMs(Number(progress.metrics.providerElapsedMs))}` : undefined,
    progress.metrics?.idleElapsedMs !== undefined && progress.metrics?.idleTimeoutMs !== undefined
      ? `idle: ${formatDurationMs(Number(progress.metrics.idleElapsedMs))} / ${formatDurationMs(Number(progress.metrics.idleTimeoutMs))} timeout`
      : undefined,
    progress.metrics?.absoluteTimeoutMs !== undefined ? `hard limit: ${formatDurationMs(Number(progress.metrics.absoluteTimeoutMs))}` : undefined,
    progress.metrics?.timeoutMode !== undefined ? `timeout mode: ${formatWorkflowTimeoutMode(String(progress.metrics.timeoutMode))}` : undefined,
    progress.metrics?.fileCount !== undefined ? `files: ${Number(progress.metrics.fileCount).toLocaleString()}` : undefined,
    progress.metrics?.connectorCount !== undefined ? `connectors: ${Number(progress.metrics.connectorCount).toLocaleString()}` : undefined,
    progress.metrics?.pluginToolCount !== undefined ? `plugin tools: ${Number(progress.metrics.pluginToolCount).toLocaleString()}` : undefined,
    progress.metrics?.evidenceCount !== undefined ? `evidence: ${Number(progress.metrics.evidenceCount).toLocaleString()}` : undefined,
    progress.error,
  ].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : undefined;
}

export function workflowDiscoveryLiveStatusTitle(busy: string | undefined, progress?: WorkflowDiscoveryProgress): string {
  if (progress?.status === "failed") return "Discovery provider failed";
  if (progress?.metrics?.providerStage === "retrying") return "Retrying Pi discovery response";
  if (progress?.phase === "model" && progress.metrics?.responseChars !== undefined && Number(progress.metrics.responseChars) > 0) return "Receiving Pi discovery response";
  if (progress?.phase === "model" && progress.metrics?.thinkingChars !== undefined && Number(progress.metrics.thinkingChars) > 0) return "Pi is thinking through discovery";
  if (progress?.phase === "model") return "Waiting for Pi discovery response";
  if (progress?.phase === "context") return "Scanning workflow context";
  if (progress?.phase === "completed") return "Discovery question batch ready";
  return busy === "start" ? "Starting workflow discovery" : "Generating more questions";
}

export function workflowDiscoveryLiveStatusSubtitle(busy: string | undefined, progress?: WorkflowDiscoveryProgress): string {
  const detail = workflowDiscoveryProgressDetail(progress);
  if (detail) return detail;
  if (progress?.message) return progress.message;
  if (busy === "start") return "Scanning context and asking Pi for the first planner-style question batch.";
  return "Pi is incorporating your answer, updating the graph, and deciding whether follow-up questions are needed.";
}

export function WorkflowDiscoveryThreadWorkspace({
  thread,
  revision,
  layoutStyle,
  splitHandle,
  diagramPane,
  model,
  persistentStatus,
  questions: scopedQuestions,
  workflowDiscoveryProgress,
  scopedDiscoveryProgress,
  workflowDiscoveryBusy,
  workflowBusy,
  workflowError,
  workflowDiscoveryAnswers,
  optimisticWorkflowDiscoveryAnswers,
  workflowCompileProgress,
  revisions,
  onOpenPersistentStatusTarget,
  renderRequestEditor,
  renderExplorationPanel,
  onCustomValueChange,
  onAnswer,
  onResolveAccessRequest,
  onCompile,
  onOpenCompileDiagnostics,
  onEditRequest,
  onReportCompileUnsupported,
  onStartRevision,
  onResolveRevision,
}: {
  thread: WorkflowAgentThreadSummary;
  revision?: WorkflowRevisionSummary;
  layoutStyle?: CSSProperties;
  splitHandle: ReactNode;
  diagramPane: ReactNode;
  model?: WorkflowDiscoveryThreadWorkspaceViewModel;
  persistentStatus?: WorkflowPersistentStatusModel;
  questions?: WorkflowDiscoveryQuestion[];
  workflowDiscoveryProgress?: WorkflowDiscoveryProgress;
  scopedDiscoveryProgress?: WorkflowDiscoveryProgress;
  workflowDiscoveryBusy?: string;
  workflowBusy?: string;
  workflowError?: string;
  workflowDiscoveryAnswers: Record<string, string>;
  optimisticWorkflowDiscoveryAnswers: Record<string, true>;
  workflowCompileProgress: WorkflowCompileProgress[];
  revisions: WorkflowRevisionSummary[];
  onOpenPersistentStatusTarget: (workflowThreadId: string | undefined, target: WorkflowPersistentStatusTarget) => void;
  renderRequestEditor: (thread: WorkflowAgentThreadSummary, ariaLabel?: string) => ReactNode;
  renderExplorationPanel: (thread: WorkflowAgentThreadSummary, artifact?: WorkflowArtifactSummary, revision?: WorkflowRevisionSummary) => ReactNode;
  onCustomValueChange: (questionId: string, value: string) => void;
  onAnswer: (questionId: string, choiceId?: string, freeform?: string) => void | Promise<unknown>;
  onResolveAccessRequest: (questionId: string, accessRequestId: string, response: PermissionPromptResponseMode) => void | Promise<unknown>;
  onCompile: (thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) => void | Promise<unknown>;
  onOpenCompileDiagnostics: (path: string) => void | Promise<unknown>;
  onEditRequest: () => void;
  onReportCompileUnsupported: (reportText: string) => void | Promise<unknown>;
  onStartRevision: (artifact: WorkflowArtifactSummary) => void | Promise<unknown>;
  onResolveRevision: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
}) {
  const questions = model?.questions ?? scopedQuestions ?? workflowDiscoveryThreadQuestions(thread, revision);
  const statusModel = model?.persistentStatus ?? persistentStatus;
  if (!statusModel) {
    throw new Error("WorkflowDiscoveryThreadWorkspace requires a persistent status model.");
  }
  const isAnsweredOrPending = (question: (typeof questions)[number]) => Boolean(question.answer || optimisticWorkflowDiscoveryAnswers[question.id]);
  const unansweredQuestion = questions.find((question) => !isAnsweredOrPending(question));
  const answeredCount = questions.filter(isAnsweredOrPending).length;
  const allCurrentQuestionsAnswered = questions.length > 0 && answeredCount === questions.length;
  const completed = allCurrentQuestionsAnswered && (revision ? thread.phase === "revision" : thread.phase === "planned");
  const modeTitle = revision ? "Revision Discovery locked on" : "Workflow Discovery locked on";
  const modeSubtitle = revision
    ? "Planner-style questions are collecting what should change before Ambient drafts a proposed graph and source revision."
    : "Planner-style questions are collecting scope, data-source, and LLM-role decisions before source generation.";
  const liveDiscoveryProgress =
    model?.scopedDiscoveryProgress ??
    scopedDiscoveryProgress ??
    (workflowDiscoveryProgress?.workflowThreadId === thread.id && (!revision || workflowDiscoveryProgress.revisionId === revision.id)
      ? workflowDiscoveryProgress
      : undefined);

  return (
    <div className="automation-focused-grid workflow-discovery-layout" style={layoutStyle}>
      <section className="automation-section automation-focus-primary workflow-discovery-thread">
        <WorkflowPersistentStatusView threadId={thread.id} model={statusModel} onOpenTarget={onOpenPersistentStatusTarget} />
        <div className="workflow-discovery-mode-banner">
          <Bot size={15} />
          <div>
            <strong>{modeTitle}</strong>
            <span>{modeSubtitle}</span>
          </div>
        </div>
        <section className="task-row workflow-request-card">
          <strong>{revision ? "Revision request" : "Workflow request"}</strong>
          {revision ? (
            <>
              <p>{revision.requestedChange}</p>
              <p>{thread.initialRequest}</p>
            </>
          ) : (
            renderRequestEditor(thread)
          )}
          <div className="plugin-badges">
            <span>{formatTaskState(thread.phase)}</span>
            <span>{thread.projectName}</span>
            <span>{thread.traceMode === "debug" ? "Debug traces" : "Production traces"}</span>
          </div>
        </section>
        {renderExplorationPanel(thread, undefined, revision)}
        <section className="planner-decisions workflow-discovery-questions" aria-label="Workflow discovery questions">
          <div className="planner-decisions-header">
            <div>
              <div className="planner-decisions-title">Discovery questions</div>
              <div className="planner-decisions-subtitle">
                {completed
                  ? revision
                    ? "Revision discovery is complete. Compile the proposed revision when the plan and diagram look right."
                    : "Discovery is complete. Compile when the plan and diagram look right."
                  : allCurrentQuestionsAnswered && !workflowDiscoveryBusy
                    ? "All current questions are answered. Waiting for Ambient/Pi follow-up generation to complete."
                    : `${answeredCount}/${questions.length} answered`}
              </div>
            </div>
            {completed && (
              <span className="planner-decision-complete">
                <Check size={13} />
                Complete
              </span>
            )}
          </div>
          <WorkflowDiscoveryActivity questions={questions} />
          {workflowDiscoveryBusy && !workflowDiscoveryBusy.startsWith("access:") && (
            <div className="workflow-discovery-live-status" role="status" aria-live="polite">
              <LoaderCircle size={14} className="spin" />
              <div>
                <strong>{workflowDiscoveryLiveStatusTitle(workflowDiscoveryBusy, liveDiscoveryProgress)}</strong>
                <span>{workflowDiscoveryLiveStatusSubtitle(workflowDiscoveryBusy, liveDiscoveryProgress)}</span>
              </div>
            </div>
          )}
          {unansweredQuestion ? (
            <WorkflowDiscoveryQuestionView
              question={unansweredQuestion}
              customValue={workflowDiscoveryAnswers[unansweredQuestion.id] ?? ""}
              workflowDiscoveryBusy={workflowDiscoveryBusy}
              onCustomValueChange={onCustomValueChange}
              onAnswer={onAnswer}
              onResolveAccessRequest={onResolveAccessRequest}
            />
          ) : completed ? (
            <WorkflowDiscoverySummary questions={questions} />
          ) : (
            <p className="panel-note">All current answers are submitted. Waiting for the next discovery step.</p>
          )}
          {workflowError && <p className="panel-status error">{workflowError}</p>}
          <div className="planner-decision-actions">
            <button
              type="button"
              className={completed ? "primary" : undefined}
              disabled={!completed || Boolean(workflowBusy)}
              onClick={() => void onCompile(thread, revision)}
            >
              {workflowBusy === "compile" ? <LoaderCircle size={14} className="spin" /> : <ClipboardPaste size={14} />}
              {revision ? "Compile Revision" : "Compile Preview"}
            </button>
          </div>
        </section>
        <WorkflowCompileActivity
          active={workflowBusy === "compile"}
          progress={workflowCompileProgress}
          onRetrySameContext={() => void onCompile(thread, revision)}
          onOpenDiagnostics={(path) => void onOpenCompileDiagnostics(path)}
          onEditRequest={onEditRequest}
          onReportUnsupported={(reportText) => void onReportCompileUnsupported(reportText)}
        />
        <WorkflowRevisionPanel
          thread={thread}
          revisions={revisions}
          workflowBusy={workflowBusy}
          onStartRevision={onStartRevision}
          onResolveRevision={onResolveRevision}
        />
      </section>
      {splitHandle}
      {diagramPane}
    </div>
  );
}

export function WorkflowDiscoveryContextReview({ model }: { model: WorkflowDiscoveryContextReviewModel }) {
  return (
    <section className="workflow-review-section workflow-discovery-context-review">
      <div className="panel-section-heading">
        <AutomationHeadingLabel tooltip="Discovery context access records show what extra information Ambient/Pi was allowed to inspect while designing this workflow.">
          Discovery context inspected
        </AutomationHeadingLabel>
        <span className="panel-note inline">{model.tileDetail}</span>
      </div>
      {model.items.length ? (
        <div className="workflow-discovery-context-list">
          {model.items.map((item) => (
            <article className={`workflow-discovery-context-row ${item.status}`} key={`${item.questionId}:${item.id}`}>
              <div>
                <div className="task-row-header">
                  <strong>{item.targetLabel}</strong>
                  <span>{item.statusLabel}</span>
                </div>
                <p>{item.detail}</p>
                <small>
                  {item.questionLabel} - Question {item.questionId}
                  {item.grantId ? ` - Grant ${item.grantId}` : ""}
                </small>
              </div>
              <div className="plugin-badges">
                <span>{item.categoryLabel}</span>
                <span>{item.capabilityLabel}</span>
                <span>{item.scopeLabel}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel-note">Discovery used request text, answers, graph context, connector/plugin capability metadata, and safe base-directory metadata only.</p>
      )}
    </section>
  );
}

export function WorkflowRequestEditor({
  thread,
  requestDraft,
  requestChanged,
  restartBusy,
  textareaRef,
  ariaLabel = "Workflow request",
  onDraftChange,
  onReset,
  onRestart,
}: {
  thread: WorkflowAgentThreadSummary;
  requestDraft: string;
  requestChanged: boolean;
  restartBusy: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  ariaLabel?: string;
  onDraftChange: (threadId: string, value: string) => void;
  onReset: (thread: WorkflowAgentThreadSummary) => void;
  onRestart: (thread: WorkflowAgentThreadSummary) => void | Promise<unknown>;
}) {
  return (
    <div className="workflow-request-editor">
      <textarea
        ref={textareaRef}
        value={requestDraft}
        onChange={(event) => onDraftChange(thread.id, event.target.value)}
        rows={3}
        aria-label={ariaLabel}
      />
      <div className="workflow-request-editor-actions">
        <button type="button" className="panel-button mini" disabled={restartBusy || !requestChanged} onClick={() => onReset(thread)}>
          Reset
        </button>
        <button type="button" className="panel-button mini primary" disabled={restartBusy || !requestDraft.trim()} onClick={() => void onRestart(thread)}>
          {restartBusy ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}
          Restart discovery
        </button>
      </div>
    </div>
  );
}

export function WorkflowDiscoveryQuestionView({
  question,
  customValue,
  workflowDiscoveryBusy,
  onCustomValueChange,
  onAnswer,
  onResolveAccessRequest,
}: {
  question: WorkflowDiscoveryQuestion;
  customValue: string;
  workflowDiscoveryBusy?: string;
  onCustomValueChange: (questionId: string, value: string) => void;
  onAnswer: (questionId: string, choiceId?: string, freeform?: string) => void | Promise<unknown>;
  onResolveAccessRequest: (questionId: string, accessRequestId: string, response: PermissionPromptResponseMode) => void | Promise<unknown>;
}) {
  const busy = workflowDiscoveryBusy === question.id;
  return (
    <div className="planner-decision-question workflow-discovery-question" data-workflow-discovery-question-id={question.id}>
      <div className="workflow-discovery-context">{question.context}</div>
      <div className="planner-decision-question-text">
        {question.question}
        <span className="planner-decision-required">{formatTaskState(question.category)}</span>
      </div>
      {question.graphImpact && <p className="workflow-discovery-impact">{question.graphImpact}</p>}
      {question.accessRequests?.length ? (
        <div className="workflow-discovery-access-requests" aria-label="Workflow discovery access requests">
          {question.accessRequests.map((request) => {
            const accessBusy = workflowDiscoveryBusy === `access:${question.id}:${request.id}`;
            const allowed = request.status === "allowed";
            const denied = request.status === "denied";
            return (
              <div className={`workflow-discovery-access-request ${request.status}`} key={`${question.id}:${request.id}`}>
                <div className="workflow-discovery-access-copy">
                  <Shield size={14} />
                  <div>
                    <strong>More context would help</strong>
                    <span>
                      {formatDiscoveryCapability(request.capability)}: {request.targetLabel}
                    </span>
                    <small>{request.reason}</small>
                    {request.evidence && <WorkflowDiscoveryEvidence evidence={request.evidence} />}
                  </div>
                </div>
                <div className="workflow-discovery-access-actions">
                  {allowed || denied ? (
                    <span className="workflow-discovery-access-status">
                      {allowed ? <Check size={13} /> : <X size={13} />}
                      {allowed ? discoveryAccessResponseLabel(request.response) : "Denied"}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={accessBusy}
                        className={request.recommendedResponse === "allow_once" ? "recommended" : undefined}
                        onClick={() => void onResolveAccessRequest(question.id, request.id, "allow_once")}
                      >
                        {accessBusy && request.recommendedResponse === "allow_once" ? <LoaderCircle size={13} className="spin" /> : null}
                        Allow once
                      </button>
                      {request.reusableScopes.includes("workflow_thread") && (
                        <button
                          type="button"
                          disabled={accessBusy}
                          className={request.recommendedResponse === "always_workflow" ? "recommended" : undefined}
                          onClick={() => void onResolveAccessRequest(question.id, request.id, "always_workflow")}
                        >
                          Always for workflow
                        </button>
                      )}
                      {request.reusableScopes.includes("project") && (
                        <button type="button" disabled={accessBusy} onClick={() => void onResolveAccessRequest(question.id, request.id, "always_project")}>
                          Always for project
                        </button>
                      )}
                      {request.reusableScopes.includes("workspace") && (
                        <button type="button" disabled={accessBusy} onClick={() => void onResolveAccessRequest(question.id, request.id, "always_workspace")}>
                          Always for workspace
                        </button>
                      )}
                      <button type="button" disabled={accessBusy} onClick={() => void onResolveAccessRequest(question.id, request.id, "deny")}>
                        Deny
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="planner-decision-options">
        {question.choices.map((choice) => (
          <button key={choice.id} type="button" className="planner-decision-option" disabled={busy} onClick={() => void onAnswer(question.id, choice.id)}>
            <span className="planner-decision-option-topline">
              <span>{choice.label}</span>
              {choice.recommended && <span className="planner-decision-recommended">Recommended</span>}
            </span>
            <span className="planner-decision-option-description">{choice.description}</span>
          </button>
        ))}
      </div>
      {question.allowFreeform && (
        <div className="planner-decision-custom">
          <textarea value={customValue} onChange={(event) => onCustomValueChange(question.id, event.target.value)} placeholder="Freeform answer" rows={2} />
          <button type="button" disabled={busy || !customValue.trim()} onClick={() => void onAnswer(question.id, undefined, customValue)}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <MessageCircle size={14} />}
            Use freeform
          </button>
        </div>
      )}
    </div>
  );
}

export function WorkflowDiscoveryActivity({ questions }: { questions: WorkflowAgentThreadSummary["discoveryQuestions"] }) {
  const events = questions
    .flatMap((question) => question.activityEvents ?? [])
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  if (!events.length) return null;
  return (
    <div className="workflow-discovery-activity" aria-label="Workflow discovery activity">
      {events.slice(-8).map((event) => (
        <div className={`workflow-discovery-activity-event ${event.status}`} key={event.id}>
          <span className="workflow-discovery-activity-icon">
            {event.status === "completed" ? <CheckCircle2 size={18} /> : event.status === "failed" ? <X size={12} /> : event.status === "pending" ? <LoaderCircle size={12} className="spin" /> : <Clock size={12} />}
          </span>
          <div>
            <strong>{event.label}</strong>
            {event.detail && <small>{event.detail}</small>}
            <span>
              {formatTaskState(event.kind)}
              {typeof event.durationMs === "number" ? ` · ${formatDelay(event.durationMs)}` : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkflowDiscoverySummary({ questions }: { questions: WorkflowAgentThreadSummary["discoveryQuestions"] }) {
  return (
    <div className="planner-decision-summary">
      {questions.map((question) => (
        <div key={question.id} className="planner-decision-summary-row">
          <span>{question.question}</span>
          <strong>{workflowDiscoveryAnswerText(question)}</strong>
        </div>
      ))}
    </div>
  );
}

export function WorkflowRevisionPanel({
  thread,
  artifact,
  revisions,
  workflowBusy,
  onStartRevision,
  onResolveRevision,
}: {
  thread?: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  revisions: WorkflowRevisionSummary[];
  workflowBusy?: string;
  onStartRevision: (artifact: WorkflowArtifactSummary) => void;
  onResolveRevision: (revisionId: string, decision: "applied" | "rejected") => void | Promise<unknown>;
}) {
  if (!thread) return null;
  const cards = workflowRevisionCards(revisions.filter((revision) => revision.workflowThreadId === thread.id));
  if (cards.length === 0 && thread.phase !== "revision") return null;
  return (
    <section className="workflow-revision-panel" aria-label="Workflow revisions">
      <div className="panel-section-heading">
        <AutomationHeadingLabel tooltip="Plan-mode workflow revisions are persisted against the current workflow thread so proposed graph and source changes can be reviewed before they become a new version.">
          Revisions
        </AutomationHeadingLabel>
        {artifact && (
          <button type="button" className="panel-button mini" disabled={Boolean(workflowBusy)} onClick={() => onStartRevision(artifact)}>
            Revise workflow
          </button>
        )}
      </div>
      {cards.length === 0 ? (
        <p className="panel-note">Revision discovery is active. Proposed graph and source diffs will appear here after Ambient drafts a change.</p>
      ) : (
        <div className="workflow-revision-list">
          {cards.map((card) => (
            <article className={`workflow-revision-card ${card.status}`} key={card.id}>
              <div className="task-row-header">
                <strong>{card.statusLabel}</strong>
                <span>{card.updatedLabel}</span>
              </div>
              <p>{card.requestedChange}</p>
              <div className="plugin-badges">
                <span>{card.baseLabel}</span>
                <span>{card.proposedLabel}</span>
                <span>{card.graphSummary}</span>
                <span>{card.sourceSummary}</span>
              </div>
              {card.graphDetails.length > 0 && (
                <div className="workflow-revision-detail-list" aria-label="Workflow revision graph and manifest changes">
                  {card.graphDetails.map((detail, index) => (
                    <span key={`${card.id}-graph-detail-${index}`}>{detail}</span>
                  ))}
                </div>
              )}
              {card.sourcePreviewLines.length > 0 && (
                <div className="workflow-revision-source-preview" aria-label="Workflow revision source diff preview">
                  {card.sourcePreviewLines.map((line, index) => (
                    <code className={line.kind} key={`${card.id}-source-line-${index}`}>
                      {line.text}
                    </code>
                  ))}
                </div>
              )}
              {(card.canApply || card.canReject) && (
                <div className="workflow-revision-actions">
                  <button type="button" className="panel-button mini" disabled={Boolean(workflowBusy)} onClick={() => void onResolveRevision(card.id, "applied")}>
                    {workflowBusy === `revision:${card.id}:applied` ? "Applying" : "Apply revision"}
                  </button>
                  <button type="button" className="panel-button mini danger" disabled={Boolean(workflowBusy)} onClick={() => void onResolveRevision(card.id, "rejected")}>
                    {workflowBusy === `revision:${card.id}:rejected` ? "Rejecting" : "Reject proposal"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkflowDiscoveryEvidence({ evidence }: { evidence: NonNullable<WorkflowDiscoveryAccessRequest["evidence"]> }) {
  return (
    <details className="workflow-discovery-evidence">
      <summary>Evidence: {evidence.summary}</summary>
      <div className="workflow-discovery-evidence-meta">
        <span>{formatTaskState(evidence.provider)}</span>
        {typeof evidence.timingMs === "number" && <span>{formatDelay(evidence.timingMs)}</span>}
        {evidence.redacted && <span>Redacted</span>}
        {evidence.truncated && <span>Truncated</span>}
        {evidence.error && <span className="error">Error: {evidence.error}</span>}
      </div>
      {evidence.items.length ? (
        <div className="workflow-discovery-evidence-items">
          {evidence.items.map((item) => (
            <div className="workflow-discovery-evidence-item" key={item.id}>
              <strong>{item.title}</strong>
              <small>
                {item.sourceUrl ? (
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    {item.sourceLabel}
                  </a>
                ) : (
                  item.sourceLabel
                )}
                {item.publishedAt ? ` · ${item.publishedAt}` : ""}
              </small>
              <p>{item.snippet}</p>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

export function formatDiscoveryCapability(capability: string): string {
  return formatTaskState(capability);
}

export function discoveryAccessResponseLabel(response?: PermissionPromptResponseMode): string {
  if (response === "allow_once") return "Allowed once";
  if (response === "always_workflow") return "Always allowed for workflow";
  if (response === "always_project") return "Always allowed for project";
  if (response === "always_workspace") return "Always allowed for workspace";
  if (response === "always_thread") return "Always allowed for chat thread";
  return "Allowed";
}
