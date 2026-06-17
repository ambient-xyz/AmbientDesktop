import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
  parseMcpAutowireCandidate,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
  type McpAutowireValidationReport,
} from "../mcp-autowire/mcpAutowireSchemas";

export { MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION };

const sourceBuildEvidenceId = "source-build-review";
const defaultSourceBuildTimeoutMs = 20 * 60_000;
const maxBuildOutputBufferBytes = 16 * 1024 * 1024;
type GeneratedSourceBuildTemplate = "rust-cargo" | "node-package";

const customSourceBuildPlanSchema = z.object({
  schemaVersion: z.literal(MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION).default(MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION),
  sourceUrl: z.string().url().optional(),
  resolvedCommit: z.string().min(7),
  image: z.object({
    identifier: z.string().min(1),
    digest: z.string().min(1).optional(),
  }).strict(),
  recipe: z.object({
    kind: z.enum(["existing-dockerfile", "generated-dockerfile", "existing-reviewed-image"]),
    contextPath: z.string().min(1).default("."),
    dockerfilePath: z.string().min(1).optional(),
    generatedDockerfileReviewed: z.boolean().optional(),
    runtimeCommand: z.string().min(1).optional(),
    serverArgs: z.array(z.string().min(1)).default([]),
    runtimeEnv: z.array(z.object({
      name: z.string().min(1),
      value: z.string().min(1),
    }).strict()).default([]),
    evidenceRefs: z.array(z.string().min(1)).default([sourceBuildEvidenceId]),
  }).strict(),
  notes: z.array(z.string().min(1)).default([]),
}).strict();

export type McpCustomSourceBuildPlan = z.infer<typeof customSourceBuildPlanSchema>;
export type McpCustomSourceBuildReviewStatus = "ready-for-import" | "needs-build" | "blocked";

export interface McpCustomSourceBuildReviewInput {
  candidate: unknown;
  expectedCandidateHash?: string;
  sourceBuild: unknown;
}

export interface McpCustomSourceBuildReviewResult {
  status: McpCustomSourceBuildReviewStatus;
  candidate: McpAutowireCandidate;
  sourceBuild: McpCustomSourceBuildPlan;
  blockers: string[];
  warnings: string[];
  customImageCandidate?: McpAutowireCandidate;
  customImageValidation?: McpAutowireValidationReport;
  nextAction: string;
}

export interface McpCustomSourceBuildDescribeInput {
  candidate: unknown;
  expectedCandidateHash?: string;
  sourceBuild?: unknown;
  ref?: string;
}

export interface McpCustomSourceBuildDescribeOptions {
  commandRunner?: McpCustomSourceBuildCommandRunner;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform | string;
  timeoutMs?: number;
}

export interface McpCustomSourceBuildDescribeResult {
  status: "ready-to-build" | "blocked";
  candidate: McpAutowireCandidate;
  sourceBuild: McpCustomSourceBuildPlan;
  blockers: string[];
  warnings: string[];
  generatedDockerfile?: string;
  nextToolName?: "ambient_mcp_autowire_source_build_create";
  nextToolInput?: Record<string, unknown>;
  forbiddenAlternatives: string[];
  nextAction: string;
}

export interface McpCustomSourceBuildCreateInput {
  candidate: unknown;
  expectedCandidateHash?: string;
  sourceBuild: unknown;
  userDataPath: string;
  signal?: AbortSignal;
}

export interface McpCustomSourceBuildCreateOptions {
  commandRunner?: McpCustomSourceBuildCommandRunner;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform | string;
  timeoutMs?: number;
}

export interface McpCustomSourceBuildCreateResult {
  status: "ready-for-import" | "blocked";
  candidate: McpAutowireCandidate;
  sourceBuild: McpCustomSourceBuildPlan;
  review: McpCustomSourceBuildReviewResult;
  build: {
    runtime: "docker" | "podman";
    imageIdentifier: string;
    imageDigest: string;
    buildRoot: string;
    repositoryPath: string;
    buildLogPath: string;
    logPreview: string;
    commandCount: number;
  };
  customImageCandidate?: McpAutowireCandidate;
  customImageValidation?: McpAutowireValidationReport;
  nextToolName?: "ambient_mcp_standard_import_describe";
  nextToolInput?: Record<string, unknown>;
  forbiddenAlternatives: string[];
  nextAction: string;
}

function parseCustomSourceBuildPlan(value: unknown): McpCustomSourceBuildPlan {
  return customSourceBuildPlanSchema.parse(normalizeCustomSourceBuildPlanInput(value));
}

function safeParseCustomSourceBuildPlan(value: unknown): ReturnType<typeof customSourceBuildPlanSchema.safeParse> {
  return customSourceBuildPlanSchema.safeParse(normalizeCustomSourceBuildPlanInput(value));
}

function normalizeCustomSourceBuildPlanInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (!isRecord(value.recipe) || !("notes" in value.recipe)) return value;
  const { notes: recipeNotes, ...recipe } = value.recipe;
  return {
    ...value,
    ...(!("notes" in value) && Array.isArray(recipeNotes) ? { notes: recipeNotes } : {}),
    recipe,
  };
}

function sourceBuildPlanForToolInput(sourceBuild: McpCustomSourceBuildPlan): Record<string, unknown> {
  const { notes: _notes, ...toolInput } = sourceBuild;
  return toolInput;
}

export interface McpCustomSourceBuildCommandInput {
  command: string;
  args: string[];
  cwd?: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  kind: "git" | "container-build" | "container-inspect";
}

export interface McpCustomSourceBuildCommandResult {
  command: string;
  args: string[];
  cwd?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  errorCode?: string;
}

export type McpCustomSourceBuildCommandRunner = (
  input: McpCustomSourceBuildCommandInput,
) => Promise<McpCustomSourceBuildCommandResult>;

export function reviewMcpCustomSourceBuildPlan(input: McpCustomSourceBuildReviewInput): McpCustomSourceBuildReviewResult {
  const candidate = parseMcpAutowireCandidate(input.candidate);
  const sourceBuild = parseCustomSourceBuildPlan(input.sourceBuild);
  const candidateValidation = validateMcpAutowireCandidate(candidate);
  const blockers = [
    ...candidateHashMismatchBlocker(input.expectedCandidateHash, candidateValidation.candidateHash),
    ...customSourceBuildShapeBlockers(candidate, sourceBuild),
  ];
  const warnings = customSourceBuildWarnings(candidate, sourceBuild);
  if (blockers.length) {
    return {
      status: sourceBuild.image.digest && blockers.every((blocker) => !blocker.includes("digest")) ? "blocked" : "needs-build",
      candidate,
      sourceBuild,
      blockers,
      warnings,
      nextAction: "Fix the custom ToolHive source build blockers, then rerun this review before producing or installing a custom-image candidate.",
    };
  }
  if (!sourceBuild.image.digest) {
    return {
      status: "needs-build",
      candidate,
      sourceBuild,
      blockers: ["OCI image digest is required before Ambient can hand this custom source to ToolHive import."],
      warnings,
      nextAction: "Build the reviewed source in the Ambient custom source build lane, record the OCI image digest, then rerun this review with image.digest.",
    };
  }

  const customImageCandidate = sourceBuiltCustomImageCandidate(candidate, sourceBuild);
  const customImageValidation = validateMcpAutowireCandidate(customImageCandidate);
  const validationBlockers = customImageValidation.blockers.map((issue) => `${issue.code}: ${issue.message}`);
  return {
    status: validationBlockers.length ? "blocked" : "ready-for-import",
    candidate,
    sourceBuild,
    blockers: validationBlockers,
    warnings: [
      ...warnings,
      ...customImageValidation.warnings.map((issue) => `${issue.code}: ${issue.message}`),
    ],
    customImageCandidate,
    customImageValidation,
    nextAction: validationBlockers.length
      ? "Fix the emitted custom-image candidate validation blockers before install."
      : "Call ambient_mcp_standard_import_describe with the emitted custom-image candidate or candidateRef, then install only after user approval.",
  };
}

