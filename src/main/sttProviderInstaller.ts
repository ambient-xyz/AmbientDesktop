import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { arch, homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type {
  SttProviderAssetFileSummary,
  SttProviderAssetManifestSummary,
  SttProviderCandidate,
  SttProviderRuntimeCandidate,
  SttProviderRuntimeInstallResult,
  SttProviderSetupInput,
  SttProviderSetupResult,
  SttProviderValidationMetadata,
} from "../shared/types";
import {
  discoverAmbientCliSttProviders,
  ensureFirstPartyAmbientCliPackages,
  runAmbientCliPackageCommand,
  setAmbientCliPackageEnvBinding,
  type FirstPartyAmbientCliPackageInstallStatus,
} from "./ambientCliPackages";
import { transcribeWithAmbientCliSttProvider } from "./sttProvider";
import { toWorkspaceRelativePath } from "./sttArtifacts";
import { isPathInside } from "./sessionPaths";

const qwenProvider = "qwen3-asr" as const;
const qwenPackageName = "ambient-qwen3-asr";
const qwenCommandName = "qwen3_asr_transcribe";
const validationSchemaVersion = "ambient-stt-provider-validation-v1";
const validationMetadataPath = ".ambient/stt/qwen3-asr/validation.json";
const runtimeEnvRoot = ".ambient/stt/qwen3-asr/env";
const runtimeBinaryEnvName = "AMBIENT_QWEN3_ASR_BINARY";
const homebrewQwenRuntimePackage = "llama.cpp";
const hostCommandMaxBuffer = 1024 * 1024 * 16;
const homebrewInstallTimeoutMs = 20 * 60 * 1000;

interface QwenHealthPayload {
  providerId?: string;
  available?: boolean;
  reason?: string;
  runtime?: {
    binary?: string;
    version?: string;
    model?: string;
    modelSource?: string;
  };
  assetManifest?: SttProviderAssetManifestSummary;
  missingHints?: string[];
}

export interface SetupQwen3AsrProviderOptions {
  bundledPackageRootPath?: string;
  disableRuntimeAutoDetect?: boolean;
  disableRuntimeInstall?: boolean;
  runtimeInstaller?: QwenRuntimeInstaller;
  now?: () => Date;
}

export interface QwenRuntimeInstallRequest {
  workspacePath: string;
  input: SttProviderSetupInput;
  action: SttProviderSetupResult["action"];
  runtimeCandidates: SttProviderRuntimeCandidate[];
}

export type QwenRuntimeInstaller = (request: QwenRuntimeInstallRequest) => Promise<SttProviderRuntimeInstallResult>;

export async function setupQwen3AsrProvider(
  workspacePath: string,
  input: SttProviderSetupInput,
  options: SetupQwen3AsrProviderOptions = {},
): Promise<SttProviderSetupResult> {
  if (input.provider !== qwenProvider) throw new Error(`Unsupported STT provider setup target: ${input.provider}`);

  const action = input.action ?? "install";
  const workspace = resolve(workspacePath);
  const now = options.now ?? (() => new Date());
  let runtimeCandidates = collectQwenRuntimeCandidates(input.runtimeBinaryPath, {
    autoDetect: options.disableRuntimeAutoDetect !== true,
  });
  let runtimeInstall: SttProviderRuntimeInstallResult | undefined;
  const installStatuses = await ensureFirstPartyAmbientCliPackages(workspace, {
    packageNames: [qwenPackageName],
    ...(options.bundledPackageRootPath ? { bundledPackageRootPath: options.bundledPackageRootPath } : {}),
  });

  const failedInstall = installStatuses.find((status) => status.status === "failed");
  if (failedInstall) {
    const validation = await writeQwenValidationMetadata(workspace, {
      providerCapabilityId: undefined,
      status: "failed",
      updatedAt: now().toISOString(),
      platform: platform(),
      arch: arch(),
      lane: qwenRuntimeLane(),
      error: failedInstall.error ?? "Qwen3-ASR provider package install failed.",
      missingHints: ["Retry STT provider install/repair from Settings."],
    });
    return setupResult({
      action,
      status: "failed",
      installStatuses,
      providers: [],
      validation,
      runtimeCandidates,
      runtimeInstall,
      nextSteps: ["Retry STT provider install/repair from Settings."],
    });
  }

  let selectedRuntime = bestRuntimeCandidate(runtimeCandidates);
  if (!selectedRuntime?.available && shouldInstallQwenRuntime(input, action, options)) {
    runtimeInstall = await installQwenRuntime(workspace, input, action, runtimeCandidates, options);
    runtimeCandidates = collectQwenRuntimeCandidates(input.runtimeBinaryPath, {
      autoDetect: options.disableRuntimeAutoDetect !== true,
    });
    if (runtimeInstall.binaryPath) {
      runtimeCandidates = mergeRuntimeCandidates(runtimeCandidates, [runtimeCandidate(runtimeInstall.binaryPath, "installer")]);
    }
    selectedRuntime = bestRuntimeCandidate(runtimeCandidates);
  }
  if (selectedRuntime?.available) {
    await bindQwenRuntimeBinary(workspace, selectedRuntime.path);
  }

  const providers = await discoverAmbientCliSttProviders(workspace);
  const selectedProvider = selectQwenProvider(providers);
  const health: QwenHealthPayload = await readQwenHealth(workspace).catch((error) => ({
    available: false,
    reason: error instanceof Error ? error.message : String(error),
    missingHints: ["Retry STT provider install/repair from Settings."],
  } satisfies QwenHealthPayload));
  const providerCapabilityId = selectedProvider?.capabilityId;

  if (!health.available) {
    const missingHints = health.missingHints?.length
      ? health.missingHints
      : runtimeInstall?.missingHints?.length
        ? runtimeInstall.missingHints
        : defaultMissingRuntimeHints();
    const validation = await writeQwenValidationMetadata(workspace, {
      providerCapabilityId,
      status: "needs-runtime",
      updatedAt: now().toISOString(),
      platform: platform(),
      arch: arch(),
      lane: qwenRuntimeLane(),
      ...(health.runtime?.binary ? { binaryPath: health.runtime.binary } : {}),
      ...(health.runtime?.version ? { runtimeVersion: health.runtime.version } : {}),
      ...(health.runtime?.model ? { model: health.runtime.model } : {}),
      ...(health.runtime?.modelSource ? { modelSource: health.runtime.modelSource } : {}),
      ...(health.assetManifest ? { assetManifest: health.assetManifest } : {}),
      error: health.reason ?? "Qwen3-ASR runtime is not available.",
      missingHints,
    });
    return setupResult({
      action,
      status: "needs-runtime",
      installStatuses,
      selectedProvider,
      providers: mergeSttProvidersWithValidation(providers, validation),
      validation,
      runtimeCandidates,
      runtimeInstall,
      nextSteps: missingRuntimeNextSteps(runtimeInstall, missingHints),
    });
  }

  if (input.validationAudioPath) {
    const validation = await validateQwenTranscription(workspace, input, selectedProvider, health, now);
    const status = validation.status === "passed" ? "ready" : "validation-failed";
    const nextSteps = validation.status === "passed"
      ? ["Select Qwen3-ASR as the Speech Input provider and enable push-to-talk when the UI is ready."]
      : ["Check the runtime binary and model assets, then run STT provider repair again."];
    return setupResult({
      action,
      status,
      installStatuses,
      selectedProvider,
      providers: mergeSttProvidersWithValidation(providers, validation),
      validation,
      runtimeCandidates,
      runtimeInstall,
      nextSteps,
    });
  }

  const validation = await writeQwenValidationMetadata(workspace, {
    providerCapabilityId,
    status: "runtime-ready",
    updatedAt: now().toISOString(),
    platform: platform(),
    arch: arch(),
    lane: qwenRuntimeLane(),
    ...(health.runtime?.binary ? { binaryPath: health.runtime.binary } : {}),
    ...(health.runtime?.version ? { runtimeVersion: health.runtime.version } : {}),
    ...(health.runtime?.model ? { model: health.runtime.model } : {}),
    ...(health.runtime?.modelSource ? { modelSource: health.runtime.modelSource } : {}),
    ...(health.assetManifest ? { assetManifest: health.assetManifest } : {}),
    missingHints: [],
  });
  return setupResult({
    action,
    status: "ready",
    installStatuses,
    selectedProvider,
    providers: mergeSttProvidersWithValidation(providers, validation),
    validation,
    runtimeCandidates,
    runtimeInstall,
    nextSteps: ["Run a validation transcription from Settings once microphone capture is available."],
  });
}

export async function readQwen3AsrValidationMetadata(workspacePath: string): Promise<SttProviderValidationMetadata | undefined> {
  const path = resolveValidationMetadataPath(workspacePath);
  if (!existsSync(path)) return undefined;
  try {
    return normalizeValidationMetadata(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return undefined;
  }
}

export function mergeSttProvidersWithValidation(
  providers: SttProviderCandidate[],
  validation: SttProviderValidationMetadata | undefined,
): SttProviderCandidate[] {
  if (!validation) return providers;
  return providers.map((provider) => {
    if (provider.packageName !== validation.packageName) return provider;
    return {
      ...provider,
      validation,
      diagnostics: {
        ...(provider.diagnostics ?? { healthStatus: "unknown", missingHints: [] }),
        validation,
      },
    };
  });
}

async function validateQwenTranscription(
  workspacePath: string,
  input: SttProviderSetupInput,
  selectedProvider: SttProviderCandidate | undefined,
  health: QwenHealthPayload,
  now: () => Date,
): Promise<SttProviderValidationMetadata> {
  if (!selectedProvider) {
    return writeQwenValidationMetadata(workspacePath, {
      providerCapabilityId: undefined,
      status: "failed",
      updatedAt: now().toISOString(),
      platform: platform(),
      arch: arch(),
      lane: qwenRuntimeLane(),
      ...(health.assetManifest ? { assetManifest: health.assetManifest } : {}),
      error: "Qwen3-ASR provider package is installed but no STT provider descriptor was discovered.",
      missingHints: ["Reinstall the bundled Qwen3-ASR provider package."],
    });
  }

  try {
    const audioPath = resolve(workspacePath, input.validationAudioPath ?? "");
    const audioStat = await stat(audioPath);
    if (!audioStat.isFile()) throw new Error(`Validation audio path is not a file: ${input.validationAudioPath}`);
    if (!isPathInside(workspacePath, audioPath)) throw new Error("Validation audio path must stay inside the workspace.");
    const state = await transcribeWithAmbientCliSttProvider({
      workspacePath,
      threadId: "stt-validation",
      utteranceId: `qwen3-asr-${Date.now().toString(36)}`,
      audioPath,
      settings: {
        enabled: true,
        providerCapabilityId: selectedProvider.capabilityId,
        spokenLanguage: input.spokenLanguage?.trim() || selectedProvider.defaultLanguage || "English",
        mode: "push-to-talk",
        autoSendAfterTranscription: false,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: {
          enabled: false,
          rmsThresholdDbfs: -55,
        },
        bargeIn: {
          stopTtsOnSpeech: true,
          queueWhileAgentRuns: true,
        },
      },
      runner: runAmbientCliPackageCommand,
      now,
    });
    return writeQwenValidationMetadata(workspacePath, {
      providerCapabilityId: selectedProvider.capabilityId,
      status: "passed",
      updatedAt: now().toISOString(),
      platform: platform(),
      arch: arch(),
      lane: qwenRuntimeLane(),
      ...(health.runtime?.binary ? { binaryPath: health.runtime.binary } : {}),
      ...(health.runtime?.version ? { runtimeVersion: health.runtime.version } : {}),
      ...(health.runtime?.model ? { model: health.runtime.model } : {}),
      ...(health.runtime?.modelSource ? { modelSource: health.runtime.modelSource } : {}),
      ...(health.assetManifest ? { assetManifest: health.assetManifest } : {}),
      validationAudioPath: toWorkspaceRelativePath(workspacePath, audioPath),
      validationTranscript: state.text,
      ...(state.durationMs !== undefined ? { durationMs: state.durationMs } : {}),
      missingHints: [],
    });
  } catch (error) {
    return writeQwenValidationMetadata(workspacePath, {
      providerCapabilityId: selectedProvider.capabilityId,
      status: "failed",
      updatedAt: now().toISOString(),
      platform: platform(),
      arch: arch(),
      lane: qwenRuntimeLane(),
      ...(health.runtime?.binary ? { binaryPath: health.runtime.binary } : {}),
      ...(health.runtime?.version ? { runtimeVersion: health.runtime.version } : {}),
      ...(health.runtime?.model ? { model: health.runtime.model } : {}),
      ...(health.runtime?.modelSource ? { modelSource: health.runtime.modelSource } : {}),
      ...(health.assetManifest ? { assetManifest: health.assetManifest } : {}),
      error: error instanceof Error ? error.message : String(error),
      missingHints: ["Check that the selected microphone/test WAV contains speech and that Qwen3-ASR model assets are reachable."],
    });
  }
}

async function readQwenHealth(workspacePath: string): Promise<QwenHealthPayload> {
  const result = await runAmbientCliPackageCommand(workspacePath, {
    packageName: qwenPackageName,
    command: qwenCommandName,
    args: ["--health"],
  });
  const payload = parseJsonObject(result.stdout, "Qwen3-ASR health output") as QwenHealthPayload;
  return {
    providerId: stringValue(payload.providerId),
    available: typeof payload.available === "boolean" ? payload.available : false,
    reason: stringValue(payload.reason),
    runtime: {
      binary: stringValue(payload.runtime?.binary),
      version: stringValue(payload.runtime?.version),
      model: stringValue(payload.runtime?.model),
      modelSource: stringValue(payload.runtime?.modelSource),
    },
    assetManifest: normalizeQwenAssetManifestSummary(payload.assetManifest),
    missingHints: Array.isArray(payload.missingHints) ? payload.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim())) : [],
  };
}

