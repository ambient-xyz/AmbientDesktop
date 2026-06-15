import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { isPathInside } from "./sessionPaths";
import { managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "./managedInstallPaths";

const execFileAsync = promisify(execFile);
const privilegedConfigPath = ".ambient/pi-privileged-installs/packages.json";
const privilegedImportRoot = ".ambient/pi-privileged-installs/imported";

const packageJsonSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    license: z.string().optional(),
    repository: z.unknown().optional(),
    bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
    pi: z
      .object({
        extensions: z.array(z.string()).optional(),
        skills: z.array(z.string()).optional(),
        prompts: z.array(z.string()).optional(),
        themes: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const privilegedConfigSchema = z.object({
  packages: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.string().min(1),
        packageName: z.string().min(1),
        version: z.string().optional(),
        installedSource: z.string().min(1),
        status: z.enum(["disabled", "active", "removal_failed"]).default("disabled"),
        installedAt: z.string().min(1),
        disabledAt: z.string().optional(),
        scan: z.unknown(),
      }),
    )
    .default([]),
  history: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.string().min(1),
        packageName: z.string().min(1),
        version: z.string().optional(),
        rootPath: z.string().min(1),
        status: z.enum(["disabled", "active", "removal_failed"]).default("disabled"),
        installedAt: z.string().min(1),
        disabledAt: z.string().optional(),
        scan: z.unknown(),
        removedAt: z.string().min(1),
        manualCleanup: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export interface PiPrivilegedSecurityFinding {
  severity: "info" | "warning" | "high";
  category: string;
  message: string;
  files: string[];
}

export interface PiPrivilegedSecurityScan {
  source: string;
  scanOrigin: "explicit" | "sandbox-fallback";
  packageName: string;
  version?: string;
  description?: string;
  license?: string;
  repositoryUrl?: string;
  npmTarball?: string;
  integrity?: string;
  shasum?: string;
  fingerprint: string;
  resources: {
    piExtensions: string[];
    piSkills: string[];
    piPrompts: string[];
    piThemes: string[];
    bins: string[];
    mcpServers: string[];
    hookConfigs: string[];
  };
  riskSummary: {
    lifecycleHooks: boolean;
    commands: boolean;
    mcpServers: boolean;
    hostConfigMutation: boolean;
    filesystemWrites: boolean;
    homeDirectoryAccess: boolean;
    processExecution: boolean;
    network: boolean;
    envOrSecrets: boolean;
    nativeDependencies: boolean;
    installScripts: boolean;
    dynamicCode: boolean;
  };
  findings: PiPrivilegedSecurityFinding[];
  recommendation: "sandboxed-tool-supported" | "privileged-review-required";
  caveat: string;
}

export interface PiPrivilegedInstallSummary {
  id: string;
  source: string;
  packageName: string;
  version?: string;
  rootPath: string;
  status: "disabled" | "active" | "removal_failed";
  installedAt: string;
  disabledAt?: string;
  scan: PiPrivilegedSecurityScan;
}

export interface PiPrivilegedInstallHistoryEntry extends PiPrivilegedInstallSummary {
  removedAt: string;
  manualCleanup: string[];
}

export interface PiPrivilegedCatalog {
  packages: PiPrivilegedInstallSummary[];
  history: PiPrivilegedInstallHistoryEntry[];
  errors: string[];
}

export interface PiPrivilegedPackageSelector {
  packageId?: string;
  packageName?: string;
}

interface ResolvedPrivilegedSource {
  source: string;
  scanOrigin: "explicit" | "sandbox-fallback";
  packageName: string;
  version?: string;
  tarball?: string;
  integrity?: string;
  shasum?: string;
}

async function ensurePiPrivilegedManagedWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, ".ambient/pi-privileged-installs");
  return managedInstallWorkspacePath(workspacePath);
}

export async function scanPiPrivilegedPackage(input: { source: string; scanOrigin?: "explicit" | "sandbox-fallback" }): Promise<PiPrivilegedSecurityScan> {
  const resolved = await resolvePrivilegedSource(input.source);
  resolved.scanOrigin = input.scanOrigin ?? "explicit";
  return withPreparedPrivilegedPackage(resolved, async (packageRoot) => scanPreparedPackage(resolved, packageRoot));
}

