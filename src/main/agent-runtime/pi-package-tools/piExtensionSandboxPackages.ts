import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { isPathInside } from "../../session/sessionPaths";
import { discoverPiExtensionHostTools, runPiExtensionHostTool, type PiExtensionHostTool, type PiExtensionHostRunResult } from "../../pi/piExtensionCompatibilityHost";
import { managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "../../setup/managedInstallPaths";

const execFileAsync = promisify(execFile);
const sandboxConfigPath = ".ambient/pi-extension-sandboxes/packages.json";
const sandboxImportRoot = ".ambient/pi-extension-sandboxes/imported";

const sandboxToolSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  parameters: z.unknown().optional(),
});

const sandboxHistorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  source: z.string().min(1),
  resolvedSource: z.string().min(1),
  packagePath: z.string().min(1),
  sha: z.string().min(1),
  rootPath: z.string().min(1),
  entrypoint: z.string().min(1),
  allowedNetworkHosts: z.array(z.string()).default([]),
  tools: z.array(sandboxToolSchema).default([]),
  installed: z.boolean().default(false),
  errors: z.array(z.string()).default([]),
  removedAt: z.string().min(1),
  removalReason: z.string().min(1),
});

const sandboxConfigSchema = z.object({
  packages: z
    .array(
      z.object({
        source: z.string().min(1),
        resolvedSource: z.string().min(1),
        packagePath: z.string().min(1),
        sha: z.string().min(1),
        packageName: z.string().min(1),
        version: z.string().optional(),
        entrypoint: z.string().min(1),
        allowedNetworkHosts: z.array(z.string()).default([]),
        installedSource: z.string().min(1),
      }),
    )
    .default([]),
  history: z.array(sandboxHistorySchema).default([]),
});

const packageJsonSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    repository: z.unknown().optional(),
    pi: z
      .object({
        extensions: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface PiExtensionSandboxPackageSummary {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  resolvedSource: string;
  packagePath: string;
  sha: string;
  rootPath: string;
  entrypoint: string;
  allowedNetworkHosts: string[];
  tools: PiExtensionHostTool[];
  installed: boolean;
  errors: string[];
}

export interface PiExtensionSandboxHistoryEntry extends PiExtensionSandboxPackageSummary {
  removedAt: string;
  removalReason: string;
}

export interface PiExtensionSandboxInstallInput {
  source: string;
  allowedNetworkHosts?: string[];
}

export interface PiExtensionSandboxInstallPreview {
  source: string;
  resolvedSource?: string;
  packagePath?: string;
  sha?: string;
  packageName?: string;
  version?: string;
  entrypoint?: string;
  allowedNetworkHosts: string[];
  candidate?: PiExtensionSandboxPackageSummary;
  installable: boolean;
  errors: string[];
}

export interface PiExtensionSandboxCatalog {
  packages: PiExtensionSandboxPackageSummary[];
  history: PiExtensionSandboxHistoryEntry[];
  errors: string[];
}

export interface RunPiExtensionSandboxToolInput {
  packageId?: string;
  packageName?: string;
  toolName: string;
  params?: unknown;
}

export interface UninstallPiExtensionSandboxPackageInput {
  packageId?: string;
  packageName?: string;
}

interface ResolvedPiExtensionSource {
  source: string;
  resolvedSource: string;
  packagePath: string;
  sha: string;
  packageName: string;
  version?: string;
  entrypoint: string;
  allowedNetworkHosts: string[];
}

type SandboxConfigEntry = z.infer<typeof sandboxConfigSchema>["packages"][number];

async function ensurePiExtensionSandboxManagedWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, ".ambient/pi-extension-sandboxes");
  return managedInstallWorkspacePath(workspacePath);
}

