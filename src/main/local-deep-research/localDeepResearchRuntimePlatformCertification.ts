import { arch, platform } from "node:os";
import type { MiniCpmVisionRuntimeReleaseArtifact, MiniCpmVisionRuntimeReleaseManifest } from "../../shared/types";
import { miniCpmRuntimeReleaseManifestPrototype, verifyMiniCpmRuntimeReleaseManifest } from "../mini-cpm/miniCpmRuntimeManifest";
import { writeWorkspaceTextFile } from "../workspace/workspaceFiles";

const certificationRoot = ".ambient/local-deep-research/runtime-platform-certification";

export type LocalDeepResearchRuntimePlatformCertificationStatus = "passed" | "failed";
export type LocalDeepResearchRuntimeMaturity = "certified" | "conditional" | "experimental" | "deferred";
export type LocalDeepResearchRuntimeDecision =
  | "enable-default-managed-install"
  | "keep-conditional-managed-install"
  | "pin-but-disable-default-install"
  | "defer-managed-install";

export interface LocalDeepResearchRuntimePlatformDecision {
  id: string;
  status: LocalDeepResearchRuntimePlatformCertificationStatus;
  maturity: LocalDeepResearchRuntimeMaturity;
  decision: LocalDeepResearchRuntimeDecision;
  platform: string;
  arch: string;
  lane: string;
  acceleration: string;
  artifactId?: string;
  releaseTag?: string;
  sourceUrl?: string;
  defaultDownloadEnabled: boolean;
  manifestStatus?: string;
  rationale: string;
  requiredEvidence: string[];
  blockers: string[];
}

export interface LocalDeepResearchRuntimePlatformCertificationResult {
  schemaVersion: "ambient-local-deep-research-runtime-platform-certification-v1";
  checkedAt: string;
  status: LocalDeepResearchRuntimePlatformCertificationStatus;
  manifestId: string;
  currentHost: {
    platform: string;
    arch: string;
  };
  decisions: LocalDeepResearchRuntimePlatformDecision[];
  artifactPath: string;
  markdownPath: string;
}

