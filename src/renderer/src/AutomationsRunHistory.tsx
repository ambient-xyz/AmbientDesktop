import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import type {
  OrchestrationAutoDispatchStatus,
  OrchestrationBoard,
  OrchestrationPrepareResult,
  OrchestrationRun,
  OrchestrationTask,
} from "../../shared/types";
import { projectBoardTaskActionEvidenceFromProof } from "./projectBoardUiModel";
import { formatTaskState, formatTimelineTime } from "./RightPanel";

export function formatAutoDispatchStartedRun(run: OrchestrationAutoDispatchStatus["lastStartedRuns"][number]): string {
  const rank = run.dispatchKind === "restart_interrupted_resume" ? "Continued" : run.dispatchRank !== undefined ? `#${run.dispatchRank}` : "Started";
  const priority = run.priority !== undefined ? `P${run.priority}` : "no priority";
  return `${rank} ${run.identifier} (${priority}) ${run.title}`;
}

export function formatDelay(delayMs: number): string {
  if (delayMs < 1000) return `${delayMs} ms`;
  const seconds = delayMs / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
}

export function AutoDispatchStatusView({
  status,
  workflowReadiness,
}: {
  status?: OrchestrationAutoDispatchStatus;
  workflowReadiness?: OrchestrationBoard["workflowReadiness"];
}) {
  if (!status) return null;
  const workflowProblem =
    workflowReadiness?.status === "missing"
      ? `WORKFLOW.md is missing, so ready Local Tasks cannot be prepared yet: ${workflowReadiness.path}`
      : workflowReadiness?.status === "invalid"
        ? `WORKFLOW.md is invalid, so ready Local Tasks cannot be prepared yet: ${workflowReadiness.message ?? workflowReadiness.path}`
        : workflowReadiness?.status === "ready" && workflowReadiness.autoDispatch === false
          ? "WORKFLOW.md is valid, but workflow auto-dispatch is disabled. Prepared runs will wait for a manual start."
          : undefined;
  return (
    <div className={`auto-dispatch-status ${status.enabled ? "enabled" : ""}`}>
      <strong>{status.enabled ? "Auto-dispatch on" : "Auto-dispatch off"}</strong>
      <span>
        {status.enabled
          ? `Checks ready local tasks${status.pollIntervalMs ? ` every ${formatDelay(status.pollIntervalMs)}` : " automatically"} and starts eligible runs.`
          : "Paused. Prepared runs stay queued until you start them or turn auto-dispatch back on."}
      </span>
      {status.lastStartedRuns.length > 0 ? (
        <code>{status.lastStartedRuns.map(formatAutoDispatchStartedRun).join("\n")}</code>
      ) : (
        status.lastStartedRunIds.length > 0 && <code>Started {status.lastStartedRunIds.length} run(s)</code>
      )}
      {workflowProblem && <p>{workflowProblem}</p>}
      {status.lastError && <p>{status.lastError}</p>}
    </div>
  );
}

export function AutoDispatchToggle({
  status,
  busy,
  tooltip,
  onChange,
}: {
  status?: OrchestrationAutoDispatchStatus;
  busy: boolean;
  tooltip: string;
  onChange: (enabled: boolean) => void | Promise<void>;
}) {
  return (
    <label
      className={`auto-dispatch-toggle ${status?.enabled ? "enabled" : ""} ${busy || status?.inFlight ? "busy" : ""}`}
      title={tooltip}
    >
      <input
        type="checkbox"
        checked={Boolean(status?.enabled)}
        disabled={busy || status?.inFlight}
        onChange={(event) => void onChange(event.currentTarget.checked)}
      />
      <span className="auto-dispatch-toggle-track" aria-hidden="true">
        <span />
      </span>
      <span>{busy ? "Updating" : status?.inFlight ? "Checking" : "Auto-dispatch"}</span>
    </label>
  );
}

