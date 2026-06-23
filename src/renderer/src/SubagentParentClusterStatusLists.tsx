import { ExternalLink, Play, Square, X } from "lucide-react";

import type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterMailboxActionModel,
  SubagentParentClusterModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterUiModel";

export function SubagentParentClusterBarrierList({ barriers }: { barriers: SubagentParentClusterModel["barriers"] }) {
  if (barriers.length === 0) return null;
  return (
    <div className="subagent-parent-cluster-barriers" aria-label="Sub-agent wait barriers">
      {barriers.map((barrier) => (
        <div key={barrier.id}>
          <span className={`subagent-parent-cluster-barrier-status tone-${barrier.statusTone}`}>{barrier.status}</span>
          <span>{barrier.dependencyLabel}</span>
          <span>{barrier.childCountLabel}</span>
          {barrier.blockingChildren.map((child) => (
            <span key={child.runId} className={`subagent-parent-cluster-barrier-child tone-${child.statusTone}`} title={child.detail}>
              {child.label}
            </span>
          ))}
          <span>{barrier.failurePolicyLabel}</span>
          {barrier.timeoutLabel && <span>{barrier.timeoutLabel}</span>}
          {barrier.decisionLabel && <span title={barrier.decisionSummary}>{barrier.decisionLabel}</span>}
          {barrier.effectRows?.map((effect) => (
            <span key={effect.key} className={`subagent-parent-cluster-lifecycle-effect tone-${effect.statusTone}`} title={effect.detail}>
              {effect.label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SubagentParentClusterWorkflowTaskList({
  tasks,
  pauseWorkflowTaskBusyId,
  resumeWorkflowTaskBusyId,
  cancelWorkflowTaskBusyId,
  onOpenWorkflowThread,
  onPauseWorkflowTask,
  onResumeWorkflowTask,
  onCancelWorkflowTask,
}: {
  tasks: SubagentParentClusterModel["workflowTasks"];
  pauseWorkflowTaskBusyId?: string;
  resumeWorkflowTaskBusyId?: string;
  cancelWorkflowTaskBusyId?: string;
  onOpenWorkflowThread: (task: SubagentParentClusterWorkflowTaskModel) => void;
  onPauseWorkflowTask: (task: SubagentParentClusterWorkflowTaskModel) => void;
  onResumeWorkflowTask: (task: SubagentParentClusterWorkflowTaskModel) => void;
  onCancelWorkflowTask: (task: SubagentParentClusterWorkflowTaskModel) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="subagent-parent-cluster-workflows" aria-label="Callable workflow background tasks">
      {tasks.map((task) => (
        <div key={task.id}>
          <span className={`subagent-parent-cluster-workflow-status tone-${task.statusTone}`}>{task.status}</span>
          <span title={task.title}>{task.title}</span>
          <span>{task.modeLabel}</span>
          <span>{task.progressLabel}</span>
          <span>{task.sourceLabel}</span>
          {task.workflowThreadLabel && <span title={task.workflowThreadLabel}>{task.workflowThreadLabel}</span>}
          {task.capabilityLabels.length > 0 && <span title={task.capabilityLabels.join(" / ")}>{task.capabilityLabels.join(" / ")}</span>}
          {task.idLabels?.map((label) => (
            <span key={`id-${label}`} className="subagent-parent-cluster-workflow-id" title={`Workflow identity: ${label}`}>
              {label}
            </span>
          ))}
          {task.launchCardLabels?.map((label) => (
            <span key={`launch-card-${label}`} className="subagent-parent-cluster-workflow-launch-card" title={`Launch card: ${label}`}>
              {label}
            </span>
          ))}
          {task.provenanceLabels?.map((label) => (
            <span
              key={`provenance-${label}`}
              className="subagent-parent-cluster-workflow-provenance"
              title={`Workflow provenance: ${label}`}
            >
              {label}
            </span>
          ))}
          {task.mutationEvidenceLabels?.map((label) => (
            <span
              key={`mutation-evidence-${label}`}
              className="subagent-parent-cluster-workflow-mutation-evidence"
              title={`Mutating workflow evidence: ${label}`}
            >
              {label}
            </span>
          ))}
          {task.telemetryLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
          {task.parentBlocker && (
            <span
              className={`subagent-parent-cluster-workflow-blocker tone-${task.parentBlocker.statusTone}`}
              title={task.parentBlocker.detail}
            >
              {task.parentBlocker.label}
            </span>
          )}
          {task.childWait && (
            <span className={`subagent-parent-cluster-workflow-child-wait tone-${task.childWait.statusTone}`} title={task.childWait.detail}>
              {task.childWait.label}
            </span>
          )}
          {task.childWait?.childLabels.map((label) => (
            <span
              key={`child-wait-${label}`}
              className={`subagent-parent-cluster-workflow-child-wait-child tone-${task.childWait?.statusTone ?? "neutral"}`}
              title={`Workflow child wait: ${label}`}
            >
              {label}
            </span>
          ))}
          {task.detail && <span title={task.detail}>{task.detail}</span>}
          {task.canOpenWorkflowThread && (
            <button
              type="button"
              className="subagent-parent-cluster-workflow-action is-open"
              title={task.openWorkflowThreadTitle}
              aria-label={`Open workflow thread for ${task.title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenWorkflowThread(task);
              }}
            >
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          )}
          {task.canPause && (
            <button
              type="button"
              className="subagent-parent-cluster-workflow-action is-pause"
              disabled={pauseWorkflowTaskBusyId === task.id}
              title={pauseWorkflowTaskBusyId === task.id ? "Pausing workflow task" : task.pauseTitle}
              aria-label={`Pause workflow task ${task.title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPauseWorkflowTask(task);
              }}
            >
              <Square size={12} aria-hidden="true" />
            </button>
          )}
          {task.canResume && (
            <button
              type="button"
              className="subagent-parent-cluster-workflow-action is-resume"
              disabled={resumeWorkflowTaskBusyId === task.id}
              title={resumeWorkflowTaskBusyId === task.id ? "Resuming workflow task" : task.resumeTitle}
              aria-label={`Resume workflow task ${task.title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onResumeWorkflowTask(task);
              }}
            >
              <Play size={12} aria-hidden="true" />
            </button>
          )}
          {task.canCancel && (
            <button
              type="button"
              className="subagent-parent-cluster-workflow-action"
              disabled={cancelWorkflowTaskBusyId === task.id}
              title={cancelWorkflowTaskBusyId === task.id ? "Canceling workflow task" : task.cancelTitle}
              aria-label={`Cancel workflow task ${task.title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCancelWorkflowTask(task);
              }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function SubagentParentClusterMailboxActivityList({
  activities,
  approvalActionBusyId,
  barrierActionBusyId,
  onResolveApprovalAction,
  onResolveBarrierAction,
}: {
  activities: SubagentParentClusterModel["mailboxActivities"];
  approvalActionBusyId?: string;
  barrierActionBusyId?: string;
  onResolveApprovalAction: (action: SubagentParentClusterApprovalActionModel) => void;
  onResolveBarrierAction: (action: SubagentParentClusterMailboxActionModel) => void;
}) {
  if (activities.length === 0) return null;
  return (
    <div className="subagent-parent-cluster-mailbox" aria-label="Sub-agent mailbox activity">
      {activities.map((activity) => (
        <div key={activity.id}>
          <span className={`subagent-parent-cluster-mailbox-status tone-${activity.statusTone}`}>{activity.label}</span>
          {activity.sourceLabel && <span title={activity.sourceLabel}>{activity.sourceLabel}</span>}
          <span>{activity.summary}</span>
          {activity.approvalActions?.map((action) => {
            const busyKey = `${action.childRunId}:${action.approvalId}`;
            const isApprovalBusy = approvalActionBusyId === busyKey;
            return (
              <button
                key={`${activity.id}:${busyKey}:${action.decision}`}
                type="button"
                className={`subagent-parent-cluster-mailbox-action is-button ${action.decision === "denied" ? "is-danger" : "is-approve"}`}
                disabled={isApprovalBusy}
                title={isApprovalBusy ? "Resolving child approval" : action.title}
                aria-label={isApprovalBusy ? "Resolving child approval" : action.title}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onResolveApprovalAction(action);
                }}
              >
                {action.label}
              </button>
            );
          })}
          {activity.actions?.map((action) => {
            const busyKey = `${action.waitBarrierId}:${action.decision}`;
            const isBarrierBusy = barrierActionBusyId?.startsWith(`${action.waitBarrierId}:`) === true;
            return (
              <button
                key={`${activity.id}:${busyKey}`}
                type="button"
                className="subagent-parent-cluster-mailbox-action is-button"
                disabled={isBarrierBusy}
                title={isBarrierBusy ? "Resolving wait barrier" : action.title}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onResolveBarrierAction(action);
                }}
              >
                {action.label}
              </button>
            );
          })}
          {activity.actionLabels
            ?.filter(
              (label) =>
                !activity.actions?.some((action) => action.label === label) &&
                !activity.approvalActions?.some((action) => action.label === label),
            )
            .map((label) => (
              <span key={label} className="subagent-parent-cluster-mailbox-action">
                {label}
              </span>
            ))}
          {activity.effectRows?.map((effect) => (
            <span key={effect.key} className={`subagent-parent-cluster-lifecycle-effect tone-${effect.statusTone}`} title={effect.detail}>
              {effect.label}
            </span>
          ))}
          {activity.detail && <span title={activity.detail}>{activity.detail}</span>}
        </div>
      ))}
    </div>
  );
}
