import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { SttProviderCandidate, SttTranscriptionState } from "../../shared/localRuntimeTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { SttComposerUiState } from "./AppComposerShell";
import {
  createAppSttComposerActions,
  sttComposerCanRetryTranscription,
  sttComposerFailureState,
  sttComposerProcessing,
} from "./AppSttComposerActions";
import type {
  SttMicrophoneRecorder,
  SttMicrophoneRecording,
  SttTrailingSilenceState,
} from "./sttMicrophoneRecorder";
import type { SttDraftMetadataState } from "./sttUiModel";

describe("App STT composer actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("models retry and processing states", () => {
    expect(sttComposerProcessing("recording")).toBe(true);
    expect(sttComposerProcessing("transcribing")).toBe(true);
    expect(sttComposerProcessing("ready")).toBe(false);
    expect(sttComposerCanRetryTranscription({ status: "error", state: transcription({ audioPath: "/tmp/utt.wav" }) })).toBe(true);
    expect(sttComposerCanRetryTranscription({ status: "saving", state: transcription({ audioPath: "/tmp/utt.wav" }) })).toBe(false);
    expect(sttComposerCanRetryTranscription({ status: "error" })).toBe(false);
  });

  it("builds deterministic transcription failure state", () => {
    expect(sttComposerFailureState({
      audio: { utteranceId: "utt-1", audioPath: "/tmp/utt.wav" },
      language: "en",
      message: "Provider failed",
      threadId: "thread-1",
      now: "2026-06-13T00:00:00.000Z",
    })).toEqual({
      utteranceId: "utt-1",
      threadId: "thread-1",
      status: "failed",
      audioPath: "/tmp/utt.wav",
      language: "en",
      error: "Provider failed",
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
    });
  });

  it("reports unavailable providers before starting the recorder", async () => {
    const startRecorder = vi.fn();
    const controller = createController({
      state: desktopState({
        stt: {
          enabled: true,
          providerCapabilityId: "missing-provider",
        },
      }),
      startRecorder,
    });

    await controller.actions.startSttComposerRecording();

    expect(startRecorder).not.toHaveBeenCalled();
    expect(controller.sttComposer.value).toEqual({
      status: "error",
      message: "Enable speech input and select an available STT provider before using push-to-talk.",
    });
    expect(controller.sttComposerThreadRef.current).toBe("thread-1");
  });

  it("cancels recorder and provider transcription state", () => {
    const cancelRecorder = vi.fn();
    const cancelSttTranscription = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        cancelSttTranscription,
      },
    });
    const controller = createController({
      sttComposer: { status: "transcribing" },
    });
    controller.sttComposerRecorderRef.current = fakeRecorder({ cancel: cancelRecorder });
    controller.sttComposerOperationIdRef.current = 4;
    controller.sttComposerThreadRef.current = "thread-1";
    controller.sttComposerShortcutActiveRef.current = true;
    controller.sttComposerSilenceRef.current = { speechDetected: true, autoStopping: true, silentStartedAtMs: 10 };

    controller.actions.cancelSttComposerRecording();

    expect(controller.sttComposerOperationIdRef.current).toBe(5);
    expect(controller.sttComposerThreadRef.current).toBeUndefined();
    expect(controller.sttComposerRecorderRef.current).toBeUndefined();
    expect(controller.sttComposerShortcutActiveRef.current).toBe(false);
    expect(controller.sttComposerSilenceRef.current).toEqual({ speechDetected: false, autoStopping: false });
    expect(cancelRecorder).toHaveBeenCalledOnce();
    expect(cancelSttTranscription).toHaveBeenCalledOnce();
    expect(controller.sttComposer.value).toEqual({ status: "idle" });
  });

  it("inserts ready transcripts into the composer when auto-send is disabled", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        transcribeSttAudio: vi.fn(async () => ({ state: transcription({ text: "hello ambient" }) })),
      },
    });
    const controller = createController({
      draft: "Existing",
      state: desktopState({ stt: { autoSendAfterTranscription: false } }),
    });

    await controller.actions.transcribeSavedSttComposerAudio({ utteranceId: "utt-1", audioPath: "/tmp/utt.wav" });

    expect(window.ambientDesktop.transcribeSttAudio).toHaveBeenCalledWith({
      threadId: "thread-1",
      utteranceId: "utt-1",
      audioPath: "/tmp/utt.wav",
    });
    expect(controller.draft.value).toBe("Existing\nhello ambient");
    expect(controller.sttDraftMetadata.value?.content).toBe("Existing\nhello ambient");
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
    expect(controller.sttComposer.value).toEqual({
      status: "ready",
      message: "Transcript inserted in composer.",
      state: transcription({ text: "hello ambient" }),
    });
  });

  it("auto-sends ready transcripts using the current running delivery", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        sendMessage,
        transcribeSttAudio: vi.fn(async () => ({ state: transcription({ text: "follow up" }) })),
      },
    });
    const controller = createController({
      running: true,
      state: desktopState({ stt: { autoSendAfterTranscription: true } }),
    });

    await controller.actions.transcribeSavedSttComposerAudio({ utteranceId: "utt-1", audioPath: "/tmp/utt.wav" });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      content: "follow up",
      delivery: "follow-up",
      context: [],
      stt: expect.objectContaining({
        utteranceId: "utt-1",
        status: "ready",
      }),
    }));
    expect(controller.appendRunActivityLine).toHaveBeenCalledWith("Queued speech transcript as follow-up.");
    expect(controller.runStatus.value).toBe("idle");
    expect(controller.sttComposer.value).toEqual({
      status: "ready",
      message: "Speech queued as follow-up.",
      state: transcription({ text: "follow up" }),
    });
  });
});

