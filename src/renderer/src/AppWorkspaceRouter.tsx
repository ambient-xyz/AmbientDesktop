import type { ComponentProps, CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import { AutomationsWorkspace, type AutomationsWorkspaceProps } from "./AutomationsWorkspace";
import { AppComposerShell } from "./AppComposerShell";
import { AppConversationMessages, type AppConversationMessagesProps } from "./AppConversationMessages";
import type { SidebarArea } from "./AppShellSidebar";
import { WorkflowRecordingReviewPanel } from "./AppWorkflowRecording";
import { ProjectBoardWorkspace, type ProjectBoardWorkspaceProps } from "./ProjectBoardWorkspace";

export function AppWorkspaceRouter({
  sidebarArea,
  automationsProps,
  projectBoardProps,
  conversationReviewPanelDocked,
  workflowRecorderReviewPanelWidth,
  onBeginWorkflowRecorderReviewResize,
  conversationMessagesProps,
  composerProps,
  workflowReviewPanelProps,
}: {
  sidebarArea: SidebarArea;
  automationsProps: AutomationsWorkspaceProps;
  projectBoardProps?: ProjectBoardWorkspaceProps;
  conversationReviewPanelDocked: boolean;
  workflowRecorderReviewPanelWidth: number;
  onBeginWorkflowRecorderReviewResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
  conversationMessagesProps: AppConversationMessagesProps;
  composerProps: ComponentProps<typeof AppComposerShell>;
  workflowReviewPanelProps: ComponentProps<typeof WorkflowRecordingReviewPanel>;
}) {
  if (sidebarArea === "automations") {
    return <AutomationsWorkspace {...automationsProps} />;
  }

  if (projectBoardProps) {
    return <ProjectBoardWorkspace {...projectBoardProps} />;
  }

  const reviewLayoutStyle = conversationReviewPanelDocked
    ? { "--workflow-recorder-review-width": `${workflowRecorderReviewPanelWidth}px` } as CSSProperties
    : undefined;

  return (
    <div className={`conversation-review-layout ${conversationReviewPanelDocked ? "with-review-panel" : ""}`} style={reviewLayoutStyle}>
      <AppConversationMessages {...conversationMessagesProps}>
        <AppComposerShell {...composerProps} />
      </AppConversationMessages>
      {conversationReviewPanelDocked && (
        <div
          className="workflow-recorder-review-resize-handle"
          role="separator"
          aria-label="Resize workflow review pane"
          aria-orientation="vertical"
          onMouseDown={onBeginWorkflowRecorderReviewResize}
        >
          <span />
        </div>
      )}
      <WorkflowRecordingReviewPanel {...workflowReviewPanelProps} />
    </div>
  );
}
