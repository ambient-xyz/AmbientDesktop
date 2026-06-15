import { describe, expect, it, vi } from "vitest";
import {
  cleanupRuntimeSession,
  type RuntimeSessionCleanupSession,
} from "./runtimeSessionCleanup";

describe("cleanupRuntimeSession", () => {
  it("is a no-op when no session is available", () => {
    expect(cleanupRuntimeSession({})).toEqual({
      removedActiveSession: false,
      disposedSession: false,
      disposeFailed: false,
      clearedPersistedSessionFile: false,
    });
  });

  it("removes the active session and disposes the session", () => {
    const session: RuntimeSessionCleanupSession = {
      sessionFile: "/tmp/session.jsonl",
      dispose: vi.fn(),
    };
    const removeActiveSessionIfCurrent = vi.fn(() => true);

    expect(cleanupRuntimeSession({ session, removeActiveSessionIfCurrent })).toEqual({
      removedActiveSession: true,
      disposedSession: true,
      disposeFailed: false,
      clearedPersistedSessionFile: false,
    });
    expect(removeActiveSessionIfCurrent).toHaveBeenCalledWith(session);
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("treats dispose failures as best-effort cleanup", () => {
    const session: RuntimeSessionCleanupSession = {
      sessionFile: "/tmp/session.jsonl",
      dispose: vi.fn(() => {
        throw new Error("dispose failed");
      }),
    };

    expect(cleanupRuntimeSession({ session })).toEqual({
      removedActiveSession: false,
      disposedSession: true,
      disposeFailed: true,
      clearedPersistedSessionFile: false,
    });
  });

  it("clears the persisted thread session file when it still points at the disposed session", () => {
    const session: RuntimeSessionCleanupSession = {
      sessionFile: "/tmp/current-session.jsonl",
      dispose: vi.fn(),
    };
    const clearThreadPiSessionFile = vi.fn();

    expect(cleanupRuntimeSession({
      session,
      clearPersistedSessionFileIfCurrent: {
        usesDedicatedReviewSession: false,
        currentThreadPiSessionFile: () => "/tmp/current-session.jsonl",
        clearThreadPiSessionFile,
      },
    })).toEqual({
      removedActiveSession: false,
      disposedSession: true,
      disposeFailed: false,
      clearedPersistedSessionFile: true,
    });
    expect(clearThreadPiSessionFile).toHaveBeenCalledWith("/tmp/current-session.jsonl");
  });

  it("does not clear changed, missing, or dedicated-review session pointers", () => {
    const changedSession: RuntimeSessionCleanupSession = {
      sessionFile: "/tmp/current-session.jsonl",
      dispose: vi.fn(),
    };
    const missingFileSession: RuntimeSessionCleanupSession = {
      dispose: vi.fn(),
    };
    const clearThreadPiSessionFile = vi.fn();

    expect(cleanupRuntimeSession({
      session: changedSession,
      clearPersistedSessionFileIfCurrent: {
        usesDedicatedReviewSession: false,
        currentThreadPiSessionFile: () => "/tmp/other-session.jsonl",
        clearThreadPiSessionFile,
      },
    }).clearedPersistedSessionFile).toBe(false);
    expect(cleanupRuntimeSession({
      session: missingFileSession,
      clearPersistedSessionFileIfCurrent: {
        usesDedicatedReviewSession: false,
        currentThreadPiSessionFile: () => "/tmp/other-session.jsonl",
        clearThreadPiSessionFile,
      },
    }).clearedPersistedSessionFile).toBe(false);
    expect(cleanupRuntimeSession({
      session: changedSession,
      clearPersistedSessionFileIfCurrent: {
        usesDedicatedReviewSession: true,
        currentThreadPiSessionFile: () => "/tmp/current-session.jsonl",
        clearThreadPiSessionFile,
      },
    }).clearedPersistedSessionFile).toBe(false);
    expect(clearThreadPiSessionFile).not.toHaveBeenCalled();
  });
});
