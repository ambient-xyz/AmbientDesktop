import type { RefObject } from "react";
import type {
  BrowserCapabilityState,
  BrowserCredentialSummary,
  BrowserPickResult,
  BrowserScreenshotResult,
  BrowserProfileMode,
} from "../../shared/browserTypes";
import type { MiniCpmVisionDiagnosticItem } from "../../shared/localRuntimeTypes";
import type { BrowserCredentialForm } from "./RightPanelBrowserCredentialController";

export type BrowserPaneApiKeyStatus = { kind: "info" | "success" | "error"; message: string };

export type BrowserInspectResult = {
  result: BrowserPickResult;
  clipboardText: string;
  copiedAt?: string;
  copyError?: string;
};

export type RightPanelBrowserPaneViewProps = {
  browserState: BrowserCapabilityState | undefined;
  browserHostRef: RefObject<HTMLDivElement | null>;
  browserUrl: string;
  browserSearch: string;
  browserPickPrompt: string;
  browserBusy: string | undefined;
  browserUserActionBusy: string | undefined;
  browserError: string | undefined;
  browserStatus: BrowserPaneApiKeyStatus | undefined;
  latestBrowserScreenshot: BrowserScreenshotResult | undefined;
  visualAnalysisBusy: string | undefined;
  visualAnalysisStatus: BrowserPaneApiKeyStatus | undefined;
  visualAnalysisDiagnostics: MiniCpmVisionDiagnosticItem[];
  browserInspectResult: BrowserInspectResult | undefined;
  browserCredentialStatus: BrowserPaneApiKeyStatus | undefined;
  browserCredentialBusy: string | undefined;
  browserCredentialForm: BrowserCredentialForm;
  browserCredentials: BrowserCredentialSummary[];
  formatTimelineTime: (value: string) => string;
  onBrowserFocusedChange: (focused: boolean) => void;
  onBrowserUrlChange: (value: string) => void;
  onBrowserSearchChange: (value: string) => void;
  onBrowserPickPromptChange: (value: string) => void;
  onStartBrowser: (profileMode: BrowserProfileMode) => void | Promise<void>;
  onStopBrowser: () => void | Promise<void>;
  onClearIsolatedBrowserProfile: () => void | Promise<void>;
  onClearCopiedChromeProfile: () => void | Promise<void>;
  onRefreshBrowserPage: () => void | Promise<void>;
  onScreenshotBrowser: () => void | Promise<void>;
  onAnalyzeLatestBrowserScreenshot: () => void | Promise<void>;
  onRevealBrowser: (input?: { userActionId?: string; targetId?: string }) => void | Promise<void>;
  onNavigateBrowser: () => void | Promise<void>;
  onSearchBrowser: () => void | Promise<void>;
  onPickBrowserElement: () => void | Promise<void>;
  onCancelBrowserPicker: () => void | Promise<void>;
  onResumeBrowserUserAction: () => void | Promise<void>;
  onCancelBrowserUserAction: () => void | Promise<void>;
  onOpenBrowserCopyDialog: () => void;
  onLoadBrowserState: () => void | Promise<void>;
  onLoadBrowserCredentials: () => void | Promise<void>;
  onSaveBrowserCredential: () => void | Promise<void>;
  onBrowserCredentialFormChange: (updater: (form: BrowserCredentialForm) => BrowserCredentialForm) => void;
  onResetBrowserCredentialForm: () => void;
  onEditBrowserCredential: (credential: BrowserCredentialSummary) => void;
  onDeleteBrowserCredential: (id: string) => void | Promise<void>;
  onCopyBrowserInspectReference: (result: BrowserPickResult) => void | Promise<void>;
};
