import { describe, expect, it, vi } from "vitest";
import {
  buildContainerRuntimeInstallPlan,
  buildContainerRuntimeInstallPlanFromProbe,
  launchContainerRuntimeInstallAction,
  type ContainerRuntimeInstallPlan,
} from "./containerRuntimeInstallLauncher";
import type { ContainerRuntimeProbeResult } from "./containerRuntimeProbeService";

describe("container runtime install launcher", () => {
  it("prefers Podman Desktop on macOS and keeps Docker as an alternative", () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "darwin", arch: "arm64", runtimeStatus: "missing", homebrewAvailable: false });

    expect(plan).toMatchObject({
      schemaVersion: "ambient-container-runtime-install-plan-v1",
      platform: "darwin",
      arch: "arm64",
      status: "missing",
      preferredRuntime: "podman",
      primaryAction: {
        id: "podman-desktop-macos",
        kind: "open-installer",
        runtime: "podman",
      },
    });
    expect(plan.primaryAction.url).toBe("https://podman-desktop.io/downloads");
    expect(plan.alternatives.map((action) => action.id)).toContain("docker-desktop-macos");
    expect(plan.alternatives.map((action) => action.id)).toContain("podman-desktop-macos-open");
    expect(plan.postInstallSteps.join("\n")).toContain("Open Podman Desktop from Applications");
    expect(plan.postInstallSteps.join("\n")).toContain("first-run onboarding");
    expect(plan.warnings.join("\n")).toContain("will not install software unless the user explicitly chooses");
  });

  it("uses a managed Homebrew install when macOS Homebrew is available", () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "darwin", arch: "arm64", runtimeStatus: "missing", homebrewAvailable: true });

    expect(plan.primaryAction).toMatchObject({
      id: "podman-desktop-macos-homebrew",
      kind: "managed-install",
      runtime: "podman",
      managedInstall: {
        execution: "user-command",
        strategy: "homebrew-cask-podman-desktop",
        commands: [{ exe: "brew", args: ["install", "--cask", "podman-desktop"] }],
      },
    });
    expect(plan.alternatives.map((action) => action.id)).toContain("podman-desktop-macos");
    expect(plan.warnings.join("\n")).toContain("exact package-manager commands");
  });

  it("uses a WSL-aware Podman Desktop plan on Windows", () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "win32", arch: "x64", runtimeStatus: "missing" });

    expect(plan.primaryAction).toMatchObject({
      id: "podman-desktop-windows-winget",
      kind: "managed-install",
      runtime: "podman",
      managedInstall: {
        execution: "privileged-action",
        strategy: "winget-podman-desktop",
      },
    });
    expect(plan.prerequisites.join("\n")).toContain("WSL 2");
    expect(plan.postInstallSteps.join("\n")).toContain("Start menu");
    expect(plan.postInstallSteps.join("\n")).toContain("WSL 2");
    expect(plan.alternatives.map((action) => action.id)).toContain("docker-desktop-windows-wsl");
  });

  it("uses a detected Linux package manager for managed Podman install", () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "linux", arch: "x64", runtimeStatus: "missing", linuxPackageManager: "apt-get" });

    expect(plan.primaryAction).toMatchObject({
      id: "podman-linux-apt-get",
      kind: "managed-install",
      runtime: "podman",
      managedInstall: {
        execution: "privileged-action",
        requiresCredential: true,
        commands: [
          { exe: "apt-get", args: ["update"] },
          { exe: "apt-get", args: ["install", "-y", "podman"] },
        ],
      },
    });
    expect(plan.summary).toContain("distro package manager");
    expect(plan.alternatives.map((action) => action.id)).toContain("docker-engine-linux-docs");
  });

  it("falls back to Linux documentation when no package manager is detected", () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "linux", arch: "x64", runtimeStatus: "missing", linuxPackageManager: null });

    expect(plan.primaryAction).toMatchObject({
      id: "podman-linux-docs",
      kind: "open-documentation",
      runtime: "podman",
    });
    expect(plan.alternatives.map((action) => action.id)).toContain("podman-linux-apt-get");
  });

  it("launches the selected action through the supplied external opener", async () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "darwin", arch: "arm64", runtimeStatus: "missing", homebrewAvailable: false });
    const openExternal = vi.fn(async (_url: string) => undefined);

    const result = await launchContainerRuntimeInstallAction(plan, {
      actionId: "podman-cli-macos-docs",
      openExternal,
    });

    expect(openExternal).toHaveBeenCalledWith("https://podman.io/docs/installation");
    expect(result).toMatchObject({
      schemaVersion: "ambient-container-runtime-install-launch-v1",
      launched: true,
      action: {
        id: "podman-cli-macos-docs",
      },
    });
  });

  it("executes managed install actions through the supplied managed installer", async () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "darwin", arch: "arm64", runtimeStatus: "missing", homebrewAvailable: true });
    const executeManagedInstall = vi.fn(async () => ({
      status: "succeeded" as const,
      message: "managed install complete",
      adapter: "ambient-user-command",
      commandCount: 1,
    }));
    const openExternal = vi.fn(async (_url: string) => undefined);

    const result = await launchContainerRuntimeInstallAction(plan, {
      openExternal,
      executeManagedInstall,
    });

    expect(executeManagedInstall).toHaveBeenCalledWith(plan.primaryAction, plan);
    expect(openExternal).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      launched: true,
      message: "managed install complete",
      managedResult: { status: "succeeded", adapter: "ambient-user-command" },
    });
  });

  it("builds a recovery action for installed but stopped Docker Desktop", async () => {
    const plan = buildContainerRuntimeInstallPlanFromProbe(probeResult({
      status: "installed-not-running",
      nextAction: "start-runtime",
      runtime: "docker",
      hosts: [{ kind: "docker", status: "installed-not-running", message: "daemon unavailable", commands: [] }],
    }));
    expect(plan).toMatchObject({
      status: "installed-not-running",
      preferredRuntime: "docker",
      primaryAction: {
        id: "docker-desktop-macos-start",
        kind: "open-runtime",
        runtime: "docker",
        applicationNames: ["Docker"],
      },
    });

    const openApplication = vi.fn(async (_names: string[]) => true);
    const openExternal = vi.fn(async (_url: string) => undefined);
    const result = await launchContainerRuntimeInstallAction(plan!, {
      openApplication,
      openExternal,
    });

    expect(openApplication).toHaveBeenCalledWith(["Docker"]);
    expect(openExternal).not.toHaveBeenCalled();
    expect(result.message).toContain("Wait for the runtime to finish starting");
  });

  it("builds Linux Docker post-install permission repair guidance", () => {
    const plan = buildContainerRuntimeInstallPlanFromProbe(probeResult({
      status: "blocked-by-permissions",
      nextAction: "repair-permissions",
      runtime: "docker",
      platform: "linux",
      arch: "x64",
      hosts: [{ kind: "docker", status: "permission-blocked", message: "permission denied on /var/run/docker.sock", commands: [] }],
    }));

    expect(plan).toMatchObject({
      platform: "linux",
      arch: "x64",
      status: "blocked-by-permissions",
      preferredRuntime: "docker",
      primaryAction: {
        id: "docker-engine-linux-postinstall-permissions",
        kind: "open-documentation",
        runtime: "docker",
        url: "https://docs.docker.com/engine/install/linux-postinstall/",
      },
    });
    expect(plan?.summary).toContain("cannot access the Docker daemon socket");
    expect(plan?.postInstallSteps.join("\n")).toContain("new login session");
  });

  it("falls back to recovery guidance when an installed runtime app cannot be opened", async () => {
    const plan = buildContainerRuntimeInstallPlanFromProbe(probeResult({
      status: "installed-not-running",
      nextAction: "start-runtime",
      runtime: "podman",
      hosts: [{ kind: "podman", status: "installed-not-running", message: "machine stopped", commands: [] }],
    }));
    const openApplication = vi.fn(async (_names: string[]) => false);
    const openExternal = vi.fn(async (_url: string) => undefined);

    const result = await launchContainerRuntimeInstallAction(plan!, {
      openApplication,
      openExternal,
    });

    expect(openApplication).toHaveBeenCalledWith(["Podman Desktop"]);
    expect(openExternal).toHaveBeenCalledWith("https://podman-desktop.io/docs/podman/creating-a-podman-machine");
    expect(result.message).toContain("Opened recovery guidance");
  });

  it("omits install plans when ToolHive itself needs repair", () => {
    expect(buildContainerRuntimeInstallPlanFromProbe(probeResult({ status: "ready", nextAction: "none" }))).toBeUndefined();
    expect(buildContainerRuntimeInstallPlanFromProbe(probeResult({ status: "unsupported", nextAction: "repair-toolhive" }))).toBeUndefined();
    expect(buildContainerRuntimeInstallPlanFromProbe(probeResult({ status: "missing", nextAction: "install-runtime" }))).toMatchObject({
      primaryAction: { runtime: "podman" },
    });
  });

  it("rejects unknown launch actions", async () => {
    const plan = buildContainerRuntimeInstallPlan({ platform: "linux", arch: "x64", runtimeStatus: "missing" });
    await expect(launchContainerRuntimeInstallAction(plan, {
      actionId: "not-real",
      openExternal: async () => undefined,
    })).rejects.toThrow("Unknown container runtime install action");
  });
});

function probeResult(input: {
  status: ContainerRuntimeProbeResult["status"];
  nextAction: ContainerRuntimeProbeResult["nextAction"];
  runtime?: ContainerRuntimeProbeResult["runtime"];
  platform?: string;
  arch?: string;
  hosts?: ContainerRuntimeProbeResult["hosts"];
}): ContainerRuntimeProbeResult {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: input.status,
    ...(input.runtime ? { runtime: input.runtime } : {}),
    platform: input.platform ?? "darwin",
    arch: input.arch ?? "arm64",
    checkedAt: "2026-05-23T20:00:00.000Z",
    durationMs: 1,
    message: "fixture",
    nextAction: input.nextAction,
    toolHive: {
      status: input.status === "unsupported" ? "missing" : "ready",
      message: "fixture",
    },
    hosts: input.hosts ?? [],
    postInstallQueue: [],
  };
}
