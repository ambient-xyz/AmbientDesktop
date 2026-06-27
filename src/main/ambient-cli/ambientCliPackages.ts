import { createHash } from "node:crypto";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isPathInside } from "./ambientCliSessionFacade";
import { executeProfiledCommand, materializeTextOutput } from "./ambientCliToolRuntimeFacade";
import { ambientRuntimeEnv, managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "./ambientCliSetupFacade";
import { buildSafeProcessEnv, hardenedGitEnv, safeGitCloneSource } from "./ambientCliSecurityFacade";
import { createAmbientCliEnvBindingServices } from "./ambientCliEnvBindings";
import { createAmbientCliPackageHealthServices } from "./ambientCliPackageHealth";
import { createAmbientCliPackageSkillSummaryServices } from "./ambientCliPackageSkillSummaries";
import { createAmbientCliPackageInstallSafetyServices } from "./ambientCliPackageInstallSafety";
import {
  createAmbientCliPackageInstallSourceServices,
  isBundledAmbientCliInstallSource,
  type FirstPartyAmbientCliPackage,
} from "./ambientCliPackageInstallSources";
import {
  cliDescriptorSchema,
  cliPackageConfigPath,
  cliPackageConfigSchema,
  cliPackageDescriptorName,
  cliPackageImportRoot,
  packageJsonName,
  packageJsonSchema,
  type CliPackageConfig,
} from "./ambientCliPackageSchemas";
import {
  ambientCliCapabilityId,
  type AmbientCliCapabilitySearchInput,
  type AmbientCliCapabilitySearchResponse,
  type AmbientCliCapabilitySearchResult,
  type AmbientCliPackageCatalog,
  type AmbientCliPackageDescription,
  type AmbientCliPackageSummary,
  type AmbientCliRunResult,
  type BundledAmbientCliPackageRootCandidateOptions,
  type DescribeAmbientCliPackageInput,
  type DescribeAmbientCliPackageOptions,
  type DiscoverAmbientCliPackagesOptions,
  type EnsureFirstPartyAmbientCliPackagesOptions,
  type FirstPartyAmbientCliPackageInstallStatus,
  type RunAmbientCliInput,
} from "./ambientCliPackageTypes";
import {
  ambientCliCapabilitySearchResult,
  ambientCliCommandDescription,
  ambientCliDescribeGuidance,
  normalizeSearchText,
  truncateText,
} from "./ambientCliPackageSearch";
import {
  ambientCliEmbeddingProvidersFromCatalog,
  ambientCliSttProvidersFromCatalog,
  ambientCliVoiceProvidersFromCatalog,
} from "./ambientCliPackageProviderMetadata";
import {
  errorMessage,
  inspectAmbientCliPackage as inspectAmbientCliPackageAtRoot,
  normalizeEnvName,
  readJson,
  resolveCliExecutable,
  resolveDescriptorArg,
} from "./ambientCliPackageInspection";

export type { AmbientCliPiCatalogResolution } from "./ambientCliPiCatalogAdapter";
export { ambientCliCapabilityId, ambientCliRegistryPluginId } from "./ambientCliPackageTypes";
export type * from "./ambientCliPackageTypes";
export { ambientCliWorkspaceProviderMarkerPath } from "./ambientCliEnvBindings";

type BundledFirstPartyAmbientCliPackage = Extract<FirstPartyAmbientCliPackage, { kind: "bundled" }>;

const firstPartyAmbientCliPackages: FirstPartyAmbientCliPackage[] = [
  {
    packageName: "youtube-transcript",
    source: "https://github.com/badlogic/pi-skills/blob/main/youtube-transcript/SKILL.md",
    kind: "pi-catalog",
  },
  {
    packageName: "brave-search",
    source: "https://github.com/badlogic/pi-skills/blob/main/brave-search/SKILL.md",
    kind: "pi-catalog",
  },
  {
    packageName: "pi-arxiv",
    source: "https://pi.dev/packages/pi-arxiv?name=arxiv",
    kind: "pi-catalog",
  },
  {
    packageName: "ambient-qwen3-asr",
    source: "bundled:ambient-qwen3-asr",
    kind: "bundled",
    packageDir: "ambient-qwen3-asr",
  },
  {
    packageName: "ambient-faster-whisper-stt",
    source: "bundled:ambient-faster-whisper-stt",
    kind: "bundled",
    packageDir: "ambient-faster-whisper-stt",
  },
  {
    packageName: "ambient-hyperframes",
    source: "bundled:ambient-hyperframes",
    kind: "bundled",
    packageDir: "ambient-hyperframes",
  },
  {
    packageName: "ambient-imagegen",
    source: "bundled:ambient-imagegen",
    kind: "bundled",
    packageDir: "ambient-imagegen",
  },
  {
    packageName: "ambient-tinystyler",
    source: "bundled:ambient-tinystyler",
    kind: "bundled",
    packageDir: "ambient-tinystyler",
    autoInstall: false,
  },
  {
    packageName: "ambient-blockchain",
    source: "bundled:ambient-blockchain",
    kind: "bundled",
    packageDir: "ambient-blockchain",
  },
  {
    packageName: "ambient-minicpm-v-vision",
    source: "bundled:ambient-minicpm-v-vision",
    kind: "bundled",
    packageDir: "ambient-minicpm-v-vision",
    autoInstall: false,
  },
];
const firstPartyAmbientCliPackageInstallLocks = new Map<string, Promise<FirstPartyAmbientCliPackageInstallStatus>>();
const ambientCliPackageDiscoveryLocks = new Map<string, Promise<AmbientCliPackageCatalog>>();

async function ensureAmbientCliManagedInstallWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, ".ambient/cli-packages");
  return managedInstallWorkspacePath(workspacePath);
}

