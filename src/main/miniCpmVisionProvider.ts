import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { arch, homedir, platform } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import JSZip from "jszip";
import type {
  MiniCpmVisionAnalysisCommandSummary,
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionCleanupResult,
  MiniCpmVisionDiagnosticItem,
  MiniCpmVisionImageInputReference,
  MiniCpmVisionImageSummary,
  MiniCpmVisionObservation,
  MiniCpmVisionRuntimeReleaseArtifact,
  MiniCpmVisionRuntimeReleaseManifest,
  MiniCpmVisionRuntimeReleaseManifestCheck,
  MiniCpmVisionRuntimeReleaseManifestVerification,
  MiniCpmVisionRuntimeCandidate,
  MiniCpmVisionRuntimeContract,
  MiniCpmVisionRuntimeInstallResult,
  MiniCpmVisionRuntimeMacosSecurity,
  MiniCpmVisionRuntimePreflightCheck,
  MiniCpmVisionRuntimeState,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
  MiniCpmVisionTask,
  MiniCpmVisionValidationMetadata,
  MiniCpmVisionVideoInputReference,
  MiniCpmVisionVideoSummary,
} from "../shared/types";
import { miniCpmVisionDiagnosticsForFailure } from "../shared/miniCpmVisionDiagnostics";
import { miniCpmRemoteEndpointBlockedMessage } from "../shared/miniCpmRemoteEndpointSecurity";
import { localLlamaManagedRuntimeDownloadEligibility, selectLocalLlamaRuntimeArtifact } from "./localLlamaRuntimeManifest";
import { miniCpmRuntimeReleaseManifestPrototype, verifyMiniCpmRuntimeReleaseManifest } from "./miniCpmRuntimeManifest";
import {
  discoverAmbientCliPackages,
  ensureFirstPartyAmbientCliPackages,
  removeAmbientCliPackageEnvBindings,
  runAmbientCliPackageCommand,
  setAmbientCliPackageEnvBinding,
  uninstallAmbientCliPackageSource,
  type AmbientCliRunResult,
  type FirstPartyAmbientCliPackageInstallStatus,
} from "./ambientCliPackages";
import { isPathInside } from "./sessionPaths";
import { managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "./managedInstallPaths";

const provider = "minicpm-v" as const;
const packageName = "ambient-minicpm-v-vision";
const validationSchemaVersion = "ambient-minicpm-v-provider-validation-v1";
const validationMetadataPath = ".ambient/vision/minicpm-v/validation.json";
const stateDirPath = ".ambient/vision/minicpm-v/state";
const analysisRootPath = ".ambient/vision/minicpm-v/analysis";
const inputRootPath = ".ambient/vision/minicpm-v/inputs";
const frameRootPath = ".ambient/vision/minicpm-v/frames";
const runtimeEnvRoot = ".ambient/vision/minicpm-v/env";
const runtimeDownloadRootPath = ".ambient/vision/minicpm-v/runtime";
const runtimeDownloadArchiveRoot = ".downloads";
const runtimeBinaryEnvName = "AMBIENT_MINICPM_V_LLAMA_SERVER";
const endpointEnvName = "AMBIENT_MINICPM_V_ENDPOINT";
const cleanupPaths = [stateDirPath, runtimeEnvRoot, runtimeDownloadRootPath, inputRootPath, frameRootPath, analysisRootPath] as const;
const maxImageBytes = 15 * 1024 * 1024;
const maxVideoBytes = 100 * 1024 * 1024;
const maxFrameTimestampMs = 120_000;
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);

async function miniCpmManagedRuntimeWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, runtimeDownloadRootPath);
  return managedInstallWorkspacePath(workspacePath);
}

interface MiniCpmVisionStatusPayload {
  providerId?: string;
  available?: boolean;
  status?: string;
  reason?: string;
  runtime?: {
    binary?: string;
    binaryAvailable?: boolean;
    version?: string;
    defaultModel?: string;
    experimentalModel?: string;
  };
  endpoint?: string;
  endpointMode?: "managed-local-server" | "existing-local-endpoint";
  endpointModelIds?: string[];
  server?: {
    pid?: number;
    previousPid?: number;
    running?: boolean;
    host?: string;
    port?: number;
    startedAt?: string;
    stoppedAt?: string;
    logPath?: string;
    stderrPath?: string;
  };
  runtimeContract?: MiniCpmVisionRuntimeContract;
  missingHints?: string[];
}

interface MiniCpmVisionCliPreview {
  providerId?: string;
  status?: string;
  model?: string;
  latencyMs?: number;
  summary?: string;
  observations?: MiniCpmVisionObservation[];
  limitations?: string[];
  image?: {
    basename?: string;
    bytes?: number;
    sha256?: string;
  };
  artifacts?: {
    jsonPath?: string;
  };
}

interface MiniCpmVisionFullArtifact {
  endpoint?: string;
  schemaValidation?: {
    valid?: boolean;
    errors?: string[];
  };
  artifacts?: {
    jsonPath?: string;
    previewJsonPath?: string;
  };
}

export interface SetupMiniCpmVisionProviderOptions {
  bundledPackageRootPath?: string;
  disableRuntimeAutoDetect?: boolean;
  runtimeReleaseManifest?: MiniCpmVisionRuntimeReleaseManifest;
  runtimeDownloadPreResponseTimeoutMs?: number;
  runtimeDownloadIdleTimeoutMs?: number;
  now?: () => Date;
  signal?: AbortSignal;
  onProgress?: (event: MiniCpmVisionProgressEvent) => void;
}

export interface AnalyzeMiniCpmVisionInputOptions extends SetupMiniCpmVisionProviderOptions {
  persistBindings?: boolean;
}

export interface MiniCpmVisionProgressEvent {
  phase:
    | "package"
    | "setup"
    | "runtime"
    | "prepare-input"
    | "start"
    | "analyze"
    | "stop"
    | "complete";
  message: string;
  command?: "minicpm_vision_status" | "minicpm_vision_start" | "minicpm_vision_analyze" | "minicpm_vision_stop";
  elapsedMs?: number;
}

export async function setupMiniCpmVisionProvider(
  workspacePath: string,
  input: MiniCpmVisionSetupInput,
  options: SetupMiniCpmVisionProviderOptions = {},
): Promise<MiniCpmVisionSetupResult> {
  if (input.provider !== provider) throw new Error(`Unsupported MiniCPM-V provider setup target: ${input.provider}`);

  const action = input.action ?? "install";
  const workspace = resolve(workspacePath);
  const now = options.now ?? (() => new Date());
  throwIfAborted(options.signal);
  emitMiniCpmVisionProgress(options, {
    phase: "setup",
    message: `MiniCPM-V setup ${action} is starting.`,
  });
  if (action === "uninstall") {
    return uninstallMiniCpmVisionProvider(workspace, input, { now });
  }
  if (action === "stop") {
    return stopMiniCpmVisionProvider(workspace, input, { now, signal: options.signal });
  }
  emitMiniCpmVisionProgress(options, {
    phase: "package",
    message: "Checking MiniCPM-V provider package.",
  });
  const installStatuses = await ensureMiniCpmVisionPackage(workspace, options);
  throwIfAborted(options.signal);
  emitMiniCpmVisionProgress(options, {
    phase: "package",
    message: "MiniCPM-V provider package check completed.",
  });
  const requestedEndpointUrl = input.endpointUrl?.trim() ? normalizeMiniCpmLocalEndpointUrl(input.endpointUrl) : undefined;
  const requestedRuntimeBinaryPath = input.runtimeBinaryPath?.trim();
  const requestedRuntimeArchivePath = input.runtimeArchivePath?.trim();
  const requestedRuntimeModes = [requestedEndpointUrl, requestedRuntimeBinaryPath, requestedRuntimeArchivePath].filter(Boolean);
  if (requestedRuntimeModes.length > 1) {
    throw new Error("MiniCPM-V setup accepts one runtime source: endpointUrl, runtimeBinaryPath, or runtimeArchivePath.");
  }
  const shouldInstallDefaultManagedRuntime = !requestedEndpointUrl
    && !requestedRuntimeBinaryPath
    && !requestedRuntimeArchivePath
    && action !== "validate"
    && input.installRuntime !== false;
  const failedInstall = installStatuses.find((status) => status.status === "failed");
  if (failedInstall) {
    const runtimeCandidates = requestedEndpointUrl
      ? []
      : collectMiniCpmRuntimeCandidates(workspace, input.runtimeBinaryPath, {
          autoDetect: options.disableRuntimeAutoDetect !== true,
          manifest: options.runtimeReleaseManifest,
          includeManagedRuntime: true,
        });
    const runtimeContract = buildMiniCpmRuntimeContract({ configuredEndpointUrl: requestedEndpointUrl, runtimeCandidates });
    const error = failedInstall.error ?? "MiniCPM-V provider package install failed.";
    const missingHints = ["Retry MiniCPM-V visual provider install/repair from Settings."];
    const diagnostics = miniCpmVisionDiagnosticsForFailure({
      setupStatus: "failed",
      validationStatus: "failed",
      error,
      missingHints,
      runtimeCandidates,
    });
    const validation = await writeMiniCpmValidationMetadata(workspace, {
      status: "failed",
      updatedAt: now().toISOString(),
      platform: platform(),
      arch: arch(),
      lane: miniCpmRuntimeLane(),
      error,
      missingHints,
      diagnostics,
      runtimeContract,
    });
    return setupResult({ action, status: "failed", installStatuses, validation, runtimeCandidates, nextSteps: validation.missingHints });
  }
  let runtimeInstall: MiniCpmVisionRuntimeInstallResult | undefined;
  let managedRuntimeCandidate: MiniCpmVisionRuntimeCandidate | undefined;
  const explicitRuntimeInstall = Boolean(requestedRuntimeArchivePath);
  if (requestedRuntimeArchivePath || shouldInstallDefaultManagedRuntime) {
    emitMiniCpmVisionProgress(options, {
      phase: "runtime",
      message: requestedRuntimeArchivePath
        ? "Installing MiniCPM-V runtime from approved archive."
        : "Checking MiniCPM-V managed runtime install.",
    });
    runtimeInstall = requestedRuntimeArchivePath
      ? await installMiniCpmManagedRuntimeFromArchive(workspace, {
          archivePath: requestedRuntimeArchivePath,
          artifactId: input.runtimeArtifactId,
          manifest: options.runtimeReleaseManifest,
          now,
        })
      : await installMiniCpmManagedRuntimeFromDownload(workspace, {
          artifactId: input.runtimeArtifactId,
          manifest: options.runtimeReleaseManifest,
          now,
          preResponseTimeoutMs: options.runtimeDownloadPreResponseTimeoutMs,
          idleTimeoutMs: options.runtimeDownloadIdleTimeoutMs,
          signal: options.signal,
        });
    throwIfAborted(options.signal);
    emitMiniCpmVisionProgress(options, {
      phase: "runtime",
      message: "MiniCPM-V runtime install check completed.",
    });
    const runtimeInstallBlocksSetup = runtimeInstall.status === "failed"
      || (explicitRuntimeInstall && (runtimeInstall.status === "unsupported" || !runtimeInstall.binaryPath))
      || (!explicitRuntimeInstall && runtimeInstall.status !== "unsupported" && !runtimeInstall.binaryPath);
    if (runtimeInstallBlocksSetup) {
      const runtimeCandidates: MiniCpmVisionRuntimeCandidate[] = [];
      const runtimeContract = buildMiniCpmRuntimeContract({ runtimeCandidates });
      const missingHints = runtimeInstall.missingHints.length
        ? runtimeInstall.missingHints
        : ["Choose a pinned MiniCPM-V runtime archive for the current platform and run Repair again."];
      const error = runtimeInstall.error ?? "MiniCPM-V managed runtime archive install failed.";
      const diagnostics = miniCpmVisionDiagnosticsForFailure({
        setupStatus: "failed",
        validationStatus: "failed",
        error,
        missingHints,
        runtimeCandidates,
      });
      const validation = await writeMiniCpmValidationMetadata(workspace, {
        status: "failed",
        updatedAt: now().toISOString(),
        platform: platform(),
        arch: arch(),
        lane: miniCpmRuntimeLane(),
        error,
        missingHints,
        diagnostics,
        runtimeContract,
        runtimeInstall,
      });
      return setupResult({
        action,
        status: "failed",
        installStatuses,
        validation,
        runtimeCandidates,
        runtimeInstall,
        nextSteps: validation.missingHints,
      });
    }
    if (runtimeInstall.binaryPath) managedRuntimeCandidate = runtimeCandidate(runtimeInstall.binaryPath, "ambient-managed-runtime");
  }
  const previousEndpointBinding = readMiniCpmEndpointBinding(workspace);
  const configuredEndpointUrl = requestedEndpointUrl ?? (requestedRuntimeBinaryPath || requestedRuntimeArchivePath || shouldInstallDefaultManagedRuntime ? undefined : previousEndpointBinding);
  const usesExistingEndpoint = Boolean(configuredEndpointUrl);
  let runtimeCandidates = usesExistingEndpoint
    ? []
    : collectMiniCpmRuntimeCandidates(workspace, input.runtimeBinaryPath, {
        autoDetect: options.disableRuntimeAutoDetect !== true,
        manifest: options.runtimeReleaseManifest,
        includeManagedRuntime: true,
      });
  if (managedRuntimeCandidate) {
    runtimeCandidates = mergeRuntimeCandidates([managedRuntimeCandidate], runtimeCandidates);
  }
  const selectedRuntime = managedRuntimeCandidate ?? bestRuntimeCandidate(runtimeCandidates);
  const runtimeEnvOverride = !usesExistingEndpoint
    ? {
        [endpointEnvName]: "",
        ...(selectedRuntime?.available ? { [runtimeBinaryEnvName]: selectedRuntime.path } : {}),
      }
    : undefined;

  if (!usesExistingEndpoint && selectedRuntime?.available) {
    runtimeCandidates = mergeRuntimeCandidates(runtimeCandidates, [runtimeCandidate(selectedRuntime.path, selectedRuntime.source)]);
  }

  const statusPayload: MiniCpmVisionStatusPayload = await readMiniCpmStatus(workspace, {
    endpointUrl: configuredEndpointUrl,
    env: runtimeEnvOverride,
    signal: options.signal,
  }).catch((error): MiniCpmVisionStatusPayload => {
    if (isAbortError(error) || options.signal?.aborted) throw error;
    return {
      available: false,
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
      missingHints: ["Retry MiniCPM-V visual provider install/repair from Settings."],
    };
  });
  const endpointReady = usesExistingEndpoint && statusPayload.available === true;
  const runtimeReady = Boolean(endpointReady || statusPayload.runtime?.binaryAvailable || selectedRuntime?.available);
  const runtimeContract = buildMiniCpmRuntimeContract({
    configuredEndpointUrl,
    selectedRuntime,
    runtimeCandidates,
    statusPayload,
  });
  const missingHints = statusPayload.missingHints?.length
    ? statusPayload.missingHints
    : usesExistingEndpoint
      ? defaultExistingEndpointHints()
      : defaultMissingRuntimeHints();

  if (!runtimeReady) {
    const error = statusPayload.reason ?? "MiniCPM-V llama-server runtime is not available.";
    const diagnostics = miniCpmVisionDiagnosticsForFailure({
      setupStatus: "needs-runtime",
      validationStatus: "needs-runtime",
      error,
      missingHints,
      runtimeCandidates,
    });
    const validation = await writeMiniCpmValidationMetadata(workspace, {
      status: "needs-runtime",
      updatedAt: now().toISOString(),
      platform: platform(),
      arch: arch(),
      lane: miniCpmRuntimeLane(),
      ...(!configuredEndpointUrl && statusPayload.runtime?.binary ? { binaryPath: statusPayload.runtime.binary } : {}),
      ...(statusPayload.runtime?.version ? { runtimeVersion: statusPayload.runtime.version } : {}),
      ...(statusPayload.runtime?.defaultModel ? { model: statusPayload.runtime.defaultModel } : {}),
      ...(statusPayload.runtime?.experimentalModel ? { experimentalModel: statusPayload.runtime.experimentalModel } : {}),
      ...(statusPayload.endpoint ? { endpoint: statusPayload.endpoint } : {}),
      ...(statusPayload.endpointMode ? { endpointMode: statusPayload.endpointMode } : {}),
      ...(statusPayload.endpointModelIds?.length ? { endpointModelIds: statusPayload.endpointModelIds } : {}),
      error,
      missingHints,
      diagnostics,
      runtimeContract,
      ...(runtimeInstall ? { runtimeInstall } : {}),
    });
    return setupResult({
      action,
      status: "needs-runtime",
      installStatuses,
      validation,
      runtimeCandidates,
      statusPayload: recordPayload(statusPayload),
      runtimeInstall,
      nextSteps: missingRuntimeNextSteps(missingHints),
    });
  }

  if (input.validationImagePath) {
    try {
      const result = await analyzeMiniCpmVisionInput(workspace, {
        imagePath: input.validationImagePath,
        task: input.validationTask ?? "ui_review",
        ...(input.validationPrompt ? { prompt: input.validationPrompt } : {}),
        ...(configuredEndpointUrl ? { endpointUrl: configuredEndpointUrl } : selectedRuntime?.path ? { runtimeBinaryPath: selectedRuntime.path } : {}),
        startServer: configuredEndpointUrl ? false : true,
        stopAfter: configuredEndpointUrl ? false : true,
      }, { ...options, persistBindings: false });
      throwIfAborted(options.signal);
      if (requestedEndpointUrl) {
        await bindMiniCpmEndpointUrl(workspace, requestedEndpointUrl);
      } else if (requestedRuntimeBinaryPath || requestedRuntimeArchivePath || shouldInstallDefaultManagedRuntime) {
        await clearMiniCpmEndpointBinding(workspace);
      }
      if (!configuredEndpointUrl && selectedRuntime?.available) {
        await bindMiniCpmRuntimeBinary(workspace, selectedRuntime.path);
      }
      const validation = await writeMiniCpmValidationMetadata(workspace, {
        status: "passed",
        updatedAt: now().toISOString(),
        platform: platform(),
        arch: arch(),
        lane: miniCpmRuntimeLane(),
        ...(!configuredEndpointUrl && statusPayload.runtime?.binary ? { binaryPath: statusPayload.runtime.binary } : !configuredEndpointUrl && selectedRuntime?.path ? { binaryPath: selectedRuntime.path } : {}),
        ...(statusPayload.runtime?.version ? { runtimeVersion: statusPayload.runtime.version } : {}),
        model: result.model ?? statusPayload.runtime?.defaultModel,
        experimentalModel: statusPayload.runtime?.experimentalModel,
        endpoint: result.endpoint ?? statusPayload.endpoint,
        ...(configuredEndpointUrl ? { endpointMode: "existing-local-endpoint" as const } : statusPayload.endpointMode ? { endpointMode: statusPayload.endpointMode } : {}),
        ...(statusPayload.endpointModelIds?.length ? { endpointModelIds: statusPayload.endpointModelIds } : {}),
        artifactPath: result.artifacts.jsonPath,
        image: result.image,
        summary: result.summary,
        durationMs: result.durationMs,
        missingHints: [],
        runtimeContract,
        ...(runtimeInstall ? { runtimeInstall } : {}),
      });
      return setupResult({
        action,
        status: "ready",
        installStatuses,
        validation,
        runtimeCandidates,
        statusPayload: recordPayload(statusPayload),
        runtimeInstall,
        nextSteps: ["MiniCPM-V visual analysis is ready for screenshots and local image attachments."],
      });
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const missingHints = ["Check the runtime binary, model cache, and validation image, then run MiniCPM-V provider repair again."];
      const diagnostics = miniCpmVisionDiagnosticsForFailure({
        setupStatus: "validation-failed",
        validationStatus: "failed",
        error: message,
        missingHints,
        runtimeCandidates,
      });
      const validation = await writeMiniCpmValidationMetadata(workspace, {
        status: "failed",
        updatedAt: now().toISOString(),
        platform: platform(),
        arch: arch(),
        lane: miniCpmRuntimeLane(),
        ...(!configuredEndpointUrl && statusPayload.runtime?.binary ? { binaryPath: statusPayload.runtime.binary } : !configuredEndpointUrl && selectedRuntime?.path ? { binaryPath: selectedRuntime.path } : {}),
        ...(statusPayload.runtime?.version ? { runtimeVersion: statusPayload.runtime.version } : {}),
        ...(statusPayload.runtime?.defaultModel ? { model: statusPayload.runtime.defaultModel } : {}),
        ...(statusPayload.runtime?.experimentalModel ? { experimentalModel: statusPayload.runtime.experimentalModel } : {}),
        ...(statusPayload.endpoint ? { endpoint: statusPayload.endpoint } : {}),
        ...(statusPayload.endpointMode ? { endpointMode: statusPayload.endpointMode } : {}),
        ...(statusPayload.endpointModelIds?.length ? { endpointModelIds: statusPayload.endpointModelIds } : {}),
        error: message,
        missingHints,
        diagnostics,
        runtimeContract,
        ...(runtimeInstall ? { runtimeInstall } : {}),
      });
      return setupResult({
        action,
        status: "validation-failed",
        installStatuses,
        validation,
        runtimeCandidates,
        statusPayload: recordPayload(statusPayload),
        runtimeInstall,
        nextSteps: validation.missingHints,
      });
    }
  }

  throwIfAborted(options.signal);
  if (requestedEndpointUrl) {
    await bindMiniCpmEndpointUrl(workspace, requestedEndpointUrl);
  } else if (requestedRuntimeBinaryPath || requestedRuntimeArchivePath || shouldInstallDefaultManagedRuntime) {
    await clearMiniCpmEndpointBinding(workspace);
  }
  if (!configuredEndpointUrl && selectedRuntime?.available) {
    await bindMiniCpmRuntimeBinary(workspace, selectedRuntime.path);
  }
  const validation = await writeMiniCpmValidationMetadata(workspace, {
    status: "runtime-ready",
    updatedAt: now().toISOString(),
    platform: platform(),
    arch: arch(),
    lane: miniCpmRuntimeLane(),
    ...(!configuredEndpointUrl && statusPayload.runtime?.binary ? { binaryPath: statusPayload.runtime.binary } : !configuredEndpointUrl && selectedRuntime?.path ? { binaryPath: selectedRuntime.path } : {}),
    ...(statusPayload.runtime?.version ? { runtimeVersion: statusPayload.runtime.version } : {}),
    ...(statusPayload.runtime?.defaultModel ? { model: statusPayload.runtime.defaultModel } : {}),
    ...(statusPayload.runtime?.experimentalModel ? { experimentalModel: statusPayload.runtime.experimentalModel } : {}),
    ...(statusPayload.endpoint ? { endpoint: statusPayload.endpoint } : {}),
    ...(statusPayload.endpointMode ? { endpointMode: statusPayload.endpointMode } : {}),
    ...(statusPayload.endpointModelIds?.length ? { endpointModelIds: statusPayload.endpointModelIds } : {}),
    missingHints: [],
    runtimeContract,
    ...(runtimeInstall ? { runtimeInstall } : {}),
  });
  return setupResult({
    action,
    status: "ready",
    installStatuses,
    validation,
    runtimeCandidates,
    statusPayload: recordPayload(statusPayload),
    runtimeInstall,
    nextSteps: configuredEndpointUrl
      ? ["Run a MiniCPM-V validation analysis from a screenshot or local image attachment before claiming the existing endpoint is fully active."]
      : ["Run a MiniCPM-V validation analysis from a screenshot or local image attachment."],
  });
}

