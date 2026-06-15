import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { GoogleSidecarSupervisor, sidecarBinaryName } from "./googleSidecarSupervisor";

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill(): boolean {
    this.killed = true;
    this.emit("exit", null, "SIGTERM");
    return true;
  }
}

describe("sidecarBinaryName", () => {
  it("uses stable macOS and Linux names", () => {
    expect(sidecarBinaryName("darwin", "arm64")).toBe("ambient-google-sidecar-darwin-arm64");
    expect(sidecarBinaryName("linux", "x64")).toBe("ambient-google-sidecar-linux-x64");
  });

  it("keeps Windows as a future target", () => {
    expect(sidecarBinaryName("win32", "x64")).toBe("ambient-google-sidecar-win32-x64.exe");
  });
});

describe("GoogleSidecarSupervisor", () => {
  it("maps packaged resources to the sidecar directory", () => {
    const supervisor = new GoogleSidecarSupervisor({
      isPackaged: true,
      resourcesPath: "/Applications/Ambient Desktop.app/Contents/Resources",
    });
    expect(supervisor.binaryPath()).toContain("/Resources/google-sidecar/ambient-google-sidecar-");
  });

  it("resolves successful sidecar responses", async () => {
    const child = new FakeChild();
    const supervisor = new GoogleSidecarSupervisor({
      binaryPath: process.execPath,
      idleTimeoutMs: 0,
      spawnProcess: (() => child) as never,
      now: () => 100,
    });
    const request = supervisor.invoke({ method: "sidecar.version", options: { timeoutMs: 1_000 } });
    child.stdin.once("data", (chunk) => {
      const payload = JSON.parse(String(chunk));
      child.stdout.write(`${JSON.stringify({ id: payload.id, ok: true, result: { version: "test" } })}\n`);
    });
    await expect(request).resolves.toEqual({ version: "test" });
    supervisor.dispose();
  });

  it("turns sidecar error envelopes into thrown errors", async () => {
    const child = new FakeChild();
    const supervisor = new GoogleSidecarSupervisor({
      binaryPath: process.execPath,
      idleTimeoutMs: 0,
      spawnProcess: (() => child) as never,
      now: () => 200,
    });
    const request = supervisor.invoke({ method: "gmail.search", accessToken: "token", options: { timeoutMs: 1_000 } });
    child.stdin.once("data", (chunk) => {
      const payload = JSON.parse(String(chunk));
      child.stdout.write(`${JSON.stringify({ id: payload.id, ok: false, error: { code: "google_forbidden", message: "denied", retryable: false } })}\n`);
    });
    await expect(request).rejects.toMatchObject({ message: "denied", code: "google_forbidden" });
    supervisor.dispose();
  });
});

