import { describe, expect, it, vi } from "vitest";
import { executeContainerRuntimeManagedInstallAction } from "./containerRuntimeManagedInstaller";
import { buildContainerRuntimeInstallPlan } from "./containerRuntimeInstallLauncher";
import { DryRunPrivilegedActionAdapter } from "./privilegedActionAdapter";

describe("container runtime managed installer", () => {
  it("runs a managed user command without opening a browser", async () => {
    const plan = buildContainerRuntimeInstallPlan({
      platform: "darwin",
      arch: "arm64",
      runtimeStatus: "missing",
      homebrewAvailable: true,
    });
    const commandRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: "installed\n",
      stderr: "",
    }));
    const writeManagedInstallLog = vi.fn(async () => "/tmp/ambient-user-data/.ambient/privileged-actions/managed-1.json");
    const onProgress = vi.fn();

    const result = await executeContainerRuntimeManagedInstallAction(plan.primaryAction, {
      requestId: "managed-1",
      workspacePath: "/tmp/ambient-user-data",
      commandRunner,
      privilegedAdapter: new DryRunPrivilegedActionAdapter(),
      requestCredential: async () => ({ allowed: false }),
      writeRedactedLog: async () => "/tmp/ambient-user-data/.ambient/privileged-actions/log.json",
      writeManagedInstallLog,
      onProgress,
    });

    expect(commandRunner).toHaveBeenCalledWith({
      executable: "brew",
      args: ["install", "--cask", "podman-desktop"],
      cwd: undefined,
      timeoutMs: 600_000,
    });
    expect(result).toMatchObject({
      status: "succeeded",
      adapter: "ambient-user-command",
      commandCount: 1,
      logPath: "/tmp/ambient-user-data/.ambient/privileged-actions/managed-1.json",
      stdoutPreview: "installed\n",
    });
    expect(writeManagedInstallLog).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "managed-1",
      status: "succeeded",
      redactedCommands: [{ exe: "brew", args: ["install", "--cask", "podman-desktop"], rationale: expect.any(String) }],
    }));
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "starting",
      "command-started",
      "command-succeeded",
      "log-written",
      "completed",
    ]);
  });

  it("dry-runs managed user commands without executing package-manager commands", async () => {
    const plan = buildContainerRuntimeInstallPlan({
      platform: "darwin",
      arch: "arm64",
      runtimeStatus: "missing",
      homebrewAvailable: true,
    });
    const commandRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: "should not run\n",
      stderr: "",
    }));
    const writeManagedInstallLog = vi.fn(async () => "/tmp/ambient-user-data/.ambient/privileged-actions/managed-dry-run.json");
    const onProgress = vi.fn();

    const result = await executeContainerRuntimeManagedInstallAction(plan.primaryAction, {
      mode: "dry-run",
      requestId: "managed-dry-run",
      workspacePath: "/tmp/ambient-user-data",
      commandRunner,
      privilegedAdapter: new DryRunPrivilegedActionAdapter(),
      requestCredential: async () => ({ allowed: false }),
      writeRedactedLog: async () => "/tmp/ambient-user-data/.ambient/privileged-actions/log.json",
      writeManagedInstallLog,
      onProgress,
    });

    expect(commandRunner).not.toHaveBeenCalled();
    expect(writeManagedInstallLog).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "managed-dry-run",
      status: "not-executed",
    }));
    expect(result).toMatchObject({
      status: "not-executed",
      adapter: "ambient-user-command",
      commandCount: 1,
      logPath: "/tmp/ambient-user-data/.ambient/privileged-actions/managed-dry-run.json",
      redactedCommands: [{ exe: "brew", args: ["install", "--cask", "podman-desktop"] }],
    });
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "dry-run-ready",
      "log-written",
      "completed",
    ]);
  });

  it("dry-runs privileged Linux installs through the privileged action boundary", async () => {
    const plan = buildContainerRuntimeInstallPlan({
      platform: "linux",
      arch: "x64",
      runtimeStatus: "missing",
      linuxPackageManager: "apt-get",
    });
    const requestCredential = vi.fn(async () => ({ allowed: false as const }));
    const writeRedactedLog = vi.fn(async () => "/tmp/ambient-user-data/.ambient/privileged-actions/log.json");
    const onProgress = vi.fn();

    const result = await executeContainerRuntimeManagedInstallAction(plan.primaryAction, {
      mode: "dry-run",
      requestId: "privileged-dry-run",
      workspacePath: "/tmp/ambient-user-data",
      privilegedAdapter: new DryRunPrivilegedActionAdapter(),
      requestCredential,
      writeRedactedLog,
      onProgress,
    });

    expect(requestCredential).not.toHaveBeenCalled();
    expect(writeRedactedLog).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "not-executed",
      adapter: "dry-run",
      commandCount: 2,
      credentialCapture: "not-requested",
    });
    expect(result.redactedCommands?.map((command) => command.exe)).toEqual(["apt-get", "apt-get"]);
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "privileged-boundary",
      "log-written",
      "completed",
    ]);
  });
});
