import { describe, expect, it } from "vitest";
import {
  pullOciImageWithContainerRuntime,
  type ContainerRuntimeImagePullCommandRunner,
} from "./containerRuntimeImagePuller";

describe("container runtime image puller", () => {
  it("uses Docker platform pulls for Docker and Colima runtimes", async () => {
    const calls: Array<{ command: string; args: string[]; runtime: string }> = [];
    const commandRunner: ContainerRuntimeImagePullCommandRunner = async (input) => {
      calls.push({ command: input.command, args: input.args, runtime: input.runtime });
      return {
        runtime: input.runtime,
        command: input.command,
        args: input.args,
        stdout: "pulled",
        stderr: "",
        exitCode: 0,
        durationMs: 12,
      };
    };

    const result = await pullOciImageWithContainerRuntime({
      image: "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
      targetPlatform: { os: "linux", architecture: "arm64" },
      preferredRuntime: "colima",
      platform: "darwin",
      commandRunner,
    });

    expect(result.runtime).toBe("docker");
    expect(calls).toEqual([
      {
        runtime: "docker",
        command: "docker",
        args: [
          "pull",
          "--platform",
          "linux/arm64",
          "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
        ],
      },
    ]);
  });

  it("uses Podman os/arch pulls for Podman runtimes across platforms", async () => {
    const calls: Array<{ command: string; args: string[]; runtime: string }> = [];
    const commandRunner: ContainerRuntimeImagePullCommandRunner = async (input) => {
      calls.push({ command: input.command, args: input.args, runtime: input.runtime });
      return {
        runtime: input.runtime,
        command: input.command,
        args: input.args,
        stdout: "pulled",
        stderr: "",
        exitCode: 0,
        durationMs: 12,
      };
    };

    await pullOciImageWithContainerRuntime({
      image: "ghcr.io/example/server@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      targetPlatform: { os: "linux", architecture: "amd64" },
      preferredRuntime: "podman",
      platform: "win32",
      commandRunner,
    });

    expect(calls).toEqual([
      {
        runtime: "podman",
        command: "podman.exe",
        args: [
          "pull",
          "--arch",
          "amd64",
          "--os",
          "linux",
          "ghcr.io/example/server@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ],
      },
    ]);
  });
});