export async function previewPiExtensionSandboxInstall(
  workspacePath: string,
  input: PiExtensionSandboxInstallInput,
): Promise<PiExtensionSandboxInstallPreview> {
  try {
    const resolved = await resolvePiExtensionSource(input);
    return withResolvedPiExtensionPackage(resolved, async (packageRoot) => {
      const candidate = await inspectPiExtensionSandboxPackage(workspacePath, packageRoot, resolved, false);
      const errors = [...candidate.errors];
      if (!candidate.tools.length) errors.push("Pi extension package did not register any tools.");
      return {
        source: input.source,
        resolvedSource: resolved.resolvedSource,
        packagePath: resolved.packagePath,
        sha: resolved.sha,
        packageName: resolved.packageName,
        ...(resolved.version ? { version: resolved.version } : {}),
        entrypoint: resolved.entrypoint,
        allowedNetworkHosts: resolved.allowedNetworkHosts,
        candidate,
        installable: errors.length === 0,
        errors,
      };
    });
  } catch (error) {
    return { source: input.source, allowedNetworkHosts: input.allowedNetworkHosts ?? [], installable: false, errors: [errorMessage(error)] };
  }
}

export async function installPiExtensionSandboxPackage(
  workspacePath: string,
  input: PiExtensionSandboxInstallInput,
): Promise<PiExtensionSandboxPackageSummary> {
  const preview = await previewPiExtensionSandboxInstall(workspacePath, input);
  if (!preview.installable) throw new Error(`Sandboxed Pi extension package is not installable: ${preview.errors.join("; ")}`);
  const resolved = await resolvePiExtensionSource(input);
  const managedWorkspace = await ensurePiExtensionSandboxManagedWorkspace(workspacePath);
  return withResolvedPiExtensionPackage(resolved, async (packageRoot) => {
    const importName = safeName(`${resolved.packageName}-${resolved.version ?? "pi"}-${shortHash([resolved.resolvedSource, resolved.packagePath, resolved.sha].join(":"))}`);
    const destination = resolve(managedWorkspace, sandboxImportRoot, importName);
    if (!isPathInside(managedWorkspace, destination)) throw new Error("Resolved Pi extension sandbox import path is outside Ambient-managed install state.");
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    try {
      await cp(packageRoot, destination, { recursive: true, force: true, dereference: false });
      const installedSource = `./${relative(managedWorkspace, destination).split(sep).join("/")}`;
      const entry: SandboxConfigEntry = {
        source: input.source.trim(),
        resolvedSource: resolved.resolvedSource,
        packagePath: resolved.packagePath,
        sha: resolved.sha,
        packageName: resolved.packageName,
        ...(resolved.version ? { version: resolved.version } : {}),
        entrypoint: resolved.entrypoint,
        allowedNetworkHosts: resolved.allowedNetworkHosts,
        installedSource,
      };
      const inspected = await inspectPiExtensionSandboxPackage(workspacePath, destination, { ...resolved, source: input.source }, true);
      if (inspected.errors.length) throw new Error(`Sandboxed Pi extension package is invalid: ${inspected.errors.join("; ")}`);
      if (!inspected.tools.length) throw new Error("Sandboxed Pi extension package did not register any tools.");
      await upsertSandboxConfig(workspacePath, entry);
      return inspectPiExtensionSandboxPackage(workspacePath, destination, { ...resolved, source: input.source }, true);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  });
}

export async function discoverPiExtensionSandboxPackages(workspacePath: string): Promise<PiExtensionSandboxCatalog> {
  const managedWorkspace = await ensurePiExtensionSandboxManagedWorkspace(workspacePath);
  const configPath = join(managedWorkspace, sandboxConfigPath);
  if (!existsSync(configPath)) return { packages: [], history: [], errors: [] };
  const packages: PiExtensionSandboxPackageSummary[] = [];
  const errors: string[] = [];
  let history: PiExtensionSandboxHistoryEntry[] = [];
  try {
    const config = sandboxConfigSchema.parse(await readJson(configPath));
    history = config.history.sort((left, right) => right.removedAt.localeCompare(left.removedAt)) as PiExtensionSandboxHistoryEntry[];
    for (const entry of config.packages) {
      const rootPath = resolve(managedWorkspace, entry.installedSource);
      if (!isPathInside(managedWorkspace, rootPath)) {
        errors.push(`${entry.packageName}: installed source resolves outside Ambient-managed install state.`);
        continue;
      }
      packages.push(await inspectPiExtensionSandboxPackage(workspacePath, rootPath, entry, true));
    }
  } catch (error) {
    errors.push(`Pi extension sandbox config: ${errorMessage(error)}`);
  }
  return { packages: packages.sort((left, right) => left.name.localeCompare(right.name)), history, errors };
}

export async function runPiExtensionSandboxTool(
  workspacePath: string,
  input: RunPiExtensionSandboxToolInput,
): Promise<{ pkg: PiExtensionSandboxPackageSummary; result: PiExtensionHostRunResult }> {
  const catalog = await discoverPiExtensionSandboxPackages(workspacePath);
  const pkg = selectPiExtensionSandboxPackage(catalog.packages, input);
  if (pkg.errors.length) throw new Error(`Sandboxed Pi extension package "${pkg.name}" has errors: ${pkg.errors.join("; ")}`);
  if (!pkg.tools.some((tool) => tool.name === input.toolName)) throw new Error(`Sandboxed Pi extension package "${pkg.name}" does not register tool "${input.toolName}".`);
  const result = await runPiExtensionHostTool({
    packageRoot: pkg.rootPath,
    entrypoint: pkg.entrypoint,
    toolName: input.toolName,
    params: input.params ?? {},
    allowedNetworkHosts: pkg.allowedNetworkHosts,
  });
  return { pkg, result };
}

export async function uninstallPiExtensionSandboxPackage(
  workspacePath: string,
  input: UninstallPiExtensionSandboxPackageInput,
): Promise<{ removed: PiExtensionSandboxPackageSummary; catalog: PiExtensionSandboxCatalog }> {
  const catalog = await discoverPiExtensionSandboxPackages(workspacePath);
  const pkg = selectPiExtensionSandboxPackage(catalog.packages, input);
  const managedWorkspace = await ensurePiExtensionSandboxManagedWorkspace(workspacePath);
  const configPath = join(managedWorkspace, sandboxConfigPath);
  const config = existsSync(configPath) ? sandboxConfigSchema.parse(await readJson(configPath)) : { packages: [], history: [] };
  const packages = config.packages.filter(
    (entry) =>
      entry.resolvedSource !== pkg.resolvedSource ||
      entry.packagePath !== pkg.packagePath ||
      entry.sha !== pkg.sha ||
      entry.packageName !== pkg.name,
  );
  const removedAt = new Date().toISOString();
  const history = [
    {
      ...pkg,
      installed: false,
      removedAt,
      removalReason: "User uninstalled the Ambient-managed sandboxed Pi package.",
    },
    ...config.history.filter((entry) => entry.id !== pkg.id),
  ].slice(0, 50);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ packages, history }, null, 2)}\n`, "utf8");
  const importRoot = resolve(managedWorkspace, sandboxImportRoot);
  if (isPathInside(importRoot, pkg.rootPath)) await rm(pkg.rootPath, { recursive: true, force: true });
  return { removed: pkg, catalog: await discoverPiExtensionSandboxPackages(workspacePath) };
}

export async function clearPiExtensionSandboxHistory(workspacePath: string): Promise<PiExtensionSandboxCatalog> {
  const managedWorkspace = await ensurePiExtensionSandboxManagedWorkspace(workspacePath);
  const configPath = join(managedWorkspace, sandboxConfigPath);
  const config = existsSync(configPath) ? sandboxConfigSchema.parse(await readJson(configPath)) : { packages: [], history: [] };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ packages: config.packages, history: [] }, null, 2)}\n`, "utf8");
  return discoverPiExtensionSandboxPackages(workspacePath);
}

