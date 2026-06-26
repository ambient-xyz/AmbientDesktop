import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { projectBoardMetadataNumber, projectBoardMetadataObject } from "./projectBoardExecutionUiModel";
import {
  projectBoardDurationLabel,
  projectBoardProofText,
  projectBoardReadableState,
  projectBoardRunIsActive,
  truncateProjectBoardLedgerText,
} from "./projectBoardProofEvidenceUiModel";

export type ProjectBoardLiveSessionTone = "neutral" | "ready" | "running" | "review" | "blocked" | "done" | "warning";

export type ProjectBoardLiveSessionActivityKind = "state" | "thinking" | "tool" | "heartbeat" | "error";

export interface ProjectBoardLiveSessionActivityLine {
  id: string;
  text: string;
  kind: ProjectBoardLiveSessionActivityKind;
  timestamp: number;
}

export interface ProjectBoardLiveSessionPreviewMetric {
  label: string;
  value: string;
  tone: ProjectBoardLiveSessionTone;
  title?: string;
}

export interface ProjectBoardLiveSessionPreviewActivity {
  id: string;
  label: string;
  text: string;
  kind: ProjectBoardLiveSessionActivityKind;
  timestamp?: number;
}

export interface ProjectBoardLiveSessionPreviewAction {
  label: string;
  busyLabel: string;
  title: string;
  disabled: boolean;
  busyKey: string;
  runId?: string;
  threadId?: string;
  workspacePath?: string;
}

export interface ProjectBoardLiveSessionPreviewModel {
  visible: boolean;
  tone: ProjectBoardLiveSessionTone;
  statusLabel: string;
  headline: string;
  detail: string;
  sessionLabel: string;
  latestAssistantText?: string;
  metrics: ProjectBoardLiveSessionPreviewMetric[];
  activity: ProjectBoardLiveSessionPreviewActivity[];
  threadId?: string;
  runId?: string;
  workspacePath?: string;
  active: boolean;
  terminal: boolean;
  copyAction: ProjectBoardLiveSessionPreviewAction;
  openThreadAction?: ProjectBoardLiveSessionPreviewAction;
  workspaceAction?: ProjectBoardLiveSessionPreviewAction;
}

