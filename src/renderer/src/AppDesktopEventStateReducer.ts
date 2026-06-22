import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import { STATE_REDUCER_DESKTOP_EVENT_TYPES, upsertSortedDesktopEventItem } from "./AppDesktopEvents";
import { threadGoalKey } from "./AppDesktopStateFreshness";
import {
  applyChildThreadMessageDelta,
  upsertChildThreadMessage,
} from "./subagentChildMessagesState";

export interface AppDesktopEventStateReducerInput {
  current: DesktopState | undefined;
  event: DesktopEvent;
  clearedGoalKeys: ReadonlySet<string>;
  desktopEventMatchesWorkspace: (event: DesktopEvent, workspacePath?: string) => boolean;
}

export function isAppDesktopEventStateReducerEvent(event: DesktopEvent): boolean {
  return STATE_REDUCER_DESKTOP_EVENT_TYPES.has(event.type);
}

export function reduceAppDesktopEventState({
  current,
  event,
  clearedGoalKeys,
  desktopEventMatchesWorkspace,
}: AppDesktopEventStateReducerInput): DesktopState | undefined {
  if (!current || !isAppDesktopEventStateReducerEvent(event)) return current;
  if (event.type === "provider-updated") {
    return { ...current, provider: event.provider };
  }
  if (event.type === "update-status") {
    return { ...current, app: { ...current.app, update: event.update } };
  }
  if (event.type === "queue-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (event.queue.threadId && event.queue.threadId !== current.activeThreadId) return current;
    return { ...current, queue: event.queue };
  }
  if (event.type === "stt-queue-updated") {
    if (event.workspacePath && event.workspacePath !== current.workspace.path) return current;
    return { ...current, sttQueue: event.queue };
  }
  if (event.type === "stt-diagnostic-recorded") {
    if (event.workspacePath && event.workspacePath !== current.workspace.path) return current;
    return { ...current, sttDiagnostics: event.diagnostics };
  }
  if (event.type === "message-created") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (event.message.threadId !== current.activeThreadId) return upsertChildThreadMessage(current, event.message);
    return { ...current, messages: [...current.messages, event.message] };
  }
  if (event.type === "message-delta") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!current.messages.some((message) => message.id === event.messageId)) return applyChildThreadMessageDelta(current, event);
    return {
      ...current,
      messages: current.messages.map((message) =>
        message.id === event.messageId ? { ...message, content: message.content + event.delta } : message,
      ),
    };
  }
  if (event.type === "message-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (event.message.threadId !== current.activeThreadId) return upsertChildThreadMessage(current, event.message);
    return {
      ...current,
      messages: current.messages.map((message) => (message.id === event.message.id ? event.message : message)),
    };
  }
  if (event.type === "planner-plan-artifact-created" || event.type === "planner-plan-artifact-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (event.artifact.threadId !== current.activeThreadId) return current;
    const exists = current.plannerPlanArtifacts.some((artifact) => artifact.id === event.artifact.id);
    return {
      ...current,
      plannerPlanArtifacts: exists
        ? current.plannerPlanArtifacts.map((artifact) => (artifact.id === event.artifact.id ? event.artifact : artifact))
        : [event.artifact, ...current.plannerPlanArtifacts],
    };
  }
  if (event.type === "thread-goal-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (event.goal.threadId !== current.activeThreadId) return current;
    if (clearedGoalKeys.has(threadGoalKey(event.goal))) return current;
    return { ...current, activeThreadGoal: event.goal };
  }
  if (event.type === "thread-goal-cleared") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (event.threadId !== current.activeThreadId) return current;
    return { ...current, activeThreadGoal: undefined };
  }
  if (event.type === "thread-updated") {
    const upsertThread = (threads: ThreadSummary[]) =>
      threads.some((thread) => thread.id === event.thread.id)
        ? threads.map((thread) => (thread.id === event.thread.id ? event.thread : thread))
        : [...threads, event.thread];
    const projects = current.projects.map((project) =>
      desktopEventMatchesWorkspace(event, project.path)
        ? {
            ...project,
            threads: upsertThread(project.threads),
          }
        : project,
    );
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) {
      return { ...current, projects };
    }
    return {
      ...current,
      threads: upsertThread(current.threads),
      projects,
      settings:
        event.thread.id === current.activeThreadId
          ? {
              ...current.settings,
              permissionMode: event.thread.permissionMode,
              collaborationMode: event.thread.collaborationMode,
              model: event.thread.model,
              thinkingLevel: event.thread.thinkingLevel,
            }
          : current.settings,
    };
  }
  if (event.type === "subagent-run-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
    if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
    const subagentRuns = upsertSortedDesktopEventItem(
      current.subagentRuns,
      event.run,
      (run) => run.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );
    return subagentRuns === current.subagentRuns ? current : { ...current, subagentRuns };
  }
  if (event.type === "subagent-run-event-created") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
    if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
    const subagentRuns = upsertSortedDesktopEventItem(
      current.subagentRuns,
      event.run,
      (run) => run.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );
    const subagentRunEvents = upsertSortedDesktopEventItem(
      current.subagentRunEvents,
      event.event,
      (candidate) => `${candidate.runId}:${candidate.sequence}`,
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence,
    );
    return subagentRuns === current.subagentRuns && subagentRunEvents === current.subagentRunEvents
      ? current
      : { ...current, subagentRuns, subagentRunEvents };
  }
  if (event.type === "subagent-mailbox-event-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
    if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
    const subagentRuns = upsertSortedDesktopEventItem(
      current.subagentRuns,
      event.run,
      (run) => run.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );
    const subagentMailboxEvents = upsertSortedDesktopEventItem(
      current.subagentMailboxEvents,
      event.mailboxEvent,
      (mailboxEvent) => mailboxEvent.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
    return subagentRuns === current.subagentRuns && subagentMailboxEvents === current.subagentMailboxEvents
      ? current
      : { ...current, subagentRuns, subagentMailboxEvents };
  }
  if (event.type === "subagent-tool-scope-snapshot-recorded") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
    if (event.run.parentThreadId !== current.activeThreadId && event.run.childThreadId !== current.activeThreadId) return current;
    const subagentRuns = upsertSortedDesktopEventItem(
      current.subagentRuns,
      event.run,
      (run) => run.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );
    const subagentToolScopeSnapshots = upsertSortedDesktopEventItem(
      current.subagentToolScopeSnapshots,
      event.snapshot,
      (snapshot) => `${snapshot.runId}:${snapshot.sequence}`,
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence,
    );
    return subagentRuns === current.subagentRuns && subagentToolScopeSnapshots === current.subagentToolScopeSnapshots
      ? current
      : { ...current, subagentRuns, subagentToolScopeSnapshots };
  }
  if (event.type === "subagent-wait-barrier-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
    const activeRunIds = new Set(current.subagentRuns.map((run) => run.id));
    if (event.barrier.parentThreadId !== current.activeThreadId && !event.barrier.childRunIds.some((runId) => activeRunIds.has(runId))) {
      return current;
    }
    const subagentWaitBarriers = upsertSortedDesktopEventItem(
      current.subagentWaitBarriers,
      event.barrier,
      (barrier) => barrier.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );
    return subagentWaitBarriers === current.subagentWaitBarriers ? current : { ...current, subagentWaitBarriers };
  }
  if (event.type === "subagent-parent-mailbox-event-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
    const activeParentRunIds = new Set(current.subagentRuns.map((run) => run.parentRunId));
    if (event.mailboxEvent.parentThreadId !== current.activeThreadId && !activeParentRunIds.has(event.mailboxEvent.parentRunId)) return current;
    const subagentParentMailboxEvents = upsertSortedDesktopEventItem(
      current.subagentParentMailboxEvents,
      event.mailboxEvent,
      (mailboxEvent) => mailboxEvent.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
    return subagentParentMailboxEvents === current.subagentParentMailboxEvents
      ? current
      : { ...current, subagentParentMailboxEvents };
  }
  if (event.type === "callable-workflow-task-updated") {
    if (!desktopEventMatchesWorkspace(event, current.workspace.path)) return current;
    if (!isAmbientSubagentsEnabled(current.featureFlagSnapshot)) return current;
    if (event.task.parentThreadId !== current.activeThreadId) return current;
    const callableWorkflowTasks = upsertSortedDesktopEventItem(
      current.callableWorkflowTasks,
      event.task,
      (task) => task.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
    return callableWorkflowTasks === current.callableWorkflowTasks ? current : { ...current, callableWorkflowTasks };
  }
  return current;
}
