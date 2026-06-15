import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SttSettings, SttTranscriptionState } from "../shared/types";
import type { AmbientCliRunResult, RunAmbientCliInput } from "./ambientCliPackages";
import { analyzeWavPcm16Rms, normalizeWavPcm16ToMono16k } from "./sttAudio";
import { resolveWorkspaceSttAudioPath, sttUtteranceArtifactPaths, toWorkspaceRelativePath } from "./sttArtifacts";

export { analyzeWavPcm16Rms } from "./sttAudio";
export type { WavRmsAnalysis } from "./sttAudio";

export interface SttTranscriptionProvider {
  id: string;
  capabilityId: string;
  kind: "ambient-cli";
}

export interface AmbientCliSttProviderConfig extends SttTranscriptionProvider {
  kind: "ambient-cli";
  packageId?: string;
  packageName?: string;
  command: string;
  args?: string[];
}

export interface SttTranscriptionRequest {
  workspacePath: string;
  threadId: string;
  utteranceId: string;
  audioPath: string;
  settings: SttSettings;
  provider?: AmbientCliSttProviderConfig;
  runner: AmbientCliSttRunner;
  now?: () => Date;
  signal?: AbortSignal;
}

export type AmbientCliSttRunner = (workspacePath: string, input: RunAmbientCliInput) => Promise<AmbientCliRunResult>;

interface AmbientCliSttProviderJson {
  text?: string;
  language?: string;
  durationMs?: number;
  providerId?: string;
  artifacts?: {
    transcriptPath?: string;
    jsonPath?: string;
    stderrPath?: string;
  };
}

export function ambientCliSttProviderFromSettings(settings: SttSettings): AmbientCliSttProviderConfig | undefined {
  const capabilityId = settings.providerCapabilityId?.trim();
  if (!capabilityId) return undefined;

  const parsed = /^(?<packageId>.+):tool:(?<command>[^:]+)$/.exec(capabilityId);
  if (!parsed?.groups) return undefined;

  return {
    id: capabilityId,
    capabilityId,
    kind: "ambient-cli",
    packageId: parsed.groups.packageId,
    command: parsed.groups.command,
  };
}

