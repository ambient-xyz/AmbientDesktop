import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import { RightPanelBrowserPane } from "./RightPanelBrowserPane";
import type { RightPanelBodyRendererInput } from "./RightPanelBodyRenderer";
import { RightPanelContextPane } from "./RightPanelContextPane";
import { fileIconForEntry, fileTreeEntryTitle } from "./RightPanelDetailPanels";
import { FilePreview, formatPanelFileSize } from "./RightPanelFilePreview";
import { RightPanelGitPane } from "./RightPanelGitPane";
import { RightPanelPluginsPane } from "./RightPanelPluginsPane";
import { RichText } from "./RightPanelRichText";
import { RightPanelSettingsPane } from "./RightPanelSettingsPane";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import { InfoTooltip, PermissionFullAccessReceiptList } from "./RightPanelStatusWidgets";
import { fileContextReference } from "./RightPanelUtilityPaneControllers";
import { RightPanelFilesPane, RightPanelSearchPane, RightPanelTerminalPane } from "./RightPanelUtilityPanes";

export function renderRightPanelTerminalBody(input: RightPanelBodyRendererInput) {
  const { terminalPane } = input.controllers;

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

export function renderRightPanelSearchBody(input: RightPanelBodyRendererInput) {
  const { searchPane } = input.controllers;

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

export function renderRightPanelBrowserBody(input: RightPanelBodyRendererInput) {
  const { browserPane } = input.controllers;

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

export function renderRightPanelFilesBody(input: RightPanelBodyRendererInput) {
  const { browserPane, filesPane } = input.controllers;

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

export function renderRightPanelDiffBody(input: RightPanelBodyRendererInput) {
  const { gitPane } = input.controllers;

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

export function renderRightPanelSettingsBody(input: RightPanelBodyRendererInput) {
  const { diagnosticsPane, mcpPane, pluginCatalogPane, settingsPane } = input.controllers;

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
      onRunAgentMemoryEmbeddingLifecycleAction={(action) => void input.onRunAgentMemoryEmbeddingLifecycleActionFromSettings(action)}
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

export function renderRightPanelPluginsBody(input: RightPanelBodyRendererInput) {
  const {
    capabilityBuilderLauncher,
    diagnosticsPane,
    googleIntegrationBridge,
    mcpPane,
    piPackagePane,
    pluginAuthPane,
    pluginCatalogPane,
    settingsPane,
  } = input.controllers;

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

export function renderRightPanelAttachmentsBody(input: RightPanelBodyRendererInput) {
  const { browserPane } = input.controllers;

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

export function renderRightPanelPerformanceBody() {
  return (
    <div className="panel-empty">
      <span>Performance tracing is not wired yet.</span>
    </div>
  );
}