function createController({
  draft = "",
  running = false,
  startRecorder = vi.fn(),
  state = desktopState(),
  sttComposer = { status: "idle" },
}: {
  draft?: string;
  running?: boolean;
  startRecorder?: Parameters<typeof createAppSttComposerActions>[0]["startRecorder"];
  state?: DesktopState | undefined;
  sttComposer?: SttComposerUiState;
} = {}) {
  const sttComposerState = statefulSetter<SttComposerUiState>(sttComposer);
  const sttDraftMetadata = statefulSetter<SttDraftMetadataState | undefined>(undefined);
  const runStatus = statefulSetter<RunStatus>("idle");
  const threadRunStatuses = statefulSetter<Record<string, RunStatus>>({});
  const activeVoiceMessageId = statefulSetter<string | undefined>("voice-message-1");
  const contextError = statefulSetter<string | undefined>(undefined);
  const draftState = { value: draft };
  const sttComposerOperationIdRef = { current: 0 };
  const sttComposerRecorderRef = { current: undefined as SttMicrophoneRecorder | undefined };
  const sttComposerShortcutActiveRef = { current: false };
  const sttComposerSilenceRef = { current: { speechDetected: false, autoStopping: false } as SttTrailingSilenceState };
  const sttComposerThreadRef = { current: undefined as string | undefined };
  const sttProvidersRef = { current: [provider()] as SttProviderCandidate[] };
  const appendRunActivityLine = vi.fn();
  const resetPromptHistory = vi.fn();
  const resetRunActivityLines = vi.fn();
  const setError = vi.fn();

  return {
    actions: createAppSttComposerActions({
      activeVoiceMessageId: activeVoiceMessageId.value,
      appendRunActivityLine,
      getComposerDraft: () => draftState.value,
      resetPromptHistory,
      resetRunActivityLines,
      running,
      setActiveVoiceMessageId: activeVoiceMessageId.set,
      setComposerDraft: (value) => {
        draftState.value = value;
      },
      setContextError: contextError.set,
      setError,
      setRunStatus: runStatus.set,
      setSttComposer: sttComposerState.set,
      setSttDraftMetadata: sttDraftMetadata.set,
      setThreadRunStatuses: threadRunStatuses.set,
      startRecorder,
      state,
      sttComposer: sttComposerState.value,
      sttComposerOperationIdRef,
      sttComposerRecorderRef,
      sttComposerShortcutActiveRef,
      sttComposerSilenceRef,
      sttComposerThreadRef,
      sttProvidersRef,
    }),
    activeVoiceMessageId,
    appendRunActivityLine,
    contextError,
    draft: draftState,
    resetPromptHistory,
    resetRunActivityLines,
    runStatus,
    setError,
    sttComposer: sttComposerState,
    sttComposerOperationIdRef,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttComposerSilenceRef,
    sttComposerThreadRef,
    sttDraftMetadata,
    threadRunStatuses,
  };
}

function statefulSetter<T>(initial: T): {
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { value: initial };
  return {
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    },
  };
}

function provider(): SttProviderCandidate {
  return {
    capabilityId: "provider-1",
    command: "transcribe",
    available: true,
    label: "Qwen3-ASR",
    packageId: "ambient-qwen3-asr",
    packageName: "ambient-qwen3-asr",
    providerId: "qwen3-asr",
  } as SttProviderCandidate;
}

function desktopState(overrides: {
  stt?: Partial<DesktopState["settings"]["stt"]>;
} = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    settings: {
      collaborationMode: "agent",
      model: "ambient",
      permissionMode: "full-access",
      stt: {
        autoSendAfterTranscription: false,
        bargeIn: { stopTtsOnSpeech: true },
        enabled: true,
        microphone: { deviceId: "mic-1", label: "Microphone" },
        noSpeechGate: { enabled: false, rmsThresholdDbfs: -55 },
        providerCapabilityId: "provider-1",
        pushToTalkShortcut: undefined,
        silenceFinalizeSeconds: 1,
        spokenLanguage: "en",
        ...overrides.stt,
      },
      thinkingLevel: "medium",
    },
  } as DesktopState;
}

function transcription(overrides: Partial<SttTranscriptionState> = {}): SttTranscriptionState {
  return {
    utteranceId: "utt-1",
    threadId: "thread-1",
    status: "ready",
    audioPath: "/tmp/utt.wav",
    language: "en",
    text: "hello",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function fakeRecorder(overrides: Partial<SttMicrophoneRecorder> = {}): SttMicrophoneRecorder {
  const recording: SttMicrophoneRecording = {
    audioBase64: "audio",
    bytes: 5,
    durationMs: 500,
    sampleRate: 16_000,
    channels: 1,
    microphoneDeviceId: "mic-1",
    microphoneDeviceLabel: "Microphone",
  };
  return {
    cancel: vi.fn(),
    stop: vi.fn(async () => recording),
    ...overrides,
  };
}