const ambientCliEnvBindingServices = createAmbientCliEnvBindingServices({
  cliPackageConfigPath,
  ensureAmbientCliManagedInstallWorkspace,
  normalizeEnvName,
  readJson,
  errorMessage,
});

function inspectAmbientCliPackage(
  workspacePath: string,
  rootPath: string,
  source: string,
  descriptorOverlay?: unknown,
): Promise<AmbientCliPackageSummary> {
  return inspectAmbientCliPackageAtRoot(managedInstallWorkspacePath(workspacePath), rootPath, source, descriptorOverlay);
}

const ambientCliProcessEnv = ambientCliEnvBindingServices.ambientCliProcessEnv;
export const hasAmbientCliWorkspaceProviderDiscoverySignal = ambientCliEnvBindingServices.hasAmbientCliWorkspaceProviderDiscoverySignal;
export const hasAmbientCliWorkspaceProviderMarker = ambientCliEnvBindingServices.hasAmbientCliWorkspaceProviderMarker;
const markAmbientCliWorkspaceProviderState = ambientCliEnvBindingServices.markAmbientCliWorkspaceProviderState;
export const removeAmbientCliPackageEnvBindings = ambientCliEnvBindingServices.removeAmbientCliPackageEnvBindings;
const requiredMissingEnv = ambientCliEnvBindingServices.requiredMissingEnv;
const resolveAmbientCliEnvStatus = ambientCliEnvBindingServices.resolveAmbientCliEnvStatus;
export const saveAmbientCliPackageEnvSecret = ambientCliEnvBindingServices.saveAmbientCliPackageEnvSecret;
export const setAmbientCliPackageEnvBinding = ambientCliEnvBindingServices.setAmbientCliPackageEnvBinding;
export const setAmbientCliPackageSecretBinding = ambientCliEnvBindingServices.setAmbientCliPackageSecretBinding;

const ambientCliPackageHealthServices = createAmbientCliPackageHealthServices({
  cliPackageDescriptorName,
  ambientCliProcessEnv,
  contentHash,
  errorMessage,
  isErrno,
  resolveCliExecutable,
  resolveDescriptorArg,
});
const withAmbientCliPackageHealth = ambientCliPackageHealthServices.withAmbientCliPackageHealth;
export const checkAmbientCliPackageHealth = ambientCliPackageHealthServices.checkAmbientCliPackageHealth;

const ambientCliPackageSkillSummaryServices = createAmbientCliPackageSkillSummaryServices({
  ambientCliCapabilityId,
  contentHash,
  describeAmbientCliPackage,
  errorMessage,
  readJson,
  shortHash,
  truncateText,
});
const ambientCliSkillDescription = ambientCliPackageSkillSummaryServices.ambientCliSkillDescription;
export const hydrateAmbientCliPackageSummaries = ambientCliPackageSkillSummaryServices.hydrateAmbientCliPackageSummaries;
export const writeAmbientCliSkillSummary = ambientCliPackageSkillSummaryServices.writeAmbientCliSkillSummary;

