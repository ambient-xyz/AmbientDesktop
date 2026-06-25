import type {
  EmbeddingProviderDiagnostics,
  EmbeddingProviderRuntimeState,
  LocalRuntimeProviderLifecycleControls,
  SttProviderDiagnostics,
  VoiceProviderDiagnostics,
  VoiceProviderRuntimeState,
} from "../../shared/localRuntimeTypes";
import type { AmbientCliPackageCommand, AmbientCliPackageHealthCheckResult, AmbientCliPackageSummary } from "./ambientCliPackages";

export function ambientCliCommandHealth(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): "passed" | "failed" | "unknown" {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health) return "unknown";
  return health.passed ? "passed" : "failed";
}

function ambientCliHealthCacheDiagnostics(health: AmbientCliPackageHealthCheckResult | undefined): {
  healthCached?: boolean;
  healthCheckedAt?: string;
  healthCacheAgeMs?: number;
} {
  if (!health) return {};
  return {
    ...(health.cached !== undefined ? { healthCached: health.cached } : {}),
    ...(health.checkedAt ? { healthCheckedAt: health.checkedAt } : {}),
    ...(health.cacheAgeMs !== undefined ? { healthCacheAgeMs: health.cacheAgeMs } : {}),
  };
}

export function ambientCliVoiceProviderAvailabilityReason(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): string {
  if (pkg.errors[0]) return pkg.errors[0];
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (health && !health.passed) {
    return `Voice provider health check failed: ${health.error ?? health.stderr ?? "command exited unsuccessfully"}`;
  }
  const healthPayload = ambientCliVoiceProviderHealthPayload(pkg, command);
  if (healthPayload?.available === false) {
    return `Voice provider validation pending: ${healthPayload.reason ?? "runtime or model assets are not ready"}`;
  }
  return "Installed Ambient CLI package is available; execution still requires Desktop approval.";
}

export function ambientCliVoiceProviderDiagnostics(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): VoiceProviderDiagnostics {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  const healthPayload = ambientCliVoiceProviderHealthPayload(pkg, command);
  const providerLifecycle = command.voiceProvider?.runtimeLifecycle
    ? ambientCliProviderLifecycleWithPackage(command.voiceProvider.runtimeLifecycle, pkg)
    : undefined;
  const healthStatus = health ? (health.passed ? "passed" : "failed") : "unknown";
  const healthCommand = health?.command ?? command.healthCheck;
  const healthCwd = health?.cwd;
  const healthError =
    health && !health.passed ? (health.error ?? health.stderr) : healthPayload?.available === false ? healthPayload.reason : undefined;
  return {
    healthStatus,
    ...(healthCommand?.length ? { healthCommand } : {}),
    ...(healthCwd ? { healthCwd } : {}),
    ...(healthError ? { healthError } : {}),
    ...ambientCliHealthCacheDiagnostics(health),
    ...(health?.stdoutOutput?.artifactPath ? { stdoutArtifactPath: health.stdoutOutput.artifactPath } : {}),
    ...(health?.stderrOutput?.artifactPath ? { stderrArtifactPath: health.stderrOutput.artifactPath } : {}),
    missingHints: Array.from(new Set([...ambientCliVoiceProviderMissingHints(pkg, healthError), ...(healthPayload?.missingHints ?? [])])),
    ...(healthPayload?.runtimeState
      ? {
          runtimeState: providerLifecycle ? { ...healthPayload.runtimeState, providerLifecycle } : healthPayload.runtimeState,
        }
      : {}),
  };
}

interface AmbientCliVoiceProviderHealthPayload {
  available?: boolean;
  reason?: string;
  missingHints?: string[];
  runtimeState?: VoiceProviderRuntimeState;
}

