import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { managedInstallWorkspacePath } from "../setup/setupAmbientCliContract";
import { executeLambdaRlm } from "../tool-runtime/toolRuntimeAmbientCliContract";
import { isPathInside } from "./ambientCliSessionFacade";

export const ambientCliSkillSummarySchemaVersion = "ambient-cli-skill-summary-v1";

const cliSkillSummaryCacheRoot = ".ambient/cli-packages/summaries";

const cliSkillSummarySchema = z
  .object({
    schemaVersion: z.literal(ambientCliSkillSummarySchemaVersion),
    packageId: z.string().min(1),
    packageName: z.string().min(1),
    packageSource: z.string().min(1),
    packageVersion: z.string().optional(),
    skillPath: z.string().min(1),
    rawSkillHash: z.string().min(1),
    generatedAt: z.string().min(1),
    capabilityBrief: z.string().min(1),
    whenToUse: z.array(z.string()).default([]),
    commands: z.record(z.string(), z.string()).default({}),
    arguments: z.array(z.string()).default([]),
    safety: z.array(z.string()).default([]),
    fallbacks: z.array(z.string()).default([]),
  })
  .passthrough();

const cliSkillSummaryFailureSchema = z
  .object({
    schemaVersion: z.literal(ambientCliSkillSummarySchemaVersion),
    status: z.literal("failed"),
    packageId: z.string().min(1),
    packageName: z.string().min(1),
    packageSource: z.string().min(1),
    packageVersion: z.string().optional(),
    skillPath: z.string().min(1),
    rawSkillHash: z.string().min(1),
    failedAt: z.string().min(1),
    retryAfter: z.string().min(1),
    error: z.string().min(1),
  })
  .passthrough();

type AmbientCliSkillSummaryStatus = "available" | "missing" | "stale" | "failed" | "not_requested";
type AmbientCliSkillSummary = z.infer<typeof cliSkillSummarySchema>;
type AmbientCliSkillSummaryFailure = z.infer<typeof cliSkillSummaryFailureSchema>;

interface AmbientCliSkillSummaryCommand {
  name: string;
  description?: string;
  args: string[];
  cwd: "workspace" | "package";
}

interface AmbientCliSkillSummaryEnvRequirement {
  name: string;
  description?: string;
  required: boolean;
}

interface AmbientCliSkillSummaryPackage {
  id: string;
  name: string;
  version?: string;
  description?: string;
  rootPath: string;
  source: string;
  commands: AmbientCliSkillSummaryCommand[];
  envRequirements: AmbientCliSkillSummaryEnvRequirement[];
}

interface AmbientCliSkillSummarySkill {
  name: string;
  description?: string;
  path: string;
}

interface AmbientCliSkillDescription {
  capabilityId: string;
  sourceKind: "ambient-cli";
  name: string;
  description?: string;
  path: string;
  summaryStatus: AmbientCliSkillSummaryStatus;
  summary?: AmbientCliSkillSummary;
  summaryError?: string;
  summaryRetryAfter?: string;
  text?: string;
  truncated?: boolean;
}

interface AmbientCliPackageDescriptionForSummary {
  package: {
    id: string;
    name: string;
  };
  skills: Array<{
    name: string;
    path: string;
    summaryStatus: AmbientCliSkillSummaryStatus;
    summaryError?: string;
    summaryRetryAfter?: string;
  }>;
}

interface AmbientCliPackageSummaryHydrationResult {
  packageId: string;
  packageName: string;
  attempted: boolean;
  reason?: string;
  summaryStatuses: Array<{
    skillName: string;
    skillPath: string;
    status: AmbientCliSkillSummaryStatus;
    error?: string;
    retryAfter?: string;
  }>;
  availableCount: number;
  failedCount: number;
}

interface AmbientCliPackageSkillSummaryServicesDependencies {
  ambientCliCapabilityId(packageId: string, kind: "skill", key: string): string;
  contentHash(value: string | Buffer): string;
  describeAmbientCliPackage(
    workspacePath: string,
    input: { packageId?: string; packageName?: string; includeSummary?: boolean },
    options?: {
      generateMissingSummaries?: boolean;
      modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
      signal?: AbortSignal;
      now?: () => Date;
    },
  ): Promise<AmbientCliPackageDescriptionForSummary>;
  errorMessage(error: unknown): string;
  readJson(path: string): Promise<unknown>;
  shortHash(value: string): string;
  truncateText(value: string, maxLength: number): string;
}

