import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Kanban,
  MessageCircle,
  RotateCcw,
  Shield,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AddProjectBoardCardRunFeedbackInput, CopyProjectBoardSessionToThreadInput, ProjectBoardCard, ProjectBoardGitSyncStatus, ProjectBoardProofDecisionAction, ProjectBoardSplitDecisionAction, ProjectSummary } from "../../shared/projectBoardTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { OrchestrationBoard } from "../../shared/workflowTypes";
import { ProofEvidencePathLink } from "./AutomationsWorkspace";
import { formatTimelineTime } from "./RightPanel";
import {
  ProjectBoardActiveCardDetailHeader,
  ProjectBoardActiveCardDetailTabs,
  ProjectBoardActiveCardTabPanel,
  ProjectBoardActiveCardTaskSpecPanel,
  ProjectBoardRunFeedbackPanel,
} from "./ProjectBoardActiveCardDetailPanels";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardCardClaimActionState,
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardCardClaimLabel,
  projectBoardCardClaimTitle,
  projectBoardCardIsDraftInboxCandidate,
  projectBoardCanonicalCardProjection,
  projectBoardExecutionControlModel,
  projectBoardLiveSessionPreviewModel,
  projectBoardPrimaryBlockingCard,
  projectBoardProofDecisionModel,
  projectBoardProofFollowUpImpactModel,
  projectBoardUiMockReviewPanelModel,
  type ProjectBoardCardClaimAction,
  type ProjectBoardLiveSessionActivityLine,
} from "./projectBoardUiModel";

export {
  ProjectBoardActiveCardDecisionAuditPanel,
  ProjectBoardActiveCardDetailTabs,
  ProjectBoardActiveCardSourceBasisPanel,
  ProjectBoardProtectedPiUpdatePanel,
  ProjectBoardRunFeedbackPanel,
  projectBoardCardTouchedFieldLabel,
  projectBoardProofRecommendedActionLabel,
  projectBoardProofReviewerLabel,
  projectBoardProofReviewStatusLabel,
  projectBoardRunFeedbackSourceLabel,
} from "./ProjectBoardActiveCardDetailPanels";

export function ProjectBoardClaimControls({
  card,
  gitStatus,
  busy,
  onAction,
}: {
  card: ProjectBoardCard;
  gitStatus?: ProjectBoardGitSyncStatus;
  busy?: string;
  onAction: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => void;
}) {
  const isBusy = busy?.endsWith(`:${card.id}`) ?? false;
  const actionState = projectBoardCardClaimActionState(card, gitStatus, isBusy);
  const claimLabel = projectBoardCardClaimLabel(card);
  const claimTitle = projectBoardCardClaimTitle(card);
  return (
    <section className={`project-board-claim-controls ${actionState.tone}`} aria-label="Git claim controls">
      <div>
        <Shield size={15} />
        <div>
          <strong>{claimLabel ?? "No active Git claim"}</strong>
          <p>{claimTitle ?? "Claim this card before this desktop ticketizes or executes it."}</p>
        </div>
      </div>
      <button
        type="button"
        className={`panel-button mini ${actionState.tone}`}
        disabled={actionState.disabled}
        title={actionState.title}
        onClick={() => onAction(card, actionState.action)}
      >
        <Shield size={13} />
        <span>{actionState.label}</span>
      </button>
    </section>
  );
}


