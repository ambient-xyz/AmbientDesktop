import type { ChatMessage, MessageVoiceState, ThreadSummary, VoiceSettings } from "../shared/types";
import type { RunAmbientCliInput } from "./ambientCliPackages";
import { recordVoiceDispatchForMessage, requestVoiceSummary } from "./voiceDispatch";
import {
  synthesizeWithAmbientCliVoiceProvider,
  voiceSynthesisFailedState,
  voiceSynthesisStartedState,
  type AmbientCliVoiceProviderConfig,
  type AmbientCliVoiceRunner,
} from "./voiceProvider";
import type { WorkspaceMediaUrlInput } from "./workspaceMedia";

export interface VoiceRuntimeStore {
  setMessageVoiceState(input: Omit<MessageVoiceState, "createdAt" | "updatedAt">): MessageVoiceState;
}

export interface RegenerateMessageVoiceStore extends VoiceRuntimeStore {
  getMessageVoiceState(messageId: string): MessageVoiceState | undefined;
  getThread(threadId: string): ThreadSummary;
  listMessages(threadId: string): ChatMessage[];
}

export interface VoiceRuntimeSummaryOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface SynthesizeQueuedVoiceStateInput {
  workspacePath: string;
  packageWorkspacePath?: string;
  state: MessageVoiceState;
  sourceText?: string;
  settings: VoiceSettings;
  store: VoiceRuntimeStore;
  runner: AmbientCliVoiceRunner;
  createMediaUrl?: (input: WorkspaceMediaUrlInput) => string;
  summary?: VoiceRuntimeSummaryOptions;
}

export interface RegenerateMessageVoiceStateInput {
  messageId: string;
  packageWorkspacePath?: string;
  settings: VoiceSettings;
  store: RegenerateMessageVoiceStore;
  runner: AmbientCliVoiceRunner;
  createMediaUrl?: (input: WorkspaceMediaUrlInput) => string;
  summaryForThread?: (thread: ThreadSummary) => VoiceRuntimeSummaryOptions | undefined;
  onStateUpdated?: () => void;
}

export function ambientCliVoiceProviderFromSettings(
  settings: VoiceSettings,
  options: { packageWorkspacePath?: string } = {},
): AmbientCliVoiceProviderConfig | undefined {
  const capabilityId = settings.providerCapabilityId?.trim();
  if (!capabilityId) return undefined;

  const parsed = /^(?<packageId>.+):tool:(?<command>[^:]+)$/.exec(capabilityId);
  if (!parsed?.groups) return undefined;

  const packageId = parsed.groups.packageId;
  const command = parsed.groups.command;
  return {
    id: capabilityId,
    capabilityId,
    kind: "ambient-cli",
    packageId,
    command,
    format: settings.format,
    ...(options.packageWorkspacePath ? { packageWorkspacePath: options.packageWorkspacePath } : {}),
  };
}

export async function synthesizeQueuedVoiceState(input: SynthesizeQueuedVoiceStateInput): Promise<MessageVoiceState> {
  const provider = ambientCliVoiceProviderFromSettings(input.settings, { packageWorkspacePath: input.packageWorkspacePath });
  if (!provider) return input.state;
  if (input.state.status !== "queued") return input.state;

  let state = input.state;
  try {
    if (state.source === "summary") {
      const spokenSummary = await requestSpokenSummary(input);
      state = input.store.setMessageVoiceState({
        ...state,
        spokenText: spokenSummary,
        spokenTextChars: [...spokenSummary].length,
        error: undefined,
      });
    }

    const synthesizing = input.store.setMessageVoiceState(voiceSynthesisStartedState(state));
    const ready = await synthesizeWithAmbientCliVoiceProvider({
      workspacePath: input.workspacePath,
      state: synthesizing,
      provider,
      runner: input.runner,
      createMediaUrl: input.createMediaUrl,
    });
    return input.store.setMessageVoiceState(ready);
  } catch (error) {
    return input.store.setMessageVoiceState(voiceSynthesisFailedState(state, error));
  }
}

export async function regenerateMessageVoiceState(input: RegenerateMessageVoiceStateInput): Promise<MessageVoiceState> {
  const previous = input.store.getMessageVoiceState(input.messageId);
  if (!previous) throw new Error(`No voice state found for message: ${input.messageId}`);

  const thread = input.store.getThread(previous.threadId);
  const message = input.store
    .listMessages(thread.id)
    .find((candidate) => candidate.id === previous.sourceMessageId || candidate.id === previous.messageId);
  if (!message) throw new Error(`No source message found for voice state: ${input.messageId}`);
  if (message.role !== "assistant") throw new Error("Voice can only be regenerated for assistant messages.");

  const dispatch = recordVoiceDispatchForMessage({ message, settings: input.settings, store: input.store });
  input.onStateUpdated?.();
  if (dispatch.state.status !== "queued") return dispatch.state;

  if (!ambientCliVoiceProviderFromSettings(input.settings)) {
    const failed = input.store.setMessageVoiceState({
      ...dispatch.state,
      status: "failed",
      error: "Select an available voice provider before regenerating voice.",
    });
    input.onStateUpdated?.();
    return failed;
  }

  const result = await synthesizeQueuedVoiceState({
    workspacePath: thread.workspacePath,
    packageWorkspacePath: input.packageWorkspacePath,
    state: dispatch.state,
    sourceText: dispatch.decision.kind === "summarize" ? dispatch.decision.sourceText : undefined,
    settings: input.settings,
    store: input.store,
    runner: input.runner,
    createMediaUrl: input.createMediaUrl,
    summary: input.summaryForThread?.(thread),
  });
  input.onStateUpdated?.();
  return result;
}

export function deterministicWavFixtureVoiceRunner(): AmbientCliVoiceRunner {
  return async (workspacePath: string, input: RunAmbientCliInput) => {
    const outputPath = requiredArg(input.args, "--output");
    const text = requiredArg(input.args, "--text");
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(outputPath), { recursive: true });
    const durationMs = Math.max(250, Math.min(1600, [...text].length * 18));
    await writeFile(outputPath, silentWav(durationMs));
    return {
      packageId: input.packageId ?? "ambient-voice-fixture",
      packageName: input.packageName ?? "ambient-voice-fixture",
      commandName: input.command,
      command: [input.command, ...(input.args ?? [])],
      cwd: workspacePath,
      durationMs: 1,
      stdout: JSON.stringify({ audioPath: outputPath, mimeType: "audio/wav", durationMs }),
    };
  };
}

async function requestSpokenSummary(input: SynthesizeQueuedVoiceStateInput): Promise<string> {
  if (!input.summary?.apiKey) throw new Error("Ambient API key is required to create a spoken summary.");
  const spokenText = await requestVoiceSummary({
    sourceText: input.sourceText ?? input.state.spokenText ?? "",
    maxChars: input.settings.maxChars,
    model: input.summary.model,
    apiKey: input.summary.apiKey,
    baseUrl: input.summary.baseUrl,
    fetchImpl: input.summary.fetchImpl,
    signal: input.summary.signal,
  });
  if (!spokenText.trim()) throw new Error("Ambient returned an empty spoken summary.");
  return spokenText;
}

function requiredArg(args: string[] | undefined, name: string): string {
  const index = args?.indexOf(name) ?? -1;
  const value = index >= 0 ? args?.[index + 1] : undefined;
  if (!value) throw new Error(`Missing required voice provider argument: ${name}`);
  return value;
}

function silentWav(durationMs: number): Buffer {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const samples = Math.max(1, Math.ceil((durationMs / 1000) * sampleRate));
  const dataBytes = samples * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}
