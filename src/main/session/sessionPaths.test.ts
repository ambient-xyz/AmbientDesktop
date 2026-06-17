import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { getRestorablePiSessionFile, getRestorableRecoverySessionFile, isPathInside } from "./sessionPaths";

const tempDirs: string[] = [];

function tempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "ambient-session-paths-"));
  tempDirs.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("isPathInside", () => {
  it("accepts children and rejects sibling prefix matches", () => {
    const root = "/tmp/sessions/thread";

    expect(isPathInside(root, "/tmp/sessions/thread/run.jsonl")).toBe(true);
    expect(isPathInside(root, "/tmp/sessions/thread-evil/run.jsonl")).toBe(false);
    expect(isPathInside(root, "/tmp/sessions/other/run.jsonl")).toBe(false);
  });

  it("treats symlink-equivalent roots and children as the same containment boundary", () => {
    const root = tempDir();
    const realRoot = join(root, "real-workspace");
    const linkedRoot = join(root, "linked-workspace");
    mkdirSync(realRoot);
    try {
      symlinkSync(realRoot, linkedRoot, "dir");
    } catch {
      return;
    }

    expect(isPathInside(linkedRoot, join(realRoot, "app", "index.html"))).toBe(true);
    expect(isPathInside(realRoot, join(linkedRoot, "app", "index.html"))).toBe(true);
    expect(isPathInside(linkedRoot, join(root, "linked-workspace-evil", "index.html"))).toBe(false);
  });
});

describe("getRestorablePiSessionFile", () => {
  it("returns an existing session file under the expected session directory", () => {
    const sessionDir = tempDir();
    const sessionFile = join(sessionDir, "session.jsonl");
    writeFileSync(sessionFile, "");

    expect(getRestorablePiSessionFile(sessionFile, sessionDir)).toBe(sessionFile);
  });

  it("rejects missing or outside session files", () => {
    const sessionDir = tempDir();
    const outsideDir = tempDir();
    const outsideFile = join(outsideDir, "session.jsonl");
    writeFileSync(outsideFile, "");

    expect(getRestorablePiSessionFile(join(sessionDir, "missing.jsonl"), sessionDir)).toBeUndefined();
    expect(getRestorablePiSessionFile(outsideFile, sessionDir)).toBeUndefined();
  });
});

describe("getRestorableRecoverySessionFile", () => {
  it("prefers the recorded thread session file when it is restorable", () => {
    const sessionDir = tempDir();
    const threadSessionFile = join(sessionDir, "thread.jsonl");
    const recoverySessionFile = join(sessionDir, "recovery.jsonl");
    writeFileSync(threadSessionFile, "");
    writeFileSync(recoverySessionFile, "");

    expect(getRestorableRecoverySessionFile({ threadSessionFile, recoverySessionFile, sessionDir })).toEqual({
      sessionFile: threadSessionFile,
      source: "thread",
    });
  });

  it("falls back to the recovery session file when the thread pointer was not persisted", () => {
    const sessionDir = tempDir();
    const recoverySessionFile = join(sessionDir, "recovery.jsonl");
    writeFileSync(recoverySessionFile, "");

    expect(getRestorableRecoverySessionFile({ threadSessionFile: null, recoverySessionFile, sessionDir })).toEqual({
      sessionFile: recoverySessionFile,
      source: "recovery",
    });
  });

  it("rejects recovery files outside the thread session directory", () => {
    const sessionDir = tempDir();
    const outsideDir = tempDir();
    const outsideSessionFile = join(outsideDir, "recovery.jsonl");
    writeFileSync(outsideSessionFile, "");

    expect(
      getRestorableRecoverySessionFile({
        threadSessionFile: join(sessionDir, "missing.jsonl"),
        recoverySessionFile: outsideSessionFile,
        sessionDir,
      }),
    ).toEqual({});
  });
});