export function mcpCustomSourceBuildReviewText(
  result: McpCustomSourceBuildReviewResult,
  input: { customImageCandidateRef?: string } = {},
): string {
  const blockers = result.blockers.length ? result.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- none";
  const warnings = result.warnings.length ? result.warnings.map((warning) => `- ${warning}`).join("\n") : "- none";
  const candidateHandoff = result.customImageCandidate
    ? input.customImageCandidateRef
      ? `Custom-image candidate ref for ambient_mcp_standard_import_describe:\n${input.customImageCandidateRef}`
      : `Custom-image candidate JSON for ambient_mcp_standard_import_describe:\n${JSON.stringify(result.customImageCandidate, null, 2)}`
    : "Custom-image candidate: unavailable until blockers are resolved and an OCI digest is recorded.";
  return [
    `Custom ToolHive source review for ${result.candidate.displayName}`,
    `Status: ${result.status}`,
    `Source: ${result.candidate.source.url ?? "unknown"} @ ${result.sourceBuild.resolvedCommit}`,
    `Recipe: ${result.sourceBuild.recipe.kind} context=${result.sourceBuild.recipe.contextPath}${result.sourceBuild.recipe.dockerfilePath ? ` dockerfile=${result.sourceBuild.recipe.dockerfilePath}` : ""}`,
    result.sourceBuild.recipe.runtimeEnv.length ? `Runtime env: ${result.sourceBuild.recipe.runtimeEnv.map((env) => env.name).join(", ")} (values hidden from preview text)` : "Runtime env: none",
    `Image: ${result.sourceBuild.image.identifier}${result.sourceBuild.image.digest ? ` ${result.sourceBuild.image.digest}` : " digest=pending"}`,
    "",
    "Blockers:",
    blockers,
    "",
    "Warnings:",
    warnings,
    "",
    candidateHandoff,
    "",
    `Next action: ${result.nextAction}`,
  ].join("\n");
}

export async function describeMcpCustomSourceBuild(
  input: McpCustomSourceBuildDescribeInput,
  options: McpCustomSourceBuildDescribeOptions = {},
): Promise<McpCustomSourceBuildDescribeResult> {
  const candidate = parseMcpAutowireCandidate(input.candidate);
  const candidateValidation = validateMcpAutowireCandidate(candidate);
  const baseBlockers = [
    ...candidateHashMismatchBlocker(input.expectedCandidateHash, candidateValidation.candidateHash),
  ];
  const sourceBuild = await sourceBuildPlanFromInput(candidate, input.sourceBuild, input.ref, options);
  const review = reviewMcpCustomSourceBuildPlan({
    candidate,
    expectedCandidateHash: candidateValidation.candidateHash,
    sourceBuild,
  });
  const blockers = [
    ...baseBlockers,
    ...review.blockers.filter((blocker) => !isDigestRequiredBlocker(blocker)),
  ];
  const generatedDockerfile = sourceBuild.recipe.kind === "generated-dockerfile"
    ? generatedDockerfileForPlan(candidate, sourceBuild)
    : undefined;
  const status = blockers.length ? "blocked" : "ready-to-build";
  const forbiddenAlternatives = customSourceBuildForbiddenAlternatives();
  const nextToolInput = status === "ready-to-build"
    ? {
        candidate,
        expectedCandidateHash: candidateValidation.candidateHash,
        sourceBuild: sourceBuildPlanForToolInput(sourceBuild),
      }
    : undefined;
  return {
    status,
    candidate,
    sourceBuild,
    blockers,
    warnings: uniqueStrings([
      ...review.warnings,
      sourceBuild.recipe.kind === "generated-dockerfile"
        ? "Ambient generated this Dockerfile from a deterministic source-build template; review the preview before approving the build."
        : "",
    ]),
    ...(generatedDockerfile ? { generatedDockerfile } : {}),
    ...(status === "ready-to-build" ? { nextToolName: "ambient_mcp_autowire_source_build_create", nextToolInput } : {}),
    forbiddenAlternatives,
    nextAction: status === "ready-to-build"
      ? "Request approval, then call ambient_mcp_autowire_source_build_create with this exact sourceBuild plan. Continue to Standard MCP import only after the build returns a custom-image candidate with a digest."
      : "Resolve blockers before cloning, building, installing, registering, or running this source MCP.",
  };
}

export function mcpCustomSourceBuildDescribeText(
  result: McpCustomSourceBuildDescribeResult,
  input: { candidateRef?: string; expectedCandidateHash?: string } = {},
): string {
  const blockers = result.blockers.length ? result.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- none";
  const warnings = result.warnings.length ? result.warnings.map((warning) => `- ${warning}`).join("\n") : "- none";
  const nextToolInput = result.nextToolName
    ? {
        ...(input.candidateRef ? { candidateRef: input.candidateRef } : { candidate: result.candidate }),
        ...(input.expectedCandidateHash ? { expectedCandidateHash: input.expectedCandidateHash } : {}),
        sourceBuild: sourceBuildPlanForToolInput(result.sourceBuild),
      }
    : undefined;
  return [
    `Custom ToolHive source-build plan for ${result.candidate.displayName}`,
    `Status: ${result.status}`,
    `Source: ${result.candidate.source.url ?? result.sourceBuild.sourceUrl ?? "unknown"} @ ${result.sourceBuild.resolvedCommit}`,
    `Image: ${result.sourceBuild.image.identifier} digest=pending`,
    `Recipe: ${result.sourceBuild.recipe.kind} context=${result.sourceBuild.recipe.contextPath}${result.sourceBuild.recipe.dockerfilePath ? ` dockerfile=${result.sourceBuild.recipe.dockerfilePath}` : ""}`,
    "",
    result.generatedDockerfile
      ? `Generated Dockerfile preview:\n\`\`\`dockerfile\n${result.generatedDockerfile}\n\`\`\``
      : "Generated Dockerfile preview: none.",
    "",
    "Blockers:",
    blockers,
    "",
    "Warnings:",
    warnings,
    "",
    "Forbidden alternatives:",
    ...result.forbiddenAlternatives.map((item) => `- ${item}`),
    "",
    result.nextToolName ? `Next tool: ${result.nextToolName} ${JSON.stringify(nextToolInput)}` : "Next tool: none",
    `Next action: ${result.nextAction}`,
  ].join("\n");
}

