import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { managedInstallWorkspacePath } from "./ambientCliSetupFacade";
import { redactGitSourceCredentials } from "./ambientCliSecurityFacade";
import { isPathInside } from "./ambientCliSessionFacade";
import { piCatalogAdapterDescriptor, resolvePiCatalogCliAdapter, writePiCatalogAdapterFiles } from "./ambientCliPiCatalogAdapter";
import type { createAmbientCliPackageInstallSafetyServices } from "./ambientCliPackageInstallSafety";
import type {
  AmbientCliPackageCatalog,
  AmbientCliPackageEnvStatus,
  AmbientCliPackageHealthCheckResult,
  AmbientCliPackageInstallPreview,
  AmbientCliPackageSummary,
  AmbientCliPiCatalogInstallPreview,
  EnsureFirstPartyAmbientCliPackagesOptions,
  InstallAmbientCliPackageInput,
  PreviewAmbientCliPackageInput,
  UninstallAmbientCliPackageInput,
} from "./ambientCliPackageTypes";

type AmbientCliPackageInstallSafetyServices = ReturnType<typeof createAmbientCliPackageInstallSafetyServices>;

type NormalizedInstallInput = Required<Pick<InstallAmbientCliPackageInput, "source">> &
  Pick<InstallAmbientCliPackageInput, "path" | "ref" | "sha" | "descriptor" | "installDependencies">;

export type FirstPartyAmbientCliPackage =
  | {
      packageName: string;
      source: string;
      kind: "pi-catalog";
    }
  | {
      packageName: string;
      source: string;
      kind: "bundled";
      packageDir: string;
      autoInstall?: boolean;
    };

export type BundledFirstPartyAmbientCliPackage = Extract<FirstPartyAmbientCliPackage, { kind: "bundled" }>;

export interface AmbientCliPackageInstallSourceServicesDependencies {
  cliPackageImportRoot: string;
  firstPartyAmbientCliPackages: FirstPartyAmbientCliPackage[];
  safety: AmbientCliPackageInstallSafetyServices;
  ensureAmbientCliManagedInstallWorkspace(workspacePath: string): Promise<string>;
  inspectAmbientCliPackage(
    workspacePath: string,
    rootPath: string,
    source: string,
    descriptorOverlay?: unknown,
  ): Promise<AmbientCliPackageSummary>;
  discoverAmbientCliPackages(workspacePath: string): Promise<AmbientCliPackageCatalog>;
  checkAmbientCliPackageHealth(
    pkg: AmbientCliPackageSummary,
    options?: { workspacePath?: string },
  ): Promise<AmbientCliPackageHealthCheckResult[]>;
  installBundledAmbientCliPackageSource(
    workspacePath: string,
    firstParty: BundledFirstPartyAmbientCliPackage,
    options: EnsureFirstPartyAmbientCliPackagesOptions,
    sourcePathOverride?: string,
  ): Promise<AmbientCliPackageSummary>;
  resolveReviewedBundledAmbientCliPackageRoot(firstParty: BundledFirstPartyAmbientCliPackage): string;
  resolveAmbientCliEnvStatus(workspacePath: string, pkg: AmbientCliPackageSummary): Promise<AmbientCliPackageEnvStatus[]>;
  upsertCliPackageConfig(workspacePath: string, source: string, packageName?: string): Promise<void>;
  removeCliPackageConfig(workspacePath: string, source: string): Promise<void>;
  safeName(value: string): string;
  shortHash(value: string): string;
  errorMessage(error: unknown): string;
}

