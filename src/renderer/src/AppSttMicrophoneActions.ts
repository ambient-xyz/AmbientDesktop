import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { SttProviderSetupResult, SttTestAudioInput, SttTestAudioResult } from "../../shared/localRuntimeTypes";
import type { SttMicTestUiState, SttProviderSetupUiState } from "./RightPanel";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import {
  listSttMicrophoneDevices,
  startSttMicrophoneRecorder,
  type SttMicrophoneDevice,
  type SttMicrophoneRecorder,
  type SttMicrophoneRecording,
} from "./sttMicrophoneRecorder";

export const STT_MIC_TEST_MIN_DURATION_MS = 300;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sttMicTestAudioInputForRecording(recording: SttMicrophoneRecording): SttTestAudioInput {
  return {
    source: "settings-microphone",
    audioBase64: recording.audioBase64,
    durationMs: recording.durationMs,
    sampleRate: recording.sampleRate,
    channels: recording.channels,
    microphoneDeviceId: recording.microphoneDeviceId,
    microphoneDeviceLabel: recording.microphoneDeviceLabel,
  };
}

export function sttMicTestStateForValidationResult(input: {
  audio: SttTestAudioResult;
  result: SttProviderSetupResult | undefined;
}): SttMicTestUiState {
  const { audio, result } = input;
  if (result?.status === "ready") {
    return { status: "success", message: "Microphone sample validated.", audio };
  }
  if (result) {
    return {
      status: "error",
      message: result.validation.error ?? "Qwen3-ASR validation did not pass.",
      audio,
    };
  }
  return {
    status: "error",
    message: "Qwen3-ASR validation failed before returning a setup result.",
    audio,
  };
}

export function createAppSttMicrophoneActions({
  setSttMicTest,
  setSttMicrophoneDevices,
  setSttMicrophoneDevicesError,
  setSttMicrophoneDevicesLoading,
  setupSttProvider,
  state,
  sttMicRecorderRef,
  sttProviderSetup,
}: {
  setSttMicTest: Dispatch<SetStateAction<SttMicTestUiState>>;
  setSttMicrophoneDevices: Dispatch<SetStateAction<SttMicrophoneDevice[]>>;
  setSttMicrophoneDevicesError: Dispatch<SetStateAction<string | undefined>>;
  setSttMicrophoneDevicesLoading: Dispatch<SetStateAction<boolean>>;
  setupSttProvider: (
    action: "install" | "repair" | "validate",
    options?: { validationAudioPath?: string; enable?: boolean },
  ) => Promise<SttProviderSetupResult | undefined>;
  state: DesktopState | undefined;
  sttMicRecorderRef: MutableRefObject<SttMicrophoneRecorder | undefined>;
  sttProviderSetup: SttProviderSetupUiState;
}): {
  cancelSttMicTest: () => void;
  loadSttMicrophoneDeviceList: (options?: { requestPermission?: boolean }) => Promise<void>;
  startSttMicTest: () => Promise<void>;
  stopSttMicTestAndValidate: () => Promise<void>;
} {
  async function loadSttMicrophoneDeviceList(options: { requestPermission?: boolean } = {}): Promise<void> {
    setSttMicrophoneDevicesLoading(true);
    setSttMicrophoneDevicesError(undefined);
    try {
      setSttMicrophoneDevices(await listSttMicrophoneDevices(options));
    } catch (error) {
      setSttMicrophoneDevicesError(errorMessage(error));
    } finally {
      setSttMicrophoneDevicesLoading(false);
    }
  }

  async function startSttMicTest(): Promise<void> {
    if (!state || sttMicRecorderRef.current || sttProviderSetup.status === "running") return;
    const selectedMicrophone = state.settings.stt.microphone;
    let deviceFallbackMessage: string | undefined;
    setSttMicTest({ status: "recording", message: "Requesting microphone..." });
    try {
      const recorder = await startSttMicrophoneRecorder({
        deviceId: selectedMicrophone?.deviceId,
        onDeviceFallback: (message) => {
          deviceFallbackMessage = message;
          setSttMicTest((current) => (current.status === "recording" ? { ...current, message } : current));
        },
        onLevel: (level) => {
          setSttMicTest((current) => (current.status === "recording" ? { ...current, level } : current));
        },
      });
      sttMicRecorderRef.current = recorder;
      setSttMicTest({ status: "recording", message: deviceFallbackMessage ?? "Recording microphone test..." });
    } catch (error) {
      setSttMicTest({ status: "error", message: errorMessage(error) });
    }
  }

  async function stopSttMicTestAndValidate(): Promise<void> {
    if (!state || !sttMicRecorderRef.current) return;
    const recorder = sttMicRecorderRef.current;
    sttMicRecorderRef.current = undefined;
    setSttMicTest({ status: "saving", message: "Saving microphone sample..." });
    try {
      const recording = await recorder.stop();
      if (recording.durationMs < STT_MIC_TEST_MIN_DURATION_MS) throw new Error("Record a longer microphone sample before validating.");
      const audio = await window.ambientDesktop.saveSttTestAudio(sttMicTestAudioInputForRecording(recording));
      setSttMicTest({ status: "validating", message: "Validating microphone sample with Qwen3-ASR...", audio });
      const result = await setupSttProvider("validate", { validationAudioPath: audio.audioPath, enable: true });
      setSttMicTest(sttMicTestStateForValidationResult({ audio, result }));
    } catch (error) {
      setSttMicTest({ status: "error", message: errorMessage(error) });
    }
  }

  function cancelSttMicTest(): void {
    sttMicRecorderRef.current?.cancel();
    sttMicRecorderRef.current = undefined;
    setSttMicTest({ status: "idle" });
  }

  return {
    cancelSttMicTest,
    loadSttMicrophoneDeviceList,
    startSttMicTest,
    stopSttMicTestAndValidate,
  };
}

type AppSttMicrophoneRuntimeStateInput = Pick<
  ReturnType<typeof useAppProviderRuntimeState>,
  | "setSttMicTest"
  | "setSttMicrophoneDevices"
  | "setSttMicrophoneDevicesError"
  | "setSttMicrophoneDevicesLoading"
  | "sttMicRecorderRef"
  | "sttProviderSetup"
>;

export function createAppSttMicrophoneActionsForRuntimeState({
  providerRuntimeState,
  setupSttProvider,
  state,
}: {
  providerRuntimeState: AppSttMicrophoneRuntimeStateInput;
  setupSttProvider: (
    action: "install" | "repair" | "validate",
    options?: { validationAudioPath?: string; enable?: boolean },
  ) => Promise<SttProviderSetupResult | undefined>;
  state: DesktopState | undefined;
}): ReturnType<typeof createAppSttMicrophoneActions> {
  return createAppSttMicrophoneActions({
    setSttMicTest: providerRuntimeState.setSttMicTest,
    setSttMicrophoneDevices: providerRuntimeState.setSttMicrophoneDevices,
    setSttMicrophoneDevicesError: providerRuntimeState.setSttMicrophoneDevicesError,
    setSttMicrophoneDevicesLoading: providerRuntimeState.setSttMicrophoneDevicesLoading,
    setupSttProvider,
    state,
    sttMicRecorderRef: providerRuntimeState.sttMicRecorderRef,
    sttProviderSetup: providerRuntimeState.sttProviderSetup,
  });
}