export function selectPiExtensionSandboxPackage(
  packages: PiExtensionSandboxPackageSummary[],
  selector: { packageId?: string; packageName?: string },
): PiExtensionSandboxPackageSummary {
  if (selector.packageId) {
    const pkg = packages.find((candidate) => candidate.id === selector.packageId);
    if (!pkg) throw new Error(`Sandboxed Pi extension package "${selector.packageId}" was not found.`);
    return pkg;
  }
  if (selector.packageName) {
    const matches = packages.filter((candidate) => candidate.name === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Sandboxed Pi extension package name "${selector.packageName}" matched multiple packages. Specify packageId.`);
    throw new Error(`Sandboxed Pi extension package "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

async function inspectPiExtensionSandboxPackage(
  workspacePath: string,
  rootPath: string,
  source: ResolvedPiExtensionSource | SandboxConfigEntry,
  installed: boolean,
): Promise<PiExtensionSandboxPackageSummary> {
  const errors: string[] = [];
  let pkgJson: z.infer<typeof packageJsonSchema> | undefined;
  if (!existsSync(rootPath)) errors.push("Package root was not found.");
  try {
    pkgJson = packageJsonSchema.parse(await readJson(join(rootPath, "package.json")));
  } catch (error) {
    errors.push(`package.json: ${errorMessage(error)}`);
  }
  const tools = errors.length ? [] : await discoverPiExtensionHostTools({
    packageRoot: rootPath,
    entrypoint: source.entrypoint,
    allowedNetworkHosts: source.allowedNetworkHosts,
  }).catch((error) => {
    errors.push(`host: ${errorMessage(error)}`);
    return [];
  });
  const name = source.packageName || pkgJson?.name || "pi-extension";
  return {
    id: `ambient-pi-extension:${source.resolvedSource}:${source.packagePath}:${source.sha}:${name}`,
    name,
    ...(source.version || pkgJson?.version ? { version: source.version ?? pkgJson?.version } : {}),
    ...(pkgJson?.description ? { description: pkgJson.description } : {}),
    source: source.source,
    resolvedSource: source.resolvedSource,
    packagePath: source.packagePath,
    sha: source.sha,
    rootPath,
    entrypoint: source.entrypoint,
    allowedNetworkHosts: source.allowedNetworkHosts,
    tools,
    installed,
    errors,
  };
}

async function resolvePiExtensionSource(input: PiExtensionSandboxInstallInput): Promise<ResolvedPiExtensionSource> {
  const source = input.source.trim();
  const localPath = await localPiExtensionSourcePath(source);
  if (localPath) return resolveLocalPiExtensionSource(source, localPath, input.allowedNetworkHosts);
  const npmPackageName = piCatalogNpmPackageName(source);
  const metadata = await fetchNpmPackageMetadata(npmPackageName);
  const latest = metadata["dist-tags"]?.latest;
  if (typeof latest !== "string" || !latest) throw new Error(`npm package "${npmPackageName}" does not declare a latest version.`);
  const version = metadata.versions?.[latest];
  if (!version) throw new Error(`npm package "${npmPackageName}" metadata is missing version "${latest}".`);
  const repository = normalizeNpmRepository(version.repository ?? metadata.repository);
  const tarball = typeof version.dist?.tarball === "string" ? version.dist.tarball : undefined;
  if (!repository.url && !tarball) throw new Error(`npm package "${npmPackageName}" does not declare a Git repository or tarball.`);
  const resolvedSource = repository.url && repository.directory ? repository.url : tarball;
  if (!resolvedSource) throw new Error(`npm package "${npmPackageName}" does not declare an inspectable package source.`);
  const packagePath = repository.url && repository.directory ? repository.directory : ".";
  const sha = typeof version.gitHead === "string" && version.gitHead.trim()
    ? version.gitHead.trim()
    : version.dist?.integrity || version.dist?.shasum || (repository.url ? await resolveGitHead(repository.url) : latest);
  const allowedNetworkHosts = normalizeAllowedHosts(input.allowedNetworkHosts ?? inferredAllowedNetworkHosts(npmPackageName));
  const rawEntrypoint = await withResolvedPiExtensionPackage(
    {
      source,
      resolvedSource,
      packagePath,
      sha,
      packageName: npmPackageName,
      version: latest,
      entrypoint: "index.ts",
      allowedNetworkHosts,
    },
    async (packageRoot) => {
      const pkg = packageJsonSchema.parse(await readJson(join(packageRoot, "package.json")));
      const extension = pkg.pi?.extensions?.[0];
      if (!extension) throw new Error(`npm package "${npmPackageName}" does not declare pi.extensions.`);
      return extension;
    },
  );
  const entrypoint = await withResolvedPiExtensionPackage(
    {
      source,
      resolvedSource,
      packagePath,
      sha,
      packageName: npmPackageName,
      version: latest,
      entrypoint: rawEntrypoint,
      allowedNetworkHosts,
    },
    (packageRoot) => resolveExtensionEntrypoint(packageRoot, rawEntrypoint),
  );
  return {
    source,
    resolvedSource,
    packagePath,
    sha,
    packageName: npmPackageName,
    version: latest,
    entrypoint,
    allowedNetworkHosts,
  };
}

async function resolveLocalPiExtensionSource(source: string, localPath: string, allowedNetworkHosts?: string[]): Promise<ResolvedPiExtensionSource> {
  const localStat = await stat(localPath);
  if (!localStat.isDirectory()) throw new Error(`Local Pi extension source is not a directory: ${localPath}`);
  const pkg = packageJsonSchema.parse(await readJson(join(localPath, "package.json")));
  const packageName = pkg.name?.trim() || "local-pi-extension";
  const extension = pkg.pi?.extensions?.[0];
  if (!extension) throw new Error(`Local Pi extension package "${packageName}" does not declare pi.extensions.`);
  const entrypoint = await resolveExtensionEntrypoint(localPath, extension);
  return {
    source,
    resolvedSource: pathToFileURL(localPath).href,
    packagePath: ".",
    sha: await hashDirectory(localPath),
    packageName,
    ...(pkg.version ? { version: pkg.version } : {}),
    entrypoint,
    allowedNetworkHosts: normalizeAllowedHosts(allowedNetworkHosts ?? inferredAllowedNetworkHosts(packageName)),
  };
}

async function withResolvedPiExtensionPackage<T>(input: ResolvedPiExtensionSource, action: (packageRoot: string) => Promise<T>): Promise<T> {
  if (input.resolvedSource.startsWith("file://")) {
    const rootPath = fileURLToPath(input.resolvedSource);
    const packageRoot = resolve(rootPath, input.packagePath);
    if (!isPathInside(rootPath, packageRoot)) throw new Error("Pi extension package path resolves outside the local source directory.");
    return action(packageRoot);
  }
  if (isTarballSource(input.resolvedSource)) {
    const tempRoot = await mkdtemp(join(tmpdir(), "ambient-pi-extension-tarball-"));
    try {
      const tarballPath = join(tempRoot, "package.tgz");
      const extractRoot = join(tempRoot, "extract");
      await mkdir(extractRoot, { recursive: true });
      const response = await fetch(input.resolvedSource);
      if (!response.ok) throw new Error(`Failed to download Pi extension package tarball: HTTP ${response.status}.`);
      await writeFile(tarballPath, Buffer.from(await response.arrayBuffer()));
      await execFileAsync("tar", ["-xzf", tarballPath, "-C", extractRoot], { timeout: 30_000, maxBuffer: 1024 * 1024 });
      const packageRoot = resolve(extractRoot, "package", input.packagePath);
      if (!isPathInside(extractRoot, packageRoot)) throw new Error("Pi extension package path resolves outside the extracted tarball.");
      return await action(packageRoot);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
  const tempRoot = await mkdtemp(join(tmpdir(), "ambient-pi-extension-git-"));
  try {
    const repoPath = join(tempRoot, "repo");
    await execFileAsync("git", ["clone", "--quiet", input.resolvedSource, repoPath], {
      cwd: tempRoot,
      timeout: 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 1024 * 1024,
    });
    await execFileAsync("git", ["-C", repoPath, "checkout", "--quiet", input.sha], {
      cwd: tempRoot,
      timeout: 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 1024 * 1024,
    });
    await verifyGitCheckoutSha(repoPath, input.sha);
    const packageRoot = resolve(repoPath, input.packagePath);
    if (!isPathInside(repoPath, packageRoot)) throw new Error("Pi extension package path resolves outside the cloned repository.");
    return await action(packageRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function isTarballSource(source: string): boolean {
  return /^https?:\/\//i.test(source) && (/\.t(?:ar\.)?gz(?:[?#].*)?$/i.test(source) || source.includes("registry.npmjs.org/"));
}

async function resolveExtensionEntrypoint(packageRoot: string, rawEntrypoint: string): Promise<string> {
  const normalized = rawEntrypoint.replace(/^\.\//, "");
  const candidate = resolve(packageRoot, normalized);
  if (!isPathInside(packageRoot, candidate)) throw new Error("Pi extension entrypoint resolves outside the package root.");
  const candidateStat = await stat(candidate);
  if (candidateStat.isFile()) return normalized;
  if (!candidateStat.isDirectory()) throw new Error(`Pi extension entrypoint is not a file or directory: ${rawEntrypoint}`);
  for (const name of ["index.ts", "index.js", "main.ts", "main.js"]) {
    const indexPath = join(candidate, name);
    if (existsSync(indexPath)) return join(normalized, name).split(sep).join("/");
  }
  const files = (await readdir(candidate, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 1) return join(normalized, files[0]).split(sep).join("/");
  throw new Error(`Pi extension directory "${rawEntrypoint}" does not contain a single supported entrypoint file.`);
}

async function localPiExtensionSourcePath(source: string): Promise<string | undefined> {
  if (!source) return undefined;
  if (source.startsWith("file://")) return fileURLToPath(source);
  if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../")) {
    const candidate = resolve(source);
    try {
      const candidateStat = await stat(candidate);
      return candidateStat.isDirectory() ? candidate : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function hashDirectory(rootPath: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(currentPath: string) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = join(currentPath, entry.name);
      const relPath = relative(rootPath, fullPath).split(sep).join("/");
      hash.update(entry.isDirectory() ? `dir:${relPath}\0` : `file:${relPath}\0`);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        hash.update(await readFile(fullPath));
        hash.update("\0");
      }
    }
  }
  await visit(rootPath);
  return hash.digest("hex");
}

function piCatalogNpmPackageName(source: string): string {
  if (!source) throw new Error("Pi extension package source is required.");
  if (source.startsWith("npm:")) return source.slice("npm:".length).trim();
  try {
    const url = new URL(source);
    if (url.hostname === "pi.dev" && url.pathname.startsWith("/packages/")) {
      const packageName = url.pathname.split("/").filter(Boolean)[1];
      if (packageName) return packageName;
    }
  } catch {
    // Bare npm package support.
  }
  return source;
}

async function fetchNpmPackageMetadata(packageName: string): Promise<any> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  if (!response.ok) throw new Error(`Failed to fetch npm metadata for "${packageName}": HTTP ${response.status}.`);
  return response.json();
}

function normalizeNpmRepository(value: unknown): { url?: string; directory?: string } {
  if (typeof value === "string") return { url: normalizeGitUrl(value) };
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.url === "string" ? { url: normalizeGitUrl(record.url) } : {}),
    ...(typeof record.directory === "string" ? { directory: record.directory } : {}),
  };
}

function normalizeGitUrl(value: string): string {
  return value
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

async function resolveGitHead(source: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["ls-remote", source, "HEAD"], {
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 1024 * 1024,
  });
  const sha = String(stdout).trim().split(/\s+/)[0];
  if (!sha) throw new Error(`Unable to resolve Git HEAD for ${source}.`);
  return sha;
}

async function verifyGitCheckoutSha(repoPath: string, expectedSha: string): Promise<void> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 1024 * 1024,
  });
  const actualSha = String(stdout).trim();
  if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error(`Pi extension sandbox Git checkout SHA mismatch: expected ${expectedSha}, got ${actualSha}.`);
  }
}

async function upsertSandboxConfig(workspacePath: string, entry: SandboxConfigEntry): Promise<void> {
  const managedWorkspace = await ensurePiExtensionSandboxManagedWorkspace(workspacePath);
  const configPath = join(managedWorkspace, sandboxConfigPath);
  await mkdir(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? sandboxConfigSchema.parse(await readJson(configPath)) : { packages: [], history: [] };
  const id = `ambient-pi-extension:${entry.resolvedSource}:${entry.packagePath}:${entry.sha}:${entry.packageName}`;
  const packages = [
    ...existing.packages.filter(
      (candidate) =>
        candidate.resolvedSource !== entry.resolvedSource ||
        candidate.packagePath !== entry.packagePath ||
        candidate.sha !== entry.sha ||
        candidate.packageName !== entry.packageName,
    ),
    entry,
  ];
  await writeFile(configPath, `${JSON.stringify({ packages, history: existing.history.filter((item) => item.id !== id) }, null, 2)}\n`, "utf8");
}

function normalizeAllowedHosts(hosts: string[]): string[] {
  return [...new Set(hosts.map((host) => host.trim().toLowerCase()).filter(Boolean))].sort();
}

function inferredAllowedNetworkHosts(packageName: string): string[] {
  if (packageName === "pi-arxiv") return ["export.arxiv.org"];
  return [];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "pi-extension";
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
