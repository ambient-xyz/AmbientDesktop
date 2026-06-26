import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { isPathInside } from "./capabilityBuilderSessionFacade";
import {
  discoverAmbientCliPackages,
  discoverAmbientCliVoiceProviders,
  installAmbientCliPackageSource,
  uninstallAmbientCliPackageSource,
  type AmbientCliPackageSummary,
} from "./capabilityBuilderAmbientCliFacade";
import type { VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import { ambientRuntimeEnv, managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "./capabilityBuilderSetupFacade";
import { redactSensitiveText } from "../security/securityCapabilityBuilderContract";
import {
  copyBuilderEnvBindingsToInstalledPackage,
  normalizeCapabilityEnvName,
  saveCapabilityBuilderEnvSecretBinding,
} from "./capabilityBuilderEnvBindings";
import { buildManifest, normalizedInstallerShape, scaffoldFiles } from "./capabilityBuilderScaffold";
import { isCommandTimeoutProfile } from "../tool-runtime/commandExecutionProfiles";
import {
  capabilityBuilderListInventoryArtifactMaxEntries,
  listCapabilityBuilderSourceFiles,
  listPackageFiles,
  materializeCapabilityBuilderListInventoryArtifact,
} from "./capabilityBuilderListing";
import {
  inspectCapabilityBuilderDescriptor,
  inspectCapabilityBuilderPackageJson,
  needsTtsProviderRepairConversion,
} from "./capabilityBuilderPreviewInspection";
import { createCapabilityBuilderValidationServices } from "./capabilityBuilderValidation";
import type { CapabilityBuilderInstallerShape, CapabilityBuilderScaffoldInput } from "./capabilityBuilderScaffold";
import type {
  CapabilityBuilderSourceRef,
  CapabilityBuilderScaffoldResult,
  CapabilityBuilderPreviewInput,
  CapabilityBuilderReadFileInput,
  CapabilityBuilderReadFileResult,
  CapabilityBuilderWriteFileInput,
  CapabilityBuilderWriteFileResult,
  CapabilityBuilderUpdatePlanInput,
  CapabilityBuilderRemovalPlanInput,
  CapabilityBuilderRepairPlanInput,
  CapabilityBuilderRepairFileInput,
  CapabilityBuilderApplyRepairInput,
  CapabilityBuilderApplyRepairFileResult,
  CapabilityBuilderApplyRepairResult,
  CapabilityBuilderSecretSaveInput,
  CapabilityBuilderSecretSaveResult,
  CapabilityBuilderRegisterInput,
  CapabilityBuilderUnregisterInput,
  CapabilityBuilderHistoryInput,
  CapabilityBuilderValidationArtifact,
  CapabilityBuilderValidationEvidence,
  CapabilityBuilderRegisterResult,
  CapabilityBuilderRegisteredVoiceProvider,
  CapabilityBuilderUnregisterResult,
  CapabilityBuilderRegistrationRepairInput,
  CapabilityBuilderRegistrationRepairResult,
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  CapabilityBuilderUpdatePlanResult,
  CapabilityBuilderRemovalPlanResult,
  CapabilityBuilderRepairDiagnosticEvidence,
  CapabilityBuilderRepairPlanResult,
  CapabilityBuilderInstallerRecoveryTemplate,
  CapabilityBuilderPreviewResult,
} from "./capabilityBuilderTypes";
import type { CapabilityBuilderListFilesInput, CapabilityBuilderListFilesResult } from "./capabilityBuilderListing";
import { requiredEnvRequirementNames } from "./capabilityBuilderText";

export type { CapabilityBuilderInstallerShape, CapabilityBuilderScaffoldInput } from "./capabilityBuilderScaffold";
export type {
  CapabilityBuilderSourceRef,
  CapabilityBuilderScaffoldResult,
  CapabilityBuilderPreviewInput,
  CapabilityBuilderReadFileInput,
  CapabilityBuilderReadFileResult,
  CapabilityBuilderWriteFileInput,
  CapabilityBuilderWriteFileResult,
  CapabilityBuilderUpdatePlanInput,
  CapabilityBuilderRemovalPlanInput,
  CapabilityBuilderRepairPlanInput,
  CapabilityBuilderRepairFileInput,
  CapabilityBuilderApplyRepairInput,
  CapabilityBuilderApplyRepairFileResult,
  CapabilityBuilderApplyRepairResult,
  CapabilityBuilderDependencyCommand,
  CapabilityBuilderInstallDepsInput,
  CapabilityBuilderDependencyCommandResult,
  CapabilityBuilderInstallDepsResult,
  CapabilityBuilderValidateInput,
  CapabilityBuilderSecretSaveInput,
  CapabilityBuilderSecretSaveResult,
  CapabilityBuilderRegisterInput,
  CapabilityBuilderUnregisterInput,
  CapabilityBuilderHistoryInput,
  CapabilityBuilderValidationCommand,
  CapabilityBuilderValidationArtifact,
  CapabilityBuilderValidationEvidence,
  CapabilityBuilderEnvRequirement,
  CapabilityBuilderModelAsset,
  CapabilityBuilderValidateResult,
  CapabilityBuilderRegisterResult,
  CapabilityBuilderRegisteredVoiceProvider,
  CapabilityBuilderUnregisterResult,
  CapabilityBuilderRegistrationRepairInput,
  CapabilityBuilderRegistrationRepairResult,
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  CapabilityBuilderUpdatePlanResult,
  CapabilityBuilderRemovalPlanResult,
  CapabilityBuilderRepairDiagnosticEvidence,
  CapabilityBuilderRepairPlanResult,
  CapabilityBuilderInstallerRecoveryTemplate,
  CapabilityBuilderPreviewResult,
} from "./capabilityBuilderTypes";
export {
  capabilityBuilderListFilesNextPageInput,
  capabilityBuilderListFilesOutputPreview,
  capabilityBuilderListFilesText,
} from "./capabilityBuilderListing";
export {
  capabilityBuilderApplyRepairText,
  capabilityBuilderDependencyRuntimeGuidance,
  capabilityBuilderHistoryText,
  capabilityBuilderInstallDepsOutputPreview,
  capabilityBuilderInstallDepsText,
  capabilityBuilderPreviewText,
  capabilityBuilderReadFileText,
  capabilityBuilderRegisterText,
  capabilityBuilderRegistrationRepairText,
  capabilityBuilderRemovalPlanText,
  capabilityBuilderRepairPlanText,
  capabilityBuilderScaffoldText,
  capabilityBuilderUnregisterText,
  capabilityBuilderUpdatePlanText,
  capabilityBuilderValidateText,
  capabilityBuilderWriteFileText,
} from "./capabilityBuilderText";
export type {
  CapabilityBuilderListFilesInput,
  CapabilityBuilderListFilesNextPageInput,
  CapabilityBuilderListFilesResult,
  CapabilityBuilderListInventoryArtifact,
  CapabilityBuilderOmittedDirectorySummary,
} from "./capabilityBuilderListing";

const execFileAsync = promisify(execFile);
const builderRoot = ".ambient/capability-builder/packages";
const builderFileReadPreviewChars = 120_000;
async function ensureCapabilityBuilderManagedWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, ".ambient/capability-builder");
  return managedInstallWorkspacePath(workspacePath);
}

const capabilityBuilderValidationServices = createCapabilityBuilderValidationServices({
  currentGitSha,
  installerShapeFromManifest,
  isCapabilityBuilderMetadataFile,
  packageContentHash,
  parseJsonObject,
  previewCapabilityBuilderPackage,
  readBuildManifestIfPresent,
  recordField,
  stringArrayField,
  stringField,
  toManagedInstallRelative,
  toWorkspaceRelative,
  updateValidationManifest,
});
export const capabilityBuilderValidationPreviewText = capabilityBuilderValidationServices.capabilityBuilderValidationPreviewText;
export const installCapabilityBuilderDependencies = capabilityBuilderValidationServices.installCapabilityBuilderDependencies;
export const validateCapabilityBuilderPackage = capabilityBuilderValidationServices.validateCapabilityBuilderPackage;

export async function scaffoldCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderScaffoldInput,
): Promise<CapabilityBuilderScaffoldResult> {
  const name = capabilityPackageName(input.name ?? (input.provider ? `${input.provider} ${input.goal}` : input.goal));
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = resolve(managedWorkspace, builderRoot, name);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  if (!isPathInside(resolve(managedWorkspace, builderRoot), rootPath))
    throw new Error("Capability package path escaped the managed builder root.");
  if (existsSync(rootPath)) throw new Error(`Capability builder package already exists: ${relativeRootPath}`);

  const files = scaffoldFiles(name, input);
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of files) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
  await chmod(join(rootPath, "scripts", "run.mjs"), 0o755);
  const gitSha = await initializePackageGit(rootPath);
  const result: CapabilityBuilderScaffoldResult = {
    name,
    ...(normalizedInstallerShape(input) ? { installerShape: normalizedInstallerShape(input) } : {}),
    rootPath,
    relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, rootPath, name),
    descriptorPath: join(rootPath, "ambient-cli.json"),
    skillPath: join(rootPath, "SKILL.md"),
    scriptPath: join(rootPath, "scripts", "run.mjs"),
    testPath: join(rootPath, "tests", "smoke.test.mjs"),
    manifestPath: join(rootPath, "capability-build.json"),
    gitSha,
    files: files.map((file) => file.path),
  };
  await writeFile(result.manifestPath, `${JSON.stringify(buildManifest(name, input, gitSha), null, 2)}\n`, "utf8");
  if (gitSha) {
    await execFileAsync("git", ["add", "capability-build.json"], { cwd: rootPath, env: gitEnv() });
    await execFileAsync("git", ["commit", "--amend", "--no-edit"], { cwd: rootPath, env: gitEnv() });
    result.gitSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  }
  return result;
}

