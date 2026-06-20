import { describe, expect, it, vi } from "vitest";
import {
  createContainerRuntimeApplicationOpener,
  type ApplicationSpawnProcess,
  type SpawnedApplicationProcess,
} from "./containerRuntimeApplicationOpener";

type SpawnOutcome =
  | { type: "error"; error?: Error }
  | { type: "exit"; code: number | null };

function createSpawnedProcess(outcome: SpawnOutcome): SpawnedApplicationProcess {
  class FakeSpawnedApplicationProcess implements SpawnedApplicationProcess {
    once(event: "error", listener: (error: Error) => void): this;
    once(event: "exit", listener: (code: number | null) => void): this;
    once(event: "error" | "exit", listener: ((error: Error) => void) | ((code: number | null) => void)): this {
      if (outcome.type === "error" && event === "error") {
        queueMicrotask(() => (listener as (error: Error) => void)(outcome.error ?? new Error("spawn failed")));
      }
      if (outcome.type === "exit" && event === "exit") {
        queueMicrotask(() => (listener as (code: number | null) => void)(outcome.code));
      }
      return this;
    }
  }
  return new FakeSpawnedApplicationProcess();
}

function createSpawnHarness(outcomes: SpawnOutcome[]) {
  const spawnProcess = vi.fn<ApplicationSpawnProcess>(() => {
    const outcome = outcomes.shift() ?? { type: "exit", code: 0 };
    return createSpawnedProcess(outcome);
  });
  return { spawnProcess };
}

describe("createContainerRuntimeApplicationOpener", () => {
  it("tries up to three trimmed macOS application names and logs the first successful open", async () => {
    const { spawnProcess } = createSpawnHarness([
      { type: "exit", code: 1 },
      { type: "exit", code: 0 },
    ]);
    const log = vi.fn();
    const opener = createContainerRuntimeApplicationOpener({
      platform: "darwin",
      spawnProcess,
      log,
    });

    await expect(opener.openContainerRuntimeApplication(["", " Docker ", "OrbStack", "Podman", "Ignored"])).resolves.toBe(
      true,
    );

    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(spawnProcess).toHaveBeenNthCalledWith(1, "/usr/bin/open", ["-a", "Docker"], { stdio: "ignore" });
    expect(spawnProcess).toHaveBeenNthCalledWith(2, "/usr/bin/open", ["-a", "OrbStack"], { stdio: "ignore" });
    expect(log).toHaveBeenCalledWith("[mcp-container-runtime] opened application OrbStack");
  });

  it("uses cmd.exe start on Windows application names", async () => {
    const { spawnProcess } = createSpawnHarness([{ type: "exit", code: 0 }]);
    const log = vi.fn();
    const opener = createContainerRuntimeApplicationOpener({
      platform: "win32",
      spawnProcess,
      log,
    });

    await expect(opener.openContainerRuntimeApplication([" Docker Desktop "])).resolves.toBe(true);

    expect(spawnProcess).toHaveBeenCalledWith("cmd.exe", ["/c", "start", "", "Docker Desktop"], {
      stdio: "ignore",
      windowsHide: true,
    });
    expect(log).toHaveBeenCalledWith("[mcp-container-runtime] opened application Docker Desktop");
  });

  it("returns false without spawning for unsupported platforms or empty names", async () => {
    const { spawnProcess } = createSpawnHarness([]);
    const opener = createContainerRuntimeApplicationOpener({
      platform: "linux",
      spawnProcess,
      log: vi.fn(),
    });

    await expect(opener.openContainerRuntimeApplication(["Docker"])).resolves.toBe(false);
    await expect(opener.openContainerRuntimeApplication([" ", ""])).resolves.toBe(false);

    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("reports failed process starts as false", async () => {
    const { spawnProcess } = createSpawnHarness([
      { type: "error", error: new Error("missing open") },
      { type: "exit", code: null },
    ]);
    const opener = createContainerRuntimeApplicationOpener({
      platform: "darwin",
      spawnProcess,
      log: vi.fn(),
    });

    await expect(opener.runMacOpen(["-a", "Docker"])).resolves.toBe(false);
    await expect(opener.runWindowsStartApplication("Docker Desktop")).resolves.toBe(false);
  });
});