export function ambientCliVoiceProviderHealthPayload(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): AmbientCliVoiceProviderHealthPayload | undefined {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health?.stdout) return undefined;
  try {
    const parsed = JSON.parse(health.stdout) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const missingHints = Array.isArray(parsed.missingHints)
      ? parsed.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim())).map((hint) => hint.trim())
      : undefined;
    const runtimeState = voiceProviderRuntimeStatePayload(parsed.runtimeState);
    return {
      ...(typeof parsed.available === "boolean" ? { available: parsed.available } : {}),
      ...(typeof parsed.reason === "string" && parsed.reason.trim() ? { reason: parsed.reason.trim() } : {}),
      ...(missingHints?.length ? { missingHints } : {}),
      ...(runtimeState ? { runtimeState } : {}),
    };
  } catch {
    return undefined;
  }
}

function voiceProviderRuntimeStatePayload(value: unknown): VoiceProviderRuntimeState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const status = voiceProviderRuntimeStatus(record.status);
  if (!status) return undefined;
  const running = typeof record.running === "boolean" ? record.running : status === "running";
  return {
    schemaVersion: "ambient-voice-provider-runtime-state-v1",
    status,
    running,
    ...(trackingStatus(record.trackingStatus) ? { trackingStatus: trackingStatus(record.trackingStatus) } : {}),
    ...(stringPayload(record.modelRuntimeId) ? { modelRuntimeId: stringPayload(record.modelRuntimeId) } : {}),
    ...(stringPayload(record.modelProfileId) ? { modelProfileId: stringPayload(record.modelProfileId) } : {}),
    ...(stringPayload(record.modelId) ? { modelId: stringPayload(record.modelId) } : {}),
    ...(positiveIntegerPayload(record.pid) ? { pid: positiveIntegerPayload(record.pid) } : {}),
    ...(stringPayload(record.endpoint) ? { endpoint: stringPayload(record.endpoint) } : {}),
    ...(stringPayload(record.statePath) ? { statePath: stringPayload(record.statePath) } : {}),
    ...(nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) !== undefined
      ? { estimatedResidentMemoryBytes: nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) }
      : {}),
    ...(nonNegativeNumberPayload(record.actualResidentMemoryBytes) !== undefined
      ? { actualResidentMemoryBytes: nonNegativeNumberPayload(record.actualResidentMemoryBytes) }
      : {}),
    ...(stringPayload(record.memorySampledAt) ? { memorySampledAt: stringPayload(record.memorySampledAt) } : {}),
    ...(stringPayload(record.startedAt) ? { startedAt: stringPayload(record.startedAt) } : {}),
    ...(stringPayload(record.lastUsedAt) ? { lastUsedAt: stringPayload(record.lastUsedAt) } : {}),
    ...(stringPayload(record.lastHeartbeatAt) ? { lastHeartbeatAt: stringPayload(record.lastHeartbeatAt) } : {}),
    ...(stringPayload(record.reason) ? { reason: stringPayload(record.reason) } : {}),
  };
}

function voiceProviderRuntimeStatus(value: unknown): VoiceProviderRuntimeState["status"] | undefined {
  if (value === "running" || value === "stopped" || value === "unavailable" || value === "unknown") return value;
  return undefined;
}

export function ambientCliEmbeddingProviderAvailabilityReason(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): string {
  if (pkg.errors[0]) return pkg.errors[0];
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (health && !health.passed) {
    return `Embedding provider health check failed: ${health.error ?? health.stderr ?? "command exited unsuccessfully"}`;
  }
  const healthPayload = ambientCliEmbeddingProviderHealthPayload(pkg, command);
  if (healthPayload?.available === false) {
    return `Embedding provider validation pending: ${healthPayload.reason ?? "runtime or model assets are not ready"}`;
  }
  return "Installed Ambient CLI package is available; execution still requires Desktop approval.";
}

