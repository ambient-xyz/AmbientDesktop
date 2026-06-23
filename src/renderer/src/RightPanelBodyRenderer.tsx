import type { ReactNode } from "react";
import type { AgentMemoryEmbeddingLifecycleActionKind } from "../../shared/agentMemoryDiagnostics";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import type { useRightPanelCapabilityBuilderController } from "./RightPanelCapabilityBuilderController";
import type { useRightPanelBrowserController } from "./RightPanelBrowserController";
import { RightPanelBrowserPane } from "./RightPanelBrowserPane";
import { fileIconForEntry, fileTreeEntryTitle } from "./RightPanelDetailPanels";
import type { RightPanelDiagnosticsController } from "./RightPanelDiagnosticsController";
import { FilePreview, formatPanelFileSize } from "./RightPanelFilePreview";
import type { useRightPanelGitController } from "./RightPanelGitController";
import { RightPanelGitPane } from "./RightPanelGitPane";
import type { RightPanelGoogleIntegrationBridge } from "./RightPanelGoogleIntegrationBridge";
import type { RightPanelMcpController } from "./RightPanelMcpController";
import type { useRightPanelPiPackageController } from "./RightPanelPiPackageController";
import type { useRightPanelPluginAuthController } from "./RightPanelPluginAuthController";
import type { useRightPanelPluginCatalogController } from "./RightPanelPluginCatalogController";
import { RightPanelPluginsPane } from "./RightPanelPluginsPane";
import { RichText } from "./RightPanelRichText";
import type { RightPanelSettingsController } from "./RightPanelSettingsController";
import { RightPanelSettingsPane } from "./RightPanelSettingsPane";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import { InfoTooltip, PermissionFullAccessReceiptList } from "./RightPanelStatusWidgets";
import type {
  useRightPanelFilesController,
  useRightPanelSearchController,
  useRightPanelTerminalController,
} from "./RightPanelUtilityPaneControllers";
import { fileContextReference } from "./RightPanelUtilityPaneControllers";
import { RightPanelContextPane } from "./RightPanelContextPane";
import { RightPanelFilesPane, RightPanelSearchPane, RightPanelTerminalPane } from "./RightPanelUtilityPanes";
import type { RightPanelProps, UtilityPanel } from "./RightPanel";

type RightPanelPiPackageController = ReturnType<typeof useRightPanelPiPackageController>;
type RightPanelPluginAuthController = ReturnType<typeof useRightPanelPluginAuthController>;
type RightPanelPluginCatalogController = ReturnType<typeof useRightPanelPluginCatalogController>;
type RightPanelBrowserController = ReturnType<typeof useRightPanelBrowserController>;
type RightPanelCapabilityBuilderController = ReturnType<typeof useRightPanelCapabilityBuilderController>;
type RightPanelGitController = ReturnType<typeof useRightPanelGitController>;
type RightPanelFilesController = ReturnType<typeof useRightPanelFilesController>;
type RightPanelSearchController = ReturnType<typeof useRightPanelSearchController>;
type RightPanelTerminalController = ReturnType<typeof useRightPanelTerminalController>;

export function rightPanelTitle(panel: UtilityPanel): string {
  return panel === "terminal"
    ? "Terminal"
    : panel === "files"
      ? "Files"
      : panel === "diff"
        ? "Diff"
        : panel === "search"
          ? "Search"
          : panel === "browser"
            ? "Browser"
            : panel === "plugins"
              ? "Plugins"
              : panel === "attachments"
                ? "Context"
                : panel === "performance"
                  ? "Performance"
                  : "Settings";
}

