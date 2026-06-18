import { useEffect, useRef, useState } from "react";
import type { BrowserCapabilityState, BrowserCredentialSummary, BrowserPickResult, BrowserProfileMode, BrowserScreenshotResult, BrowserUserActionState, SaveBrowserCredentialInput } from "../../shared/browserTypes";
import type { MiniCpmVisionAnalysisResult, MiniCpmVisionAnalyzeInput, MiniCpmVisionDiagnosticItem } from "../../shared/localRuntimeTypes";
import type { WorkspaceContextReference, WorkspaceFileContent } from "../../shared/workspaceTypes";
import { miniCpmVisionDiagnosticsForFailure } from "../../shared/miniCpmVisionDiagnostics";
import {
  miniCpmVisualAnalyzeInputForBrowserScreenshot,
  miniCpmVisualAnalyzeInputForContextAttachment,
  miniCpmVisualAnalyzeInputForWorkspaceFile,
} from "./miniCpmVisualActionUiModel";
import { browserPickReferenceText } from "./RightPanelBrowserPane";
import {
  contextAttachmentKey,
  truncateUiText,
} from "./RightPanelDetailPanels";
import { ambientBrowserRuntimeForUrl } from "./RightPanelRichText";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export type BrowserInspectResult = {
  result: BrowserPickResult;
  clipboardText: string;
  copiedAt?: string;
  copyError?: string;
};

export type BrowserCredentialForm = SaveBrowserCredentialInput & {
  id?: string;
  password: string;
};

export function emptyBrowserCredentialForm(): BrowserCredentialForm {
  return { label: "", origin: "", username: "", password: "", scope: "workspace" };
}

export function browserProfileModeForState(browserState?: BrowserCapabilityState): BrowserProfileMode {
  if (browserState?.profileMode === "copied") return "copied";
  if (browserState?.chromeAvailable && (browserState.copiedProfileAvailable || browserState.sourceProfilePath)) return "copied";
  return "isolated";
}

