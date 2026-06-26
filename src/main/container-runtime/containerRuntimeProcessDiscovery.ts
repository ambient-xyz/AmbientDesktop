import { execFile } from "node:child_process";
import { basename, win32 } from "node:path";
import type { ContainerRuntimeCommandHint, ContainerRuntimeCommandKind } from "./containerRuntimeCommandDiscovery";

export type ContainerRuntimeProcessHintConfidence = "high" | "medium" | "low";

export interface ContainerRuntimeProcessHint extends ContainerRuntimeCommandHint {
  pid?: number;
  processName: string;
  confidence: ContainerRuntimeProcessHintConfidence;
  reason: string;
}

export interface ContainerRuntimeProcessCommandInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface ContainerRuntimeProcessCommandResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  errorCode?: string;
  timedOut?: boolean;
}

export type ContainerRuntimeProcessCommandRunner = (
  invocation: ContainerRuntimeProcessCommandInvocation,
) => Promise<ContainerRuntimeProcessCommandResult>;

export interface ContainerRuntimeProcessDiscoveryOptions {
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: ContainerRuntimeProcessCommandRunner;
  timeoutMs?: number;
}

interface ProcessListCommand {
  command: string;
  args: string[];
}

const defaultTimeoutMs = 2_500;
const maxOutputBufferBytes = 1024 * 1024;
const maxHints = 12;

export async function discoverContainerRuntimeProcessHints(
  options: ContainerRuntimeProcessDiscoveryOptions = {},
): Promise<ContainerRuntimeProcessHint[]> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const timeoutMs = Math.max(500, Math.min(5_000, Math.floor(options.timeoutMs ?? defaultTimeoutMs)));
  const runner = options.commandRunner ?? defaultContainerRuntimeProcessCommandRunner;

  for (const command of processListCommands(platform)) {
    const result = await runner({
      command: command.command,
      args: command.args,
      env,
      timeoutMs,
    });
    if (isMissingProcessListCommand(result)) continue;
    if (result.exitCode !== 0) continue;
    return parseContainerRuntimeProcessList(platform, result.stdout);
  }
  return [];
}

export function parseContainerRuntimeProcessList(
  platform: NodeJS.Platform | string,
  stdout: string,
): ContainerRuntimeProcessHint[] {
  const hints = platform === "win32"
    ? parseWindowsProcessList(stdout)
    : parsePosixProcessList(platform, stdout);
  return uniqueProcessHints(hints).slice(0, maxHints);
}

function processListCommands(platform: NodeJS.Platform | string): ProcessListCommand[] {
  if (platform === "win32") {
    const script = [
      "$ErrorActionPreference = 'SilentlyContinue';",
      "$items = Get-CimInstance Win32_Process |",
      "Where-Object { $_.Name -match 'docker|podman|colima|wsl|com.docker|gvproxy' -or $_.CommandLine -match 'docker|podman|colima|wsl|com.docker|gvproxy' } |",
      "Select-Object ProcessId,Name,ExecutablePath,CommandLine;",
      "$items | ConvertTo-Json -Compress",
    ].join(" ");
    return [
      { command: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", script] },
      { command: "pwsh.exe", args: ["-NoProfile", "-NonInteractive", "-Command", script] },
    ];
  }
  return [
    { command: "/bin/ps", args: ["-axo", "pid=,args="] },
    { command: "ps", args: ["-axo", "pid=,args="] },
  ];
}

function parsePosixProcessList(platform: NodeJS.Platform | string, stdout: string): ContainerRuntimeProcessHint[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(.+)$/.exec(line);
      if (!match?.[2]) return undefined;
      const pid = Number(match[1]);
      const commandLine = match[2].trim();
      const kind = classifyContainerRuntimeProcess(processIdentityText(platform, commandLine));
      if (!kind) return undefined;
      return processHintFromCommandLine({
        kind,
        platform,
        pid: Number.isFinite(pid) ? pid : undefined,
        commandLine,
      });
    })
    .filter((hint): hint is ContainerRuntimeProcessHint => Boolean(hint));
}