export async function listCapabilityBuilderFiles(
  workspacePath: string,
  input: CapabilityBuilderListFilesInput,
): Promise<CapabilityBuilderListFilesResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const listing = await listCapabilityBuilderSourceFiles(preview.rootPath, input, {
    packageName: preview.packageName,
    sourcePath: preview.relativeRootPath,
    gitSha: preview.gitSha,
  });
  const inventoryListing = await listCapabilityBuilderSourceFiles(
    preview.rootPath,
    {
      ...input,
      cursor: undefined,
      maxEntries: capabilityBuilderListInventoryArtifactMaxEntries,
    },
    {
      packageName: preview.packageName,
      sourcePath: preview.relativeRootPath,
      gitSha: preview.gitSha,
    },
    capabilityBuilderListInventoryArtifactMaxEntries,
  );
  const inventoryArtifact = await materializeCapabilityBuilderListInventoryArtifact(workspace, preview, inventoryListing);
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName),
    ...(listing.pathPrefix ? { pathPrefix: listing.pathPrefix } : {}),
    maxEntries: listing.maxEntries,
    maxDepth: listing.maxDepth,
    includeGenerated: listing.includeGenerated,
    totalFileCount: listing.totalFileCount,
    totalFileCountTruncated: listing.totalFileCountTruncated,
    omittedDirectoryCount: listing.omittedDirectoryCount,
    omittedDirectories: listing.omittedDirectories,
    ...(listing.nextCursor ? { nextCursor: listing.nextCursor } : {}),
    ...(inventoryArtifact ? { inventoryArtifact } : {}),
    files: listing.files,
  };
}

export async function readCapabilityBuilderFile(
  workspacePath: string,
  input: CapabilityBuilderReadFileInput,
): Promise<CapabilityBuilderReadFileResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const file = normalizeBuilderTextFilePath(preview.rootPath, input.filePath, { allowBuilderMetadata: true });
  if (!existsSync(file.absolutePath)) throw new Error(`Capability Builder file does not exist: ${file.path}`);
  const fileStat = await stat(file.absolutePath);
  if (!fileStat.isFile()) throw new Error(`Capability Builder path is not a file: ${file.path}`);
  const maxChars = Math.min(Math.max(Math.floor(input.maxChars ?? builderFileReadPreviewChars), 1), builderFileReadPreviewChars);
  const content = await readFile(file.absolutePath, "utf8");
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName),
    filePath: file.path,
    sizeBytes: fileStat.size,
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars,
    maxChars,
  };
}

export async function writeCapabilityBuilderFile(
  workspacePath: string,
  input: CapabilityBuilderWriteFileInput,
): Promise<CapabilityBuilderWriteFileResult> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Write reason is required.");
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const file = normalizeBuilderTextFilePath(preview.rootPath, input.filePath);
  await mkdir(dirname(file.absolutePath), { recursive: true });
  const created = !existsSync(file.absolutePath);
  await writeFile(file.absolutePath, input.content, "utf8");
  await invalidateValidationManifest(preview.rootPath);
  const gitSha = await commitPackageGitRevision(preview.rootPath, `Edit ${file.path}`);
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourceRef: capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName),
    filePath: file.path,
    sizeBytes: Buffer.byteLength(input.content, "utf8"),
    created,
    ...(gitSha ? { gitSha } : {}),
    reason,
    nextSteps: [
      "Run ambient_capability_builder_preview and confirm static errors are resolved.",
      "Validate before registration if the edit changed executable behavior, descriptor metadata, dependencies, env requirements, or artifact contracts.",
      "Register or re-register only after validation succeeds and the user approves installed Ambient CLI package state changes.",
    ],
  };
}

export async function previewCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderPreviewInput,
): Promise<CapabilityBuilderPreviewResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = await resolveManagedPackagePath(workspace, managedWorkspace, input);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  if (!existsSync(rootPath)) throw new Error(`Capability builder package does not exist: ${relativeRootPath}`);

  const descriptorPath = join(rootPath, "ambient-cli.json");
  const skillPath = join(rootPath, "SKILL.md");
  const buildManifestPath = join(rootPath, "capability-build.json");
  const packageJsonPath = join(rootPath, "package.json");
  const errors: string[] = [];
  const warnings: string[] = [];
  const risks: string[] = [];
  const descriptor = existsSync(descriptorPath)
    ? parseJsonObject(await readFile(descriptorPath, "utf8"), "ambient-cli.json", errors)
    : undefined;
  const buildManifest = existsSync(buildManifestPath)
    ? parseJsonObject(await readFile(buildManifestPath, "utf8"), "capability-build.json", warnings)
    : undefined;
  const packageJson = existsSync(packageJsonPath)
    ? parseJsonObject(await readFile(packageJsonPath, "utf8"), "package.json", errors)
    : undefined;
  const installerShape = installerShapeFromManifest(buildManifest);
  const parsedDescriptor = descriptor
    ? inspectCapabilityBuilderDescriptor(descriptor, errors, warnings, risks, rootPath, {
        installerShape,
        isCommandTimeoutProfile,
        isPathInside,
      })
    : undefined;
  if (!descriptor) errors.push("ambient-cli.json is missing.");
  if (!existsSync(skillPath)) errors.push("SKILL.md is missing.");
  if (!existsSync(buildManifestPath)) warnings.push("capability-build.json is missing.");
  const packageJsonSummary = packageJson ? inspectCapabilityBuilderPackageJson(packageJson, risks) : undefined;
  const gitSha = await currentGitSha(rootPath);
  return {
    packageName: parsedDescriptor?.name ?? basename(rootPath),
    rootPath,
    relativeRootPath,
    gitSha,
    valid: errors.length === 0,
    ...(installerShape ? { installerShape } : {}),
    errors,
    warnings,
    risks,
    files: {
      descriptor: existsSync(descriptorPath),
      skill: existsSync(skillPath),
      buildManifest: existsSync(buildManifestPath),
      packageJson: existsSync(packageJsonPath),
    },
    descriptor: parsedDescriptor,
    packageJson: packageJsonSummary,
  };
}

