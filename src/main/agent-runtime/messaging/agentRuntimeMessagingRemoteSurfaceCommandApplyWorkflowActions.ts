import type {
  MessagingRemoteSurfaceWorkflowActionRequest,
  MessagingRemoteSurfaceWorkflowActionResult,
} from "../agentRuntimeMessagingFacade";

export interface MessagingRemoteSurfaceCommandWorkflowActionThreadSummary {
  id: string;
  title: string;
  phase: string;
}

export interface MessagingRemoteSurfaceCommandWorkflowActionAgents {
  runExploration?: (input: { workflowThreadId: string; reason: string }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    traceId?: string;
    graphSnapshotId?: string;
    text?: string;
  }>;
  compilePreview?: (input: { workflowThreadId: string; reason: string }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    artifactId?: string;
    runId?: string;
    text?: string;
  }>;
  reviewArtifact?: (input: { workflowThreadId: string; artifactId: string; decision: "approved" | "rejected"; reason: string }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    artifactId: string;
    artifactStatus: string;
    changed: boolean;
    text?: string;
  }>;
  recoverRun?: (input: {
    workflowThreadId: string;
    runId: string;
    eventId: string;
    action: NonNullable<MessagingRemoteSurfaceWorkflowActionRequest["recoveryAction"]>;
    graphNodeId?: string;
    itemKey?: string;
    reason: string;
  }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    runId: string;
    runStatus?: string;
    changed: boolean;
    text?: string;
  }>;
  cancelRun?: (input: { workflowThreadId: string; runId: string; reason: string }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    runId: string;
    runStatus?: string;
    changed: boolean;
    text?: string;
  }>;
}

export interface MessagingRemoteSurfaceCommandWorkflowActionApplyOptions {
  input: MessagingRemoteSurfaceWorkflowActionRequest;
  getWorkflowThreadSummary: (workflowThreadId: string) => MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
  workflowAgents?: MessagingRemoteSurfaceCommandWorkflowActionAgents;
  onWorkflowUpdated: () => void;
}

