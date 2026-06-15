import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ContainerRuntimeProbeResult, ContainerRuntimeProbeStatus } from "./containerRuntimeProbeService";

export type ContainerRuntimeInstallActionKind = "open-installer" | "open-documentation" | "open-runtime" | "managed-install";
export type ContainerRuntimeInstallRuntime = "podman" | "docker";
export type ContainerRuntimeManagedInstallExecution = "user-command" | "privileged-action";
export type ContainerRuntimeLinuxPackageManager = "apt-get" | "dnf" | "zypper" | "pacman" | "apk";

export interface ContainerRuntimeManagedInstallCommand {
  exe: string;
  args: string[];
  cwd?: string;
  rationale: string;
}

export type ContainerRuntimeManagedInstallProgressPhase =
  | "dry-run-ready"
  | "starting"
  | "privileged-boundary"
  | "command-started"
  | "command-succeeded"
  | "command-failed"
  | "log-written"
  | "completed";

export interface ContainerRuntimeManagedInstallSpec {
  schemaVersion: "ambient-container-runtime-managed-install-v1";
  execution: ContainerRuntimeManagedInstallExecution;
  strategy: string;
  packageName: string;
  platform: "darwin" | "linux" | "win32";
  requiresCredential: boolean;
  commands: ContainerRuntimeManagedInstallCommand[];
  fallbackActionIds: string[];
}

export interface ContainerRuntimeManagedInstallResult {
  status: "succeeded" | "failed" | "blocked" | "not-executed" | "adapter-unavailable";
  message: string;
  adapter?: string;
  requestId?: string;
  commandCount?: number;
  credentialCapture?: string;
  logPath?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  redactedCommands?: ContainerRuntimeManagedInstallCommand[];
}

export interface ContainerRuntimeManagedInstallProgress {
  schemaVersion: "ambient-container-runtime-managed-install-progress-v1";
  actionId: string;
  actionLabel: string;
  runtime: ContainerRuntimeInstallRuntime;
  phase: ContainerRuntimeManagedInstallProgressPhase;
  message: string;
  adapter?: string;
  requestId?: string;
  commandIndex?: number;
  commandCount?: number;
  command?: ContainerRuntimeManagedInstallCommand;
  status?: ContainerRuntimeManagedInstallResult["status"];
  logPath?: string;
  recordedAt: string;
}

export interface ContainerRuntimeInstallAction {
  id: string;
  label: string;
  kind: ContainerRuntimeInstallActionKind;
  runtime: ContainerRuntimeInstallRuntime;
  url: string;
  reason: string;
  applicationNames?: string[];
  managedInstall?: ContainerRuntimeManagedInstallSpec;
}

export interface ContainerRuntimeInstallPlan {
  schemaVersion: "ambient-container-runtime-install-plan-v1";
  platform: string;
  arch: string;
  status: ContainerRuntimeProbeStatus | "unknown";
  preferredRuntime: ContainerRuntimeInstallRuntime;
  summary: string;
  primaryAction: ContainerRuntimeInstallAction;
  alternatives: ContainerRuntimeInstallAction[];
  prerequisites: string[];
  warnings: string[];
  postInstallSteps: string[];
}

export interface ContainerRuntimeInstallPlanOptions {
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
  runtimeStatus?: ContainerRuntimeProbeStatus | "unknown";
  homebrewAvailable?: boolean;
  homebrewExecutable?: string;
  linuxPackageManager?: ContainerRuntimeLinuxPackageManager | null;
  wingetAvailable?: boolean;
}

export interface ContainerRuntimeInstallLaunchResult {
  schemaVersion: "ambient-container-runtime-install-launch-v1";
  launched: true;
  action: ContainerRuntimeInstallAction;
  plan: ContainerRuntimeInstallPlan;
  message: string;
  managedResult?: ContainerRuntimeManagedInstallResult;
}

export interface ContainerRuntimeInstallLaunchOptions {
  actionId?: string;
  openExternal: (url: string) => Promise<void>;
  openApplication?: (applicationNames: string[]) => Promise<boolean>;
  executeManagedInstall?: (action: ContainerRuntimeInstallAction, plan: ContainerRuntimeInstallPlan) => Promise<ContainerRuntimeManagedInstallResult>;
}