export async function discoverCapabilityBuilderHistory(
  workspacePath: string,
  input: CapabilityBuilderHistoryInput = {},
): Promise<CapabilityBuilderHistoryResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = resolve(managedWorkspace, builderRoot);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  if (!existsSync(rootPath)) return { rootPath, relativeRootPath, entries: [], errors: [] };
  const catalog = await discoverAmbientCliPackages(workspace);
  const installedById = new Set(catalog.packages.filter((pkg) => pkg.installed).map((pkg) => pkg.id));
  const installedBySource = new Set(catalog.packages.filter((pkg) => pkg.installed).map((pkg) => pkg.source));
  const errors = [...catalog.errors];
  const entries: CapabilityBuilderHistoryEntry[] = [];
  const children = await readdir(rootPath, { withFileTypes: true });
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const packageInput = { packageName: child.name };
    try {
      const preview = await previewCapabilityBuilderPackage(workspace, packageInput);
      const manifest = await readBuildManifestIfPresent(preview.rootPath);
      const summary = manifest ? summarizeBuildManifest(manifest) : undefined;
      const validationEvidence = validationEvidenceFromManifest(manifest);
      if (input.packageName && !capabilityBuilderPackageMatches(input.packageName, child.name, preview, summary)) continue;
      const inventory = await capabilityBuilderSourceInventory(preview.rootPath);
      const status = summary?.status ?? (preview.valid ? "unknown" : "invalid");
      if (status === "registered" && input.includeRegistered === false) continue;
      if ((status === "draft" || status === "unknown") && input.includeDrafts === false) continue;
      const installedPackageId = summary?.installedPackageId;
      const installedSource = summary?.installedSource;
      entries.push({
        packageName: preview.packageName,
        rootPath: preview.rootPath,
        relativeRootPath: preview.relativeRootPath,
        ...(preview.gitSha ? { gitSha: preview.gitSha } : {}),
        valid: preview.valid,
        status,
        ...(summary?.goal ? { goal: summary.goal } : {}),
        ...(summary?.installerShape ? { installerShape: summary.installerShape } : {}),
        ...(summary?.kind ? { kind: summary.kind } : {}),
        ...(summary?.provider ? { provider: summary.provider } : {}),
        ...(summary?.version ? { version: summary.version } : {}),
        ...(summary?.sourcePath ? { sourcePath: summary.sourcePath } : {}),
        ...(installedPackageId ? { installedPackageId } : {}),
        ...(installedSource ? { installedSource } : {}),
        installedPresent: Boolean(
          (installedPackageId && installedById.has(installedPackageId)) || (installedSource && installedBySource.has(installedSource)),
        ),
        ...(stringField(manifest?.lastValidatedAt) ? { lastValidatedAt: stringField(manifest?.lastValidatedAt) } : {}),
        ...(stringField(manifest?.registeredAt) ? { registeredAt: stringField(manifest?.registeredAt) } : {}),
        ...(stringField(manifest?.unregisteredAt) ? { unregisteredAt: stringField(manifest?.unregisteredAt) } : {}),
        ...(validationEvidence.logPath ? { validationLogPath: validationEvidence.logPath } : {}),
        validationArtifacts: validationEvidence.artifacts,
        refs: summary?.refs ?? {},
        commandNames: preview.descriptor?.commandNames ?? [],
        envNames: preview.descriptor?.envNames ?? [],
        artifactOutputTypes: preview.descriptor?.artifactOutputTypes ?? [],
        logFiles: inventory.logFiles,
        possibleArtifactFiles: inventory.possibleArtifactFiles,
        errors: preview.errors,
        warnings: [...preview.warnings, ...preview.risks],
      });
    } catch (error) {
      errors.push(`${child.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  entries.sort((a, b) => a.packageName.localeCompare(b.packageName));
  return { rootPath, relativeRootPath, entries, errors };
}

export async function planCapabilityBuilderUpdate(
  workspacePath: string,
  input: CapabilityBuilderUpdatePlanInput,
): Promise<CapabilityBuilderUpdatePlanResult> {
  const preview = await previewCapabilityBuilderPackage(workspacePath, input);
  const manifest = await readBuildManifestIfPresent(preview.rootPath);
  const buildManifest = manifest ? summarizeBuildManifest(manifest) : undefined;
  const commandNames = preview.descriptor?.commandNames ?? [];
  const dependencyNames = [...(preview.packageJson?.dependencies ?? []), ...(preview.packageJson?.devDependencies ?? [])];
  const warnings = [
    ...preview.warnings,
    ...preview.risks,
    ...(!preview.files.buildManifest
      ? ["capability-build.json is missing; update provenance and registration refs may be incomplete."]
      : []),
    ...(dependencyNames.length
      ? [`Existing package dependencies require an explicit dependency preview before install/update: ${dependencyNames.join(", ")}.`]
      : []),
  ];
  const errors = [...preview.errors];
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    ...(preview.gitSha ? { gitSha: preview.gitSha } : {}),
    ...(input.requestedChanges ? { requestedChanges: input.requestedChanges } : {}),
    ...(input.targetVersion ? { targetVersion: input.targetVersion } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    preview,
    ...(buildManifest ? { buildManifest } : {}),
    recommendedSteps: [
      "Inspect the static preview, descriptor commands, SKILL.md guidance, dependency declarations, env requirements, artifact rules, and builder provenance before proposing edits.",
      input.requestedChanges
        ? `Plan file changes needed for the requested update: ${input.requestedChanges}`
        : "Ask the user for the concrete update goal before proposing file mutations.",
      commandNames.length
        ? `Preserve or intentionally migrate descriptor command contracts: ${commandNames.join(", ")}.`
        : "Add or repair descriptor command contracts before dependency installation, validation, or registration.",
      "List any dependency/setup commands with executable, args, cwd, and rationale; for Python dependencies, default to a package-local .venv via `uv venv --python <version> .venv` plus `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`; wait for explicit user approval before running ambient_capability_builder_install_deps.",
      "Update SKILL.md, command descriptors, wrapper scripts, tests, health checks, env declarations, and artifact handling together so Pi guidance and executable behavior stay aligned.",
      input.targetVersion
        ? `Set the package version/update metadata to ${input.targetVersion} only after the implementation plan is approved.`
        : "Choose a version bump strategy during implementation and record it in package metadata.",
      "Run ambient_capability_builder_preview again after edits, then run ambient_capability_builder_validate after user approval.",
      "Register only after validation succeeds and the user approves making the rebuilt capability searchable/describable through Ambient CLI.",
      "Live-test from a fresh Pi turn with ambient_cli_search, ambient_cli_describe, and the mediated ambient_cli command path.",
    ],
    approvalCheckpoints: [
      "User approves the update plan before any file edits.",
      "User approves exact dependency/setup commands, including the target environment for any Python package install, before ambient_capability_builder_install_deps runs.",
      "User approves validation before ambient_capability_builder_validate runs.",
      "User approves registration before ambient_capability_builder_register updates installed Ambient CLI package state.",
      "User separately approves any destructive cleanup, secret/env binding change, external network/API use, or artifact deletion.",
    ],
    rollbackPlan: [
      `Keep the current source package at ${preview.relativeRootPath} and its package-local Git history until the update is validated.`,
      `Record the current source Git SHA before edits: ${preview.gitSha ?? "unavailable"}.`,
      buildManifest?.installedPackageId
        ? `Keep installed package ${buildManifest.installedPackageId} active until the rebuilt package is validated and registered.`
        : "Do not unregister or replace any installed package until the rebuilt source validates.",
      "If validation or live testing fails, restore the prior source Git ref or re-register the previous validated installed package.",
      "Preserve validation logs, dependency logs, generated artifacts, and env/secret metadata unless the user explicitly approves deletion.",
    ],
    warnings,
    errors,
    mutationProhibited: true,
  };
}

export async function planCapabilityBuilderRemoval(
  workspacePath: string,
  input: CapabilityBuilderRemovalPlanInput,
): Promise<CapabilityBuilderRemovalPlanResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = await resolveManagedPackagePath(workspace, managedWorkspace, input);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  const sourceExists = existsSync(rootPath);
  const preview = sourceExists ? await previewCapabilityBuilderPackage(workspacePath, input) : undefined;
  const manifest = sourceExists ? await readBuildManifestIfPresent(rootPath) : undefined;
  const buildManifest = manifest ? summarizeBuildManifest(manifest) : undefined;
  const sourceInventory = sourceExists ? await capabilityBuilderSourceInventory(rootPath) : emptySourceInventory();
  const packageName =
    preview?.packageName ?? buildManifest?.installedPackageId ?? capabilityPackageName(input.packageName ?? basename(rootPath));
  const installedPackageId = input.installedPackageId ?? buildManifest?.installedPackageId;
  const installedSource = input.installedSource ?? buildManifest?.installedSource ?? buildManifest?.sourcePath;
  const warnings = [
    ...(preview?.warnings ?? []),
    ...(preview?.risks ?? []),
    ...(!sourceExists
      ? [
          `Managed builder source does not exist at ${relativeRootPath}; removal planning is limited to installed metadata supplied in the request.`,
        ]
      : []),
    ...(sourceExists && !buildManifest
      ? ["capability-build.json is missing or unreadable; installed refs and validation provenance may be incomplete."]
      : []),
    ...(!installedPackageId && !installedSource
      ? [
          "No installed package id or installed source was provided or found in builder metadata. Confirm the installed package target before unregistering.",
        ]
      : []),
  ];
  const errors = [...(preview?.errors ?? [])];
  return {
    packageName,
    rootPath,
    relativeRootPath,
    ...(preview?.gitSha ? { gitSha: preview.gitSha } : {}),
    sourceExists,
    ...(installedPackageId ? { installedPackageId } : {}),
    ...(installedSource ? { installedSource } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(preview ? { preview } : {}),
    ...(buildManifest ? { buildManifest } : {}),
    sourceInventory,
    recommendedSteps: [
      "Confirm whether the user wants to disable/unregister the installed Ambient CLI package, remove managed builder source, remove artifacts/logs, remove env/secret bindings, or only hide the capability from search.",
      installedPackageId || installedSource
        ? `Treat the installed package target as ${installedPackageId ?? installedSource}; do not remove it until the user approves the exact uninstall/unregister action.`
        : "Identify the installed package target before proposing any uninstall/unregister action.",
      sourceExists
        ? `Preserve managed builder source at ${relativeRootPath} by default, including package-local Git history and capability-build.json provenance.`
        : "If builder source is missing, do not attempt source deletion; limit the plan to installed package state and registry visibility.",
      "List validation logs, dependency logs, generated artifacts, and metadata separately so the user can choose what to preserve or delete.",
      "Check env and secret requirements from descriptor/provenance before removal; never delete or alter secrets without separate explicit approval.",
      "If the goal is temporary deactivation, prefer disabling/unregistering installed visibility while preserving source, logs, artifacts, and env bindings.",
      "If the goal is permanent deletion, require separate approvals for installed package removal, builder source deletion, artifact deletion, log deletion, and env/secret cleanup.",
      "After any approved removal step, refresh capability search/describe state and report what remains on disk and in registry metadata.",
    ],
    approvalCheckpoints: [
      "User approves installed package unregister/removal target before Ambient CLI package state changes.",
      "User separately approves managed builder source deletion before any source files or package-local Git history are removed.",
      "User separately approves validation/dependency log deletion.",
      "User separately approves generated artifact deletion.",
      "User separately approves env binding or secret metadata cleanup.",
      "User approves the rollback/reinstall path before any destructive action.",
    ],
    rollbackPlan: [
      preview?.gitSha
        ? `Use current builder source Git SHA ${preview.gitSha} as the rollback source ref.`
        : "Record any available installed package source/ref before removal because builder source Git SHA is unavailable.",
      installedSource
        ? `Keep installed source reference ${installedSource} until the removal succeeds and the user confirms no rollback is needed.`
        : "Capture installed source/package metadata before unregistering so the package can be reinstalled if needed.",
      "Preserve builder source and package-local Git history unless the user explicitly approves permanent source deletion.",
      "Preserve logs and generated artifacts until after installed package removal is verified.",
      "To roll back, re-register or reinstall the previous package source, then verify with ambient_cli_search and ambient_cli_describe in a fresh Pi turn.",
    ],
    preserveByDefault: [
      "managed builder source",
      "package-local Git history",
      "capability-build.json provenance",
      "validation logs",
      "dependency logs",
      "generated artifacts",
      "env bindings and secret metadata",
    ],
    warnings,
    errors,
    mutationProhibited: true,
  };
}

export async function planCapabilityBuilderRepair(
  workspacePath: string,
  input: CapabilityBuilderRepairPlanInput,
): Promise<CapabilityBuilderRepairPlanResult> {
  const preview = await previewCapabilityBuilderPackage(workspacePath, input);
  const manifest = await readBuildManifestIfPresent(preview.rootPath);
  const buildManifest = manifest ? summarizeBuildManifest(manifest) : undefined;
  const sourceInventory = await capabilityBuilderSourceInventory(preview.rootPath);
  const diagnosticEvidence = await capabilityBuilderRepairDiagnosticEvidence(preview.rootPath, sourceInventory);
  const descriptor = preview.descriptor;
  const artifactOutputTypes = descriptor?.artifactOutputTypes ?? [];
  const requiredEnvNames = requiredEnvRequirementNames(descriptor?.envRequirements ?? []);
  const dependencyNames = [...(preview.packageJson?.dependencies ?? []), ...(preview.packageJson?.devDependencies ?? [])];
  const warnings = [
    ...preview.warnings,
    ...preview.risks,
    ...(!preview.files.buildManifest
      ? ["capability-build.json is missing; repair should restore builder provenance before validation/registration."]
      : []),
    ...(dependencyNames.length
      ? [`Package dependencies may need an explicit dependency preview before repair validation: ${dependencyNames.join(", ")}.`]
      : []),
    ...(artifactOutputTypes.length && !sourceInventory.packageFiles.includes("tests/smoke.test.mjs")
      ? [
          "Artifact outputs are declared but tests/smoke.test.mjs is missing; repair must add a primary-command smoke test that creates a declared artifact.",
        ]
      : []),
  ];
  const errors = [...preview.errors];
  const ttsProviderConversion = needsTtsProviderRepairConversion(preview, buildManifest, input.requestedRepair);
  const installerRecoveryGuidance = capabilityBuilderInstallerRecoveryGuidance();
  const installerRecoveryTemplates = capabilityBuilderInstallerRecoveryTemplates();
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    ...(preview.gitSha ? { gitSha: preview.gitSha } : {}),
    ...(input.requestedRepair ? { requestedRepair: input.requestedRepair } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    preview,
    ...(buildManifest ? { buildManifest } : {}),
    sourceInventory,
    diagnosticEvidence,
    recommendedSteps: [
      "Treat this as repair planning only; do not edit files, install dependencies, validate, register, unregister, or remove package state during this step.",
      errors.length
        ? `Repair static preview errors first: ${errors.join("; ")}.`
        : "Preserve the currently valid static descriptor shape while addressing the requested repair.",
      ...(ttsProviderConversion
        ? [
            "Convert the package into the Ambient tts-provider installer shape instead of leaving it as a one-off audio artifact generator.",
            "Update ambient-cli.json so the primary synthesis command declares voiceProvider metadata with label, formats, defaultFormat, voices, and local/cloud behavior aligned with the wrapper.",
            "Update the wrapper to implement the normalized provider contract: accept --text, --output, --format, and optional --voice; write audio to the exact requested output path; print concise JSON metadata only.",
            "Keep or add artifact declarations for the supported audio formats so validation can prove a real audio artifact was produced.",
          ]
        : []),
      input.requestedRepair
        ? `Plan the smallest file changes needed for the requested repair: ${input.requestedRepair}`
        : "Ask the user for the concrete repair goal if the preview findings are not sufficient.",
      "Align ambient-cli.json, SKILL.md, wrapper scripts, health checks, smoke tests, artifact declarations, and env requirements so Pi guidance and executable behavior agree.",
      "Keep descriptor command and healthCheck executables portable: use bare names like `node`, `uv`, or `python`, or package-relative executables; do not repair runtime PATH issues by writing absolute host paths such as `/usr/local/bin/node` into ambient-cli.json.",
      requiredEnvNames.length
        ? `Preserve required env declarations (${requiredEnvNames.join(", ")}) and treat missing-secret failures as setup/secret-binding blockers, not reasons to ask for secrets in chat or remove env checks.`
        : "If the repaired package adds cloud/API behavior, declare required env names and exact networkHosts before validation.",
      artifactOutputTypes.length
        ? `Ensure tests/smoke.test.mjs runs the primary command on tiny input and writes at least one declared artifact: ${artifactOutputTypes.join(", ")}.`
        : "Add or update smoke tests for the repaired primary command path.",
      "If dependency changes are needed, list exact executable, args, cwd, and rationale; for Python dependencies, default to a package-local .venv via `uv venv --python <version> .venv` plus `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`; wait for explicit approval before ambient_capability_builder_install_deps.",
      diagnosticEvidence.recommendedReads.length
        ? `Before proposing another edit, inspect the preserved evidence with file_read: ${diagnosticEvidence.recommendedReads.join("; ")}.`
        : "If validation or dependency logs exist after the next attempt, inspect them with file_read before proposing another edit.",
      "Run ambient_capability_builder_preview after approved edits, then ambient_capability_builder_validate after user approval.",
      "Register or re-register only after validation succeeds and the user approves making the repaired capability searchable/describable through Ambient CLI.",
      "Live-test from a fresh Pi turn with ambient_cli_search, ambient_cli_describe, and the mediated ambient_cli command path.",
    ],
    installerRecoveryGuidance,
    installerRecoveryTemplates,
    approvalCheckpoints: [
      "User approves the repair plan before any file edits.",
      "User approves exact dependency/setup commands, including the target environment for any Python package install, before ambient_capability_builder_install_deps runs.",
      "User approves validation before ambient_capability_builder_validate runs.",
      "User approves registration or re-registration before installed Ambient CLI package state changes.",
      "User separately approves any destructive cleanup, env/secret binding change, external network/API use, or artifact deletion.",
      requiredEnvNames.length
        ? "For missing required cloud/API secrets on Builder-managed source, use Ambient-managed secret flows only: ambient_capability_builder_secret_request for Desktop-owned entry or an approved Builder-scoped env binding; never paste or reveal secret values in chat."
        : "If repair diagnosis reaches a system path, protected directory, service install, driver, or privileged package-manager boundary, stop and call ambient_privileged_action_request with a typed template instead of asking the user to copy sudo/admin commands.",
      "If the same failure class recurs after one repair attempt, stop and reclassify using validation logs and path discovery outputs before applying another code edit.",
      "If a local install needs paths, prefer provider-local assets, documented env/config/CLI path controls, workspace-local shims/caches, then approved dependency plans before considering privileged system mutation.",
    ].filter((step): step is string => Boolean(step)),
    validationPlan: [
      "Run ambient_capability_builder_preview and confirm static errors are resolved.",
      ...(ttsProviderConversion
        ? [
            "Confirm preview reports installerShape tts-provider and at least one descriptor voice provider command before validation.",
            "Validation must include the providerContract command so registration cannot succeed on smoke-test output alone.",
          ]
        : []),
      artifactOutputTypes.length
        ? "Run ambient_capability_builder_validate with smoke tests enabled; validation must produce a declared artifact file."
        : "Run ambient_capability_builder_validate with health checks and smoke tests enabled.",
      requiredEnvNames.length
        ? `If validation fails only because required env is missing (${requiredEnvNames.join(", ")}), stop and route through Ambient-managed secret capture/binding before retrying; do not rewrite the package to bypass the check.`
        : undefined,
      "Inspect capability-validation-log.jsonl for command status, stderr/stdout previews, output lengths, and artifact records.",
      "Classify validation failures as missing binary, missing model/data asset, missing dynamic library, wrong architecture, unsupported platform, permission boundary, hardcoded path, package-manager/runtime mismatch, or stdout/file-artifact contract mismatch before proposing repair edits.",
      "After registration, verify discovery and use through ambient_cli_search, ambient_cli_describe, and ambient_cli.",
    ].filter((step): step is string => Boolean(step)),
    rollbackPlan: [
      `Record the current source Git SHA before repair edits: ${preview.gitSha ?? "unavailable"}.`,
      buildManifest?.installedPackageId
        ? `Keep installed package ${buildManifest.installedPackageId} active until the repaired source validates and is registered.`
        : "Do not unregister or replace any installed package until the repaired source validates.",
      "If repair validation fails, restore the prior source Git ref and preserve validation/dependency logs for diagnosis.",
      "Preserve generated artifacts, logs, env bindings, and secret metadata unless the user explicitly approves cleanup.",
    ],
    warnings,
    errors,
    mutationProhibited: true,
  };
}

export async function applyCapabilityBuilderRepair(
  workspacePath: string,
  input: CapabilityBuilderApplyRepairInput,
): Promise<CapabilityBuilderApplyRepairResult> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Repair reason is required.");
  if (!input.files.length) throw new Error("At least one approved repair file is required.");
  const workspace = resolve(workspacePath);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const files = input.files.map((file, index) => normalizeRepairFile(preview.rootPath, file, index));
  const repairedAt = new Date().toISOString();
  const results: CapabilityBuilderApplyRepairFileResult[] = [];

  for (const file of files) {
    await mkdir(dirname(file.absolutePath), { recursive: true });
    const created = !existsSync(file.absolutePath);
    await writeFile(file.absolutePath, file.content, "utf8");
    results.push({
      path: file.path,
      sizeBytes: Buffer.byteLength(file.content, "utf8"),
      created,
      rationale: file.rationale,
    });
  }

  await updateRepairManifest(preview.rootPath, {
    packageName: preview.packageName,
    version: preview.descriptor?.version,
    repairedAt,
    reason,
  });
  const repairGitSha = await commitPackageGitRevision(preview.rootPath, "Apply approved repair");
  if (repairGitSha) {
    await updateRepairManifest(preview.rootPath, {
      packageName: preview.packageName,
      version: preview.descriptor?.version,
      repairedAt,
      reason,
      repairGitSha,
    });
    await commitPackageGitRevision(preview.rootPath, "Record repair metadata");
  }

  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    gitSha: await currentGitSha(preview.rootPath),
    ...(repairGitSha ? { repairGitSha } : {}),
    repairedAt,
    reason,
    files: results,
    nextSteps: [
      "Run ambient_capability_builder_preview and confirm static errors are resolved.",
      "If dependency changes are needed, present exact commands and target environments; for Python package installs, prefer package-local .venv commands before asking for approval to run ambient_capability_builder_install_deps.",
      "Run ambient_capability_builder_validate after the preview is clean and the user approves validation.",
      "Register or re-register only after validation succeeds and the user approves installed Ambient CLI package state changes.",
      "Remember that the installed Ambient CLI copy remains stale until ambient_capability_builder_register completes after successful validation.",
      "Live-test from a fresh Pi turn with ambient_cli_search, ambient_cli_describe, and the mediated ambient_cli command path.",
    ],
  };
}

export async function saveCapabilityBuilderEnvSecret(
  workspacePath: string,
  input: CapabilityBuilderSecretSaveInput,
): Promise<CapabilityBuilderSecretSaveResult> {
  const workspace = resolve(workspacePath);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const envName = normalizeCapabilityEnvName(input.envName);
  const requirement = preview.descriptor?.envRequirements.find((env) => env.name === envName);
  if (!requirement) throw new Error(`Capability Builder package "${preview.packageName}" does not declare env requirement "${envName}".`);
  const saved = await saveCapabilityBuilderEnvSecretBinding(workspace, preview, {
    envName,
    value: input.value,
  });
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    sourcePath: preview.relativeRootPath,
    envName: saved.envName,
    source: "managed-secret",
    secretRef: saved.secretRef,
    configured: true,
  };
}

export async function registerCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderRegisterInput,
): Promise<CapabilityBuilderRegisterResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
  const manifest = await readBuildManifest(preview.rootPath);
  const manifestStatus = stringField(manifest.status);
  if (manifestStatus !== "validated" && manifestStatus !== "unregistered") {
    throw new Error("Capability package must be validated before registration.");
  }
  const refs = recordField(manifest.refs);
  if (installerShapeFromManifest(manifest) === "tts-provider" && !stringField(refs.voiceProviderContractValidatedAt)) {
    throw new Error("TTS provider packages must pass provider-contract synthesis validation before registration.");
  }
  const validatedHash = stringField(refs.lastValidatedHash);
  if (!validatedHash) throw new Error("Capability package validation metadata is missing lastValidatedHash.");
  const currentHash = await packageContentHash(preview.rootPath);
  if (currentHash !== validatedHash)
    throw new Error("Capability package has changed since validation. Re-run validation before registration.");
  const sourceRef = capabilityBuilderSourceRef(managedWorkspace, preview.rootPath, preview.packageName);
  const validationEvidence = validationEvidenceFromManifest(manifest);
  await copyBuilderEnvBindingsToInstalledPackage(workspace, preview);
  const installedPackage = await installAmbientCliPackageSource(workspace, { source: preview.relativeRootPath });
  const registeredVoiceProvider =
    installerShapeFromManifest(manifest) === "tts-provider" ? await requireRegisteredVoiceProvider(workspace, installedPackage) : undefined;
  const registeredAt = new Date().toISOString();
  await updateRegistrationManifest(preview.rootPath, {
    registeredAt,
    installedPackageId: installedPackage.id,
    installedSource: installedPackage.source,
    installedVersion: installedPackage.version,
    gitSha: await currentGitSha(preview.rootPath),
    sourcePath: preview.relativeRootPath,
  });
  await updateRegistrationManifest(installedPackage.rootPath, {
    registeredAt,
    installedPackageId: installedPackage.id,
    installedSource: installedPackage.source,
    installedVersion: installedPackage.version,
    gitSha: await currentGitSha(preview.rootPath),
    sourcePath: preview.relativeRootPath,
  });
  return {
    packageName: preview.packageName,
    rootPath: preview.rootPath,
    relativeRootPath: preview.relativeRootPath,
    gitSha: await currentGitSha(preview.rootPath),
    sourceRef,
    validationEvidence,
    registeredAt,
    installedPackage,
    ...(registeredVoiceProvider ? { voiceProvider: registeredVoiceProvider } : {}),
  };
}

async function requireRegisteredVoiceProvider(
  workspace: string,
  installedPackage: AmbientCliPackageSummary,
): Promise<CapabilityBuilderRegisteredVoiceProvider> {
  const providers = await discoverAmbientCliVoiceProviders(workspace);
  const matches = providers.filter((provider) => provider.packageId === installedPackage.id);
  if (!matches.length) {
    throw new Error(`Registered TTS provider package ${installedPackage.name} did not appear in Ambient voice provider discovery.`);
  }
  const available = matches.find((provider) => provider.available);
  const provider = available ?? matches[0];
  if (!provider.available) {
    throw new Error(`Registered TTS provider ${provider.label} is not available: ${provider.availabilityReason}`);
  }
  return summarizeRegisteredVoiceProvider(provider);
}

function summarizeRegisteredVoiceProvider(provider: VoiceProviderCandidate): CapabilityBuilderRegisteredVoiceProvider {
  return {
    capabilityId: provider.capabilityId,
    label: provider.label,
    command: provider.command,
    format: provider.format,
    formats: provider.formats,
    voices: provider.voices,
    ...(provider.voiceDiscovery ? { voiceDiscovery: provider.voiceDiscovery } : {}),
    ...(provider.voiceCloning ? { voiceCloning: provider.voiceCloning } : {}),
    available: provider.available,
    availabilityReason: provider.availabilityReason,
    healthStatus: provider.diagnostics?.healthStatus ?? "unknown",
  };
}

export async function unregisterCapabilityBuilderPackage(
  workspacePath: string,
  input: CapabilityBuilderUnregisterInput,
): Promise<CapabilityBuilderUnregisterResult> {
  if (input.preserveBuilderSource === false) {
    throw new Error("Capability Builder unregister preserves builder source. Use a future explicit deletion tool for source removal.");
  }
  const workspace = resolve(workspacePath);
  const removalPlan = await planCapabilityBuilderRemoval(workspace, input);
  if (removalPlan.errors.length) throw new Error(`Capability removal plan has errors: ${removalPlan.errors.join("; ")}`);
  const catalog = await discoverAmbientCliPackages(workspace);
  const removedPackage = selectGeneratedInstalledPackage(catalog.packages, {
    packageId: removalPlan.installedPackageId,
    packageName: removalPlan.packageName,
    installedSource: removalPlan.installedSource,
  });
  await uninstallAmbientCliPackageSource(workspace, { packageId: removedPackage.id });
  const unregisteredAt = new Date().toISOString();
  if (removalPlan.sourceExists) {
    await updateUnregistrationManifest(removalPlan.rootPath, {
      unregisteredAt,
      removedPackageId: removedPackage.id,
      removedSource: removedPackage.source,
      gitSha: await currentGitSha(removalPlan.rootPath),
    });
  }
  return {
    packageName: removalPlan.packageName,
    rootPath: removalPlan.rootPath,
    relativeRootPath: removalPlan.relativeRootPath,
    ...((await currentGitSha(removalPlan.rootPath)) ? { gitSha: await currentGitSha(removalPlan.rootPath) } : {}),
    unregisteredAt,
    removedPackage,
    catalog: await discoverAmbientCliPackages(workspace),
    removalPlan,
    preserved: {
      builderSource: true,
      logs: true,
      artifacts: true,
      envSecrets: true,
    },
  };
}

export async function repairCapabilityBuilderRegistrationMetadata(
  workspacePath: string,
  input: CapabilityBuilderRegistrationRepairInput,
): Promise<CapabilityBuilderRegistrationRepairResult> {
  const workspace = resolve(workspacePath);
  const managedWorkspace = await ensureCapabilityBuilderManagedWorkspace(workspace);
  const rootPath = await resolveManagedPackagePath(workspace, managedWorkspace, input);
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  if (!existsSync(rootPath)) throw new Error(`Capability builder package does not exist: ${relativeRootPath}`);
  const preview = await previewCapabilityBuilderPackage(workspace, input);
  const manifest = await readBuildManifest(rootPath);
  const refs = recordField(manifest.refs);
  const previousStatus = stringField(manifest.status);
  const staleInstalledPackageId = stringField(manifest.installedPackageId);
  const staleInstalledSource = stringField(manifest.installedSource);
  const staleInstalledRef = stringField(refs.installed);
  if (!staleInstalledPackageId && !staleInstalledSource && !staleInstalledRef && previousStatus !== "registered") {
    throw new Error("Capability Builder registration metadata has no installed refs to repair.");
  }
  if (!staleInstalledPackageId && !staleInstalledSource) {
    throw new Error(
      "Capability Builder registration metadata repair requires installedPackageId or installedSource to prove the installed package is absent.",
    );
  }
  const catalog = await discoverAmbientCliPackages(workspace);
  if (catalog.errors.length) {
    throw new Error(`Ambient CLI package discovery has errors; refusing registration metadata repair: ${catalog.errors.join("; ")}`);
  }
  const installedPresent = catalog.packages
    .filter((pkg) => pkg.installed)
    .some((pkg) =>
      Boolean(
        (staleInstalledPackageId && pkg.id === staleInstalledPackageId) ||
        (staleInstalledSource && pkg.source === staleInstalledSource) ||
        (pkg.generated && pkg.name === preview.packageName),
      ),
    );
  if (installedPresent) {
    throw new Error(
      "Installed Ambient CLI package is still present. Use ambient_capability_builder_unregister instead of metadata repair.",
    );
  }
  const repairedAt = new Date().toISOString();
  const gitSha = await currentGitSha(rootPath);
  const nextRefs = await updateRegistrationRepairManifest(rootPath, {
    repairedAt,
    reason: input.reason,
    gitSha,
    staleInstalledPackageId,
    staleInstalledSource,
    staleInstalledRef,
  });
  return {
    packageName: preview.packageName,
    rootPath,
    relativeRootPath,
    ...(gitSha ? { gitSha } : {}),
    repairedAt,
    ...(previousStatus ? { previousStatus } : {}),
    ...(staleInstalledPackageId ? { staleInstalledPackageId } : {}),
    ...(staleInstalledSource ? { staleInstalledSource } : {}),
    ...(staleInstalledRef ? { staleInstalledRef } : {}),
    installedPresent,
    changed: true,
    refs: nextRefs,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

async function capabilityBuilderSourceInventory(rootPath: string): Promise<CapabilityBuilderRemovalPlanResult["sourceInventory"]> {
  const files = [...(await listPackageFiles(rootPath)).keys()].sort();
  const metadataFiles = files.filter((file) => isCapabilityBuilderMetadataFile(file));
  const logFiles = files.filter((file) => file.endsWith(".log") || file.endsWith(".jsonl") || file.includes("log"));
  const packageFiles = files.filter((file) => !metadataFiles.includes(file) && !logFiles.includes(file));
  const possibleArtifactFiles = files.filter((file) => {
    if (metadataFiles.includes(file) || logFiles.includes(file)) return false;
    if (/^(ambient-cli\.json|SKILL\.md|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file)) return false;
    if (file.startsWith("scripts/") || file.startsWith("tests/")) return false;
    return /\.(wav|mp3|mp4|mov|png|jpe?g|webp|gif|pdf|csv|tsv|xlsx|docx|pptx|html|json|jsonl|txt|xml|zip)$/i.test(file);
  });
  return { packageFiles, logFiles, metadataFiles, possibleArtifactFiles };
}

async function capabilityBuilderRepairDiagnosticEvidence(
  rootPath: string,
  sourceInventory: CapabilityBuilderRemovalPlanResult["sourceInventory"],
): Promise<CapabilityBuilderRepairDiagnosticEvidence> {
  const logFiles = sourceInventory.logFiles;
  const recentLogEntries: CapabilityBuilderRepairDiagnosticEvidence["recentLogEntries"] = [];
  for (const path of logFiles.slice(0, 5)) {
    const absolutePath = resolve(rootPath, path);
    if (!isPathInside(rootPath, absolutePath)) continue;
    try {
      const content = await readFile(absolutePath, "utf8");
      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      recentLogEntries.push({
        path,
        lineCount: lines.length,
        entries: lines.slice(-3).map(summarizeRepairDiagnosticLogLine),
      });
    } catch {
      recentLogEntries.push({ path, lineCount: 0, entries: ["unreadable log file"] });
    }
  }
  return {
    logFiles,
    recommendedReads: logFiles.map((path) => `./${path}`),
    recentLogEntries,
  };
}

function summarizeRepairDiagnosticLogLine(line: string): string {
  const trimmed = line.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const parts = [
      stringField(parsed.source) ? `source=${stringField(parsed.source)}` : undefined,
      stringField(parsed.status) ? `status=${stringField(parsed.status)}` : undefined,
      parsed.exitCode !== undefined ? `exitCode=${String(parsed.exitCode)}` : undefined,
      stringField(parsed.commandName) ? `commandName=${stringField(parsed.commandName)}` : undefined,
      stringField(parsed.command) ? `command=${stringField(parsed.command)}` : undefined,
      stringField(parsed.error) ? `error=${stringField(parsed.error)}` : undefined,
      stringField(parsed.stderrPreview) ? `stderr=${stringField(parsed.stderrPreview)}` : undefined,
      stringField(parsed.stdoutPreview) ? `stdout=${stringField(parsed.stdoutPreview)}` : undefined,
    ].filter((part): part is string => Boolean(part));
    return redactRepairDiagnosticEvidence(parts.length ? parts.join("; ") : trimmed).slice(0, 800);
  } catch {
    return redactRepairDiagnosticEvidence(trimmed).slice(0, 800);
  }
}

function redactRepairDiagnosticEvidence(value: string): string {
  return redactSensitiveText(value);
}

function emptySourceInventory(): CapabilityBuilderRemovalPlanResult["sourceInventory"] {
  return { packageFiles: [], logFiles: [], metadataFiles: [], possibleArtifactFiles: [] };
}

async function updateValidationManifest(
  rootPath: string,
  validatedAt: string,
  validatedHash: string,
  options: { providerContractValidated?: boolean; logPath?: string; artifacts?: CapabilityBuilderValidationArtifact[] } = {},
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return;
  const errors: string[] = [];
  const manifest = parseJsonObject(await readFile(manifestPath, "utf8"), "capability-build.json", errors);
  if (!manifest || errors.length) return;
  const refs = recordField(manifest.refs);
  manifest.status = "validated";
  manifest.lastValidatedAt = validatedAt;
  if (options.logPath) manifest.lastValidationLogPath = options.logPath;
  manifest.lastValidationArtifacts = options.artifacts ?? [];
  manifest.refs = {
    ...refs,
    lastValidated: await currentGitSha(rootPath),
    lastValidatedHash: validatedHash,
    ...(options.providerContractValidated
      ? { voiceProviderContractValidatedAt: validatedAt, voiceProviderContractValidatedHash: validatedHash }
      : {}),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function updateRegistrationManifest(
  rootPath: string,
  registration: {
    registeredAt: string;
    installedPackageId: string;
    installedSource: string;
    installedVersion?: string;
    gitSha?: string;
    sourcePath: string;
  },
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return;
  const manifest = await readBuildManifest(rootPath);
  const refs = recordField(manifest.refs);
  manifest.status = "registered";
  manifest.registeredAt = registration.registeredAt;
  manifest.installedPackageId = registration.installedPackageId;
  manifest.installedSource = registration.installedSource;
  manifest.sourcePath = registration.sourcePath;
  if (registration.installedVersion) manifest.installedVersion = registration.installedVersion;
  manifest.refs = { ...refs, installed: registration.gitSha ?? null };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function updateUnregistrationManifest(
  rootPath: string,
  unregistration: {
    unregisteredAt: string;
    removedPackageId: string;
    removedSource: string;
    gitSha?: string;
  },
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return;
  const manifest = await readBuildManifest(rootPath);
  const refs = recordField(manifest.refs);
  manifest.status = "unregistered";
  manifest.unregisteredAt = unregistration.unregisteredAt;
  manifest.removedPackageId = unregistration.removedPackageId;
  manifest.removedSource = unregistration.removedSource;
  manifest.installedPackageId = null;
  manifest.installedSource = null;
  manifest.refs = { ...refs, installed: null, lastUnregistered: unregistration.gitSha ?? null };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function updateRegistrationRepairManifest(
  rootPath: string,
  repair: {
    repairedAt: string;
    reason?: string;
    gitSha?: string;
    staleInstalledPackageId?: string;
    staleInstalledSource?: string;
    staleInstalledRef?: string;
  },
): Promise<Record<string, string | null>> {
  const manifestPath = join(rootPath, "capability-build.json");
  const manifest = await readBuildManifest(rootPath);
  const refs = recordField(manifest.refs);
  manifest.status = "unregistered";
  manifest.unregisteredAt = repair.repairedAt;
  manifest.registrationRepairedAt = repair.repairedAt;
  if (repair.reason) manifest.registrationRepairReason = repair.reason;
  if (repair.staleInstalledPackageId) manifest.staleInstalledPackageId = repair.staleInstalledPackageId;
  if (repair.staleInstalledSource) manifest.staleInstalledSource = repair.staleInstalledSource;
  if (repair.staleInstalledRef) manifest.staleInstalledRef = repair.staleInstalledRef;
  manifest.installedPackageId = null;
  manifest.installedSource = null;
  manifest.installedVersion = null;
  const nextRefs = { ...refs, installed: null, lastRegistrationRepair: repair.gitSha ?? null };
  manifest.refs = nextRefs;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return Object.fromEntries(
    Object.entries(nextRefs)
      .filter(([, value]) => value === null || typeof value === "string")
      .map(([key, value]) => [key, value as string | null]),
  );
}

async function updateRepairManifest(
  rootPath: string,
  repair: {
    packageName: string;
    version?: string;
    repairedAt: string;
    reason: string;
    repairGitSha?: string;
  },
): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  const manifest = (await readBuildManifestIfPresent(rootPath)) ?? {
    schemaVersion: "ambient-capability-builder-v1",
    name: repair.packageName,
    version: repair.version ?? "0.1.0",
    refs: {},
  };
  const refs = recordField(manifest.refs);
  const repairedInstallerShape = await inferInstallerShapeFromRepairedSource(rootPath);
  manifest.status = "draft";
  if (repairedInstallerShape) manifest.installerShape = repairedInstallerShape;
  manifest.lastRepairedAt = repair.repairedAt;
  manifest.lastRepairReason = repair.reason;
  clearValidationManifestFields(manifest);
  manifest.registeredAt = null;
  manifest.refs = {
    ...refs,
    latest: repair.repairGitSha ?? refs.latest ?? null,
    lastValidated: null,
    lastValidatedHash: null,
    voiceProviderContractValidatedAt: null,
    voiceProviderContractValidatedHash: null,
    lastRepair: repair.repairGitSha ?? refs.lastRepair ?? null,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function invalidateValidationManifest(rootPath: string): Promise<void> {
  const manifestPath = join(rootPath, "capability-build.json");
  const manifest = await readBuildManifestIfPresent(rootPath);
  if (!manifest) return;
  manifest.status = "draft";
  clearValidationManifestFields(manifest);
  const refs = recordField(manifest.refs);
  manifest.refs = {
    ...refs,
    lastValidated: null,
    lastValidatedHash: null,
    voiceProviderContractValidatedAt: null,
    voiceProviderContractValidatedHash: null,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function clearValidationManifestFields(manifest: Record<string, unknown>): void {
  manifest.lastValidatedAt = null;
  manifest.lastValidationLogPath = null;
  manifest.lastValidationArtifacts = [];
}

async function inferInstallerShapeFromRepairedSource(rootPath: string): Promise<CapabilityBuilderInstallerShape | undefined> {
  const descriptorPath = join(rootPath, "ambient-cli.json");
  if (!existsSync(descriptorPath)) return undefined;
  const errors: string[] = [];
  const descriptor = parseJsonObject(await readFile(descriptorPath, "utf8"), "ambient-cli.json", errors);
  if (!descriptor || errors.length) return undefined;
  const commands = recordField(descriptor.commands);
  if (Object.values(commands).some((command) => Object.keys(recordField(recordField(command).voiceProvider)).length > 0)) {
    return "tts-provider";
  }
  return undefined;
}

function selectGeneratedInstalledPackage(
  packages: AmbientCliPackageSummary[],
  selector: { packageId?: string; packageName?: string; installedSource?: string },
): AmbientCliPackageSummary {
  const matches = packages.filter((pkg) => {
    if (!pkg.installed || !pkg.generated) return false;
    if (selector.packageId && pkg.id === selector.packageId) return true;
    if (selector.installedSource && pkg.source === selector.installedSource) return true;
    return Boolean(selector.packageName && pkg.name === selector.packageName);
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Generated Ambient CLI package matched multiple installed packages. Specify installedPackageId.`);
  const target = selector.packageId ?? selector.installedSource ?? selector.packageName ?? "unknown";
  throw new Error(`Generated installed Ambient CLI package was not found: ${target}`);
}