export function projectBoardLiveSessionPreviewModel(input: {
  card: ProjectBoardCard;
  task?: OrchestrationTask;
  latestRun?: OrchestrationRun;
  threadStatus?: RunStatus;
  activityLines?: ProjectBoardLiveSessionActivityLine[];
  now?: number;
}): ProjectBoardLiveSessionPreviewModel {
  const latestRun = input.latestRun;
  const threadId = latestRun?.threadId ?? input.card.executionThreadId;
  const runId = latestRun?.id;
  const workspacePath = latestRun?.workspacePath ?? input.task?.workspacePath;
  const activityLines = input.activityLines ?? [];
  const visible = Boolean(threadId || latestRun || activityLines.length > 0);
  const runActive = Boolean(latestRun && projectBoardRunIsActive(latestRun));
  const threadActive = projectBoardThreadRunStatusIsActive(input.threadStatus);
  const terminal = Boolean(latestRun && projectBoardRunCanCopySessionToThread(latestRun));
  const active = !terminal && (runActive || threadActive || input.card.status === "in_progress" || input.task?.state === "in_progress");
  const statusLabel = projectBoardLiveSessionStatusLabel({
    run: latestRun,
    threadStatus: input.threadStatus,
    task: input.task,
    active,
    terminal,
  });
  const tone: ProjectBoardLiveSessionTone = active
    ? "running"
    : terminal && latestRun?.status === "completed"
      ? "done"
      : terminal
        ? "blocked"
        : latestRun?.status === "prepared"
          ? "ready"
          : "neutral";
  const sessionLabel = threadId ? `Session ${projectBoardShortId(threadId)}` : "No session thread";
  const proof = latestRun?.proofOfWork;
  const progress = projectBoardMetadataObject(proof, "progress");
  const latestAssistantText =
    projectBoardProofText(proof?.lastAssistantText) ??
    projectBoardProofText(proof?.summary) ??
    projectBoardProofText(progress?.lastAssistantText);
  const elapsedMs =
    projectBoardMetadataNumber(proof, "elapsedMs") ??
    projectBoardMetadataNumber(progress, "elapsedMs") ??
    projectBoardRunElapsedMs(latestRun, input.now);
  const toolCount =
    projectBoardMetadataNumber(proof, "toolMessageCount") ??
    projectBoardMetadataNumber(progress, "toolMessageCount") ??
    projectBoardMetadataNumber(proof, "completedToolMessageCount") ??
    projectBoardMetadataNumber(proof, "runningToolMessageCount");
  const messageCount =
    projectBoardMetadataNumber(proof, "messageCount") ??
    projectBoardMetadataNumber(progress, "messageCount") ??
    projectBoardMetadataNumber(proof, "assistantMessageCount");
  const eventCount =
    activityLines.length || projectBoardMetadataNumber(progress, "eventCount") || projectBoardMetadataNumber(proof, "eventCount") || 0;
  const activity = projectBoardLiveSessionActivity(activityLines, latestRun);
  const copyDisabledReason = !runId
    ? "A recorded run is required before copying this Pi session into a local thread."
    : !threadId
      ? "This run does not have a Pi session thread to copy."
      : !terminal
        ? "Copy is available after the Pi session is paused, stopped, failed, stalled, canceled, or completed."
        : undefined;
  const openThreadDisabledReason = threadId ? undefined : "This card does not have a session thread yet.";
  const workspaceDisabledReason = workspacePath ? undefined : "This card does not have a run workspace yet.";

  return {
    visible,
    tone,
    statusLabel,
    headline: active
      ? "Pi is working on this card"
      : terminal
        ? "Pi session can be copied into a local thread"
        : latestRun?.status === "prepared"
          ? "Pi session is ready to start"
          : "Pi session context",
    detail: projectBoardLiveSessionDetail(input.card, latestRun, input.task, active, terminal),
    sessionLabel,
    latestAssistantText: latestAssistantText ? truncateProjectBoardLedgerText(latestAssistantText, 420) : undefined,
    metrics: [
      {
        label: "Events",
        value: String(eventCount),
        tone: eventCount > 0 ? "running" : "neutral",
        title: "Renderer-observed activity events for this session.",
      },
      {
        label: "Tool calls",
        value: toolCount === undefined ? "0" : String(toolCount),
        tone: toolCount && toolCount > 0 ? "ready" : "neutral",
      },
      {
        label: "Messages",
        value: messageCount === undefined ? "0" : String(messageCount),
        tone: messageCount && messageCount > 0 ? "ready" : "neutral",
      },
      ...(elapsedMs !== undefined ? [{ label: "Elapsed", value: projectBoardDurationLabel(elapsedMs), tone: "neutral" as const }] : []),
    ],
    activity,
    threadId,
    runId,
    workspacePath,
    active,
    terminal,
    copyAction: {
      label: "Copy Session to Thread",
      busyLabel: "Copying",
      title:
        copyDisabledReason ??
        "Copy this completed or stopped Pi session transcript into a new local project thread for follow-up discussion.",
      disabled: Boolean(copyDisabledReason),
      busyKey: runId ? `copy-session:${runId}` : "copy-session",
      runId,
      threadId,
    },
    openThreadAction: threadId
      ? {
          label: active ? "Open live thread" : "Open source thread",
          busyLabel: "Opening",
          title: openThreadDisabledReason ?? "Open the underlying Pi session thread.",
          disabled: Boolean(openThreadDisabledReason),
          busyKey: `thread:${threadId}`,
          threadId,
        }
      : undefined,
    workspaceAction: workspacePath
      ? {
          label: "Reveal workspace",
          busyLabel: "Revealing",
          title: workspaceDisabledReason ?? "Reveal the worktree or workspace used by this Local Task run.",
          disabled: Boolean(workspaceDisabledReason),
          busyKey: `reveal:${workspacePath}`,
          workspacePath,
        }
      : undefined,
  };
}