function parseWindowsProcessList(stdout: string): ContainerRuntimeProcessHint[] {
  if (!stdout.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return undefined;
      const record = row as Record<string, unknown>;
      const name = stringField(record, "Name");
      const commandLine = stringField(record, "CommandLine") ?? name ?? "";
      const executablePath = sanitizePath(stringField(record, "ExecutablePath"), "win32");
      const kind = classifyContainerRuntimeProcess([name, executablePath].filter(Boolean).join(" "));
      if (!kind) return undefined;
      const pid = numberField(record, "ProcessId");
      return processHintFromCommandLine({
        kind,
        platform: "win32",
        pid,
        commandLine,
        executablePath,
        processName: name,
      });
    })
    .filter((hint): hint is ContainerRuntimeProcessHint => Boolean(hint));
}

function processHintFromCommandLine(input: {
  kind: ContainerRuntimeCommandKind;
  platform: NodeJS.Platform | string;
  pid?: number;
  commandLine: string;
  executablePath?: string;
  processName?: string;
}): ContainerRuntimeProcessHint {
  const applicationPath = input.platform === "darwin"
    ? extractMacApplicationPath(input.commandLine)
    : undefined;
  const executablePath = input.executablePath
    ?? sanitizePath(extractFirstExecutablePath(input.commandLine, input.platform), input.platform);
  const processName = input.processName
    ?? processNameFromPath(executablePath, input.platform)
    ?? processNameFromApplicationPath(applicationPath)
    ?? fallbackProcessName(input.kind);

  return {
    kind: input.kind,
    ...(input.pid ? { pid: input.pid } : {}),
    processName,
    ...(executablePath ? { executablePath } : {}),
    ...(applicationPath ? { applicationPath } : {}),
    confidence: processHintConfidence(input.kind, processName, executablePath, applicationPath),
    reason: processHintReason(input.kind, processName, executablePath, applicationPath),
  };
}

function classifyContainerRuntimeProcess(text: string): ContainerRuntimeCommandKind | undefined {
  const lower = text.toLowerCase();
  if (
    lower.includes("docker desktop.app") ||
    lower.includes("docker desktop.exe") ||
    lower.includes("com.docker.backend") ||
    /(?:^|[/\\\s])dockerd(?:\.exe)?(?:\s|$)/i.test(text) ||
    /(?:^|[/\\\s])docker(?:\.exe)?(?:\s|$)/i.test(text)
  ) {
    return "docker";
  }
  if (
    lower.includes("podman desktop") ||
    lower.includes("podman-machine") ||
    (lower.includes("gvproxy") && lower.includes("podman")) ||
    /(?:^|[/\\\s])podman(?:\.exe)?(?:\s|$)/i.test(text)
  ) {
    return "podman";
  }
  if (
    lower.includes("/colima/") ||
    lower.includes("\\colima\\") ||
    /(?:^|[/\\\s])colima(?:\.exe)?(?:\s|$)/i.test(text)
  ) {
    return "colima";
  }
  if (/(?:^|[/\\\s])wsl(?:\.exe)?(?:\s|$)/i.test(text)) return "wsl2";
  return undefined;
}

function processIdentityText(platform: NodeJS.Platform | string, commandLine: string): string {
  const applicationPath = platform === "darwin" ? extractMacApplicationPath(commandLine) : undefined;
  const executablePath = sanitizePath(extractFirstExecutablePath(commandLine, platform), platform);
  return [
    applicationPath,
    processNameFromApplicationPath(applicationPath),
    executablePath,
    processNameFromPath(executablePath, platform),
  ].filter(Boolean).join(" ");
}

function processHintConfidence(
  kind: ContainerRuntimeCommandKind,
  processName: string,
  executablePath: string | undefined,
  applicationPath: string | undefined,
): ContainerRuntimeProcessHintConfidence {
  const lower = `${processName} ${executablePath ?? ""} ${applicationPath ?? ""}`.toLowerCase();
  if (kind === "docker" && (lower.includes("docker desktop") || lower.includes("docker.app") || lower.includes("com.docker.backend") || executablePath?.endsWith("/docker"))) return "high";
  if (kind === "podman" && (lower.includes("podman desktop") || executablePath?.endsWith("/podman") || lower.includes("podman-machine"))) return "high";
  if (kind === "colima" && lower.includes("colima")) return "high";
  if (kind === "wsl2" && lower.includes("wsl")) return "medium";
  return "medium";
}