async function readBuildManifest(rootPath: string): Promise<Record<string, unknown>> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) throw new Error("capability-build.json is required before registration.");
  const errors: string[] = [];
  const manifest = parseJsonObject(await readFile(manifestPath, "utf8"), "capability-build.json", errors);
  if (!manifest || errors.length) throw new Error(`capability-build.json is invalid: ${errors.join("; ")}`);
  return manifest;
}

async function readBuildManifestIfPresent(rootPath: string): Promise<Record<string, unknown> | undefined> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return undefined;
  const errors: string[] = [];
  const manifest = parseJsonObject(await readFile(manifestPath, "utf8"), "capability-build.json", errors);
  return manifest && !errors.length ? manifest : undefined;
}

function summarizeBuildManifest(manifest: Record<string, unknown>): NonNullable<CapabilityBuilderUpdatePlanResult["buildManifest"]> {
  const refs = Object.fromEntries(
    Object.entries(recordField(manifest.refs))
      .filter(([, value]) => value === null || typeof value === "string")
      .map(([key, value]) => [key, value as string | null]),
  );
  return {
    ...(stringField(manifest.status) ? { status: stringField(manifest.status) } : {}),
    ...(stringField(manifest.goal) ? { goal: stringField(manifest.goal) } : {}),
    ...(installerShapeFromManifest(manifest) ? { installerShape: installerShapeFromManifest(manifest) } : {}),
    ...(stringField(manifest.kind) ? { kind: stringField(manifest.kind) } : {}),
    ...(stringField(manifest.provider) ? { provider: stringField(manifest.provider) } : {}),
    ...(stringField(manifest.version) ? { version: stringField(manifest.version) } : {}),
    ...(stringField(manifest.sourcePath) ? { sourcePath: stringField(manifest.sourcePath) } : {}),
    ...(stringField(manifest.installedPackageId) ? { installedPackageId: stringField(manifest.installedPackageId) } : {}),
    ...(stringField(manifest.installedSource) ? { installedSource: stringField(manifest.installedSource) } : {}),
    refs,
  };
}

