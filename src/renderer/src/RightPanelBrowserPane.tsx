import {
  ClipboardPaste,
  FileImage,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Monitor,
  RotateCcw,
} from "lucide-react";
import type { RefObject } from "react";
import type { BrowserCapabilityState, BrowserCredentialSummary, BrowserPickResult, BrowserProfileMode, BrowserScreenshotResult } from "../../shared/browserTypes";
import type { MiniCpmVisionDiagnosticItem } from "../../shared/localRuntimeTypes";
import type {
  BrowserCredentialForm,
  BrowserInspectResult,
} from "./RightPanelBrowserController";
import { MiniCpmVisionDiagnosticsList } from "./RightPanelMiniCpmVisionDiagnostics";

type ApiKeyStatus = { kind: "info" | "success" | "error"; message: string };

type RightPanelBrowserPaneProps = {
  browserFocused: boolean;
  browserState?: BrowserCapabilityState;
  browserHostRef: RefObject<HTMLDivElement | null>;
  browserUrl: string;
  browserSearch: string;
  browserPickPrompt: string;
  browserBusy?: string;
  browserUserActionBusy?: string;
  browserError?: string;
  browserStatus?: ApiKeyStatus;
  latestBrowserScreenshot?: BrowserScreenshotResult;
  visualAnalysisBusy?: string;
  visualAnalysisStatus?: ApiKeyStatus;
  visualAnalysisDiagnostics: MiniCpmVisionDiagnosticItem[];
  browserInspectResult?: BrowserInspectResult;
  browserCredentialStatus?: ApiKeyStatus;
  browserCredentialBusy?: string;
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

export function RightPanelBrowserPane({
  browserFocused,
  browserState,
  browserHostRef,
  browserUrl,
  browserSearch,
  browserPickPrompt,
  browserBusy,
  browserUserActionBusy,
  browserError,
  browserStatus,
  latestBrowserScreenshot,
  visualAnalysisBusy,
  visualAnalysisStatus,
  visualAnalysisDiagnostics,
  browserInspectResult,
  browserCredentialStatus,
  browserCredentialBusy,
  browserCredentialForm,
  browserCredentials,
  formatTimelineTime,
  onBrowserFocusedChange,
  onBrowserUrlChange,
  onBrowserSearchChange,
  onBrowserPickPromptChange,
  onStartBrowser,
  onStopBrowser,
  onClearIsolatedBrowserProfile,
  onClearCopiedChromeProfile,
  onRefreshBrowserPage,
  onScreenshotBrowser,
  onAnalyzeLatestBrowserScreenshot,
  onRevealBrowser,
  onNavigateBrowser,
  onSearchBrowser,
  onPickBrowserElement,
  onCancelBrowserPicker,
  onResumeBrowserUserAction,
  onCancelBrowserUserAction,
  onOpenBrowserCopyDialog,
  onLoadBrowserState,
  onLoadBrowserCredentials,
  onSaveBrowserCredential,
  onBrowserCredentialFormChange,
  onResetBrowserCredentialForm,
  onEditBrowserCredential,
  onDeleteBrowserCredential,
  onCopyBrowserInspectReference,
}: RightPanelBrowserPaneProps) {
  const browserIsBusy = Boolean(browserBusy);
  const activeTab = browserState?.activeTab;
  const browserCanBrowse = Boolean(browserState && (browserState.internalAvailable || browserState.chromeAvailable));
  const browserCanUseCurrentProfile = Boolean(
    browserState &&
      (browserState.profileMode === "copied" ? browserState.chromeAvailable : browserState.internalAvailable || browserState.chromeAvailable),
  );
  const browserCanRefresh = Boolean(browserState?.running && browserCanUseCurrentProfile && (activeTab?.url || browserUrl.trim()));
  const browserRuntimeLabel =
    browserState?.runtime === "internal" ? "Internal Electron view" : browserState?.runtime === "chrome" ? "Managed Chrome" : "Unknown";
  const chromeAvailabilityLabel = browserState?.chromeAvailable ? "Chrome available" : browserState?.chromeUnavailableReason || "Chrome not found";
  const copiedProfileCopiedAt = browserState?.copiedProfileCopiedAt ? formatTimelineTime(browserState.copiedProfileCopiedAt) : undefined;
  const copiedProfileSource = browserState?.copiedProfileSourcePath ?? browserState?.sourceProfilePath;
  const pickerStartedAt = browserState?.pickerStartedAt ? formatTimelineTime(browserState.pickerStartedAt) : undefined;
  const browserUserAction = browserState?.userAction;
  const browserUserActionStartedAt = browserUserAction?.startedAt ? formatTimelineTime(browserUserAction.startedAt) : undefined;
  const browserCanFocus = Boolean(browserState?.running && browserState.runtime === "internal");
  const pickerRequestedByAgent = Boolean(browserState?.pickerActive && browserBusy !== "pick");

  if (browserFocused && browserState) {
    return (
      <div className="browser-focused-shell">
        {browserError && <p className="panel-status error">{browserError}</p>}
        {browserStatus && <p className={`panel-status ${browserStatus.kind}`}>{browserStatus.message}</p>}
        {visualAnalysisStatus && <p className={`panel-status ${visualAnalysisStatus.kind}`}>{visualAnalysisStatus.message}</p>}
        <MiniCpmVisionDiagnosticsList diagnostics={visualAnalysisDiagnostics} compact />
        {browserState.pickerActive && (
          <p className="browser-picker-active">
            {pickerRequestedByAgent ? "Ambient is waiting for your browser selection" : "Inspecting element"}
            {pickerStartedAt ? ` since ${pickerStartedAt}` : ""}: {browserState.pickerPrompt || "Select an element"}.
          </p>
        )}
        {browserUserAction && (
          <section className={`browser-user-action-card ${browserUserAction.active ? "active" : ""}`}>
            <div>
              <strong>{browserUserAction.status === "resuming" ? "Checking browser warning" : "Browser warning needs review"}</strong>
              <span>
                {browserUserAction.kind}
                {browserUserAction.provider ? ` / ${browserUserAction.provider}` : ""}
                {browserUserActionStartedAt ? ` since ${browserUserActionStartedAt}` : ""}
              </span>
              <p>{browserUserAction.message}</p>
              {browserUserAction.url && <code>{browserUserAction.url}</code>}
              <p className="browser-user-action-help">
                If this warning is wrong, dismiss it. Ambient keeps the trace and continues without treating this source as verified.
              </p>
            </div>
            <div className="panel-action-row">
              <button
                type="button"
                className="panel-button mini"
                disabled={browserUserActionBusy === "resume" || browserUserAction.status === "resuming"}
                onClick={() => void onResumeBrowserUserAction()}
              >
                {browserUserActionBusy === "resume" ? "Checking" : "I completed it"}
              </button>
              <button
                type="button"
                className="panel-button mini"
                disabled={browserUserActionBusy === "cancel"}
                onClick={() => void onCancelBrowserUserAction()}
                title="Dismiss an erroneous browser warning and unblock the current operation."
              >
                {browserUserActionBusy === "cancel" ? "Dismissing" : "Dismiss warning"}
              </button>
            </div>
          </section>
        )}
        <div className="browser-focus-toolbar">
          <div>
            <strong>{activeTab?.title || "Agent browser"}</strong>
            <code>{activeTab?.url || "No active page"}</code>
          </div>
          <div className="panel-action-row">
            <button type="button" className="panel-button mini icon-panel-button" onClick={() => onBrowserFocusedChange(false)}>
              <Minimize2 size={13} />
              Restore
            </button>
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={browserIsBusy || !browserCanRefresh}
              onClick={() => void onRefreshBrowserPage()}
              title={browserCanRefresh ? "Reload the current browser page" : "Open a page in the browser first"}
            >
              <RotateCcw size={13} />
              Refresh
            </button>
            <button
              type="button"
              className="panel-button mini"
              disabled={browserIsBusy || !browserState.running}
              onClick={() => void onScreenshotBrowser()}
            >
              Screenshot
            </button>
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={browserIsBusy || Boolean(visualAnalysisBusy) || !latestBrowserScreenshot}
              onClick={() => void onAnalyzeLatestBrowserScreenshot()}
              title={latestBrowserScreenshot ? "Analyze the latest browser screenshot with MiniCPM-V" : "Capture a browser screenshot first"}
            >
              {visualAnalysisBusy === "browser-screenshot" ? <LoaderCircle size={13} className="spin" /> : <FileImage size={13} />}
              Analyze latest
            </button>
            <button type="button" className="panel-button mini" disabled={browserIsBusy || !browserState.running} onClick={() => void onStopBrowser()}>
              Stop
            </button>
          </div>
        </div>
        <div
          ref={browserHostRef}
          className={`browser-internal-host browser-focused-host ${browserCanFocus ? "active" : ""}`}
        >
          <span>{browserCanFocus ? "Loading browser view..." : "Start an internal isolated browser session to focus it."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      {browserError && <p className="panel-status error">{browserError}</p>}
      {browserStatus && <p className={`panel-status ${browserStatus.kind}`}>{browserStatus.message}</p>}
      {visualAnalysisStatus && <p className={`panel-status ${visualAnalysisStatus.kind}`}>{visualAnalysisStatus.message}</p>}
      <MiniCpmVisionDiagnosticsList diagnostics={visualAnalysisDiagnostics} compact />
      {browserState ? (
        <>
          <section className="browser-status-card">
            <div className="browser-card-header">
              <div>
                <strong>Agent browser</strong>
                <span>
                  {browserState.internalAvailable ? "Internal view ready" : "Internal view unavailable"} /{" "}
                  {chromeAvailabilityLabel}
                </span>
              </div>
              <span className={`browser-state-pill ${browserState.running ? "running" : "stopped"}`}>
                {browserState.running ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="browser-meta-grid">
              <span>Runtime</span>
              <strong>{browserRuntimeLabel}</strong>
              <span>Profile</span>
              <strong>{browserState.profileMode === "copied" ? "Copied Chrome profile" : "Isolated profile"}</strong>
              <span>Isolated data</span>
              <strong>{browserState.isolatedProfilePersistent ? "Persistent" : "Ephemeral"}</strong>
              <span>Copied profile</span>
              <strong>
                {browserState.copiedProfileAvailable
                  ? `Available${copiedProfileCopiedAt ? ` since ${copiedProfileCopiedAt}` : ""}`
                  : browserState.sourceProfilePath
                    ? "Will copy on first use"
                    : "Not available"}
              </strong>
            </div>
            <div className="panel-action-row">
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={browserIsBusy || !browserCanBrowse}
                onClick={() => void onStartBrowser("isolated")}
                title={browserState.internalAvailable ? "Use the embedded isolated browser view" : "Use an isolated managed Chrome session"}
              >
                <Monitor size={13} />
                Start isolated
              </button>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={browserIsBusy || !browserState.chromeAvailable || (!browserState.copiedProfileAvailable && !browserState.sourceProfilePath)}
                onClick={() => void onStartBrowser("copied")}
                title={
                  !browserState.chromeAvailable
                    ? chromeAvailabilityLabel
                    : browserState.copiedProfileAvailable
                      ? "Use copied Chrome profile in managed Chrome"
                      : "Copy the Chrome profile and start managed Chrome"
                }
              >
                <ClipboardPaste size={13} />
                Start copied
              </button>
              <button
                type="button"
                className="panel-button mini"
                disabled={browserIsBusy || !browserState.running}
                onClick={() => void onStopBrowser()}
              >
                Stop
              </button>
              <button
                type="button"
                className="panel-button mini"
                disabled={browserIsBusy || !browserState.running}
                onClick={() => void onScreenshotBrowser()}
              >
                Screenshot
              </button>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={browserIsBusy || Boolean(visualAnalysisBusy) || !latestBrowserScreenshot}
                onClick={() => void onAnalyzeLatestBrowserScreenshot()}
                title={latestBrowserScreenshot ? "Analyze the latest browser screenshot with MiniCPM-V" : "Capture a browser screenshot first"}
              >
                {visualAnalysisBusy === "browser-screenshot" ? <LoaderCircle size={13} className="spin" /> : <FileImage size={13} />}
                Analyze latest
              </button>
              <button
                type="button"
                className="panel-button mini"
                disabled={browserIsBusy}
                onClick={() => void onClearIsolatedBrowserProfile()}
                title="Clear cookies and storage for Ambient's isolated managed Chrome profile"
              >
                Clear isolated data
              </button>
            </div>
          </section>
          {browserUserAction && (
            <section className={`browser-user-action-card ${browserUserAction.active ? "active" : ""}`}>
              <div className="browser-card-header">
                <div>
                  <strong>{browserUserAction.status === "resuming" ? "Checking browser warning" : "Browser warning needs review"}</strong>
                  <span>
                    {browserUserAction.kind}
                    {browserUserAction.provider ? ` / ${browserUserAction.provider}` : ""}
                    {browserUserActionStartedAt ? ` since ${browserUserActionStartedAt}` : ""}
                  </span>
                </div>
                <span className={`browser-state-pill ${browserUserAction.active ? "running" : "stopped"}`}>
                  {browserUserAction.status}
                </span>
              </div>
              <p>{browserUserAction.message}</p>
              {browserUserAction.url && <code>{browserUserAction.url}</code>}
              <p className="browser-user-action-help">
                If this warning is wrong, dismiss it. Ambient keeps the trace and continues without treating this source as verified.
              </p>
              <div className="panel-action-row">
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={browserUserActionBusy === "resume" || browserUserAction.status === "resuming"}
                  onClick={() => void onResumeBrowserUserAction()}
                >
                  {browserUserActionBusy === "resume" ? "Checking" : "I completed it"}
                </button>
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={browserUserActionBusy === "cancel"}
                  onClick={() => void onCancelBrowserUserAction()}
                  title="Dismiss an erroneous browser warning and unblock the current operation."
                >
                  {browserUserActionBusy === "cancel" ? "Dismissing" : "Dismiss warning"}
                </button>
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={
                    browserUserAction.runtime === "chrome"
                      ? browserBusy === "reveal" || !browserState.running
                      : !browserCanFocus
                  }
                  onClick={() =>
                    browserUserAction.runtime === "chrome"
                      ? void onRevealBrowser({ userActionId: browserUserAction.id, targetId: browserUserAction.targetId })
                      : onBrowserFocusedChange(true)
                  }
                >
                  {browserUserAction.runtime === "chrome" ? "Show managed Chrome" : "Focus browser"}
                </button>
              </div>
            </section>
          )}
          {activeTab && (
            <section className="browser-tab-card">
              <strong>{activeTab.title || "Active tab"}</strong>
              {activeTab.url && <code>{activeTab.url}</code>}
            </section>
          )}
          <section className="browser-viewport-card">
            <div className="browser-card-header">
              <div>
                <strong>Internal view</strong>
                <span>
                  {browserState.runtime === "internal"
                    ? browserState.running
                      ? "Embedded browser is visible here."
                      : "Start an isolated session to show the embedded browser."
                    : browserState.profileMode === "copied"
                      ? "Copied profile sessions use managed Chrome."
                      : "This isolated session is running in managed Chrome."}
                </span>
              </div>
              <div className="panel-action-row browser-viewport-actions">
                <button
                  type="button"
                  className="panel-button mini icon-panel-button"
                  disabled={browserIsBusy || !browserCanRefresh}
                  onClick={() => void onRefreshBrowserPage()}
                  title={browserCanRefresh ? "Reload the current internal browser page" : "Open a page in the browser first"}
                >
                  <RotateCcw size={13} />
                  Refresh
                </button>
                <button
                  type="button"
                  className="panel-button mini icon-panel-button"
                  disabled={!browserCanFocus}
                  onClick={() => onBrowserFocusedChange(true)}
                  title={browserCanFocus ? "Let the browser fill this panel" : "Start an internal isolated browser session first"}
                >
                  <Maximize2 size={13} />
                  Focus browser
                </button>
              </div>
            </div>
            <div
              ref={browserHostRef}
              className={`browser-internal-host ${browserState.runtime === "internal" && browserState.running ? "active" : ""}`}
            >
              <span>
                {browserState.runtime === "internal" && browserState.running
                  ? "Loading browser view..."
                  : browserState.running
                    ? "Managed Chrome is running outside the embedded view"
                    : "No internal browser view running"}
              </span>
            </div>
          </section>
          <section className="browser-control-card">
            <form
              className="browser-action-form"
              onSubmit={(event) => {
                event.preventDefault();
                void onNavigateBrowser();
              }}
            >
              <input
                className="panel-input"
                value={browserUrl}
                onChange={(event) => onBrowserUrlChange(event.target.value)}
                placeholder="URL"
                disabled={browserIsBusy || !browserCanUseCurrentProfile}
              />
              <button type="submit" className="panel-button" disabled={browserIsBusy || !browserUrl.trim() || !browserCanUseCurrentProfile}>
                Open
              </button>
            </form>
            <form
              className="browser-action-form browser-picker-form"
              onSubmit={(event) => {
                event.preventDefault();
                void onSearchBrowser();
              }}
            >
              <input
                className="panel-input"
                value={browserSearch}
                onChange={(event) => onBrowserSearchChange(event.target.value)}
                placeholder="Google search"
                disabled={browserIsBusy || !browserCanUseCurrentProfile}
              />
              <button type="submit" className="panel-button" disabled={browserIsBusy || !browserSearch.trim() || !browserCanUseCurrentProfile}>
                Search
              </button>
            </form>
          </section>
          <section className="browser-picker-card">
            <div className="browser-card-header">
              <div>
                <strong>Element inspector</strong>
                <span>Click a page element and copy a stable reference for prompts or notes.</span>
              </div>
              {browserState.pickerActive && <span className="browser-state-pill running">Picking</span>}
            </div>
            {browserState.pickerActive && (
              <p className="browser-picker-active">
                {pickerRequestedByAgent ? "Ambient is waiting for your browser selection" : "Inspecting element"}
                {pickerStartedAt ? ` since ${pickerStartedAt}` : ""}: {browserState.pickerPrompt || "Select an element"}.
              </p>
            )}
            <form
              className="browser-action-form"
              onSubmit={(event) => {
                event.preventDefault();
                void onPickBrowserElement();
              }}
            >
              <input
                className="panel-input"
                value={browserPickPrompt}
                onChange={(event) => onBrowserPickPromptChange(event.target.value)}
                placeholder="Picker instruction"
                disabled={Boolean(browserBusy && browserBusy !== "pick") || !browserCanUseCurrentProfile}
              />
              <button
                type="submit"
                className="panel-button"
                disabled={browserIsBusy || !browserPickPrompt.trim() || !browserCanUseCurrentProfile || Boolean(browserState.pickerActive)}
              >
                Inspect element
              </button>
              <button
                type="button"
                className="panel-button"
                disabled={!browserState.pickerActive || browserBusy === "cancel-picker"}
                onClick={() => void onCancelBrowserPicker()}
              >
                Cancel picker
              </button>
            </form>
          </section>
          {browserInspectResult && (
            <BrowserInspectResultCard inspect={browserInspectResult} formatTimelineTime={formatTimelineTime} onCopy={(result) => void onCopyBrowserInspectReference(result)} />
          )}
          <section className="browser-profile-card">
            <div className="browser-card-header">
              <div>
                <strong>Chrome profile copy</strong>
                <span>Default browser tools use a copied Chrome profile when a source profile is available.</span>
              </div>
              <button
                type="button"
                className="panel-button mini"
                disabled={browserIsBusy || !browserState.sourceProfilePath}
                onClick={onOpenBrowserCopyDialog}
              >
                {browserState.copiedProfileAvailable ? "Replace copy" : "Copy profile"}
              </button>
            </div>
            <p className={`browser-profile-state ${browserState.copiedProfileAvailable ? "available" : "empty"}`}>
              {browserState.copiedProfileAvailable
                ? `Copied profile is available${copiedProfileCopiedAt ? ` from ${copiedProfileCopiedAt}` : ""}. Clear it to revoke logged-in browser access.`
                : browserState.sourceProfilePath
                  ? "No copied Chrome profile is stored yet. Ambient will copy it on first default browser use."
                  : "No copied Chrome profile source was found. Ambient will use isolated browser sessions."}
            </p>
            <div className="browser-profile-paths">
              <span>Isolated</span>
              <code>{browserState.isolatedProfilePath || "Ambient isolated browser profile"}</code>
              <span>Source</span>
              <code>{browserState.sourceProfilePath || "No Chrome profile found"}</code>
              <span>Copied from</span>
              <code>{browserState.copiedProfileAvailable ? copiedProfileSource || "Unknown source" : "Not copied yet"}</code>
              <span>Copied at</span>
              <code>{browserState.copiedProfileAvailable ? copiedProfileCopiedAt || "Unknown time" : "Not copied yet"}</code>
              <span>Copied</span>
              <code>{browserState.copiedProfilePath || "Not copied yet"}</code>
            </div>
            <div className="panel-action-row">
              <button
                type="button"
                className="panel-button mini"
                disabled={browserIsBusy || !browserState.copiedProfileAvailable}
                onClick={() => void onClearCopiedChromeProfile()}
              >
                Clear copied profile
              </button>
              <button type="button" className="panel-button mini" disabled={browserIsBusy} onClick={() => void onLoadBrowserState()}>
                Refresh
              </button>
            </div>
          </section>
          <section className="browser-credentials-card">
            <div className="browser-card-header">
              <div>
                <strong>Stored credentials</strong>
                <span>
                  {browserState.browserLoginBrokerAvailable
                    ? "Pi can request these by id through the brokered login tool; passwords are never shown back here."
                    : "Brokered browser login is disabled for this app launch."}
                </span>
              </div>
              <button
                type="button"
                className="panel-button mini"
                disabled={Boolean(browserCredentialBusy) || !browserState.browserLoginBrokerAvailable}
                onClick={() => void onLoadBrowserCredentials()}
              >
                Refresh
              </button>
            </div>
            {browserCredentialStatus && <p className={`panel-status ${browserCredentialStatus.kind}`}>{browserCredentialStatus.message}</p>}
            {browserState.browserLoginBrokerAvailable ? (
              <>
                <form
                  className="browser-credential-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onSaveBrowserCredential();
                  }}
                >
                  <input
                    className="panel-input"
                    value={browserCredentialForm.label}
                    onChange={(event) => onBrowserCredentialFormChange((form) => ({ ...form, label: event.target.value }))}
                    placeholder="Label"
                    disabled={Boolean(browserCredentialBusy)}
                  />
                  <input
                    className="panel-input"
                    value={browserCredentialForm.origin}
                    onChange={(event) => onBrowserCredentialFormChange((form) => ({ ...form, origin: event.target.value }))}
                    placeholder="Origin, e.g. https://example.com"
                    disabled={Boolean(browserCredentialBusy)}
                  />
                  <input
                    className="panel-input"
                    value={browserCredentialForm.username}
                    onChange={(event) => onBrowserCredentialFormChange((form) => ({ ...form, username: event.target.value }))}
                    placeholder="Username"
                    disabled={Boolean(browserCredentialBusy)}
                  />
                  <input
                    className="panel-input"
                    type="password"
                    value={browserCredentialForm.password}
                    onChange={(event) => onBrowserCredentialFormChange((form) => ({ ...form, password: event.target.value }))}
                    placeholder={browserCredentialForm.id ? "New password required to update" : "Password"}
                    disabled={Boolean(browserCredentialBusy)}
                  />
                  <div className="panel-action-row">
                    <button
                      type="submit"
                      className="panel-button"
                      disabled={
                        Boolean(browserCredentialBusy) ||
                        !browserCredentialForm.label.trim() ||
                        !browserCredentialForm.origin.trim() ||
                        !browserCredentialForm.username.trim() ||
                        !browserCredentialForm.password
                      }
                    >
                      {browserCredentialForm.id ? "Update credential" : "Save credential"}
                    </button>
                    <button type="button" className="panel-button" disabled={Boolean(browserCredentialBusy)} onClick={onResetBrowserCredentialForm}>
                      Clear
                    </button>
                  </div>
                </form>
                <div className="browser-credential-list">
                  {browserCredentials.length > 0 ? (
                    browserCredentials.map((credential) => (
                      <div className="browser-credential-row" key={credential.id}>
                        <div>
                          <strong>{credential.label}</strong>
                          <span>{credential.origin}</span>
                          <small>
                            {credential.username} / {credential.scope}
                            {credential.lastUsedAt ? ` / used ${formatTimelineTime(credential.lastUsedAt)}` : ""}
                          </small>
                          <code>{credential.id}</code>
                        </div>
                        <div className="panel-action-row">
                          <button type="button" className="panel-button mini" disabled={Boolean(browserCredentialBusy)} onClick={() => onEditBrowserCredential(credential)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="panel-button mini danger"
                            disabled={Boolean(browserCredentialBusy)}
                            onClick={() => void onDeleteBrowserCredential(credential.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="panel-note">No stored browser credentials for this workspace.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="panel-note">Stored credential login is disabled for this app launch.</p>
            )}
          </section>
        </>
      ) : (
        <p className="panel-note">Loading browser state...</p>
      )}
    </div>
  );
}

export function browserPickReferenceText(result: BrowserPickResult): string {
  const lines = [
    "Browser element reference",
    result.url ? `URL: ${result.url}` : "",
    result.title ? `Title: ${result.title}` : "",
    `Prompt: ${result.prompt}`,
    "",
  ].filter((line) => line !== "");

  result.selections.forEach((selection, index) => {
    const fullPath = browserSelectionFullPath(selection);
    lines.push(`Selected element ${index + 1}:`);
    lines.push(`Best selector: ${selection.selector || fullPath || "(none)"}`);
    if (fullPath) lines.push(`Full path: ${fullPath}`);
    lines.push(`Tag: ${selection.tagName}`);
    if (selection.text) lines.push(`Text: ${selection.text}`);
    if (selection.boundingBox) {
      lines.push(
        `Bounds: ${selection.boundingBox.x},${selection.boundingBox.y} ${selection.boundingBox.width}x${selection.boundingBox.height}`,
      );
    }
    if (selection.candidates.length > 0) {
      lines.push("Candidate selectors:");
      for (const candidate of selection.candidates) lines.push(`- ${candidate}`);
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function browserSelectionFullPath(selection: BrowserPickResult["selections"][number]): string | undefined {
  for (let index = selection.candidates.length - 1; index >= 0; index -= 1) {
    if (selection.candidates[index].includes(">")) return selection.candidates[index];
  }
  return selection.selector;
}

function BrowserInspectResultCard({
  inspect,
  formatTimelineTime,
  onCopy,
}: {
  inspect: BrowserInspectResult;
  formatTimelineTime: (value: string) => string;
  onCopy: (result: BrowserPickResult) => void;
}) {
  const firstSelection = inspect.result.selections[0];
  const fullPath = firstSelection ? browserSelectionFullPath(firstSelection) : undefined;
  return (
    <section className="browser-inspect-result-card">
      <div className="browser-card-header">
        <div>
          <strong>Inspected element</strong>
          <span>
            {inspect.result.selections.length} element{inspect.result.selections.length === 1 ? "" : "s"} selected
            {inspect.copiedAt ? ` / copied ${formatTimelineTime(inspect.copiedAt)}` : ""}
          </span>
        </div>
        <button type="button" className="panel-button mini" onClick={() => onCopy(inspect.result)}>
          Copy again
        </button>
      </div>
      {inspect.copyError ? (
        <p className="panel-status error">Clipboard copy failed: {inspect.copyError}</p>
      ) : (
        <p className="panel-status success">Copied browser element reference to clipboard.</p>
      )}
      <div className="browser-inspect-meta">
        <span>URL</span>
        <code>{inspect.result.url || "Unknown URL"}</code>
        <span>Best selector</span>
        <code>{firstSelection?.selector || fullPath || "No selector"}</code>
        <span>Full path</span>
        <code>{fullPath || "No path"}</code>
        {firstSelection?.text && (
          <>
            <span>Text</span>
            <code>{firstSelection.text}</code>
          </>
        )}
      </div>
      <details>
        <summary>Clipboard reference</summary>
        <pre>{inspect.clipboardText}</pre>
      </details>
    </section>
  );
}