const podmanDesktopDownloadsUrl = "https://podman-desktop.io/downloads";
const podmanInstallDocsUrl = "https://podman.io/docs/installation";
const podmanMachineDocsUrl = "https://podman-desktop.io/docs/podman/creating-a-podman-machine";
const dockerDesktopUrl = "https://www.docker.com/products/docker-desktop/";
const dockerDesktopTroubleshootUrl = "https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/";
const dockerDesktopWslUrl = "https://docs.docker.com/desktop/features/wsl/";
const dockerEngineInstallDocsUrl = "https://docs.docker.com/engine/install/";
const dockerEnginePostInstallDocsUrl = "https://docs.docker.com/engine/install/linux-postinstall/";
const colimaDocsUrl = "https://github.com/abiosoft/colima";

export function buildContainerRuntimeInstallPlan(options: ContainerRuntimeInstallPlanOptions = {}): ContainerRuntimeInstallPlan {
  const platform = String(options.platform ?? process.platform);
  const arch = String(options.arch ?? process.arch);
  const status = options.runtimeStatus ?? "unknown";
  const normalizedPlatform = normalizeRuntimePlatform(platform);
  if (normalizedPlatform === "darwin") {
    const detectedHomebrewExecutable = options.homebrewExecutable ?? (options.homebrewAvailable === undefined ? detectHomebrewExecutable(platform) : undefined);
    return planForMac({
      platform,
      arch,
      status,
      homebrewAvailable: options.homebrewAvailable ?? Boolean(detectedHomebrewExecutable),
      homebrewExecutable: options.homebrewExecutable ?? detectedHomebrewExecutable ?? "brew",
    });
  }
  if (normalizedPlatform === "win32") {
    return planForWindows({ platform, arch, status, wingetAvailable: options.wingetAvailable ?? true });
  }
  if (normalizedPlatform === "linux") {
    return planForLinux({
      platform,
      arch,
      status,
      linuxPackageManager: options.linuxPackageManager === undefined ? detectLinuxPackageManager(platform) : options.linuxPackageManager ?? undefined,
    });
  }
  return planForUnsupported({ platform, arch, status });
}

export async function launchContainerRuntimeInstallAction(
  plan: ContainerRuntimeInstallPlan,
  options: ContainerRuntimeInstallLaunchOptions,
): Promise<ContainerRuntimeInstallLaunchResult> {
  const action = [plan.primaryAction, ...plan.alternatives].find((candidate) => candidate.id === (options.actionId ?? plan.primaryAction.id));
  if (!action) throw new Error(`Unknown container runtime install action: ${options.actionId}`);
  if (action.kind === "managed-install") {
    if (!options.executeManagedInstall) throw new Error("Managed container runtime installation is unavailable in this Desktop build.");
    const managedResult = await options.executeManagedInstall(action, plan);
    return {
      schemaVersion: "ambient-container-runtime-install-launch-v1",
      launched: true,
      action,
      plan,
      message: managedResult.message,
      managedResult,
    };
  }
  if (action.kind === "open-runtime" && action.applicationNames?.length && options.openApplication) {
    const opened = await options.openApplication(action.applicationNames);
    if (opened) {
      return {
        schemaVersion: "ambient-container-runtime-install-launch-v1",
        launched: true,
        action,
        plan,
        message: `Opened ${action.label}. Wait for the runtime to finish starting, then refresh the MCP runtime check in Ambient.`,
      };
    }
  }
  await options.openExternal(action.url);
  return {
    schemaVersion: "ambient-container-runtime-install-launch-v1",
    launched: true,
    action,
    plan,
    message: action.kind === "open-runtime"
      ? `Opened recovery guidance for ${action.label}. After the runtime is running, refresh the MCP runtime check in Ambient.`
      : `Opened ${action.label}. After installation, start the runtime and refresh the MCP runtime check in Ambient.`,
  };
}

export function buildContainerRuntimeInstallPlanFromProbe(result: ContainerRuntimeProbeResult): ContainerRuntimeInstallPlan | undefined {
  if (result.status === "blocked-by-permissions" && result.nextAction === "repair-permissions") {
    return buildContainerRuntimePermissionPlanFromProbe(result);
  }
  if (result.status === "installed-not-running" && result.nextAction === "start-runtime") {
    return buildContainerRuntimeStartPlanFromProbe(result);
  }
  if (result.status !== "missing") return undefined;
  return buildContainerRuntimeInstallPlan({
    platform: result.platform,
    arch: result.arch,
    runtimeStatus: result.status,
  });
}

