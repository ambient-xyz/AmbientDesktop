import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { release as osRelease } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SetupRuntimePackageManagerChoice = "auto" | "npm" | "pnpm" | "yarn" | "bun";

export interface SetupRuntimePreflightInput {
  workspacePath: string;
  packageManager?: SetupRuntimePackageManagerChoice;
}

export interface SetupRuntimeCommandInput {
  cwd: string;
  command: string;
  args: string[];
  timeoutMs: number;
}

export interface SetupRuntimeCommandResult {
  ok: boolean;
  stdout: string;
  stderr?: string;
  exitCode?: number;
}

export type SetupRuntimeCommandRunner = (input: SetupRuntimeCommandInput) => Promise<SetupRuntimeCommandResult>;

export interface SetupRuntimePackageMetadata {
  packageManager?: string;
  lockfiles: string[];
  nativeDependencySignals: string[];
  nativeScriptSignals: string[];
  packageJsonFound: boolean;
}

export interface SetupRuntimeNodeProbe {
  available: boolean;
  command: string;
  version?: string;
  platform?: string;
  arch?: string;
  execPath?: string;
  modules?: string;
  error?: string;
}

export interface SetupRuntimePackageManagerProbe {
  name: "npm" | "pnpm" | "yarn" | "bun";
  requested: boolean;
  inferredFrom: string[];
  available: boolean;
  path?: string;
  version?: string;
  binaryKind?: "native-binary" | "script-or-shim" | "unknown";
  architecture?: string;
  fileDescription?: string;
  error?: string;
}

export interface SetupRuntimePreflightWarning {
  code:
    | "missing-package-manager"
    | "multiple-lockfiles"
    | "mixed-architecture"
    | "native-dependencies"
    | "native-dependencies-with-unknown-runtime"
    | "package-manager-architecture-unknown";
  severity: "info" | "warning" | "blocker";
  message: string;
}

export interface SetupRuntimePreflightResult {
  workspacePath: string;
  host: {
    platform: NodeJS.Platform;
    processArch: string;
    machineArch?: string;
    release: string;
  };
  ambientProcess: {
    execPath: string;
    nodeVersion: string;
    arch: string;
    platform: string;
    electronVersion?: string;
    modules?: string;
  };
  shell: {
    path?: string;
  };
  packageMetadata: SetupRuntimePackageMetadata;
  projectNode: SetupRuntimeNodeProbe;
  packageManagers: SetupRuntimePackageManagerProbe[];
  selectedPackageManager?: SetupRuntimePackageManagerProbe;
  warnings: SetupRuntimePreflightWarning[];
}

interface PackageJsonShape {
  packageManager?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  scripts?: Record<string, unknown>;
}

const packageManagers = ["pnpm", "npm", "yarn", "bun"] as const;
const lockfileManagers: Array<{ file: string; manager: SetupRuntimePackageManagerProbe["name"] }> = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "package-lock.json", manager: "npm" },
  { file: "npm-shrinkwrap.json", manager: "npm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "bun.lock", manager: "bun" },
  { file: "bun.lockb", manager: "bun" },
];
const nativeDependencyNames = [
  "@esbuild/",
  "@rollup/rollup-",
  "@swc/core",
  "better-sqlite3",
  "canvas",
  "electron",
  "esbuild",
  "node-gyp",
  "node-pty",
  "playwright",
  "puppeteer",
  "sharp",
  "sqlite3",
];
const nativeScriptPatterns = [
  /electron-rebuild/i,
  /\bnode-gyp\b/i,
  /\bprebuild(?:-install)?\b/i,
  /\bnode-pre-gyp\b/i,
];

