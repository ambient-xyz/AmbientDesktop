import type { DesktopEvent } from "../shared/types";

export interface AgentRuntimeEventWorkspaceScopeStore {
  getThread(threadId: string): { workspacePath: string };
  getWorkspace(): { path: string };
  getWorkflowAgentThreadSummary(workflowThreadId: string): { projectPath?: string };
  getWorkflowArtifact(artifactId: string): { workflowThreadId?: string };
}

export function desktopEventWithWorkspacePath(
  event: DesktopEvent,
  store: AgentRuntimeEventWorkspaceScopeStore,
): DesktopEvent {
  if ((event as { workspacePath?: string }).workspacePath) return event;
  const workspacePath = desktopEventWorkspacePath(event, store);
  return workspacePath ? ({ ...event, workspacePath } as DesktopEvent) : event;
}

export function desktopEventWorkspacePath(
  event: DesktopEvent,
  store: AgentRuntimeEventWorkspaceScopeStore,
): string | undefined {
  switch (event.type) {
    case "message-created":
    case "message-updated":
      return agentRuntimeThreadWorkspacePath(store, event.message.threadId);
    case "message-delta":
      return event.threadId ? agentRuntimeThreadWorkspacePath(store, event.threadId) : agentRuntimeCurrentWorkspacePath(store);
    case "thread-updated":
      return event.thread.workspacePath;
    case "subagent-run-updated":
    case "subagent-run-event-created":
    case "subagent-tool-scope-snapshot-recorded":
      return agentRuntimeThreadWorkspacePath(store, event.run.parentThreadId) ?? agentRuntimeThreadWorkspacePath(store, event.run.childThreadId);
    case "subagent-wait-barrier-updated":
      return agentRuntimeThreadWorkspacePath(store, event.barrier.parentThreadId);
    case "subagent-parent-mailbox-event-updated":
      return agentRuntimeThreadWorkspacePath(store, event.mailboxEvent.parentThreadId);
    case "callable-workflow-task-updated":
      return agentRuntimeThreadWorkspacePath(store, event.task.parentThreadId);
    case "run-status":
    case "tool-event":
      return agentRuntimeThreadWorkspacePath(store, event.threadId);
    case "queue-updated":
      return event.queue.threadId ? agentRuntimeThreadWorkspacePath(store, event.queue.threadId) : agentRuntimeCurrentWorkspacePath(store);
    case "runtime-activity":
      return agentRuntimeThreadWorkspacePath(store, event.activity.threadId);
    case "context-usage-updated":
      return agentRuntimeThreadWorkspacePath(store, event.snapshot.threadId);
    case "planner-plan-artifact-created":
    case "planner-plan-artifact-updated":
      return agentRuntimeThreadWorkspacePath(store, event.artifact.threadId);
    case "thread-goal-updated":
      return agentRuntimeThreadWorkspacePath(store, event.goal.threadId);
    case "thread-goal-cleared":
      return agentRuntimeThreadWorkspacePath(store, event.threadId);
    case "permission-audit-created":
      return agentRuntimeThreadWorkspacePath(store, event.entry.threadId);
    case "permission-grant-created":
    case "permission-grant-revoked":
      return event.grant.projectPath ?? event.grant.workspacePath ?? (event.grant.threadId ? agentRuntimeThreadWorkspacePath(store, event.grant.threadId) : undefined);
    case "browser-updated":
    case "workflow-updated":
    case "workflow-compile-progress":
    case "plugin-catalog-updated":
      return agentRuntimeCurrentWorkspacePath(store);
    case "workflow-run-started":
      return agentRuntimeWorkflowArtifactWorkspacePath(store, event.artifactId, event.workflowThreadId);
    case "workflow-discovery-progress":
    case "workflow-exploration-progress":
      return agentRuntimeWorkflowThreadWorkspacePath(store, event.progress.workflowThreadId);
    default:
      return undefined;
  }
}

export function agentRuntimeThreadWorkspacePath(
  store: AgentRuntimeEventWorkspaceScopeStore,
  threadId: string,
): string | undefined {
  try {
    return store.getThread(threadId).workspacePath;
  } catch {
    return agentRuntimeCurrentWorkspacePath(store);
  }
}

export function agentRuntimeCurrentWorkspacePath(store: AgentRuntimeEventWorkspaceScopeStore): string | undefined {
  try {
    return store.getWorkspace().path;
  } catch {
    return undefined;
  }
}

export function agentRuntimeWorkflowThreadWorkspacePath(
  store: AgentRuntimeEventWorkspaceScopeStore,
  workflowThreadId?: string,
): string | undefined {
  if (!workflowThreadId) return agentRuntimeCurrentWorkspacePath(store);
  try {
    return store.getWorkflowAgentThreadSummary(workflowThreadId).projectPath || agentRuntimeCurrentWorkspacePath(store);
  } catch {
    return agentRuntimeCurrentWorkspacePath(store);
  }
}

export function agentRuntimeWorkflowArtifactWorkspacePath(
  store: AgentRuntimeEventWorkspaceScopeStore,
  artifactId: string,
  workflowThreadId?: string,
): string | undefined {
  try {
    const artifact = store.getWorkflowArtifact(artifactId);
    return agentRuntimeWorkflowThreadWorkspacePath(store, artifact.workflowThreadId ?? workflowThreadId);
  } catch {
    return agentRuntimeWorkflowThreadWorkspacePath(store, workflowThreadId);
  }
}
