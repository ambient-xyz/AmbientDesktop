import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import type {
  AmbientMcpContainerRuntimeLifecycleAction,
  AmbientMcpContainerRuntimeLifecycleCommand,
  AmbientMcpContainerRuntimeLifecyclePhase,
  AmbientMcpContainerRuntimeLifecyclePreview,
  AmbientMcpContainerRuntimeLifecycleProgress,
  AmbientMcpContainerRuntimeLifecycleResult,
  AmbientMcpContainerRuntimeLifecycleRunInput,
  AmbientMcpContainerRuntimeLifecycleTarget,
  AmbientMcpContainerRuntimeProbeReason,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpContainerRuntimeStatusKind,
} from "../../shared/pluginTypes";
import {
  containerRuntimeColimaCommandCandidates,
  containerRuntimePodmanCommandCandidates,
} from "./containerRuntimeProbeService";

type LifecycleRuntime = "docker" | "podman" | "colima";

export interface ContainerRuntimeLifecycleStatusInput {
  status: AmbientMcpContainerRuntimeStatusKind;
  runtime?: "docker" | "podman" | "colima" | "unknown";
  platform: string;
  arch?: string;
  reason?: AmbientMcpContainerRuntimeProbeReason;
  message?: string;
  hosts?: Array<{
    kind: "docker" | "podman" | "colima" | "wsl2";
    status: "ready" | "installed" | "installed-not-running" | "permission-blocked" | "missing" | "error";
    reason?: AmbientMcpContainerRuntimeProbeReason;
    message: string;
  }>;
}

export interface ContainerRuntimeLifecyclePreviewInput {
  action: AmbientMcpContainerRuntimeLifecycleAction;
  status: ContainerRuntimeLifecycleStatusInput;
  runtime?: LifecycleRuntime;
  now?: () => Date;
}

