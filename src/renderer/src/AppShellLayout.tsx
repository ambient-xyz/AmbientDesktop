import type { ComponentProps, Dispatch, RefObject, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowAgentFolderSummary, WorkflowAgentThreadSummary } from "../../shared/workflowTypes";
import type { ChatComposerInputHandle } from "./AppComposerControls";
import { DesktopUpdateNotice } from "./AppDialogs";
import { AppModalHost } from "./AppModalHost";
import { AppRightPanelHost } from "./AppRightPanelHost";
import { AppShellSidebar } from "./AppShellSidebar";
import { AppTopbar, type AppTopbarProjectBoardAction } from "./AppTopbar";
import type { AppUpdateAction } from "./AppUpdateActions";
import { AppWorkspaceRouter } from "./AppWorkspaceRouter";
import { workflowRecorderSurface } from "./AutomationsWorkspace";
import type { UtilityPanel } from "./RightPanel";

type AppTopbarProps = ComponentProps<typeof AppTopbar>;
type AppWorkspaceRouterProps = ComponentProps<typeof AppWorkspaceRouter>;
type WorkflowReviewPanelProps = AppWorkspaceRouterProps["workflowReviewPanelProps"];

export type AppShellLayoutProps = {
  isMac: boolean;
  updateNoticeProps: ComponentProps<typeof DesktopUpdateNotice>;
  sidebarOpen: boolean;
  sidebarProps: ComponentProps<typeof AppShellSidebar>;
  topbarProps: AppTopbarProps;
  workspaceRouterProps: AppWorkspaceRouterProps;
  rightPanelHostProps: ComponentProps<typeof AppRightPanelHost>;
  modalHostProps: ComponentProps<typeof AppModalHost>;
};

export type AppShellLayoutPropsInput = {
  activeGitReview: AppTopbarProps["gitReview"];
  activeGitReviewError?: string;
  activeProjectBoardTopbarAction?: AppTopbarProjectBoardAction;
  activeThread: Pick<ThreadSummary, "title" | "memoryEnabled" | "workflowRecording">;
  automationsWorkspaceProps: AppWorkspaceRouterProps["automationsProps"];
  beginWorkflowRecorderReviewResize: AppWorkspaceRouterProps["onBeginWorkflowRecorderReviewResize"];
  composerInputRef: RefObject<ChatComposerInputHandle | null>;
  composerProps: AppWorkspaceRouterProps["composerProps"];
  confirmActiveWorkflowRecordingReview: WorkflowReviewPanelProps["onConfirmReview"];
  conversationMessagesProps: AppWorkspaceRouterProps["conversationMessagesProps"];
  conversationReviewPanelDocked: boolean;
  isMac: boolean;
  modalHostProps: AppShellLayoutProps["modalHostProps"];
  openApiKeyDialog: () => unknown;
  openGitSummaryPanel: () => void;
  projectBoardWorkspaceProps: AppWorkspaceRouterProps["projectBoardProps"];
  rightPanel: UtilityPanel | undefined;
  rightPanelHostProps: AppShellLayoutProps["rightPanelHostProps"];
  runUpdateAction: (action: AppUpdateAction) => unknown;
  running: boolean;
  selectedWorkflowAgentFolder?: WorkflowAgentFolderSummary;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  sendWorkflowRecordingReviewPrompt: WorkflowReviewPanelProps["onRetryReview"];
  setError: WorkflowReviewPanelProps["onDraftValidationError"];
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setUpdatePopoverOpen: Dispatch<SetStateAction<boolean>>;
  setWorkflowRecordingReviewPanelOpen: Dispatch<SetStateAction<boolean>>;
  showTopbarThreadMemoryToggle: boolean;
  sidebarArea: AppWorkspaceRouterProps["sidebarArea"];
  sidebarOpen: boolean;
  sidebarProps: AppShellLayoutProps["sidebarProps"];
  state: DesktopState;
  togglePanel: (panel: UtilityPanel) => void;
  updateActiveWorkflowRecordingReview: WorkflowReviewPanelProps["onSaveReviewEdit"];
  updateBusy: boolean;
  updatePopoverOpen: boolean;
  updateThreadSettings: (input: { memoryEnabled: boolean }) => unknown;
  workflowRecorderReviewPanelWidth: number;
  workflowRecordingReviewFeedbackActive: boolean;
  workflowRecordingReviewPanelOpen: boolean;
  applyLatestWorkflowRecordingSummary: WorkflowReviewPanelProps["onApplyLatestSummary"];
};

