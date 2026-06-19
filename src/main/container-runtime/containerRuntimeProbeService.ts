import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { ToolHiveCommandResult, ToolHiveRuntimePreflight } from "./containerRuntimeToolRuntimeFacade";

export type ContainerRuntimeProbeStatus =
  | "ready"
  | "installed-not-running"
  | "missing"
  | "unsupported"
  | "blocked-by-permissions"
  | "blocked-by-policy";

export type ContainerRuntimeHostKind = "docker" | "podman" | "colima" | "wsl2";

export type ContainerRuntimeHostStatus =
  | "ready"
  | "installed"
  | "installed-not-running"
  | "permission-blocked"
  | "missing"
  | "error";

export interface ContainerRuntimeCommandInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface ContainerRuntimeCommandResult {
  command: string;
  args: string[];
  candidateCommands?: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  errorCode?: string;
}

export type ContainerRuntimeCommandRunner = (invocation: ContainerRuntimeCommandInvocation) => Promise<ContainerRuntimeCommandResult>;

export interface ContainerRuntimeToolHiveProbe {
  status: "ready" | "missing" | "error";
  version?: ToolHiveCommandResult;
  preflight?: ToolHiveRuntimePreflight;
  message: string;
}

export interface ContainerRuntimeHostProbe {
  kind: ContainerRuntimeHostKind;
  status: ContainerRuntimeHostStatus;
  version?: string;
  message: string;
  commands: ContainerRuntimeCommandResult[];
}

export interface ContainerRuntimePostInstallQueueItem {
  kind: "default-capability";
  capabilityId: "scrapling";
  status: "queued" | "blocked";
}

export interface ContainerRuntimeProbeResult {
  schemaVersion: "ambient-container-runtime-probe-v1";
  status: ContainerRuntimeProbeStatus;
  runtime?: "docker" | "podman" | "colima" | "unknown";
  platform: string;
  arch: string;
  checkedAt: string;
  durationMs: number;
  message: string;
  nextAction: "none" | "install-runtime" | "start-runtime" | "repair-permissions" | "repair-toolhive" | "open-settings";
  toolHive: ContainerRuntimeToolHiveProbe;
  hosts: ContainerRuntimeHostProbe[];
  postInstallQueue: ContainerRuntimePostInstallQueueItem[];
}

export interface ContainerRuntimeToolHiveClient {
  version(): Promise<ToolHiveCommandResult>;
  preflightRuntime(timeoutSeconds?: number): Promise<ToolHiveRuntimePreflight>;
}

export interface ContainerRuntimeProbeOptions {
  toolHive: ContainerRuntimeToolHiveClient;
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  commandRunner?: ContainerRuntimeCommandRunner;
  timeoutMs?: number;
}

export interface ContainerRuntimeHostProbeOptions {
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: ContainerRuntimeCommandRunner;
  timeoutMs?: number;
}

const defaultTimeoutMs = 5_000;
const maxOutputBufferBytes = 1024 * 1024;