function validationEvidenceFromManifest(manifest: Record<string, unknown> | undefined): CapabilityBuilderValidationEvidence {
  if (!manifest) return { artifacts: [] };
  const refs = recordField(manifest.refs);
  const validatedAt = stringField(manifest.lastValidatedAt);
  const sourceGitSha = stringField(refs.lastValidated);
  const sourceHash = stringField(refs.lastValidatedHash);
  if (!validatedAt || !sourceHash) return { artifacts: [] };
  return {
    validatedAt,
    ...(sourceGitSha ? { sourceGitSha } : {}),
    sourceHash,
    ...(stringField(manifest.lastValidationLogPath) ? { logPath: stringField(manifest.lastValidationLogPath) } : {}),
    artifacts: validationArtifactsFromManifest(manifest.lastValidationArtifacts),
  };
}

function validationArtifactsFromManifest(value: unknown): CapabilityBuilderValidationArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = recordField(item);
    const path = stringField(record.path);
    const sizeBytes =
      typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes) ? Math.max(0, Math.floor(record.sizeBytes)) : undefined;
    return path && sizeBytes !== undefined ? [{ path, sizeBytes }] : [];
  });
}

function installerShapeFromManifest(manifest: Record<string, unknown> | undefined): CapabilityBuilderInstallerShape | undefined {
  const value = stringField(manifest?.installerShape);
  return parseCapabilityBuilderInstallerShape(value);
}

