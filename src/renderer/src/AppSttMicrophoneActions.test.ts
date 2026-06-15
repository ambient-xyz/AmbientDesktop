import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  SttProviderSetupResult,
  SttTestAudioResult,
} from "../../shared/types";
import type { SttMicTestUiState, SttProviderSetupUiState } from "./RightPanel";
import {
  createAppSttMicrophoneActions,
  sttMicTestAudioInputForRecording,
  sttMicTestStateForValidationResult,
} from "./AppSttMicrophoneActions";
import {
  listSttMicrophoneDevices,
  startSttMicrophoneRecorder,
  type SttMicrophoneDevice,
  type SttMicrophoneLevel,
  type SttMicrophoneRecorder,
  type SttMicrophoneRecording,
} from "./sttMicrophoneRecorder";

vi.mock("./sttMicrophoneRecorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sttMicrophoneRecorder")>();
  return {
    ...actual,
    listSttMicrophoneDevices: vi.fn(),
    startSttMicrophoneRecorder: vi.fn(),
  };
});

describe("App STT microphone actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps microphone test save payload and validation result copy stable", () => {
    const recording = sttRecording({ microphoneDeviceId: "mic-1", microphoneDeviceLabel: "Desk mic" });
    const audio = sttAudio({ audioPath: "/tmp/stt.wav" });

    expect(sttMicTestAudioInputForRecording(recording)).toEqual({
      source: "settings-microphone",
      audioBase64: "audio",
      durationMs: 500,
      sampleRate: 48000,
      channels: 1,
      microphoneDeviceId: "mic-1",
      microphoneDeviceLabel: "Desk mic",
    });
    expect(sttMicTestStateForValidationResult({ audio, result: setupResult({ status: "ready" }) })).toEqual({
      status: "success",
      message: "Microphone sample validated.",
      audio,
    });
    expect(sttMicTestStateForValidationResult({
      audio,
      result: setupResult({ status: "validation-failed", error: "too quiet" }),
    })).toEqual({
      status: "error",
      message: "too quiet",
      audio,
    });
    expect(sttMicTestStateForValidationResult({ audio, result: undefined })).toEqual({
      status: "error",
      message: "Qwen3-ASR validation failed before returning a setup result.",
      audio,
    });
  });

  it("loads microphone devices with loading and error state parity", async () => {
    const devices = [{ deviceId: "default", label: "System default microphone" }];
    vi.mocked(listSttMicrophoneDevices).mockResolvedValue(devices);
    const controller = createController();

    await controller.actions.loadSttMicrophoneDeviceList({ requestPermission: true });

    expect(listSttMicrophoneDevices).toHaveBeenCalledWith({ requestPermission: true });
    expect(controller.devices.value).toEqual(devices);
    expect(controller.devicesLoading.history).toEqual([false, true, false]);
    expect(controller.devicesError.value).toBeUndefined();

    vi.mocked(listSttMicrophoneDevices).mockRejectedValueOnce(new Error("permission denied"));
    await controller.actions.loadSttMicrophoneDeviceList();

    expect(controller.devicesError.value).toBe("permission denied");
    expect(controller.devicesLoading.value).toBe(false);
  });

  it("starts, saves, and validates the microphone test recording", async () => {
    const recorder = sttRecorder(sttRecording({ durationMs: 700 }));
    vi.mocked(startSttMicrophoneRecorder).mockImplementation(async (options = {}) => {
      options.onDeviceFallback?.("Selected microphone was unavailable.");
      options.onLevel?.(sttLevel({ elapsedMs: 120 }));
      return recorder;
    });
    const saveSttTestAudio = vi.fn(async () => sttAudio({ audioPath: "/tmp/settings-stt.wav" }));
    vi.stubGlobal("window", {
      ambientDesktop: {
        saveSttTestAudio,
      },
    });
    const controller = createController();

    await controller.actions.startSttMicTest();

    expect(startSttMicrophoneRecorder).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "mic-1" }));
    expect(controller.recorderRef.current).toBe(recorder);
    expect(controller.micTest.value).toMatchObject({
      status: "recording",
      message: "Selected microphone was unavailable.",
    });
    expect(controller.micTest.history.some((entry) => entry.status === "recording" && Boolean(entry.level))).toBe(true);

    await controller.actions.stopSttMicTestAndValidate();

    expect(controller.recorderRef.current).toBeUndefined();
    expect(saveSttTestAudio).toHaveBeenCalledWith({
      source: "settings-microphone",
      audioBase64: "audio",
      durationMs: 700,
      sampleRate: 48000,
      channels: 1,
      microphoneDeviceId: undefined,
      microphoneDeviceLabel: undefined,
    });
    expect(controller.setupSttProvider).toHaveBeenCalledWith("validate", {
      validationAudioPath: "/tmp/settings-stt.wav",
      enable: true,
    });
    expect(controller.micTest.history.some((entry) => entry.status === "validating")).toBe(true);
    expect(controller.micTest.value).toMatchObject({
      status: "success",
      message: "Microphone sample validated.",
    });
  });

  it("cancels the active microphone test recorder", () => {
    const recorder = sttRecorder(sttRecording());
    const controller = createController({ recorderRef: mutableRef<SttMicrophoneRecorder | undefined>(recorder) });

    controller.actions.cancelSttMicTest();

    expect(recorder.cancel).toHaveBeenCalled();
    expect(controller.recorderRef.current).toBeUndefined();
    expect(controller.micTest.value).toEqual({ status: "idle" });
  });
});

