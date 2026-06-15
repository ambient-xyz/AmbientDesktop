export interface SttMicrophoneRecording {
  audioBase64: string;
  bytes: number;
  durationMs: number;
  sampleRate: number;
  channels: 1;
  microphoneDeviceId?: string;
  microphoneDeviceLabel?: string;
}

export interface SttMicrophoneLevel {
  rmsDbfs: number;
  peakDbfs: number;
  level: number;
  elapsedMs: number;
}

export interface SttMicrophoneRecorderOptions {
  deviceId?: string;
  onLevel?: (level: SttMicrophoneLevel) => void;
  onDeviceFallback?: (message: string) => void;
}

export interface SttMicrophoneDevice {
  deviceId: string;
  groupId?: string;
  label: string;
}

export interface SttTrailingSilenceState {
  speechDetected: boolean;
  silentStartedAtMs?: number;
  autoStopping: boolean;
}

export interface SttTrailingSilenceUpdate {
  state: SttTrailingSilenceState;
  silenceMs: number;
  shouldFinalize: boolean;
}

export interface SttMicrophoneRecorder {
  stop(): Promise<SttMicrophoneRecording>;
  cancel(): void;
}

const silenceDbfsFloor = -120;

export async function listSttMicrophoneDevices(options: { requestPermission?: boolean } = {}): Promise<SttMicrophoneDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) throw new Error("Microphone device listing is not available in this browser context.");
  let permissionStream: MediaStream | undefined;
  if (options.requestPermission) {
    permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: sttMicrophoneAudioConstraints(),
    });
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "audioinput" && device.deviceId)
      .map((device, index) => ({
        deviceId: device.deviceId,
        ...(device.groupId ? { groupId: device.groupId } : {}),
        label: device.label || (device.deviceId === "default" ? "System default microphone" : `Microphone ${index + 1}`),
      }));
  } finally {
    for (const track of permissionStream?.getTracks() ?? []) track.stop();
  }
}

export async function startSttMicrophoneRecorder(options: SttMicrophoneRecorderOptions = {}): Promise<SttMicrophoneRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not available in this browser context.");
  const audioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!audioContextCtor) throw new Error("Web Audio recording is not available in this browser context.");

  const requestedDeviceId = options.deviceId?.trim();
  let stream: MediaStream;
  let usedFallbackDevice = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: sttMicrophoneAudioConstraints(requestedDeviceId),
    });
  } catch (error) {
    if (!requestedDeviceId || !isMicrophoneDeviceSelectionError(error)) throw error;
    usedFallbackDevice = true;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: sttMicrophoneAudioConstraints(),
    });
  }
  if (usedFallbackDevice) {
    options.onDeviceFallback?.("Selected microphone was unavailable, so Ambient used the system default microphone for this recording.");
  }
  const track = stream.getAudioTracks()[0] ?? stream.getTracks()[0];
  const trackSettings = typeof track?.getSettings === "function" ? track.getSettings() : {};
  const microphoneDeviceId = typeof trackSettings.deviceId === "string" && trackSettings.deviceId ? trackSettings.deviceId : requestedDeviceId;
  const microphoneDeviceLabel = typeof track?.label === "string" && track.label ? track.label : undefined;
  const audioContext = new audioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, Math.max(1, source.channelCount || 1), 1);
  const chunks: Float32Array[] = [];
  let stopped = false;
  let recordedFrames = 0;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer;
    const frames = input.length;
    const channels = Math.max(1, input.numberOfChannels);
    const mono = new Float32Array(frames);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = input.getChannelData(channel);
      for (let index = 0; index < frames; index += 1) {
        mono[index] += (data[index] ?? 0) / channels;
      }
    }
    chunks.push(mono);
    recordedFrames += frames;
    options.onLevel?.({
      ...analyzeFloat32Level(mono),
      elapsedMs: Math.round((recordedFrames / audioContext.sampleRate) * 1000),
    });
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  const cleanup = () => {
    stopped = true;
    processor.disconnect();
    source.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void audioContext.close().catch(() => undefined);
  };

  return {
    async stop() {
      if (stopped) throw new Error("Microphone recording has already stopped.");
      cleanup();
      const samples = mergeFloat32Chunks(chunks);
      const wav = encodePcm16WavMono(samples, audioContext.sampleRate);
      return {
        audioBase64: arrayBufferToBase64(wav),
        bytes: wav.byteLength,
        durationMs: Math.round((samples.length / audioContext.sampleRate) * 1000),
        sampleRate: audioContext.sampleRate,
        channels: 1,
        ...(microphoneDeviceId ? { microphoneDeviceId } : {}),
        ...(microphoneDeviceLabel ? { microphoneDeviceLabel } : {}),
      };
    },
    cancel() {
      if (!stopped) cleanup();
    },
  };
}

export function sttMicrophoneAudioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function isMicrophoneDeviceSelectionError(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name) : "";
  return ["OverconstrainedError", "NotFoundError", "DevicesNotFoundError", "ConstraintNotSatisfiedError"].includes(name);
}

export function encodePcm16WavMono(samples: Float32Array, sampleRate: number): ArrayBuffer {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Cannot encode STT WAV with an invalid sample rate.");
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }
  return buffer;
}

export function analyzeFloat32Level(samples: Float32Array): Omit<SttMicrophoneLevel, "elapsedMs"> {
  let sumSquares = 0;
  let peak = 0;
  for (const rawSample of samples) {
    const sample = Math.max(-1, Math.min(1, rawSample));
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0;
  const rmsDbfs = amplitudeToDbfs(rms);
  const peakDbfs = amplitudeToDbfs(peak);
  return {
    rmsDbfs,
    peakDbfs,
    level: dbfsToMeterLevel(rmsDbfs),
  };
}

export function dbfsToMeterLevel(dbfs: number): number {
  if (!Number.isFinite(dbfs) || dbfs <= -60) return 0;
  if (dbfs >= 0) return 1;
  return Math.max(0, Math.min(1, (dbfs + 60) / 60));
}

export function advanceTrailingSilence(
  state: SttTrailingSilenceState,
  level: Pick<SttMicrophoneLevel, "rmsDbfs" | "elapsedMs">,
  speechThresholdDbfs: number,
  silenceFinalizeMs: number,
): SttTrailingSilenceUpdate {
  if (level.rmsDbfs > speechThresholdDbfs) {
    return {
      state: { speechDetected: true, autoStopping: false },
      silenceMs: 0,
      shouldFinalize: false,
    };
  }
  if (!state.speechDetected) {
    return {
      state,
      silenceMs: 0,
      shouldFinalize: false,
    };
  }

  const silentStartedAtMs = state.silentStartedAtMs ?? level.elapsedMs;
  const silenceMs = Math.max(0, level.elapsedMs - silentStartedAtMs);
  const shouldFinalize = !state.autoStopping && silenceMs >= silenceFinalizeMs;
  return {
    state: {
      speechDetected: true,
      silentStartedAtMs,
      autoStopping: state.autoStopping || shouldFinalize,
    },
    silenceMs,
    shouldFinalize,
  };
}

function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function amplitudeToDbfs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return silenceDbfsFloor;
  return Math.max(silenceDbfsFloor, Math.round(20 * Math.log10(value) * 1000) / 1000);
}