const ambientCliPackageInstallSafetyServices = createAmbientCliPackageInstallSafetyServices({
  cliPackageDescriptorName,
  packageJsonName,
  ambientRuntimeEnv: () => ambientRuntimeEnv(),
  gitEnv: () => hardenedGitEnv(ambientRuntimeEnv(process.env, { GIT_TERMINAL_PROMPT: "0" })),
  materializeTextOutput,
  parseDescriptorOverlay: (descriptorOverlay) => cliDescriptorSchema.parse(descriptorOverlay),
  parsePackageJson: (value) => packageJsonSchema.parse(value),
  readJson,
  contentHash,
  stableJson,
  errorMessage,
  isErrno,
  isBundledAmbientCliInstallSource,
  safeGitCloneSource,
});
const ambientCliPackageIgnoredPathReferenceError = ambientCliPackageInstallSafetyServices.ambientCliPackageIgnoredPathReferenceError;
const removeAmbientCliPackageIgnoredContent = ambientCliPackageInstallSafetyServices.removeAmbientCliPackageIgnoredContent;

const ambientCliPackageInstallSourceServices = createAmbientCliPackageInstallSourceServices({
  cliPackageImportRoot,
  firstPartyAmbientCliPackages,
  safety: ambientCliPackageInstallSafetyServices,
  ensureAmbientCliManagedInstallWorkspace,
  inspectAmbientCliPackage,
  discoverAmbientCliPackages,
  checkAmbientCliPackageHealth,
  installBundledAmbientCliPackageSource,
  resolveReviewedBundledAmbientCliPackageRoot,
  resolveAmbientCliEnvStatus,
  upsertCliPackageConfig,
  removeCliPackageConfig,
  safeName,
  shortHash,
  errorMessage,
});
export const installAmbientCliPackagePiCatalogSource = ambientCliPackageInstallSourceServices.installAmbientCliPackagePiCatalogSource;
export const installAmbientCliPackageSource = ambientCliPackageInstallSourceServices.installAmbientCliPackageSource;
export const previewAmbientCliPackageInstallSource = ambientCliPackageInstallSourceServices.previewAmbientCliPackageInstallSource;
export const previewAmbientCliPackagePiCatalogSource = ambientCliPackageInstallSourceServices.previewAmbientCliPackagePiCatalogSource;
export const uninstallAmbientCliPackageSource = ambientCliPackageInstallSourceServices.uninstallAmbientCliPackageSource;

function resolveAmbientCliPackageSourcePath(workspacePath: string, installWorkspace: string, source: string): string {
  const fromManagedState = resolve(installWorkspace, source);
  if (existsSync(fromManagedState) || source.startsWith("./.ambient/") || source.startsWith(".ambient/")) return fromManagedState;
  return resolve(workspacePath, source);
}

export async function discoverAmbientCliPackages(
  workspacePath: string,
  options: DiscoverAmbientCliPackagesOptions = {},
): Promise<AmbientCliPackageCatalog> {
  const lockKey = options.includeHealth && !options.healthCommandFilter ? resolve(workspacePath) : undefined;
  if (lockKey) {
    const existing = ambientCliPackageDiscoveryLocks.get(lockKey);
    if (existing) return existing;
    const pending = discoverAmbientCliPackagesUncached(workspacePath, options);
    ambientCliPackageDiscoveryLocks.set(lockKey, pending);
    try {
      return await pending;
    } finally {
      if (ambientCliPackageDiscoveryLocks.get(lockKey) === pending) {
        ambientCliPackageDiscoveryLocks.delete(lockKey);
      }
    }
  }
  return discoverAmbientCliPackagesUncached(workspacePath, options);
}