export function createAmbientCliPackageInstallSourceServices(deps: AmbientCliPackageInstallSourceServicesDependencies) {
  const {
    cliPackageImportRoot,
    firstPartyAmbientCliPackages,
    safety,
    checkAmbientCliPackageHealth,
    discoverAmbientCliPackages,
    ensureAmbientCliManagedInstallWorkspace,
    errorMessage,
    inspectAmbientCliPackage,
    installBundledAmbientCliPackageSource,
    removeCliPackageConfig,
    resolveAmbientCliEnvStatus,
    resolveReviewedBundledAmbientCliPackageRoot,
    safeName,
    shortHash,
    upsertCliPackageConfig,
  } = deps;

  function resolveAmbientCliInstallSourcePath(workspacePath: string, installWorkspace: string, source: string): string {
    const fromManagedState = resolve(installWorkspace, source);
    if (source.startsWith("./.ambient/") || source.startsWith(".ambient/") || existsSync(fromManagedState)) return fromManagedState;
    return resolve(workspacePath, source);
  }

  async function installAmbientCliPackageSource(
    workspacePath: string,
    input: InstallAmbientCliPackageInput,
    approvedPreview?: AmbientCliPackageInstallPreview,
  ): Promise<AmbientCliPackageSummary> {
    const normalized = normalizeInstallInput(input);
    safety.assertApprovedInstallPreviewInput(normalized, approvedPreview);
    const bundled = resolveFirstPartyBundledAmbientCliPackage(normalized.source);
    if (bundled) {
      const unsupported = bundledAmbientCliInstallUnsupportedFields(normalized);
      if (unsupported.length) throw new Error(`Bundled Ambient CLI package installs do not accept ${unsupported.join(", ")}.`);
      const sourcePath = resolveReviewedBundledAmbientCliPackageRoot(bundled);
      return installBundledAmbientCliPackageSource(workspacePath, bundled, {}, sourcePath);
    }
    if (isBundledAmbientCliInstallSource(normalized.source)) {
      throw new Error(`Unknown bundled Ambient CLI package source: ${normalized.source}`);
    }
    if (normalized.sha) return installAmbientCliPackageGitSource(workspacePath, normalized);
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    const sourcePath = resolveAmbientCliInstallSourcePath(workspacePath, installWorkspace, normalized.source);
    if (!isPathInside(resolve(workspacePath), sourcePath) && !isPathInside(installWorkspace, sourcePath)) {
      throw new Error("Ambient CLI package source must be inside the workspace or Ambient-managed install state.");
    }
    if (!existsSync(sourcePath)) throw new Error("Ambient CLI package source was not found.");
    safety.assertAmbientCliPackageRootIsNotSymlink(sourcePath);
    const symlinkPreflightError = await safety.ambientCliPackageSymlinkPreflightError(sourcePath);
    if (symlinkPreflightError) throw new Error(symlinkPreflightError);
    const inspected = await inspectAmbientCliPackage(workspacePath, sourcePath, normalized.source, normalized.descriptor);
    if (inspected.errors.length) throw new Error(`Ambient CLI package is invalid: ${inspected.errors.join("; ")}`);
    const ignoredReferenceError = safety.ambientCliPackageIgnoredPathReferenceError(inspected);
    if (ignoredReferenceError) throw new Error(ignoredReferenceError);
    if (!inspected.commands.length) throw new Error("Ambient CLI package descriptor does not declare any commands.");
    const dependencyPreview = normalized.installDependencies ? await safety.previewAmbientCliPackageDependencies(sourcePath) : undefined;
    const pinPolicyError = safety.ambientCliInstallPinPolicyError(normalized, dependencyPreview);
    if (pinPolicyError) throw new Error(pinPolicyError);
    const sourceContentHash = await safety.ambientCliPackageInstallContentHash(sourcePath, normalized.descriptor);
    safety.assertApprovedInstallPreviewPackage(approvedPreview, {
      candidate: inspected,
      contentHash: sourceContentHash,
      dependencyInstall: dependencyPreview,
    });

    const importName = safeName(`${inspected.name}-${inspected.version ?? "local"}-${shortHash(sourcePath)}`);
    const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
    if (!isPathInside(installWorkspace, destination))
      throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    try {
      await cp(sourcePath, destination, { recursive: true, force: true, dereference: false });
      await safety.removeAmbientCliPackageIgnoredContent(destination);
      await safety.writeDescriptorOverlay(destination, normalized.descriptor);
      const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
      const importedBeforeDependencyInstall = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
      const importedContentHash = await safety.ambientCliPackageInstallContentHash(destination);
      safety.assertApprovedInstallPreviewPackage(approvedPreview, {
        candidate: importedBeforeDependencyInstall,
        contentHash: importedContentHash,
        dependencyInstall: dependencyPreview,
      });
      if (normalized.installDependencies) {
        const dependencyInstall = await safety.installAmbientCliPackageDependencies(destination);
        if (!dependencyInstall.passed)
          throw new Error(
            `Ambient CLI package dependency install failed: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "unknown error"}`,
          );
      }
      const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
      await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
      return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  }

  async function previewAmbientCliPackageInstallSource(
    workspacePath: string,
    input: PreviewAmbientCliPackageInput,
  ): Promise<AmbientCliPackageInstallPreview> {
    const normalized = normalizeInstallInput(input);
    const displayInput = redactedInstallInput(normalized);
    const bundled = resolveFirstPartyBundledAmbientCliPackage(normalized.source);
    if (bundled) {
      const unsupported = bundledAmbientCliInstallUnsupportedFields(normalized);
      if (unsupported.length) {
        return {
          ...displayInput,
          envStatus: [],
          healthChecks: [],
          installable: false,
          errors: [`Bundled Ambient CLI package previews do not accept ${unsupported.join(", ")}.`],
        };
      }
      try {
        const sourcePath = resolveReviewedBundledAmbientCliPackageRoot(bundled);
        return previewPreparedAmbientCliPackage(workspacePath, sourcePath, bundled.source, normalized, bundled.packageName);
      } catch (error) {
        return { ...displayInput, envStatus: [], healthChecks: [], installable: false, errors: [errorMessage(error)] };
      }
    }
    if (isBundledAmbientCliInstallSource(normalized.source)) {
      return {
        ...displayInput,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: [`Unknown bundled Ambient CLI package source: ${displayInput.source}`],
      };
    }
    if (!normalized.sha && displayInput.source !== normalized.source && safety.isGitLikeInstallSource(normalized.source)) {
      return {
        ...displayInput,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: ["Git URL preview sources must not contain credentials, query strings, or fragments."],
      };
    }
    if (!normalized.sha) {
      const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
      const sourcePath = resolveAmbientCliInstallSourcePath(workspacePath, installWorkspace, normalized.source);
      if (!isPathInside(resolve(workspacePath), sourcePath) && !isPathInside(installWorkspace, sourcePath)) {
        return {
          ...displayInput,
          envStatus: [],
          healthChecks: [],
          installable: false,
          errors: ["Local Ambient CLI package preview source must be inside the workspace or Ambient-managed install state."],
        };
      }
      const symlinkError = safety.ambientCliPackageRootSymlinkError(sourcePath);
      if (symlinkError) {
        return {
          ...displayInput,
          envStatus: [],
          healthChecks: [],
          installable: false,
          errors: [symlinkError],
        };
      }
      return safety.withPreviewPackageRoot(sourcePath, normalized, async (packageRoot) =>
        previewPreparedAmbientCliPackage(workspacePath, packageRoot, normalized.source, normalized),
      );
    }

    try {
      return await safety.withClonedCliPackage(normalized, async ({ packageRoot }) => {
        return previewPreparedAmbientCliPackage(workspacePath, packageRoot, safety.gitSourceLabel(normalized), normalized);
      });
    } catch (error) {
      return {
        ...displayInput,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: [errorMessage(error)],
      };
    }
  }

  async function previewAmbientCliPackagePiCatalogSource(
    workspacePath: string,
    source: string,
  ): Promise<AmbientCliPiCatalogInstallPreview> {
    try {
      const resolution = await resolvePiCatalogCliAdapter(source);
      const normalized: NormalizedInstallInput = {
        source: resolution.repositoryUrl,
        path: resolution.repositoryDirectory,
        sha: resolution.sha,
        descriptor: piCatalogAdapterDescriptor(resolution),
        ...(resolution.installDependencies ? { installDependencies: true } : {}),
      };
      return safety.withClonedCliPackage(normalized, async ({ packageRoot }) => {
        await writePiCatalogAdapterFiles(packageRoot, resolution);
        const preview = await previewPreparedAmbientCliPackage(workspacePath, packageRoot, safety.gitSourceLabel(normalized), normalized);
        return { ...preview, source, resolution };
      });
    } catch (error) {
      return {
        source,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: [errorMessage(error)],
      };
    }
  }

  async function installAmbientCliPackagePiCatalogSource(
    workspacePath: string,
    source: string,
    approvedPreview?: AmbientCliPiCatalogInstallPreview,
  ): Promise<AmbientCliPackageSummary> {
    const preview = approvedPreview ?? (await previewAmbientCliPackagePiCatalogSource(workspacePath, source));
    if (preview.source !== source) throw new Error("Approved Pi catalog package preview does not match the requested source.");
    if (!preview.installable || !preview.resolution)
      throw new Error(`Pi catalog package is not installable as Ambient CLI: ${preview.errors.join("; ")}`);
    const resolution = preview.resolution;
    const normalized: NormalizedInstallInput = {
      source: resolution.repositoryUrl,
      path: resolution.repositoryDirectory,
      sha: resolution.sha,
      descriptor: piCatalogAdapterDescriptor(resolution),
      ...(resolution.installDependencies ? { installDependencies: true } : {}),
    };

    return safety.withClonedCliPackage(normalized, async ({ packageRoot }) => {
      const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
      await writePiCatalogAdapterFiles(packageRoot, resolution);
      const inspected = await inspectAmbientCliPackage(
        workspacePath,
        packageRoot,
        safety.gitSourceLabel(normalized),
        normalized.descriptor,
      );
      const ignoredReferenceError = safety.ambientCliPackageIgnoredPathReferenceError(inspected);
      if (ignoredReferenceError) throw new Error(ignoredReferenceError);
      const importName = safeName(`${inspected.name}-${inspected.version ?? "pi"}-${shortHash([source, resolution.sha].join(":"))}`);
      const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
      if (!isPathInside(installWorkspace, destination))
        throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
      await rm(destination, { recursive: true, force: true });
      await mkdir(dirname(destination), { recursive: true });
      try {
        await cp(packageRoot, destination, { recursive: true, force: true, dereference: false });
        await safety.removeAmbientCliPackageIgnoredContent(destination);
        await safety.writeDescriptorOverlay(destination, normalized.descriptor);
        if (normalized.installDependencies) {
          const dependencyInstall = await safety.installAmbientCliPackageDependencies(destination);
          if (!dependencyInstall.passed)
            throw new Error(
              `Ambient CLI package dependency install failed: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "unknown error"}`,
            );
        }
        const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
        const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
        const health = await checkAmbientCliPackageHealth(imported, { workspacePath });
        const failed = health.find((check) => !check.passed);
        if (failed)
          throw new Error(
            `Ambient CLI package health check failed for "${failed.commandName}": ${failed.error ?? failed.stderr ?? "unknown error"}`,
          );
        await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
        return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
      } catch (error) {
        await rm(destination, { recursive: true, force: true });
        throw error;
      }
    });
  }

  async function installAmbientCliPackageGitSource(
    workspacePath: string,
    input: InstallAmbientCliPackageInput,
  ): Promise<AmbientCliPackageSummary> {
    const normalized = normalizeInstallInput(input);
    if (!normalized.sha) throw new Error("Pinned Git Ambient CLI package installs require sha.");
    const preview = await previewAmbientCliPackageInstallSource(workspacePath, normalized);
    if (!preview.installable) throw new Error(`Ambient CLI package is not installable: ${preview.errors.join("; ")}`);

    return safety.withClonedCliPackage(normalized, async ({ packageRoot }) => {
      const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
      const inspected = await inspectAmbientCliPackage(
        workspacePath,
        packageRoot,
        safety.gitSourceLabel(normalized),
        normalized.descriptor,
      );
      const ignoredReferenceError = safety.ambientCliPackageIgnoredPathReferenceError(inspected);
      if (ignoredReferenceError) throw new Error(ignoredReferenceError);
      const importName = safeName(
        `${inspected.name}-${inspected.version ?? "git"}-${shortHash([normalized.source, normalized.path, normalized.sha].filter(Boolean).join(":"))}`,
      );
      const destination = resolve(installWorkspace, cliPackageImportRoot, importName);
      if (!isPathInside(installWorkspace, destination))
        throw new Error("Resolved Ambient CLI import path is outside Ambient-managed install state.");
      await rm(destination, { recursive: true, force: true });
      await mkdir(dirname(destination), { recursive: true });
      try {
        await cp(packageRoot, destination, { recursive: true, force: true, dereference: false });
        await safety.removeAmbientCliPackageIgnoredContent(destination);
        await safety.writeDescriptorOverlay(destination, normalized.descriptor);
        if (normalized.installDependencies) {
          const dependencyInstall = await safety.installAmbientCliPackageDependencies(destination);
          if (!dependencyInstall.passed)
            throw new Error(
              `Ambient CLI package dependency install failed: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "unknown error"}`,
            );
        }
        const relativeSource = `./${relative(installWorkspace, destination).split(sep).join("/")}`;
        const imported = await inspectAmbientCliPackage(workspacePath, destination, relativeSource);
        const health = await checkAmbientCliPackageHealth(imported, { workspacePath });
        const failed = health.find((check) => !check.passed);
        if (failed)
          throw new Error(
            `Ambient CLI package health check failed for "${failed.commandName}": ${failed.error ?? failed.stderr ?? "unknown error"}`,
          );
        await upsertCliPackageConfig(workspacePath, relativeSource, imported.name);
        return inspectAmbientCliPackage(workspacePath, destination, relativeSource);
      } catch (error) {
        await rm(destination, { recursive: true, force: true });
        throw error;
      }
    });
  }

  async function previewPreparedAmbientCliPackage(
    workspacePath: string,
    packageRoot: string,
    source: string,
    input: NormalizedInstallInput,
    expectedPackageName?: string,
  ): Promise<AmbientCliPackageInstallPreview> {
    const symlinkPreflightError = await safety.ambientCliPackageSymlinkPreflightError(packageRoot);
    if (symlinkPreflightError) {
      return {
        ...input,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: [symlinkPreflightError],
      };
    }
    const candidate = await inspectAmbientCliPackage(workspacePath, packageRoot, source, input.descriptor);
    const ignoredReferenceError = safety.ambientCliPackageIgnoredPathReferenceError(candidate);
    if (ignoredReferenceError) {
      return {
        ...input,
        envStatus: [],
        healthChecks: [],
        installable: false,
        errors: [ignoredReferenceError],
      };
    }
    const identityErrors =
      expectedPackageName && candidate.name !== expectedPackageName
        ? [`Bundled Ambient CLI package identity mismatch: expected "${expectedPackageName}", got "${candidate.name}".`]
        : [];
    const dependencyInstall =
      input.installDependencies && candidate.errors.length === 0 && identityErrors.length === 0
        ? await safety.previewAmbientCliPackageDependencies(packageRoot)
        : undefined;
    const envStatus = await resolveAmbientCliEnvStatus(workspacePath, candidate);
    const healthChecks: AmbientCliPackageHealthCheckResult[] = [];
    const pinPolicyError = safety.ambientCliInstallPinPolicyError(input, dependencyInstall);
    const contentHashResult =
      candidate.errors.length === 0 ? await safety.ambientCliPackageInstallContentHashResult(packageRoot, input.descriptor) : {};
    const errors = [
      ...candidate.errors,
      ...identityErrors,
      ...(ignoredReferenceError ? [ignoredReferenceError] : []),
      ...(contentHashResult.error ? [contentHashResult.error] : []),
      ...envStatus.filter((env) => env.error).map((env) => `env: ${env.name}: ${env.error}`),
      ...(pinPolicyError ? [pinPolicyError] : []),
      ...(dependencyInstall && !dependencyInstall.passed
        ? [`dependencies: ${dependencyInstall.error ?? dependencyInstall.stderr ?? dependencyInstall.reason ?? "failed"}`]
        : []),
      ...healthChecks.filter((check) => !check.passed).map((check) => `${check.commandName}: ${check.error ?? check.stderr ?? "failed"}`),
    ];
    if (!candidate.commands.length) errors.push("Ambient CLI package descriptor does not declare any commands.");
    return {
      ...input,
      ...(contentHashResult.contentHash ? { contentHash: contentHashResult.contentHash } : {}),
      candidate,
      ...(dependencyInstall ? { dependencyInstall } : {}),
      envStatus,
      healthChecks,
      installable: errors.length === 0 && candidate.commands.length > 0,
      errors,
    };
  }

  async function uninstallAmbientCliPackageSource(
    workspacePath: string,
    input: UninstallAmbientCliPackageInput,
  ): Promise<AmbientCliPackageCatalog> {
    const catalog = await discoverAmbientCliPackages(workspacePath);
    const pkg = catalog.packages.find((candidate) => candidate.id === input.packageId);
    if (!pkg) throw new Error("Ambient CLI package was not found.");
    if (!pkg.installed) throw new Error("Only Ambient-installed CLI packages can be uninstalled.");
    await removeCliPackageConfig(workspacePath, pkg.source);
    const importRoot = resolve(managedInstallWorkspacePath(workspacePath), cliPackageImportRoot);
    if (isPathInside(importRoot, pkg.rootPath)) await rm(pkg.rootPath, { recursive: true, force: true });
    return discoverAmbientCliPackages(workspacePath);
  }

  function resolveFirstPartyBundledAmbientCliPackage(source: string): BundledFirstPartyAmbientCliPackage | undefined {
    const trimmed = source.trim();
    if (!isBundledAmbientCliInstallSource(trimmed)) return undefined;
    const name = trimmed.slice("bundled:".length).trim();
    const found = firstPartyAmbientCliPackages.find(
      (pkg) => pkg.kind === "bundled" && (pkg.source === trimmed || pkg.packageName === name || pkg.packageDir === name),
    );
    return found?.kind === "bundled" ? found : undefined;
  }

  function bundledAmbientCliInstallUnsupportedFields(input: NormalizedInstallInput): string[] {
    return [
      input.path ? "path" : undefined,
      input.ref ? "ref" : undefined,
      input.sha ? "sha" : undefined,
      input.descriptor !== undefined ? "descriptor" : undefined,
      input.installDependencies ? "installDependencies" : undefined,
    ].filter((value): value is string => Boolean(value));
  }

  return {
    installAmbientCliPackagePiCatalogSource,
    installAmbientCliPackageSource,
    previewAmbientCliPackageInstallSource,
    previewAmbientCliPackagePiCatalogSource,
    uninstallAmbientCliPackageSource,
  };
}

export function isBundledAmbientCliInstallSource(source: string): boolean {
  return source.trim().startsWith("bundled:");
}

function normalizeInstallInput(input: InstallAmbientCliPackageInput): NormalizedInstallInput {
  return {
    source: input.source.trim(),
    ...(input.path?.trim() ? { path: input.path.trim() } : {}),
    ...(input.ref?.trim() ? { ref: input.ref.trim() } : {}),
    ...(input.sha?.trim() ? { sha: input.sha.trim() } : {}),
    ...(input.descriptor !== undefined ? { descriptor: input.descriptor } : {}),
    ...(input.installDependencies ? { installDependencies: true } : {}),
  };
}

function redactedInstallInput(input: NormalizedInstallInput): NormalizedInstallInput {
  return { ...input, source: redactGitSourceCredentials(input.source) };
}