function buildContainerRuntimePermissionPlanFromProbe(result: ContainerRuntimeProbeResult): ContainerRuntimeInstallPlan {
  const host = result.hosts.find((candidate) => candidate.kind !== "wsl2" && candidate.status === "permission-blocked");
  const platform = result.platform;
  const arch = result.arch;
  if (host?.kind === "podman" || result.runtime === "podman") {
    return permissionBlockedPodmanPlan({ platform, arch, status: result.status });
  }
  return permissionBlockedDockerPlan({ platform, arch, status: result.status });
}

function buildContainerRuntimeStartPlanFromProbe(result: ContainerRuntimeProbeResult): ContainerRuntimeInstallPlan {
  const host = result.hosts.find((candidate) =>
    candidate.kind !== "wsl2" &&
    (candidate.status === "installed-not-running" || candidate.status === "installed")
  );
  const platform = result.platform;
  const arch = result.arch;
  if (host?.kind === "podman" || result.runtime === "podman") {
    return stoppedPodmanPlan({ platform, arch, status: result.status });
  }
  if (host?.kind === "colima" || result.runtime === "colima") {
    return stoppedColimaPlan({ platform, arch, status: result.status });
  }
  return stoppedDockerPlan({ platform, arch, status: result.status });
}

function permissionBlockedDockerPlan(input: { platform: string; arch: string; status: ContainerRuntimeInstallPlan["status"] }): ContainerRuntimeInstallPlan {
  const linux = input.platform === "linux";
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "docker",
    summary: linux
      ? "Docker is installed, but this Linux user cannot access the Docker daemon socket. Repair Docker post-install permissions, then refresh the MCP runtime check."
      : "Docker is installed, but Ambient cannot access the Docker runtime for this user. Repair Docker permissions, then refresh the MCP runtime check.",
    primaryAction: {
      id: linux ? "docker-engine-linux-postinstall-permissions" : "docker-permissions-help",
      label: linux ? "Open Docker Linux post-install permissions" : "Open Docker troubleshooting",
      kind: "open-documentation",
      runtime: "docker",
      url: linux ? dockerEnginePostInstallDocsUrl : dockerDesktopTroubleshootUrl,
      reason: linux
        ? "Docker Engine commonly requires post-install group or rootless setup before non-root users can access /var/run/docker.sock."
        : "Docker permission repair is platform-specific, so Ambient opens official troubleshooting instead of changing system settings.",
    },
    alternatives: [
      {
        id: "podman-linux-docs",
        label: "Open Podman Linux install guide",
        kind: "open-documentation",
        runtime: "podman",
        url: podmanInstallDocsUrl,
        reason: "Rootless Podman remains the preferred Linux fresh-install fallback when Docker socket permissions are not acceptable.",
      },
      {
        id: "docker-engine-linux-docs",
        label: "Open Docker Engine install guide",
        kind: "open-documentation",
        runtime: "docker",
        url: dockerEngineInstallDocsUrl,
        reason: "Use the install guide if Docker Engine itself needs to be repaired or reinstalled.",
      },
    ],
    prerequisites: linux ? ["Permission to update Docker user/group or rootless settings", "A new login session after group membership changes"] : ["Permission to repair Docker user access"],
    warnings: runtimeRecoveryWarnings("Docker"),
    postInstallSteps: linux
      ? ["Follow Docker's Linux post-install steps for non-root access", "Start a new login session if group membership changed", "Confirm docker info works for your user", "Return to Ambient and refresh the MCP runtime check"]
      : ["Repair Docker user access", "Confirm docker info works for this user", "Return to Ambient and refresh the MCP runtime check"],
  };
}

function permissionBlockedPodmanPlan(input: { platform: string; arch: string; status: ContainerRuntimeInstallPlan["status"] }): ContainerRuntimeInstallPlan {
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "podman",
    summary: "Podman is installed, but Ambient cannot access the Podman engine for this user. Repair the user session or rootless socket setup, then refresh the MCP runtime check.",
    primaryAction: {
      id: "podman-linux-permissions-docs",
      label: "Open Podman Linux setup help",
      kind: "open-documentation",
      runtime: "podman",
      url: podmanInstallDocsUrl,
      reason: "Rootless Podman access is distro and user-session specific, so Ambient opens official guidance instead of changing system services.",
    },
    alternatives: [
      {
        id: "podman-desktop-linux",
        label: "Open Podman Desktop download",
        kind: "open-installer",
        runtime: "podman",
        url: podmanDesktopDownloadsUrl,
        reason: "Podman Desktop can help repair or inspect local Podman machine state.",
      },
      {
        id: "docker-engine-linux-docs",
        label: "Open Docker Engine install guide",
        kind: "open-documentation",
        runtime: "docker",
        url: dockerEngineInstallDocsUrl,
        reason: "Docker Engine is accepted when Podman cannot be repaired and ToolHive preflight passes after setup.",
      },
    ],
    prerequisites: ["A supported rootless Podman setup", "Permission to repair the user service or socket state"],
    warnings: runtimeRecoveryWarnings("Podman"),
    postInstallSteps: ["Repair the Podman user service or socket", "Confirm podman info works for your user", "Return to Ambient and refresh the MCP runtime check"],
  };
}

