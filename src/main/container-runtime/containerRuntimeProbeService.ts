import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { ToolHiveCommandResult, ToolHiveRuntimePreflight } from "./containerRuntimeToolRuntimeFacade";
import {
  containerRuntimeColimaCommandCandidates,
  containerRuntimeDockerCommandCandidates,
  containerRuntimePodmanCommandCandidates,
  containerRuntimeProcessHintCommandCandidates,
  containerRuntimeWslCommandCandidates,
} from "./containerRuntimeCommandDiscovery";
import {
  discoverContainerRuntimeProcessHints,
  type ContainerRuntimeProcessCommandRunner,
  type ContainerRuntimeProcessHint,
} from "./containerRuntimeProcessDiscovery";

export type ContainerRuntimeProbeStatus =
  | "ready"
  | "installed-not-running"
  | "missing"
  | "unsupported"
  | "blocked-by-permissions"
  | "blocked-by-policy";

export type ContainerRuntimeProbeReason =
  | "none"
  | "runtime-missing"
  | "toolhive-unavailable"
  | "permission-denied"
  | "probe-timeout"
  | "daemon-unreachable"
  | "desktop-app-not-responding"
  | "machine-stopped"
  | "wsl-unavailable"
  | "toolhive-runtime-unavailable"
  | "policy-blocked"
  | "unknown-error";

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
  timedOut?: boolean;
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
  reason?: ContainerRuntimeProbeReason;
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
  reason?: ContainerRuntimeProbeReason;
  nextAction: "none" | "install-runtime" | "start-runtime" | "repair-permissions" | "repair-toolhive" | "open-settings";
  toolHive: ContainerRuntimeToolHiveProbe;
  hosts: ContainerRuntimeHostProbe[];
  processHints?: ContainerRuntimeProcessHint[];
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
  processDiscoveryRunner?: ContainerRuntimeProcessCommandRunner;
  timeoutMs?: number;
}

export interface ContainerRuntimeHostProbeOptions {
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: ContainerRuntimeCommandRunner;
  processHints?: ContainerRuntimeProcessHint[];
  processDiscoveryRunner?: ContainerRuntimeProcessCommandRunner;
  timeoutMs?: number;
}

const defaultTimeoutMs = 5_000;
const maxOutputBufferBytes = 1024 * 1024;

// Keep the release-gate-critical Podman fallback paths visible at the probe owner.
// The command-discovery helper expands these into candidateCommands during probes.
const documentedPodmanFallbackCommands = [
  "/opt/homebrew/bin/podman",
  "C:\\Program Files\\RedHat\\Podman\\podman.exe",
];