export async function runSetupRuntimePreflight(
  input: SetupRuntimePreflightInput,
  options: { commandRunner?: SetupRuntimeCommandRunner } = {},
): Promise<SetupRuntimePreflightResult> {
  const runner = options.commandRunner ?? runCommand;
  const packageMetadata = await readPackageMetadata(input.workspacePath);
  const machineArch = await probeMachineArch(input.workspacePath, runner);
  const projectNode = await probeProjectNode(input.workspacePath, runner);
  const packageManagersToProbe = packageManagerProbeNames(input.packageManager ?? "auto", packageMetadata);
  const packageManagerProbes = await Promise.all(
    packageManagersToProbe.map((name) => probePackageManager(name, {
      workspacePath: input.workspacePath,
      packageMetadata,
      requested: input.packageManager === name,
      runner,
    })),
  );
  const selectedPackageManager = selectPackageManager(input.packageManager ?? "auto", packageMetadata, packageManagerProbes);
  const result: SetupRuntimePreflightResult = {
    workspacePath: input.workspacePath,
    host: {
      platform: process.platform,
      processArch: process.arch,
      ...(machineArch ? { machineArch } : {}),
      release: osRelease(),
    },
    ambientProcess: {
      execPath: process.execPath,
      nodeVersion: process.version,
      arch: process.arch,
      platform: process.platform,
      ...(process.versions.electron ? { electronVersion: process.versions.electron } : {}),
      ...(process.versions.modules ? { modules: process.versions.modules } : {}),
    },
    shell: {
      path: process.platform === "win32" ? process.env.ComSpec : process.env.SHELL,
    },
    packageMetadata,
    projectNode,
    packageManagers: packageManagerProbes,
    ...(selectedPackageManager ? { selectedPackageManager } : {}),
    warnings: [],
  };
  result.warnings = buildWarnings(result, input.packageManager ?? "auto");
  return result;
}

export function setupRuntimePreflightText(result: SetupRuntimePreflightResult): string {
  const packageManagersText = result.packageManagers.length
    ? result.packageManagers
      .map((probe) => {
        if (!probe.available) return `- ${probe.name}: not found${probe.error ? ` (${probe.error})` : ""}`;
        const hints = [
          probe.version ? `version ${probe.version}` : undefined,
          probe.path ? `path ${probe.path}` : undefined,
          probe.architecture ? `arch ${probe.architecture}` : undefined,
          probe.binaryKind ? `kind ${probe.binaryKind}` : undefined,
        ].filter(Boolean).join("; ");
        const source = probe.inferredFrom.length ? `; inferred from ${probe.inferredFrom.join(", ")}` : "";
        return `- ${probe.name}: ${hints || "available"}${probe.requested ? "; requested" : ""}${source}`;
      })
      .join("\n")
    : "- none probed";
  const warningsText = result.warnings.length
    ? result.warnings.map((warning) => `- [${warning.severity}/${warning.code}] ${warning.message}`).join("\n")
    : "- none";
  const nativeSignals = [
    ...result.packageMetadata.nativeDependencySignals,
    ...result.packageMetadata.nativeScriptSignals.map((signal) => `script:${signal}`),
  ];
  return [
    "Ambient setup runtime preflight.",
    `Workspace: ${result.workspacePath}`,
    `Host: ${result.host.platform} process=${result.host.processArch}${result.host.machineArch ? ` machine=${result.host.machineArch}` : ""} release=${result.host.release}`,
    `Ambient process: ${result.ambientProcess.nodeVersion} arch=${result.ambientProcess.arch} path=${result.ambientProcess.execPath}${result.ambientProcess.electronVersion ? ` electron=${result.ambientProcess.electronVersion}` : ""}`,
    result.projectNode.available
      ? `Project Node: ${result.projectNode.version ?? "available"} arch=${result.projectNode.arch ?? "unknown"} path=${result.projectNode.execPath ?? result.projectNode.command}`
      : `Project Node: not found (${result.projectNode.error ?? "node unavailable"})`,
    `Shell: ${result.shell.path ?? "unknown"}`,
    `Package metadata: packageManager=${result.packageMetadata.packageManager ?? "not declared"}; lockfiles=${result.packageMetadata.lockfiles.length ? result.packageMetadata.lockfiles.join(", ") : "none"}`,
    `Selected package manager: ${result.selectedPackageManager?.name ?? "none"}${result.selectedPackageManager?.available === false ? " (not found)" : ""}`,
    "Package manager probes:",
    packageManagersText,
    `Native dependency signals: ${nativeSignals.length ? nativeSignals.join(", ") : "none detected"}`,
    "Warnings:",
    warningsText,
    "",
    "Next actions:",
    "- If mixed architecture is reported, do not install native dependencies until the user confirms the intended arm64/x64 runtime.",
    "- On Apple Silicon, prefer arm64 Node/package-manager paths unless the repository explicitly requires an x64 environment.",
    "- Re-run this preflight after changing Node, package-manager, Rosetta, Docker/Podman, or shell runtime configuration.",
  ].join("\n");
}