function planForMac(input: {
  platform: string;
  arch: string;
  status: ContainerRuntimeInstallPlan["status"];
  homebrewAvailable: boolean;
  homebrewExecutable: string;
}): ContainerRuntimeInstallPlan {
  const officialInstaller: ContainerRuntimeInstallAction = {
    id: "podman-desktop-macos",
    label: "Open Podman Desktop download",
    kind: "open-installer",
    runtime: "podman",
    url: podmanDesktopDownloadsUrl,
    reason: "Podman Desktop provides a managed Podman machine on macOS without Docker Desktop licensing concerns.",
  };
  const managedHomebrew: ContainerRuntimeInstallAction = {
    id: "podman-desktop-macos-homebrew",
    label: "Install Podman Desktop with Homebrew",
    kind: "managed-install",
    runtime: "podman",
    url: "https://podman-desktop.io/downloads/macos",
    reason: "Homebrew can install the official Podman Desktop cask directly from Ambient after explicit user approval.",
    managedInstall: {
      schemaVersion: "ambient-container-runtime-managed-install-v1",
      execution: "user-command",
      strategy: "homebrew-cask-podman-desktop",
      packageName: "podman-desktop",
      platform: "darwin",
      requiresCredential: false,
      commands: [
        {
          exe: input.homebrewExecutable,
          args: ["install", "--cask", "podman-desktop"],
          rationale: "Install the official Podman Desktop Homebrew cask for the current macOS user.",
        },
      ],
      fallbackActionIds: [officialInstaller.id, "podman-cli-macos-docs"],
    },
  };
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "podman",
    summary: "Install Podman Desktop for an open, VM-backed container runtime that ToolHive can use on macOS. After installation, open Podman Desktop from Applications and finish its first-run machine setup before returning to Ambient.",
    primaryAction: input.homebrewAvailable ? managedHomebrew : officialInstaller,
    alternatives: [
      ...(input.homebrewAvailable ? [officialInstaller] : []),
      {
        id: "podman-desktop-macos-open",
        label: "Open Podman Desktop",
        kind: "open-runtime",
        runtime: "podman",
        url: podmanMachineDocsUrl,
        reason: "Use this after installation to complete Podman Desktop onboarding and start the default machine.",
        applicationNames: ["Podman Desktop"],
      },
      {
        id: "podman-cli-macos-docs",
        label: "Open Podman CLI install docs",
        kind: "open-documentation",
        runtime: "podman",
        url: podmanInstallDocsUrl,
        reason: "Use this if you prefer Homebrew or another command-line install path.",
      },
      {
        id: "docker-desktop-macos",
        label: "Open Docker Desktop download",
        kind: "open-installer",
        runtime: "docker",
        url: dockerDesktopUrl,
        reason: "Docker Desktop is accepted when already used on this Mac, but Ambient should not make it the default fresh install path.",
      },
    ],
    prerequisites: ["macOS virtualization support", "Permission to install a desktop application"],
    warnings: input.homebrewAvailable ? managedInstallerWarnings() : safeLauncherWarnings(),
    postInstallSteps: [
      "Open Podman Desktop from Applications after the installer finishes",
      "Complete first-run onboarding and approve macOS virtualization prompts if shown",
      "Create or start the default Podman machine when Podman Desktop asks",
      "Wait until Podman Desktop reports Podman is running, or until podman info succeeds",
      "Return to Ambient and refresh the MCP runtime check",
    ],
  };
}