export function PrepareResultView({ result }: { result?: OrchestrationPrepareResult }) {
  if (!result) return null;
  return (
    <div className="prepare-result">
      <div>
        <strong>{result.prepared.length} prepared</strong>
        <span>{result.skipped.length} skipped</span>
      </div>
      {result.workflowPath && <code>{result.workflowPath}</code>}
      {result.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      {result.prepared.map((item) => (
        <section key={item.taskId}>
          <strong>{item.identifier}</strong>
          <span>{item.strategy}{item.createdNow ? " created" : " reused"}</span>
          <code>{item.workspacePath}</code>
          {item.hooks.map((hook) => (
            <code key={`${item.taskId}-${hook.hook}`}>
              {hook.hook}: {hook.ok ? "ok" : "failed"} {hook.durationMs}ms
              {hook.stdout ? `\n${hook.stdout}` : ""}
              {hook.stderr ? `\n${hook.stderr}` : ""}
            </code>
          ))}
        </section>
      ))}
    </div>
  );
}

export function LocalTaskRunList({
  runs,
  limit = 6,
  taskById,
  startingRunId,
  cancelingRunId,
  onOpenRunThread,
  onRevealWorkspace,
  onStartRun,
  onCancelRun,
  renderProofOfWorkPreview,
}: {
  runs: OrchestrationRun[];
  limit?: number;
  taskById: Map<string, OrchestrationTask>;
  startingRunId?: string;
  cancelingRunId?: string;
  onOpenRunThread: (threadId: string) => void | Promise<void>;
  onRevealWorkspace: (workspacePath: string) => void | Promise<void>;
  onStartRun: (runId: string) => void | Promise<void>;
  onCancelRun: (runId: string) => void | Promise<void>;
  renderProofOfWorkPreview?: (run: OrchestrationRun) => ReactNode;
}) {
  if (!runs.length) return <p className="panel-note">No local task runs recorded yet.</p>;
  return (
    <div className="run-dashboard flush">
      {runs.slice(0, limit).map((run) => {
        const task = taskById.get(run.taskId);
        return (
          <div className="run-card" key={run.id}>
            <div className="run-card-header">
              <span className="run-row-title">
                {run.status === "running" && <LoaderCircle size={12} className="spin" />}
                {task?.identifier ?? run.taskId}
              </span>
              <strong className={`run-state ${run.status}`}>{formatOrchestrationRunStatus(run)}</strong>
            </div>
            <code className="run-workspace-path">{run.workspacePath}</code>
            <RunTimeline run={run} />
            {renderProofOfWorkPreview?.(run)}
            <div className="run-actions">
              {run.threadId && (
                <button type="button" className="panel-button mini" onClick={() => void onOpenRunThread(run.threadId!)}>
                  Open run chat
                </button>
              )}
              <button type="button" className="panel-button mini" onClick={() => void onRevealWorkspace(run.workspacePath)}>
                Reveal workspace
              </button>
              {(run.status === "prepared" || run.status === "failed" || run.status === "canceled" || run.status === "stalled") && (
                <button type="button" className="panel-button mini" disabled={startingRunId === run.id} onClick={() => void onStartRun(run.id)}>
                  {startingRunId === run.id ? "Starting" : orchestrationRunActionLabel(run)}
                </button>
              )}
              {run.status === "running" && (
                <button type="button" className="panel-button mini" disabled={cancelingRunId === run.id} onClick={() => void onCancelRun(run.id)}>
                  {cancelingRunId === run.id ? "Canceling" : "Cancel"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RunTimeline({ run }: { run: OrchestrationRun }) {
  const entries = orchestrationTimelineEntries(run);
  return (
    <div className="run-timeline" aria-label="Run timeline">
      {entries.map((entry) => (
        <div className={`run-timeline-entry ${entry.state}`} key={`${entry.label}-${entry.time ?? entry.detail ?? ""}`}>
          <span />
          <div>
            <strong>{entry.label}</strong>
            {entry.time && <small>{formatTimelineTime(entry.time)}</small>}
            {entry.detail && <p>{entry.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function orchestrationRunActionLabel(run: OrchestrationRun): string {
  if (run.status === "prepared") return "Start";
  if (isRestartInterruptedLocalTaskRun(run)) return "Continue run";
  if (run.status === "stalled") return "Recover";
  return "Retry";
}

export function formatOrchestrationRunStatus(run: OrchestrationRun): string {
  if (isRestartInterruptedLocalTaskRun(run)) return "Interrupted";
  return formatTaskState(run.status);
}

export function isRestartInterruptedLocalTaskRun(run: Pick<OrchestrationRun, "status" | "error" | "proofOfWork">): boolean {
  if (run.status !== "stalled") return false;
  if (run.error && /ambient desktop restarted before this local task run finished/i.test(run.error)) return true;
  const recovery = run.proofOfWork?.recovery;
  return Boolean(
    run.proofOfWork?.resumeAvailable === true &&
      recovery &&
      typeof recovery === "object" &&
      !Array.isArray(recovery) &&
      ((recovery as Record<string, unknown>).type === "desktop-restart" ||
        /ambient desktop restarted before this local task run finished/i.test(String((recovery as Record<string, unknown>).reason ?? ""))),
  );
}

export function orchestrationTimelineEntries(run: OrchestrationRun): Array<{
  label: string;
  state: "done" | "running" | "error" | "pending";
  time?: string;
  detail?: string;
}> {
  const entries: Array<{
    label: string;
    state: "done" | "running" | "error" | "pending";
    time?: string;
    detail?: string;
  }> = [
    {
      label: run.status === "prepared" ? "Prepared workspace" : "Run created",
      state: "done",
      time: run.startedAt,
      detail: `Attempt ${run.attemptNumber + 1}`,
    },
  ];

  if (run.threadId) {
    entries.push({ label: "Chat linked", state: "done", detail: run.threadId });
  }

  const taskActions = projectBoardTaskActionEvidenceFromProof(run.proofOfWork).slice(-8);
  taskActions.forEach((action, index) => {
    const isLatestRunningHeartbeat = run.status === "running" && index === taskActions.length - 1 && action.action === "task_heartbeat";
    entries.push({
      label: action.label,
      state: action.tone === "danger" ? "error" : isLatestRunningHeartbeat ? "running" : "done",
      time: action.createdAt,
      detail: action.summary,
    });
  });

  if (run.lastEventAt && run.lastEventAt !== run.startedAt && !run.finishedAt) {
    entries.push({
      label: "Last activity",
      state: run.status === "running" ? "running" : "done",
      time: run.lastEventAt,
      detail: run.status === "running" ? "Ambient is still working" : undefined,
    });
  }

  if (run.finishedAt) {
    entries.push({
      label: terminalRunLabel(run.status),
      state: run.status === "completed" ? "done" : "error",
      time: run.finishedAt,
      detail: formatRunDuration(run.startedAt, run.finishedAt),
    });
  } else if (run.status === "running") {
    entries.push({
      label: "Running",
      state: "running",
      time: run.lastEventAt ?? run.startedAt,
      detail: formatRunDuration(run.startedAt),
    });
  } else if (isRestartInterruptedLocalTaskRun(run)) {
    entries.push({
      label: "Interrupted",
      state: "error",
      detail: "Resume available. Continue this run to reuse the existing workspace and chat.",
    });
  } else if (run.status === "stalled") {
    entries.push({ label: "Needs recovery", state: "error", detail: run.error });
  } else if (run.status === "prepared") {
    entries.push({ label: "Awaiting start", state: "pending" });
  }

  if (run.error && run.status !== "stalled") {
    entries.push({ label: "Error", state: "error", detail: run.error });
  }

  return entries;
}

export function terminalRunLabel(status: string): string {
  if (status === "completed") return "Completed";
  if (status === "canceled") return "Canceled";
  if (status === "stalled") return "Stalled";
  if (status === "failed") return "Failed";
  return formatTaskState(status);
}

export function formatRunDuration(start: string, end = new Date().toISOString()): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "";
  return formatDelay(endMs - startMs);
}