async function readPackageMetadata(workspacePath: string): Promise<SetupRuntimePackageMetadata> {
  const lockfiles = (await Promise.all(
    lockfileManagers.map(async ({ file }) => await fileExists(join(workspacePath, file)) ? file : undefined),
  )).filter((file): file is string => Boolean(file));
  try {
    const parsed = JSON.parse(await readFile(join(workspacePath, "package.json"), "utf8")) as PackageJsonShape;
    return {
      packageManager: typeof parsed.packageManager === "string" ? parsed.packageManager : undefined,
      lockfiles,
      nativeDependencySignals: nativeDependencySignals(parsed),
      nativeScriptSignals: nativeScriptSignals(parsed),
      packageJsonFound: true,
    };
  } catch (error) {
    return {
      lockfiles,
      nativeDependencySignals: [],
      nativeScriptSignals: [],
      packageJsonFound: false,
    };
  }
}

async function probeMachineArch(cwd: string, runner: SetupRuntimeCommandRunner): Promise<string | undefined> {
  if (process.platform === "win32") return process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE || process.arch;
  const result = await runner({ cwd, command: "uname", args: ["-m"], timeoutMs: 2_000 });
  return result.ok ? result.stdout.trim().split("\n")[0] || undefined : process.arch;
}

async function probeProjectNode(cwd: string, runner: SetupRuntimeCommandRunner): Promise<SetupRuntimeNodeProbe> {
  const script = "JSON.stringify({platform:process.platform,arch:process.arch,execPath:process.execPath,version:process.version,modules:process.versions.modules})";
  const result = await runner({ cwd, command: "node", args: ["-p", script], timeoutMs: 4_000 });
  if (!result.ok) {
    return {
      available: false,
      command: "node",
      error: firstLine(result.stderr || result.stdout || `exit ${result.exitCode ?? "unknown"}`),
    };
  }
  try {
    const parsed = JSON.parse(result.stdout.trim()) as Partial<SetupRuntimeNodeProbe>;
    return {
      available: true,
      command: "node",
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      platform: typeof parsed.platform === "string" ? parsed.platform : undefined,
      arch: typeof parsed.arch === "string" ? parsed.arch : undefined,
      execPath: typeof parsed.execPath === "string" ? parsed.execPath : undefined,
      modules: typeof parsed.modules === "string" ? parsed.modules : undefined,
    };
  } catch {
    return {
      available: true,
      command: "node",
      version: firstLine(result.stdout),
    };
  }
}

async function probePackageManager(
  name: SetupRuntimePackageManagerProbe["name"],
  input: {
    workspacePath: string;
    packageMetadata: SetupRuntimePackageMetadata;
    requested: boolean;
    runner: SetupRuntimeCommandRunner;
  },
): Promise<SetupRuntimePackageManagerProbe> {
  const inferredFrom = packageManagerInferredFrom(name, input.packageMetadata);
  const pathResult = await executablePath(name, input.workspacePath, input.runner);
  if (!pathResult.ok) {
    return {
      name,
      requested: input.requested,
      inferredFrom,
      available: false,
      error: firstLine(pathResult.stderr || pathResult.stdout || `exit ${pathResult.exitCode ?? "unknown"}`),
    };
  }
  const path = firstLine(pathResult.stdout);
  const versionResult = await input.runner({ cwd: input.workspacePath, command: name, args: ["--version"], timeoutMs: 4_000 });
  const fileProbe = path ? await probeExecutableFile(path, input.workspacePath, input.runner) : undefined;
  return {
    name,
    requested: input.requested,
    inferredFrom,
    available: true,
    ...(path ? { path } : {}),
    ...(versionResult.ok ? { version: firstLine(versionResult.stdout) } : {}),
    ...(fileProbe?.binaryKind ? { binaryKind: fileProbe.binaryKind } : {}),
    ...(fileProbe?.architecture ? { architecture: fileProbe.architecture } : {}),
    ...(fileProbe?.description ? { fileDescription: fileProbe.description } : {}),
  };
}