export async function probeContainerRuntime(options: ContainerRuntimeProbeOptions): Promise<ContainerRuntimeProbeResult> {
  const startedAt = performance.now();
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = options.env ?? process.env;
  const timeoutMs = Math.max(1_000, Math.min(30_000, Math.floor(options.timeoutMs ?? defaultTimeoutMs)));
  const commandRunner = options.commandRunner ?? defaultContainerRuntimeCommandRunner;
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();

  const [toolHive, hosts] = await Promise.all([
    probeToolHive(options.toolHive),
    probeContainerHosts({ platform, env, timeoutMs, commandRunner }),
  ]);

  const preflightOk = toolHive.preflight?.ok === true;
  const runtimeHosts = hosts.filter((host) => host.kind !== "wsl2");
  const preferredReadyHost = runtimeHosts.find((host) => host.status === "ready");
  const preferredPermissionBlockedHost = runtimeHosts.find((host) => host.status === "permission-blocked");
  const preferredInstalledHost = runtimeHosts.find((host) => host.status === "installed-not-running" || host.status === "installed");
  const anyRuntimeHostDetected = runtimeHosts.some((host) => host.status !== "missing");

  let status: ContainerRuntimeProbeStatus;
  let nextAction: ContainerRuntimeProbeResult["nextAction"];
  let message: string;
  let runtime: ContainerRuntimeProbeResult["runtime"];

  if (toolHive.status !== "ready") {
    status = "unsupported";
    nextAction = "repair-toolhive";
    runtime = preferredReadyHost ? runtimeFromHost(preferredReadyHost.kind) : preferredInstalledHost ? runtimeFromHost(preferredInstalledHost.kind) : undefined;
    message = `Bundled ToolHive is not ready: ${toolHive.message}`;
  } else if (preflightOk) {
    status = "ready";
    nextAction = "none";
    runtime = preferredReadyHost ? runtimeFromHost(preferredReadyHost.kind) : "unknown";
    message = [
      "ToolHive container runtime preflight passed.",
      preferredReadyHost ? `Detected ${hostLabel(preferredReadyHost.kind)} as ready.` : "ToolHive reported a ready runtime before Ambient identified a specific host.",
    ].join(" ");
  } else if (preferredPermissionBlockedHost) {
    status = "blocked-by-permissions";
    nextAction = "repair-permissions";
    runtime = runtimeFromHost(preferredPermissionBlockedHost.kind);
    message = [
      `${hostLabel(preferredPermissionBlockedHost.kind)} appears installed, but Ambient cannot access it as this OS user.`,
      "Repair the container runtime permissions, then refresh the MCP runtime check.",
      preferredPermissionBlockedHost.message ? `Host said: ${preferredPermissionBlockedHost.message}` : undefined,
      toolHive.preflight?.message ? `ToolHive said: ${toolHive.preflight.message}` : undefined,
    ].filter(Boolean).join(" ");
  } else if (preferredInstalledHost) {
    status = "installed-not-running";
    nextAction = "start-runtime";
    runtime = runtimeFromHost(preferredInstalledHost.kind);
    message = [
      `${hostLabel(preferredInstalledHost.kind)} appears installed but ToolHive runtime preflight did not pass.`,
      "Start or repair the container runtime, then retry.",
      stoppedRuntimeHint(preferredInstalledHost.kind, platform),
      toolHive.preflight?.message ? `ToolHive said: ${toolHive.preflight.message}` : undefined,
    ].filter(Boolean).join(" ");
  } else if (anyRuntimeHostDetected) {
    status = "blocked-by-policy";
    nextAction = "open-settings";
    runtime = "unknown";
    message = [
      "A possible container runtime was detected, but Ambient could not verify it as usable for ToolHive.",
      toolHive.preflight?.message ? `ToolHive said: ${toolHive.preflight.message}` : undefined,
    ].filter(Boolean).join(" ");
  } else {
    status = "missing";
    nextAction = "install-runtime";
    runtime = undefined;
    message = "No ready Docker, Podman, or ToolHive-compatible container runtime was detected. Install a runtime to enable isolated MCP plugins and Scrapling.";
  }

  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status,
    ...(runtime ? { runtime } : {}),
    platform: String(platform),
    arch: String(arch),
    checkedAt,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    message,
    nextAction,
    toolHive,
    hosts,
    postInstallQueue: [
      {
        kind: "default-capability",
        capabilityId: "scrapling",
        status: status === "ready" ? "queued" : "blocked",
      },
    ],
  };
}

export async function probeContainerRuntimeHosts(options: ContainerRuntimeHostProbeOptions = {}): Promise<ContainerRuntimeHostProbe[]> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const timeoutMs = Math.max(1_000, Math.min(30_000, Math.floor(options.timeoutMs ?? defaultTimeoutMs)));
  const commandRunner = options.commandRunner ?? defaultContainerRuntimeCommandRunner;
  return probeContainerHosts({ platform, env, timeoutMs, commandRunner });
}