export async function createMcpCustomSourceBuildImage(
  input: McpCustomSourceBuildCreateInput,
  options: McpCustomSourceBuildCreateOptions = {},
): Promise<McpCustomSourceBuildCreateResult> {
  const candidate = parseMcpAutowireCandidate(input.candidate);
  const initialSourceBuild = await sourceBuildPlanFromInput(
    candidate,
    input.sourceBuild,
    sourceBuildPinnedRefFromInput(input.sourceBuild),
    options,
  );
  const initialReview = reviewMcpCustomSourceBuildPlan({
    candidate,
    expectedCandidateHash: input.expectedCandidateHash,
    sourceBuild: initialSourceBuild,
  });
  const nonDigestBlockers = initialReview.blockers.filter((blocker) => !isDigestRequiredBlocker(blocker));
  if (nonDigestBlockers.length) {
    return blockedSourceBuildCreateResult(candidate, initialSourceBuild, initialReview, nonDigestBlockers);
  }
  if (!candidate.source.url) {
    return blockedSourceBuildCreateResult(candidate, initialSourceBuild, initialReview, ["Source build requires candidate.source.url."]);
  }
  if (!input.userDataPath.trim()) {
    return blockedSourceBuildCreateResult(candidate, initialSourceBuild, initialReview, ["Ambient MCP userData path is required before source builds can run."]);
  }

  throwIfAborted(input.signal);
  const timeoutMs = Math.max(30_000, Math.floor(options.timeoutMs ?? defaultSourceBuildTimeoutMs));
  const env = {
    ...(options.env ?? process.env),
    GIT_TERMINAL_PROMPT: "0",
  };
  const commandRunner = options.commandRunner ?? defaultMcpCustomSourceBuildCommandRunner;
  const buildRoot = join(input.userDataPath, "mcp", "source-builds", safeFileSegment(candidate.id), initialSourceBuild.resolvedCommit.slice(0, 16));
  const repositoryPath = join(buildRoot, "source");
  const buildLogPath = join(buildRoot, "build.log");
  const logs: string[] = [];
  let commandCount = 0;

  await rm(repositoryPath, { recursive: true, force: true });
  await mkdir(buildRoot, { recursive: true, mode: 0o700 });

  const runRequired = async (command: string, args: string[], kind: McpCustomSourceBuildCommandInput["kind"], cwd?: string) => {
    throwIfAborted(input.signal);
    const result = await commandRunner({ command, args, cwd, env, timeoutMs, kind });
    commandCount += 1;
    appendCommandLog(logs, result);
    if (result.exitCode !== 0) {
      await writeBuildLog(buildLogPath, logs);
      throw new Error(`Source build command failed: ${command} ${args.join(" ")}\n${commandOutputPreview(result)}`);
    }
    return result;
  };

  const cloneSourceUrl = sourceBuildCloneUrl(candidate, initialSourceBuild);
  await runRequired("git", ["clone", "--quiet", "--no-checkout", cloneSourceUrl, repositoryPath], "git");
  await runRequired("git", ["checkout", "--quiet", "--detach", initialSourceBuild.resolvedCommit], "git", repositoryPath);

  const effectiveSourceBuild = await prepareBuildRecipeFiles(candidate, initialSourceBuild, repositoryPath);
  const buildContext = join(repositoryPath, effectiveSourceBuild.recipe.contextPath);
  const dockerfilePath = effectiveSourceBuild.recipe.dockerfilePath
    ? join(repositoryPath, effectiveSourceBuild.recipe.dockerfilePath)
    : join(buildContext, "Dockerfile");
  let buildResult: { runtime: "docker" | "podman"; command: string; commandCount: number };
  let imageDigest: string;
  try {
    buildResult = await runFirstSuccessfulContainerBuild({
      commandRunner,
      env,
      timeoutMs,
      imageIdentifier: effectiveSourceBuild.image.identifier,
      dockerfilePath,
      buildContext,
      logs,
      signal: input.signal,
    });
    commandCount += buildResult.commandCount;
    imageDigest = await inspectBuiltImageDigest({
      commandRunner,
      runtime: buildResult.runtime,
      command: buildResult.command,
      env,
      timeoutMs,
      imageIdentifier: effectiveSourceBuild.image.identifier,
      logs,
      signal: input.signal,
    });
    commandCount += 1;
  } catch (error) {
    await writeBuildLog(buildLogPath, logs);
    throw error;
  }
  const sourceBuildWithDigest: McpCustomSourceBuildPlan = {
    ...effectiveSourceBuild,
    image: {
      ...effectiveSourceBuild.image,
      digest: imageDigest,
    },
  };
  const review = reviewMcpCustomSourceBuildPlan({
    candidate,
    expectedCandidateHash: input.expectedCandidateHash,
    sourceBuild: sourceBuildWithDigest,
  });
  await writeBuildLog(buildLogPath, logs);
  const logPreview = boundedLogPreview(logs.join("\n"));
  const forbiddenAlternatives = customSourceBuildForbiddenAlternatives();
  const ready = review.status === "ready-for-import" && review.customImageCandidate && review.customImageValidation;
  const nextToolInput = ready
    ? {
        candidate: review.customImageCandidate,
        ...(review.customImageValidation?.candidateHash ? { expectedCandidateHash: review.customImageValidation.candidateHash } : {}),
      }
    : undefined;
  return {
    status: ready ? "ready-for-import" : "blocked",
    candidate,
    sourceBuild: sourceBuildWithDigest,
    review,
    build: {
      runtime: buildResult.runtime,
      imageIdentifier: sourceBuildWithDigest.image.identifier,
      imageDigest,
      buildRoot,
      repositoryPath,
      buildLogPath,
      logPreview,
      commandCount,
    },
    ...(review.customImageCandidate ? { customImageCandidate: review.customImageCandidate } : {}),
    ...(review.customImageValidation ? { customImageValidation: review.customImageValidation } : {}),
    ...(ready ? { nextToolName: "ambient_mcp_standard_import_describe", nextToolInput } : {}),
    forbiddenAlternatives,
    nextAction: ready
      ? "Call ambient_mcp_standard_import_describe with the emitted custom-image candidate or candidateRef, then install only after user approval."
      : "Fix source-build or custom-image validation blockers before any install or local bridge fallback.",
  };
}

