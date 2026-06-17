import { appendFile, mkdir } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import type {
  SttDiagnosticErrorCategory,
  SttDiagnosticSummary,
  SttProviderSetupResult,
  SttQueueState,
  SttTranscriptionState,
} from "../../shared/types";

const maxInMemoryDiagnostics = 30;
const diagnosticsLogPath = join(".ambient", "stt", "diagnostics.jsonl");

export interface SttSetupDiagnosticInput {
  result: SttProviderSetupResult;
  durationMs: number;
  now?: Date;
}

export interface SttTranscriptionDiagnosticInput {
  state: SttTranscriptionState;
  elapsedMs: number;
  queue?: SttQueueState;
  now?: Date;
}

export class SttDiagnosticRecorder {
  private readonly byWorkspace = new Map<string, SttDiagnosticSummary[]>();

  list(workspacePath: string): SttDiagnosticSummary[] {
    return [...(this.byWorkspace.get(workspacePath) ?? [])];
  }

  async record(workspacePath: string, diagnostic: SttDiagnosticSummary): Promise<SttDiagnosticSummary[]> {
    const diagnostics = [diagnostic, ...(this.byWorkspace.get(workspacePath) ?? [])].slice(0, maxInMemoryDiagnostics);
    this.byWorkspace.set(workspacePath, diagnostics);
    await appendDiagnostic(workspacePath, diagnostic).catch((error) => {
      console.warn(`Failed to write STT diagnostic: ${error instanceof Error ? error.message : String(error)}`);
    });
    return diagnostics;
  }
}

export function sttSetupDiagnosticSummary(input: SttSetupDiagnosticInput): SttDiagnosticSummary {
  const validation = input.result.validation;
  const createdAt = (input.now ?? new Date()).toISOString();
  const missingHintCount = validation.missingHints.length + (input.result.runtimeInstall?.missingHints.length ?? 0);
  return {
    id: `stt-setup-${Date.parse(createdAt).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "setup",
    createdAt,
    provider: input.result.provider,
    action: input.result.action,
    status: input.result.status,
    durationMs: input.durationMs,
    packageName: input.result.packageName,
    platform: validation.platform || platform(),
    arch: validation.arch || arch(),
    lane: validation.lane,
    ...(input.result.selectedProvider?.capabilityId ? { providerCapabilityId: input.result.selectedProvider.capabilityId } : {}),
    ...(validation.runtimeVersion ? { runtimeVersion: validation.runtimeVersion } : {}),
    ...(validation.model ? { model: validation.model } : {}),
    ...(validation.modelSource ? { modelSource: validation.modelSource } : {}),
    ...(validation.assetManifest?.version ? { assetManifestVersion: validation.assetManifest.version } : {}),
    ...(input.result.runtimeInstall?.status ? { runtimeInstallStatus: input.result.runtimeInstall.status } : {}),
    ...(input.result.runtimeInstall?.durationMs !== undefined ? { runtimeInstallDurationMs: input.result.runtimeInstall.durationMs } : {}),
    ...(input.result.selectedProvider ? { selectedProviderAvailable: input.result.selectedProvider.available } : {}),
    missingHintCount,
    ...(setupErrorCategory(input.result) ? { errorCategory: setupErrorCategory(input.result) } : {}),
  };
}

export function sttTranscriptionDiagnosticSummary(input: SttTranscriptionDiagnosticInput): SttDiagnosticSummary {
  const createdAt = (input.now ?? new Date()).toISOString();
  const gate = input.state.noSpeechGate;
  return {
    id: `stt-transcription-${Date.parse(createdAt).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "transcription",
    createdAt,
    utteranceId: input.state.utteranceId,
    threadId: input.state.threadId,
    status: input.state.status,
    ...(input.state.providerCapabilityId ? { providerCapabilityId: input.state.providerCapabilityId } : {}),
    ...(input.state.providerId ? { providerId: input.state.providerId } : {}),
    ...(input.state.language ? { language: input.state.language } : {}),
    ...(gate?.durationMs !== undefined ? { audioDurationMs: gate.durationMs } : input.state.durationMs !== undefined ? { audioDurationMs: input.state.durationMs } : {}),
    transcriptionElapsedMs: input.elapsedMs,
    ...(input.state.text ? { transcriptChars: [...input.state.text].length } : {}),
    ...(gate
      ? {
          noSpeechGate: {
            enabled: gate.enabled,
            skipped: gate.skipped,
            ...(gate.rmsDbfs !== undefined ? { rmsDbfs: gate.rmsDbfs } : {}),
            ...(gate.peakDbfs !== undefined ? { peakDbfs: gate.peakDbfs } : {}),
            ...(gate.thresholdDbfs !== undefined ? { thresholdDbfs: gate.thresholdDbfs } : {}),
            ...(gate.durationMs !== undefined ? { durationMs: gate.durationMs } : {}),
          },
        }
      : {}),
    artifacts: {
      audio: Boolean(input.state.audioPath),
      normalizedAudio: Boolean(input.state.normalizedAudioPath),
      transcript: Boolean(input.state.transcriptPath),
      json: Boolean(input.state.jsonPath),
      stdout: Boolean(input.state.stdoutPath),
      stderr: Boolean(input.state.stderrPath),
    },
    ...(input.queue?.phase ? { queuePhase: input.queue.phase } : {}),
    ...(input.queue?.queuedUtteranceIds ? { queuedUtteranceCount: input.queue.queuedUtteranceIds.length } : {}),
    ...(transcriptionErrorCategory(input.state) ? { errorCategory: transcriptionErrorCategory(input.state) } : {}),
  };
}

export function sttDiagnosticsLogRelativePath(): string {
  return diagnosticsLogPath;
}

function setupErrorCategory(result: SttProviderSetupResult): SttDiagnosticErrorCategory | undefined {
  if (result.status === "ready" || result.status === "installed") return undefined;
  if (result.status === "needs-runtime" || result.validation.status === "needs-runtime") return "missing-runtime";
  if (result.status === "validation-failed") return result.validation.error?.toLowerCase().includes("model") ? "missing-model" : "validation-failed";
  if (result.status === "failed") return "provider-error";
  return "unknown";
}

function transcriptionErrorCategory(state: SttTranscriptionState): SttDiagnosticErrorCategory | undefined {
  if (state.status === "ready" || state.status === "queued" || state.status === "transcribing") return undefined;
  if (state.status === "no-speech") return "no-speech";
  const error = state.error?.toLowerCase() ?? "";
  if (error.includes("enable speech input") || error.includes("select an available stt provider")) return "configuration";
  if (error.includes("permission")) return "permission";
  if (error.includes("runtime") || error.includes("binary") || error.includes("llama-mtmd-cli")) return "missing-runtime";
  if (error.includes("model") || error.includes("mmproj")) return "missing-model";
  if (state.status === "failed") return "provider-error";
  return "unknown";
}

async function appendDiagnostic(workspacePath: string, diagnostic: SttDiagnosticSummary): Promise<void> {
  const absolutePath = join(workspacePath, diagnosticsLogPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await appendFile(absolutePath, `${JSON.stringify(diagnostic)}\n`, "utf8");
}