async function discoverAmbientCliPackagesUncached(
  workspacePath: string,
  options: DiscoverAmbientCliPackagesOptions,
): Promise<AmbientCliPackageCatalog> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const configPath = join(installWorkspace, cliPackageConfigPath);
  if (!existsSync(configPath)) return { packages: [], errors: [] };
  const packages: AmbientCliPackageSummary[] = [];
  const errors: string[] = [];
  try {
    const config = cliPackageConfigSchema.parse(await readJson(configPath));
    for (const entry of config.packages) {
      const rootPath = resolveAmbientCliPackageSourcePath(workspacePath, installWorkspace, entry.source);
      if (!isPathInside(installWorkspace, rootPath) && !isPathInside(resolve(workspacePath), rootPath)) {
        errors.push(`${entry.source}: CLI package source resolves outside Ambient-managed or workspace package state.`);
        continue;
      }
      const inspected = await inspectAmbientCliPackage(workspacePath, rootPath, entry.source);
      packages.push(
        options.includeHealth ? await withAmbientCliPackageHealth(workspacePath, inspected, options.healthCommandFilter) : inspected,
      );
    }
  } catch (error) {
    errors.push(`Ambient CLI package config: ${errorMessage(error)}`);
  }
  packages.sort((left, right) => left.name.localeCompare(right.name));
  return { packages, errors };
}

export async function ensureFirstPartyAmbientCliPackages(
  workspacePath: string,
  options: EnsureFirstPartyAmbientCliPackagesOptions = {},
): Promise<FirstPartyAmbientCliPackageInstallStatus[]> {
  const statuses: FirstPartyAmbientCliPackageInstallStatus[] = [];
  const push = (status: FirstPartyAmbientCliPackageInstallStatus): void => {
    statuses.push(status);
    options.onStatus?.(status);
  };

  const requestedPackageNames = options.packageNames ? new Set(options.packageNames) : undefined;
  for (const firstParty of firstPartyAmbientCliPackages) {
    if (requestedPackageNames && !requestedPackageNames.has(firstParty.packageName)) continue;
    if (!requestedPackageNames && firstParty.kind === "bundled" && firstParty.autoInstall === false) continue;
    const status = await withFirstPartyAmbientCliPackageInstallLock(workspacePath, firstParty, () =>
      ensureFirstPartyAmbientCliPackage(workspacePath, firstParty, options),
    );
    push(status);
  }

  return statuses;
}

async function ensureFirstPartyAmbientCliPackage(
  workspacePath: string,
  firstParty: FirstPartyAmbientCliPackage,
  options: EnsureFirstPartyAmbientCliPackagesOptions,
): Promise<FirstPartyAmbientCliPackageInstallStatus> {
  const catalog = await discoverAmbientCliPackages(workspacePath);
  const existing = catalog.packages.find((pkg) => pkg.name === firstParty.packageName);
  if (existing?.installed) {
    if (firstParty.kind === "bundled") {
      try {
        const sourcePath = resolveBundledAmbientCliPackageRoot(firstParty.packageDir, options);
        const bundled = await inspectAmbientCliPackage(workspacePath, sourcePath, firstParty.source);
        if (bundled.errors.length) {
          return {
            packageName: firstParty.packageName,
            source: firstParty.source,
            status: "failed",
            packageId: existing.id,
            error: `Bundled Ambient CLI package is invalid: ${bundled.errors.join("; ")}`,
          };
        }
        if (existing.version === bundled.version) {
          return {
            packageName: firstParty.packageName,
            source: firstParty.source,
            status: "already_installed",
            packageId: existing.id,
          };
        }
      } catch (error) {
        return {
          packageName: firstParty.packageName,
          source: firstParty.source,
          status: "failed",
          packageId: existing.id,
          error: errorMessage(error),
        };
      }
    } else {
      return {
        packageName: firstParty.packageName,
        source: firstParty.source,
        status: "already_installed",
        packageId: existing.id,
      };
    }
  }

  try {
    const installed =
      firstParty.kind === "pi-catalog"
        ? await installAmbientCliPackagePiCatalogSource(workspacePath, firstParty.source)
        : await installBundledAmbientCliPackageSource(workspacePath, firstParty, options);
    return {
      packageName: firstParty.packageName,
      source: firstParty.source,
      status: "installed",
      packageId: installed.id,
    };
  } catch (error) {
    return {
      packageName: firstParty.packageName,
      source: firstParty.source,
      status: "failed",
      error: errorMessage(error),
    };
  }
}

