import { describe, expect, it, vi } from "vitest";
import type {
  AmbientMcpContainerRuntimeLifecycleCommand,
  AmbientMcpContainerRuntimeStatus,
} from "../../shared/pluginTypes";
import {
  previewContainerRuntimeLifecycleAction,
  runContainerRuntimeLifecycleAction,
  type ContainerRuntimeLifecycleCommandRunInput,
  type ContainerRuntimeLifecycleCommandRunResult,
} from "./containerRuntimeLifecycleService";

describe("container runtime lifecycle service", () => {
  it("builds a graceful Docker Desktop restart preview on macOS", () => {
    const preview = previewContainerRuntimeLifecycleAction({
      action: "restart",
      status: runtimeStatus({
        runtime: "docker",
        platform: "darwin",
        reason: "daemon-unreachable",
      }),
      now: fixedNow,
    });

    expect(preview).toMatchObject({
      schemaVersion: "ambient-container-runtime-lifecycle-preview-v1",
      previewId: "docker:restart:daemon-unreachable:darwin",
      action: "restart",
      runtime: "docker",
      platform: "darwin",
      status: "available",
      requiresConfirmation: false,
      expectedInterruption: expect.stringContaining("including non-Ambient containers"),
      targets: [
        {
          kind: "application",
          runtime: "docker",
          label: "Docker Desktop",
          identifier: "Docker",
          verified: true,
        },
      ],
    });
    expect(preview.commands).toEqual([
      {
        exe: "/usr/bin/osascript",
        args: ["-e", "tell application \"Docker\" to quit"],
        rationale: "Ask Docker Desktop to quit gracefully.",
        destructive: true,
      },
      {
        exe: "/usr/bin/open",
        args: ["-a", "Docker"],
        rationale: "Open Docker Desktop.",
        destructive: false,
      },
    ]);
  });

  it("blocks Docker Engine restart on Linux and exposes documentation recovery instead", () => {
    const status = runtimeStatus({
      runtime: "docker",
      platform: "linux",
      reason: "daemon-unreachable",
    });

    const blocked = previewContainerRuntimeLifecycleAction({
      action: "restart",
      status,
      now: fixedNow,
    });
    expect(blocked).toMatchObject({
      status: "blocked",
      runtime: "docker",
      summary: expect.stringContaining("privileged service control"),
      commands: [],
    });

    const recovery = previewContainerRuntimeLifecycleAction({
      action: "open-recovery",
      status,
      now: fixedNow,
    });
    expect(recovery).toMatchObject({
      status: "available",
      runtime: "docker",
      requiresConfirmation: false,
      targets: [
        {
          kind: "documentation",
          identifier: "https://docs.docker.com/engine/install/linux-postinstall/",
          verified: true,
        },
      ],
      commands: [
        {
          exe: "xdg-open",
          args: ["https://docs.docker.com/engine/install/linux-postinstall/"],
          destructive: false,
        },
      ],
    });
  });

  it("keeps open-recovery available for permission-blocked runtimes", () => {
    const preview = previewContainerRuntimeLifecycleAction({
      action: "open-recovery",
      status: runtimeStatus({
        status: "blocked-by-permissions",
        runtime: "docker",
        platform: "linux",
        reason: "permission-denied",
        message: "permission denied while trying to connect to the Docker daemon socket",
      }),
      now: fixedNow,
    });

    expect(preview).toMatchObject({
      status: "available",
      action: "open-recovery",
      runtime: "docker",
      reason: "permission-denied",
      expectedInterruption: "No runtime process will be changed.",
      targets: [
        {
          kind: "documentation",
          identifier: "https://docs.docker.com/engine/install/linux-postinstall/",
        },
      ],
    });
    expect(preview.commands).toEqual([
      {
        exe: "xdg-open",
        args: ["https://docs.docker.com/engine/install/linux-postinstall/"],
        rationale: "Open the official runtime recovery guide.",
        destructive: false,
      },
    ]);
  });

  it("requires confirmation before force quit and restart executes commands", async () => {
    const before = runtimeStatus({
      runtime: "docker",
      platform: "darwin",
      reason: "desktop-app-not-responding",
    });
    const preview = previewContainerRuntimeLifecycleAction({
      action: "force-quit-and-restart",
      status: before,
      now: fixedNow,
    });
    const commands: AmbientMcpContainerRuntimeLifecycleCommand[] = [];

    const result = await runContainerRuntimeLifecycleAction({
      action: "force-quit-and-restart",
      expectedPreviewId: preview.previewId,
    }, {
      getStatus: statuses(before),
      commandRunner: recordingRunner(commands),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "desktop-app-not-responding",
      message: expect.stringContaining("requires explicit confirmation"),
      preview: {
        requiresConfirmation: true,
      },
    });
    expect(commands).toEqual([]);
  });

  it("force quits Docker Desktop, relaunches it, and polls until ready when confirmed", async () => {
    const before = runtimeStatus({
      runtime: "docker",
      platform: "darwin",
      reason: "desktop-app-not-responding",
    });
    const stillStarting = runtimeStatus({
      runtime: "docker",
      platform: "darwin",
      reason: "daemon-unreachable",
      message: "Docker Desktop is still starting.",
    });
    const ready = runtimeStatus({
      status: "ready",
      runtime: "docker",
      platform: "darwin",
      reason: "none",
      message: "ToolHive preflight passed.",
    });
    const preview = previewContainerRuntimeLifecycleAction({
      action: "force-quit-and-restart",
      status: before,
      now: fixedNow,
    });
    const commands: AmbientMcpContainerRuntimeLifecycleCommand[] = [];

    const result = await runContainerRuntimeLifecycleAction({
      action: "force-quit-and-restart",
      expectedPreviewId: preview.previewId,
      confirmForce: true,
    }, {
      getStatus: statuses(before, stillStarting, ready),
      commandRunner: recordingRunner(commands),
      pollIntervalMs: 0,
      now: fixedNow,
    });

    expect(commands).toEqual([
      {
        exe: "/usr/bin/pkill",
        args: ["-x", "Docker"],
        rationale: "Force quit the allowlisted Docker Desktop application process.",
        destructive: true,
      },
      {
        exe: "/usr/bin/open",
        args: ["-a", "Docker"],
        rationale: "Open Docker Desktop.",
        destructive: false,
      },
    ]);
    expect(result).toMatchObject({
      status: "ready",
      reason: "none",
      after: {
        status: "ready",
      },
      message: "Docker restart completed and ToolHive preflight is ready.",
    });
    expect(result.progress.map((progress) => progress.phase)).toEqual([
      "previewed",
      "force-stop-started",
      "launch-started",
      "probe-poll",
      "probe-poll",
      "ready",
    ]);
  });

  it("uses allowlisted Windows Desktop executable paths for relaunch commands", () => {
    const docker = previewContainerRuntimeLifecycleAction({
      action: "force-quit-and-restart",
      status: runtimeStatus({
        runtime: "docker",
        platform: "win32",
        reason: "desktop-app-not-responding",
      }),
      now: fixedNow,
    });
    const podman = previewContainerRuntimeLifecycleAction({
      action: "force-quit-and-restart",
      status: runtimeStatus({
        runtime: "podman",
        platform: "win32",
        reason: "machine-stopped",
      }),
      now: fixedNow,
    });

    expect(docker.commands[1]).toMatchObject({
      exe: "powershell.exe",
      args: expect.arrayContaining([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
      ]),
      rationale: "Open Docker Desktop from an allowlisted Windows executable path.",
      destructive: false,
    });
    expect(podman.commands[1]).toMatchObject({
      exe: "powershell.exe",
      rationale: "Open Podman Desktop from an allowlisted Windows executable path.",
      destructive: false,
    });
    expect(docker.commands[1]?.args.join(" ")).toContain("C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe");
    expect(docker.commands[1]?.args.join(" ")).toContain("Start-Process");
    expect(podman.commands[1]?.args.join(" ")).toContain("C:\\Program Files\\RedHat\\Podman Desktop\\Podman Desktop.exe");
    expect(podman.commands[1]?.args.join(" ")).toContain("Start-Process");
  });

  it("starts a stopped Podman machine without adding a failing stop command first", () => {
    const preview = previewContainerRuntimeLifecycleAction({
      action: "restart",
      status: runtimeStatus({
        runtime: "podman",
        platform: "linux",
        reason: "machine-stopped",
      }),
      now: fixedNow,
    });

    expect(preview).toMatchObject({
      status: "available",
      runtime: "podman",
      targets: [
        {
          kind: "machine",
          identifier: "default",
          verified: true,
        },
      ],
    });
    expect(preview.commands).toEqual([
      {
        exe: "podman",
        candidateExecutables: [
          "/usr/bin/podman",
          "/usr/local/bin/podman",
          "/home/linuxbrew/.linuxbrew/bin/podman",
          "/usr/local/sbin/podman",
          "/usr/sbin/podman",
          "/sbin/podman",
          "/snap/bin/podman",
        ],
        args: ["machine", "start"],
        rationale: "Start the default Podman machine.",
        destructive: false,
      },
    ]);
  });

  it("carries macOS Homebrew CLI candidates into Podman and Colima lifecycle commands", () => {
    const podman = previewContainerRuntimeLifecycleAction({
      action: "restart",
      status: runtimeStatus({
        runtime: "podman",
        platform: "darwin",
        reason: "daemon-unreachable",
      }),
      now: fixedNow,
    });
    const colima = previewContainerRuntimeLifecycleAction({
      action: "restart",
      status: runtimeStatus({
        runtime: "colima",
        platform: "darwin",
        reason: "daemon-unreachable",
      }),
      now: fixedNow,
    });

    expect(podman.commands.find((command) => command.args.join(" ") === "machine stop")).toMatchObject({
      exe: "podman",
      candidateExecutables: ["/opt/podman/bin/podman", "/opt/homebrew/bin/podman", "/usr/local/bin/podman"],
    });
    expect(colima.commands[0]).toMatchObject({
      exe: "colima",
      candidateExecutables: ["/opt/homebrew/bin/colima", "/usr/local/bin/colima"],
    });
    expect(podman.commands.map((command) => command.exe)).not.toContain("/usr/bin/open");
    expect(podman.targets).toEqual([
      {
        kind: "machine",
        runtime: "podman",
        label: "Default Podman machine",
        identifier: "default",
        platform: "darwin",
        verified: true,
        reason: "Podman machine lifecycle is exposed through the non-privileged Podman CLI.",
      },
    ]);
  });

  it("continues to launch and poll when a graceful stop command fails", async () => {
    const before = runtimeStatus({
      runtime: "colima",
      platform: "darwin",
      reason: "daemon-unreachable",
    });
    const ready = runtimeStatus({
      status: "ready",
      runtime: "colima",
      platform: "darwin",
      reason: "none",
      message: "ToolHive preflight passed.",
    });
    const commands: AmbientMcpContainerRuntimeLifecycleCommand[] = [];

    const result = await runContainerRuntimeLifecycleAction({
      action: "restart",
    }, {
      getStatus: statuses(before, ready),
      commandRunner: async (input) => {
        commands.push(input.command);
        return {
          command: input.command,
          stdout: "",
          stderr: input.command.args[0] === "stop" ? "Colima is not running" : "",
          exitCode: input.command.args[0] === "stop" ? 1 : 0,
          durationMs: 1,
        };
      },
      pollIntervalMs: 0,
      now: fixedNow,
    });

    expect(commands.map((command) => [command.exe, ...command.args].join(" "))).toEqual([
      "colima stop",
      "colima start",
    ]);
    expect(result).toMatchObject({
      status: "ready",
      after: {
        status: "ready",
      },
    });
    expect(result.progress.map((progress) => progress.phase)).toEqual([
      "previewed",
      "graceful-stop-started",
      "graceful-stop-failed",
      "launch-started",
      "probe-poll",
      "ready",
    ]);
  });

  it("does not abort relaunch when a progress callback throws after stop starts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const before = runtimeStatus({
      runtime: "colima",
      platform: "darwin",
      reason: "daemon-unreachable",
    });
    const ready = runtimeStatus({
      status: "ready",
      runtime: "colima",
      platform: "darwin",
      reason: "none",
      message: "ToolHive preflight passed.",
    });
    const commands: AmbientMcpContainerRuntimeLifecycleCommand[] = [];

    try {
      const result = await runContainerRuntimeLifecycleAction({
        action: "restart",
      }, {
        getStatus: statuses(before, ready),
        commandRunner: recordingRunner(commands),
        onProgress: (progress) => {
          if (progress.phase === "graceful-stop-started") throw new Error("progress sink unavailable");
        },
        pollIntervalMs: 0,
        now: fixedNow,
      });

      expect(commands.map((command) => [command.exe, ...command.args].join(" "))).toEqual([
        "colima stop",
        "colima start",
      ]);
      expect(result.status).toBe("ready");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("dropped lifecycle progress callback error"));
    } finally {
      warn.mockRestore();
    }
  });

  it("blocks stale preview execution before running commands", async () => {
    const commands: AmbientMcpContainerRuntimeLifecycleCommand[] = [];

    const result = await runContainerRuntimeLifecycleAction({
      action: "restart",
      expectedPreviewId: "docker:restart:daemon-unreachable:darwin",
    }, {
      getStatus: statuses(runtimeStatus({
        runtime: "docker",
        platform: "darwin",
        reason: "desktop-app-not-responding",
      })),
      commandRunner: recordingRunner(commands),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      status: "blocked",
      message: "Container runtime lifecycle preview changed before execution. Refresh the preview and try again.",
    });
    expect(commands).toEqual([]);
  });
});

