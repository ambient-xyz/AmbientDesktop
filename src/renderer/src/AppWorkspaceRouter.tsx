import type { ComponentProps } from "react";

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
  conversationMessagesProps,
  composerProps,
  workflowReviewPanelProps,
}: {
  sidebarArea: SidebarArea;
  automationsProps: AutomationsWorkspaceProps;
  projectBoardProps?: ProjectBoardWorkspaceProps;
  conversationReviewPanelDocked: boolean;
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

  return (
    <div className={`conversation-review-layout ${conversationReviewPanelDocked ? "with-review-panel" : ""}`}>
      <AppConversationMessages {...conversationMessagesProps}>
        <AppComposerShell {...composerProps} />
      </AppConversationMessages>
      <WorkflowRecordingReviewPanel {...workflowReviewPanelProps} />
    </div>
  );
}
