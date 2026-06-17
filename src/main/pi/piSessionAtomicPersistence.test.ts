import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteUtf8FileSync, enableAtomicPiSessionPersistence } from "./piSessionAtomicPersistence";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = join(tmpdir(), `ambient-pi-session-atomic-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("atomic Pi session persistence", () => {
  it("creates the deferred Pi session file as one complete JSONL snapshot", async () => {
    const root = await makeTempRoot();
    const sessionDir = join(root, "sessions");
    const sessionManager = enableAtomicPiSessionPersistence(SessionManager.create(root, sessionDir));
    const sessionFile = sessionManager.getSessionFile();
    expect(sessionFile).toBeTruthy();

    sessionManager.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });

    expect(existsSync(sessionFile!)).toBe(false);

    sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      api: "ambient",
      provider: "ambient",
      model: "ambient-test",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    expect(existsSync(sessionFile!)).toBe(true);
    const lines = readFileSync(sessionFile!, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ type: "session", cwd: root });
    expect(lines[1]).toMatchObject({ type: "message", message: { role: "user", content: "hello" } });
    expect(lines[2]).toMatchObject({ type: "message", message: { role: "assistant" } });
    expect(readdirSync(sessionDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("replaces existing content without exposing a lingering temp file", async () => {
    const root = await makeTempRoot();
    const file = join(root, "session.jsonl");

    atomicWriteUtf8FileSync(file, "first\n");
    atomicWriteUtf8FileSync(file, "second\n");

    expect(readFileSync(file, "utf8")).toBe("second\n");
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