export async function readMiniCpmVisionValidationMetadata(workspacePath: string): Promise<MiniCpmVisionValidationMetadata | undefined> {
  const path = resolveValidationMetadataPath(workspacePath);
  if (!existsSync(path)) return undefined;
  try {
    return normalizeMiniCpmValidationMetadata(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return undefined;
  }
}

async function uninstallMiniCpmVisionProvider(
  workspace: string,
  input: MiniCpmVisionSetupInput,
  options: { now: () => Date },
): Promise<MiniCpmVisionSetupResult> {
  const runtimeCandidates = collectMiniCpmRuntimeCandidates(workspace, input.runtimeBinaryPath, {
    autoDetect: false,
    includeManagedRuntime: false,
  });
  const runtimeContract = buildMiniCpmRuntimeContract({ runtimeCandidates });
  const cleanup = await cleanupMiniCpmVisionProvider(workspace);
  const cleanupFailed = cleanup.packageStatus === "failed" || cleanup.paths.some((path) => path.status === "failed");
  const missingHints = cleanupFailed
    ? ["MiniCPM-V cleanup hit an error. Review the cleanup receipt and retry Uninstall or Repair from Settings."]
    : [];
  const error = cleanupFailed
    ? [
        cleanup.packageError,
        ...cleanup.paths.filter((path) => path.status === "failed").map((path) => `${path.path}: ${path.error ?? "failed"}`),
      ].filter(Boolean).join("; ")
    : undefined;
  const diagnostics = cleanupFailed
    ? miniCpmVisionDiagnosticsForFailure({
        setupStatus: "failed",
        validationStatus: "failed",
        error,
        missingHints,
        runtimeCandidates,
      })
    : [];
  const validation = await writeMiniCpmValidationMetadata(workspace, {
    status: cleanupFailed ? "failed" : "uninstalled",
    updatedAt: options.now().toISOString(),
    platform: platform(),
    arch: arch(),
    lane: miniCpmRuntimeLane(),
    ...(error ? { error } : {}),
    missingHints,
    diagnostics,
    runtimeContract,
    cleanup,
  });
  return setupResult({
    action: "uninstall",
    status: cleanupFailed ? "failed" : "uninstalled",
    installStatuses: [],
    validation,
    runtimeCandidates,
    cleanup,
    nextSteps: cleanupFailed
      ? validation.missingHints
      : [
          "MiniCPM-V Ambient package state and managed visual-analysis cache were removed.",
          "User-managed llama-server binaries and external model caches were preserved.",
          "Run Install to add the provider again.",
        ],
  });
}

async function stopMiniCpmVisionProvider(
  workspace: string,
  input: MiniCpmVisionSetupInput,
  options: { now: () => Date; signal?: AbortSignal },
): Promise<MiniCpmVisionSetupResult> {
  const runtimeCandidates = collectMiniCpmRuntimeCandidates(workspace, input.runtimeBinaryPath, {
    autoDetect: false,
    includeManagedRuntime: true,
  });
  const installedPackage = await findInstalledMiniCpmPackage(workspace);
  const existingValidation = await readMiniCpmVisionValidationMetadata(workspace);
  const runtimeContract = existingValidation?.runtimeContract ?? buildMiniCpmRuntimeContract({ runtimeCandidates });
  const stopPayload = installedPackage
    ? await runMiniCpmCommand(workspace, {
        command: "minicpm_vision_stop",
        args: ["--state-dir", stateDirPath],
        timeoutMs: 60_000,
        signal: options.signal,
      }).then((result) => parseJsonObject(result.stdout ?? "", "MiniCPM-V stop output") as Record<string, unknown>)
    : {
        status: "not_running",
        reason: "MiniCPM-V provider package is not installed.",
      };
  const statusPayload = await readMiniCpmStatus(workspace, { signal: options.signal }).catch((error): MiniCpmVisionStatusPayload => ({
    available: false,
    status: stringValue(stopPayload.status) ?? "not_running",
    reason: stringValue(stopPayload.reason) ?? errorMessage(error),
    endpoint: stringValue(stopPayload.endpoint) ?? existingValidation?.endpoint,
    endpointMode: existingValidation?.endpointMode,
    server: {
      previousPid: numberValue(stopPayload.previousPid),
      running: false,
      stoppedAt: options.now().toISOString(),
    } as MiniCpmVisionStatusPayload["server"] & { previousPid?: number },
  }));
  const runtimeState = miniCpmRuntimeStateFromStatus(statusPayload, {
    now: options.now,
    previousPid: numberValue(stopPayload.previousPid),
    stoppedAt: options.now().toISOString(),
  });
  const validation = await writeMiniCpmValidationMetadata(workspace, {
    status: "stopped",
    updatedAt: options.now().toISOString(),
    platform: platform(),
    arch: arch(),
    lane: miniCpmRuntimeLane(),
    ...(existingValidation?.binaryPath ? { binaryPath: existingValidation.binaryPath } : {}),
    ...(statusPayload.runtime?.binary ? { binaryPath: statusPayload.runtime.binary } : {}),
    ...(statusPayload.runtime?.version ? { runtimeVersion: statusPayload.runtime.version } : existingValidation?.runtimeVersion ? { runtimeVersion: existingValidation.runtimeVersion } : {}),
    model: statusPayload.runtime?.defaultModel ?? existingValidation?.model,
    ...(statusPayload.runtime?.experimentalModel ? { experimentalModel: statusPayload.runtime.experimentalModel } : existingValidation?.experimentalModel ? { experimentalModel: existingValidation.experimentalModel } : {}),
    ...(statusPayload.endpoint ? { endpoint: statusPayload.endpoint } : stringValue(stopPayload.endpoint) ? { endpoint: stringValue(stopPayload.endpoint) } : existingValidation?.endpoint ? { endpoint: existingValidation.endpoint } : {}),
    ...(statusPayload.endpointMode ? { endpointMode: statusPayload.endpointMode } : existingValidation?.endpointMode ? { endpointMode: existingValidation.endpointMode } : {}),
    ...(statusPayload.endpointModelIds?.length ? { endpointModelIds: statusPayload.endpointModelIds } : existingValidation?.endpointModelIds?.length ? { endpointModelIds: existingValidation.endpointModelIds } : {}),
    missingHints: [],
    runtimeContract,
    runtimeState,
  });
  return setupResult({
    action: "stop",
    status: "stopped",
    installStatuses: installedPackage
      ? [{ packageName, source: "first-party", status: "installed", packageId: installedPackage.id }]
      : [],
    validation,
    runtimeCandidates,
    statusPayload: recordPayload(statusPayload),
    nextSteps: [
      "MiniCPM-V runtime is stopped; package install state, runtime cache, endpoint binding, and external model caches were preserved.",
      "Run Validate or analyze a visual input to restart or verify the runtime.",
    ],
  });
}

async function cleanupMiniCpmVisionProvider(workspacePath: string): Promise<MiniCpmVisionCleanupResult> {
  const installedPackage = await findInstalledMiniCpmPackage(workspacePath);
  const cleanup: MiniCpmVisionCleanupResult = {
    stopStatus: installedPackage ? "stopped" : "not-installed",
    packageStatus: installedPackage ? "uninstalled" : "not-installed",
    ...(installedPackage?.id ? { packageId: installedPackage.id } : {}),
    ...(installedPackage?.rootPath ? { packageRootPath: installedPackage.rootPath } : {}),
    paths: [],
    preserved: [
      "User-managed llama-server binaries are never removed.",
      "External Hugging Face, llama.cpp, Ollama, vLLM, or SGLang model caches are never removed.",
      "Original user media files outside Ambient's managed MiniCPM-V workspace cache are never removed.",
    ],
  };

  if (installedPackage) {
    await runMiniCpmCommand(workspacePath, {
      command: "minicpm_vision_stop",
      args: ["--state-dir", stateDirPath],
      timeoutMs: 60_000,
    }).catch((error) => {
      cleanup.stopStatus = "failed";
      cleanup.stopError = errorMessage(error);
    });
    try {
      await uninstallAmbientCliPackageSource(workspacePath, { packageId: installedPackage.id });
    } catch (error) {
      cleanup.packageStatus = "failed";
      cleanup.packageError = errorMessage(error);
    }
  }

  await removeAmbientCliPackageEnvBindings(workspacePath, {
    packageName,
    envNames: [runtimeBinaryEnvName, endpointEnvName],
  }).catch((error) => {
    cleanup.paths.push({
      path: ".ambient/cli-packages/env-bindings.json",
      status: "failed",
      error: errorMessage(error),
    });
  });

  for (const relativePath of cleanupPaths) {
    cleanup.paths.push(await removeAmbientOwnedMiniCpmPath(workspacePath, relativePath));
  }

  return cleanup;
}

async function findInstalledMiniCpmPackage(workspacePath: string): Promise<{ id: string; rootPath: string } | undefined> {
  const catalog = await discoverAmbientCliPackages(workspacePath);
  const pkg = catalog.packages.find((candidate) => candidate.name === packageName && candidate.installed);
  return pkg ? { id: pkg.id, rootPath: pkg.rootPath } : undefined;
}

async function removeAmbientOwnedMiniCpmPath(
  workspacePath: string,
  relativePath: typeof cleanupPaths[number],
): Promise<MiniCpmVisionCleanupResult["paths"][number]> {
  const rootPath = relativePath === runtimeDownloadRootPath ? managedInstallWorkspacePath(workspacePath) : workspacePath;
  const absolutePath = resolve(rootPath, relativePath);
  if (!isPathInside(rootPath, absolutePath)) {
    return { path: relativePath, status: "failed", error: "Resolved cleanup path is outside Ambient-owned state." };
  }
  if (!existsSync(absolutePath)) return { path: relativePath, status: "not-found" };
  try {
    await rm(absolutePath, { recursive: true, force: true });
    return { path: relativePath, status: "removed" };
  } catch (error) {
    return { path: relativePath, status: "failed", error: errorMessage(error) };
  }
}

export async function analyzeMiniCpmVisionInput(
  workspacePath: string,
  input: MiniCpmVisionAnalyzeInput,
  options: AnalyzeMiniCpmVisionInputOptions = {},
): Promise<MiniCpmVisionAnalysisResult> {
  const workspace = resolve(workspacePath);
  const startedAt = Date.now();
  throwIfAborted(options.signal);
  emitMiniCpmVisionProgress(options, {
    phase: "package",
    message: "Checking MiniCPM-V provider package.",
  });
  const installStatuses = await ensureMiniCpmVisionPackage(workspace, options);
  throwIfAborted(options.signal);
  emitMiniCpmVisionProgress(options, {
    phase: "package",
    message: "MiniCPM-V provider package check completed.",
    elapsedMs: Date.now() - startedAt,
  });
  const failedInstall = installStatuses.find((status) => status.status === "failed");
  if (failedInstall) throw new Error(failedInstall.error ?? "MiniCPM-V provider package install failed.");

  const requestedEndpointUrl = input.endpointUrl?.trim() ? normalizeMiniCpmLocalEndpointUrl(input.endpointUrl) : undefined;
  const requestedRuntimeBinaryPath = input.runtimeBinaryPath?.trim();
  if (requestedEndpointUrl && input.runtimeBinaryPath?.trim()) {
    throw new Error("MiniCPM-V visual analysis accepts either endpointUrl or runtimeBinaryPath, not both.");
  }
  const persistBindings = options.persistBindings !== false;
  if (requestedEndpointUrl && persistBindings) {
    if (input.startServer === true) {
      throw new Error("MiniCPM-V endpointUrl cannot be combined with startServer=true; existing endpoints are user-managed.");
    }
    await bindMiniCpmEndpointUrl(workspace, requestedEndpointUrl);
  } else if (requestedEndpointUrl && input.startServer === true) {
    throw new Error("MiniCPM-V endpointUrl cannot be combined with startServer=true; existing endpoints are user-managed.");
  } else if (input.runtimeBinaryPath?.trim() && persistBindings) {
    await clearMiniCpmEndpointBinding(workspace);
  }
  const configuredEndpointUrl = requestedEndpointUrl ?? readMiniCpmEndpointBinding(workspace);
  const usesExistingEndpoint = Boolean(configuredEndpointUrl);

  const requestedRuntimeCandidate = !usesExistingEndpoint && requestedRuntimeBinaryPath
    ? runtimeCandidate(runtimePathCandidate(requestedRuntimeBinaryPath), "user")
    : undefined;
  const runtimeEnvOverride = requestedRuntimeCandidate?.available ? { [runtimeBinaryEnvName]: requestedRuntimeCandidate.path } : undefined;
  const ambientRuntimeEnv = usesExistingEndpoint
    ? undefined
    : {
        [endpointEnvName]: "",
        ...(runtimeEnvOverride ?? {}),
      };
  if (requestedRuntimeCandidate) {
    if (!requestedRuntimeCandidate.available) throw new Error(requestedRuntimeCandidate.reason ?? `MiniCPM-V runtime binary is not available: ${requestedRuntimeCandidate.path}`);
    if (persistBindings) await bindMiniCpmRuntimeBinary(workspace, requestedRuntimeCandidate.path);
  }

  const primaryInput = primaryVisualInputReference(input);
  const referenceInput = referenceImageInputReference(input);
  const task = input.task ?? (referenceInput ? "design_comparison" : primaryInput.kind === "video" ? "video_frame_review" : "ui_review");
  emitMiniCpmVisionProgress(options, {
    phase: "prepare-input",
    message: `Preparing MiniCPM-V ${primaryInput.kind} input.`,
    elapsedMs: Date.now() - startedAt,
  });
  const primary = primaryInput.kind === "video"
    ? await resolveMiniCpmInputVideoFrame(workspace, primaryInput.video, {
        allowExternal: input.allowExternalMediaPaths === true || input.allowExternalImagePaths === true,
        frameTimestampMs: input.frameTimestampMs,
      })
    : {
        image: await resolveMiniCpmInputImage(workspace, primaryInput.image, {
          allowExternal: input.allowExternalMediaPaths === true || input.allowExternalImagePaths === true,
          role: "primary",
        }),
      };
  const image = primary.image;
  const video = "video" in primary ? primary.video : undefined;
  const referenceImage = referenceInput
    ? await resolveMiniCpmInputImage(workspace, referenceInput, {
        allowExternal: input.allowExternalMediaPaths === true || input.allowExternalImagePaths === true,
        role: "reference",
      })
    : undefined;
  const inputImages = [image, referenceImage].filter((item): item is MiniCpmVisionImageSummary => Boolean(item));
  const sampledFrames = video ? [image] : undefined;
  const prompt = buildMiniCpmPrompt(task, input.prompt, {
    comparison: Boolean(referenceImage),
    primary: image,
    reference: referenceImage,
    video,
  });
  const outputJson = resolveMiniCpmOutputJsonPath(workspace, input.outputJsonPath, task);
  const outputJsonRelative = toWorkspaceRelativePath(workspace, outputJson);
  const stateDir = stateDirPath;
  const commands: MiniCpmVisionAnalysisCommandSummary[] = [];
  let startResult: AmbientCliRunResult | undefined;
  let analyzeResult: AmbientCliRunResult | undefined;
  let stopResult: AmbientCliRunResult | undefined;

  try {
    if (!usesExistingEndpoint && input.startServer !== false) {
      emitMiniCpmVisionProgress(options, {
        phase: "start",
        command: "minicpm_vision_start",
        message: "Starting MiniCPM-V local server.",
        elapsedMs: Date.now() - startedAt,
      });
      startResult = await runMiniCpmCommand(workspace, {
        command: "minicpm_vision_start",
        args: [
          "--state-dir",
          stateDir,
          "--wait-ms",
          String(input.waitMs ?? 180_000),
          ...(input.offline ? ["--offline"] : []),
        ],
        timeoutMs: Math.max(120_000, (input.waitMs ?? 180_000) + 30_000),
        env: ambientRuntimeEnv,
        signal: options.signal,
      });
      commands.push(commandSummary("start", startResult));
      emitMiniCpmVisionProgress(options, {
        phase: "start",
        command: "minicpm_vision_start",
        message: "MiniCPM-V local server is ready.",
        elapsedMs: Date.now() - startedAt,
      });
    }

    emitMiniCpmVisionProgress(options, {
      phase: "analyze",
      command: "minicpm_vision_analyze",
      message: "MiniCPM-V visual analysis request is running.",
      elapsedMs: Date.now() - startedAt,
    });
    analyzeResult = await runMiniCpmCommand(workspace, {
      command: "minicpm_vision_analyze",
      args: [
        "--state-dir",
        stateDir,
        "--image",
        image.path,
        ...(referenceImage ? ["--image", referenceImage.path] : []),
        ...(configuredEndpointUrl ? ["--endpoint", configuredEndpointUrl] : []),
        "--output-json",
        outputJsonRelative,
        "--prompt",
        prompt,
        "--request-timeout-ms",
        String(input.requestTimeoutMs ?? 240_000),
        "--max-tokens",
        String(input.maxTokens ?? 1200),
      ],
      timeoutMs: Math.max(120_000, (input.requestTimeoutMs ?? 240_000) + 30_000),
      env: ambientRuntimeEnv,
      signal: options.signal,
    });
    commands.push(commandSummary("analyze", analyzeResult));
    emitMiniCpmVisionProgress(options, {
      phase: "analyze",
      command: "minicpm_vision_analyze",
      message: "MiniCPM-V visual analysis response received.",
      elapsedMs: Date.now() - startedAt,
    });
  } finally {
    if (!usesExistingEndpoint && input.startServer !== false && input.stopAfter === true) {
      emitMiniCpmVisionProgress(options, {
        phase: "stop",
        command: "minicpm_vision_stop",
        message: "Stopping MiniCPM-V local server after analysis.",
        elapsedMs: Date.now() - startedAt,
      });
      stopResult = await runMiniCpmCommand(workspace, {
        command: "minicpm_vision_stop",
        args: ["--state-dir", stateDir],
        timeoutMs: 60_000,
      }).catch((error) => {
        commands.push({
          command: "stop",
          stderrArtifactPath: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      });
      if (stopResult) commands.push(commandSummary("stop", stopResult));
      emitMiniCpmVisionProgress(options, {
        phase: "stop",
        command: "minicpm_vision_stop",
        message: "MiniCPM-V local server stop completed.",
        elapsedMs: Date.now() - startedAt,
      });
    }
  }

  if (!analyzeResult?.stdout) throw new Error("MiniCPM-V analysis command completed without JSON stdout.");
  const analyzeStdout = analyzeResult.stdout;
  const preview = normalizeCliPreview(parseJsonObject(analyzeStdout, "MiniCPM-V analysis stdout"));
  const fullArtifact = await readMiniCpmFullArtifact(outputJson).catch(() => undefined);
  const validation = {
    valid: Boolean(fullArtifact?.schemaValidation?.valid ?? true),
    errors: Array.isArray(fullArtifact?.schemaValidation?.errors)
      ? fullArtifact.schemaValidation.errors.filter((error): error is string => typeof error === "string")
      : [],
  };
  const artifactPath = preview.artifacts?.jsonPath ?? outputJsonRelative;
  const fullJsonPath = fullArtifact?.artifacts?.jsonPath ? workspaceRelativeArtifactPath(workspace, fullArtifact.artifacts.jsonPath) : outputJsonRelative;
  const absoluteInputPaths = [image.path, referenceImage?.path, video?.path]
    .filter((item): item is string => Boolean(item))
    .map((path) => resolve(workspace, path));

  const result: MiniCpmVisionAnalysisResult = {
    provider,
    status: "passed",
    packageName,
    task,
    prompt,
    ...(preview.model ? { model: preview.model } : {}),
    ...(fullArtifact?.endpoint ? { endpoint: fullArtifact.endpoint } : {}),
    ...(typeof preview.latencyMs === "number" ? { latencyMs: preview.latencyMs } : {}),
    durationMs: Date.now() - startedAt,
    summary: preview.summary ?? "MiniCPM-V returned visual analysis without a summary.",
    observations: preview.observations ?? [],
    limitations: preview.limitations ?? [],
    image,
    ...(video ? { video } : {}),
    ...(referenceImage ? { referenceImage } : {}),
    inputImages,
    ...(sampledFrames ? { sampledFrames } : {}),
    artifacts: {
      jsonPath: artifactPath,
      ...(fullJsonPath && fullJsonPath !== artifactPath ? { fullJsonPath } : {}),
    },
    installStatuses,
    commands,
    validation,
    redaction: {
      returnedImagePathIsWorkspaceRelative: !isAbsolute(image.path) && !image.path.startsWith(".."),
      stdoutDoesNotContainAbsoluteImagePath: absoluteInputPaths.every((path) => !analyzeStdout.includes(path)),
      artifactPathIsWorkspaceRelative: !isAbsolute(artifactPath) && !artifactPath.startsWith(".."),
    },
  };
  emitMiniCpmVisionProgress(options, {
    phase: "complete",
    message: "MiniCPM-V visual analysis completed.",
    elapsedMs: Date.now() - startedAt,
  });
  return result;
}

async function ensureMiniCpmVisionPackage(
  workspacePath: string,
  options: Pick<SetupMiniCpmVisionProviderOptions, "bundledPackageRootPath"> = {},
): Promise<FirstPartyAmbientCliPackageInstallStatus[]> {
  return ensureFirstPartyAmbientCliPackages(workspacePath, {
    packageNames: [packageName],
    ...(options.bundledPackageRootPath ? { bundledPackageRootPath: options.bundledPackageRootPath } : {}),
  });
}

async function readMiniCpmStatus(
  workspacePath: string,
  options: { endpointUrl?: string; env?: Record<string, string | undefined>; signal?: AbortSignal } = {},
): Promise<MiniCpmVisionStatusPayload> {
  const result = await runMiniCpmCommand(workspacePath, {
    command: "minicpm_vision_status",
    args: ["--state-dir", stateDirPath, ...(options.endpointUrl ? ["--endpoint", options.endpointUrl] : [])],
    timeoutMs: 60_000,
    env: options.env,
    signal: options.signal,
  });
  const payload = parseJsonObject(result.stdout ?? "", "MiniCPM-V status output") as Record<string, unknown>;
  return {
    providerId: stringValue(payload.providerId),
    available: booleanValue(payload.available),
    status: stringValue(payload.status),
    reason: stringValue(payload.reason),
    runtime: normalizeStatusRuntime(recordField(payload.runtime)),
    endpoint: stringValue(payload.endpoint),
    endpointMode: payload.endpointMode === "existing-local-endpoint" || payload.endpointMode === "managed-local-server" ? payload.endpointMode : undefined,
    endpointModelIds: normalizeStatusModelIds(payload.models),
    server: normalizeStatusServer(recordField(payload.server)),
    runtimeContract: normalizeMiniCpmRuntimeContract(payload.runtimeContract),
    missingHints: stringArray(payload.missingHints),
  };
}

interface MiniCpmManagedRuntimeDownloadRecord {
  url: string;
  status: "downloaded" | "reused";
  archivePath: string;
  bytes: number;
  durationMs: number;
  preResponseTimeoutMs: number;
  idleTimeoutMs: number;
}

export async function installMiniCpmManagedRuntimeFromDownload(
  workspacePath: string,
  input: {
    artifactId?: string;
    manifest?: MiniCpmVisionRuntimeReleaseManifest;
    now: () => Date;
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<MiniCpmVisionRuntimeInstallResult> {
  const manifest = input.manifest ?? miniCpmRuntimeReleaseManifestPrototype;
  const selectedArtifact = selectMiniCpmRuntimeInstallArtifact(manifest, input.artifactId);
  const attemptedBase = {
    attempted: true,
    source: "managed-download" as const,
    ...(selectedArtifact ? { artifactId: selectedArtifact.id, downloadUrl: selectedArtifact.sourceUrl } : {}),
    missingHints: managedRuntimeInstallHints(),
  };
  if (!selectedArtifact) {
    return {
      ...attemptedBase,
      status: "unsupported",
      error: `No pinned MiniCPM-V runtime artifact is declared for ${platform()} ${arch()}.`,
    };
  }
  const downloadCheck = managedRuntimeDownloadEligibility(manifest, selectedArtifact);
  if (downloadCheck) {
    return {
      ...attemptedBase,
      status: "unsupported",
      cacheSubdir: selectedArtifact.cacheSubdir,
      error: downloadCheck,
    };
  }
  try {
    const download = await downloadMiniCpmManagedRuntimeArchive(workspacePath, selectedArtifact, {
      preResponseTimeoutMs: input.preResponseTimeoutMs,
      idleTimeoutMs: input.idleTimeoutMs,
      signal: input.signal,
      now: input.now,
    });
    return await installMiniCpmManagedRuntimeFromArchive(workspacePath, {
      archivePath: download.archivePath,
      artifactId: selectedArtifact.id,
      manifest,
      source: "managed-download",
      download,
      now: input.now,
    });
  } catch (error) {
    return {
      ...attemptedBase,
      status: "failed",
      cacheSubdir: selectedArtifact.cacheSubdir,
      error: errorMessage(error),
    };
  }
}

async function installMiniCpmManagedRuntimeFromArchive(
  workspacePath: string,
  input: {
    archivePath: string;
    artifactId?: string;
    manifest?: MiniCpmVisionRuntimeReleaseManifest;
    source?: MiniCpmVisionRuntimeInstallResult["source"];
    download?: MiniCpmManagedRuntimeDownloadRecord;
    now: () => Date;
  },
): Promise<MiniCpmVisionRuntimeInstallResult> {
  const manifest = input.manifest ?? miniCpmRuntimeReleaseManifestPrototype;
  const archivePath = resolveRuntimeArchivePath(workspacePath, input.archivePath);
  const selectedArtifact = selectMiniCpmRuntimeInstallArtifact(manifest, input.artifactId);
  const runtimeWorkspacePath = await miniCpmManagedRuntimeWorkspace(workspacePath);
  const source = input.source ?? "local-archive";
  const attemptedBase = {
    attempted: true,
    source,
    ...(selectedArtifact ? { artifactId: selectedArtifact.id } : {}),
    ...(input.download ? downloadInstallFields(input.download) : {}),
    archivePath: source === "managed-download"
      ? toWorkspaceRelativePath(workspacePath, archivePath) ?? basename(archivePath)
      : basename(archivePath),
    missingHints: managedRuntimeInstallHints(),
  };

  if (!selectedArtifact) {
    return {
      ...attemptedBase,
      status: "unsupported",
      error: `No pinned MiniCPM-V runtime artifact is declared for ${platform()} ${arch()}.`,
    };
  }
  if (selectedArtifact.archiveFormat !== "tar.gz" && selectedArtifact.archiveFormat !== "tgz" && selectedArtifact.archiveFormat !== "zip") {
    return {
      ...attemptedBase,
      status: "unsupported",
      artifactId: selectedArtifact.id,
      error: `MiniCPM-V managed runtime archive format is not implemented yet: ${selectedArtifact.archiveFormat}.`,
    };
  }

  let stagingRoot: string | undefined;
  let backupRoot: string | undefined;
  const installRoot = resolve(runtimeWorkspacePath, runtimeDownloadRootPath, selectedArtifact.cacheSubdir);
  const runtimeRoot = resolve(runtimeWorkspacePath, runtimeDownloadRootPath);
  try {
    if (!isPathInside(runtimeWorkspacePath, installRoot) || !isPathInside(runtimeWorkspacePath, runtimeRoot)) {
      throw new Error("Resolved MiniCPM-V runtime install path is outside Ambient-managed install state.");
    }
    const archiveDetails = await stat(archivePath);
    if (!archiveDetails.isFile()) throw new Error(`MiniCPM-V runtime archive is not a file: ${archivePath}`);
    const archiveSha256 = await sha256FileAsync(archivePath);
    const archiveOnlyVerification = verifyMiniCpmRuntimeReleaseManifest({
      manifest,
      platform: selectedArtifact.platform,
      arch: selectedArtifact.arch,
      artifactId: selectedArtifact.id,
      archivePath,
    });
    const archiveCheck = archiveOnlyVerification.checks.find((check) => check.id === "local-archive-checksum");
    if (archiveCheck?.status !== "passed") {
      throw new Error(archiveCheck?.detail ?? "MiniCPM-V runtime archive checksum did not pass.");
    }

    const existingBinaryPath = resolve(installRoot, selectedArtifact.binaryRelativePath);
    if (existsSync(existingBinaryPath)) {
      const existingVerification = verifyMiniCpmRuntimeReleaseManifest({
        manifest,
        platform: selectedArtifact.platform,
        arch: selectedArtifact.arch,
        artifactId: selectedArtifact.id,
        archivePath,
        binaryPath: existingBinaryPath,
      });
      const binaryCheck = existingVerification.checks.find((check) => check.id === "local-binary-checksum");
      if (binaryCheck?.status === "passed") {
        await chmod(existingBinaryPath, 0o755).catch(() => undefined);
        const macosSecurity = assessMacosManagedRuntimeSecurity(existingBinaryPath);
        const receiptPath = resolve(installRoot, "ambient-runtime-install.json");
        const receipt = runtimeInstallReceipt({
          workspacePath: runtimeWorkspacePath,
          status: "already-installed",
          source,
          download: input.download,
          artifact: selectedArtifact,
          archivePath,
          archiveSha256,
          binaryPath: existingBinaryPath,
          binarySha256: existingVerification.verifiedBinarySha256,
          installRoot,
          receiptPath,
          rollback: "not-needed",
          macosSecurity,
          manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, existingVerification),
          now: input.now,
        });
        await writeRuntimeInstallReceipt(runtimeWorkspacePath, receiptPath, receipt);
        return {
          ...attemptedBase,
          status: "already-installed",
          artifactId: selectedArtifact.id,
          archiveSha256,
          binaryPath: existingBinaryPath,
          binarySha256: existingVerification.verifiedBinarySha256,
          cacheSubdir: selectedArtifact.cacheSubdir,
          installRoot: toWorkspaceRelativePath(runtimeWorkspacePath, installRoot),
          receiptPath: toWorkspaceRelativePath(runtimeWorkspacePath, receiptPath),
          rollback: "not-needed",
          macosQuarantine: macosSecurity?.quarantineAfter ?? macosQuarantineStatus(existingBinaryPath),
          ...(macosSecurity ? { macosSecurity } : {}),
          manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, existingVerification),
          missingHints: [],
        };
      }
    }

    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(join(runtimeRoot, ".gitignore"), "*\n", "utf8");
    const stamp = input.now().toISOString().replace(/[:.]/g, "-");
    stagingRoot = resolve(runtimeRoot, `.staging-${safePathSegment(selectedArtifact.id)}-${stamp}`);
    backupRoot = resolve(runtimeRoot, `.rollback-${safePathSegment(selectedArtifact.id)}-${stamp}`);
    if (!isPathInside(runtimeWorkspacePath, stagingRoot) || !isPathInside(runtimeWorkspacePath, backupRoot)) {
      throw new Error("Resolved MiniCPM-V runtime staging path is outside Ambient-managed install state.");
    }
    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingRoot, { recursive: true });
    await extractMiniCpmRuntimeArchive(archivePath, stagingRoot, selectedArtifact.archiveFormat, runtimeWorkspacePath);

    const stagedBinaryPath = resolve(stagingRoot, selectedArtifact.binaryRelativePath);
    const installedBinaryPath = resolve(installRoot, selectedArtifact.binaryRelativePath);
    const finalVerification = verifyMiniCpmRuntimeReleaseManifest({
      manifest,
      platform: selectedArtifact.platform,
      arch: selectedArtifact.arch,
      artifactId: selectedArtifact.id,
      archivePath,
      binaryPath: stagedBinaryPath,
    });
    const binaryCheck = finalVerification.checks.find((check) => check.id === "local-binary-checksum");
    if (binaryCheck?.status !== "passed") {
      throw new Error(binaryCheck?.detail ?? "MiniCPM-V extracted runtime binary checksum did not pass.");
    }
    await chmod(stagedBinaryPath, 0o755).catch(() => undefined);

    if (existsSync(installRoot)) {
      await rm(backupRoot, { recursive: true, force: true });
      await rename(installRoot, backupRoot);
    }
    await mkdir(dirname(installRoot), { recursive: true });
    try {
      await rename(stagingRoot, installRoot);
      stagingRoot = undefined;
    } catch (error) {
      if (backupRoot && existsSync(backupRoot) && !existsSync(installRoot)) {
        await rename(backupRoot, installRoot).catch(() => undefined);
      }
      throw error;
    }
    if (backupRoot && existsSync(backupRoot)) {
      await rm(backupRoot, { recursive: true, force: true });
      backupRoot = undefined;
    }

    const installedVerification = verifyMiniCpmRuntimeReleaseManifest({
      manifest,
      platform: selectedArtifact.platform,
      arch: selectedArtifact.arch,
      artifactId: selectedArtifact.id,
      archivePath,
      binaryPath: installedBinaryPath,
    });
    const macosSecurity = assessMacosManagedRuntimeSecurity(installedBinaryPath);
    const receiptPath = resolve(installRoot, "ambient-runtime-install.json");
    const receipt = runtimeInstallReceipt({
      workspacePath: runtimeWorkspacePath,
      status: "installed",
      source,
      download: input.download,
      artifact: selectedArtifact,
      archivePath,
      archiveSha256,
      binaryPath: installedBinaryPath,
      binarySha256: installedVerification.verifiedBinarySha256,
      installRoot,
      receiptPath,
      rollback: "not-needed",
      macosSecurity,
      manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, installedVerification),
      now: input.now,
    });
    await writeRuntimeInstallReceipt(runtimeWorkspacePath, receiptPath, receipt);
    return {
      ...attemptedBase,
      status: "installed",
      artifactId: selectedArtifact.id,
      archiveSha256,
      binaryPath: installedBinaryPath,
      binarySha256: installedVerification.verifiedBinarySha256,
      cacheSubdir: selectedArtifact.cacheSubdir,
      installRoot: toWorkspaceRelativePath(runtimeWorkspacePath, installRoot),
      receiptPath: toWorkspaceRelativePath(runtimeWorkspacePath, receiptPath),
      rollback: "not-needed",
      macosQuarantine: macosSecurity?.quarantineAfter ?? macosQuarantineStatus(installedBinaryPath),
      ...(macosSecurity ? { macosSecurity } : {}),
      manifestVerification: runtimeInstallManifestVerificationForRecord(runtimeWorkspacePath, installedVerification),
      missingHints: [],
    };
  } catch (error) {
    let rollback: MiniCpmVisionRuntimeInstallResult["rollback"] = "not-needed";
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    if (backupRoot && existsSync(backupRoot)) {
      if (!existsSync(installRoot)) {
        await rename(backupRoot, installRoot)
          .then(() => {
            rollback = "restored-previous-install";
          })
          .catch(() => {
            rollback = "failed";
          });
      } else {
        await rm(backupRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    return {
      ...attemptedBase,
      status: "failed",
      artifactId: selectedArtifact.id,
      cacheSubdir: selectedArtifact.cacheSubdir,
      installRoot: toWorkspaceRelativePath(runtimeWorkspacePath, installRoot),
      rollback,
      error: errorMessage(error),
    };
  }
}

function resolveRuntimeArchivePath(workspacePath: string, archivePath: string): string {
  return isAbsolute(archivePath) ? resolve(archivePath) : resolve(workspacePath, archivePath);
}

function selectMiniCpmRuntimeInstallArtifact(
  manifest: MiniCpmVisionRuntimeReleaseManifest,
  artifactId: string | undefined,
): MiniCpmVisionRuntimeReleaseArtifact | undefined {
  return selectLocalLlamaRuntimeArtifact(manifest.artifacts, {
    platform: platform(),
    arch: arch(),
    ...(artifactId ? { artifactId } : {}),
  });
}

function managedRuntimeDownloadEligibility(
  manifest: MiniCpmVisionRuntimeReleaseManifest,
  artifact: MiniCpmVisionRuntimeReleaseArtifact,
): string | undefined {
  return localLlamaManagedRuntimeDownloadEligibility({
    capabilityLabel: "MiniCPM-V",
    manifest,
    artifact,
    platform: platform(),
    arch: arch(),
    extraPolicyBlocker: (candidate) => candidate.platform === "win32"
      ? "MiniCPM-V Windows managed runtime download remains disabled until a real Windows lifecycle smoke passes."
      : undefined,
  });
}

function downloadInstallFields(
  download: MiniCpmManagedRuntimeDownloadRecord,
): Pick<
  MiniCpmVisionRuntimeInstallResult,
  "downloadUrl" | "downloadStatus" | "downloadBytes" | "downloadDurationMs" | "downloadPreResponseTimeoutMs" | "downloadIdleTimeoutMs"
> {
  return {
    downloadUrl: download.url,
    downloadStatus: download.status,
    downloadBytes: download.bytes,
    downloadDurationMs: download.durationMs,
    downloadPreResponseTimeoutMs: download.preResponseTimeoutMs,
    downloadIdleTimeoutMs: download.idleTimeoutMs,
  };
}

async function downloadMiniCpmManagedRuntimeArchive(
  workspacePath: string,
  artifact: MiniCpmVisionRuntimeReleaseArtifact,
  options: {
    preResponseTimeoutMs?: number;
    idleTimeoutMs?: number;
    signal?: AbortSignal;
    now: () => Date;
  },
): Promise<MiniCpmManagedRuntimeDownloadRecord> {
  const preResponseTimeoutMs = Math.max(1000, options.preResponseTimeoutMs ?? 60_000);
  const idleTimeoutMs = Math.max(1000, options.idleTimeoutMs ?? 60_000);
  const runtimeWorkspacePath = await miniCpmManagedRuntimeWorkspace(workspacePath);
  const archiveDir = resolve(runtimeWorkspacePath, runtimeDownloadRootPath, runtimeDownloadArchiveRoot, artifact.cacheSubdir);
  const archivePath = resolve(archiveDir, artifact.archiveName);
  if (!isPathInside(runtimeWorkspacePath, archiveDir) || !isPathInside(runtimeWorkspacePath, archivePath)) {
    throw new Error("Resolved MiniCPM-V runtime download path is outside Ambient-managed install state.");
  }
  await mkdir(archiveDir, { recursive: true });
  await writeFile(resolve(runtimeWorkspacePath, runtimeDownloadRootPath, ".gitignore"), "*\n", "utf8");

  if (existsSync(archivePath)) {
    const existing = verifyMiniCpmRuntimeReleaseManifest({
      manifest: {
        ...miniCpmRuntimeReleaseManifestPrototype,
        artifacts: [artifact],
        blockers: [],
      },
      platform: artifact.platform,
      arch: artifact.arch,
      artifactId: artifact.id,
      archivePath,
    });
    const archiveCheck = existing.checks.find((check) => check.id === "local-archive-checksum");
    if (archiveCheck?.status === "passed") {
      const details = await stat(archivePath);
      return {
        url: artifact.sourceUrl,
        status: "reused",
        archivePath,
        bytes: details.size,
        durationMs: 0,
        preResponseTimeoutMs,
        idleTimeoutMs,
      };
    }
    await rm(archivePath, { force: true });
  }

  const startedAt = Date.now();
  const tempPath = `${archivePath}.download-${options.now().toISOString().replace(/[:.]/g, "-")}`;
  await rm(tempPath, { force: true });
  const response = await fetchWithPreResponseTimeout(artifact.sourceUrl, {
    preResponseTimeoutMs,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`MiniCPM-V runtime download failed with HTTP ${response.status} ${response.statusText} for ${artifact.archiveName}.`);
  }
  const expectedSize = artifact.archiveSizeBytes;
  const contentLength = Number(response.headers.get("content-length") ?? "0") || undefined;
  if (expectedSize && contentLength && contentLength !== expectedSize) {
    throw new Error(`MiniCPM-V runtime download size mismatch for ${artifact.archiveName}: expected ${expectedSize}, got ${contentLength}.`);
  }
  let bytes = 0;
  try {
    bytes = await writeResponseBodyWithIdleTimeout(response, tempPath, {
      idleTimeoutMs,
      signal: options.signal,
      expectedSize,
      artifactName: artifact.archiveName,
    });
    const actualSha256 = await sha256FileAsync(tempPath);
    if (actualSha256 !== artifact.archiveSha256) {
      throw new Error(`MiniCPM-V runtime download SHA-256 mismatch for ${artifact.id}: expected ${artifact.archiveSha256}, got ${actualSha256}.`);
    }
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
  await rename(tempPath, archivePath);
  return {
    url: artifact.sourceUrl,
    status: "downloaded",
    archivePath,
    bytes,
    durationMs: Date.now() - startedAt,
    preResponseTimeoutMs,
    idleTimeoutMs,
  };
}

async function fetchWithPreResponseTimeout(
  url: string,
  options: { preResponseTimeoutMs: number; signal?: AbortSignal },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.preResponseTimeoutMs);
  const abort = () => controller.abort();
  try {
    throwIfAborted(options.signal);
    options.signal?.addEventListener("abort", abort, { once: true });
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (options.signal?.aborted) throw new Error("MiniCPM-V runtime download was canceled.");
    if ((error instanceof Error && error.name === "AbortError") || controller.signal.aborted) {
      throw new Error(`MiniCPM-V runtime download did not start within ${options.preResponseTimeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

async function writeResponseBodyWithIdleTimeout(
  response: Response,
  path: string,
  options: {
    idleTimeoutMs: number;
    signal?: AbortSignal;
    expectedSize?: number;
    artifactName: string;
  },
): Promise<number> {
  if (!response.body) throw new Error(`MiniCPM-V runtime download response did not include a body for ${options.artifactName}.`);
  const file = await open(path, "w");
  const reader = response.body.getReader();
  let bytes = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idleExpired = false;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleExpired = true;
      void reader.cancel("idle-timeout").catch(() => undefined);
    }, options.idleTimeoutMs);
  };
  const abort = () => {
    void reader.cancel("aborted").catch(() => undefined);
  };
  try {
    throwIfAborted(options.signal);
    options.signal?.addEventListener("abort", abort, { once: true });
    resetIdleTimer();
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (idleExpired) throw new Error(`MiniCPM-V runtime download stalled after ${options.idleTimeoutMs} ms without body activity.`);
        throw error;
      }
      if (idleExpired) throw new Error(`MiniCPM-V runtime download stalled after ${options.idleTimeoutMs} ms without body activity.`);
      throwIfAborted(options.signal);
      if (chunk.done) break;
      resetIdleTimer();
      const value = Buffer.from(chunk.value);
      bytes += value.length;
      await file.write(value);
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    options.signal?.removeEventListener("abort", abort);
    await file.close();
  }
  if (options.expectedSize && bytes !== options.expectedSize) {
    throw new Error(`MiniCPM-V runtime download size mismatch for ${options.artifactName}: expected ${options.expectedSize}, got ${bytes}.`);
  }
  return bytes;
}

async function sha256FileAsync(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function extractMiniCpmRuntimeArchive(
  archivePath: string,
  stagingRoot: string,
  archiveFormat: MiniCpmVisionRuntimeReleaseArtifact["archiveFormat"],
  workspacePath: string,
): Promise<void> {
  if (archiveFormat === "tar.gz" || archiveFormat === "tgz") {
    const extract = spawnSync("tar", ["-xzf", archivePath, "-C", stagingRoot], { encoding: "utf8", timeout: 120_000 });
    if (extract.error) throw new Error(`MiniCPM-V runtime archive extraction failed: ${extract.error.message}`);
    if (extract.status !== 0) {
      const detail = [extract.stderr?.trim(), extract.stdout?.trim()].filter(Boolean).join("\n");
      throw new Error(`MiniCPM-V runtime archive extraction failed${detail ? `: ${detail}` : "."}`);
    }
    return;
  }
  if (archiveFormat === "zip") {
    await extractMiniCpmRuntimeZip(archivePath, stagingRoot, workspacePath);
    return;
  }
  throw new Error(`MiniCPM-V managed runtime archive format is not implemented yet: ${archiveFormat}.`);
}

async function extractMiniCpmRuntimeZip(archivePath: string, stagingRoot: string, workspacePath: string): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const entries = Object.values(zip.files);
  if (entries.length > 500) throw new Error(`MiniCPM-V runtime zip has too many entries: ${entries.length}.`);
  for (const entry of entries) {
    const unsafeOriginalName = (entry as { unsafeOriginalName?: unknown }).unsafeOriginalName;
    const entryName = (typeof unsafeOriginalName === "string" ? unsafeOriginalName : entry.name).replace(/\\/g, "/");
    const normalizedEntryName = entryName.replace(/\/+$/g, "");
    if (
      !normalizedEntryName ||
      normalizedEntryName.startsWith("/") ||
      /^[A-Za-z]:/.test(normalizedEntryName) ||
      normalizedEntryName.split("/").includes("..")
    ) {
      throw new Error(`MiniCPM-V runtime zip contains an unsafe entry path: ${entryName}`);
    }
    const destination = resolve(stagingRoot, normalizedEntryName);
    if (!isPathInside(workspacePath, destination) || !isPathInside(stagingRoot, destination)) {
      throw new Error(`MiniCPM-V runtime zip entry resolves outside the managed runtime cache: ${entryName}`);
    }
    if (entry.dir) {
      await mkdir(destination, { recursive: true });
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    const bytes = await entry.async("nodebuffer");
    await writeFile(destination, bytes);
  }
}

function runtimeInstallReceipt(input: {
  workspacePath: string;
  status: "installed" | "already-installed";
  source: MiniCpmVisionRuntimeInstallResult["source"];
  download?: MiniCpmManagedRuntimeDownloadRecord;
  artifact: MiniCpmVisionRuntimeReleaseArtifact;
  archivePath: string;
  archiveSha256: string;
  binaryPath: string;
  binarySha256?: string;
  installRoot: string;
  receiptPath: string;
  rollback: MiniCpmVisionRuntimeInstallResult["rollback"];
  macosSecurity?: MiniCpmVisionRuntimeMacosSecurity;
  manifestVerification: MiniCpmVisionRuntimeReleaseManifestVerification;
  now: () => Date;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-minicpm-v-runtime-install-receipt-v1",
    provider,
    packageName,
    status: input.status,
    source: input.source,
    installedAt: input.now().toISOString(),
    artifactId: input.artifact.id,
    releaseTag: input.artifact.releaseTag,
    sourceUrl: input.artifact.sourceUrl,
    archiveName: input.artifact.archiveName,
    archivePath: input.source === "managed-download"
      ? workspaceRelativeArtifactPath(input.workspacePath, input.archivePath) ?? basename(input.archivePath)
      : basename(input.archivePath),
    archiveSha256: input.archiveSha256,
    ...(input.download
      ? {
          download: {
            url: input.download.url,
            status: input.download.status,
            bytes: input.download.bytes,
            durationMs: input.download.durationMs,
            preResponseTimeoutMs: input.download.preResponseTimeoutMs,
            idleTimeoutMs: input.download.idleTimeoutMs,
          },
        }
      : {}),
    binaryRelativePath: input.artifact.binaryRelativePath,
    binaryPath: workspaceRelativeArtifactPath(input.workspacePath, input.binaryPath) ?? basename(input.binaryPath),
    binarySha256: input.binarySha256,
    installRoot: workspaceRelativeArtifactPath(input.workspacePath, input.installRoot) ?? input.installRoot,
    cacheSubdir: input.artifact.cacheSubdir,
    rollback: input.rollback,
    macosQuarantine: input.macosSecurity?.quarantineAfter ?? macosQuarantineStatus(input.binaryPath),
    ...(input.macosSecurity ? { macosSecurity: input.macosSecurity } : {}),
    ownership: {
      runtimeCacheRoot: runtimeDownloadRootPath,
      ambientOwned: true,
      userManagedRuntimesPreserved: true,
      modelCachesPreserved: true,
    },
    manifestVerification: input.manifestVerification,
  };
}

function runtimeInstallManifestVerificationForRecord(
  workspacePath: string,
  verification: MiniCpmVisionRuntimeReleaseManifestVerification,
): MiniCpmVisionRuntimeReleaseManifestVerification {
  return {
    ...verification,
    ...(verification.verifiedArchivePath ? { verifiedArchivePath: basename(verification.verifiedArchivePath) } : {}),
    ...(verification.verifiedBinaryPath
      ? { verifiedBinaryPath: workspaceRelativeArtifactPath(workspacePath, verification.verifiedBinaryPath) ?? basename(verification.verifiedBinaryPath) }
      : {}),
  };
}

async function writeRuntimeInstallReceipt(workspacePath: string, receiptPath: string, receipt: Record<string, unknown>): Promise<void> {
  if (!isPathInside(workspacePath, receiptPath)) throw new Error("Resolved MiniCPM-V runtime install receipt path is outside the workspace.");
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function macosQuarantineStatus(binaryPath: string): MiniCpmVisionRuntimeInstallResult["macosQuarantine"] {
  if (platform() !== "darwin") return "not-checked";
  const result = spawnSync("xattr", ["-p", "com.apple.quarantine", binaryPath], { encoding: "utf8", timeout: 5000 });
  return result.status === 0 && result.stdout.trim() ? "present" : "not-present";
}

function assessMacosManagedRuntimeSecurity(binaryPath: string): MiniCpmVisionRuntimeMacosSecurity | undefined {
  if (platform() !== "darwin") return undefined;
  const quarantineBefore = macosQuarantineStatus(binaryPath) ?? "not-checked";
  let quarantineAction: MiniCpmVisionRuntimeMacosSecurity["quarantineAction"] = "not-needed";
  if (quarantineBefore === "present") {
    const remove = spawnSync("xattr", ["-d", "com.apple.quarantine", binaryPath], { encoding: "utf8", timeout: 5000 });
    quarantineAction = remove.status === 0 ? "removed-after-checksum" : "failed";
  }
  const quarantineAfter = macosQuarantineStatus(binaryPath) ?? "not-checked";
  const codeSignature = assessMacosCodeSignature(binaryPath);
  const gatekeeper = assessMacosGatekeeper(binaryPath);
  const gatekeeperEligible = quarantineAfter !== "present" && codeSignature.status === "valid" && gatekeeper.status === "accepted";
  const ambientManagedEligible = quarantineAfter !== "present" && codeSignature.status === "valid";
  const eligible = gatekeeperEligible || ambientManagedEligible;
  const promotionPolicy: MiniCpmVisionRuntimeMacosSecurity["promotionPolicy"] | undefined = gatekeeperEligible
    ? "gatekeeper-accepted"
    : ambientManagedEligible
      ? "ambient-managed-valid-signature"
      : undefined;
  return {
    platform: "darwin",
    quarantineBefore,
    quarantineAction,
    quarantineAfter,
    codeSignature: codeSignature.status,
    ...(codeSignature.detail ? { codeSignatureDetail: codeSignature.detail } : {}),
    gatekeeperAssessment: gatekeeper.status,
    ...(gatekeeper.detail ? { gatekeeperDetail: gatekeeper.detail } : {}),
    defaultDownloadPromotion: eligible ? "eligible" : "blocked",
    ...(promotionPolicy ? { promotionPolicy } : {}),
    ...(eligible ? {} : { promotionBlocker: "Default managed runtime download requires a checksum-verified, quarantine-free macOS runtime with a valid code signature, or a notarized/Gatekeeper-accepted binary." }),
  };
}

function assessMacosCodeSignature(binaryPath: string): {
  status: MiniCpmVisionRuntimeMacosSecurity["codeSignature"];
  detail?: string;
} {
  const result = spawnSync("codesign", ["--verify", "--verbose=2", binaryPath], { encoding: "utf8", timeout: 10_000 });
  const detail = processDetail(result);
  if (result.error) return { status: "not-run", detail };
  if (result.status === 0) return { status: "valid", ...(detail ? { detail } : {}) };
  if (/not signed|code object is not signed/i.test(detail)) return { status: "unsigned", detail };
  return { status: "invalid", detail };
}

function assessMacosGatekeeper(binaryPath: string): {
  status: MiniCpmVisionRuntimeMacosSecurity["gatekeeperAssessment"];
  detail?: string;
} {
  const result = spawnSync("spctl", ["-a", "-vv", "--type", "exec", binaryPath], { encoding: "utf8", timeout: 10_000 });
  const detail = processDetail(result);
  if (result.error) return { status: "not-run", detail };
  return { status: result.status === 0 ? "accepted" : "rejected", ...(detail ? { detail } : {}) };
}

function processDetail(result: { error?: Error; stderr?: string | Buffer | null; stdout?: string | Buffer | null }): string {
  const detail = [result.error?.message, processOutputText(result.stderr), processOutputText(result.stdout)]
    .filter((item): item is string => Boolean(item))
    .join("\n")
    .trim();
  return detail.length > 1000 ? `${detail.slice(0, 1000)}...` : detail;
}

function processOutputText(value: string | Buffer | null | undefined): string | undefined {
  if (!value) return undefined;
  const text = typeof value === "string" ? value : value.toString("utf8");
  return text.trim() || undefined;
}

function managedRuntimeInstallHints(): string[] {
  return [
    "Use the default managed MiniCPM-V runtime download on macOS arm64/Linux x64, or provide a pinned llama.cpp b9122 archive for the current platform lane.",
    "Ambient verifies the archive SHA-256 and extracted llama-server SHA-256 before binding the runtime.",
    "Windows default download remains disabled until separate Windows runtime evidence is supplied.",
  ];
}

function normalizeStatusRuntime(input: Record<string, unknown>): MiniCpmVisionStatusPayload["runtime"] {
  return {
    binary: stringValue(input.binary),
    binaryAvailable: booleanValue(input.binaryAvailable),
    version: stringValue(input.version),
    defaultModel: stringValue(input.defaultModel),
    experimentalModel: stringValue(input.experimentalModel),
  };
}

function normalizeStatusServer(input: Record<string, unknown>): MiniCpmVisionStatusPayload["server"] {
  return {
    pid: numberValue(input.pid),
    previousPid: numberValue(input.previousPid),
    running: booleanValue(input.running),
    host: stringValue(input.host),
    port: numberValue(input.port),
    startedAt: stringValue(input.startedAt),
    stoppedAt: stringValue(input.stoppedAt),
    logPath: stringValue(input.logPath),
    stderrPath: stringValue(input.stderrPath),
  };
}

function normalizeStatusModelIds(input: unknown): string[] {
  const models = recordField(input);
  const body = recordField(models.body);
  const data = Array.isArray(body.data) ? body.data : [];
  return data
    .map((item) => isRecord(item) ? stringValue(item.id) : undefined)
    .filter((item): item is string => Boolean(item));
}

async function bindMiniCpmRuntimeBinary(workspacePath: string, binaryPath: string): Promise<void> {
  const envPath = resolve(workspacePath, runtimeEnvRoot, `${runtimeBinaryEnvName}.value`);
  if (!isPathInside(workspacePath, envPath)) throw new Error("Resolved MiniCPM-V runtime env path is outside the workspace.");
  await mkdir(dirname(envPath), { recursive: true });
  await writeFile(join(dirname(envPath), ".gitignore"), "*\n", "utf8");
  await writeFile(envPath, `${binaryPath.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  await setAmbientCliPackageEnvBinding(workspacePath, {
    packageName,
    envName: runtimeBinaryEnvName,
    filePath: `./${toWorkspaceRelativePath(workspacePath, envPath)}`,
  });
}

async function bindMiniCpmEndpointUrl(workspacePath: string, endpointUrl: string): Promise<void> {
  const normalized = normalizeMiniCpmLocalEndpointUrl(endpointUrl);
  const envPath = resolve(workspacePath, runtimeEnvRoot, `${endpointEnvName}.value`);
  if (!isPathInside(workspacePath, envPath)) throw new Error("Resolved MiniCPM-V endpoint env path is outside the workspace.");
  await mkdir(dirname(envPath), { recursive: true });
  await writeFile(join(dirname(envPath), ".gitignore"), "*\n", "utf8");
  await writeFile(envPath, `${normalized}\n`, { encoding: "utf8", mode: 0o600 });
  await setAmbientCliPackageEnvBinding(workspacePath, {
    packageName,
    envName: endpointEnvName,
    filePath: `./${toWorkspaceRelativePath(workspacePath, envPath)}`,
  });
}

async function clearMiniCpmEndpointBinding(workspacePath: string): Promise<void> {
  await removeAmbientCliPackageEnvBindings(workspacePath, {
    packageName,
    envNames: [endpointEnvName],
  });
  const envPath = resolve(workspacePath, runtimeEnvRoot, `${endpointEnvName}.value`);
  if (!isPathInside(workspacePath, envPath)) throw new Error("Resolved MiniCPM-V endpoint env path is outside the workspace.");
  await rm(envPath, { force: true });
}

function readMiniCpmEndpointBinding(workspacePath: string): string | undefined {
  const fromProcess = process.env[endpointEnvName]?.trim();
  if (fromProcess) return normalizeMiniCpmLocalEndpointUrl(fromProcess);
  const envPath = resolve(workspacePath, runtimeEnvRoot, `${endpointEnvName}.value`);
  if (!isPathInside(workspacePath, envPath) || !existsSync(envPath)) return undefined;
  const value = readFileSync(envPath, "utf8").trim();
  return value ? normalizeMiniCpmLocalEndpointUrl(value) : undefined;
}

function normalizeMiniCpmLocalEndpointUrl(endpointUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl.trim());
  } catch {
    throw new Error(`Invalid MiniCPM-V endpoint URL: ${endpointUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MiniCPM-V endpointUrl must use http:// or https://.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error(`MiniCPM-V endpointUrl must be local-only: use localhost, 127.0.0.1, or [::1]. ${miniCpmRemoteEndpointBlockedMessage()}`);
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error("MiniCPM-V endpointUrl must be the endpoint origin, not a /v1 or request path.");
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function resolveMiniCpmInputImage(
  workspacePath: string,
  input: MiniCpmVisionImageInputReference,
  options: { allowExternal: boolean; role: "primary" | "reference" },
): Promise<MiniCpmVisionImageSummary> {
  const imagePath = input.path;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(imagePath)) {
    throw new Error("MiniCPM-V image input must be an approved local file path, not a remote URL.");
  }
  const resolvedImage = input.absolute ? resolve(imagePath) : resolve(workspacePath, imagePath);
  if (isPathInside(workspacePath, resolvedImage)) {
    return annotateImageSummary(await imageSummary(workspacePath, resolvedImage), input, options.role);
  }
  if (!options.allowExternal) {
    throw new Error("MiniCPM-V image input must stay inside the workspace unless allowExternalImagePaths is enabled.");
  }
  const external = await imageSummary(dirname(resolvedImage), resolvedImage);
  const safeBase = safePathSegment(external.basename);
  const copiedPath = resolve(workspacePath, inputRootPath, `${external.sha256.slice(0, 16)}-${safeBase}`);
  if (!isPathInside(workspacePath, copiedPath)) throw new Error("Resolved MiniCPM-V managed image path is outside the workspace.");
  await mkdir(dirname(copiedPath), { recursive: true });
  await writeFile(join(resolve(workspacePath, inputRootPath), ".gitignore"), "*\n", "utf8");
  await writeFile(copiedPath, await readFile(resolvedImage));
  const copied = await imageSummary(workspacePath, copiedPath);
  return {
    ...copied,
    role: options.role,
    ...(input.source ? { source: input.source } : { source: "external_file" }),
    ...(input.label ? { label: input.label } : {}),
    copiedFromExternalPath: true,
  };
}

function annotateImageSummary(
  image: MiniCpmVisionImageSummary,
  input: MiniCpmVisionImageInputReference,
  role: "primary" | "reference",
): MiniCpmVisionImageSummary {
  return {
    ...image,
    role,
    ...(input.source ? { source: input.source } : { source: input.absolute ? "external_file" : "workspace_file" }),
    ...(input.label ? { label: input.label } : {}),
  };
}

function primaryVisualInputReference(input: MiniCpmVisionAnalyzeInput): (
  | { kind: "image"; image: MiniCpmVisionImageInputReference }
  | { kind: "video"; video: MiniCpmVisionVideoInputReference }
) {
  const image = primaryImageInputReference(input);
  const video = primaryVideoInputReference(input);
  if (image && video) throw new Error("MiniCPM-V visual analysis accepts one primary visual input: use image/imagePath or video/videoPath, not both.");
  if (image) return { kind: "image", image };
  if (video) return { kind: "video", video };
  throw new Error("MiniCPM-V visual analysis requires image.path, imagePath, video.path, or videoPath.");
}

function primaryImageInputReference(input: MiniCpmVisionAnalyzeInput): MiniCpmVisionImageInputReference | undefined {
  if (input.image?.path?.trim()) return normalizeImageInputReference(input.image, "image");
  if (input.imagePath?.trim()) return { path: input.imagePath.trim() };
  return undefined;
}

function primaryVideoInputReference(input: MiniCpmVisionAnalyzeInput): MiniCpmVisionVideoInputReference | undefined {
  if (input.video?.path?.trim()) return normalizeVideoInputReference(input.video, "video");
  if (input.videoPath?.trim()) return { path: input.videoPath.trim() };
  return undefined;
}

function referenceImageInputReference(input: MiniCpmVisionAnalyzeInput): MiniCpmVisionImageInputReference | undefined {
  if (input.referenceImage?.path?.trim()) return normalizeImageInputReference(input.referenceImage, "referenceImage");
  if (input.referenceImagePath?.trim()) return { path: input.referenceImagePath.trim(), label: "reference" };
  return undefined;
}

function normalizeImageInputReference(input: MiniCpmVisionImageInputReference, label: string): MiniCpmVisionImageInputReference {
  if (!input.path?.trim()) throw new Error(`MiniCPM-V ${label}.path is required.`);
  return {
    path: input.path.trim(),
    ...(input.absolute === true ? { absolute: true } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
  };
}

function normalizeVideoInputReference(input: MiniCpmVisionVideoInputReference, label: string): MiniCpmVisionVideoInputReference {
  if (!input.path?.trim()) throw new Error(`MiniCPM-V ${label}.path is required.`);
  return {
    path: input.path.trim(),
    ...(input.absolute === true ? { absolute: true } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(typeof input.frameTimestampMs === "number" ? { frameTimestampMs: normalizeFrameTimestampMs(input.frameTimestampMs) } : {}),
  };
}

async function imageSummary(workspacePath: string, absolutePath: string): Promise<MiniCpmVisionImageSummary> {
  const details = await stat(absolutePath);
  if (!details.isFile()) throw new Error(`MiniCPM-V image input is not a file: ${absolutePath}`);
  if (details.size > maxImageBytes) throw new Error(`MiniCPM-V image input exceeds ${maxImageBytes} bytes: ${details.size}`);
  const extension = extname(absolutePath).toLowerCase();
  if (!imageExtensions.has(extension)) throw new Error(`Unsupported MiniCPM-V image extension: ${extension || "(none)"}`);
  const bytes = await readFile(absolutePath);
  return {
    path: toWorkspaceRelativePath(workspacePath, absolutePath),
    basename: basename(absolutePath),
    bytes: details.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function resolveMiniCpmInputVideoFrame(
  workspacePath: string,
  input: MiniCpmVisionVideoInputReference,
  options: { allowExternal: boolean; frameTimestampMs?: number },
): Promise<{ video: MiniCpmVisionVideoSummary; image: MiniCpmVisionImageSummary }> {
  const timestampMs = normalizeFrameTimestampMs(input.frameTimestampMs ?? options.frameTimestampMs ?? 1_000);
  const video = await resolveMiniCpmInputVideo(workspacePath, input, {
    allowExternal: options.allowExternal,
    frameTimestampMs: timestampMs,
  });
  const ffmpeg = commandPath("ffmpeg");
  if (!ffmpeg) throw new Error("MiniCPM-V video frame extraction requires ffmpeg on PATH.");

  const sourceVideoPath = resolve(workspacePath, video.path);
  const videoStem = safePathSegment(basename(video.basename, extname(video.basename)) || "video");
  const framePath = resolve(workspacePath, frameRootPath, `${video.sha256.slice(0, 16)}-${timestampMs}ms-${videoStem}.png`);
  if (!isPathInside(workspacePath, framePath)) throw new Error("Resolved MiniCPM-V managed frame path is outside the workspace.");
  await mkdir(dirname(framePath), { recursive: true });
  await writeFile(join(resolve(workspacePath, frameRootPath), ".gitignore"), "*\n", "utf8");

  const result = spawnSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    formatTimestampSeconds(timestampMs),
    "-i",
    sourceVideoPath,
    "-frames:v",
    "1",
    "-f",
    "image2",
    framePath,
  ], { encoding: "utf8", timeout: 60_000 });
  if (result.error) throw new Error(`MiniCPM-V video frame extraction failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stderr?.trim(), result.stdout?.trim()].filter(Boolean).join("\n");
    throw new Error(`MiniCPM-V video frame extraction failed${detail ? `: ${detail}` : "."}`);
  }

  const frame = await imageSummary(workspacePath, framePath);
  const image = {
    ...frame,
    role: "primary" as const,
    source: "video_frame" as const,
    label: input.label ? `${input.label} frame ${timestampMs}ms` : `video frame ${timestampMs}ms`,
  };
  return {
    video: {
      ...video,
      frameImagePath: image.path,
    },
    image,
  };
}

async function resolveMiniCpmInputVideo(
  workspacePath: string,
  input: MiniCpmVisionVideoInputReference,
  options: { allowExternal: boolean; frameTimestampMs: number },
): Promise<MiniCpmVisionVideoSummary> {
  const videoPath = input.path;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(videoPath)) {
    throw new Error("MiniCPM-V video input must be an approved local file path, not a remote URL.");
  }
  const resolvedVideo = input.absolute ? resolve(videoPath) : resolve(workspacePath, videoPath);
  if (isPathInside(workspacePath, resolvedVideo)) {
    return annotateVideoSummary(await videoSummary(workspacePath, resolvedVideo, options.frameTimestampMs), input);
  }
  if (!options.allowExternal) {
    throw new Error("MiniCPM-V video input must stay inside the workspace unless allowExternalMediaPaths is enabled.");
  }
  const external = await videoSummary(dirname(resolvedVideo), resolvedVideo, options.frameTimestampMs);
  const safeBase = safePathSegment(external.basename);
  const copiedPath = resolve(workspacePath, inputRootPath, "videos", `${external.sha256.slice(0, 16)}-${safeBase}`);
  if (!isPathInside(workspacePath, copiedPath)) throw new Error("Resolved MiniCPM-V managed video path is outside the workspace.");
  await mkdir(dirname(copiedPath), { recursive: true });
  await writeFile(join(resolve(workspacePath, inputRootPath), ".gitignore"), "*\n", "utf8");
  await writeFile(copiedPath, await readFile(resolvedVideo));
  const copied = await videoSummary(workspacePath, copiedPath, options.frameTimestampMs);
  return {
    ...copied,
    ...(input.source ? { source: input.source } : { source: "external_file" as const }),
    ...(input.label ? { label: input.label } : {}),
    copiedFromExternalPath: true,
  };
}

function annotateVideoSummary(
  video: MiniCpmVisionVideoSummary,
  input: MiniCpmVisionVideoInputReference,
): MiniCpmVisionVideoSummary {
  return {
    ...video,
    ...(input.source ? { source: input.source } : { source: input.absolute ? "external_file" : "workspace_file" }),
    ...(input.label ? { label: input.label } : {}),
  };
}

async function videoSummary(workspacePath: string, absolutePath: string, frameTimestampMs: number): Promise<MiniCpmVisionVideoSummary> {
  const details = await stat(absolutePath);
  if (!details.isFile()) throw new Error(`MiniCPM-V video input is not a file: ${absolutePath}`);
  if (details.size > maxVideoBytes) throw new Error(`MiniCPM-V video input exceeds ${maxVideoBytes} bytes: ${details.size}`);
  const extension = extname(absolutePath).toLowerCase();
  if (!videoExtensions.has(extension)) throw new Error(`Unsupported MiniCPM-V video extension: ${extension || "(none)"}`);
  const bytes = await readFile(absolutePath);
  return {
    path: toWorkspaceRelativePath(workspacePath, absolutePath),
    basename: basename(absolutePath),
    bytes: details.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    frameTimestampMs,
  };
}

function resolveMiniCpmOutputJsonPath(workspacePath: string, outputJsonPath: string | undefined, task: MiniCpmVisionTask): string {
  const fallback = join(analysisRootPath, `${new Date().toISOString().replace(/[:.]/g, "-")}-${task}.json`);
  const resolved = resolve(workspacePath, outputJsonPath?.trim() || fallback);
  if (!isPathInside(workspacePath, resolved)) throw new Error("MiniCPM-V output JSON path must stay inside the workspace.");
  return resolved;
}

function workspaceRelativeArtifactPath(workspacePath: string, artifactPath: string): string | undefined {
  const resolved = isAbsolute(artifactPath) ? resolve(artifactPath) : resolve(workspacePath, artifactPath);
  if (!isPathInside(workspacePath, resolved)) return undefined;
  return toWorkspaceRelativePath(workspacePath, resolved);
}

async function readMiniCpmFullArtifact(path: string): Promise<MiniCpmVisionFullArtifact> {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  return isRecord(parsed) ? parsed as MiniCpmVisionFullArtifact : {};
}

async function writeMiniCpmValidationMetadata(
  workspacePath: string,
  input: Omit<MiniCpmVisionValidationMetadata, "schemaVersion" | "provider" | "packageName">,
): Promise<MiniCpmVisionValidationMetadata> {
  const path = resolveValidationMetadataPath(workspacePath);
  const metadata: MiniCpmVisionValidationMetadata = {
    schemaVersion: validationSchemaVersion,
    provider,
    packageName,
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
  if (!isPathInside(workspace, path)) throw new Error("Resolved MiniCPM-V validation metadata path is outside the workspace.");
  return path;
}

function collectMiniCpmRuntimeCandidates(
  workspacePath: string,
  userPath: string | undefined,
  options: { autoDetect: boolean; includeManagedRuntime?: boolean; manifest?: MiniCpmVisionRuntimeReleaseManifest },
): MiniCpmVisionRuntimeCandidate[] {
  const candidates: MiniCpmVisionRuntimeCandidate[] = [];
  if (userPath?.trim()) candidates.push(runtimeCandidate(resolve(userPath.trim()), "user"));

  if (options.includeManagedRuntime !== false) {
    const managed = ambientManagedRuntimeCandidate(workspacePath, options.manifest);
    if (managed) candidates.push(managed);
  }

  const configured = process.env[runtimeBinaryEnvName]?.trim();
  if (configured) {
    const configuredPath = configured.includes("/") || configured.includes("\\") ? resolve(configured) : configured;
    candidates.push(runtimeCandidate(configuredPath, "process-env"));
  }

  if (options.autoDetect) {
    const pathCommand = commandPath("llama-server");
    if (pathCommand) candidates.push(runtimeCandidate(pathCommand, "path"));
    for (const known of knownRuntimePaths()) candidates.push(runtimeCandidate(known, "known-location"));
  }

  return mergeRuntimeCandidates(candidates, []);
}

function ambientManagedRuntimeCandidate(
  workspacePath: string,
  manifest: MiniCpmVisionRuntimeReleaseManifest | undefined,
): MiniCpmVisionRuntimeCandidate | undefined {
  const runtimeWorkspacePath = managedInstallWorkspacePath(workspacePath);
  const selectedArtifact = selectMiniCpmRuntimeInstallArtifact(manifest ?? miniCpmRuntimeReleaseManifestPrototype, undefined);
  if (!selectedArtifact) return undefined;
  const binaryPath = resolve(runtimeWorkspacePath, runtimeDownloadRootPath, selectedArtifact.cacheSubdir, selectedArtifact.binaryRelativePath);
  if (!isPathInside(runtimeWorkspacePath, binaryPath)) return undefined;
  if (!existsSync(binaryPath)) return undefined;
  return runtimeCandidate(binaryPath, "ambient-managed-runtime");
}

function mergeRuntimeCandidates(
  candidates: MiniCpmVisionRuntimeCandidate[],
  additional: MiniCpmVisionRuntimeCandidate[],
): MiniCpmVisionRuntimeCandidate[] {
  const unique = new Map<string, MiniCpmVisionRuntimeCandidate>();
  for (const candidate of [...candidates, ...additional]) {
    if (!unique.has(candidate.path)) unique.set(candidate.path, candidate);
  }
  return Array.from(unique.values());
}

function runtimeCandidate(path: string, source: MiniCpmVisionRuntimeCandidate["source"]): MiniCpmVisionRuntimeCandidate {
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

function runtimePathCandidate(path: string): string {
  return path.includes("/") || path.includes("\\") ? resolve(path) : path;
}

function bestRuntimeCandidate(candidates: MiniCpmVisionRuntimeCandidate[]): MiniCpmVisionRuntimeCandidate | undefined {
  return candidates.find((candidate) => candidate.available);
}

function buildMiniCpmRuntimeContract(input: {
  configuredEndpointUrl?: string;
  selectedRuntime?: MiniCpmVisionRuntimeCandidate;
  runtimeCandidates?: MiniCpmVisionRuntimeCandidate[];
  statusPayload?: MiniCpmVisionStatusPayload;
}): MiniCpmVisionRuntimeContract {
  const endpoint = input.configuredEndpointUrl ?? (input.statusPayload?.endpointMode === "existing-local-endpoint" ? input.statusPayload.endpoint : undefined);
  const selectedRuntime = input.selectedRuntime ?? input.runtimeCandidates?.find((candidate) => candidate.available);
  const managedRuntime = !endpoint && selectedRuntime?.source === "ambient-managed-runtime";
  const mode: MiniCpmVisionRuntimeContract["mode"] = endpoint
    ? "existing-local-endpoint"
    : managedRuntime
      ? "ambient-managed-runtime"
      : "user-managed-runtime";
  const binaryPath = !endpoint ? input.statusPayload?.runtime?.binary ?? selectedRuntime?.path : undefined;
  const version = input.statusPayload?.runtime?.version;
  const manifestVerification = input.statusPayload?.runtimeContract?.ambientManagedDownload.manifestVerification
    ?? verifyMiniCpmRuntimeReleaseManifest({ platform: platform(), arch: arch() });
  const preflight = endpoint
    ? existingEndpointPreflight({ endpoint, statusPayload: input.statusPayload })
    : runtimeBinaryPreflight({ binaryPath, selectedRuntime, statusPayload: input.statusPayload });
  return {
    mode,
    status: "active",
    runtime: endpoint ? "OpenAI-compatible local MiniCPM endpoint" : "llama.cpp llama-server",
    ...(binaryPath ? { binaryPath } : {}),
    ...(selectedRuntime?.source ? { binarySource: selectedRuntime.source } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(version ? { version } : {}),
    runtimeCacheRoot: runtimeDownloadRootPath,
    modelCacheRoots: modelCacheRootsForPlatform(),
    modelAssets: [
      "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
      "openbmb/MiniCPM-V-4.6-gguf:q4_k_m experimental comparison",
    ],
    installPlan: endpoint
      ? [
          "Connect to a user-approved localhost/127.0.0.1/[::1] OpenAI-compatible MiniCPM endpoint.",
          "Ambient validates /health and /v1/models before routing image analysis to the endpoint.",
          "Ambient does not start, stop, download models for, or clean up user-managed existing endpoints.",
        ]
      : managedRuntime
        ? [
            "Ambient installed a pinned llama.cpp runtime into the ignored workspace runtime cache from either the default managed download path or a user-approved local archive.",
            "Ambient verifies the archive SHA-256 and extracted llama-server SHA-256 before binding the managed runtime.",
            "Model and projector downloads still use llama.cpp/Hugging Face caches until Ambient-managed model caching is implemented.",
          ]
      : [
          "Install/Repair can fetch the default managed macOS arm64 or Linux x64 llama.cpp runtime when no endpoint, local binary, or local archive is supplied.",
          "User-managed llama.cpp llama-server binaries can still be selected from an approved path, PATH, process env, or known local install location.",
          "Ambient binds the selected binary through an ignored workspace-local env file after setup validation succeeds.",
          "Model and projector downloads stay in llama.cpp/Hugging Face caches unless a future Ambient-managed model cache is explicitly implemented.",
        ],
    preflight,
    ambientManagedDownload: {
      status: managedRuntime ? "active" : "planned",
      cacheRoot: runtimeDownloadRootPath,
      requirements: [
        "Pinned per-platform llama.cpp release manifest with source URLs, expected binary names, and SHA-256 checksums.",
        "macOS app-managed execution policy: checksum-verified, quarantine-free managed copy with a valid code signature; Gatekeeper acceptance is recorded separately.",
        "Linux GPU backend selection and driver preflight, with CPU fallback labeled separately from validated GPU lanes.",
        "Windows path quoting, firewall prompt, process lifecycle, GPU backend, and cache-location smoke before broad support.",
      ],
      blockers: [
        "Default managed runtime download is recommended only for the pinned macOS arm64 and Linux x64 artifacts; Windows remains disabled.",
        "No Windows lifecycle smoke evidence exists yet; this does not block the scoped macOS/Linux recommended lane.",
      ],
      manifestVerification,
    },
  };
}

function runtimeBinaryPreflight(input: {
  binaryPath?: string;
  selectedRuntime?: MiniCpmVisionRuntimeCandidate;
  statusPayload?: MiniCpmVisionStatusPayload;
}): MiniCpmVisionRuntimePreflightCheck[] {
  const binaryPath = input.binaryPath;
  const binaryAvailable = Boolean(input.statusPayload?.runtime?.binaryAvailable ?? input.selectedRuntime?.available);
  const checks: MiniCpmVisionRuntimePreflightCheck[] = [
    binaryPath
      ? {
          id: "runtime-binary-present",
          label: "llama-server binary",
          status: binaryAvailable || existsSync(binaryPath) ? "passed" : "failed",
          detail: binaryAvailable || existsSync(binaryPath) ? `Found llama-server at ${binaryPath}.` : `No llama-server binary found at ${binaryPath}.`,
        }
      : {
          id: "runtime-binary-present",
          label: "llama-server binary",
          status: "failed",
          detail: "No llama-server binary has been selected or discovered.",
        },
  ];
  checks.push(
    binaryPath ? runtimeExecutablePreflight(binaryPath) : {
      id: "runtime-binary-executable",
      label: "Executable permission",
      status: "not-run",
      detail: "Executable permission cannot be checked until a binary path is selected.",
    },
  );
  checks.push({
    id: "runtime-version",
    label: "Runtime version",
    status: input.statusPayload?.runtime?.version ? "passed" : binaryAvailable ? "warning" : "not-run",
    detail: input.statusPayload?.runtime?.version
      ? `Runtime reported ${input.statusPayload.runtime.version}.`
      : binaryAvailable
        ? "Runtime binary exists, but version was not reported by status preflight."
        : "Runtime version cannot be checked until llama-server is available.",
  });
  checks.push({
    id: "model-cache-policy",
    label: "Model cache policy",
    status: "warning",
    detail: "MiniCPM-V model/projector downloads currently use llama.cpp/Hugging Face caches; Ambient-managed model cache is not implemented for this provider yet.",
  });
  checks.push({
    id: "acceleration-lane",
    label: "Acceleration lane",
    status: miniCpmRuntimeLane().includes("unvalidated") ? "warning" : "passed",
    detail: `Current host lane is ${miniCpmRuntimeLane()}.`,
  });
  return checks;
}

function runtimeExecutablePreflight(binaryPath: string): MiniCpmVisionRuntimePreflightCheck {
  try {
    const details = statSync(binaryPath);
    if (!details.isFile()) {
      return { id: "runtime-binary-executable", label: "Executable permission", status: "failed", detail: `Runtime path is not a file: ${binaryPath}.` };
    }
    if (platform() === "win32" || (details.mode & 0o111) !== 0) {
      return { id: "runtime-binary-executable", label: "Executable permission", status: "passed", detail: "Runtime binary is executable by the current host." };
    }
    return { id: "runtime-binary-executable", label: "Executable permission", status: "failed", detail: `Runtime binary is not executable: ${binaryPath}.` };
  } catch (error) {
    return { id: "runtime-binary-executable", label: "Executable permission", status: "failed", detail: errorMessage(error) };
  }
}

function existingEndpointPreflight(input: {
  endpoint: string;
  statusPayload?: MiniCpmVisionStatusPayload;
}): MiniCpmVisionRuntimePreflightCheck[] {
  return [
    {
      id: "endpoint-locality",
      label: "Endpoint locality",
      status: "passed",
      detail: `Endpoint is restricted to approved local origin ${input.endpoint}.`,
    },
    {
      id: "endpoint-health",
      label: "Endpoint health",
      status: input.statusPayload?.available ? "passed" : "warning",
      detail: input.statusPayload?.available
        ? "Endpoint passed health and model-list checks."
        : "Endpoint has not passed both /health and /v1/models checks yet.",
    },
    {
      id: "endpoint-lifecycle",
      label: "Endpoint lifecycle",
      status: "warning",
      detail: "Existing endpoints are user-managed; Ambient will not start, stop, download models for, or clean up this runtime.",
    },
  ];
}

function modelCacheRootsForPlatform(): string[] {
  const home = homedir();
  if (platform() === "darwin") {
    return [
      join(home, "Library/Caches/llama.cpp"),
      join(home, ".cache/huggingface/hub"),
    ];
  }
  if (platform() === "win32") {
    return [
      join(home, "AppData/Local/llama.cpp"),
      join(home, ".cache/huggingface/hub"),
    ];
  }
  return [
    join(home, ".cache/llama.cpp"),
    join(home, ".cache/huggingface/hub"),
  ];
}

function knownRuntimePaths(): string[] {
  const home = homedir();
  const paths = [
    join(home, "RCLI/deps/llama.cpp/build/bin/llama-server"),
    join(home, "llama.cpp/build/bin/llama-server"),
    join(home, ".local/bin/llama-server"),
  ];
  if (platform() === "darwin") {
    paths.push("/opt/homebrew/bin/llama-server", "/usr/local/bin/llama-server");
  } else if (platform() === "win32") {
    paths.push(join(home, "AppData/Local/Programs/llama.cpp/llama-server.exe"), "C:/Program Files/llama.cpp/llama-server.exe");
  } else {
    paths.push("/usr/local/bin/llama-server", "/usr/bin/llama-server");
  }
  return paths;
}

function commandPath(command: string): string | undefined {
  const result = platform() === "win32"
    ? spawnSync("where", [command], { encoding: "utf8" })
    : spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  return result.stdout.trim().split(/\r?\n/).find(Boolean);
}

function miniCpmRuntimeLane(): string {
  if (platform() === "darwin" && arch() === "arm64") return "macos-arm64-metal";
  if (platform() === "darwin") return `macos-${arch()}-cpu`;
  if (platform() === "linux" && arch() === "x64" && commandPath("nvidia-smi")) return "linux-x64-nvidia-cuda";
  if (platform() === "linux") return `linux-${arch()}-cpu`;
  if (platform() === "win32") return `windows-${arch()}-unvalidated`;
  return `${platform()}-${arch()}-unknown`;
}

function setupResult(input: {
  action: MiniCpmVisionSetupResult["action"];
  status: MiniCpmVisionSetupResult["status"];
  installStatuses: FirstPartyAmbientCliPackageInstallStatus[];
  validation: MiniCpmVisionValidationMetadata;
  runtimeCandidates: MiniCpmVisionRuntimeCandidate[];
  statusPayload?: Record<string, unknown>;
  cleanup?: MiniCpmVisionCleanupResult;
  runtimeInstall?: MiniCpmVisionRuntimeInstallResult;
  nextSteps: string[];
}): MiniCpmVisionSetupResult {
  const successStatus =
    (input.status === "ready" && (input.validation.status === "passed" || input.validation.status === "runtime-ready"))
    || (input.status === "stopped" && input.validation.status === "stopped");
  const diagnostics = successStatus ? [] : input.validation.diagnostics ?? miniCpmVisionDiagnosticsForFailure({
    setupStatus: input.status,
    validationStatus: input.validation.status,
    error: input.validation.error,
    missingHints: input.validation.missingHints,
    runtimeCandidates: input.runtimeCandidates,
  });
  const validation = successStatus && input.validation.diagnostics?.length
    ? { ...input.validation, diagnostics }
    : input.validation;
  return {
    provider,
    action: input.action,
    status: input.status,
    packageName,
    installStatuses: input.installStatuses,
    runtimeCandidates: input.runtimeCandidates,
    validation,
    diagnostics,
    ...(validation.runtimeContract ? { runtimeContract: validation.runtimeContract } : {}),
    ...(input.cleanup ? { cleanup: input.cleanup } : {}),
    ...(input.runtimeInstall ?? validation.runtimeInstall ? { runtimeInstall: input.runtimeInstall ?? validation.runtimeInstall } : {}),
    ...(input.statusPayload ? { statusPayload: input.statusPayload } : {}),
    nextSteps: input.nextSteps,
  };
}

function miniCpmRuntimeStateFromStatus(
  statusPayload: MiniCpmVisionStatusPayload,
  input: { now: () => Date; previousPid?: number; stoppedAt?: string },
): MiniCpmVisionRuntimeState {
  const status = miniCpmRuntimeStateStatus(statusPayload);
  const previousPid = input.previousPid ?? statusPayload.server?.previousPid;
  return {
    status,
    running: status === "running",
    recordedAt: input.now().toISOString(),
    ...(statusPayload.server?.pid ? { pid: statusPayload.server.pid } : {}),
    ...(previousPid ? { previousPid } : {}),
    ...(statusPayload.endpoint ? { endpoint: statusPayload.endpoint } : {}),
    ...(statusPayload.endpointMode ? { endpointMode: statusPayload.endpointMode } : {}),
    ...(statusPayload.runtime?.defaultModel ? { model: statusPayload.runtime.defaultModel } : {}),
    ...(statusPayload.reason ? { reason: statusPayload.reason } : {}),
    ...(statusPayload.server?.logPath ? { logPath: statusPayload.server.logPath } : {}),
    ...(statusPayload.server?.stderrPath ? { stderrPath: statusPayload.server.stderrPath } : {}),
    ...(statusPayload.server?.stoppedAt ?? input.stoppedAt ? { stoppedAt: statusPayload.server?.stoppedAt ?? input.stoppedAt } : {}),
  };
}

function miniCpmRuntimeStateStatus(statusPayload: MiniCpmVisionStatusPayload): MiniCpmVisionRuntimeState["status"] {
  if (statusPayload.server?.running === true && statusPayload.status === "ready") return "running";
  if (statusPayload.server?.running === true) return "starting_or_unhealthy";
  if (statusPayload.status === "not_running") return "stopped";
  if (statusPayload.status === "starting_or_unhealthy") return "starting_or_unhealthy";
  return "unknown";
}

function normalizeMiniCpmValidationMetadata(input: unknown): MiniCpmVisionValidationMetadata | undefined {
  if (!isRecord(input) || input.schemaVersion !== validationSchemaVersion || input.provider !== provider || input.packageName !== packageName) return undefined;
  const image = normalizeMiniCpmImageSummary(input.image);
  const cleanup = normalizeMiniCpmCleanupResult(input.cleanup);
  const runtimeContract = normalizeMiniCpmRuntimeContract(input.runtimeContract);
  const runtimeInstall = normalizeMiniCpmRuntimeInstallResult(input.runtimeInstall);
  const runtimeState = normalizeMiniCpmRuntimeState(input.runtimeState);
  return {
    schemaVersion: validationSchemaVersion,
    provider,
    packageName,
    status: ["not-run", "runtime-ready", "passed", "stopped", "needs-runtime", "failed", "uninstalled"].includes(String(input.status)) ? input.status as MiniCpmVisionValidationMetadata["status"] : "not-run",
    updatedAt: stringValue(input.updatedAt) ?? new Date(0).toISOString(),
    platform: stringValue(input.platform) ?? "unknown",
    arch: stringValue(input.arch) ?? "unknown",
    lane: stringValue(input.lane) ?? "unknown",
    ...(stringValue(input.binaryPath) ? { binaryPath: stringValue(input.binaryPath) } : {}),
    ...(stringValue(input.runtimeVersion) ? { runtimeVersion: stringValue(input.runtimeVersion) } : {}),
    ...(stringValue(input.model) ? { model: stringValue(input.model) } : {}),
    ...(stringValue(input.experimentalModel) ? { experimentalModel: stringValue(input.experimentalModel) } : {}),
    ...(stringValue(input.endpoint) ? { endpoint: stringValue(input.endpoint) } : {}),
    ...(input.endpointMode === "managed-local-server" || input.endpointMode === "existing-local-endpoint" ? { endpointMode: input.endpointMode } : {}),
    ...(stringArray(input.endpointModelIds).length ? { endpointModelIds: stringArray(input.endpointModelIds) } : {}),
    ...(stringValue(input.artifactPath) ? { artifactPath: stringValue(input.artifactPath) } : {}),
    ...(image ? { image } : {}),
    ...(stringValue(input.summary) ? { summary: stringValue(input.summary) } : {}),
    ...(typeof input.durationMs === "number" ? { durationMs: input.durationMs } : {}),
    ...(stringValue(input.error) ? { error: stringValue(input.error) } : {}),
    missingHints: stringArray(input.missingHints),
    diagnostics: normalizeMiniCpmDiagnostics(input.diagnostics),
    ...(runtimeContract ? { runtimeContract } : {}),
    ...(runtimeState ? { runtimeState } : {}),
    ...(cleanup ? { cleanup } : {}),
    ...(runtimeInstall ? { runtimeInstall } : {}),
  };
}

function normalizeMiniCpmRuntimeContract(input: unknown): MiniCpmVisionRuntimeContract | undefined {
  if (!isRecord(input)) return undefined;
  const mode = stringValue(input.mode);
  const status = stringValue(input.status);
  const runtime = stringValue(input.runtime);
  const runtimeCacheRoot = stringValue(input.runtimeCacheRoot);
  if (
    !runtime ||
    !runtimeCacheRoot ||
    (mode !== "user-managed-runtime" && mode !== "ambient-managed-runtime" && mode !== "ambient-managed-download" && mode !== "existing-local-endpoint") ||
    (status !== "active" && status !== "planned" && status !== "blocked")
  ) {
    return undefined;
  }
  const binarySource = stringValue(input.binarySource);
  const ambientManagedDownload = normalizeAmbientManagedDownload(recordField(input.ambientManagedDownload));
  return {
    mode,
    status,
    runtime,
    ...(stringValue(input.binaryPath) ? { binaryPath: stringValue(input.binaryPath) } : {}),
    ...(binarySource === "process-env" || binarySource === "path" || binarySource === "known-location" || binarySource === "user" || binarySource === "ambient-managed-runtime" ? { binarySource } : {}),
    ...(stringValue(input.endpoint) ? { endpoint: stringValue(input.endpoint) } : {}),
    ...(stringValue(input.version) ? { version: stringValue(input.version) } : {}),
    runtimeCacheRoot,
    modelCacheRoots: stringArray(input.modelCacheRoots),
    modelAssets: stringArray(input.modelAssets),
    installPlan: stringArray(input.installPlan),
    preflight: normalizeMiniCpmRuntimePreflight(input.preflight),
    ambientManagedDownload,
  };
}

function normalizeAmbientManagedDownload(input: Record<string, unknown>): MiniCpmVisionRuntimeContract["ambientManagedDownload"] {
  const status = stringValue(input.status);
  const manifestVerification = normalizeMiniCpmRuntimeReleaseManifestVerification(input.manifestVerification);
  return {
    status: status === "active" || status === "blocked" ? status : "planned",
    cacheRoot: stringValue(input.cacheRoot) ?? runtimeDownloadRootPath,
    requirements: stringArray(input.requirements),
    blockers: stringArray(input.blockers),
    ...(manifestVerification ? { manifestVerification } : {}),
  };
}

function normalizeMiniCpmRuntimeReleaseManifestVerification(input: unknown): MiniCpmVisionRuntimeReleaseManifestVerification | undefined {
  if (!isRecord(input)) return undefined;
  if (input.schemaVersion !== "ambient-minicpm-v-runtime-release-manifest-v1") return undefined;
  const manifestId = stringValue(input.manifestId);
  const status = stringValue(input.status);
  if (!manifestId || (status !== "passed" && status !== "warning" && status !== "failed" && status !== "blocked")) return undefined;
  return {
    schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
    manifestId,
    status,
    downloadEnabled: booleanValue(input.downloadEnabled) === true,
    checksumAlgorithm: "sha256",
    ...(stringValue(input.selectedArtifactId) ? { selectedArtifactId: stringValue(input.selectedArtifactId) } : {}),
    requiredArtifactFields: stringArray(input.requiredArtifactFields),
    artifacts: normalizeMiniCpmRuntimeReleaseArtifacts(input.artifacts),
    checks: normalizeMiniCpmRuntimeReleaseManifestChecks(input.checks),
    blockers: stringArray(input.blockers),
    ...(stringValue(input.verifiedArchivePath) ? { verifiedArchivePath: stringValue(input.verifiedArchivePath) } : {}),
    ...(stringValue(input.verifiedArchiveSha256) ? { verifiedArchiveSha256: stringValue(input.verifiedArchiveSha256) } : {}),
    ...(stringValue(input.verifiedBinaryPath) ? { verifiedBinaryPath: stringValue(input.verifiedBinaryPath) } : {}),
    ...(stringValue(input.verifiedBinarySha256) ? { verifiedBinarySha256: stringValue(input.verifiedBinarySha256) } : {}),
  };
}

function normalizeMiniCpmRuntimeReleaseArtifacts(input: unknown): MiniCpmVisionRuntimeReleaseArtifact[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): MiniCpmVisionRuntimeReleaseArtifact | undefined => {
      if (!isRecord(item)) return undefined;
      const id = stringValue(item.id);
      const runtimePlatform = stringValue(item.platform);
      const runtimeArch = stringValue(item.arch);
      const lane = stringValue(item.lane);
      const supportTier = stringValue(item.supportTier);
      const acceleration = stringValue(item.acceleration);
      const defaultDownloadEnabled = booleanValue(item.defaultDownloadEnabled) === true;
      const releaseTag = stringValue(item.releaseTag);
      const sourceUrl = stringValue(item.sourceUrl);
      const archiveName = stringValue(item.archiveName);
      const archiveFormat = stringValue(item.archiveFormat);
      const archiveSha256 = stringValue(item.archiveSha256);
      const binaryRelativePath = stringValue(item.binaryRelativePath);
      const cacheSubdir = stringValue(item.cacheSubdir);
      const license = stringValue(item.license);
      const pinStatus = stringValue(item.pinStatus);
      if (
        !id ||
        (runtimePlatform !== "darwin" && runtimePlatform !== "linux" && runtimePlatform !== "win32") ||
        !runtimeArch ||
        !lane ||
        (supportTier !== "conditional" && supportTier !== "experimental") ||
        !acceleration ||
        !releaseTag ||
        !sourceUrl ||
        !archiveName ||
        (archiveFormat !== "zip" && archiveFormat !== "tar.gz" && archiveFormat !== "tgz") ||
        !archiveSha256 ||
        !binaryRelativePath ||
        !cacheSubdir ||
        !license ||
        (pinStatus !== "candidate" && pinStatus !== "pinned" && pinStatus !== "blocked")
      ) {
        return undefined;
      }
      return {
        id,
        platform: runtimePlatform,
        arch: runtimeArch,
        lane,
        supportTier,
        acceleration,
        defaultDownloadEnabled,
        releaseTag,
        sourceUrl,
        archiveName,
        archiveFormat,
        archiveSha256,
        ...(typeof item.archiveSizeBytes === "number" ? { archiveSizeBytes: item.archiveSizeBytes } : {}),
        binaryRelativePath,
        ...(stringValue(item.binarySha256) ? { binarySha256: stringValue(item.binarySha256) } : {}),
        expectedBinaryNames: stringArray(item.expectedBinaryNames),
        cacheSubdir,
        license,
        pinStatus,
        smokeRequirements: stringArray(item.smokeRequirements),
      };
    })
    .filter((item): item is MiniCpmVisionRuntimeReleaseArtifact => Boolean(item));
}

function normalizeMiniCpmRuntimeReleaseManifestChecks(input: unknown): MiniCpmVisionRuntimeReleaseManifestCheck[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): MiniCpmVisionRuntimeReleaseManifestCheck | undefined => {
      if (!isRecord(item)) return undefined;
      const id = stringValue(item.id);
      const label = stringValue(item.label);
      const status = stringValue(item.status);
      const detail = stringValue(item.detail);
      if (!id || !label || !detail || (status !== "passed" && status !== "warning" && status !== "failed" && status !== "blocked" && status !== "not-run")) return undefined;
      return { id, label, status, detail };
    })
    .filter((item): item is MiniCpmVisionRuntimeReleaseManifestCheck => Boolean(item));
}

function normalizeMiniCpmRuntimePreflight(input: unknown): MiniCpmVisionRuntimePreflightCheck[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): MiniCpmVisionRuntimePreflightCheck | undefined => {
      if (!isRecord(item)) return undefined;
      const id = stringValue(item.id);
      const label = stringValue(item.label);
      const status = stringValue(item.status);
      const detail = stringValue(item.detail);
      if (!id || !label || !detail || (status !== "passed" && status !== "warning" && status !== "failed" && status !== "not-run")) return undefined;
      return { id, label, status, detail };
    })
    .filter((item): item is MiniCpmVisionRuntimePreflightCheck => Boolean(item));
}

function normalizeMiniCpmCleanupResult(input: unknown): MiniCpmVisionCleanupResult | undefined {
  if (!isRecord(input)) return undefined;
  const stopStatus = ["stopped", "not-installed", "failed"].includes(String(input.stopStatus))
    ? input.stopStatus as MiniCpmVisionCleanupResult["stopStatus"]
    : "not-installed";
  const packageStatus = ["uninstalled", "not-installed", "failed"].includes(String(input.packageStatus))
    ? input.packageStatus as MiniCpmVisionCleanupResult["packageStatus"]
    : "not-installed";
  return {
    stopStatus,
    ...(stringValue(input.stopError) ? { stopError: stringValue(input.stopError) } : {}),
    packageStatus,
    ...(stringValue(input.packageId) ? { packageId: stringValue(input.packageId) } : {}),
    ...(stringValue(input.packageRootPath) ? { packageRootPath: stringValue(input.packageRootPath) } : {}),
    ...(stringValue(input.packageError) ? { packageError: stringValue(input.packageError) } : {}),
    paths: normalizeMiniCpmCleanupPaths(input.paths),
    preserved: stringArray(input.preserved),
  };
}

function normalizeMiniCpmRuntimeState(input: unknown): MiniCpmVisionRuntimeState | undefined {
  if (!isRecord(input)) return undefined;
  const status = stringValue(input.status);
  const recordedAt = stringValue(input.recordedAt);
  if (
    !recordedAt ||
    (status !== "running" && status !== "stopped" && status !== "not_running" && status !== "starting_or_unhealthy" && status !== "unknown")
  ) {
    return undefined;
  }
  return {
    status,
    running: booleanValue(input.running) === true,
    recordedAt,
    ...(numberValue(input.pid) ? { pid: numberValue(input.pid) } : {}),
    ...(numberValue(input.previousPid) ? { previousPid: numberValue(input.previousPid) } : {}),
    ...(stringValue(input.endpoint) ? { endpoint: stringValue(input.endpoint) } : {}),
    ...(input.endpointMode === "managed-local-server" || input.endpointMode === "existing-local-endpoint" ? { endpointMode: input.endpointMode } : {}),
    ...(stringValue(input.model) ? { model: stringValue(input.model) } : {}),
    ...(stringValue(input.reason) ? { reason: stringValue(input.reason) } : {}),
    ...(stringValue(input.logPath) ? { logPath: stringValue(input.logPath) } : {}),
    ...(stringValue(input.stderrPath) ? { stderrPath: stringValue(input.stderrPath) } : {}),
    ...(stringValue(input.stoppedAt) ? { stoppedAt: stringValue(input.stoppedAt) } : {}),
  };
}

function normalizeMiniCpmRuntimeInstallResult(input: unknown): MiniCpmVisionRuntimeInstallResult | undefined {
  if (!isRecord(input)) return undefined;
  const status = stringValue(input.status);
  if (status !== "installed" && status !== "already-installed" && status !== "failed" && status !== "unsupported") return undefined;
  const source = stringValue(input.source);
  const rollback = stringValue(input.rollback);
  const macosQuarantine = stringValue(input.macosQuarantine);
  const macosSecurity = normalizeMiniCpmRuntimeMacosSecurity(input.macosSecurity);
  const manifestVerification = normalizeMiniCpmRuntimeReleaseManifestVerification(input.manifestVerification);
  return {
    attempted: input.attempted !== false,
    status,
    source: source === "managed-download" ? "managed-download" : "local-archive",
    ...(stringValue(input.artifactId) ? { artifactId: stringValue(input.artifactId) } : {}),
    ...(stringValue(input.downloadUrl) ? { downloadUrl: stringValue(input.downloadUrl) } : {}),
    ...(input.downloadStatus === "downloaded" || input.downloadStatus === "reused" ? { downloadStatus: input.downloadStatus } : {}),
    ...(typeof input.downloadBytes === "number" ? { downloadBytes: input.downloadBytes } : {}),
    ...(typeof input.downloadDurationMs === "number" ? { downloadDurationMs: input.downloadDurationMs } : {}),
    ...(typeof input.downloadPreResponseTimeoutMs === "number" ? { downloadPreResponseTimeoutMs: input.downloadPreResponseTimeoutMs } : {}),
    ...(typeof input.downloadIdleTimeoutMs === "number" ? { downloadIdleTimeoutMs: input.downloadIdleTimeoutMs } : {}),
    ...(stringValue(input.archivePath) ? { archivePath: stringValue(input.archivePath) } : {}),
    ...(stringValue(input.archiveSha256) ? { archiveSha256: stringValue(input.archiveSha256) } : {}),
    ...(stringValue(input.binaryPath) ? { binaryPath: stringValue(input.binaryPath) } : {}),
    ...(stringValue(input.binarySha256) ? { binarySha256: stringValue(input.binarySha256) } : {}),
    ...(stringValue(input.cacheSubdir) ? { cacheSubdir: stringValue(input.cacheSubdir) } : {}),
    ...(stringValue(input.installRoot) ? { installRoot: stringValue(input.installRoot) } : {}),
    ...(stringValue(input.receiptPath) ? { receiptPath: stringValue(input.receiptPath) } : {}),
    ...(rollback === "not-needed" || rollback === "restored-previous-install" || rollback === "failed" ? { rollback } : {}),
    ...(macosQuarantine === "present" || macosQuarantine === "not-present" || macosQuarantine === "not-checked" ? { macosQuarantine } : {}),
    ...(macosSecurity ? { macosSecurity } : {}),
    ...(manifestVerification ? { manifestVerification } : {}),
    ...(stringValue(input.error) ? { error: stringValue(input.error) } : {}),
    missingHints: stringArray(input.missingHints),
  };
}

function normalizeMiniCpmRuntimeMacosSecurity(input: unknown): MiniCpmVisionRuntimeMacosSecurity | undefined {
  if (!isRecord(input) || input.platform !== "darwin") return undefined;
  const quarantineBefore = stringValue(input.quarantineBefore);
  const quarantineAction = stringValue(input.quarantineAction);
  const quarantineAfter = stringValue(input.quarantineAfter);
  const codeSignature = stringValue(input.codeSignature);
  const gatekeeperAssessment = stringValue(input.gatekeeperAssessment);
  const defaultDownloadPromotion = stringValue(input.defaultDownloadPromotion);
  const promotionPolicy = stringValue(input.promotionPolicy);
  if (
    (quarantineBefore !== "present" && quarantineBefore !== "not-present" && quarantineBefore !== "not-checked") ||
    (quarantineAction !== "not-needed" && quarantineAction !== "removed-after-checksum" && quarantineAction !== "failed") ||
    (quarantineAfter !== "present" && quarantineAfter !== "not-present" && quarantineAfter !== "not-checked") ||
    (codeSignature !== "valid" && codeSignature !== "unsigned" && codeSignature !== "invalid" && codeSignature !== "not-run") ||
    (gatekeeperAssessment !== "accepted" && gatekeeperAssessment !== "rejected" && gatekeeperAssessment !== "not-run") ||
    (defaultDownloadPromotion !== "blocked" && defaultDownloadPromotion !== "eligible")
  ) {
    return undefined;
  }
  return {
    platform: "darwin",
    quarantineBefore,
    quarantineAction,
    quarantineAfter,
    codeSignature,
    ...(stringValue(input.codeSignatureDetail) ? { codeSignatureDetail: stringValue(input.codeSignatureDetail) } : {}),
    gatekeeperAssessment,
    ...(stringValue(input.gatekeeperDetail) ? { gatekeeperDetail: stringValue(input.gatekeeperDetail) } : {}),
    defaultDownloadPromotion,
    ...(promotionPolicy === "gatekeeper-accepted" || promotionPolicy === "ambient-managed-valid-signature" ? { promotionPolicy } : {}),
    ...(stringValue(input.promotionBlocker) ? { promotionBlocker: stringValue(input.promotionBlocker) } : {}),
  };
}

function normalizeMiniCpmCleanupPaths(input: unknown): MiniCpmVisionCleanupResult["paths"] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): MiniCpmVisionCleanupResult["paths"][number] | undefined => {
      if (!isRecord(item)) return undefined;
      const path = stringValue(item.path);
      const status = stringValue(item.status);
      if (!path || (status !== "removed" && status !== "not-found" && status !== "failed")) return undefined;
      return {
        path,
        status,
        ...(stringValue(item.error) ? { error: stringValue(item.error) } : {}),
      };
    })
    .filter((item): item is MiniCpmVisionCleanupResult["paths"][number] => Boolean(item));
}