export async function transcribeWithAmbientCliSttProvider(input: SttTranscriptionRequest): Promise<SttTranscriptionState> {
  const provider = input.provider ?? ambientCliSttProviderFromSettings(input.settings);
  if (!provider) throw new Error("Select an available STT provider before transcribing speech.");

  const workspacePath = resolve(input.workspacePath);
  const absoluteAudioPath = resolveWorkspaceSttAudioPath(workspacePath, input.audioPath);
  const audio = await stat(absoluteAudioPath);
  if (!audio.isFile()) throw new Error(`STT audio path is not a file: ${toWorkspaceRelativePath(workspacePath, absoluteAudioPath)}`);

  const createdAt = (input.now ?? (() => new Date()))().toISOString();
  const audioPath = toWorkspaceRelativePath(workspacePath, absoluteAudioPath);
  const artifacts = sttUtteranceArtifactPaths(workspacePath, input.threadId, input.utteranceId);
  await mkdir(artifacts.threadRoot, { recursive: true });
  await normalizeWavPcm16ToMono16k({
    inputPath: absoluteAudioPath,
    outputPath: artifacts.normalizedAudioPath,
  });

  const gate = input.settings.noSpeechGate.enabled ? await analyzeWavPcm16Rms(artifacts.normalizedAudioPath) : undefined;
  if (gate && gate.rmsDbfs <= input.settings.noSpeechGate.rmsThresholdDbfs) {
    return {
      utteranceId: input.utteranceId,
      threadId: input.threadId,
      status: "no-speech",
      audioPath,
      normalizedAudioPath: artifacts.relative.normalizedAudioPath,
      providerCapabilityId: provider.capabilityId,
      providerId: provider.id,
      language: input.settings.spokenLanguage,
      noSpeechGate: {
        enabled: true,
        skipped: true,
        rmsDbfs: gate.rmsDbfs,
        peakDbfs: gate.peakDbfs,
        thresholdDbfs: input.settings.noSpeechGate.rmsThresholdDbfs,
        sampleCount: gate.sampleCount,
        durationMs: gate.durationMs,
        reason: "Audio RMS did not exceed the no-speech threshold.",
      },
      createdAt,
      updatedAt: createdAt,
    };
  }

  const result = await input.runner(workspacePath, {
    packageId: provider.packageId,
    packageName: provider.packageName,
    command: provider.command,
    args: [
      ...(provider.args ?? []),
      "--audio",
      artifacts.normalizedAudioPath,
      "--language",
      input.settings.spokenLanguage,
      "--output-json",
      artifacts.jsonPath,
    ],
    signal: input.signal,
  });
  const payload = await readAmbientCliSttJson(artifacts.jsonPath, result.stdout);
  const text = payload.text?.trim();
  if (!text) throw new Error("STT provider returned an empty transcript.");

  await mkdir(dirname(artifacts.transcriptPath), { recursive: true });
  await writeFile(artifacts.transcriptPath, `${text}\n`, "utf8");
  const updatedAt = (input.now ?? (() => new Date()))().toISOString();
  return {
    utteranceId: input.utteranceId,
    threadId: input.threadId,
    status: "ready",
    audioPath,
    normalizedAudioPath: artifacts.relative.normalizedAudioPath,
    providerCapabilityId: provider.capabilityId,
    providerId: payload.providerId?.trim() || provider.id,
    language: payload.language?.trim() || input.settings.spokenLanguage,
    text,
    durationMs: payload.durationMs,
    noSpeechGate: {
      enabled: input.settings.noSpeechGate.enabled,
      skipped: false,
      ...(gate ? { rmsDbfs: gate.rmsDbfs, peakDbfs: gate.peakDbfs, sampleCount: gate.sampleCount, durationMs: gate.durationMs } : {}),
      ...(input.settings.noSpeechGate.enabled ? { thresholdDbfs: input.settings.noSpeechGate.rmsThresholdDbfs } : {}),
    },
    transcriptPath: artifacts.relative.transcriptPath,
    jsonPath: artifacts.relative.jsonPath,
    ...(result.stdoutOutput?.artifactPath ? { stdoutPath: result.stdoutOutput.artifactPath } : {}),
    ...(result.stderrOutput?.artifactPath ? { stderrPath: result.stderrOutput.artifactPath } : {}),
    createdAt,
    updatedAt,
  };
}

export function deterministicTextFixtureSttRunner(text = "hello from speech"): AmbientCliSttRunner {
  return async (workspacePath: string, input: RunAmbientCliInput) => {
    const outputJsonPath = requiredArg(input.args, "--output-json");
    await mkdir(dirname(outputJsonPath), { recursive: true });
    const payload = {
      text,
      language: requiredArg(input.args, "--language"),
      durationMs: 1000,
      providerId: input.packageId ?? input.packageName ?? "ambient-stt-fixture",
      artifacts: {
        jsonPath: toWorkspaceRelativePath(workspacePath, outputJsonPath),
      },
    };
    await writeFile(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return {
      packageId: input.packageId ?? "ambient-stt-fixture",
      packageName: input.packageName ?? "ambient-stt-fixture",
      commandName: input.command,
      command: [input.command, ...(input.args ?? [])],
      cwd: workspacePath,
      durationMs: 1,
      stdout: JSON.stringify(payload),
    };
  };
}

async function readAmbientCliSttJson(outputJsonPath: string, stdout: string | undefined): Promise<AmbientCliSttProviderJson> {
  const raw = await readFile(outputJsonPath, "utf8").catch(() => stdout);
  if (!raw?.trim()) throw new Error("STT provider did not write JSON output.");
  try {
    const parsed = JSON.parse(raw) as AmbientCliSttProviderJson;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("STT provider JSON output must be an object.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "STT provider JSON output must be an object.") throw error;
    throw new Error(`STT provider returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredArg(args: string[] | undefined, name: string): string {
  const index = args?.indexOf(name) ?? -1;
  const value = index >= 0 ? args?.[index + 1] : undefined;
  if (!value) throw new Error(`Missing required STT provider argument: ${name}`);
  return value;
}
