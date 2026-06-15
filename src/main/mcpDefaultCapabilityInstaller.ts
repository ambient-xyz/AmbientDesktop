import { mcpDefaultCatalogDescriptorHash } from "./mcpDefaultCatalog";
import {
  McpInstallCatalog,
  type McpDefaultCapabilityInstallPreview,
} from "./mcpInstallCatalog";
import {
  type ToolHiveCommandResult,
  type ToolHiveInstallReviewState,
  type ToolHiveRuntimeService,
  type ToolHiveWorkloadSummary,
} from "./toolHiveRuntimeService";
import {
  ociImageResolutionSummary,
  resolveOciImageForRuntimePlatform,
  type OciImageResolution,
} from "./ociImageResolver";
import {
  pullOciImageWithContainerRuntime,
  type ContainerRuntimeImagePullPreferredRuntime,
  type ContainerRuntimeImagePullResult,
  type PullContainerRuntimeImageInput,
} from "./containerRuntimeImagePuller";

export interface InstallMcpDefaultCapabilityOptions {
  capabilityId: "scrapling";
  catalog: McpInstallCatalog;
  toolHive: ToolHiveRuntimeService;
  now?: () => Date;
  waitForEndpointTimeoutMs?: number;
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
  preferredContainerRuntime?: ContainerRuntimeImagePullPreferredRuntime;
  containerRuntimeEnv?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  imageResolver?: (input: { image: string; platform?: NodeJS.Platform | string; arch?: NodeJS.Architecture | string; fetchImpl?: typeof fetch }) => Promise<OciImageResolution>;
  imagePuller?: (input: PullContainerRuntimeImageInput) => Promise<ContainerRuntimeImagePullResult>;
  onProgress?: (progress: McpDefaultCapabilityInstallProgress) => void;
}

export interface InstallMcpDefaultCapabilityResult {
  preview: McpDefaultCapabilityInstallPreview;
  command: ToolHiveCommandResult;
  workload: ToolHiveWorkloadSummary;
  adoptedExistingWorkload: boolean;
  imageResolution: OciImageResolution;
  imagePull: ContainerRuntimeImagePullResult;
}

export interface AdoptExistingMcpDefaultCapabilityResult {
  preview: McpDefaultCapabilityInstallPreview;
  workload: ToolHiveWorkloadSummary;
}

export type McpDefaultCapabilityInstallProgressPhase =
  | "image-resolving"
  | "image-resolved"
  | "image-pull-started"
  | "image-pull-succeeded"
  | "toolhive-run-started"
  | "waiting-workload"
  | "completed";

export interface McpDefaultCapabilityInstallProgress {
  phase: McpDefaultCapabilityInstallProgressPhase;
  message: string;
  image?: string;
  resolvedImage?: string;
  runtime?: string;
}

export async function installMcpDefaultCapability(
  options: InstallMcpDefaultCapabilityOptions,
): Promise<InstallMcpDefaultCapabilityResult> {
  const preview = await options.catalog.previewDefaultCapabilityInstall({ capabilityId: options.capabilityId });
  if (!preview.runPlan || !preview.toolHiveRunSource || preview.review.blockers.length) {
    throw new Error(`Default MCP capability install is blocked for ${options.capabilityId}: ${preview.review.blockers.join("; ") || "no run plan"}`);
  }
  const imageResolver = options.imageResolver ?? resolveOciImageForRuntimePlatform;
  options.onProgress?.({
    phase: "image-resolving",
    message: `Verifying reviewed ${preview.defaultDescriptor.title} OCI image.`,
    image: preview.toolHiveRunSource,
  });
  const imageResolution = await imageResolver({
    image: preview.toolHiveRunSource,
    platform: options.platform,
    arch: options.arch,
    fetchImpl: options.fetchImpl,
  }).catch((error) => {
    throw new Error(`Default MCP capability image preflight failed for ${preview.toolHiveRunSource}: ${errorMessage(error)}`);
  });
  options.onProgress?.({
    phase: "image-resolved",
    message: ociImageResolutionSummary(imageResolution),
    image: imageResolution.originalImage,
    resolvedImage: imageResolution.resolvedImage,
  });
  const imagePuller = options.imagePuller ?? pullOciImageWithContainerRuntime;
  options.onProgress?.({
    phase: "image-pull-started",
    message: `Pulling reviewed ${preview.defaultDescriptor.title} image into the local container runtime.`,
    image: imageResolution.originalImage,
    resolvedImage: imageResolution.resolvedImage,
    ...(options.preferredContainerRuntime ? { runtime: options.preferredContainerRuntime } : {}),
  });
  const imagePull = await imagePuller({
    image: imageResolution.resolvedImage,
    targetPlatform: imageResolution.targetPlatform,
    preferredRuntime: options.preferredContainerRuntime,
    platform: options.platform,
    env: options.containerRuntimeEnv,
  }).catch((error) => {
    throw new Error(`Default MCP capability image pull failed for ${imageResolution.resolvedImage}: ${errorMessage(error)}`);
  });
  options.onProgress?.({
    phase: "image-pull-succeeded",
    message: `Pulled ${preview.defaultDescriptor.title} image with ${imagePull.runtime}.`,
    image: imageResolution.originalImage,
    resolvedImage: imageResolution.resolvedImage,
    runtime: imagePull.runtime,
  });
  options.onProgress?.({
    phase: "toolhive-run-started",
    message: `Starting ToolHive workload ${preview.runPlan.workloadName}.`,
    image: imageResolution.originalImage,
    resolvedImage: imageResolution.resolvedImage,
    runtime: imagePull.runtime,
  });
  const command = await options.toolHive.runStandardMcpImport({
    serverId: preview.serverId,
    workloadName: preview.runPlan.workloadName,
    sourceRef: imageResolution.resolvedImage,
    registrySource: "ambient-default-oci",
    sourceIdentity: defaultCapabilitySourceIdentity(preview, imageResolution),
    defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(preview.defaultDescriptor),
    defaultCatalogReviewedAt: preview.defaultDescriptor.source.reviewedAt,
    installReview: defaultCapabilityInstallReviewState(preview, (options.now ?? (() => new Date()))().toISOString()),
    permissionProfile: preview.permissionProfile.profile,
    transport: preview.runPlan.transport,
    imageVerificationPolicy: "ambient-reviewed",
    serverArgs: preview.toolHiveServerArgs,
  });
  options.onProgress?.({
    phase: "waiting-workload",
    message: `Waiting for ToolHive endpoint for ${preview.runPlan.workloadName}.`,
    image: imageResolution.originalImage,
    resolvedImage: imageResolution.resolvedImage,
    runtime: imagePull.runtime,
  });
  const workload = await options.toolHive.waitForAmbientWorkload(preview.runPlan.workloadName, {
    timeoutMs: Math.max(1, Math.floor(options.waitForEndpointTimeoutMs ?? 120_000)),
  });
  options.onProgress?.({
    phase: "completed",
    message: `${preview.defaultDescriptor.title} is running as ${preview.runPlan.workloadName}.`,
    image: imageResolution.originalImage,
    resolvedImage: imageResolution.resolvedImage,
    runtime: imagePull.runtime,
  });
  return {
    preview,
    command,
    workload,
    adoptedExistingWorkload: command.stdout.includes(`Adopted existing ToolHive workload ${preview.runPlan.workloadName}.`),
    imageResolution,
    imagePull,
  };
}

