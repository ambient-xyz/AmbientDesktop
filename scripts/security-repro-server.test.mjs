import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let activeServer;

afterEach(async () => {
  if (activeServer) {
    await stopServer(activeServer);
    activeServer = undefined;
  }
});

describe("security repro server boundary", () => {
  it("rejects non-loopback host binding", () => {
    const result = spawnSync(process.execPath, ["scripts/security-repro/server.mjs", "--host", "0.0.0.0", "--port", "0"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Refusing to bind security repro server to non-loopback host");
  });

  it("does not emit wildcard CORS and rejects non-local origins", async () => {
    const port = await availableLoopbackPort();
    activeServer = startServer(port);
    await waitForHealth(port);

    const sameOrigin = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { origin: `http://127.0.0.1:${port}` },
    });
    expect(sameOrigin.status).toBe(200);
    expect(sameOrigin.headers.get("access-control-allow-origin")).toBe(`http://127.0.0.1:${port}`);

    const noOrigin = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(noOrigin.status).toBe(200);
    expect(noOrigin.headers.get("access-control-allow-origin")).toBeNull();

    const rejected = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });
});

function startServer(port) {
  return spawn(process.execPath, ["scripts/security-repro/server.mjs", "--port", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("Timed out waiting for security repro server health.");
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "close"), new Promise((resolveStop) => setTimeout(resolveStop, 1_000))]);
  if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
}

async function availableLoopbackPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!address || typeof address === "string") throw new Error("Could not allocate a loopback port.");
  return address.port;
}
