import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { arch as hostArch, platform as hostPlatform } from "node:os";
import { allowLocalDevUrlEgressFromEnv, assertAllowedUrlEgress } from "../security/urlEgressPolicy";

export type LocalLlamaRuntimeReleaseSupportTier = "conditional" | "experimental";
export type LocalLlamaRuntimeReleasePinStatus = "candidate" | "pinned" | "blocked";
export type LocalLlamaRuntimeReleaseCheckStatus = "passed" | "warning" | "failed" | "blocked" | "not-run";

export interface LocalLlamaRuntimeReleaseArtifact {
  id: string;
  platform: string;
  arch: string;
  lane: string;
  supportTier: LocalLlamaRuntimeReleaseSupportTier;
  acceleration: string;
  defaultDownloadEnabled: boolean;
  releaseTag: string;
  sourceUrl: string;
  archiveName: string;
  archiveFormat: "zip" | "tar.gz" | "tgz";
  archiveSha256: string;
  archiveSizeBytes?: number;
  binaryRelativePath: string;
  binarySha256?: string;
  expectedBinaryNames: string[];
  cacheSubdir: string;
  license: string;
  pinStatus: LocalLlamaRuntimeReleasePinStatus;
  smokeRequirements: string[];
}

export interface LocalLlamaRuntimeReleaseManifest<TArtifact extends LocalLlamaRuntimeReleaseArtifact = LocalLlamaRuntimeReleaseArtifact> {
  schemaVersion: string;
  manifestId: string;
  downloadEnabled: boolean;
  checksumAlgorithm: "sha256";
  requiredArtifactFields: string[];
  artifacts: TArtifact[];
  blockers: string[];
  notes: string[];
}

export interface LocalLlamaRuntimeReleaseManifestCheck {
  id: string;
  label: string;
  status: LocalLlamaRuntimeReleaseCheckStatus;
  detail: string;
}

export interface LocalLlamaRuntimeReleaseManifestVerification<TArtifact extends LocalLlamaRuntimeReleaseArtifact = LocalLlamaRuntimeReleaseArtifact> {
  schemaVersion: string;
  manifestId: string;
  status: "passed" | "warning" | "failed" | "blocked";
  downloadEnabled: boolean;
  checksumAlgorithm: "sha256";
  selectedArtifactId?: string;
  requiredArtifactFields: string[];
  artifacts: TArtifact[];
  checks: LocalLlamaRuntimeReleaseManifestCheck[];
  blockers: string[];
  verifiedArchivePath?: string;
  verifiedArchiveSha256?: string;
  verifiedBinaryPath?: string;
  verifiedBinarySha256?: string;
}

export const localLlamaRuntimeReleaseRequiredArtifactFields = [
  "id",
  "platform",
  "arch",
  "lane",
  "supportTier",
  "acceleration",
  "defaultDownloadEnabled",
  "releaseTag",
  "sourceUrl",
  "archiveName",
  "archiveFormat",
  "archiveSha256",
  "binaryRelativePath",
  "expectedBinaryNames",
  "cacheSubdir",
  "license",
  "pinStatus",
  "smokeRequirements",
];

