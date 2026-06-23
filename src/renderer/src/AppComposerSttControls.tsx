import { LoaderCircle, Mic, Send, Square, X } from "lucide-react";

import type { SttTranscriptionState } from "../../shared/localRuntimeTypes";
import { sttMessageMetadataFromTranscription } from "../../shared/sttMessageMetadata";
import { SttArtifactLinks } from "./AppMessages";
import type { SttMicrophoneLevel } from "./sttMicrophoneRecorder";

export type SttComposerUiState = {
  status: "idle" | "recording" | "saving" | "transcribing" | "ready" | "no-speech" | "error";
  message?: string;
  state?: SttTranscriptionState;
  level?: SttMicrophoneLevel;
  silenceMs?: number;
};

export type AppComposerSttStatusStripProps = {
  sttComposer: SttComposerUiState;
  sttQueuedSpeechLabel?: string;
  sttComposerStripStatus: SttComposerUiState["status"] | "queued";
  sttComposerBusy: boolean;
  onPreviewSttArtifact: (path: string) => void;
  onCancelSttComposerRecording: () => void;
  onRetrySttComposerTranscription: () => void;
  onDiscardSttComposerResult: () => void;
};

export function AppComposerSttStatusStrip({
  sttComposer,
  sttQueuedSpeechLabel,
  sttComposerStripStatus,
  sttComposerBusy,
  onPreviewSttArtifact,
  onCancelSttComposerRecording,
  onRetrySttComposerTranscription,
  onDiscardSttComposerResult,
}: AppComposerSttStatusStripProps) {
  return (
    <div className={`stt-composer-strip ${sttComposerStripStatus}`}>
      <Mic size={13} aria-hidden="true" />
      <span>{sttComposer.status !== "idle" && sttComposer.message ? sttComposer.message : "Speech queued."}</span>
      {sttQueuedSpeechLabel && <small className="stt-queue-count">{sttQueuedSpeechLabel}</small>}
      {sttComposer.level && sttComposer.status === "recording" && (
        <>
          <span className="stt-level-meter" aria-hidden="true">
            <span style={{ width: `${Math.round(sttComposer.level.level * 100)}%` }} />
          </span>
          <small>
            {Math.round(sttComposer.level.rmsDbfs)} dBFS
            {sttComposer.silenceMs ? ` · silence ${(sttComposer.silenceMs / 1000).toFixed(1)}s` : ""}
          </small>
        </>
      )}
      {(sttComposer.status === "no-speech" || sttComposer.status === "error") && sttComposer.state && (
        <SttArtifactLinks
          metadata={sttMessageMetadataFromTranscription(sttComposer.state)}
          onPreviewPath={onPreviewSttArtifact}
          compact
        />
      )}
      {(sttComposerBusy || sttComposer.status === "no-speech" || sttComposer.status === "error") && (
        <div className="stt-strip-actions">
          {sttComposerBusy ? (
            <button type="button" className="artifact-link" onClick={onCancelSttComposerRecording}>
              Cancel
            </button>
          ) : sttComposer.state?.audioPath ? (
            <button type="button" className="artifact-link" onClick={onRetrySttComposerTranscription}>
              Retry
            </button>
          ) : null}
          {!sttComposerBusy && (
            <button type="button" className="artifact-link" onClick={onDiscardSttComposerResult}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type AppComposerRightControlsProps = {
  sttComposerRecording: boolean;
  sttComposerBusy: boolean;
  sttComposerDisabled: boolean;
  sttComposerShortcutLabel?: string;
  sttComposerTitle: string;
  localDeepResearchRunActive: boolean;
  running: boolean;
  abortArmed: boolean;
  composerCanSubmit: boolean;
  onStartSttComposerRecording: () => void;
  onStopSttComposerRecording: () => void;
  onCancelSttComposerRecording: () => void;
  onAbortRun: () => void;
};

export function AppComposerRightControls({
  sttComposerRecording,
  sttComposerBusy,
  sttComposerDisabled,
  sttComposerShortcutLabel,
  sttComposerTitle,
  localDeepResearchRunActive,
  running,
  abortArmed,
  composerCanSubmit,
  onStartSttComposerRecording,
  onStopSttComposerRecording,
  onCancelSttComposerRecording,
  onAbortRun,
}: AppComposerRightControlsProps) {
  return (
    <div className="right-controls">
      {sttComposerRecording ? (
        <>
          <button
            type="button"
            className="icon-button active stt-composer-button"
            data-tooltip={sttComposerTitle}
            aria-label="Stop recording and transcribe"
            onClick={onStopSttComposerRecording}
          >
            <Square size={15} />
          </button>
          <button
            type="button"
            className="icon-button subtle"
            data-tooltip="Cancel speech recording."
            aria-label="Cancel speech recording"
            onClick={onCancelSttComposerRecording}
          >
            <X size={15} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="icon-button subtle stt-composer-button"
          data-tooltip={sttComposerTitle}
          aria-label="Push to talk"
          disabled={sttComposerDisabled || localDeepResearchRunActive}
          onClick={onStartSttComposerRecording}
        >
          {sttComposerBusy ? <LoaderCircle size={15} className="spin" /> : <Mic size={15} />}
        </button>
      )}
      {sttComposerBusy && (
        <button
          type="button"
          className="icon-button subtle"
          data-tooltip="Cancel speech transcription."
          aria-label="Cancel speech transcription"
          onClick={onCancelSttComposerRecording}
        >
          <X size={15} />
        </button>
      )}
      {sttComposerShortcutLabel && !sttComposerBusy && !sttComposerDisabled && (
        <span className="stt-shortcut-hint" title={`Hold ${sttComposerShortcutLabel} to talk`} aria-hidden="true">
          {sttComposerShortcutLabel}
        </span>
      )}
      {running ? (
        <button
          type="button"
          className="send-button stop-button"
          data-tooltip={abortArmed ? "Stop the current run." : "Ambient is starting this run."}
          aria-label={abortArmed ? "Stop current run" : "Run is starting"}
          disabled={!abortArmed}
          onClick={onAbortRun}
        >
          <Square size={15} />
        </button>
      ) : (
        <button
          type="submit"
          className="send-button"
          data-tooltip="Send this message to Ambient."
          aria-label="Send message"
          data-ui-required-action="composer-send"
          disabled={!composerCanSubmit || localDeepResearchRunActive}
        >
          <Send size={16} />
        </button>
      )}
    </div>
  );
}