function projectBoardThreadRunStatusIsActive(status?: RunStatus): boolean {
  return status === "starting" || status === "streaming" || status === "tool" || status === "retrying" || status === "compacting";
}

function projectBoardRunCanCopySessionToThread(run: OrchestrationRun): boolean {
  return ["completed", "failed", "canceled", "stalled"].includes(run.status);
}

function projectBoardLiveSessionStatusLabel(input: {
  run?: OrchestrationRun;
  threadStatus?: RunStatus;
  task?: OrchestrationTask;
  active: boolean;
  terminal: boolean;
}): string {
  if (input.threadStatus === "tool") return "Tool call running";
  if (input.threadStatus === "streaming") return "Streaming";
  if (input.threadStatus === "starting") return "Starting";
  if (input.threadStatus === "retrying") return "Retrying";
  if (input.threadStatus === "compacting") return "Compacting";
  if (input.run?.status === "completed") return "Completed";
  if (input.run?.status === "failed") return "Stopped";
  if (input.run?.status === "canceled") return "Canceled";
  if (input.run?.status === "stalled") return "Stalled";
  if (input.run?.status === "prepared") return "Prepared";
  if (input.active) return "Running";
  if (input.terminal) return "Stopped";
  if (input.task?.state === "needs_review") return "Needs review";
  return input.run ? projectBoardReadableState(input.run.status) : "Session";
}

function projectBoardLiveSessionDetail(
  card: ProjectBoardCard,
  run: OrchestrationRun | undefined,
  task: OrchestrationTask | undefined,
  active: boolean,
  terminal: boolean,
): string {
  if (active) return "Live Pi events are scoped to the selected board card and update without leaving the board.";
  if (terminal)
    return "This session is no longer mutating board state; copy it into a local thread when you want a durable follow-up surface.";
  if (run?.status === "prepared") return "The Local Task run is prepared. Start it to watch Pi activity here.";
  if (task) return `${task.identifier} is linked to this card; Pi activity appears here once a run starts.`;
  return `${card.title} is not linked to an active Pi run yet.`;
}

function projectBoardLiveSessionActivity(
  activityLines: ProjectBoardLiveSessionActivityLine[],
  run: OrchestrationRun | undefined,
): ProjectBoardLiveSessionPreviewActivity[] {
  const live = activityLines.slice(-4).map((line) => ({
    id: line.id,
    label: projectBoardLiveSessionActivityLabel(line.kind),
    text: truncateProjectBoardLedgerText(line.text, 220),
    kind: line.kind,
    timestamp: line.timestamp,
  }));
  if (live.length > 0) return live;
  if (run?.error) {
    return [
      {
        id: `${run.id}:error`,
        label: "Run error",
        text: truncateProjectBoardLedgerText(run.error, 220),
        kind: "error",
      },
    ];
  }
  if (run) {
    return [
      {
        id: `${run.id}:status`,
        label: "Run status",
        text: `Run is ${projectBoardReadableState(run.status)}.`,
        kind: "state",
      },
    ];
  }
  return [];
}

function projectBoardLiveSessionActivityLabel(kind: ProjectBoardLiveSessionActivityKind): string {
  if (kind === "tool") return "Tool call";
  if (kind === "thinking") return "Thinking";
  if (kind === "heartbeat") return "Heartbeat";
  if (kind === "error") return "Error";
  return "Session event";
}

function projectBoardRunElapsedMs(run: OrchestrationRun | undefined, now = Date.now()): number | undefined {
  if (!run) return undefined;
  const started = Date.parse(run.startedAt);
  if (!Number.isFinite(started)) return undefined;
  const ended = run.finishedAt ? Date.parse(run.finishedAt) : now;
  if (!Number.isFinite(ended)) return undefined;
  return Math.max(0, ended - started);
}

function projectBoardShortId(id: string): string {
  return id.length > 10 ? id.slice(-10) : id;
}