export async function adoptExistingMcpDefaultCapability(
  options: Pick<InstallMcpDefaultCapabilityOptions, "capabilityId" | "catalog" | "toolHive" | "now">,
): Promise<AdoptExistingMcpDefaultCapabilityResult | undefined> {
  const preview = await options.catalog.previewDefaultCapabilityInstall({ capabilityId: options.capabilityId });
  if (!preview.runPlan || !preview.toolHiveRunSource || preview.review.blockers.length) return undefined;
  const workload = await options.toolHive.adoptExistingStandardMcpImportWorkload({
    serverId: preview.serverId,
    workloadName: preview.runPlan.workloadName,
    sourceRef: preview.toolHiveRunSource,
    registrySource: "ambient-default-oci",
    sourceIdentity: defaultCapabilitySourceIdentityForImage(preview, preview.toolHiveRunSource),
    defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(preview.defaultDescriptor),
    defaultCatalogReviewedAt: preview.defaultDescriptor.source.reviewedAt,
    installReview: defaultCapabilityInstallReviewState(preview, (options.now ?? (() => new Date()))().toISOString()),
    permissionProfile: preview.permissionProfile.profile,
    transport: preview.runPlan.transport,
    imageVerificationPolicy: "ambient-reviewed",
    serverArgs: preview.toolHiveServerArgs,
  });
  return workload ? { preview, workload } : undefined;
}

function defaultCapabilitySourceIdentity(preview: McpDefaultCapabilityInstallPreview, imageResolution: OciImageResolution) {
  return defaultCapabilitySourceIdentityForImage(preview, imageResolution.resolvedImage);
}

function defaultCapabilitySourceIdentityForImage(preview: McpDefaultCapabilityInstallPreview, image: string) {
  const digest = imageDigestFromRef(image);
  return {
    runtimeLane: "ambient-default-oci" as const,
    sourceKind: "image",
    ...(preview.defaultDescriptor.source.repositoryUrl ? { sourceUrl: preview.defaultDescriptor.source.repositoryUrl } : {}),
    packageRegistryType: "oci",
    packageIdentifier: image,
    toolHiveRunSource: image,
    ...(digest ? { packageDigest: digest } : {}),
    candidateId: preview.candidate.id,
    candidateHash: preview.validation.candidateHash,
    riskLevel: preview.candidate.riskSummary.level,
  };
}

function defaultCapabilityInstallReviewState(preview: McpDefaultCapabilityInstallPreview, reviewedAt: string): ToolHiveInstallReviewState {
  return {
    status: preview.review.blockers.length ? "needs-review" : "reviewed",
    outcome: preview.review.outcome,
    reviewedAt,
    summary: preview.review.summary.slice(0, 1_000),
    warningCount: preview.review.warnings.length,
    blockerCount: preview.review.blockers.length,
  };
}

function imageDigestFromRef(image: string): string | undefined {
  const match = image.match(/@([A-Za-z0-9_+.-]+:[A-Fa-f0-9]+)$/);
  return match?.[1];
}

export function defaultCapabilityImageResolutionText(resolution: OciImageResolution): string {
  return [
    ociImageResolutionSummary(resolution),
    resolution.resolvedImage !== resolution.originalImage ? `ToolHive source: ${resolution.resolvedImage}` : undefined,
  ].filter(Boolean).join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