export type RightPanelBodyRendererInput = Pick<
  RightPanelProps,
  | "panel"
  | "state"
  | "running"
  | "updateBusy"
  | "contextAttachments"
  | "permissionAudit"
  | "permissionGrants"
  | "permissionAuditError"
  | "permissionGrantError"
  | "permissionGrantRevoking"
  | "voiceProviders"
  | "voiceProvidersLoading"
  | "voiceProvidersError"
  | "voiceProviderCacheStatus"
  | "voiceProviderCacheActivity"
  | "voiceCatalogRefresh"
  | "sttProviders"
  | "sttProvidersLoading"
  | "sttProvidersError"
  | "sttProviderCacheStatus"
  | "sttProviderCacheActivity"
  | "sttProviderSetup"
  | "sttMicrophoneDevices"
  | "sttMicrophoneDevicesLoading"
  | "sttMicrophoneDevicesError"
  | "miniCpmVisionSetup"
  | "miniCpmVisionRuntimePath"
  | "miniCpmVisionEndpointUrl"
  | "localDeepResearchSetup"
  | "localDeepResearchQ8Override"
  | "localDeepResearchRunHistory"
  | "sttMicTest"
  | "mcpContainerRuntimeInstallProgress"
  | "mcpDefaultCapabilityInstallProgress"
  | "searchRoutingHydrating"
  | "searchRoutingHydrationError"
  | "agentMemoryDiagnostics"
  | "agentMemoryDiagnosticsLoading"
  | "agentMemoryDiagnosticsError"
  | "agentMemoryEmbeddingActionLoading"
  | "agentMemoryEmbeddingActionResult"
  | "agentMemoryEmbeddingActionError"
  | "onLoadPermissionAudit"
  | "onLoadPermissionGrants"
  | "onRevokePermissionGrant"
  | "onRevokePermissionGrantIds"
  | "onOpenApiKey"
  | "onCheckUpdates"
  | "onThemePreferenceChange"
  | "onMediaPlaybackSettingsChange"
  | "onThinkingDisplaySettingsChange"
  | "onThinkingLevelChange"
  | "onModelRuntimeSettingsChange"
  | "onFeatureFlagSettingsChange"
  | "onMemorySettingsChange"
  | "onActiveThreadMemoryEnabledChange"
  | "onRefreshAgentMemoryDiagnostics"
  | "onPlannerSettingsChange"
  | "onHydrateSearchRoutingSettings"
  | "onSearchRoutingSettingsChange"
  | "onLocalDeepResearchSettingsChange"
  | "onOpenAmbientCliSecretDialog"
  | "onVoiceSettingsChange"
  | "onLoadVoiceProviders"
  | "onRefreshVoiceCatalog"
  | "onSttSettingsChange"
  | "onLoadSttProviders"
  | "onLoadSttMicrophoneDevices"
  | "onSetupSttProvider"
  | "onSetupMiniCpmVisionProvider"
  | "onMiniCpmVisionRuntimePathChange"
  | "onMiniCpmVisionEndpointUrlChange"
  | "onSetupLocalDeepResearch"
  | "onLocalDeepResearchQ8OverrideChange"
  | "onLoadLocalDeepResearchRunHistory"
  | "onStartSttMicTest"
  | "onStopSttMicTest"
  | "onCancelSttMicTest"
  | "onOpenPluginCapabilities"
  | "onOpenMcpRuntimeSettings"
  | "onSelectThread"
  | "onAddContext"
  | "onRemoveContext"
  | "onClearContext"
  | "onContextError"
> & {
  controllers: {
    terminalPane: RightPanelTerminalController;
    searchPane: RightPanelSearchController;
    filesPane: RightPanelFilesController;
    gitPane: RightPanelGitController;
    browserPane: RightPanelBrowserController;
    settingsPane: RightPanelSettingsController;
    mcpPane: RightPanelMcpController;
    diagnosticsPane: RightPanelDiagnosticsController;
    pluginCatalogPane: RightPanelPluginCatalogController;
    pluginAuthPane: RightPanelPluginAuthController;
    googleIntegrationBridge: RightPanelGoogleIntegrationBridge;
    capabilityBuilderLauncher: RightPanelCapabilityBuilderController;
    piPackagePane: RightPanelPiPackageController;
  };
  onRunAgentMemoryEmbeddingLifecycleActionFromSettings: (
    action: AgentMemoryEmbeddingLifecycleActionKind,
  ) => void | Promise<void>;
};