export function mcpCustomSourceBuildCreateText(
  result: McpCustomSourceBuildCreateResult,
  input: { customImageCandidateRef?: string; customImageCandidateHash?: string } = {},
): string {
  const blockers = result.review.blockers.length ? result.review.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- none";
  const warnings = result.review.warnings.length ? result.review.warnings.map((warning) => `- ${warning}`).join("\n") : "- none";
  const candidateHandoff = result.customImageCandidate
    ? input.customImageCandidateRef
      ? `Custom-image candidate ref for ambient_mcp_standard_import_describe:\n${input.customImageCandidateRef}`
      : `Custom-image candidate JSON for ambient_mcp_standard_import_describe:\n${JSON.stringify(result.customImageCandidate, null, 2)}`
    : "Custom-image candidate: unavailable until blockers are resolved.";
  const nextToolInput = result.nextToolName
    ? input.customImageCandidateRef
      ? {
          candidateRef: input.customImageCandidateRef,
          ...(input.customImageCandidateHash ? { expectedCandidateHash: input.customImageCandidateHash } : {}),
        }
      : result.nextToolInput
    : undefined;
  return [
    `Custom ToolHive source build for ${result.candidate.displayName}`,
    `Status: ${result.status}`,
    `Runtime: ${result.build.runtime}`,
    `Image: ${result.build.imageIdentifier} ${result.build.imageDigest}`,
    `Build log: ${result.build.buildLogPath}`,
    "",
    "Build log preview:",
    result.build.logPreview || "(no build output)",
    "",
    "Blockers:",
    blockers,
    "",
    "Warnings:",
    warnings,
    "",
    "Forbidden alternatives:",
    ...result.forbiddenAlternatives.map((item) => `- ${item}`),
    "",
    candidateHandoff,
    "",
    result.nextToolName ? `Next tool: ${result.nextToolName} ${JSON.stringify(nextToolInput)}` : "Next tool: none",
    `Next action: ${result.nextAction}`,
  ].join("\n");
}

async function sourceBuildPlanFromInput(
  candidate: McpAutowireCandidate,
  sourceBuildInput: unknown,
  ref: string | undefined,
  options: McpCustomSourceBuildDescribeOptions,
): Promise<McpCustomSourceBuildPlan> {
  const parsed = safeParseCustomSourceBuildPlan(sourceBuildInput);
  if (parsed.success) return parsed.data;
  const sourceTarget = await resolveSourceBuildTarget(candidate, ref, options);
  const template = defaultGeneratedSourceBuildTemplate(candidate);
  return {
    schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
    sourceUrl: sourceTarget.sourceUrl,
    resolvedCommit: sourceTarget.resolvedCommit,
    image: {
      identifier: `ambient-source-built/${safeImageName(candidate.id)}:${sourceTarget.resolvedCommit.slice(0, 12)}`,
    },
    recipe: {
      kind: "generated-dockerfile",
      contextPath: sourceTarget.contextPath ?? ".",
      dockerfilePath: ".ambient-source-build/Dockerfile",
      generatedDockerfileReviewed: true,
      runtimeCommand: defaultGeneratedRuntimeCommand(candidate, template),
      serverArgs: [],
      runtimeEnv: [],
      evidenceRefs: candidate.evidence.map((entry) => entry.id).slice(0, 8),
    },
    notes: [
      "Ambient derived this source-build plan from a GitHub source-only MCP candidate.",
      "Generated Dockerfile recipes are built only through the Ambient source-build lane and must produce an OCI digest before import.",
      generatedSourceBuildTemplateNote(template),
    ],
  };
}

async function resolveSourceBuildTarget(
  candidate: McpAutowireCandidate,
  ref: string | undefined,
  options: McpCustomSourceBuildDescribeOptions,
): Promise<{ sourceUrl: string; resolvedCommit: string; contextPath?: string }> {
  if (!candidate.source.url) throw new Error("Custom source build requires candidate.source.url before commit resolution.");
  const targets = sourceBuildGitTargets(candidate.source.url, ref);
  if (candidate.source.resolvedCommit && /^[a-f0-9]{40}$/i.test(candidate.source.resolvedCommit)) {
    return {
      sourceUrl: targets[0]?.repositoryUrl ?? candidate.source.url,
      resolvedCommit: candidate.source.resolvedCommit,
      ...(targets[0]?.contextPath ? { contextPath: targets[0].contextPath } : {}),
    };
  }
  const directCommit = ref?.trim();
  if (directCommit && /^[a-f0-9]{40}$/i.test(directCommit)) {
    return {
      sourceUrl: targets[0]?.repositoryUrl ?? candidate.source.url,
      resolvedCommit: directCommit,
      ...(targets[0]?.contextPath ? { contextPath: targets[0].contextPath } : {}),
    };
  }
  const env = {
    ...(options.env ?? process.env),
    GIT_TERMINAL_PROMPT: "0",
  };
  const timeoutMs = Math.max(10_000, Math.floor(options.timeoutMs ?? 60_000));
  const runner = options.commandRunner ?? defaultMcpCustomSourceBuildCommandRunner;
  let lastResult: Awaited<ReturnType<McpCustomSourceBuildCommandRunner>> | undefined;
  for (const target of targets) {
    const result = await runner({
      command: "git",
      args: ["ls-remote", target.repositoryUrl, target.ref],
      env,
      timeoutMs,
      kind: "git",
    });
    lastResult = result;
    if (result.exitCode !== 0) continue;
    const commit = result.stdout.trim().split(/\s+/, 1)[0] ?? "";
    if (!/^[a-f0-9]{40}$/i.test(commit)) continue;
    return {
      sourceUrl: target.repositoryUrl,
      resolvedCommit: commit,
      ...(target.contextPath ? { contextPath: target.contextPath } : {}),
    };
  }
  const attempted = targets.map((target) => `${target.repositoryUrl} ${target.ref}`).join(", ");
  if (lastResult) {
    throw new Error(`Could not resolve source build commit for ${candidate.source.url}; attempted ${attempted}: ${commandOutputPreview(lastResult)}`);
  }
  throw new Error(`Could not resolve source build commit for ${candidate.source.url}; no valid Git target was derived.`);
}

function sourceBuildCloneUrl(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): string {
  const sourceUrl = sourceBuild.sourceUrl ?? candidate.source.url;
  if (!sourceUrl) throw new Error("Source build requires a source URL before clone.");
  return sourceBuildGitTargets(sourceUrl, undefined)[0]?.repositoryUrl ?? sourceUrl;
}

function sourceBuildPinnedRefFromInput(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.resolvedCommit !== "string") return undefined;
  const ref = value.resolvedCommit.trim();
  return /^[a-f0-9]{40}$/i.test(ref) ? ref : undefined;
}

function sourceBuildGitTargets(sourceUrl: string, ref: string | undefined): Array<{ repositoryUrl: string; ref: string; contextPath?: string }> {
  const requestedRef = ref?.trim();
  const github = parseGithubTreeSourceUrl(sourceUrl);
  if (!github) {
    return [{
      repositoryUrl: sourceUrl,
      ref: requestedRef || "HEAD",
    }];
  }
  if (requestedRef) {
    return [{
      repositoryUrl: github.repositoryUrl,
      ref: requestedRef,
      ...(github.defaultContextPath ? { contextPath: github.defaultContextPath } : {}),
    }];
  }
  if (!github.treeSegments.length) {
    return [{ repositoryUrl: github.repositoryUrl, ref: "HEAD" }];
  }
  const targets: Array<{ repositoryUrl: string; ref: string; contextPath?: string }> = [];
  for (let index = 1; index <= github.treeSegments.length; index += 1) {
    const candidateRef = github.treeSegments.slice(0, index).join("/");
    const candidatePath = github.treeSegments.slice(index).join("/");
    targets.push({
      repositoryUrl: github.repositoryUrl,
      ref: candidateRef,
      ...(candidatePath ? { contextPath: candidatePath } : {}),
    });
  }
  return targets;
}