function withFirstPartyAmbientCliPackageInstallLock(
  workspacePath: string,
  firstParty: FirstPartyAmbientCliPackage,
  install: () => Promise<FirstPartyAmbientCliPackageInstallStatus>,
): Promise<FirstPartyAmbientCliPackageInstallStatus> {
  const lockKey = `${managedInstallWorkspacePath(workspacePath)}\0${firstParty.packageName}`;
  const pending = firstPartyAmbientCliPackageInstallLocks.get(lockKey);
  if (pending) return pending;
  const next = install().finally(() => {
    if (firstPartyAmbientCliPackageInstallLocks.get(lockKey) === next) {
      firstPartyAmbientCliPackageInstallLocks.delete(lockKey);
    }
  });
  firstPartyAmbientCliPackageInstallLocks.set(lockKey, next);
  return next;
}

async function installBundledAmbientCliPackageSource(
  workspacePath: string,
  firstParty: Extract<FirstPartyAmbientCliPackage, { kind: "bundled" }>,
  options: EnsureFirstPartyAmbientCliPackagesOptions,
  sourcePathOverride?: string,
): Promise<AmbientCliPackageSummary> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const sourcePath = sourcePathOverride ?? resolveBundledAmbientCliPackageRoot(firstParty.packageDir, options);
  const inspected = await inspectAmbientCliPackage(workspacePath, sourcePath, firstParty.source);
  if (inspected.errors.length) throw new Error(`Ambient CLI package is invalid: ${inspected.errors.join("; ")}`);
  const ignoredReferenceError = ambientCliPackageIgnoredPathReferenceError(inspected);
  if (ignoredReferenceError) throw new Error(ignoredReferenceError);
  if (inspected.name !== firstParty.packageName)
    throw new Error(`Bundled Ambient CLI package identity mismatch: expected "${firstParty.packageName}", got "${inspected.name}".`);
  if (!inspected.commands.length) throw new Error("Ambient CLI package descriptor does not declare any commands.");

  const importName = safeName(`${inspected.name}-${inspected.version ?? "bundled"}-${shortHash(sourcePath)}`);
  const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
  if (!isPathInside(installWorkspace, destination))
    throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(sourcePath, destination, { recursive: true, force: true, dereference: false });
    await removeAmbientCliPackageIgnoredContent(destination);
    const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
    const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
    if (imported.name !== firstParty.packageName)
      throw new Error(
        `Bundled Ambient CLI package identity mismatch after import: expected "${firstParty.packageName}", got "${imported.name}".`,
      );
    const health = await checkAmbientCliPackageHealth(imported, { workspacePath });
    const hardFailed = health.find((check) => !check.passed);
    if (hardFailed)
      throw new Error(
        `Ambient CLI package health check failed for "${hardFailed.commandName}": ${hardFailed.error ?? hardFailed.stderr ?? "unknown error"}`,
      );
    await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
    return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function enabledAmbientCliSkillPaths(workspacePath: string): Promise<string[]> {
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: false });
  return catalog.packages.flatMap((pkg) => (pkg.errors.length ? [] : pkg.skills.map((skill) => dirname(skill.path))));
}

export async function searchAmbientCliCapabilities(
  workspacePath: string,
  input: AmbientCliCapabilitySearchInput = {},
): Promise<AmbientCliCapabilitySearchResponse> {
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 8), 200));
  const query = normalizeSearchText(input.query);
  const kind = input.kind ?? "any";
  const requestedPackageId = input.packageId?.trim();
  const requestedPackageName = input.packageName?.trim();
  const requestedCommand = input.command?.trim();
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: input.includeHealth !== false });
  const candidates: AmbientCliCapabilitySearchResult[] = [];

  for (const pkg of catalog.packages) {
    if (!pkg.installed) continue;
    if (!input.includeUnavailable && pkg.errors.length > 0) continue;
    if (requestedPackageId && pkg.id !== requestedPackageId) continue;
    if (requestedPackageName && pkg.name !== requestedPackageName) continue;
    const envStatus = await resolveAmbientCliEnvStatus(workspacePath, pkg);
    const result = ambientCliCapabilitySearchResult(pkg, {
      missingEnv: requiredMissingEnv(envStatus).map((env) => env.name),
      query,
      kind,
      command: requestedCommand,
    });
    if (!result) continue;
    if (!input.includeUnavailable && result.availability !== "available") continue;
    candidates.push(result);
  }

  const sorted = candidates.sort((left, right) => right.score - left.score || left.packageName.localeCompare(right.packageName));
  return {
    results: sorted.slice(0, limit),
    truncated: sorted.length > limit,
    catalogVersion: `ambient-cli-v1:${shortHash(catalog.packages.map((pkg) => `${pkg.id}:${pkg.source}:${pkg.commands.map((command) => command.name).join(",")}`).join("|"))}`,
  };
}

