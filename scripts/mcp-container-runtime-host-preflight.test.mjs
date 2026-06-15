import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  buildHostPreflightReport,
  compactHostPreflightReport,
  parseHostPreflightRecords,
} from "./mcp-container-runtime-host-preflight.mjs";

describe("MCP container runtime host preflight", () => {
  it("classifies the Linux Docker socket permission blocker seen on remote hosts", () => {
    const report = buildHostPreflightReport({
      target: "linux-host",
      generatedAt: "2026-05-23T22:00:00.000Z",
      stdout: records({
        uname_s: [0, "Linux"],
        uname_m: [0, "x86_64"],
        id_un: [0, "travis"],
        id_gn: [0, "travis sudo"],
        docker_path: [0, "/usr/bin/docker"],
        docker_version: [0, "Docker version 28.1.1, build 4eba377"],
        docker_info: [1, "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock"],
        docker_sock: [0, "root:docker 660 socket"],
        podman_path: [127, ""],
        podman_version: [127, "sh: 1: podman: not found"],
        podman_info: [127, "sh: 1: podman: not found"],
        thv_path: [127, ""],
        thv_version: [127, "sh: 1: thv: not found"],
      }),
    });

    expect(report.platform).toBe("linux");
    expect(report.arch).toBe("x64");
    expect(report.status).toBe("permission-blocked");
    expect(report.message).toContain("Docker is installed");
    expect(report.runtimes.docker).toMatchObject({
      installed: true,
      ready: false,
      permissionBlocked: true,
    });
    expect(report.host.groups).toEqual(["travis", "sudo"]);
    expect(compactHostPreflightReport(report)).toMatchObject({
      target: "linux-host",
      status: "permission-blocked",
      docker: {
        installed: true,
        permissionBlocked: true,
      },
    });
  });

  it("classifies ready and missing host states", () => {
    expect(buildHostPreflightReport({
      stdout: records({
        uname_s: [0, "Darwin"],
        uname_m: [0, "arm64"],
        docker_path: [0, "/usr/local/bin/docker"],
        docker_version: [0, "Docker version 27.3.1"],
        docker_info: [0, "\"27.3.1\""],
      }),
    }).status).toBe("ready");

    expect(buildHostPreflightReport({
      stdout: records({
        uname_s: [0, "Linux"],
        uname_m: [0, "aarch64"],
        docker_path: [127, ""],
        docker_version: [127, "docker: not found"],
        docker_info: [127, "docker: not found"],
        podman_path: [127, ""],
        podman_version: [127, "podman: not found"],
        podman_info: [127, "podman: not found"],
      }),
    }).status).toBe("missing");
  });

  it("parses base64 encoded shell records with underscores in command names", () => {
    const parsed = parseHostPreflightRecords(records({
      docker_info: [1, "Cannot connect to the Docker daemon"],
    }));

    expect(parsed.docker_info).toEqual({
      exitCode: 1,
      output: "Cannot connect to the Docker daemon",
    });
  });
});

function records(entries) {
  return Object.entries(entries)
    .map(([name, [exitCode, output]]) => `__AMBIENT_MCP_HOST_PREFLIGHT__${name}__${exitCode}__${Buffer.from(output).toString("base64")}`)
    .join("\n");
}