export function verifyLocalLlamaRuntimeReleaseManifest<TArtifact extends LocalLlamaRuntimeReleaseArtifact>(input: {
  manifest: LocalLlamaRuntimeReleaseManifest<TArtifact>;
  expectedSchemaVersion: string;
  capabilityLabel: string;
  platform?: string;
  arch?: string;
  artifactId?: string;
  archivePath?: string;
  binaryPath?: string;
  blockerAppliesToArtifact?: (blocker: string, artifact: TArtifact) => boolean;
}): LocalLlamaRuntimeReleaseManifestVerification<TArtifact> {
  const checks: LocalLlamaRuntimeReleaseManifestCheck[] = [];
  const selectedArtifact = selectLocalLlamaRuntimeArtifact(input.manifest.artifacts, {
    platform: input.platform ?? hostPlatform(),
    arch: input.arch ?? hostArch(),
    artifactId: input.artifactId,
  });

  checks.push({
    id: "manifest-schema",
    label: "Runtime release manifest schema",
    status: input.manifest.schemaVersion === input.expectedSchemaVersion ? "passed" : "failed",
    detail: input.manifest.schemaVersion === input.expectedSchemaVersion
      ? `Manifest ${input.manifest.manifestId} uses the expected schema.`
      : "Runtime release manifest schema is unsupported.",
  });
  if (!selectedArtifact) {
    checks.push({
      id: "artifact-selection",
      label: "Host runtime artifact",
      status: "blocked",
      detail: `No runtime release artifact is declared for ${input.platform ?? hostPlatform()} ${input.arch ?? hostArch()}.`,
    });
    checks.push(managedDownloadPolicyCheck({
      capabilityLabel: input.capabilityLabel,
      manifest: input.manifest,
      artifact: undefined,
    }));
  } else {
    checks.push({
      id: "artifact-selection",
      label: "Host runtime artifact",
      status: "passed",
      detail: `Selected ${selectedArtifact.id} for ${selectedArtifact.platform} ${selectedArtifact.arch}.`,
    });
    checks.push(artifactFieldCheck(selectedArtifact, input.manifest.requiredArtifactFields));
    checks.push(artifactPinCheck(selectedArtifact));
    checks.push(managedDownloadPolicyCheck({
      capabilityLabel: input.capabilityLabel,
      manifest: input.manifest,
      artifact: selectedArtifact,
    }));
    checks.push(archiveChecksumCheck(selectedArtifact, input.archivePath));
    checks.push(binaryChecksumCheck(selectedArtifact, input.binaryPath));
  }

  const blockers = effectiveManifestBlockers(input.manifest, selectedArtifact, input.blockerAppliesToArtifact);
  const status = verificationStatus(checks, blockers);
  return {
    schemaVersion: input.expectedSchemaVersion,
    manifestId: input.manifest.manifestId,
    status,
    downloadEnabled: input.manifest.downloadEnabled,
    checksumAlgorithm: "sha256",
    ...(selectedArtifact ? { selectedArtifactId: selectedArtifact.id } : {}),
    requiredArtifactFields: input.manifest.requiredArtifactFields,
    artifacts: input.manifest.artifacts,
    checks,
    blockers,
    ...(input.archivePath ? { verifiedArchivePath: input.archivePath } : {}),
    ...(input.archivePath && existsSync(input.archivePath) ? { verifiedArchiveSha256: sha256File(input.archivePath) } : {}),
    ...(input.binaryPath ? { verifiedBinaryPath: input.binaryPath } : {}),
    ...(input.binaryPath && existsSync(input.binaryPath) ? { verifiedBinarySha256: sha256File(input.binaryPath) } : {}),
  };
}

export function selectLocalLlamaRuntimeArtifact<TArtifact extends LocalLlamaRuntimeReleaseArtifact>(
  artifacts: TArtifact[],
  input: { platform: string; arch: string; artifactId?: string },
): TArtifact | undefined {
  if (input.artifactId) return artifacts.find((artifact) => artifact.id === input.artifactId);
  return artifacts.find((artifact) => artifact.platform === input.platform && artifact.arch === input.arch);
}