export async function describeAmbientCliPackage(
  workspacePath: string,
  input: DescribeAmbientCliPackageInput,
  options: DescribeAmbientCliPackageOptions = {},
): Promise<AmbientCliPackageDescription> {
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: options.includeHealth === true });
  const pkg = selectCliPackageByIdentity(catalog.packages, input);
  if (!pkg.installed) throw new Error("Only installed Ambient CLI packages can be described.");
  const requestedCommand = input.command?.trim();
  const commands = requestedCommand ? pkg.commands.filter((command) => command.name === requestedCommand) : pkg.commands;
  if (requestedCommand && commands.length === 0)
    throw new Error(`Ambient CLI package "${pkg.name}" does not declare command "${requestedCommand}".`);
  const env = await resolveAmbientCliEnvStatus(workspacePath, pkg);
  const maxSkillChars = Math.max(0, Math.min(Math.floor(input.maxSkillChars ?? 8_000), 24_000));
  const includeSkill = input.includeSkill === true;
  const includeSummary = input.includeSummary !== false;
  const skills = await Promise.all(
    pkg.skills.map((skill) =>
      ambientCliSkillDescription(workspacePath, pkg, skill, {
        includeSkill,
        includeSummary,
        maxSkillChars,
        generateMissingSummaries: options.generateMissingSummaries === true,
        modelComplete: options.modelComplete,
        signal: options.signal,
        now: options.now ?? (() => new Date()),
      }),
    ),
  );
  const missingEnv = requiredMissingEnv(env);
  return {
    package: {
      id: pkg.id,
      name: pkg.name,
      ...(pkg.version ? { version: pkg.version } : {}),
      ...(pkg.description ? { description: pkg.description } : {}),
      source: pkg.source,
      installed: pkg.installed,
      availability: pkg.errors.length === 0 ? "available" : "unavailable",
      availabilityReason: pkg.errors[0] ?? "Installed Ambient CLI package is available; execution still requires ambient_cli approval.",
    },
    commands: commands.map((command) => ambientCliCommandDescription(pkg, command, missingEnv)),
    skills,
    env,
    guidance: ambientCliDescribeGuidance(pkg, commands, missingEnv),
    diagnostics: [`Package root: ${pkg.rootPath}`, `Package source: ${pkg.source}`, ...pkg.errors],
  };
}

