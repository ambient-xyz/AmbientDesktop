import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  MessageCircle,
  Mic,
  Music,
  Plug,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react";

import {
  toolMessagingConversationDirectorySetupCardViewModel,
  toolMessagingRemoteSurfaceActivationCardViewModel,
  type ToolMessagingConversationDirectorySetupPreviewData,
  type ToolMessagingRemoteSurfaceActivationPreviewData,
  type ToolSttPreviewData,
  type ToolTelegramSessionSetupPreviewData,
  type ToolVoicePreviewData,
} from "./toolMessageUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";

export function ToolVoicePreview({
  preview,
  running,
  onOpenUrl,
}: {
  preview: ToolVoicePreviewData;
  running: boolean;
  onOpenUrl?: (url: string) => void;
}) {
  const title = preview.noOp
    ? "Voice already configured"
    : preview.action === "status"
      ? "Voice status"
      : preview.action === "select"
        ? "Voice selection"
        : preview.action === "policy"
          ? "Voice policy"
          : preview.action === "clone-status"
            ? "Voice clone status"
            : "Voice test";
  const warningRows = [
    preview.cacheStatus === "missing" ? { label: "Dynamic cache", value: "Missing cloned voice entry" } : undefined,
    preview.missingLocalArtifactPaths?.length
      ? { label: "Missing local artifacts", value: preview.missingLocalArtifactPaths.join(", ") }
      : undefined,
    preview.readyForSelection === false && preview.action === "clone-status"
      ? { label: "Selection blocked", value: "Do not select this voice until the warning is resolved" }
      : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  const rows = [
    preview.noOp ? { label: "Status", value: "Already configured" } : undefined,
    preview.previousProvider || preview.provider
      ? {
          label: preview.previousProvider ? "Provider" : "Selected provider",
          value: preview.previousProvider ? `${preview.previousProvider} -> ${preview.provider ?? "None"}` : preview.provider,
        }
      : undefined,
    preview.previousVoice || preview.voice
      ? {
          label: preview.previousVoice ? "Voice" : "Selected voice",
          value: preview.previousVoice ? `${preview.previousVoice} -> ${preview.voice ?? "None"}` : preview.voice,
        }
      : undefined,
    preview.providerCapabilityId ? { label: "Provider id", value: preview.providerCapabilityId } : undefined,
    preview.voiceId ? { label: "Voice id", value: preview.voiceId } : undefined,
    preview.enabled ? { label: "Enabled", value: preview.enabled } : undefined,
    preview.autoplay ? { label: "Autoplay", value: preview.autoplay } : undefined,
    preview.mode ? { label: "Mode", value: preview.mode } : undefined,
    preview.longReply ? { label: "Long reply", value: preview.longReply } : undefined,
    preview.maxChars ? { label: "Max chars", value: preview.maxChars } : undefined,
    preview.testStatus ? { label: "Test status", value: preview.testStatus } : undefined,
    preview.readiness ? { label: "Readiness", value: preview.readiness } : undefined,
    preview.readyForSelection !== undefined ? { label: "Ready for selection", value: String(preview.readyForSelection) } : undefined,
    preview.shouldRetryStatus !== undefined ? { label: "Retry status later", value: String(preview.shouldRetryStatus) } : undefined,
    preview.cacheStatus ? { label: "Dynamic cache", value: preview.cacheStatus } : undefined,
    preview.progressPercent !== undefined ? { label: "Progress", value: `${preview.progressPercent}%` } : undefined,
    preview.retryAfterSeconds !== undefined ? { label: "Retry after", value: `${preview.retryAfterSeconds}s` } : undefined,
    preview.failureReason ? { label: "Failure reason", value: preview.failureReason } : undefined,
    preview.dashboardUrl ? { label: "Provider dashboard", value: preview.dashboardUrl } : undefined,
    preview.verificationUrl ? { label: "Provider verification", value: preview.verificationUrl } : undefined,
    preview.localArtifactPaths?.length ? { label: "Local artifacts", value: preview.localArtifactPaths.join(", ") } : undefined,
    preview.mimeType ? { label: "MIME type", value: preview.mimeType } : undefined,
    preview.durationMs !== undefined ? { label: "Duration", value: `${preview.durationMs} ms` } : undefined,
    preview.audioPath ? { label: "Audio", value: preview.audioPath } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  return (
    <section
      className={`tool-voice-preview ${running ? "running" : ""} ${preview.noOp ? "noop" : ""} ${warningRows.length ? "warning" : ""}`}
    >
      <div className="tool-section-title">
        {warningRows.length ? <AlertCircle size={12} /> : preview.noOp ? <CheckCircle2 size={12} /> : <Music size={12} />}
        {title}
      </div>
      {warningRows.length > 0 && (
        <dl className="tool-voice-reconcile">
          {warningRows.map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(preview.verificationUrl || preview.dashboardUrl) && onOpenUrl && (
        <div className="tool-voice-actions">
          {preview.verificationUrl && (
            <button type="button" onClick={() => onOpenUrl(preview.verificationUrl!)}>
              <ExternalLink size={12} />
              Open verification
            </button>
          )}
          {preview.dashboardUrl && (
            <button type="button" onClick={() => onOpenUrl(preview.dashboardUrl!)}>
              <ExternalLink size={12} />
              Open dashboard
            </button>
          )}
        </div>
      )}
      {rows.length > 0 ? (
        <dl className="tool-voice-details">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="panel-note">No voice details available.</p>
      )}
    </section>
  );
}

export function ToolSttPreview({
  preview,
  running,
  onPreviewPath,
}: {
  preview: ToolSttPreviewData;
  running: boolean;
  onPreviewPath: (path: string) => void;
}) {
  const title = preview.noOp
    ? "Speech input already configured"
    : preview.action === "status"
      ? "Speech input status"
      : preview.action === "select"
        ? "Speech input selection"
        : preview.action === "policy"
          ? "Speech input policy"
          : "Speech input test";
  const providerCount =
    preview.providerCount !== undefined ? `${preview.availableProviderCount ?? 0}/${preview.providerCount} available` : undefined;
  const rows = [
    preview.noOp ? { label: "Status", value: "Already configured" } : undefined,
    providerCount ? { label: "Providers", value: providerCount } : undefined,
    preview.previousProvider || preview.provider
      ? {
          label: preview.previousProvider ? "Provider" : "Selected provider",
          value: preview.previousProvider ? `${preview.previousProvider} -> ${preview.provider ?? "None"}` : preview.provider,
        }
      : undefined,
    preview.providerCapabilityId ? { label: "Provider id", value: preview.providerCapabilityId } : undefined,
    preview.previousLanguage || preview.language
      ? {
          label: preview.previousLanguage ? "Language" : "Language",
          value: preview.previousLanguage ? `${preview.previousLanguage} -> ${preview.language ?? "unspecified"}` : preview.language,
        }
      : undefined,
    preview.enabled ? { label: "Enabled", value: preview.enabled } : undefined,
    preview.autoSendAfterTranscription ? { label: "Auto-send", value: preview.autoSendAfterTranscription } : undefined,
    preview.silenceFinalizeSeconds ? { label: "Silence", value: preview.silenceFinalizeSeconds } : undefined,
    preview.noSpeechGate ? { label: "No-speech gate", value: preview.noSpeechGate } : undefined,
    preview.noSpeechGateRmsThreshold ? { label: "RMS threshold", value: preview.noSpeechGateRmsThreshold } : undefined,
    preview.stopTtsOnSpeech ? { label: "Stop TTS on speech", value: preview.stopTtsOnSpeech } : undefined,
    preview.queueWhileAgentRuns ? { label: "Queue while agent runs", value: preview.queueWhileAgentRuns } : undefined,
    preview.pushToTalkShortcut ? { label: "Shortcut", value: preview.pushToTalkShortcut } : undefined,
    preview.testStatus ? { label: "Test status", value: preview.testStatus } : undefined,
    preview.durationMs !== undefined ? { label: "Provider elapsed", value: `${Math.round(preview.durationMs)} ms` } : undefined,
    preview.rmsDbfs !== undefined ? { label: "RMS", value: `${preview.rmsDbfs.toFixed(1)} dBFS` } : undefined,
    preview.noSpeechThresholdDbfs !== undefined
      ? { label: "No-speech threshold", value: `${preview.noSpeechThresholdDbfs} dBFS` }
      : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  const artifacts = [
    preview.audioPath ? { label: "Raw audio", path: preview.audioPath } : undefined,
    preview.normalizedAudioPath ? { label: "Normalized audio", path: preview.normalizedAudioPath } : undefined,
    preview.transcriptPath ? { label: "Transcript", path: preview.transcriptPath } : undefined,
    preview.jsonPath ? { label: "JSON", path: preview.jsonPath } : undefined,
    preview.stdoutPath ? { label: "stdout", path: preview.stdoutPath } : undefined,
    preview.stderrPath ? { label: "stderr", path: preview.stderrPath } : undefined,
  ].filter((artifact): artifact is { label: string; path: string } => Boolean(artifact?.path));
  return (
    <section className={`tool-voice-preview tool-stt-preview ${running ? "running" : ""} ${preview.noOp ? "noop" : ""}`}>
      <div className="tool-section-title">
        {preview.noOp ? <CheckCircle2 size={12} /> : <Mic size={12} />}
        {title}
      </div>
      {preview.transcript && (
        <blockquote className="tool-stt-transcript">
          <span>Transcript</span>
          <p>{preview.transcript}</p>
        </blockquote>
      )}
      {rows.length > 0 ? (
        <dl className="tool-voice-details">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="panel-note">No speech input details available.</p>
      )}
      {artifacts.length > 0 && (
        <div className="tool-stt-artifacts" aria-label="Speech input artifacts">
          {artifacts.map((artifact) => (
            <button
              type="button"
              className="artifact-link"
              key={`${artifact.label}-${artifact.path}`}
              onClick={() => onPreviewPath(artifact.path)}
              title={`Preview ${artifact.path}`}
            >
              {artifact.path.endsWith(".wav") ? <Music size={13} /> : <FileText size={13} />}
              <span>
                {artifact.label}: {artifact.path}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ToolTelegramSessionSetupCard({
  card,
  running,
  actionDisabled,
  onSendPrompt,
}: {
  card: ToolTelegramSessionSetupPreviewData;
  running: boolean;
  actionDisabled?: boolean;
  onSendPrompt?: (prompt: string) => void | Promise<void>;
}) {
  const tone = telegramSessionSetupTone(card.status);
  const icon =
    card.status === "ready" ? (
      <CheckCircle2 size={12} />
    ) : card.status === "needs_code" || card.status === "needs_password" ? (
      <KeyRound size={12} />
    ) : card.status === "blocked" ? (
      <AlertCircle size={12} />
    ) : (
      <Shield size={12} />
    );
  const rows = [
    { label: "Provider", value: card.providerId },
    { label: "Profile", value: card.profileId },
    { label: "Action", value: card.action },
    { label: "State", value: telegramSessionSetupStatusLabel(card.status) },
    card.authState?.state ? { label: "Auth state", value: card.authState.state } : undefined,
    card.checkedAt ? { label: "Checked", value: card.checkedAt } : undefined,
    card.missingInputs.length ? { label: "Missing", value: card.missingInputs.join(", ") } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row?.value));
  const actions = [card.primaryAction, ...card.secondaryActions].filter((action): action is NonNullable<typeof action> => Boolean(action));
  const buttonsDisabled = running || actionDisabled || !onSendPrompt;
  return (
    <section className={`tool-telegram-setup ${tone} ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {icon}
        {card.title}
      </div>
      <div className="tool-telegram-summary">
        <strong>{card.summary}</strong>
        <span>{card.detail}</span>
      </div>
      {actions.length > 0 && (
        <div className="tool-telegram-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.tone === "primary" ? "primary" : ""}
              title={action.title}
              disabled={buttonsDisabled}
              onClick={() => void onSendPrompt?.(action.prompt)}
            >
              {action.id === "refresh-status" ? <RefreshCw size={12} /> : <KeyRound size={12} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
      <dl className="tool-telegram-details">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="tool-telegram-safety" aria-label="Telegram setup safety boundary">
        <span>No chat reads</span>
        <span>No sends</span>
        <span>No bindings</span>
        <span>No ingestion</span>
      </div>
    </section>
  );
}

export function ToolMessagingConversationDirectorySetupCard({
  card,
  running,
}: {
  card: ToolMessagingConversationDirectorySetupPreviewData;
  running: boolean;
}) {
  const view = toolMessagingConversationDirectorySetupCardViewModel(card);
  return (
    <section className={`tool-directory-setup ${view.tone} ${view.noteKind} ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {view.icon === "success" ? (
          <CheckCircle2 size={12} />
        ) : view.icon === "attention" ? (
          <AlertCircle size={12} />
        ) : (
          <MessageCircle size={12} />
        )}
        {view.title}
      </div>
      <div className="tool-directory-summary">
        <strong>{view.summary}</strong>
        <span>{view.detail}</span>
      </div>
      <dl className="tool-directory-details">
        {view.rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.conversationChips.length > 0 && (
        <div className="tool-directory-conversations" aria-label="Conversation directory metadata">
          {view.conversationChips.map((chip) => (
            <span key={`${chip.title}-${chip.label}`} title={chip.title}>
              {chip.label}
            </span>
          ))}
        </div>
      )}
      {view.notes.length > 0 && (
        <ul className="tool-directory-notes">
          {view.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <div className="tool-directory-safety" aria-label="Conversation directory safety boundary">
        {view.safetyChips.map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
    </section>
  );
}

export function ToolMessagingRemoteSurfaceActivationCard({
  card,
  running,
  actionDisabled,
  onSendPrompt,
}: {
  card: ToolMessagingRemoteSurfaceActivationPreviewData;
  running: boolean;
  actionDisabled?: boolean;
  onSendPrompt?: (prompt: string) => void | Promise<void>;
}) {
  const view = toolMessagingRemoteSurfaceActivationCardViewModel(card);
  const buttonsDisabled = running || actionDisabled || !onSendPrompt;
  return (
    <section className={`tool-remote-activation ${view.tone} ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {view.icon === "success" ? <CheckCircle2 size={12} /> : view.icon === "attention" ? <AlertCircle size={12} /> : <Plug size={12} />}
        {view.title}
      </div>
      <div className="tool-remote-activation-summary">
        <strong>{view.summary}</strong>
        <span>{view.detail}</span>
      </div>
      {view.actions.length > 0 && (
        <div className="tool-remote-activation-actions">
          {view.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.tone === "primary" ? "primary" : ""}
              title={action.title}
              disabled={buttonsDisabled}
              onClick={() => void onSendPrompt?.(action.prompt)}
            >
              {action.id === "continue" ? (
                <Zap size={12} />
              ) : action.id === "provider-onboarding" ? (
                <Plug size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              {action.label}
            </button>
          ))}
        </div>
      )}
      <dl className="tool-remote-activation-details">
        {view.rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.phaseChips.length > 0 && (
        <div className="tool-remote-activation-phases" aria-label="Remote surface activation phases">
          {view.phaseChips.map((chip) => (
            <span className={chip.tone} key={`${chip.title}-${chip.label}`} title={chip.title}>
              {chip.label}
            </span>
          ))}
        </div>
      )}
      {view.notes.length > 0 && (
        <ul className="tool-remote-activation-notes">
          {view.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <div className="tool-remote-activation-safety" aria-label="Remote surface activation safety boundary">
        {view.safetyChips.map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
    </section>
  );
}

export function telegramSessionSetupTone(status: ToolTelegramSessionSetupPreviewData["status"]): "success" | "warning" | "danger" | "info" {
  if (status === "ready") return "success";
  if (status === "needs_code" || status === "needs_password" || status === "pending") return "warning";
  if (status === "blocked") return "danger";
  return "info";
}

export function telegramSessionSetupStatusLabel(status: ToolTelegramSessionSetupPreviewData["status"]): string {
  if (status === "needs_code") return "Needs code";
  if (status === "needs_password") return "Needs password";
  return formatTaskState(status);
}
