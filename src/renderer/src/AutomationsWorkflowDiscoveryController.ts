import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { AutomationFolderSummary } from "../../shared/automationTypes";
import type {
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowRevisionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowArtifactPanelId } from "./workflowArtifactPanelUiModel";
import { createAutomationsWorkflowDiscoveryControllerActions } from "./AutomationsWorkflowDiscoveryControllerActions";
import {
  activeDraftWorkflowRevisionForThread,
  decodeWorkflowExplorationSkips,
  workflowExplorationSkipStorageKey,
  type WorkflowDiscoveryAnswers,
  type WorkflowDiscoveryOptimisticAnswers,
  type WorkflowDiscoveryRestartDrafts,
  type WorkflowExplorationBudgetsByThreadId,
  type WorkflowExplorationSkippedByThreadId,
  type WorkflowExplorationTracesByThreadId,
} from "./AutomationsWorkflowDiscoveryControllerModel";

export {
  activeDraftWorkflowRevisionForThread,
  decodeWorkflowExplorationSkips,
  latestWorkflowRunForArtifact,
  workflowDiscoveryAnswersAfterAnswered,
  workflowDiscoveryOptimisticAnswersWithoutQuestion,
  workflowDiscoveryRestartDraftsAfterRestart,
  workflowDiscoveryRestartRequest,
  workflowExplorationBudgetsAfterReset,
  workflowExplorationBudgetsAfterUpdate,
  workflowExplorationSkipStorageKey,
  workflowExplorationSkipsAfterRunStart,
  workflowExplorationSkipsAfterSkip,
  workflowExplorationTracesAfterRunResult,
} from "./AutomationsWorkflowDiscoveryControllerModel";

export type {
  WorkflowDiscoveryAnswers,
  WorkflowDiscoveryOptimisticAnswers,
  WorkflowDiscoveryRestartDrafts,
  WorkflowExplorationBudgetsByThreadId,
  WorkflowExplorationSkippedByThreadId,
  WorkflowExplorationTracesByThreadId,
} from "./AutomationsWorkflowDiscoveryControllerModel";