function planForWindows(input: {
  platform: string;
  arch: string;
  status: ContainerRuntimeInstallPlan["status"];
  wingetAvailable: boolean;
}): ContainerRuntimeInstallPlan {
  const wingetInstall: ContainerRuntimeInstallAction = {
    id: "podman-desktop-windows-winget",
    label: "Install Podman Desktop with WinGet",
    kind: "managed-install",
    runtime: "podman",
    url: "https://podman-desktop.io/docs/installation/windows-install",
    reason: "WinGet is the supported Windows package-manager path for Podman Desktop and keeps setup inside an OS-reviewed installer flow.",
    managedInstall: {
      schemaVersion: "ambient-container-runtime-managed-install-v1",
      execution: "privileged-action",
      strategy: "winget-podman-desktop",
      packageName: "RedHat.Podman-Desktop",
      platform: "win32",
      requiresCredential: false,
      commands: [
        {
          exe: "winget",
          args: ["install", "--exact", "--id", "RedHat.Podman-Desktop", "--accept-package-agreements", "--accept-source-agreements"],
          rationale: "Install the official Red Hat Podman Desktop package through Windows Package Manager.",
        },
      ],
      fallbackActionIds: ["podman-desktop-windows", "podman-windows-docs"],
    },
  };
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "podman",
    summary: "Install Podman Desktop with WSL 2 support so ToolHive can run isolated MCP plugin containers on Windows. Docker Desktop with the WSL 2 backend is also supported when it is already installed and running.",
    primaryAction: input.wingetAvailable ? wingetInstall : {
      id: "podman-desktop-windows",
      label: "Open Podman Desktop download",
      kind: "open-installer",
      runtime: "podman",
      url: podmanDesktopDownloadsUrl,
      reason: "Podman Desktop is the preferred default because it supports Windows without making Docker Desktop licensing assumptions.",
    },
    alternatives: [
      ...(input.wingetAvailable ? [{
        id: "podman-desktop-windows",
        label: "Open Podman Desktop download",
        kind: "open-installer" as const,
        runtime: "podman" as const,
        url: podmanDesktopDownloadsUrl,
        reason: "Use the official installer if WinGet is missing, blocked by policy, or fails.",
      }] : []),
      {
        id: "podman-windows-docs",
        label: "Open Podman Windows install docs",
        kind: "open-documentation",
        runtime: "podman",
        url: podmanInstallDocsUrl,
        reason: "Use the docs when WSL 2 or virtualization needs manual setup first.",
      },
      {
        id: "docker-desktop-windows",
        label: "Open Docker Desktop download",
        kind: "open-installer",
        runtime: "docker",
        url: dockerDesktopUrl,
        reason: "Docker Desktop is accepted when users already rely on it and its WSL 2 backend is healthy.",
      },
      {
        id: "docker-desktop-windows-wsl",
        label: "Open Docker Desktop WSL 2 setup",
        kind: "open-documentation",
        runtime: "docker",
        url: dockerDesktopWslUrl,
        reason: "Docker Desktop must be running with a healthy WSL 2 backend before ToolHive can run Linux containers on Windows.",
      },
    ],
    prerequisites: ["Windows virtualization enabled", "WSL 2 available and healthy", "Permission to install a desktop application"],
    warnings: input.wingetAvailable ? managedInstallerWarnings() : safeLauncherWarnings(),
    postInstallSteps: [
      "Open Podman Desktop from the Start menu after installation",
      "Complete first-run onboarding and allow WSL 2 setup or repair if prompted",
      "Create or start the default Podman machine and wait until Podman reports it is running",
      "If using Docker Desktop instead, open Docker Desktop and wait until the WSL 2 backend is running",
      "Return to Ambient and refresh the MCP runtime check",
    ],
  };
}

function planForLinux(input: {
  platform: string;
  arch: string;
  status: ContainerRuntimeInstallPlan["status"];
  linuxPackageManager?: ContainerRuntimeLinuxPackageManager;
}): ContainerRuntimeInstallPlan {
  const docsAction: ContainerRuntimeInstallAction = {
    id: "podman-linux-docs",
    label: "Open Podman Linux install guide",
    kind: "open-documentation",
    runtime: "podman",
    url: podmanInstallDocsUrl,
    reason: "Use the official guide if the detected package manager is wrong, unavailable, or blocked by organization policy.",
  };
  const managedActions = linuxManagedInstallActions();
  const preferredManagedAction = input.linuxPackageManager ? managedActions.find((action) => action.id === `podman-linux-${input.linuxPackageManager}`) : undefined;
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "podman",
    summary: "Install rootless Podman through your distro package manager so ToolHive can run isolated MCP plugin containers.",
    primaryAction: preferredManagedAction ?? docsAction,
    alternatives: [
      ...(preferredManagedAction ? [docsAction] : managedActions),
      ...(preferredManagedAction ? managedActions.filter((action) => action.id !== preferredManagedAction.id) : []),
      {
        id: "docker-engine-linux-docs",
        label: "Open Docker Engine install guide",
        kind: "open-documentation",
        runtime: "docker",
        url: dockerEngineInstallDocsUrl,
        reason: "Docker Engine is accepted when users prefer or already operate Docker on Linux.",
      },
      {
        id: "podman-desktop-linux",
        label: "Open Podman Desktop download",
        kind: "open-installer",
        runtime: "podman",
        url: podmanDesktopDownloadsUrl,
        reason: "Podman Desktop can help users who prefer a graphical runtime manager.",
      },
    ],
    prerequisites: ["A supported Linux distribution", "Permission to install packages", "Rootless Podman support where available"],
    warnings: preferredManagedAction ? managedInstallerWarnings() : safeLauncherWarnings(),
    postInstallSteps: ["Install Podman from your distro packages", "Confirm podman info works for your user", "Return to Ambient and refresh the MCP runtime check"],
  };
}

