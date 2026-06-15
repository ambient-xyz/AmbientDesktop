import { EventEmitter } from "node:events";
import type { SpawnOptions } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { TelegramBridgeSupervisor } from "./telegramBridgeSupervisor";

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  pid = 12345;
  kill(): boolean {
    this.killed = true;
    this.emit("exit", 0, null);
    return true;
  }
}

describe("TelegramBridgeSupervisor", () => {
  it("reports missing when the Ambient Agent Telegram package is absent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "telegram-bridge-missing-"));
    const supervisor = new TelegramBridgeSupervisor({
      ambientAgentRoot: root,
      workspacePath: "/workspace",
      env: {},
      now: () => new Date("2026-05-11T00:00:00.000Z"),
    });

    expect(supervisor.status()).toMatchObject({
      providerId: "telegram-tdlib",
      state: "missing",
      managed: false,
      command: "pnpm",
      args: ["--dir", root, "telegram:bridge"],
      bridgeBaseUrl: "http://127.0.0.1:8091",
      stateRoot: "/workspace/.ambient-agent-state/telegram",
      safeRootProbeOnly: true,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it("starts and stops the bridge command without exposing secret values", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "telegram-bridge-root-"));
    mkdirSync(path.join(root, "packages", "telegram"), { recursive: true });
    writeFileSync(path.join(root, "packages", "telegram", "package.json"), "{}");
    const child = new FakeChild();
    const spawned: Array<{ command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv }> = [];
    const supervisor = new TelegramBridgeSupervisor({
      ambientAgentRoot: root,
      workspacePath: "/workspace",
      env: {
        PATH: "/bin",
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "super-secret-hash",
      },
      spawnProcess: ((command: string, args: readonly string[] = [], options?: SpawnOptions) => {
        spawned.push({ command, args: Array.from(args), cwd: typeof options?.cwd === "string" ? options.cwd : undefined, env: options?.env as NodeJS.ProcessEnv });
        return child;
      }) as never,
      now: () => new Date("2026-05-11T00:00:00.000Z"),
    });

    const started = await supervisor.start({
      readiness: {
        providerId: "telegram-tdlib",
        status: "degraded",
        configured: true,
        bridgeReachable: false,
        authNeeded: false,
        apiCredentialsPresent: true,
        persistedSessionCount: 1,
        checkedAt: "2026-05-11T00:00:00.000Z",
        message: "ready enough to launch",
        diagnostics: [],
        sessions: [],
      },
    });
    child.stderr.write("using api hash super-secret-hash\n");

    expect(started).toMatchObject({
      state: "running",
      managed: true,
      pid: 12345,
      envKeys: expect.arrayContaining([
        "AMBIENT_AGENT_TELEGRAM_API_HASH",
        "AMBIENT_AGENT_TELEGRAM_API_ID",
        "AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT",
        "AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
      ]),
    });
    expect(spawned[0]).toMatchObject({
      command: "pnpm",
      args: ["--dir", root, "telegram:bridge"],
      cwd: root,
    });
    expect(spawned[0]?.env?.AMBIENT_AGENT_TELEGRAM_STATE_ROOT).toBe("/workspace/.ambient-agent-state/telegram");
    expect(JSON.stringify(supervisor.status())).not.toContain("super-secret-hash");

    const stopped = await supervisor.stop();
    expect(stopped).toMatchObject({
      state: "stopped",
      managed: false,
    });
    expect(child.killed).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to launch without configured metadata and API credentials", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "telegram-bridge-prereq-"));
    mkdirSync(path.join(root, "packages", "telegram"), { recursive: true });
    writeFileSync(path.join(root, "packages", "telegram", "package.json"), "{}");
    const supervisor = new TelegramBridgeSupervisor({
      ambientAgentRoot: root,
      env: {},
    });

    await expect(supervisor.start({
      readiness: {
        providerId: "telegram-tdlib",
        status: "not-configured",
        configured: false,
        bridgeReachable: false,
        authNeeded: true,
        apiCredentialsPresent: false,
        persistedSessionCount: 0,
        checkedAt: "2026-05-11T00:00:00.000Z",
        message: "missing",
        diagnostics: [],
        sessions: [],
      },
    })).rejects.toThrow("configured local session metadata");

    rmSync(root, { recursive: true, force: true });
  });

  it("can launch for Telegram auth setup with API credentials before session metadata exists", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "telegram-bridge-setup-"));
    mkdirSync(path.join(root, "packages", "telegram"), { recursive: true });
    writeFileSync(path.join(root, "packages", "telegram", "package.json"), "{}");
    const child = new FakeChild();
    const spawned: Array<{ command: string; args: string[] }> = [];
    const supervisor = new TelegramBridgeSupervisor({
      ambientAgentRoot: root,
      workspacePath: "/workspace",
      env: {
        PATH: "/bin",
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret-hash",
      },
      spawnProcess: ((command: string, args: readonly string[] = []) => {
        spawned.push({ command, args: Array.from(args) });
        return child;
      }) as never,
    });

    const started = await supervisor.startForSetup({ apiCredentialsPresent: true });

    expect(started).toMatchObject({
      state: "running",
      managed: true,
      safeRootProbeOnly: true,
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({
      command: "pnpm",
      args: ["--dir", root, "telegram:bridge"],
    });
    expect(JSON.stringify(started)).not.toContain("secret-hash");

    await supervisor.stop();
    rmSync(root, { recursive: true, force: true });
  });
});
