import type { Dispatch, SetStateAction } from "react";

import type { BrowserCapabilityState, BrowserPickResult, BrowserProfileMode, BrowserScreenshotResult, BrowserUserActionState } from "../../shared/browserTypes";
import { browserPickReferenceText } from "./RightPanelBrowserReferenceText";
import type { BrowserInspectResult } from "./RightPanelBrowserTypes";
import { ambientBrowserRuntimeForUrl } from "./RightPanelRichText";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

type RightPanelBrowserActionInput = {
  workspacePath: string;
  browserState?: BrowserCapabilityState;
  browserUrl: string;
  browserSearch: string;
  browserPickPrompt: string;
  setBrowserState: Dispatch<SetStateAction<BrowserCapabilityState | undefined>>;
  setBrowserUrl: Dispatch<SetStateAction<string>>;
  setBrowserBusy: Dispatch<SetStateAction<string | undefined>>;
  setBrowserUserActionBusy: Dispatch<SetStateAction<string | undefined>>;
  setBrowserError: Dispatch<SetStateAction<string | undefined>>;
  setBrowserStatus: Dispatch<SetStateAction<ApiKeyStatus | undefined>>;
  setBrowserCopyDialogOpen: Dispatch<SetStateAction<boolean>>;
  setBrowserInspectResult: Dispatch<SetStateAction<BrowserInspectResult | undefined>>;
  setLatestBrowserScreenshot: Dispatch<SetStateAction<BrowserScreenshotResult | undefined>>;
  onBrowserUserActionCompleted: (action: BrowserUserActionState, browserState: BrowserCapabilityState) => Promise<void>;
};

export function browserProfileModeForState(browserState?: BrowserCapabilityState): BrowserProfileMode {
  if (browserState?.profileMode === "copied") return "copied";
  if (browserState?.chromeAvailable && (browserState.copiedProfileAvailable || browserState.sourceProfilePath)) return "copied";
  return "isolated";
}

