import type { SttQueueState, SttSettings, SttTranscriptionState } from "../shared/types";
import type { AmbientCliSttRunner } from "./sttProvider";
import {
  ambientCliSttProviderFromSettings,
  transcribeWithAmbientCliSttProvider,
} from "./sttProvider";

export interface SttRuntimeUtteranceInput {
  threadId: string;
  utteranceId: string;
  audioPath: string;
}

export interface SttRuntimeRecordingInput {
  threadId: string;
  utteranceId: string;
}

export interface SttRuntimeOptions {
  workspacePath: string;
  settings: SttSettings;
  runner: AmbientCliSttRunner;
  now?: () => Date;
  onQueueStateChanged?: (queue: SttQueueState) => void;
  onTranscriptionStateChanged?: (state: SttTranscriptionState) => void;
  onStopSpeakingRequested?: () => void;
}

type PendingUtterance = SttRuntimeUtteranceInput & {
  resolve: (state: SttTranscriptionState) => void;
};

export class SttRuntime {
  private workspacePath: string;
  private settings: SttSettings;
  private runner: AmbientCliSttRunner;
  private now: () => Date;
  private onQueueStateChanged?: (queue: SttQueueState) => void;
  private onTranscriptionStateChanged?: (state: SttTranscriptionState) => void;
  private onStopSpeakingRequested?: () => void;
  private recording?: SttRuntimeRecordingInput;
  private activeUtteranceId: string | undefined;
  private pending: PendingUtterance[] = [];
  private readyUtteranceIds: string[] = [];
  private states = new Map<string, SttTranscriptionState>();
  private processing = false;
  private activeAbortController: AbortController | undefined;
  private agentRunning = false;
  private ttsSpeaking = false;

  constructor(options: SttRuntimeOptions) {
    this.workspacePath = options.workspacePath;
    this.settings = options.settings;
    this.runner = options.runner;
    this.now = options.now ?? (() => new Date());
    this.onQueueStateChanged = options.onQueueStateChanged;
    this.onTranscriptionStateChanged = options.onTranscriptionStateChanged;
    this.onStopSpeakingRequested = options.onStopSpeakingRequested;
  }

  updateSettings(settings: SttSettings): void {
    this.settings = settings;
  }

  setAgentRunning(running: boolean): SttQueueState {
    this.agentRunning = running;
    return this.emitQueueState();
  }

  setTtsSpeaking(speaking: boolean): SttQueueState {
    this.ttsSpeaking = speaking;
    return this.emitQueueState();
  }

  startRecording(input: SttRuntimeRecordingInput): SttQueueState {
    if (this.recording) throw new Error("STT recording is already active.");
    this.requestTtsStopForBargeIn();
    this.recording = input;
    return this.emitQueueState();
  }

  cancelRecording(): SttQueueState {
    this.recording = undefined;
    return this.emitQueueState();
  }

  cancelTranscription(reason = "Speech transcription was canceled."): SttQueueState {
    this.recording = undefined;
    this.readyUtteranceIds = [];
    this.activeAbortController?.abort();
    while (this.pending.length) {
      const pending = this.pending.shift();
      if (!pending) continue;
      const failed = this.setTranscriptionState({
        utteranceId: pending.utteranceId,
        threadId: pending.threadId,
        status: "failed",
        audioPath: pending.audioPath,
        language: this.settings.spokenLanguage,
        error: reason,
        createdAt: this.states.get(pending.utteranceId)?.createdAt ?? this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      });
      pending.resolve(failed);
    }
    return this.emitQueueState();
  }

  dispose(reason = "Speech transcription was canceled."): SttQueueState {
    this.onQueueStateChanged = undefined;
    this.onTranscriptionStateChanged = undefined;
    this.onStopSpeakingRequested = undefined;
    return this.cancelTranscription(reason);
  }

  finalizeRecording(audioPath: string): Promise<SttTranscriptionState> {
    if (!this.recording) throw new Error("No active STT recording to finalize.");
    const recording = this.recording;
    this.recording = undefined;
    this.emitQueueState();
    return this.enqueueUtterance({ ...recording, audioPath });
  }