export async function installPiPrivilegedPackage(workspacePath: string, input: { source: string; scanOrigin?: "explicit" | "sandbox-fallback" }): Promise<PiPrivilegedInstallSummary> {
  const resolved = await resolvePrivilegedSource(input.source);
  resolved.scanOrigin = input.scanOrigin ?? "explicit";
  const managedWorkspace = await ensurePiPrivilegedManagedWorkspace(workspacePath);
  return withPreparedPrivilegedPackage(resolved, async (packageRoot) => {
    const scan = await scanPreparedPackage(resolved, packageRoot);
    const importName = safeName(`${scan.packageName}-${scan.version ?? "pkg"}-${scan.fingerprint.slice(0, 12)}`);
    const destination = resolve(managedWorkspace, privilegedImportRoot, importName);
    if (!isPathInside(managedWorkspace, destination)) throw new Error("Resolved privileged Pi install path is outside Ambient-managed install state.");
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    await cp(packageRoot, destination, { recursive: true, force: true, dereference: false });
    const now = new Date().toISOString();
    const id = `ambient-pi-privileged:${scan.packageName}:${scan.fingerprint}`;
    const record = {
      id,
      source: input.source.trim(),
      packageName: scan.packageName,
      ...(scan.version ? { version: scan.version } : {}),
      installedSource: `./${relative(managedWorkspace, destination).split(sep).join("/")}`,
      status: "disabled" as const,
      installedAt: now,
      disabledAt: now,
      scan,
    };
    await upsertPrivilegedConfig(workspacePath, record);
    return {
      id,
      source: record.source,
      packageName: record.packageName,
      ...(record.version ? { version: record.version } : {}),
      rootPath: destination,
      status: record.status,
      installedAt: record.installedAt,
      disabledAt: record.disabledAt,
      scan,
    };
  });
}

export async function discoverPiPrivilegedPackages(workspacePath: string): Promise<PiPrivilegedCatalog> {
  const managedWorkspace = await ensurePiPrivilegedManagedWorkspace(workspacePath);
  const configPath = join(managedWorkspace, privilegedConfigPath);
  if (!existsSync(configPath)) return { packages: [], history: [], errors: [] };
  try {
    const config = privilegedConfigSchema.parse(await readJson(configPath));
    return {
      packages: config.packages.map((record) => ({
        id: record.id,
        source: record.source,
        packageName: record.packageName,
        ...(record.version ? { version: record.version } : {}),
        rootPath: resolve(managedWorkspace, record.installedSource),
        status: record.status,
        installedAt: record.installedAt,
        ...(record.disabledAt ? { disabledAt: record.disabledAt } : {}),
        scan: record.scan as PiPrivilegedSecurityScan,
      })),
      history: config.history
        .map((record) => ({
          id: record.id,
          source: record.source,
          packageName: record.packageName,
          ...(record.version ? { version: record.version } : {}),
          rootPath: record.rootPath,
          status: record.status,
          installedAt: record.installedAt,
          ...(record.disabledAt ? { disabledAt: record.disabledAt } : {}),
          scan: record.scan as PiPrivilegedSecurityScan,
          removedAt: record.removedAt,
          manualCleanup: record.manualCleanup,
        }))
        .sort((left, right) => right.removedAt.localeCompare(left.removedAt)),
      errors: [],
    };
  } catch (error) {
    return { packages: [], history: [], errors: [`Privileged Pi install config: ${errorMessage(error)}`] };
  }
}

export async function disablePiPrivilegedPackage(workspacePath: string, input: PiPrivilegedPackageSelector): Promise<PiPrivilegedInstallSummary> {
  const config = await readPrivilegedConfig(workspacePath);
  const selected = selectConfigRecord(config.packages, input);
  selected.status = "disabled";
  selected.disabledAt = new Date().toISOString();
  await writePrivilegedConfig(workspacePath, config);
  return selectPiPrivilegedPackage((await discoverPiPrivilegedPackages(workspacePath)).packages, { packageId: selected.id });
}