function processHintReason(
  kind: ContainerRuntimeCommandKind,
  processName: string,
  executablePath: string | undefined,
  applicationPath: string | undefined,
): string {
  const location = applicationPath ?? executablePath;
  return [
    `${runtimeLabel(kind)} process detected`,
    processName ? `as ${processName}` : undefined,
    location ? `at ${location}` : undefined,
  ].filter(Boolean).join(" ");
}

function extractMacApplicationPath(commandLine: string): string | undefined {
  return sanitizePath(commandLine.match(/^(\/(?:Applications|Users|opt|Volumes|private|var)\/.*?\.app)(?:\/|\s|$)/)?.[1], "darwin");
}

function extractFirstExecutablePath(commandLine: string, platform: NodeJS.Platform | string): string | undefined {
  const trimmed = commandLine.trim();
  if (platform === "win32") {
    const quoted = trimmed.match(/^"([^"]+)"/)?.[1];
    if (quoted) return quoted;
    return trimmed.match(/^[A-Za-z]:\\[^\s]+/)?.[0] ?? trimmed.match(/^\\\\[^\s]+/)?.[0];
  }
  if (!trimmed.startsWith("/")) return undefined;
  const appPath = extractMacApplicationPath(trimmed);
  if (appPath && trimmed.startsWith(appPath)) return undefined;
  return trimmed.split(/\s+/)[0];
}

function sanitizePath(value: string | undefined, platform: NodeJS.Platform | string): string | undefined {
  const path = value?.trim().replace(/^"|"$/g, "");
  if (!path || path.length > 400 || /[\0\r\n]/.test(path)) return undefined;
  if (platform === "win32") return /^[A-Za-z]:\\|^\\\\/.test(path) ? path : undefined;
  return path.startsWith("/") ? path : undefined;
}

function processNameFromPath(executablePath: string | undefined, platform: NodeJS.Platform | string): string | undefined {
  if (!executablePath) return undefined;
  return (platform === "win32" ? win32.basename(executablePath) : basename(executablePath)).replace(/\.exe$/i, "");
}

function processNameFromApplicationPath(applicationPath: string | undefined): string | undefined {
  if (!applicationPath) return undefined;
  return basename(applicationPath).replace(/\.app$/i, "");
}

function fallbackProcessName(kind: ContainerRuntimeCommandKind): string {
  if (kind === "wsl2") return "WSL";
  return kind;
}

function runtimeLabel(kind: ContainerRuntimeCommandKind): string {
  if (kind === "wsl2") return "WSL";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function uniqueProcessHints(hints: ContainerRuntimeProcessHint[]): ContainerRuntimeProcessHint[] {
  const seen = new Set<string>();
  const unique: ContainerRuntimeProcessHint[] = [];
  for (const hint of hints) {
    const key = [hint.kind, hint.processName, hint.executablePath ?? "", hint.applicationPath ?? ""].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hint);
  }
  return unique;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isMissingProcessListCommand(result: ContainerRuntimeProcessCommandResult): boolean {
  return result.errorCode === "ENOENT";
}

function defaultContainerRuntimeProcessCommandRunner(
  invocation: ContainerRuntimeProcessCommandInvocation,
): Promise<ContainerRuntimeProcessCommandResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    execFile(invocation.command, invocation.args, {
      env: invocation.env,
      encoding: "utf8",
      timeout: invocation.timeoutMs,
      maxBuffer: maxOutputBufferBytes,
    }, (error, stdout, stderr) => {
      const typedError = error as (Error & { code?: unknown; signal?: unknown }) | null;
      const code = typeof typedError?.code === "number" ? typedError.code : typedError ? 1 : 0;
      const timedOut = Boolean(
        typedError &&
        ((typedError as { killed?: unknown }).killed === true || typedError.signal === "SIGTERM" || typedError.code === "ETIMEDOUT")
      );
      resolve({
        command: invocation.command,
        args: invocation.args,
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        exitCode: code,
        durationMs: Math.max(0, Date.now() - startedAt),
        ...(typedError?.code ? { errorCode: String(typedError.code) } : {}),
        ...(timedOut ? { timedOut } : {}),
      });
    });
  });
}