export async function runAmbientCliPackageCommand(workspacePath: string, input: RunAmbientCliInput): Promise<AmbientCliRunResult> {
  const catalog = await discoverAmbientCliPackages(workspacePath);
  const pkg = selectCliPackage(catalog, input);
  if (pkg.errors.length) throw new Error(`Ambient CLI package "${pkg.name}" has errors: ${pkg.errors.join("; ")}`);
  const command = pkg.commands.find((candidate) => candidate.name === input.command);
  if (!command) throw new Error(`Ambient CLI package "${pkg.name}" does not declare command "${input.command}".`);
  const extraArgs = (input.args ?? []).map((arg) => {
    if (typeof arg !== "string") throw new Error("Ambient CLI args must be strings.");
    return arg;
  });
  const executionWorkspacePath = input.executionWorkspacePath ? resolve(input.executionWorkspacePath) : workspacePath;
  const cwd = resolveCliCwd(executionWorkspacePath, pkg.rootPath, command.cwd, input.cwd);
  const executable = resolveCliExecutable(pkg.rootPath, command.command);
  const args = [...command.args.map((arg) => resolveDescriptorArg(pkg.rootPath, arg)), ...extraArgs];
  const startedAt = Date.now();
  const envStatus = await resolveAmbientCliEnvStatus(workspacePath, pkg);
  const missingEnv = requiredMissingEnv(envStatus);
  if (missingEnv.length)
    throw new Error(`Ambient CLI package env requirements are missing: ${missingEnv.map((env) => env.name).join(", ")}`);
  const env: NodeJS.ProcessEnv = {
    ...buildSafeProcessEnv({}, input.env),
    ...(await ambientCliProcessEnv(workspacePath, pkg)),
  };
  const legacyTimeoutMs = input.timeoutMs ?? 120_000;
  const output = await executeProfiledCommand({
    command: executable,
    args,
    cwd,
    env,
    maxBuffer: 1024 * 1024 * 4,
    signal: input.signal,
    timeoutMs: command.timeoutProfile ? input.timeoutMs : legacyTimeoutMs,
    ...(command.timeoutProfile ? {} : { idleTimeoutMs: legacyTimeoutMs }),
    timeoutProfile: command.timeoutProfile ?? "quickProbe",
    progressPatterns: command.progressPatterns,
    devicePolicy: command.devicePolicy,
    phase: `ambient-cli command ${pkg.name}:${command.name}`,
  });
  const { stdout, stderr } = output;
  const stdoutOutput = stdout
    ? await materializeTextOutput(executionWorkspacePath, {
        label: `ambient-cli-${pkg.name}-${command.name}-stdout`,
        text: stdout,
        maxPreviewChars: 12_000,
      })
    : undefined;
  const stderrOutput = stderr
    ? await materializeTextOutput(executionWorkspacePath, {
        label: `ambient-cli-${pkg.name}-${command.name}-stderr`,
        text: stderr,
        maxPreviewChars: 12_000,
      })
    : undefined;
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    commandName: command.name,
    command: [command.command, ...output.args],
    cwd,
    durationMs: Date.now() - startedAt,
    ...(stdoutOutput ? { stdout: stdoutOutput.text, stdoutOutput } : {}),
    ...(stderrOutput ? { stderr: stderrOutput.text, stderrOutput } : {}),
    timeoutProfile: output.timeoutProfile,
    timeoutMs: output.timeoutMs,
    idleTimeoutMs: output.idleTimeoutMs,
    ...(output.lastProgressAt ? { lastProgressAt: output.lastProgressAt } : {}),
    ...(output.deviceSelection ? { deviceSelection: output.deviceSelection } : {}),
  };
}

export async function discoverAmbientCliVoiceProviders(workspacePath: string) {
  const catalog = await discoverAmbientCliPackages(workspacePath, {
    includeHealth: true,
    healthCommandFilter: (_pkg, command) => Boolean(command.voiceProvider),
  });
  return ambientCliVoiceProvidersFromCatalog(catalog);
}

export async function discoverAmbientCliEmbeddingProviders(workspacePath: string) {
  const catalog = await discoverAmbientCliPackages(workspacePath, {
    includeHealth: true,
    healthCommandFilter: (_pkg, command) => Boolean(command.embeddingProvider),
  });
  return ambientCliEmbeddingProvidersFromCatalog(catalog);
}

export async function discoverAmbientCliSttProviders(workspacePath: string) {
  const catalog = await discoverAmbientCliPackages(workspacePath, {
    includeHealth: true,
    healthCommandFilter: (_pkg, command) => Boolean(command.sttProvider),
  });
  return ambientCliSttProvidersFromCatalog(catalog);
}

function selectCliPackage(catalog: AmbientCliPackageCatalog, selector: RunAmbientCliInput): AmbientCliPackageSummary {
  return selectCliPackageByIdentity(catalog.packages, selector);
}

