import type { ChildProcess, SpawnOptions } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildLocalLlamaServerArgs,
  LocalLlamaServerSupervisor,
  probeLocalLlamaServerHealth,
  readLocalLlamaServerState,
} from "./localLlamaServerSupervisor";

describe("local llama-server supervisor", () => {
  it("builds deterministic llama-server args for a managed GGUF model", () => {
    expect(buildLocalLlamaServerArgs({
      modelPath: "/models/LiteResearcher-4B.Q4_K_M.gguf",
      host: "127.0.0.1",
      port: 43123,
      contextTokens: 16384,
      gpuLayers: 99,
      logPath: "/state/llama-server.log",
      offline: true,
      extraArgs: ["--no-webui"],
    })).toEqual([
      "--model",
      "/models/LiteResearcher-4B.Q4_K_M.gguf",
      "--host",
      "127.0.0.1",
      "--port",
      "43123",
      "-c",
      "16384",
      "-ngl",
      "99",
      "--log-file",
      "/state/llama-server.log",
      "--offline",
      "--no-webui",
    ]);
  });

  it("starts a private llama-server process, writes state, and stops on final lease release", async () => {
    const fixture = await supervisorFixture();
    try {
      const lease = await fixture.supervisor.acquire(fixture.acquireInput({ idleTimeoutMs: 0, ownerThreadId: "thread-1" }));

      expect(lease.state.endpointUrl).toBe("http://127.0.0.1:43123");
      expect(fixture.spawnCalls).toHaveLength(1);
      expect(fixture.spawnCalls[0]).toMatchObject({
        command: fixture.runtimePath,
        args: expect.arrayContaining([
          "--model",
          fixture.modelPath,
          "--host",
          "127.0.0.1",
          "--port",
          "43123",
          "-c",
          "16384",
        ]),
      });
      await expect(readLocalLlamaServerState(fixture.stateRootPath, "literesearcher-4b-q4-k-m")).resolves.toMatchObject({
        pid: lease.state.pid,
        endpointUrl: "http://127.0.0.1:43123",
        ownerThreadId: "thread-1",
      });

      const release = await fixture.supervisor.release(lease.leaseId);

      expect(release).toMatchObject({ status: "stopped", pid: lease.state.pid });
      expect(fixture.alive.has(lease.state.pid)).toBe(false);
      await expect(readLocalLlamaServerState(fixture.stateRootPath, "literesearcher-4b-q4-k-m")).resolves.toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("normalizes IPv6 localhost for endpoint URLs while passing the bind host to llama-server", async () => {
    const fixture = await supervisorFixture();
    try {
      const lease = await fixture.supervisor.acquire(fixture.acquireInput({ host: "[::1]", port: 43124, idleTimeoutMs: 0 }));

      expect(lease.state).toMatchObject({
        host: "::1",
        endpointUrl: "http://[::1]:43124",
      });
      expect(fixture.spawnCalls[0].args).toEqual(expect.arrayContaining(["--host", "::1", "--port", "43124"]));

      await lease.release();
    } finally {
      await fixture.cleanup();
    }
  });

  it("reuses an active process until all leases are released", async () => {
    const fixture = await supervisorFixture();
    try {
      const first = await fixture.supervisor.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));
      const second = await fixture.supervisor.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));

      expect(second.state.pid).toBe(first.state.pid);
      expect(fixture.spawnCalls).toHaveLength(1);
      await expect(fixture.supervisor.release(first.leaseId)).resolves.toMatchObject({
        status: "still-leased",
        remainingLeases: 1,
      });
      expect(fixture.alive.has(first.state.pid)).toBe(true);
      await expect(fixture.supervisor.release(second.leaseId)).resolves.toMatchObject({ status: "stopped" });
      expect(fixture.alive.has(first.state.pid)).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reuses a healthy persisted process after supervisor recreation", async () => {
    const fixture = await supervisorFixture();
    try {
      const first = await fixture.supervisor.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));
      const persisted = await readLocalLlamaServerState(fixture.stateRootPath, "literesearcher-4b-q4-k-m");
      expect(persisted?.command).toEqual(first.state.command);
      const replacement = fixture.newSupervisor();
      const second = await replacement.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));

      expect(second.state.pid).toBe(first.state.pid);
      expect(fixture.spawnCalls).toHaveLength(1);

      await replacement.release(second.leaseId);
      expect(fixture.alive.has(first.state.pid)).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("stops a healthy persisted profile after supervisor recreation", async () => {
    const fixture = await supervisorFixture();
    try {
      const first = await fixture.supervisor.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));
      const replacement = fixture.newSupervisor();

      const result = await replacement.stopProfile({
        stateRootPath: fixture.stateRootPath,
        profileId: "literesearcher-4b-q4-k-m",
      });

      expect(result).toMatchObject({ status: "stopped", pid: first.state.pid });
      expect(fixture.alive.has(first.state.pid)).toBe(false);
      await expect(readLocalLlamaServerState(fixture.stateRootPath, "literesearcher-4b-q4-k-m")).resolves.toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not stop an active leased profile unless forced", async () => {
    const fixture = await supervisorFixture();
    try {
      const lease = await fixture.supervisor.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));

      await expect(fixture.supervisor.stopProfile({
        stateRootPath: fixture.stateRootPath,
        profileId: "literesearcher-4b-q4-k-m",
      })).resolves.toMatchObject({ status: "still-leased", remainingLeases: 1 });
      expect(fixture.alive.has(lease.state.pid)).toBe(true);

      await expect(fixture.supervisor.stopProfile({
        stateRootPath: fixture.stateRootPath,
        profileId: "literesearcher-4b-q4-k-m",
        force: true,
      })).resolves.toMatchObject({ status: "stopped", pid: lease.state.pid });
      expect(fixture.alive.has(lease.state.pid)).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("clears state and fails when the launched process exits before health", async () => {
    const fixture = await supervisorFixture({ spawnAlive: false });
    try {
      await expect(fixture.supervisor.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }))).rejects.toThrow("exited during startup");

      expect(fixture.spawnCalls).toHaveLength(1);
      await expect(readLocalLlamaServerState(fixture.stateRootPath, "literesearcher-4b-q4-k-m")).resolves.toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns bounded health probe details for unhealthy endpoints", async () => {
    const health = await probeLocalLlamaServerHealth("http://127.0.0.1:9", {
      fetchImpl: async () => new Response("not ready", { status: 503 }),
    });

    expect(health).toMatchObject({
      ok: false,
      statusCode: 503,
      textPreview: "not ready",
    });
  });
});