function parseGithubTreeSourceUrl(sourceUrl: string): { repositoryUrl: string; treeSegments: string[]; defaultContextPath?: string } | undefined {
  try {
    const normalized = sourceUrl.trim().replace(/^git\+/, "").replace(/^github:/, "https://github.com/").replace(/^git@github\.com:/, "https://github.com/");
    const parsed = new URL(normalized);
    if (parsed.hostname.toLowerCase() !== "github.com") return undefined;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const [owner, repoRaw] = segments;
    if (!owner || !repoRaw) return undefined;
    const repo = repoRaw.replace(/\.git$/i, "");
    const repositoryUrl = `https://github.com/${owner}/${repo}`;
    const treeIndex = segments.findIndex((segment) => segment === "tree" || segment === "blob");
    const treeSegments = treeIndex >= 0 ? segments.slice(treeIndex + 1).map(decodeURIComponent).filter(Boolean) : [];
    const defaultContextPath = treeSegments.length > 1 ? treeSegments.slice(1).join("/") : undefined;
    return {
      repositoryUrl,
      treeSegments,
      ...(defaultContextPath ? { defaultContextPath } : {}),
    };
  } catch {
    return undefined;
  }
}

async function prepareBuildRecipeFiles(
  candidate: McpAutowireCandidate,
  sourceBuild: McpCustomSourceBuildPlan,
  repositoryPath: string,
): Promise<McpCustomSourceBuildPlan> {
  if (sourceBuild.recipe.kind !== "generated-dockerfile") return sourceBuild;
  const buildContextPath = join(repositoryPath, sourceBuild.recipe.contextPath);
  const packageJsonPath = join(buildContextPath, "package.json");
  const cargoTomlPath = join(buildContextPath, "Cargo.toml");
  const template = existsSync(packageJsonPath)
    ? "node-package"
    : existsSync(cargoTomlPath)
      ? "rust-cargo"
      : generatedSourceBuildTemplateForPlan(candidate, sourceBuild);
  let effectiveSourceBuild = sourceBuild;
  if (template === "node-package") {
    if (!existsSync(packageJsonPath)) {
      throw new Error("Generated Node source-build Dockerfile requires package.json in the build context.");
    }
    effectiveSourceBuild = {
      ...sourceBuild,
      recipe: {
        ...sourceBuild.recipe,
        runtimeCommand: await nodeRuntimeCommandFromPackageJson(packageJsonPath, sourceBuild.recipe.runtimeCommand),
      },
    };
  } else if (!existsSync(cargoTomlPath)) {
    throw new Error("Generated Rust source-build Dockerfile requires Cargo.toml in the build context.");
  }
  const dockerfileRelative = sourceBuild.recipe.dockerfilePath ?? ".ambient-source-build/Dockerfile";
  const dockerfilePath = join(repositoryPath, dockerfileRelative);
  await mkdir(join(repositoryPath, ".ambient-source-build"), { recursive: true, mode: 0o700 });
  await writeFile(dockerfilePath, generatedDockerfileForPlan(candidate, effectiveSourceBuild), { encoding: "utf8", mode: 0o600 });
  return {
    ...effectiveSourceBuild,
    recipe: {
      ...effectiveSourceBuild.recipe,
      dockerfilePath: dockerfileRelative,
      generatedDockerfileReviewed: true,
    },
  };
}

function generatedDockerfileForPlan(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): string {
  const template = generatedSourceBuildTemplateForPlan(candidate, sourceBuild);
  if (template === "node-package") return generatedNodePackageDockerfileForPlan(sourceBuild);
  return generatedRustCargoDockerfileForPlan(candidate, sourceBuild);
}

function generatedRustCargoDockerfileForPlan(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): string {
  const binaryName = runtimeBinaryName(candidate, sourceBuild);
  return [
    "FROM rust:1.88-slim-bookworm AS builder",
    "WORKDIR /src",
    "RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*",
    "COPY . .",
    "RUN cargo build --release",
    "",
    "FROM debian:bookworm-slim",
    "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*",
    `COPY --from=builder /src/target/release/${binaryName} /usr/local/bin/${binaryName}`,
    `ENTRYPOINT ["/usr/local/bin/${binaryName}"]`,
    "",
  ].join("\n");
}

function generatedNodePackageDockerfileForPlan(sourceBuild: McpCustomSourceBuildPlan): string {
  const runtimeCommand = sourceBuild.recipe.runtimeCommand?.trim() || "node /app/dist/index.js";
  return [
    "FROM node:22-bookworm-slim AS builder",
    "WORKDIR /src",
    "RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ pkg-config ca-certificates && rm -rf /var/lib/apt/lists/*",
    "COPY package*.json ./",
    "RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi",
    "COPY . .",
    "RUN npm run build --if-present",
    "RUN npm prune --omit=dev",
    "",
    "FROM node:22-bookworm-slim",
    "WORKDIR /app",
    "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*",
    "COPY --from=builder /src ./",
    "ENV NODE_ENV=production",
    `ENTRYPOINT ${dockerEntrypointForRuntimeCommand(runtimeCommand)}`,
    "",
  ].join("\n");
}

function defaultGeneratedSourceBuildTemplate(candidate: McpAutowireCandidate): GeneratedSourceBuildTemplate {
  if (candidate.runtime.package?.registryType === "npm" || candidate.runtime.sourceKind === "npm") return "node-package";
  return "rust-cargo";
}

function generatedSourceBuildTemplateForPlan(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): GeneratedSourceBuildTemplate {
  const command = sourceBuild.recipe.runtimeCommand?.trim().toLowerCase() ?? "";
  if (command.startsWith("node ") || command.includes("/app/dist/")) return "node-package";
  return defaultGeneratedSourceBuildTemplate(candidate);
}

function defaultGeneratedRuntimeCommand(candidate: McpAutowireCandidate, template: GeneratedSourceBuildTemplate): string {
  if (template === "node-package") return "node /app/dist/index.js";
  return `/usr/local/bin/${safeBinaryName(candidate.source.packageName ?? candidate.id)}`;
}

function generatedSourceBuildTemplateNote(template: GeneratedSourceBuildTemplate): string {
  return template === "node-package"
    ? "Generated Dockerfile template: Node/npm package source with native build tooling for MCP dependencies."
    : "Generated Dockerfile template: Rust/Cargo source with native build tooling.";
}

async function nodeRuntimeCommandFromPackageJson(packageJsonPath: string, fallbackCommand: string | undefined): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch {
    return fallbackCommand?.trim() || "node /app/dist/index.js";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallbackCommand?.trim() || "node /app/dist/index.js";
  const pkg = parsed as Record<string, unknown>;
  const binPath = nodePackageBinPath(pkg);
  if (binPath) return `node /app/${binPath}`;
  const mainPath = typeof pkg.main === "string" ? normalizeNodeEntrypointPath(pkg.main) : undefined;
  if (mainPath) return `node /app/${mainPath}`;
  return fallbackCommand?.trim() || "node /app/dist/index.js";
}