function selectCliPackageByIdentity(
  packages: AmbientCliPackageSummary[],
  selector: { packageId?: string; packageName?: string },
): AmbientCliPackageSummary {
  if (selector.packageId) {
    const pkg = packages.find((candidate) => candidate.id === selector.packageId);
    if (!pkg) throw new Error(`Ambient CLI package "${selector.packageId}" was not found.`);
    return pkg;
  }
  if (selector.packageName) {
    const matches = packages.filter((candidate) => candidate.name === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1)
      throw new Error(`Ambient CLI package name "${selector.packageName}" matched multiple packages. Specify packageId.`);
    throw new Error(`Ambient CLI package "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

function resolveCliCwd(
  workspacePath: string,
  packageRoot: string,
  policy: "workspace" | "package",
  requestedCwd: string | undefined,
): string {
  const base = policy === "package" ? packageRoot : workspacePath;
  const cwd = requestedCwd ? resolve(base, requestedCwd) : base;
  if (!isPathInside(base, cwd)) throw new Error("Ambient CLI cwd is outside the descriptor cwd policy.");
  return cwd;
}

export function bundledAmbientCliPackageRootCandidates(
  packageDir: string,
  options: BundledAmbientCliPackageRootCandidateOptions = {},
): string[] {
  const moduleDir = dirname(options.moduleFilePath ?? fileURLToPath(import.meta.url));
  const env = options.env ?? process.env;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const candidates = [
    ...(options.bundledPackageRootPath ? [resolve(options.bundledPackageRootPath, packageDir)] : []),
    ...(env.INIT_CWD ? [resolve(env.INIT_CWD, "resources", "ambient-cli-packages", packageDir)] : []),
    ...(env.PWD ? [resolve(env.PWD, "resources", "ambient-cli-packages", packageDir)] : []),
    resolve(options.cwd ?? process.cwd(), "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "..", "resources", "ambient-cli-packages", packageDir),
    ...(resourcesPath ? [resolve(resourcesPath, "ambient-cli-packages", packageDir)] : []),
  ];
  return [...new Set(candidates)];
}

function resolveBundledAmbientCliPackageRoot(packageDir: string, options: EnsureFirstPartyAmbientCliPackagesOptions): string {
  const candidates = bundledAmbientCliPackageRootCandidates(packageDir, options);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Bundled Ambient CLI package "${packageDir}" was not found. Checked: ${candidates.join(", ")}`);
  }
  return found;
}

function reviewedBundledAmbientCliPackageRootCandidates(packageDir: string): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const resourcesPath = process.resourcesPath;
  const candidates = [
    ...(resourcesPath ? [resolve(resourcesPath, "ambient-cli-packages", packageDir)] : []),
    resolve(moduleDir, "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "resources", "ambient-cli-packages", packageDir),
    resolve(moduleDir, "..", "..", "..", "resources", "ambient-cli-packages", packageDir),
  ];
  return [...new Set(candidates)];
}

function resolveReviewedBundledAmbientCliPackageRoot(firstParty: BundledFirstPartyAmbientCliPackage): string {
  const candidates = reviewedBundledAmbientCliPackageRootCandidates(firstParty.packageDir);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Reviewed bundled Ambient CLI package "${firstParty.packageName}" was not found. Checked trusted locations: ${candidates.join(", ")}`,
    );
  }
  return found;
}

async function upsertCliPackageConfig(workspacePath: string, source: string, packageName?: string): Promise<void> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const configPath = join(installWorkspace, cliPackageConfigPath);
  await mkdir(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? cliPackageConfigSchema.parse(await readJson(configPath)) : { packages: [] };
  const packages: CliPackageConfig["packages"] = [];
  for (const entry of existing.packages) {
    if (entry.source === source) continue;
    if (packageName && (await cliPackageEntryName(workspacePath, installWorkspace, entry.source)) === packageName) continue;
    packages.push(entry);
  }
  packages.push({ source });
  await writeFile(configPath, `${JSON.stringify({ packages }, null, 2)}\n`, "utf8");
  await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "package-config", packageName });
}

async function cliPackageEntryName(workspacePath: string, installWorkspace: string, source: string): Promise<string | undefined> {
  const rootPath = resolveAmbientCliPackageSourcePath(workspacePath, installWorkspace, source);
  if (!isPathInside(installWorkspace, rootPath) && !isPathInside(resolve(workspacePath), rootPath)) return undefined;
  const descriptorPath = join(rootPath, "ambient-cli.json");
  if (!existsSync(descriptorPath)) return undefined;
  try {
    const descriptor = await readJson(descriptorPath);
    return typeof descriptor === "object" &&
      descriptor &&
      !Array.isArray(descriptor) &&
      typeof (descriptor as { name?: unknown }).name === "string"
      ? (descriptor as { name: string }).name
      : undefined;
  } catch {
    return undefined;
  }
}

async function removeCliPackageConfig(workspacePath: string, source: string): Promise<void> {
  const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
  const configPath = join(installWorkspace, cliPackageConfigPath);
  const existing = existsSync(configPath) ? cliPackageConfigSchema.parse(await readJson(configPath)) : { packages: [] };
  const packages = existing.packages.filter((entry) => entry.source !== source);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ packages }, null, 2)}\n`, "utf8");
  await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "package-config-removed" });
}

function safeName(value: string): string {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "cli-package"
  );
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function contentHash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}