function normalizeMiniCpmDiagnostics(input: unknown): MiniCpmVisionDiagnosticItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): MiniCpmVisionDiagnosticItem | undefined => {
      if (!isRecord(item)) return undefined;
      const code = stringValue(item.code);
      const severity = stringValue(item.severity);
      const title = stringValue(item.title);
      const detail = stringValue(item.detail);
      const nextAction = stringValue(item.nextAction);
      if (!code || !title || !detail || !nextAction) return undefined;
      return {
        code: code as MiniCpmVisionDiagnosticItem["code"],
        severity: severity === "info" || severity === "warning" || severity === "error" ? severity : "error",
        title,
        detail,
        nextAction,
      };
    })
    .filter((item): item is MiniCpmVisionDiagnosticItem => Boolean(item));
}

function normalizeMiniCpmImageSummary(input: unknown): MiniCpmVisionImageSummary | undefined {
  if (!isRecord(input)) return undefined;
  const path = stringValue(input.path);
  const imageBasename = stringValue(input.basename);
  const sha256 = stringValue(input.sha256);
  if (!path || !imageBasename || typeof input.bytes !== "number" || !sha256) return undefined;
  return {
    path,
    basename: imageBasename,
    bytes: input.bytes,
    sha256,
    ...(input.role === "primary" || input.role === "reference" ? { role: input.role } : {}),
    ...(stringValue(input.source) ? { source: stringValue(input.source) as MiniCpmVisionImageSummary["source"] } : {}),
    ...(stringValue(input.label) ? { label: stringValue(input.label) } : {}),
    ...(input.copiedFromExternalPath === true ? { copiedFromExternalPath: true } : {}),
  };
}