export function browserCredentialSaveInputFromForm(browserCredentialForm: BrowserCredentialForm): SaveBrowserCredentialInput {
  return {
    ...browserCredentialForm,
    label: browserCredentialForm.label.trim(),
    origin: browserCredentialForm.origin.trim(),
    username: browserCredentialForm.username.trim(),
  };
}

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
  const [latestBrowserScreenshot, setLatestBrowserScreenshot] = useState<BrowserScreenshotResult | undefined>();
  const [visualAnalysisBusy, setVisualAnalysisBusy] = useState<string | undefined>();
  const [visualAnalysisStatus, setVisualAnalysisStatus] = useState<ApiKeyStatus | undefined>();
  const [visualAnalysisDiagnostics, setVisualAnalysisDiagnostics] = useState<MiniCpmVisionDiagnosticItem[]>([]);
  const [browserCopyDialogOpen, setBrowserCopyDialogOpen] = useState(false);
  const [browserFocused, setBrowserFocused] = useState(false);
  const [browserInspectResult, setBrowserInspectResult] = useState<BrowserInspectResult | undefined>();
  const [browserCredentials, setBrowserCredentials] = useState<BrowserCredentialSummary[]>([]);
  const [browserCredentialForm, setBrowserCredentialForm] = useState<BrowserCredentialForm>(emptyBrowserCredentialForm);
  const [browserCredentialBusy, setBrowserCredentialBusy] = useState<string | undefined>();
  const [browserCredentialStatus, setBrowserCredentialStatus] = useState<ApiKeyStatus | undefined>();
  const browserHostRef = useRef<HTMLDivElement>(null);

  function resetBrowserCredentialForm() {
    setBrowserCredentialForm(emptyBrowserCredentialForm());
  }

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

  useEffect(() => {
    setBrowserCredentials([]);
    resetBrowserCredentialForm();
  }, [workspacePath]);

  async function loadBrowserState() {
    setBrowserError(undefined);
    try {
      setBrowserState(await window.ambientDesktop.getBrowserState());
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadBrowserCredentials() {
    setBrowserCredentialStatus(undefined);
    try {
      setBrowserCredentials(await window.ambientDesktop.listBrowserCredentials());
    } catch (error) {
      setBrowserCredentialStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function editBrowserCredential(credential: BrowserCredentialSummary) {
    setBrowserCredentialForm({
      id: credential.id,
      label: credential.label,
      origin: credential.origin,
      username: credential.username,
      password: "",
      scope: credential.scope,
    });
    setBrowserCredentialStatus({ kind: "info", message: "Enter the password again to update this stored credential." });
  }

  async function saveBrowserCredential() {
    const input = browserCredentialSaveInputFromForm(browserCredentialForm);
    if (!input.label || !input.origin || !input.username || !input.password) {
      setBrowserCredentialStatus({ kind: "error", message: "Label, origin, username, and password are required." });
      return;
    }
    setBrowserCredentialBusy("save");
    setBrowserCredentialStatus(undefined);
    try {
      const next = await window.ambientDesktop.saveBrowserCredential(input);
      setBrowserCredentials(next);
      resetBrowserCredentialForm();
      setBrowserCredentialStatus({ kind: "success", message: "Stored browser credential metadata saved." });
    } catch (error) {
      setBrowserCredentialStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBrowserCredentialBusy(undefined);
    }
  }

  async function deleteBrowserCredential(id: string) {
    setBrowserCredentialBusy(id);
    setBrowserCredentialStatus(undefined);
    try {
      setBrowserCredentials(await window.ambientDesktop.deleteBrowserCredential({ id }));
      if (browserCredentialForm.id === id) resetBrowserCredentialForm();
      setBrowserCredentialStatus({ kind: "success", message: "Stored browser credential deleted." });
    } catch (error) {
      setBrowserCredentialStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBrowserCredentialBusy(undefined);
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

  async function runMiniCpmVisualAnalysis(
    input: MiniCpmVisionAnalyzeInput,
    busyKey: string,
    label: string,
  ): Promise<MiniCpmVisionAnalysisResult | undefined> {
    setVisualAnalysisBusy(busyKey);
    setVisualAnalysisStatus({ kind: "info", message: `Analyzing ${label} with MiniCPM-V...` });
    setVisualAnalysisDiagnostics([]);
    try {
      const result = await window.ambientDesktop.analyzeMiniCpmVisionInput(input);
      const artifact = result.artifacts.jsonPath ? ` Artifact: ${result.artifacts.jsonPath}` : "";
      setVisualAnalysisStatus({
        kind: "success",
        message: `MiniCPM-V analyzed ${label}. ${truncateUiText(result.summary, 180)}${artifact}`,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVisualAnalysisDiagnostics(miniCpmVisionDiagnosticsForFailure({ error: message }));
      setVisualAnalysisStatus({
        kind: "error",
        message,
      });
      return undefined;
    } finally {
      setVisualAnalysisBusy(undefined);
    }
  }

  async function analyzeLatestBrowserScreenshot() {
    if (!latestBrowserScreenshot) return;
    const input = miniCpmVisualAnalyzeInputForBrowserScreenshot(latestBrowserScreenshot);
    const result = await runMiniCpmVisualAnalysis(input, "browser-screenshot", "latest browser screenshot");
    if (result) {
      setBrowserStatus({ kind: "success", message: `MiniCPM-V: ${truncateUiText(result.summary, 180)}` });
    }
  }

  async function analyzeContextAttachmentWithMiniCpm(item: WorkspaceContextReference) {
    const input = miniCpmVisualAnalyzeInputForContextAttachment(item);
    if (!input) {
      setVisualAnalysisDiagnostics(miniCpmVisionDiagnosticsForFailure({ error: "Unsupported MiniCPM-V image or video input extension." }));
      setVisualAnalysisStatus({ kind: "error", message: "MiniCPM-V can analyze PNG, JPG, WebP, MP4, MOV, M4V, or WebM attachments." });
      return;
    }
    await runMiniCpmVisualAnalysis(input, `context:${contextAttachmentKey(item)}`, item.name || item.path);
  }

  async function analyzeWorkspaceFileWithMiniCpm(file: WorkspaceFileContent) {
    const input = miniCpmVisualAnalyzeInputForWorkspaceFile(file);
    if (!input) {
      setVisualAnalysisDiagnostics(miniCpmVisionDiagnosticsForFailure({ error: "Unsupported MiniCPM-V image or video input extension." }));
      setVisualAnalysisStatus({ kind: "error", message: "MiniCPM-V can analyze PNG, JPG, WebP, MP4, MOV, M4V, or WebM files." });
      return;
    }
    await runMiniCpmVisualAnalysis(input, `file:${file.path}`, file.name || file.path);
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