async function supervisorFixture(options: { spawnAlive?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "ambient-local-llama-supervisor-"));
  const runtimePath = join(root, "llama-server");
  const modelPath = join(root, "LiteResearcher-4B.Q4_K_M.gguf");
  const stateRootPath = join(root, "state");
  await writeFile(runtimePath, "synthetic llama-server", "utf8");
  await writeFile(modelPath, "synthetic model", "utf8");
  const alive = new Set<number>();
  const spawnCalls: Array<{ command: string; args: string[]; options: SpawnOptions; pid: number }> = [];
  let nextPid = 4000;
  const spawnProcess = vi.fn((command: string, args: string[], spawnOptions: SpawnOptions) => {
    const pid = nextPid += 1;
    if (options.spawnAlive !== false) alive.add(pid);
    spawnCalls.push({ command, args, options: spawnOptions, pid });
    return {
      pid,
      unref: vi.fn(),
    } as unknown as ChildProcess;
  });
  const processAlive = (pid: number) => alive.has(pid);
  const killProcess = (pid: number) => {
    alive.delete(pid);
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith("/health")) return jsonResponse({ status: "ok" });
    return new Response("not found", { status: 404 });
  });
  const newSupervisor = () => new LocalLlamaServerSupervisor({
    spawnProcess,
    processAlive,
    killProcess,
    fetchImpl: fetchImpl as typeof fetch,
    portAllocator: async () => 43123,
    sleep: async () => undefined,
    now: () => new Date("2026-05-28T12:00:00.000Z"),
  });
  const supervisor = newSupervisor();
  return {
    root,
    runtimePath,
    modelPath,
    stateRootPath,
    alive,
    spawnCalls,
    supervisor,
    newSupervisor,
    acquireInput: (overrides: Partial<Parameters<LocalLlamaServerSupervisor["acquire"]>[0]> = {}) => ({
      profileId: "literesearcher-4b-q4-k-m",
      runtimeBinaryPath: runtimePath,
      modelPath,
      stateRootPath,
      contextTokens: 16384,
      ...overrides,
    }),
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