  enqueueUtterance(input: SttRuntimeUtteranceInput): Promise<SttTranscriptionState> {
    this.requestTtsStopForBargeIn();

    this.setTranscriptionState({
      utteranceId: input.utteranceId,
      threadId: input.threadId,
      status: "queued",
      audioPath: input.audioPath,
      language: this.settings.spokenLanguage,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });

    const promise = new Promise<SttTranscriptionState>((resolve) => {
      this.pending.push({ ...input, resolve });
    });
    this.emitQueueState();
    void this.drainTranscriptionQueue();
    return promise;
  }

  drainReadyToSend(): SttTranscriptionState[] {
    if (this.agentRunning || this.ttsSpeaking) return [];
    const readyStates = this.readyUtteranceIds
      .map((utteranceId) => this.states.get(utteranceId))
      .filter((state): state is SttTranscriptionState => state?.status === "ready");
    this.readyUtteranceIds = [];
    this.emitQueueState();
    return readyStates;
  }

  getQueueState(): SttQueueState {
    const queuedUtteranceIds = [
      ...this.pending.map((utterance) => utterance.utteranceId),
      ...this.readyUtteranceIds,
    ];
    return {
      phase: this.currentPhase(),
      ...(this.activeUtteranceId ? { activeUtteranceId: this.activeUtteranceId } : {}),
      queuedUtteranceIds,
    };
  }

  getTranscriptionState(utteranceId: string): SttTranscriptionState | undefined {
    return this.states.get(utteranceId);
  }

  listTranscriptionStates(): SttTranscriptionState[] {
    return Array.from(this.states.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private async drainTranscriptionQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.pending.length) {
        const next = this.pending.shift();
        if (!next) continue;
        this.activeUtteranceId = next.utteranceId;
        this.setTranscriptionState({
          ...this.states.get(next.utteranceId)!,
          status: "transcribing",
          updatedAt: this.now().toISOString(),
        });
        this.emitQueueState();

        const finalState = await this.transcribe(next);
        if (finalState.status === "ready") {
          this.readyUtteranceIds.push(finalState.utteranceId);
        }
        this.activeUtteranceId = undefined;
        next.resolve(finalState);
        this.emitQueueState();
      }
    } finally {
      this.processing = false;
      this.activeUtteranceId = undefined;
      this.emitQueueState();
    }
  }

  private async transcribe(input: SttRuntimeUtteranceInput): Promise<SttTranscriptionState> {
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    try {
      const provider = ambientCliSttProviderFromSettings(this.settings);
      const state = await transcribeWithAmbientCliSttProvider({
        workspacePath: this.workspacePath,
        threadId: input.threadId,
        utteranceId: input.utteranceId,
        audioPath: input.audioPath,
        settings: this.settings,
        ...(provider ? { provider } : {}),
        runner: this.runner,
        now: this.now,
        signal: abortController.signal,
      });
      return this.setTranscriptionState(state);
    } catch (error) {
      const aborted = abortController.signal.aborted;
      return this.setTranscriptionState({
        utteranceId: input.utteranceId,
        threadId: input.threadId,
        status: "failed",
        audioPath: input.audioPath,
        language: this.settings.spokenLanguage,
        error: aborted ? "Speech transcription was canceled." : error instanceof Error ? error.message : String(error),
        createdAt: this.states.get(input.utteranceId)?.createdAt ?? this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      });
    } finally {
      if (this.activeAbortController === abortController) this.activeAbortController = undefined;
    }
  }

  private setTranscriptionState(state: SttTranscriptionState): SttTranscriptionState {
    this.states.set(state.utteranceId, state);
    this.onTranscriptionStateChanged?.(state);
    return state;
  }

  private emitQueueState(): SttQueueState {
    const queue = this.getQueueState();
    this.onQueueStateChanged?.(queue);
    return queue;
  }

  private requestTtsStopForBargeIn(): void {
    if (!this.ttsSpeaking || !this.settings.bargeIn.stopTtsOnSpeech) return;
    this.ttsSpeaking = false;
    this.onStopSpeakingRequested?.();
  }

  private currentPhase(): SttQueueState["phase"] {
    if (this.recording) return "recording";
    if (this.activeUtteranceId) return "transcribing";
    if (this.ttsSpeaking) return "speaking";
    if (this.agentRunning) return "agent_running";
    if (this.readyUtteranceIds.length) return "ready_to_send";
    return "idle";
  }
}
