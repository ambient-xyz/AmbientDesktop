import { LoaderCircle, MessageCircle, Send } from "lucide-react";

import type { WorkflowAgentThreadSummary, WorkflowRunDetail } from "../../shared/types";
import { workflowGraphRecoveryDecisionCard } from "./workflowRuntimeDecisionUiModel";
import {
  workflowThreadComposerModel,
  workflowThreadComposerRecoveryCard,
} from "./workflowThreadComposerUiModel";

export function WorkflowThreadComposerView({
  thread,
  detail,
  draft,
  workflowBusy,
  workflowDiscoveryBusy,
  composerBusy,
  onDraftChange,
  onSend,
}: {
  thread: WorkflowAgentThreadSummary;
  detail?: WorkflowRunDetail;
  draft: string;
  workflowBusy?: string;
  workflowDiscoveryBusy?: string;
  composerBusy: boolean;
  onDraftChange: (threadId: string, value: string) => void;
  onSend: (thread: WorkflowAgentThreadSummary, detail?: WorkflowRunDetail) => void | Promise<unknown>;
}) {
  const recoveryCard = workflowThreadComposerRecoveryCard(thread, detail);
  const recoveryDecision = recoveryCard ? workflowGraphRecoveryDecisionCard(recoveryCard) : undefined;
  const composer = workflowThreadComposerModel({
    draft,
    detail,
    workflowBusy,
    workflowDiscoveryBusy,
    composerBusy,
    recoveryDecision,
  });
  return (
    <section className={`workflow-thread-chat-composer ${composer.mode}`} aria-label={composer.ariaLabel}>
      <div className="workflow-thread-chat-composer-header">
        <div>
          <strong>{composer.title}</strong>
          <span>{composer.detail}</span>
        </div>
        {composerBusy && (
          <span className="workflow-thread-chat-composer-status">
            <LoaderCircle size={13} className="spin" />
            {composer.busyLabel}
          </span>
        )}
      </div>
      {(composer.modeNotice ?? composer.runtimeInputNotice) && (
        <div className="workflow-thread-chat-composer-mode-note">
          <MessageCircle size={13} />
          <span>{composer.modeNotice ?? composer.runtimeInputNotice}</span>
        </div>
      )}
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(thread.id, event.currentTarget.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            if (!composer.disabled) void onSend(thread, detail);
          }
        }}
        rows={3}
        placeholder={composer.placeholder}
        disabled={composer.mode === "run_input" && !composer.runtimeInputFreeform}
      />
      <div className="workflow-thread-chat-composer-actions">
        <button type="button" className="panel-button mini primary" disabled={composer.disabled} onClick={() => void onSend(thread, detail)}>
          {composerBusy ? <LoaderCircle size={13} className="spin" /> : <Send size={13} />}
          {composer.submitLabel}
        </button>
      </div>
    </section>
  );
}
