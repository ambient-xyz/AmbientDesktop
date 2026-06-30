import { FileImage, LoaderCircle, Minimize2, RotateCcw } from "lucide-react";
import type { BrowserCapabilityState } from "../../shared/browserTypes";
import { MiniCpmVisionDiagnosticsList } from "./RightPanelMiniCpmVisionDiagnostics";
import type { RightPanelBrowserPaneViewProps } from "./RightPanelBrowserTypes";
import {
  RightPanelBrowserActiveTabCard,
  RightPanelBrowserControlCard,
  RightPanelBrowserCredentialsCard,
  RightPanelBrowserInspectResultCard,
  RightPanelBrowserPickerCard,
  RightPanelBrowserProfileCard,
  RightPanelBrowserStatusCard,
  RightPanelBrowserViewportCard,
} from "./RightPanelBrowserStandardSections";

type RightPanelBrowserFocusedViewProps = Omit<RightPanelBrowserPaneViewProps, "browserState"> & {
  browserState: BrowserCapabilityState;
};

export function RightPanelBrowserFocusedView({
  browserState,
  browserHostRef,
  browserUrl,
  browserBusy,
  browserUserActionBusy,
  browserError,
  browserStatus,
  latestBrowserScreenshot,
  visualAnalysisBusy,
  visualAnalysisStatus,
  visualAnalysisDiagnostics,
  onBrowserFocusedChange,
  onStopBrowser,
  onRefreshBrowserPage,
  onScreenshotBrowser,
  onAnalyzeLatestBrowserScreenshot,
  onResumeBrowserUserAction,
  onCancelBrowserUserAction,
  formatTimelineTime,
}: RightPanelBrowserFocusedViewProps) {
  const browserIsBusy = Boolean(browserBusy);
  const activeTab = browserState.activeTab;
  const browserCanUseCurrentProfile = browserCanUseProfile(browserState);
  const browserCanRefresh = Boolean(browserState.running && browserCanUseCurrentProfile && (activeTab?.url || browserUrl.trim()));
  const browserUserAction = browserState.userAction;
  const browserUserActionStartedAt = browserUserAction?.startedAt ? formatTimelineTime(browserUserAction.startedAt) : undefined;
  const browserCanFocus = Boolean(browserState.running && browserState.runtime === "internal");
  const pickerStartedAt = browserState.pickerStartedAt ? formatTimelineTime(browserState.pickerStartedAt) : undefined;
  const pickerRequestedByAgent = Boolean(browserState.pickerActive && browserBusy !== "pick");

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
        <RightPanelBrowserUserActionCard
          browserUserAction={browserUserAction}
          browserUserActionStartedAt={browserUserActionStartedAt}
          browserUserActionBusy={browserUserActionBusy}
          onResumeBrowserUserAction={onResumeBrowserUserAction}
          onCancelBrowserUserAction={onCancelBrowserUserAction}
        />
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
          <button
            type="button"
            className="panel-button mini"
            disabled={browserIsBusy || !browserState.running}
            onClick={() => void onStopBrowser()}
          >
            Stop
          </button>
        </div>
      </div>
      <div ref={browserHostRef} className={`browser-internal-host browser-focused-host ${browserCanFocus ? "active" : ""}`}>
        <span>{browserCanFocus ? "Loading browser view..." : "Start an internal isolated browser session to focus it."}</span>
      </div>
    </div>
  );
}