function nodePackageBinPath(pkg: Record<string, unknown>): string | undefined {
  const bin = pkg.bin;
  if (typeof bin === "string") return normalizeNodeEntrypointPath(bin);
  if (!bin || typeof bin !== "object" || Array.isArray(bin)) return undefined;
  const binRecord = bin as Record<string, unknown>;
  const packageName = typeof pkg.name === "string" ? defaultNpmExecutableName(pkg.name) : undefined;
  const preferred = packageName && typeof binRecord[packageName] === "string" ? binRecord[packageName] : undefined;
  const first = Object.values(binRecord).find((value): value is string => typeof value === "string");
  return normalizeNodeEntrypointPath(preferred ?? first ?? "");
}

function normalizeNodeEntrypointPath(value: string): string | undefined {
  const normalized = value.trim().replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.includes("\n") || normalized.includes("\r")) return undefined;
  if (normalized.split(/[\\/]+/).includes("..")) return undefined;
  if (!/\.(?:mjs|cjs|js)$/i.test(normalized)) return undefined;
  return normalized.replace(/\\/g, "/");
}

function dockerEntrypointForRuntimeCommand(command: string): string {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^[A-Za-z0-9_./:@%+=,-]+$/.test(part))) {
    return JSON.stringify(["/bin/sh", "-lc", command]);
  }
  return JSON.stringify(parts);
}

function defaultNpmExecutableName(identifier: string): string {
  const parts = identifier.split("/");
  return parts[parts.length - 1] ?? identifier;
}

function runtimeBinaryName(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): string {
  const command = sourceBuild.recipe.runtimeCommand?.trim();
  const last = command?.split("/").filter(Boolean).pop();
  if (last && /^[A-Za-z0-9._-]+$/.test(last)) return last;
  return safeBinaryName(candidate.source.packageName ?? candidate.id);
}

async function runFirstSuccessfulContainerBuild(input: {
  commandRunner: McpCustomSourceBuildCommandRunner;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  imageIdentifier: string;
  dockerfilePath: string;
  buildContext: string;
  logs: string[];
  signal?: AbortSignal;
}): Promise<{ runtime: "docker" | "podman"; command: string; commandCount: number }> {
  const attempts: Array<{ runtime: "docker" | "podman"; command: string }> = [
    { runtime: "docker", command: "docker" },
    { runtime: "docker", command: "/opt/homebrew/bin/docker" },
    { runtime: "docker", command: "/usr/local/bin/docker" },
    { runtime: "podman", command: "podman" },
    { runtime: "podman", command: "/opt/podman/bin/podman" },
    { runtime: "podman", command: "/opt/homebrew/bin/podman" },
  ];
  let commandCount = 0;
  const errors: string[] = [];
  for (const attempt of attempts) {
    throwIfAborted(input.signal);
    const result = await input.commandRunner({
      command: attempt.command,
      args: ["build", "-t", input.imageIdentifier, "-f", input.dockerfilePath, input.buildContext],
      env: input.env,
      timeoutMs: input.timeoutMs,
      kind: "container-build",
    });
    commandCount += 1;
    appendCommandLog(input.logs, result);
    if (result.exitCode === 0) return { ...attempt, commandCount };
    errors.push(`${attempt.command}: ${commandOutputPreview(result)}`);
    if (result.errorCode !== "ENOENT") break;
  }
  throw new Error(`Could not build custom ToolHive source image ${input.imageIdentifier}. ${errors.join(" | ")}`);
}

async function inspectBuiltImageDigest(input: {
  commandRunner: McpCustomSourceBuildCommandRunner;
  runtime: "docker" | "podman";
  command: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  imageIdentifier: string;
  logs: string[];
  signal?: AbortSignal;
}): Promise<string> {
  throwIfAborted(input.signal);
  const result = await input.commandRunner({
    command: input.command,
    args: ["image", "inspect", input.imageIdentifier, "--format", "{{.Id}}"],
    env: input.env,
    timeoutMs: Math.min(input.timeoutMs, 60_000),
    kind: "container-inspect",
  });
  appendCommandLog(input.logs, result);
  if (result.exitCode !== 0) throw new Error(`Could not inspect built image ${input.imageIdentifier}: ${commandOutputPreview(result)}`);
  const digest = result.stdout.trim().replace(/^sha256:/i, "");
  if (!/^[a-f0-9]{64}$/i.test(digest)) throw new Error(`Container runtime returned an invalid image id for ${input.imageIdentifier}: ${result.stdout.trim() || "empty output"}.`);
  return `sha256:${digest}`;
}

function defaultMcpCustomSourceBuildCommandRunner(input: McpCustomSourceBuildCommandInput): Promise<McpCustomSourceBuildCommandResult> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    execFile(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      encoding: "utf8",
      timeout: input.timeoutMs,
      maxBuffer: maxBuildOutputBufferBytes,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      const typedError = error as (Error & { code?: unknown }) | null;
      const exitCode = typeof typedError?.code === "number" ? typedError.code : typedError ? 1 : 0;
      resolve({
        command: input.command,
        args: input.args,
        ...(input.cwd ? { cwd: input.cwd } : {}),
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        exitCode,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(typedError?.code ? { errorCode: String(typedError.code) } : {}),
      });
    });
  });
}

function blockedSourceBuildCreateResult(
  candidate: McpAutowireCandidate,
  sourceBuild: McpCustomSourceBuildPlan,
  review: McpCustomSourceBuildReviewResult,
  blockers: string[],
): McpCustomSourceBuildCreateResult {
  const blockedReview: McpCustomSourceBuildReviewResult = {
    ...review,
    status: "blocked",
    blockers,
    nextAction: "Resolve custom source-build blockers before any clone, build, install, or local bridge fallback.",
  };
  return {
    status: "blocked",
    candidate,
    sourceBuild,
    review: blockedReview,
    build: {
      runtime: "docker",
      imageIdentifier: sourceBuild.image.identifier,
      imageDigest: sourceBuild.image.digest ?? "sha256:pending",
      buildRoot: "",
      repositoryPath: "",
      buildLogPath: "",
      logPreview: "",
      commandCount: 0,
    },
    forbiddenAlternatives: customSourceBuildForbiddenAlternatives(),
    nextAction: blockedReview.nextAction,
  };
}

function appendCommandLog(logs: string[], result: McpCustomSourceBuildCommandResult): void {
  logs.push([
    `$ ${result.command} ${result.args.join(" ")}`,
    `exit=${result.exitCode} durationMs=${result.durationMs}`,
    result.stdout ? `stdout:\n${result.stdout}` : "stdout: <empty>",
    result.stderr ? `stderr:\n${result.stderr}` : "stderr: <empty>",
  ].join("\n"));
}

async function writeBuildLog(buildLogPath: string, logs: string[]): Promise<void> {
  await mkdir(dirname(buildLogPath), { recursive: true, mode: 0o700 });
  await writeFile(buildLogPath, `${logs.join("\n\n")}\n`, { encoding: "utf8", mode: 0o600 });
}

function boundedLogPreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 4000) return trimmed;
  return `${trimmed.slice(0, 1600)}\n...\n${trimmed.slice(-2000)}`;
}

function commandOutputPreview(result: McpCustomSourceBuildCommandResult): string {
  const output = [result.stderr, result.stdout].join("\n").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 10).join(" ");
  return [
    `exit=${result.exitCode}`,
    result.errorCode ? `code=${result.errorCode}` : undefined,
    output ? `output=${output}` : undefined,
  ].filter(Boolean).join(" ");
}

function isDigestRequiredBlocker(blocker: string): boolean {
  return /OCI image digest is required/i.test(blocker);
}

function customSourceBuildForbiddenAlternatives(): string[] {
  return [
    "Do not clone/build/register this MCP as an unmanaged local bridge for an install request.",
    "Do not run README install scripts, raw cargo builds, claude mcp add, or raw ToolHive state edits outside the Ambient source-build lane.",
    "Do not proceed to Standard MCP import until the candidate is sourceKind=custom-image with a pinned Git commit and sha256 image digest.",
  ];
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("Custom source build was aborted.");
}

function safeImageName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._/-]+/g, "-").replace(/^-+|-+$/g, "").replace(/\/+/g, "/").slice(0, 120) || "mcp-source";
}

function safeBinaryName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "mcp-server";
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "mcp-source";
}

function customSourceBuildShapeBlockers(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): string[] {
  const blockers: string[] = [];
  if (candidate.source.kind !== "github" || !candidate.source.url) {
    blockers.push("Custom ToolHive source builds require a GitHub-backed MCP candidate with source.url.");
  }
  if (sourceBuild.sourceUrl && candidate.source.url && githubRepoKey(sourceBuild.sourceUrl) !== githubRepoKey(candidate.source.url)) {
    blockers.push(`Source build URL ${sourceBuild.sourceUrl} does not match candidate source ${candidate.source.url}.`);
  }
  if (!/^[a-f0-9]{7,64}$/i.test(sourceBuild.resolvedCommit.trim())) {
    blockers.push("resolvedCommit must be a pinned Git commit hash, not a branch, tag, URL, or prose description.");
  }
  if (candidate.source.resolvedCommit && candidate.source.resolvedCommit !== sourceBuild.resolvedCommit) {
    blockers.push(`Source build commit ${sourceBuild.resolvedCommit} does not match candidate commit ${candidate.source.resolvedCommit}.`);
  }
  if (candidate.runtime.provider !== "toolhive") {
    blockers.push(`Custom ToolHive source builds require runtime.provider toolhive, got ${candidate.runtime.provider}.`);
  }
  if (!["stdio", "streamable-http", "sse"].includes(candidate.runtime.transport)) {
    blockers.push(`Custom ToolHive source builds require stdio, streamable-http, or sse transport, got ${candidate.runtime.transport}.`);
  }
  if (candidate.permissions.filesystem.workspaceRead) {
    blockers.push("Custom ToolHive source builds require explicit reviewed extraMounts instead of workspace-wide read access.");
  }
  if (candidate.permissions.filesystem.workspaceWrite) {
    blockers.push("Custom ToolHive source builds cannot carry workspace write grants.");
  }
  candidate.permissions.filesystem.extraMounts.forEach((mount, index) => {
    if (mount.mode !== "read-only") {
      blockers.push(`Custom ToolHive source mount ${index} requests ${mount.mode}; only read-only mounts can be promoted through source-build review.`);
    }
    if (!mount.containerPath || !safeContainerMountPath(mount.containerPath)) {
      blockers.push(`Custom ToolHive source mount ${index} requires a safe absolute containerPath before import.`);
    }
  });
  if (!safeRelativePath(sourceBuild.recipe.contextPath)) {
    blockers.push(`Build context path must be a safe relative source path: ${sourceBuild.recipe.contextPath}.`);
  }
  if (sourceBuild.recipe.dockerfilePath && !safeRelativePath(sourceBuild.recipe.dockerfilePath)) {
    blockers.push(`Dockerfile path must be a safe relative source path: ${sourceBuild.recipe.dockerfilePath}.`);
  }
  if (sourceBuild.recipe.kind === "generated-dockerfile" && !sourceBuild.recipe.generatedDockerfileReviewed) {
    blockers.push("Generated Dockerfiles must be explicitly reviewed before a custom ToolHive source image can be imported.");
  }
  if (!safeImageIdentifier(sourceBuild.image.identifier)) {
    blockers.push(`OCI image identifier is not a safe ToolHive image reference: ${sourceBuild.image.identifier}.`);
  }
  if (sourceBuild.image.digest && !/^sha256:[a-f0-9]{64}$/i.test(sourceBuild.image.digest)) {
    blockers.push("OCI image digest must use sha256:<64 hex characters>.");
  }
  for (const arg of sourceBuild.recipe.serverArgs) {
    if (!safeRuntimeString(arg)) blockers.push(`Server argument is unsafe or secret-looking and cannot be passed to ToolHive: ${arg}.`);
  }
  for (const env of sourceBuild.recipe.runtimeEnv) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(env.name)) {
      blockers.push(`Runtime environment name is invalid: ${env.name}.`);
    } else if (looksSecretEnvName(env.name)) {
      blockers.push(`Runtime environment name ${env.name} looks secret-like; use Ambient-managed secret bindings instead of fixed source-build env.`);
    }
    if (!safeRuntimeString(env.value) || env.value.includes("\n") || env.value.includes("\r")) {
      blockers.push(`Runtime environment value for ${env.name} is unsafe or secret-looking and cannot be passed to ToolHive.`);
    }
  }
  if (sourceBuild.recipe.runtimeCommand && !safeRuntimeString(sourceBuild.recipe.runtimeCommand)) {
    blockers.push("Runtime command is unsafe or secret-looking and cannot be recorded in the source-build review.");
  }
  return blockers;
}

function customSourceBuildWarnings(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): string[] {
  const warnings: string[] = [];
  if (candidate.runtime.package?.registryType === "npm" || candidate.runtime.package?.registryType === "pypi") {
    warnings.push(`The original candidate referenced ${candidate.runtime.package.registryType}:${candidate.runtime.package.identifier}; the custom source lane will replace it with a pinned OCI image only after build review.`);
  }
  if (!sourceBuild.recipe.dockerfilePath && sourceBuild.recipe.kind === "existing-dockerfile") {
    warnings.push("Existing Dockerfile recipe did not name a Dockerfile path; Ambient will assume Dockerfile in the build context when build execution is wired.");
  }
  warnings.push("This review is read-only and does not build, push, run, or install a container image.");
  return warnings;
}

