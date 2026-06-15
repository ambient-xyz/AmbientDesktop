import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SttQueueState, SttSettings, SttTranscriptionState } from "../shared/types";
import { writePcm16Wav } from "./sttAudio";
import { deterministicTextFixtureSttRunner } from "./sttProvider";
import { SttRuntime } from "./sttRuntime";

describe("STT runtime queue", () => {
  it("keeps a ready transcript queued while the agent is running", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-runtime-agent-"));
    try {
      const audioPath = await writeSpeechFixture(workspace, "utterance.wav");
      const queueStates: SttQueueState[] = [];
      const runtime = new SttRuntime({
        workspacePath: workspace,
        settings: baseSettings(),
        runner: deterministicTextFixtureSttRunner("queue this after the current turn"),
        now: fixedNow,
        onQueueStateChanged: (queue) => queueStates.push(queue),
      });

      runtime.setAgentRunning(true);
      const state = await runtime.enqueueUtterance({
        threadId: "thread-1",
        utteranceId: "utt-agent",
        audioPath,
      });

      expect(state).toMatchObject({
        status: "ready",
        text: "queue this after the current turn",
      });
      expect(runtime.getQueueState()).toEqual({
        phase: "agent_running",
        queuedUtteranceIds: ["utt-agent"],
      });
      expect(runtime.drainReadyToSend()).toEqual([]);

      runtime.setAgentRunning(false);
      expect(runtime.getQueueState()).toEqual({
        phase: "ready_to_send",
        queuedUtteranceIds: ["utt-agent"],
      });
      expect(runtime.drainReadyToSend()).toEqual([state]);
      expect(runtime.getQueueState()).toEqual({
        phase: "idle",
        queuedUtteranceIds: [],
      });
      expect(queueStates.some((queue) => queue.phase === "transcribing" && queue.activeUtteranceId === "utt-agent")).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requests TTS stop on barge-in and queues the utterance as a visible future turn", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-runtime-speaking-"));
    try {
      const audioPath = await writeSpeechFixture(workspace, "barge-in.wav");
      let stopRequests = 0;
      const runtime = new SttRuntime({
        workspacePath: workspace,
        settings: baseSettings(),
        runner: deterministicTextFixtureSttRunner("stop speaking and listen"),
        now: fixedNow,
        onStopSpeakingRequested: () => {
          stopRequests += 1;
        },
      });

      runtime.setTtsSpeaking(true);
      const state = await runtime.enqueueUtterance({
        threadId: "thread-1",
        utteranceId: "utt-barge",
        audioPath,
      });

      expect(stopRequests).toBe(1);
      expect(state.status).toBe("ready");
      expect(runtime.getQueueState()).toEqual({
        phase: "ready_to_send",
        queuedUtteranceIds: ["utt-barge"],
      });
      expect(runtime.drainReadyToSend()[0]?.text).toBe("stop speaking and listen");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps no-speech and failed transcriptions out of the ready queue", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-runtime-terminal-"));
    try {
      const silencePath = await writeSilenceFixture(workspace, "silence.wav");
      const speechPath = await writeSpeechFixture(workspace, "speech.wav");
      const states: SttTranscriptionState[] = [];
      const runtime = new SttRuntime({
        workspacePath: workspace,
        settings: baseSettings(),
        runner: deterministicTextFixtureSttRunner("this should not run for silence"),
        now: fixedNow,
        onTranscriptionStateChanged: (state) => states.push(state),
      });

      const noSpeech = await runtime.enqueueUtterance({
        threadId: "thread-1",
        utteranceId: "utt-silence",
        audioPath: silencePath,
      });
      runtime.updateSettings({ ...baseSettings(), providerCapabilityId: undefined });
      const failed = await runtime.enqueueUtterance({
        threadId: "thread-1",
        utteranceId: "utt-failed",
        audioPath: speechPath,
      });

      expect(noSpeech.status).toBe("no-speech");
      expect(failed).toMatchObject({
        status: "failed",
        error: "Select an available STT provider before transcribing speech.",
      });
      expect(runtime.drainReadyToSend()).toEqual([]);
      expect(runtime.getQueueState()).toEqual({
        phase: "idle",
        queuedUtteranceIds: [],
      });
      expect(states.map((state) => state.status)).toEqual([
        "queued",
        "transcribing",
        "no-speech",
        "queued",
        "transcribing",
        "failed",
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("tracks recording before finalizing into transcription", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-runtime-recording-"));
    try {
      const audioPath = await writeSpeechFixture(workspace, "recorded.wav");
      let stopRequests = 0;
      const runtime = new SttRuntime({
        workspacePath: workspace,
        settings: baseSettings(),
        runner: deterministicTextFixtureSttRunner("finalized recording"),
        now: fixedNow,
        onStopSpeakingRequested: () => {
          stopRequests += 1;
        },
      });

      runtime.setTtsSpeaking(true);
      expect(runtime.startRecording({ threadId: "thread-1", utteranceId: "utt-recording" })).toEqual({
        phase: "recording",
        queuedUtteranceIds: [],
      });
      expect(stopRequests).toBe(1);
      const state = await runtime.finalizeRecording(audioPath);

      expect(state).toMatchObject({
        utteranceId: "utt-recording",
        status: "ready",
        text: "finalized recording",
      });
      expect(runtime.getTranscriptionState("utt-recording")).toBe(state);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("cancels active and queued transcriptions", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-runtime-cancel-"));
    try {
      const audioPath = await writeSpeechFixture(workspace, "cancel.wav");
      let abortObserved = false;
      const runtime = new SttRuntime({
        workspacePath: workspace,
        settings: baseSettings(),
        runner: async (_workspacePath, input) =>
          new Promise((resolve, reject) => {
            if (input.signal?.aborted) {
              abortObserved = true;
              reject(new Error("aborted"));
              return;
            }
            input.signal?.addEventListener("abort", () => {
              abortObserved = true;
              reject(new Error("aborted"));
            });
          }),
        now: fixedNow,
      });

      const active = runtime.enqueueUtterance({
        threadId: "thread-1",
        utteranceId: "utt-active",
        audioPath,
      });
      const queued = runtime.enqueueUtterance({
        threadId: "thread-1",
        utteranceId: "utt-queued",
        audioPath,
      });
      await waitFor(() => runtime.getQueueState().phase === "transcribing");

      expect(runtime.cancelTranscription()).toMatchObject({
        phase: "transcribing",
        activeUtteranceId: "utt-active",
        queuedUtteranceIds: [],
      });

      await expect(active).resolves.toMatchObject({
        status: "failed",
        error: "Speech transcription was canceled.",
      });
      await expect(queued).resolves.toMatchObject({
        status: "failed",
        error: "Speech transcription was canceled.",
      });
      expect(abortObserved).toBe(true);
      expect(runtime.getQueueState()).toEqual({
        phase: "idle",
        queuedUtteranceIds: [],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("disposes active transcription without emitting renderer queue updates during shutdown", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-runtime-dispose-"));
    try {
      const audioPath = await writeSpeechFixture(workspace, "dispose.wav");
      let queueEvents = 0;
      let transcriptEvents = 0;
      const runtime = new SttRuntime({
        workspacePath: workspace,
        settings: baseSettings(),
        runner: async (_workspacePath, input) =>
          new Promise((_resolve, reject) => {
            if (input.signal?.aborted) {
              reject(new Error("aborted"));
              return;
            }
            input.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        now: fixedNow,
        onQueueStateChanged: () => {
          queueEvents += 1;
        },
        onTranscriptionStateChanged: () => {
          transcriptEvents += 1;
        },
      });

      const active = runtime.enqueueUtterance({
        threadId: "thread-1",
        utteranceId: "utt-dispose",
        audioPath,
      });
      await waitFor(() => runtime.getQueueState().phase === "transcribing");
      const queueEventsBeforeDispose = queueEvents;
      const transcriptEventsBeforeDispose = transcriptEvents;

      expect(runtime.dispose("App is quitting.")).toMatchObject({
        phase: "transcribing",
        activeUtteranceId: "utt-dispose",
      });

      await expect(active).resolves.toMatchObject({
        status: "failed",
        error: "Speech transcription was canceled.",
      });
      expect(queueEvents).toBe(queueEventsBeforeDispose);
      expect(transcriptEvents).toBe(transcriptEventsBeforeDispose);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function baseSettings(): SttSettings {
  return {
    enabled: true,
    providerCapabilityId: "ambient-cli:fixture:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    spokenLanguage: "English",
    mode: "push-to-talk",
    autoSendAfterTranscription: true,
    silenceFinalizeSeconds: 0.8,
    noSpeechGate: {
      enabled: true,
      rmsThresholdDbfs: -55,
    },
    bargeIn: {
      stopTtsOnSpeech: true,
      queueWhileAgentRuns: true,
    },
  };
}

function fixedNow(): Date {
  return new Date("2026-05-09T12:00:00.000Z");
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition.");
}

async function writeSpeechFixture(workspace: string, name: string): Promise<string> {
  const path = join(workspace, name);
  await writeFile(path, pcm16Wav({ durationMs: 500, amplitude: 0.18 }));
  return path;
}

async function writeSilenceFixture(workspace: string, name: string): Promise<string> {
  const path = join(workspace, name);
  await writeFile(path, pcm16Wav({ durationMs: 300, amplitude: 0 }));
  return path;
}

function pcm16Wav(input: { durationMs: number; amplitude: number }): Buffer {
  const sampleRate = 16_000;
  const sampleCount = Math.max(1, Math.round((input.durationMs / 1000) * sampleRate));
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    samples[index] = Math.round(Math.sin(2 * Math.PI * 440 * t) * input.amplitude * 32767);
  }
  return writePcm16Wav({
    sampleRate,
    channels: 1,
    samples,
  });
}