function stoppedDockerPlan(input: { platform: string; arch: string; status: ContainerRuntimeInstallPlan["status"] }): ContainerRuntimeInstallPlan {
  const desktopPlatform = input.platform === "darwin" || input.platform === "win32";
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "docker",
    summary: desktopPlatform
      ? "Docker is installed but not running. Open Docker Desktop, wait for it to finish starting, then refresh the MCP runtime check."
      : "Docker is installed but ToolHive cannot reach the daemon. Start or repair the Docker service, then refresh the MCP runtime check.",
    primaryAction: desktopPlatform
      ? {
          id: `${input.platform === "win32" ? "docker-desktop-windows" : "docker-desktop-macos"}-start`,
          label: "Open Docker Desktop",
          kind: "open-runtime",
          runtime: "docker",
          url: dockerDesktopTroubleshootUrl,
          reason: "The Docker CLI is present, but the daemon is not reachable. Opening Docker Desktop is the usual recovery path.",
          applicationNames: input.platform === "win32" ? ["Docker Desktop"] : ["Docker"],
        }
      : {
          id: "docker-engine-linux-start-docs",
          label: "Open Docker Engine start help",
          kind: "open-documentation",
          runtime: "docker",
          url: dockerEnginePostInstallDocsUrl,
          reason: "Docker Engine service startup is distro-specific, so Ambient opens official post-install guidance instead of running privileged service commands.",
        },
    alternatives: [
      {
        id: "docker-desktop-troubleshooting",
        label: "Open Docker troubleshooting",
        kind: "open-documentation",
        runtime: "docker",
        url: dockerDesktopTroubleshootUrl,
        reason: "Use the official Docker troubleshooting guide if opening Docker Desktop does not make the daemon reachable.",
      },
      {
        id: "podman-desktop-download",
        label: "Open Podman Desktop download",
        kind: "open-installer",
        runtime: "podman",
        url: podmanDesktopDownloadsUrl,
        reason: "Podman remains the preferred fresh-install fallback when Docker cannot be repaired.",
      },
    ],
    prerequisites: desktopPlatform ? ["Docker Desktop installed for this user"] : ["Permission to start or inspect the Docker service"],
    warnings: runtimeRecoveryWarnings("Docker"),
    postInstallSteps: desktopPlatform
      ? ["Wait until Docker Desktop reports that the engine is running", "Return to Ambient and refresh the MCP runtime check"]
      : ["Start the Docker daemon using your distro's supported service manager", "Confirm docker info works for your user", "Return to Ambient and refresh the MCP runtime check"],
  };
}