export interface ContainerRuntimeLifecycleCommandRunInput {
  command: AmbientMcpContainerRuntimeLifecycleCommand;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface ContainerRuntimeLifecycleCommandRunResult {
  command: AmbientMcpContainerRuntimeLifecycleCommand;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  errorCode?: string;
}

export type ContainerRuntimeLifecycleCommandRunner = (
  input: ContainerRuntimeLifecycleCommandRunInput,
) => Promise<ContainerRuntimeLifecycleCommandRunResult>;

export interface ContainerRuntimeLifecycleRunOptions {
  getStatus: () => Promise<AmbientMcpContainerRuntimeStatus>;
  commandRunner?: ContainerRuntimeLifecycleCommandRunner;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  pollAttempts?: number;
  pollIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (progress: AmbientMcpContainerRuntimeLifecycleProgress) => void | Promise<void>;
}

const defaultCommandTimeoutMs = 20_000;
const defaultPollAttempts = 6;
const defaultPollIntervalMs = 2_500;
const maxOutputBufferBytes = 1024 * 1024;

export function previewContainerRuntimeLifecycleAction(
  input: ContainerRuntimeLifecyclePreviewInput,
): AmbientMcpContainerRuntimeLifecyclePreview {
  const platform = input.status.platform;
  const runtime = input.runtime ?? runtimeFromStatus(input.status);
  const reason = runtime ? reasonForRuntime(input.status, runtime) : input.status.reason ?? "unknown-error";
  const createdAt = (input.now ?? (() => new Date()))().toISOString();

  if (!runtime) {
    return blockedPreview(input.action, "docker", platform, reason, createdAt, "Ambient could not identify a Docker, Podman, or Colima runtime to restart.");
  }

  const baseBlock = lifecycleBlockReason(input.status, runtime, input.action);
  if (baseBlock) {
    return blockedPreview(input.action, runtime, platform, reason, createdAt, baseBlock);
  }

  if (input.action === "open-recovery") {
    return recoveryPreview(runtime, platform, reason, createdAt);
  }
  if (runtime === "docker") return dockerLifecyclePreview(input.action, platform, reason, createdAt);
  if (runtime === "podman") return podmanLifecyclePreview(input.action, platform, reason, createdAt);
  return colimaLifecyclePreview(input.action, platform, reason, createdAt);
}

export async function runContainerRuntimeLifecycleAction(
  input: AmbientMcpContainerRuntimeLifecycleRunInput,
  options: ContainerRuntimeLifecycleRunOptions,
): Promise<AmbientMcpContainerRuntimeLifecycleResult> {
  const startedAt = performance.now();
  const before = await options.getStatus();
  const preview = previewContainerRuntimeLifecycleAction({
    action: input.action,
    runtime: input.runtime,
    status: before,
    now: options.now,
  });
  const progress: AmbientMcpContainerRuntimeLifecycleProgress[] = [];
  const pushProgress = (entry: Omit<AmbientMcpContainerRuntimeLifecycleProgress, "schemaVersion" | "action" | "runtime" | "recordedAt">) => {
    const progressEntry: AmbientMcpContainerRuntimeLifecycleProgress = {
      schemaVersion: "ambient-container-runtime-lifecycle-progress-v1",
      action: preview.action,
      runtime: preview.runtime,
      recordedAt: (options.now ?? (() => new Date()))().toISOString(),
      ...entry,
    };
    progress.push(progressEntry);
    let reported: void | Promise<void>;
    try {
      reported = options.onProgress?.(progressEntry);
    } catch (error) {
      console.warn(`[mcp-container-runtime] dropped lifecycle progress callback error: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (reported && typeof (reported as Promise<void>).catch === "function") {
      void (reported as Promise<void>).catch((error) => {
        console.warn(`[mcp-container-runtime] dropped lifecycle progress callback error: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  };

  pushProgress({
    phase: "previewed",
    status: preview.status === "available" ? "succeeded" : "failed",
    message: preview.summary,
  });

  const previewMismatch = input.expectedPreviewId && input.expectedPreviewId !== preview.previewId;
  if (preview.status === "blocked" || previewMismatch) {
    return lifecycleResult({
      input,
      preview,
      before,
      progress,
      startedAt,
      status: "blocked",
      reason: preview.reason,
      message: previewMismatch
        ? "Container runtime lifecycle preview changed before execution. Refresh the preview and try again."
        : preview.summary,
    });
  }

  if (preview.requiresConfirmation && input.confirmForce !== true) {
    return lifecycleResult({
      input,
      preview,
      before,
      progress,
      startedAt,
      status: "blocked",
      reason: preview.reason,
      message: "Force quit and restart requires explicit confirmation because it can interrupt every container using this runtime.",
    });
  }

  const runner = options.commandRunner ?? defaultContainerRuntimeLifecycleCommandRunner;
  const env = options.env ?? process.env;
  const timeoutMs = Math.max(1_000, Math.floor(options.timeoutMs ?? defaultCommandTimeoutMs));
  for (const command of preview.commands) {
    const phase = phaseForCommand(command, preview.action);
    pushProgress({
      phase,
      status: "running",
      message: command.rationale,
      command,
    });
    const result = await runner({ command, env, timeoutMs });
    if (result.exitCode !== 0) {
      const failedPhase: AmbientMcpContainerRuntimeLifecyclePhase = phase === "graceful-stop-started" ? "graceful-stop-failed" : "failed";
      const message = commandFailureMessage(result);
      pushProgress({
        phase: failedPhase,
        status: "failed",
        message,
        command,
      });
      if (input.action === "restart" && failedPhase === "graceful-stop-failed") continue;
      return lifecycleResult({
        input,
        preview,
        before,
        progress,
        startedAt,
        status: "failed",
        reason: preview.reason,
        message,
      });
    }
  }

  if (input.action === "open-recovery") {
    return lifecycleResult({
      input,
      preview,
      before,
      progress,
      startedAt,
      status: "running",
      reason: preview.reason,
      message: "Opened the runtime recovery guide. Refresh the MCP runtime check after applying the repair.",
    });
  }

  const poll = await pollForReadyStatus(options, preview, pushProgress);
  if (poll.after?.status === "ready") {
    pushProgress({
      phase: "ready",
      status: "succeeded",
      message: `${runtimeLabel(preview.runtime)} is reachable and ToolHive preflight is ready.`,
    });
    return lifecycleResult({
      input,
      preview,
      before,
      after: poll.after,
      progress,
      startedAt,
      status: "ready",
      reason: poll.after.reason ?? "none",
      message: `${runtimeLabel(preview.runtime)} restart completed and ToolHive preflight is ready.`,
    });
  }

  const message = poll.after
    ? `${runtimeLabel(preview.runtime)} restart did not become ready after ${poll.pollCount} probe attempt(s): ${poll.after.message}`
    : `${runtimeLabel(preview.runtime)} restart did not produce a runtime status after ${poll.pollCount} probe attempt(s).`;
  pushProgress({
    phase: "failed",
    status: "failed",
    message,
    pollCount: poll.pollCount,
  });
  return lifecycleResult({
    input,
    preview,
    before,
    after: poll.after,
    progress,
    startedAt,
    status: "failed",
    reason: poll.after?.reason ?? preview.reason,
    message,
  });
}

function runtimeFromStatus(status: ContainerRuntimeLifecycleStatusInput): LifecycleRuntime | undefined {
  if (status.runtime === "docker" || status.runtime === "podman" || status.runtime === "colima") return status.runtime;
  const host = status.hosts?.find((candidate) => (
    candidate.kind === "docker" ||
    candidate.kind === "podman" ||
    candidate.kind === "colima"
  ) && candidate.status !== "missing");
  if (host?.kind === "docker" || host?.kind === "podman" || host?.kind === "colima") return host.kind;
  return undefined;
}

function reasonForRuntime(status: ContainerRuntimeLifecycleStatusInput, runtime: LifecycleRuntime): AmbientMcpContainerRuntimeProbeReason {
  return status.reason ?? status.hosts?.find((host) => host.kind === runtime)?.reason ?? "unknown-error";
}

function lifecycleBlockReason(
  status: ContainerRuntimeLifecycleStatusInput,
  runtime: LifecycleRuntime,
  action: AmbientMcpContainerRuntimeLifecycleAction,
): string | undefined {
  if (status.status === "ready") return `${runtimeLabel(runtime)} already appears ready. Refresh status instead of restarting it.`;
  if (status.status === "missing") return `${runtimeLabel(runtime)} is not installed. Use the runtime install path instead of lifecycle restart.`;
  if (action === "open-recovery") return undefined;
  if (status.status === "unsupported") return "Bundled ToolHive is unavailable, so Ambient cannot verify runtime recovery yet.";
  if (status.status === "blocked-by-permissions") return `${runtimeLabel(runtime)} is permission-blocked for this OS user. Repair permissions before attempting restart.`;
  if (status.status === "blocked-by-policy") return "Ambient could not verify a safe runtime target. Open Settings or documentation instead of restarting.";
  if (runtime === "docker" && status.platform === "linux") {
    return "Docker Engine restart on Linux can require privileged service control, so Ambient opens recovery guidance instead of mutating the service.";
  }
  if (runtime === "colima" && action === "force-quit-and-restart") {
    return "Colima force quit is blocked until Ambient has a verified Colima process target for this platform.";
  }
  if ((runtime === "docker" || runtime === "podman") && action === "force-quit-and-restart" && status.platform !== "darwin" && status.platform !== "win32") {
    return `${runtimeLabel(runtime)} force quit is only available for verified Desktop application targets on macOS and Windows.`;
  }
  return undefined;
}

function blockedPreview(
  action: AmbientMcpContainerRuntimeLifecycleAction,
  runtime: LifecycleRuntime,
  platform: string,
  reason: AmbientMcpContainerRuntimeProbeReason,
  createdAt: string,
  summary: string,
): AmbientMcpContainerRuntimeLifecyclePreview {
  return {
    schemaVersion: "ambient-container-runtime-lifecycle-preview-v1",
    previewId: previewId(runtime, action, reason, platform),
    action,
    runtime,
    platform,
    status: "blocked",
    reason,
    summary,
    requiresConfirmation: action === "force-quit-and-restart",
    warnings: [summary],
    targets: [],
    commands: [],
    expectedInterruption: "No runtime process will be changed.",
    createdAt,
  };
}

function dockerLifecyclePreview(
  action: Exclude<AmbientMcpContainerRuntimeLifecycleAction, "open-recovery">,
  platform: string,
  reason: AmbientMcpContainerRuntimeProbeReason,
  createdAt: string,
): AmbientMcpContainerRuntimeLifecyclePreview {
  if (action === "force-quit-and-restart") {
    const force = dockerForceCommand(platform);
    return availablePreview({
      runtime: "docker",
      action,
      platform,
      reason,
      createdAt,
      summary: "Force quit Docker Desktop, relaunch it, and poll ToolHive until the runtime is ready.",
      requiresConfirmation: true,
      targets: [dockerApplicationTarget(platform), dockerProcessTarget(platform)],
      commands: [force, dockerOpenCommand(platform)].filter((command): command is AmbientMcpContainerRuntimeLifecycleCommand => Boolean(command)),
    });
  }
  return availablePreview({
    runtime: "docker",
    action,
    platform,
    reason,
    createdAt,
    summary: "Restart Docker Desktop gracefully, relaunch it, and poll ToolHive until the runtime is ready.",
    requiresConfirmation: false,
    targets: [dockerApplicationTarget(platform)],
    commands: [dockerGracefulQuitCommand(platform), dockerOpenCommand(platform)].filter((command): command is AmbientMcpContainerRuntimeLifecycleCommand => Boolean(command)),
  });
}

function podmanLifecyclePreview(
  action: Exclude<AmbientMcpContainerRuntimeLifecycleAction, "open-recovery">,
  platform: string,
  reason: AmbientMcpContainerRuntimeProbeReason,
  createdAt: string,
): AmbientMcpContainerRuntimeLifecyclePreview {
  const machineCommands = reason === "machine-stopped"
    ? [podmanMachineStartCommand(platform)]
    : [podmanMachineStopCommand(platform), podmanMachineStartCommand(platform)];
  if (action === "force-quit-and-restart") {
    const force = podmanForceCommand(platform);
    return availablePreview({
      runtime: "podman",
      action,
      platform,
      reason,
      createdAt,
      summary: "Force quit Podman Desktop, start the default Podman machine, and poll ToolHive until the runtime is ready.",
      requiresConfirmation: true,
      targets: [podmanApplicationTarget(platform), podmanMachineTarget(platform), podmanProcessTarget(platform)],
      commands: [force, podmanOpenCommand(platform), podmanMachineStartCommand(platform)].filter((command): command is AmbientMcpContainerRuntimeLifecycleCommand => Boolean(command)),
    });
  }
  return availablePreview({
    runtime: "podman",
    action,
    platform,
    reason,
    createdAt,
    summary: "Restart the default Podman machine and poll ToolHive until the runtime is ready.",
    requiresConfirmation: false,
    targets: [podmanMachineTarget(platform)],
    commands: machineCommands,
  });
}

function colimaLifecyclePreview(
  action: Exclude<AmbientMcpContainerRuntimeLifecycleAction, "open-recovery">,
  platform: string,
  reason: AmbientMcpContainerRuntimeProbeReason,
  createdAt: string,
): AmbientMcpContainerRuntimeLifecyclePreview {
  return availablePreview({
    runtime: "colima",
    action,
    platform,
    reason,
    createdAt,
    summary: "Restart Colima with its non-privileged CLI and poll ToolHive until the runtime is ready.",
    requiresConfirmation: false,
    targets: [colimaMachineTarget(platform)],
    commands: [
      commandWithCandidates(containerRuntimeColimaCommandCandidates(platform), ["stop"], "Stop the default Colima VM before starting it again.", true),
      commandWithCandidates(containerRuntimeColimaCommandCandidates(platform), ["start"], "Start the default Colima VM.", false),
    ],
  });
}

function recoveryPreview(
  runtime: LifecycleRuntime,
  platform: string,
  reason: AmbientMcpContainerRuntimeProbeReason,
  createdAt: string,
): AmbientMcpContainerRuntimeLifecyclePreview {
  const url = recoveryUrl(runtime, platform);
  return availablePreview({
    runtime,
    action: "open-recovery",
    platform,
    reason,
    createdAt,
    summary: `Open ${runtimeLabel(runtime)} recovery guidance for this platform.`,
    requiresConfirmation: false,
    targets: [{
      kind: "documentation",
      runtime,
      label: `${runtimeLabel(runtime)} recovery guide`,
      identifier: url,
      platform,
      verified: true,
      reason: "Documentation is the safe recovery path for blocked or privileged runtime repair.",
    }],
    commands: [openUrlCommand(platform, url)],
    expectedInterruption: "No runtime process will be changed.",
  });
}

function availablePreview(input: {
  runtime: LifecycleRuntime;
  action: AmbientMcpContainerRuntimeLifecycleAction;
  platform: string;
  reason: AmbientMcpContainerRuntimeProbeReason;
  createdAt: string;
  summary: string;
  requiresConfirmation: boolean;
  warnings?: string[];
  targets: AmbientMcpContainerRuntimeLifecycleTarget[];
  commands: AmbientMcpContainerRuntimeLifecycleCommand[];
  expectedInterruption?: string;
}): AmbientMcpContainerRuntimeLifecyclePreview {
  return {
    schemaVersion: "ambient-container-runtime-lifecycle-preview-v1",
    previewId: previewId(input.runtime, input.action, input.reason, input.platform),
    action: input.action,
    runtime: input.runtime,
    platform: input.platform,
    status: "available",
    reason: input.reason,
    summary: input.summary,
    requiresConfirmation: input.requiresConfirmation,
    warnings: input.warnings ?? restartWarnings(input.runtime, input.requiresConfirmation),
    targets: input.targets,
    commands: input.commands,
    expectedInterruption: input.expectedInterruption ?? `Restarting ${runtimeLabel(input.runtime)} can interrupt all containers using that runtime, including non-Ambient containers.`,
    createdAt: input.createdAt,
  };
}

function previewId(
  runtime: LifecycleRuntime,
  action: AmbientMcpContainerRuntimeLifecycleAction,
  reason: AmbientMcpContainerRuntimeProbeReason,
  platform: string,
): string {
  return `${runtime}:${action}:${reason}:${platform}`;
}

function restartWarnings(runtime: LifecycleRuntime, force: boolean): string[] {
  return [
    `${runtimeLabel(runtime)} restart can interrupt every container on that runtime, including containers not started by Ambient.`,
    force
      ? "Force quit may terminate the Desktop app before it can stop containers cleanly."
      : "Ambient will try the graceful path before polling readiness.",
  ];
}

function dockerApplicationTarget(platform: string): AmbientMcpContainerRuntimeLifecycleTarget {
  return {
    kind: "application",
    runtime: "docker",
    label: "Docker Desktop",
    identifier: platform === "darwin" ? "Docker" : "Docker Desktop",
    platform,
    verified: platform === "darwin" || platform === "win32",
    reason: "Allowlisted Docker Desktop application target.",
  };
}

function dockerProcessTarget(platform: string): AmbientMcpContainerRuntimeLifecycleTarget {
  return {
    kind: "process",
    runtime: "docker",
    label: "Docker Desktop process",
    identifier: platform === "win32" ? "Docker Desktop.exe" : "Docker",
    platform,
    verified: platform === "darwin" || platform === "win32",
    reason: "Allowlisted Docker Desktop process identity for force quit.",
  };
}

function podmanApplicationTarget(platform: string): AmbientMcpContainerRuntimeLifecycleTarget {
  return {
    kind: "application",
    runtime: "podman",
    label: "Podman Desktop",
    identifier: "Podman Desktop",
    platform,
    verified: platform === "darwin" || platform === "win32",
    reason: "Allowlisted Podman Desktop application target.",
  };
}

function podmanProcessTarget(platform: string): AmbientMcpContainerRuntimeLifecycleTarget {
  return {
    kind: "process",
    runtime: "podman",
    label: "Podman Desktop process",
    identifier: platform === "win32" ? "Podman Desktop.exe" : "Podman Desktop",
    platform,
    verified: platform === "darwin" || platform === "win32",
    reason: "Allowlisted Podman Desktop process identity for force quit.",
  };
}

function podmanMachineTarget(platform: string): AmbientMcpContainerRuntimeLifecycleTarget {
  return {
    kind: "machine",
    runtime: "podman",
    label: "Default Podman machine",
    identifier: "default",
    platform,
    verified: true,
    reason: "Podman machine lifecycle is exposed through the non-privileged Podman CLI.",
  };
}

function colimaMachineTarget(platform: string): AmbientMcpContainerRuntimeLifecycleTarget {
  return {
    kind: "machine",
    runtime: "colima",
    label: "Default Colima VM",
    identifier: "default",
    platform,
    verified: platform === "darwin",
    reason: "Colima default VM lifecycle is exposed through the non-privileged Colima CLI.",
  };
}

function dockerGracefulQuitCommand(platform: string): AmbientMcpContainerRuntimeLifecycleCommand | undefined {
  if (platform === "darwin") return command("/usr/bin/osascript", ["-e", "tell application \"Docker\" to quit"], "Ask Docker Desktop to quit gracefully.", true);
  return undefined;
}

function dockerOpenCommand(platform: string): AmbientMcpContainerRuntimeLifecycleCommand | undefined {
  if (platform === "darwin") return command("/usr/bin/open", ["-a", "Docker"], "Open Docker Desktop.", false);
  if (platform === "win32") return windowsStartProcessCommand("Docker Desktop", dockerDesktopExecutableCandidates());
  return undefined;
}

function dockerForceCommand(platform: string): AmbientMcpContainerRuntimeLifecycleCommand | undefined {
  if (platform === "darwin") return command("/usr/bin/pkill", ["-x", "Docker"], "Force quit the allowlisted Docker Desktop application process.", true);
  if (platform === "win32") return command("taskkill.exe", ["/IM", "Docker Desktop.exe", "/T", "/F"], "Force quit the allowlisted Docker Desktop application process tree.", true);
  return undefined;
}

function podmanOpenCommand(platform: string): AmbientMcpContainerRuntimeLifecycleCommand | undefined {
  if (platform === "darwin") return command("/usr/bin/open", ["-a", "Podman Desktop"], "Open Podman Desktop.", false);
  if (platform === "win32") return windowsStartProcessCommand("Podman Desktop", podmanDesktopExecutableCandidates());
  return undefined;
}

function podmanForceCommand(platform: string): AmbientMcpContainerRuntimeLifecycleCommand | undefined {
  if (platform === "darwin") return command("/usr/bin/pkill", ["-x", "Podman Desktop"], "Force quit the allowlisted Podman Desktop application process.", true);
  if (platform === "win32") return command("taskkill.exe", ["/IM", "Podman Desktop.exe", "/T", "/F"], "Force quit the allowlisted Podman Desktop application process tree.", true);
  return undefined;
}

function dockerDesktopExecutableCandidates(): string[] {
  return [
    "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
    "C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe",
  ];
}

function podmanDesktopExecutableCandidates(): string[] {
  return [
    "C:\\Program Files\\RedHat\\Podman Desktop\\Podman Desktop.exe",
    "C:\\Program Files\\Podman Desktop\\Podman Desktop.exe",
  ];
}

function windowsStartProcessCommand(
  label: string,
  executableCandidates: string[],
): AmbientMcpContainerRuntimeLifecycleCommand {
  const quotedCandidates = executableCandidates.map((candidate) => `'${candidate.replaceAll("'", "''")}'`).join(", ");
  return command(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        `$paths = @(${quotedCandidates});`,
        "foreach ($path in $paths) {",
        "  if (Test-Path -LiteralPath $path) {",
        "    Start-Process -FilePath $path;",
        "    exit 0;",
        "  }",
        "}",
        `Write-Error '${label.replaceAll("'", "''")} executable not found in allowlisted locations.';`,
        "exit 1;",
      ].join(" "),
    ],
    `Open ${label} from an allowlisted Windows executable path.`,
    false,
  );
}

function podmanMachineStopCommand(platform: string): AmbientMcpContainerRuntimeLifecycleCommand {
  return commandWithCandidates(containerRuntimePodmanCommandCandidates(platform), ["machine", "stop"], "Stop the default Podman machine before starting it again.", true);
}

function podmanMachineStartCommand(platform: string): AmbientMcpContainerRuntimeLifecycleCommand {
  return commandWithCandidates(containerRuntimePodmanCommandCandidates(platform), ["machine", "start"], "Start the default Podman machine.", false);
}

function openUrlCommand(platform: string, url: string): AmbientMcpContainerRuntimeLifecycleCommand {
  if (platform === "darwin") return command("/usr/bin/open", [url], "Open the official runtime recovery guide.", false);
  if (platform === "win32") return command("cmd.exe", ["/c", "start", "", url], "Open the official runtime recovery guide.", false);
  return command("xdg-open", [url], "Open the official runtime recovery guide.", false);
}

function command(
  exe: string,
  args: string[],
  rationale: string,
  destructive: boolean,
): AmbientMcpContainerRuntimeLifecycleCommand {
  return {
    exe,
    args,
    rationale,
    destructive,
  };
}

function commandWithCandidates(
  candidateExecutables: string[],
  args: string[],
  rationale: string,
  destructive: boolean,
): AmbientMcpContainerRuntimeLifecycleCommand {
  const [exe, ...fallbackExecutables] = unique(candidateExecutables);
  return {
    exe: exe ?? candidateExecutables[0] ?? "",
    ...(fallbackExecutables.length ? { candidateExecutables: fallbackExecutables } : {}),
    args,
    rationale,
    destructive,
  };
}

function recoveryUrl(runtime: LifecycleRuntime, platform: string): string {
  if (runtime === "docker" && platform === "linux") return "https://docs.docker.com/engine/install/linux-postinstall/";
  if (runtime === "docker") return "https://docs.docker.com/desktop/troubleshoot/";
  if (runtime === "podman") return "https://podman-desktop.io/docs/podman/creating-a-podman-machine";
  return "https://github.com/abiosoft/colima";
}

function phaseForCommand(
  commandPlan: AmbientMcpContainerRuntimeLifecycleCommand,
  action: AmbientMcpContainerRuntimeLifecycleAction,
): AmbientMcpContainerRuntimeLifecyclePhase {
  if (action === "force-quit-and-restart" && commandPlan.destructive) return "force-stop-started";
  if (/\b(?:quit|stop)\b/i.test(commandPlan.args.join(" ")) || /\bpkill|taskkill\b/i.test(commandPlan.exe)) return "graceful-stop-started";
  return "launch-started";
}

async function pollForReadyStatus(
  options: ContainerRuntimeLifecycleRunOptions,
  preview: AmbientMcpContainerRuntimeLifecyclePreview,
  pushProgress: (entry: Omit<AmbientMcpContainerRuntimeLifecycleProgress, "schemaVersion" | "action" | "runtime" | "recordedAt">) => void,
): Promise<{ after?: AmbientMcpContainerRuntimeStatus; pollCount: number }> {
  const pollAttempts = Math.max(1, Math.floor(options.pollAttempts ?? defaultPollAttempts));
  const pollIntervalMs = Math.max(0, Math.floor(options.pollIntervalMs ?? defaultPollIntervalMs));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let after: AmbientMcpContainerRuntimeStatus | undefined;
  for (let pollCount = 1; pollCount <= pollAttempts; pollCount += 1) {
    if (pollCount > 1 && pollIntervalMs > 0) await sleep(pollIntervalMs);
    after = await options.getStatus();
    pushProgress({
      phase: "probe-poll",
      status: after.status === "ready" ? "succeeded" : "running",
      message: after.status === "ready" ? `${runtimeLabel(preview.runtime)} is ready.` : after.message,
      pollCount,
    });
    if (after.status === "ready") return { after, pollCount };
  }
  return { after, pollCount: pollAttempts };
}

function lifecycleResult(input: {
  input: AmbientMcpContainerRuntimeLifecycleRunInput;
  preview: AmbientMcpContainerRuntimeLifecyclePreview;
  before?: AmbientMcpContainerRuntimeStatus;
  after?: AmbientMcpContainerRuntimeStatus;
  progress: AmbientMcpContainerRuntimeLifecycleProgress[];
  startedAt: number;
  status: AmbientMcpContainerRuntimeLifecycleResult["status"];
  reason: AmbientMcpContainerRuntimeProbeReason;
  message: string;
}): AmbientMcpContainerRuntimeLifecycleResult {
  return {
    schemaVersion: "ambient-container-runtime-lifecycle-result-v1",
    action: input.input.action,
    runtime: input.preview.runtime,
    status: input.status,
    reason: input.reason,
    message: input.message,
    preview: input.preview,
    ...(input.before ? { before: input.before } : {}),
    ...(input.after ? { after: input.after } : {}),
    progress: input.progress,
    durationMs: Math.max(0, Math.round(performance.now() - input.startedAt)),
  };
}

function commandFailureMessage(result: ContainerRuntimeLifecycleCommandRunResult): string {
  const output = [result.stderr, result.stdout].join("\n").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" ");
  return [
    `Container runtime lifecycle command failed: ${result.command.exe} ${result.command.args.join(" ")}`,
    `exit=${result.exitCode ?? "unknown"}`,
    result.errorCode ? `error=${result.errorCode}` : undefined,
    output ? `output=${output}` : undefined,
  ].filter(Boolean).join("; ");
}

