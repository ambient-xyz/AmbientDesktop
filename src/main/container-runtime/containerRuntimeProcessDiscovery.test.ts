import { describe, expect, it } from "vitest";
import {
  discoverContainerRuntimeProcessHints,
  parseContainerRuntimeProcessList,
  type ContainerRuntimeProcessCommandInvocation,
  type ContainerRuntimeProcessCommandResult,
  type ContainerRuntimeProcessCommandRunner,
} from "./containerRuntimeProcessDiscovery";

describe("container runtime process discovery", () => {
  it("parses macOS Desktop app processes without retaining command-line arguments", () => {
    const hints = parseContainerRuntimeProcessList("darwin", [
      "101 /Applications/Podman Desktop.app/Contents/MacOS/Podman Desktop --secret-token should-not-survive",
      "202 /Applications/Docker.app/Contents/MacOS/Docker --some-flag",
      "303 /opt/homebrew/bin/colima start",
    ].join("\n"));

    expect(hints).toEqual([
      expect.objectContaining({
        kind: "podman",
        pid: 101,
        processName: "Podman Desktop",
        applicationPath: "/Applications/Podman Desktop.app",
        confidence: "high",
      }),
      expect.objectContaining({
        kind: "docker",
        pid: 202,
        processName: "Docker",
        applicationPath: "/Applications/Docker.app",
        confidence: "high",
      }),
      expect.objectContaining({
        kind: "colima",
        pid: 303,
        processName: "colima",
        executablePath: "/opt/homebrew/bin/colima",
      }),
    ]);
    expect(JSON.stringify(hints)).not.toContain("secret-token");
  });

  it("parses Windows process JSON with executable paths", () => {
    const hints = parseContainerRuntimeProcessList("win32", JSON.stringify([
      {
        ProcessId: 4400,
        Name: "Docker Desktop.exe",
        ExecutablePath: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
        CommandLine: "\"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe\" --background",
      },
      {
        ProcessId: 5500,
        Name: "podman.exe",
        ExecutablePath: "C:\\Program Files\\RedHat\\Podman\\podman.exe",
        CommandLine: "\"C:\\Program Files\\RedHat\\Podman\\podman.exe\" machine start",
      },
    ]));

    expect(hints).toEqual([
      expect.objectContaining({
        kind: "docker",
        pid: 4400,
        processName: "Docker Desktop.exe",
        executablePath: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
      }),
      expect.objectContaining({
        kind: "podman",
        pid: 5500,
        processName: "podman.exe",
        executablePath: "C:\\Program Files\\RedHat\\Podman\\podman.exe",
      }),
    ]);
  });

  it("does not classify runtime names that appear only in command arguments", () => {
    expect(parseContainerRuntimeProcessList("linux", [
      "700 /usr/bin/node app.js --runtime docker",
      "701 /usr/bin/man podman",
      "702 /bin/sh -c docker",
    ].join("\n"))).toEqual([]);
  });

  it("does not classify macOS app paths that appear only in command arguments", () => {
    expect(parseContainerRuntimeProcessList("darwin", [
      "800 /usr/bin/open /Applications/Docker.app",
      "801 /bin/sh -c 'open /Applications/Podman Desktop.app'",
    ].join("\n"))).toEqual([]);
  });

  it("returns an empty hint set when process-list commands are unavailable", async () => {
    const runner: ContainerRuntimeProcessCommandRunner = async (invocation: ContainerRuntimeProcessCommandInvocation) =>
      commandResult(invocation.command, invocation.args, "", "", 1, "ENOENT");

    await expect(discoverContainerRuntimeProcessHints({
      platform: "linux",
      commandRunner: runner,
    })).resolves.toEqual([]);
  });
});

function commandResult(
  command: string,
  args: string[],
  stdout: string,
  stderr: string,
  exitCode: number,
  errorCode?: string,
): ContainerRuntimeProcessCommandResult {
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
