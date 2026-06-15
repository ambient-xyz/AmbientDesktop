import { X } from "lucide-react";

import type {
  ChatMessage,
  ContextUsageSnapshot,
} from "../../shared/types";
import {
  SessionContextRecoveryButtons,
  isSessionContextMissingError,
  renderableMessageContent,
} from "./AppMessages";

export function SessionContextRecoveryStrip({
  message,
  busy,
  running,
  canRetry,
  onRecover,
  onRecoverAndRetry,
  onDuplicate,
  onDismiss,
}: {
  message?: string;
  busy: boolean;
  running: boolean;
  canRetry: boolean;
  onRecover: () => void;
  onRecoverAndRetry: () => void;
  onDuplicate: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="error-strip session-context-recovery-strip" role="alert">
      <div>
        <strong>Model context is unavailable for this chat.</strong>
        <span>{sessionContextRecoveryMessage(message)}</span>
      </div>
      <div className="session-context-recovery-strip-actions">
        <SessionContextRecoveryButtons
          busy={busy}
          disabled={running}
          canRetry={canRetry}
          onRecover={onRecover}
          onRecoverAndRetry={onRecoverAndRetry}
          onDuplicate={onDuplicate}
        />
        <button type="button" className="error-strip-dismiss" onClick={onDismiss} title="Dismiss error" aria-label="Dismiss error">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function sessionContextRecoveryMessage(message: string | undefined): string {
  if (!message) return "The visible transcript is still available. Rebuild a lossy model summary or duplicate the transcript into a new chat.";
  if (isSessionContextMissingError(message)) {
    return "The Pi session file is missing or unreadable, but the visible transcript is still available.";
  }
  return message;
}

export function isSessionContextMissing(snapshot: ContextUsageSnapshot | undefined): boolean {
  return Boolean(
    snapshot?.source === "unavailable" &&
      snapshot.diagnostics?.activeSession === false &&
      (snapshot.diagnostics.piSessionFile || isSessionContextMissingError(snapshot.diagnostics.message)),
  );
}

export function latestUserPromptForRecovery(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "user" && Boolean(renderableMessageContent(message)));
}