export function localLlamaManagedRuntimeDownloadEligibility<TArtifact extends LocalLlamaRuntimeReleaseArtifact>(input: {
  capabilityLabel: string;
  manifest: LocalLlamaRuntimeReleaseManifest<TArtifact>;
  artifact: TArtifact;
  platform?: string;
  arch?: string;
  requiredSupportTier?: LocalLlamaRuntimeReleaseSupportTier;
  extraPolicyBlocker?: (artifact: TArtifact) => string | undefined;
}): string | undefined {
  const platform = input.platform ?? hostPlatform();
  const arch = input.arch ?? hostArch();
  const requiredSupportTier = input.requiredSupportTier ?? "conditional";
  if (!input.manifest.downloadEnabled) return `${input.capabilityLabel} managed runtime downloads are disabled by the release manifest.`;
  if (input.artifact.platform !== platform || input.artifact.arch !== arch) {
    return `${input.capabilityLabel} default managed download artifact ${input.artifact.id} targets ${input.artifact.platform} ${input.artifact.arch}, not this host ${platform} ${arch}.`;
  }
  if (!input.artifact.defaultDownloadEnabled) return `${input.capabilityLabel} default managed download is disabled for ${input.artifact.id}.`;
  if (input.artifact.supportTier !== requiredSupportTier) return `${input.capabilityLabel} default managed download is limited to ${requiredSupportTier} support lanes; ${input.artifact.id} is ${input.artifact.supportTier}.`;
  const extraBlocker = input.extraPolicyBlocker?.(input.artifact);
  if (extraBlocker) return extraBlocker;
  try {
    assertAllowedUrlEgress(input.artifact.sourceUrl, {
      useCase: "managed-download",
      allowLocalDevLoopbackHttp: allowLocalDevUrlEgressFromEnv(),
    });
  } catch (error) {
    return `${input.capabilityLabel} managed runtime download URL is not allowed for ${input.artifact.id}: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
}

function managedDownloadPolicyCheck<TArtifact extends LocalLlamaRuntimeReleaseArtifact>(input: {
  capabilityLabel: string;
  manifest: LocalLlamaRuntimeReleaseManifest<TArtifact>;
  artifact: TArtifact | undefined;
}): LocalLlamaRuntimeReleaseManifestCheck {
  if (!input.manifest.downloadEnabled) {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: `Ambient-managed ${input.capabilityLabel} runtime download is disabled by the runtime release manifest.`,
    };
  }
  if (!input.artifact) {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: `Ambient-managed ${input.capabilityLabel} runtime download needs a selected runtime artifact.`,
    };
  }
  if (!input.artifact.defaultDownloadEnabled) {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: `${input.artifact.id} is pinned for validation but disabled for default managed download.`,
    };
  }
  if (input.artifact.supportTier !== "conditional") {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: `${input.artifact.id} is ${input.artifact.supportTier}; default managed download is limited to conditional support lanes.`,
    };
  }
  return {
    id: "download-policy",
    label: "Managed download policy",
    status: "passed",
    detail: `Default managed runtime download is enabled for ${input.artifact.id}.`,
  };
}

function effectiveManifestBlockers<TArtifact extends LocalLlamaRuntimeReleaseArtifact>(
  manifest: LocalLlamaRuntimeReleaseManifest<TArtifact>,
  artifact: TArtifact | undefined,
  blockerAppliesToArtifact: ((blocker: string, artifact: TArtifact) => boolean) | undefined,
): string[] {
  if (!artifact || !blockerAppliesToArtifact) return manifest.blockers;
  return manifest.blockers.filter((blocker) => blockerAppliesToArtifact(blocker, artifact));
}

function artifactFieldCheck(
  artifact: LocalLlamaRuntimeReleaseArtifact,
  requiredFields: string[],
): LocalLlamaRuntimeReleaseManifestCheck {
  const missing = requiredFields.filter((field) => {
    const value = (artifact as unknown as Record<string, unknown>)[field];
    return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  });
  return {
    id: "artifact-required-fields",
    label: "Artifact required fields",
    status: missing.length ? "failed" : "passed",
    detail: missing.length
      ? `${artifact.id} is missing required fields: ${missing.join(", ")}.`
      : `${artifact.id} declares every required runtime artifact field.`,
  };
}

function artifactPinCheck(artifact: LocalLlamaRuntimeReleaseArtifact): LocalLlamaRuntimeReleaseManifestCheck {
  const archivePinned = isRealSha256(artifact.archiveSha256);
  const binaryPinned = artifact.binarySha256 ? isRealSha256(artifact.binarySha256) : true;
  const tagPinned = artifact.releaseTag !== "pin-required" && !artifact.releaseTag.includes("<");
  const urlPinned = !artifact.sourceUrl.includes("<") && !artifact.archiveName.includes("<");
  const pinned = artifact.pinStatus === "pinned" && archivePinned && binaryPinned && tagPinned && urlPinned;
  return {
    id: "artifact-checksum-pin",
    label: "Artifact checksum pin",
    status: pinned ? "passed" : "blocked",
    detail: pinned
      ? `${artifact.id} has pinned release URL, archive checksum, and binary checksum metadata.`
      : `${artifact.id} is a manifest prototype only; pin an exact release tag, source URL, archive SHA-256, and binary SHA-256 before enabling downloads.`,
  };
}

function archiveChecksumCheck(
  artifact: LocalLlamaRuntimeReleaseArtifact,
  archivePath: string | undefined,
): LocalLlamaRuntimeReleaseManifestCheck {
  if (!archivePath) {
    return {
      id: "local-archive-checksum",
      label: "Local archive checksum",
      status: "not-run",
      detail: "No local runtime archive was supplied; checksum verification was not run.",
    };
  }
  if (!existsSync(archivePath)) {
    return {
      id: "local-archive-checksum",
      label: "Local archive checksum",
      status: "failed",
      detail: `Runtime archive does not exist: ${archivePath}.`,
    };
  }
  const details = statSync(archivePath);
  if (!details.isFile()) {
    return {
      id: "local-archive-checksum",
      label: "Local archive checksum",
      status: "failed",
      detail: `Runtime archive path is not a file: ${archivePath}.`,
    };
  }
  const actual = sha256File(archivePath);
  return {
    id: "local-archive-checksum",
    label: "Local archive checksum",
    status: actual === artifact.archiveSha256 ? "passed" : "failed",
    detail: actual === artifact.archiveSha256
      ? `Runtime archive SHA-256 matched ${artifact.id}.`
      : `Runtime archive SHA-256 mismatch for ${artifact.id}: expected ${artifact.archiveSha256}, got ${actual}.`,
  };
}

function binaryChecksumCheck(
  artifact: LocalLlamaRuntimeReleaseArtifact,
  binaryPath: string | undefined,
): LocalLlamaRuntimeReleaseManifestCheck {
  if (!binaryPath) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "not-run",
      detail: "No extracted runtime binary was supplied; binary checksum verification was not run.",
    };
  }
  if (!artifact.binarySha256) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "failed",
      detail: `${artifact.id} does not declare an extracted-binary SHA-256.`,
    };
  }
  if (!existsSync(binaryPath)) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "failed",
      detail: `Runtime binary does not exist: ${binaryPath}.`,
    };
  }
  const details = statSync(binaryPath);
  if (!details.isFile()) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "failed",
      detail: `Runtime binary path is not a file: ${binaryPath}.`,
    };
  }
  const actual = sha256File(binaryPath);
  return {
    id: "local-binary-checksum",
    label: "Local binary checksum",
    status: actual === artifact.binarySha256 ? "passed" : "failed",
    detail: actual === artifact.binarySha256
      ? `Runtime binary SHA-256 matched ${artifact.id}.`
      : `Runtime binary SHA-256 mismatch for ${artifact.id}: expected ${artifact.binarySha256}, got ${actual}.`,
  };
}

function verificationStatus(
  checks: LocalLlamaRuntimeReleaseManifestCheck[],
  blockers: string[],
): LocalLlamaRuntimeReleaseManifestVerification["status"] {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (blockers.length || checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning" || check.status === "not-run")) return "warning";
  return "passed";
}

function isRealSha256(value: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(value)) return false;
  return !/^(.)\1{63}$/.test(value);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