function fixedNow(): Date {
  return new Date("2026-05-24T12:00:00.000Z");
}

function statuses(...items: AmbientMcpContainerRuntimeStatus[]): () => Promise<AmbientMcpContainerRuntimeStatus> {
  let index = 0;
  return async () => {
    const item = items[Math.min(index, items.length - 1)]!;
    index += 1;
    return item;
  };
}

function recordingRunner(
  commands: AmbientMcpContainerRuntimeLifecycleCommand[],
): (input: ContainerRuntimeLifecycleCommandRunInput) => Promise<ContainerRuntimeLifecycleCommandRunResult> {
  return async (input) => {
    commands.push(input.command);
    return {
      command: input.command,
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };
  };
}

function runtimeStatus(input: {
  status?: AmbientMcpContainerRuntimeStatus["status"];
  runtime: NonNullable<Exclude<AmbientMcpContainerRuntimeStatus["runtime"], "unknown">>;
  platform: string;
  reason: NonNullable<AmbientMcpContainerRuntimeStatus["reason"]>;
  message?: string;
}): AmbientMcpContainerRuntimeStatus {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: input.status ?? "installed-not-running",
    runtime: input.runtime,
    platform: input.platform,
    arch: input.platform === "darwin" ? "arm64" : "x64",
    checkedAt: "2026-05-24T12:00:00.000Z",
    durationMs: 10,
    message: input.message ?? `${input.runtime} is not reachable.`,
    reason: input.reason,
    nextAction: input.status === "ready"
      ? "none"
      : input.status === "blocked-by-permissions"
        ? "repair-permissions"
        : "start-runtime",
    toolHive: {
      status: "ready",
      message: input.status === "ready" ? "runtime ok" : "runtime unavailable",
      preflightOk: input.status === "ready",
    },
    hosts: [
      {
        kind: input.runtime,
        status: input.status === "ready"
          ? "ready"
          : input.status === "blocked-by-permissions"
            ? "permission-blocked"
            : "installed-not-running",
        reason: input.reason,
        message: input.message ?? `${input.runtime} is not reachable.`,
      },
    ],
    setup: {
      userDecision: "none",
      shouldPrompt: false,
      promptSuppressed: false,
      reason: "runtime-not-missing",
    },
    postInstallQueue: [
      {
        kind: "default-capability",
        capabilityId: "scrapling",
        status: input.status === "ready" ? "queued" : "blocked",
      },
    ],
    defaultCapabilities: [],
  };
}