export function createAppShellLayoutProps({
  activeGitReview,
  activeGitReviewError,
  activeProjectBoardTopbarAction,
  activeThread,
  automationsWorkspaceProps,
  beginWorkflowRecorderReviewResize,
  composerInputRef,
  composerProps,
  confirmActiveWorkflowRecordingReview,
  conversationMessagesProps,
  conversationReviewPanelDocked,
  isMac,
  modalHostProps,
  openApiKeyDialog,
  openGitSummaryPanel,
  projectBoardWorkspaceProps,
  rightPanel,
  rightPanelHostProps,
  runUpdateAction,
  running,
  selectedWorkflowAgentFolder,
  selectedWorkflowAgentThread,
  sendWorkflowRecordingReviewPrompt,
  setError,
  setSidebarOpen,
  setUpdatePopoverOpen,
  setWorkflowRecordingReviewPanelOpen,
  showTopbarThreadMemoryToggle,
  sidebarArea,
  sidebarOpen,
  sidebarProps,
  state,
  togglePanel,
  updateActiveWorkflowRecordingReview,
  updateBusy,
  updatePopoverOpen,
  updateThreadSettings,
  workflowRecorderReviewPanelWidth,
  workflowRecordingReviewFeedbackActive,
  workflowRecordingReviewPanelOpen,
  applyLatestWorkflowRecordingSummary,
}: AppShellLayoutPropsInput): AppShellLayoutProps {
  return {
    isMac,
    updateNoticeProps: {
      update: state.app.update,
      open: updatePopoverOpen,
      busy: updateBusy,
      onToggle: () => setUpdatePopoverOpen((open) => !open),
      onCheck: () => {
        void runUpdateAction("check");
      },
      onDownload: () => {
        void runUpdateAction("download");
      },
      onInstall: () => {
        void runUpdateAction("install");
      },
      onDismiss: () => {
        void runUpdateAction("dismiss");
      },
    },
    sidebarOpen,
    sidebarProps,
    topbarProps: {
      sidebarOpen,
      title:
        sidebarArea === "automations"
          ? selectedWorkflowAgentThread?.title || selectedWorkflowAgentFolder?.name || workflowRecorderSurface.homeTitle
          : activeThread.title,
      providerHasApiKey: state.provider.hasApiKey,
      providerLabel: state.provider.providerLabel,
      memoryMode: showTopbarThreadMemoryToggle ? state.settings.memory.mode : undefined,
      threadMemoryEnabled: Boolean(activeThread.memoryEnabled),
      threadMemoryToggleDisabled: !activeThread,
      projectBoardAction: activeProjectBoardTopbarAction,
      gitReview: activeGitReview,
      gitReviewError: activeGitReviewError,
      rightPanel,
      onShowSidebar: () => setSidebarOpen(true),
      onOpenApiKey: () => {
        void openApiKeyDialog();
      },
      onToggleThreadMemory: showTopbarThreadMemoryToggle
        ? (enabled) => {
            void updateThreadSettings({ memoryEnabled: enabled });
          }
        : undefined,
      onOpenGitSummary: openGitSummaryPanel,
      onTogglePanel: togglePanel,
    },
    workspaceRouterProps: {
      sidebarArea,
      automationsProps: automationsWorkspaceProps,
      projectBoardProps: projectBoardWorkspaceProps,
      conversationReviewPanelDocked,
      workflowRecorderReviewPanelWidth,
      onBeginWorkflowRecorderReviewResize: beginWorkflowRecorderReviewResize,
      conversationMessagesProps,
      composerProps,
      workflowReviewPanelProps: {
        recording: activeThread.workflowRecording,
        open: workflowRecordingReviewPanelOpen,
        running,
        onClose: () => setWorkflowRecordingReviewPanelOpen(false),
        onRetryReview: sendWorkflowRecordingReviewPrompt,
        onApplyLatestSummary: applyLatestWorkflowRecordingSummary,
        onSaveReviewEdit: updateActiveWorkflowRecordingReview,
        onDraftValidationError: setError,
        onFocusFeedback: () => {
          if (workflowRecordingReviewFeedbackActive) composerInputRef.current?.focusEnd();
        },
        onConfirmReview: confirmActiveWorkflowRecordingReview,
      },
    },
    rightPanelHostProps,
    modalHostProps,
  };
}

export function AppShellLayout({
  isMac,
  updateNoticeProps,
  sidebarOpen,
  sidebarProps,
  topbarProps,
  workspaceRouterProps,
  rightPanelHostProps,
  modalHostProps,
}: AppShellLayoutProps) {
  return (
    <div className={`app-shell ${isMac ? "platform-macos" : ""}`}>
      <DesktopUpdateNotice {...updateNoticeProps} />
      {sidebarOpen && <AppShellSidebar {...sidebarProps} />}

      <main className="main">
        <AppTopbar {...topbarProps} />

        <div className="content-row">
          <AppWorkspaceRouter {...workspaceRouterProps} />
          <AppRightPanelHost {...rightPanelHostProps} />
        </div>
      </main>

      <AppModalHost {...modalHostProps} />
    </div>
  );
}
