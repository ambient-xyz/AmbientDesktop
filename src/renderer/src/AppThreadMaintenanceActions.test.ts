import { describe, expect, it } from "vitest";

import type { DesktopState, RunStatus } from "../../shared/types";
import {
  COMPACT_CONTEXT_ACTIVITY,
  EXPORT_CHAT_CANCELED_STATUS,
  RECOVER_CONTEXT_ACTIVITY,
  canStartActiveThreadMaintenance,
  chatPdfExportStatusMessage,
  desktopStateWithContextUsage,
  threadRunStatusesWithStatus,
} from "./AppThreadMaintenanceActions";

describe("App thread maintenance actions", () => {
  it("updates context usage without replacing sibling desktop state", () => {
    const state = {
      activeThreadId: "thread-1",
      contextUsage: { percent: 10 },
      threads: [{ id: "thread-1" }],
    } as unknown as DesktopState;
    const nextContextUsage = { percent: 42, diagnostics: { message: "Recovered" } } as DesktopState["contextUsage"];

    expect(desktopStateWithContextUsage(state, nextContextUsage)).toEqual({
      activeThreadId: "thread-1",
      contextUsage: nextContextUsage,
      threads: [{ id: "thread-1" }],
    });
  });

  it("updates one thread run status without dropping other thread statuses", () => {
    const statuses: Record<string, RunStatus> = {
      "thread-1": "idle",
      "thread-2": "streaming",
    };

    expect(threadRunStatusesWithStatus(statuses, "thread-1", "compacting")).toEqual({
      "thread-1": "compacting",
      "thread-2": "streaming",
    });
  });

  it("only allows active-thread maintenance when a thread exists and the shell is idle", () => {
    expect(canStartActiveThreadMaintenance({ state: undefined, running: false })).toBe(false);
    expect(canStartActiveThreadMaintenance({ state: { activeThreadId: "" }, running: false })).toBe(false);
    expect(canStartActiveThreadMaintenance({ state: { activeThreadId: "thread-1" }, running: true })).toBe(false);
    expect(canStartActiveThreadMaintenance({ state: { activeThreadId: "thread-1" }, running: false, busy: true })).toBe(false);
    expect(canStartActiveThreadMaintenance({ state: { activeThreadId: "thread-1" }, running: false })).toBe(true);
  });

  it("keeps user-facing maintenance status copy stable", () => {
    expect(COMPACT_CONTEXT_ACTIVITY).toBe("Compacting context.");
    expect(RECOVER_CONTEXT_ACTIVITY).toBe("Rebuilding model context from the visible transcript.");
    expect(EXPORT_CHAT_CANCELED_STATUS).toEqual({ kind: "info", message: "Export canceled." });
    expect(chatPdfExportStatusMessage({
      path: "/tmp/debug-chat.pdf",
      bytes: 1024,
      createdAt: "2026-06-17T00:00:00.000Z",
      source: "visible-chat-pdf",
    })).toBe("Exported visible transcript PDF: debug-chat.pdf");
  });
});