export function createAmbientCliPackageSkillSummaryServices(deps: AmbientCliPackageSkillSummaryServicesDependencies) {
  const { ambientCliCapabilityId, contentHash, describeAmbientCliPackage, errorMessage, readJson, shortHash, truncateText } = deps;

  async function hydrateAmbientCliPackageSummaries(
    workspacePath: string,
    selector: { packageId?: string; packageName?: string },
    options: {
      generateMissingSummaries?: boolean;
      modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
      signal?: AbortSignal;
      now?: () => Date;
    } = {},
  ): Promise<AmbientCliPackageSummaryHydrationResult> {
    const packageIdentity = selector.packageId ? { packageId: selector.packageId } : { packageName: selector.packageName ?? "" };
    if (!options.generateMissingSummaries) {
      const description = await describeAmbientCliPackage(workspacePath, packageIdentity, {
        ...options,
        generateMissingSummaries: false,
      });
      return ambientCliSummaryHydrationResult(description, false, "Summary generation policy is disabled.");
    }
    if (!options.modelComplete) {
      const description = await describeAmbientCliPackage(workspacePath, packageIdentity, {
        ...options,
        generateMissingSummaries: false,
      });
      return ambientCliSummaryHydrationResult(description, false, "No RLM model completer is configured.");
    }
    const description = await describeAmbientCliPackage(workspacePath, { ...packageIdentity, includeSummary: true }, options);
    return ambientCliSummaryHydrationResult(description, true);
  }

  function ambientCliSummaryHydrationResult(
    description: AmbientCliPackageDescriptionForSummary,
    attempted: boolean,
    reason?: string,
  ): AmbientCliPackageSummaryHydrationResult {
    const summaryStatuses = description.skills.map((skill) => ({
      skillName: skill.name,
      skillPath: skill.path,
      status: skill.summaryStatus,
      ...(skill.summaryError ? { error: skill.summaryError } : {}),
      ...(skill.summaryRetryAfter ? { retryAfter: skill.summaryRetryAfter } : {}),
    }));
    return {
      packageId: description.package.id,
      packageName: description.package.name,
      attempted,
      ...(reason ? { reason } : {}),
      summaryStatuses,
      availableCount: summaryStatuses.filter((item) => item.status === "available").length,
      failedCount: summaryStatuses.filter((item) => item.status === "failed").length,
    };
  }

  async function writeAmbientCliSkillSummary(workspacePath: string, summary: AmbientCliSkillSummary): Promise<string> {
    const parsed = cliSkillSummarySchema.parse(summary);
    const cachePath = ambientCliSkillSummaryCachePath(workspacePath, parsed.packageId, parsed.skillPath);
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return cachePath;
  }

  async function ambientCliSkillDescription(
    workspacePath: string,
    pkg: AmbientCliSkillSummaryPackage,
    skill: AmbientCliSkillSummarySkill,
    input: {
      includeSkill: boolean;
      includeSummary: boolean;
      maxSkillChars: number;
      generateMissingSummaries: boolean;
      modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
      signal?: AbortSignal;
      now: () => Date;
    },
  ): Promise<AmbientCliSkillDescription> {
    const skillPath = resolve(skill.path);
    if (!isPathInside(pkg.rootPath, skillPath)) throw new Error(`Ambient CLI skill path is outside the package root: ${skill.path}`);
    const skillRelativePath = relative(pkg.rootPath, skillPath).split(sep).join("/");
    const description: AmbientCliSkillDescription = {
      capabilityId: ambientCliCapabilityId(pkg.id, "skill", skillPath),
      sourceKind: "ambient-cli",
      name: skill.name,
      ...(skill.description ? { description: skill.description } : {}),
      path: skillRelativePath,
      summaryStatus: input.includeSummary ? "missing" : "not_requested",
    };
    if (!input.includeSummary && !input.includeSkill) return description;
    const text = await readFile(skillPath, "utf8");
    const rawSkillHash = contentHash(text);
    if (input.includeSummary) {
      let cached = await readAmbientCliSkillSummary(workspacePath, pkg, skillRelativePath, rawSkillHash, input.now());
      if (
        (cached.summaryStatus === "missing" || cached.summaryStatus === "stale") &&
        input.generateMissingSummaries &&
        input.modelComplete
      ) {
        cached = await generateAndCacheAmbientCliSkillSummary(workspacePath, pkg, skill, skillRelativePath, text, rawSkillHash, {
          modelComplete: input.modelComplete,
          signal: input.signal,
          now: input.now,
        });
      }
      Object.assign(description, cached);
    }
    if (!input.includeSkill) return description;
    return {
      ...description,
      text: truncateText(text, input.maxSkillChars),
      truncated: text.length > input.maxSkillChars,
    };
  }

  async function readAmbientCliSkillSummary(
    workspacePath: string,
    pkg: AmbientCliSkillSummaryPackage,
    skillRelativePath: string,
    rawSkillHash: string,
    now: Date,
  ): Promise<Pick<AmbientCliSkillDescription, "summaryStatus" | "summary" | "summaryError" | "summaryRetryAfter">> {
    const cachePath = ambientCliSkillSummaryCachePath(workspacePath, pkg.id, skillRelativePath);
    const installWorkspace = managedInstallWorkspacePath(workspacePath);
    if (!isPathInside(installWorkspace, cachePath))
      return { summaryStatus: "failed", summaryError: "Summary cache path resolves outside Ambient-managed install state." };
    if (!existsSync(cachePath)) return { summaryStatus: "missing" };
    try {
      const value = await readJson(cachePath);
      const failed = cliSkillSummaryFailureSchema.safeParse(value);
      if (failed.success) {
        if (!ambientCliSummaryIdentityMatches(failed.data, pkg, skillRelativePath) || failed.data.rawSkillHash !== rawSkillHash) {
          return { summaryStatus: "missing", summaryError: "Previous summary failure record no longer matches the installed skill." };
        }
        if (Date.parse(failed.data.retryAfter) > now.getTime()) {
          return {
            summaryStatus: "failed",
            summaryError: `Cached summary generation failed: ${failed.data.error}`,
            summaryRetryAfter: failed.data.retryAfter,
          };
        }
        return { summaryStatus: "missing", summaryError: "Previous summary failure retry window has elapsed." };
      }
      const summary = cliSkillSummarySchema.parse(value);
      if (!ambientCliSummaryIdentityMatches(summary, pkg, skillRelativePath)) {
        return { summaryStatus: "stale", summaryError: "Cached summary package identity no longer matches the installed skill." };
      }
      if (summary.rawSkillHash !== rawSkillHash) {
        return { summaryStatus: "stale", summaryError: "Cached summary was generated for older SKILL.md content." };
      }
      return { summaryStatus: "available", summary };
    } catch (error) {
      return { summaryStatus: "failed", summaryError: errorMessage(error) };
    }
  }

  async function generateAndCacheAmbientCliSkillSummary(
    workspacePath: string,
    pkg: AmbientCliSkillSummaryPackage,
    skill: AmbientCliSkillSummarySkill,
    skillRelativePath: string,
    skillText: string,
    rawSkillHash: string,
    options: {
      modelComplete: (prompt: string, signal?: AbortSignal) => Promise<string>;
      signal?: AbortSignal;
      now: () => Date;
    },
  ): Promise<Pick<AmbientCliSkillDescription, "summaryStatus" | "summary" | "summaryError" | "summaryRetryAfter">> {
    try {
      const result = await executeLambdaRlm({
        text: ambientCliSkillSummaryPrompt(pkg, skill, skillRelativePath, skillText),
        taskType: "extraction",
        contextWindowChars: 100_000,
        maxModelCalls: 6,
        signal: options.signal,
        modelComplete: options.modelComplete,
      });
      const parsed = parseAmbientCliSkillSummaryJson(result.response);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("RLM summary response JSON must be an object.");
      const summary = cliSkillSummarySchema.parse({
        ...parsed,
        schemaVersion: ambientCliSkillSummarySchemaVersion,
        packageId: pkg.id,
        packageName: pkg.name,
        packageSource: pkg.source,
        ...(pkg.version ? { packageVersion: pkg.version } : {}),
        skillPath: skillRelativePath,
        rawSkillHash,
        generatedAt: options.now().toISOString(),
      });
      await writeAmbientCliSkillSummary(workspacePath, summary);
      return { summaryStatus: "available", summary };
    } catch (error) {
      const failedAt = options.now();
      const retryAfter = new Date(failedAt.getTime() + 6 * 60 * 60 * 1000).toISOString();
      const failure: AmbientCliSkillSummaryFailure = {
        schemaVersion: ambientCliSkillSummarySchemaVersion,
        status: "failed",
        packageId: pkg.id,
        packageName: pkg.name,
        packageSource: pkg.source,
        ...(pkg.version ? { packageVersion: pkg.version } : {}),
        skillPath: skillRelativePath,
        rawSkillHash,
        failedAt: failedAt.toISOString(),
        retryAfter,
        error: truncateText(errorMessage(error), 1_000),
      };
      await writeAmbientCliSkillSummaryFailure(workspacePath, failure);
      return {
        summaryStatus: "failed",
        summaryError: `RLM summary generation failed: ${failure.error}`,
        summaryRetryAfter: retryAfter,
      };
    }
  }

  async function writeAmbientCliSkillSummaryFailure(workspacePath: string, failure: AmbientCliSkillSummaryFailure): Promise<string> {
    const parsed = cliSkillSummaryFailureSchema.parse(failure);
    const cachePath = ambientCliSkillSummaryCachePath(workspacePath, parsed.packageId, parsed.skillPath);
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return cachePath;
  }

  function ambientCliSummaryIdentityMatches(
    summary: Pick<AmbientCliSkillSummary, "packageId" | "packageName" | "packageSource" | "packageVersion" | "skillPath">,
    pkg: AmbientCliSkillSummaryPackage,
    skillRelativePath: string,
  ): boolean {
    return (
      summary.packageId === pkg.id &&
      summary.packageName === pkg.name &&
      summary.packageSource === pkg.source &&
      summary.packageVersion === pkg.version &&
      summary.skillPath === skillRelativePath
    );
  }

  function ambientCliSkillSummaryPrompt(
    pkg: AmbientCliSkillSummaryPackage,
    skill: AmbientCliSkillSummarySkill,
    skillRelativePath: string,
    skillText: string,
  ): string {
    return [
      "Create a concise Ambient CLI skill summary for model-facing capability discovery.",
      "Return ONLY a JSON object with these keys: capabilityBrief, whenToUse, commands, arguments, safety, fallbacks.",
      "Rules:",
      "- capabilityBrief: one or two concise sentences.",
      "- whenToUse, arguments, safety, fallbacks: arrays of short strings.",
      "- commands: object keyed by descriptor command name with short usage notes.",
      "- Do not include secrets, raw env values, markdown fences, or commentary outside JSON.",
      "",
      `Package: ${pkg.name}`,
      pkg.version ? `Version: ${pkg.version}` : undefined,
      pkg.description ? `Package description: ${pkg.description}` : undefined,
      `Skill: ${skill.name}`,
      skill.description ? `Skill description: ${skill.description}` : undefined,
      `Skill path: ${skillRelativePath}`,
      "Descriptor commands:",
      JSON.stringify(
        pkg.commands.map((command) => ({ name: command.name, description: command.description, args: command.args, cwd: command.cwd })),
        null,
        2,
      ),
      "Env requirements:",
      JSON.stringify(
        pkg.envRequirements.map((env) => ({ name: env.name, description: env.description, required: env.required })),
        null,
        2,
      ),
      "SKILL.md:",
      skillText,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function parseAmbientCliSkillSummaryJson(value: string): unknown {
    const trimmed = value.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
      throw new Error("RLM summary response was not valid JSON.");
    }
  }

  function ambientCliSkillSummaryCachePath(workspacePath: string, packageId: string, skillRelativePath: string): string {
    return resolve(
      managedInstallWorkspacePath(workspacePath),
      cliSkillSummaryCacheRoot,
      `${shortHash(`${packageId}:${skillRelativePath}`)}.json`,
    );
  }

  return {
    ambientCliSkillDescription,
    hydrateAmbientCliPackageSummaries,
    writeAmbientCliSkillSummary,
  };
}