function defaultContainerRuntimeLifecycleCommandRunner(
  input: ContainerRuntimeLifecycleCommandRunInput,
): Promise<ContainerRuntimeLifecycleCommandRunResult> {
  return runLifecycleCommandCandidate(input, unique([input.command.exe, ...(input.command.candidateExecutables ?? [])]));
}

async function runLifecycleCommandCandidate(
  input: ContainerRuntimeLifecycleCommandRunInput,
  executables: string[],
): Promise<ContainerRuntimeLifecycleCommandRunResult> {
  let lastResult: ContainerRuntimeLifecycleCommandRunResult | undefined;
  for (const executable of executables.length ? executables : [input.command.exe]) {
    const result = await runSingleLifecycleCommandExecutable(input, executable);
    lastResult = result;
    if (result.errorCode !== "ENOENT") return result;
  }
  return lastResult ?? runSingleLifecycleCommandExecutable(input, input.command.exe);
}

function runSingleLifecycleCommandExecutable(
  input: ContainerRuntimeLifecycleCommandRunInput,
  executable: string,
): Promise<ContainerRuntimeLifecycleCommandRunResult> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    execFile(executable, input.command.args, {
      ...(input.command.cwd ? { cwd: input.command.cwd } : {}),
      env: input.env,
      encoding: "utf8",
      timeout: input.timeoutMs,
      maxBuffer: maxOutputBufferBytes,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      const typedError = error as (Error & { code?: unknown }) | null;
      const exitCode = typeof typedError?.code === "number" ? typedError.code : typedError ? 1 : 0;
      resolve({
        command: {
          ...input.command,
          exe: executable,
        },
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        exitCode,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(typedError?.code ? { errorCode: String(typedError.code) } : {}),
      });
    });
  });
}

function runtimeLabel(runtime: LifecycleRuntime): string {
  if (runtime === "colima") return "Colima";
  return runtime[0].toUpperCase() + runtime.slice(1);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