function buildMiniCpmPrompt(
  task: MiniCpmVisionTask,
  prompt: string | undefined,
  context: { comparison: boolean; primary: MiniCpmVisionImageSummary; reference?: MiniCpmVisionImageSummary; video?: MiniCpmVisionVideoSummary },
): string {
  const custom = prompt?.trim();
  const base = custom || taskPrompts[task] || taskPrompts.ui_review;
  const videoContext = context.video
    ? [
        "The primary visual input is one PNG frame sampled locally from a short video clip.",
        context.video.label ? `Video label: ${context.video.label}.` : undefined,
        `Frame timestamp: ${context.video.frameTimestampMs}ms.`,
        "Do not infer continuous motion beyond visible evidence in this sampled frame; mark motion or performance claims as uncertain unless the frame clearly supports them.",
      ].filter(Boolean).join(" ")
    : undefined;
  if (!context.comparison || !context.reference) return [videoContext, base].filter(Boolean).join(" ");
  return [
    videoContext,
    "You will receive two images in order: image 1 is the current/primary visual input, and image 2 is the reference/baseline visual input.",
    context.primary.label ? `Image 1 label: ${context.primary.label}.` : undefined,
    context.reference.label ? `Image 2 label: ${context.reference.label}.` : undefined,
    "Compare visible layout, text, hierarchy, alignment, visual defects, and regressions between the two images. Cite which image each comparison point refers to.",
    base,
  ].filter(Boolean).join(" ");
}