function sourceBuiltCustomImageCandidate(candidate: McpAutowireCandidate, sourceBuild: McpCustomSourceBuildPlan): McpAutowireCandidate {
  const evidence = candidate.evidence.some((entry) => entry.id === sourceBuildEvidenceId)
    ? candidate.evidence
    : [
        ...candidate.evidence,
        {
          id: sourceBuildEvidenceId,
          type: "other" as const,
          locator: `${candidate.source.url ?? sourceBuild.sourceUrl ?? "source"}@${sourceBuild.resolvedCommit}`,
          summary: `Reviewed custom ToolHive source build plan produced OCI image ${sourceBuild.image.identifier} at digest ${sourceBuild.image.digest}.`,
        },
      ];
  return {
    ...candidate,
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    source: {
      ...candidate.source,
      resolvedCommit: sourceBuild.resolvedCommit,
      evidenceRefs: uniqueStrings([...candidate.source.evidenceRefs, sourceBuildEvidenceId]),
    },
    recommendedLane: "standard-mcp",
    runtime: {
      ...candidate.runtime,
      provider: "toolhive",
      sourceKind: "custom-image",
      package: {
        registryType: "oci",
        identifier: sourceBuild.image.identifier,
        digest: sourceBuild.image.digest,
        runtimeHint: sourceBuild.recipe.runtimeCommand,
        packageArguments: [
          ...sourceBuild.recipe.serverArgs.map((arg) => ({
            type: "positional" as const,
            valueHint: arg,
            isFixed: true,
          })),
          ...sourceBuild.recipe.runtimeEnv.map((env) => ({
            type: "env" as const,
            name: env.name,
            valueHint: env.value,
            isFixed: true,
          })),
        ],
      },
      updatePolicy: {
        mode: "pinned",
        reason: `Custom source image built from reviewed commit ${sourceBuild.resolvedCommit} and pinned by OCI digest.`,
        evidenceRefs: [sourceBuildEvidenceId],
      },
      sourceBuild: {
        schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
        sourceUrl: candidate.source.url ?? sourceBuild.sourceUrl!,
        resolvedCommit: sourceBuild.resolvedCommit,
        recipeKind: sourceBuild.recipe.kind,
        recipeHash: sourceBuildRecipeHash(sourceBuild),
        imageIdentifier: sourceBuild.image.identifier,
        imageDigest: sourceBuild.image.digest!,
        evidenceRefs: [sourceBuildEvidenceId],
      },
      evidenceRefs: [sourceBuildEvidenceId],
    },
    permissions: sourceBuiltRuntimePermissions(candidate),
    validationPlan: {
      ...candidate.validationPlan,
      preflights: uniqueStrings([...candidate.validationPlan.preflights, "source-image-digest", "mcp-tool-discovery"]),
      evidenceRefs: uniqueStrings([...candidate.validationPlan.evidenceRefs, sourceBuildEvidenceId]),
    },
    evidence,
    riskSummary: {
      ...candidate.riskSummary,
      reasons: uniqueStrings([
        ...candidate.riskSummary.reasons,
        "Runs a custom source-built OCI image pinned to a reviewed GitHub commit and digest.",
      ]),
      evidenceRefs: uniqueStrings([...candidate.riskSummary.evidenceRefs, sourceBuildEvidenceId]),
    },
  };
}

function sourceBuiltRuntimePermissions(candidate: McpAutowireCandidate): McpAutowireCandidate["permissions"] {
  const network = candidate.permissions.network;
  if (network.mode !== "allowlist") return candidate.permissions;
  const allowHosts = uniqueStrings(network.allowHosts.filter((host) => !isSourceBuildInfrastructureHost(host)));
  if (!allowHosts.length) {
    return {
      ...candidate.permissions,
      network: {
        mode: "disabled",
        allowHosts: [],
        allowPorts: [],
        justification: "No reviewed runtime network hosts remain after excluding source-build, package registry, and source-control infrastructure hosts.",
      },
    };
  }
  if (allowHosts.length === network.allowHosts.length) return candidate.permissions;
  return {
    ...candidate.permissions,
    network: {
      ...network,
      allowHosts,
      justification: `${network.justification ?? "Reviewed runtime network allowlist."} Source-build/package/source-control infrastructure hosts were excluded from runtime egress.`,
    },
  };
}

function isSourceBuildInfrastructureHost(value: string): boolean {
  const host = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!host) return false;
  return sourceBuildInfrastructureHostExact.has(host) ||
    sourceBuildInfrastructureHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

const sourceBuildInfrastructureHostExact = new Set([
  "github-cloud.s3.amazonaws.com",
  "github.gi",
  "raw.githubusercontent.com",
  "github.com",
]);

const sourceBuildInfrastructureHostSuffixes = [
  "crates.io",
  "docs.rs",
  "githubusercontent.com",
  "npmjs.com",
  "pypi.org",
  "pythonhosted.org",
];

function candidateHashMismatchBlocker(expected: string | undefined, actual: string | undefined): string[] {
  if (!expected || !actual || expected === actual) return [];
  return [`Candidate hash mismatch: expected ${expected}, got ${actual}. Rerun autowire plan/review before custom source build review.`];
}

function githubRepoKey(value: string): string | undefined {
  try {
    const url = new URL(value.replace(/^git\+/, "").replace(/^github:/, "https://github.com/").replace(/\.git$/i, ""));
    if (url.hostname.toLowerCase() !== "github.com") return undefined;
    const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) return undefined;
    return `${owner.toLowerCase()}/${repoRaw.replace(/\.git$/i, "").toLowerCase()}`;
  } catch {
    return undefined;
  }
}

function safeRelativePath(value: string): boolean {
  return value.length <= 240 &&
    !value.includes("\0") &&
    !value.startsWith("/") &&
    !value.startsWith("~") &&
    !value.split("/").includes("..") &&
    /^[A-Za-z0-9._/@-]+$/.test(value);
}

function safeImageIdentifier(value: string): boolean {
  return value.length <= 255 &&
    !value.includes("\0") &&
    !looksSecretLike(value) &&
    !value.includes("://") &&
    !value.startsWith("-") &&
    !value.startsWith("./") &&
    !value.startsWith("../") &&
    /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,254}$/.test(value);
}

function safeRuntimeString(value: string): boolean {
  return value.length <= 240 && !value.includes("\0") && !looksSecretLike(value);
}

function safeContainerMountPath(value: string): boolean {
  const normalized = value.trim().replace(/\/+$/, "") || "/";
  return normalized.length <= 240 &&
    normalized.startsWith("/") &&
    normalized !== "/" &&
    !normalized.includes("\0") &&
    !normalized.includes(":") &&
    !normalized.split("/").includes("..");
}

function looksSecretEnvName(name: string): boolean {
  return /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASS|BEARER|CREDENTIAL|PRIVATE_?KEY)(?:_|$)/i.test(name);
}

function looksSecretLike(value: string): boolean {
  return /(api[_-]?key|secret|token|password|passwd|bearer\s+[a-z0-9._-]{12,})/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()).map((value) => value.trim()))];
}

function sourceBuildRecipeHash(sourceBuild: McpCustomSourceBuildPlan): string {
  return createHash("sha256").update(stableJson({
    sourceUrl: sourceBuild.sourceUrl,
    resolvedCommit: sourceBuild.resolvedCommit,
    imageIdentifier: sourceBuild.image.identifier,
    recipe: sourceBuild.recipe,
  })).digest("hex");
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}