export function ProjectBoardLivePiSessionPreview({
  model,
  cardId,
  runBusy,
  onCopySessionToThread,
  onOpenRunThread,
  onRevealWorkspace,
}: {
  model: ReturnType<typeof projectBoardLiveSessionPreviewModel>;
  cardId: string;
  runBusy?: string;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => void;
  onRevealWorkspace: (workspacePath: string) => void;
}) {
  if (!model.visible) return null;
  const copyBusy = runBusy === model.copyAction.busyKey;
  const openThreadBusy = model.openThreadAction ? runBusy === model.openThreadAction.busyKey : false;
  const workspaceBusy = model.workspaceAction ? runBusy === model.workspaceAction.busyKey : false;
  return (
    <section className={`project-board-live-pi-preview ${model.tone}`} aria-label="Live Pi session preview">
      <header>
        <div>
          <span className="project-board-kicker">Live Pi session</span>
          <h4>{model.headline}</h4>
          <p>{model.detail}</p>
        </div>
        <div className="project-board-live-pi-status">
          <span>{model.statusLabel}</span>
          <small>{model.sessionLabel}</small>
        </div>
      </header>
      <div className="project-board-live-pi-metrics" aria-label="Pi session metrics">
        {model.metrics.map((metric) => (
          <span key={metric.label} className={metric.tone} title={metric.title}>
            <strong>{metric.value}</strong>
            {metric.label}
          </span>
        ))}
      </div>
      {model.activity.length > 0 && (
        <div className="project-board-live-pi-events" aria-label="Recent Pi session activity">
          {model.activity.map((event) => (
            <div key={event.id} className={event.kind}>
              <span>{event.label}</span>
              <p>{event.text}</p>
              {event.timestamp !== undefined && <time>{formatTimelineTime(new Date(event.timestamp).toISOString())}</time>}
            </div>
          ))}
        </div>
      )}
      {model.latestAssistantText && (
        <div className="project-board-live-pi-assistant">
          <strong>Latest assistant text</strong>
          <p>{model.latestAssistantText}</p>
        </div>
      )}
      <footer>
        {model.openThreadAction && model.openThreadAction.threadId && (
          <button
            type="button"
            className="panel-button mini secondary"
            disabled={model.openThreadAction.disabled || openThreadBusy}
            title={model.openThreadAction.title}
            onClick={() => model.openThreadAction?.threadId && onOpenRunThread(model.openThreadAction.threadId, model.workspacePath)}
          >
            <MessageCircle size={13} className={openThreadBusy ? "spin" : ""} />
            <span>{openThreadBusy ? model.openThreadAction.busyLabel : model.openThreadAction.label}</span>
          </button>
        )}
        <button
          type="button"
          className="panel-button mini primary"
          disabled={model.copyAction.disabled || copyBusy || !model.copyAction.runId}
          title={model.copyAction.title}
          onClick={() => {
            if (!model.copyAction.runId || model.copyAction.disabled) return;
            onCopySessionToThread({ cardId, runId: model.copyAction.runId });
          }}
        >
          <Copy size={13} className={copyBusy ? "spin" : ""} />
          <span>{copyBusy ? model.copyAction.busyLabel : model.copyAction.label}</span>
        </button>
        {model.workspaceAction?.workspacePath && (
          <button
            type="button"
            className="panel-button mini secondary"
            disabled={model.workspaceAction.disabled || workspaceBusy}
            title={model.workspaceAction.title}
            onClick={() => model.workspaceAction?.workspacePath && onRevealWorkspace(model.workspaceAction.workspacePath)}
          >
            <FolderOpen size={13} className={workspaceBusy ? "spin" : ""} />
            <span>{workspaceBusy ? model.workspaceAction.busyLabel : model.workspaceAction.label}</span>
          </button>
        )}
      </footer>
    </section>
  );
}


export type ProjectBoardActiveCardDetailTab = "spec" | "proof" | "dependencies" | "history";

export type ProjectBoardCardInspectorOptions = { tab?: ProjectBoardActiveCardDetailTab; scroll?: boolean };

export type ProjectBoardCardInspectorRequest = ProjectBoardCardInspectorOptions & { requestId: number };