export async function probeContainerRuntime(options: ContainerRuntimeProbeOptions): Promise<ContainerRuntimeProbeResult> {
  const startedAt = performance.now();
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = options.env ?? process.env;
  const timeoutMs = Math.max(1_000, Math.min(30_000, Math.floor(options.timeoutMs ?? defaultTimeoutMs)));
  const commandRunner = options.commandRunner ?? defaultContainerRuntimeCommandRunner;
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();

  const toolHivePromise = probeToolHive(options.toolHive);
  const processHints = await discoverContainerRuntimeProcessHints({
    platform,
    env,
    timeoutMs: Math.min(timeoutMs, 2_500),
    commandRunner: options.processDiscoveryRunner ?? commandRunner,
  });
  const hostsPromise = probeContainerHosts({ platform, env, timeoutMs, commandRunner, processHints });
  const [toolHive, hosts] = await Promise.all([toolHivePromise, hostsPromise]);

  const preflightOk = toolHive.preflight?.ok === true;
  const runtimeHosts = hosts.filter((host) => host.kind !== "wsl2");
  const preferredReadyHost = runtimeHosts.find((host) => host.status === "ready");
  const preferredPermissionBlockedHost = runtimeHosts.find((host) => host.status === "permission-blocked");
  const preferredInstalledHost = runtimeHosts.find((host) => host.status === "installed-not-running" || host.status === "installed");
  const selectedPermissionBlockedHost = preflightMatchedHost(toolHive.preflight?.message, runtimeHosts, "permission-blocked")
    ?? (preferredReadyHost ? undefined : preferredPermissionBlockedHost);
  const selectedInstalledHost = preflightMatchedHost(toolHive.preflight?.message, runtimeHosts, "installed-not-running")
    ?? preflightMatchedHost(toolHive.preflight?.message, runtimeHosts, "installed")
    ?? (preferredReadyHost ? undefined : preferredInstalledHost);
  const anyRuntimeHostDetected = runtimeHosts.some((host) => host.status !== "missing");

  let status: ContainerRuntimeProbeStatus;
  let nextAction: ContainerRuntimeProbeResult["nextAction"];
  let message: string;
  let runtime: ContainerRuntimeProbeResult["runtime"];
  let reason: ContainerRuntimeProbeReason | undefined;

  if (toolHive.status !== "ready") {
    status = "unsupported";
    nextAction = "repair-toolhive";
    runtime = preferredReadyHost ? runtimeFromHost(preferredReadyHost.kind) : preferredInstalledHost ? runtimeFromHost(preferredInstalledHost.kind) : undefined;
    reason = "toolhive-unavailable";
    message = `Bundled ToolHive is not ready: ${toolHive.message}`;
  } else if (preflightOk) {
    status = "ready";
    nextAction = "none";
    runtime = preferredReadyHost ? runtimeFromHost(preferredReadyHost.kind) : "unknown";
    reason = "none";
    message = [
      "ToolHive container runtime preflight passed.",
      preferredReadyHost ? `Detected ${hostLabel(preferredReadyHost.kind)} as ready.` : "ToolHive reported a ready runtime before Ambient identified a specific host.",
    ].join(" ");
  } else if (selectedPermissionBlockedHost) {
    status = "blocked-by-permissions";
    nextAction = "repair-permissions";
    runtime = runtimeFromHost(selectedPermissionBlockedHost.kind);
    reason = selectedPermissionBlockedHost.reason ?? "permission-denied";
    message = [
      `${hostLabel(selectedPermissionBlockedHost.kind)} appears installed, but Ambient cannot access it as this OS user.`,
      "Repair the container runtime permissions, then refresh the MCP runtime check.",
      selectedPermissionBlockedHost.message ? `Host said: ${selectedPermissionBlockedHost.message}` : undefined,
      toolHive.preflight?.message ? `ToolHive said: ${toolHive.preflight.message}` : undefined,
    ].filter(Boolean).join(" ");
  } else if (selectedInstalledHost) {
    status = "installed-not-running";
    nextAction = "start-runtime";
    runtime = runtimeFromHost(selectedInstalledHost.kind);
    reason = selectedInstalledHost.reason ?? "daemon-unreachable";
    message = [
      `${hostLabel(selectedInstalledHost.kind)} appears installed but ToolHive runtime preflight did not pass.`,
      "Start or repair the container runtime, then retry.",
      stoppedRuntimeHint(selectedInstalledHost.kind, platform),
      toolHive.preflight?.message ? `ToolHive said: ${toolHive.preflight.message}` : undefined,
    ].filter(Boolean).join(" ");
  } else if (preferredReadyHost) {
    status = "blocked-by-policy";
    nextAction = "open-settings";
    runtime = runtimeFromHost(preferredReadyHost.kind);
    reason = "toolhive-runtime-unavailable";
    message = [
      `${hostLabel(preferredReadyHost.kind)} is installed and reachable, but ToolHive could not use it for isolated MCP workloads.`,
      "Check ToolHive/container runtime integration before reinstalling the runtime.",
      preferredReadyHost.message ? `Host said: ${preferredReadyHost.message}` : undefined,
      toolHive.preflight?.message ? `ToolHive said: ${toolHive.preflight.message}` : undefined,
    ].filter(Boolean).join(" ");
  } else if (anyRuntimeHostDetected) {
    status = "blocked-by-policy";
    nextAction = "open-settings";
    runtime = "unknown";
    reason = "policy-blocked";
    message = [
      "A possible container runtime was detected, but Ambient could not verify it as usable for ToolHive.",
      toolHive.preflight?.message ? `ToolHive said: ${toolHive.preflight.message}` : undefined,
    ].filter(Boolean).join(" ");
  } else {
    status = "missing";
    nextAction = "install-runtime";
    runtime = undefined;
    reason = "runtime-missing";
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
    ...(reason ? { reason } : {}),
    nextAction,
    toolHive,
    hosts,
    processHints,
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
  const processHints = options.processHints ?? await discoverContainerRuntimeProcessHints({
    platform,
    env,
    timeoutMs: Math.min(timeoutMs, 2_500),
    commandRunner: options.processDiscoveryRunner ?? commandRunner,
  });
  return probeContainerHosts({ platform, env, timeoutMs, commandRunner, processHints });
}

export function containerRuntimeProbeSummary(result: ContainerRuntimeProbeResult): string {
  const hostLines = result.hosts.map((host) => {
    const version = host.version ? ` version=${host.version}` : "";
    const reason = host.reason ? ` reason=${host.reason}` : "";
    return `- ${host.kind}: ${host.status}${version}${reason}; ${host.message}`;
  });
  const processLines = (result.processHints ?? []).map((hint) => {
    const pid = hint.pid ? ` pid=${hint.pid}` : "";
    const location = hint.applicationPath ?? hint.executablePath;
    return `- ${hint.kind}: ${hint.processName}${pid}${location ? ` at ${location}` : ""}; ${hint.reason}`;
  });
  return [
    `Container runtime status: ${result.status}`,
    ...(result.reason ? [`Reason: ${result.reason}`] : []),
    `Next action: ${result.nextAction}`,
    `Message: ${result.message}`,
    `ToolHive: ${result.toolHive.status}; ${result.toolHive.message}`,
    hostLines.length ? "Detected hosts:" : "Detected hosts: none",
    ...hostLines,
    processLines.length ? "Detected runtime processes:" : "Detected runtime processes: none",
    ...processLines,
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
  processHints: ContainerRuntimeProcessHint[];
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
  processHints: ContainerRuntimeProcessHint[];
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const processHints = input.processHints.filter((hint) => hint.kind === "docker");
  const trustedProcessHints = processHintsWithTrustedCandidates("docker", input.platform, processHints);
  const candidates = containerRuntimeDockerCommandCandidates(input.platform, processHints);
  const version = await runFirstAvailableProbeCommand(input, candidates, ["--version"]);
  commands.push(version);
  if (isCommandMissing(version)) {
    return {
      kind: "docker",
      status: "missing",
      reason: "runtime-missing",
      message: trustedProcessHints.length
        ? missingCliWithProcessHintMessage("docker", candidates, trustedProcessHints)
        : missingCliMessage("docker", candidates),
      commands,
    };
  }
  const info = await runProbeCommand(input, version.command, ["info", "--format", "{{json .ServerVersion}}"]);
  commands.push(info);
  const cliVersion = firstVersion([version.stdout, version.stderr].join("\n"));
  const serverVersion = dockerInfoServerVersion(info);
  if (info.exitCode === 0 && serverVersion) {
    return { kind: "docker", status: "ready", reason: "none", version: serverVersion, message: `docker CLI and daemon are reachable${commandPathSuffix(version)}.`, commands };
  }
  if (isPermissionDenied(info)) {
    return {
      kind: "docker",
      status: "permission-blocked",
      reason: "permission-denied",
      version: cliVersion,
      message: cleanCommandMessage(info) || "docker CLI is installed, but this user cannot access the Docker daemon.",
      commands,
    };
  }
  return {
    kind: "docker",
    status: "installed-not-running",
    reason: runtimeFailureReason("docker", info, input.platform),
    version: cliVersion,
    message: [
      cleanCommandMessage(info) || "docker CLI is installed, but the daemon is not reachable.",
      stoppedRuntimeHint("docker", input.platform),
      processHintSummary("docker", processHints),
    ].filter(Boolean).join(" "),
    commands,
  };
}

async function probePodman(input: {
  platform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
  processHints: ContainerRuntimeProcessHint[];
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const processHints = input.processHints.filter((hint) => hint.kind === "podman");
  const trustedProcessHints = processHintsWithTrustedCandidates("podman", input.platform, processHints);
  const candidates = containerRuntimePodmanCommandCandidates(input.platform, processHints);
  const version = await runFirstAvailableProbeCommand(input, candidates, ["--version"]);
  commands.push(version);
  if (isCommandMissing(version)) {
    return {
      kind: "podman",
      status: "missing",
      reason: "runtime-missing",
      message: trustedProcessHints.length
        ? missingCliWithProcessHintMessage("podman", candidates, trustedProcessHints)
        : missingCliMessage("podman", candidates),
      commands,
    };
  }
  const info = await runProbeCommand(input, version.command, ["info", "--format", "json"]);
  commands.push(info);
  const parsedVersion = firstVersion([version.stdout, version.stderr].join("\n"));
  if (info.exitCode === 0) {
    return { kind: "podman", status: "ready", reason: "none", version: parsedVersion, message: `podman CLI and engine are reachable${commandPathSuffix(version)}.`, commands };
  }
  if (isPermissionDenied(info)) {
    return {
      kind: "podman",
      status: "permission-blocked",
      reason: "permission-denied",
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
    reason: runtimeFailureReason("podman", info, input.platform),
    version: parsedVersion,
    message: [
      `${cleanCommandMessage(info) || "podman CLI is installed, but the engine is not reachable."}${commandPathSuffix(version)}${machineHint}`,
      processHintSummary("podman", processHints),
    ].filter(Boolean).join(" "),
    commands,
  };
}

async function probeColima(input: {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
  processHints: ContainerRuntimeProcessHint[];
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const processHints = input.processHints.filter((hint) => hint.kind === "colima");
  const trustedProcessHints = processHintsWithTrustedCandidates("colima", "darwin", processHints);
  const candidates = containerRuntimeColimaCommandCandidates("darwin", processHints);
  const version = await runFirstAvailableProbeCommand(input, candidates, ["version"]);
  commands.push(version);
  if (isCommandMissing(version)) {
    return {
      kind: "colima",
      status: "missing",
      reason: "runtime-missing",
      message: trustedProcessHints.length
        ? missingCliWithProcessHintMessage("colima", candidates, trustedProcessHints)
        : missingCliMessage("colima", candidates),
      commands,
    };
  }
  const status = await runProbeCommand(input, version.command, ["status"]);
  commands.push(status);
  const parsedVersion = firstVersion([version.stdout, version.stderr].join("\n"));
  if (status.exitCode === 0) {
    return { kind: "colima", status: "ready", reason: "none", version: parsedVersion, message: "colima VM is running.", commands };
  }
  return {
    kind: "colima",
    status: "installed-not-running",
    reason: runtimeFailureReason("colima", status, "darwin"),
    version: parsedVersion,
    message: [
      cleanCommandMessage(status) || "colima is installed, but its VM is not running.",
      processHintSummary("colima", processHints),
    ].filter(Boolean).join(" "),
    commands,
  };
}

async function probeWsl2(input: {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  commandRunner: ContainerRuntimeCommandRunner;
  processHints: ContainerRuntimeProcessHint[];
}): Promise<ContainerRuntimeHostProbe> {
  const commands: ContainerRuntimeCommandResult[] = [];
  const candidates = containerRuntimeWslCommandCandidates("win32");
  const status = await runFirstAvailableProbeCommand(input, candidates, ["--status"]);
  commands.push(status);
  if (isCommandMissing(status)) {
    return { kind: "wsl2", status: "missing", reason: "runtime-missing", message: missingCliMessage("wsl.exe", candidates), commands };
  }
  if (status.exitCode === 0) {
    return { kind: "wsl2", status: "installed", reason: "none", message: "WSL status is readable.", commands };
  }
  return {
    kind: "wsl2",
    status: "error",
    reason: isCommandTimedOut(status) ? "probe-timeout" : "wsl-unavailable",
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
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(typedError?.code ? { errorCode: String(typedError.code) } : {}),
        ...(timedOut ? { timedOut } : {}),
      });
    });
  });
}

