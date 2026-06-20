import type {
  ResolveWorkflowRevisionInput,
  WorkflowRevisionSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";

export type WorkflowRevisionDecision = ResolveWorkflowRevisionInput["decision"];

export interface WorkflowRevisionDecisionChatThread {
  chatThreadId?: string;
  latestVersion?: Pick<WorkflowVersionSummary, "id" | "version">;
}

export interface WorkflowRevisionDecisionChatMessageInput {
  threadId: string;
  role: "system";
  content: string;
  metadata: {
    workflowThreadId: string;
    workflowMode: "plan-edit";
    kind: "workflow_revision_decision";
    status: "done";
    revisionId: string;
    decision: WorkflowRevisionDecision;
    versionId?: string;
    version?: number;
  };
}

export interface WorkflowRevisionDecisionChatStore {
  getWorkflowAgentThreadSummary(workflowThreadId: string): WorkflowRevisionDecisionChatThread;
  addMessage(input: WorkflowRevisionDecisionChatMessageInput): unknown;
}

export function recordWorkflowRevisionDecisionInChat(
  revision: WorkflowRevisionSummary,
  decision: WorkflowRevisionDecision,
  targetStore: WorkflowRevisionDecisionChatStore,
): void {
  const thread = targetStore.getWorkflowAgentThreadSummary(revision.workflowThreadId);
  if (!thread.chatThreadId) return;
  const versionLabel = thread.latestVersion ? `version ${thread.latestVersion.version}` : "the current workflow version";
  const content =
    decision === "applied"
      ? `Applied workflow revision ${revision.id}. The active workflow now points at ${versionLabel}.`
      : `Rejected workflow revision ${revision.id}. The workflow remains on ${versionLabel}.`;
  targetStore.addMessage({
    threadId: thread.chatThreadId,
    role: "system",
    content,
    metadata: {
      workflowThreadId: revision.workflowThreadId,
      workflowMode: "plan-edit",
      kind: "workflow_revision_decision",
      status: "done",
      revisionId: revision.id,
      decision,
      versionId: thread.latestVersion?.id,
      version: thread.latestVersion?.version,
    },
  });
}