export function ProjectBoardActiveCardDetail({
  board,
  card,
  orchestrationBoard,
  orchestrationError,
  runActivityLinesByThread,
  threadRunStatuses,
  onClose,
  runBusy,
  onPrepareRuns,
  onStartRun,
  onCancelRun,
  onRevealWorkspace,
  onOpenRunThread,
  onCopySessionToThread,
  onResolveProofDecision,
  onResolveSplitDecision,
  onAddRunFeedback,
  gitStatus,
  claimBusy,
  onClaimAction,
  inspectorRequest,
  onJumpToBlocker,
  onJumpToInbox,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  card?: ProjectBoardCard;
  orchestrationBoard?: OrchestrationBoard;
  orchestrationError?: string;
  runActivityLinesByThread: Record<string, ProjectBoardLiveSessionActivityLine[]>;
  threadRunStatuses: Record<string, RunStatus>;
  onClose: () => void;
  runBusy?: string;
  onPrepareRuns: () => void;
  onStartRun: (runId: string) => void;
  onCancelRun: (runId: string) => void;
  onRevealWorkspace: (workspacePath: string) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => void;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => void;
  onResolveProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => void;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => void;
  onAddRunFeedback: (input: AddProjectBoardCardRunFeedbackInput) => Promise<void> | void;
  gitStatus?: ProjectBoardGitSyncStatus;
  claimBusy?: string;
  onClaimAction: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => void;
  inspectorRequest?: ProjectBoardCardInspectorRequest;
  onJumpToBlocker?: (cardId: string) => void;
  onJumpToInbox?: (cardId: string) => void;
}) {
  const detailRef = useRef<HTMLElement>(null);
  const [runFeedbackDraft, setRunFeedbackDraft] = useState("");
  const [proofDecisionReason, setProofDecisionReason] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState<ProjectBoardActiveCardDetailTab>("spec");
  useEffect(() => {
    setRunFeedbackDraft("");
    setProofDecisionReason("");
    setActiveDetailTab("spec");
  }, [card?.id]);

  useEffect(() => {
    if (!card || !inspectorRequest?.requestId) return;
    if (inspectorRequest.tab) setActiveDetailTab(inspectorRequest.tab);
    if (inspectorRequest.scroll) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        detailRef.current?.focus({ preventScroll: true });
      });
    }
  }, [card?.id, inspectorRequest?.requestId, inspectorRequest?.scroll, inspectorRequest?.tab]);

  if (!card) {
    return (
      <aside className="project-board-active-card-detail empty" aria-label="Project board card detail">
        <Kanban size={18} />
        <h3>Select a card</h3>
        <p>Inspect task spec, dependencies, proof expectations, run history, and decision context before dispatch or review.</p>
      </aside>
    );
  }

  const detail = projectBoardActiveCardDetail(card, board.cards, orchestrationBoard?.tasks ?? [], orchestrationBoard?.runs ?? [], board.executionArtifacts ?? []);
  const tests = [
    ["Unit", card.testPlan.unit],
    ["Integration", card.testPlan.integration],
    ["Visual", card.testPlan.visual],
    ["Manual", card.testPlan.manual],
  ] as const;
  const decisionPolicy = board.charter?.decisionPolicy;
  const hasDecisionPolicy = Boolean(decisionPolicy && Object.keys(decisionPolicy).length > 0);
  const latestRun = detail.latestRun;
  const liveSessionThreadId = latestRun?.threadId ?? card.executionThreadId;
  const liveSessionPreview = projectBoardLiveSessionPreviewModel({
    card,
    task: detail.task,
    latestRun,
    threadStatus: liveSessionThreadId ? threadRunStatuses[liveSessionThreadId] : undefined,
    activityLines: liveSessionThreadId ? runActivityLinesByThread[liveSessionThreadId] ?? [] : [],
  });
  const proofDecision = projectBoardProofDecisionModel(card, board, detail.task, latestRun);
  const proofFollowUpImpact = projectBoardProofFollowUpImpactModel(card, board.cards);
  const uiMockReview = projectBoardUiMockReviewPanelModel(card, latestRun, proofDecision);
  const claimBlocksPrepare = projectBoardCardClaimBlocksLocalTicketization(card);
  const executionControls = projectBoardExecutionControlModel(card, board, detail, { runBusy, claimBlocksPrepare });
  const overview = projectBoardActiveCardOverviewModel(card, board, detail, executionControls);
  const primaryBlocker = projectBoardPrimaryBlockingCard(card, board.cards);
  const cardProjection = projectBoardCanonicalCardProjection(card, { task: detail.task, latestRun });
  const runFeedbackBusyKey = `feedback:${card.id}`;
  const canAddRunFeedback =
    Boolean(card.orchestrationTaskId) &&
    !["draft", "in_progress", "done", "archived"].includes(card.status) &&
    runFeedbackDraft.trim().length > 0 &&
    runBusy !== runFeedbackBusyKey;
  const runFeedbackDisabledTitle =
    card.status === "draft"
      ? "Approve this candidate into a Local Task before adding next-run feedback."
      : card.status === "in_progress"
        ? "Wait for the active Local Task run to finish before adding next-run feedback."
        : card.status === "done" || card.status === "archived"
          ? "Completed or archived cards cannot receive next-run feedback."
          : !card.orchestrationTaskId
            ? "This card is not linked to a Local Task."
            : "Enter additive next-run instructions.";
  return (
    <aside ref={detailRef} className="project-board-active-card-detail" aria-label="Project board card detail" tabIndex={-1}>
      <ProjectBoardActiveCardDetailHeader card={card} onClose={onClose} />
      {orchestrationError && <p className="panel-status error">{orchestrationError}</p>}
      <ProjectBoardActiveCardOverviewPanel
        model={overview}
        primaryBlocker={primaryBlocker}
        onJumpToBlocker={primaryBlocker && onJumpToBlocker ? () => onJumpToBlocker(primaryBlocker.id) : undefined}
        onJumpToInbox={onJumpToInbox ? () => onJumpToInbox(card.id) : undefined}
      />
      <ProjectBoardClaimControls card={card} gitStatus={gitStatus} busy={claimBusy} onAction={onClaimAction} />
      <ProjectBoardLivePiSessionPreview
        model={liveSessionPreview}
        cardId={card.id}
        runBusy={runBusy}
        onCopySessionToThread={onCopySessionToThread}
        onOpenRunThread={onOpenRunThread}
        onRevealWorkspace={onRevealWorkspace}
      />
      <ProjectBoardUiMockReviewPanel
        model={uiMockReview}
        cardId={card.id}
        workspacePath={latestRun?.workspacePath}
        runBusy={runBusy}
        onResolve={(action) => {
          if (!proofDecision.readyForDecision) return;
          onResolveProofDecision(card.id, action, proofDecisionReason.trim() || undefined);
          setProofDecisionReason("");
        }}
      />
      <ProjectBoardActiveCardTaskSpecPanel card={card} detail={detail} cardProjection={cardProjection} />
      <ProjectBoardExecutionControlPanel
        model={executionControls}
        onAction={(action) => {
          if (action.disabled) return;
          if (action.action === "prepare_run") onPrepareRuns();
          if (action.action === "start_run" && action.runId) onStartRun(action.runId);
          if (action.action === "cancel_run" && action.runId) onCancelRun(action.runId);
          if (action.action === "open_run_chat" && action.threadId) onOpenRunThread(action.threadId);
          if (action.action === "reveal_workspace" && action.workspacePath) onRevealWorkspace(action.workspacePath);
          if (action.proofDecisionAction) {
            onResolveProofDecision(card.id, action.proofDecisionAction, proofDecisionReason.trim() || undefined);
            setProofDecisionReason("");
          }
        }}
        runBusy={runBusy}
        proofDecisionReason={proofDecisionReason}
        onProofDecisionReasonChange={setProofDecisionReason}
      />
      <ProjectBoardRunFeedbackPanel
        card={card}
        draft={runFeedbackDraft}
        onDraftChange={setRunFeedbackDraft}
        disabledTitle={runFeedbackDisabledTitle}
        canSave={canAddRunFeedback}
        saving={runBusy === runFeedbackBusyKey}
        onSave={() => {
          const feedback = runFeedbackDraft.trim();
          if (!feedback) return;
          onAddRunFeedback({ cardId: card.id, feedback, source: "manual" });
          setRunFeedbackDraft("");
        }}
      />
      <ProjectBoardActiveCardDetailTabs activeTab={activeDetailTab} onChange={setActiveDetailTab} />
      <ProjectBoardActiveCardTabPanel
        activeTab={activeDetailTab}
        card={card}
        detail={detail}
        overview={overview}
        cardProjection={cardProjection}
        proofDecision={proofDecision}
        proofFollowUpImpact={proofFollowUpImpact}
        tests={tests}
        hasDecisionPolicy={hasDecisionPolicy}
        decisionPolicy={decisionPolicy}
        runBusy={runBusy}
        onResolveSplitDecision={onResolveSplitDecision}
      />
    </aside>
  );
}