function stoppedPodmanPlan(input: { platform: string; arch: string; status: ContainerRuntimeInstallPlan["status"] }): ContainerRuntimeInstallPlan {
  const desktopPlatform = input.platform === "darwin" || input.platform === "win32";
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "podman",
    summary: desktopPlatform
      ? "Podman is installed but its machine is not running. Open Podman Desktop, start the default machine if needed, then refresh the MCP runtime check."
      : "Podman is installed but the engine is not reachable. Start the rootless service or repair the user session, then refresh the MCP runtime check.",
    primaryAction: desktopPlatform
      ? {
          id: `${input.platform === "win32" ? "podman-desktop-windows" : "podman-desktop-macos"}-start`,
          label: "Open Podman Desktop",
          kind: "open-runtime",
          runtime: "podman",
          url: podmanMachineDocsUrl,
          reason: "The Podman CLI is present, but the engine is not reachable. Opening Podman Desktop exposes the machine start/repair UI.",
          applicationNames: ["Podman Desktop"],
        }
      : {
          id: "podman-linux-start-docs",
          label: "Open Podman start help",
          kind: "open-documentation",
          runtime: "podman",
          url: podmanInstallDocsUrl,
          reason: "Linux Podman startup is distro and user-session specific, so Ambient opens official guidance instead of running privileged service commands.",
        },
    alternatives: [
      {
        id: "podman-machine-docs",
        label: "Open Podman machine help",
        kind: "open-documentation",
        runtime: "podman",
        url: podmanMachineDocsUrl,
        reason: "Use this if Podman Desktop opens but the default machine still needs to be created or started.",
      },
      {
        id: "docker-desktop-download",
        label: "Open Docker Desktop download",
        kind: "open-installer",
        runtime: "docker",
        url: dockerDesktopUrl,
        reason: "Docker Desktop is accepted if the user already prefers Docker and ToolHive preflight passes after startup.",
      },
    ],
    prerequisites: desktopPlatform ? ["Podman Desktop installed for this user"] : ["A rootless Podman setup supported by your distribution"],
    warnings: runtimeRecoveryWarnings("Podman"),
    postInstallSteps: desktopPlatform
      ? input.platform === "darwin"
        ? ["Open Podman Desktop from Applications", "Complete first-run onboarding if it has not run yet", "Start or create the default Podman machine if prompted", "Wait until Podman reports it is running or podman info succeeds", "Return to Ambient and refresh the MCP runtime check"]
        : ["Open Podman Desktop from the Start menu", "Complete first-run onboarding and WSL 2 repair if prompted", "Start or create the default Podman machine if prompted", "Wait until Podman reports it is running or podman info succeeds", "Return to Ambient and refresh the MCP runtime check"]
      : ["Start the Podman user service or repair the user session", "Confirm podman info works for your user", "Return to Ambient and refresh the MCP runtime check"],
  };
}

function stoppedColimaPlan(input: { platform: string; arch: string; status: ContainerRuntimeInstallPlan["status"] }): ContainerRuntimeInstallPlan {
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "docker",
    summary: "Colima is installed but its VM is not running. Start Colima, then refresh the MCP runtime check.",
    primaryAction: {
      id: "colima-start-docs",
      label: "Open Colima start help",
      kind: "open-documentation",
      runtime: "docker",
      url: colimaDocsUrl,
      reason: "Colima is usually started from the CLI, so Ambient opens the project guidance instead of running commands on the user's behalf.",
    },
    alternatives: [
      {
        id: "docker-desktop-macos",
        label: "Open Docker Desktop download",
        kind: "open-installer",
        runtime: "docker",
        url: dockerDesktopUrl,
        reason: "Docker Desktop remains a compatible fallback if the user wants a managed Docker runtime.",
      },
      {
        id: "podman-desktop-macos",
        label: "Open Podman Desktop download",
        kind: "open-installer",
        runtime: "podman",
        url: podmanDesktopDownloadsUrl,
        reason: "Podman Desktop is the preferred fresh-install fallback when Colima cannot be repaired.",
      },
    ],
    prerequisites: ["Colima installed for this user"],
    warnings: runtimeRecoveryWarnings("Colima"),
    postInstallSteps: ["Start Colima from your terminal", "Confirm docker info works for your user", "Return to Ambient and refresh the MCP runtime check"],
  };
}

function planForUnsupported(input: { platform: string; arch: string; status: ContainerRuntimeInstallPlan["status"] }): ContainerRuntimeInstallPlan {
  return {
    schemaVersion: "ambient-container-runtime-install-plan-v1",
    platform: input.platform,
    arch: input.arch,
    status: input.status,
    preferredRuntime: "podman",
    summary: "Ambient does not yet have a guided container runtime installer for this platform.",
    primaryAction: {
      id: "podman-install-docs",
      label: "Open Podman install docs",
      kind: "open-documentation",
      runtime: "podman",
      url: podmanInstallDocsUrl,
      reason: "The official Podman docs are the safest fallback when Ambient cannot identify a platform-specific installer.",
    },
    alternatives: [
      {
        id: "docker-engine-docs",
        label: "Open Docker install docs",
        kind: "open-documentation",
        runtime: "docker",
        url: dockerEngineInstallDocsUrl,
        reason: "Docker remains a compatible fallback if ToolHive preflight passes after installation.",
      },
    ],
    prerequisites: ["A ToolHive-compatible container runtime supported by your operating system"],
    warnings: safeLauncherWarnings(),
    postInstallSteps: ["Install and start a compatible runtime", "Return to Ambient and refresh the MCP runtime check"],
  };
}

