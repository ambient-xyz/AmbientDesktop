import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type {
  AutomationScheduleExceptionSummary,
  AutomationScheduleSummary,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowExplorationProgress,
  WorkflowExplorationTraceSummary,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
  WorkflowVersionSummary,
} from "../../shared/types";
import type { WorkflowArtifactPanelId } from "./workflowArtifactPanelUiModel";
import type { WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";

export type WorkflowRunDetailOpenOptions = {
  preserveBusy?: boolean;
  focusConsole?: boolean;
};

export type WorkflowDashboardFixtureInput = {
  dashboard: WorkflowDashboard;
  versions?: WorkflowVersionSummary[];
  revisions?: WorkflowRevisionSummary[];
  schedules?: AutomationScheduleSummary[];
  scheduleExceptions?: AutomationScheduleExceptionSummary[];
  detail?: WorkflowRunDetail;
};

export type WorkflowRunDetailPanelTarget = {
  workflowThreadId?: string;
  artifactPanel: WorkflowArtifactPanelId;
  runsPanel: WorkflowRunsPanelId;
};

export function workflowRunDetailPanelTarget({
  dashboard,
  runId,
  selectedWorkflowAgentThreadId,
}: {
  dashboard?: Pick<WorkflowDashboard, "runs" | "artifacts">;
  runId: string;
  selectedWorkflowAgentThreadId?: string;
}): WorkflowRunDetailPanelTarget {
  const runArtifactId = dashboard?.runs.find((run) => run.id === runId)?.artifactId;
  const runArtifact = runArtifactId ? dashboard?.artifacts.find((artifact) => artifact.id === runArtifactId) : undefined;
  return {
    workflowThreadId: runArtifact?.workflowThreadId ?? selectedWorkflowAgentThreadId,
    artifactPanel: "run_console",
    runsPanel: "runs-live",
  };
}

export function retainedWorkflowExplorationProgress(
  traces: Pick<WorkflowExplorationTraceSummary, "status" | "latestProgress">[],
): WorkflowExplorationProgress | undefined {
  return traces.find((trace) => trace.status === "running" || trace.status === "failed" || trace.status === "canceled")?.latestProgress;
}

export function workflowAgentThreadForArtifactFromFolders(
  folders: WorkflowAgentFolderSummary[],
  artifact?: Pick<WorkflowArtifactSummary, "workflowThreadId">,
): WorkflowAgentThreadSummary | undefined {
  if (!artifact?.workflowThreadId) return undefined;
  return folders.flatMap((folder) => folder.threads).find((thread) => thread.id === artifact.workflowThreadId);
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAutomationsWorkflowDashboardController({
  selectedWorkflowAgentThread,
  workflowRevision,
  workspacePath,
  onWorkflowBusyChanged,
  onWorkflowErrorChanged,
  onWorkflowAgentFoldersChanged,
  onSelectWorkflowAgentThread,
  onWorkflowExplorationProgressChanged,
  onWorkflowArtifactPanelChanged,
  onWorkflowRunsPanelChanged,
  onScheduleFixture,
}: {
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  workflowRevision: number;
  workspacePath: string;
  onWorkflowBusyChanged: (busy: string | undefined) => void;
  onWorkflowErrorChanged: (message: string | undefined) => void;
  onWorkflowAgentFoldersChanged: (folders: WorkflowAgentFolderSummary[]) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onWorkflowExplorationProgressChanged: (workflowThreadId: string, progress: WorkflowExplorationProgress) => void;
  onWorkflowArtifactPanelChanged: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
  onWorkflowRunsPanelChanged: (workflowThreadId: string | undefined, panel: WorkflowRunsPanelId) => void;
  onScheduleFixture: (fixture: Pick<WorkflowDashboardFixtureInput, "schedules" | "scheduleExceptions">) => void;
}) {
  const [workflowDashboard, setWorkflowDashboard] = useState<WorkflowDashboard | undefined>();
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowRunDetail | undefined>();
  const [workflowRevisions, setWorkflowRevisions] = useState<WorkflowRevisionSummary[]>([]);
  const [workflowVersions, setWorkflowVersions] = useState<WorkflowVersionSummary[]>([]);
  const [workflowExplorationTracesByThreadId, setWorkflowExplorationTracesByThreadId] = useState<Record<string, WorkflowExplorationTraceSummary[]>>({});
  const workflowDetailRunIdRef = useRef<string | undefined>(undefined);
  const workflowRunConsoleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (event.type !== "e2e-workflow-dashboard-fixture") return;
      applyWorkflowDashboardFixture(event);
    });
  }, []);

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (event.type !== "workflow-run-started") return;
      if (event.workspacePath && event.workspacePath !== workspacePath) return;
      workflowDetailRunIdRef.current = event.runId;
      void openWorkflowRunDetail(event.runId, { preserveBusy: true });
    });
  }, [workspacePath]);

  useEffect(() => {
    void loadWorkflowRevisions(selectedWorkflowAgentThread?.id);
  }, [selectedWorkflowAgentThread?.id, workflowRevision]);

  useEffect(() => {
    void loadWorkflowVersions(selectedWorkflowAgentThread?.id);
  }, [selectedWorkflowAgentThread?.id, workflowRevision]);

  useEffect(() => {
    void loadWorkflowExplorationTraces(selectedWorkflowAgentThread?.id);
  }, [selectedWorkflowAgentThread?.id, workflowRevision]);

  useEffect(() => {
    if (!selectedWorkflowAgentThread?.activeArtifactId) return;
    void loadWorkflowDashboard();
  }, [selectedWorkflowAgentThread?.activeArtifactId]);

  function applyWorkflowDashboardFixture(fixture: WorkflowDashboardFixtureInput) {
    setWorkflowDashboard(fixture.dashboard);
    if (fixture.versions) setWorkflowVersions(fixture.versions);
    if (fixture.revisions) setWorkflowRevisions(fixture.revisions);
    onScheduleFixture({ schedules: fixture.schedules, scheduleExceptions: fixture.scheduleExceptions });
    if (fixture.detail) {
      workflowDetailRunIdRef.current = fixture.detail.run.id;
      setWorkflowDetail(fixture.detail);
    } else {
      workflowDetailRunIdRef.current = undefined;
      setWorkflowDetail(undefined);
    }
  }

  async function loadWorkflowDashboard() {
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.listWorkflowDashboard();
      setWorkflowDashboard(dashboard);
      const detailRunId = workflowDetailRunIdRef.current;
      if (!detailRunId) return;
      if (!dashboard.runs.some((run) => run.id === detailRunId)) {
        workflowDetailRunIdRef.current = undefined;
        setWorkflowDetail(undefined);
        return;
      }
      const detail = await window.ambientDesktop.getWorkflowRunDetail({ runId: detailRunId });
      if (workflowDetailRunIdRef.current === detailRunId) setWorkflowDetail(detail);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    }
  }

  async function loadWorkflowRevisions(workflowThreadId?: string) {
    if (!workflowThreadId) {
      setWorkflowRevisions([]);
      return;
    }
    try {
      setWorkflowRevisions(await window.ambientDesktop.listWorkflowRevisions({ workflowThreadId }));
    } catch {
      setWorkflowRevisions([]);
    }
  }

  async function loadWorkflowVersions(workflowThreadId?: string) {
    if (!workflowThreadId) {
      setWorkflowVersions([]);
      return;
    }
    try {
      setWorkflowVersions(await window.ambientDesktop.listWorkflowVersions({ workflowThreadId }));
    } catch {
      setWorkflowVersions([]);
    }
  }

  async function loadWorkflowExplorationTraces(workflowThreadId?: string) {
    if (!workflowThreadId) return;
    try {
      const traces = await window.ambientDesktop.listWorkflowExplorationTraces({ workflowThreadId });
      setWorkflowExplorationTracesByThreadId((current) => ({ ...current, [workflowThreadId]: traces }));
      const retainedProgress = retainedWorkflowExplorationProgress(traces);
      if (retainedProgress) {
        onWorkflowExplorationProgressChanged(workflowThreadId, retainedProgress);
      }
    } catch {
      setWorkflowExplorationTracesByThreadId((current) => ({ ...current, [workflowThreadId]: [] }));
    }
  }

  async function selectWorkflowAgentThreadForArtifact(artifact?: WorkflowArtifactSummary) {
    if (!artifact?.workflowThreadId) return;
    const folders = await window.ambientDesktop.listWorkflowAgentFolders();
    onWorkflowAgentFoldersChanged(folders);
    const thread = workflowAgentThreadForArtifactFromFolders(folders, artifact);
    if (thread) onSelectWorkflowAgentThread(thread);
  }

  async function openWorkflowRunDetail(runId: string, options: WorkflowRunDetailOpenOptions = {}) {
    workflowDetailRunIdRef.current = runId;
    if (!options.preserveBusy) onWorkflowBusyChanged(runId);
    onWorkflowErrorChanged(undefined);
    if (options.focusConsole) {
      const target = workflowRunDetailPanelTarget({
        dashboard: workflowDashboard,
        runId,
        selectedWorkflowAgentThreadId: selectedWorkflowAgentThread?.id,
      });
      onWorkflowArtifactPanelChanged(target.workflowThreadId, target.artifactPanel);
      onWorkflowRunsPanelChanged(target.workflowThreadId, target.runsPanel);
    }
    try {
      const detail = await window.ambientDesktop.getWorkflowRunDetail({ runId });
      if (workflowDetailRunIdRef.current === runId) setWorkflowDetail(detail);
      if (options.focusConsole) requestAnimationFrame(() => workflowRunConsoleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      if (!options.preserveBusy) onWorkflowBusyChanged(undefined);
    }
  }

  return {
    workflowDashboard,
    setWorkflowDashboard: setWorkflowDashboard as Dispatch<SetStateAction<WorkflowDashboard | undefined>>,
    workflowDetail,
    setWorkflowDetail: setWorkflowDetail as Dispatch<SetStateAction<WorkflowRunDetail | undefined>>,
    workflowRevisions,
    setWorkflowRevisions: setWorkflowRevisions as Dispatch<SetStateAction<WorkflowRevisionSummary[]>>,
    workflowVersions,
    setWorkflowVersions: setWorkflowVersions as Dispatch<SetStateAction<WorkflowVersionSummary[]>>,
    workflowExplorationTracesByThreadId,
    setWorkflowExplorationTracesByThreadId: setWorkflowExplorationTracesByThreadId as Dispatch<SetStateAction<Record<string, WorkflowExplorationTraceSummary[]>>>,
    workflowDetailRunIdRef: workflowDetailRunIdRef as MutableRefObject<string | undefined>,
    workflowRunConsoleRef: workflowRunConsoleRef as MutableRefObject<HTMLElement | null>,
    loadWorkflowDashboard,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowExplorationTraces,
    selectWorkflowAgentThreadForArtifact,
    openWorkflowRunDetail,
  };
}