export function ProjectBoardActiveCardOverviewPanel({
  model,
  primaryBlocker,
  onJumpToBlocker,
  onJumpToInbox,
}: {
  model: ReturnType<typeof projectBoardActiveCardOverviewModel>;
  primaryBlocker?: ProjectBoardCard;
  onJumpToBlocker?: () => void;
  onJumpToInbox?: () => void;
}) {
  const blockerLocation = primaryBlocker && projectBoardCardIsDraftInboxCandidate(primaryBlocker) ? "Draft Inbox" : "Board";
  return (
    <section className="project-board-active-card-overview" aria-label="Card state overview">
      <div className="project-board-active-card-overview-copy">
        <span className="project-board-kicker">State overview</span>
        <strong>{model.headline}</strong>
        <p>{model.detail}</p>
      </div>
      <div className="project-board-active-card-badges" aria-label="Card status badges">
        {model.badges.map((badge) => (
          <span className={`tone-${badge.tone}`} key={`${badge.label}:${badge.value}`}>
            <em>{badge.label}</em>
            {badge.value}
          </span>
        ))}
      </div>
      <div className="project-board-active-card-state-grid" aria-label="Inspector state sections">
        {model.sections.map((section) => (
          <article className={`tone-${section.tone}`} key={section.id}>
            <div>
              <strong>{section.label}</strong>
              {section.countLabel && <span>{section.countLabel}</span>}
            </div>
            <h5>{section.headline}</h5>
            <p>{section.detail}</p>
          </article>
        ))}
      </div>
      {(onJumpToInbox || (primaryBlocker && onJumpToBlocker)) && (
        <div className="project-board-active-card-overview-actions">
          {onJumpToInbox && (
            <button type="button" className="secondary-button" title="Open this card in the Draft Inbox detail view." onClick={onJumpToInbox}>
              <FileText size={14} />
              <span>Jump to Inbox</span>
            </button>
          )}
          {primaryBlocker && onJumpToBlocker && (
            <button
              type="button"
              className="secondary-button"
              title={`Open ${primaryBlocker.title} in ${blockerLocation} and focus it.`}
              onClick={onJumpToBlocker}
            >
              <ChevronRight size={14} />
              <span>Jump to blocker</span>
            </button>
          )}
        </div>
      )}
      {(model.decisionAudit.open > 0 || model.decisionAudit.answered > 0 || model.decisionAudit.duplicate > 0 || model.decisionAudit.dismissed > 0) && (
        <div className="project-board-active-card-audit-strip" aria-label="Decision audit summary">
          <span>{model.decisionAudit.open} open</span>
          <span>{model.decisionAudit.answered} answered</span>
          <span>{model.decisionAudit.duplicate} duplicate</span>
          <span>{model.decisionAudit.dismissed} dismissed</span>
        </div>
      )}
    </section>
  );
}


