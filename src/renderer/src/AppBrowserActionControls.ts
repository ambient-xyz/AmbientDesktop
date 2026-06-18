import type { Dispatch, SetStateAction } from "react";

import type { BrowserCapabilityState, BrowserUserActionState } from "../../shared/browserTypes";
import type { DesktopState } from "../../shared/desktopTypes";
import type { MessageDelivery, RunStatus } from "../../shared/threadTypes";
import type { UtilityPanel } from "./RightPanel";
import type { AppendRunActivityLine } from "./AppRunActivity";
import { ambientBrowserRuntimeForUrl } from "./RightPanelRichText";

type BrowserUserActionBusyState = "resume" | "cancel" | undefined;

export function browserUserActionActiveTabContext(browserState: BrowserCapabilityState): string {
  const activeTab = browserState.activeTab;
  return activeTab?.url
    ? ` The active browser tab is now "${activeTab.title || "Untitled"}" at ${activeTab.url}.`
    : "";
}

export function browserUserActionCompletionPrompt(
  action: BrowserUserActionState,
  browserState: BrowserCapabilityState,
): string {
  return `I completed the browser warning. Please retry the blocked ${action.toolName} operation and continue answering my previous request.${browserUserActionActiveTabContext(browserState)} If the active browser page already contains the needed result, use it directly.`;
}

export function browserUserActionDeliveryForRunningState(running: boolean): MessageDelivery {
  return running ? "follow-up" : "prompt";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAppBrowserActionControls({
  appendRunActivityLine,
  chatBrowserUserAction,
  resetRunActivityLines,
  running,
  setBrowserRevision,
  setChatBrowserUserAction,
  setChatBrowserUserActionBusy,
  setError,
  setRightPanel,
  setRunStatus,
  setThreadRunStatuses,
  state,
}: {
  appendRunActivityLine: AppendRunActivityLine;
  chatBrowserUserAction: BrowserUserActionState | undefined;
  resetRunActivityLines: (initialText?: string, threadId?: string) => void;
  running: boolean;
  setBrowserRevision: Dispatch<SetStateAction<number>>;
  setChatBrowserUserAction: Dispatch<SetStateAction<BrowserUserActionState | undefined>>;
  setChatBrowserUserActionBusy: Dispatch<SetStateAction<BrowserUserActionBusyState>>;
  setError: (message: string | undefined) => void;
  setRightPanel: Dispatch<SetStateAction<UtilityPanel | undefined>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state: DesktopState | undefined;
}): {
  cancelBrowserUserActionFromChat: () => Promise<void>;
  continueAfterBrowserUserActionIfReady: (action: BrowserUserActionState | undefined, browserState: BrowserCapabilityState) => Promise<void>;
  openBrowserForUserAction: (action?: BrowserUserActionState) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  openUrlInAmbientBrowser: (url: string) => Promise<void>;
  resumeBrowserUserActionFromChat: () => Promise<void>;
} {
  async function openExternalUrl(url: string): Promise<void> {
    try {
      await window.ambientDesktop.openExternalUrl(url);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function openUrlInAmbientBrowser(url: string): Promise<void> {
    const runtime = ambientBrowserRuntimeForUrl(url, state?.activeWorkspace.path);
    setRightPanel("browser");
    setBrowserRevision((revision) => revision + 1);
    try {
      await window.ambientDesktop.navigateBrowser({ url, profileMode: "isolated", runtime });
      setBrowserRevision((revision) => revision + 1);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function openBrowserForUserAction(action?: BrowserUserActionState): Promise<void> {
    setRightPanel("browser");
    setBrowserRevision((revision) => revision + 1);
    if (action?.runtime !== "chrome") return;

    try {
      const result = await window.ambientDesktop.revealBrowser({ userActionId: action.id, targetId: action.targetId });
      appendRunActivityLine(result.message, result.status === "revealed" ? "state" : "error", { dedupe: false });
      setBrowserRevision((revision) => revision + 1);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function resumeBrowserUserActionFromChat(): Promise<void> {
    setChatBrowserUserActionBusy("resume");
    setError(undefined);
    appendRunActivityLine("You marked the browser warning complete from chat.", "state", { dedupe: false });
    try {
      const nextState = await window.ambientDesktop.resumeBrowserUserAction();
      setChatBrowserUserAction(nextState.userAction);
      setBrowserRevision((revision) => revision + 1);
      await continueAfterBrowserUserActionIfReady(chatBrowserUserAction, nextState);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setChatBrowserUserActionBusy(undefined);
    }
  }

  async function continueAfterBrowserUserActionIfReady(
    action: BrowserUserActionState | undefined,
    browserState: BrowserCapabilityState,
  ): Promise<void> {
    if (!state || !action || browserState.userAction?.active) return;
    const content = browserUserActionCompletionPrompt(action, browserState);
    const wasRunning = running;
    setError(undefined);
    setChatBrowserUserAction(undefined);
    if (wasRunning) {
      appendRunActivityLine("Browser warning completed. Telling Ambient to continue from the current browser page.", "state", { dedupe: false });
    } else {
      resetRunActivityLines("Browser warning completed. Continuing with Ambient.");
      setRunStatus("starting");
      setThreadRunStatuses((statuses) => ({ ...statuses, [state.activeThreadId]: "starting" }));
    }
    await window.ambientDesktop
      .sendMessage({
        threadId: state.activeThreadId,
        content,
        permissionMode: state.settings.permissionMode,
        collaborationMode: state.settings.collaborationMode,
        model: state.settings.model,
        thinkingLevel: state.settings.thinkingLevel,
        delivery: browserUserActionDeliveryForRunningState(wasRunning),
        context: [],
      })
      .catch((err) => {
        setError(errorMessage(err));
        if (!wasRunning) setRunStatus("error");
      });
  }

  async function cancelBrowserUserActionFromChat(): Promise<void> {
    setChatBrowserUserActionBusy("cancel");
    setError(undefined);
    appendRunActivityLine("You dismissed the browser warning from chat.", "state", { dedupe: false });
    try {
      const nextState = await window.ambientDesktop.cancelBrowserUserAction();
      setChatBrowserUserAction(nextState.userAction);
      setBrowserRevision((revision) => revision + 1);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setChatBrowserUserActionBusy(undefined);
    }
  }

  return {
    cancelBrowserUserActionFromChat,
    continueAfterBrowserUserActionIfReady,
    openBrowserForUserAction,
    openExternalUrl,
    openUrlInAmbientBrowser,
    resumeBrowserUserActionFromChat,
  };
}