function parseCapabilityBuilderInstallerShape(value: string | undefined): CapabilityBuilderInstallerShape | undefined {
  if (
    value === "tts-provider" ||
    value === "artifact-generator" ||
    value === "file-converter" ||
    value === "search-provider" ||
    value === "browser-tooling" ||
    value === "connector" ||
    value === "custom-cli"
  ) {
    return value;
  }
  return undefined;
}

function capabilityBuilderInstallerRecoveryGuidance(): string[] {
  return [
    "Classify the failure before repair: missing binary, missing model/data asset, missing dynamic library, wrong architecture, unsupported platform, permission/privilege boundary, hardcoded or compiled-in path, package-manager/runtime mismatch, or stdout/file-artifact contract mismatch.",
    "Discover paths with exact executable locations and versions, dynamic-library dependencies, package/module install paths, model/data cache paths, documented environment variables/config/CLI flags, and generated validation/dependency logs.",
    "Prefer provider-local paths under the Builder package when supported, then documented env/config/CLI path controls, then workspace-local shims/symlinks/caches/vendored assets that avoid system mutation.",
    "Use system package managers only through an approved dependency plan with exact executable, args, cwd, and rationale.",
    "If repair requires a protected system path, service install, driver, package-manager privilege, or admin/sudo credential, stop and call ambient_privileged_action_request with a typed template; do not ask the user to copy commands into Terminal or expose credentials to Pi.",
    "After one failed repair for the same failure class, stop repeated guessing and re-run diagnosis against capability-validation-log.jsonl and dependency stdout/stderr artifacts.",
  ];
}

