import { describe, expect, it } from "vitest";
import {
  advanceTrailingSilence,
  analyzeFloat32Level,
  dbfsToMeterLevel,
  encodePcm16WavMono,
  isMicrophoneDeviceSelectionError,
  sttMicrophoneAudioConstraints,
} from "./sttMicrophoneRecorder";

describe("STT microphone recorder", () => {
  it("encodes browser microphone samples as PCM16 WAV", () => {
    const wav = encodePcm16WavMono(new Float32Array([0, 0.5, -0.5, 1, -1]), 16_000);
    const view = new DataView(wav);
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(10);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(16_384);
    expect(view.getInt16(48, true)).toBe(-16_383);
    expect(view.getInt16(50, true)).toBe(32_767);
    expect(view.getInt16(52, true)).toBe(-32_767);
  });

  it("maps microphone chunks to RMS, peak, and meter levels", () => {
    expect(analyzeFloat32Level(new Float32Array([0, 0, 0]))).toMatchObject({
      rmsDbfs: -120,
      peakDbfs: -120,
      level: 0,
    });

    const speech = analyzeFloat32Level(new Float32Array([0.25, -0.25, 0.25, -0.25]));
    expect(speech.rmsDbfs).toBeCloseTo(-12.041, 3);
    expect(speech.peakDbfs).toBeCloseTo(-12.041, 3);
    expect(speech.level).toBeGreaterThan(0.7);
  });

  it("normalizes dBFS values for a compact level meter", () => {
    expect(dbfsToMeterLevel(-120)).toBe(0);
    expect(dbfsToMeterLevel(-60)).toBe(0);
    expect(dbfsToMeterLevel(-30)).toBe(0.5);
    expect(dbfsToMeterLevel(0)).toBe(1);
  });

  it("builds default and explicit microphone capture constraints", () => {
    expect(sttMicrophoneAudioConstraints()).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(sttMicrophoneAudioConstraints("airpods-pro")).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      deviceId: { exact: "airpods-pro" },
    });
  });

  it("identifies errors that should fall back to the default microphone", () => {
    expect(isMicrophoneDeviceSelectionError({ name: "OverconstrainedError" })).toBe(true);
    expect(isMicrophoneDeviceSelectionError({ name: "NotFoundError" })).toBe(true);
    expect(isMicrophoneDeviceSelectionError({ name: "NotAllowedError" })).toBe(false);
  });

  it("finalizes only after speech has been followed by configured trailing silence", () => {
    let tracker = { speechDetected: false, autoStopping: false };

    let update = advanceTrailingSilence(tracker, { rmsDbfs: -80, elapsedMs: 500 }, -55, 800);
    expect(update).toMatchObject({ silenceMs: 0, shouldFinalize: false, state: { speechDetected: false } });

    update = advanceTrailingSilence(update.state, { rmsDbfs: -20, elapsedMs: 700 }, -55, 800);
    expect(update).toMatchObject({ silenceMs: 0, shouldFinalize: false, state: { speechDetected: true } });

    update = advanceTrailingSilence(update.state, { rmsDbfs: -70, elapsedMs: 1000 }, -55, 800);
    expect(update).toMatchObject({ silenceMs: 0, shouldFinalize: false, state: { silentStartedAtMs: 1000 } });

    update = advanceTrailingSilence(update.state, { rmsDbfs: -72, elapsedMs: 1800 }, -55, 800);
    expect(update).toMatchObject({ silenceMs: 800, shouldFinalize: true, state: { autoStopping: true } });

    tracker = update.state;
    update = advanceTrailingSilence(tracker, { rmsDbfs: -74, elapsedMs: 2200 }, -55, 800);
    expect(update.shouldFinalize).toBe(false);
  });
});

function ascii(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index));
  return value;
}
