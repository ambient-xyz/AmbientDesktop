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
      version: "27.3.1",
    });
    expect(containerRuntimeProbeSummary(result)).toContain("Post-install queue: scrapling=queued");
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
      runtime: "docker",
      nextAction: "start-runtime",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
    expect(result.message).toContain("Docker appears installed");
    expect(result.message).toContain("Start or repair");
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
          "Cannot connect to the Docker daemon at unix:///Users/Neo/.docker/run/docker.sock. Is the docker daemon running?\n",
          0,
        ),
        "podman --version": missingCommand("podman", ["--version"]),
        "colima version": missingCommand("colima", ["version"]),
      }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "installed-not-running",
      runtime: "docker",
      nextAction: "start-runtime",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
    expect(result.hosts.find((host) => host.kind === "docker")).toMatchObject({
      status: "installed-not-running",
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
      runtime: "podman",
    });
    expect(result.hosts.find((host) => host.kind === "podman")).toMatchObject({
      status: "ready",
      message: expect.stringContaining("/opt/homebrew/bin/podman"),
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
      runtime: "podman",
      nextAction: "start-runtime",
    });
    expect(result.message).toContain("WSL 2");
    expect(result.hosts.find((host) => host.kind === "podman")?.message).toContain("open Podman Desktop");
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
      runtime: "docker",
      nextAction: "repair-permissions",
      postInstallQueue: [{ capabilityId: "scrapling", status: "blocked" }],
    });
    expect(result.hosts.find((host) => host.kind === "docker")).toMatchObject({
      status: "permission-blocked",
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