export function createRightPanelBrowserActions({
  workspacePath,
  browserState,
  browserUrl,
  browserSearch,
  browserPickPrompt,
  setBrowserState,
  setBrowserUrl,
  setBrowserBusy,
  setBrowserUserActionBusy,
  setBrowserError,
  setBrowserStatus,
  setBrowserCopyDialogOpen,
  setBrowserInspectResult,
  setLatestBrowserScreenshot,
  onBrowserUserActionCompleted,
}: RightPanelBrowserActionInput) {
  async function loadBrowserState() {
    setBrowserError(undefined);
    try {
      setBrowserState(await window.ambientDesktop.getBrowserState());
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runBrowserAction<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
    setBrowserBusy(label);
    setBrowserError(undefined);
    setBrowserStatus(undefined);
    try {
      const result = await action();
      setBrowserState(await window.ambientDesktop.getBrowserState());
      return result;
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      setBrowserBusy(undefined);
    }
  }

  async function startBrowser(profileMode: BrowserProfileMode) {
    const nextState = await runBrowserAction(`start-${profileMode}`, () => window.ambientDesktop.startBrowser({ profileMode }));
    if (nextState) {
      setBrowserState(nextState);
      setBrowserStatus({ kind: "success", message: `Browser started with ${profileMode} profile.` });
    }
  }

  async function stopBrowser() {
    const nextState = await runBrowserAction("stop", () => window.ambientDesktop.stopBrowser());
    if (nextState) {
      setBrowserState(nextState);
      setBrowserStatus({ kind: "success", message: "Browser stopped." });
    }
  }

  async function clearIsolatedBrowserProfile() {
    const nextState = await runBrowserAction("clear-isolated-profile", () => window.ambientDesktop.clearIsolatedBrowserProfile());
    if (nextState) {
      setBrowserState(nextState);
      setBrowserStatus({ kind: "success", message: "Isolated browser profile cleared." });
    }
  }

  async function copyChromeProfile() {
    const nextState = await runBrowserAction("copy-profile", () => window.ambientDesktop.copyChromeProfile());
    if (nextState) {
      setBrowserCopyDialogOpen(false);
      setBrowserState(nextState);
      setBrowserStatus({ kind: "success", message: "Copied Chrome profile is ready." });
    }
  }

  async function clearCopiedChromeProfile() {
    const nextState = await runBrowserAction("clear-profile", () => window.ambientDesktop.clearCopiedChromeProfile());
    if (nextState) {
      setBrowserState(nextState);
      setBrowserStatus({ kind: "success", message: "Copied Chrome profile cleared." });
    }
  }

  async function navigateBrowser() {
    const url = browserUrl.trim();
    if (!url) return;
    const runtime = ambientBrowserRuntimeForUrl(url, workspacePath);
    const content = await runBrowserAction("navigate", () =>
      window.ambientDesktop.navigateBrowser({ url, profileMode: browserProfileModeForState(browserState), runtime }),
    );
    if (content) {
      setBrowserUrl(content.url ?? url);
      setBrowserStatus({ kind: "success", message: `Opened ${content.title || content.url || url}.` });
    }
  }

  async function refreshBrowserPage() {
    const url = browserState?.activeTab?.url || browserUrl.trim();
    if (!url) return;
    const content = await runBrowserAction("refresh", () =>
      window.ambientDesktop.navigateBrowser({ url, profileMode: browserProfileModeForState(browserState), runtime: browserState?.runtime }),
    );
    if (content) {
      setBrowserUrl(content.url ?? url);
      setBrowserStatus({ kind: "success", message: `Refreshed ${content.title || content.url || url}.` });
    }
  }

  async function searchBrowser() {
    const query = browserSearch.trim();
    if (!query) return;
    const results = await runBrowserAction("search", () =>
      window.ambientDesktop.searchBrowser({ query, maxResults: 5, profileMode: browserProfileModeForState(browserState) }),
    );
    if (results) {
      setBrowserStatus({ kind: "success", message: `Search returned ${results.length} result${results.length === 1 ? "" : "s"}.` });
    }
  }

  async function screenshotBrowser() {
    const screenshot = await runBrowserAction("screenshot", () =>
      window.ambientDesktop.screenshotBrowser({
        profileMode: browserProfileModeForState(browserState),
        artifactWorkspacePath: workspacePath,
      }),
    );
    if (screenshot) {
      setLatestBrowserScreenshot(screenshot);
      setBrowserStatus({ kind: "success", message: `Saved screenshot to ${screenshot.path}.` });
    }
  }

  async function revealBrowser(input?: { userActionId?: string; targetId?: string }) {
    setBrowserBusy("reveal");
    setBrowserError(undefined);
    setBrowserStatus({ kind: "info", message: "Bringing managed Chrome forward." });
    try {
      const result = await window.ambientDesktop.revealBrowser(input);
      setBrowserState(await window.ambientDesktop.getBrowserState());
      setBrowserStatus({ kind: result.status === "revealed" ? "success" : "info", message: result.message });
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error));
    } finally {
      setBrowserBusy(undefined);
    }
  }

  async function copyBrowserInspectReference(result: BrowserPickResult) {
    const clipboardText = browserPickReferenceText(result);
    try {
      await window.ambientDesktop.writeClipboardText(clipboardText);
      setBrowserInspectResult({ result, clipboardText, copiedAt: new Date().toISOString() });
      setBrowserStatus({
        kind: "success",
        message: `Inspected ${result.selections.length} element${result.selections.length === 1 ? "" : "s"}. Copied browser element reference to clipboard.`,
      });
    } catch (error) {
      setBrowserInspectResult({
        result,
        clipboardText,
        copyError: error instanceof Error ? error.message : String(error),
      });
      setBrowserStatus({
        kind: "error",
        message: "Inspected element, but could not copy the reference to clipboard.",
      });
    }
  }

  async function pickBrowserElement() {
    const prompt = browserPickPrompt.trim();
    if (!prompt) return;
    setBrowserInspectResult(undefined);
    const result = await runBrowserAction("pick", () =>
      window.ambientDesktop.pickBrowser({ prompt, profileMode: browserProfileModeForState(browserState) }),
    );
    if (result) {
      if (result.canceled) {
        setBrowserStatus({ kind: "info", message: "Browser inspection canceled." });
      } else {
        await copyBrowserInspectReference(result);
      }
    }
  }

  async function cancelBrowserPicker() {
    const nextState = await runBrowserAction("cancel-picker", () => window.ambientDesktop.cancelBrowserPick());
    if (nextState) {
      setBrowserState(nextState);
      setBrowserStatus({ kind: "info", message: "Browser picker cancellation requested." });
    }
  }

  async function resumeBrowserUserAction() {
    setBrowserUserActionBusy("resume");
    setBrowserError(undefined);
    try {
      const action = browserState?.userAction;
      const nextState = await window.ambientDesktop.resumeBrowserUserAction();
      setBrowserState(nextState);
      setBrowserStatus({ kind: "info", message: "Checking whether the browser warning is complete." });
      if (action && !nextState.userAction?.active) await onBrowserUserActionCompleted(action, nextState);
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error));
    } finally {
      setBrowserUserActionBusy(undefined);
    }
  }

  async function cancelBrowserUserAction() {
    setBrowserUserActionBusy("cancel");
    setBrowserError(undefined);
    try {
      const nextState = await window.ambientDesktop.cancelBrowserUserAction();
      setBrowserState(nextState);
      setBrowserStatus({ kind: "info", message: "Browser warning dismissed." });
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error));
    } finally {
      setBrowserUserActionBusy(undefined);
    }
  }

  return {
    loadBrowserState,
    startBrowser,
    stopBrowser,
    clearIsolatedBrowserProfile,
    copyChromeProfile,
    clearCopiedChromeProfile,
    navigateBrowser,
    refreshBrowserPage,
    searchBrowser,
    screenshotBrowser,
    revealBrowser,
    copyBrowserInspectReference,
    pickBrowserElement,
    cancelBrowserPicker,
    resumeBrowserUserAction,
    cancelBrowserUserAction,
  };
}