function createController({
  recorderRef = mutableRef<SttMicrophoneRecorder | undefined>(undefined),
  state = desktopState(),
  sttProviderSetup = { status: "idle" } as SttProviderSetupUiState,
}: {
  recorderRef?: MutableRefObject<SttMicrophoneRecorder | undefined>;
  state?: DesktopState;
  sttProviderSetup?: SttProviderSetupUiState;
} = {}) {
  const micTest = statefulSetter<SttMicTestUiState>({ status: "idle" });
  const devices = statefulSetter<SttMicrophoneDevice[]>([]);
  const devicesLoading = statefulSetter(false);
  const devicesError = statefulSetter<string | undefined>(undefined);
  const setupSttProvider = vi.fn(async () => setupResult({ status: "ready" }));
  return {
    actions: createAppSttMicrophoneActions({
      setSttMicTest: micTest.set,
      setSttMicrophoneDevices: devices.set,
      setSttMicrophoneDevicesError: devicesError.set,
      setSttMicrophoneDevicesLoading: devicesLoading.set,
      setupSttProvider,
      state,
      sttMicRecorderRef: recorderRef,
      sttProviderSetup,
    }),
    devices,
    devicesError,
    devicesLoading,
    micTest,
    recorderRef,
    setupSttProvider,
  };
}

function statefulSetter<T>(initial: T): {
  history: T[];
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { history: [initial], value: initial };
  return {
    get history() {
      return state.history;
    },
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
      state.history.push(state.value);
    },
  };
}

function mutableRef<T>(current: T): MutableRefObject<T> {
  return { current };
}

function desktopState(): DesktopState {
  return {
    settings: {
      stt: {
        microphone: { deviceId: "mic-1", label: "Desk mic" },
      },
    },
  } as unknown as DesktopState;
}

function sttRecorder(recording: SttMicrophoneRecording): SttMicrophoneRecorder {
  return {
    cancel: vi.fn(),
    stop: vi.fn(async () => recording),
  };
}

function sttRecording(patch: Partial<SttMicrophoneRecording> = {}): SttMicrophoneRecording {
  return {
    audioBase64: "audio",
    bytes: 100,
    channels: 1,
    durationMs: 500,
    sampleRate: 48000,
    ...patch,
  };
}

function sttLevel(patch: Partial<SttMicrophoneLevel> = {}): SttMicrophoneLevel {
  return {
    elapsedMs: 0,
    level: 0.5,
    peakDbfs: -12,
    rmsDbfs: -18,
    ...patch,
  };
}

function sttAudio(patch: Partial<SttTestAudioResult> = {}): SttTestAudioResult {
  return {
    audioPath: "/tmp/audio.wav",
    bytes: 100,
    channels: 1,
    createdAt: "2026-06-13T00:00:00.000Z",
    durationMs: 500,
    sampleRate: 48000,
    threadId: "thread-1",
    utteranceId: "utt-1",
    ...patch,
  };
}

function setupResult({
  error,
  status,
}: {
  error?: string;
  status: SttProviderSetupResult["status"];
}): SttProviderSetupResult {
  return {
    action: "validate",
    installStatuses: [],
    nextSteps: [],
    packageName: "@ambient/stt-qwen3-asr",
    provider: "qwen3-asr",
    providers: [],
    runtimeCandidates: [],
    status,
    validation: {
      arch: "arm64",
      error,
      lane: "python",
      missingHints: [],
      packageName: "@ambient/stt-qwen3-asr",
      platform: "darwin",
      provider: "qwen3-asr",
      schemaVersion: "ambient-stt-provider-validation-v1",
      status: status === "ready" ? "passed" : "failed",
      updatedAt: "2026-06-13T00:00:00.000Z",
    },
  };
}
