import { describe, expect, it } from "vitest";
import {
  containerRuntimeProbeSummary,
  probeContainerRuntime,
  type ContainerRuntimeCommandInvocation,
  type ContainerRuntimeCommandResult,
  type ContainerRuntimeCommandRunner,
  type ContainerRuntimeToolHiveClient,
} from "./containerRuntimeProbeService";
import type { ToolHiveCommandResult, ToolHiveRuntimePreflight } from "./containerRuntimeToolRuntimeFacade";

describe("container runtime probe service", () => {
  it("classifies a ToolHive-verified Docker runtime as ready and queues Scrapling", async () => {
    const runner = fakeRunner({
      "docker --version": okCommand("docker", ["--version"], "Docker version 27.3.1\n"),
      "docker info --format {{json .ServerVersion}}": okCommand("docker", ["info", "--format", "{{json .ServerVersion}}"], "\"27.3.1\"\n"),
      "podman --version": missingCommand("podman", ["--version"]),
    });

    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: true }),
      platform: "linux",
      arch: "x64",
      commandRunner: runner,
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "ready",
      reason: "none",
      runtime: "docker",
      checkedAt: "2026-05-23T20:00:00.000Z",
      postInstallQueue: [{ kind: "default-capability", capabilityId: "scrapling", status: "queued" }],
      toolHive: {
        status: "ready",
        preflight: { ok: true },
      },
    });
    expect(result.hosts.find((host) => host.kind === "docker")).toMatchObject({
      status: "ready",
      reason: "none",
      version: "27.3.1",
    });
    expect(containerRuntimeProbeSummary(result)).toContain("Post-install queue: scrapling=queued");
  });

  it("starts host probes while ToolHive probing is still pending", async () => {
    let releaseToolHiveVersion: () => void = () => undefined;
    const toolHiveVersionGate = new Promise<void>((resolve) => {
      releaseToolHiveVersion = resolve;
    });
    let hostProbeStarted = false;
    const toolHive: ContainerRuntimeToolHiveClient = {
      async version() {
        await toolHiveVersionGate;
        return toolHiveCommand("version", ["version"], "ToolHive v0.28.2\n", "", 0);
      },
      async preflightRuntime() {
        const command = toolHiveCommand("runtime-check", ["runtime", "check", "--timeout", "5"], "", "no runtime available", 1);
        return {
          ok: false,
          message: "no runtime available",
          command,
        };
      },
    };
    const result = await withTimeout(probeContainerRuntime({
      toolHive,
      platform: "linux",
      arch: "x64",
      commandRunner: async (invocation) => {
        if (invocation.command === "docker" && invocation.args[0] === "--version") {
          hostProbeStarted = true;
          releaseToolHiveVersion();
        }
        return missingCommand(invocation.command, invocation.args);
      },
      processDiscoveryRunner: fakeRunner({
        "/bin/ps -axo pid=,args=": okCommand("/bin/ps", ["-axo", "pid=,args="], ""),
      }),
      now: fixedNow,
    }), 1_000, "host probes did not start until ToolHive probing finished");

    expect(hostProbeStarted).toBe(true);
    expect(result).toMatchObject({
      status: "missing",
      nextAction: "install-runtime",
    });
  });

  it("classifies a missing host as install-runtime when ToolHive preflight fails", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "no container runtime found" }),
      platform: "linux",
      arch: "x64",
      commandRunner: fakeRunner({
        "docker --version": missingCommand("docker", ["--version"]),
        "podman --version": missingCommand("podman", ["--version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "missing",
      reason: "runtime-missing",
      nextAction: "install-runtime",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
    expect(result.message).toContain("No ready Docker, Podman");
  });

  it("classifies an installed but stopped Docker daemon as start-runtime", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "docker daemon unavailable" }),
      platform: "linux",
      arch: "x64",
      commandRunner: fakeRunner({
        "docker --version": okCommand("docker", ["--version"], "Docker version 27.3.1\n"),
        "docker info --format {{json .ServerVersion}}": failedCommand("docker", ["info", "--format", "{{json .ServerVersion}}"], "Cannot connect to the Docker daemon"),
        "podman --version": missingCommand("podman", ["--version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "installed-not-running",
      reason: "daemon-unreachable",
      runtime: "docker",
      nextAction: "start-runtime",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
    expect(result.message).toContain("Docker appears installed");
    expect(result.message).toContain("Start or repair");
    expect(containerRuntimeProbeSummary(result)).toContain("Reason: daemon-unreachable");
  });

  it("does not treat Docker Desktop's empty formatted info response as ready", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "no container runtime available" }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": okCommand("docker", ["--version"], "Docker version 27.5.0\n"),
        "docker info --format {{json .ServerVersion}}": commandResult(
          "docker",
          ["info", "--format", "{{json .ServerVersion}}"],
          "\"\"\n",
          "Cannot connect to the Docker daemon at unix:///Users/example/.docker/run/docker.sock. Is the docker daemon running?\n",
          0,
        ),
        "podman --version": missingCommand("podman", ["--version"]),
        "colima version": missingCommand("colima", ["version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "installed-not-running",
      reason: "daemon-unreachable",
      runtime: "docker",
      nextAction: "start-runtime",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
    expect(result.hosts.find((host) => host.kind === "docker")).toMatchObject({
      status: "installed-not-running",
      reason: "daemon-unreachable",
      version: "27.5.0",
    });
    expect(result.message).toContain("Docker Desktop must be open");
    expect(containerRuntimeProbeSummary(result)).toContain("docker: installed-not-running");
  });

  it("finds Podman installed at a Homebrew absolute path when the app PATH is sparse", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: true }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": missingCommand("docker", ["--version"]),
        "/opt/homebrew/bin/docker --version": missingCommand("/opt/homebrew/bin/docker", ["--version"]),
        "/usr/local/bin/docker --version": missingCommand("/usr/local/bin/docker", ["--version"]),
        "podman --version": missingCommand("podman", ["--version"]),
        "/opt/homebrew/bin/podman --version": okCommand("/opt/homebrew/bin/podman", ["--version"], "podman version 5.5.0\n"),
        "/opt/homebrew/bin/podman info --format json": okCommand("/opt/homebrew/bin/podman", ["info", "--format", "json"], "{}\n"),
        "colima version": missingCommand("colima", ["version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "ready",
      reason: "none",
      runtime: "podman",
    });
    expect(result.hosts.find((host) => host.kind === "podman")).toMatchObject({
      status: "ready",
      reason: "none",
      message: expect.stringContaining("/opt/homebrew/bin/podman"),
    });
  });

  it("finds Podman installed at the macOS Podman Desktop pkg path when the app PATH is sparse", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: true }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "podman --version": missingCommand("podman", ["--version"]),
        "/opt/podman/bin/podman --version": okCommand("/opt/podman/bin/podman", ["--version"], "podman version 5.8.2\n"),
        "/opt/podman/bin/podman info --format json": okCommand("/opt/podman/bin/podman", ["info", "--format", "json"], "{}\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "ready",
      reason: "none",
      runtime: "podman",
    });
    expect(result.hosts.find((host) => host.kind === "podman")).toMatchObject({
      status: "ready",
      version: "5.8.2",
      message: expect.stringContaining("/opt/podman/bin/podman"),
    });
  });

  it("uses a trusted running process location as an additional CLI candidate", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: true }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": missingCommand("docker", ["--version"]),
        "/Applications/Docker.app/Contents/Resources/bin/docker --version": missingCommand("/Applications/Docker.app/Contents/Resources/bin/docker", ["--version"]),
        "/Applications/Docker.app/Contents/Resources/docker --version": okCommand("/Applications/Docker.app/Contents/Resources/docker", ["--version"], "Docker version 29.0.0\n"),
        "/Applications/Docker.app/Contents/Resources/docker info --format {{json .ServerVersion}}": okCommand("/Applications/Docker.app/Contents/Resources/docker", ["info", "--format", "{{json .ServerVersion}}"], "\"29.0.0\"\n"),
        "podman --version": missingCommand("podman", ["--version"]),
        "colima version": missingCommand("colima", ["version"]),
      }),
      processDiscoveryRunner: fakeRunner({
        "/bin/ps -axo pid=,args=": okCommand("/bin/ps", ["-axo", "pid=,args="], "424 /Applications/Docker.app/Contents/MacOS/Docker\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "ready",
      reason: "none",
      runtime: "docker",
      processHints: [expect.objectContaining({
        kind: "docker",
        applicationPath: "/Applications/Docker.app",
      })],
    });
    expect(result.hosts.find((host) => host.kind === "docker")).toMatchObject({
      status: "ready",
      version: "29.0.0",
      message: expect.stringContaining("/Applications/Docker.app/Contents/Resources/docker"),
    });
  });

  it("does not mark a runtime ready from a desktop process alone", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "no runtime available" }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "podman --version": missingCommand("podman", ["--version"]),
      }),
      processDiscoveryRunner: fakeRunner({
        "/bin/ps -axo pid=,args=": okCommand(
          "/bin/ps",
          ["-axo", "pid=,args="],
          "101 /Applications/Podman Desktop.app/Contents/MacOS/Podman Desktop\n",
        ),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "missing",
      reason: "runtime-missing",
      nextAction: "install-runtime",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
      processHints: [expect.objectContaining({
        kind: "podman",
        applicationPath: "/Applications/Podman Desktop.app",
      })],
    });
    expect(result.message).toContain("No ready Docker, Podman, or ToolHive-compatible container runtime was detected");
    expect(result.hosts.find((host) => host.kind === "podman")?.message).toContain("process was detected");
    expect(result.hosts.find((host) => host.kind === "podman")?.message).toContain("CLI was not found");
    expect(containerRuntimeProbeSummary(result)).toContain("Detected runtime processes:");
  });

  it("does not suppress install guidance for an untrusted process path", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "no container runtime found" }),
      platform: "linux",
      arch: "x64",
      commandRunner: fakeRunner({
        "docker --version": missingCommand("docker", ["--version"]),
        "podman --version": missingCommand("podman", ["--version"]),
      }),
      processDiscoveryRunner: fakeRunner({
        "/bin/ps -axo pid=,args=": okCommand("/bin/ps", ["-axo", "pid=,args="], "515 /tmp/podman sleep 1000\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "missing",
      reason: "runtime-missing",
      nextAction: "install-runtime",
      processHints: [expect.objectContaining({
        kind: "podman",
        executablePath: "/tmp/podman",
      })],
    });
    expect(result.hosts.find((host) => host.kind === "podman")).toMatchObject({
      status: "missing",
    });
  });

  it("separates a ready host runtime from a failing ToolHive runtime preflight", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "registered runtimes: docker, kubernetes" }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": missingCommand("docker", ["--version"]),
        "podman --version": okCommand("podman", ["--version"], "podman version 5.8.2\n"),
        "podman info --format json": okCommand("podman", ["info", "--format", "json"], "{}\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "blocked-by-policy",
      reason: "toolhive-runtime-unavailable",
      runtime: "podman",
      nextAction: "open-settings",
    });
    expect(result.message).toContain("Podman is installed and reachable");
    expect(result.message).toContain("ToolHive could not use it");
    expect(result.message).toContain("before reinstalling");
  });

  it("prefers a repairable stopped runtime over an unrelated ready host when ToolHive preflight fails", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "podman machine is stopped" }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": okCommand("docker", ["--version"], "Docker version 28.1.1\n"),
        "docker info --format {{json .ServerVersion}}": okCommand("docker", ["info", "--format", "{{json .ServerVersion}}"], "\"28.1.1\"\n"),
        "podman --version": okCommand("podman", ["--version"], "podman version 5.8.2\n"),
        "podman info --format json": failedCommand("podman", ["info", "--format", "json"], "machine is stopped"),
        "podman machine list --format json": okCommand("podman", ["machine", "list", "--format", "json"], "[]\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "installed-not-running",
      reason: "machine-stopped",
      runtime: "podman",
      nextAction: "start-runtime",
    });
    expect(result.message).toContain("Start or repair");
  });

  it("keeps the ready-host ToolHive diagnosis when a stopped runtime is not implicated", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "runtime unavailable" }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": okCommand("docker", ["--version"], "Docker version 28.1.1\n"),
        "docker info --format {{json .ServerVersion}}": okCommand("docker", ["info", "--format", "{{json .ServerVersion}}"], "\"28.1.1\"\n"),
        "podman --version": okCommand("podman", ["--version"], "podman version 5.8.2\n"),
        "podman info --format json": failedCommand("podman", ["info", "--format", "json"], "machine is stopped"),
        "podman machine list --format json": okCommand("podman", ["machine", "list", "--format", "json"], "[]\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "blocked-by-policy",
      reason: "toolhive-runtime-unavailable",
      runtime: "docker",
      nextAction: "open-settings",
    });
    expect(result.message).toContain("Docker is installed and reachable");
  });

  it("finds Colima installed at a Homebrew absolute path when the app PATH is sparse", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "docker daemon unavailable" }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": missingCommand("docker", ["--version"]),
        "/opt/homebrew/bin/docker --version": missingCommand("/opt/homebrew/bin/docker", ["--version"]),
        "/usr/local/bin/docker --version": missingCommand("/usr/local/bin/docker", ["--version"]),
        "podman --version": missingCommand("podman", ["--version"]),
        "/opt/homebrew/bin/podman --version": missingCommand("/opt/homebrew/bin/podman", ["--version"]),
        "/usr/local/bin/podman --version": missingCommand("/usr/local/bin/podman", ["--version"]),
        "colima version": missingCommand("colima", ["version"]),
        "/opt/homebrew/bin/colima version": okCommand("/opt/homebrew/bin/colima", ["version"], "colima version 0.8.1\n"),
        "/opt/homebrew/bin/colima status": failedCommand("/opt/homebrew/bin/colima", ["status"], "colima is not running"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "installed-not-running",
      reason: "machine-stopped",
      runtime: "colima",
      nextAction: "start-runtime",
    });
    expect(result.hosts.find((host) => host.kind === "colima")).toMatchObject({
      status: "installed-not-running",
      reason: "machine-stopped",
      version: "0.8.1",
      message: "colima is not running",
    });
  });

  it("gives Windows Podman Desktop and WSL repair guidance when Podman is installed but stopped", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "no runtime" }),
      platform: "win32",
      arch: "x64",
      commandRunner: fakeRunner({
        "docker.exe --version": missingCommand("docker.exe", ["--version"]),
        "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe --version": missingCommand("C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe", ["--version"]),
        "C:\\Program Files\\Docker\\Docker\\resources\\com.docker.cli.exe --version": missingCommand("C:\\Program Files\\Docker\\Docker\\resources\\com.docker.cli.exe", ["--version"]),
        "podman.exe --version": okCommand("podman.exe", ["--version"], "podman version 5.5.0\n"),
        "podman.exe info --format json": failedCommand("podman.exe", ["info", "--format", "json"], "machine is stopped"),
        "podman.exe machine list --format json": okCommand("podman.exe", ["machine", "list", "--format", "json"], "[]\n"),
        "wsl.exe --status": okCommand("wsl.exe", ["--status"], "Default Version: 2\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "installed-not-running",
      reason: "machine-stopped",
      runtime: "podman",
      nextAction: "start-runtime",
    });
    expect(result.message).toContain("WSL 2");
    expect(result.hosts.find((host) => host.kind === "podman")?.message).toContain("open Podman Desktop");
    expect(result.hosts.find((host) => host.kind === "podman")).toMatchObject({
      reason: "machine-stopped",
    });
  });

  it("classifies Docker Desktop probe timeouts as desktop app not responding", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "runtime probe timed out" }),
      platform: "darwin",
      arch: "arm64",
      commandRunner: fakeRunner({
        "docker --version": okCommand("docker", ["--version"], "Docker version 28.1.1\n"),
        "docker info --format {{json .ServerVersion}}": timedOutCommand("docker", ["info", "--format", "{{json .ServerVersion}}"]),
        "podman --version": missingCommand("podman", ["--version"]),
        "colima version": missingCommand("colima", ["version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "installed-not-running",
      reason: "desktop-app-not-responding",
      runtime: "docker",
      nextAction: "start-runtime",
    });
    expect(result.hosts.find((host) => host.kind === "docker")).toMatchObject({
      reason: "desktop-app-not-responding",
    });
    expect(containerRuntimeProbeSummary(result)).toContain("reason=desktop-app-not-responding");
  });

  it("classifies a Linux Docker socket permission denial distinctly from a stopped daemon", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "docker permission denied" }),
      platform: "linux",
      arch: "x64",
      commandRunner: fakeRunner({
        "docker --version": okCommand("docker", ["--version"], "Docker version 28.1.1\n"),
        "docker info --format {{json .ServerVersion}}": failedCommand(
          "docker",
          ["info", "--format", "{{json .ServerVersion}}"],
          "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock",
        ),
        "podman --version": missingCommand("podman", ["--version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "blocked-by-permissions",
      reason: "permission-denied",
      runtime: "docker",
      nextAction: "repair-permissions",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
    expect(result.hosts.find((host) => host.kind === "docker")).toMatchObject({
      status: "permission-blocked",
      reason: "permission-denied",
    });
    expect(result.message).toContain("cannot access it as this OS user");
    expect(containerRuntimeProbeSummary(result)).toContain("docker: permission-blocked");
  });

  it("keeps Docker and Podman missing on Windows distinct from WSL readiness", async () => {
    const result = await probeContainerRuntime({
      toolHive: fakeToolHive({ preflightOk: false, preflightMessage: "no container runtime found" }),
      platform: "win32",
      arch: "x64",
      commandRunner: fakeRunner({
        "docker --version": missingCommand("docker", ["--version"]),
        "podman --version": missingCommand("podman", ["--version"]),
        "wsl.exe --status": okCommand("wsl.exe", ["--status"], "Default Version: 2\n"),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "missing",
      reason: "runtime-missing",
      nextAction: "install-runtime",
    });
    expect(result.hosts.find((host) => host.kind === "wsl2")).toMatchObject({
      status: "installed",
    });
  });

  it("classifies a missing ToolHive bundle as unsupported even when Docker is present", async () => {
    const result = await probeContainerRuntime({
      toolHive: missingToolHive(),
      platform: "linux",
      arch: "x64",
      commandRunner: fakeRunner({
        "docker --version": okCommand("docker", ["--version"], "Docker version 27.3.1\n"),
        "docker info --format {{json .ServerVersion}}": okCommand("docker", ["info", "--format", "{{json .ServerVersion}}"], "\"27.3.1\"\n"),
        "podman --version": missingCommand("podman", ["--version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "unsupported",
      reason: "toolhive-unavailable",
      runtime: "docker",
      nextAction: "repair-toolhive",
      toolHive: { status: "missing" },
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
  });
});

function fixedNow(): Date {
  return new Date("2026-05-23T20:00:00.000Z");
}

function fakeToolHive(input: { preflightOk: boolean; preflightMessage?: string }): ContainerRuntimeToolHiveClient {
  return {
    async version() {
      return toolHiveCommand("version", ["version"], "ToolHive v0.28.2\n", "", 0);
    },
    async preflightRuntime() {
      const command = toolHiveCommand(
        "runtime-check",
        ["runtime", "check", "--timeout", "5"],
        input.preflightOk ? "runtime ok\n" : "",
        input.preflightOk ? "" : input.preflightMessage ?? "runtime unavailable",
        input.preflightOk ? 0 : 1,
      );
      return {
        ok: input.preflightOk,
        message: input.preflightMessage ?? (input.preflightOk ? "runtime ok" : "runtime unavailable"),
        command,
      } satisfies ToolHiveRuntimePreflight;
    },
  };
}

function missingToolHive(): ContainerRuntimeToolHiveClient {
  return {
    async version() {
      const error = new Error("ToolHive binary missing") as Error & { code: string };
      error.code = "ENOENT";
      throw error;
    },
    async preflightRuntime() {
      throw new Error("unreachable");
    },
  };
}

function fakeRunner(responses: Record<string, ContainerRuntimeCommandResult>): ContainerRuntimeCommandRunner {
  return async (invocation: ContainerRuntimeCommandInvocation) => {
    const key = [invocation.command, ...invocation.args].join(" ");
    return responses[key] ?? missingCommand(invocation.command, invocation.args);
  };
}

function okCommand(command: string, args: string[], stdout = ""): ContainerRuntimeCommandResult {
  return commandResult(command, args, stdout, "", 0);
}

function failedCommand(command: string, args: string[], stderr: string): ContainerRuntimeCommandResult {
  return commandResult(command, args, "", stderr, 1);
}

function timedOutCommand(command: string, args: string[]): ContainerRuntimeCommandResult {
  return {
    ...commandResult(command, args, "", "probe timed out", 1, "ETIMEDOUT"),
    timedOut: true,
  };
}

function missingCommand(command: string, args: string[]): ContainerRuntimeCommandResult {
  return commandResult(command, args, "", "", 1, "ENOENT");
}

function commandResult(command: string, args: string[], stdout: string, stderr: string, exitCode: number, errorCode?: string): ContainerRuntimeCommandResult {
  return {
    command,
    args,
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
    ...(errorCode ? { errorCode } : {}),
  };
}

function toolHiveCommand(command: ToolHiveCommandResult["command"], args: string[], stdout: string, stderr: string, exitCode: number): ToolHiveCommandResult {
  return {
    command,
    args,
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