export async function uninstallPiPrivilegedPackage(
  workspacePath: string,
  input: PiPrivilegedPackageSelector & { deleteData?: boolean },
): Promise<{ removed: PiPrivilegedInstallSummary; catalog: PiPrivilegedCatalog; manualCleanup: string[] }> {
  const config = await readPrivilegedConfig(workspacePath);
  const selected = selectConfigRecord(config.packages, input);
  const catalog = await discoverPiPrivilegedPackages(workspacePath);
  const removed = selectPiPrivilegedPackage(catalog.packages, { packageId: selected.id });
  const manualCleanup = input.deleteData
    ? [
        "No privileged runtime activation has been implemented yet, so Ambient has no manifest-owned extension data directory to delete.",
        "If the package was also installed directly through Pi or another host, remove those external changes separately.",
      ]
    : ["Extension data was kept. No privileged runtime activation has created Ambient-owned data yet."];
  const next = {
    packages: config.packages.filter((record) => record.id !== selected.id),
    history: [
      {
        ...removed,
        removedAt: new Date().toISOString(),
        manualCleanup,
      },
      ...config.history.filter((record) => record.id !== removed.id),
    ].slice(0, 50),
  };
  await writePrivilegedConfig(workspacePath, next);
  const importRoot = resolve(managedInstallWorkspacePath(workspacePath), privilegedImportRoot);
  if (isPathInside(importRoot, removed.rootPath)) await rm(removed.rootPath, { recursive: true, force: true });
  return { removed, catalog: await discoverPiPrivilegedPackages(workspacePath), manualCleanup };
}

export async function clearPiPrivilegedPackageHistory(workspacePath: string): Promise<PiPrivilegedCatalog> {
  const config = await readPrivilegedConfig(workspacePath);
  await writePrivilegedConfig(workspacePath, { packages: config.packages, history: [] });
  return discoverPiPrivilegedPackages(workspacePath);
}