async function bindQwenRuntimeBinary(workspacePath: string, binaryPath: string): Promise<void> {
  const envPath = resolve(workspacePath, runtimeEnvRoot, `${runtimeBinaryEnvName}.value`);
  if (!isPathInside(workspacePath, envPath)) throw new Error("Resolved Qwen3-ASR runtime env path is outside the workspace.");
  await mkdir(dirname(envPath), { recursive: true });
  await writeFile(envPath, `${binaryPath.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  await setAmbientCliPackageEnvBinding(workspacePath, {
    packageName: qwenPackageName,
    envName: runtimeBinaryEnvName,
    filePath: `./${toWorkspaceRelativePath(workspacePath, envPath)}`,
  });
}

function shouldInstallQwenRuntime(
  input: SttProviderSetupInput,
  action: SttProviderSetupResult["action"],
  options: SetupQwen3AsrProviderOptions,
): boolean {
  return options.disableRuntimeInstall !== true && input.installRuntime === true && action !== "validate";
}

async function installQwenRuntime(
  workspacePath: string,
  input: SttProviderSetupInput,
  action: SttProviderSetupResult["action"],
  runtimeCandidates: SttProviderRuntimeCandidate[],
  options: SetupQwen3AsrProviderOptions,
): Promise<SttProviderRuntimeInstallResult> {
  const installer = options.runtimeInstaller ?? installQwenRuntimeWithHostPackageManager;
  try {
    return await installer({ workspacePath, input, action, runtimeCandidates });
  } catch (error) {
    return {
      attempted: true,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      missingHints: defaultMissingRuntimeHints(),
    };
  }
}

async function installQwenRuntimeWithHostPackageManager(
  request: QwenRuntimeInstallRequest,
): Promise<SttProviderRuntimeInstallResult> {
  const existingCandidates = mergeRuntimeCandidates(request.runtimeCandidates, collectQwenRuntimeCandidates(request.input.runtimeBinaryPath, { autoDetect: true }));
  const existingRuntime = bestRuntimeCandidate(existingCandidates);
  if (existingRuntime?.available) {
    return {
      attempted: false,
      status: "already-installed",
      binaryPath: existingRuntime.path,
      missingHints: [],
    };
  }

  if (platform() !== "darwin" || arch() !== "arm64") {
    return {
      attempted: false,
      status: "unsupported",
      error: "Automatic Qwen3-ASR runtime install is currently implemented for macOS arm64 via Homebrew.",
      missingHints: defaultMissingRuntimeHints(),
    };
  }

  const brewPath = commandPath("brew");
  if (!brewPath) {
    return {
      attempted: false,
      status: "skipped",
      manager: "homebrew",
      packageName: homebrewQwenRuntimePackage,
      error: "Homebrew was not found on PATH, so Ambient could not install llama.cpp automatically.",
      missingHints: [
        "Install Homebrew and run STT provider repair again, or install llama.cpp yourself.",
        "Use STT provider repair to bind AMBIENT_QWEN3_ASR_BINARY to an existing llama-mtmd-cli path.",
      ],
    };
  }

  const existingHomebrewBinary = homebrewRuntimeBinaryPath(brewPath);
  if (existingHomebrewBinary) {
    return {
      attempted: false,
      status: "already-installed",
      manager: "homebrew",
      packageName: homebrewQwenRuntimePackage,
      binaryPath: existingHomebrewBinary,
      missingHints: [],
    };
  }

  const install = runHostCommand(brewPath, ["install", homebrewQwenRuntimePackage], { timeoutMs: homebrewInstallTimeoutMs });
  const binaryPath = homebrewRuntimeBinaryPath(brewPath);
  if (install.status === 0 && binaryPath) {
    return {
      attempted: true,
      status: "installed",
      manager: "homebrew",
      packageName: homebrewQwenRuntimePackage,
      command: install.command,
      binaryPath,
      stdoutPreview: textPreview(install.stdout),
      stderrPreview: textPreview(install.stderr),
      durationMs: install.durationMs,
      missingHints: [],
    };
  }

  const error =
    install.status === 0
      ? "Homebrew installed llama.cpp, but Ambient could not find llama-mtmd-cli under the Homebrew package prefix."
      : install.error ?? (install.stderr.trim() || install.stdout.trim() || `Homebrew exited with status ${install.status}.`);
  return {
    attempted: true,
    status: "failed",
    manager: "homebrew",
    packageName: homebrewQwenRuntimePackage,
    command: install.command,
    stdoutPreview: textPreview(install.stdout),
    stderrPreview: textPreview(install.stderr),
    durationMs: install.durationMs,
    error,
    missingHints: [
      "Install a llama.cpp build that includes llama-mtmd-cli.",
      "Use STT provider repair to bind AMBIENT_QWEN3_ASR_BINARY to the installed llama-mtmd-cli path.",
    ],
  };
}

function homebrewRuntimeBinaryPath(brewPath = commandPath("brew")): string | undefined {
  if (!brewPath) return undefined;
  for (const prefix of homebrewRuntimePrefixes(brewPath)) {
    const binaryPath = join(prefix, "bin", "llama-mtmd-cli");
    if (existsSync(binaryPath)) return binaryPath;
  }
  return undefined;
}

function homebrewRuntimePrefixes(brewPath = commandPath("brew")): string[] {
  const prefixes = new Set<string>();
  if (brewPath) {
    const result = runHostCommand(brewPath, ["--prefix", homebrewQwenRuntimePackage], { timeoutMs: 10_000 });
    if (result.status === 0) {
      for (const line of result.stdout.trim().split(/\r?\n/)) {
        if (line.trim()) prefixes.add(line.trim());
      }
    }
  }
  prefixes.add("/opt/homebrew/opt/llama.cpp");
  prefixes.add("/usr/local/opt/llama.cpp");
  return Array.from(prefixes);
}

async function writeQwenValidationMetadata(
  workspacePath: string,
  input: Omit<SttProviderValidationMetadata, "schemaVersion" | "provider" | "packageName">,
): Promise<SttProviderValidationMetadata> {
  const path = resolveValidationMetadataPath(workspacePath);
  const metadata: SttProviderValidationMetadata = {
    schemaVersion: validationSchemaVersion,
    provider: qwenProvider,
    packageName: qwenPackageName,
    ...input,
    missingHints: input.missingHints ?? [],
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

function resolveValidationMetadataPath(workspacePath: string): string {
  const workspace = resolve(workspacePath);
  const path = resolve(workspace, validationMetadataPath);
  if (!isPathInside(workspace, path)) throw new Error("Resolved STT validation metadata path is outside the workspace.");
  return path;
}

function collectQwenRuntimeCandidates(userPath: string | undefined, options: { autoDetect: boolean }): SttProviderRuntimeCandidate[] {
  const candidates: SttProviderRuntimeCandidate[] = [];
  if (userPath?.trim()) candidates.push(runtimeCandidate(resolve(userPath.trim()), "user"));

  const configured = process.env[runtimeBinaryEnvName]?.trim();
  if (configured) {
    const configuredPath = configured.includes("/") || configured.includes("\\") ? resolve(configured) : configured;
    candidates.push(runtimeCandidate(configuredPath, "process-env"));
  }

  if (options.autoDetect) {
    const pathCommand = commandPath("llama-mtmd-cli");
    if (pathCommand) candidates.push(runtimeCandidate(pathCommand, "path"));
    for (const known of knownRuntimePaths()) candidates.push(runtimeCandidate(known, "known-location"));
  }

  return mergeRuntimeCandidates(candidates, []);
}

function mergeRuntimeCandidates(
  candidates: SttProviderRuntimeCandidate[],
  additional: SttProviderRuntimeCandidate[],
): SttProviderRuntimeCandidate[] {
  const unique = new Map<string, SttProviderRuntimeCandidate>();
  for (const candidate of [...candidates, ...additional]) {
    if (!unique.has(candidate.path)) unique.set(candidate.path, candidate);
  }
  return Array.from(unique.values());
}

function runtimeCandidate(path: string, source: SttProviderRuntimeCandidate["source"]): SttProviderRuntimeCandidate {
  if (!path.includes("/") && !path.includes("\\")) {
    const resolvedCommand = commandPath(path);
    return resolvedCommand
      ? { path: resolvedCommand, source, available: true }
      : { path, source, available: false, reason: `${path} was not found on PATH.` };
  }
  return existsSync(path)
    ? { path, source, available: true }
    : { path, source, available: false, reason: `${basename(path)} was not found at ${path}.` };
}

function bestRuntimeCandidate(candidates: SttProviderRuntimeCandidate[]): SttProviderRuntimeCandidate | undefined {
  return candidates.find((candidate) => candidate.available);
}

function knownRuntimePaths(): string[] {
  const home = homedir();
  if (platform() === "darwin") {
    return [
      "/opt/homebrew/bin/llama-mtmd-cli",
      "/usr/local/bin/llama-mtmd-cli",
      ...homebrewRuntimePrefixes().map((prefix) => join(prefix, "bin", "llama-mtmd-cli")),
      join(home, ".local/bin/llama-mtmd-cli"),
    ];
  }
  if (platform() === "win32") {
    return [
      join(home, "AppData/Local/Programs/llama.cpp/llama-mtmd-cli.exe"),
      "C:/Program Files/llama.cpp/llama-mtmd-cli.exe",
    ];
  }
  return [
    "/usr/local/bin/llama-mtmd-cli",
    "/usr/bin/llama-mtmd-cli",
    join(home, ".local/bin/llama-mtmd-cli"),
  ];
}

function commandPath(command: string): string | undefined {
  const result = platform() === "win32"
    ? spawnSync("where", [command], { encoding: "utf8" })
    : spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  return result.stdout.trim().split(/\r?\n/).find(Boolean);
}

function runHostCommand(command: string, args: string[], options: { timeoutMs?: number } = {}): {
  command: string[];
  status: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
} {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: hostCommandMaxBuffer,
    ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
  });
  return {
    command: [command, ...args],
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Date.now() - startedAt,
    ...(result.error ? { error: result.error.message } : {}),
  };
}

function textPreview(value: string, maxLength = 4000): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function qwenRuntimeLane(): string {
  if (platform() === "darwin" && arch() === "arm64") return "macos-arm64-metal";
  if (platform() === "darwin") return `macos-${arch()}-cpu`;
  if (platform() === "linux" && arch() === "x64" && commandPath("nvidia-smi")) return "linux-x64-nvidia-cuda";
  if (platform() === "linux") return `linux-${arch()}-cpu`;
  if (platform() === "win32") return `windows-${arch()}-unvalidated`;
  return `${platform()}-${arch()}-unknown`;
}

function selectQwenProvider(providers: SttProviderCandidate[]): SttProviderCandidate | undefined {
  return providers.find((provider) => provider.packageName === qwenPackageName && provider.command === qwenCommandName);
}

function setupResult(input: {
  action: SttProviderSetupResult["action"];
  status: SttProviderSetupResult["status"];
  installStatuses: FirstPartyAmbientCliPackageInstallStatus[];
  selectedProvider?: SttProviderCandidate;
  providers: SttProviderCandidate[];
  validation: SttProviderValidationMetadata;
  runtimeCandidates: SttProviderRuntimeCandidate[];
  runtimeInstall?: SttProviderRuntimeInstallResult;
  nextSteps: string[];
}): SttProviderSetupResult {
  return {
    provider: qwenProvider,
    action: input.action,
    status: input.status,
    packageName: qwenPackageName,
    installStatuses: input.installStatuses,
    ...(input.runtimeInstall ? { runtimeInstall: input.runtimeInstall } : {}),
    ...(input.selectedProvider ? { selectedProvider: withValidation(input.selectedProvider, input.validation) } : {}),
    providers: input.providers,
    validation: input.validation,
    runtimeCandidates: input.runtimeCandidates,
    nextSteps: input.nextSteps,
  };
}

function withValidation(provider: SttProviderCandidate, validation: SttProviderValidationMetadata): SttProviderCandidate {
  return mergeSttProvidersWithValidation([provider], validation)[0] ?? provider;
}

function normalizeValidationMetadata(input: unknown): SttProviderValidationMetadata | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = input as SttProviderValidationMetadata;
  if (value.schemaVersion !== validationSchemaVersion || value.provider !== qwenProvider || value.packageName !== qwenPackageName) return undefined;
  return {
    schemaVersion: validationSchemaVersion,
    provider: qwenProvider,
    packageName: qwenPackageName,
    providerCapabilityId: stringValue(value.providerCapabilityId),
    status: ["not-run", "runtime-ready", "passed", "needs-runtime", "failed"].includes(value.status) ? value.status : "failed",
    updatedAt: stringValue(value.updatedAt) ?? new Date(0).toISOString(),
    platform: stringValue(value.platform) ?? "unknown",
    arch: stringValue(value.arch) ?? "unknown",
    lane: stringValue(value.lane) ?? "unknown",
    binaryPath: stringValue(value.binaryPath),
    runtimeVersion: stringValue(value.runtimeVersion),
    model: stringValue(value.model),
    modelSource: stringValue(value.modelSource),
    assetManifest: normalizeQwenAssetManifestSummary(value.assetManifest),
    validationAudioPath: stringValue(value.validationAudioPath),
    validationTranscript: stringValue(value.validationTranscript),
    durationMs: typeof value.durationMs === "number" ? value.durationMs : undefined,
    error: stringValue(value.error),
    missingHints: Array.isArray(value.missingHints) ? value.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim())) : [],
  };
}

function normalizeQwenAssetManifestSummary(input: unknown): SttProviderAssetManifestSummary | undefined {
  if (!isRecord(input) || input.schemaVersion !== "ambient-stt-qwen3-asr-assets-v1") return undefined;
  const version = stringValue(input.version);
  const model = isRecord(input.model) ? input.model : undefined;
  const runtime = isRecord(input.runtime) ? input.runtime : undefined;
  const id = stringValue(model?.id);
  const repo = stringValue(model?.repo);
  const revision = stringValue(model?.revision);
  const modelFiles = model?.files;
  const files = Array.isArray(modelFiles)
    ? modelFiles.map(normalizeQwenAssetFileSummary).filter((file): file is SttProviderAssetFileSummary => Boolean(file))
    : [];
  const directDownloadsEnabled = typeof runtime?.directDownloadsEnabled === "boolean" ? runtime.directDownloadsEnabled : undefined;
  const runtimeLanes = runtime?.lanes;
  const lanes = Array.isArray(runtimeLanes) ? runtimeLanes.filter((lane): lane is string => typeof lane === "string" && Boolean(lane.trim())) : [];
  if (!version || !id || !repo || !revision || !files.length || directDownloadsEnabled === undefined) return undefined;
  return {
    schemaVersion: "ambient-stt-qwen3-asr-assets-v1",
    version,
    model: {
      id,
      repo,
      revision,
      files,
    },
    runtime: {
      directDownloadsEnabled,
      lanes,
    },
  };
}

function normalizeQwenAssetFileSummary(input: unknown): SttProviderAssetFileSummary | undefined {
  if (!isRecord(input)) return undefined;
  const role = input.role;
  if (role !== "model" && role !== "mmproj" && role !== "runtime") return undefined;
  const filename = stringValue(input.filename);
  const sizeBytes = typeof input.sizeBytes === "number" && Number.isInteger(input.sizeBytes) && input.sizeBytes > 0 ? input.sizeBytes : undefined;
  const sha256 = stringValue(input.sha256);
  if (!filename || sizeBytes === undefined || !sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) return undefined;
  return {
    role,
    filename,
    sizeBytes,
    sha256,
  };
}

function parseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
  if (!value?.trim()) throw new Error(`${label} was empty.`);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`);
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultMissingRuntimeHints(): string[] {
  return [
    "Install a llama.cpp build that includes llama-mtmd-cli.",
    "Use STT provider repair to bind AMBIENT_QWEN3_ASR_BINARY to an existing llama-mtmd-cli path.",
  ];
}

function missingRuntimeNextSteps(runtimeInstall: SttProviderRuntimeInstallResult | undefined, fallbackHints: string[]): string[] {
  const details = runtimeInstall?.error ? [`Runtime install ${runtimeInstall.status}: ${runtimeInstall.error}`] : [];
  const hints = runtimeInstall?.missingHints?.length ? runtimeInstall.missingHints : fallbackHints;
  return [...details, ...hints];
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
