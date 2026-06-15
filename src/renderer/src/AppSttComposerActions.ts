import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  DesktopState,
  MessageDelivery,
  RunStatus,
  SttMessageMetadata,
  SttProviderCandidate,
  SttTranscriptionState,
} from "../../shared/types";
import type { SttComposerUiState } from "./AppComposerShell";
import {
  sttInsertTranscriptIntoDraft,
  sttProviderForCapabilityId,
  sttTranscriptReadyAction,
  type SttDraftMetadataState,
} from "./sttUiModel";
import {
  advanceTrailingSilence,
  startSttMicrophoneRecorder,
  type SttMicrophoneLevel,
  type SttMicrophoneRecorder,
  type SttTrailingSilenceState,
} from "./sttMicrophoneRecorder";

export const STT_COMPOSER_MIN_DURATION_MS = 250;

type StartSttComposerRecorder = typeof startSttMicrophoneRecorder;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sttComposerProcessing(status: SttComposerUiState["status"]): boolean {
  return status === "recording" || status === "saving" || status === "transcribing";
}

export function sttComposerCanRetryTranscription(sttComposer: SttComposerUiState): boolean {
  return Boolean(sttComposer.state?.audioPath) && !sttComposerProcessing(sttComposer.status);
}

export function sttComposerFailureState(input: {
  audio: { utteranceId: string; audioPath: string };
  language: string;
  message: string;
  threadId: string;
  now?: string;
}): SttTranscriptionState {
  const timestamp = input.now ?? new Date().toISOString();
  return {
    utteranceId: input.audio.utteranceId,
    threadId: input.threadId,
    status: "failed",
    audioPath: input.audio.audioPath,
    language: input.language,
    error: input.message,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createAppSttComposerActions({
  activeVoiceMessageId,
  appendRunActivityLine,
  getComposerDraft,
  resetPromptHistory,
  resetRunActivityLines,
  running,
  setActiveVoiceMessageId,
  setComposerDraft,
  setContextError,
  setError,
  setRunStatus,
  setSttComposer,
  setSttDraftMetadata,
  setThreadRunStatuses,
  startRecorder = startSttMicrophoneRecorder,
  state,
  sttComposer,
  sttComposerOperationIdRef,
  sttComposerRecorderRef,
  sttComposerShortcutActiveRef,
  sttComposerSilenceRef,
  sttComposerThreadRef,
  sttProvidersRef,
}: {
  activeVoiceMessageId: string | undefined;
  appendRunActivityLine: (line: string) => void;
  getComposerDraft: () => string;
  resetPromptHistory: () => void;
  resetRunActivityLines: (line: string) => void;
  running: boolean;
  setActiveVoiceMessageId: Dispatch<SetStateAction<string | undefined>>;
  setComposerDraft: (value: string, options?: { focusEnd?: boolean }) => void;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setError: (message: string | undefined) => void;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setSttComposer: Dispatch<SetStateAction<SttComposerUiState>>;
  setSttDraftMetadata: Dispatch<SetStateAction<SttDraftMetadataState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  startRecorder?: StartSttComposerRecorder;
  state: DesktopState | undefined;
  sttComposer: SttComposerUiState;
  sttComposerOperationIdRef: MutableRefObject<number>;
  sttComposerRecorderRef: MutableRefObject<SttMicrophoneRecorder | undefined>;
  sttComposerShortcutActiveRef: MutableRefObject<boolean>;
  sttComposerSilenceRef: MutableRefObject<SttTrailingSilenceState>;
  sttComposerThreadRef: MutableRefObject<string | undefined>;
  sttProvidersRef: MutableRefObject<SttProviderCandidate[]>;
}): {
  cancelSttComposerRecording: () => void;
  discardSttComposerResult: () => void;
  retrySttComposerTranscription: () => Promise<void>;
  startSttComposerRecording: (options?: { requireShortcutActive?: boolean }) => Promise<void>;
  stopSttComposerRecording: () => Promise<void>;
  transcribeSavedSttComposerAudio: (audio: { utteranceId: string; audioPath: string }, operationId?: number) => Promise<void>;
} {
  async function startSttComposerRecording(options: { requireShortcutActive?: boolean } = {}): Promise<void> {
    if (!state || sttComposerRecorderRef.current || sttComposer.status === "saving" || sttComposer.status === "transcribing") return;
    const operationId = ++sttComposerOperationIdRef.current;
    sttComposerThreadRef.current = state.activeThreadId;
    const provider = sttProviderForCapabilityId(sttProvidersRef.current, state.settings.stt.providerCapabilityId);
    if (!state.settings.stt.enabled || !state.settings.stt.providerCapabilityId || !provider?.available) {
      setSttComposer({ status: "error", message: "Enable speech input and select an available STT provider before using push-to-talk." });
      return;
    }
    if (state.settings.stt.bargeIn.stopTtsOnSpeech && activeVoiceMessageId) {
      setActiveVoiceMessageId(undefined);
      void window.ambientDesktop.setSttTtsSpeaking({ speaking: false }).catch(() => undefined);
    }
    setSttComposer({ status: "recording", message: "Requesting microphone..." });
    sttComposerSilenceRef.current = { speechDetected: false, autoStopping: false };
    const speechThresholdDbfs = state.settings.stt.noSpeechGate.enabled ? state.settings.stt.noSpeechGate.rmsThresholdDbfs : -55;
    const silenceFinalizeMs = Math.round(state.settings.stt.silenceFinalizeSeconds * 1000);
    let deviceFallbackMessage: string | undefined;
    try {
      const recorder = await startRecorder({
        deviceId: state.settings.stt.microphone?.deviceId,
        onDeviceFallback: (message) => {
          deviceFallbackMessage = message;
          setSttComposer((current) => (current.status === "recording" ? { ...current, message } : current));
        },
        onLevel: (level) => updateSttComposerLevel(level, speechThresholdDbfs, silenceFinalizeMs),
      });
      if (sttComposerOperationIdRef.current !== operationId) {
        recorder.cancel();
        return;
      }
      if (options.requireShortcutActive && !sttComposerShortcutActiveRef.current) {
        recorder.cancel();
        setSttComposer({ status: "idle" });
        return;
      }
      sttComposerRecorderRef.current = recorder;
      setSttComposer({ status: "recording", message: deviceFallbackMessage ?? "Listening..." });
    } catch (error) {
      if (sttComposerOperationIdRef.current !== operationId) return;
      setSttComposer({ status: "error", message: errorMessage(error) });
    }
  }

  function updateSttComposerLevel(level: SttMicrophoneLevel, speechThresholdDbfs: number, silenceFinalizeMs: number): void {
    const update = advanceTrailingSilence(sttComposerSilenceRef.current, level, speechThresholdDbfs, silenceFinalizeMs);
    sttComposerSilenceRef.current = update.state;
    if (update.shouldFinalize) {
      setSttComposer((current) => current.status === "recording"
        ? { ...current, message: "Silence detected. Transcribing...", level, silenceMs: update.silenceMs }
        : current);
      void stopSttComposerRecording();
      return;
    }
    setSttComposer((current) => current.status === "recording"
      ? {
          ...current,
          level,
          silenceMs: update.silenceMs,
          message: update.state.speechDetected
            ? update.state.silentStartedAtMs !== undefined
              ? "Waiting for trailing silence..."
              : "Listening..."
            : "Listening...",
        }
      : current);
  }

  async function stopSttComposerRecording(): Promise<void> {
    if (!state || !sttComposerRecorderRef.current) return;
    const operationId = sttComposerOperationIdRef.current;
    const recorder = sttComposerRecorderRef.current;
    sttComposerRecorderRef.current = undefined;
    sttComposerShortcutActiveRef.current = false;
    setSttComposer({ status: "saving", message: "Saving speech..." });
    try {
      const recording = await recorder.stop();
      if (sttComposerOperationIdRef.current !== operationId) return;
      if (recording.durationMs < STT_COMPOSER_MIN_DURATION_MS) throw new Error("Speech sample was too short.");
      const audio = await window.ambientDesktop.saveSttTestAudio({
        source: "composer-push-to-talk",
        threadId: state.activeThreadId,
        audioBase64: recording.audioBase64,
        durationMs: recording.durationMs,
        sampleRate: recording.sampleRate,
        channels: recording.channels,
        microphoneDeviceId: recording.microphoneDeviceId,
        microphoneDeviceLabel: recording.microphoneDeviceLabel,
      });
      if (sttComposerOperationIdRef.current !== operationId) return;
      await transcribeSavedSttComposerAudio({ utteranceId: audio.utteranceId, audioPath: audio.audioPath }, operationId);
    } catch (error) {
      if (sttComposerOperationIdRef.current !== operationId) return;
      setSttComposer({ status: "error", message: errorMessage(error) });
    }
  }

  async function transcribeSavedSttComposerAudio(
    audio: { utteranceId: string; audioPath: string },
    operationId = ++sttComposerOperationIdRef.current,
  ): Promise<void> {
    if (!state) return;
    setSttComposer({
      status: "transcribing",
      message: "Transcribing speech...",
      state: sttComposer.state?.utteranceId === audio.utteranceId ? sttComposer.state : undefined,
    });
    try {
      const result = await window.ambientDesktop.transcribeSttAudio({
        threadId: state.activeThreadId,
        utteranceId: audio.utteranceId,
        audioPath: audio.audioPath,
      });
      if (sttComposerOperationIdRef.current !== operationId) return;
      const transcription = result.state;
      if (transcription.status === "ready" && transcription.text?.trim()) {
        await handleSttTranscriptReady(transcription.text.trim(), transcription);
        return;
      }
      if (transcription.status === "no-speech") {
        setSttComposer({ status: "no-speech", message: transcription.noSpeechGate?.reason ?? "No speech detected.", state: transcription });
        return;
      }
      setSttComposer({ status: "error", message: transcription.error ?? "Speech transcription failed.", state: transcription });
    } catch (error) {
      if (sttComposerOperationIdRef.current !== operationId) return;
      const message = errorMessage(error);
      setSttComposer({
        status: "error",
        message,
        state: sttComposerFailureState({
          audio,
          language: state.settings.stt.spokenLanguage,
          message,
          threadId: state.activeThreadId,
        }),
      });
    }
  }

  async function retrySttComposerTranscription(): Promise<void> {
    const previous = sttComposer.state;
    if (!sttComposerCanRetryTranscription(sttComposer) || !previous?.audioPath) return;
    await transcribeSavedSttComposerAudio({ utteranceId: previous.utteranceId, audioPath: previous.audioPath });
  }

  function discardSttComposerResult(): void {
    if (sttComposerProcessing(sttComposer.status)) return;
    setSttComposer({ status: "idle" });
  }

  function cancelSttComposerRecording(): void {
    sttComposerOperationIdRef.current += 1;
    sttComposerThreadRef.current = undefined;
    sttComposerRecorderRef.current?.cancel();
    sttComposerRecorderRef.current = undefined;
    sttComposerShortcutActiveRef.current = false;
    sttComposerSilenceRef.current = { speechDetected: false, autoStopping: false };
    if (sttComposer.status === "saving" || sttComposer.status === "transcribing") {
      void window.ambientDesktop.cancelSttTranscription().catch(() => undefined);
    }
    setSttComposer({ status: "idle" });
  }

  async function handleSttTranscriptReady(text: string, transcription: SttTranscriptionState): Promise<void> {
    if (!state) return;
    const action = sttTranscriptReadyAction({
      autoSendAfterTranscription: state.settings.stt.autoSendAfterTranscription,
      running,
      text,
      transcription,
    });
    if (action.kind === "insert") {
      insertTranscriptIntoComposer(text, transcription);
      setSttComposer({ status: "ready", message: action.composerMessage, state: transcription });
      return;
    }
    await sendSpeechTranscript(action.content, action.metadata, action.delivery);
    setSttComposer({ status: "ready", message: action.composerMessage, state: transcription });
  }

  function insertTranscriptIntoComposer(text: string, transcription: SttTranscriptionState): void {
    const next = sttInsertTranscriptIntoDraft({ currentDraft: getComposerDraft(), text, transcription });
    setSttDraftMetadata(next.draftMetadata);
    setComposerDraft(next.draft, { focusEnd: true });
    resetPromptHistory();
  }

  async function sendSpeechTranscript(content: string, stt: SttMessageMetadata, delivery: MessageDelivery): Promise<void> {
    if (!state || !content.trim()) return;
    setError(undefined);
    setContextError(undefined);
    if (!running) {
      resetRunActivityLines("Speech transcript sent to Ambient.");
      setRunStatus("starting");
      setThreadRunStatuses((statuses) => ({ ...statuses, [state.activeThreadId]: "starting" }));
    } else {
      appendRunActivityLine("Queued speech transcript as follow-up.");
    }
    await window.ambientDesktop
      .sendMessage({
        threadId: state.activeThreadId,
        content,
        permissionMode: state.settings.permissionMode,
        collaborationMode: state.settings.collaborationMode,
        model: state.settings.model,
        thinkingLevel: state.settings.thinkingLevel,
        delivery,
        context: [],
        stt,
      })
      .catch((err) => {
        setError(errorMessage(err));
        if (!running) setRunStatus("error");
      });
  }

  return {
    cancelSttComposerRecording,
    discardSttComposerResult,
    retrySttComposerTranscription,
    startSttComposerRecording,
    stopSttComposerRecording,
    transcribeSavedSttComposerAudio,
  };
}