export function selectPiPrivilegedPackage(packages: PiPrivilegedInstallSummary[], selector: PiPrivilegedPackageSelector): PiPrivilegedInstallSummary {
  if (selector.packageId) {
    const match = packages.find((pkg) => pkg.id === selector.packageId);
    if (!match) throw new Error(`Privileged Pi install "${selector.packageId}" was not found.`);
    return match;
  }
  if (selector.packageName) {
    const matches = packages.filter((pkg) => pkg.packageName === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Privileged Pi package name "${selector.packageName}" matched multiple installs. Specify packageId.`);
    throw new Error(`Privileged Pi install "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

async function resolvePrivilegedSource(source: string): Promise<ResolvedPrivilegedSource> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("Privileged Pi package source is required.");
  if (trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("file://")) {
    const path = trimmed.startsWith("file://") ? fileURLToPath(trimmed) : resolve(trimmed);
    const pkg = packageJsonSchema.parse(await readJson(join(path, "package.json")));
    return { source: path, scanOrigin: "explicit", packageName: pkg.name ?? "pi-package", ...(pkg.version ? { version: pkg.version } : {}) };
  }
  const packageName = piCatalogNpmPackageName(trimmed);
  const metadata = await fetchNpmPackageMetadata(packageName);
  const latest = metadata["dist-tags"]?.latest;
  if (typeof latest !== "string" || !latest) throw new Error(`npm package "${packageName}" does not declare a latest version.`);
  const version = metadata.versions?.[latest];
  if (!version) throw new Error(`npm package "${packageName}" metadata is missing version "${latest}".`);
  const tarball = version.dist?.tarball;
  if (typeof tarball !== "string" || !tarball) throw new Error(`npm package "${packageName}" does not declare a tarball.`);
  return {
    source: trimmed,
    scanOrigin: "explicit",
    packageName,
    version: latest,
    tarball,
    ...(typeof version.dist?.integrity === "string" ? { integrity: version.dist.integrity } : {}),
    ...(typeof version.dist?.shasum === "string" ? { shasum: version.dist.shasum } : {}),
  };
}

async function withPreparedPrivilegedPackage<T>(resolved: ResolvedPrivilegedSource, action: (packageRoot: string) => Promise<T>): Promise<T> {
  if (!resolved.tarball) return action(resolved.source);
  const tempRoot = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-"));
  try {
    const tarballPath = join(tempRoot, "package.tgz");
    const response = await fetch(resolved.tarball);
    if (!response.ok) throw new Error(`Failed to download npm tarball for "${resolved.packageName}": HTTP ${response.status}.`);
    await writeFile(tarballPath, Buffer.from(await response.arrayBuffer()));
    const extractRoot = join(tempRoot, "extract");
    await mkdir(extractRoot, { recursive: true });
    await execFileAsync("tar", ["-xzf", tarballPath, "-C", extractRoot], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return await action(join(extractRoot, "package"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function scanPreparedPackage(resolved: ResolvedPrivilegedSource, packageRoot: string): Promise<PiPrivilegedSecurityScan> {
  const pkg = packageJsonSchema.parse(await readJson(join(packageRoot, "package.json")));
  const files = await listFiles(packageRoot);
  const textFiles = await readTextFiles(packageRoot, files);
  const piExtensions = pkg.pi?.extensions ?? [];
  const piSkills = pkg.pi?.skills ?? [];
  const piPrompts = pkg.pi?.prompts ?? [];
  const piThemes = pkg.pi?.themes ?? [];
  const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {}).map(String);
  const mcpServers = await mcpServerNames(packageRoot);
  const hookConfigs = files.filter((file) => /(^|[/\\])(hooks\.json|config\.toml|mcp\.json|\.mcp\.json)$/i.test(file) || /(^|[/\\])hooks[/\\]/i.test(file));
  const combined = textFiles.map((file) => `${file.path}\n${file.content}`).join("\n");
  const extensionText = await extensionSourceText(packageRoot, piExtensions);
  const lifecycleHooks = piExtensions.length > 0 || /\bpi\.on\s*\(/.test(extensionText) || /\bpi\.on\s*\(/.test(combined);
  const commands = bins.length > 0 || /\bregisterCommand\s*\(/.test(extensionText) || /\bregisterCommand\s*\(/.test(combined);
  const hasMcpConfig = mcpServers.length > 0 || files.some((file) => /(^|\/)(\.mcp\.json|mcp\.json)$/i.test(file));
  const hasHostConfig = hookConfigs.length > 0 || files.some((file) => /(^|\/)(hooks\.json|config\.toml|settings\.json)$/i.test(file));
  const nativeDependencies = Boolean(pkg.optionalDependencies?.["better-sqlite3"] || pkg.dependencies?.["better-sqlite3"] || /better-sqlite3|sqlite|fts5/i.test(combined));
  const riskSummary = {
    lifecycleHooks,
    commands,
    mcpServers: hasMcpConfig,
    hostConfigMutation: hasHostConfig || /\.pi\/settings|\.codex|\.claude|hooks\.json|mcp\.json|settings\.json|installed_plugins\.json|config\.toml/i.test(combined),
    filesystemWrites: /\b(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rmSync|unlink|unlinkSync|chmod|chmodSync|cpSync)\b/.test(combined),
    homeDirectoryAccess: /\bhomedir\s*\(|process\.env\.HOME|process\.env\.USERPROFILE|~\/|\.claude|\.codex|\.pi/i.test(combined),
    processExecution: /\b(child_process|execSync|execFileSync|execFile|spawn\s*\(|spawnSync)\b/.test(combined),
    network: /\b(fetch\s*\(|http\.request|https\.request|WebSocket|curl\s|wget\s|npm install)\b/i.test(combined),
    envOrSecrets: /\bprocess\.env|api[-_]?key|secret|token|authorization|cookie\b/i.test(combined),
    nativeDependencies,
    installScripts: Boolean(pkg.scripts?.postinstall || pkg.scripts?.install || pkg.scripts?.preinstall),
    dynamicCode: /\beval\s*\(|new Function|Function\s*\(|import\s*\(/.test(combined),
  };
  const findings = findingsFromRiskSummary(riskSummary, {
    lifecycleHooks: piExtensions,
    commands: [...piExtensions, ...bins],
    mcpServers: files.filter((file) => /mcp/i.test(file)),
    hostConfigMutation: hookConfigs,
    filesystemWrites: matchingFiles(textFiles, /\b(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rmSync|unlink|unlinkSync|chmod|chmodSync|cpSync)\b/),
    homeDirectoryAccess: matchingFiles(textFiles, /\bhomedir\s*\(|process\.env\.HOME|process\.env\.USERPROFILE|~\/|\.claude|\.codex|\.pi/i),
    processExecution: matchingFiles(textFiles, /\b(child_process|execSync|execFileSync|execFile|spawn\s*\(|spawnSync)\b/),
    network: matchingFiles(textFiles, /\b(fetch\s*\(|http\.request|https\.request|WebSocket|curl\s|wget\s|npm install)\b/i),
    envOrSecrets: matchingFiles(textFiles, /\bprocess\.env|api[-_]?key|secret|token|authorization|cookie\b/i),
    nativeDependencies: ["package.json"],
    installScripts: ["package.json"],
    dynamicCode: matchingFiles(textFiles, /\beval\s*\(|new Function|Function\s*\(|import\s*\(/),
  });
  const fingerprint = createHash("sha256")
    .update([resolved.source, resolved.version ?? "", resolved.integrity ?? "", resolved.shasum ?? "", JSON.stringify(pkg.pi ?? {}), JSON.stringify(riskSummary)].join("\n"))
    .digest("hex");
  return {
    source: resolved.source,
    scanOrigin: resolved.scanOrigin,
    packageName: pkg.name ?? resolved.packageName,
    ...(pkg.version ?? resolved.version ? { version: pkg.version ?? resolved.version } : {}),
    ...(pkg.description ? { description: pkg.description } : {}),
    ...(pkg.license ? { license: pkg.license } : {}),
    ...(normalizeRepository(pkg.repository) ? { repositoryUrl: normalizeRepository(pkg.repository) } : {}),
    ...(resolved.tarball ? { npmTarball: resolved.tarball } : {}),
    ...(resolved.integrity ? { integrity: resolved.integrity } : {}),
    ...(resolved.shasum ? { shasum: resolved.shasum } : {}),
    fingerprint,
    resources: { piExtensions, piSkills, piPrompts, piThemes, bins, mcpServers, hookConfigs },
    riskSummary,
    findings,
    recommendation: Object.values(riskSummary).some(Boolean) ? "privileged-review-required" : "sandboxed-tool-supported",
    caveat: "This scan is heuristic. It reduces obvious risk; it does not prove the package is safe.",
  };
}

function findingsFromRiskSummary(risk: PiPrivilegedSecurityScan["riskSummary"], files: Record<keyof PiPrivilegedSecurityScan["riskSummary"], string[]>): PiPrivilegedSecurityFinding[] {
  const labels: Record<keyof PiPrivilegedSecurityScan["riskSummary"], [PiPrivilegedSecurityFinding["severity"], string, string]> = {
    lifecycleHooks: ["high", "lifecycle-hooks", "Registers Pi lifecycle hooks that can alter agent behavior across the session."],
    commands: ["warning", "commands", "Registers slash or extension commands."],
    mcpServers: ["high", "mcp", "Declares or configures MCP server behavior."],
    hostConfigMutation: ["high", "host-config", "Appears to edit host application configuration or hook files."],
    filesystemWrites: ["high", "filesystem", "Performs filesystem writes or permission changes."],
    homeDirectoryAccess: ["high", "home-directory", "References user home or host configuration directories."],
    processExecution: ["high", "process", "Runs subprocesses or shell commands."],
    network: ["warning", "network", "Performs network access or package installation."],
    envOrSecrets: ["warning", "env-secrets", "References environment variables or secret-like values."],
    nativeDependencies: ["warning", "native-deps", "Uses native dependencies such as SQLite bindings."],
    installScripts: ["high", "install-scripts", "Declares npm install lifecycle scripts."],
    dynamicCode: ["warning", "dynamic-code", "Uses dynamic import or code generation patterns."],
  };
  return (Object.keys(risk) as Array<keyof typeof risk>)
    .filter((key) => risk[key])
    .map((key) => {
      const [severity, category, message] = labels[key];
      return { severity, category, message, files: [...new Set(files[key])].slice(0, 12) };
    });
}

async function readPrivilegedConfig(workspacePath: string): Promise<z.infer<typeof privilegedConfigSchema>> {
  const managedWorkspace = await ensurePiPrivilegedManagedWorkspace(workspacePath);
  const configPath = join(managedWorkspace, privilegedConfigPath);
  if (!existsSync(configPath)) return { packages: [], history: [] };
  return privilegedConfigSchema.parse(await readJson(configPath));
}

async function upsertPrivilegedConfig(workspacePath: string, record: z.infer<typeof privilegedConfigSchema>["packages"][number]): Promise<void> {
  const config = await readPrivilegedConfig(workspacePath);
  await writePrivilegedConfig(workspacePath, {
    packages: [...config.packages.filter((item) => item.id !== record.id), record],
    history: config.history.filter((item) => item.id !== record.id),
  });
}

async function writePrivilegedConfig(workspacePath: string, config: z.infer<typeof privilegedConfigSchema>): Promise<void> {
  const managedWorkspace = await ensurePiPrivilegedManagedWorkspace(workspacePath);
  const configPath = join(managedWorkspace, privilegedConfigPath);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function selectConfigRecord(records: z.infer<typeof privilegedConfigSchema>["packages"], selector: PiPrivilegedPackageSelector) {
  if (selector.packageId) {
    const match = records.find((record) => record.id === selector.packageId);
    if (!match) throw new Error(`Privileged Pi install "${selector.packageId}" was not found.`);
    return match;
  }
  if (selector.packageName) {
    const matches = records.filter((record) => record.packageName === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Privileged Pi package name "${selector.packageName}" matched multiple installs. Specify packageId.`);
    throw new Error(`Privileged Pi install "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

async function listFiles(root: string, dir = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      files.push(...await listFiles(root, full));
    } else if (entry.isFile()) {
      files.push(relative(root, full).split(sep).join("/"));
    }
  }
  return files.sort();
}

async function readTextFiles(root: string, files: string[]): Promise<Array<{ path: string; content: string }>> {
  const textFiles: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    if (!/\.(json|toml|md|js|mjs|cjs|ts|tsx|jsx|sh|py|yaml|yml|txt)$/i.test(file) && !/(^|\/)(package|start|cli|hooks?|config|settings|SKILL|AGENTS|CLAUDE|GEMINI|QWEN)(\.|$)/i.test(file)) {
      continue;
    }
    try {
      const content = await readFile(join(root, file), "utf8");
      if (!content.includes("\0")) textFiles.push({ path: file, content: content.slice(0, 250_000) });
    } catch {
      // Ignore unreadable package files during advisory scan.
    }
  }
  return textFiles;
}

async function extensionSourceText(root: string, extensions: string[]): Promise<string> {
  const parts: string[] = [];
  for (const extension of extensions) {
    const normalized = extension.replace(/^\.\//, "").replace(/^\/+/, "");
    const candidates = [...new Set([resolve(root, extension), join(root, normalized)])];
    try {
      for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        parts.push(await readFile(candidate, "utf8"));
        break;
      }
    } catch {
      // Missing extensions are reported through package behavior later; scan remains best effort.
    }
  }
  return parts.join("\n");
}

async function mcpServerNames(root: string): Promise<string[]> {
  const candidates = [".mcp.json", "mcp.json", "configs/codex/config.toml"];
  const names = new Set<string>();
  for (const candidate of candidates) {
    const full = join(root, candidate);
    if (!existsSync(full)) continue;
    try {
      const text = await readFile(full, "utf8");
      if (candidate.endsWith(".json")) {
        const parsed = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
        for (const name of Object.keys(parsed.mcpServers ?? {})) names.add(name);
      }
      for (const match of text.matchAll(/"([^"]+)"\s*:\s*\{|\[mcp_servers\.([^\]]+)\]/g)) {
        const name = match[1] ?? match[2];
        if (name && name !== "mcpServers") names.add(name);
      }
    } catch {
      // Advisory only.
    }
  }
  return [...names].sort();
}

function matchingFiles(files: Array<{ path: string; content: string }>, pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(file.content)).map((file) => file.path);
}

function piCatalogNpmPackageName(source: string): string {
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

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function normalizeRepository(value: unknown): string | undefined {
  if (typeof value === "string") return value.replace(/^git\+/, "").replace(/\.git$/, "");
  if (!value || typeof value !== "object") return undefined;
  const url = (value as Record<string, unknown>).url;
  return typeof url === "string" ? url.replace(/^git\+/, "").replace(/\.git$/, "") : undefined;
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "pi-privileged";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