export function useAutomationsWorkflowDiscoveryController({
  activeProjectPath,
  selectedWorkflowAgentFolder,
  selectedWorkflowAgentThread,
  workflowAgentFolders,
  workflowRevisions,
  workflowBusy,
  onWorkflowBusyChanged,
  onWorkflowDashboardChanged,
  onWorkflowErrorChanged,
  onWorkflowCompileProgressReset,
  refreshAutomationFolders,
  loadWorkflowRevisions,
  loadWorkflowVersions,
  loadWorkflowExplorationTraces,
  onWorkflowAgentFoldersChanged,
  onSelectWorkflowAgentThread,
  onSelectWorkflowAgentThreadForArtifact,
  onOpenWorkflowRunDetail,
  onWorkflowExplorationTracesChanged,
  onWorkflowArtifactPanelChanged,
}: {
  activeProjectPath: string;
  selectedWorkflowAgentFolder?: WorkflowAgentFolderSummary;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowRevisions: WorkflowRevisionSummary[];
  workflowBusy?: string;
  onWorkflowBusyChanged: (busy: string | undefined) => void;
  onWorkflowDashboardChanged: (dashboard: WorkflowDashboard) => void;
  onWorkflowErrorChanged: (message: string | undefined) => void;
  onWorkflowCompileProgressReset: () => void;
  refreshAutomationFolders: () => Promise<{
    automationFolders: AutomationFolderSummary[];
    workflowAgentFolders: WorkflowAgentFolderSummary[];
  }>;
  loadWorkflowRevisions: (workflowThreadId?: string) => Promise<unknown>;
  loadWorkflowVersions: (workflowThreadId?: string) => Promise<unknown>;
  loadWorkflowExplorationTraces: (workflowThreadId?: string) => Promise<unknown>;
  onWorkflowAgentFoldersChanged: (folders: WorkflowAgentFolderSummary[]) => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onSelectWorkflowAgentThreadForArtifact: (artifact?: WorkflowArtifactSummary) => Promise<void>;
  onOpenWorkflowRunDetail: (runId: string) => Promise<void>;
  onWorkflowExplorationTracesChanged: Dispatch<SetStateAction<WorkflowExplorationTracesByThreadId>>;
  onWorkflowArtifactPanelChanged: (workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) => void;
}) {
  const [workflowCompileThreadId, setWorkflowCompileThreadId] = useState<string | undefined>();
  const [workflowDiscoveryBusy, setWorkflowDiscoveryBusy] = useState<string | undefined>();
  const [workflowDiscoveryAnswers, setWorkflowDiscoveryAnswers] = useState<WorkflowDiscoveryAnswers>({});
  const [optimisticWorkflowDiscoveryAnswers, setOptimisticWorkflowDiscoveryAnswers] = useState<WorkflowDiscoveryOptimisticAnswers>({});
  const [workflowRequest, setWorkflowRequest] = useState("");
  const [workflowRequestRestartDrafts, setWorkflowRequestRestartDrafts] = useState<WorkflowDiscoveryRestartDrafts>({});
  const [workflowExplorationBudgetsByThreadId, setWorkflowExplorationBudgetsByThreadId] = useState<WorkflowExplorationBudgetsByThreadId>(
    {},
  );
  const [workflowExplorationSkippedByThreadId, setWorkflowExplorationSkippedByThreadId] = useState<WorkflowExplorationSkippedByThreadId>(
    () => {
      if (typeof window === "undefined") return {};
      return decodeWorkflowExplorationSkips(window.localStorage.getItem(workflowExplorationSkipStorageKey));
    },
  );
  const [workflowRevisionSource, setWorkflowRevisionSource] = useState<{ artifactId: string; title: string } | undefined>();
  const workflowRequestRef = useRef<HTMLTextAreaElement | null>(null);
  const workflowDiscoveryQuestionFocusRef = useRef<string | undefined>(undefined);
  const autoCompiledWorkflowThreadsRef = useRef<Set<string>>(new Set());
  const workflowDiscoveryActions = createAutomationsWorkflowDiscoveryControllerActions({
    activeProjectPath,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    workflowAgentFolders,
    workflowRequest,
    workflowRequestRestartDrafts,
    workflowExplorationBudgetsByThreadId,
    workflowRequestRef,
    setWorkflowCompileThreadId,
    setWorkflowDiscoveryBusy,
    setWorkflowDiscoveryAnswers,
    setOptimisticWorkflowDiscoveryAnswers,
    setWorkflowRequest,
    setWorkflowRequestRestartDrafts,
    setWorkflowExplorationBudgetsByThreadId,
    setWorkflowExplorationSkippedByThreadId,
    setWorkflowRevisionSource,
    onWorkflowBusyChanged,
    onWorkflowDashboardChanged,
    onWorkflowErrorChanged,
    onWorkflowCompileProgressReset,
    refreshAutomationFolders,
    loadWorkflowRevisions,
    loadWorkflowVersions,
    loadWorkflowExplorationTraces,
    onWorkflowAgentFoldersChanged,
    onSelectWorkflowAgentThread,
    onSelectWorkflowAgentThreadForArtifact,
    onOpenWorkflowRunDetail,
    onWorkflowExplorationTracesChanged,
    onWorkflowArtifactPanelChanged,
  });
  const {
    createWorkflowSample,
    compileWorkflowPreview,
    startWorkflowDiscoveryFromRequest,
    answerWorkflowDiscoveryQuestion,
    restartWorkflowDiscoveryThread,
    resolveWorkflowDiscoveryAccessRequest,
    workflowExplorationBudgetsForThread,
    updateWorkflowExplorationBudget,
    resetWorkflowExplorationBudget,
    runWorkflowExplorationForThread,
    skipWorkflowExplorationForThread,
    compileWorkflowThreadPreview,
    startWorkflowArtifactRevision,
    clearWorkflowRevisionDraft,
    focusWorkflowRequestEditor,
    openWorkflowCompileDiagnostics,
    copyWorkflowCompileFailureReport,
  } = workflowDiscoveryActions;

  useEffect(() => {
    const thread = selectedWorkflowAgentThread;
    if (!thread) return;
    const revision = activeDraftWorkflowRevisionForThread(workflowRevisions, thread.id);
    const questions = revision
      ? thread.discoveryQuestions.filter((question) => question.revisionId === revision.id)
      : thread.discoveryQuestions.filter((question) => !question.revisionId);
    const nextQuestion = questions.find((question) => !question.answer && !optimisticWorkflowDiscoveryAnswers[question.id]);
    if (!nextQuestion) return;
    const focusKey = `${thread.id}:${revision?.id ?? "base"}:${nextQuestion.id}`;
    if (workflowDiscoveryQuestionFocusRef.current === focusKey) return;
    workflowDiscoveryQuestionFocusRef.current = focusKey;
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-workflow-discovery-question-id="${nextQuestion.id}"]`);
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
  }, [optimisticWorkflowDiscoveryAnswers, selectedWorkflowAgentThread, workflowRevisions]);

  useEffect(() => {
    if (!selectedWorkflowAgentThread) return;
    if (selectedWorkflowAgentThread.phase !== "planned" || selectedWorkflowAgentThread.activeArtifactId) return;
    if (workflowBusy || workflowDiscoveryBusy) return;
    const questions = selectedWorkflowAgentThread.discoveryQuestions.filter((question) => !question.revisionId);
    if (!questions.length || !questions.every((question) => question.answer)) return;
    if (autoCompiledWorkflowThreadsRef.current.has(selectedWorkflowAgentThread.id)) return;
    autoCompiledWorkflowThreadsRef.current.add(selectedWorkflowAgentThread.id);
    void compileWorkflowThreadPreview(selectedWorkflowAgentThread);
  }, [selectedWorkflowAgentThread, workflowBusy, workflowDiscoveryBusy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const encoded = JSON.stringify(workflowExplorationSkippedByThreadId);
      if (encoded === "{}") {
        window.localStorage.removeItem(workflowExplorationSkipStorageKey);
      } else {
        window.localStorage.setItem(workflowExplorationSkipStorageKey, encoded);
      }
    } catch {
      // localStorage is best-effort; in-memory skips still protect the current session.
    }
  }, [workflowExplorationSkippedByThreadId]);

  return {
    workflowCompileThreadId,
    workflowDiscoveryBusy,
    workflowDiscoveryAnswers,
    setWorkflowDiscoveryAnswers: setWorkflowDiscoveryAnswers as Dispatch<SetStateAction<WorkflowDiscoveryAnswers>>,
    optimisticWorkflowDiscoveryAnswers,
    workflowRequest,
    setWorkflowRequest: setWorkflowRequest as Dispatch<SetStateAction<string>>,
    workflowRequestRestartDrafts,
    setWorkflowRequestRestartDrafts: setWorkflowRequestRestartDrafts as Dispatch<SetStateAction<WorkflowDiscoveryRestartDrafts>>,
    workflowExplorationSkippedByThreadId,
    workflowRevisionSource,
    workflowRequestRef,
    createWorkflowSample,
    compileWorkflowPreview,
    startWorkflowDiscoveryFromRequest,
    answerWorkflowDiscoveryQuestion,
    restartWorkflowDiscoveryThread,
    resolveWorkflowDiscoveryAccessRequest,
    workflowExplorationBudgetsForThread,
    updateWorkflowExplorationBudget,
    resetWorkflowExplorationBudget,
    runWorkflowExplorationForThread,
    skipWorkflowExplorationForThread,
    compileWorkflowThreadPreview,
    startWorkflowArtifactRevision,
    clearWorkflowRevisionDraft,
    focusWorkflowRequestEditor,
    openWorkflowCompileDiagnostics,
    copyWorkflowCompileFailureReport,
  };
}