const taskPrompts: Record<MiniCpmVisionTask, string> = {
  ui_review: [
    "Inspect this UI screenshot as evidence for Ambient Desktop visual QA.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "Use concrete evidence: quote exact visible labels when legible, or cite a specific region such as sidebar, top bar, canvas, modal, or bottom composer.",
    "Prioritize layout, affordance, defect, accessibility, and visual-quality observations.",
  ].join(" "),
  game_visual_review: [
    "Inspect this game screenshot as evidence for gameplay and visual QA.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "Call out visible HUD state, player/object affordances, defects, readability, feedback, and performance-relevant visual symptoms.",
  ].join(" "),
  screenshot_ocr: [
    "Extract visible text and summarize the screen from this image.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "Each observation should focus on a concrete visible label, status, control, or potentially ambiguous text region.",
  ].join(" "),
  image_description: [
    "Describe the image using concrete visual evidence.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "Avoid speculation unless marked as low confidence.",
  ].join(" "),
  design_comparison: [
    "Review this visual design for implementation quality.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "Prioritize spacing, alignment, hierarchy, typography, affordances, contrast, and visible defects.",
  ].join(" "),
  video_frame_review: [
    "Inspect this extracted video frame as evidence for visual QA.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "Call out visible state, motion/performance clues if inferable, layout defects, and uncertainty from the single frame.",
  ].join(" "),
};

