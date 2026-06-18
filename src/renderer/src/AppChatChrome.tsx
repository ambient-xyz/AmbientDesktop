import { ChevronDown, Music, Search, X } from "lucide-react";
import type { RefObject } from "react";

import type { BrowserUserActionState } from "../../shared/browserTypes";
import type { voiceThreadStatusModel } from "./voiceUiModel";
import { formatTimelineTime } from "./RightPanel";

export function DismissibleErrorStrip({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="error-strip error-strip-dismissible" role="alert">
      <span className="error-strip-message">{message}</span>
      <button type="button" className="error-strip-dismiss" onClick={onDismiss} title="Dismiss error" aria-label="Dismiss error">
        <X size={14} />
      </button>
    </div>
  );
}

export function BrowserUserActionChatCard({
  action,
  busy,
  onResume,
  onCancel,
  onOpenBrowser,
}: {
  action: BrowserUserActionState;
  busy?: "resume" | "cancel";
  onResume: () => void;
  onCancel: () => void;
  onOpenBrowser: () => void;
}) {
  const startedAt = action.startedAt ? formatTimelineTime(action.startedAt) : undefined;
  const title = action.status === "resuming" ? "Checking browser warning" : "Browser warning needs review";
  const openBrowserLabel = action.runtime === "chrome" ? "Show managed Chrome" : "Show browser";
  return (
    <article className="message browser-user-action-message status-awaiting-input">
      <div className="message-role">Ambient</div>
      <section className={`browser-user-action-card chat ${action.active ? "active" : ""}`} aria-live="polite">
        <div className="browser-card-header">
          <div>
            <strong>{title}</strong>
            <span>
              {action.kind}
              {action.provider ? ` / ${action.provider}` : ""}
              {startedAt ? ` since ${startedAt}` : ""}
            </span>
          </div>
          <span className={`browser-state-pill ${action.active ? "running" : "stopped"}`}>{action.status}</span>
        </div>
        <p>{action.message}</p>
        {action.url && <code>{action.url}</code>}
        <p className="browser-user-action-help">
          If this warning is wrong, dismiss it. Ambient keeps the trace and continues without treating this source as verified.
        </p>
        <div className="panel-action-row">
          <button
            type="button"
            className="panel-button mini primary"
            disabled={busy === "resume" || action.status === "resuming"}
            onClick={onResume}
          >
            {busy === "resume" ? "Checking" : "I completed it"}
          </button>
          <button type="button" className="panel-button mini" onClick={onOpenBrowser}>
            {openBrowserLabel}
          </button>
          <button
            type="button"
            className="panel-button mini"
            disabled={busy === "cancel"}
            onClick={onCancel}
            title="Dismiss an erroneous browser warning and unblock the thread."
          >
            {busy === "cancel" ? "Dismissing" : "Dismiss warning"}
          </button>
        </div>
      </section>
    </article>
  );
}

export function chatBrowserUserActionForThread(
  action: BrowserUserActionState | undefined,
  activeThreadId: string | undefined,
): BrowserUserActionState | undefined {
  if (!action?.active || !activeThreadId) return undefined;
  return action.sourceThreadId === activeThreadId ? action : undefined;
}

export function voiceThreadStatusDismissKey(
  threadId: string,
  providerCapabilityId: string | undefined,
  status: ReturnType<typeof voiceThreadStatusModel>,
): string {
  return [
    threadId,
    providerCapabilityId ?? "no-provider",
    status.tone,
    status.label,
    status.detail,
    status.counts.ready,
    status.counts.failed,
    status.counts.skipped,
    status.counts.canceled,
    status.counts.queued,
    status.counts.synthesizing,
  ].join("\u0000");
}

export function ChatFindBar({
  inputRef,
  query,
  count,
  activeIndex,
  onQueryChange,
  onPrevious,
  onNext,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  count: number;
  activeIndex: number;
  onQueryChange: (query: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="chat-find-bar" role="search">
      <Search size={14} />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            event.shiftKey ? onPrevious() : onNext();
          }
        }}
        placeholder="Find in this chat"
      />
      <span>{query.trim() ? (count > 0 ? `${activeIndex + 1} of ${count}` : "No matches") : "This chat"}</span>
      <button type="button" className="icon-button" onClick={onPrevious} disabled={count === 0} title="Previous match">
        <ChevronDown className="flip-vertical" size={14} />
      </button>
      <button type="button" className="icon-button" onClick={onNext} disabled={count === 0} title="Next match">
        <ChevronDown size={14} />
      </button>
      <button type="button" className="icon-button" onClick={onClose} title="Close find">
        <X size={14} />
      </button>
    </div>
  );
}

export function ThreadVoiceStatusBar({
  status,
  onOpenVoiceSettings,
  onDismiss,
}: {
  status: ReturnType<typeof voiceThreadStatusModel>;
  onOpenVoiceSettings: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={`thread-voice-status ${status.tone}`} aria-label="Thread voice status">
      <div className="thread-voice-status-main">
        <Music size={15} />
        <div>
          <strong>{status.label}</strong>
          <span>{status.detail}</span>
        </div>
      </div>
      <div className="thread-voice-status-counts" aria-label="Voice artifact counts">
        {status.counts.ready > 0 && <span>{status.counts.ready.toLocaleString()} ready</span>}
        {status.counts.failed > 0 && <span>{status.counts.failed.toLocaleString()} failed</span>}
        {status.counts.skipped > 0 && <span>{status.counts.skipped.toLocaleString()} skipped</span>}
        {status.counts.canceled > 0 && <span>{status.counts.canceled.toLocaleString()} cleared</span>}
        {status.counts.queued + status.counts.synthesizing > 0 && (
          <span>{(status.counts.queued + status.counts.synthesizing).toLocaleString()} active</span>
        )}
      </div>
      <button type="button" className="panel-button mini" onClick={onOpenVoiceSettings}>
        {status.settingsRouteLabel}
      </button>
      <button type="button" className="icon-button thread-voice-status-dismiss" onClick={onDismiss} title="Dismiss voice status" aria-label="Dismiss voice status">
        <X size={14} />
      </button>
    </div>
  );
}
