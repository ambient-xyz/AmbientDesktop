import { useRightPanelControllerGraph } from "./RightPanelControllerGraph";
import {
  BrowserProfileCopyDialog,
  GitConfirmationDialog,
} from "./RightPanelDetailPanels";
import {
  CapabilityBuilderLauncherDialog,
  McpContainerRuntimeDialog,
} from "./RightPanelDialogs";
import { RightPanelShell } from "./RightPanelShell";
import type { RightPanelProps } from "./RightPanelTypes";
import "./styles.css";
export {
  contextAttachmentKey,
  formatTaskState,
  GitConfirmationDialog,
  truncateUiText,
} from "./RightPanelDetailPanels";
export type { GitConfirmation } from "./RightPanelDetailPanels";
export {
  formatHtmlPreviewAutoPauseLabel,
  formatPanelFileSize,
  HTML_PREVIEW_AUTO_PAUSE_MS,
  LazyHtmlPreview,
  OpenTargetIcon,
} from "./RightPanelFilePreview";
export { DiffOutput } from "./RightPanelGitPane";
export {
  ambientBrowserRuntimeForUrl,
  clampNumber,
  externalLinkMenuLabel,
  InlineArtifactMedia,
  isAbsoluteFilePath,
  isHtmlArtifactPath,
  LinkContextMenuPortal,
  preferredWorkspaceOpenTarget,
  RichText,
  stripLinkLineSuffix,
  workspaceAbsoluteArtifactPath,
} from "./RightPanelRichText";
export type { LinkContextMenuState } from "./RightPanelRichText";
export {
  contextUsagePresentation,
  desktopUpdateStatusText,
  thinkingDisplayOptions,
} from "./RightPanelSettingsCore";
export {
  DiagnosticExportHistory,
  formatBytes,
  formatDurationMs,
  formatTimelineTime,
  LocalDeepResearchDiagnosticsList,
  LocalModelsRuntimeInventory,
  LocalRuntimeEvidenceDiagnostics,
  ModelRuntimeCatalogDiagnostics,
  ProviderCatalogSettingsCards,
  SubagentRepairDiagnostics,
  SubagentReplayEvidenceDiagnostics,
} from "./RightPanelSettingsRuntime";
export type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
export { InfoTooltip, PermissionFullAccessReceiptList } from "./RightPanelStatusWidgets";
export type {
  ArtifactPreviewRequest,
  GitPanelTabRequest,
  LocalDeepResearchRunHistoryUiState,
  LocalDeepResearchSetupUiState,
  MiniCpmVisionSetupUiState,
  RightPanelProps,
  SettingsFocusRequest,
  SttMicTestUiState,
  SttProviderCacheActivity,
  SttProviderCacheStatus,
  SttProviderSetupUiState,
  UtilityPanel,
  VoiceCatalogRefreshState,
  VoiceProviderCacheActivity,
  VoiceProviderCacheStatus,
} from "./RightPanelTypes";

export function RightPanel(props: RightPanelProps) {
  const {
    panel,
    panelWidth,
    mcpContainerRuntimeInstallProgress,
    mcpDefaultCapabilityInstallProgress,
    running,
    onOpenMcpRuntimeSettings,
    onClose,
  } = props;
  const { title, body, controllers } = useRightPanelControllerGraph(props);
  const {
    gitPane,
    browserPane,
    mcpPane,
    diagnosticsPane,
    capabilityBuilderLauncher,
  } = controllers;

  return (
    <>
      <RightPanelShell
        panel={panel}
        title={title}
        panelWidth={panelWidth}
        browserFocused={browserPane.browserFocused}
        onClose={onClose}
      >
        {body}
      </RightPanelShell>
      {gitPane.confirmation && (
        <GitConfirmationDialog
          confirmation={gitPane.confirmation}
          onCancel={gitPane.cancelConfirmation}
          onConfirm={gitPane.confirmConfirmation}
        />
      )}
      {browserPane.browserCopyDialogOpen && (
        <BrowserProfileCopyDialog
          state={browserPane.browserState}
          busy={browserPane.browserBusy === "copy-profile"}
          onCancel={() => browserPane.setBrowserCopyDialogOpen(false)}
          onConfirm={() => void browserPane.copyChromeProfile()}
        />
      )}
      {mcpPane.containerRuntimeModalOpen && (
        <McpContainerRuntimeDialog
          status={mcpPane.containerRuntimeStatus}
          busy={mcpPane.containerRuntimeBusy}
          launchBusy={mcpPane.containerRuntimeLaunchBusy}
          diagnosticBusy={diagnosticsPane.diagnosticBusy}
          diagnosticStatus={diagnosticsPane.diagnosticStatus}
          actionStatus={mcpPane.containerRuntimeActionStatus}
          lifecyclePreview={mcpPane.containerRuntimeLifecyclePreview}
          lifecycleResult={mcpPane.containerRuntimeLifecycleResult}
          lifecycleProgress={mcpPane.containerRuntimeLifecycleProgress}
          lifecycleBusyKey={mcpPane.containerRuntimeLifecycleBusyKey}
          lifecycleError={mcpPane.containerRuntimeLifecycleError}
          installProgress={mcpContainerRuntimeInstallProgress}
          defaultCapabilityInstallProgress={mcpDefaultCapabilityInstallProgress}
          defaultCapabilityBusyKey={mcpPane.serverBusy}
          error={mcpPane.containerRuntimeError}
          onRefresh={() => void mcpPane.refreshContainerRuntimeStatus(false, { continueDefaultCapabilitySetup: true })}
          onLaunchInstall={(actionId, mode) => void mcpPane.launchContainerRuntimeInstaller(actionId, mode)}
          onPreviewLifecycle={(action) => void mcpPane.previewContainerRuntimeLifecycle(action)}
          onRunLifecycle={(action) => void mcpPane.runContainerRuntimeLifecycle(action)}
          onExportDiagnostics={() => void diagnosticsPane.exportDiagnostics()}
          onInstallDefaultCapability={(capabilityId) => void mcpPane.installDefaultCapability(capabilityId)}
          onOpenPlugins={() => {
            mcpPane.setContainerRuntimeModalOpen(false);
            onOpenMcpRuntimeSettings();
          }}
          onClose={() => void mcpPane.dismissContainerRuntimeSetup()}
        />
      )}
      {capabilityBuilderLauncher.open && (
        <CapabilityBuilderLauncherDialog
          draft={capabilityBuilderLauncher.draft}
          newChat={capabilityBuilderLauncher.newChat}
          busy={capabilityBuilderLauncher.busy}
          running={running}
          onChange={capabilityBuilderLauncher.updateDraft}
          onChangeNewChat={capabilityBuilderLauncher.setNewChat}
          onClose={capabilityBuilderLauncher.close}
          onSubmit={() => void capabilityBuilderLauncher.submit()}
        />
      )}
    </>
  );
}