async function executablePath(command: string, cwd: string, runner: SetupRuntimeCommandRunner): Promise<SetupRuntimeCommandResult> {
  if (process.platform === "win32") {
    return runner({ cwd, command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `where ${command}`], timeoutMs: 3_000 });
  }
  return runner({ cwd, command: process.env.SHELL || "/bin/sh", args: ["-c", `command -v ${command}`], timeoutMs: 3_000 });
}

async function probeExecutableFile(
  path: string,
  cwd: string,
  runner: SetupRuntimeCommandRunner,
): Promise<{ binaryKind: SetupRuntimePackageManagerProbe["binaryKind"]; architecture?: string; description?: string } | undefined> {
  if (process.platform === "win32") return { binaryKind: "unknown" };
  const result = await runner({ cwd, command: "file", args: ["-b", path], timeoutMs: 3_000 });
  if (!result.ok) return undefined;
  const description = firstLine(result.stdout);
  return {
    binaryKind: executableBinaryKind(description),
    architecture: executableArchitecture(description),
    description,
  };
}

function packageManagerProbeNames(
  choice: SetupRuntimePackageManagerChoice,
  metadata: SetupRuntimePackageMetadata,
): SetupRuntimePackageManagerProbe["name"][] {
  if (choice !== "auto") return [choice];
  const names: SetupRuntimePackageManagerProbe["name"][] = [];
  const declared = parseDeclaredPackageManager(metadata.packageManager);
  if (declared) names.push(declared);
  for (const lockfile of metadata.lockfiles) {
    const manager = lockfileManagers.find((entry) => entry.file === lockfile)?.manager;
    if (manager) names.push(manager);
  }
  names.push("pnpm", "npm", "yarn", "bun");
  return [...new Set(names)];
}

function selectPackageManager(
  choice: SetupRuntimePackageManagerChoice,
  metadata: SetupRuntimePackageMetadata,
  probes: SetupRuntimePackageManagerProbe[],
): SetupRuntimePackageManagerProbe | undefined {
  const preferredNames = packageManagerProbeNames(choice, metadata);
  for (const name of preferredNames) {
    const probe = probes.find((candidate) => candidate.name === name);
    if (probe?.available) return probe;
  }
  return probes.find((probe) => probe.requested || probe.inferredFrom.length);
}

function packageManagerInferredFrom(name: SetupRuntimePackageManagerProbe["name"], metadata: SetupRuntimePackageMetadata): string[] {
  const inferred: string[] = [];
  if (parseDeclaredPackageManager(metadata.packageManager) === name) inferred.push(`packageManager:${metadata.packageManager}`);
  for (const lockfile of metadata.lockfiles) {
    if (lockfileManagers.find((entry) => entry.file === lockfile && entry.manager === name)) inferred.push(`lockfile:${lockfile}`);
  }
  return inferred;
}

function parseDeclaredPackageManager(value: string | undefined): SetupRuntimePackageManagerProbe["name"] | undefined {
  if (!value) return undefined;
  const name = value.split("@")[0];
  return packageManagers.includes(name as SetupRuntimePackageManagerProbe["name"])
    ? name as SetupRuntimePackageManagerProbe["name"]
    : undefined;
}

function nativeDependencySignals(parsed: PackageJsonShape): string[] {
  const deps = {
    ...stringRecord(parsed.dependencies),
    ...stringRecord(parsed.devDependencies),
    ...stringRecord(parsed.optionalDependencies),
    ...stringRecord(parsed.peerDependencies),
  };
  const signals = Object.keys(deps).filter((name) =>
    nativeDependencyNames.some((nativeName) => nativeName.endsWith("/") || nativeName.endsWith("-") ? name.startsWith(nativeName) : name === nativeName),
  );
  return signals.sort();
}

