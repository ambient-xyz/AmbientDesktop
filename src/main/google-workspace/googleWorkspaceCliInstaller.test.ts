import { describe, expect, it, vi } from "vitest";
import { GoogleWorkspaceCliInstaller } from "./googleWorkspaceCliInstaller";

describe("GoogleWorkspaceCliInstaller", () => {
  it("reports an already installed managed binary as completed", async () => {
    const installer = new GoogleWorkspaceCliInstaller({
      toolsRoot: "/tmp/ambient/tools",
      platform: "darwin",
      arch: "arm64",
      fileExists: (path) => path.endsWith("/google-workspace-cli/v0.22.3/darwin-arm64/gws"),
      now: () => new Date("2026-05-04T00:00:00.000Z"),
    });

    await expect(installer.install()).resolves.toMatchObject({
      status: "completed",
      version: "0.22.3",
      platform: "darwin",
      arch: "arm64",
      binaryPath: "/tmp/ambient/tools/google-workspace-cli/v0.22.3/darwin-arm64/gws",
    });
  });

  it("marks unsupported platforms without downloading", async () => {
    const fetchImpl = vi.fn();
    const installer = new GoogleWorkspaceCliInstaller({
      toolsRoot: "/tmp/ambient/tools",
      platform: "freebsd" as NodeJS.Platform,
      arch: "x64",
      fetchImpl,
    });

    await expect(installer.install()).resolves.toMatchObject({
      status: "unsupported",
      error: "No managed Google Workspace CLI binary is pinned for freebsd/x64.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the downloaded archive checksum does not match", async () => {
    const extractArchive = vi.fn();
    const installer = new GoogleWorkspaceCliInstaller({
      toolsRoot: "/tmp/ambient/tools",
      platform: "darwin",
      arch: "arm64",
      fileExists: () => false,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => new TextEncoder().encode("not the release archive").buffer,
      }),
      extractArchive,
      now: () => new Date("2026-05-04T00:00:00.000Z"),
    });

    await expect(installer.install()).resolves.toMatchObject({
      status: "error",
      error: expect.stringContaining("checksum mismatch"),
    });
    expect(extractArchive).not.toHaveBeenCalled();
  });
});