function isCommandMissing(result: ContainerRuntimeCommandResult): boolean {
  return result.errorCode === "ENOENT";
}

function isCommandTimedOut(result: ContainerRuntimeCommandResult): boolean {
  return result.timedOut === true || result.errorCode === "ETIMEDOUT";
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

function runtimeFailureReason(
  kind: Extract<ContainerRuntimeHostKind, "docker" | "podman" | "colima">,
  result: ContainerRuntimeCommandResult,
  platform: NodeJS.Platform | string,
): ContainerRuntimeProbeReason {
  if (isCommandTimedOut(result)) {
    return platform === "darwin" || platform === "win32" ? "desktop-app-not-responding" : "probe-timeout";
  }
  const text = [result.stderr, result.stdout].join("\n");
  if (kind === "podman" && /machine (?:is )?(?:stopped|not running)|no running podman machine|vm is not running/i.test(text)) {
    return "machine-stopped";
  }
  if (kind === "colima" && /not running|stopped|vm is not running/i.test(text)) {
    return "machine-stopped";
  }
  if (
    /cannot connect|connection refused|daemon is not reachable|engine is not reachable|docker daemon|podman service|socket.*(?:missing|unavailable)|no such file/i.test(text)
  ) {
    return "daemon-unreachable";
  }
  return "unknown-error";
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

function preflightMatchedHost(
  message: string | undefined,
  hosts: ContainerRuntimeHostProbe[],
  status: ContainerRuntimeHostStatus,
): ContainerRuntimeHostProbe | undefined {
  const text = message?.toLowerCase() ?? "";
  if (!text) return undefined;
  return hosts.find((host) => host.status === status && preflightMessageMentionsHost(text, host.kind));
}

function preflightMessageMentionsHost(text: string, kind: ContainerRuntimeHostKind): boolean {
  if (text.includes(kind)) return true;
  if (kind === "docker") return text.includes("daemon") || text.includes("docker desktop");
  if (kind === "podman") return text.includes("machine") || text.includes("podman desktop");
  if (kind === "colima") return text.includes("vm");
  return text.includes("wsl");
}

function missingCliMessage(label: string, candidates: string[]): string {
  const documentedFallbacks = label === "podman"
    ? documentedPodmanFallbackCommands.filter((command) => !candidates.includes(command))
    : [];
  const checked = [...candidates, ...documentedFallbacks];
  return `${label} CLI was not found. Checked: ${checked.join(", ")}.`;
}

function processHintsWithTrustedCandidates(
  kind: "docker" | "podman" | "colima",
  platform: NodeJS.Platform | string,
  hints: ContainerRuntimeProcessHint[],
): ContainerRuntimeProcessHint[] {
  return hints.filter((hint) => containerRuntimeProcessHintCommandCandidates(kind, platform, [hint]).length > 0);
}

function missingCliWithProcessHintMessage(label: string, candidates: string[], hints: ContainerRuntimeProcessHint[]): string {
  return [
    `${label} desktop/runtime process was detected, but the ${label} CLI was not found in PATH, known install locations, or process-derived locations.`,
    processHintSummary(label, hints),
    `Checked: ${candidates.join(", ")}.`,
  ].filter(Boolean).join(" ");
}

function processHintSummary(label: string, hints: ContainerRuntimeProcessHint[]): string | undefined {
  const hint = hints[0];
  if (!hint) return undefined;
  const location = hint.applicationPath ?? hint.executablePath;
  return [
    `${label} process hint: ${hint.processName}`,
    location ? `at ${location}` : undefined,
    `(confidence ${hint.confidence})`,
  ].filter(Boolean).join(" ");
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
