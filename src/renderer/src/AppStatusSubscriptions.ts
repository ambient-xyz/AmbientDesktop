import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type {
  BrowserUserActionState,
  DesktopState,
  GitReviewSummary,
  RunStatus,
  WorkspaceGitStatus,
} from "../../shared/types";
import { chatBrowserUserActionForThread } from "./AppChatChrome";
import type { RunActivityLine } from "./AppRunActivity";
import type { UtilityPanel } from "./RightPanel";

type AppendRunActivityLine = (
  text: string,
  kind?: RunActivityLine["kind"],
  options?: { dedupe?: boolean },
  threadId?: string,
) => void;

export function useAppStatusSubscriptions({
  state,
  running,
  threadRunStatuses,
  chatBrowserUserAction,
  browserRevision,
  workspaceRevision,
  abortArmDelayMs,
  runActivityLastEventAtRef,
  runActivityHeartbeatIndexRef,
  setState,
  setRunStatus,
  setChatBrowserUserAction,
  setRightPanel,
  setAbortArmed,
  appendRunActivityLine,
  setGitStatus,
  setGitStatusError,
  setActiveGitReview,
  setActiveGitReviewError,
}: {
  state?: DesktopState;
  running: boolean;
  threadRunStatuses: Record<string, RunStatus>;
  chatBrowserUserAction?: BrowserUserActionState;
  browserRevision: number;
  workspaceRevision: number;
  abortArmDelayMs: number;
  runActivityLastEventAtRef: MutableRefObject<number>;
  runActivityHeartbeatIndexRef: MutableRefObject<number>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setChatBrowserUserAction: Dispatch<SetStateAction<BrowserUserActionState | undefined>>;
  setRightPanel: Dispatch<SetStateAction<UtilityPanel | undefined>>;
  setAbortArmed: Dispatch<SetStateAction<boolean>>;
  appendRunActivityLine: AppendRunActivityLine;
  setGitStatus: Dispatch<SetStateAction<WorkspaceGitStatus | undefined>>;
  setGitStatusError: Dispatch<SetStateAction<string | undefined>>;
  setActiveGitReview: Dispatch<SetStateAction<GitReviewSummary | undefined>>;
  setActiveGitReviewError: Dispatch<SetStateAction<string | undefined>>;
}) {
  useEffect(() => {
    if (!state?.activeThreadId) return;
    setRunStatus(threadRunStatuses[state.activeThreadId] ?? "idle");
  }, [state?.activeThreadId, threadRunStatuses]);

  useEffect(() => {
    if (!state?.activeThreadId) return;
    let disposed = false;
    void window.ambientDesktop
      .getContextUsage(state.activeThreadId)
      .then((snapshot) => {
        if (!disposed) setState((current) => (current ? { ...current, contextUsage: snapshot } : current));
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [state?.activeThreadId]);

  useEffect(() => {
    if (!state?.activeWorkspace.path) return;
    let disposed = false;
    void window.ambientDesktop
      .getBrowserState()
      .then((browserState) => {
        if (!disposed) setChatBrowserUserAction(chatBrowserUserActionForThread(browserState.userAction, state.activeThreadId));
      })
      .catch(() => {
        if (!disposed) setChatBrowserUserAction(undefined);
      });
    return () => {
      disposed = true;
    };
  }, [state?.activeWorkspace.path, state?.activeThreadId, browserRevision]);

  useEffect(() => {
    if (!chatBrowserUserAction?.active) return;
    setRightPanel("browser");
  }, [chatBrowserUserAction?.id, chatBrowserUserAction?.active, chatBrowserUserAction?.runtime]);

  useEffect(() => {
    if (!state?.workspace.path) return;
    let disposed = false;
    setGitStatusError(undefined);
    void window.ambientDesktop
      .getWorkspaceGitStatus()
      .then((status) => {
        if (!disposed) setGitStatus(status);
      })
      .catch((err) => {
        if (!disposed) setGitStatusError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      disposed = true;
    };
  }, [state?.activeWorkspace.path, workspaceRevision]);

  useEffect(() => {
    if (!state?.activeWorkspace.path || !state.activeThreadId) return;
    let disposed = false;
    setActiveGitReviewError(undefined);
    setActiveGitReview(undefined);
    void window.ambientDesktop
      .getGitReview()
      .then((review) => {
        if (!disposed) setActiveGitReview(review);
      })
      .catch((err) => {
        if (!disposed) {
          setActiveGitReview(undefined);
          setActiveGitReviewError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      disposed = true;
    };
  }, [state?.activeWorkspace.path, state?.activeThreadId, workspaceRevision]);

  useEffect(() => {
    if (!running) {
      setAbortArmed(false);
      return;
    }

    const timer = window.setTimeout(() => setAbortArmed(true), abortArmDelayMs);
    return () => window.clearTimeout(timer);
  }, [running, state?.activeThreadId, abortArmDelayMs]);

  useEffect(() => {
    if (!state?.activeThreadId || !running) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - runActivityLastEventAtRef.current < 4500) return;
      const phrases = [
        "Waiting for the next Ambient stream event.",
        "Still connected; watching for reasoning, text, or tool activity.",
        "Ambient is still working on this request.",
        "No new model event yet; keeping the run open.",
      ];
      const phrase = phrases[runActivityHeartbeatIndexRef.current % phrases.length];
      runActivityHeartbeatIndexRef.current += 1;
      const elapsed = Math.max(4, Math.round((Date.now() - startedAt) / 1000));
      appendRunActivityLine(`${phrase} ${elapsed}s elapsed.`, "heartbeat", { dedupe: false });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [running, state?.activeThreadId]);
}
