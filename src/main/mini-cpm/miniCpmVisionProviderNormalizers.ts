import type {
  MiniCpmVisionCleanupResult,
  MiniCpmVisionDiagnosticItem,
  MiniCpmVisionImageSummary,
  MiniCpmVisionRuntimeContract,
  MiniCpmVisionRuntimeInstallResult,
  MiniCpmVisionRuntimeMacosSecurity,
  MiniCpmVisionRuntimePreflightCheck,
  MiniCpmVisionRuntimeReleaseArtifact,
  MiniCpmVisionRuntimeReleaseManifestCheck,
  MiniCpmVisionRuntimeReleaseManifestVerification,
  MiniCpmVisionRuntimeState,
  MiniCpmVisionValidationMetadata,
} from "../../shared/localRuntimeTypes";
import { booleanValue, isRecord, numberValue, recordField, stringArray, stringValue } from "./miniCpmVisionProviderValueReaders";

export interface MiniCpmVisionProviderNormalizerConfig {
  provider: "minicpm-v";
  packageName: string;
  validationSchemaVersion: MiniCpmVisionValidationMetadata["schemaVersion"];
  runtimeDownloadRootPath: string;
}

export function normalizeMiniCpmValidationMetadata(
  input: unknown,
  config: MiniCpmVisionProviderNormalizerConfig,
): MiniCpmVisionValidationMetadata | undefined {
  if (
    !isRecord(input) ||
    input.schemaVersion !== config.validationSchemaVersion ||
    input.provider !== config.provider ||
    input.packageName !== config.packageName
  )
    return undefined;
  const image = normalizeMiniCpmImageSummary(input.image);
  const cleanup = normalizeMiniCpmCleanupResult(input.cleanup);
  const runtimeContract = normalizeMiniCpmRuntimeContract(input.runtimeContract, config);
  const runtimeInstall = normalizeMiniCpmRuntimeInstallResult(input.runtimeInstall);
  const runtimeState = normalizeMiniCpmRuntimeState(input.runtimeState);
  return {
    schemaVersion: config.validationSchemaVersion,
    provider: config.provider,
    packageName: config.packageName,
    status: ["not-run", "runtime-ready", "passed", "stopped", "needs-runtime", "failed", "uninstalled"].includes(String(input.status))
      ? (input.status as MiniCpmVisionValidationMetadata["status"])
      : "not-run",
    updatedAt: stringValue(input.updatedAt) ?? new Date(0).toISOString(),
    platform: stringValue(input.platform) ?? "unknown",
    arch: stringValue(input.arch) ?? "unknown",
    lane: stringValue(input.lane) ?? "unknown",
    ...(stringValue(input.binaryPath) ? { binaryPath: stringValue(input.binaryPath) } : {}),
    ...(stringValue(input.runtimeVersion) ? { runtimeVersion: stringValue(input.runtimeVersion) } : {}),
    ...(stringValue(input.model) ? { model: stringValue(input.model) } : {}),
    ...(stringValue(input.experimentalModel) ? { experimentalModel: stringValue(input.experimentalModel) } : {}),
    ...(stringValue(input.endpoint) ? { endpoint: stringValue(input.endpoint) } : {}),
    ...(input.endpointMode === "managed-local-server" || input.endpointMode === "existing-local-endpoint"
      ? { endpointMode: input.endpointMode }
      : {}),
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

export function normalizeMiniCpmRuntimeContract(
  input: unknown,
  config: MiniCpmVisionProviderNormalizerConfig,
): MiniCpmVisionRuntimeContract | undefined {
  if (!isRecord(input)) return undefined;
  const mode = stringValue(input.mode);
  const status = stringValue(input.status);
  const runtime = stringValue(input.runtime);
  const runtimeCacheRoot = stringValue(input.runtimeCacheRoot);
  if (
    !runtime ||
    !runtimeCacheRoot ||
    (mode !== "user-managed-runtime" &&
      mode !== "ambient-managed-runtime" &&
      mode !== "ambient-managed-download" &&
      mode !== "existing-local-endpoint") ||
    (status !== "active" && status !== "planned" && status !== "blocked")
  ) {
    return undefined;
  }
  const binarySource = stringValue(input.binarySource);
  const ambientManagedDownload = normalizeAmbientManagedDownload(recordField(input.ambientManagedDownload), config);
  return {
    mode,
    status,
    runtime,
    ...(stringValue(input.binaryPath) ? { binaryPath: stringValue(input.binaryPath) } : {}),
    ...(binarySource === "process-env" ||
    binarySource === "path" ||
    binarySource === "known-location" ||
    binarySource === "user" ||
    binarySource === "ambient-managed-runtime"
      ? { binarySource }
      : {}),
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

function normalizeAmbientManagedDownload(
  input: Record<string, unknown>,
  config: MiniCpmVisionProviderNormalizerConfig,
): MiniCpmVisionRuntimeContract["ambientManagedDownload"] {
  const status = stringValue(input.status);
  const manifestVerification = normalizeMiniCpmRuntimeReleaseManifestVerification(input.manifestVerification);
  return {
    status: status === "active" || status === "blocked" ? status : "planned",
    cacheRoot: stringValue(input.cacheRoot) ?? config.runtimeDownloadRootPath,
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
      if (
        !id ||
        !label ||
        !detail ||
        (status !== "passed" && status !== "warning" && status !== "failed" && status !== "blocked" && status !== "not-run")
      )
        return undefined;
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
      if (!id || !label || !detail || (status !== "passed" && status !== "warning" && status !== "failed" && status !== "not-run"))
        return undefined;
      return { id, label, status, detail };
    })
    .filter((item): item is MiniCpmVisionRuntimePreflightCheck => Boolean(item));
}

function normalizeMiniCpmCleanupResult(input: unknown): MiniCpmVisionCleanupResult | undefined {
  if (!isRecord(input)) return undefined;
  const stopStatus = ["stopped", "not-installed", "failed"].includes(String(input.stopStatus))
    ? (input.stopStatus as MiniCpmVisionCleanupResult["stopStatus"])
    : "not-installed";
  const packageStatus = ["uninstalled", "not-installed", "failed"].includes(String(input.packageStatus))
    ? (input.packageStatus as MiniCpmVisionCleanupResult["packageStatus"])
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
    ...(input.endpointMode === "managed-local-server" || input.endpointMode === "existing-local-endpoint"
      ? { endpointMode: input.endpointMode }
      : {}),
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