export function containerRuntimeProbeSummary(result: ContainerRuntimeProbeResult): string {
  const hostLines = result.hosts.map((host) => {
    const version = host.version ? ` version=${host.version}` : "";
    return `- ${host.kind}: ${host.status}${version}; ${host.message}`;
  });
  return [
    `Container runtime status: ${result.status}`,
    `Next action: ${result.nextAction}`,
    `Message: ${result.message}`,
    `ToolHive: ${result.toolHive.status}; ${result.toolHive.message}`,
    hostLines.length ? "Detected hosts:" : "Detected hosts: none",
    ...hostLines,
    `Post-install queue: scrapling=${result.postInstallQueue[0]?.status ?? "blocked"}`,
  ].join("\n");
}

async function probeToolHive(toolHive: ContainerRuntimeToolHiveClient): Promise<ContainerRuntimeToolHiveProbe> {
  let version: ToolHiveCommandResult | undefined;
  try {
    version = await toolHive.version();
  } catch (error) {
    return {
      status: isMissingExecutableError(error) ? "missing" : "error",
      message: errorMessage(error),
    };
  }

  try {
    const preflight = await toolHive.preflightRuntime(5);
    return {
      status: "ready",
      version,
      preflight,
      message: preflight.message,
    };
  } catch (error) {
    return {
      status: "error",
      version,
      message: errorMessage(error),
    };
  }
}

async function probeContainerHosts(input: {
  platform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
}): Promise<ContainerRuntimeHostProbe[]> {
  const probes: Array<Promise<ContainerRuntimeHostProbe>> = [
    probeDocker(input),
    probePodman(input),
  ];
  if (input.platform === "darwin") probes.push(probeColima(input));
  if (input.platform === "win32") probes.push(probeWsl2(input));
  return Promise.all(probes);
}

