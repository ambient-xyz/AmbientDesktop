import { mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import type { MessageVoiceState, VoiceOutputFormat } from "../../shared/types";
import type { AmbientCliRunResult, RunAmbientCliInput } from "../ambient-cli/ambientCliPackages";
import { isPathInside } from "../session/sessionPaths";
import type { WorkspaceMediaUrlInput } from "../workspace/workspaceMedia";

export interface VoiceSynthesisProvider {
  id: string;
  capabilityId: string;
  kind: "ambient-cli";
  format: VoiceOutputFormat;
}

export interface AmbientCliVoiceProviderConfig extends VoiceSynthesisProvider {
  kind: "ambient-cli";
  packageId?: string;
  packageName?: string;
  packageWorkspacePath?: string;
  command: string;
  args?: string[];
}

export interface VoiceSynthesisRequest {
  workspacePath: string;
  state: MessageVoiceState;
  provider: AmbientCliVoiceProviderConfig;
  runner: AmbientCliVoiceRunner;
  createMediaUrl?: (input: WorkspaceMediaUrlInput) => string;
}

export type AmbientCliVoiceRunner = (workspacePath: string, input: RunAmbientCliInput) => Promise<AmbientCliRunResult>;

interface AmbientCliVoiceProviderStdout {
  audioPath?: string;
  mimeType?: string;
  durationMs?: number;
}

export function voiceSynthesisStartedState(state: MessageVoiceState): Omit<MessageVoiceState, "createdAt" | "updatedAt"> {
  return {
    ...state,
    status: "synthesizing",
    error: undefined,
    audioPath: undefined,
    mediaUrl: undefined,
    mimeType: undefined,
    durationMs: undefined,
  };
}

export async function synthesizeWithAmbientCliVoiceProvider(
  input: VoiceSynthesisRequest,
): Promise<Omit<MessageVoiceState, "createdAt" | "updatedAt">> {
  const text = input.state.spokenText?.trim();
  if (!text) {
    throw new Error("Voice state does not have spoken text to synthesize.");
  }

  const workspacePath = resolve(input.workspacePath);
  const format = input.provider.format;
  const absoluteOutputPath = voiceArtifactPath(workspacePath, input.state, format);
  await mkdir(dirname(absoluteOutputPath), { recursive: true });

  const runInput: RunAmbientCliInput = {
    packageId: input.provider.packageId,
    packageName: input.provider.packageName,
    command: input.provider.command,
    args: [
      ...(input.provider.args ?? []),
      "--text",
      text,
      "--output",
      absoluteOutputPath,
      "--format",
      format,
      ...(input.state.voiceId ? ["--voice", input.state.voiceId] : []),
    ],
  };

  const result = await input.runner(input.provider.packageWorkspacePath ?? workspacePath, {
    ...runInput,
    executionWorkspacePath: workspacePath,
  });
  const stdout = parseAmbientCliVoiceProviderStdout(result.stdout);
  const providerAudioPath = stdout.audioPath?.includes("[REDACTED]") ? undefined : stdout.audioPath;
  const absoluteAudioPath = resolveVoiceProviderAudioPath(workspacePath, providerAudioPath ?? absoluteOutputPath);
  const file = await stat(absoluteAudioPath);
  if (!file.isFile()) {
    throw new Error(`Voice provider did not create a file: ${relative(workspacePath, absoluteAudioPath)}`);
  }

  const audioPath = relative(workspacePath, absoluteAudioPath);
  const mimeType = stdout.mimeType ?? mimeTypeForVoiceFormat(format);
  const mediaUrl = input.createMediaUrl?.({
    workspacePath,
    absolutePath: absoluteAudioPath,
    relativePath: audioPath,
    mimeType,
    size: file.size,
    mtimeMs: file.mtimeMs,
  });

  return {
    messageId: input.state.messageId,
    threadId: input.state.threadId,
    status: "ready",
    source: input.state.source,
    sourceMessageId: input.state.sourceMessageId,
    providerCapabilityId: input.provider.capabilityId,
    providerId: input.provider.id,
    voiceId: input.state.voiceId,
    spokenText: text,
    spokenTextChars: [...text].length,
    sourceTextChars: input.state.sourceTextChars,
    audioPath,
    mediaUrl,
    mimeType,
    durationMs: stdout.durationMs,
  };
}

export function voiceSynthesisFailedState(
  state: MessageVoiceState,
  error: unknown,
): Omit<MessageVoiceState, "createdAt" | "updatedAt"> {
  return {
    ...state,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  };
}

function voiceArtifactPath(workspacePath: string, state: MessageVoiceState, format: VoiceOutputFormat): string {
  return join(workspacePath, ".ambient", "voice", safePathSegment(state.threadId), `${safePathSegment(state.messageId)}.${format}`);
}

function safePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return sanitized || "voice";
}

function parseAmbientCliVoiceProviderStdout(stdout: string | undefined): AmbientCliVoiceProviderStdout {
  if (!stdout?.trim()) return {};
  try {
    const payload = JSON.parse(stdout) as AmbientCliVoiceProviderStdout;
    return typeof payload === "object" && payload !== null ? payload : {};
  } catch {
    return {};
  }
}

function resolveVoiceProviderAudioPath(workspacePath: string, providerPath: string): string {
  const absolutePath = resolve(workspacePath, providerPath);
  if (!isPathInside(workspacePath, absolutePath)) {
    throw new Error("Voice provider returned an audio path outside the workspace.");
  }
  if (!voiceAudioExtensionAllowed(absolutePath)) {
    throw new Error("Voice provider returned an unsupported audio file extension.");
  }
  return absolutePath;
}

function voiceAudioExtensionAllowed(path: string): boolean {
  return [".mp3", ".wav", ".ogg"].includes(extname(path).toLowerCase());
}

function mimeTypeForVoiceFormat(format: VoiceOutputFormat): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
  }
}
