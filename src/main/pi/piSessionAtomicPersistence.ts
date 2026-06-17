import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { SessionEntry, SessionHeader, SessionManager } from "@mariozechner/pi-coding-agent";

const ATOMIC_PERSISTENCE_PATCHED = Symbol("ambient.atomicPiSessionPersistence");

type PiSessionEntry = SessionHeader | SessionEntry;

interface PatchableSessionManager {
  _persist?: (entry: SessionEntry) => void;
  _rewriteFile?: () => void;
  flushed?: boolean;
  isPersisted: () => boolean;
  getSessionFile: () => string | undefined;
  getHeader: () => SessionHeader | null;
  getEntries: () => SessionEntry[];
  [ATOMIC_PERSISTENCE_PATCHED]?: boolean;
}

export function atomicWriteUtf8FileSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tempPath = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  let fd: number | undefined;

  try {
    fd = openSync(tempPath, "wx", 0o600);
    const bytes = Buffer.from(content, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(fd, bytes, offset, bytes.length - offset);
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tempPath, filePath);
    fsyncDirectoryBestEffort(dir);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

export function enableAtomicPiSessionPersistence<T extends SessionManager>(sessionManager: T): T {
  const manager = sessionManager as unknown as PatchableSessionManager;
  if (manager[ATOMIC_PERSISTENCE_PATCHED]) return sessionManager;
  if (typeof manager._persist !== "function" || typeof manager._rewriteFile !== "function") return sessionManager;

  manager._rewriteFile = () => {
    writeSessionSnapshot(manager);
    manager.flushed = true;
  };

  manager._persist = () => {
    if (!manager.isPersisted() || !manager.getSessionFile()) return;
    if (!sessionHasAssistantMessage(manager)) {
      manager.flushed = false;
      return;
    }
    writeSessionSnapshot(manager);
    manager.flushed = true;
  };

  manager[ATOMIC_PERSISTENCE_PATCHED] = true;
  return sessionManager;
}

function writeSessionSnapshot(manager: PatchableSessionManager): void {
  if (!manager.isPersisted()) return;
  const sessionFile = manager.getSessionFile();
  if (!sessionFile) return;
  const entries = sessionSnapshotEntries(manager);
  const content = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  atomicWriteUtf8FileSync(sessionFile, content);
}

function sessionSnapshotEntries(manager: PatchableSessionManager): PiSessionEntry[] {
  const header = manager.getHeader();
  if (!header) throw new Error("Cannot persist Pi session snapshot without a session header.");
  return [header, ...manager.getEntries()];
}

function sessionHasAssistantMessage(manager: PatchableSessionManager): boolean {
  return manager.getEntries().some((entry) => entry.type === "message" && entry.message.role === "assistant");
}

function fsyncDirectoryBestEffort(dir: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(dir, "r");
    fsyncSync(fd);
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Best effort only.
      }
    }
  }
}