function nativeScriptSignals(parsed: PackageJsonShape): string[] {
  return Object.entries(stringRecord(parsed.scripts))
    .filter(([, command]) => nativeScriptPatterns.some((pattern) => pattern.test(command)))
    .map(([name]) => name)
    .sort();
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

function buildWarnings(
  result: SetupRuntimePreflightResult,
  choice: SetupRuntimePackageManagerChoice,
): SetupRuntimePreflightWarning[] {
  const warnings: SetupRuntimePreflightWarning[] = [];
  const selected = result.selectedPackageManager;
  const nativeSignalCount = result.packageMetadata.nativeDependencySignals.length + result.packageMetadata.nativeScriptSignals.length;
  if (choice !== "auto" && selected && !selected.available) {
    warnings.push({
      code: "missing-package-manager",
      severity: "blocker",
      message: `Requested package manager ${choice} was not found on PATH.`,
    });
  } else if (
    (!selected || !selected.available) &&
    (result.packageMetadata.packageManager || result.packageMetadata.lockfiles.length || result.packageMetadata.packageJsonFound)
  ) {
    warnings.push({
      code: "missing-package-manager",
      severity: "blocker",
      message: "No package manager matching package.json or lockfiles was found on PATH.",
    });
  }
  const lockfileFamilies = result.packageMetadata.lockfiles
    .map((lockfile) => lockfileManagers.find((entry) => entry.file === lockfile)?.manager)
    .filter(Boolean);
  if (new Set(lockfileFamilies).size > 1) {
    warnings.push({
      code: "multiple-lockfiles",
      severity: "warning",
      message: `Multiple package-manager lockfile families were detected: ${result.packageMetadata.lockfiles.join(", ")}.`,
    });
  }
  const hostArch = normalizeArch(result.host.machineArch ?? result.host.processArch);
  const processArch = normalizeArch(result.ambientProcess.arch);
  const projectNodeArch = normalizeArch(result.projectNode.arch);
  const packageManagerArch = normalizeArch(selected?.architecture);
  const runtimeArchs = [...new Set([processArch, projectNodeArch, packageManagerArch].filter(Boolean))];
  if (hostArch && runtimeArchs.some((arch) => arch && arch !== hostArch)) {
    warnings.push({
      code: "mixed-architecture",
      severity: nativeSignalCount > 0 ? "blocker" : "warning",
      message: `Host architecture is ${hostArch}, but runtime/package-manager probes include ${runtimeArchs.join(", ")}.`,
    });
  }
  if (nativeSignalCount > 0) {
    warnings.push({
      code: projectNodeArch ? "native-dependencies" : "native-dependencies-with-unknown-runtime",
      severity: projectNodeArch ? "warning" : "blocker",
      message: `Native dependency signals were detected (${[
        ...result.packageMetadata.nativeDependencySignals,
        ...result.packageMetadata.nativeScriptSignals.map((script) => `script:${script}`),
      ].join(", ")}). Install with the intended Node architecture only.`,
    });
  }
  if (selected?.available && !selected.architecture && selected.binaryKind !== "script-or-shim") {
    warnings.push({
      code: "package-manager-architecture-unknown",
      severity: "info",
      message: `Package manager ${selected.name} architecture could not be determined from its executable.`,
    });
  }
  return warnings;
}

function normalizeArch(value: string | undefined): "arm64" | "x64" | undefined {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "arm64" || normalized === "aarch64" || normalized === "arm64e") return "arm64";
  if (normalized === "x64" || normalized === "x86_64" || normalized === "amd64" || normalized.includes("x86-64")) return "x64";
  return undefined;
}

function executableBinaryKind(description: string): SetupRuntimePackageManagerProbe["binaryKind"] {
  if (/mach-o|elf|pe32|ms-windows/i.test(description)) return "native-binary";
  if (/script|text|ascii|unicode/i.test(description)) return "script-or-shim";
  return "unknown";
}

function executableArchitecture(description: string): string | undefined {
  if (/arm64|aarch64/i.test(description)) return "arm64";
  if (/x86[_-]64|x86-64|amd64/i.test(description)) return "x64";
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(input: SetupRuntimeCommandInput): Promise<SetupRuntimeCommandResult> {
  try {
    const result = await execFileAsync(input.command, input.args, {
      cwd: input.cwd,
      timeout: input.timeoutMs,
      windowsHide: true,
      maxBuffer: 64 * 1024,
      encoding: "utf8",
    });
    return {
      ok: true,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      exitCode: 0,
    };
  } catch (error) {
    const candidate = error as { stdout?: unknown; stderr?: unknown; code?: unknown; message?: unknown };
    return {
      ok: false,
      stdout: String(candidate.stdout ?? ""),
      stderr: String(candidate.stderr ?? candidate.message ?? ""),
      exitCode: typeof candidate.code === "number" ? candidate.code : undefined,
    };
  }
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.trim() ?? "";
}