function safeLauncherWarnings(): string[] {
  return [
    "Ambient will not install software unless the user explicitly chooses an install action.",
    "Only approve installer prompts from the runtime vendor you selected.",
    "Custom MCP plugin installs remain blocked until ToolHive preflight passes after installation.",
  ];
}

function managedInstallerWarnings(): string[] {
  return [
    "Ambient runs only the exact package-manager commands shown in the setup review after explicit user approval.",
    "Admin credentials, when required, are captured by Ambient or the operating system prompt and are never sent to Pi, saved, logged, or included in tool results.",
    "If the managed install fails, use the official installer or documentation fallback from the same setup panel.",
  ];
}

function runtimeRecoveryWarnings(runtimeName: string): string[] {
  return [
    `Ambient can open ${runtimeName} or vendor recovery guidance, but it will not silently start privileged services or change daemon settings.`,
    "Custom MCP plugin installs remain blocked until ToolHive preflight passes after recovery.",
    "After the runtime starts, Ambient will continue into Scrapling default capability setup.",
  ];
}

function normalizeRuntimePlatform(platform: string): "darwin" | "win32" | "linux" | "unsupported" {
  if (platform === "darwin" || platform === "win32" || platform === "linux") return platform;
  return "unsupported";
}

function linuxManagedInstallActions(): ContainerRuntimeInstallAction[] {
  return [
    linuxManagedInstallAction("apt-get", "Install Podman with apt", [
      { exe: "apt-get", args: ["update"], rationale: "Refresh Debian/Ubuntu package metadata before installing Podman." },
      { exe: "apt-get", args: ["install", "-y", "podman"], rationale: "Install Podman from Debian/Ubuntu packages." },
    ]),
    linuxManagedInstallAction("dnf", "Install Podman with dnf", [
      { exe: "dnf", args: ["-y", "install", "podman"], rationale: "Install Podman from Fedora/RHEL-family packages." },
    ]),
    linuxManagedInstallAction("zypper", "Install Podman with zypper", [
      { exe: "zypper", args: ["--non-interactive", "install", "podman"], rationale: "Install Podman from SUSE/openSUSE packages." },
    ]),
    linuxManagedInstallAction("pacman", "Install Podman with pacman", [
      { exe: "pacman", args: ["-S", "--noconfirm", "podman"], rationale: "Install Podman from Arch/Manjaro packages." },
    ]),
    linuxManagedInstallAction("apk", "Install Podman with apk", [
      { exe: "apk", args: ["add", "podman"], rationale: "Install Podman from Alpine packages." },
    ]),
  ];
}

function linuxManagedInstallAction(
  packageManager: ContainerRuntimeLinuxPackageManager,
  label: string,
  commands: ContainerRuntimeManagedInstallCommand[],
): ContainerRuntimeInstallAction {
  return {
    id: `podman-linux-${packageManager}`,
    label,
    kind: "managed-install",
    runtime: "podman",
    url: podmanInstallDocsUrl,
    reason: `Use ${packageManager} to install Podman through the distro package manager after explicit approval.`,
    managedInstall: {
      schemaVersion: "ambient-container-runtime-managed-install-v1",
      execution: "privileged-action",
      strategy: `linux-${packageManager}-podman`,
      packageName: "podman",
      platform: "linux",
      requiresCredential: true,
      commands,
      fallbackActionIds: ["podman-linux-docs"],
    },
  };
}

function detectHomebrewExecutable(platform: string): string | undefined {
  if (platform !== process.platform || process.platform !== "darwin") return undefined;
  const pathExecutable = commandOnPath("brew");
  if (pathExecutable) return pathExecutable;
  if (existsSync("/opt/homebrew/bin/brew")) return "/opt/homebrew/bin/brew";
  if (existsSync("/usr/local/bin/brew")) return "/usr/local/bin/brew";
  return undefined;
}

function detectLinuxPackageManager(platform: string): ContainerRuntimeLinuxPackageManager | undefined {
  if (platform !== process.platform || process.platform !== "linux") return undefined;
  for (const packageManager of ["apt-get", "dnf", "zypper", "pacman", "apk"] as const) {
    if (commandExistsOnPath(packageManager)) return packageManager;
  }
  return undefined;
}

function commandExistsOnPath(executable: string): boolean {
  return Boolean(commandOnPath(executable));
}

function commandOnPath(executable: string): string | undefined {
  for (const entry of (process.env.PATH ?? "").split(":")) {
    if (!entry) continue;
    const candidate = join(entry, executable);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}