export function RightPanelBrowserStandardView({
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
}: RightPanelBrowserPaneViewProps) {
  const browserIsBusy = Boolean(browserBusy);
  const activeTab = browserState?.activeTab;
  const browserCanUseCurrentProfile = browserCanUseProfile(browserState);
  const browserCanRefresh = Boolean(browserState?.running && browserCanUseCurrentProfile && (activeTab?.url || browserUrl.trim()));
  const pickerStartedAt = browserState?.pickerStartedAt ? formatTimelineTime(browserState.pickerStartedAt) : undefined;
  const browserUserAction = browserState?.userAction;
  const browserUserActionStartedAt = browserUserAction?.startedAt ? formatTimelineTime(browserUserAction.startedAt) : undefined;
  const browserCanFocus = Boolean(browserState?.running && browserState.runtime === "internal");
  const pickerRequestedByAgent = Boolean(browserState?.pickerActive && browserBusy !== "pick");

  return (
    <div className="panel-stack">
      {browserError && <p className="panel-status error">{browserError}</p>}
      {browserStatus && <p className={`panel-status ${browserStatus.kind}`}>{browserStatus.message}</p>}
      {visualAnalysisStatus && <p className={`panel-status ${visualAnalysisStatus.kind}`}>{visualAnalysisStatus.message}</p>}
      <MiniCpmVisionDiagnosticsList diagnostics={visualAnalysisDiagnostics} compact />
      {browserState ? (
        <>
          <RightPanelBrowserStatusCard
            browserState={browserState}
            browserIsBusy={browserIsBusy}
            latestBrowserScreenshot={latestBrowserScreenshot}
            visualAnalysisBusy={visualAnalysisBusy}
            formatTimelineTime={formatTimelineTime}
            onStartBrowser={onStartBrowser}
            onStopBrowser={onStopBrowser}
            onScreenshotBrowser={onScreenshotBrowser}
            onAnalyzeLatestBrowserScreenshot={onAnalyzeLatestBrowserScreenshot}
            onClearIsolatedBrowserProfile={onClearIsolatedBrowserProfile}
          />
          {browserUserAction && (
            <RightPanelBrowserUserActionCard
              browserUserAction={browserUserAction}
              browserUserActionStartedAt={browserUserActionStartedAt}
              browserUserActionBusy={browserUserActionBusy}
              browserBusy={browserBusy}
              browserRunning={browserState.running}
              browserCanFocus={browserCanFocus}
              onResumeBrowserUserAction={onResumeBrowserUserAction}
              onCancelBrowserUserAction={onCancelBrowserUserAction}
              onRevealBrowser={onRevealBrowser}
              onBrowserFocusedChange={onBrowserFocusedChange}
            />
          )}
          {activeTab && <RightPanelBrowserActiveTabCard activeTab={activeTab} />}
          <RightPanelBrowserViewportCard
            browserState={browserState}
            browserHostRef={browserHostRef}
            browserIsBusy={browserIsBusy}
            browserCanRefresh={browserCanRefresh}
            browserCanFocus={browserCanFocus}
            onRefreshBrowserPage={onRefreshBrowserPage}
            onBrowserFocusedChange={onBrowserFocusedChange}
          />
          <RightPanelBrowserControlCard
            browserUrl={browserUrl}
            browserSearch={browserSearch}
            browserIsBusy={browserIsBusy}
            browserCanUseCurrentProfile={browserCanUseCurrentProfile}
            onBrowserUrlChange={onBrowserUrlChange}
            onBrowserSearchChange={onBrowserSearchChange}
            onNavigateBrowser={onNavigateBrowser}
            onSearchBrowser={onSearchBrowser}
          />
          <RightPanelBrowserPickerCard
            browserState={browserState}
            browserPickPrompt={browserPickPrompt}
            browserBusy={browserBusy}
            browserIsBusy={browserIsBusy}
            browserCanUseCurrentProfile={browserCanUseCurrentProfile}
            pickerStartedAt={pickerStartedAt}
            pickerRequestedByAgent={pickerRequestedByAgent}
            onBrowserPickPromptChange={onBrowserPickPromptChange}
            onPickBrowserElement={onPickBrowserElement}
            onCancelBrowserPicker={onCancelBrowserPicker}
          />
          {browserInspectResult && (
            <RightPanelBrowserInspectResultCard
              inspect={browserInspectResult}
              formatTimelineTime={formatTimelineTime}
              onCopy={(result) => void onCopyBrowserInspectReference(result)}
            />
          )}
          <RightPanelBrowserProfileCard
            browserState={browserState}
            browserIsBusy={browserIsBusy}
            formatTimelineTime={formatTimelineTime}
            onOpenBrowserCopyDialog={onOpenBrowserCopyDialog}
            onClearCopiedChromeProfile={onClearCopiedChromeProfile}
            onLoadBrowserState={onLoadBrowserState}
          />
          <RightPanelBrowserCredentialsCard
            browserState={browserState}
            browserCredentialStatus={browserCredentialStatus}
            browserCredentialBusy={browserCredentialBusy}
            browserCredentialForm={browserCredentialForm}
            browserCredentials={browserCredentials}
            formatTimelineTime={formatTimelineTime}
            onLoadBrowserCredentials={onLoadBrowserCredentials}
            onSaveBrowserCredential={onSaveBrowserCredential}
            onBrowserCredentialFormChange={onBrowserCredentialFormChange}
            onResetBrowserCredentialForm={onResetBrowserCredentialForm}
            onEditBrowserCredential={onEditBrowserCredential}
            onDeleteBrowserCredential={onDeleteBrowserCredential}
          />
        </>
      ) : (
        <p className="panel-note">Loading browser state...</p>
      )}
    </div>
  );
}

