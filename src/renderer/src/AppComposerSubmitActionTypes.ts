import type { SendMessageComposerIntent } from "../../shared/desktopTypes";
import type { WorkflowRecordingEditContext } from "../../shared/workflowTypes";

export type SubmitDraftOptions = {
  composerIntent?: SendMessageComposerIntent;
  activityLine?: string;
};

export type PendingWorkflowRecordingEditContext = WorkflowRecordingEditContext & {
  draftPrefix: string;
};