async function probeDocker(input: {
  platform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const candidates = dockerCommandCandidates(input.platform);
  const version = await runFirstAvailableProbeCommand(input, candidates, ["--version"]);
  commands.push(version);
  if (isCommandMissing(version)) {
    return { kind: "docker", status: "missing", message: missingCliMessage("docker", candidates), commands };
  }
  const info = await runProbeCommand(input, version.command, ["info", "--format", "{{json .ServerVersion}}"]);
  commands.push(info);
  const cliVersion = firstVersion([version.stdout, version.stderr].join("\n"));
  const serverVersion = dockerInfoServerVersion(info);
  if (info.exitCode === 0 && serverVersion) {
    return { kind: "docker", status: "ready", version: serverVersion, message: `docker CLI and daemon are reachable${commandPathSuffix(version)}.`, commands };
  }
  if (isPermissionDenied(info)) {
    return {
      kind: "docker",
      status: "permission-blocked",
      version: cliVersion,
      message: cleanCommandMessage(info) || "docker CLI is installed, but this user cannot access the Docker daemon.",
      commands,
    };
  }
  return {
    kind: "docker",
    status: "installed-not-running",
    version: cliVersion,
    message: [
      cleanCommandMessage(info) || "docker CLI is installed, but the daemon is not reachable.",
      stoppedRuntimeHint("docker", input.platform),
    ].filter(Boolean).join(" "),
    commands,
  };
}

async function probePodman(input: {
  platform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const candidates = podmanCommandCandidates(input.platform);
  const version = await runFirstAvailableProbeCommand(input, candidates, ["--version"]);
  commands.push(version);
  if (isCommandMissing(version)) {
    return { kind: "podman", status: "missing", message: missingCliMessage("podman", candidates), commands };
  }
  const info = await runProbeCommand(input, version.command, ["info", "--format", "json"]);
  commands.push(info);
  const parsedVersion = firstVersion([version.stdout, version.stderr].join("\n"));
  if (info.exitCode === 0) {
    return { kind: "podman", status: "ready", version: parsedVersion, message: `podman CLI and engine are reachable${commandPathSuffix(version)}.`, commands };
  }
  if (isPermissionDenied(info)) {
    return {
      kind: "podman",
      status: "permission-blocked",
      version: parsedVersion,
      message: cleanCommandMessage(info) || "podman CLI is installed, but this user cannot access the Podman engine.",
      commands,
    };
  }

  const machineList = await runProbeCommand(input, version.command, ["machine", "list", "--format", "json"]);
  commands.push(machineList);
  const machineHint = machineList.exitCode === 0
    ? podmanMachineStartHint(input.platform)
    : "";
  return {
    kind: "podman",
    status: "installed-not-running",
    version: parsedVersion,
    message: `${cleanCommandMessage(info) || "podman CLI is installed, but the engine is not reachable."}${commandPathSuffix(version)}${machineHint}`,
    commands,
  };
}

async function probeColima(input: {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const version = await runProbeCommand(input, "colima", ["version"]);
  commands.push(version);
  if (isCommandMissing(version)) {
    return { kind: "colima", status: "missing", message: "colima CLI was not found.", commands };
  }
  const status = await runProbeCommand(input, "colima", ["status"]);
  commands.push(status);
  const parsedVersion = firstVersion([version.stdout, version.stderr].join("\n"));
  if (status.exitCode === 0) {
    return { kind: "colima", status: "ready", version: parsedVersion, message: "colima VM is running.", commands };
  }
  return {
    kind: "colima",
    status: "installed-not-running",
    version: parsedVersion,
    message: cleanCommandMessage(status) || "colima is installed, but its VM is not running.",
    commands,
  };
}

async function probeWsl2(input: {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const candidates = ["wsl.exe", "C:\\Windows\\System32\\wsl.exe"];
  const status = await runFirstAvailableProbeCommand(input, candidates, ["--status"]);
  commands.push(status);
  if (isCommandMissing(status)) {
    return { kind: "wsl2", status: "missing", message: missingCliMessage("wsl.exe", candidates), commands };
  }
  if (status.exitCode === 0) {
    return { kind: "wsl2", status: "installed", message: "WSL status is readable.", commands };
  }
  return {
    kind: "wsl2",
    status: "error",
    message: cleanCommandMessage(status) || "WSL status check failed.",
    commands,
  };
}

async function runFirstAvailableProbeCommand(input: {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
}, candidates: string[], args: string[]): Promise<ContainerRuntimeCommandResult> {
  const attempts: ContainerRuntimeCommandResult[] = [];
  for (const command of candidates) {
    const result = await runProbeCommand(input, command, args);
    attempts.push(result);
    if (!isCommandMissing(result)) {
      return { ...result, candidateCommands: candidates };
    }
  }
  const last = attempts[attempts.length - 1] ?? await runProbeCommand(input, candidates[0] ?? "", args);
  return { ...last, command: candidates[0] ?? last.command, candidateCommands: candidates };
}

async function runProbeCommand(input: {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
}, command: string, args: string[]): Promise<ContainerRuntimeCommandResult> {
  return input.commandRunner({
    command,
    args,
    env: input.env,
    timeoutMs: input.timeoutMs,
  });
}

function defaultContainerRuntimeCommandRunner(invocation: ContainerRuntimeCommandInvocation): Promise<ContainerRuntimeCommandResult> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    execFile(invocation.command, invocation.args, {
      env: invocation.env,
      encoding: "utf8",
      timeout: invocation.timeoutMs,
      maxBuffer: maxOutputBufferBytes,
    }, (error, stdout, stderr) => {
      const typedError = error as (Error & { code?: unknown; signal?: unknown }) | null;
      const code = typeof typedError?.code === "number" ? typedError.code : typedError ? 1 : 0;
      resolve({
        command: invocation.command,
        args: invocation.args,
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        exitCode: code,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(typedError?.code ? { errorCode: String(typedError.code) } : {}),
      });
    });
  });
}

function isCommandMissing(result: ContainerRuntimeCommandResult): boolean {
  return result.errorCode === "ENOENT";
}

function isMissingExecutableError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  return code === "ENOENT";
}