function capabilityBuilderInstallerRecoveryTemplates(): CapabilityBuilderInstallerRecoveryTemplate[] {
  return [
    {
      id: "python-native-data-path",
      label: "Python native library/data path",
      appliesWhen:
        "A Python package, wheel, or native dynamic library cannot find bundled data files, shared libraries, or compiled-in runtime paths.",
      steps: [
        "Inspect the exact Python executable, package import path, site-packages path, dynamic library path, and data directory expected by the failing stack trace.",
        "Prefer provider-local model/data/library paths under the Builder package and documented environment variables before patching wrapper code.",
        "If the runtime path is compiled in, try a wrapper-level documented data-path API or workspace-local shim before requesting system path mutation.",
        "If only a protected system path or admin symlink can satisfy the runtime, call ambient_privileged_action_request with the exact source/target paths and rationale.",
      ],
      privilegedBoundary: "protected system path, system package install, dynamic-library loader path requiring admin write",
    },
    {
      id: "node-native-module",
      label: "Node native module rebuild",
      appliesWhen:
        "A Node package fails because a native module is missing, built for the wrong architecture, or incompatible with the current Node ABI.",
      steps: [
        "Inspect node version, platform, architecture, package manager lockfile, native module package name, and the exact ABI error from stdout/stderr artifacts.",
        "Prefer package-local reinstall/rebuild commands with explicit cwd and rationale through ambient_capability_builder_install_deps.",
        "Pin compatible dependency versions in package metadata instead of post-processing generated output or hiding the error.",
        "Request a privileged handoff only for true system package prerequisites or protected install locations.",
      ],
      privilegedBoundary: "system build tools/package install requiring admin rights",
    },
    {
      id: "local-model-assets",
      label: "Local model runtime assets",
      appliesWhen: "A local model provider is missing model weights, tokenizers, voice/style files, caches, or runtime asset metadata.",
      steps: [
        "Inspect declared modelAssets, actual package model/cache directories, download URLs, file sizes, checksums when available, and validation logs.",
        "Prefer deterministic provider-local downloads into the Builder package or a documented Ambient cache path, not hidden global caches.",
        "Update health checks and smoke tests to fail clearly when assets are absent and to validate tiny real inference when assets are present.",
        "Do not request privileged setup for model downloads unless a platform runtime genuinely requires protected-path installation.",
      ],
      privilegedBoundary: "rare; only protected runtime/model install locations or driver/service setup",
    },
    {
      id: "system-binary-wrapper",
      label: "System binary wrapper",
      appliesWhen:
        "A capability wraps an existing platform binary, package-manager executable, browser/runtime binary, or CLI installed outside the Builder package.",
      steps: [
        "Inspect executable location, version, architecture, license/source expectation, and whether the binary can be bundled or installed locally.",
        "Prefer a managed local binary under the Builder package when licensing and size allow, otherwise declare the dependency and health-check the exact binary.",
        "Use approved dependency plans for user-level package-manager installs and show exact executable, args, cwd, and rationale.",
        "If installation needs admin rights, service registration, driver setup, or protected directories, call ambient_privileged_action_request instead of shelling out to sudo.",
      ],
      privilegedBoundary: "admin package install, service registration, driver setup, protected binary directory",
    },
    {
      id: "stdout-vs-file-artifact-contract",
      label: "Stdout versus file artifact contract",
      appliesWhen:
        "Validation expects a declared file artifact but the command intentionally returns concise JSON, Markdown, or text on stdout.",
      steps: [
        "Inspect ambient-cli.json artifacts.outputTypes, responseFormats, command stdout behavior, and smoke test output paths.",
        "For search/API/text providers, put JSON/Markdown/text response shape in responseFormats and remove file artifact declarations unless files are intentionally written.",
        "For artifact generators, make the smoke test write or update a fresh declared artifact path and return concise metadata.",
        "Re-run validation only after the descriptor and smoke test agree on whether output is stdout or a file artifact.",
      ],
      privilegedBoundary: "none; this is a contract repair, not an admin-action case",
    },
  ];
}