export function ambientCliEmbeddingProviderDiagnostics(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): EmbeddingProviderDiagnostics {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  const healthPayload = ambientCliEmbeddingProviderHealthPayload(pkg, command);
  const providerLifecycle = command.embeddingProvider?.runtimeLifecycle
    ? ambientCliProviderLifecycleWithPackage(command.embeddingProvider.runtimeLifecycle, pkg)
    : undefined;
  const healthStatus = health ? (health.passed ? "passed" : "failed") : "unknown";
  const healthCommand = health?.command ?? command.healthCheck;
  const healthCwd = health?.cwd;
  const healthError =
    health && !health.passed ? (health.error ?? health.stderr) : healthPayload?.available === false ? healthPayload.reason : undefined;
  return {
    healthStatus,
    ...(healthCommand?.length ? { healthCommand } : {}),
    ...(healthCwd ? { healthCwd } : {}),
    ...(healthError ? { healthError } : {}),
    ...ambientCliHealthCacheDiagnostics(health),
    ...(health?.stdoutOutput?.artifactPath ? { stdoutArtifactPath: health.stdoutOutput.artifactPath } : {}),
    ...(health?.stderrOutput?.artifactPath ? { stderrArtifactPath: health.stderrOutput.artifactPath } : {}),
    missingHints: Array.from(
      new Set([...ambientCliEmbeddingProviderMissingHints(pkg, healthError), ...(healthPayload?.missingHints ?? [])]),
    ),
    ...(healthPayload?.runtimeState
      ? {
          runtimeState: providerLifecycle ? { ...healthPayload.runtimeState, providerLifecycle } : healthPayload.runtimeState,
        }
      : {}),
  };
}

interface AmbientCliEmbeddingProviderHealthPayload {
  available?: boolean;
  reason?: string;
  missingHints?: string[];
  runtimeState?: EmbeddingProviderRuntimeState;
}

export function ambientCliEmbeddingProviderHealthPayload(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): AmbientCliEmbeddingProviderHealthPayload | undefined {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health?.stdout) return undefined;
  try {
    const parsed = JSON.parse(health.stdout) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const missingHints = Array.isArray(parsed.missingHints)
      ? parsed.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim())).map((hint) => hint.trim())
      : undefined;
    const runtimeState = embeddingProviderRuntimeStatePayload(parsed.runtimeState);
    return {
      ...(typeof parsed.available === "boolean" ? { available: parsed.available } : {}),
      ...(typeof parsed.reason === "string" && parsed.reason.trim() ? { reason: parsed.reason.trim() } : {}),
      ...(missingHints?.length ? { missingHints } : {}),
      ...(runtimeState ? { runtimeState } : {}),
    };
  } catch {
    return undefined;
  }
}

function embeddingProviderRuntimeStatePayload(value: unknown): EmbeddingProviderRuntimeState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const status = voiceProviderRuntimeStatus(record.status);
  if (!status) return undefined;
  const running = typeof record.running === "boolean" ? record.running : status === "running";
  return {
    schemaVersion: "ambient-embedding-provider-runtime-state-v1",
    status,
    running,
    ...(trackingStatus(record.trackingStatus) ? { trackingStatus: trackingStatus(record.trackingStatus) } : {}),
    ...(stringPayload(record.modelRuntimeId) ? { modelRuntimeId: stringPayload(record.modelRuntimeId) } : {}),
    ...(stringPayload(record.modelProfileId) ? { modelProfileId: stringPayload(record.modelProfileId) } : {}),
    ...(stringPayload(record.modelId) ? { modelId: stringPayload(record.modelId) } : {}),
    ...(positiveIntegerPayload(record.pid) ? { pid: positiveIntegerPayload(record.pid) } : {}),
    ...(stringPayload(record.endpoint) ? { endpoint: stringPayload(record.endpoint) } : {}),
    ...(stringPayload(record.statePath) ? { statePath: stringPayload(record.statePath) } : {}),
    ...(nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) !== undefined
      ? { estimatedResidentMemoryBytes: nonNegativeNumberPayload(record.estimatedResidentMemoryBytes) }
      : {}),
    ...(nonNegativeNumberPayload(record.actualResidentMemoryBytes) !== undefined
      ? { actualResidentMemoryBytes: nonNegativeNumberPayload(record.actualResidentMemoryBytes) }
      : {}),
    ...(stringPayload(record.memorySampledAt) ? { memorySampledAt: stringPayload(record.memorySampledAt) } : {}),
    ...(stringPayload(record.startedAt) ? { startedAt: stringPayload(record.startedAt) } : {}),
    ...(stringPayload(record.lastUsedAt) ? { lastUsedAt: stringPayload(record.lastUsedAt) } : {}),
    ...(stringPayload(record.lastHeartbeatAt) ? { lastHeartbeatAt: stringPayload(record.lastHeartbeatAt) } : {}),
    ...(stringPayload(record.reason) ? { reason: stringPayload(record.reason) } : {}),
  };
}