async function runMiniCpmCommand(
  workspacePath: string,
  input: { command: string; args?: string[]; timeoutMs?: number; env?: Record<string, string | undefined>; signal?: AbortSignal },
): Promise<AmbientCliRunResult> {
  return runAmbientCliPackageCommand(workspacePath, {
    packageName,
    command: input.command,
    args: input.args,
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.env ? { env: input.env } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

function emitMiniCpmVisionProgress(
  options: Pick<SetupMiniCpmVisionProviderOptions, "onProgress">,
  event: MiniCpmVisionProgressEvent,
): void {
  try {
    options.onProgress?.(event);
  } catch {
    // Progress callbacks must not affect provider execution.
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw abortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /aborted|abort/i.test(error.message));
}

function abortError(): Error {
  const error = new Error("MiniCPM-V provider setup was canceled before activation.");
  error.name = "AbortError";
  return error;
}

function commandSummary(command: MiniCpmVisionAnalysisCommandSummary["command"], result: AmbientCliRunResult): MiniCpmVisionAnalysisCommandSummary {
  return {
    command,
    durationMs: result.durationMs,
    ...(result.stdoutOutput?.artifactPath ? { stdoutArtifactPath: result.stdoutOutput.artifactPath } : {}),
    ...(result.stderrOutput?.artifactPath ? { stderrArtifactPath: result.stderrOutput.artifactPath } : {}),
  };
}

function normalizeCliPreview(input: unknown): MiniCpmVisionCliPreview {
  if (!isRecord(input)) throw new Error("MiniCPM-V analysis stdout was not a JSON object.");
  const observations = Array.isArray(input.observations)
    ? input.observations.filter(isMiniCpmObservation)
    : undefined;
  return {
    providerId: stringValue(input.providerId),
    status: stringValue(input.status),
    model: stringValue(input.model),
    latencyMs: typeof input.latencyMs === "number" ? input.latencyMs : undefined,
    summary: stringValue(input.summary),
    observations,
    limitations: stringArray(input.limitations),
    image: isRecord(input.image)
      ? {
          basename: stringValue(input.image.basename),
          bytes: typeof input.image.bytes === "number" ? input.image.bytes : undefined,
          sha256: stringValue(input.image.sha256),
        }
      : undefined,
    artifacts: isRecord(input.artifacts) ? { jsonPath: stringValue(input.artifacts.jsonPath) } : undefined,
  };
}

function isMiniCpmObservation(input: unknown): input is MiniCpmVisionObservation {
  if (!isRecord(input)) return false;
  return typeof input.description === "string"
    && typeof input.evidence === "string"
    && ["layout", "text", "affordance", "defect", "visual_quality", "accessibility", "gameplay", "uncertainty"].includes(String(input.kind))
    && ["low", "medium", "high"].includes(String(input.confidence));
}

function parseJsonObject(content: string, label: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function recordPayload(input: MiniCpmVisionStatusPayload): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

function recordField(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function toWorkspaceRelativePath(workspacePath: string, absolutePath: string): string {
  return relative(resolve(workspacePath), resolve(absolutePath)).split(sep).join("/");
}

function safePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return sanitized || "image";
}

function normalizeFrameTimestampMs(value: number): number {
  if (!Number.isFinite(value)) throw new Error("MiniCPM-V frameTimestampMs must be a finite number.");
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > maxFrameTimestampMs) {
    throw new Error(`MiniCPM-V frameTimestampMs must be between 0 and ${maxFrameTimestampMs}.`);
  }
  return rounded;
}

function formatTimestampSeconds(timestampMs: number): string {
  return (timestampMs / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function defaultMissingRuntimeHints(): string[] {
  return [
    "Build or install llama.cpp with llama-server, then bind AMBIENT_MINICPM_V_LLAMA_SERVER if it is not on PATH.",
    "Default model is openbmb/MiniCPM-V-4_5-gguf:q4_k_m; first start may download model and projector files through llama.cpp/Hugging Face cache.",
  ];
}

function defaultExistingEndpointHints(): string[] {
  return [
    "Start the approved local MiniCPM-compatible endpoint and confirm /health and /v1/models respond before validating again.",
    "Remote MiniCPM-V endpoints are blocked until Ambient has a separate security-reviewed hosted-provider path.",
  ];
}

function missingRuntimeNextSteps(missingHints: string[]): string[] {
  return [
    ...missingHints,
    "Use MiniCPM-V provider repair to bind AMBIENT_MINICPM_V_LLAMA_SERVER to an existing llama-server binary.",
  ];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