async function packageContentHash(rootPath: string): Promise<string> {
  const hash = createHash("sha256");
  const files = [...(await listPackageFiles(rootPath)).keys()].filter((file) => !isCapabilityBuilderMetadataFile(file)).sort();
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(join(rootPath, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function isCapabilityBuilderMetadataFile(file: string): boolean {
  return file === "capability-build.json" || file === "capability-deps-log.jsonl" || file === "capability-validation-log.jsonl";
}

function normalizeRepairFile(
  rootPath: string,
  file: CapabilityBuilderRepairFileInput,
  index: number,
): CapabilityBuilderRepairFileInput & { absolutePath: string } {
  const path = file.path.trim();
  if (!path) throw new Error(`files[${index}].path is required.`);
  if (path.includes("\0")) throw new Error(`Repair file path contains unsupported characters: ${path}`);
  if (resolve(path) === path) throw new Error(`Repair file path must be package-relative: ${path}`);
  const absolutePath = resolve(rootPath, path);
  const relativePath = relative(rootPath, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || relativePath === "." || !isPathInside(rootPath, absolutePath)) {
    throw new Error(`Repair file path escapes the package root: ${path}`);
  }
  if (relativePath === ".git" || relativePath.startsWith(".git/")) throw new Error(`Repair cannot edit package Git metadata: ${path}`);
  if (isCapabilityBuilderMetadataFile(relativePath)) {
    throw new Error(`Repair cannot directly edit Capability Builder metadata or logs: ${path}`);
  }
  if (relativePath.startsWith("node_modules/")) throw new Error(`Repair cannot write node_modules content directly: ${path}`);
  const rationale = file.rationale.trim();
  if (!rationale) throw new Error(`files[${index}].rationale is required.`);
  return { path: relativePath, content: file.content, rationale, absolutePath };
}

function normalizeBuilderTextFilePath(
  rootPath: string,
  filePath: string,
  options: { allowBuilderMetadata?: boolean } = {},
): { path: string; absolutePath: string } {
  const path = filePath.trim();
  if (!path) throw new Error("filePath is required.");
  if (path.includes("\0")) throw new Error(`Capability Builder file path contains unsupported characters: ${path}`);
  if (isAbsolute(path)) throw new Error(`Capability Builder file path must be package-relative: ${path}`);
  const absolutePath = resolve(rootPath, path);
  const relativePath = relative(rootPath, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || relativePath === "." || !isPathInside(rootPath, absolutePath)) {
    throw new Error(`Capability Builder file path escapes the package root: ${path}`);
  }
  if (relativePath === ".git" || relativePath.startsWith(".git/")) {
    throw new Error(`Capability Builder file tools cannot access package Git metadata: ${path}`);
  }
  if (!options.allowBuilderMetadata && isCapabilityBuilderMetadataFile(relativePath)) {
    throw new Error(`Capability Builder file tools cannot directly edit Builder metadata or logs: ${path}`);
  }
  if (relativePath.startsWith("node_modules/")) {
    throw new Error(`Capability Builder file tools cannot access node_modules content directly: ${path}`);
  }
  return { path: relativePath, absolutePath };
}

function capabilityBuilderSourceRef(managedWorkspace: string, rootPath: string, packageName: string): CapabilityBuilderSourceRef {
  const relativeRootPath = toWorkspaceRelative(managedWorkspace, rootPath);
  return {
    kind: "capability-builder-source",
    packageName,
    workspacePath: managedWorkspace,
    rootPath,
    relativeRootPath,
    sourcePath: relativeRootPath,
  };
}

async function resolveManagedPackagePath(
  workspace: string,
  managedWorkspace: string,
  input: CapabilityBuilderPreviewInput,
): Promise<string> {
  if (!input.packageName && !input.path && !input.sourcePath) throw new Error("packageName, path, or sourcePath is required.");
  const root = resolve(managedWorkspace, builderRoot);
  const explicitPath = input.path ?? input.sourcePath;
  if (explicitPath) {
    const target = resolveCapabilityBuilderSourcePath(workspace, managedWorkspace, explicitPath);
    if (!isPathInside(root, target)) throw new Error("Capability package preview is limited to the managed builder root.");
    return target;
  }

  const target = resolve(root, capabilityPackageName(input.packageName!));
  if (!isPathInside(root, target)) throw new Error("Capability package preview is limited to the managed builder root.");
  if (existsSync(target) || !existsSync(root)) return target;

  const matches = await findManagedPackageRootsByName(root, input.packageName!);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const relativeMatches = matches.map((match) => toWorkspaceRelative(managedWorkspace, match)).join(", ");
    throw new Error(
      `Capability builder package name "${input.packageName}" matched multiple managed sources: ${relativeMatches}. Pass the exact sourcePath returned by preview or history.`,
    );
  }
  return target;
}

function resolveCapabilityBuilderSourcePath(workspace: string, managedWorkspace: string, sourcePath: string): string {
  const managedCandidate = resolve(managedWorkspace, sourcePath);
  if (sourcePath.startsWith("./.ambient/") || sourcePath.startsWith(".ambient/") || existsSync(managedCandidate)) return managedCandidate;
  const workspaceCandidate = resolve(workspace, sourcePath);
  if (isPathInside(resolve(workspace, ".ambient", "capability-builder"), workspaceCandidate)) {
    return resolve(managedWorkspace, relative(workspace, workspaceCandidate));
  }
  return workspaceCandidate;
}

async function findManagedPackageRootsByName(root: string, packageName: string): Promise<string[]> {
  const requested = capabilityPackageIdentifierSet(packageName);
  const children = await readdir(root, { withFileTypes: true }).catch(() => []);
  const matches: string[] = [];
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const candidateRoot = join(root, child.name);
    const identifiers = await managedPackageIdentifiers(candidateRoot, child.name);
    if ([...requested].some((name) => identifiers.has(name))) matches.push(candidateRoot);
  }
  return Array.from(new Set(matches));
}

async function managedPackageIdentifiers(rootPath: string, folderName: string): Promise<Set<string>> {
  const identifiers = new Set<string>();
  addCapabilityPackageIdentifiers(identifiers, folderName);
  const descriptor = await readJsonObjectIfPresent(join(rootPath, "ambient-cli.json"));
  addCapabilityPackageIdentifiers(identifiers, stringField(descriptor?.name));
  const manifest = await readJsonObjectIfPresent(join(rootPath, "capability-build.json"));
  addCapabilityPackageIdentifiers(identifiers, stringField(manifest?.name));
  const sourcePath = stringField(manifest?.sourcePath);
  if (sourcePath) addCapabilityPackageIdentifiers(identifiers, basename(sourcePath));
  return identifiers;
}

async function readJsonObjectIfPresent(path: string): Promise<Record<string, unknown> | undefined> {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function capabilityPackageIdentifierSet(value: string): Set<string> {
  const identifiers = new Set<string>();
  addCapabilityPackageIdentifiers(identifiers, value);
  return identifiers;
}

function addCapabilityPackageIdentifiers(identifiers: Set<string>, value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  identifiers.add(trimmed);
  identifiers.add(basename(trimmed));
  try {
    identifiers.add(capabilityPackageName(trimmed));
    identifiers.add(capabilityPackageName(basename(trimmed)));
  } catch {
    // Ignore values that cannot be normalized into a package name.
  }
}

function capabilityBuilderPackageMatches(
  requestedPackageName: string,
  folderName: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  manifest: NonNullable<CapabilityBuilderUpdatePlanResult["buildManifest"]> | undefined,
): boolean {
  const requested = capabilityPackageIdentifierSet(requestedPackageName);
  const identifiers = new Set<string>();
  addCapabilityPackageIdentifiers(identifiers, folderName);
  addCapabilityPackageIdentifiers(identifiers, preview.packageName);
  addCapabilityPackageIdentifiers(identifiers, preview.relativeRootPath);
  addCapabilityPackageIdentifiers(identifiers, manifest?.sourcePath);
  addCapabilityPackageIdentifiers(identifiers, manifest?.installedPackageId);
  addCapabilityPackageIdentifiers(identifiers, manifest?.installedSource);
  return [...requested].some((name) => identifiers.has(name));
}

function parseJsonObject(content: string, label: string, errors: string[]): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(`${label} must contain a JSON object.`);
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function currentGitSha(rootPath: string): Promise<string | undefined> {
  try {
    return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  } catch {
    return undefined;
  }
}

async function commitPackageGitRevision(rootPath: string, message: string): Promise<string | undefined> {
  try {
    if (!existsSync(join(rootPath, ".git"))) {
      await execFileAsync("git", ["init"], { cwd: rootPath, env: gitEnv() });
    }
    await execFileAsync("git", ["add", "."], { cwd: rootPath, env: gitEnv() });
    const status = (await execFileAsync("git", ["status", "--porcelain"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
    if (!status) return currentGitSha(rootPath);
    await execFileAsync("git", ["commit", "-m", message], {
      cwd: rootPath,
      env: gitEnv(),
    });
    return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  } catch {
    return undefined;
  }
}

async function initializePackageGit(rootPath: string): Promise<string | undefined> {
  try {
    await execFileAsync("git", ["init"], { cwd: rootPath, env: gitEnv() });
    await execFileAsync("git", ["add", "."], { cwd: rootPath, env: gitEnv() });
    await execFileAsync("git", ["commit", "-m", "Initial scaffold"], {
      cwd: rootPath,
      env: gitEnv(),
    });
    return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootPath, env: gitEnv() })).stdout.trim();
  } catch {
    return undefined;
  }
}

function gitEnv(): NodeJS.ProcessEnv {
  return ambientRuntimeEnv(process.env, {
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "Ambient Capability Builder",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "capability-builder@ambient.local",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "Ambient Capability Builder",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "capability-builder@ambient.local",
  });
}

function capabilityPackageName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!slug) throw new Error("Capability name could not be derived.");
  return slug.startsWith("ambient-") ? slug : `ambient-${slug}`;
}

function toWorkspaceRelative(workspacePath: string, absolutePath: string): string {
  const relativePath = relative(workspacePath, absolutePath);
  if (!relativePath || relativePath.startsWith("..")) throw new Error("Path is outside the workspace.");
  return `./${relativePath}`;
}

function toManagedInstallRelative(workspacePath: string, absolutePath: string): string {
  const managedWorkspace = managedInstallWorkspacePath(workspacePath);
  if (isPathInside(managedWorkspace, absolutePath)) return toWorkspaceRelative(managedWorkspace, absolutePath);
  return toWorkspaceRelative(workspacePath, absolutePath);
}