export function renderRightPanelBody(input: RightPanelBodyRendererInput): ReactNode {
  const {
    terminalPane,
    searchPane,
    filesPane,
    gitPane,
    browserPane,
    settingsPane,
    mcpPane,
    diagnosticsPane,
    pluginCatalogPane,
    pluginAuthPane,
    googleIntegrationBridge,
    capabilityBuilderLauncher,
    piPackagePane,
  } = input.controllers;

  if (input.panel === "terminal") {
    return (
      <RightPanelTerminalPane
        terminal={terminalPane.terminal}
        terminalOutput={terminalPane.terminalOutput}
        terminalInput={terminalPane.terminalInput}
        terminalError={terminalPane.terminalError}
        permissionMode={input.state.settings.permissionMode}
        terminalOutputRef={terminalPane.terminalOutputRef}
        terminalCommandInputRef={terminalPane.terminalCommandInputRef}
        onTerminalInputChange={terminalPane.updateTerminalInput}
        onTerminalKey={terminalPane.handleTerminalKey}
        onTerminalPaste={terminalPane.handleTerminalPaste}
        onSendTerminalInput={() => terminalPane.sendTerminalInput()}
      />
    );
  }

  if (input.panel === "search") {
    return (
      <RightPanelSearchPane
        query={searchPane.query}
        searchScope={searchPane.searchScope}
        searchScopeOptions={searchPane.searchScopeOptions}
        searchResults={searchPane.searchResults}
        searchBusy={searchPane.searchBusy}
        searchError={searchPane.searchError}
        searchScopePlaceholder={searchPane.searchScopePlaceholder}
        searchScopeLabel={searchPane.searchScopeLabel}
        onQueryChange={searchPane.setQuery}
        onSearchScopeChange={searchPane.setSearchScope}
        onSelectThread={input.onSelectThread}
      />
    );
  }

  if (input.panel === "browser") {
    return (
      <RightPanelBrowserPane
        browserFocused={browserPane.browserFocused}
        browserState={browserPane.browserState}
        browserHostRef={browserPane.browserHostRef}
        browserUrl={browserPane.browserUrl}
        browserSearch={browserPane.browserSearch}
        browserPickPrompt={browserPane.browserPickPrompt}
        browserBusy={browserPane.browserBusy}
        browserUserActionBusy={browserPane.browserUserActionBusy}
        browserError={browserPane.browserError}
        browserStatus={browserPane.browserStatus}
        latestBrowserScreenshot={browserPane.latestBrowserScreenshot}
        visualAnalysisBusy={browserPane.visualAnalysisBusy}
        visualAnalysisStatus={browserPane.visualAnalysisStatus}
        visualAnalysisDiagnostics={browserPane.visualAnalysisDiagnostics}
        browserInspectResult={browserPane.browserInspectResult}
        browserCredentialStatus={browserPane.browserCredentialStatus}
        browserCredentialBusy={browserPane.browserCredentialBusy}
        browserCredentialForm={browserPane.browserCredentialForm}
        browserCredentials={browserPane.browserCredentials}
        formatTimelineTime={formatTimelineTime}
        onBrowserFocusedChange={browserPane.setBrowserFocused}
        onBrowserUrlChange={browserPane.setBrowserUrl}
        onBrowserSearchChange={browserPane.setBrowserSearch}
        onBrowserPickPromptChange={browserPane.setBrowserPickPrompt}
        onStartBrowser={(profileMode) => browserPane.startBrowser(profileMode)}
        onStopBrowser={() => browserPane.stopBrowser()}
        onClearIsolatedBrowserProfile={() => browserPane.clearIsolatedBrowserProfile()}
        onClearCopiedChromeProfile={() => browserPane.clearCopiedChromeProfile()}
        onRefreshBrowserPage={() => browserPane.refreshBrowserPage()}
        onScreenshotBrowser={() => browserPane.screenshotBrowser()}
        onAnalyzeLatestBrowserScreenshot={() => browserPane.analyzeLatestBrowserScreenshot()}
        onRevealBrowser={(browserInput) => browserPane.revealBrowser(browserInput)}
        onNavigateBrowser={() => browserPane.navigateBrowser()}
        onSearchBrowser={() => browserPane.searchBrowser()}
        onPickBrowserElement={() => browserPane.pickBrowserElement()}
        onCancelBrowserPicker={() => browserPane.cancelBrowserPicker()}
        onResumeBrowserUserAction={() => browserPane.resumeBrowserUserAction()}
        onCancelBrowserUserAction={() => browserPane.cancelBrowserUserAction()}
        onOpenBrowserCopyDialog={() => browserPane.setBrowserCopyDialogOpen(true)}
        onLoadBrowserState={() => browserPane.loadBrowserState()}
        onLoadBrowserCredentials={() => browserPane.loadBrowserCredentials()}
        onSaveBrowserCredential={() => browserPane.saveBrowserCredential()}
        onBrowserCredentialFormChange={browserPane.setBrowserCredentialForm}
        onResetBrowserCredentialForm={browserPane.resetBrowserCredentialForm}
        onEditBrowserCredential={browserPane.editBrowserCredential}
        onDeleteBrowserCredential={(id) => browserPane.deleteBrowserCredential(id)}
        onCopyBrowserInspectReference={(result) => browserPane.copyBrowserInspectReference(result)}
      />
    );
  }

  if (input.panel === "files") {
    return (
      <RightPanelFilesPane
        fileTree={filesPane.fileTree}
        fileTreeError={filesPane.fileTreeError}
        visibleEntries={filesPane.visibleEntries}
        selectedFile={filesPane.selectedFile}
        selectedFileError={filesPane.selectedFileError}
        openTargets={filesPane.openTargets}
        openTargetsError={filesPane.openTargetsError}
        visualAnalysisBusy={browserPane.visualAnalysisBusy}
        visualAnalysisStatus={browserPane.visualAnalysisStatus}
        visualAnalysisDiagnostics={browserPane.visualAnalysisDiagnostics}
        filePaneWidth={filesPane.filePaneWidth}
        collapsedDirs={filesPane.collapsedDirs}
        officePreviewRefreshingPath={filesPane.officePreviewRefreshingPath}
        renderFileIcon={fileIconForEntry}
        renderFilePreview={({ file, openTargets, visualAnalysisBusy, officePreviewRefreshing }) => (
          <FilePreview
            file={file}
            openTargets={openTargets}
            onOpen={(targetId) => void filesPane.openPreviewFilePath(file, targetId)}
            onAddContext={(file) => input.onAddContext([fileContextReference(file)])}
            onAnalyzeVisual={(file) => void browserPane.analyzeWorkspaceFileWithMiniCpm(file)}
            visualAnalysisBusy={visualAnalysisBusy}
            onRefreshOfficePreview={(file) => void filesPane.refreshOfficePreview(file)}
            officePreviewRefreshing={officePreviewRefreshing}
            renderRichText={(content) => <RichText content={content} />}
          />
        )}
        fileTreeEntryTitle={fileTreeEntryTitle}
        formatPanelFileSize={formatPanelFileSize}
        previewFileActionPath={filesPane.previewFileActionPath}
        onLoadFileTree={filesPane.loadFileTree}
        onToggleDirectory={filesPane.toggleDirectory}
        onOpenFile={filesPane.openFile}
        onBeginFilePaneResize={filesPane.beginFilePaneResize}
      />
    );
  }

  if (input.panel === "diff") {
    return (
      <RightPanelGitPane
        review={gitPane.review}
        reviewError={gitPane.reviewError}
        actionNotice={gitPane.actionNotice}
        busy={gitPane.busy}
        activeTab={gitPane.activeTab}
        commitMessage={gitPane.commitMessage}
        branchName={gitPane.branchName}
        unversionedAcknowledged={gitPane.unversionedAcknowledged}
        sharedWorkspaceAcknowledged={gitPane.sharedWorkspaceAcknowledged}
        formatTimelineTime={formatTimelineTime}
        onActiveTabChange={gitPane.setActiveTab}
        onRefresh={gitPane.loadReview}
        onCommitMessageChange={gitPane.setCommitMessage}
        onBranchNameChange={gitPane.setBranchName}
        onCommit={gitPane.commitReview}
        onCreateBranch={gitPane.createBranchFromReview}
        onAction={gitPane.runSimpleAction}
        onCreatePullRequest={gitPane.openPullRequestUrl}
        onInitializeRepository={gitPane.initializeRepository}
        onContinueWithoutGit={gitPane.continueWithoutGit}
        onCreateThreadWorktree={gitPane.createThreadWorktree}
        onAttachExistingWorktree={gitPane.attachExistingWorktree}
        onKeepSharedWorkspace={gitPane.keepSharedWorkspace}
        onStageAll={gitPane.stageAll}
        onUnstageAll={gitPane.unstageAll}
        onStage={gitPane.stage}
        onUnstage={gitPane.unstage}
        onDiscard={gitPane.discardFile}
      />
    );
  }

  if (input.panel === "settings") {
    return (
      <RightPanelSettingsPane
        state={input.state}
        running={input.running}
        updateBusy={input.updateBusy}
        permissionAudit={input.permissionAudit}
        permissionGrants={input.permissionGrants}
        permissionAuditError={input.permissionAuditError}
        permissionGrantError={input.permissionGrantError}
        permissionGrantRevoking={input.permissionGrantRevoking}
        voiceProviders={input.voiceProviders}
        voiceProvidersLoading={input.voiceProvidersLoading}
        voiceProvidersError={input.voiceProvidersError}
        voiceProviderCacheStatus={input.voiceProviderCacheStatus}
        voiceProviderCacheActivity={input.voiceProviderCacheActivity}
        voiceCatalogRefresh={input.voiceCatalogRefresh}
        sttProviders={input.sttProviders}
        sttProvidersLoading={input.sttProvidersLoading}
        sttProvidersError={input.sttProvidersError}
        sttProviderCacheStatus={input.sttProviderCacheStatus}
        sttProviderCacheActivity={input.sttProviderCacheActivity}
        sttProviderSetup={input.sttProviderSetup}
        sttMicrophoneDevices={input.sttMicrophoneDevices}
        sttMicrophoneDevicesLoading={input.sttMicrophoneDevicesLoading}
        sttMicrophoneDevicesError={input.sttMicrophoneDevicesError}
        miniCpmVisionSetup={input.miniCpmVisionSetup}
        miniCpmVisionRuntimePath={input.miniCpmVisionRuntimePath}
        miniCpmVisionEndpointUrl={input.miniCpmVisionEndpointUrl}
        localDeepResearchSetup={input.localDeepResearchSetup}
        localDeepResearchQ8Override={input.localDeepResearchQ8Override}
        localDeepResearchRunHistory={input.localDeepResearchRunHistory}
        sttMicTest={input.sttMicTest}
        mcpContainerRuntimeInstallProgress={input.mcpContainerRuntimeInstallProgress}
        mcpDefaultCapabilityInstallProgress={input.mcpDefaultCapabilityInstallProgress}
        searchRoutingHydrating={input.searchRoutingHydrating}
        searchRoutingHydrationError={input.searchRoutingHydrationError}
        agentMemoryDiagnostics={input.agentMemoryDiagnostics}
        agentMemoryDiagnosticsLoading={input.agentMemoryDiagnosticsLoading}
        agentMemoryDiagnosticsError={input.agentMemoryDiagnosticsError}
        agentMemoryEmbeddingActionLoading={input.agentMemoryEmbeddingActionLoading}
        agentMemoryEmbeddingActionResult={input.agentMemoryEmbeddingActionResult}
        agentMemoryEmbeddingActionError={input.agentMemoryEmbeddingActionError}
        onLoadPermissionAudit={input.onLoadPermissionAudit}
        onLoadPermissionGrants={input.onLoadPermissionGrants}
        onRevokePermissionGrant={input.onRevokePermissionGrant}
        onRevokePermissionGrantIds={input.onRevokePermissionGrantIds}
        onOpenApiKey={input.onOpenApiKey}
        onCheckUpdates={input.onCheckUpdates}
        onThemePreferenceChange={input.onThemePreferenceChange}
        onMediaPlaybackSettingsChange={input.onMediaPlaybackSettingsChange}
        onThinkingDisplaySettingsChange={input.onThinkingDisplaySettingsChange}
        onThinkingLevelChange={input.onThinkingLevelChange}
        onModelRuntimeSettingsChange={input.onModelRuntimeSettingsChange}
        onFeatureFlagSettingsChange={input.onFeatureFlagSettingsChange}
        onMemorySettingsChange={input.onMemorySettingsChange}
        onActiveThreadMemoryEnabledChange={input.onActiveThreadMemoryEnabledChange}
        onRefreshAgentMemoryDiagnostics={input.onRefreshAgentMemoryDiagnostics}
        onRunAgentMemoryEmbeddingLifecycleAction={(action) =>
          void input.onRunAgentMemoryEmbeddingLifecycleActionFromSettings(action)
        }
        onPlannerSettingsChange={input.onPlannerSettingsChange}
        onHydrateSearchRoutingSettings={input.onHydrateSearchRoutingSettings}
        onSearchRoutingSettingsChange={input.onSearchRoutingSettingsChange}
        onLocalDeepResearchSettingsChange={input.onLocalDeepResearchSettingsChange}
        onOpenAmbientCliSecretDialog={input.onOpenAmbientCliSecretDialog}
        onVoiceSettingsChange={input.onVoiceSettingsChange}
        onLoadVoiceProviders={input.onLoadVoiceProviders}
        onRefreshVoiceCatalog={input.onRefreshVoiceCatalog}
        onSttSettingsChange={input.onSttSettingsChange}
        onLoadSttProviders={input.onLoadSttProviders}
        onLoadSttMicrophoneDevices={input.onLoadSttMicrophoneDevices}
        onSetupSttProvider={input.onSetupSttProvider}
        onSetupMiniCpmVisionProvider={input.onSetupMiniCpmVisionProvider}
        onMiniCpmVisionRuntimePathChange={input.onMiniCpmVisionRuntimePathChange}
        onMiniCpmVisionEndpointUrlChange={input.onMiniCpmVisionEndpointUrlChange}
        onSetupLocalDeepResearch={input.onSetupLocalDeepResearch}
        onLocalDeepResearchQ8OverrideChange={input.onLocalDeepResearchQ8OverrideChange}
        onLoadLocalDeepResearchRunHistory={input.onLoadLocalDeepResearchRunHistory}
        onStartSttMicTest={input.onStartSttMicTest}
        onStopSttMicTest={input.onStopSttMicTest}
        onCancelSttMicTest={input.onCancelSttMicTest}
        onOpenPluginCapabilities={input.onOpenPluginCapabilities}
        onOpenMcpRuntimeSettings={input.onOpenMcpRuntimeSettings}
        settingsPane={settingsPane}
        mcpPane={mcpPane}
        diagnosticsPane={diagnosticsPane}
        PermissionFullAccessReceiptList={PermissionFullAccessReceiptList}
        onOpenMcpPlugins={() => {
          pluginCatalogPane.setPluginView("mcp");
          input.onOpenPluginCapabilities();
        }}
      />
    );
  }

  if (input.panel === "plugins") {
    return (
      <RightPanelPluginsPane
        InfoTooltip={InfoTooltip}
        state={input.state}
        running={input.running}
        voiceProviders={input.voiceProviders}
        sttProviders={input.sttProviders}
        permissionAudit={input.permissionAudit}
        mcpContainerRuntimeInstallProgress={input.mcpContainerRuntimeInstallProgress}
        mcpDefaultCapabilityInstallProgress={input.mcpDefaultCapabilityInstallProgress}
        pluginCatalogPane={pluginCatalogPane}
        mcpPane={mcpPane}
        settingsPane={settingsPane}
        diagnosticsPane={diagnosticsPane}
        pluginAuthPane={pluginAuthPane}
        googleIntegrationBridge={googleIntegrationBridge}
        capabilityBuilderLauncher={capabilityBuilderLauncher}
        piPackagePane={piPackagePane}
        onOpenMcpRuntimeSettings={input.onOpenMcpRuntimeSettings}
      />
    );
  }

  if (input.panel === "attachments") {
    return (
      <RightPanelContextPane
        attachments={input.contextAttachments}
        allowExternal={input.state.settings.permissionMode === "full-access"}
        visualAnalysisBusy={browserPane.visualAnalysisBusy}
        visualAnalysisStatus={browserPane.visualAnalysisStatus}
        visualAnalysisDiagnostics={browserPane.visualAnalysisDiagnostics}
        onAddContext={input.onAddContext}
        onRemoveContext={input.onRemoveContext}
        onClearContext={input.onClearContext}
        onContextError={input.onContextError}
        onAnalyzeVisual={(attachment: WorkspaceContextReference) => browserPane.analyzeContextAttachmentWithMiniCpm(attachment)}
      />
    );
  }

  return (
    <div className="panel-empty">
      <span>Performance tracing is not wired yet.</span>
    </div>
  );
}
