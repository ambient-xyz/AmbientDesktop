import { execFile } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";
import { chmod, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { isPathInside } from "./ambientCliSessionFacade";

const execFileAsync = promisify(execFile);
const packageContentHashIgnoredDirectories = new Set([".git", ".hg", ".svn"]);
const npmDependencySectionNames = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

interface AmbientCliPackageInstallDependencyJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface AmbientCliPackageInstallInputIdentity {
  source: string;
  path?: string;
  ref?: string;
  sha?: string;
  installDependencies?: boolean;
}

interface AmbientCliPackageInstallSourceInput extends AmbientCliPackageInstallInputIdentity {
  descriptor?: unknown;
}

interface ClonedCliPackage {
  repoPath: string;
  packageRoot: string;
}

interface AmbientCliPackageContentHashEntry {
  path: string;
  kind: "directory" | "file" | "symlink" | "other";
  mode?: number;
  size?: number;
  sha256?: string;
  target?: string;
}

interface AmbientCliPackageInstallSafetyMaterializedTextOutput {
  text: string;
  truncated: boolean;
  totalChars: number;
  previewChars: number;
  redacted: boolean;
  redactionCount: number;
  artifactPath?: string;
  artifactBytes?: number;
}

interface AmbientCliPackageInstallSafetyDependencyInstallResult {
  manager: "npm";
  command: string[];
  cwd: string;
  attempted: boolean;
  passed: boolean;
  skipped?: boolean;
  reason?: string;
  stdout?: string;
  stderr?: string;
  stdoutOutput?: AmbientCliPackageInstallSafetyMaterializedTextOutput;
  stderrOutput?: AmbientCliPackageInstallSafetyMaterializedTextOutput;
  error?: string;
}

interface AmbientCliPackageInstallSafetyPreview {
  source: string;
  path?: string;
  ref?: string;
  sha?: string;
  contentHash?: string;
  candidate?: AmbientCliPackageInstallSafetySummary;
  dependencyInstall?: AmbientCliPackageInstallSafetyDependencyInstallResult;
  installable: boolean;
  errors: string[];
}

interface AmbientCliPackageInstallSafetySummary {
  name: string;
  version?: string;
  description?: string;
  commands: Array<{
    name: string;
    description?: string;
    command: string;
    args: string[];
    cwd: string;
    healthCheck?: string[];
    timeoutProfile?: string;
    progressPatterns?: string[];
    devicePolicy?: unknown;
    voiceProvider?: unknown;
    sttProvider?: unknown;
    embeddingProvider?: unknown;
  }>;
  skills: Array<{
    name: string;
    description?: string;
    path: string;
  }>;
  envRequirements: Array<{
    name: string;
    description?: string;
    required: boolean;
  }>;
}

export interface AmbientCliPackageInstallSafetyDependencies {
  cliPackageDescriptorName: string;
  packageJsonName: string;
  ambientRuntimeEnv(): NodeJS.ProcessEnv;
  gitEnv(): NodeJS.ProcessEnv;
  materializeTextOutput(
    rootPath: string,
    input: { label: string; text: string; maxPreviewChars: number },
  ): Promise<AmbientCliPackageInstallSafetyMaterializedTextOutput>;
  parseDescriptorOverlay(descriptorOverlay: unknown): unknown;
  parsePackageJson(value: unknown): AmbientCliPackageInstallDependencyJson;
  readJson(path: string): Promise<unknown>;
  contentHash(value: string | Buffer): string;
  stableJson(value: unknown): string;
  errorMessage(error: unknown): string;
  isErrno(error: unknown, code: string): boolean;
  isBundledAmbientCliInstallSource(source: string): boolean;
  safeGitCloneSource(source: string): string;
}

export function createAmbientCliPackageInstallSafetyServices(deps: AmbientCliPackageInstallSafetyDependencies) {
  const {
    cliPackageDescriptorName,
    contentHash,
    errorMessage,
    ambientRuntimeEnv,
    gitEnv,
    isBundledAmbientCliInstallSource,
    isErrno,
    materializeTextOutput,
    packageJsonName,
    parseDescriptorOverlay,
    parsePackageJson,
    readJson,
    safeGitCloneSource,
    stableJson,
  } = deps;

  async function ambientCliPackageInstallContentHashResult(
    rootPath: string,
    descriptorOverlay?: unknown,
  ): Promise<{ contentHash?: string; error?: string }> {
    try {
      return { contentHash: await ambientCliPackageInstallContentHash(rootPath, descriptorOverlay) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }

  function assertApprovedInstallPreviewInput(
    input: AmbientCliPackageInstallInputIdentity,
    approvedPreview: AmbientCliPackageInstallSafetyPreview | undefined,
  ): void {
    if (!approvedPreview) return;
    const matches =
      approvedPreview.source === input.source &&
      (approvedPreview.path ?? "") === (input.path ?? "") &&
      (approvedPreview.ref ?? "") === (input.ref ?? "") &&
      (approvedPreview.sha ?? "") === (input.sha ?? "");
    if (!matches) throw new Error("Approved Ambient CLI package preview does not match the requested install input.");
    if (!approvedPreview.installable)
      throw new Error(`Approved Ambient CLI package preview is not installable: ${approvedPreview.errors.join("; ")}`);
    if (!approvedPreview.candidate) throw new Error("Approved Ambient CLI package preview did not include a candidate package.");
  }

  function assertApprovedInstallPreviewPackage(
    approvedPreview: AmbientCliPackageInstallSafetyPreview | undefined,
    current: {
      candidate: AmbientCliPackageInstallSafetySummary;
      contentHash?: string;
      dependencyInstall?: AmbientCliPackageInstallSafetyDependencyInstallResult;
    },
  ): void {
    if (!approvedPreview) return;
    const approvedCandidate = approvedPreview.candidate;
    if (!approvedCandidate) throw new Error("Approved Ambient CLI package preview did not include a candidate package.");
    if (approvedPreview.contentHash && current.contentHash && approvedPreview.contentHash !== current.contentHash) {
      throw new Error("Approved Ambient CLI package preview no longer matches the package source content.");
    }
    if (ambientCliPackageApprovalFingerprint(approvedCandidate) !== ambientCliPackageApprovalFingerprint(current.candidate)) {
      throw new Error("Approved Ambient CLI package preview no longer matches the package descriptor.");
    }
    if (
      ambientCliPackageDependencyApprovalFingerprint(approvedPreview.dependencyInstall) !==
      ambientCliPackageDependencyApprovalFingerprint(current.dependencyInstall)
    ) {
      throw new Error("Approved Ambient CLI package preview no longer matches dependency installation behavior.");
    }
  }

  function ambientCliPackageApprovalFingerprint(pkg: AmbientCliPackageInstallSafetySummary): string {
    return stableJson({
      name: pkg.name,
      version: pkg.version ?? "",
      description: pkg.description ?? "",
      commands: pkg.commands.map((command) => ({
        name: command.name,
        description: command.description ?? "",
        command: command.command,
        args: command.args,
        cwd: command.cwd,
        healthCheck: command.healthCheck ?? [],
        timeoutProfile: command.timeoutProfile ?? "",
        progressPatterns: command.progressPatterns ?? [],
        devicePolicy: command.devicePolicy ?? {},
        sttProvider: command.sttProvider ?? {},
        embeddingProvider: command.embeddingProvider ?? {},
        voiceProvider: command.voiceProvider ?? {},
      })),
      skills: pkg.skills.map((skill) => ({
        name: skill.name,
        description: skill.description ?? "",
      })),
      envRequirements: pkg.envRequirements.map((env) => ({
        name: env.name,
        description: env.description ?? "",
        required: env.required,
      })),
    });
  }

  function ambientCliPackageDependencyApprovalFingerprint(
    dependencyInstall: AmbientCliPackageInstallSafetyDependencyInstallResult | undefined,
  ): string {
    if (!dependencyInstall) return "";
    return stableJson({
      manager: dependencyInstall.manager,
      command: dependencyInstall.command,
      attempted: dependencyInstall.attempted,
      passed: dependencyInstall.passed,
      skipped: dependencyInstall.skipped,
      reason: dependencyInstall.reason ?? "",
    });
  }

  function ambientCliPackageIgnoredPathReferenceError(pkg: AmbientCliPackageInstallSafetySummary): string | undefined {
    for (const command of pkg.commands) {
      const values = [command.command, ...command.args, ...(command.healthCheck ?? [])];
      const ignoredReference = values.find((value) => ambientCliPackageValueReferencesIgnoredDirectory(value));
      if (ignoredReference) {
        return `Ambient CLI package command "${command.name}" cannot reference ignored VCS metadata path "${ignoredReference}".`;
      }
    }
    for (const skill of pkg.skills) {
      if (ambientCliPackageValueReferencesIgnoredDirectory(skill.path)) {
        return `Ambient CLI package skills cannot reference ignored VCS metadata path "${skill.path}".`;
      }
    }
    return undefined;
  }

  function ambientCliPackageValueReferencesIgnoredDirectory(value: string): boolean {
    const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
    const segments = normalized.split("/").filter(Boolean);
    return segments.some((segment) => packageContentHashIgnoredDirectories.has(segment));
  }

  async function ambientCliPackageInstallContentHash(rootPath: string, descriptorOverlay?: unknown): Promise<string> {
    const overlayContent =
      descriptorOverlay === undefined ? undefined : `${JSON.stringify(parseDescriptorOverlay(descriptorOverlay), null, 2)}\n`;
    const entries: AmbientCliPackageContentHashEntry[] = [];
    let sawDescriptor = false;

    async function visit(directoryPath: string): Promise<void> {
      const directoryEntries = (await readdir(directoryPath, { withFileTypes: true })).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      for (const entry of directoryEntries) {
        if (packageContentHashIgnoredDirectories.has(entry.name)) continue;
        const absolutePath = join(directoryPath, entry.name);
        const relativePath = relative(rootPath, absolutePath).split(sep).join("/");
        const details = lstatSync(absolutePath);
        if (relativePath === cliPackageDescriptorName) sawDescriptor = true;
        if (details.isSymbolicLink()) {
          const target = readlinkSync(absolutePath);
          assertAmbientCliPackageSymlinkTargetInside(rootPath, absolutePath, target);
          entries.push({
            path: relativePath,
            kind: "symlink",
            target,
          });
          continue;
        }
        if (details.isDirectory()) {
          entries.push({
            path: relativePath,
            kind: "directory",
            mode: details.mode & 0o777,
          });
          await visit(absolutePath);
          continue;
        }
        if (details.isFile()) {
          const isDescriptorOverlay = overlayContent !== undefined && relativePath === cliPackageDescriptorName;
          const content = isDescriptorOverlay ? Buffer.from(overlayContent) : await readFile(absolutePath);
          entries.push({
            path: relativePath,
            kind: "file",
            mode: isDescriptorOverlay ? 0o644 : details.mode & 0o777,
            size: content.byteLength,
            sha256: contentHash(content),
          });
          continue;
        }
        entries.push({
          path: relativePath,
          kind: "other",
          mode: details.mode & 0o777,
          size: details.size,
        });
      }
    }

    await visit(rootPath);
    if (overlayContent !== undefined && !sawDescriptor) {
      entries.push({
        path: cliPackageDescriptorName,
        kind: "file",
        mode: 0o644,
        size: Buffer.byteLength(overlayContent),
        sha256: contentHash(overlayContent),
      });
    }
    return contentHash(stableJson(entries.sort((left, right) => left.path.localeCompare(right.path))));
  }

  async function removeAmbientCliPackageIgnoredContent(rootPath: string): Promise<void> {
    await removeAmbientCliPackageIgnoredContentInDirectory(rootPath);
  }

  async function removeAmbientCliPackageIgnoredContentInDirectory(directoryPath: string): Promise<void> {
    let directoryEntries;
    try {
      directoryEntries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (isErrno(error, "ENOENT")) return;
      throw error;
    }
    await Promise.all(
      directoryEntries.map(async (entry) => {
        const absolutePath = join(directoryPath, entry.name);
        if (packageContentHashIgnoredDirectories.has(entry.name)) {
          await rm(absolutePath, { recursive: true, force: true });
          return;
        }
        const details = lstatSync(absolutePath);
        if (details.isDirectory()) await removeAmbientCliPackageIgnoredContentInDirectory(absolutePath);
      }),
    );
  }

  function assertAmbientCliPackageSymlinkTargetInside(rootPath: string, symlinkPath: string, target: string): void {
    const root = resolve(rootPath);
    const lexicalTarget = isAbsolute(target) ? resolve(target) : resolve(dirname(symlinkPath), target);
    if (!isPathInside(root, lexicalTarget)) {
      throw new Error("Ambient CLI package symlinks must resolve inside the package root.");
    }
    assertAmbientCliPackageSymlinkTargetNotIgnored(root, lexicalTarget);
    try {
      const realTarget = realpathSync(symlinkPath);
      if (!isPathInside(root, realTarget)) {
        throw new Error("Ambient CLI package symlinks must resolve inside the package root.");
      }
      assertAmbientCliPackageSymlinkTargetNotIgnored(root, realTarget);
    } catch (error) {
      if (isErrno(error, "ENOENT")) {
        throw new Error("Ambient CLI package symlinks must resolve inside the package root.", { cause: error });
      }
      throw error;
    }
  }

  function assertAmbientCliPackageSymlinkTargetNotIgnored(rootPath: string, targetPath: string): void {
    const relativeTarget = relative(resolve(rootPath), resolve(targetPath)).split(sep).join("/");
    if (ambientCliPackageValueReferencesIgnoredDirectory(relativeTarget)) {
      throw new Error("Ambient CLI package symlinks cannot target ignored VCS metadata paths.");
    }
  }

  function assertAmbientCliPackageRootIsNotSymlink(sourcePath: string): void {
    const symlinkError = ambientCliPackageRootSymlinkError(sourcePath);
    if (symlinkError) throw new Error(symlinkError);
  }

  function ambientCliPackageRootSymlinkError(sourcePath: string): string | undefined {
    try {
      return lstatSync(sourcePath).isSymbolicLink() ? "Ambient CLI package source root cannot be a symlink." : undefined;
    } catch (error) {
      if (isErrno(error, "ENOENT")) return undefined;
      throw error;
    }
  }

  async function ambientCliPackageSymlinkPreflightError(rootPath: string): Promise<string | undefined> {
    try {
      const rootDetails = lstatSync(rootPath);
      if (rootDetails.isSymbolicLink()) return "Ambient CLI package source root cannot be a symlink.";
      if (!rootDetails.isDirectory()) return undefined;
      await validateAmbientCliPackageSymlinkTree(rootPath, rootPath);
      return undefined;
    } catch (error) {
      if (isErrno(error, "ENOENT")) return undefined;
      return errorMessage(error);
    }
  }

  async function validateAmbientCliPackageSymlinkTree(rootPath: string, directoryPath: string): Promise<void> {
    const directoryEntries = (await readdir(directoryPath, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of directoryEntries) {
      if (packageContentHashIgnoredDirectories.has(entry.name)) continue;
      const absolutePath = join(directoryPath, entry.name);
      const details = lstatSync(absolutePath);
      if (details.isSymbolicLink()) {
        assertAmbientCliPackageSymlinkTargetInside(rootPath, absolutePath, readlinkSync(absolutePath));
        continue;
      }
      if (details.isDirectory()) await validateAmbientCliPackageSymlinkTree(rootPath, absolutePath);
    }
  }

  function ambientCliInstallPinPolicyError(
    input: AmbientCliPackageInstallInputIdentity,
    dependencyInstall: AmbientCliPackageInstallSafetyDependencyInstallResult | undefined,
  ): string | undefined {
    if (input.sha || isBundledAmbientCliInstallSource(input.source)) return undefined;
    if (!input.installDependencies) return undefined;
    if (
      !dependencyInstall ||
      !dependencyInstall.passed ||
      dependencyInstall.reason === "Missing package.json." ||
      dependencyInstall.reason === "No package dependencies declared."
    ) {
      return undefined;
    }
    return "Unpinned Ambient CLI package installs that run dependency installation require an immutable sha-pinned source.";
  }

  async function previewAmbientCliPackageDependencies(rootPath: string): Promise<AmbientCliPackageInstallSafetyDependencyInstallResult> {
    const command = ["npm", "ci", "--ignore-scripts"];
    const packageJsonPath = join(rootPath, packageJsonName);
    if (!existsSync(packageJsonPath)) {
      return { manager: "npm", command, cwd: rootPath, attempted: false, passed: false, skipped: true, reason: "Missing package.json." };
    }
    const pkg = parsePackageJson(await readJson(packageJsonPath));
    const packageNames = ambientCliPackageDependencyNames(pkg);
    if (packageNames.length === 0) {
      return {
        manager: "npm",
        command,
        cwd: rootPath,
        attempted: false,
        passed: true,
        skipped: true,
        reason: "No package dependencies declared.",
      };
    }
    if (!existsSync(join(rootPath, "package-lock.json"))) {
      return {
        manager: "npm",
        command,
        cwd: rootPath,
        attempted: false,
        passed: false,
        reason: "Missing package-lock.json. Ambient CLI dependency setup only supports lockfile-backed npm packages.",
      };
    }
    return {
      manager: "npm",
      command,
      cwd: rootPath,
      attempted: false,
      passed: true,
      skipped: true,
      reason:
        "Dependency installation is not run during package preview. If approved, install runs dependencies before copying the package.",
    };
  }

  async function installAmbientCliPackageDependencies(rootPath: string): Promise<AmbientCliPackageInstallSafetyDependencyInstallResult> {
    const command = ["npm", "ci", "--ignore-scripts"];
    const packageJsonPath = join(rootPath, packageJsonName);
    if (!existsSync(packageJsonPath)) {
      return { manager: "npm", command, cwd: rootPath, attempted: false, passed: false, skipped: true, reason: "Missing package.json." };
    }
    const pkg = parsePackageJson(await readJson(packageJsonPath));
    const packageNames = ambientCliPackageDependencyNames(pkg);
    if (packageNames.length === 0) {
      return {
        manager: "npm",
        command,
        cwd: rootPath,
        attempted: false,
        passed: true,
        skipped: true,
        reason: "No package dependencies declared.",
      };
    }
    if (!existsSync(join(rootPath, "package-lock.json"))) {
      return {
        manager: "npm",
        command,
        cwd: rootPath,
        attempted: false,
        passed: false,
        reason: "Missing package-lock.json. Ambient CLI dependency setup only supports lockfile-backed npm packages.",
      };
    }
    try {
      const { stdout, stderr } = await execFileAsync(command[0], command.slice(1), {
        cwd: rootPath,
        timeout: 120_000,
        env: ambientRuntimeEnv(),
        maxBuffer: 1024 * 1024 * 4,
      });
      const stdoutOutput = stdout
        ? await materializeTextOutput(rootPath, {
            label: "ambient-cli-dependency-install-stdout",
            text: stdout,
            maxPreviewChars: 4_000,
          })
        : undefined;
      const stderrOutput = stderr
        ? await materializeTextOutput(rootPath, {
            label: "ambient-cli-dependency-install-stderr",
            text: stderr,
            maxPreviewChars: 4_000,
          })
        : undefined;
      return {
        manager: "npm",
        command,
        cwd: rootPath,
        attempted: true,
        passed: true,
        ...(stdoutOutput ? { stdout: stdoutOutput.text, stdoutOutput } : {}),
        ...(stderrOutput ? { stderr: stderrOutput.text, stderrOutput } : {}),
      };
    } catch (error) {
      return {
        manager: "npm",
        command,
        cwd: rootPath,
        attempted: true,
        passed: false,
        error: errorMessage(error),
      };
    }
  }

  async function withClonedCliPackage<T>(
    input: AmbientCliPackageInstallSourceInput,
    action: (clone: ClonedCliPackage) => Promise<T>,
  ): Promise<T> {
    const tempRoot = await mkdtemp(join(tmpdir(), "ambient-cli-git-"));
    try {
      const repoPath = join(tempRoot, "repo");
      await git(["clone", "--quiet", "--", safeGitCloneSource(input.source), repoPath], tempRoot);
      await git(["-C", repoPath, "checkout", "--quiet", input.sha ?? input.ref ?? "HEAD"], tempRoot);
      if (input.sha) await verifyGitCheckoutSha(repoPath, input.sha);
      const packageRoot = resolveGitPackageRoot(repoPath, input.path);
      return await action({ repoPath, packageRoot });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async function withPreviewPackageRoot<T>(
    sourcePath: string,
    input: AmbientCliPackageInstallSourceInput,
    action: (packageRoot: string) => Promise<T>,
  ): Promise<T> {
    if (!input.installDependencies) return action(sourcePath);
    const tempRoot = await mkdtemp(join(tmpdir(), "ambient-cli-preview-"));
    try {
      const packageRoot = join(tempRoot, "package");
      await cp(sourcePath, packageRoot, { recursive: true, force: true, dereference: false });
      return await action(packageRoot);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  function isGitLikeInstallSource(source: string): boolean {
    const trimmed = source.trim();
    return (
      /^git\+/i.test(trimmed) ||
      /^(?:ext|git-remote-ext)::/i.test(trimmed) ||
      /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed) ||
      /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s\0]+$/.test(trimmed)
    );
  }

  function resolveGitPackageRoot(repoPath: string, packagePath: string | undefined): string {
    const packageRoot = resolve(repoPath, packagePath ?? ".");
    if (!isPathInside(repoPath, packageRoot)) throw new Error("Ambient CLI package path resolves outside the cloned repository.");
    return packageRoot;
  }

  async function verifyGitCheckoutSha(repoPath: string, expectedSha: string): Promise<void> {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
      timeout: 30_000,
      env: gitEnv(),
      maxBuffer: 1024 * 1024,
    });
    const actualSha = String(stdout).trim();
    if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
      throw new Error(`Ambient CLI Git checkout SHA mismatch: expected ${expectedSha}, got ${actualSha}.`);
    }
  }

  async function git(args: string[], cwd: string): Promise<void> {
    await execFileAsync("git", args, {
      cwd,
      timeout: 60_000,
      env: gitEnv(),
      maxBuffer: 1024 * 1024,
    });
  }

  function gitSourceLabel(input: AmbientCliPackageInstallSourceInput): string {
    return ["git", input.source, input.path, input.ref, input.sha].filter(Boolean).join(":");
  }

  async function writeDescriptorOverlay(rootPath: string, descriptorOverlay: unknown): Promise<void> {
    if (descriptorOverlay === undefined) return;
    const descriptor = parseDescriptorOverlay(descriptorOverlay);
    const descriptorPath = join(rootPath, cliPackageDescriptorName);
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    await chmod(descriptorPath, 0o644);
  }

  return {
    ambientCliInstallPinPolicyError,
    ambientCliPackageIgnoredPathReferenceError,
    ambientCliPackageInstallContentHash,
    ambientCliPackageInstallContentHashResult,
    ambientCliPackageRootSymlinkError,
    ambientCliPackageSymlinkPreflightError,
    assertAmbientCliPackageRootIsNotSymlink,
    assertApprovedInstallPreviewInput,
    assertApprovedInstallPreviewPackage,
    gitSourceLabel,
    installAmbientCliPackageDependencies,
    isGitLikeInstallSource,
    previewAmbientCliPackageDependencies,
    removeAmbientCliPackageIgnoredContent,
    withClonedCliPackage,
    withPreviewPackageRoot,
    writeDescriptorOverlay,
  };
}

function ambientCliPackageDependencyNames(pkg: AmbientCliPackageInstallDependencyJson): string[] {
  return npmDependencySectionNames.flatMap((sectionName) => Object.keys(pkg[sectionName] ?? {}));
}
