import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ChatMessage, ExportChatResult, RunStatus } from "../../shared/threadTypes";
import type { ApiKeyStatus } from "./RightPanel";
import {
  COMPACT_CONTEXT_ACTIVITY,
  EXPORT_CHAT_CANCELED_STATUS,
  RECOVER_CONTEXT_ACTIVITY,
  canStartActiveThreadMaintenance,
  chatPdfExportStatusMessage,
  createAppThreadMaintenanceActionsForApp,
  type AppThreadMaintenanceActionsForAppInput,
  desktopStateWithContextUsage,
  threadRunStatusesWithStatus,
} from "./AppThreadMaintenanceActions";

describe("App thread maintenance actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("maps App owner state into thread maintenance actions", async () => {
    const state = desktopState();
    const setState = stateSetter<DesktopState | undefined>(state);
    const setChatExportBusy = stateSetter(false);
    const setChatExportStatus = stateSetter<ApiKeyStatus | undefined>(undefined);
    const setContextRecoveryBusy = stateSetter(false);
    const setRunStatus = stateSetter<RunStatus>("idle");
    const setThreadRunStatuses = stateSetter<Record<string, RunStatus>>({});
    const applyProjectActionState = vi.fn();
    const projectIdForWorkspacePath = vi.fn(() => "project-1");
    const resetRunActivityLines = vi.fn();
    const retryFailedPrompt = vi.fn(async () => undefined);
    const setError = vi.fn();
    const latestRecoveryPrompt = chatMessage({ id: "message-retry", content: "Retry this prompt" });
    const exportedChat: ExportChatResult = {
      path: "/tmp/thread-1.json",
      bytes: 256,
      createdAt: "2026-06-22T00:00:00.000Z",
      source: "pi-session",
    };
    const forkedState = desktopState({ activeThreadId: "thread-copy" });
    const recoveredContext = { percent: 18, diagnostics: { message: "Recovered" } } as DesktopState["contextUsage"];
    const exportChat = vi.fn(async () => exportedChat);
    const recoverThreadContext = vi.fn(async () => recoveredContext);
    const forkThread = vi.fn(async () => forkedState);
    vi.stubGlobal("window", {
      ambientDesktop: {
        exportChat,
        forkThread,
        recoverThreadContext,
      },
    });

    const actions = createAppThreadMaintenanceActionsForApp({
      appDesktopStateAppliers: { applyProjectActionState },
      composerRetryActions: { retryFailedPrompt },
      conversationDisplayModel: { latestRecoveryPrompt },
      coreLifecycleControls: { resetRunActivityLines },
      navigationActions: { projectIdForWorkspacePath },
      runActivityState: {
        setRunStatus: setRunStatus.set,
        setThreadRunStatuses: setThreadRunStatuses.set,
      },
      running: false,
      setState: setState.set,
      shellUiState: { setError },
      state,
      workflowRuntimeState: {
        chatExportBusy: false,
        contextRecoveryBusy: false,
        setChatExportBusy: setChatExportBusy.set,
        setChatExportStatus: setChatExportStatus.set,
        setContextRecoveryBusy: setContextRecoveryBusy.set,
      },
    });

    await expect(actions.exportActiveChat()).resolves.toBe(exportedChat);
    expect(exportChat).toHaveBeenCalledWith({ threadId: "thread-1" });
    expect(setChatExportBusy.value).toBe(false);
    expect(setChatExportStatus.value).toEqual({
      kind: "success",
      message: "Exported Pi session: thread-1.json",
    });

    await actions.recoverActiveThreadContextAndRetryLatest();
    expect(setContextRecoveryBusy.value).toBe(false);
    expect(resetRunActivityLines).toHaveBeenCalledWith(RECOVER_CONTEXT_ACTIVITY);
    expect(recoverThreadContext).toHaveBeenCalledWith({
      threadId: "thread-1",
      reason: "Nearly full",
    });
    expect(setState.value?.contextUsage).toEqual(recoveredContext);
    expect(retryFailedPrompt).toHaveBeenCalledWith(latestRecoveryPrompt);

    await actions.duplicateActiveThreadFromTranscript();
    expect(projectIdForWorkspacePath).toHaveBeenCalledWith("/repo");
    expect(forkThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      projectId: "project-1",
      mode: "local",
    });
    expect(applyProjectActionState).toHaveBeenCalledWith(forkedState);
    expect(setError).toHaveBeenCalledWith(undefined);
  });
});

function stateSetter<T>(initialValue: T) {
  let value = initialValue;
  const set = vi.fn((next: T | ((current: T) => T)) => {
    value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
  });
  return {
    get value() {
      return value;
    },
    set,
  };
}

function desktopState(overrides: Partial<DesktopState> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    contextUsage: { percent: 95, diagnostics: { message: "Nearly full" } },
    workspace: { path: "/repo", name: "Repo" },
    ...overrides,
  } as unknown as DesktopState;
}

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "user",
    content: "Run the build",
    createdAt: "2026-06-22T00:00:00.000Z",
    ...overrides,
  };
}