export async function messagingRemoteSurfaceCommandApplyWorkflowAction(
  options: MessagingRemoteSurfaceCommandWorkflowActionApplyOptions,
): Promise<MessagingRemoteSurfaceWorkflowActionResult> {
  const { input } = options;
  const before = options.getWorkflowThreadSummary(input.workflowThreadId);
  if (input.action === "run_exploration") {
    if (!options.workflowAgents?.runExploration) {
      throw new Error("Ambient Workflow Agent exploration is not available in this runtime.");
    }
    const result = await options.workflowAgents.runExploration({
      workflowThreadId: input.workflowThreadId,
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: "run_exploration",
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: true,
      ...(result.traceId ? { traceId: result.traceId } : {}),
      ...(result.graphSnapshotId ? { graphSnapshotId: result.graphSnapshotId } : {}),
      text:
        result.text ??
        [
          "Workflow Agent exploration completed",
          `Workflow: ${result.thread.title} (${result.thread.id})`,
          `Phase: ${before.phase} -> ${result.thread.phase}`,
          result.traceId ? `Trace: ${result.traceId}` : undefined,
          result.graphSnapshotId ? `Graph snapshot: ${result.graphSnapshotId}` : undefined,
          input.reason ? `Reason: ${input.reason}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
    };
  }

  if (input.action === "compile_preview") {
    if (!options.workflowAgents?.compilePreview) {
      throw new Error("Ambient Workflow Agent compile preview is not available in this runtime.");
    }
    const result = await options.workflowAgents.compilePreview({
      workflowThreadId: input.workflowThreadId,
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: "compile_preview",
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: true,
      ...(result.artifactId ? { artifactId: result.artifactId } : {}),
      ...(result.runId ? { runId: result.runId } : {}),
      text:
        result.text ??
        [
          "Workflow Agent compile preview completed",
          `Workflow: ${result.thread.title} (${result.thread.id})`,
          `Phase: ${before.phase} -> ${result.thread.phase}`,
          result.artifactId ? `Artifact: ${result.artifactId}` : undefined,
          result.runId ? `Run: ${result.runId}` : undefined,
          input.reason ? `Reason: ${input.reason}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
    };
  }

  if (input.action === "approve_artifact" || input.action === "reject_artifact") {
    if (!input.artifactId) throw new Error("Workflow preview review requires an artifact id.");
    if (!options.workflowAgents?.reviewArtifact) {
      throw new Error("Ambient Workflow Agent artifact review is not available in this runtime.");
    }
    const decision = input.action === "approve_artifact" ? "approved" : "rejected";
    const result = await options.workflowAgents.reviewArtifact({
      workflowThreadId: input.workflowThreadId,
      artifactId: input.artifactId,
      decision,
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: input.action,
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: result.changed,
      artifactId: result.artifactId,
      artifactStatus: result.artifactStatus,
      text:
        result.text ??
        [
          decision === "approved" ? "Workflow preview approved" : "Workflow preview rejected",
          `Workflow: ${result.thread.title} (${result.thread.id})`,
          `Artifact: ${result.artifactId}`,
          `Artifact status: ${result.artifactStatus}`,
          `Changed: ${result.changed ? "yes" : "no"}`,
          input.reason ? `Reason: ${input.reason}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
    };
  }

  if (input.action === "retry_failed_step" || input.action === "resume_checkpoint" || input.action === "skip_failed_item") {
    if (!input.runId || !input.eventId || !input.recoveryAction) {
      throw new Error("Workflow recovery requires a run id, event id, and recovery action.");
    }
    if (!options.workflowAgents?.recoverRun) {
      throw new Error("Ambient Workflow Agent run recovery is not available in this runtime.");
    }
    const result = await options.workflowAgents.recoverRun({
      workflowThreadId: input.workflowThreadId,
      runId: input.runId,
      eventId: input.eventId,
      action: input.recoveryAction,
      ...(input.graphNodeId ? { graphNodeId: input.graphNodeId } : {}),
      ...(input.itemKey ? { itemKey: input.itemKey } : {}),
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: input.action,
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: result.changed,
      runId: result.runId,
      ...(result.runStatus ? { runStatus: result.runStatus } : {}),
      text:
        result.text ??
        [
          "Workflow recovery requested",
          `Workflow: ${result.thread.title} (${result.thread.id})`,
          `Source run: ${input.runId}`,
          `Source event: ${input.eventId}`,
          `Recovery action: ${input.recoveryAction}`,
          `New run: ${result.runId}`,
          result.runStatus ? `New run status: ${result.runStatus}` : undefined,
          `Changed: ${result.changed ? "yes" : "no"}`,
          input.reason ? `Reason: ${input.reason}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
    };
  }

  if (!input.runId) throw new Error("Workflow cancellation requires a run id.");
  if (!options.workflowAgents?.cancelRun) {
    throw new Error("Ambient Workflow Agent run cancellation is not available in this runtime.");
  }
  const result = await options.workflowAgents.cancelRun({
    workflowThreadId: input.workflowThreadId,
    runId: input.runId,
    reason: input.reason,
  });
  options.onWorkflowUpdated();
  return {
    action: "cancel_run",
    workflowThreadId: result.thread.id,
    workflowTitle: result.thread.title,
    changed: result.changed,
    runId: result.runId,
    ...(result.runStatus ? { runStatus: result.runStatus } : {}),
    text:
      result.text ??
      [
        "Workflow cancellation requested",
        `Workflow: ${result.thread.title} (${result.thread.id})`,
        `Run: ${result.runId}`,
        result.runStatus ? `Run status: ${result.runStatus}` : undefined,
        `Changed: ${result.changed ? "yes" : "no"}`,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
  };
}