export async function runLocalDeepResearchRuntimePlatformCertification(input: {
  workspacePath: string;
  manifest?: MiniCpmVisionRuntimeReleaseManifest;
  now?: () => Date;
}): Promise<LocalDeepResearchRuntimePlatformCertificationResult> {
  const checkedAt = (input.now ?? (() => new Date()))().toISOString();
  const manifest = input.manifest ?? miniCpmRuntimeReleaseManifestPrototype;
  const decisions = localDeepResearchRuntimePlatformDecisions(manifest);
  const status: LocalDeepResearchRuntimePlatformCertificationStatus = decisions.every((decision) => decision.status === "passed") ? "passed" : "failed";
  const pending = {
    schemaVersion: "ambient-local-deep-research-runtime-platform-certification-v1" as const,
    checkedAt,
    status,
    manifestId: manifest.manifestId,
    currentHost: {
      platform: platform(),
      arch: arch(),
    },
    decisions,
  };
  const basePath = `${certificationRoot}/${checkedAt.replace(/[:.]/g, "-")}-${status}`;
  const json = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.json`, `${JSON.stringify(pending, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.md`, localDeepResearchRuntimePlatformCertificationMarkdown(pending));
  return {
    ...pending,
    artifactPath: json.path,
    markdownPath: markdown.path,
  };
}

export function localDeepResearchRuntimePlatformDecisions(
  manifest: MiniCpmVisionRuntimeReleaseManifest = miniCpmRuntimeReleaseManifestPrototype,
): LocalDeepResearchRuntimePlatformDecision[] {
  const artifactDecisions = manifest.artifacts.map((artifact) => decisionForArtifact(manifest, artifact));
  return [
    ...artifactDecisions,
    deferredWindowsGpuDecision(manifest),
  ];
}

function decisionForArtifact(
  manifest: MiniCpmVisionRuntimeReleaseManifest,
  artifact: MiniCpmVisionRuntimeReleaseArtifact,
): LocalDeepResearchRuntimePlatformDecision {
  const verification = verifyMiniCpmRuntimeReleaseManifest({
    manifest,
    platform: artifact.platform,
    arch: artifact.arch,
    artifactId: artifact.id,
  });
  const pinned = verification.checks.find((check) => check.id === "artifact-checksum-pin")?.status === "passed";
  const hasFields = verification.checks.find((check) => check.id === "artifact-required-fields")?.status === "passed";
  const pinReady = pinned && hasFields;
  if (artifact.platform === "darwin" && artifact.arch === "arm64" && artifact.acceleration === "metal") {
    return {
      id: "macos-arm64-metal",
      status: pinReady && artifact.defaultDownloadEnabled ? "passed" : "failed",
      maturity: "certified",
      decision: "enable-default-managed-install",
      platform: artifact.platform,
      arch: artifact.arch,
      lane: artifact.lane,
      acceleration: artifact.acceleration,
      artifactId: artifact.id,
      releaseTag: artifact.releaseTag,
      sourceUrl: artifact.sourceUrl,
      defaultDownloadEnabled: artifact.defaultDownloadEnabled,
      manifestStatus: verification.status,
      rationale: "Apple Silicon Metal is the certified first implementation target and has already backed Local Deep Research Q4 smoke, Q8 live, and profile benchmark evidence on this Mac.",
      requiredEvidence: [
        "Keep archive and extracted-binary checksums pinned.",
        "Keep real Local Deep Research smoke and live Ambient/Pi evidence current before release.",
      ],
      blockers: verification.blockers,
    };
  }
  if (artifact.platform === "linux" && artifact.arch === "x64" && artifact.acceleration.includes("vulkan")) {
    return {
      id: "linux-x64-vulkan",
      status: pinReady && artifact.defaultDownloadEnabled ? "passed" : "failed",
      maturity: "conditional",
      decision: "keep-conditional-managed-install",
      platform: artifact.platform,
      arch: artifact.arch,
      lane: artifact.lane,
      acceleration: artifact.acceleration,
      artifactId: artifact.id,
      releaseTag: artifact.releaseTag,
      sourceUrl: artifact.sourceUrl,
      defaultDownloadEnabled: artifact.defaultDownloadEnabled,
      manifestStatus: verification.status,
      rationale: "Linux x64 Vulkan is the only non-Mac accelerator row mature enough to keep as the first Linux managed-install candidate; it remains conditional on host GPU/driver preflight and Local Deep Research lifecycle smoke.",
      requiredEvidence: [
        "Run Local Deep Research install, validate, smoke, and profile benchmark on a Linux x64 Vulkan host.",
        "Record driver/backend discovery, process cleanup, model-cache paths, and no-stale-process evidence.",
        "Add CPU fallback only after a pinned CPU row has equivalent lifecycle evidence.",
      ],
      blockers: verification.blockers,
    };
  }
  if (artifact.platform === "win32") {
    return {
      id: "windows-x64-cpu",
      status: pinReady && !artifact.defaultDownloadEnabled ? "passed" : "failed",
      maturity: "experimental",
      decision: "pin-but-disable-default-install",
      platform: artifact.platform,
      arch: artifact.arch,
      lane: artifact.lane,
      acceleration: artifact.acceleration,
      artifactId: artifact.id,
      releaseTag: artifact.releaseTag,
      sourceUrl: artifact.sourceUrl,
      defaultDownloadEnabled: artifact.defaultDownloadEnabled,
      manifestStatus: verification.status,
      rationale: "Windows has a pinned CPU zip row, but it is not mature enough for first-party default managed install until real Windows lifecycle smoke covers extraction, firewall behavior, process cleanup, path quoting, and model-cache behavior.",
      requiredEvidence: [
        "Run real Windows x64 install, validate, smoke, and profile benchmark on CPU.",
        "Record local firewall prompts, path quoting, process-tree cleanup, and no stale llama-server.exe process.",
        "Add Windows GPU rows only after CPU lifecycle behavior is reliable.",
      ],
      blockers: verification.blockers,
    };
  }
  return {
    id: artifact.id,
    status: pinReady ? "passed" : "failed",
    maturity: artifact.supportTier === "experimental" ? "experimental" : "conditional",
    decision: artifact.defaultDownloadEnabled ? "keep-conditional-managed-install" : "pin-but-disable-default-install",
    platform: artifact.platform,
    arch: artifact.arch,
    lane: artifact.lane,
    acceleration: artifact.acceleration,
    artifactId: artifact.id,
    releaseTag: artifact.releaseTag,
    sourceUrl: artifact.sourceUrl,
    defaultDownloadEnabled: artifact.defaultDownloadEnabled,
    manifestStatus: verification.status,
    rationale: "Runtime artifact is pinned but has no Local Deep Research-specific maturity decision.",
    requiredEvidence: ["Add a platform-specific Local Deep Research lifecycle smoke before enabling default managed install."],
    blockers: verification.blockers,
  };
}

function deferredWindowsGpuDecision(manifest: MiniCpmVisionRuntimeReleaseManifest): LocalDeepResearchRuntimePlatformDecision {
  const hasWindowsGpu = manifest.artifacts.some((artifact) => artifact.platform === "win32" && artifact.arch === "x64" && artifact.acceleration !== "cpu");
  return {
    id: "windows-x64-gpu",
    status: hasWindowsGpu ? "failed" : "passed",
    maturity: "deferred",
    decision: "defer-managed-install",
    platform: "win32",
    arch: "x64",
    lane: "windows-x64-gpu",
    acceleration: "gpu",
    defaultDownloadEnabled: false,
    rationale: hasWindowsGpu
      ? "A Windows GPU row exists, but Local Deep Research has not certified it yet."
      : "Windows GPU managed install is intentionally deferred until the Windows CPU lifecycle is certified and a specific CUDA/Vulkan artifact has real host evidence.",
    requiredEvidence: [
      "Pick a specific Windows CUDA or Vulkan release artifact with archive and binary checksums.",
      "Run real Windows GPU install, validate, smoke, profile benchmark, process cleanup, and driver/backend discovery.",
    ],
    blockers: [],
  };
}

function localDeepResearchRuntimePlatformCertificationMarkdown(
  result: Omit<LocalDeepResearchRuntimePlatformCertificationResult, "artifactPath" | "markdownPath">,
): string {
  return [
    "# Local Deep Research Runtime Platform Certification",
    "",
    `Checked: ${result.checkedAt}`,
    `Status: ${result.status}`,
    `Manifest: ${result.manifestId}`,
    "",
    "| Platform | Maturity | Decision | Default Download | Rationale |",
    "| --- | --- | --- | --- | --- |",
    ...result.decisions.map((decision) => `| ${decision.platform}/${decision.arch} ${decision.acceleration} | ${decision.maturity} | ${decision.decision} | ${decision.defaultDownloadEnabled ? "yes" : "no"} | ${escapeMarkdownTable(decision.rationale)} |`),
    "",
    "## Required Evidence",
    "",
    ...result.decisions.flatMap((decision) => [
      `### ${decision.id}`,
      "",
      ...decision.requiredEvidence.map((item) => `- ${item}`),
      "",
    ]),
  ].join("\n");
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
