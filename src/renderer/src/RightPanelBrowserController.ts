import { useEffect, useRef, useState } from "react";
import type { BrowserCapabilityState, BrowserUserActionState } from "../../shared/browserTypes";
import { browserProfileModeForState, createRightPanelBrowserActions, type BrowserInspectResult } from "./RightPanelBrowserActions";
import {
  browserCredentialSaveInputFromForm,
  emptyBrowserCredentialForm,
  useRightPanelBrowserCredentialController,
} from "./RightPanelBrowserCredentialController";
import type { BrowserCredentialForm } from "./RightPanelBrowserCredentialController";
import { useRightPanelBrowserVisualAnalysisController } from "./RightPanelBrowserVisualAnalysisController";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export { browserCredentialSaveInputFromForm, emptyBrowserCredentialForm };
export type { BrowserCredentialForm };
export { browserProfileModeForState };
export type { BrowserInspectResult };

export function useRightPanelBrowserController({
  panel,
  workspacePath,
  browserRevision,
  onBrowserUserActionCompleted,
}: {
  panel: string;
  workspacePath: string;
  browserRevision: number;
  onBrowserUserActionCompleted: (action: BrowserUserActionState, browserState: BrowserCapabilityState) => Promise<void>;
}) {
  const [browserState, setBrowserState] = useState<BrowserCapabilityState | undefined>();
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserSearch, setBrowserSearch] = useState("");
  const [browserPickPrompt, setBrowserPickPrompt] = useState("Select the page element Ambient should inspect");
  const [browserBusy, setBrowserBusy] = useState<string | undefined>();
  const [browserUserActionBusy, setBrowserUserActionBusy] = useState<string | undefined>();
  const [browserError, setBrowserError] = useState<string | undefined>();
  const [browserStatus, setBrowserStatus] = useState<ApiKeyStatus | undefined>();
  const [browserCopyDialogOpen, setBrowserCopyDialogOpen] = useState(false);
  const [browserFocused, setBrowserFocused] = useState(false);
  const [browserInspectResult, setBrowserInspectResult] = useState<BrowserInspectResult | undefined>();
  const browserHostRef = useRef<HTMLDivElement>(null);
  const {
    browserCredentials,
    browserCredentialForm,
    setBrowserCredentialForm,
    browserCredentialBusy,
    browserCredentialStatus,
    loadBrowserCredentials,
    resetBrowserCredentialForm,
    editBrowserCredential,
    saveBrowserCredential,
    deleteBrowserCredential,
  } = useRightPanelBrowserCredentialController({ workspacePath });
  const {
    latestBrowserScreenshot,
    setLatestBrowserScreenshot,
    visualAnalysisBusy,
    visualAnalysisStatus,
    visualAnalysisDiagnostics,
    analyzeLatestBrowserScreenshot,
    analyzeContextAttachmentWithMiniCpm,
    analyzeWorkspaceFileWithMiniCpm,
  } = useRightPanelBrowserVisualAnalysisController({ setBrowserStatus });
  const browserActions = createRightPanelBrowserActions({
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
  });
  const {
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
  } = browserActions;

  useEffect(() => {
    if (panel === "browser") {
      void loadBrowserState();
      void loadBrowserCredentials();
    }
  }, [panel, workspacePath, browserRevision]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    const hideBrowserView = () =>
      window.ambientDesktop.setBrowserViewBounds({ x: 0, y: 0, width: 0, height: 0, visible: false }).catch(() => undefined);
    const syncBrowserView = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (disposed) return;
        const host = browserHostRef.current;
        if (!host || panel !== "browser" || browserState?.runtime !== "internal" || !browserState.running) {
          void hideBrowserView();
          return;
        }
        const rect = host.getBoundingClientRect();
        void window.ambientDesktop.setBrowserViewBounds({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          visible: rect.width > 24 && rect.height > 24,
        });
      });
    };
    if (panel !== "browser" || browserState?.runtime !== "internal" || !browserState.running || !browserHostRef.current) {
      void hideBrowserView();
      return () => {
        disposed = true;
        window.cancelAnimationFrame(frame);
      };
    }
    const observer = new ResizeObserver(syncBrowserView);
    observer.observe(browserHostRef.current);
    window.addEventListener("resize", syncBrowserView);
    const interval = window.setInterval(syncBrowserView, 500);
    syncBrowserView();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", syncBrowserView);
      window.clearInterval(interval);
      window.cancelAnimationFrame(frame);
      void hideBrowserView();
    };
  }, [panel, browserState?.runtime, browserState?.running, browserState?.activeTab?.url, browserFocused]);

  useEffect(() => {
    if (panel !== "browser") setBrowserFocused(false);
  }, [panel]);

  useEffect(() => {
    if (!browserFocused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBrowserFocused(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [browserFocused]);

  return {
    browserState,
    setBrowserState,
    browserUrl,
    setBrowserUrl,
    browserSearch,
    setBrowserSearch,
    browserPickPrompt,
    setBrowserPickPrompt,
    browserBusy,
    browserUserActionBusy,
    browserError,
    browserStatus,
    latestBrowserScreenshot,
    visualAnalysisBusy,
    visualAnalysisStatus,
    visualAnalysisDiagnostics,
    browserCopyDialogOpen,
    setBrowserCopyDialogOpen,
    browserFocused,
    setBrowserFocused,
    browserInspectResult,
    browserCredentials,
    browserCredentialForm,
    setBrowserCredentialForm,
    browserCredentialBusy,
    browserCredentialStatus,
    browserHostRef,
    loadBrowserState,
    loadBrowserCredentials,
    resetBrowserCredentialForm,
    editBrowserCredential,
    saveBrowserCredential,
    deleteBrowserCredential,
    startBrowser,
    stopBrowser,
    clearIsolatedBrowserProfile,
    copyChromeProfile,
    clearCopiedChromeProfile,
    navigateBrowser,
    refreshBrowserPage,
    searchBrowser,
    screenshotBrowser,
    analyzeLatestBrowserScreenshot,
    analyzeContextAttachmentWithMiniCpm,
    analyzeWorkspaceFileWithMiniCpm,
    revealBrowser,
    copyBrowserInspectReference,
    pickBrowserElement,
    cancelBrowserPicker,
    resumeBrowserUserAction,
    cancelBrowserUserAction,
  };
}
