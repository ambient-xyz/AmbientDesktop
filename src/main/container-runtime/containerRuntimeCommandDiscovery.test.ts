import { describe, expect, it } from "vitest";
import {
  containerRuntimeDockerCommandCandidates,
  containerRuntimeExecutableSearchDirs,
  containerRuntimeProcessHintCommandCandidates,
  containerRuntimePodmanCommandCandidates,
  containerRuntimeWslCommandCandidates,
} from "./containerRuntimeCommandDiscovery";

describe("container runtime command discovery", () => {
  it("includes the macOS Podman Desktop pkg installer CLI path before Homebrew fallbacks", () => {
    expect(containerRuntimePodmanCommandCandidates("darwin")).toEqual([
      "podman",
      "/opt/podman/bin/podman",
      "/opt/homebrew/bin/podman",
      "/usr/local/bin/podman",
    ]);
  });

  it("keeps Windows Desktop and WSL executable fallbacks explicit", () => {
    expect(containerRuntimeDockerCommandCandidates("win32")).toEqual([
      "docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\com.docker.cli.exe",
      "C:\\ProgramData\\DockerDesktop\\version-bin\\docker.exe",
    ]);
    expect(containerRuntimePodmanCommandCandidates("win32")).toEqual([
      "podman.exe",
      "C:\\Program Files\\RedHat\\Podman\\podman.exe",
      "C:\\Program Files\\RedHat\\Podman Desktop\\resources\\bin\\podman.exe",
      "C:\\Program Files\\Podman Desktop\\resources\\bin\\podman.exe",
    ]);
    expect(containerRuntimeWslCommandCandidates("win32")).toEqual([
      "wsl.exe",
      "C:\\Windows\\System32\\wsl.exe",
      "C:\\Windows\\Sysnative\\wsl.exe",
    ]);
  });

  it("keeps Linux rootless and package-manager fallbacks explicit", () => {
    expect(containerRuntimeDockerCommandCandidates("linux")).toEqual([
      "docker",
      "/usr/bin/docker",
      "/usr/local/bin/docker",
      "/home/linuxbrew/.linuxbrew/bin/docker",
      "/usr/local/sbin/docker",
      "/usr/sbin/docker",
      "/sbin/docker",
      "/snap/bin/docker",
    ]);
  });

  it("exposes container runtime directories for sanitized child-process PATH construction", () => {
    expect(containerRuntimeExecutableSearchDirs("darwin")).toEqual(
      expect.arrayContaining(["/opt/podman/bin", "/opt/homebrew/bin", "/usr/local/bin"]),
    );
    expect(containerRuntimeExecutableSearchDirs("linux").slice(0, 3)).toEqual([
      "/usr/bin",
      "/usr/local/bin",
      "/home/linuxbrew/.linuxbrew/bin",
    ]);
  });

  it("adds trusted process-derived Docker Desktop command candidates without replacing static fallbacks", () => {
    expect(containerRuntimeDockerCommandCandidates("darwin", [{
      kind: "docker",
      applicationPath: "/Applications/Docker.app",
    }])).toEqual([
      "docker",
      "/Applications/Docker.app/Contents/Resources/bin/docker",
      "/Applications/Docker.app/Contents/Resources/docker",
      "/Applications/Docker.app/Contents/Resources/com.docker.cli",
      "/opt/homebrew/bin/docker",
      "/usr/local/bin/docker",
    ]);
  });

  it("ignores untrusted process executable locations", () => {
    expect(containerRuntimeProcessHintCommandCandidates("podman", "linux", [{
      kind: "podman",
      executablePath: "/custom/bin/podman",
    }])).toEqual([]);
  });

  it("rejects traversal paths that escape trusted install roots", () => {
    expect(containerRuntimeProcessHintCommandCandidates("docker", "darwin", [{
      kind: "docker",
      executablePath: "/Applications/Docker.app/Contents/Resources/../../../../tmp/docker",
    }])).toEqual([]);
  });

  it("deduces trusted Windows Desktop CLI locations", () => {
    expect(containerRuntimeProcessHintCommandCandidates("docker", "win32", [{
      kind: "docker",
      executablePath: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
    }])).toEqual([
      "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\com.docker.cli.exe",
    ]);
  });
});