export function ProjectBoardUiMockReviewPanel({
  model,
  cardId,
  workspacePath,
  runBusy,
  onResolve,
}: {
  model: ReturnType<typeof projectBoardUiMockReviewPanelModel>;
  cardId: string;
  workspacePath?: string;
  runBusy?: string;
  onResolve: (action: ProjectBoardProofDecisionAction) => void;
}) {
  if (!model.visible) return null;
  return (
    <section className="project-board-proof-review ready_for_review" aria-label="UX mock review controls">
      <div>
        <strong>{model.headline}</strong>
        <span>{model.statusLabel}</span>
      </div>
      <p>{model.detail}</p>
      {model.previewPath ? (
        <ProofEvidencePathLink path={model.previewPath} workspacePath={workspacePath}>
          <ExternalLink size={14} />
          <span>Preview HTML mock</span>
        </ProofEvidencePathLink>
      ) : (
        <p className="project-board-detail-note">{model.previewTitle}</p>
      )}
      <div className="project-board-card-actions">
        {model.actions.map((action) => {
          const busyKey = `proof:${cardId}:${action.action}`;
          return (
            <button
              type="button"
              className={`secondary-button ${action.tone === "danger" ? "danger" : action.tone === "primary" ? "success" : ""}`}
              key={action.action}
              disabled={action.disabled || runBusy === busyKey}
              title={action.title}
              onClick={() => {
                if (action.disabled || runBusy === busyKey) return;
                onResolve(action.action);
              }}
            >
              {action.action === "accept_done" ? <Check size={14} /> : action.action === "retry" ? <RotateCcw size={14} /> : <X size={14} />}
              <span>{runBusy === busyKey ? "Saving" : action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}


export function ProjectBoardExecutionControlPanel({
  model,
  onAction,
  runBusy,
  proofDecisionReason,
  onProofDecisionReasonChange,
}: {
  model: ReturnType<typeof projectBoardExecutionControlModel>;
  onAction: (action: ReturnType<typeof projectBoardExecutionControlModel>["actions"][number]) => void;
  runBusy?: string;
  proofDecisionReason?: string;
  onProofDecisionReasonChange?: (value: string) => void;
}) {
  const hasEnabledProofAction = model.actions.some((action) => action.proofDecisionAction && !action.disabled);
  return (
    <section className={`project-board-execution-control ${model.state}`}>
      <header>
        <div>
          <h4>Execution controls</h4>
          <strong>{model.headline}</strong>
        </div>
        <span>{model.statusLabel}</span>
      </header>
      <p>{model.detail}</p>
      <div className="project-board-execution-control-tags">
        <span>{model.taskLabel}</span>
        <span>{model.runLabel}</span>
        <span>{model.proofLabel}</span>
        <span>{model.blockerLabel}</span>
      </div>
      {hasEnabledProofAction && onProofDecisionReasonChange && (
        <label className="project-board-proof-decision-note">
          <span>Proof decision note</span>
          <textarea
            value={proofDecisionReason ?? ""}
            onChange={(event) => onProofDecisionReasonChange(event.target.value)}
            placeholder="For send-back, say what the next run must fix. For accept or block, record the PM rationale."
          />
        </label>
      )}
      <div className="project-board-execution-control-actions">
        {model.actions.map((action) => (
          <button
            key={`${action.action}:${action.runId ?? action.threadId ?? action.workspacePath ?? action.proofDecisionAction ?? action.label}`}
            type="button"
            className={`panel-button mini ${action.tone}`}
            title={action.title}
            disabled={action.disabled}
            onClick={() => onAction(action)}
          >
            {action.busyKey && runBusy === action.busyKey ? action.busyLabel : action.label}
          </button>
        ))}
      </div>
      <p className="project-board-execution-control-policy">{model.policySummary}</p>
    </section>
  );
}