function trackingStatus(value: unknown): "managed" | "tracked" | "untracked" | undefined {
  if (value === "managed" || value === "tracked" || value === "untracked") return value;
  return undefined;
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonNegativeNumberPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveIntegerPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function ambientCliVoiceProviderMissingHints(pkg: AmbientCliPackageSummary, healthError?: string): string[] {
  const hints: string[] = [];
  for (const env of pkg.envRequirements) {
    if (!env.required) continue;
    hints.push(
      env.description
        ? `Configure required environment variable ${env.name}: ${env.description}`
        : `Configure required environment variable ${env.name}.`,
    );
  }
  const normalized = healthError?.toLowerCase() ?? "";
  if (normalized.includes("model"))
    hints.push("Verify model files are downloaded and descriptor paths point at the repaired model location.");
  if (normalized.includes("enoent") || normalized.includes("not found") || normalized.includes("no such file")) {
    hints.push("Verify the provider binary or script exists after dependency installation.");
  }
  if (normalized.includes("permission") || normalized.includes("eacces"))
    hints.push("Verify executable permissions for the provider binary or script.");
  if (normalized.includes("api key") || normalized.includes("unauthorized") || normalized.includes("auth")) {
    hints.push("Verify provider credentials are configured before enabling voice.");
  }
  return Array.from(new Set(hints));
}

function ambientCliEmbeddingProviderMissingHints(pkg: AmbientCliPackageSummary, healthError?: string): string[] {
  const hints: string[] = [];
  for (const env of pkg.envRequirements) {
    if (!env.required) continue;
    hints.push(
      env.description
        ? `Configure required environment variable ${env.name}: ${env.description}`
        : `Configure required environment variable ${env.name}.`,
    );
  }
  const normalized = healthError?.toLowerCase() ?? "";
  if (normalized.includes("model"))
    hints.push("Verify embedding model files are downloaded and descriptor paths point at the repaired model location.");
  if (normalized.includes("index")) hints.push("Verify embedding index or cache paths exist and are writable.");
  if (normalized.includes("enoent") || normalized.includes("not found") || normalized.includes("no such file")) {
    hints.push("Verify the provider binary or script exists after dependency installation.");
  }
  if (normalized.includes("permission") || normalized.includes("eacces"))
    hints.push("Verify executable permissions for the provider binary or script.");
  if (normalized.includes("api key") || normalized.includes("unauthorized") || normalized.includes("auth")) {
    hints.push("Verify provider credentials are configured before enabling embeddings.");
  }
  return Array.from(new Set(hints));
}

export function ambientCliSttProviderAvailabilityReason(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): string {
  if (pkg.errors[0]) return pkg.errors[0];
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (health && !health.passed) {
    return `STT provider health check failed: ${health.error ?? health.stderr ?? "command exited unsuccessfully"}`;
  }
  const healthPayload = ambientCliSttProviderHealthPayload(pkg, command);
  if (healthPayload?.available === false) {
    return `STT provider validation pending: ${healthPayload.reason ?? "runtime or model assets are not ready"}`;
  }
  return "Installed Ambient CLI package is available; execution still requires Desktop approval.";
}

export function ambientCliSttProviderDiagnostics(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): SttProviderDiagnostics {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  const healthPayload = ambientCliSttProviderHealthPayload(pkg, command);
  const healthStatus = health ? (health.passed ? "passed" : "failed") : "unknown";
  const healthCommand = health?.command ?? command.healthCheck;
  const healthCwd = health?.cwd;
  const healthError =
    health && !health.passed ? (health.error ?? health.stderr) : healthPayload?.available === false ? healthPayload.reason : undefined;
  return {
    healthStatus,
    ...(healthCommand?.length ? { healthCommand } : {}),
    ...(healthCwd ? { healthCwd } : {}),
    ...(healthError ? { healthError } : {}),
    ...ambientCliHealthCacheDiagnostics(health),
    ...(health?.stdoutOutput?.artifactPath ? { stdoutArtifactPath: health.stdoutOutput.artifactPath } : {}),
    ...(health?.stderrOutput?.artifactPath ? { stderrArtifactPath: health.stderrOutput.artifactPath } : {}),
    missingHints: Array.from(new Set([...ambientCliSttProviderMissingHints(pkg, healthError), ...(healthPayload?.missingHints ?? [])])),
    ...(healthPayload?.distribution ? { distribution: healthPayload.distribution } : {}),
    ...(healthPayload?.installPlan ? { installPlan: healthPayload.installPlan } : {}),
  };
}

interface AmbientCliSttProviderHealthPayload {
  available?: boolean;
  reason?: string;
  missingHints?: string[];
  distribution?: NonNullable<SttProviderDiagnostics["distribution"]>;
  installPlan?: NonNullable<SttProviderDiagnostics["installPlan"]>;
}

export function ambientCliSttProviderHealthPayload(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
): AmbientCliSttProviderHealthPayload | undefined {
  const health = pkg.healthChecks?.find((check) => check.commandName === command.name);
  if (!health?.stdout) return undefined;
  try {
    const parsed = JSON.parse(health.stdout) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const missingHints = Array.isArray(parsed.missingHints)
      ? parsed.missingHints.filter((hint): hint is string => typeof hint === "string" && Boolean(hint.trim()))
      : undefined;
    const distribution = ambientCliSttProviderDistributionPayload(parsed.distribution);
    const installPlan = ambientCliSttProviderInstallPlanPayload(parsed.installPlan);
    return {
      ...(typeof parsed.available === "boolean" ? { available: parsed.available } : {}),
      ...(typeof parsed.reason === "string" && parsed.reason.trim() ? { reason: parsed.reason.trim() } : {}),
      ...(missingHints?.length ? { missingHints } : {}),
      ...(distribution ? { distribution } : {}),
      ...(installPlan ? { installPlan } : {}),
    };
  } catch {
    return undefined;
  }
}

function ambientCliSttProviderDistributionPayload(value: unknown): NonNullable<SttProviderDiagnostics["distribution"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const payload = {
    ...(typeof record.packageType === "string" && record.packageType.trim() ? { packageType: record.packageType.trim() } : {}),
    ...(typeof record.bundledRuntimeBinaries === "boolean" ? { bundledRuntimeBinaries: record.bundledRuntimeBinaries } : {}),
    ...(typeof record.bundledPythonWheels === "boolean" ? { bundledPythonWheels: record.bundledPythonWheels } : {}),
    ...(typeof record.bundledModelWeights === "boolean" ? { bundledModelWeights: record.bundledModelWeights } : {}),
    ...(typeof record.bundledModelAssets === "boolean" ? { bundledModelAssets: record.bundledModelAssets } : {}),
  };
  return Object.keys(payload).length ? payload : undefined;
}

function ambientCliSttProviderInstallPlanPayload(value: unknown): NonNullable<SttProviderDiagnostics["installPlan"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const packages = Array.isArray(record.packages)
    ? record.packages.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : undefined;
  const payload = {
    ...(typeof record.resolver === "string" && record.resolver.trim() ? { resolver: record.resolver.trim() } : {}),
    ...(typeof record.pythonVersion === "string" && record.pythonVersion.trim() ? { pythonVersion: record.pythonVersion.trim() } : {}),
    ...(packages?.length ? { packages } : {}),
    ...(typeof record.defaultModel === "string" && record.defaultModel.trim() ? { defaultModel: record.defaultModel.trim() } : {}),
    ...(typeof record.defaultDevice === "string" && record.defaultDevice.trim() ? { defaultDevice: record.defaultDevice.trim() } : {}),
    ...(typeof record.defaultComputeType === "string" && record.defaultComputeType.trim()
      ? { defaultComputeType: record.defaultComputeType.trim() }
      : {}),
    ...(typeof record.firstRunBehavior === "string" && record.firstRunBehavior.trim()
      ? { firstRunBehavior: record.firstRunBehavior.trim() }
      : {}),
  };
  return Object.keys(payload).length ? payload : undefined;
}

function ambientCliSttProviderMissingHints(pkg: AmbientCliPackageSummary, healthError?: string): string[] {
  const hints: string[] = [];
  for (const env of pkg.envRequirements) {
    if (!env.required) continue;
    hints.push(
      env.description
        ? `Configure required environment variable ${env.name}: ${env.description}`
        : `Configure required environment variable ${env.name}.`,
    );
  }
  const normalized = healthError?.toLowerCase() ?? "";
  if (normalized.includes("model"))
    hints.push("Verify model files are downloaded and descriptor paths point at the repaired model location.");
  if (normalized.includes("gguf") || normalized.includes("projector") || normalized.includes("mmproj")) {
    hints.push("Verify Qwen3-ASR GGUF and multimodal projector assets are present and match the provider descriptor.");
  }
  if (normalized.includes("enoent") || normalized.includes("not found") || normalized.includes("no such file")) {
    hints.push("Verify the provider binary or script exists after dependency installation.");
  }
  if (normalized.includes("permission") || normalized.includes("eacces"))
    hints.push("Verify executable permissions for the provider binary or script.");
  return Array.from(new Set(hints));
}

export function ambientCliProviderLifecycleWithPackage(
  lifecycle: LocalRuntimeProviderLifecycleControls,
  pkg: AmbientCliPackageSummary,
): LocalRuntimeProviderLifecycleControls {
  return {
    ...lifecycle,
    packageId: pkg.id,
    packageName: pkg.name,
    ...(lifecycle.start ? { start: { ...lifecycle.start, packageId: pkg.id, packageName: pkg.name } } : {}),
    ...(lifecycle.stop ? { stop: { ...lifecycle.stop, packageId: pkg.id, packageName: pkg.name } } : {}),
    ...(lifecycle.restart ? { restart: { ...lifecycle.restart, packageId: pkg.id, packageName: pkg.name } } : {}),
  };
}

export function voiceProviderFallbackLabel(packageName: string, commandName: string): string {
  return providerFallbackLabel(packageName, commandName);
}

export function providerFallbackLabel(packageName: string, commandName: string): string {
  const packageWords = humanizeIdentifier(packageName.replace(/^ambient[-_]/i, ""));
  const commandWords = humanizeIdentifier(commandName);
  if (!packageWords) return commandWords || commandName;
  if (!commandWords) return packageWords;
  const packageLower = packageWords.toLowerCase();
  const commandLower = commandWords.toLowerCase();
  if (packageLower.includes(commandLower) || commandLower.includes(packageLower)) return packageWords;
  if (commandLower.includes("tts") && packageLower.includes("tts")) return packageWords;
  return `${packageWords} ${commandWords}`;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\btts\b/gi, "TTS")
    .replace(/\bcli\b/gi, "CLI")
    .replace(/\be2e\b/gi, "E2E")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