function cleanCommandMessage(result: ContainerRuntimeCommandResult): string {
  return [result.stderr, result.stdout].join("\n").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" ");
}

function isPermissionDenied(result: ContainerRuntimeCommandResult): boolean {
  return /permission denied|operation not permitted|access denied|cannot connect to the podman socket/i.test([result.stderr, result.stdout].join("\n"));
}

function firstVersion(text: string): string | undefined {
  return text.match(/\b\d+(?:\.\d+){1,3}\b/)?.[0];
}

function dockerInfoServerVersion(result: ContainerRuntimeCommandResult): string | undefined {
  const stdout = result.stdout.trim();
  if (!stdout || stdout === "\"\"" || stdout === "null") return undefined;
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (typeof parsed === "string") return firstVersion(parsed);
  } catch {
    return firstVersion(stdout);
  }
  return firstVersion(stdout);
}

function stoppedRuntimeHint(kind: ContainerRuntimeHostKind, platform: NodeJS.Platform | string): string | undefined {
  if (kind === "docker" && (platform === "darwin" || platform === "win32")) {
    return "If this machine uses Docker Desktop, Docker Desktop must be open and the engine must finish starting before Docker is visible to ToolHive.";
  }
  if (kind === "podman" && platform === "darwin") {
    return "Open Podman Desktop from Applications, finish first-run setup, create or start the default Podman machine, wait until Podman reports it is running, then refresh Ambient.";
  }
  if (kind === "podman" && platform === "win32") {
    return "Open Podman Desktop, finish first-run setup, enable or repair WSL 2 if prompted, create or start the default Podman machine, then refresh Ambient.";
  }
  return undefined;
}

function dockerCommandCandidates(platform: NodeJS.Platform | string): string[] {
  if (platform === "darwin") return ["docker", "/opt/homebrew/bin/docker", "/usr/local/bin/docker"];
  if (platform === "win32") {
    return [
      "docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\com.docker.cli.exe",
    ];
  }
  return ["docker", "/usr/bin/docker", "/usr/local/bin/docker"];
}

function podmanCommandCandidates(platform: NodeJS.Platform | string): string[] {
  if (platform === "darwin") return ["podman", "/opt/homebrew/bin/podman", "/usr/local/bin/podman"];
  if (platform === "win32") return ["podman.exe", "C:\\Program Files\\RedHat\\Podman\\podman.exe"];
  return ["podman", "/usr/bin/podman", "/usr/local/bin/podman"];
}

function missingCliMessage(label: string, candidates: string[]): string {
  return `${label} CLI was not found. Checked: ${candidates.join(", ")}.`;
}

function commandPathSuffix(result: ContainerRuntimeCommandResult): string {
  return result.command.includes("/") || result.command.includes("\\") ? ` at ${result.command}` : "";
}

function podmanMachineStartHint(platform: NodeJS.Platform | string): string {
  if (platform === "darwin") {
    return " Podman machine state was readable; open Podman Desktop from Applications, complete onboarding if needed, start the default machine, and retry.";
  }
  if (platform === "win32") {
    return " Podman machine state was readable; open Podman Desktop, confirm WSL 2 is healthy, start the default machine, and retry.";
  }
  return " Podman machine state was readable; start the machine and retry.";
}

function runtimeFromHost(kind: ContainerRuntimeHostKind): ContainerRuntimeProbeResult["runtime"] {
  if (kind === "docker" || kind === "podman" || kind === "colima") return kind;
  return "unknown";
}

function hostLabel(kind: ContainerRuntimeHostKind): string {
  if (kind === "wsl2") return "WSL 2";
  return kind[0].toUpperCase() + kind.slice(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
