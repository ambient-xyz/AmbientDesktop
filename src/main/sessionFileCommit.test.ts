import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  piSessionFileCommitDiagnostic,
  piSessionFileExists,
  waitForPiSessionFileCommit,
} from "./sessionFileCommit";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = join(tmpdir(), `ambient-session-file-commit-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("session file commit guard", () => {
  it("waits for a delayed Pi session file before reporting it committed", async () => {
    const root = await makeTempRoot();
    const sessionFile = join(root, "session.jsonl");

    setTimeout(() => {
      void writeFile(sessionFile, "{\"type\":\"session-created\"}\n", "utf8");
    }, 15);

    const result = await waitForPiSessionFileCommit(sessionFile, { timeoutMs: 250, pollMs: 5 });

    expect(result.committed).toBe(true);
    expect(result.sessionFileExists).toBe(true);
    expect(piSessionFileExists(sessionFile)).toBe(true);
  });

  it("returns a bounded pending result when the Pi session file never appears", async () => {
    const root = await makeTempRoot();
    const sessionFile = join(root, "missing-session.jsonl");

    const result = await waitForPiSessionFileCommit(sessionFile, { timeoutMs: 20, pollMs: 5 });

    expect(result.committed).toBe(false);
    expect(result.sessionFileExists).toBe(false);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(20);
  });

  it("builds redaction-safe commit diagnostics for runtime activity", async () => {
    const result = {
      committed: false,
      elapsedMs: 50,
      sessionFile: "/tmp/ambient/session.jsonl",
      sessionFileExists: false,
    };

    expect(
      piSessionFileCommitDiagnostic({
        reason: "run-finished",
        result,
        waitTimeoutMs: 50,
      }),
    ).toEqual({
      reason: "run-finished",
      sessionFile: "/tmp/ambient/session.jsonl",
      sessionFileCommitted: false,
      sessionFileExists: false,
      waitedMs: 50,
      waitTimeoutMs: 50,
    });
  });
});