function RightPanelBrowserUserActionCard({
  browserUserAction,
  browserUserActionStartedAt,
  browserUserActionBusy,
  browserBusy,
  browserRunning,
  browserCanFocus,
  onResumeBrowserUserAction,
  onCancelBrowserUserAction,
  onRevealBrowser,
  onBrowserFocusedChange,
}: {
  browserUserAction: NonNullable<BrowserCapabilityState["userAction"]>;
  browserUserActionStartedAt: string | undefined;
  browserUserActionBusy: string | undefined;
  browserBusy?: string | undefined;
  browserRunning?: boolean | undefined;
  browserCanFocus?: boolean | undefined;
  onResumeBrowserUserAction: () => void | Promise<void>;
  onCancelBrowserUserAction: () => void | Promise<void>;
  onRevealBrowser?: ((input?: { userActionId?: string; targetId?: string }) => void | Promise<void>) | undefined;
  onBrowserFocusedChange?: ((focused: boolean) => void) | undefined;
}) {
  const title = browserUserAction.status === "resuming" ? "Checking browser warning" : "Browser warning needs review";
  const detail = (
    <>
      {browserUserAction.kind}
      {browserUserAction.provider ? ` / ${browserUserAction.provider}` : ""}
      {browserUserActionStartedAt ? ` since ${browserUserActionStartedAt}` : ""}
    </>
  );
  const standardActions = onRevealBrowser && onBrowserFocusedChange ? { onRevealBrowser, onBrowserFocusedChange } : undefined;

  return (
    <section className={`browser-user-action-card ${browserUserAction.active ? "active" : ""}`}>
      {standardActions ? (
        <div className="browser-card-header">
          <div>
            <strong>{title}</strong>
            <span>{detail}</span>
          </div>
          <span className={`browser-state-pill ${browserUserAction.active ? "running" : "stopped"}`}>{browserUserAction.status}</span>
        </div>
      ) : (
        <div>
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
      )}
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
        {standardActions && (
          <button
            type="button"
            className="panel-button mini"
            disabled={browserUserAction.runtime === "chrome" ? browserBusy === "reveal" || !browserRunning : !browserCanFocus}
            onClick={() =>
              browserUserAction.runtime === "chrome"
                ? void standardActions.onRevealBrowser({ userActionId: browserUserAction.id, targetId: browserUserAction.targetId })
                : standardActions.onBrowserFocusedChange(true)
            }
          >
            {browserUserAction.runtime === "chrome" ? "Show managed Chrome" : "Focus browser"}
          </button>
        )}
      </div>
    </section>
  );
}

function browserCanUseProfile(browserState: BrowserCapabilityState | undefined): boolean {
  return Boolean(
    browserState &&
    (browserState.profileMode === "copied" ? browserState.chromeAvailable : browserState.internalAvailable || browserState.chromeAvailable),
  );
}
